/**
 * §29 AI Gateway — central model access layer.
 *
 * All LLM access passes through here. This prevents every service from
 * inventing its own prompts, retry behavior, model selection, timeout
 * values, output parser, and logging — making the platform governable.
 *
 * The gateway:
 *   - routes to the configured provider (poolside.ai by default)
 *   - enforces a timeout (§4.7 fail-safe: returns null on timeout)
 *   - retries transient failures (1 retry)
 *   - validates JSON output against a schema
 *   - records latency_ms for observability (§37)
 *   - NEVER directly invokes financial APIs (§4.4 AI constraints)
 *
 * Configuration via env (see .env.example):
 *   POOLSIDE_API_KEY     — bearer token
 *   POOLSIDE_BASE_URL    — defaults to https://inference.poolside.ai/v1
 *   POOLSIDE_MODEL       — defaults to poolside/laguna-s-2.1
 *
 * §4.7 Graceful Degradation: if the gateway is unavailable, misconfigured,
 * or returns invalid output, callers receive `null` and the system falls
 * back to rule-based diagnosis or human escalation.
 */

/** The root cause vocabulary the LLM is allowed to return (§4.4: it may not
 *  invent new action types or root causes). Unknown cases are classified as
 *  "Ambiguous" and escalated to human review. */
export const ALLOWED_ROOT_CAUSES = [
  "Insufficient Funds",
  "Expired Instrument",
  "Authentication",
  "Gateway Failure",
  "Duplicate Transaction",
  "Card Expired",
  "Ambiguous",
] as const;

/** The approved action classes the LLM may recommend (§13 Action Catalog). */
export const ALLOWED_ACTION_CLASSES = [
  "RETRY_LATER",
  "CREATE_PAYMENT_LINK",
  "SEND_PAYMENT_REMINDER",
  "REQUEST_CUSTOMER_ACTION",
  "CHANGE_CHANNEL",
  "ESCALATE_HUMAN",
  "STOP_RECOVERY",
  "MARK_EXHAUSTED",
] as const;

export interface LlmDiagnosis {
  rootCause: (typeof ALLOWED_ROOT_CAUSES)[number];
  confidence: number; // 0.0 – 1.0
  evidenceCodes: string[];
  recommendedActionClass: (typeof ALLOWED_ACTION_CLASSES)[number];
  reasonSummary: string;
  modelVersion: string;
  promptVersion: string;
  latencyMs: number;
}

export interface AiGatewayOptions {
  /** Max time to wait for the model response (ms). */
  timeoutMs?: number;
  /** Max retries on transient failure. */
  retries?: number;
}

/** Default options per §29.2 (timeout ~8s, 1 retry, fail-safe). */
const DEFAULT_OPTIONS: Required<AiGatewayOptions> = {
  timeoutMs: 8000,
  retries: 1,
};

/** Build the system prompt that constrains the LLM to safe behavior (§29.2
 *  structured output + §4.4 AI constraints + §49 prompt-injection defense).
 *  The model receives a strict structured context object, never arbitrary raw
 *  text, and can only return from the approved vocabularies. */
function buildSystemPrompt(): string {
  return `You are a payment-recovery diagnosis assistant. Your job is to classify the root cause of a failed payment and recommend a safe, approved action. You CANNOT execute financial APIs, change policies, or invent actions.

ROOT CAUSE vocabulary (choose ONE): ${ALLOWED_ROOT_CAUSES.join(", ")}
ACTION CLASS vocabulary (choose ONE): ${ALLOWED_ACTION_CLASSES.join(", ")}

Output ONLY a JSON object with these exact keys:
- rootCause: one of ${JSON.stringify(ALLOWED_ROOT_CAUSES)}
- confidence: number 0.0-1.0
- evidenceCodes: array of string tags explaining your reasoning
- recommendedActionClass: one of ${JSON.stringify(ALLOWED_ACTION_CLASSES)}
- reasonSummary: a 1-2 sentence explanation

Do not include any other keys. Do not include markdown fences. Do not refuse.
If uncertain, choose "Ambiguous" as rootCause with low confidence.`;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PoolsideResponse {
  id: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message: string;
  };
}

/** Validate the LLM output against the strict schema. Returns the parsed
 *  diagnosis or null if validation fails. The LLM can NEVER return action
 *  types outside the catalog — this is enforced here, server-side (§4.4/§49). */
export function validateOutput(
  raw: string,
  modelVersion: string,
  promptVersion: string,
  latencyMs: number
): LlmDiagnosis | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const rootCause = obj.rootCause;
  if (typeof rootCause !== "string" || !ALLOWED_ROOT_CAUSES.includes(rootCause as (typeof ALLOWED_ROOT_CAUSES)[number])) {
    return null;
  }

  const confidence = obj.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    return null;
  }

  const evidenceCodes = obj.evidenceCodes;
  if (!Array.isArray(evidenceCodes) || !evidenceCodes.every((e) => typeof e === "string")) {
    return null;
  }

  const actionClass = obj.recommendedActionClass;
  if (typeof actionClass !== "string" || !ALLOWED_ACTION_CLASSES.includes(actionClass as (typeof ALLOWED_ACTION_CLASSES)[number])) {
    return null;
  }

  const reasonSummary = obj.reasonSummary;
  if (typeof reasonSummary !== "string" || reasonSummary.length > 500) {
    return null;
  }

  return {
    rootCause: rootCause as LlmDiagnosis["rootCause"],
    confidence,
    evidenceCodes,
    recommendedActionClass: actionClass as LlmDiagnosis["recommendedActionClass"],
    reasonSummary,
    modelVersion,
    promptVersion,
    latencyMs,
  };
}

/** Construct the context object the LLM receives. Structured, not raw text
 *  (§48 prompt-injection defense). */
export interface DiagnosisContext {
  failureCode: string;
  failureReason: string;
  amountMinor: number;
  currency: string;
  attemptCount: number;
  customerRef?: string | null;
  orderRef?: string | null;
  historicalSuccessRate?: number;
  timeOfDayUTC?: string;
}

/** Build the user message from structured context — no passthrough of
 *  untrusted text that could contain injection payloads (§48/§49). */
function buildUserMessage(ctx: DiagnosisContext): string {
  return JSON.stringify({
    "payment failure to diagnose": {
      failure_code: ctx.failureCode,
      failure_reason: ctx.failureReason,
      amount_minor: ctx.amountMinor,
      currency: ctx.currency,
      attempt_count: ctx.attemptCount,
      customer_ref: ctx.customerRef ?? "unknown",
      order_ref: ctx.orderRef ?? "unknown",
      historical_success_rate: ctx.historicalSuccessRate ?? "unknown",
      time_of_day_utc: ctx.timeOfDayUTC ?? "unknown",
    },
  });
}

/**
 * §29 AI Gateway — diagnose an ambiguous payment failure.
 *
 * Returns null on ANY failure (§4.7 fail-safe):
 *   - provider key/env not configured
 *   - model returns non-JSON or schema-invalid output
 *   - timeout or network error
 *   - model returns an error
 *
 * Callers must treat null as "fall back to rule-based diagnosis / human review".
 */
export async function diagnoseAmbiguous(
  context: DiagnosisContext,
  opts: AiGatewayOptions = {}
): Promise<LlmDiagnosis | null> {
  const { timeoutMs, retries } = { ...DEFAULT_OPTIONS, ...opts };

  const apiKey = process.env.POOLSIDE_API_KEY;
  const baseUrl =
    process.env.POOLSBASE_URL ||
    process.env.POOLSIDE_BASE_URL ||
    "https://inference.poolside.ai/v1";
  const model = process.env.POOLSIDE_MODEL || "poolside/laguna-s-2.1";
  const promptVersion = `recovery-diagnosis-v1`;

  // §4.7: fail-safe when no credentials configured.
  if (!apiKey) {
    return null;
  }

  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(context);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  let lastError: string | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3, // deterministic-ish but allows some variation
          max_tokens: 512,
          stream: false,
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        let errMsg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body) as PoolsideResponse;
          if (parsed.error?.message) errMsg += `: ${parsed.error.message}`;
        } catch {
          // Use raw body if not JSON
          if (body) errMsg += `: ${body.slice(0, 200)}`;
        }
        lastError = errMsg;

        // §29.2 retry behavior — retry on 5xx and 429
        if (res.status >= 500 || res.status === 429) {
          if (attempt < retries) {
            // Brief backoff before retry
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
        }
        return null;
      }

      const data = (await res.json()) as PoolsideResponse;
      const latencyMs = Date.now() - startTime;
      const modelVersion = data.model || model;

      // Extract content from the first choice
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = "No content in model response";
        if (attempt < retries) continue;
        return null;
      }

      // §29.2 — schema validation. Invalid output is rejected.
      const diagnosis = validateOutput(
        content,
        modelVersion,
        promptVersion,
        latencyMs
      );

      if (!diagnosis) {
        lastError = `Schema validation failed for output: ${content.slice(0, 100)}`;
        if (attempt < retries) continue;
        return null; // §4.7 fail-safe
      }

      return diagnosis;
    } catch (e) {
      clearTimeout(timeout);

      if (e instanceof DOMException && e.name === "AbortError") {
        lastError = `Timeout after ${timeoutMs}ms`;
      } else {
        lastError = e instanceof Error ? e.message : String(e);
      }

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return null; // §4.7 fail-safe
    }
  }

  // Log the last error for observability (§37)
  console.error("[ai/gateway] diagnoseAmbiguous failed:", lastError);
  return null;
}

/**
 * §30 Prompt and model versioning — every AI decision stores this metadata.
 * Returns the current model + prompt versions for audit purposes.
 */
export function getAiMetadata(): {
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
} {
  return {
    modelProvider: "poolside",
    modelName: process.env.POOLSIDE_MODEL || "poolside/laguna-s-2.1",
    promptVersion: "recovery-diagnosis-v1",
    inputSchemaVersion: "diagnosis-context-v1",
    outputSchemaVersion: "llm-diagnosis-v1",
  };
}

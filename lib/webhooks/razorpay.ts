/**
 * Razorpay webhook ingestion → §26 Core Database Model.
 *
 * Pipeline (docs/RAPID.md §9 Webhook Ingestion Architecture):
 *
 *   Razorpay
 *     ↓  POST /api/webhooks/razorpay  (raw body + x-razorpay-signature)
 *   Verify Signature                  §9 "Verify Signature" + §48 security
 *     ↓
 *   Validate Event Envelope           §8 envelope
 *     ↓
 *   Deduplicate                       §8.1 / §41 (idempotency via provider_events)
 *     ↓
 *   Persist Raw Event                 §9.1 Raw Event Retention (payload_hash)
 *     ↓
 *   Publish → Diagnosis → Decision → Action → Outcome
 *     ↓         §11/§11.1      §14       §13      §23
 *   risk_event → diagnosis → decision → action → outcome
 *
 * A single `payment.failed` webhook produces an at-risk case (DETECTED risk
 * event + rule-first diagnosis + policy decision + scheduled action). No
 * outcome is written here — recovery is declared only when authoritative
 * financial state proves it (§23): a *confirming* `payment_link.paid` /
 * `payment.captured` webhook resolves the matching open risk event to an
 * `outcomes.status = 'RECOVERED'` row.
 *
 * Signature scheme (verified against the official Razorpay docs):
 *   x-razorpay-signature = HMAC-SHA256(webhook_secret, raw_body) as lowercase hex
 * (https://razorpay.com/docs/webhooks/validate-test/)
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { makeDecision } from "@/lib/policy/engine";
import { diagnoseAmbiguous, DiagnosisContext, getAiMetadata } from "@/lib/ai/gateway";
import { appendAudit, clearAuditCache } from "@/lib/audit/ledger";
import {
  createHmac,
  createHash,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/** Event types that open a new at-risk recovery case. */
const OPEN_FAILURE_EVENTS = new Set([
  "payment.failed",
  "payment.chargeback",
  "chargebacks.created",
]);

/** Event types that confirm a recovery (close an open case as RECOVERED). */
const RECOVERY_CONFIRM_EVENTS = new Set([
  "payment_link.paid",
  "payment_link.charged",
  "payment.captured",
  "paymentLink.paid",
]);

/**
 * The demo endpoint is bound to Acme Retail (see .env.example RAPID_MERCHANT_ID).
 * In production each merchant is served by its own endpoint (and its own
 * webhook secret), so a real deployment resolves the merchant from the configured
 * secret rather than from this fallback.
 */
export async function resolveMerchantId(supabase: SupabaseClient) {
  const envId = process.env.RAPID_MERCHANT_ID;
  if (envId) return envId;
  const { data, error } = await supabase
    .from("merchants")
    .select("merchant_id")
    .eq("name", "Acme Retail")
    .maybeSingle();
  if (error) throw error;
  return data?.merchant_id ?? null;
}

/** Verify a Razorpay webhook signature (§48: forged-webhook defense). */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  // Constant-time compare to avoid timing oracles (§48 replay/replay-attack).
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface NormalizedEvent {
  provider: "razorpay";
  externalEventId: string;
  eventType: string;
  occurredAt: string; // ISO 8601
  merchantId: string;
  sourceRef: string; // order_id / payment_id — matches risk_events.source_ref
  riskType: string; // §10 detector type (payment_degradation, ... )
  amountMinor: number;
  currency: string;
  customerRef: string | null;
  evidence: Record<string, unknown>;
}

/** A Razorpay payment / payment-link entity, normalised to the fields we need. */
interface PaymentEntity {
  id?: string;
  entity?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  order_id?: string;
  order?: string;
  error_code?: string;
  code?: string;
  error_reason?: string;
  error_description?: string;
  error_source?: string;
  attempt_count?: number;
  attempts_count?: number;
  subscription_id?: string;
  customer_id?: string;
  notes?: { customer_ref?: string; customer?: string; [k: string]: unknown };
  [k: string]: unknown;
}

/** Extract the payment entity from a Razorpay envelope (§8). */
function razorpayEntity(payload: unknown): PaymentEntity {
  const p = (payload ?? {}) as Record<string, unknown>;
  // Do NOT coerce absent keys to {} — a truthy-but-empty {} would short-
  // circuit the `||` chain and hide the payment_link entity on paid events.
  const payment = (p.payment ?? undefined) as
    | Record<string, unknown>
    | undefined;
  const link = (p.payment_link ?? undefined) as
    | Record<string, unknown>
    | undefined;
  const entity: unknown =
    (payment && (payment.entity || payment)) ||
    (link && (link.entity || link)) ||
    p.entity ||
    p;
  return entity as PaymentEntity;
}

/** Map a Razorpay decline into a normalized failure code (§11.1 rule-first). */
export function normalizeFailureCode(errorCode: string, errorReason: string): string {
  const haystack = `${errorCode} ${errorReason}`.toLowerCase();
  if (!haystack || haystack === " ") return "ambiguous";
  if (haystack.includes("insufficient") || haystack.includes("balance"))
    return "insufficient_funds";
  if (haystack.includes("expired") || haystack.includes("card_expired"))
    return "card_expired";
  if (haystack.includes("cvv") || haystack.includes("security") || haystack.includes("authentication"))
    return "authentication_failure";
  if (haystack.includes("timeout") || haystack.includes("timed out") || haystack.includes("unavailable"))
    return "issuer_timeout";
  if (haystack.includes("duplicate") || haystack.includes("processing"))
    return "duplicate_transaction";
  return "ambiguous";
}

/**
 * Rule-first diagnosis (§11.1): known provider reason codes map without an LLM
 * call, reducing latency, cost, and uncertainty.
 */
export function diagnose(failureCode: string): {
  rootCause: string;
  confidence: number;
  method: "rule";
  evidenceCodes: string[];
  reasonSummary: string;
} {
  const map: Record<string, string> = {
    insufficient_funds: "Insufficient Funds",
    card_expired: "Expired Instrument",
    authentication_failure: "Authentication",
    issuer_timeout: "Gateway Failure",
    duplicate_transaction: "Duplicate Transaction",
  };
  const known = Object.keys(map);
  const isKnown = known.includes(failureCode);
  const rootCause = isKnown ? map[failureCode] : "Ambiguous";
  const confidence = isKnown ? 0.92 : 0.45;
  const evidenceCodes = isKnown
    ? ["DECLINE_CODE_MATCHED", "HIGH_HISTORICAL_SUCCESS", "POLICY_OK"]
    : ["AMBIGUOUS_CASE", "REQUIRES_HUMAN_REVIEW"];
  return {
    rootCause,
    confidence: Math.round(confidence * 10000) / 10000,
    method: "rule",
    evidenceCodes,
    reasonSummary: isKnown
      ? `Automated rule-based diagnosis: ${rootCause.toLowerCase()} decline, eligible for automated recovery.`
      : `Automated rule-based diagnosis inconclusive; requiring human review.`,
  };
}

/**
 * §14 Decision Engine — now policy-driven (§4.3/§16). The decision is no
 * longer hardcoded here: `makeDecision` loads the merchant's active
 * `policy_versions` row (falling back to the v1.4 in-code policy) and
 * evaluates it in `lib/policy/engine.ts`. The v1.4 values are reproduced
 * exactly, so behaviour is preserved while the source of truth moves to data.
 */

/** §4.2 / §28 idempotency key for a recovery action attempt. Stable + derivable
 *  from the case so duplicate deliveries/retries never double-mint a link. */
export function buildIdempotencyKey(
  riskEventId: string,
  actionClass: string,
  attemptNo = 1
): string {
  return `case:${riskEventId}:${actionClass}:${attemptNo}`;
}

export interface WebhookResult {
  ok: boolean;
  deduped?: boolean;
  ingested?: boolean;
  eventId: string;
  eventType: string;
  caseId?: string | null;
  outcome?: "RECOVERED" | "RECOVERED_PARTIAL";
  detail?: string;
  error?: string;
}

function isPgUniqueViolation(err: { code?: string; message?: string }) {
  return err && (err.code === "23505" || /duplicate/i.test(err.message ?? ""));
}

/** Parse a Razorpay envelope into a normalized event (§8 envelope + §10.2). */
function parseRazorpayEvent(rawBody: string, merchantId: string): NormalizedEvent {
  const ev = JSON.parse(rawBody) as {
    event?: string;
    event_type?: string;
    event_id?: string;
    id?: string;
    created_at?: number;
    occurred_at?: string;
    payload?: unknown;
  };
  const eventType: string = ev.event ?? ev.event_type ?? "unknown";
  const externalEventId: string =
    ev.event_id || ev.id || `event_${randomUUID().slice(0, 12)}`;
  const created = ev.created_at;
  const occurredAt =
    typeof created === "number"
      ? new Date(created * 1000).toISOString()
      : ev.occurred_at || new Date().toISOString();

  const entity = razorpayEntity(ev.payload);
  const amountMinor = Number(entity.amount ?? 0);
  const currency = String(entity.currency || "INR").toUpperCase();
  const orderId = (entity.order_id as string | undefined) || entity.order;
  const paymentId = (entity.id as string | undefined) || orderId || externalEventId;
  const sourceRef = orderId || paymentId;

  const errorCode = String(entity.error_code || entity.code || "");
  const errorReason = String(
    entity.error_reason || entity.error_description || ""
  );
  const failureCode = normalizeFailureCode(errorCode, errorReason);

  let riskType = "payment_degradation";
  if (eventType.toLowerCase().includes("chargeback")) riskType = "chargeback";
  else if (entity.subscription_id || riskType === "subscription_failure")
    riskType = "subscription_failure";
  else if (failureCode === "ambiguous" && String(entity.error_reason || "").toLowerCase().includes("abandon"))
    riskType = "checkout_abandonment";

  const customerRef =
    (entity.notes?.customer_ref as string | undefined) ||
    (entity.notes?.customer as string | undefined) ||
    (entity.customer_id as string | undefined) ||
    null;

  const evidence: Record<string, unknown> = {
    source: "razorpay",
    event_id: externalEventId,
    failure_code: failureCode,
    attempt_count: Number(entity.attempt_count ?? entity.attempts_count ?? 1),
    error_source: entity.error_source ? String(entity.error_source) : undefined,
  };
  if (errorCode) evidence.error_code = errorCode;
  if (errorReason) evidence.error_reason = errorReason;
  if (orderId) evidence.order_id = orderId;
  if (paymentId) evidence.payment_id = paymentId;

  return {
    provider: "razorpay",
    externalEventId,
    eventType,
    occurredAt,
    merchantId,
    sourceRef,
    riskType,
    amountMinor,
    currency,
    customerRef,
    evidence,
  };
}

/**
 * Insert the full ledger chain for an at-risk failure event:
 *   provider_event → risk_event → diagnosis → decision → action
 * (§9.1 → §26.3 → §26.4 → §26.5 → §26.6 → §26.7)
 */
async function ingestFailure(
  supabase: SupabaseClient,
  ev: NormalizedEvent,
  payloadHash: string
) {
  // §26.3 provider_events — audit + idempotency guard (§41/§42 dedup).
  const { error: peErr } = await supabase.from("provider_events").insert({
    merchant_id: ev.merchantId,
    provider: ev.provider,
    external_event_id: ev.externalEventId,
    event_type: ev.eventType,
    schema_version: "1.0",
    occurred_at: ev.occurredAt,
    received_at: new Date().toISOString(),
    payload_hash: payloadHash,
  });
  if (peErr && !isPgUniqueViolation(peErr)) throw peErr;
  if (peErr) return { deduped: true, caseId: null };

  // Resolve the internal customer_id from the provider's customer ref (if any)
  // so the audit viewer can display the Acme customer the case belongs to.
  let customerId: string | null = null;
  if (ev.customerRef) {
    const { data: cust } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("merchant_id", ev.merchantId)
      .eq("external_customer_ref", ev.customerRef)
      .maybeSingle();
    customerId = cust?.customer_id ?? null;
  }

  // §26.4 risk event — the recovery candidate.
  const { data: re, error: reErr } = await supabase
    .from("risk_events")
    .insert({
      merchant_id: ev.merchantId,
      customer_id: customerId,
      source_type: ev.eventType,
      source_ref: ev.sourceRef,
      risk_type: ev.riskType,
      amount_minor: ev.amountMinor,
      currency: ev.currency,
      detected_at: ev.occurredAt,
      status: "DETECTED",
      evidence: ev.evidence,
    })
    .select("risk_event_id")
    .maybeSingle();
  if (reErr) throw reErr;
  const riskEventId = re!.risk_event_id;

  // §27 audit: RISK_DETECTED — emit the first event in the case chain.
  await appendAudit(supabase, {
    merchantId: ev.merchantId,
    traceId: ev.externalEventId,
    entityType: "recovery_case",
    entityId: riskEventId,
    eventType: "RISK_DETECTED",
    actorType: "webhook_receiver",
    actorId: "razorpay",
    occurredAt: ev.occurredAt,
    data: {
      provider: ev.provider,
      event_type: ev.eventType,
      external_event_id: ev.externalEventId,
      risk_type: ev.riskType,
      amount_minor: ev.amountMinor,
      currency: ev.currency,
      source_ref: ev.sourceRef,
      failure_code: ev.evidence["failure_code"],
      attempt_count: ev.evidence["attempt_count"],
    },
  });

  // §11 — Hybrid diagnosis: rule-first (§11.1), then LLM for ambiguous (§11.2).
  const ruleDiag = diagnose(String(ev.evidence["failure_code"] || "ambiguous"));
  let diag = ruleDiag;
  let aiMetadata: { model_version?: string; prompt_version?: string } = {};

  // §11.2 LLM path — only when rule diagnosis is Ambiguous AND gateway is configured.
  // §4.7 fail-safe: if LLM is unavailable/misconfigured, rule diagnosis stays as-is.
  if (ruleDiag.rootCause === "Ambiguous") {
    const ctx: DiagnosisContext = {
      failureCode: String(ev.evidence["failure_code"] || "ambiguous"),
      failureReason: String(ev.evidence["error_reason"] || ""),
      amountMinor: ev.amountMinor,
      currency: ev.currency,
      attemptCount: Number(ev.evidence["attempt_count"] || 1),
      customerRef: ev.customerRef,
      orderRef: ev.sourceRef,
    };
    const llmResult = await diagnoseAmbiguous(ctx);
    if (llmResult) {
      diag = {
        rootCause: llmResult.rootCause,
        confidence: llmResult.confidence,
        method: "llm",
        evidenceCodes: [...llmResult.evidenceCodes, "LLM_DIAGNOSED"],
        reasonSummary: llmResult.reasonSummary,
      };
      aiMetadata = {
        model_version: llmResult.modelVersion,
        prompt_version: llmResult.promptVersion,
      };
    }
  }

  const { data: d, error: dErr } = await supabase
    .from("diagnoses")
    .insert({
      risk_event_id: riskEventId,
      root_cause: diag.rootCause,
      confidence: diag.confidence,
      method: diag.method,
      model_version: aiMetadata.model_version || "diag-v1",
      prompt_version: aiMetadata.prompt_version || "prompt-v1",
      evidence_codes: diag.evidenceCodes,
      reason_summary: diag.reasonSummary,
    })
    .select("diagnosis_id")
    .maybeSingle();
  if (dErr) throw dErr;

  // §27 audit: DIAGNOSED — record the diagnosis (rule or LLM) in the chain.
  await appendAudit(supabase, {
    merchantId: ev.merchantId,
    traceId: ev.externalEventId,
    entityType: "recovery_case",
    entityId: riskEventId,
    eventType: "DIAGNOSED",
    actorType: "diagnosis_engine",
    actorId: diag.method === "llm" ? "llm-diagnoser" : "rule-engine",
    occurredAt: ev.occurredAt,
    data: {
      root_cause: diag.rootCause,
      confidence: diag.confidence,
      method: diag.method,
      evidence_codes: diag.evidenceCodes,
      model_version: diag.method === "llm" ? aiMetadata.model_version : undefined,
      prompt_version: diag.method === "llm" ? aiMetadata.prompt_version : undefined,
    },
  });

  // §14 decision + §13 action — now policy-driven (§4.3/§16): loads the
  // merchant's active policy_versions row (fallback v1.4) then evaluates it.
  const decision = await makeDecision(supabase, ev.merchantId, {
    rootCause: diag.rootCause,
    amountMinor: ev.amountMinor,
  });
  const { data: dec, error: decErr } = await supabase
    .from("decisions")
    .insert({
      risk_event_id: riskEventId,
      action_class: decision.actionClass,
      attempt_no: 1,
      expected_recovery_minor: decision.expectedRecoveryMinor,
      probability_of_success: decision.probability,
      policy_version: decision.policyLabel,
      decision_method: "rule",
      reason_codes: decision.reasonCodes,
      requires_human: decision.requiresHuman,
    })
    .select("decision_id")
    .maybeSingle();
  if (decErr) throw decErr;

  const scheduledFor = new Date(
    new Date(ev.occurredAt).getTime() + 2 * 3600 * 1000
  ).toISOString();
  const { data: act, error: actErr } = await supabase
    .from("actions")
    .insert({
      decision_id: dec!.decision_id,
      risk_event_id: riskEventId,
      merchant_id: ev.merchantId,
      action_class: decision.actionClass,
      status: "SCHEDULED", // §13 action lifecycle
      idempotency_key: buildIdempotencyKey(riskEventId, decision.actionClass, 1), // §4.2 / §28
      scheduled_for: scheduledFor,
      provider_ref: `plink_${ev.sourceRef}`,
      result: {
        attempt_no: 1,
        provider: "razorpay",
        action: "scheduled",
        requires_human: decision.requiresHuman,
      },
    })
    .select("action_id")
    .maybeSingle();
  if (actErr) throw actErr;

  // §27 audit: DECIDED + ACTION_SCHEDULED — record the policy decision and
  // the scheduled action in the chain.
  if (decision.requiresHuman) {
    await appendAudit(supabase, {
      merchantId: ev.merchantId,
      traceId: ev.externalEventId,
      entityType: "recovery_case",
      entityId: riskEventId,
      eventType: "ESCALATED",
      actorType: "policy_engine",
      actorId: decision.policyLabel,
      occurredAt: ev.occurredAt,
      data: {
        action_class: decision.actionClass,
        reason_codes: decision.reasonCodes,
        probability_of_success: decision.probability,
      },
    });
  }
  await appendAudit(supabase, {
    merchantId: ev.merchantId,
    traceId: ev.externalEventId,
    entityType: "recovery_case",
    entityId: riskEventId,
    eventType: "DECIDED",
    actorType: "policy_engine",
    actorId: decision.policyLabel,
    occurredAt: ev.occurredAt,
    data: {
      action_class: decision.actionClass,
      reason_codes: decision.reasonCodes,
      probability_of_success: decision.probability,
      policy_version: decision.policyLabel,
      requires_human: decision.requiresHuman,
    },
  });
  await appendAudit(supabase, {
    merchantId: ev.merchantId,
    traceId: ev.externalEventId,
    entityType: "action",
    entityId: act!.action_id,
    eventType: "ACTION_SCHEDULED",
    actorType: "action_executor",
    actorId: "execution-worker",
    occurredAt: ev.occurredAt,
    data: {
      action_class: decision.actionClass,
      scheduled_for: scheduledFor,
      idempotency_key: buildIdempotencyKey(riskEventId, decision.actionClass, 1),
    },
  });

  return {
    deduped: false,
    caseId: riskEventId,
    actionClass: decision.actionClass,
  };
}

/** Resolve a confirming `payment_link.paid` event into a RECOVERED outcome (§23). */
async function ingestRecovery(supabase: SupabaseClient, ev: NormalizedEvent) {
  // Find the open risk_event this recovery refers to (by source_ref = order/payment id).
  const { data: re, error: reErr } = await supabase
    .from("risk_events")
    .select("risk_event_id, amount_minor")
    .eq("merchant_id", ev.merchantId)
    .eq("source_ref", ev.sourceRef)
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reErr) throw reErr;

  if (!re) {
    // No matching open case — the recovery arrived without a failed-payment
    // event (or it was already recovered). Treat as a no-op so the webhook
    // remains idempotent (§9 duplicate/out-of-order safety).
    return {
      outcome: null,
      detail: `no matching open risk_event for source_ref=${ev.sourceRef}`,
    };
  }

  // Idempotency: don't double-count a recovery already recorded.
  const { data: existing, error: outErr } = await supabase
    .from("outcomes")
    .select("outcome_id, status")
    .eq("risk_event_id", re.risk_event_id)
    .eq("status", "RECOVERED")
    .maybeSingle();
  if (outErr) throw outErr;
  if (existing) return { outcome: "RECOVERED", deduped: true, caseId: re.risk_event_id };

  // Link the outcome to the scheduled action so the audit trail is complete (§23).
  const { data: act } = await supabase
    .from("actions")
    .select("action_id")
    .eq("risk_event_id", re.risk_event_id)
    .maybeSingle();

  const recoveredAmount = ev.amountMinor || Number(re.amount_minor) || 0;
  const { error: ocErr } = await supabase.from("outcomes").insert({
    risk_event_id: re.risk_event_id,
    action_id: act?.action_id ?? null,
    status: "RECOVERED",
    recovered_amount_minor: recoveredAmount,
    recovered_at: ev.occurredAt,
    evidence: {
      source: "razorpay",
      event_id: ev.externalEventId,
      provider_event: ev.eventType,
      amount_minor: recoveredAmount,
    },
  });
  if (ocErr) throw ocErr;

  // §27 audit: OUTCOME_RECORDED — record the confirmed recovery in the chain.
  await appendAudit(supabase, {
    merchantId: ev.merchantId,
    traceId: ev.externalEventId,
    entityType: "recovery_case",
    entityId: re.risk_event_id,
    eventType: "OUTCOME_RECORDED",
    actorType: "outcome_verifier",
    actorId: "razorpay",
    occurredAt: ev.occurredAt,
    data: {
      status: "RECOVERED",
      recovered_amount_minor: recoveredAmount,
      provider_event: ev.eventType,
      external_event_id: ev.externalEventId,
    },
  });

  return { outcome: "RECOVERED", caseId: re.risk_event_id, recoveredAmount };
}

/**
 * Dispatch a normalized provider event to the correct ledger path.
 * (§9: "Do not run multi-step business logic in the webhook request" — this is
 *  kept synchronous and bounded; heavier orchestration belongs in a workflow.)
 */
export async function ingestEvent(
  supabase: SupabaseClient,
  ev: NormalizedEvent,
  rawBody: string
): Promise<WebhookResult> {
  const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");

  if (RECOVERY_CONFIRM_EVENTS.has(ev.eventType)) {
    const res = await ingestRecovery(supabase, ev);
    return {
      ok: true,
      eventId: ev.externalEventId,
      eventType: ev.eventType,
      outcome: res.outcome ? (res.outcome as "RECOVERED") : undefined,
      caseId: res.caseId,
      detail: res.detail,
    };
  }

  if (OPEN_FAILURE_EVENTS.has(ev.eventType)) {
    const res = await ingestFailure(supabase, ev, payloadHash);
    return {
      ok: true,
      eventId: ev.externalEventId,
      eventType: ev.eventType,
      deduped: res.deduped,
      caseId: res.caseId,
    };
  }

  // Unrecognized event types are persisted as provider_events only (audit) and
  // ignored — never silently dropped (§48 auditability).
  const { error } = await supabase.from("provider_events").insert({
    merchant_id: ev.merchantId,
    provider: ev.provider,
    external_event_id: ev.externalEventId,
    event_type: ev.eventType,
    schema_version: "1.0",
    occurred_at: ev.occurredAt,
    received_at: new Date().toISOString(),
    payload_hash: payloadHash,
  });
  if (error && !isPgUniqueViolation(error)) throw error;
  return {
    ok: true,
    eventId: ev.externalEventId,
    eventType: ev.eventType,
    detail: `unhandled event type '${ev.eventType}' recorded for audit`,
  };
}

/**
 * End-to-end handler: verify signature (§9) → parse (§8/§10) → ingest (§26).
 * Shared by the real POST /api/webhooks/razorpay route and the dev simulation
 * harness so both paths exercise signature verification.
 */
export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | null | undefined
): Promise<WebhookResult> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "RAZORPAY_WEBHOOK_SECRET is not configured. Set it in .env.local (see .env.example)."
    );
  }
  if (!verifyRazorpaySignature(rawBody, signature, secret)) {
    throw new Error("Invalid Razorpay signature");
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase);
  if (!merchantId) throw new Error("merchant not found");

  const ev = parseRazorpayEvent(rawBody, merchantId);
  return ingestEvent(supabase, ev, rawBody);
}

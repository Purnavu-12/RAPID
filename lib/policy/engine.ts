/**
 * §4.3 Policies are data + §14 Decision Engine + §16 Policy Table.
 *
 * The recovery decision used to be hardcoded inside `decide()` in
 * lib/webhooks/razorpay.ts — thresholds, retryable root causes, success
 * probabilities, attempt caps. That made the policy impossible to change
 * without a code deploy and untestable in isolation.
 *
 * This module makes the policy a first-class, data-driven value:
 *   - `DEFAULT_POLICY` reproduces the live v1.4 rules exactly (the in-code
 *     fallback when no active `policy_versions` row exists — §4.7 graceful
 *     degradation), so behaviour is preserved while the source of truth moves
 *     to the DB.
 *   - `evaluate()` is the pure decision function (no I/O) — testable, stable.
 *   - `loadActivePolicy()` reads the merchant's active `policy_versions` row
 *     (§26.9), so operators can adjust thresholds/probabilities without a
 *     deploy.
 *
 * Interfaces here are designed as if this were an independently deployable
 * service (§57): pure logic in, plain object out, DB access isolated to
 * `loadActivePolicy`.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export interface RecoveryProbabilities {
  create_payment_link: number;
  retry_later: number;
  escalate_human_high_value: number;
  escalate_human_ambiguous: number;
}

export interface RecoveryPolicy {
  label: string;
  version: number;
  high_value_threshold_minor: number;
  max_attempts: number;
  failure_window_seconds: number;
  retryable_root_causes: string[];
  probabilities: RecoveryProbabilities;
}

export interface DecisionContext {
  rootCause: string;
  amountMinor: number;
  /**
   * 1-based attempt number this decision would schedule (§24 attempt tracking).
   * When it exceeds policy.max_attempts the §17#2 stopping rule fires and the
   * engine returns MARK_EXHAUSTED instead of another intervention.
   */
  attemptNo?: number;
}

export interface Decision {
  actionClass: string;
  requiresHuman: boolean;
  probability: number;
  reasonCodes: string[];
  expectedRecoveryMinor: number | null;
}

export interface PolicyDecision extends Decision {
  policyLabel: string;
}

/**
 * §4.3 / §16 — the v1.4 policy rules, expressed as DATA. This is both the
 * documented seed value for `policy_versions.rules` and the fallback when no
 * active policy row is configured (§4.7). Values reproduce the prior
 * hardcoded engine exactly → behavior-preserving migration from code to data.
 */
export const DEFAULT_POLICY: RecoveryPolicy = {
  label: "v1.4",
  version: 1,
  high_value_threshold_minor: 500_000, // ₹5,000 — above this, escalate (§16)
  max_attempts: 3,
  failure_window_seconds: 7_200, // §4.4 retry/failure window
  retryable_root_causes: ["Gateway Failure", "Authentication"],
  probabilities: {
    create_payment_link: 0.84,
    retry_later: 0.65,
    escalate_human_high_value: 0.55,
    escalate_human_ambiguous: 0.48,
  },
};

/**
 * §14 Decision Engine — pure. Policy rules + §11 root-cause diagnosis →
 * the next action, with no I/O so it is deterministic and testable.
 */
export function evaluate(
  policy: RecoveryPolicy,
  ctx: DecisionContext
): Decision {
  const { rootCause, amountMinor } = ctx;

  // §17 #2 Attempt cap — a hard maximum on recovery loops. This check dominates
  // every other branch: once the attempt budget is spent the case stops, no
  // matter how promising the diagnosis looks (never fail open into more contact).
  const attemptNo = ctx.attemptNo ?? 1;
  if (attemptNo > policy.max_attempts) {
    return {
      actionClass: "MARK_EXHAUSTED",
      requiresHuman: false,
      probability: 0,
      reasonCodes: ["ATTEMPT_LIMIT_REACHED", "STOPPING_RULE_APPLIED"],
      expectedRecoveryMinor: null,
    };
  }

  const isAmbiguous = rootCause === "Ambiguous";
  const isHighValue = amountMinor > policy.high_value_threshold_minor;

  if (isHighValue || isAmbiguous) {
    return {
      actionClass: "ESCALATE_HUMAN",
      requiresHuman: true,
      probability: isHighValue
        ? policy.probabilities.escalate_human_high_value
        : policy.probabilities.escalate_human_ambiguous,
      reasonCodes: isHighValue
        ? ["HIGH_VALUE_CASE", "AMOUNT_EXCEEDS_AUTO_LIMIT", "REQUIRES_HUMAN_REVIEW"]
        : ["AMBIGUOUS_CASE", "REQUIRES_HUMAN_REVIEW"],
      expectedRecoveryMinor: isHighValue ? amountMinor : null,
    };
  }

  // Known, low-value failures → automated recovery action (§13 catalog).
  const isRetryable = policy.retryable_root_causes.includes(rootCause);
  const actionClass = isRetryable ? "RETRY_LATER" : "CREATE_PAYMENT_LINK";
  return {
    actionClass,
    requiresHuman: false,
    probability:
      actionClass === "CREATE_PAYMENT_LINK"
        ? policy.probabilities.create_payment_link
        : policy.probabilities.retry_later,
    reasonCodes: ["WITHIN_AUTO_LIMIT", "RECOVERY_WINDOW_OPEN", "POLICY_OK"],
    expectedRecoveryMinor: actionClass === "CREATE_PAYMENT_LINK" ? amountMinor : null,
  };
}

/**
 * §4.3 — load the active merchant policy from `policy_versions` (§26.9).
 * Returns null when no active row exists (or it is structurally invalid) so
 * callers fall back to DEFAULT_POLICY (§4.7 graceful degradation).
 */
export async function loadActivePolicy(
  supabase: SupabaseClient,
  merchantId: string
): Promise<RecoveryPolicy | null> {
  const { data, error } = await supabase
    .from("policy_versions")
    .select("version,status,rules")
    .eq("merchant_id", merchantId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || !data.rules) return null;
  const r = data.rules as Partial<RecoveryPolicy>;
  // Structural guard — only accept a well-formed policy blob.
  if (!r.label || !r.probabilities) return null;
  return r as RecoveryPolicy;
}

/** §14 Decision Engine entry point — resolve policy (DB or fallback), then evaluate. */
export async function makeDecision(
  supabase: SupabaseClient,
  merchantId: string,
  ctx: DecisionContext
): Promise<PolicyDecision> {
  const policy = (await loadActivePolicy(supabase, merchantId)) ?? DEFAULT_POLICY;
  return { ...evaluate(policy, ctx), policyLabel: policy.label };
}

/**
 * §5.3 Reconciler — resolve UNKNOWN actions by querying the provider.
 *
 * When an action's execution hits a transient error (timeout, 5xx, network),
 * the executor marks the action status as `UNKNOWN` rather than blindly
 * retrying (§5). Blind retries on an UNKNOWN can double-mint payment links
 * (§4.1 duplicate-charge risk).
 *
 * This reconciler runs BEFORE `executeDueActions` (wired into the cron route):
 * for each UNKNOWN action, it queries the provider for payment links created
 * with our idempotent `notes.risk_event_id` and attempts to match by amount.
 *   - Found → action marked COMPLETED with the real provider_ref.
 *   - Not found → action stays UNKNOWN / resets to SCHEDULED with a new
 *     idempotency key so the next run can safely retry once.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listPaymentLinks, type PaymentLink } from "@/lib/razorpay/server";

type ActionRow = {
  action_id: string;
  risk_event_id: string;
  action_class: string;
  idempotency_key: string;
  result: Record<string, unknown> | null;
  provider_ref: string | null;
  started_at: string | null;
  completed_at: string | null;
  scheduled_for: string | null;
};

type ProviderLink = PaymentLink & {
  notes?: { risk_event_id?: string; order_id?: string };
};

/** Match a provider payment link to a risk event by notes.risk_event_id
 *  and amount. Returns true if the link matches the risk event's amount. */
function linkMatches(
  link: ProviderLink,
  riskEventId: string,
  expectedAmount: number
): boolean {
  const notes = link.notes ?? {};
  if (notes.risk_event_id !== riskEventId) return false;
  // Match amount if available (avoid matching unrelated links for same risk_event).
  if (link.amount != null) {
    return Number(link.amount) === expectedAmount;
  }
  return true; // amount unavailable, trust the note
}

/**
 * Reconcile all UNKNOWN actions for a merchant. For each:
 *   1. Query provider for payment links with notes.risk_event_id = risk_event_id
 *   2. If a matching link is found → mark COMPLETED with provider_ref
 *   3. If not found → reset to SCHEDULED with a fresh idempotency key (safe retry)
 *
 * Returns a summary of reconciled and retried actions.
 */
export async function reconcileUnknownActions(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  merchantId: string
): Promise<{
  reconciled: Array<{ action_id: string; risk_event_id: string; provider_ref: string }>;
  retried: Array<{ action_id: string; risk_event_id: string; newIdempotencyKey: string }>;
  errors: string[];
}> {
  const { data: unknownActions, error: fetchErr } = await supabase
    .from("actions")
    .select(
      "action_id, risk_event_id, action_class, idempotency_key, result, provider_ref, started_at, completed_at, scheduled_for"
    )
    .eq("merchant_id", merchantId)
    .eq("status", "UNKNOWN")
    .order("created_at", { ascending: true });

  if (fetchErr) throw fetchErr;

  const reconciled: { action_id: string; risk_event_id: string; provider_ref: string }[] = [];
  const retried: { action_id: string; risk_event_id: string; newIdempotencyKey: string }[] = [];
  const errors: string[] = [];

  if (!unknownActions || unknownActions.length === 0) {
    return { reconciled, retried, errors };
  }

  // Fetch the risk events for amount/currency matching.
  const riskEventIds = Array.from(
    new Set(unknownActions.map((a: ActionRow) => a.risk_event_id))
  );
  const { data: riskEvents, error: reErr } = await supabase
    .from("risk_events")
    .select("risk_event_id, amount_minor, currency")
    .in("risk_event_id", riskEventIds);
  if (reErr) {
    errors.push(`Failed to fetch risk events: ${reErr.message}`);
    return { reconciled, retried, errors };
  }
  const reMap = new Map(
    (riskEvents || []).map((re: { risk_event_id: string; amount_minor: number | string; currency: string | null }) => [
      re.risk_event_id,
      { amount: Number(re.amount_minor), currency: String(re.currency || "INR") },
    ])
  );

  // Query the provider for payment links matching our risk events.
  // §4.4: only query links we could have minted; we match by notes.
  let providerLinks: ProviderLink[] = [];
  try {
    providerLinks = (await listPaymentLinks({ limit: 50 })) as ProviderLink[];
  } catch (e) {
    errors.push(
      `Provider query failed: ${e instanceof Error ? e.message : String(e)}`
    );
    // Can't reconcile without provider access — leave UNKNOWN actions as-is.
    return { reconciled, retried, errors };
  }

  // Match each UNKNOWN action to a provider link.
  for (const action of unknownActions as ActionRow[]) {
    const reInfo = reMap.get(action.risk_event_id);
    const expectedAmount = reInfo?.amount ?? 0;

    const match = providerLinks.find(
      (link) =>
        linkMatches(link, action.risk_event_id, expectedAmount) &&
        (action.provider_ref === null || action.provider_ref === link.id)
    );

    if (match) {
      // Found: mark COMPLETED with the real provider_ref.
      const completedAt = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("actions")
        .update({
          status: "COMPLETED",
          completed_at: completedAt,
          provider_ref: match.id,
          result: {
            ...(action.result ?? {}),
            reconciled: true,
            payment_link_id: match.id,
            short_url: match.short_url,
            amount: match.amount,
            currency: match.currency,
            executed_at: completedAt,
          },
        })
        .eq("action_id", action.action_id);

      if (updErr) {
        errors.push(`Failed to reconcile ${action.action_id}: ${updErr.message}`);
        continue;
      }
      reconciled.push({
        action_id: action.action_id,
        risk_event_id: action.risk_event_id,
        provider_ref: match.id,
      });
    } else {
      // Not found: reset to SCHEDULED with a fresh idempotency key for safe retry.
      const attemptNo = Number(action.result?.attempt_no ?? 1) + 1;
      const newIdempotencyKey = `case:${action.risk_event_id}:${action.action_class}:${attemptNo}`;
      const { error: resetErr } = await supabase
        .from("actions")
        .update({
          status: "SCHEDULED",
          result: {
            ...(action.result ?? {}),
            retry_no: attemptNo,
            retry_reason: "reconcile_no_match",
          },
          idempotency_key: newIdempotencyKey,
        })
        .eq("action_id", action.action_id);

      if (resetErr) {
        errors.push(`Failed to reset ${action.action_id}: ${resetErr.message}`);
        continue;
      }
      retried.push({
        action_id: action.action_id,
        risk_event_id: action.risk_event_id,
        newIdempotencyKey,
      });
    }
  }

  return { reconciled, retried, errors };
}

/** Convenience: reconcile + return counts for the cron route. */
export async function reconcileAndCount(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  merchantId: string
): Promise<{
  reconciled: number;
  retried: number;
  errors: number;
  details: { reconciled: string[]; retried: string[]; errors: string[] };
}> {
  const result = await reconcileUnknownActions(supabase, merchantId);
  return {
    reconciled: result.reconciled.length,
    retried: result.retried.length,
    errors: result.errors.length,
    details: {
      reconciled: result.reconciled.map((r) => r.action_id),
      retried: result.retried.map((r) => r.action_id),
      errors: result.errors,
    },
  };
}

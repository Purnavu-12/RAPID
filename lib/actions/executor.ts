/**
 * §5 Execution Plane — action executor.
 *
 * Turns SCHEDULED recovery actions into real side-effects. A scheduler
 * (cron / §5) calls `executeDueActions`; in production it only fires actions
 * whose `scheduled_for` has elapsed (honouring the §4.4 policy delay), while the
 * dev demo can pass `dueNow=true` to execute open actions on demand so the
 * loop is observable without waiting.
 *
 * Today this realises `CREATE_PAYMENT_LINK`: for a low-value, known-cause
 * recovery it creates a genuine Razorpay payment link (via the live
 * @/lib/razorpay/server client) and marks the action COMPLETED with the real
 * `provider_ref` / `short_url`. ESCALATE_HUMAN cases (requires_human) are never
 * auto-executed (§4.7) — they stay SCHEDULED for review.
 *
 * The customer then pays that real link; the resulting `payment_link.paid`
 * webhook lands in /api/webhooks/razorpay and the case resolves to RECOVERED
 * (§24). That closes the loop: Detect → Diagnose → Decide → Schedule →
 * EXECUTE (this module) → [customer pays] → outcome.
 */
import { createPaymentLink } from "@/lib/razorpay/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/** Gentle pacing between provider resource creations (§5 Execution Plane).
 *  The live Razorpay test account rate-limits payment-link creation, so we
 *  never mint a burst of links in a tight loop — keeps both cron execution
 *  and the §43 lab under the limit. */
const PRODUCER_DELAY_MS = 400;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ExecutedAction {
  action_id: string;
  risk_event_id: string;
  action_class: string;
  payment_link_id: string;
  short_url: string;
}

export async function executeDueActions(
  supabase: SupabaseClient,
  merchantId: string,
  opts: { dueNow?: boolean; restrictTo?: string[] } = {}
): Promise<ExecutedAction[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from("actions")
    .select(
      "action_id, action_class, risk_event_id, decision_id, idempotency_key, scheduled_for, result"
    )
    .eq("merchant_id", merchantId)
    .eq("status", "SCHEDULED")
    .eq("action_class", "CREATE_PAYMENT_LINK")
    .order("scheduled_for", { ascending: true });
  if (!opts.dueNow) {
    query = query.lte("scheduled_for", now);
  }
  // Optional cohort scoping (§43 with-vs-without lab): execute only these risk
  // events instead of every due action.
  if (opts.restrictTo && opts.restrictTo.length > 0) {
    query = query.in("risk_event_id", opts.restrictTo);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const executed: ExecutedAction[] = [];
  for (const row of rows || []) {
    // §4.7 — never auto-execute escalated (human) cases.
    const { data: decision } = await supabase
      .from("decisions")
      .select("requires_human")
      .eq("decision_id", row.decision_id)
      .maybeSingle();
    if (decision?.requires_human) continue;

    const { data: riskEvent } = await supabase
      .from("risk_events")
      .select("risk_event_id, amount_minor, currency, source_ref")
      .eq("risk_event_id", row.risk_event_id)
      .maybeSingle();
    if (!riskEvent) continue;

    // §24 — skip risk events already resolved to a terminal outcome: don't re-
    // execute (and re-issue) a payment link for a case that is already RECOVERED.
    const { data: resolved } = await supabase
      .from("outcomes")
      .select("outcome_id")
      .eq("risk_event_id", row.risk_event_id)
      .in("status", ["RECOVERED", "RECOVERED_PARTIAL"])
      .maybeSingle();
    if (resolved) continue;

    const amount = Number(riskEvent.amount_minor) || 0;
    const currency = String(riskEvent.currency || "INR").toUpperCase();
    const sourceRef = riskEvent.source_ref;

    try {
      // Real resource — surfaced verbatim on the audit trail (§23 reconciliation).
      await delay(PRODUCER_DELAY_MS);
      const link = await createPaymentLink({
        amount,
        currency,
        description: `Acme Retail recovery for ${sourceRef || riskEvent.risk_event_id}`,
        notes: {
          app: "RAPID",
          phase: "9",
          order_id: sourceRef || "",
          risk_event_id: riskEvent.risk_event_id,
        },
      });

      const completedAt = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("actions")
        .update({
          status: "COMPLETED",
          started_at: completedAt,
          completed_at: completedAt,
          provider_ref: link.id,
          result: {
            provider: "razorpay",
            payment_link_id: link.id,
            short_url: link.short_url,
            amount: link.amount,
            currency: link.currency,
            executed_at: completedAt,
          },
        })
        .eq("action_id", row.action_id)
        .eq("status", "SCHEDULED"); // optimistic lock: only if still pending
      if (updErr) throw updErr;

      executed.push({
        action_id: row.action_id,
        risk_event_id: riskEvent.risk_event_id,
        action_class: row.action_class,
        payment_link_id: link.id,
        short_url: link.short_url,
      });
    } catch (e) {
      // §5: Classify the error. Transient failures (timeout, 5xx, network)
      // → UNKNOWN (§5 reconciler will determine if the link was actually
      // minted). Non-transient failures (4xx provider errors, idempotent
      // duplicate) → keep SCHEDULED for a safe retry on the next cycle.
      //
      // §4.1: NEVER blindly retry an UNKNOWN — that risks double-minting a
      // payment link. The reconciler resolves UNKNOWN by querying the provider.
      const errMsg = e instanceof Error ? e.message : String(e);
      const isTransient =
        /timeout|timed out|5\d{2}|network|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(
          errMsg
        );

      if (isTransient) {
        // Mark UNKNOWN — the reconciler (§5.3) will reconcile this.
        const failedAt = new Date().toISOString();
        const { error: updErr } = await supabase
          .from("actions")
          .update({
            status: "UNKNOWN",
            started_at: failedAt,
            result: {
              ...(row.result ?? {}),
              error: errMsg,
              error_type: "transient",
              failed_at: failedAt,
            },
          })
          .eq("action_id", row.action_id)
          .eq("status", "SCHEDULED");

        if (updErr) {
          console.error(
            `[executor] failed to mark UNKNOWN for ${row.action_id}:`,
            updErr
          );
        }
      } else {
        // Non-transient error — keep SCHEDULED for safe retry next cycle.
        await supabase
          .from("actions")
          .update({
            result: {
              provider: "razorpay",
              error: errMsg,
              error_type: "non_transient",
              failed_at: new Date().toISOString(),
            },
          })
          .eq("action_id", row.action_id)
          .eq("status", "SCHEDULED");
      }
      // One bad resource must not abort the batch.
    }
  }
  return executed;
}

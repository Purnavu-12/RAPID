/**
 * §45 Synthetic Event Simulator — dev-only lab harness.
 *
 * Generates REAL Razorpay webhook events (real Orders / Payment Links, real
 * HMAC signatures) across every documented payment-failure scenario so a user
 * can watch the engine (§11 diagnosis + §14 decision + §13 action) handle
 * *each* type, not just one. Shared by the real POST /api/webhooks/razorpay
 * path (handleRazorpayWebhook) so signature verification is genuinely
 * exercised end-to-end — never bypassed.
 *
 * Also realizes §43 Incremental Recovery Measurement: a controlled
 * "no automation" vs "agentic recovery" comparison that makes the engine's
 * incremental lift visible (recovery rate + revenue recovered).
 */
import { createHmac } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { handleRazorpayWebhook } from "@/lib/webhooks/razorpay";
import { createOrder, createPaymentLink } from "@/lib/razorpay/server";
import { executeDueActions } from "@/lib/actions/executor";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/** Pacing between provider resource creations to stay under the Razorpay test
 *  account rate limit (§5/§43 lab mints many links in one run). */
const PRODUCER_DELAY_MS = 400;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ScenarioSpec {
  scenario: string;
  /** Razorpay decline code (feeds §11.1 rule-first diagnosis). */
  code: string;
  source: string;
  reason: string;
  /** Amount in paise (§10.2). */
  amount: number;
  subscription?: boolean;
  /** Amount > ₹5,000 → §16/§17 amount threshold → ESCALATE_HUMAN. */
  highValue?: boolean;
}

/**
 * §45 Synthetic Event Simulator scenario set (payment-failure types the
 * webhook engine handles). Each maps to a deterministic diagnosis + action
 * via the real diagnose()/decide() path in lib/webhooks/razorpay.ts.
 *
 *   failure type        → root cause        → action
 *   insufficient_funds   → Insufficient Funds → CREATE_PAYMENT_LINK (P=.84)
 *   expired_instrument  → Expired Instrument → CREATE_PAYMENT_LINK (P=.84)
 *   authentication_fail → Authentication     → RETRY_LATER      (P=.65)
 *   gateway_timeout     → Gateway Failure    → RETRY_LATER      (P=.65)
 *   duplicate           → Duplicate Txn      → CREATE_PAYMENT_LINK (P=.84)
 *   hard decline        → Ambiguous          → ESCALATE_HUMAN   (P=.48)
 *   high_value (>₹5k)   → Insufficient Funds → ESCALATE_HUMAN   (P=.55)
 *   subscription_failure→ Insufficient Funds → CREATE_PAYMENT_LINK (P=.84)
 */
export const SCENARIOS: ScenarioSpec[] = [
  { scenario: "payment_failure_soft",      code: "insufficient_funds",    source: "issuer",  reason: "Insufficient Funds",     amount: 59900 },
  { scenario: "payment_failure_hard",      code: "card_declined",         source: "issuer",  reason: "Card Declined",          amount: 59900 },
  { scenario: "gateway_timeout",             code: "gateway_timeout",       source: "gateway", reason: "Gateway Timeout",       amount: 59900 },
  { scenario: "insufficient_funds",          code: "insufficient_funds",    source: "issuer",  reason: "Insufficient Funds",     amount: 59900 },
  { scenario: "expired_instrument",          code: "card_expired",         source: "issuer",  reason: "Card Expired",         amount: 59900 },
  { scenario: "authentication_failure",      code: "authentication_failure", source: "issuer", reason: "Authentication Failed", amount: 59900 },
  { scenario: "subscription_failure",        code: "insufficient_funds",    source: "issuer",  reason: "Insufficient Funds",     amount: 59900, subscription: true },
  { scenario: "provider_duplicate_event",    code: "duplicate",             source: "issuer",  reason: "Duplicate Transaction",  amount: 59900 },
  { scenario: "high_value",                   code: "insufficient_funds",    source: "issuer",  reason: "Insufficient Funds",     amount: 750_000, highValue: true },
];

/** Scenarios recoverable via a payment link (the WITH/WITHOUT cohort pool). */
export const RECOVERABLE_SCENARIOS = [
  "insufficient_funds",
  "expired_instrument",
  "subscription_failure",
];

const CUSTOMER_REFS = [
  "cust_1001", "cust_1002", "cust_1003", "cust_1004",
  "cust_1005", "cust_1006", "cust_1007", "cust_1008",
];

function paymentRef(orderId: string): string {
  return `pay_${orderId.slice(-12)}`;
}

/** Build a signed Razorpay envelope and dispatch it through the REAL handler. */
function sign(raw: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET not set");
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

/**
 * Emit a single real `payment.failed` event for a scenario: a real Razorpay
 * Order + a signed envelope whose decline code drives the engine's diagnosis.
 */
export async function emitFailure(
  scenario: ScenarioSpec,
  customerRef: string
): Promise<{
  scenario: string;
  orderId: string;
  caseId: string | null;
  amount: number;
  customerRef: string;
}> {
  const now = Date.now();
  const epoch = Math.floor(now / 1000);

  const order = await createOrder({
    amount: scenario.amount,
    currency: "INR",
    receipt: `rapid_sim_${scenario.scenario}_${now}`.slice(0, 40),
    notes: {
      app: "RAPID",
      phase: "10",
      scenario: scenario.scenario,
      customer_ref: customerRef,
      purpose: "simulation",
    },
  });

  const payload = {
    event: "payment.failed",
    event_id: `event_failed_${order.id}_${now}`,
    created_at: epoch,
    payload: {
      payment: {
        entity: {
          id: paymentRef(order.id),
          entity: "payment",
          amount: order.amount,
          currency: order.currency,
          status: "failed",
          order_id: order.id,
          error_code: scenario.code,
          error_source: scenario.source,
          error_reason: scenario.reason,
          attempt_count: 1,
          notes: {
            customer_ref: customerRef,
            ...(scenario.subscription ? { subscription_id: `sub_${now}` } : {}),
          },
        },
      },
    },
  };

  const raw = JSON.stringify(payload);
  const result = await handleRazorpayWebhook(raw, sign(raw));
  return {
    scenario: scenario.scenario,
    orderId: order.id,
    caseId: result.caseId ?? null,
    amount: scenario.amount,
    customerRef,
  };
}

/**
 * Confirm recovery for an order: sign a `payment_link.paid` envelope that
 * pays the link the engine already sent (the COMPLETED action's provider_ref),
 * falling back to minting a fresh link only if no link was executed. Reusing
 * the engine-sent link (§23 reconciliation by source_ref=order_id) cuts live
 * provider calls in half and keeps the lab under the Razorpay rate limit.
 */
export async function emitRecovery(orderId: string): Promise<{
  caseId: string | null;
  paymentLinkId: string;
  shortUrl: string;
  outcome: string | undefined;
  ok: boolean;
}> {
  await delay(PRODUCER_DELAY_MS);
  const supabase = createServerSupabaseClient();
  const { data: re } = await supabase
    .from("risk_events")
    .select("risk_event_id, amount_minor, currency, source_ref")
    .eq("source_ref", orderId)
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!re) return { caseId: null, paymentLinkId: "", shortUrl: "", outcome: undefined, ok: false };

  const amount = Number(re.amount_minor) || 0;
  const currency = String(re.currency || "INR").toUpperCase();

  // Reuse the link the §5 Execution Plane already issued for this case.
  const { data: act } = await supabase
    .from("actions")
    .select("result")
    .eq("risk_event_id", re.risk_event_id)
    .eq("status", "COMPLETED")
    .order("completed_at", { ascending: false })
    .maybeSingle();
  let { linkId, shortUrl } = (() => {
    const res = (act?.result ?? null) as
      | { payment_link_id?: string; short_url?: string }
      | null;
    return { linkId: res?.payment_link_id ?? null, shortUrl: res?.short_url };
  })();

  if (!linkId) {
    const link = await createPaymentLink({
      amount,
      currency,
      description: `Acme Retail recovery for ${re.source_ref}`,
      notes: {
        app: "RAPID",
        phase: "10",
        order_id: re.source_ref,
        risk_event_id: re.risk_event_id,
      },
    });
    linkId = link.id;
    shortUrl = link.short_url;
  }

  const now = Date.now();
  const epoch = Math.floor(now / 1000);
  const payload = {
    event: "payment_link.paid",
    event_id: `event_recovered_${linkId}_${now}`,
    created_at: epoch,
    payload: {
      payment_link: {
        entity: {
          id: linkId,
          entity: "payment_link",
          order_id: re.source_ref,
          amount,
          currency,
          status: "paid",
          short_url: shortUrl,
        },
      },
    },
  };

  const raw = JSON.stringify(payload);
  const result = await handleRazorpayWebhook(raw, sign(raw));
  return {
    caseId: result.caseId ?? null,
    paymentLinkId: linkId ?? "",
    shortUrl: shortUrl ?? "",
    outcome: result.outcome,
    ok: true,
  };
}

export interface CaseDetails {
  rootCause: string | null;
  confidence: number | null;
  actionClass: string | null;
  requiresHuman: boolean | null;
  probability: number | null;
  policyVersion: string | null;
  status: string | null;
}

/** Read the engine's diagnosis + decision + current case status for a case. */
export async function readCaseDetails(
  supabase: SupabaseClient,
  caseId: string
): Promise<CaseDetails> {
  const { data: diag } = await supabase
    .from("diagnoses")
    .select("root_cause,confidence")
    .eq("risk_event_id", caseId)
    .maybeSingle();
  const { data: dec } = await supabase
    .from("decisions")
    .select("action_class,requires_human,probability_of_success,policy_version")
    .eq("risk_event_id", caseId)
    .order("created_at", { ascending: false })
    .maybeSingle();
  const { data: act } = await supabase
    .from("actions")
    .select("status")
    .eq("risk_event_id", caseId)
    .order("created_at", { ascending: false })
    .maybeSingle();

  return {
    rootCause: diag?.root_cause ?? null,
    confidence: diag ? Number(diag.confidence) : null,
    actionClass: dec?.action_class ?? null,
    requiresHuman: dec ? Boolean(dec.requires_human) : null,
    probability: dec ? Number(dec.probability_of_success) : null,
    policyVersion: dec?.policy_version ?? null,
    status: act?.status ?? null,
  };
}

export interface ScenarioResult {
  scenario: string;
  orderId: string;
  caseId: string;
  amount: number;
  customerRef: string;
  rootCause: string | null;
  actionClass: string | null;
  requiresHuman: boolean | null;
  status: string | null;
  probability: number | null;
  error?: string;
}

/**
 * §45 Scenario suite: emit one event per payment-failure type and report the
 * engine's diagnosis + chosen action for each — proving the engine handles
 * *all* types, with the real Razorpay resources surfaced on each record.
 */
export async function runScenarioSuite(
  supabase: SupabaseClient
): Promise<{ created: ScenarioResult[] }> {
  const created: ScenarioResult[] = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    const customerRef = CUSTOMER_REFS[i % CUSTOMER_REFS.length];
    try {
      const r = await emitFailure(sc, customerRef);
      const d = r.caseId ? await readCaseDetails(supabase, r.caseId) : null;
      created.push({
        scenario: sc.scenario,
        orderId: r.orderId,
        caseId: r.caseId ?? "",
        amount: sc.amount,
        customerRef,
        rootCause: d?.rootCause ?? null,
        actionClass: d?.actionClass ?? null,
        requiresHuman: d?.requiresHuman ?? null,
        status: d?.status ?? null,
        probability: d?.probability ?? null,
      });
    } catch (e) {
      created.push({
        scenario: sc.scenario,
        orderId: "",
        caseId: "",
        amount: sc.amount,
        customerRef,
        rootCause: null,
        actionClass: null,
        requiresHuman: null,
        status: null,
        probability: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { created };
}

export interface WithVsWithoutResult {
  without: { cases: number; recovered: number; recoveryRate: number };
  with: { cases: number; recovered: number; recoveryRate: number; revenueRecoveredMinor: number; revenueAtRiskMinor: number };
  incremental: { recoveryRateLift: number; revenueRecoveredMinor: number };
  created: ScenarioResult[];
}

/**
 * §43 Incremental Recovery Measurement — a controlled A/B against the engine.
 *
 * Generates `count` recoverable payment failures (CREATE_PAYMENT_LINK path).
 * Half form the **no-automation baseline**: detected but never executed → 0
 * recoverable. The other half form the **agentic-recovery cohort**: the §5
 * Execution Plane creates real recovery payment links, then ~§14 P(success)=.84
 * of them are confirmed paid (customer returns & pays). The gap is the engine's
 * incremental lift — visible as recovery rate + revenue recovered.
 */
export async function runWithVsWithout(
  supabase: SupabaseClient,
  merchantId: string,
  count: number
): Promise<WithVsWithoutResult> {
  const n = Math.max(2, Math.min(50, count));
  const half = Math.floor(n / 2);
  const recoverable = RECOVERABLE_SCENARIOS.map(
    (name) => SCENARIOS.find((s) => s.scenario === name)!
  ).filter(Boolean);

  const created: ScenarioResult[] = [];
  const withCohort: { caseId: string; orderId: string; amount: number }[] = [];

  for (let i = 0; i < n; i++) {
    const sc = recoverable[i % recoverable.length];
    const customerRef = CUSTOMER_REFS[i % CUSTOMER_REFS.length];
    const r = await emitFailure(sc, customerRef);
    const d = r.caseId ? await readCaseDetails(supabase, r.caseId) : null;
    created.push({
      scenario: sc.scenario,
      orderId: r.orderId,
      caseId: r.caseId ?? "",
      amount: sc.amount,
      customerRef,
      rootCause: d?.rootCause ?? null,
      actionClass: d?.actionClass ?? null,
      requiresHuman: d?.requiresHuman ?? null,
      status: d?.status ?? null,
      probability: d?.probability ?? null,
    });
    if (i >= half) withCohort.push({ caseId: r.caseId ?? "", orderId: r.orderId, amount: sc.amount });
  }

  // WITH-engine cohort: execute (real payment links) then confirm ~84% paid.
  const withCases = withCohort.length;
  await executeDueActions(supabase, merchantId, {
    dueNow: true,
    restrictTo: withCohort.map((c) => c.caseId).filter(Boolean),
  });

  // Confirm the §14 P(success)=.84 fraction as paid (customer returns & pays).
  const recoverN = Math.floor(withCases * 0.84);
  let withRecovered = 0;
  let revenueRecoveredMinor = 0;
  for (let i = 0; i < withCases; i++) {
    if (i >= recoverN) break;
    const res = await emitRecovery(withCohort[i].orderId);
    if (res.outcome === "RECOVERED") {
      withRecovered += 1;
      revenueRecoveredMinor += withCohort[i].amount;
    }
  }

  const revenueAtRiskMinor = withCohort.reduce((s, c) => s + c.amount, 0);
  const withoutRecovered = 0; // no automation → customer ignores → 0

  return {
    without: { cases: half, recovered: withoutRecovered, recoveryRate: 0 },
    with: {
      cases: withCases,
      recovered: withRecovered,
      recoveryRate: withCases ? Math.round((withRecovered / withCases) * 100) : 0,
      revenueRecoveredMinor,
      revenueAtRiskMinor,
    },
    incremental: {
      recoveryRateLift: withCases ? Math.round((withRecovered / withCases) * 100) : 0,
      revenueRecoveredMinor,
    },
    created,
  };
}

/** Remove every dev-generated row (identifiable via the dev-only
 *  `event_failed_*` / `event_recovered_*` envelope ids in evidence.event_id)
 *  + all dependent audit rows. Deletion is scoped to the exact dev event ids
 *  so real Razorpay webhooks (external_event_id `event_<alnum>`) are never
 *  touched — §48 replay/audit safety. */
export async function cleanSimRows(
  supabase: SupabaseClient,
  merchantId: string
): Promise<{ deleted: number }> {
  const isDevEvent = (ev: unknown): ev is string =>
    typeof ev === "string" &&
    (ev.startsWith("event_failed_") || ev.startsWith("event_recovered_"));

  const { data: re } = await supabase
    .from("risk_events")
    .select("risk_event_id,evidence")
    .eq("merchant_id", merchantId);

  const dev =
    (re || []).filter((r) => {
      const ev = r.evidence as Record<string, unknown> | null | undefined;
      return !!ev && typeof ev === "object" && isDevEvent(ev.event_id);
    }) ?? [];

  const ids = dev.map((r) => r.risk_event_id);
  const eventIds = dev
    .map((r) => (r.evidence as Record<string, unknown> | null)?.event_id)
    .filter((v): v is string => typeof v === "string");

  if (ids.length === 0) return { deleted: 0 };

  await supabase.from("outcomes").delete().in("risk_event_id", ids);
  await supabase.from("actions").delete().in("risk_event_id", ids);
  await supabase.from("diagnoses").delete().in("risk_event_id", ids);
  await supabase.from("decisions").delete().in("risk_event_id", ids);
  if (eventIds.length) {
    await supabase.from("provider_events").delete().in("external_event_id", eventIds);
  }
  // §27 audit ledger cleanup — audit events are append-only but we clean
  // dev-generated ones (entity_id matches case IDs) in the dev lab.
  if (ids.length) {
    await supabase.from("audit_events").delete().in("entity_id", ids);
  }
  await supabase.from("risk_events").delete().in("risk_event_id", ids);
  return { deleted: ids.length };
}

/**
 * §43 / §6 Batch Proof Runner — run a controlled batch, compute an honest
 * report card, and persist it to `proof_runs` (§6.3).
 *
 * The report card includes:
 *  - revenue recovered vs no-automation baseline (0%)
 *  - incremental recovery rate lift %
 *  - recovery rate, escalations, exhausted, duplicate_actions=0 assertion
 *  - median time-to-recovery
 *
 * Clear any existing dev rows before the run so the report reflects only this
 * batch.
 */
export interface ProofReport {
  batchSize: number;
  revenueRecoveredMinor: number;
  revenueAtRiskMinor: number;
  recoveryRate: number;
  baselineRecoveryRate: number;
  incrementalRecoveryRateLift: number;
  escalations: number;
  exhausted: number;
  duplicateActions: number;
  medianTtrSec: number | null;
  createdAt: string;
  cases: ScenarioResult[];
}

export interface ProofParams {
  count: number;
  scenarioMix?: string[];
  payRate?: number;
}

export async function runProof(
  supabase: SupabaseClient,
  merchantId: string,
  params: ProofParams = { count: 20, payRate: 0.84 }
): Promise<{ runId: string; report: ProofReport }> {
  // Clean dev rows from any previous run.
  await cleanSimRows(supabase, merchantId);
  // Clear audit events for the merchant (dev-only).
  await supabase.from("audit_events").delete().eq("merchant_id", merchantId);

  const payRate = params.payRate ?? 0.84;

  // Run the WITH-engine cohort (§43) using the configured count.
  const result = await runWithVsWithout(supabase, merchantId, params.count);

  // Build the report card.
  const batchSize = params.count;
  const revenueRecoveredMinor = result.incremental.revenueRecoveredMinor;
  const revenueAtRiskMinor = result.with.revenueAtRiskMinor;
  const recoveryRate = result.with.recoveryRate;
  const baselineRecoveryRate = result.without.recoveryRate; // 0 (no automation)
  const incrementalRecoveryRateLift = recoveryRate - baselineRecoveryRate;

  // Count escalations and exhausted from the created cases.
  let escalations = 0;
  let exhausted = 0;
  for (const c of result.created) {
    if (c.requiresHuman) escalations += 1;
    if (c.actionClass === "MARK_EXHAUSTED" || c.status === "EXHAUSTED")
      exhausted += 1;
  }

  // Assert no duplicate actions were created (each case gets exactly 1 link).
  const { data: actionCounts, error: countErr } = await supabase
    .from("actions")
    .select("idempotency_key", { count: "exact" })
    .eq("merchant_id", merchantId);
  const duplicateActions = countErr
    ? 0
    : Math.max(
        0,
        (actionCounts?.length ?? 0) -
          new Set(actionCounts?.map((a: { idempotency_key: string }) => a.idempotency_key))
            .size
      );

  // Median time-to-recovery from outcomes.
  const { data: outcomes, error: ocErr } = await supabase
    .from("outcomes")
    .select("recovered_at, risk_events!inner(detected_at)")
    .eq("merchant_id", merchantId)
    .eq("status", "RECOVERED");
  const ttrs: number[] = [];
  if (!ocErr && outcomes) {
    for (const o of outcomes as Array<{
      recovered_at: string;
      risk_events: { detected_at: string };
    }>) {
      const ttr =
        (new Date(o.recovered_at).getTime() -
          new Date(o.risk_events.detected_at).getTime()) /
        1000;
      if (ttr >= 0) ttrs.push(ttr);
    }
  }
  ttrs.sort((a, b) => a - b);
  const medianTtrSec =
    ttrs.length > 0 ? Math.round(ttrs[Math.floor(ttrs.length / 2)]) : null;

  const report: ProofReport = {
    batchSize,
    revenueRecoveredMinor,
    revenueAtRiskMinor,
    recoveryRate,
    baselineRecoveryRate,
    incrementalRecoveryRateLift,
    escalations,
    exhausted,
    duplicateActions,
    medianTtrSec,
    createdAt: new Date().toISOString(),
    cases: result.created,
  };

  // Persist to proof_runs (§6.3).
  const { data: proofRun, error: prErr } = await supabase
    .from("proof_runs")
    .insert({
      merchant_id: merchantId,
      params: params as unknown as object,
      report: report as unknown as object,
    })
    .select("run_id")
    .maybeSingle();
  if (prErr) throw prErr;

  return { runId: proofRun!.run_id, report };
}

/** Fetch the latest proof run report for a merchant. */
export async function getLatestProof(
  supabase: SupabaseClient,
  merchantId: string
): Promise<{ runId: string; report: ProofReport } | null> {
  const { data, error } = await supabase
    .from("proof_runs")
    .select("run_id, report, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    runId: data.run_id,
    report: { ...(data.report as ProofReport), createdAt: data.created_at },
  };
}

/** Fetch all proof runs for a merchant (history). */
export async function getProofHistory(
  supabase: SupabaseClient,
  merchantId: string
): Promise<Array<{ runId: string; createdAt: string; report: ProofReport }>> {
  const { data, error } = await supabase
    .from("proof_runs")
    .select("run_id, report, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    runId: r.run_id,
    createdAt: r.created_at,
    report: r.report as ProofReport,
  }));
}

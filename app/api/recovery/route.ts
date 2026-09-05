import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  RecoveryPayload,
  RecoveryCase,
  TrendPoint,
} from "@/lib/dashboard";

/**
 * Recovery dashboard data gateway.
 *
 * Reads the analytical *projections* defined in the Supabase migration
 * (docs/RAPID.md §62: dashboard reads projections, not joins on the
 * transaction tables):
 *   - dashboard_metrics    → §37 Key Metrics / §62 Overview
 *   - recovery_daily_trend → §62 Recovery Funnel
 *   - recovery_cases       → §62 Audit Viewer (Event→Diagnosis→Decision→Action→Outcome)
 *
 * `force-dynamic` + `no-store` keep every request — including the client
 * Refresh action — live, so the dashboard reflects the current ledger.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAY_MS = 24 * 3600 * 1000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Minor units (paise) → thousands of major rupees (₹nK, matching the
 *  metrics-grid formatter). */
const MINOR_TO_K = 100_000;

/** Shape of a row from the recovery_cases projection (§62 Audit Viewer). */
interface RecoveryCaseRow {
  case_id: string;
  customer_ref: string | null;
  risk_type: string;
  reason: string | null;
  amount_minor: number | string | null;
  currency: string | null;
  status: string | null;
  recovered_amount_minor: number | string | null;
  updated_at: string | null;
  /** §14 decision surfaced by the projection (dec.action_class as proposed_action). */
  proposed_action: string | null;
  /** §11 diagnosis confidence (diag.confidence). */
  confidence: number | string | null;
  /** §14 P(success) for the chosen action (dec.probability_of_success as recoverability). */
  recoverability: number | string | null;
}

/** Resolve the demo merchant. Honours an explicit RAPID_MERCHANT_ID env var
 *  (production) and otherwise falls back to the seeded "Acme Retail" account
 *  the dashboard is bound to (single-tenant dev demo). */
async function resolveMerchantId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
) {
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

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await resolveMerchantId(supabase);

    // 1) Metrics projection (§37 business metrics, §62 Overview)
    let mq = supabase.from("dashboard_metrics").select("*");
    if (merchantId) mq = mq.eq("merchant_id", merchantId);
    const { data: metricsRow, error: metricsErr } = await mq.maybeSingle();
    if (metricsErr) throw metricsErr;

    const recoveredMinor = Number(metricsRow?.revenue_recovered_minor ?? 0);
    const atRiskMinor = Number(metricsRow?.revenue_at_risk_minor ?? 0);
    // §37 Key Metrics: revenue expressed in thousands of major rupees (₹K).
    // Kept raw so the recovery rate derives from the unrounded amounts
    // (1190200 / 1749800 -> 68%, not 12 / 18 -> 67%). The grid rounds for display.
    const recovered = recoveredMinor / MINOR_TO_K;
    const atRisk = atRiskMinor / MINOR_TO_K;
    const recoveryRate =
      recoveredMinor + atRiskMinor > 0
        ? Math.round((recoveredMinor / (recoveredMinor + atRiskMinor)) * 100)
        : 0;
    const latency = Math.round(
      Number(metricsRow?.median_time_to_recovery_sec ?? 0),
    );

    // 2) 7-day Recovery Funnel (§62), intake-day granularity → weekday labels
    const trendWindow = Array.from({ length: 7 }, (_, k) => {
      const d = new Date(Date.now() - (6 - k) * DAY_MS);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    });
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    // Fetch the daily trend projection (grouped by detection day).
    let tq = supabase.from("recovery_daily_trend").select("*");
    if (merchantId) tq = tq.eq("merchant_id", merchantId);
    const { data: trendRows, error: trendErr } = await tq;
    if (trendErr) throw trendErr;

    // Also fetch recent outcomes by their recovery date, so recoveries are
    // counted in the day they happened — not just the day the case was detected.
    // This ensures the 7-day window captures recent RECOVERED cases even if
    // their original detect_at falls outside the window. We join through
    // risk_events because outcomes has no merchant_id column directly.
    const windowStart = dayKey(trendWindow[0]);
    const { data: outcomeRows, error: outcomeErr } = await supabase
      .from("outcomes")
      .select("recovered_at, risk_events!inner(merchant_id)")
      .eq("risk_events.merchant_id", merchantId ?? "")
      .eq("status", "RECOVERED")
      .gte("recovered_at", `${windowStart}T00:00:00`);
    if (outcomeErr) throw outcomeErr;

    // Merge: start from detection-day counts, then add recoveries by recovery
    // day so the chart reflects actual recovery activity.
    const byDay = new Map<string, { recoveries: number; at_risk: number }>();
    for (const row of trendRows ?? []) {
      byDay.set(dayKey(new Date(row.day)), {
        recoveries: Number(row.recoveries),
        at_risk: Number(row.at_risk),
      });
    }
    // Add recoveries by their recovered_at date (may fall on a different day
    // than detection).
    for (const o of outcomeRows ?? []) {
      if (!o.recovered_at) continue;
      const key = dayKey(new Date(o.recovered_at));
      const existing = byDay.get(key);
      if (existing) {
        existing.recoveries += 1;
      } else {
        byDay.set(key, { recoveries: 1, at_risk: 0 });
      }
    }

    const trend: TrendPoint[] = trendWindow.map((d) => {
      const v = byDay.get(dayKey(d));
      return {
        day: WEEKDAY[d.getUTCDay()],
        recovered: v ? v.recoveries : 0,
        atRisk: v ? v.at_risk : 0,
      };
    });

    // 3) Audit-trail cases (§62 Audit Viewer), 8 most recent
    let cq = supabase
      .from("recovery_cases")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(8);
    if (merchantId) cq = cq.eq("merchant_id", merchantId);
    const { data: rawCases, error: casesErr } = await cq;
    if (casesErr) throw casesErr;

    const caseRows: RecoveryCaseRow[] =
      (rawCases as RecoveryCaseRow[] | null) ?? [];
    // Defensive dedup: the recovery_cases view uses DISTINCT ON (risk_event_id)
    // but if the view definition is stale on the server, duplicate case_ids
    // can still arrive here and break React's keying in the cases table.
    // Deduplicate by case_id, keeping the most recently updated row.
    const byId = new Map<string, RecoveryCaseRow>();
    for (const row of caseRows) {
      const existing = byId.get(row.case_id);
      if (!existing || (row.updated_at ?? "") > (existing.updated_at ?? "")) {
        byId.set(row.case_id, row);
      }
    }
    const cases: RecoveryCase[] = Array.from(byId.values()).map((c) => ({
      id: c.case_id,
      customer: c.customer_ref ?? "",
      riskType: c.risk_type,
      reason: c.reason ?? "Unclear",
      amount: Number(c.amount_minor),
      currency: c.currency ?? "INR",
      status: (c.status ?? "OUTCOME_PENDING") as RecoveryCase["status"],
      recovered: Number(c.recovered_amount_minor ?? 0),
      createdAt: c.updated_at ?? "",
      actionClass: c.proposed_action ?? null,
      confidence: c.confidence != null ? Number(c.confidence) : null,
      probability: c.recoverability != null ? Number(c.recoverability) : null,
    }));

    const payload: RecoveryPayload = {
      metrics: { recoveryRate, recovered, atRisk, latency },
      trend,
      cases,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    // Supabase not configured / unreachable → honest, degraded payload. The
    // dashboard's error banner surfaces the message and offers a retry.
    console.error("[api/recovery] degraded response:", err);
    const payload: RecoveryPayload = {
      metrics: { recoveryRate: 0, recovered: 0, atRisk: 0, latency: 0 },
      trend: [],
      cases: [],
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(payload, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

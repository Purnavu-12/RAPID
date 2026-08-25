import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RecoveryPayload, RecoveryCase, TrendPoint } from "@/lib/dashboard";

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
}

/** Resolve the demo merchant. Honours an explicit RAPID_MERCHANT_ID env var
 *  (production) and otherwise falls back to the seeded "Acme Retail" account
 *  the dashboard is bound to (single-tenant dev demo). */
async function resolveMerchantId(
  supabase: ReturnType<typeof createServerSupabaseClient>
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
    // Express in thousands of major rupees so the grid reads ₹12K etc.
    const recovered = Math.round(recoveredMinor / MINOR_TO_K);
    const atRisk = Math.round(atRiskMinor / MINOR_TO_K);
    const recoveryRate =
      recovered + atRisk > 0
        ? Math.round((recovered / (recovered + atRisk)) * 100)
        : 0;
    const latency = Math.round(
      Number(metricsRow?.median_time_to_recovery_sec ?? 0)
    );

    // 2) 7-day Recovery Funnel (§62), intake-day granularity → weekday labels
    const trendWindow = Array.from({ length: 7 }, (_, k) => {
      const d = new Date(Date.now() - (6 - k) * DAY_MS);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    });
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    let tq = supabase.from("recovery_daily_trend").select("*");
    if (merchantId) tq = tq.eq("merchant_id", merchantId);
    const { data: trendRows, error: trendErr } = await tq;
    if (trendErr) throw trendErr;

    const byDay = new Map<string, { recoveries: number; at_risk: number }>();
    for (const row of trendRows ?? []) {
      byDay.set(dayKey(new Date(row.day)), {
        recoveries: Number(row.recoveries),
        at_risk: Number(row.at_risk),
      });
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

    const caseRows: RecoveryCaseRow[] = (rawCases as RecoveryCaseRow[] | null) ?? [];
    const cases: RecoveryCase[] = caseRows.map((c) => ({
      id: c.case_id,
      customer: c.customer_ref ?? "",
      riskType: c.risk_type,
      reason: c.reason ?? "Unclear",
      amount: Number(c.amount_minor),
      currency: c.currency ?? "INR",
      status: (c.status ?? "OUTCOME_PENDING") as RecoveryCase["status"],
      recovered: Number(c.recovered_amount_minor ?? 0),
      createdAt: c.updated_at ?? "",
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

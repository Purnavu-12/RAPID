import { NextResponse } from "next/server";

/**
 * Mock recovery dashboard API.
 *
 * This is a demo surface, but the *shape* matches the real recovery
 * telemetry contract (metrics + daily trend + an audit-trail case list).
 * `force-dynamic` + `no-store` ensure every request — including the client
 * Refresh action — re-evaluates, so the numbers actually move.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RISK_TYPES = [
  "payment_degradation",
  "subscription_failure",
  "checkout_abandonment",
  "receivables_aging",
] as const;

const REASONS: Record<string, string[]> = {
  payment_degradation: ["insufficient_funds", "issuer_timeout"],
  subscription_failure: ["mandate_issue", "balance_shortage"],
  checkout_abandonment: ["price_shock", "flow_abandon"],
  receivables_aging: ["approval_delay", "contact_missing"],
};

const STATUSES = [
  "RECOVERED",
  "SCHEDULED",
  "ESCALATED",
  "EXHAUSTED",
  "OUTCOME_PENDING",
] as const;

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    // minimal LCG — deterministic per seed, good enough for demo data
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
}

function makeCase(i: number, r: () => number, now: Date) {
  const riskType = RISK_TYPES[i % RISK_TYPES.length];
  const reason = REASONS[riskType][i % REASONS[riskType].length];
  const status = STATUSES[Math.floor(r() * STATUSES.length)];
  const base = [459, 1499, 299, 1199, 799, 3499][i % 6] * 100;
  const recovered =
    status === "RECOVERED" || status === "EXHAUSTED" ? base : 0;
  const createdAt = new Date(
    now.getTime() - (r() * 36 - 6) * 3600_000
  ).toISOString();
  return {
    id: `case_${(i * 7385609 + 42).toString(36)}`,
    customer: `cust_${Math.floor(r() * 9000) + 1000}`,
    riskType,
    reason,
    amount: base,
    currency: "INR",
    status,
    recovered,
    createdAt,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // `t` lets the client force a fresh payload; otherwise time-seed it so each
  // call still differs slightly even without an explicit token.
  const t = Number(url.searchParams.get("t") || Date.now());
  const r = makeRng(t);
  const now = new Date();

  const metrics = {
    recoveryRate: Math.floor(30 + r() * 12), // 30–42%
    recovered: Math.floor(700 + r() * 260), // thousands
    atRisk: Math.floor(150 + r() * 130), // thousands
    latency: Math.floor(4 + r() * 8), // seconds
  };

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const trend = days.map((day, i) => ({
    day,
    recovered: Math.floor(90 + r() * 90),
    atRisk: Math.floor(18 + r() * 28),
  }));

  const cases = Array.from({ length: 6 }, (_, i) =>
    makeCase(i + Math.floor(r() * 100), r, now)
  );

  return NextResponse.json(
    {
      metrics,
      trend,
      cases,
      generatedAt: now.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

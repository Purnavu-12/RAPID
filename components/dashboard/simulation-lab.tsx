"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Zap, Database, BarChart3 } from "lucide-react";
import { SCENARIOS } from "@/lib/dev/simulator";
import type { ScenarioResult, WithVsWithoutResult } from "@/lib/dev/simulator";

function money(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN")}`;
}

type ApiResult =
  | { created: ScenarioResult[] }
  | { without: object; with: object; incremental: object; created: ScenarioResult[] }
  | { deleted: number }
  | { error: string }
  | Record<string, unknown>;

function isWithVsWithout(r: ApiResult): r is WithVsWithoutResult {
  return (
    typeof r === "object" &&
    r !== null &&
    "without" in r &&
    "with" in r &&
    "incremental" in r
  );
}
function isScenario(r: ApiResult): r is { created: ScenarioResult[] } {
  return typeof r === "object" && r !== null && "created" in r && !("without" in r);
}
function isClean(r: ApiResult): r is { deleted: number } {
  return typeof r === "object" && r !== null && "deleted" in r;
}

export function SimulationLab() {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const call = async (mode: "scenarios" | "withvswithout" | "clean", count?: number) => {
    setLoading(mode);
    setResult(null);
    setStatus(null);
    try {
      const res = await fetch("/api/dev/simulate/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, count }),
      });
      const json = (await res.json().catch(() => null)) ?? {};
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setResult(json as ApiResult);
      setStatus(
        mode === "scenarios"
          ? `Ran ${SCENARIOS.length} payment-failure scenarios through the engine.`
          : mode === "withvswithout"
          ? `WITH-vs-WITHOUT comparison complete: engine recovered ${
              (json as WithVsWithoutResult).with?.recovered ?? 0
            } of ${(json as WithVsWithoutResult).with?.cases ?? 0} cases.`
          : `Reset simulation: removed ${(json as { deleted: number }).deleted ?? 0} dev rows.`
      );
    } catch (e) {
      setStatus(`Simulation unavailable: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="mt-16">
      <header className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-foreground">
            Recovery simulation lab
          </h2>
          <p className="mt-1 text-xs font-mono text-muted-foreground">
            Dev-only · §45 Synthetic Event Simulator · §43 Incremental
            Recovery Measurement
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => call("scenarios")}
            disabled={!!loading}
            className="inline-flex items-center gap-2 text-sm font-mono text-foreground bg-foreground/[0.06] border border-foreground/10 hover:border-foreground/30 px-4 h-9 rounded-full transition-colors disabled:opacity-60"
          >
            {loading === "scenarios" ? (
              <PlayCircle className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <PlayCircle className="w-3.5 h-3.5" />
            )}
            Run scenario suite
          </button>
          <button
            type="button"
            onClick={() => call("withvswithout", 10)}
            disabled={!!loading}
            className="inline-flex items-center gap-2 text-sm font-mono text-foreground bg-foreground/[0.06] border border-foreground/10 hover:border-foreground/30 px-4 h-9 rounded-full transition-colors disabled:opacity-60"
          >
            {loading === "withvswithout" ? (
              <BarChart3 className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            Run WITH vs WITHOUT
          </button>
          <button
            type="button"
            onClick={() => call("clean")}
            disabled={!!loading}
            className="inline-flex items-center gap-2 text-sm font-mono text-foreground bg-foreground/[0.06] border border-foreground/10 hover:border-foreground/30 px-4 h-9 rounded-full transition-colors disabled:opacity-60"
          >
            {loading === "clean" ? (
              <Database className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Database className="w-3.5 h-3.5" />
            )}
            Reset simulation
          </button>
        </div>
      </header>

      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Generates real Razorpay test resources (Orders + Payment Links) across
        every payment-failure type so you can watch the engine diagnose →
        decide → act on each one. The WITH-vs-WITHOUT run makes the engine&apos;s
        incremental recovery lift measurable against a no-automation baseline.
        Records land in the audit trail below.
      </p>

      {status && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 text-xs font-mono text-muted-foreground"
        >
          {status}
        </p>
      )}

      {result && (
        <div className="mt-8">
          {isWithVsWithout(result) && <WithVsWithoutView data={result} />}
          {isScenario(result) && <ScenarioView data={result} />}
          {isClean(result) && (
            <Badge variant="outline" className="text-xs">
              Removed {result.deleted} simulation row(s). Dashboard restored to
              its live baseline.
            </Badge>
          )}
          {!isWithVsWithout(result) && !isScenario(result) && !isClean(result) && (
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

function ScenarioView({ data }: { data: { created: ScenarioResult[] } }) {
  const rows = data.created;
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No scenarios generated.</p>;
  }
  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-foreground/10 text-xs font-mono text-muted-foreground uppercase tracking-widest">
        Engine handling per failure type (§11 diagnosis → §14 decision → §13 action)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-foreground/[0.02]">
            <tr>
              <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Scenario</th>
              <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Order</th>
              <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Case</th>
              <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Root cause</th>
              <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Action</th>
              <th className="px-4 py-2 text-xs font-mono text-muted-foreground">P(success)</th>
              <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/5">
            {rows.map((r, idx) => (
              <tr key={`${r.scenario}-${r.orderId || r.caseId || idx}`} className="align-top">
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  {r.scenario}
                  {r.error && (
                    <span className="block text-red-400 mt-1">✗ {r.error}</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {r.orderId ? `…${r.orderId.slice(-10)}` : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {r.caseId ? `…${r.caseId.slice(-10)}` : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.rootCause || "—"}</td>
                <td className="px-4 py-3">
                  {r.actionClass ? (
                    <Badge variant="outline" className="text-xs">
                      {r.actionClass}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {r.probability != null ? `${Math.round(r.probability * 100)}%` : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs">
                    {r.status || "—"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WithVsWithoutView({ data }: { data: WithVsWithoutResult }) {
  const w = data.with;
  const without = data.without;
  const inc = data.incremental;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ComparisonCard
          title="Without engine"
          subtitle="No automation baseline (§43)"
          cases={without.cases}
          recovered={without.recovered}
          rate={without.recoveryRate}
          revenueMinor={0}
          variant="muted"
        />
        <ComparisonCard
          title="With engine"
          subtitle="Agentic recovery (§5 Execution Plane)"
          cases={w.cases}
          recovered={w.recovered}
          rate={w.recoveryRate}
          revenueMinor={w.revenueRecoveredMinor}
          variant="primary"
        />
        <ComparisonCard
          title="Incremental lift"
          subtitle="The engine&apos;s measurable value"
          cases={0}
          recovered={w.recovered - without.recovered}
          rate={inc.recoveryRateLift}
          revenueMinor={inc.revenueRecoveredMinor}
          variant="accent"
          isLift
        />
      </div>

      <div className="border border-foreground/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-foreground/10 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          Simulated cases ({data.created.length}) — surfaced in the audit trail
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-foreground/[0.02]">
              <tr>
                <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Scenario</th>
                <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Cohort</th>
                <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Case</th>
                <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Action</th>
                <th className="px-4 py-2 text-xs font-mono text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {data.created.map((r, i) => {
                const cohort =
                  i < data.without.cases ? "without engine" : "with engine";
                return (
                  <tr
                    key={`${r.scenario}-${r.orderId || r.caseId || i}-${cohort}`}
                    className="align-top"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {r.scenario}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {cohort}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.caseId ? `…${r.caseId.slice(-10)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.actionClass || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {r.status || "—"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ComparisonCard({
  title,
  subtitle,
  cases,
  recovered,
  rate,
  revenueMinor,
  variant,
  isLift = false,
}: {
  title: string;
  subtitle: string;
  cases: number;
  recovered: number;
  rate: number;
  revenueMinor: number;
  variant: "muted" | "primary" | "accent";
  isLift?: boolean;
}) {
  const border = {
    muted: "border-foreground/10",
    primary: "border-emerald-500/20",
    accent: "border-blue-500/20",
  }[variant];
  const accent = {
    muted: "text-muted-foreground",
    primary: "text-emerald-400",
    accent: "text-blue-400",
  }[variant];
  return (
    <div
      className={`border ${border} rounded-lg p-5 bg-foreground/[0.02] space-y-3`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {title}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
        <Badge variant="outline" className="text-xs">
          {cases} cases
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div>
          <div className={`text-2xl font-display ${accent}`}>
            {isLift ? `+${recovered}` : recovered}
          </div>
          <div className="text-xs font-mono text-muted-foreground">recovered</div>
        </div>
        <div>
          <div className={`text-2xl font-display ${accent}`}>{rate}%</div>
          <div className="text-xs font-mono text-muted-foreground">recovery rate</div>
        </div>
      </div>
      {revenueMinor > 0 && (
        <div className="text-sm font-mono text-foreground">
          {money(revenueMinor)} recovered
        </div>
      )}
    </div>
  );
}

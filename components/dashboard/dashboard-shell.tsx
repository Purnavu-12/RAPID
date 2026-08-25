"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardMetrics } from "@/components/dashboard/metrics-grid";
import { RecoveryChart } from "@/components/dashboard/recovery-chart";
import { CasesTable } from "@/components/dashboard/cases-table";
import { SimulationLab } from "@/components/dashboard/simulation-lab";
import { ArrowLeft, RefreshCw, Clock, PlayCircle, Zap } from "lucide-react";
import Link from "next/link";
import type { RecoveryPayload } from "@/lib/dashboard";
import type { ExecutedAction } from "@/lib/actions/executor";

export function DashboardShell() {
  const [data, setData] = useState<RecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulateStatus, setSimulateStatus] = useState<string | null>(null);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [executeStatus, setExecuteStatus] = useState<string | null>(null);
  const [executeLoading, setExecuteLoading] = useState(false);

  // The simulation harness is bound to the Acme Retail demo tenant and is only
  // exposed in development (docs/RAPID.md §47 integration test surface).
  const isDev = process.env.NODE_ENV !== "production";

  // A recovery case is "in flight" when its §24 state machine sits in an
  // open, non-terminal state.
  const openCaseExists = !!(data &&
    data.cases.some(
      (c) =>
        c.status === "SCHEDULED" ||
        c.status === "OUTCOME_PENDING" ||
        c.status === "ESCALATED"
    ));

  const simulateStage: "failed" | "recovered" = openCaseExists
    ? "recovered"
    : "failed";
  const simulateLabel = openCaseExists ? "Confirm recovery (test)" : "Record failed payment (test)";

  // Promise-chain form (not async/await) so the effect's state updates live
  // in deferred callbacks — this satisfies the react-hooks/set-state-in-effect
  // lint rule while staying idiomatic.
  const fetchData = useCallback(() => {
    fetch(`/api/recovery?t=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json as RecoveryPayload);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Gentle polling so live ledger writes (Phase 6 webhook ingestion) surface
  // without a manual click — progress should be observable, not latent.
  useEffect(() => {
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const simulate = () => {
    setSimulateLoading(true);
    fetch("/api/dev/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: simulateStage }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return json;
      })
      .then((json) => {
        const short = json?.caseId?.slice(0, 8);
        setSimulateStatus(
          simulateStage === "failed"
            ? `Created real test order ${
                json?.orderId ? `…${json.orderId.slice(-8)}` : ""
              } — new at-risk case ${short ? `…${short}` : ""}.`
            : `Confirmed recovery via payment link ${
                json?.paymentLinkId ? `…${json.paymentLinkId.slice(-8)}` : ""
              } — case ${short ? `…${short}` : ""} RECOVERED.`
        );
        fetchData();
      })
      .catch((e: unknown) => {
        setSimulateStatus(
          `Simulation unavailable: ${e instanceof Error ? e.message : String(e)}`
        );
      })
      .finally(() => setSimulateLoading(false));
  };

  const executeNow = () => {
    setExecuteLoading(true);
    fetch("/api/cron/execute-actions?due=true", { method: "POST" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return json;
      })
      .then((json: { count: number; executed?: ExecutedAction[] }) => {
        const links = (json.executed || []).map((a) => a.short_url);
        setExecuteStatus(
          json.count === 0
            ? "No due actions to execute."
            : `Executed ${json.count} action(s). Real payment link(s) created: ${links.join(" ")}`
        );
        fetchData();
      })
      .catch((e: unknown) => {
        setExecuteStatus(
          `Execution failed: ${e instanceof Error ? e.message : String(e)}`
        );
      })
      .finally(() => setExecuteLoading(false));
  };

  const refreshLabel = loading ? "Refreshing…" : "Refresh";

  return (
    <div className="min-h-screen bg-background text-foreground noise-overlay">
      {/* Top bar */}
      <header className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to site
          </Link>
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>Live demo</span>
            {data?.generatedAt && (
              <>
                <span className="w-px h-4 bg-foreground/20" />
                <Clock className="w-3 h-3" />
                <span>
                  updated{" "}
                  {new Date(data.generatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 lg:py-16">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-12">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Merchant: Acme Retail
            </span>
            <h1 className="font-display text-5xl lg:text-6xl tracking-tight text-foreground">
              Recovery
              <br />
              <span className="text-muted-foreground">dashboard.</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm font-mono text-foreground border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.03] px-4 h-10 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            {refreshLabel}
          </button>
          {isDev && (
            <button
              type="button"
              onClick={simulate}
              disabled={simulateLoading}
              className="inline-flex items-center gap-2 text-sm font-mono text-foreground bg-foreground/[0.06] border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.10] px-4 h-10 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {simulateLoading ? (
                <PlayCircle className="w-3.5 h-3.5 animate-pulse" />
              ) : (
                <PlayCircle className="w-3.5 h-3.5" />
              )}
              {simulateLoading ? "Running…" : simulateLabel}
            </button>
          )}
          {isDev && (
            <button
              type="button"
              onClick={executeNow}
              disabled={executeLoading}
              className="inline-flex items-center gap-2 text-sm font-mono text-foreground bg-foreground/[0.06] border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.10] px-4 h-10 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {executeLoading ? (
                <Zap className="w-3.5 h-3.5 animate-pulse" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              {executeLoading ? "Executing…" : "Execute now (dev)"}
            </button>
          )}
        </div>

        {executeStatus && (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 text-xs font-mono text-muted-foreground"
          >
            {executeStatus}
          </p>
        )}

        {simulateStatus && (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 text-xs font-mono text-muted-foreground"
          >
            {simulateStatus}
          </p>
        )}

        {error && (
          <div className="mb-8 p-4 border border-red-500/20 text-red-500 rounded-lg text-sm font-mono">
            Failed to load dashboard data: {error}
          </div>
        )}

        {/* Metrics */}
        <section className="mb-16">
          <DashboardMetrics metrics={data ? data.metrics : null} />
        </section>

        {/* Trend chart */}
        <section className="mb-16">
          <RecoveryChart trend={data ? data.trend : null} />
        </section>

        {/* Audit trail */}
        <section>
          <CasesTable cases={data ? data.cases : null} />
        </section>

        {/* §45 + §43 Simulation Lab (dev-only). Surfaces the engine handling
            every failure type + a with-vs-without recovery lift measurement. */}
        {isDev && (
          <section>
            <SimulationLab />
          </section>
        )}
      </main>
    </div>
  );
}

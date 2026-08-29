"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardMetrics } from "@/components/dashboard/metrics-grid";
import { RecoveryChart } from "@/components/dashboard/recovery-chart";
import { CasesTable } from "@/components/dashboard/cases-table";
import { EscalationsTable } from "@/components/dashboard/escalations-table";
import { ProofTab } from "@/components/dashboard/proof-tab";
import { SimulationLab } from "@/components/dashboard/simulation-lab";
import { RefreshCw, Clock } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import type { RecoveryPayload } from "@/lib/dashboard";

export function DashboardShell() {
  const [data, setData] = useState<RecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The simulation harness is bound to the Acme Retail demo tenant and is only
  // exposed in development (docs/RAPID.md §47 integration test surface).
  const isDev = process.env.NODE_ENV !== "production";

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

  const refreshLabel = loading ? "Refreshing…" : "Refresh";

  return (
    <div className="min-h-screen bg-background text-foreground noise-overlay">
      <SiteHeader />

      {/* Dashboard-specific header bar */}
      <header className="relative z-10 border-b border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to site
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Guided demo
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

      <main className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-24 lg:pt-28 pb-12 lg:pb-16">
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
            <p className="mt-4 text-sm text-muted-foreground font-mono max-w-2xl">
              Live recovery pipeline for Acme Retail (test). Detects failed
              payments, diagnoses root causes, and auto-recovers at-risk
              revenue. Data updates every 10 s.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm font-mono text-foreground border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/3 px-4 h-10 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            {refreshLabel}
          </button>
        </div>

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

        {/* §40 Escalation queue — dev-only surface for human-in-the-loop approval */}
        {isDev && (
          <section>
            <EscalationsTable />
          </section>
        )}

        {/* §43 / §6 Batch Proof Runner — proves recovery lift with a report card */}
        {isDev && (
          <section>
            <ProofTab />
          </section>
        )}

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

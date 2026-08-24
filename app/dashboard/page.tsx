import { DashboardMetrics } from "@/components/dashboard/metrics-grid";
import { RecoveryChart } from "@/components/dashboard/recovery-chart";
import { CasesTable } from "@/components/dashboard/cases-table";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Recovery Dashboard — RAPID",
  description:
    "Live recovery dashboard: detect at-risk revenue, watch recoveries, and track the full audit trail.",
};

export default function DashboardPage() {
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
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
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
            className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-foreground border border-foreground/10 hover:border-foreground/30 px-4 h-10 rounded-full transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Metrics */}
        <section className="mb-16">
          <DashboardMetrics />
        </section>

        {/* Trend chart */}
        <section className="mb-16">
          <RecoveryChart />
        </section>

        {/* Audit trail */}
        <section>
          <CasesTable />
        </section>
      </main>
    </div>
  );
}

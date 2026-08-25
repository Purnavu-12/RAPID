"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Play, Clock, TrendingUp, Package, AlertCircle, Copy } from "lucide-react";
import { formatAmount } from "@/components/dashboard/cases-table";
import type { ProofReport } from "@/lib/dev/simulator";

function formatMinor(minor: number) {
  return formatAmount(minor, "INR");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProofTab() {
  const [report, setReport] = useState<ProofReport | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ runId: string; createdAt: string; report: ProofReport }>
  >([]);
  const [showHistory, setShowHistory] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/proof", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.report) {
        setReport(json.report);
        setRunId(json.runId);
      } else {
        setReport(null);
        setRunId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/dev/proof?history=true", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setHistory(json.runs ?? []);
    } catch (e) {
      console.error("[proof] history error:", e);
    }
  };

  const runProof = async () => {
    setRunLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 20, payRate: 0.84 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setReport(json.report);
      setRunId(json.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunLoading(false);
    }
  };

  const exportMarkdown = () => {
    if (!report) return;
    const lines = [
      "# RAPID Batch Proof Report",
      "",
      `Run ID: ${runId ?? "N/A"}  `,
      `Generated: ${report.createdAt}  `,
      "",
      "## Summary",
      "",
      `| Metric | Value |`,
      `|---|---|`,
      `| Batch size | ${report.batchSize} |`,
      `| Revenue recovered | ${formatMinor(report.revenueRecoveredMinor)} |`,
      `| Revenue at risk | ${formatMinor(report.revenueAtRiskMinor)} |`,
      `| Recovery rate | ${report.recoveryRate}% |`,
      `| Baseline recovery rate | ${report.baselineRecoveryRate}% |`,
      `| Incremental lift | +${report.incrementalRecoveryRateLift}% |`,
      `| Escalations | ${report.escalations} |`,
      `| Exhausted | ${report.exhausted} |`,
      `| Duplicate actions | ${report.duplicateActions} |`,
      `| Median time-to-recovery | ${report.medianTtrSec != null ? `${report.medianTtrSec}s` : "—"} |`,
      "",
      "## Cases",
      "",
      `| Scenario | Root cause | Action | Recovered |`,
      `|---|---|---|---|`,
      ...report.cases.map((c) =>
        `| ${c.scenario} | ${c.rootCause ?? "—"} | ${c.actionClass ?? "—"} | ${c.status === "RECOVERED" ? "✓" : "—"} |`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapid-proof-${runId?.slice(0, 8) ?? Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async () => {
    if (!report) return;
    const payload = { runId, report };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    // Defer the fetch to avoid calling setState synchronously within an effect.
    setTimeout(() => void fetchReport(), 0);
  }, []);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <section className="mb-16">
      <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          Batch Proof Runner (§43 / §6)
        </span>
        {isDev && (
          <Button
            size="sm"
            variant="outline"
            onClick={runProof}
            disabled={runLoading}
            className="text-xs font-mono"
          >
            {runLoading ? (
              <Play className="w-3 h-3 mr-1 animate-pulse" />
            ) : (
              <Play className="w-3 h-3 mr-1" />
            )}
            {runLoading ? "Running…" : "Run Proof"}
          </Button>
        )}
      </div>

      {error && (
        <p className="px-6 py-2 text-sm text-red-500">Failed: {error}</p>
      )}

      {loading && !report && (
        <div className="p-6 space-y-3">
          <div className="h-24 bg-foreground/5 rounded animate-pulse" />
          <div className="h-64 bg-foreground/5 rounded animate-pulse" />
        </div>
      )}

      {!loading && !report && !error && (
        <div className="p-12 text-center text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            No proof run yet. Run a batch to see the report card.
          </p>
        </div>
      )}

      {!loading && report && (
        <>
          {/* Report card */}
          <div className="p-6 space-y-6">
            {/* Honesty badge */}
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
              <AlertCircle className="w-3 h-3 text-amber-500" />
              <span>
                Modeled pay rate ~84% — customer recovery is simulated
                (§43). Real outcomes come from live Razorpay webhooks.
              </span>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold">
                    {report.recoveryRate}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recovery rate
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-emerald-500">
                    +{report.incrementalRecoveryRateLift}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Incremental lift vs no-automation
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold">
                    {formatMinor(report.revenueRecoveredMinor)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Revenue recovered
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold">
                    {report.medianTtrSec ?? "—"}
                    {report.medianTtrSec != null && (
                      <span className="text-sm text-muted-foreground">
                        s
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Median time-to-recovery
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Assertions */}
            <div className="flex items-center gap-6 text-xs font-mono">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                <span>
                  Escalations: <strong>{report.escalations}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-amber-500" />
                <span>
                  Exhausted: <strong>{report.exhausted}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    report.duplicateActions === 0
                      ? "text-emerald-500"
                      : "text-red-500"
                  }
                >
                  duplicate_actions = {report.duplicateActions} ✓
                </span>
              </div>
            </div>

            {/* Case table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-foreground/2">
                  <tr>
                    <th className="px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      Scenario
                    </th>
                    <th className="px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      Root cause
                    </th>
                    <th className="px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      Action
                    </th>
                    <th className="px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      Status
                    </th>
                    <th className="px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      Conf.
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {report.cases.map((c) => (
                    <tr key={c.caseId}>
                      <td className="px-4 py-3 font-mono text-xs">
                        {c.scenario}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.rootCause ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {c.actionClass ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            c.status === "RECOVERED"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-slate-500/10 text-slate-400"
                          }
                        >
                          {c.status ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.probability != null
                          ? `${Math.round(c.probability * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-foreground/10">
              <Button
                size="sm"
                variant="outline"
                onClick={exportMarkdown}
                className="text-xs font-mono"
              >
                <Download className="w-3 h-3 mr-1" />
                Export Markdown
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={copyJson}
                className="text-xs font-mono"
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy JSON
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowHistory(true)}
                className="text-xs font-mono"
              >
                <Clock className="w-3 h-3 mr-1" />
                History
              </Button>
            </div>
          </div>
        </>
      )}

      {/* History modal */}
      {showHistory && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="bg-background border border-foreground/10 rounded-lg p-6 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">
              Proof Run History
            </h3>
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No previous runs.
              </p>
            )}
            {history.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-xs font-mono text-muted-foreground uppercase">
                      Run
                    </th>
                    <th className="px-3 py-2 text-xs font-mono text-muted-foreground uppercase">
                      Created
                    </th>
                    <th className="px-3 py-2 text-xs font-mono text-muted-foreground uppercase">
                      Recovery
                    </th>
                    <th className="px-3 py-2 text-xs font-mono text-muted-foreground uppercase">
                      Cases
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {history.map((r) => (
                    <tr key={r.runId}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.runId.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {r.report.recoveryRate}%
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.report.batchSize}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowHistory(false)}
              className="mt-4 text-xs font-mono"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

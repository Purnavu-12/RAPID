"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { formatAmount } from "@/components/dashboard/cases-table";

interface EscalatedCase {
  caseId: string;
  customer: string;
  riskType: string;
  rootCause: string;
  amount: number;
  currency: string;
  confidence: number | null;
  proposedAction: string | null;
  recoverability: number | null;
  attempts: Array<{
    attempt_no: number;
    action_class: string;
  }>;
  createdAt: string;
}

const actionMeta: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  CREATE_PAYMENT_LINK: {
    label: "Payment link",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  RETRY_LATER: {
    label: "Retry later",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: <Clock className="w-3 h-3" />,
  },
  ESCALATE_HUMAN: {
    label: "Escalate",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  SEND_PAYMENT_REMINDER: {
    label: "Payment reminder",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    icon: <Clock className="w-3 h-3" />,
  },
};

export function EscalationsTable() {
  const [cases, setCases] = useState<EscalatedCase[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchEscalated = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recovery/escalated", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCases(json.cases ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Defer the fetch to avoid calling setState synchronously within an effect.
    setTimeout(() => void fetchEscalated(), 0);
  }, []);

  // §47: dev-only auto-refresh so approving a case surfaces in the queue.
  useEffect(() => {
    const id = setInterval(fetchEscalated, 10_000);
    return () => clearInterval(id);
  }, []);

  const handleApprove = async (caseId: string, actionClass?: string) => {
    setActionLoading(caseId);
    setActionStatus(null);
    try {
      const res = await fetch(`/api/recovery/cases/${caseId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(actionClass ? { actionClass } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setActionStatus(
        `Approved case ${caseId.slice(0, 8)} → ${json.actionClass ?? "recommended action"} (attempt ${json.attemptNo}).`
      );
      await fetchEscalated();
    } catch (e) {
      setActionStatus(
        `Approve failed: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (caseId: string, reason: string) => {
    setActionLoading(caseId);
    setActionStatus(null);
    try {
      const res = await fetch(`/api/recovery/cases/${caseId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setActionStatus(`Rejected case ${caseId.slice(0, 8)} as CANCELLED.`);
      await fetchEscalated();
    } catch (e) {
      setActionStatus(
        `Reject failed: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setActionLoading(null);
    }
  };

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <section className="mb-16">
      <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          Escalation queue (§40)
        </span>
        {isDev && cases && cases.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={fetchEscalated}
            disabled={loading}
            className="text-xs font-mono"
          >
            Refresh
          </Button>
        )}
      </div>

      {actionStatus && (
        <p
          role="status"
          aria-live="polite"
          className="px-6 py-2 text-xs font-mono text-muted-foreground"
        >
          {actionStatus}
        </p>
      )}

      {loading && (
        <div className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-foreground/5 rounded animate-pulse"
            />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="p-6">
          <p className="text-sm text-red-500">Failed: {error}</p>
        </div>
      )}

      {!loading && cases && cases.length === 0 && (
        <div className="p-12 text-center text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No cases awaiting human approval.</p>
        </div>
      )}

      {!loading && cases && cases.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-foreground/2">
              <tr>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Case
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Customer
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Root cause
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Amount
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Confidence
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Recommended
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Attempts
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {cases.map((c) => (
                <tr key={c.caseId} className="group">
                  <td className="px-6 py-4 font-mono text-xs">
                    <span className="text-foreground/70 group-hover:text-foreground transition-colors">
                      {c.caseId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-6 py-4">{c.customer || "—"}</td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">
                    {c.rootCause}
                  </td>
                  <td className="px-6 py-4">
                    {formatAmount(c.amount, c.currency)}
                  </td>
                  <td className="px-6 py-4">
                    {c.confidence != null
                      ? `${Math.round(c.confidence * 100)}%`
                      : "—"}
                  </td>
                  <td className="px-6 py-4">
                    {c.proposedAction ? (
                      <Badge
                        variant="outline"
                        className={
                          (actionMeta[c.proposedAction]?.color ??
                            "bg-slate-500/10 text-slate-400") + " gap-1 pl-1.5"
                        }
                      >
                        {actionMeta[c.proposedAction]?.icon}
                        {actionMeta[c.proposedAction]?.label ??
                          c.proposedAction}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                    {c.attempts.length}
                  </td>
                  <td className="px-6 py-4">
                    {actionLoading === c.caseId ? (
                      <span className="text-xs font-mono text-muted-foreground">
                        Processing…
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleApprove(c.caseId, c.proposedAction ?? undefined)
                          }
                          className="text-xs font-mono h-7 px-2"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleReject(c.caseId, "Declined by human reviewer")
                          }
                          className="text-xs font-mono h-7 px-2 text-red-500 hover:text-red-400"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

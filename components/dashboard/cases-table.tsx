"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Clock, PlayCircle, AlertCircle, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CaseChainViewer } from "@/components/dashboard/case-chain-viewer";
import type { RecoveryCase } from "@/lib/dashboard";

const statusMeta: Record<string, { label: string; color: string }> = {
  RECOVERED: {
    label: "Recovered",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  SCHEDULED: {
    label: "Scheduled",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  ESCALATED: {
    label: "Escalated",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  EXHAUSTED: {
    label: "Exhausted",
    color: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  },
  OUTCOME_PENDING: {
    label: "Pending",
    color: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  },
};

/** §13 engine actions surfaced on each audit row (RecoveryCase.actionClass). */
const actionMeta: Record<string, { label: string; color: string; icon: ReactNode }> = {
  CREATE_PAYMENT_LINK: {
    label: "Payment link",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: <PlayCircle className="w-3 h-3" />,
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
};

export function formatAmount(minor: number, currency: string, symbol = "₹") {
  const major = minor / 100;
  if (currency === "INR") {
    return `${symbol}${major.toLocaleString("en-IN")}`;
  }
  return `${major.toFixed(2)}`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function CasesTable({ cases }: { cases: RecoveryCase[] | null }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`border border-foreground/10 overflow-hidden transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
    >
      <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          Open & recent recovery cases
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          {cases ? `${cases.length} cases` : "— cases"}
        </span>
      </div>

      <div className="overflow-x-auto">
        {cases === null ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 bg-foreground/5 rounded animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-foreground/2">
              <tr>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Case
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Risk
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Root cause
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Amount
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Action
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Status
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest text-right">
                  Recovered
                </th>
                <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Audit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {cases.map((c, i) => {
                const meta = statusMeta[c.status] ?? statusMeta.OUTCOME_PENDING;
                const inViewDelay = visible ? `${i * 60}ms` : undefined;
                return (
                  <tr
                    key={c.id}
                    className="group transition-colors"
                    style={{ transitionDelay: inViewDelay }}
                  >
                    <td className="px-6 py-4 font-mono text-xs">
                      <div className="flex items-center gap-2 text-foreground/70 group-hover:text-foreground transition-colors">
                        <span>{c.id}</span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </td>
                    <td className="px-6 py-4">{c.riskType}</td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">
                      {c.reason}
                    </td>
                    <td className="px-6 py-4">
                      {formatAmount(c.amount, c.currency)}
                    </td>
                    <td className="px-6 py-4">
                      {c.actionClass ? (
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              (actionMeta[c.actionClass]?.color ??
                                "bg-slate-500/10 text-slate-400 border-slate-500/20") +
                              " gap-1 pl-1.5"
                            }
                            variant="outline"
                          >
                            {actionMeta[c.actionClass]?.icon}
                            {actionMeta[c.actionClass]?.label ?? c.actionClass}
                          </Badge>
                          {c.confidence != null && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {Math.round(c.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={meta.color} variant="outline">
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      {c.recovered > 0
                        ? formatAmount(c.recovered, c.currency)
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <CaseChainViewer caseId={c.id}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                          title="View audit trail"
                        >
                          <Link2 className="w-3 h-3" />
                          Chain
                        </button>
                      </CaseChainViewer>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-6 py-4 border-t border-foreground/10 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        {cases && cases[0]?.createdAt ? (
          <span>Last updated {timeAgo(cases[0].createdAt)}</span>
        ) : (
          <span>—</span>
        )}
      </div>
    </div>
  );
}

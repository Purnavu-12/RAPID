"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Clock, Hash, User, Activity, Link2 } from "lucide-react";

interface AuditEvent {
  audit_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  occurred_at: string;
  data: Record<string, unknown>;
  prev_hash: string | null;
  hash: string;
}

interface ChainViewProps {
  caseId: string;
  children: React.ReactNode;
}

const eventTypeLabels: Record<string, string> = {
  RISK_DETECTED: "Risk Detected",
  DIAGNOSED: "Diagnosed",
  DECIDED: "Decided",
  ESCALATED: "Escalated",
  ACTION_SCHEDULED: "Action Scheduled",
  ACTION_EXECUTED: "Action Executed",
  OUTCOME_RECORDED: "Outcome Recorded",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXHAUSTED: "Exhausted",
};

const actorTypeColors: Record<string, string> = {
  webhook_receiver: "bg-slate-500/10 text-slate-400",
  diagnosis_engine: "bg-purple-500/10 text-purple-400",
  policy_engine: "bg-blue-500/10 text-blue-400",
  action_executor: "bg-emerald-500/10 text-emerald-400",
  outcome_verifier: "bg-amber-500/10 text-amber-400",
  human: "bg-rose-500/10 text-rose-400",
  scheduler: "bg-cyan-500/10 text-cyan-400",
};

export function CaseChainViewer({ caseId, children }: ChainViewProps) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChain = useCallback(async () => {
    if (!open || events) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/recovery/cases/${caseId}/chain`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEvents(json.auditEvents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [caseId, open, events]);

  useEffect(() => {
    if (open && !events) {
      setTimeout(() => void fetchChain(), 0);
    }
  }, [open, events, fetchChain]);

  const formatHash = (h: string | null) =>
    h ? `${h.slice(0, 8)}…${h.slice(-8)}` : "GENESIS";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Audit Trail — Case {caseId.slice(0, 8)}</SheetTitle>
          <SheetDescription>
            Append-only chain (§27). Each event is SHA-256 hashed and linked
            to the previous record for tamper evidence.
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="space-y-3 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 bg-foreground/5 rounded animate-pulse"
              />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 mt-4">Failed: {error}</p>
        )}

        {events && events.length > 0 && (
          <div className="space-y-4 py-4">
            {events.map((evt, i) => (
              <div key={evt.audit_id} className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="font-mono text-xs"
                      >
                        {eventTypeLabels[evt.event_type] ?? evt.event_type}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          actorTypeColors[evt.actor_type] ??
                          "bg-slate-500/10 text-slate-400"
                        }
                      >
                        {evt.actor_type}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatDate(evt.occurred_at)}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-muted-foreground font-mono">
                      <div className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        <span>hash: {formatHash(evt.hash)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        <span>prev: {formatHash(evt.prev_hash)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>actor: {evt.actor_id}</span>
                      </div>
                    </div>

                    {evt.data && Object.keys(evt.data).length > 0 && (
                      <pre className="mt-2 text-xs bg-foreground/3 rounded p-2 overflow-x-auto">
                        {JSON.stringify(evt.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
                {i < events.length - 1 && (
                  <div className="border-l border-foreground/10 h-6 ml-4" />
                )}
              </div>
            ))}
          </div>
        )}

        {events && events.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No audit events recorded for this case.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

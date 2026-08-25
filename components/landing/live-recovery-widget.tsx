"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Activity } from "lucide-react";
import type { RecoveryPayload } from "@/lib/dashboard";

/** Convert a /api/recovery minor-unit value (e.g. 11.902) into whole rupees (11902). */
function toRupees(maybe: number | undefined): number {
  return Math.round((maybe ?? 0) * 1000);
}

/**
 * Live recovery metrics widget — the bridge between the marketing site and the
 * live recovery system. Polls GET /api/recovery (the same §26 projections the
 * dashboard uses) and renders the real Acme Retail demo numbers, refreshing
 * every 10s. Clicking the button opens /dashboard (the full audit trail).
 *
 * Numbers update in place on every poll (plain render, not a once-only
 * animation) so the live state is genuinely observable — every feature should
 * improve understanding, progress, or trust.
 */
export function LiveRecoveryWidget() {
  const [data, setData] = useState<RecoveryPayload | null>(null);
  const [error, setError] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        const res = await fetch(`/api/recovery?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`recovery ${res.status}`);
        const json: RecoveryPayload = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
          setSecondsAgo(0);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    tick();
    timer = setInterval(() => {
      tick();
      setSecondsAgo((s) => s + 10);
    }, 10_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const m = data?.metrics;
  const rate = Math.round(m?.recoveryRate ?? 0);
  const recovered = toRupees(m?.recovered);
  const atRisk = toRupees(m?.atRisk);

  return (
    <section className="py-16 lg:py-20 border-t border-foreground/10">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground mb-6">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-pulse inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          Live recovery metrics — Acme Retail (test)
        </div>

        {!data ? (
          <p className="text-sm text-muted-foreground font-mono">
            Loading live recovery data…
          </p>
        ) : (
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <div className="text-4xl lg:text-5xl font-display tracking-tight">
                {rate}%
                <span className="text-foreground/40 text-2xl lg:text-3xl">
                  {" "}
                  recovery rate
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                ₹{recovered.toLocaleString("en-IN")} recovered · ₹
                {atRisk.toLocaleString("en-IN")} at risk
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 sm:gap-8 text-center sm:text-left">
              <div>
                <div className="text-2xl font-display">
                  ₹{recovered.toLocaleString("en-IN")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">
                  Recovered
                </p>
              </div>
              <div>
                <div className="text-2xl font-display">
                  ₹{atRisk.toLocaleString("en-IN")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">
                  At risk
                </p>
              </div>
            </div>

            <Button
              asChild
              className="bg-foreground hover:bg-foreground/90 text-background rounded-full group h-12 shrink-0"
            >
              <Link href="/dashboard">
                Open live dashboard
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        )}

        <p className="mt-5 text-xs text-muted-foreground font-mono">
          {error && !data
            ? "Live feed paused — open the dashboard for full detail."
            : `Updated every 10s · ~${secondsAgo}s ago${
                data?.generatedAt
                  ? " · " +
                    new Date(data.generatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""
              }`}
        </p>
      </div>
    </section>
  );
}

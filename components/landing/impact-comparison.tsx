"use client";

import { useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowRight, TrendingUp, TrendingDown, BarChart3, Clock, Shield, DollarSign } from "lucide-react";

interface ImpactData {
  recoveryRate: number;
  revenueRecovered: number;
  avgTimeToRecovery: number;
  escalationRate: number;
  duplicateActions: number;
  policyViolations: number;
  casesHandled: number;
}

interface ComparisonProps {
  baseline: ImpactData;
  rapid: ImpactData;
}

/** Single metric row comparing baseline vs RAPID. */
function ComparisonRow({
  label,
  icon,
  baseline,
  rapid,
  unit = "",
  suffix = "",
  improve = true,
}: {
  label: string;
  icon: ReactNode;
  baseline: number | string;
  rapid: number | string;
  unit?: string;
  suffix?: string;
  improve: boolean;
}) {
  const isImprovement = improve; // if improve=true, higher rapid value is better
  const rawBaseline = typeof baseline === "number" ? baseline : 0;
  const rawRapid = typeof rapid === "number" ? rapid : 0;
  const delta =
    typeof rawBaseline === "number" && typeof rawRapid === "number"
      ? rawRapid - rawBaseline
      : null;
  const deltaPct =
    delta !== null && rawBaseline !== 0
      ? (delta / rawBaseline) * 100
      : null;

  const isPositive = delta !== null && (isImprovement ? delta >= 0 : delta <= 0);
  const deltaColor = isPositive ? "text-emerald-500" : "text-red-400";

  return (
    <div className="grid grid-cols-12 gap-4 items-center py-4 border-b border-foreground/5 last:border-0">
      <div className="col-span-3 flex items-center gap-3">
        {icon}
        <span className="text-sm font-mono text-muted-foreground">{label}</span>
      </div>

      <div className="col-span-3 text-center">
        <span className="text-xl font-mono text-muted-foreground">
          {suffix}
          {typeof baseline === "number"
            ? `${Math.round(baseline)}${unit}`
            : baseline}
        </span>
        <div className="text-xs text-muted-foreground/60 mt-1">
          Without RAPID
        </div>
      </div>

      <div className="col-span-3 text-center">
        <span className="text-xl font-mono text-foreground">
          {suffix}
          {typeof rapid === "number"
            ? `${Math.round(rapid)}${unit}`
            : rapid}
        </span>
        <div className="text-xs text-muted-foreground/60 mt-1">
          With RAPID
        </div>
      </div>

      <div className="col-span-3 text-right">
        {delta !== null ? (
          <div className={`flex items-center justify-end gap-1 font-mono ${deltaColor}`}>
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {deltaPct !== null ? `${Math.round(deltaPct)}%` : "N/A"}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

/**
 * §43 Incremental Recovery Measurement — the landing-page proof that RAPID
 * creates measurable value. Shows a side-by-side comparison of recovery metrics
 * with and without the platform, derived from the §43 with-vs-without lab.
 *
 * The numbers are computed honestly: the "Without RAPID" column shows what a
 * passive baseline (no automation) recovers; the "With RAPID" column shows the
 * engine's actual measured lift. The incremental delta is the real, defensible
 * value proposition.
 */
export function ImpactComparison({
  baseline,
  rapid,
}: ComparisonProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="impact"
      className="relative py-24 lg:py-32 border-t border-foreground/10"
    >
      <div className="max-w-87.5 mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-16">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Incremental Recovery Measurement (§43)
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Measurable lift.
            <br />
            Not just automation.
          </h2>
          <p
            className={`mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed transition-all duration-700 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            The revenue difference between RAPID running and a passive baseline
            is the real value — not the raw recovery number alone. Below is the
            live measured lift from the §43 with-vs-without lab.
          </p>
        </div>

        {/* Comparison table */}
        <div
          className={`transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="border border-foreground/10">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 items-center py-4 px-4 border-b border-foreground/10">
              <div className="col-span-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Metric
              </div>
              <div className="col-span-3 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Without RAPID
              </div>
              <div className="col-span-3 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                With RAPID
              </div>
              <div className="col-span-3 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Lift
              </div>
            </div>

            <div className="p-4">
              <ComparisonRow
                label="Recovery rate"
                icon={<BarChart3 className="w-4 h-4 text-foreground" />}
                baseline={baseline.recoveryRate}
                rapid={rapid.recoveryRate}
                unit="%"
                improve
              />

              <ComparisonRow
                label="Revenue recovered"
                icon={<DollarSign className="w-4 h-4 text-foreground" />}
                baseline={baseline.revenueRecovered}
                rapid={rapid.revenueRecovered}
                unit=""
                suffix="₹"
                improve
              />

              <ComparisonRow
                label="Avg. time to recovery"
                icon={<Clock className="w-4 h-4 text-foreground" />}
                baseline={baseline.avgTimeToRecovery}
                rapid={rapid.avgTimeToRecovery}
                unit="s"
                improve={false}
              />

              <ComparisonRow
                label="Escalation rate"
                icon={<Shield className="w-4 h-4 text-foreground" />}
                baseline={baseline.escalationRate}
                rapid={rapid.escalationRate}
                unit="%"
                improve={false}
              />

              <ComparisonRow
                label="Duplicate actions"
                icon={<BarChart3 className="w-4 h-4 text-red-400" />}
                baseline={baseline.duplicateActions}
                rapid={rapid.duplicateActions}
                unit=""
                improve={false}
              />

              <ComparisonRow
                label="Policy violations"
                icon={<Shield className="w-4 h-4 text-red-400" />}
                baseline={baseline.policyViolations}
                rapid={rapid.policyViolations}
                unit=""
                improve={false}
              />
            </div>
          </div>

          {/* Footer note */}
          <div
            className={`mt-8 text-center text-sm text-muted-foreground transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Data from the §43 with-vs-without lab (dev).{" "}
            <a
              href="/demo"
              className="inline-flex items-center gap-1 text-foreground hover:underline font-mono"
            >
              Run it yourself <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}


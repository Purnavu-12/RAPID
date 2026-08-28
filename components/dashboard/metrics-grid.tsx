"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp, Clock, IndianRupee, BarChart3 } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import type { RecoveryMetrics } from "@/lib/dashboard";

interface MetricConfig {
  id: keyof RecoveryMetrics;
  label: string;
  suffix?: string;
  prefix?: string;
  formatter?: (n: number) => string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bg: string;
  border: string;
  sub: string;
}

const config: MetricConfig[] = [
  {
    id: "recoveryRate",
    label: "Recovery rate",
    suffix: "%",
    icon: TrendingUp,
    iconColor: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    sub: "of at-risk revenue recovered",
  },
  {
    id: "recovered",
    label: "Revenue recovered",
    formatter: (n) => `₹${n.toLocaleString()}K`,
    icon: IndianRupee,
    iconColor: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    sub: "this month",
  },
  {
    id: "atRisk",
    label: "Revenue at risk",
    formatter: (n) => `₹${n.toLocaleString()}K`,
    icon: BarChart3,
    iconColor: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    sub: "across open cases",
  },
  {
    id: "latency",
    label: "Avg. time to recovery",
    suffix: "s",
    icon: Clock,
    iconColor: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    sub: "from detection to outcome",
  },
];

export function DashboardMetrics({
  metrics,
}: {
  metrics: RecoveryMetrics | null;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const metricLabels: Record<string, string> = {
    recoveryRate: "Recovery",
    recovered: "Recovered",
    atRisk: "At Risk",
    latency: "Latency",
  };


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
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
    >
      {config.map((m, i) => {
        const value = metrics ? metrics[m.id] : null;
        const Icon = m.icon;
        return (
          <div
            key={m.id}
            className={`relative p-6 border border-foreground/10 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className={`w-10 h-10 flex items-center justify-center border ${m.border} ${m.bg} rounded-lg`}
              >
                <Icon className={`w-5 h-5 ${m.iconColor}`} />
              </div>
              <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider">
                {metricLabels[m.id] ?? m.id}
              </span>
            </div>

            <div className="mb-1 h-8">
              {value === null ? (
                <div className="h-7 w-3/4 max-w-24 bg-foreground/5 rounded animate-pulse" />
              ) : (
                <AnimatedCounter
                  end={Math.round(value ?? 0)}
                  suffix={m.suffix}
                  prefix={m.prefix}
                  formatter={m.formatter}
                />
              )}
            </div>

            <p className="text-sm text-muted-foreground">{m.label}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{m.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

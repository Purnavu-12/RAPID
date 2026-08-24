"use client";

import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const data = [
  { day: "Mon", recovered: 112, atRisk: 34 },
  { day: "Tue", recovered: 98, atRisk: 42 },
  { day: "Wed", recovered: 145, atRisk: 28 },
  { day: "Thu", recovered: 127, atRisk: 38 },
  { day: "Fri", recovered: 166, atRisk: 31 },
  { day: "Sat", recovered: 134, atRisk: 25 },
  { day: "Sun", recovered: 109, atRisk: 40 },
];

export function RecoveryChart() {
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
      className={`border border-foreground/10 transition-all duration-700 delay-100 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          Daily recovery trend
        </span>
        <span className="text-xs font-mono text-green-500">Recoveries</span>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="recoveredGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(158 45% 32%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(158 45% 32%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 90%)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(210 10% 50%)" }} />
            <YAxis hide />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                return (
                  <div className="text-xs bg-background border border-foreground/10 px-2.5 py-1.5">
                    <div className="font-medium">{label}</div>
                    <div className="text-muted-foreground">
                      recovered: {payload[0]?.value}
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="recovered"
              stroke="hsl(158 45% 32%)"
              fill="url(#recoveredGradient)"
              strokeWidth={2}
              dot={{ r: 0 }}
              activeDot={{ r: 4, fill: "hsl(158 45% 32%)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

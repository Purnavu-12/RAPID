"use client";

import { useEffect, useState, useRef } from "react";

function AnimatedCounter({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          let start = 0;
          const duration = 2000;
          const startTime = performance.now();

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));

            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, hasAnimated]);

  return (
    <div ref={ref} className="text-6xl lg:text-8xl font-display tracking-tight">
      {prefix}{count.toLocaleString()}{suffix}
    </div>
  );
}

const metrics = [
  { 
    value: 34, 
    suffix: "%", 
    prefix: "",
    label: "Recovery rate",
    category: "Business",
  },
  { 
    value: 842, 
    suffix: "K", 
    prefix: "₹",
    label: "Revenue recovered",
    category: "Business",
  },
  { 
    value: 7, 
    suffix: "s", 
    prefix: "",
    label: "Avg. time to recovery",
    category: "Business",
  },
  { 
    value: 99, 
    suffix: ".9%", 
    prefix: "",
    label: "Policy compliance",
    category: "Safety",
  },
];

export function MetricsSection() {
  const [timeStr, setTimeStr] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () =>
      setTimeStr(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="metrics" ref={sectionRef} className="relative py-24 lg:py-32 border-y border-foreground/10">
      <div className="max-w-87.5 mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-16 lg:mb-24">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Live recovery metrics
            </span>
            <h2
              className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Measurable by
              <br />
              design.
            </h2>
          </div>
          <div className="flex items-center gap-4 font-mono text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
            <span className="text-foreground/30">|</span>
            <span>{timeStr}</span>
          </div>
        </div>
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-foreground/10">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`bg-background p-8 lg:p-12 transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <AnimatedCounter 
                end={typeof metric.value === 'number' ? metric.value : 0} 
                suffix={metric.suffix} 
                prefix={metric.prefix}
              />
              <div className="mt-4 flex items-center gap-3">
                <span className="text-lg text-muted-foreground">{metric.label}</span>
                <span className={`text-xs font-mono px-2 py-0.5 border border-foreground/10 ${
                  metric.category === "Safety" ? "text-green-600" : "text-foreground/50"
                }`}>
                  {metric.category}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Metric definition note */}
        <div
          className={`mt-12 text-sm text-muted-foreground transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          Recovery = authoritatively confirmed by provider webhooks, not by action dispatch. Recovery is declared only when financial state proves it.
        </div>
      </div>
    </section>
  );
}

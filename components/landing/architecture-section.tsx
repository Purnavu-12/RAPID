"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatedPipeline } from "./animated-pipeline";
import { ArrowRight } from "lucide-react";

export function ArchitectureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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
    <section id="architecture" ref={sectionRef} className="relative py-24 lg:py-32 bg-foreground/[0.02] overflow-hidden">
      <div className="max-w-87.5 mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Architecture
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            AI proposes.
            <br />
            <span className="text-muted-foreground">Policy authorizes. Execution verifies.</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left: Description */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
            }`}
          >
            <p className="text-xl text-muted-foreground leading-relaxed mb-8">
              The central architectural principle of RAPID: intelligence and money-moving authority are strictly separated. The LLM never invokes financial APIs directly. It interprets context, selects from an approved action vocabulary, and explains decisions. The deterministic Policy Engine is the only component that can authorize an action, and every execution is verified against authoritative provider state.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-8 h-8 flex items-center justify-center border border-foreground/10 bg-foreground text-background rounded-full text-xs font-mono">AI</div>
                <div>
                  <h3 className="font-medium mb-1">Intelligence Plane</h3>
                  <p className="text-sm text-muted-foreground">Detection, diagnosis, recoverability prediction. Never financial state.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-8 h-8 flex items-center justify-center border border-foreground/10 bg-foreground text-background rounded-full text-xs font-mono">PG</div>
                <div>
                  <h3 className="font-medium mb-1">Control Plane</h3>
                  <p className="text-sm text-muted-foreground">Policy Engine, risk limits, scheduling. The only authorizer of actions.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-8 h-8 flex items-center justify-center border border-foreground/10 bg-foreground text-background rounded-full text-xs font-mono">EX</div>
                <div>
                  <h3 className="font-medium mb-1">Execution & Outcome</h3>
                  <p className="text-sm text-muted-foreground">Provider adapters act; outcome reconciliation verifies against Razorpay truth.</p>
                </div>
              </div>
            </div>

            <div className="mt-12">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 text-sm font-mono text-foreground hover:text-primary transition-colors"
              >
                Read the full architecture
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Right: Pipeline visualization */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <div className="border border-foreground/10 p-6 bg-background">
              <div className="text-xs font-mono text-muted-foreground mb-4">Recovery audit chain</div>
              <div className="w-full h-[420px] text-foreground/40">
                <AnimatedPipeline />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

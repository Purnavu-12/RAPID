"use client";

import { useEffect, useRef, useState } from "react";
import { Shield, Pause, Clock, Ban, AlertTriangle, Lock } from "lucide-react";

/** §17 Universal Guardrails — the safety rails every recovery action passes
 *  through before it can touch a customer's money. These are the deterministic
 *  boundaries that make "AI proposes, policy authorizes" more than a slogan. */
const guardrails = [
  {
    icon: Shield,
    title: "Policy-gated execution",
    description:
      "Every action is authorized by a versioned, data-driven policy engine. AI never calls financial APIs directly.",
  },
  {
    icon: Pause,
    title: "Attempt cap",
    description:
      "No recovery loop without a hard maximum. After 3 attempts the case is exhausted — never fails open into more contact.",
  },
  {
    icon: Clock,
    title: "Quiet windows",
    description:
      "Respects configurable local-time communication windows. No contact outside allowed hours.",
  },
  {
    icon: AlertTriangle,
    title: "Human escalation",
    description:
      "High-value cases (₹5,000+) and ambiguous root causes are routed to human review — never auto-executed.",
  },
  {
    icon: Lock,
    title: "Authoritative state",
    description:
      "Provider webhooks are truth. No money-moving decision is ever inferred from an LLM response alone.",
  },
  {
    icon: Ban,
    title: "Explicit opt-out",
    description:
      "Customer opt-outs are a hard stop. No communication bypasses explicit consent.",
  },
];

export function GuardrailsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

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
      className="bg-foreground text-background py-16 lg:py-20"
    >
      <div className="max-w-87.5 mx-auto px-6 lg:px-12">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 text-xs font-mono text-background/50 uppercase tracking-widest mb-4">
            <Shield className="w-3 h-3" />
            Guardrails
          </span>
          <h3 className="text-2xl lg:text-3xl font-display tracking-tight">
            Safety is the default, not the exception
          </h3>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {guardrails.map((g, i) => {
            const Icon = g.icon;
            return (
              <div
                key={g.title}
                className={`p-6 border border-background/10 transition-all duration-500 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-8 h-8 flex items-center justify-center border border-background/10 bg-background text-foreground rounded-lg">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">{g.title}</h4>
                    <p className="text-sm text-background/60 leading-relaxed">
                      {g.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

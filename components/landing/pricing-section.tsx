"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    description: "Up to ₹5L recovered revenue / month",
    price: { monthly: "0", annual: "0" },
    features: [
      "Payment Link recovery",
      "Automated dunning retries",
      "Up to 3,000 recoveries/month",
      "Standard audit trail",
      "Email support",
    ],
    cta: "Start free",
    popular: false,
  },
  {
    name: "Growth",
    description: "Up to ₹50L recovered revenue / month",
    price: { monthly: "12", annual: "10" },
    features: [
      "All Starter features",
      "AI diagnosis & recoverability scoring",
      "Multi-channel recovery (SMS, WhatsApp, Email)",
      "Custom policy rules",
      "Priority support",
      "Recovery analytics",
    ],
    cta: "Start trial",
    popular: true,
  },
  {
    name: "Enterprise",
    description: "Unlimited. Custom volume.",
    price: { monthly: null, annual: null },
    features: [
      "All Growth features",
      "Human escalation workflows",
      "Custom integrations",
      "99.95% uptime SLA",
      "24/7 dedicated support",
      "Security & compliance audit",
    ],
    cta: "Contact sales",
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-32 lg:py-40 border-t border-foreground/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="max-w-3xl mb-20">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
            Pricing
          </span>
          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground mb-6">
            Pay for what you
            <br />
            <span className="text-stroke">recover</span>.
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl">
            No setup cost. No platform fees. You pay a small recovery share only on revenue we bring back to you.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
          {plans.map((plan, idx) => (
            <div
              key={plan.name}
              className={`relative p-8 lg:p-12 bg-background ${
                plan.popular ? "md:-my-4 md:py-12 lg:py-16 border-2 border-foreground" : ""
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-primary-foreground text-xs font-mono uppercase tracking-widest">
                  Most Popular
                </span>
              )}

              {/* Plan Header */}
              <div className="mb-8">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-3xl text-foreground mt-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-8 pb-8 border-b border-foreground/10">
                {plan.price.monthly !== null ? (
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-5xl lg:text-6xl text-foreground">
                      ₹{plan.price.annual}/mo
                    </span>
                    <span className="text-muted-foreground">on annual billing</span>
                  </div>
                ) : (
                  <span className="font-display text-4xl text-foreground">Custom</span>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-10">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center text-primary">✓</div>
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                  plan.popular
                    ? "bg-foreground text-primary-foreground hover:bg-foreground/90"
                    : "border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          ))}
        </div>

        {/* Bottom Note */}
        <p className="mt-12 text-center text-sm text-muted-foreground">
          All plans include tenant isolation, TLS in transit, encryption at rest, and an append-only audit trail.{" "}
          <Link href="/docs" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Review the architecture
          </Link>
        </p>
      </div>
    </section>
  );
}

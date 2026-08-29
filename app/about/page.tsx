import { ArrowRight, Shield, BarChart3, Users, Clock } from "lucide-react";
import Link from "next/link";
import { PageLayout } from "@/components/layout/page-layout";

export const metadata = {
  title: "About RAPID — Revenue Autopilot",
  description:
    "RAPID recovers lost revenue automatically. AI diagnoses, policy guards, execution verifies — always with a full audit trail and customer respect first.",
};

const principles = [
  {
    icon: Shield,
    title: "AI proposes. Policy authorizes.",
    desc: "The intelligence layer never moves money. It diagnoses and recommends from an approved action vocabulary; a deterministic, versioned policy engine is the only thing that can authorize recovery.",
  },
  {
    icon: BarChart3,
    title: "Recovery is proven, not assumed.",
    desc: "We declare recovery only when provider webhooks confirm it. Internal predictions are inputs, never replacements, for authoritative financial state.",
  },
  {
    icon: Clock,
    title: "Progress over perfection.",
    desc: "Cases move forward. We coach merchants toward better recovery step by step, with clear next steps rather than opaque dashboards.",
  },
  {
    icon: Users,
    title: "Customers first, recovery second.",
    desc: "Cool-downs, communication windows, opt-outs, and escalation paths are guardrails, not afterthoughts. Privacy is a feature, not a checkbox.",
  },
];

export default function AboutPage() {
  return (
    <PageLayout showWave={false}>
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-16 lg:pb-24">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-8">
            <span className="w-8 h-px bg-foreground/30" />
            Our philosophy
          </span>
          <h1 className="font-display text-5xl lg:text-7xl tracking-tight text-foreground mb-8 leading-[0.95]">
            Revenue that is lost
            <br />
            <span className="text-muted-foreground">can usually be found.</span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed mb-12">
            RAPID was built on a single principle: recovering revenue must never come at the cost of customer trust. We detect at-risk payments, diagnose the root cause, choose the safest highest-value action, and only then — through a policy gate — act. Every recovery leaves a tamper-evident trail.
          </p>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-sm font-mono text-foreground hover:text-primary transition-colors"
          >
            Read the architecture
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-24 grid md:grid-cols-2 gap-16 lg:gap-24">
          {principles.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="p-8 border border-foreground/10"
              >
                <div className="flex items-start gap-5">
                  <div className="shrink-0 w-12 h-12 flex items-center justify-center border border-foreground/10">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-2xl text-foreground mb-3">{p.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
}

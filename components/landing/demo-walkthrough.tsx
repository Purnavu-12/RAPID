"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, SkipForward, CheckCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

/** §37 metrics + §62 dashboard projections, read live from /api/recovery */
interface RecoveryMetrics {
  recoveryRate: number;
  recovered: number;
  atRisk: number;
  latency: number;
}

interface RecoveryCase {
  id: string;
  customer: string;
  riskType: string;
  reason: string;
  amount: number;
  currency: string;
  status: string;
  recovered: number;
  createdAt: string;
  actionClass?: string | null;
  confidence?: number | null;
  probability?: number | null;
}

interface RecoveryPayload {
  metrics: RecoveryMetrics;
  trend: unknown[];
  cases: RecoveryCase[];
  generatedAt: string;
}

/** A single step in the guided walkthrough. Each step maps to a live
 *  audit-chain stage and explains *why* it matters. */
interface WalkthroughStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  stageLabel: string;
  stageDetail: string;
  /** What the user should see as confirmation */
  successIndicator: string;
}

const STEPS: WalkthroughStep[] = [
  {
    id: "detect",
    title: "Risk Detection",
    subtitle: "A payment fails and enters the recovery pipeline",
    description:
      "RAPID listens for payment events. When a payment fails (insufficient funds, expired card, etc.), the webhook receiver validates the signature, deduplicates, and creates a risk event — the recovery candidate.",
    stageLabel: "RiskEvent",
    stageDetail: "Detected → new case in the audit chain",
    successIndicator: "A new case appears in the dashboard with root cause and amount",
  },
  {
    id: "diagnose",
    title: "Root-Cause Diagnosis",
    subtitle: "The engine determines why the payment failed",
    description:
      "Known failure codes (insufficient_funds, card_expired, authentication_failure) map directly — no LLM needed. Ambiguous cases escalate to human review. This keeps latency low and cost down.",
    stageLabel: "Diagnosis",
    stageDetail: "Rule-based classification with confidence score",
    successIndicator: "The case shows a specific root cause (e.g. 'Insufficient Funds') with a confidence score",
  },
  {
    id: "decide",
    title: "Decision + Policy Gate",
    subtitle: "AI proposes an action, policy authorizes it",
    description:
      "The decision engine selects the highest-value permitted action based on root cause and amount. The policy engine then independently verifies: is the amount within the auto limit? Are attempts remaining? Is the recovery window open?",
    stageLabel: "PolicyCheck",
    stageDetail: "Deterministic verification of attempt limit, amount, window",
    successIndicator: "The action class appears (e.g. 'Payment link') with reason codes",
  },
  {
    id: "execute",
    title: "Scheduled Execution",
    subtitle: "The approved action is queued for execution",
    description:
      "If approved, the execution worker processes the action in the recovery pipeline. High-value or ambiguous cases are queued for human review before any action is taken.",
    stageLabel: "ActionExecuted",
    stageDetail: "Provider resource created (order_id / payment_link.id)",
    successIndicator: "The action record shows the provider resource reference and timestamps",
  },
  {
    id: "recover",
    title: "Outcome Reconciliation",
    subtitle: "The recovery is confirmed — payment verified",
    description:
      "A confirmation webhook verifies the customer completed the payment. The system reconciles this against the open case and records the outcome. Recovery is declared only when provider truth proves it.",
    stageLabel: "OutcomeObserved",
    stageDetail: "Status: RECOVERED — amount verified against provider",
    successIndicator: "The case status changes to RECOVERED with the recovered amount",
  },
  {
    id: "audit",
    title: "Full Audit Trail",
    subtitle: "Every step is traceable end-to-end",
    description:
      "Click any case in the dashboard to open the chain viewer. You can reconstruct the full journey: Event → Diagnosis → Decision → Policy → Action → Outcome — with timestamps, policy versions, and confidence scores.",
    stageLabel: "AuditEvent",
    stageDetail: "Immutable, traceable record of every transition",
    successIndicator: "The audit chain shows all 7 stages with timestamps and evidence",
  },
];

/** The guided walkthrough component. Drives the full recovery pipeline
 *  one step at a time, narrating each stage and linking to live audit rows. */
export function DemoWalkthrough() {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<RecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`/api/recovery?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Silently fail — the demo continues with empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => void fetchDashboard(), 0);
    const interval = setInterval(fetchDashboard, 10_000);
    return () => clearInterval(interval);
  }, []);

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(Math.max(0, currentStep - 1));
  };

  const step = STEPS[currentStep];
  const metrics = data?.metrics;
  const recentCases = data?.cases || [];

  return (
    <section className="py-16 lg:py-24 min-h-screen bg-background">
      <div className="max-w-87.5 mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to site
          </Link>
          <h1 className="font-display text-4xl lg:text-5xl tracking-tight text-foreground mb-4">
            Recovery pipeline walkthrough
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            A step-by-step demo of how RAPID detects at-risk revenue,
            diagnoses root causes, selects policy-bounded actions, executes
            through the provider pipeline, and verifies every recovery —
            with a complete audit trail for each stage.
          </p>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-between mb-12 overflow-x-auto pb-4">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 text-sm font-mono ${i === currentStep
                ? "text-foreground"
                : i < currentStep
                  ? "text-muted-foreground"
                  : "text-muted-foreground/40"
                }`}
            >
              <div
                className={`w-8 h-8 flex items-center justify-center rounded-full text-xs transition-colors ${i === currentStep
                  ? "bg-foreground text-background"
                  : i < currentStep
                    ? "bg-muted text-foreground"
                    : "bg-muted/30 text-muted-foreground"
                  }`}
              >
                {i < currentStep ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className="hidden sm:inline">{s.title}</span>
            </div>
          ))}
        </div>

        {/* Current step content */}
        <div className="border border-foreground/10 p-8 lg:p-12 mb-8">
          <div className="flex items-start justify-between gap-6 mb-6">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">
                {step.stageLabel} · Step {currentStep + 1} of {STEPS.length}
              </span>
              <h2 className="font-display text-3xl text-foreground mb-2">
                {step.title}
              </h2>
              <p className="text-lg text-muted-foreground">
                {step.subtitle}
              </p>
            </div>
          </div>

          <p className="text-foreground/80 leading-relaxed mb-6">
            {step.description}
          </p>

          <div className="bg-foreground/2 border border-foreground/10 p-4 rounded-lg mb-6">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">
              Audit stage
            </div>
            <div className="flex items-center justify-between">
              <code className="text-sm font-mono text-foreground">
                {step.stageDetail}
              </code>
              <span
                className={`text-xs font-mono px-3 py-1 rounded-full ${currentStep >= STEPS.findIndex((s) => s.id === step.id)
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-slate-500/10 text-slate-500"
                  }`}
              >
                {recentCases.length > 0 && currentStep > 0
                  ? "Active"
                  : currentStep === 0
                    ? "Waiting"
                    : "Pending"}
              </span>
            </div>
          </div>

          {/* Current dashboard snapshot */}
          {!loading && (
            <div className="border-t border-foreground/10 pt-6">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
                Live dashboard snapshot
              </div>
              {metrics && (
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-display">{metrics.recoveryRate}%</div>
                    <div className="text-xs text-muted-foreground">Recovery rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-display">
                      ₹{(metrics.recovered * 1000).toLocaleString("en-IN")}
                    </div>
                    <div className="text-xs text-muted-foreground">Recovered (K)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-display">
                      ₹{(metrics.atRisk * 1000).toLocaleString("en-IN")}
                    </div>
                    <div className="text-xs text-muted-foreground">At risk (K)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-display">{metrics.latency}s</div>
                    <div className="text-xs text-muted-foreground">Avg. latency</div>
                  </div>
                </div>
              )}
              {recentCases.length > 0 && (
                <div className="text-xs">
                  <div className="font-mono text-muted-foreground mb-2">
                    {recentCases.length} recent case(s)
                  </div>
                  {recentCases.slice(0, 3).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-2 border-b border-foreground/5 last:border-0"
                    >
                      <span className="font-mono text-foreground/70">
                        …{c.id.slice(-10)}
                      </span>
                      <span className="text-muted-foreground">
                        {c.status} · {c.actionClass || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            onClick={prevStep}
            disabled={currentStep === 0}
            variant="outline"
            className="rounded-full border-foreground/20 hover:bg-foreground/5 h-12 px-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <Button
              onClick={nextStep}
              disabled={currentStep === STEPS.length - 1}
              className="bg-foreground hover:bg-foreground/90 text-background rounded-full group h-12 px-6"
            >
              Next step
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              onClick={() => setCurrentStep(STEPS.length - 1)}
              variant="outline"
              size="sm"
              className="rounded-full border-foreground/20 hover:bg-foreground/5"
            >
              <SkipForward className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Jump to dashboard */}
        <div className="mt-8 text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Open full recovery dashboard
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

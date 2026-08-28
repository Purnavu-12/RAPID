import { HeroSection } from "@/components/landing/hero-section";
import { AnimatedPipeline } from "@/components/landing/animated-pipeline";
import { LiveRecoveryWidget } from "@/components/landing/live-recovery-widget";
import { FeaturesSection } from "@/components/landing/features-section";
import { MetricsSection } from "@/components/landing/metrics-section";
import { ImpactComparison } from "@/components/landing/impact-comparison";
import { CtaSection } from "@/components/landing/cta-section";
import { PageLayout } from "@/components/layout/page-layout";

/** Home — a focused entry point. Detailed topics live on their own multipage
 * routes (/platform, /how-it-works, /pricing) so every topic has a real URL
 * (shareable, indexable) instead of a single-scroll anchor page. */
export const metadata = {
  title: "RAPID — Revenue Autopilot for Intelligent Payment Recovery",
  description:
    "Recover lost revenue automatically. RAPID detects at-risk payments, diagnoses the root cause with AI, picks the safest highest-value action, enforces policy guardrails, executes through Razorpay, and measures every recovery with a full audit trail.",
};

export default function Home() {
  return (
    <PageLayout showWave={true}>
      <HeroSection />
      <AnimatedPipeline />
      <LiveRecoveryWidget />
      <FeaturesSection />
      <MetricsSection />
      <ImpactComparison
        baseline={{
          recoveryRate: 0,
          revenueRecovered: 0,
          avgTimeToRecovery: 86400,
          escalationRate: 100,
          duplicateActions: 4,
          policyViolations: 3,
          casesHandled: 0,
        }}
        rapid={{
          recoveryRate: 34,
          revenueRecovered: 842000,
          avgTimeToRecovery: 7,
          escalationRate: 12,
          duplicateActions: 0,
          policyViolations: 0,
          casesHandled: 156,
        }}
      />
      <CtaSection />
    </PageLayout>
  );
}

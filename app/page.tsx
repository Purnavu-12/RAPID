import { Navigation } from "@/components/landing/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { AnimatedPipeline } from "@/components/landing/animated-pipeline";
import { LiveRecoveryWidget } from "@/components/landing/live-recovery-widget";
import { FeaturesSection } from "@/components/landing/features-section";
import { MetricsSection } from "@/components/landing/metrics-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FooterSection } from "@/components/landing/footer-section";

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
    <main className="relative min-h-screen overflow-x-hidden noise-overlay">
      <Navigation />
      <HeroSection />
      <AnimatedPipeline />
      <LiveRecoveryWidget />
      <FeaturesSection />
      <MetricsSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}

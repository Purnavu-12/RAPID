import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { MetricsSection } from "@/components/landing/metrics-section";
import { IntegrationsSection } from "@/components/landing/integrations-section";
import { SecuritySection } from "@/components/landing/security-section";
import { DevelopersSection } from "@/components/landing/developers-section";
import { PageLayout } from "@/components/layout/page-layout";

/** Platform — the product surface, as its own multipage route (no longer buried
 * in a single-scroll landing). */
export const metadata = {
  title: "Platform — RAPID Revenue Autopilot",
  description:
    "Detect at-risk revenue, diagnose root causes with AI, choose safe high-value actions, and enforce policy guardrails through Razorpay.",
};

export default function PlatformPage() {
  return (
    <PageLayout showWave={false}>
      <InfrastructureSection />
      <MetricsSection />
      <IntegrationsSection />
      <SecuritySection />
      <DevelopersSection />
    </PageLayout>
  );
}

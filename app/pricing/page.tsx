import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { PageLayout } from "@/components/layout/page-layout";

/** Pricing — social proof + plans, as its own route. */
export const metadata = {
  title: "Pricing — RAPID Revenue Autopilot",
  description:
    "Plans for every merchant size, with transparent policy-gated recovery pricing.",
};

export default function PricingPage() {
  return (
    <PageLayout showWave={false}>
      <TestimonialsSection />
      <PricingSection />
    </PageLayout>
  );
}

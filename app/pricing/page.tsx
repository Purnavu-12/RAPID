import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FooterSection } from "@/components/landing/footer-section";

/** Pricing — social proof + plans, as its own route. */
export const metadata = {
  title: "Pricing — RAPID Revenue Autopilot",
  description:
    "Plans for every merchant size, with transparent policy-gated recovery pricing.",
};

export default function PricingPage() {
  return (
    <>
      <TestimonialsSection />
      <PricingSection />
      <FooterSection />
    </>
  );
}

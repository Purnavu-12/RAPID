import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { DemoWalkthrough } from "@/components/landing/demo-walkthrough";

/** Guided demo — a step-by-step walkthrough of the full recovery pipeline.
 *  Drives fail → diagnose → decide → execute → pay → recovered sequentially
 *  with stage-by-stage narration linking each step to its live audit row. */
export const metadata = {
  title: "Guided Demo — RAPID Revenue Autopilot",
  description:
    "Watch RAPID detect a failed payment, diagnose the root cause, select a policy-bounded action, create a real Razorpay payment link, and verify the recovery — with full audit trail.",
};

export default function DemoPage() {
  return (
    <>
      <Navigation />
      <DemoWalkthrough />
      <FooterSection />
    </>
  );
}

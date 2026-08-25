import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { ArchitectureSection } from "@/components/landing/architecture-section";
import { AnimatedPipeline } from "@/components/landing/animated-pipeline";
import { FooterSection } from "@/components/landing/footer-section";

/** How it works — the recovery flow, as its own route. */
export const metadata = {
  title: "How it works — RAPID Revenue Autopilot",
  description:
    "Risk detection → root-cause diagnosis → recoverability prediction → safe intervention selection → policy gate → scheduled execution → outcome verification.",
};

export default function HowItWorksPage() {
  return (
    <>
      <HowItWorksSection />
      <ArchitectureSection />
      <section className="relative h-[420px] w-full overflow-hidden border-t border-foreground/10">
        <span className="absolute inset-x-0 top-6 text-center text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Audit chain (§1 / §27)
        </span>
        <AnimatedPipeline />
      </section>
      <FooterSection />
    </>
  );
}

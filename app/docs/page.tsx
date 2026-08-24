import { getDocSectionMetas } from "@/lib/docs";
import { DocsIndex } from "@/components/docs/docs-index";

export const metadata = {
  title: "Documentation — RAPID",
  description:
    "RAPID: Revenue Autopilot for Intelligent Payment Recovery. Full production architecture & implementation documentation, split into navigable chapters.",
};

export default async function DocsIndexPage() {
  const sections = getDocSectionMetas();

  return (
    <section className="max-w-4xl">
      <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-8">
        <span className="w-8 h-px bg-foreground/30" />
        RAPID specification
      </span>

      <h1 className="font-display text-5xl lg:text-6xl tracking-tight text-foreground mb-6 leading-[0.95]">
        Revenue
        <br />
        <span className="text-muted-foreground">autopilot.</span>
      </h1>
      <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mb-12">
        The complete production architecture for intelligent payment recovery —
        from revenue-risk detection through policy-gated execution and audit.
        Use the search below to jump to any chapter, or read linearly with the
        prev/next navigation at the bottom of each page.
      </p>

      <DocsIndex sections={sections} />
    </section>
  );
}

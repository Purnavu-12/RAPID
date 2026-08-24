import { getDocsContent } from "@/lib/docs";
import { MermaidInit } from "@/components/docs/mermaid-init";

export const metadata = {
  title: "Documentation — RAPID",
  description:
    "RAPID: Revenue Autopilot for Intelligent Payment Recovery. Full production architecture & implementation documentation.",
};

export default async function DocsPage() {
  const { html } = await getDocsContent();

  return (
    <>
      <article className="md-content">
        {/* The markdown is rendered server-side; dangerouslySetInnerHTML is safe
            because the source is a trusted project document, not user input. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>

      {/* Client-side: render Mermaid diagrams from code blocks. */}
      <MermaidInit />
    </>
  );
}

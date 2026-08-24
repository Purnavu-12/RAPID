import { notFound } from "next/navigation";
import Link from "next/link";
import { getDocSection, getDocSectionMetas, buildToc } from "@/lib/docs";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { MermaidInit } from "@/components/docs/mermaid-init";
import { CodeBlockEnhancer } from "@/components/docs/code-block-enhancer";
import { ArrowLeft, ArrowRight } from "lucide-react";

export async function generateStaticParams() {
  return getDocSectionMetas().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = await getDocSection(slug);
  if (!section) {
    return { title: "Chapter not found — RAPID Docs" };
  }
  return {
    title: `${section.title} — RAPID Docs`,
    description: section.description || "RAPID architecture documentation.",
  };
}

export default async function DocSectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = await getDocSection(slug);
  if (!section) notFound();

  const toc = buildToc(section.content);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-16 lg:gap-24 items-start">
      {/* Subsection TOC (desktop only) */}
      <aside className="hidden md:block">
        {toc.length > 0 ? (
          <DocsSidebar toc={toc} />
        ) : (
          <p className="font-mono text-xs text-muted-foreground/50 uppercase">
            On this page
          </p>
        )}
      </aside>

      {/* Chapter body */}
      <article className="md-content">
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex items-center gap-2 text-xs font-mono text-muted-foreground/60">
            <li><Link href="/docs" className="hover:text-foreground">Docs</Link></li>
            <li className="w-3 h-px bg-foreground/20" />
            <li className="text-muted-foreground/40 truncate" aria-current="page">
              {section.title}
            </li>
          </ol>
        </nav>

        <h1 id={section.slug} className="font-display text-3xl lg:text-4xl tracking-tight text-foreground mb-8 pb-4 border-b border-foreground/10">
          <span className="text-xs font-mono text-muted-foreground/60">
            {String(section.number ?? "").padStart(2, "0")}
          </span>{" "}
          {section.title.replace(/^\d+\.\s*/, "")}
        </h1>

        <div
          // Trusted, server-rendered project spec — safe to inject.
          dangerouslySetInnerHTML={{ __html: section.html ?? "" }}
        />

        {/* Client-side: render Mermaid diagrams and wire copy buttons. */}
        <MermaidInit />
        <CodeBlockEnhancer />

        {/* Prev / Next */}
        <nav
          className="mt-16 pt-8 border-t border-foreground/10 flex items-center justify-between gap-4"
          aria-label="Chapter navigation"
        >
          {section.prevSlug ? (
            <Link
              href={`/docs/${section.prevSlug}`}
              className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 border border-foreground/10 hover:border-foreground/20 px-4 h-10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          {section.nextSlug ? (
            <Link
              href={`/docs/${section.nextSlug}`}
              className="inline-flex items-center gap-2 text-sm font-mono text-foreground border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.03] px-4 h-10 rounded-full transition-colors"
            >
              Next chapter
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-foreground border border-foreground/10 hover:border-foreground/30 px-4 h-10 rounded-full transition-colors"
            >
              Back to index
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { DocSectionMeta } from "@/lib/docs";

function fuzzyMatch(query: string, s: DocSectionMeta): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  const hay = `${s.title} ${s.description}`.toLowerCase();
  return hay.includes(q);
}

export function DocsIndex({ sections }: { sections: DocSectionMeta[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => sections.filter((s) => fuzzyMatch(query, s)),
    [sections, query]
  );

  return (
    <div className="mt-8">
      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search chapters (e.g. 'policy', 'reconciliation', 'razorpay')..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 h-12 rounded-lg border border-foreground/10 bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 font-mono text-sm text-foreground placeholder:text-muted-foreground/50"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-sm font-mono text-muted-foreground mb-6">
        {filtered.length} of {sections.length} chapters
      </p>

      {/* Section list */}
      <div className="grid sm:grid-cols-2 gap-px bg-foreground/10">
        {filtered.length === 0 ? (
          <div className="sm:col-span-2 p-10 text-center text-muted-foreground">
            No chapters match “{query}”.
          </div>
        ) : (
          filtered.map((s, i) => (
            <SectionCard key={s.slug} section={s} index={i} query={query} />
          ))
        )}
      </div>

      {/* Quick jump anchors */}
      <div className="mt-12 pt-8 border-t border-foreground/10 flex flex-wrap gap-4 text-sm font-mono">
        <span className="text-muted-foreground">Quick jump:</span>
        <Link href="/docs/1-executive-summary" className="hover:text-foreground">1 · Executive summary</Link>
        <Link href="/docs/6-high-level-architecture" className="hover:text-foreground">6 · Architecture</Link>
        <Link href="/docs/70-architecture-summary" className="hover:text-foreground">70 · Summary</Link>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  index,
  query,
}: {
  section: DocSectionMeta;
  index: number;
  query: string;
}) {
  return (
    <Link
      href={`/docs/${section.slug}`}
      className="group p-6 bg-background border border-foreground/10 hover:border-foreground/20 transition-colors flex items-start justify-between gap-4"
    >
      <div className="flex-1">
        <div className="flex items-baseline gap-2.5">
          <span className="text-xs font-mono text-muted-foreground/60">
            {(index + 1).toString().padStart(2, "0")}
          </span>
          <h3 className="font-display text-lg text-foreground group-hover:text-primary transition-colors">
            {section.title}
          </h3>
        </div>
        {section.description && (
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {highlight(section.description, query)}
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
    </Link>
  );
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-primary/15 text-primary font-medium">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

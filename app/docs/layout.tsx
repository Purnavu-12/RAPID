import "./docs.css";

import Link from "next/link";
import type { ReactNode } from "react";
import { getDocsContent } from "@/lib/docs";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

export const metadata = {
  title: "Documentation — RAPID",
  description:
    "RAPID: Revenue Autopilot for Intelligent Payment Recovery. Read the full production architecture and implementation documentation.",
};

export default async function DocsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { toc } = await getDocsContent();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-6 lg:py-8 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-2xl text-foreground"
          >
            RAPID
            <span className="text-xs text-muted-foreground font-mono"> Docs</span>
          </Link>
          <span className="text-xs font-mono text-muted-foreground">
            v2.0 Architecture Baseline
          </span>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-16 lg:gap-24">
          <aside className="hidden md:block">
            <DocsSidebar toc={toc} />
          </aside>

          <main className="md:max-w-none max-w-none">
            {children}
          </main>
        </div>
      </div>

      <footer className="border-t border-foreground/10 mt-16">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-6 text-sm font-mono text-muted-foreground">
          RAPID specification — docs/RAPID.md
        </div>
      </footer>
    </div>
  );
}

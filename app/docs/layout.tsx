import "./docs.css";

import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Documentation — RAPID",
  description:
    "RAPID: Revenue Autopilot for Intelligent Payment Recovery. Full production architecture & implementation documentation, split into navigable chapters.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground noise-overlay">
      <header className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-xl text-foreground">
            RAPID
            <span className="text-xs text-muted-foreground font-mono"> Docs</span>
          </Link>
          <span className="text-xs font-mono text-muted-foreground">
            v2.0 architecture baseline
          </span>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 lg:py-16">
        {children}
      </main>

      <footer className="border-t border-foreground/10 mt-16">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-6 text-sm font-mono text-muted-foreground">
          docs/RAPID.md · rendered at build time — no runtime doc server.
        </div>
      </footer>
    </div>
  );
}

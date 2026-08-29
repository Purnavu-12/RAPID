import "./docs.css";

import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata = {
  title: "Documentation — RAPID",
  description:
    "RAPID: Revenue Autopilot for Intelligent Payment Recovery. Full production architecture & implementation documentation, split into navigable chapters.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground noise-overlay">
      <SiteHeader />
      
      <main className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-24 lg:pt-28 pb-16">
        {children}
      </main>

      <footer className="relative z-10 border-t border-foreground/10 mt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-6 text-sm font-mono text-muted-foreground">
          docs/RAPID.md · rendered at build time — no runtime doc server.
        </div>
      </footer>
    </div>
  );
}

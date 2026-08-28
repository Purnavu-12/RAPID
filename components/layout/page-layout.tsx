import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

interface PageLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  showFooter?: boolean;
  showWave?: boolean;
}

/**
 * Standard page layout wrapper
 * Provides consistent header, main content area, and footer
 */
export function PageLayout({
  children,
  showHeader = true,
  showFooter = true,
  showWave = true,
}: PageLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden noise-overlay">
      {showHeader && <SiteHeader />}
      
      <main className="relative z-10 pt-20 lg:pt-24">
        {children}
      </main>
      
      {showFooter && <SiteFooter showWave={showWave} />}
    </div>
  );
}

/**
 * Dashboard page layout - no header, different footer
 * Used for pages that need their own navigation (like dashboard)
 */
export function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground noise-overlay">
      {children}
    </div>
  );
}

/**
 * Docs page layout - has its own header from docs/layout.tsx
 * This is just a wrapper for consistency
 */
export function DocsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground noise-overlay">
      {children}
    </div>
  );
}

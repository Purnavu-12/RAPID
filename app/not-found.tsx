import Link from "next/link";
import { Home } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-x-hidden noise-overlay">
      <SiteHeader />
      
      <main className="relative z-10 flex items-center justify-center pt-24 lg:pt-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center py-16 lg:py-24">
          <div className="space-y-2 mb-12">
            <span className="font-mono text-8xl font-display text-foreground/10">404</span>
            <h1 className="font-display text-5xl lg:text-7xl tracking-tight text-foreground">
              Page not recovered.
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-12">
            This page isn&apos;t on the recovery path. Let us get you back to safer ground.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-mono text-foreground hover:text-primary border border-foreground/10 hover:border-foreground/30 px-6 h-12 rounded-full transition-colors"
          >
            <Home className="w-4 h-4" />
            Back to RAPID
          </Link>
        </div>
      </main>
      
      <SiteFooter showWave={false} />
    </div>
  );
}

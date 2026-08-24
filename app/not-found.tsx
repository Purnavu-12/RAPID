import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center noise-overlay">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center py-32">
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
  );
}

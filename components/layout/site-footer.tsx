"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { AnimatedWave } from "@/components/landing/animated-wave";

type FooterLink = { name: string; href: string; badge?: string };

const footerLinks: Record<string, FooterLink[]> = {
  Product: [
    { name: "Platform", href: "/platform" },
    { name: "How it works", href: "/how-it-works" },
    { name: "Pricing", href: "/pricing" },
    { name: "Dashboard", href: "/dashboard" },
  ],
  Developers: [
    { name: "Documentation", href: "/docs" },
    { name: "API Reference", href: "/docs/40-api-architecture" },
    { name: "Webhooks", href: "/docs/9-webhook-ingestion-architecture" },
    { name: "Integration guide", href: "/docs/21-razorpay-integration-architecture" },
    { name: "Reliability", href: "/docs/35-reliability-engineering" },
  ],
  Company: [
    { name: "About", href: "/about" },
    { name: "Architecture", href: "/docs/6-high-level-architecture" },
    { name: "Security", href: "/docs/33-security-architecture" },
    { name: "Contact", href: "mailto:hello@rapid.example" },
  ],
  Legal: [
    { name: "Privacy", href: "https://razorpay.com/privacy" },
    { name: "Terms", href: "https://razorpay.com/terms" },
    { name: "Security", href: "/platform#security" },
  ],
};

const socialLinks = [
  { name: "Twitter", href: "https://twitter.com/razorpay" },
  { name: "GitHub", href: "https://github.com/razorpay" },
  { name: "LinkedIn", href: "https://linkedin.com/company/razorpay" },
];

interface SiteFooterProps {
  showWave?: boolean;
}

export function SiteFooter({ showWave = true }: SiteFooterProps) {
  return (
    <footer className="relative border-t border-foreground/10">
      {showWave && (
        <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
          <AnimatedWave />
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        {/* Main Footer */}
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <Link href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display">RAPID</span>
                <span className="text-xs text-muted-foreground font-mono">Revenue Autopilot</span>
              </Link>

              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs">
                Revenue Autopilot for Intelligent Payment Recovery. Recover lost revenue automatically — AI diagnosed, policy guarded, Razorpay powered.
              </p>

              {/* Social Links */}
              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => {
                    const isExternal = link.href.startsWith("http");
                    return (
                      <li key={link.name}>
                        <a
                          href={link.href}
                          {...(isExternal
                            ? {
                              target: "_blank",
                              rel: "noopener noreferrer",
                            }
                            : {})}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                        >
                          {link.name}
                          {"badge" in link && link.badge && (
                            <span className="text-xs px-2 py-0.5 bg-foreground text-background rounded-full">
                              {link.badge}
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            2026 RAPID. Architecture baseline v2.0.
          </p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

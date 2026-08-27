"use client";

import { useEffect, useState, useRef } from "react";
import { Globe, Shield, Users, Database } from "lucide-react";

const integrations = [
  { provider: "Razorpay", type: "Primary payment provider", status: "Connected", icon: "💳" },
  { provider: "Stripe", type: "Alternate payment provider", status: "Available", icon: "💳" },
  { provider: "Email", type: "Communication channel", status: "Configured", icon: "✉️" },
  { provider: "SMS", type: "Communication channel", status: "Configured", icon: "📱" },
  { provider: "WhatsApp", type: "Communication channel", status: "Ready", icon: "💬" },
  { provider: "Postgres", type: "Transactional state", status: "Primary", icon: "🗄️" },
];

const tenants = [
  { name: "Acme Retail", region: "APAC", customers: "12,480", status: "Healthy" },
  { name: "Globex Corp", region: "EMEA", customers: "47,092", status: "Healthy" },
  { name: "Initech", region: "North America", customers: "8,314", status: "Healthy" },
  { name: "Umbrella Inc", region: "LATAM", customers: "5,207", status: "Healthy" },
  { name: "Hooli", region: "APAC", customers: "33,951", status: "Healthy" },
  { name: "Stark Industries", region: "North America", customers: "19,882", status: "Healthy" },
];

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeItem, setActiveItem] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveItem((prev) => (prev + 1) % integrations.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-350 mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Left: Content */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Infrastructure
            </span>
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8">
              Razorpay-native.
              <br />
              <span className="text-muted-foreground">Tenant-isolated.</span>
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed mb-12">
              Built around the Razorpay recovery primitives — Payment Links, subscription state machines, and webhooks. Each tenant keeps its own policies, credentials, and rate limits, with every object carrying a tenant_id for strict isolation.
            </p>

            {/* Capability icons */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <Globe className="w-6 h-6 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">Multi-tenant</div>
                  <p className="text-sm text-muted-foreground">Isolation per merchant, keyed by tenant_id</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Shield className="w-6 h-6 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">Policy-gated</div>
                  <p className="text-sm text-muted-foreground">No action without policy authorization</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Database className="w-6 h-6 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">Event-first</div>
                  <p className="text-sm text-muted-foreground">Append-only, replayable event chain</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Users className="w-6 h-6 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">RBAC</div>
                  <p className="text-sm text-muted-foreground">Per-role policy and audit access</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Provider integrations list */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <div className="border border-foreground/10">
              {/* Header */}
              <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
                <span className="text-sm font-mono text-muted-foreground">Provider integrations</span>
                <span className="flex items-center gap-2 text-xs font-mono text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  All operational
                </span>
              </div>

              {/* Integrations */}
              <div>
                {integrations.map((integration, index) => (
                  <div
                    key={integration.provider}
                    className={`px-6 py-5 border-b border-foreground/5 last:border-b-0 flex items-center justify-between transition-all duration-300 ${
                      activeItem === index ? "bg-foreground/[0.02]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span>{integration.icon}</span>
                      <div>
                        <div className="font-medium">{integration.provider}</div>
                        <div className="text-sm text-muted-foreground">{integration.type}</div>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{integration.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tenant isolation note */}
            <div className="mt-8 border border-foreground/10 p-6">
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-4">
                Active tenants · Partition key: tenant_id
              </p>
              <div className="space-y-3">
                {tenants.slice(0, 3).map((t) => (
                  <div key={t.name} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.region} · {t.customers} customers</div>
                    </div>
                    <span className="text-xs font-mono text-green-600">{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

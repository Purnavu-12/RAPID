"use client";

import { useEffect, useRef, useState } from "react";

const features = [
  {
    number: "01",
    title: "Payment degradation",
    description: "Repeated declines, gateway timeouts, and issuer rejections. We classify the failure code, check current payment state, and decide what is recoverable versus terminal.",
    evidence: ["payment.failed", "repeated declines", "gateway failures"],
    visual: "payment",
  },
  {
    number: "02",
    title: "Checkout abandonment",
    description: "A cart started with no successful payment. Time-windowed detection that excludes bots and already-paid cases, then nudges the right customer at the right moment.",
    evidence: ["checkout started", "no completion", "price shock"],
    visual: "checkout",
  },
  {
    number: "03",
    title: "Subscription failure",
    description: "Recurring charges that fail or drift into a recovery state — balance shortages, mandate issues, bank rejections. Distinguished from initial failure by dunning history.",
    evidence: ["recurring fails", "halted state", "mandate issues"],
    visual: "subscription",
  },
  {
    number: "04",
    title: "Receivables aging",
    description: "Invoices past their due date. Bucketed by overdue duration so the next collection stage is always the safest next step for the customer.",
    evidence: ["past due date", "cash-flow delay", "approval delay"],
    visual: "receivable",
  },
];

function PaymentVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      {/* Card */}
      <rect x="30" y="45" width="140" height="90" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="40" y="55" width="120" height="12" rx="2" fill="currentColor" opacity="0.15" />
      <rect x="40" y="72" width="80" height="8" rx="2" fill="currentColor" opacity="0.1" />
      {/* Chip */}
      <rect x="40" y="45" width="28" height="20" rx="3" fill="currentColor" opacity="0.25" />
      {/* Card number */}
      <rect x="40" y="90" width="100" height="6" rx="2" fill="currentColor" opacity="0.1" />
      {/* Warning cross */}
      <line x1="140" y1="50" x2="170" y2="70" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <line x1="170" y1="50" x2="140" y2="70" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      {/* Pulsing decay ring */}
      <circle cx="155" cy="110" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.12">
        <animate attributeName="r" values="22;30;22" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.12;0.35;0.12" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="155" cy="110" r="3" fill="currentColor" opacity="0.6">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function CheckoutVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      {/* Cart */}
      <rect x="95" y="95" width="60" height="45" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="95" y1="105" x2="155" y2="105" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
      <line x1="95" y1="115" x2="155" y2="115" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
      <line x1="95" y1="125" x2="155" y2="125" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
      {/* Wheels */}
      <circle cx="110" cy="150" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="140" cy="150" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      {/* Handle */}
      <line x1="155" y1="93" x2="168" y2="78" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Abandoned item */}
      <rect x="40" y="40" width="36" height="46" rx="4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <line x1="58" y1="76" x2="58" y2="98" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      {/* Cross out */}
      <line x1="120" y1="45" x2="168" y2="45" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <line x1="144" y1="32" x2="144" y2="58" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      {/* Floating dots (abandonment) */}
      <circle cx="52" cy="38" r="2" fill="currentColor" opacity="0.4">
        <animate attributeName="cy" values="38;30;38" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="175" cy="50" r="2" fill="currentColor" opacity="0.4">
        <animate attributeName="cx" values="175;180;175" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SubscriptionVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      {/* Circular recurring indicator */}
      <circle cx="100" cy="80" r="50" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path d="M100 38 A50 50 0 0 1 150 80" fill="none" stroke="currentColor" strokeWidth="2" />
      {/* Rotating arrow head */}
      <polygon points="142,72 150,80 142,88" fill="currentColor" opacity="0.6" />
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 100 80"
        to="360 100 80"
        dur="6s"
        repeatCount="indefinite"
      />
      {/* Inner node */}
      <circle cx="100" cy="80" r="6" fill="currentColor" />
      {/* Failure burst */}
      <g>
        <line x1="98" y1="80" x2="80" y2="78" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
        <line x1="102" y1="80" x2="120" y2="82" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
        <line x1="100" y1="76" x2="100" y2="60" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      </g>
      {/* Status label */}
      <text x="100" y="135" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" opacity="0.45">
        halted / retry
      </text>
    </svg>
  );
}

function ReceivableVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      {/* Invoice */}
      <rect x="35" y="35" width="130" height="100" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="45" y="45" width="110" height="8" rx="2" fill="currentColor" opacity="0.1" />
      <rect x="45" y="60" width="90" height="6" rx="2" fill="currentColor" opacity="0.08" />
      <rect x="45" y="72" width="110" height="6" rx="2" fill="currentColor" opacity="0.08" />
      <rect x="45" y="84" width="70" height="6" rx="2" fill="currentColor" opacity="0.08" />
      {/* Due date tag */}
      <rect x="120" y="45" width="55" height="22" rx="3" fill="currentColor" opacity="0.08" />
      <text x="147" y="60" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" opacity="0.5">
        overdue
      </text>
      {/* Aging bars */}
      <g transform="translate(45, 105)">
        <rect width="16" height="22" fill="currentColor" opacity="0.15" />
        <rect x="22" width="16" height="16" fill="currentColor" opacity="0.25" />
        <rect x="44" width="16" height="10" fill="currentColor" opacity="0.4" />
        <rect x="66" width="16" height="30" fill="currentColor" />
      </g>
      {/* Pulse on due-overdue */}
      <circle cx="147" cy="56" r="3" fill="currentColor" opacity="0.5">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function AnimatedVisual({ type }: { type: string }) {
  switch (type) {
    case "payment":
      return <PaymentVisual />;
    case "checkout":
      return <CheckoutVisual />;
    case "subscription":
      return <SubscriptionVisual />;
    case "receivable":
      return <ReceivableVisual />;
    default:
      return <PaymentVisual />;
  }
}

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 py-12 lg:py-20 border-b border-foreground/10">
        {/* Number */}
        <div className="shrink-0">
          <span className="font-mono text-sm text-muted-foreground">{feature.number}</span>
        </div>
        
        {/* Content */}
        <div className="flex-1 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-3xl lg:text-4xl font-display mb-4 group-hover:translate-x-2 transition-transform duration-500">
              {feature.title}
            </h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-4">
              {feature.description}
            </p>
            <ul className="flex flex-wrap gap-2 text-xs font-mono text-muted-foreground/60">
              {feature.evidence.map((e) => (
                <li key={e} className="px-2 py-1 border border-foreground/5">
                  {e}
                </li>
              ))}
            </ul>
          </div>
          
          {/* Visual */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-48 h-40 text-foreground">
              <AnimatedVisual type={feature.visual} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

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

  return (
    <section
      id="platform"
      ref={sectionRef}
      className="relative py-24 lg:py-32"
    >
      <div className="max-w-350 mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Where revenue leaks
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Every leak is a
            <br />
            <span className="text-muted-foreground">recovery opportunity.</span>
          </h2>
        </div>

        {/* Features List */}
        <div>
          {features.map((feature, index) => (
            <FeatureCard key={feature.number} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

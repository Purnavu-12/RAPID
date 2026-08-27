"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Copy, Check } from "lucide-react";

const codeExamples = [
  {
    label: "Webhook",
    code: `// Razorpay webhook receiver — lightweight, no inference
app.post("/v1/webhooks/razorpay", async (req, res) => {
  const signature = req.headers["x-razorpay-signature"]
  verifySignature(rawBody, signature, secret)

  const event = dedupe(req.headers["x-razorpay-event-id"])
  await persistRawEvent(event)        // object storage
  await publish("raw.payment-events", event) // event bus

  res.status(200).send("ok")
})`,
  },
  {
    label: "Event Schema",
    code: `{
  "event_id": "evt_9f2a",
  "event_type": "payment.failed",
  "schema_version": "1.0",
  "tenant_id": "merchant_123",
  "source": "razorpay",
  "occurred_at": "2026-08-24T10:15:00Z",
  "received_at": "2026-08-24T10:15:01Z",
  "trace_id": "tr_82ad",
  "correlation_id": "case_123",
  "payload": {}
}`,
  },
  {
    label: "API",
    code: `# Fetch open recovery cases
GET /v1/recovery/cases?status=OPEN
Idempotency-Key: case-query-73c7

# Approve a high-value recovery
POST /v1/recovery/cases/case_123/approve
Idempotency-Key: approve-case_123

# Publish a new policy version
POST /v1/policies
Content-Type: application/json`,
  },
];

const features = [
  { 
    title: "Webhook-first", 
    description: "Lightweight receiver. No inference in the request path."
  },
  { 
    title: "Idempotent", 
    description: "Every event and action has a deterministic key."
  },
  { 
    title: "Replayable", 
    description: "Events persist raw + normalized for replay."
  },
  { 
    title: "Versioned APIs", 
    description: "Stable, schema-versioned contracts."
  },
];

const codeAnimationStyles = `
  .dev-code-line {
    opacity: 0;
    transform: translateX(-8px);
    animation: devLineReveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  
  @keyframes devLineReveal {
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  .dev-code-char {
    opacity: 0;
    filter: blur(8px);
    animation: devCharReveal 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  
  @keyframes devCharReveal {
    to {
      opacity: 1;
      filter: blur(0);
    }
  }
`;

export function DevelopersSection() {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExamples[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    <section id="developers" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: codeAnimationStyles }} />
      <div className="max-w-350 mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left: Content */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              For developers
            </span>
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8">
              Built for ops.
              <br />
              <span className="text-muted-foreground">Designed for safety.</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
              A small webhook surface, idempotent execution, and versioned events you can replay at any time. No LLM in the request path — only in the bounded decision layer.
            </p>
            
            {/* Features */}
            <div className="grid grid-cols-2 gap-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className={`transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${index * 50 + 200}ms` }}
                >
                  <h3 className="font-medium mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Right: Code block */}
          <div
            className={`lg:sticky lg:top-32 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <div className="border border-foreground/10 overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center border-b border-foreground/10">
                {codeExamples.map((example, idx) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => { setActiveTab(idx); setCopied(false); }}
                    className={`px-6 py-4 text-sm font-mono transition-colors relative ${
                      activeTab === idx
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {example.label}
                    {activeTab === idx && (
                      <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-4 py-4 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {/* Code content */}
              <div className="p-8 font-mono text-sm bg-foreground/[0.01] min-h-[240px]">
                <pre className="text-foreground/80">
                  {codeExamples[activeTab].code.split('\n').map((line, lineIndex) => (
                    <div 
                      key={`${activeTab}-${lineIndex}`} 
                      className="leading-loose dev-code-line"
                      style={{ animationDelay: `${lineIndex * 80}ms` }}
                    >
                      <span className="text-foreground/20 select-none w-8 inline-block">{lineIndex + 1}</span>
                      <span className="inline-flex">
                        {line.split('').map((char, charIndex) => (
                          <span
                            key={`${activeTab}-${lineIndex}-${charIndex}`}
                            className="dev-code-char"
                            style={{
                              animationDelay: `${lineIndex * 80 + charIndex * 15}ms`,
                            }}
                          >
                            {char === ' ' ? '\u00A0' : char}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
            
            {/* Links */}
            <div className="mt-6 flex items-center gap-6 text-sm">
              <Link href="/docs" className="text-foreground hover:underline underline-offset-4">
                Read the full docs
              </Link>
              <span className="text-foreground/20">|</span>
              <a href="#" className="text-muted-foreground hover:text-foreground">
                API Reference
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

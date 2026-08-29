"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimatedSphere } from "./animated-sphere";
import { GuardrailsSection } from "./guardrails-section";

const words = ["detect", "recover", "verify", "learn"];

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % words.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
        {/* Animated sphere background — data stream over a rotating sphere */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-150 h-150 lg:w-200 lg:h-200 opacity-30 pointer-events-none">
          <AnimatedSphere />
        </div>

        {/* Subtle grid lines */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
          {[...Array(8)].map((_, i) => (
            <div
              key={`h-${i}`}
              className="absolute h-px bg-foreground/10"
              style={{
                top: `${12.5 * (i + 1)}%`,
                left: 0,
                right: 0,
              }}
            />
          ))}
          {[...Array(12)].map((_, i) => (
            <div
              key={`v-${i}`}
              className="absolute w-px bg-foreground/10"
              style={{
                left: `${8.33 * (i + 1)}%`,
                top: 0,
                bottom: 0,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-87.5 mx-auto px-6 lg:px-12 py-32 lg:py-40">
          {/* Eyebrow */}
          <div
            className={`mb-8 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
              <span className="w-8 h-px bg-foreground/30" />
              AI diagnosed · Policy guarded · Razorpay powered
            </span>
          </div>

          {/* Main headline */}
          <div className="mb-12">
            <h1
              className={`text-[clamp(3rem,12vw,10rem)] font-display leading-[0.9] tracking-tight transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
            >
              <span className="block">Payments fail.</span>
              <span className="block">Revenue leaks.</span>
              <span className="block">
                RAPID <span className="text-primary">wins it back</span> — <span className="text-muted-foreground">autonomously and accountably.</span>
              </span>
            </h1>
            <p
              className={`mt-8 max-w-2xl text-xl lg:text-2xl text-muted-foreground leading-relaxed transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
            >
              RAPID detects at-risk payments, diagnoses the root cause with AI, chooses the safest high-value action, enforces policy guardrails, executes through Razorpay, and measures every recovery against provider truth with a complete audit trail.
            </p>
          </div>

          {/* CTAs */}
          <div
            className={`flex flex-col sm:flex-row items-start gap-4 mt-12 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
          >
            <Button
              asChild
              size="lg"
              className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base rounded-full group"
            >
              <Link href="/demo">
                Start recovering revenue
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-14 px-8 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
            >
              <Link href="/demo">Watch guided demo</Link>
            </Button>
          </div>
        </div>

        {/* Stats marquee — positioned after hero content in normal flow */}
        <div
          className={`mt-12 md:mt-16 transition-all duration-700 delay-500 ${isVisible ? "opacity-100" : "opacity-0"
            }`}
        >
          <div className="flex gap-16 marquee whitespace-nowrap">
            {[...Array(2)].map((_, i) => (
              <div key={`marquee-${i}`} className="flex gap-16">
                {[
                  { value: "34%", label: "avg. recovery rate", company: "MERCHANTS" },
                  { value: "₹8.4L", label: "recovered last month", company: "ACTIVE" },
                  { value: "99.99%", label: "policy compliance", company: "AUDIT" },
                  { value: "7", label: "sec avg. to resolution", company: "LATENCY" },
                ].map((stat) => (
                  <div key={`${stat.company}-${i}`} className="flex items-baseline gap-4">
                    <span className="text-4xl lg:text-5xl font-display">{stat.value}</span>
                    <span className="text-sm text-muted-foreground">
                      {stat.label}
                      <span className="block font-mono text-xs mt-1">{stat.company}</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guardrails section (§17) — the safety boundary every action passes through */}
      <div
        className={`transition-all duration-700 delay-600 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
      >
        <GuardrailsSection />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedCounter({
  end,
  suffix = "",
  prefix = "",
  duration = 1800,
  formatter,
}: {
  end: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  formatter?: (n: number) => string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const startTime = performance.now();
          const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [end, duration, hasAnimated]);

  const value = formatter
    ? formatter(count)
    : `${prefix}${count.toLocaleString()}${suffix}`;

  return <span ref={ref} className="font-display text-4xl lg:text-5xl tracking-tight">{value}</span>;
}

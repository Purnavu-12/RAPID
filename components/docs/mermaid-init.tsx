"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Finds `code.language-mermaid` blocks produced by the markdown renderer
 * and turns them into rendered Mermaid SVGs. Loaded dynamically so the
 * (large) mermaid bundle is never part of the initial JS payload.
 */
export function MermaidInit() {
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    import("mermaid")
      .then((mod) => {
        if (cancelled) return;
        const mermaid = mod.default ?? mod;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "strict",
        });

        // Convert each <pre><code class="language-mermaid"> into a
        // <div class="mermaid"> so mermaid.run() can render it.
        document
          .querySelectorAll<HTMLPREElement>("pre code.language-mermaid")
          .forEach((code) => {
            const pre = code.closest("pre");
            if (!pre) return;
            const div = document.createElement("div");
            div.className = "mermaid";
            div.textContent = code.textContent ?? "";
            pre.replaceWith(div);
          });

        mermaid.run();
        setReady(true);
      })
      .catch((err) => {
        console.error("mermaid failed to load", err);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedTheme]);

  return ready ? null : null;
}

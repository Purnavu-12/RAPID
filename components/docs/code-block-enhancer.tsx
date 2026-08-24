"use client";

import { useEffect } from "react";

const COPY_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5"></path></svg>';

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17.172 4 12.104"></polyline></svg>';

/**
 * Enhances server-rendered `<pre>` code blocks inside `.md-content` with:
 *  - a language label (top-left)
 *  - a copy-to-clipboard button (top-right) with success feedback
 *
 * Skips `language-mermaid` blocks, which are converted to live diagrams by
 * MermaidInit instead.
 */
export function CodeBlockEnhancer() {
  useEffect(() => {
    const container = document.querySelector(".md-content");
    if (!container) return;

    container.querySelectorAll<HTMLPreElement>("pre").forEach((pre) => {
      if (pre.dataset.cbEnhanced === "true") return;
      const code = pre.querySelector("code");
      if (!code) return;

      const langMatch = code.className.match(/language-(\S+)/);
      const isMermaid = /language-mermaid/.test(code.className);
      if (isMermaid) return;

      const lang = langMatch ? langMatch[1] : "code";

      pre.style.position = "relative";

      // Language label
      const label = document.createElement("div");
      label.className = "cb-lang-label";
      label.textContent = lang;
      pre.appendChild(label);

      // Copy button
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cb-copy-btn";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.innerHTML = COPY_SVG;
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.textContent || "");
          btn.dataset.copied = "true";
          btn.innerHTML = CHECK_SVG;
          setTimeout(() => {
            btn.dataset.copied = "false";
            btn.innerHTML = COPY_SVG;
          }, 1800);
        } catch {
          btn.textContent = "✕";
        }
      });
      pre.appendChild(btn);

      pre.dataset.cbEnhanced = "true";
    });
  }, []);

  return null;
}

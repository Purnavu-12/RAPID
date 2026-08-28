"use client";

import { useEffect, useRef } from "react";

// Stages map to RAPID.md §1 / §27 audit chain
const stages = [
  { label: "RiskEvent", hue: 200 },
  { label: "Diagnosis", hue: 260 },
  { label: "Decision", hue: 40 },
  { label: "PolicyCheck", hue: 140 },
  { label: "ActionScheduled", hue: 200 },
  { label: "OutcomeObserved", hue: 160 },
];

const chars = "░▒▓█▀▄▌▐│─┤├┴┬╭╮╰╯0123456789";

export function AnimatedPipeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let time = 0;
    const particles: {
      x: number; y: number; stage: number; speed: number; char: string;
    }[] = [];

    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const n = stages.length;
      const padding = 24;
      const usableW = rect.width - padding * 2;
      const rowH = rect.height / (n + 1);

      // Node positions along a vertical flow
      const nodes = stages.map((_, i) => ({
        x: padding + usableW / 2,
        y: rowH * (i + 1),
        stage: i,
      }));

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "12px monospace";

      // Draw connecting edges with flowing particles
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const dx = (b.x - a.x) / len;
        const dy = (b.y - a.y) / len;

        // Edge line
        ctx.strokeStyle = `rgba(0,0,0,${0.08})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Flowing particles along edge
        const speed = 0.6 + i * 0.1;
        for (let p = 0; p < 3; p++) {
          const t = ((time * speed + p * 0.33) % 1 + 1) % 1;
          const px = a.x + dx * (t * len);
          const py = a.y + dy * (t * len);
          const depth = Math.sin(t * Math.PI) * 0.5;
          const char = chars[Math.floor((depth + 0.5) * (chars.length - 1)) % chars.length];
          ctx.fillStyle = `rgba(0,0,0,${0.25 + depth * 0.35})`;
          ctx.fillText(char, px, py);
        }
      }

      // Draw nodes (pulsing)
      nodes.forEach((node, i) => {
        const pulse = 0.5 + 0.5 * Math.sin(time * 2 + i);
        const r = 6 + pulse * 2;
        const hue = stages[i].hue;
        ctx.fillStyle = `hsla(${hue}, 20%, 50%, ${0.2 + pulse * 0.25})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Node label
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText(stages[i].label, node.x, node.y - r - 10);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillText(`{${i}}`, node.x, node.y + r + 10);
      });

      time += 0.02;
      frameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <section className="w-full h-64 lg:h-80 border-y border-foreground/5">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ display: "block" }}
      />
    </section>
  );
}

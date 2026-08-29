"use client";

import { useEffect, useRef } from "react";

const stages = [
  { label: "RISK EVENT", angle: -Math.PI * 0.82 },
  { label: "DIAGNOSIS", angle: -Math.PI * 0.42 },
  { label: "POLICY CHECK", angle: 0 },
  { label: "RECOVERY", angle: Math.PI * 0.42 },
  { label: "OUTCOME", angle: Math.PI * 0.82 },
];

export function AnimatedSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let time = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.34;
      const nodes = stages.map((stage, index) => ({
        ...stage,
        x: cx + Math.cos(stage.angle + time * 0.12) * radius,
        y: cy + Math.sin(stage.angle + time * 0.12) * radius * 0.68,
        depth: Math.sin(stage.angle + time * 0.12),
        index,
      }));

      ctx.lineWidth = 1;
      nodes.forEach((node, index) => {
        const next = nodes[(index + 1) % nodes.length];
        ctx.strokeStyle = "rgba(46, 133, 108, 0.22)";
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();

        const progress = (time * 0.38 + index * 0.2) % 1;
        const px = node.x + (next.x - node.x) * progress;
        const py = node.y + (next.y - node.y) * progress;
        ctx.fillStyle = "rgba(91, 190, 151, 0.78)";
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = "rgba(46, 133, 108, 0.16)";
      ctx.setLineDash([3, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      nodes.sort((a, b) => a.depth - b.depth).forEach((node) => {
        const alpha = 0.32 + (node.depth + 1) * 0.22;
        ctx.fillStyle = `rgba(91, 190, 151, ${alpha})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4 + Math.max(node.depth, 0) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(18, 54, 44, ${0.35 + alpha * 0.5})`;
        ctx.fillText(node.label, node.x, node.y - 13);
      });

      ctx.fillStyle = "rgba(46, 133, 108, 0.14)";
      ctx.beginPath();
      ctx.arc(cx, cy, 28 + Math.sin(time * 2) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(46, 133, 108, 0.7)";
      ctx.stroke();
      ctx.fillStyle = "rgba(18, 54, 44, 0.75)";
      ctx.font = "11px monospace";
      ctx.fillText("AUDIT", cx, cy - 3);
      ctx.fillText("LEDGER", cx, cy + 11);

      time += 0.016;
      frameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}

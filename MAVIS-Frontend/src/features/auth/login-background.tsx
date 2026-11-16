"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";

// Illustrative topology only. Positions are deterministic for hydration and
// generated once, not recalculated on animation frames.
const clusters = [
  { x: 180, y: 200 },
  { x: 490, y: 640 },
  { x: 1260, y: 860 },
  { x: 1190, y: 110 },
].map((center, cluster) => {
  const nodes = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 8 + cluster * 0.4;
    const radius = 65 + ((i * 29) % 70);
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
  return { center, nodes };
});

export function LoginBackground() {
  const layer = useRef<HTMLDivElement>(null);
  const gradient = useId();
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(pointer: fine)");
    let frame = 0;
    let x = 0,
      y = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      element.style.setProperty("--pointer-x", "0px");
      element.style.setProperty("--pointer-y", "0px");
    };
    const move = (event: PointerEvent) => {
      if (reduced.matches || !pointer.matches || document.hidden) return;
      x = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 16;
      y = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 12;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          element.style.setProperty("--pointer-x", `${x.toFixed(2)}px`);
          element.style.setProperty("--pointer-y", `${y.toFixed(2)}px`);
        });
    };
    const visibility = () => {
      element.dataset["paused"] = String(document.hidden);
      if (document.hidden) reset();
    };
    visibility();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", reset);
    pointer.addEventListener("change", reset);
    return () => {
      reset();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", reset);
      pointer.removeEventListener("change", reset);
    };
  }, []);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      className="mavis-auth-background pointer-events-none fixed inset-0 overflow-hidden text-primary"
    >
      <svg
        viewBox="0 0 1440 1000"
        preserveAspectRatio="xMinYMid slice"
        focusable="false"
        className="mavis-auth-network"
      >
        <defs>
          <radialGradient id={gradient}>
            <stop stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="220" cy="280" rx="570" ry="460" fill={`url(#${gradient})`} />
        <ellipse cx="1330" cy="900" rx="500" ry="380" fill={`url(#${gradient})`} />
        {clusters.map(({ center, nodes }, cluster) => (
          <g
            key={cluster}
            className={`mavis-auth-cluster ${cluster > 1 ? "mavis-auth-extra" : ""}`}
            style={{ "--delay": `${-cluster * 5}s` } as CSSProperties}
          >
            {nodes.map((point, i) => {
              const next = nodes[(i + 1) % nodes.length]!;
              const path = `M ${center.x} ${center.y} L ${point.x} ${point.y} L ${next.x} ${next.y}`;
              return (
                <g key={i}>
                  <path d={path} className="mavis-auth-edge" />
                  {i % 2 === 0 && (
                    <path
                      d={path}
                      pathLength="100"
                      className="mavis-auth-signal"
                      style={{ animationDelay: `${-i * 1.3 - cluster}s` }}
                    />
                  )}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={i % 3 === 0 ? 3 : 1.7}
                    className="mavis-auth-node"
                  />
                </g>
              );
            })}
            <circle cx={center.x} cy={center.y} r="23" className="mavis-auth-halo" />
            <circle cx={center.x} cy={center.y} r="13" className="mavis-auth-halo" />
            <rect
              x={center.x - 5}
              y={center.y - 5}
              width="10"
              height="10"
              rx="3"
              className="mavis-auth-hub"
            />
          </g>
        ))}
        <path
          d="M180 200 C140 420 560 390 490 640 M490 640 C760 840 1000 740 1260 860"
          className="mavis-auth-edge mavis-auth-extra"
        />
      </svg>
    </div>
  );
}

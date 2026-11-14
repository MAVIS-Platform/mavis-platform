"use client";

import { useMemo, useRef, useState } from "react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { computeArchitectureImpact } from "@/lib/architecture/reverse-bfs";
import type { Response } from "@/lib/api/contracts";

type Studio = Response<"studioState">;

export type StudioQuickAction = {
  action: "START" | "STOP" | "SCALE";
  service: string;
  replicas?: number;
};

type LayoutMode = "LAYERED" | "CIRCULAR" | "GRID";

type DragPaletteItem = {
  id: string;
  label: string;
  badge: string;
  action: "START" | "STOP" | "SCALE";
  replicas?: number;
  delta?: number;
  tone: "primary" | "warning" | "danger" | "success";
};

const PALETTE_ITEMS: DragPaletteItem[] = [
  {
    id: "palette-scale-plus-1",
    label: "Scale +1 Replica",
    badge: "+1 POD",
    action: "SCALE",
    delta: 1,
    tone: "primary",
  },
  {
    id: "palette-scale-4",
    label: "Scale ×4 Cluster",
    badge: "×4 PODS",
    action: "SCALE",
    replicas: 4,
    tone: "primary",
  },
  {
    id: "palette-scale-8",
    label: "Scale ×8 Max Load",
    badge: "×8 PODS",
    action: "SCALE",
    replicas: 8,
    tone: "warning",
  },
  {
    id: "palette-stop",
    label: "Stop Container",
    badge: "FAULT",
    action: "STOP",
    tone: "danger",
  },
  {
    id: "palette-start",
    label: "Restart Service",
    badge: "RECOVER",
    action: "START",
    tone: "success",
  },
];

function parseCpuPercent(raw?: string | null): number {
  if (!raw) return 0;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Math.min(100, Math.max(0, Number(match[1]))) : 0;
}

function parseRamMiB(raw?: string | null): { usedMiB: number; limitMiB: number; percent: number } {
  if (!raw) return { usedMiB: 0, limitMiB: 512, percent: 0 };
  const parts = raw.split("/");
  const toMiB = (part?: string) => {
    if (!part) return 0;
    const m = part.trim().match(/(\d+(?:\.\d+)?)\s*(GiB|GB|MiB|MB|KiB|KB)?/i);
    if (!m) return 0;
    const val = Number(m[1]);
    const unit = (m[2] ?? "MiB").toUpperCase();
    if (unit.startsWith("G")) return val * 1024;
    if (unit.startsWith("K")) return val / 1024;
    return val;
  };
  const usedMiB = toMiB(parts[0]);
  const limitMiB = Math.max(1, toMiB(parts[1]) || 512);
  return {
    usedMiB,
    limitMiB,
    percent: Math.min(100, Math.max(0, (usedMiB / limitMiB) * 100)),
  };
}

function classifyArchetype(
  serviceName: string,
  elementType?: string,
  layer?: string,
): "DATABASE" | "GATEWAY" | "QUEUE" | "SERVICE" {
  const sig = `${serviceName} ${elementType ?? ""} ${layer ?? ""}`.toLowerCase();
  if (/(postgres|mysql|mongo|redis|cache|s3|bucket|elastic|search|db|database|data_store|storage)/.test(sig))
    return "DATABASE";
  if (/(kafka|rabbit|mq|broker|queue|event|stream|otel|prometheus|telemetry|monitor)/.test(sig))
    return "QUEUE";
  if (/(gateway|ingress|proxy|nginx|bff|edge|router|cdn|waf|shield|firewall|lb|balancer)/.test(sig))
    return "GATEWAY";
  return "SERVICE";
}

function getArchetypeTheme(
  archetype: "DATABASE" | "GATEWAY" | "QUEUE" | "SERVICE",
  isStopped: boolean,
  isSelected: boolean,
  isDropTarget: boolean,
  serviceName = "",
) {
  if (isStopped) {
    return {
      stroke: "#f43f5e",
      cardFill: "#2a0913",
      iconBg: "#4c0519",
      accent: "#fb7185",
      badgeText: "CRASHED",
      typeLabel: "503 FAULT",
    };
  }
  const lower = serviceName.toLowerCase();
  // Cohesive 4-Tier Semantic Palette:
  // 1. Edge / Ingress  -> Sky Cyan (#38bdf8)
  // 2. Compute / App   -> Indigo (#818cf8)
  // 3. Data / Storage  -> Emerald (#10b981)
  // 4. Broker / Infra  -> Amber (#f59e0b)
  const isEdge =
    archetype === "GATEWAY" ||
    /(cdn|cloudflare|cloudfront|waf|shield|firewall|ddos|load-balancer|lb|gateway|edge|ingress)/.test(
      lower,
    );
  const isData =
    archetype === "DATABASE" ||
    /(postgres|mysql|sql|db|settlement|redis|memcache|cache|mongo|dynamo|cassandra|nosql|s3|bucket|blob|minio|storage|elastic|opensearch|search|solr)/.test(
      lower,
    );
  const isInfra =
    archetype === "QUEUE" ||
    /(kafka|stream|broker|rabbit|amqp|celery|bull|mq|otel|prometheus|grafana|jaeger|monitor|telemetry)/.test(
      lower,
    );

  const badgeAndType = /(cdn|cloudflare|cloudfront)/.test(lower)
    ? { badgeText: "CDN", typeLabel: "EDGE POP CACHE" }
    : /(waf|shield|firewall|ddos)/.test(lower)
      ? { badgeText: "WAF", typeLabel: "EDGE FIREWALL" }
      : /(load-balancer|lb)/.test(lower)
        ? { badgeText: "LB", typeLabel: "LOAD BALANCER" }
        : /(redis|memcache|cache)/.test(lower)
          ? { badgeText: "CACHE", typeLabel: "IN-MEMORY KV" }
          : /(s3|bucket|blob|minio|storage)/.test(lower)
            ? { badgeText: "STORAGE", typeLabel: "OBJECT BUCKET" }
            : /(elastic|opensearch|search|solr)/.test(lower)
              ? { badgeText: "SEARCH", typeLabel: "FULL-TEXT INDEX" }
              : /(mongo|dynamo|cassandra|nosql)/.test(lower)
                ? { badgeText: "NOSQL", typeLabel: "DOCUMENT DB" }
                : /(rabbit|amqp|celery|bull)/.test(lower)
                  ? { badgeText: "MQ BUS", typeLabel: "TASK QUEUE" }
                  : /(otel|prometheus|grafana|jaeger|monitor|telemetry)/.test(lower)
                    ? { badgeText: "OTEL", typeLabel: "OBSERVABILITY" }
                    : /(worker|consumer|job|batch|cron)/.test(lower)
                      ? { badgeText: "WORKER", typeLabel: "ASYNC CONSUMER" }
                      : /(auth|sso|oauth|iam|keycloak)/.test(lower)
                        ? { badgeText: "AUTH", typeLabel: "IDENTITY / SSO" }
                        : /(lambda|serverless|fn|edge-fn)/.test(lower)
                          ? { badgeText: "FN", typeLabel: "SERVERLESS" }
                          : isEdge
                            ? { badgeText: "EDGE", typeLabel: "API GATEWAY" }
                            : isData
                              ? { badgeText: "DATA", typeLabel: "RELATIONAL DB" }
                              : isInfra
                                ? { badgeText: "STREAM", typeLabel: "EVENT BROKER" }
                                : { badgeText: "COMPUTE", typeLabel: "APP SERVER" };

  // Meta / Linear / Cloudcraft SE Standard Palette:
  // Unified dark graphite CAD chassis (#0f172a body, #1e293b top cap, #64748b structural wireframe)
  // with restrained semantic accent strictly on the inner functional emblem & icon.
  const accent = isEdge
    ? "#38bdf8"
    : isData
      ? "#34d399"
      : isInfra
        ? "#cbd5e1"
        : "#94a3b8";

  const base = {
    stroke: "#64748b",
    cardFill: "#0f172a",
    iconBg: "#1e293b",
    accent,
    ...badgeAndType,
  };

  if (isDropTarget || isSelected) {
    return { ...base, stroke: "#38bdf8", iconBg: "#0f2942", accent: "#38bdf8" };
  }
  return base;
}

function renderIsoBox(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  height: number,
  stroke: string,
  fillBase = "#0b1120",
  strokeWidth = 1.2,
  topFill?: string,
) {
  const topY = cy - height;
  const topPoints = `${cx},${topY - ry} ${cx + rx},${topY} ${cx},${topY + ry} ${cx - rx},${topY}`;
  const leftPoints = `${cx - rx},${topY} ${cx},${topY + ry} ${cx},${cy + ry} ${cx - rx},${cy}`;
  const rightPoints = `${cx},${topY + ry} ${cx + rx},${topY} ${cx + rx},${cy} ${cx},${cy + ry}`;
  return (
    <g>
      {/* Base solid silhouette so lines behind never bleed through */}
      <polygon
        points={`${cx},${topY - ry} ${cx + rx},${topY} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy} ${cx - rx},${topY}`}
        fill={fillBase}
      />
      {/* Left Medium-Lit Isometric Wall */}
      <polygon
        points={leftPoints}
        fill={fillBase}
        stroke={stroke}
        strokeOpacity="0.65"
        strokeWidth={strokeWidth * 0.9}
        strokeLinejoin="round"
      />
      <polygon points={leftPoints} fill={stroke} opacity="0.1" />
      {/* Right Deep-Shaded Isometric Wall */}
      <polygon
        points={rightPoints}
        fill="#050811"
        opacity="0.78"
        stroke={stroke}
        strokeOpacity="0.55"
        strokeWidth={strokeWidth * 0.9}
        strokeLinejoin="round"
      />
      {/* Top Illuminated Roof */}
      <polygon
        points={topPoints}
        fill={topFill ?? fillBase}
        stroke={stroke}
        strokeOpacity="0.9"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <polygon points={topPoints} fill={stroke} opacity="0.14" />
    </g>
  );
}

function renderNodeFunctionGlyph(
  name: string,
  archetype: string,
  cx: number,
  cy: number,
  color: string,
) {
  const n = name.toLowerCase();
  if (n.includes("cdn")) {
    return (
      <g stroke={color} strokeWidth="1.3" fill="none">
        <circle cx={cx} cy={cy} r="5.5" />
        <ellipse cx={cx} cy={cy} rx="2.6" ry="5.5" />
        <line x1={cx - 5.2} y1={cy} x2={cx + 5.2} y2={cy} />
      </g>
    );
  }
  if (n.includes("waf") || n.includes("shield") || n.includes("firewall") || n.includes("fraud")) {
    return (
      <path
        d={`M ${cx},${cy - 5.5} L ${cx + 4.8},${cy - 3.5} L ${cx + 4.8},${cy + 0.5} C ${cx + 4.8},${cy + 3.5} ${cx},${cy + 5.8} ${cx},${cy + 5.8} C ${cx},${cy + 5.8} ${cx - 4.8},${cy + 3.5} ${cx - 4.8},${cy + 0.5} L ${cx - 4.8},${cy - 3.5} Z`}
        stroke={color}
        strokeWidth="1.4"
        fill="none"
      />
    );
  }
  if (n.includes("auth") || n.includes("sso") || n.includes("iam")) {
    return (
      <g stroke={color} strokeWidth="1.4" fill="none">
        <rect x={cx - 4.2} y={cy - 1} width="8.4" height="6.2" rx="1.5" />
        <path d={`M ${cx - 2.4},${cy - 1} L ${cx - 2.4},${cy - 3.2} A 2.4 2.4 0 0 1 ${cx + 2.4},${cy - 3.2} L ${cx + 2.4},${cy - 1}`} />
      </g>
    );
  }
  if (n.includes("lambda") || n.includes("fn") || n.includes("serverless") || n.includes("redis") || n.includes("cache")) {
    return (
      <polygon
        points={`${cx + 1},${cy - 5.5} ${cx - 4.2},${cy + 0.5} ${cx - 0.3},${cy + 0.5} ${cx - 1.2},${cy + 5.5} ${cx + 4.2},${cy - 0.5} ${cx + 0.3},${cy - 0.5}`}
        stroke={color}
        strokeWidth="1.2"
        fill={color}
        fillOpacity="0.25"
      />
    );
  }
  if (n.includes("elastic") || n.includes("search")) {
    return (
      <g stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none">
        <circle cx={cx - 1} cy={cy - 1} r="3.8" />
        <line x1={cx + 1.8} y1={cy + 1.8} x2={cx + 5} y2={cy + 5} />
      </g>
    );
  }
  if (n.includes("mongo") || n.includes("nosql") || n.includes("doc")) {
    return (
      <path
        d={`M ${cx},${cy - 5.8} C ${cx + 4.2},${cy - 2.5} ${cx + 4.2},${cy + 2.5} ${cx},${cy + 5.8} C ${cx - 4.2},${cy + 2.5} ${cx - 4.2},${cy - 2.5} ${cx},${cy - 5.8} Z`}
        stroke={color}
        strokeWidth="1.4"
        fill="none"
      />
    );
  }
  if (n.includes("s3") || n.includes("storage") || n.includes("blob")) {
    return (
      <g stroke={color} strokeWidth="1.4" fill="none">
        <path d={`M ${cx - 4.8},${cy - 3.5} L ${cx + 4.8},${cy - 3.5} L ${cx + 3.6},${cy + 4.8} L ${cx - 3.6},${cy + 4.8} Z`} />
        <ellipse cx={cx} cy={cy - 3.5} rx="4.8" ry="1.6" />
      </g>
    );
  }
  if (n.includes("otel") || n.includes("prometheus") || n.includes("metric")) {
    return (
      <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <line x1={cx - 3.6} y1={cy + 4.5} x2={cx - 3.6} y2={cy + 0.5} />
        <line x1={cx} y1={cy + 4.5} x2={cx} y2={cy - 4.2} />
        <line x1={cx + 3.6} y1={cy + 4.5} x2={cx + 3.6} y2={cy - 1.5} />
      </g>
    );
  }
  if (n.includes("order")) {
    return (
      <g stroke={color} strokeWidth="1.3" fill="none">
        <path d={`M ${cx - 5},${cy - 4} L ${cx - 3.2},${cy - 4} L ${cx - 1.6},${cy + 2} L ${cx + 3.8},${cy + 2} L ${cx + 4.8},${cy - 2} L ${cx - 2.4},${cy - 2}`} />
        <circle cx={cx - 1.2} cy={cy + 4.2} r="1" fill={color} />
        <circle cx={cx + 3.2} cy={cy + 4.2} r="1" fill={color} />
      </g>
    );
  }
  if (n.includes("payment") || n.includes("ledger")) {
    return (
      <g stroke={color} strokeWidth="1.3" fill="none">
        <rect x={cx - 5.2} y={cy - 3.6} width="10.4" height="7.2" rx="1.4" />
        <line x1={cx - 5.2} y1={cy - 1} x2={cx + 5.2} y2={cy - 1} />
      </g>
    );
  }
  if (n.includes("inventory")) {
    return (
      <g stroke={color} strokeWidth="1.3" fill="none">
        <polygon points={`${cx},${cy - 5.2} ${cx + 4.8},${cy - 2.6} ${cx + 4.8},${cy + 2.6} ${cx},${cy + 5.2} ${cx - 4.8},${cy + 2.6} ${cx - 4.8},${cy - 2.6}`} />
        <polyline points={`${cx - 4.8},${cy - 2.6} ${cx},${cy} ${cx + 4.8},${cy - 2.6}`} />
        <line x1={cx} y1={cy} x2={cx} y2={cy + 5.2} />
      </g>
    );
  }
  if (archetype === "DATABASE") {
    return (
      <g stroke={color} strokeWidth="1.4" fill="none">
        <ellipse cx={cx} cy={cy - 3.5} rx="4.8" ry="2" />
        <path d={`M ${cx - 4.8},${cy - 3.5} L ${cx - 4.8},${cy + 3.5} A 4.8 2 0 0 0 ${cx + 4.8},${cy + 3.5} L ${cx + 4.8},${cy - 3.5}`} />
        <path d={`M ${cx - 4.8},${cy} A 4.8 1.8 0 0 0 ${cx + 4.8},${cy}`} />
      </g>
    );
  }
  if (archetype === "GATEWAY") {
    return (
      <g stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d={`M ${cx},${cy + 4.5} L ${cx},${cy}`} />
        <path d={`M ${cx},${cy} L ${cx - 4},${cy - 4}`} />
        <path d={`M ${cx},${cy} L ${cx + 4},${cy - 4}`} />
        <circle cx={cx - 4} cy={cy - 4.2} r="1.2" fill={color} />
        <circle cx={cx + 4} cy={cy - 4.2} r="1.2" fill={color} />
      </g>
    );
  }
  if (archetype === "QUEUE") {
    return (
      <g stroke={color} strokeWidth="1.5" strokeLinecap="round">
        <line x1={cx - 4.5} y1={cy - 3.2} x2={cx + 4.5} y2={cy - 3.2} />
        <line x1={cx - 4.5} y1={cy} x2={cx + 4.5} y2={cy} />
        <line x1={cx - 4.5} y1={cy + 3.2} x2={cx + 4.5} y2={cy + 3.2} />
      </g>
    );
  }
  return (
    <g stroke={color} strokeWidth="1.3" fill="none">
      <rect x={cx - 5} y={cy - 4.2} width="10" height="3.6" rx="1" />
      <rect x={cx - 5} y={cy + 0.8} width="10" height="3.6" rx="1" />
    </g>
  );
}

function render3DSeNodeSculpture(
  name: string,
  archetype: string,
  cx: number,
  cy: number,
  activePods: number,
  isStopped: boolean,
  theme: { stroke: string; cardFill: string; iconBg: string; accent: string },
) {
  const n = name.toLowerCase();
  const s = theme.stroke;
  const a = theme.accent;
  const fill = theme.cardFill;
  const top = theme.iconBg;
  const hScale = isStopped ? 0 : Math.min(activePods, 6) * 2.2;

  // 1. CDN EDGE: 3D Geodesic Network Sphere / Global POP Globe
  if (n.includes("cdn") || n.includes("cloudflare") || n.includes("cloudfront")) {
    const gy = cy - 16;
    const r = 24;
    return (
      <g>
        <circle cx={cx} cy={gy} r={r} fill={fill} stroke={s} strokeWidth="1.8" />
        {/* 3D Right-Hemisphere Shading */}
        <path
          d={`M ${cx},${gy - r} A ${r} ${r} 0 0 1 ${cx},${gy + r} A ${r * 0.45} ${r} 0 0 0 ${cx},${gy - r} Z`}
          fill="#050811"
          opacity="0.45"
        />
        {/* Latitude & Longitude Wireframe Meridians */}
        <ellipse cx={cx} cy={gy} rx={r} ry={r * 0.42} fill="none" stroke={a} strokeWidth="1.2" opacity="0.85" />
        <ellipse cx={cx} cy={gy} rx={r * 0.48} ry={r} fill="none" stroke={a} strokeWidth="1.2" opacity="0.85" />
        <line x1={cx - r} y1={gy} x2={cx + r} y2={gy} stroke={s} strokeWidth="1" opacity="0.6" />
        <line x1={cx} y1={gy - r} x2={cx} y2={gy + r} stroke={s} strokeWidth="1" opacity="0.6" />
        {/* Edge POP Satellite Nodes */}
        <circle cx={cx - 11} cy={gy - 8} r="2.8" fill={a} />
        <circle cx={cx + 12} cy={gy - 6} r="2.8" fill={a} />
        <circle cx={cx} cy={gy + 10} r="2.8" fill={a} />
      </g>
    );
  }

  // 2. WAF FIREWALL: 3D Brick Firewall Wall + Upright Heraldic Security Shield
  if (n.includes("waf") || n.includes("shield") || n.includes("firewall") || n.includes("ddos")) {
    const wy = cy - 6;
    return (
      <g>
        {/* 3D Isometric Firewall Barrier Wall */}
        {renderIsoBox(cx, wy, 36, 12, 24, s, fill, 1.4, top)}
        {/* Brick Mortar Lines on Left Wall */}
        <line x1={cx - 36} y1={wy - 8} x2={cx} y2={wy + 4} stroke={a} strokeWidth="1" opacity="0.55" />
        <line x1={cx - 36} y1={wy - 16} x2={cx} y2={wy - 4} stroke={a} strokeWidth="1" opacity="0.55" />
        {/* 3D Upright Security Shield Emblem in Front */}
        <path
          d={`M ${cx},${wy - 28} L ${cx + 15},${wy - 22} L ${cx + 15},${wy - 9} C ${cx + 15},${wy + 1} ${cx},${wy + 8} ${cx},${wy + 8} C ${cx},${wy + 8} ${cx - 15},${wy + 1} ${cx - 15},${wy - 9} L ${cx - 15},${wy - 22} Z`}
          fill={top}
          stroke={a}
          strokeWidth="1.8"
        />
        <path
          d={`M ${cx - 5},${wy - 11} L ${cx - 1},${wy - 7} L ${cx + 6},${wy - 15}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  // 3. LOAD BALANCER: 3D Cylindrical Traffic Distributor with 1 -> 3 Fan-Out Routing Arrows
  if (n.includes("load-balancer") || n.includes("lb")) {
    const h = 16 + hScale * 0.6;
    const by = cy - 4;
    return (
      <g>
        <path
          d={`M ${cx - 34},${by - h} L ${cx - 34},${by} A 34 16 0 0 0 ${cx + 34},${by} L ${cx + 34},${by - h} Z`}
          fill={fill}
          stroke={s}
          strokeWidth="1.5"
        />
        <ellipse cx={cx} cy={by - h} rx="34" ry="16" fill={top} stroke={s} strokeWidth="1.6" />
        {/* SE Standard 1-to-3 Load Distribution Fan-Out Arrows on Roof */}
        <g stroke={a} strokeWidth="1.8" strokeLinecap="round" fill="none">
          <circle cx={cx - 14} cy={by - h} r="3.2" fill={a} />
          <path d={`M ${cx - 11},${by - h} L ${cx + 12},${by - h - 7}`} />
          <path d={`M ${cx - 11},${by - h} L ${cx + 15},${by - h}`} />
          <path d={`M ${cx - 11},${by - h} L ${cx + 12},${by - h + 7}`} />
          <circle cx={cx + 13} cy={by - h - 7} r="2.3" fill="#ffffff" />
          <circle cx={cx + 16} cy={by - h} r="2.3" fill="#ffffff" />
          <circle cx={cx + 13} cy={by - h + 7} r="2.3" fill="#ffffff" />
        </g>
      </g>
    );
  }

  // 4. API GATEWAY: 3D Twin-Pillar Arch Portal Gate (SE Gateway Arch)
  if (archetype === "GATEWAY" || n.includes("gateway") || n.includes("edge")) {
    const gy = cy - 2;
    return (
      <g>
        {/* Left Gateway Pillar */}
        {renderIsoBox(cx - 18, gy - 4, 11, 6, 24, s, fill, 1.3, top)}
        {/* Right Gateway Pillar */}
        {renderIsoBox(cx + 18, gy + 4, 11, 6, 24, s, fill, 1.3, top)}
        {/* Top Bridging Gateway Arch Header */}
        {renderIsoBox(cx, gy - 22, 34, 14, 8, a, fill, 1.6, top)}
        {/* Bidirectional API Routing Glyph on Arch Roof */}
        <path
          d={`M ${cx - 12},${gy - 22} L ${cx + 12},${gy - 22} M ${cx + 7},${gy - 25} L ${cx + 12},${gy - 22} L ${cx + 7},${gy - 19}`}
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    );
  }

  // 5. S3 OBJECT STORAGE: 3D Tapered Storage Bucket with Handle Arc & Object Cubes
  if (n.includes("s3") || n.includes("storage") || n.includes("bucket") || n.includes("blob")) {
    const by = cy - 4;
    const topY = by - 24;
    return (
      <g>
        {/* Tapered Bucket Body (wider top rim 32px, narrower bottom base 23px) */}
        <path
          d={`M ${cx - 32},${topY} L ${cx - 23},${by} A 23 10 0 0 0 ${cx + 23},${by} L ${cx + 32},${topY} Z`}
          fill={fill}
          stroke={s}
          strokeWidth="1.6"
        />
        {/* Bucket Top Opening Rim */}
        <ellipse cx={cx} cy={topY} rx="32" ry="13" fill="#06101e" stroke={s} strokeWidth="1.6" />
        {/* Stored Object Cubes inside Bucket */}
        <polygon
          points={`${cx - 8},${topY - 2} ${cx},${topY - 6} ${cx + 8},${topY - 2} ${cx},${topY + 2}`}
          fill={a}
          opacity="0.85"
        />
        <polygon
          points={`${cx + 4},${topY + 2} ${cx + 12},${topY - 2} ${cx + 20},${topY + 2} ${cx + 12},${topY + 6}`}
          fill={s}
          opacity="0.75"
        />
        {/* Curved Bucket Bail Handle */}
        <path
          d={`M ${cx - 32},${topY} A 32 22 0 0 1 ${cx + 32},${topY}`}
          fill="none"
          stroke={a}
          strokeWidth="1.8"
          strokeDasharray="3 2"
        />
      </g>
    );
  }

  // 6. REDIS IN-MEMORY CACHE: 3D Hexagonal Memory Prism + High-Speed Lightning Bolt
  if (n.includes("redis") || n.includes("memcache") || n.includes("cache")) {
    const ry = cy - 4;
    const h = 18 + hScale * 0.5;
    const ty = ry - h;
    const hexTop = `${cx - 28},${ty} ${cx - 14},${ty - 12} ${cx + 14},${ty - 12} ${cx + 28},${ty} ${cx + 14},${ty + 12} ${cx - 14},${ty + 12}`;
    return (
      <g>
        {/* 3D Front Hexagonal Prism Walls */}
        <polygon
          points={`${cx - 28},${ty} ${cx - 14},${ty + 12} ${cx - 14},${ry + 12} ${cx - 28},${ry}`}
          fill={fill}
          stroke={s}
          strokeWidth="1.3"
        />
        <polygon
          points={`${cx - 14},${ty + 12} ${cx + 14},${ty + 12} ${cx + 14},${ry + 12} ${cx - 14},${ry + 12}`}
          fill={top}
          stroke={s}
          strokeWidth="1.3"
        />
        <polygon
          points={`${cx + 14},${ty + 12} ${cx + 28},${ty} ${cx + 28},${ry} ${cx + 14},${ry + 12}`}
          fill="#050811"
          stroke={s}
          strokeWidth="1.3"
        />
        {/* Hexagonal Top Face */}
        <polygon points={hexTop} fill={top} stroke={a} strokeWidth="1.6" />
        {/* Lightning Bolt on Roof */}
        <polygon
          points={`${cx + 3},${ty - 8} ${cx - 7},${ty} ${cx},${ty} ${cx - 3},${ty + 8} ${cx + 7},${ty} ${cx},${ty}`}
          fill="#ffffff"
        />
      </g>
    );
  }

  // 7. ELASTICSEARCH: 3D Inverted-Index Drum + 3D Magnifying Glass Lens
  if (n.includes("elastic") || n.includes("opensearch") || n.includes("search")) {
    const by = cy - 4;
    const h = 18;
    const ty = by - h;
    return (
      <g>
        <path
          d={`M ${cx - 30},${ty} L ${cx - 30},${by} A 30 13 0 0 0 ${cx + 30},${by} L ${cx + 30},${ty} Z`}
          fill={fill}
          stroke={s}
          strokeWidth="1.5"
        />
        <ellipse cx={cx} cy={ty} rx="30" ry="13" fill={top} stroke={s} strokeWidth="1.5" />
        {/* Bold 3D Magnifying Glass Emblem floating above Drum */}
        <circle cx={cx - 3} cy={ty - 4} r="9" fill="#06141f" stroke={a} strokeWidth="2.4" />
        <line
          x1={cx + 3.5}
          y1={ty + 2.5}
          x2={cx + 13}
          y2={ty + 11}
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
    );
  }

  // 8. POSTGRES / MONGODB / SQL DATABASE: Clean Multi-Platter 3D Cylinder (NO base tray underneath!)
  if (archetype === "DATABASE") {
    const h = 22 + hScale;
    const by = cy - 2;
    const ty = by - h;
    const isMongo = n.includes("mongo") || n.includes("nosql") || n.includes("doc");
    return (
      <g>
        {/* Cylinder Drum Body */}
        <path
          d={`M ${cx - 32},${ty} L ${cx - 32},${by} A 32 14 0 0 0 ${cx + 32},${by} L ${cx + 32},${ty} Z`}
          fill={fill}
          stroke={s}
          strokeWidth="1.6"
        />
        {/* Right-Half Cylinder Deep Shadow for 3D Curvature */}
        <path
          d={`M ${cx},${ty + 14} L ${cx},${by + 14} A 32 14 0 0 0 ${cx + 32},${by} L ${cx + 32},${ty} Z`}
          fill="#050811"
          opacity="0.45"
        />
        {/* Platter Rings */}
        {[0.34, 0.68].map((ratio, idx) => (
          <path
            key={idx}
            d={`M ${cx - 32},${by - h * ratio} A 32 14 0 0 0 ${cx + 32},${by - h * ratio}`}
            fill="none"
            stroke={a}
            strokeWidth="1.2"
            opacity="0.75"
          />
        ))}
        {/* Top Illuminated Elliptical Cap */}
        <ellipse cx={cx} cy={ty} rx="32" ry="14" fill={top} stroke={s} strokeWidth="1.6" />
        {isMongo ? (
          /* MongoDB Leaf Emblem on Top Cap */
          <path
            d={`M ${cx},${ty - 7} C ${cx + 6},${ty - 3} ${cx + 6},${ty + 3} ${cx},${ty + 7} C ${cx - 6},${ty + 3} ${cx - 6},${ty - 3} ${cx},${ty - 7} Z`}
            fill={a}
          />
        ) : (
          <>
            <ellipse cx={cx} cy={ty} rx="15" ry="6.5" fill="none" stroke={a} strokeWidth="1.2" opacity="0.85" />
            <circle cx={cx} cy={ty} r="3" fill={a} />
          </>
        )}
      </g>
    );
  }

  // 9. PROMETHEUS / OTEL OBSERVABILITY: 3D Ascending Telemetry Bar-Chart Histogram
  if (n.includes("otel") || n.includes("prometheus") || n.includes("metric") || n.includes("monitor")) {
    const by = cy - 2;
    return (
      <g>
        {/* 3 Ascending 3D Isometric Histogram Columns (Low -> Med -> High) */}
        {renderIsoBox(cx - 18, by, 9, 5, 12, s, fill, 1.3, top)}
        {renderIsoBox(cx, by + 2, 9, 5, 21, s, fill, 1.3, top)}
        {renderIsoBox(cx + 18, by + 4, 9, 5, 30, a, fill, 1.5, top)}
        {/* Floating Telemetry Pulse Line above Bars */}
        <polyline
          points={`${cx - 22},${by - 16} ${cx - 6},${by - 22} ${cx + 2},${by - 18} ${cx + 18},${by - 32}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={cx + 18} cy={by - 32} r="2.8" fill={a} />
      </g>
    );
  }

  // 10. KAFKA / RABBITMQ MESSAGE BROKER: SE Standard 3D Horizontal Message Pipe / Queue Cylinder
  if (archetype === "QUEUE" || n.includes("kafka") || n.includes("rabbit") || n.includes("mq") || n.includes("stream")) {
    const py = cy - 15;
    const isRabbit = n.includes("rabbit") || n.includes("amqp") || n.includes("bus");
    return (
      <g>
        {/* Horizontal 3D Cylinder Pipe Body: [======)> */}
        <path
          d={`M ${cx - 28},${py - 12} L ${cx + 24},${py - 12} A 8 12 0 0 1 ${cx + 24},${py + 12} L ${cx - 28},${py + 12} Z`}
          fill={fill}
          stroke={s}
          strokeWidth="1.6"
        />
        {/* Lower Pipe Shadow Band */}
        <path
          d={`M ${cx - 28},${py + 2} L ${cx + 26},${py + 2} A 8 12 0 0 1 ${cx + 24},${py + 12} L ${cx - 28},${py + 12} Z`}
          fill="#050811"
          opacity="0.45"
        />
        {/* Pipe Segment Rings */}
        <path d={`M ${cx - 8},${py - 12} A 7 12 0 0 1 ${cx - 8},${py + 12}`} fill="none" stroke={a} strokeWidth="1.2" opacity="0.7" />
        <path d={`M ${cx + 8},${py - 12} A 7 12 0 0 1 ${cx + 8},${py + 12}`} fill="none" stroke={a} strokeWidth="1.2" opacity="0.7" />
        {/* Left Pipe Opening Mouth */}
        <ellipse cx={cx - 28} cy={py} rx="7.5" ry="12" fill="#060c18" stroke={a} strokeWidth="1.6" />
        {/* Message Packets Flowing Inside Pipe */}
        {isRabbit ? (
          <polygon
            points={`${cx - 6},${py} ${cx + 8},${py - 5} ${cx + 4},${py + 5}`}
            fill="#ffffff"
          />
        ) : (
          <>
            <circle cx={cx - 16} cy={py} r="2.8" fill={a} />
            <circle cx={cx} cy={py} r="2.8" fill="#ffffff" />
            <circle cx={cx + 16} cy={py} r="2.8" fill={a} />
          </>
        )}
      </g>
    );
  }

  // 11. AUTH / SSO: 3D Security Padlock (Vault Body + Metallic U-Shackle Arch)
  if (n.includes("auth") || n.includes("sso") || n.includes("iam") || n.includes("oauth")) {
    const ly = cy - 3;
    return (
      <g>
        {/* U-Shaped Padlock Shackle Arch */}
        <path
          d={`M ${cx - 11},${ly - 16} L ${cx - 11},${ly - 27} A 11 9 0 0 1 ${cx + 11},${ly - 27} L ${cx + 11},${ly - 16}`}
          fill="none"
          stroke={a}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        {/* 3D Padlock Vault Body */}
        {renderIsoBox(cx, ly, 26, 13, 18, s, fill, 1.5, top)}
        {/* Keyhole Emblem on Front */}
        <circle cx={cx - 11} cy={ly - 7} r="2.4" fill="#ffffff" />
        <line x1={cx - 11} y1={ly - 5} x2={cx - 11} y2={ly - 1} stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </g>
    );
  }

  // 12. SERVERLESS FUNCTION: 3D Lambda (λ) Compute Prism
  if (n.includes("lambda") || n.includes("serverless") || n.includes("fn")) {
    const fy = cy - 4;
    return (
      <g>
        {renderIsoBox(cx, fy, 32, 16, 12, s, fill, 1.5, top)}
        {/* Bold Lambda λ Symbol on Roof */}
        <g stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d={`M ${cx - 6},${fy - 18} L ${cx - 1},${fy - 18} L ${cx + 6},${fy - 7}`} />
          <path d={`M ${cx + 1},${fy - 14} L ${cx - 6},${fy - 7}`} />
        </g>
      </g>
    );
  }

  // 13. ASYNC WORKER: 3D Multi-Core Microchip Die with Pins & Cog
  if (n.includes("worker") || n.includes("async") || n.includes("consumer") || n.includes("fraud")) {
    const wy = cy - 4;
    return (
      <g>
        {/* Microchip Contact Pins */}
        {[-12, 0, 12].map((off) => (
          <g key={off} stroke={a} strokeWidth="1.8" strokeLinecap="round">
            <line x1={cx - 24 + off * 0.6} y1={wy - 1 + off * 0.3} x2={cx - 31 + off * 0.6} y2={wy + 3 + off * 0.3} />
            <line x1={cx + 24 + off * 0.6} y1={wy - 1 - off * 0.3} x2={cx + 31 + off * 0.6} y2={wy + 3 - off * 0.3} />
          </g>
        ))}
        {renderIsoBox(cx, wy, 32, 16, 12, s, fill, 1.5, top)}
        {/* Processor Core & Gear Ring on Roof */}
        <ellipse cx={cx} cy={wy - 12} rx="11" ry="5.5" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeDasharray="3 2" />
        <circle cx={cx} cy={wy - 12} r="2.5" fill={a} />
      </g>
    );
  }

  // 14. MICROSERVICE CONTAINER (Order / Payment / Inventory / App Service): Clean Single 3D Container Unit + Domain Emblem
  const cyBase = cy - 3;
  const h = 15 + Math.min(activePods, 4) * 1.5;
  const roofY = cyBase - h;
  return (
    <g>
      {renderIsoBox(cx, cyBase, 34, 17, h, s, fill, 1.5, top)}
      {/* Container Status LEDs on Front-Left Wall */}
      <circle cx={cx - 20} cy={cyBase - h * 0.45} r="1.7" fill={a} />
      <circle cx={cx - 13} cy={cyBase - h * 0.45 + 3.2} r="1.7" fill="#10b981" />
      {/* Domain Emblem on Container Roof */}
      {renderNodeFunctionGlyph(name, archetype, cx, roofY, "#ffffff")}
    </g>
  );
}

export function StudioObservability({
  data,
  selected,
  onSelect,
  busy = false,
  onQuickAction,
  onSpawnBlock,
  canvasOnly = false,
  defaultView = "2D",
}: {
  data: Studio;
  selected: string;
  onSelect: (service: string) => void;
  busy?: boolean;
  onQuickAction?: (command: StudioQuickAction) => void;
  onSpawnBlock?: (presetKey: string) => string | undefined;
  canvasOnly?: boolean;
  defaultView?: "2D" | "3D";
}) {
  const { t } = useLocale();
  const [view, setView] = useState<"2D" | "3D">(defaultView);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("LAYERED");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [camera, setCamera] = useState({ yaw: 0.78, pitch: 0.52 });
  const [customOffsets, setCustomOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [draggedTool, setDraggedTool] = useState<DragPaletteItem | null>(null);
  const [dropTargetNode, setDropTargetNode] = useState<string | null>(null);
  const [traceId, setTraceId] = useState("");
  const [exportError, setExportError] = useState(false);

  const cameraDrag = useRef<{ x: number; y: number; mode: "ROTATE" | "PAN" } | null>(null);
  const nodeDrag = useRef<{
    service: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const reference = useApiQuery(
    "model",
    { modelId: data.modelVersionId ?? "", projectId: data.projectId ?? "" },
    { enabled: Boolean(data.modelVersionId && data.projectId) },
  );
  const telemetry = data.telemetry;
  const modelId = data.serviceMappings?.[selected];
  const workerImpact = useApiQuery(
    "impact",
    { modelId: data.modelVersionId ?? "", targetId: modelId ?? "" },
    { enabled: Boolean(data.modelVersionId && modelId) },
  );
  const impact = useMemo(
    () =>
      reference.data && modelId
        ? computeArchitectureImpact(reference.data, modelId, "all", workerImpact.data?.paths ?? [])
        : null,
    [reference.data, modelId, workerImpact.data],
  );
  const affected = new Set(impact?.upstreamImpacted.map((item) => item.elementId) ?? []);

  const staticEdges = useMemo(
    () =>
      reference.data?.edges.flatMap((edge) => {
        const from = Object.entries(data.serviceMappings ?? {}).find(
          ([, id]) => id === edge.from,
        )?.[0];
        const to = Object.entries(data.serviceMappings ?? {}).find(([, id]) => id === edge.to)?.[0];
        return from && to
          ? [{ from, to, id: edge.id, protocol: edge.protocol ?? "HTTP" }]
          : [];
      }) ?? [],
    [reference.data, data.serviceMappings],
  );

  // Compute deterministic topological tier for LAYERED layout (invariant under STOP/START/SCALE so nodes never jump)
  const serviceDepth = useMemo(() => {
    const depths = new Map<string, number>();
    if (staticEdges.length > 0) {
      data.services.forEach((s) => depths.set(s, 0));
      for (let pass = 0; pass < data.services.length; pass++) {
        for (const edge of staticEdges) {
          const dFrom = depths.get(edge.from) ?? 0;
          const dTo = depths.get(edge.to) ?? 0;
          if (dTo <= dFrom) {
            depths.set(edge.to, Math.min(3, dFrom + 1));
          }
        }
      }
      data.services.forEach((s) => {
        const arch = classifyArchetype(s);
        if ((arch === "DATABASE" || arch === "QUEUE") && (depths.get(s) ?? 0) >= 2) {
          depths.set(s, 3);
        }
      });
      return depths;
    }

    // Deterministic architectural tiering when staticEdges is empty (Sandbox mode)
    data.services.forEach((s) => {
      const lower = s.toLowerCase();
      const arch = classifyArchetype(s);
      if (arch === "GATEWAY" || /(cdn|waf|shield|firewall|load-balancer|gateway|edge|ingress)/.test(lower)) {
        depths.set(s, 0);
      } else if (
        arch === "DATABASE" ||
        arch === "QUEUE" ||
        /(postgres|mysql|mongo|redis|cache|s3|storage|elastic|search|kafka|rabbit|mq|otel|prometheus|db|settlement)/.test(
          lower,
        )
      ) {
        depths.set(s, 3);
      } else if (/(payment|inventory|fraud|worker|async|billing|shipping|notification)/.test(lower)) {
        depths.set(s, 2);
      } else {
        depths.set(s, 1);
      }
    });
    return depths;
  }, [data.services, staticEdges]);

  const project3DPoint = useMemo(() => {
    const cosY = Math.cos(camera.yaw);
    const sinY = Math.sin(camera.yaw);
    // Lock standard 2:1 orthographic isometric elevation (30° tilt) so the board never flips or warps
    const cosP = 0.866;
    const sinP = 0.5;
    return (wx: number, wy: number, wz: number) => {
      const rx = wx * cosY - wz * sinY;
      const rz = wx * sinY + wz * cosY;
      const ry = wy * cosP + rz * sinP;
      const depthZ = -wy * sinP + rz * cosP;
      return {
        x: 600 + rx,
        y: 325 + ry,
        z: depthZ,
      };
    };
  }, [camera.yaw]);

  const positions = useMemo(() => {
    const raw = new Map<string, { x: number; y: number; z: number; tier: number }>();
    const total = Math.max(1, data.services.length);

    const tierGroups = new Map<number, string[]>();
    data.services.forEach((name) => {
      const tier = serviceDepth.get(name) ?? 0;
      const list = tierGroups.get(tier) ?? [];
      list.push(name);
      tierGroups.set(tier, list);
    });
    const tierKeys = [...tierGroups.keys()].sort((a, b) => a - b);

    // Split any crowded tier (> 4 nodes) into balanced sub-columns so nodes never stack or collide
    const effectiveColumns: Array<{ tier: number; nodes: string[] }> = [];
    for (const tier of tierKeys) {
      const list = tierGroups.get(tier) ?? [];
      const maxPerCol = 4;
      for (let i = 0; i < list.length; i += maxPerCol) {
        effectiveColumns.push({ tier, nodes: list.slice(i, i + maxPerCol) });
      }
    }
    const colLocation = new Map<string, { colIdx: number; rowIdx: number; rowCount: number }>();
    effectiveColumns.forEach((col, colIdx) => {
      col.nodes.forEach((name, rowIdx) => {
        colLocation.set(name, { colIdx, rowIdx, rowCount: col.nodes.length });
      });
    });
    const totalCols = Math.max(1, effectiveColumns.length);

    data.services.forEach((name, index) => {
      const tier = serviceDepth.get(name) ?? 0;
      const offset = customOffsets[name] ?? { x: 0, y: 0 };
      const pinned = pinnedPositions[name];

      if (view === "3D") {
        let wx = 0;
        let wz = 0;
        if (layoutMode === "CIRCULAR") {
          const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
          const radius = Math.min(340, 210 + total * 8);
          wx = Math.cos(angle) * radius;
          wz = Math.sin(angle) * radius;
        } else if (layoutMode === "GRID") {
          const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
          const col = index % cols;
          const row = Math.floor(index / cols);
          const rows = Math.ceil(total / cols);
          const spX = Math.min(200, 680 / Math.max(1, cols - 1));
          const spZ = Math.min(185, 560 / Math.max(1, rows - 1));
          wx = (col - (cols - 1) / 2) * spX;
          wz = (row - (rows - 1) / 2) * spZ;
        } else {
          const loc = colLocation.get(name) ?? { colIdx: 0, rowIdx: 0, rowCount: 1 };
          const spX = totalCols <= 1 ? 0 : Math.min(220, 720 / (totalCols - 1));
          const spZ = loc.rowCount <= 1 ? 0 : Math.min(185, 520 / (loc.rowCount - 1));
          wx = (loc.colIdx - (totalCols - 1) / 2) * spX;
          wz = (loc.rowIdx - (loc.rowCount - 1) / 2) * spZ;
        }
        const proj = project3DPoint(wx, 0, wz);
        const px = (pinned ? pinned.x : proj.x) + offset.x;
        const py = (pinned ? pinned.y : proj.y) + offset.y;
        raw.set(name, {
          x: px,
          y: py,
          z: proj.z,
          tier,
        });
        return;
      }

      // 2D Mode Coordinates
      let x = 0;
      let y = 0;
      if (layoutMode === "CIRCULAR") {
        const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
        x = Math.cos(angle) * 360;
        y = Math.sin(angle) * 215;
      } else if (layoutMode === "GRID") {
        const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
        const col = index % cols;
        const row = Math.floor(index / cols);
        const rows = Math.ceil(total / cols);
        const spX = Math.min(250, 920 / Math.max(1, cols - 1));
        const spY = Math.min(145, 460 / Math.max(1, rows - 1));
        x = (col - (cols - 1) / 2) * spX;
        y = (row - (rows - 1) / 2) * spY;
      } else {
        const loc = colLocation.get(name) ?? { colIdx: 0, rowIdx: 0, rowCount: 1 };
        const spX = totalCols <= 1 ? 0 : Math.min(260, 920 / (totalCols - 1));
        const spY = loc.rowCount <= 1 ? 0 : Math.min(145, 460 / (loc.rowCount - 1));
        x = (loc.colIdx - (totalCols - 1) / 2) * spX;
        y = (loc.rowIdx - (loc.rowCount - 1) / 2) * spY;
      }
      let px = (pinned ? pinned.x : 600 + x) + offset.x;
      let py = (pinned ? pinned.y : 330 + y) + offset.y;
      if (snapToGrid && (offset.x !== 0 || offset.y !== 0 || Boolean(pinned))) {
        px = Math.round(px / 16) * 16;
        py = Math.round(py / 16) * 16;
      }
      raw.set(name, {
        x: px,
        y: py,
        z: tier,
        tier,
      });
    });

    return raw;
  }, [
    data.services,
    serviceDepth,
    layoutMode,
    view,
    project3DPoint,
    customOffsets,
    pinnedPositions,
    snapToGrid,
  ]);

  function resolveLiveReplicas(serviceName: string): number {
    const live = telemetry?.services.find((item) => item.service === serviceName);
    if (live) return live.runningReplicas;
    const confirmed = [...data.actions]
      .reverse()
      .find((item) => item.service === serviceName && item.status === "CONFIRMED");
    return confirmed?.result?.replicasAfter ?? 1;
  }

  function applyPaletteToolToService(tool: DragPaletteItem, targetService: string) {
    if (busy || !onQuickAction) return;
    onSelect(targetService);
    if (tool.action === "STOP") {
      onQuickAction({ action: "STOP", service: targetService });
      return;
    }
    if (tool.action === "START") {
      onQuickAction({ action: "START", service: targetService });
      return;
    }
    const current = resolveLiveReplicas(targetService);
    const nextReplicas = tool.delta
      ? Math.max(1, Math.min(8, (current <= 0 ? 1 : current) + tool.delta))
      : Math.max(1, Math.min(8, tool.replicas ?? 2));
    onQuickAction({ action: "SCALE", service: targetService, replicas: nextReplicas });
  }

  async function downloadGraph(png = false) {
    if (!svg.current) return;
    try {
      const url = png
        ? await captureStudioImage(svg.current)
        : URL.createObjectURL(
            new Blob([serializeStudioGraph(svg.current)], { type: "image/svg+xml;charset=utf-8" }),
          );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `studio-${data.sessionId}-${view}.${png ? "png" : "svg"}`;
      anchor.click();
      if (!png) URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    }
  }

  const selectedLive = telemetry?.services.find((item) => item.service === selected);
  const selectedReplicas = resolveLiveReplicas(selected);

  // Compute Project Deployment & Scaling Impact Matrix rows (Static AST + Live Docker/OTel Delta)
  const deploymentRows = useMemo(() => {
    return data.services.map((serviceName) => {
      const elId = data.serviceMappings?.[serviceName];
      const element = reference.data?.elements.find((el) => el.id === elId);
      const inboundStatic = staticEdges.filter((e) => e.to === serviceName);
      const outboundStatic = staticEdges.filter((e) => e.from === serviceName);
      const live = telemetry?.services.find((item) => item.service === serviceName);
      const latestAction = [...data.actions]
        .reverse()
        .find((item) => item.service === serviceName && item.status === "CONFIRMED");
      const firstAction = data.actions.find(
        (item) => item.service === serviceName && item.status === "CONFIRMED",
      );
      const replicasBefore = firstAction?.result?.replicasBefore ?? 1;
      const replicasNow = live?.runningReplicas ?? latestAction?.result?.replicasAfter ?? 1;
      const cpuValues = (live?.stats ?? []).map((s) => parseCpuPercent(s.cpu));
      const ramValues = (live?.stats ?? []).map((s) => parseRamMiB(s.memory));
      const avgCpu =
        cpuValues.length > 0
          ? cpuValues.reduce((acc, v) => acc + v, 0) / cpuValues.length
          : 0;
      const perInstanceRamMiB =
        ramValues.length > 0
          ? ramValues.reduce((acc, v) => acc + v.usedMiB, 0) / ramValues.length
          : 0;
      const ramLimitMiB = ramValues[0]?.limitMiB ?? 512;
      const totalServiceRamMiB =
        ramValues.length > 1
          ? ramValues.reduce((acc, v) => acc + v.usedMiB, 0)
          : perInstanceRamMiB * Math.max(0, replicasNow);
      const p95Before = latestAction?.result?.metricsBefore?.["p95LatencyMs"];
      const p95After = latestAction?.result?.metricsAfter?.["p95LatencyMs"];
      const reqBefore = latestAction?.result?.metricsBefore?.["requestCount"];
      const reqAfter = latestAction?.result?.metricsAfter?.["requestCount"];
      const errAfter = latestAction?.result?.metricsAfter?.["errorRatePercent"];

      const downstreamServices = outboundStatic.map((e) => e.to);
      const bottleneckTarget = downstreamServices.find((ds) => {
        const dsReplicas = resolveLiveReplicas(ds);
        return replicasNow >= 4 && dsReplicas <= 1;
      });

      return {
        serviceName,
        layer: element?.layer ?? "domain",
        elementType: element?.elementType ?? "SERVICE_CONTAINER",
        evidenceCount: element?.evidence?.length ?? 0,
        inboundCount: inboundStatic.length,
        outboundCount: outboundStatic.length,
        protocols: [...new Set([...inboundStatic, ...outboundStatic].map((e) => e.protocol))].join(
          ", ",
        ),
        replicasBefore,
        replicasNow,
        avgCpu,
        perInstanceRamMiB,
        totalServiceRamMiB,
        ramLimitMiB,
        p95Before: typeof p95Before === "number" ? p95Before : undefined,
        p95After: typeof p95After === "number" ? p95After : undefined,
        reqBefore: typeof reqBefore === "number" ? reqBefore : undefined,
        reqAfter: typeof reqAfter === "number" ? reqAfter : undefined,
        errAfter: typeof errAfter === "number" ? errAfter : undefined,
        bottleneckTarget,
      };
    });
  }, [data.services, data.serviceMappings, data.actions, reference.data, staticEdges, telemetry]);

  const totalRunningInstances = deploymentRows.reduce((sum, r) => sum + r.replicasNow, 0);
  const totalRamMiB = deploymentRows.reduce((sum, r) => sum + r.totalServiceRamMiB, 0);
  const avgClusterCpu =
    deploymentRows.length > 0
      ? deploymentRows.reduce((sum, r) => sum + r.avgCpu, 0) / deploymentRows.length
      : 0;

  return (
    <div className={canvasOnly ? "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden" : "space-y-4"}>
      {exportError && <p role="alert">{t("Could not export graph")}</p>}

      {/* Top Studio Viewport & 360° Orbit Pill (in canvasOnly mode) */}
      {canvasOnly ? (
        <div className="pointer-events-auto absolute top-2.5 right-3 z-10 inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-950/85 p-1 shadow-md backdrop-blur-md">
          {view === "3D" && (
            <div className="flex items-center gap-0.5 border-r border-slate-800 pr-1">
              <button
                type="button"
                title="Xoay trái 45° (hoặc giữ chuột kéo trên nền để xoay 360°)"
                onClick={() => setCamera((c) => ({ ...c, yaw: c.yaw - Math.PI / 4 }))}
                className="rounded-full px-2 py-0.5 font-mono text-[11px] text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                ⟲
              </button>
              <button
                type="button"
                title="Góc xoay 360° hiện tại (Click để về góc chuẩn Isometric 45°)"
                onClick={() => {
                  setCamera({ yaw: 0.78, pitch: 0.52 });
                  setPan({ x: 0, y: 0 });
                  setZoom(1);
                  setCustomOffsets({});
                  setPinnedPositions({});
                }}
                className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                {Math.round((((camera.yaw * 180) / Math.PI) % 360 + 360) % 360)}°
              </button>
              <button
                type="button"
                title="Xoay phải 45° (hoặc giữ chuột kéo trên nền để xoay 360°)"
                onClick={() => setCamera((c) => ({ ...c, yaw: c.yaw + Math.PI / 4 }))}
                className="rounded-full px-2 py-0.5 font-mono text-[11px] text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                ⟳
              </button>
            </div>
          )}
          <div className="mr-1 flex items-center gap-0.5 border-r border-slate-700/80 pr-1.5">
            <button
              type="button"
              title="Zoom out (Thu nhỏ góc nhìn như draw.io để mở rộng không gian)"
              onClick={() => setZoom((z) => Math.max(0.22, Number((z * 0.85).toFixed(2))))}
              className="rounded-full px-1.5 py-0.5 font-mono text-[11px] text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              −
            </button>
            <button
              type="button"
              title="Tỷ lệ phóng to/thu nhỏ hiện tại (Click để đưa về 100% chính giữa)"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              title="Zoom in (Phóng to góc nhìn)"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z * 1.18).toFixed(2))))}
              className="rounded-full px-1.5 py-0.5 font-mono text-[11px] text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              +
            </button>
          </div>
          {(["2D", "3D"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold transition ${
                view === mode
                  ? "bg-slate-100 text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <h3 className="mr-auto font-medium">{t("Runtime topology and impact")}</h3>
          {(["2D", "3D"] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={view === mode ? "default" : "outline"}
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
            >
              {mode}
            </Button>
          ))}
          <div className="flex flex-wrap items-center gap-1 border-l border-slate-700/70 pl-2">
            {(
              [
                ["LAYERED", "Layered"],
                ["CIRCULAR", "Circular"],
                ["GRID", "Grid"],
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                size="sm"
                variant={layoutMode === mode ? "secondary" : "outline"}
                onClick={() => {
                  setLayoutMode(mode);
                  setCustomOffsets({});
                }}
              >
                {t(label)}
              </Button>
            ))}
          </div>
          {view === "3D" && (
            <div className="flex flex-wrap items-center gap-1 border-l border-slate-700/70 pl-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw - 0.2 }))}
              >
                {t("Rotate left")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw + 0.2 }))}
              >
                {t("Rotate right")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCamera((value) => ({ ...value, pitch: Math.min(0.95, value.pitch + 0.15) }))
                }
              >
                {t("Tilt up")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCamera((value) => ({ ...value, pitch: Math.max(-0.6, value.pitch - 0.15) }))
                }
              >
                {t("Tilt down")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera({ yaw: 0.55, pitch: 0.38 })}
              >
                {t("Isometric")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera({ yaw: 0.0, pitch: 0.92 })}
              >
                {t("Top-down")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera({ yaw: 0.2, pitch: 0.08 })}
              >
                {t("Elevation")}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1 border-l border-slate-700/70 pl-2">
            <Button
              size="sm"
              variant="outline"
              aria-label={t("Zoom in")}
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
            >
              +
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={t("Zoom out")}
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
            >
              −
            </Button>
            <Button
              size="sm"
              variant={snapToGrid ? "secondary" : "outline"}
              onClick={() => setSnapToGrid((prev) => !prev)}
            >
              {t("Snap to grid")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCustomOffsets({});
                setPinnedPositions({});
                setPan({ x: 0, y: 0 });
                setZoom(1);
                setCamera({ yaw: 0.45, pitch: 0.35 });
              }}
            >
              {t("Reset layout")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1 border-l border-slate-700/70 pl-2">
            <Button size="sm" variant="outline" onClick={() => void downloadGraph()}>
              {t("Export graph")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void downloadGraph(true)}>
              {t("Export snapshot image")}
            </Button>
          </div>
        </div>
      )}

      {/* Drag-and-Drop Action Palette (Drag onto any 2D/3D Service Block) */}
      {!canvasOnly && (
        <div className="rounded-lg border bg-card p-3 shadow-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("Studio Action Palette")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {PALETTE_ITEMS.map((item) => {
              const active = draggedTool?.id === item.id;
              return (
                <div
                  key={item.id}
                  draggable={!busy}
                  onDragStart={(event) => {
                    if (busy) {
                      event.preventDefault();
                      return;
                    }
                    setDraggedTool(item);
                    event.dataTransfer.setData("application/x-mavis-studio-tool", item.id);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => {
                    setDraggedTool(null);
                    setDropTargetNode(null);
                  }}
                  onClick={() => {
                    if (selected && !busy) {
                      applyPaletteToolToService(item, selected);
                    }
                  }}
                  className={`flex cursor-grab select-none flex-col justify-between rounded-md border p-2 text-left text-xs transition active:cursor-grabbing ${
                    busy
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-primary hover:bg-accent/40"
                  } ${active ? "ring-2 ring-primary" : ""}`}
                  title={`${t(item.label)} — ${t("Drop onto a service node to execute")}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                      {item.badge}
                    </span>
                    <span className="text-[10px] text-muted-foreground">⋮⋮</span>
                  </div>
                  <span className="mt-1.5 font-medium">{t(item.label)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive 2D/3D Studio Canvas + Volumetric 3D Isometric Server Racks & Stacked Replica Cubes */}
      <div
        className={
          canvasOnly
            ? "relative flex min-h-0 flex-1 overflow-hidden"
            : "relative max-w-full overflow-x-auto"
        }
      >
        <svg
          ref={svg}
          data-studio-graph="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 660"
          className={
            canvasOnly
              ? "h-full w-full select-none bg-[#070b14]"
              : "min-w-[640px] w-full select-none rounded-lg border bg-background shadow-inner"
          }
          role="group"
          aria-label={t("Runtime topology and impact")}
          style={{
            ...(canvasOnly ? {} : { maxHeight: 560 }),
            touchAction: view === "3D" || draggingNode ? "none" : "auto",
            cursor: draggingNode ? "grabbing" : view === "3D" ? "grab" : "default",
          }}
          onWheel={(event) => {
            if (!canvasOnly) return;
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.12 : 0.89;
            const nextZoom = Math.max(0.22, Math.min(2.5, Number((zoom * factor).toFixed(3))));
            if (nextZoom === zoom) return;
            if (svg.current) {
              const rect = svg.current.getBoundingClientRect();
              const svgX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 1200;
              const svgY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 660;
              const ratio = nextZoom / zoom;
              setPan((prev) => ({
                x: Math.max(-3600, Math.min(3600, svgX - 600 - (svgX - 600 - prev.x) * ratio)),
                y: Math.max(-2400, Math.min(2400, svgY - 330 - (svgY - 330 - prev.y) * ratio)),
              }));
            }
            setZoom(nextZoom);
          }}
          onDragOver={(event) => {
            if (busy) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            const spawnArch = event.dataTransfer.getData("application/x-mavis-studio-spawn");
            if (!spawnArch || !onSpawnBlock) return;
            event.preventDefault();
            const createdName = onSpawnBlock(spawnArch);
            if (createdName && svg.current) {
              const rect = svg.current.getBoundingClientRect();
              const svgX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 1200;
              const svgY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 660;
              const worldX = (svgX - 600 - pan.x) / zoom + 600;
              const worldY = (svgY - 330 - pan.y) / zoom + 330;
              setPinnedPositions((prev) => ({
                ...prev,
                [createdName]: {
                  x: Math.round(worldX),
                  y: Math.round(worldY),
                },
              }));
            }
          }}
          onPointerDown={(event) => {
            cameraDrag.current = {
              x: event.clientX,
              y: event.clientY,
              mode:
                view === "3D" && !event.shiftKey && event.button === 0 ? "ROTATE" : "PAN",
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={() => {
            cameraDrag.current = null;
            nodeDrag.current = null;
            setDraggingNode(null);
          }}
          onPointerCancel={() => {
            cameraDrag.current = null;
            nodeDrag.current = null;
            setDraggingNode(null);
          }}
          onPointerMove={(event) => {
            if (nodeDrag.current && svg.current) {
              const rect = svg.current.getBoundingClientRect();
              const scaleX = 1200 / Math.max(1, rect.width);
              const scaleY = 660 / Math.max(1, rect.height);
              const dx = ((event.clientX - nodeDrag.current.startX) * scaleX) / zoom;
              const dy = ((event.clientY - nodeDrag.current.startY) * scaleY) / zoom;
              if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                nodeDrag.current.moved = true;
              }
              const targetService = nodeDrag.current.service;
              const nextX = nodeDrag.current.origX + dx;
              const nextY = nodeDrag.current.origY + dy;
              setCustomOffsets((prev) => ({
                ...prev,
                [targetService]: {
                  x: nextX,
                  y: nextY,
                },
              }));
              return;
            }
            if (!cameraDrag.current) return;
            const dx = event.clientX - cameraDrag.current.x;
            const dy = event.clientY - cameraDrag.current.y;
            cameraDrag.current = {
              x: event.clientX,
              y: event.clientY,
              mode: cameraDrag.current.mode,
            };
            if (cameraDrag.current.mode === "ROTATE") {
              setCamera((value) => ({
                ...value,
                // Smooth 360° horizontal turntable rotation (left-to-right around the top-down view)
                yaw: value.yaw - dx * 0.0085,
                pitch: 0.52,
              }));
            } else {
              setPan((prev) => ({
                x: Math.max(-3600, Math.min(3600, prev.x + dx * 1.15)),
                y: Math.max(-2400, Math.min(2400, prev.y + dy * 1.15)),
              }));
            }
          }}
        >
          <defs>
            <pattern id="studio-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                opacity="0.08"
              />
            </pattern>
            <marker
              id="studio-arrow-live"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--primary)" />
            </marker>
            <marker
              id="studio-arrow-fault"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--destructive)" />
            </marker>
          </defs>

          {/* Infinite Camera Viewport Transform (draw.io / Figma style proportional zoom & pan) */}
          <g
            transform={`translate(${600 + pan.x}, ${330 + pan.y}) scale(${zoom}) translate(-600, -330)`}
          >
            {/* Infinite Studio Blueprint Grid (spans 10,800 × 10,800 world units when zoomed out) */}
            <rect x="-4800" y="-4800" width="10800" height="10800" fill="url(#studio-grid)" />

          {/* 3D Top-Down Turntable Architecture Platform Deck (orbits 360° left-to-right, always viewed from above) */}
          {view === "3D" &&
            (() => {
              const halfW = 380;
              const halfD = 380;
              const topCorners = [
                project3DPoint(-halfW, 14, -halfD),
                project3DPoint(halfW, 14, -halfD),
                project3DPoint(halfW, 14, halfD),
                project3DPoint(-halfW, 14, halfD),
              ];
              const botCorners = [
                project3DPoint(-halfW, 28, -halfD),
                project3DPoint(halfW, 28, -halfD),
                project3DPoint(halfW, 28, halfD),
                project3DPoint(-halfW, 28, halfD),
              ];
              const topPoly = topCorners.map((p) => `${p.x},${p.y}`).join(" ");
              const div1A = project3DPoint(-halfW * 0.33, 14, -halfD);
              const div1B = project3DPoint(-halfW * 0.33, 14, halfD);
              const div2A = project3DPoint(halfW * 0.33, 14, -halfD);
              const div2B = project3DPoint(halfW * 0.33, 14, halfD);
              const crossA = project3DPoint(-halfW, 14, 0);
              const crossB = project3DPoint(halfW, 14, 0);
              return (
                <g>
                  {/* Solid Top-Down Tabletop Surface (occludes back edges so view is ALWAYS unmistakably from above) */}
                  <polygon
                    points={topPoly}
                    fill="#0a101d"
                    opacity="0.95"
                    stroke="#334155"
                    strokeOpacity="0.55"
                    strokeWidth="1.4"
                  />
                  {/* Front-Facing 3D Slab Rim Walls ONLY (t1.x > t2.x in clockwise screen order = lower front rim) */}
                  {[0, 1, 2, 3].map((i) => {
                    const next = (i + 1) % 4;
                    const t1 = topCorners[i]!;
                    const t2 = topCorners[next]!;
                    if (t1.x <= t2.x) return null;
                    const b1 = botCorners[i]!;
                    const b2 = botCorners[next]!;
                    return (
                      <polygon
                        key={i}
                        points={`${t1.x},${t1.y} ${t2.x},${t2.y} ${b2.x},${b2.y} ${b1.x},${b1.y}`}
                        fill="#1e293b"
                        stroke="#334155"
                        strokeWidth="1"
                        opacity="0.85"
                      />
                    );
                  })}
                  {/* Inner Rotating Tier Divider Lines */}
                  <line
                    x1={div1A.x}
                    y1={div1A.y}
                    x2={div1B.x}
                    y2={div1B.y}
                    stroke="currentColor"
                    strokeDasharray="4 5"
                    opacity="0.14"
                  />
                  <line
                    x1={div2A.x}
                    y1={div2A.y}
                    x2={div2B.x}
                    y2={div2B.y}
                    stroke="currentColor"
                    strokeDasharray="4 5"
                    opacity="0.14"
                  />
                  <line
                    x1={crossA.x}
                    y1={crossA.y}
                    x2={crossB.x}
                    y2={crossB.y}
                    stroke="currentColor"
                    strokeDasharray="3 6"
                    opacity="0.09"
                  />
                </g>
              );
            })()}

          {/* Legend & Viewport Metadata (hidden in clean canvasOnly mode) */}
          {!canvasOnly && (
            <>
              <text x="20" y="26" fill="currentColor" fontSize="12">
                {t("Static dependencies (dashed)")}
              </text>
              <text x="20" y="44" fill="currentColor" fontSize="12">
                {t("Observed runtime (solid)")}
              </text>
              <text x="1180" y="26" fill="currentColor" fontSize="12" textAnchor="end">
                {view}
              </text>
              <text x="1180" y="44" fill="currentColor" fontSize="10" opacity="0.5" textAnchor="end">
                {layoutMode} · {Math.round(zoom * 100)}%
              </text>
            </>
          )}

          {/* Static Dependency Edges + Severed Link / Circuit Breaker Banner when target is STOPPED */}
          {staticEdges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const targetStopped = resolveLiveReplicas(edge.to) === 0;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return (
              <g key={edge.id}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={targetStopped ? "var(--destructive)" : "currentColor"}
                  strokeDasharray={targetStopped ? "6 4" : "5 5"}
                  strokeWidth={targetStopped ? "2.2" : "1.5"}
                  opacity={targetStopped ? "0.9" : ".28"}
                  markerEnd={targetStopped ? "url(#studio-arrow-fault)" : undefined}
                />
                {targetStopped && (
                  <g>
                    <rect
                      x={midX - 54}
                      y={midY - 10}
                      width="108"
                      height="18"
                      rx="4"
                      fill="var(--background)"
                      stroke="var(--destructive)"
                      strokeWidth="1.2"
                    />
                    <text
                      x={midX}
                      y={midY + 2}
                      textAnchor="middle"
                      fill="var(--destructive)"
                      fontSize="9"
                      fontWeight="700"
                    >
                      {t("503 / CIRCUIT OPEN")}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Observed Live OTel Trace Edges + Animated SVG Traffic Pulses */}
          {telemetry?.interactions
            .filter((edge) => !traceId || edge.traceId === traceId)
            .map((edge, index) => {
              const from = positions.get(edge.fromService);
              const to = positions.get(edge.toService);
              if (!from || !to) return null;
              const fromStopped = resolveLiveReplicas(edge.fromService) === 0;
              const targetStopped = resolveLiveReplicas(edge.toService) === 0;
              const edgeSevered = fromStopped || targetStopped;
              const targetReplicas = resolveLiveReplicas(edge.toService);
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const qx1 = from.x + (to.x - from.x) * 0.28;
              const qy1 = from.y + (to.y - from.y) * 0.28;
              const qx2 = from.x + (to.x - from.x) * 0.72;
              const qy2 = from.y + (to.y - from.y) * 0.72;
              const cx1 = from.x + (to.x - from.x) * 0.5;
              const cx2 = from.x + (to.x - from.x) * 0.5;
              const pathD = `M ${from.x} ${from.y} C ${cx1} ${from.y}, ${cx2} ${to.y}, ${to.x} ${to.y}`;
              const speedSec = Math.max(0.7, 2.2 / Math.max(1, Math.min(targetReplicas, 6))).toFixed(
                2,
              );
              const edgeColor = edgeSevered ? "#f43f5e" : "#64748b";
              return (
                <g
                  key={edge.traceId + index}
                  onClick={() => setTraceId(edge.traceId)}
                  className="cursor-pointer"
                >
                  <title>{edge.fromService + " → " + edge.toService + " · " + edge.traceId}</title>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={edgeColor}
                    strokeDasharray={edgeSevered ? "6 4" : undefined}
                    strokeWidth={edgeSevered ? "2.0" : "1.5"}
                    opacity={edgeSevered ? "0.9" : "0.6"}
                    markerEnd={
                      edgeSevered ? "url(#studio-arrow-fault)" : "url(#studio-arrow-live)"
                    }
                  />
                  {edgeSevered && (
                    <g>
                      <rect
                        x={mx - 22}
                        y={my - 8}
                        width="44"
                        height="16"
                        rx="8"
                        fill="#090d16"
                        stroke="#f43f5e"
                        strokeWidth="1.1"
                      />
                      <text
                        x={mx}
                        y={my + 3}
                        textAnchor="middle"
                        fill="#fda4af"
                        fontSize="8.5"
                        fontWeight="700"
                      >
                        503 ✕
                      </text>
                    </g>
                  )}
                  {/* Static snapshot anchor dots (only in legacy non-canvasOnly mode) + Live animated motion pulse */}
                  {!canvasOnly && (
                    <>
                      <circle cx={qx1} cy={qy1} r="3" fill={edgeColor} opacity="0.65" />
                      <circle cx={mx} cy={my} r="4.5" fill={edgeColor} />
                      <circle cx={qx2} cy={qy2} r="3" fill={edgeColor} opacity="0.65" />
                    </>
                  )}
                  {!edgeSevered && (
                    <circle r="3.8" fill="#38bdf8">
                      <animateMotion dur={`${speedSec}s`} repeatCount="indefinite" path={pathD} />
                    </circle>
                  )}
                </g>
              );
            })}

          {/* Interactive Draggable 2D/3D Service Blocks + True Volumetric 3D Isometric Server Racks & Stacked Replica Cubes */}
          {[...positions.entries()]
            .sort((a, b) => a[1].y - b[1].y)
            .map(([name, point]) => {
              const live = telemetry?.services.find((item) => item.service === name);
              const elId = data.serviceMappings?.[name];
              const element = reference.data?.elements.find((el) => el.id === elId);
              const archetype = classifyArchetype(name, element?.elementType, element?.layer);
              const isAffected = affected.has(elId ?? "");
              const isSelected = selected === name;
              const isDropTarget = dropTargetNode === name;
              const isStopped = live !== undefined && live.runningReplicas === 0;
              const activePods = Math.min(live?.runningReplicas ?? 0, 8);

              const cpuPercent = parseCpuPercent(live?.stats[0]?.cpu);
              const ramInfo = parseRamMiB(live?.stats[0]?.memory);

              const theme = getArchetypeTheme(
                archetype,
                isStopped || isAffected,
                isSelected,
                isDropTarget,
                name,
              );
              const strokeColor = theme.stroke;

              // Clean SE-Standard 3D Sculptures (NO base tray / pedestal) + Floating Pill Name Tag
              if (view === "3D") {
                const labelWidth = Math.max(114, Math.min(172, name.length * 7 + 50));
                const pillBadgeText = isStopped
                  ? "0"
                  : `×${live ? live.runningReplicas : 1}`;

                return (
                  <g
                    key={name}
                    role="button"
                    tabIndex={0}
                    aria-label={name}
                    aria-pressed={isSelected}
                    style={{ outline: "none" }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      const existing = customOffsets[name] ?? { x: 0, y: 0 };
                      nodeDrag.current = {
                        service: name,
                        startX: event.clientX,
                        startY: event.clientY,
                        origX: existing.x,
                        origY: existing.y,
                        moved: false,
                      };
                      setDraggingNode(name);
                    }}
                    onClick={() => {
                      onSelect(name);
                    }}
                    onDragOver={(event) => {
                      if (busy) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      if (dropTargetNode !== name) setDropTargetNode(name);
                    }}
                    onDragLeave={() => {
                      if (dropTargetNode === name) setDropTargetNode(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDropTargetNode(null);
                      const toolId = event.dataTransfer.getData("application/x-mavis-studio-tool");
                      const tool =
                        PALETTE_ITEMS.find((item) => item.id === toolId) ?? draggedTool ?? null;
                      if (tool) {
                        applyPaletteToolToService(tool, name);
                      }
                      setDraggedTool(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(name);
                      }
                    }}
                    className="cursor-grab outline-none focus:outline-none active:cursor-grabbing"
                  >
                    {/* Pure 3D Software Engineering Sculpture (no base tray underneath) */}
                    {render3DSeNodeSculpture(
                      name,
                      archetype,
                      point.x,
                      point.y,
                      activePods,
                      isStopped,
                      theme,
                    )}

                    {/* Sleek Floating Pill Name Tag directly below the 3D Sculpture */}
                    <rect
                      x={point.x - labelWidth / 2}
                      y={point.y + 10}
                      width={labelWidth}
                      height="24"
                      rx="12"
                      fill="#0b111e"
                      fillOpacity="0.96"
                      stroke={isStopped ? "#f43f5e" : isSelected ? "#38bdf8" : "#334155"}
                      strokeOpacity={isSelected || isStopped ? "0.95" : "0.85"}
                      strokeWidth={isSelected || isStopped ? 1.6 : 1.1}
                    />
                    {/* Left Functional Component Icon Badge inside the Pill */}
                    <rect
                      x={point.x - labelWidth / 2 + 4}
                      y={point.y + 14}
                      width="16"
                      height="16"
                      rx="8"
                      fill={isStopped ? "#881337" : "#1e293b"}
                    />
                    {renderNodeFunctionGlyph(
                      name,
                      archetype,
                      point.x - labelWidth / 2 + 12,
                      point.y + 22,
                      isStopped ? "#fda4af" : theme.accent,
                    )}
                    <text
                      x={point.x - 4}
                      y={point.y + 25.5}
                      textAnchor="middle"
                      fill="#f1f5f9"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {name}
                    </text>
                    {/* Compact Replica Count Badge inside the right end of the Pill */}
                    <rect
                      x={point.x + labelWidth / 2 - 31}
                      y={point.y + 14}
                      width="25"
                      height="16"
                      rx="8"
                      fill={isStopped ? "#881337" : isSelected ? "#0c4a6e" : "#1e293b"}
                    />
                    <text
                      x={point.x + labelWidth / 2 - 18.5}
                      y={point.y + 25}
                      textAnchor="middle"
                      fill={isStopped ? "#fda4af" : isSelected ? "#7dd3fc" : "#cbd5e1"}
                      fontSize="9.5"
                      fontWeight="600"
                    >
                      {pillBadgeText}
                    </text>
                  </g>
                );
              }

              // 2D Mode Distinct Archetype Silhouettes (Cylinder DB, Trapezoid Gateway, Flanged Pipe Queue, Rack Blade Service)
              return (
                <g
                  key={name}
                  role="button"
                  tabIndex={0}
                  aria-label={name}
                  aria-pressed={isSelected}
                  style={{ outline: "none" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const existing = customOffsets[name] ?? { x: 0, y: 0 };
                    nodeDrag.current = {
                      service: name,
                      startX: event.clientX,
                      startY: event.clientY,
                      origX: existing.x,
                      origY: existing.y,
                      moved: false,
                    };
                    setDraggingNode(name);
                  }}
                  onClick={() => {
                    onSelect(name);
                  }}
                  onDragOver={(event) => {
                    if (busy) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    if (dropTargetNode !== name) setDropTargetNode(name);
                  }}
                  onDragLeave={() => {
                    if (dropTargetNode === name) setDropTargetNode(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropTargetNode(null);
                    const toolId = event.dataTransfer.getData("application/x-mavis-studio-tool");
                    const tool =
                      PALETTE_ITEMS.find((item) => item.id === toolId) ?? draggedTool ?? null;
                    if (tool) {
                      applyPaletteToolToService(tool, name);
                    }
                    setDraggedTool(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(name);
                    }
                  }}
                  className="cursor-grab outline-none focus:outline-none active:cursor-grabbing"
                >
                  {/* Drop Target / Selected Outer Glow Halo */}
                  {(isDropTarget || isSelected || isStopped) && (
                    <rect
                      x={point.x - 88}
                      y={point.y - 42}
                      width="176"
                      height="84"
                      rx="14"
                      fill={theme.stroke}
                      opacity={isStopped ? "0.18" : "0.14"}
                      stroke={theme.stroke}
                      strokeWidth={isDropTarget ? "2.5" : "1.5"}
                      strokeDasharray={isDropTarget ? "4 3" : undefined}
                    />
                  )}

                  {/* DISTINCT 2D SILHOUETTE PER ARCHETYPE */}
                  {archetype === "DATABASE" ? (
                    <g>
                      {/* Cylindrical Database Drum Body + Top Elliptical Platter Lid */}
                      <path
                        d={`M ${point.x - 80},${point.y - 24} L ${point.x - 80},${point.y + 24} A 80 14 0 0 0 ${point.x + 80},${point.y + 24} L ${point.x + 80},${point.y - 24} Z`}
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                      />
                      <ellipse
                        cx={point.x}
                        cy={point.y - 24}
                        rx="80"
                        ry="13"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.4 : 1.6}
                      />
                      <path
                        d={`M ${point.x - 80},${point.y + 2} A 80 11 0 0 0 ${point.x + 80},${point.y + 2}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1"
                        opacity="0.35"
                      />
                    </g>
                  ) : archetype === "GATEWAY" ? (
                    <g>
                      {/* Trapezoid Load Balancer Shield (200Lab style) */}
                      <polygon
                        points={`${point.x - 64},${point.y - 36} ${point.x + 64},${point.y - 36} ${point.x + 86},${point.y + 34} ${point.x - 86},${point.y + 34}`}
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                        strokeLinejoin="round"
                      />
                      {/* Top Ingress Port & Bottom Fan-out Ports */}
                      <rect
                        x={point.x - 16}
                        y={point.y - 40}
                        width="32"
                        height="5"
                        rx="2.5"
                        fill={theme.accent}
                      />
                      <circle cx={point.x - 36} cy={point.y + 34} r="3" fill={theme.accent} />
                      <circle cx={point.x} cy={point.y + 34} r="3" fill={theme.accent} />
                      <circle cx={point.x + 36} cy={point.y + 34} r="3" fill={theme.accent} />
                    </g>
                  ) : archetype === "QUEUE" ? (
                    <g>
                      {/* Flanged Message Broker Pipeline Capsule */}
                      <rect
                        x={point.x - 86}
                        y={point.y - 20}
                        width="8"
                        height="40"
                        rx="3"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.5"
                      />
                      <rect
                        x={point.x + 78}
                        y={point.y - 20}
                        width="8"
                        height="40"
                        rx="3"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.5"
                      />
                      <rect
                        x={point.x - 78}
                        y={point.y - 34}
                        width="156"
                        height="68"
                        rx="22"
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                      />
                      {/* Kafka Topic Partition Vertical Slots */}
                      <line x1={point.x + 62} y1={point.y - 18} x2={point.x + 62} y2={point.y - 2} stroke={theme.accent} strokeWidth="2" opacity="0.6" />
                      <line x1={point.x + 67} y1={point.y - 18} x2={point.x + 67} y2={point.y - 2} stroke={theme.accent} strokeWidth="2" opacity="0.85" />
                    </g>
                  ) : (
                    <g>
                      {/* 19-Inch Server Rack Blade Chassis with Dual Mount Ears & LED Rails */}
                      <rect
                        x={point.x - 84}
                        y={point.y - 26}
                        width="6"
                        height="52"
                        rx="2"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.2"
                      />
                      <rect
                        x={point.x + 78}
                        y={point.y - 26}
                        width="6"
                        height="52"
                        rx="2"
                        fill={theme.iconBg}
                        stroke={strokeColor}
                        strokeWidth="1.2"
                      />
                      <rect
                        x={point.x - 78}
                        y={point.y - 34}
                        width="156"
                        height="68"
                        rx="7"
                        fill={theme.cardFill}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isDropTarget ? 2.6 : 1.8}
                      />
                      {/* Dual Server Rack LED Columns */}
                      <circle cx={point.x - 72} cy={point.y - 16} r="1.4" fill={theme.accent} opacity="0.85" />
                      <circle cx={point.x - 72} cy={point.y - 10} r="1.4" fill={theme.accent} opacity="0.45" />
                      <circle cx={point.x - 72} cy={point.y - 4} r="1.4" fill={theme.accent} opacity="0.85" />
                      <circle cx={point.x + 72} cy={point.y - 16} r="1.4" fill={theme.accent} opacity="0.85" />
                      <circle cx={point.x + 72} cy={point.y - 10} r="1.4" fill={theme.accent} opacity="0.45" />
                      <circle cx={point.x + 72} cy={point.y - 4} r="1.4" fill={theme.accent} opacity="0.85" />
                    </g>
                  )}

                  {/* Top-Left Floating Status Badge (CRASHED or Archetype Tag) like 200Lab */}
                  <rect
                    x={point.x - 66}
                    y={point.y - 45}
                    width={isStopped ? 64 : activePods > 1 ? 66 : 58}
                    height="15"
                    rx="4"
                    fill={isStopped ? "#9f1239" : theme.iconBg}
                    stroke={strokeColor}
                    strokeWidth="1.1"
                  />
                  <text
                    x={point.x - 66 + (isStopped ? 32 : activePods > 1 ? 33 : 29)}
                    y={point.y - 35}
                    textAnchor="middle"
                    fill={isStopped ? "#fecdd3" : theme.accent}
                    fontSize="8.5"
                    fontWeight="800"
                  >
                    {isStopped ? "CRASHED" : activePods > 1 ? `×${activePods} CLUSTER` : theme.badgeText}
                  </text>

                  {/* Left Colored Icon Tile + Specific Functional Vector Icon per Component */}
                  <rect
                    x={point.x - 65}
                    y={point.y - 21}
                    width="24"
                    height="24"
                    rx="6"
                    fill={theme.iconBg}
                    stroke={theme.stroke}
                    strokeWidth="1.1"
                  />
                  {renderNodeFunctionGlyph(
                    name,
                    archetype,
                    point.x - 53,
                    point.y - 9,
                    theme.accent,
                  )}

                  {/* Service Name */}
                  <text
                    x={point.x + 8}
                    y={point.y - 13}
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontSize="12"
                    fontWeight="700"
                  >
                    {name}
                  </text>

                  {/* Running / Configured Replicas Status */}
                  <text
                    x={point.x + 8}
                    y={point.y + 1}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {live
                      ? `${live.runningReplicas}/${live.replicas} ${t("running")}`
                      : t("Waiting for telemetry")}
                  </text>

                  {/* Mini Embedded CPU (Cyan) & RAM (Emerald) Progress Bars inside the Node */}
                  <rect
                    x={point.x - 66}
                    y={point.y + 10}
                    width="62"
                    height="4"
                    rx="2"
                    fill="#1e293b"
                  />
                  <rect
                    x={point.x - 66}
                    y={point.y + 10}
                    width={Math.max(4, Math.round((cpuPercent / 100) * 62))}
                    height="4"
                    rx="2"
                    fill={isStopped ? "#f43f5e" : "#38bdf8"}
                  />
                  <rect
                    x={point.x + 4}
                    y={point.y + 10}
                    width="62"
                    height="4"
                    rx="2"
                    fill="#1e293b"
                  />
                  <rect
                    x={point.x + 4}
                    y={point.y + 10}
                    width={Math.max(4, Math.round((ramInfo.percent / 100) * 62))}
                    height="4"
                    rx="2"
                    fill={isStopped ? "#f43f5e" : "#10b981"}
                  />

                  {/* Visual Replica Pod Cluster (1..8 Pods rendered inside/below the block) */}
                  {Array.from({ length: activePods }, (_, i) => {
                    const podX = point.x - 52 + i * 14.5;
                    const podY = point.y + 22;
                    return (
                      <g key={i}>
                        <rect
                          x={podX - 4.5}
                          y={podY - 3.5}
                          width="9"
                          height="6.5"
                          rx="1.8"
                          fill={theme.accent}
                        />
                        <circle cx={podX} cy={podY + 20} r="2.2" fill={theme.accent} />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Floating Direct Node Controller Bar for the Selected Service */}
      {!canvasOnly && selected && onQuickAction && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              {t("Quick node controls")}: <span className="font-mono">{selected}</span>
            </span>
            <span className="rounded bg-background px-2 py-0.5 font-mono text-[11px]">
              {selectedLive
                ? `${selectedLive.runningReplicas}/${selectedLive.replicas} ${t("running")}`
                : `${selectedReplicas} ${t("running")}`}
            </span>
            {selectedLive?.stats[0] && (
              <span className="text-muted-foreground">
                CPU {selectedLive.stats[0].cpu ?? "—"} · RAM {selectedLive.stats[0].memory ?? "—"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {([1, 2, 4, 8] as const).map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={selectedReplicas === preset ? "secondary" : "outline"}
                disabled={busy || selectedReplicas === 0 || selectedReplicas === preset}
                onClick={() =>
                  onQuickAction({ action: "SCALE", service: selected, replicas: preset })
                }
              >
                ×{preset}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Project Deployment & Scaling Impact Matrix (Static Architecture + Live 1 -> 4 -> 8 Scaling Delta) */}
      {!canvasOnly && (
        <section className="space-y-3 rounded-lg border bg-card p-3.5 text-sm shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">{t("Project Deployment & Scaling Impact Matrix")}</h4>
            <p className="text-xs text-muted-foreground">
              {t("Static Architecture Footprint")} + {t("Live Deployment & Scaling Delta")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border bg-muted/40 px-2.5 py-1 font-mono">
              {t("Total running instances")}: <strong>{totalRunningInstances}</strong>
            </span>
            <span className="rounded border bg-muted/40 px-2.5 py-1 font-mono">
              {t("Total CPU load")}: <strong>{avgClusterCpu.toFixed(1)}%</strong>
            </span>
            <span className="rounded border bg-muted/40 px-2.5 py-1 font-mono">
              {t("Total RAM footprint")}: <strong>{Math.round(totalRamMiB)} MiB</strong>
            </span>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Service</th>
                <th className="px-2 py-2 font-medium">{t("Layer / Type")}</th>
                <th className="px-2 py-2 font-medium">{t("Inbound / Outbound")}</th>
                <th className="px-2 py-2 font-medium">{t("Replicas (Before → Now)")}</th>
                <th className="px-2 py-2 font-medium">{t("Per-instance CPU / RAM")}</th>
                <th className="px-2 py-2 font-medium">{t("Aggregated service RAM")}</th>
                <th className="pl-2 py-2 font-medium">{t("Scaling & Fault Impact")}</th>
              </tr>
            </thead>
            <tbody>
              {deploymentRows.map((row) => {
                const isSelectedRow = row.serviceName === selected;
                const scaleFactor =
                  row.replicasBefore > 0 ? row.replicasNow / row.replicasBefore : row.replicasNow;
                return (
                  <tr
                    key={row.serviceName}
                    onClick={() => onSelect(row.serviceName)}
                    className={`cursor-pointer border-b last:border-0 transition hover:bg-muted/40 ${
                      isSelectedRow ? "bg-muted/30 font-medium" : ""
                    }`}
                  >
                    <td className="py-2 pr-3 font-mono font-semibold">{row.serviceName}</td>
                    <td className="px-2 py-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {row.layer} · {row.elementType}
                      </span>
                      {row.evidenceCount > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({row.evidenceCount} {t("Source evidence")})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {row.inboundCount} in / {row.outboundCount} out
                      {row.protocols ? ` (${row.protocols})` : ""}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {row.replicasBefore} → <strong>{row.replicasNow}</strong>
                      {scaleFactor > 1 && (
                        <span className="ml-1 rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary">
                          ×{scaleFactor.toFixed(0)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {row.avgCpu.toFixed(1)}% · {Math.round(row.perInstanceRamMiB)} MiB
                    </td>
                    <td className="px-2 py-2 font-mono">
                      <strong>{Math.round(row.totalServiceRamMiB)} MiB</strong> /{" "}
                      {Math.round(row.ramLimitMiB * Math.max(1, row.replicasNow))} MiB
                    </td>
                    <td className="pl-2 py-2">
                      {row.replicasNow === 0 ? (
                        <span className="font-semibold text-destructive">
                          {t("Service stopped (Fault injected)")} · {t("503 / CIRCUIT OPEN")}
                        </span>
                      ) : row.replicasNow > 1 ? (
                        <span>
                          {t("Load balanced across")} {row.replicasNow} {t("instances")} (~
                          {Math.round(100 / row.replicasNow)}%/pod)
                          {row.p95Before !== undefined && row.p95After !== undefined
                            ? ` · p95: ${row.p95Before}ms → ${row.p95After}ms`
                            : ""}
                          {row.bottleneckTarget
                            ? ` · ⚠ ${t("Downstream bottleneck risk")}: ${row.bottleneckTarget} (1 pod)`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("Single instance baseline")} (100%/pod)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {!canvasOnly && !telemetry && <p role="status">{t("Waiting for observed telemetry from Runner.")}</p>}
      {!canvasOnly && telemetry && (
        <p className="text-sm text-muted-foreground">
          {t("Observed at")} {new Date(telemetry.observedAt).toLocaleTimeString()}
        </p>
      )}
      {!canvasOnly && impact && (
        <section className="space-y-1 rounded-lg border p-3 text-sm">
          <h4 className="font-medium">
            {t("Static upstream impact")} · {selected}
          </h4>
          <p>
            {t("Direct callers")}: {impact.directImpactCount} · {t("Indirect callers")}:{" "}
            {impact.indirectImpactCount}
          </p>
          {impact.upstreamImpacted.map((item) => (
            <p key={item.elementId} className="font-mono text-xs">
              {item.hops.join(" → ")}
            </p>
          ))}
        </section>
      )}
      {workerImpact.data && (
        <section className="space-y-1 rounded-lg border p-3 text-sm">
          <h4 className="font-medium">{t("Worker verified impact paths")}</h4>
          {workerImpact.data.paths.map((path, index) => (
            <p key={index} className="font-mono text-xs">
              {path
                .map(
                  (id) => reference.data?.elements.find((element) => element.id === id)?.name ?? id,
                )
                .join(" → ")}
            </p>
          ))}
          {workerImpact.data.limitations && (
            <p className="text-muted-foreground">{workerImpact.data.limitations}</p>
          )}
        </section>
      )}
      {workerImpact.isError && (
        <p role="status" className="text-sm">
          {t("Worker impact is unavailable. Static reference paths are shown above.")}
        </p>
      )}
      {reference.data?.elements
        .find((element) => element.id === modelId)
        ?.evidence.map((evidence) => (
          <details key={evidence.id} className="text-sm">
            <summary>{evidence.location}</summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
              {evidence.snippet}
            </pre>
          </details>
        ))}
      {!canvasOnly && telemetry && (
        <div className="space-y-3">
          <h4 className="font-medium">{t("Service metrics and logs")}</h4>
          <details>
            <summary>{t("Observed resilience events")}</summary>
            {telemetry.services.flatMap((service) =>
              service.logs
                .split("\n")
                .filter((line) => /circuit.?breaker|fallback|bulkhead|retry/i.test(line))
                .map((line, index) => (
                  <pre
                    key={service.service + index}
                    className="whitespace-pre-wrap break-all text-sm"
                  >
                    {service.service}: {line}
                  </pre>
                )),
            )}
            {!telemetry.services.some((service) =>
              /circuit.?breaker|fallback|bulkhead|retry/i.test(service.logs),
            ) && <p className="text-sm">{t("No explicit resilience event captured.")}</p>}
          </details>
          {telemetry.services
            .filter((service) => !selected || service.service === selected)
            .map((service) => (
              <section key={service.service} className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {service.service} · {service.runningReplicas}/{service.replicas}
                </p>
                {service.stats.map((stat, index) => (
                  <p key={stat.containerId ?? index} className="font-mono text-xs">
                    CPU {stat.cpu ?? "—"} · RAM {stat.memory ?? "—"} · {t("Network")}{" "}
                    {stat.network ?? "—"}
                  </p>
                ))}
                <details>
                  <summary>{t("Container logs")}</summary>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                    {service.logs || t("No logs captured")}
                  </pre>
                </details>
              </section>
            ))}
          <details open={traceId ? true : undefined}>
            <summary className="font-medium">
              {t("Trace spans")} · {telemetry.spans.length}
            </summary>
            <div className="flex flex-wrap items-center gap-2">
              {traceId && (
                <Button variant="outline" size="sm" onClick={() => setTraceId("")}>
                  {t("Show all traces")}
                </Button>
              )}
            </div>
            {telemetry.spans
              .filter(
                (span) =>
                  (!selected || span.runtimeService === selected) &&
                  (!traceId || span.traceId === traceId),
              )
              .slice(-50)
              .map((span) => (
                <button
                  type="button"
                  key={span.traceId + span.spanId}
                  className="block w-full break-all rounded border p-2 text-left text-sm"
                  onClick={() => setTraceId(span.traceId)}
                >
                  {span.runtimeService} · HTTP {span.httpStatusCode ?? "—"} ·{" "}
                  {span.spanStatus ?? "UNSET"} · {span.traceId}
                  <span className="block text-xs text-muted-foreground">
                    {span.spanId} ·{" "}
                    {span.durationNanoseconds && Number.isFinite(Number(span.durationNanoseconds))
                      ? (Number(span.durationNanoseconds) / 1000000).toFixed(2) + " ms"
                      : "—"}
                  </span>
                </button>
              ))}
            {telemetry.spans.length === 0 && <p role="status">{t("No captured spans yet.")}</p>}
          </details>
        </div>
      )}
    </div>
  );
}

export async function captureStudioImage(svg: SVGSVGElement): Promise<string> {
  const styles = getComputedStyle(svg);
  const url = URL.createObjectURL(
    new Blob([serializeStudioGraph(svg)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render Studio snapshot"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 920;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render Studio snapshot");
    context.fillStyle = styles.backgroundColor;
    context.fillRect(0, 0, 1400, 920);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function serializeStudioGraph(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const styles = getComputedStyle(svg);
  clone.setAttribute(
    "style",
    `color:${styles.color};background:${styles.backgroundColor};font-family:Arial,sans-serif`,
  );
  clone.setAttribute("width", "1400");
  clone.setAttribute("height", "920");
  clone.querySelectorAll("[fill],[stroke]").forEach((element) => {
    for (const attribute of ["fill", "stroke"]) {
      const variable = element.getAttribute(attribute)?.match(/^var\((--[\w-]+)\)$/);
      if (variable) element.setAttribute(attribute, styles.getPropertyValue(variable[1]!).trim());
    }
  });
  return new XMLSerializer().serializeToString(clone);
}

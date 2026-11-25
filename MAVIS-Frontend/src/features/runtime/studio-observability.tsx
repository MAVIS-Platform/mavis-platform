"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Box,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { computeArchitectureImpact } from "@/lib/architecture/reverse-bfs";
import type { Response } from "@/lib/api/contracts";
import {
  STUDIO_STYLES,
  resolveStudioNodePalette,
  resolveStudioStyle,
  type StudioStyleId,
} from "./studio-styles";
import {
  StudioThreeStage,
  type StudioThreeEdge,
  type StudioThreeNode,
} from "./studio-three-stage";
import { parseMemoryMiB, summarizeServiceStats } from "./live-sandbox-parity";

type Studio = Response<"studioState">;

const PITCH_MIN = 0.44;
const PITCH_MAX = 1.12;
const DEFAULT_3D_CAMERA = { yaw: 0.68, pitch: 0.58 };
const TOP_DOWN_3D_CAMERA = { yaw: 0.0, pitch: 1.05 };
const ELEVATION_3D_CAMERA = { yaw: 0.35, pitch: 0.44 };

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
    id: "palette-scale-2",
    label: "Scale ×2 Cluster",
    badge: "×2 PODS",
    action: "SCALE",
    replicas: 2,
    tone: "primary",
  },
  {
    id: "palette-scale-3",
    label: "Scale ×3 Max Load",
    badge: "×3 PODS",
    action: "SCALE",
    replicas: 3,
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
      typeLabel: "UNAVAILABLE",
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

  // Unified Studio Sandbox dark graphite CAD chassis when idle/unselected:
  // ZERO glowing neon colors on unselected blocks — ONLY the clicked/selected block lights up in cyan.
  const base = {
    stroke: "#475569",
    cardFill: "#0f172a",
    iconBg: "#1b263b",
    accent: "#94a3b8",
    ...badgeAndType,
  };

  if (isDropTarget || isSelected) {
    return {
      ...base,
      stroke: "#38bdf8",
      cardFill: "#0c2238",
      iconBg: "#123456",
      accent: "#7dd3fc",
    };
  }
  return base;
}

const STUDIO_2D_SYMBOLS = [
  { kind: "cdn", match: /cdn|cloudflare|cloudfront/, body: "M24 3a21 21 0 1 0 0 42 21 21 0 1 0 0-42Z", detail: "M3 24h42M8 12c8 5 24 5 32 0M8 36c8-5 24-5 32 0M24 3c-14 9-14 33 0 42 14-9 14-33 0-42Z", color: "#38bdf8" },
  { kind: "waf", match: /waf|shield|firewall|fraud/, body: "M24 3 43 11v12c0 12-9 19-19 23C14 42 5 35 5 23V11Z", detail: "m15 24 6 6 12-13", color: "#38bdf8" },
  { kind: "balancer", match: /load.?balancer|\blb\b/, body: "M24 3 45 24 24 45 3 24Z", detail: "M15 24h9m0 0 9-9m-9 9 9 9M11 24a2 2 0 1 0 4 0 2 2 0 1 0-4 0Z", color: "#38bdf8" },
  { kind: "gateway", match: /gateway|ingress|proxy|nginx|bff|router/, body: "M5 43V17L24 4l19 13v26H33V22H15v21Z", detail: "M20 30h8m-4-4 4 4-4 4", color: "#7dd3fc" },
  { kind: "worker", match: /worker|consumer|job|batch|cron/, body: "M19 3h10l2 7 6-2 7 7-3 6 5 3v7l-7 2 1 5-7 6-6-3-3 5h-8l-2-7-6 1-5-7 3-6-4-3v-8l7-2-1-6 7-4 5 3Z", detail: "M24 16a8 8 0 1 0 0 16 8 8 0 1 0 0-16Z", color: "#fbbf24" },
  { kind: "auth", match: /auth|sso|oauth|iam|keycloak/, body: "M11 20h26a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4Z", detail: "M14 20v-6a10 10 0 0 1 20 0v6M24 28a3 3 0 1 0 0 6 3 3 0 1 0 0-6Zm0 6v4", color: "#c4b5fd" },
  { kind: "function", match: /lambda|serverless|\bfn\b/, body: "M29 3 9 27h13l-3 18 21-25H27Z", detail: "m29 13-11 11h9", color: "#fbbf24" },
  { kind: "sql", match: /postgres|mysql|maria|sqlite|oracle|\b(?:db|sql)\b|database/, body: "M5 11C5 1 43 1 43 11v26c0 10-38 10-38 0Z", detail: "M5 11c0 10 38 10 38 0M5 24c0 10 38 10 38 0", color: "#34d399" },
  { kind: "cache", match: /redis|memcache|cache/, body: "m4 12 20-8 20 8v7l-20 8-20-8Zm0 15 20 8 20-8v7l-20 8-20-8Z", detail: "m4 12 20 8 20-8", color: "#fda4af" },
  { kind: "document", match: /mongo|dynamo|cassandra|nosql/, body: "M10 4h17l10 10v30H10Z", detail: "M27 4v10h10M16 24l-3 4 3 4m15-8 3 4-3 4m-6-10-3 12", color: "#6ee7b7" },
  { kind: "object", match: /s3|bucket|blob|minio|storage/, body: "M5 11c0-10 38-10 38 0l-6 27c-2 7-24 7-26 0Z", detail: "M5 11c0 9 38 9 38 0m-24 9 5 4 5-4", color: "#34d399" },
  { kind: "search", match: /elastic|opensearch|search|solr/, body: "M20 4a16 16 0 0 1 13 25l11 11-4 4-11-11A16 16 0 1 1 20 4Z", detail: "M20 10a10 10 0 1 0 0 20 10 10 0 1 0 0-20Z", color: "#fcd34d" },
  { kind: "telemetry", match: /otel|prometheus|grafana|jaeger|metric|monitor|telemetry/, body: "M4 43V27h9v16Zm15 0V19h9v24Zm15 0V9h9v34Z", detail: "m4 19 10-7 9 1 15-10m-6 0h6v6", color: "#67e8f9" },
  { kind: "queue", match: /rabbit|amqp|celery|bull|queue|\bmq\b/, body: "M4 11h40v26H4Z", detail: "m4 12 20 15 20-15M4 37l14-14m26 14L30 23", color: "#fdba74" },
  { kind: "stream", match: /kafka|broker|stream|event/, body: "M4 11a7 7 0 0 1 7-7h26a7 7 0 0 1 7 7v26a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7Z", detail: "M9 14h13l5 5h12M9 24h30M9 34h13l5-5h12", color: "#cbd5e1" },
  { kind: "order", match: /order|cart|checkout/, body: "M16 14h27l-6 19H20Z", detail: "M6 8h8l6 25M22 40a3 3 0 1 0 0 6 3 3 0 1 0 0-6Zm13 0a3 3 0 1 0 0 6 3 3 0 1 0 0-6Z", color: "#93c5fd" },
  { kind: "payment", match: /payment|ledger|billing|wallet/, body: "M4 12a5 5 0 0 1 5-5h30a5 5 0 0 1 5 5v24a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z", detail: "M4 17h40M11 30h12m-12 5h6", color: "#5eead4" },
  { kind: "inventory", match: /inventory|catalog|product|warehouse|item/, body: "m4 13 20-9 20 9v22l-20 9-20-9Z", detail: "m4 13 20 10 20-10M24 23v21M14 9l20 10v9", color: "#c4b5fd" },
  { kind: "user", match: /user|account|customer|profile|member/, body: "M24 7a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM8 41c2-9 9-13 16-13s14 4 16 13Z", detail: "M24 12a4 4 0 1 0 0 8", color: "#7dd3fc" },
  { kind: "notification", match: /notif|mail|alert|sms|push/, body: "M24 6c-8 0-13 6-13 14v9l-4 5h34l-4-5v-9c0-8-5-14-13-14Z", detail: "M19 38a5 5 0 0 0 10 0", color: "#fcd34d" },
  { kind: "shipping", match: /ship|deliver|logistic|dispatch/, body: "M4 13h25v20H4Zm25 7h9l6 6v7H29Z", detail: "M13 38a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm22 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", color: "#6ee7b7" },
  { kind: "service", match: /(?:)/, body: "M5 8h38v13H5Zm0 19h38v13H5Z", detail: "M11 14h1m5 0h1m6 0h13M11 33h1m5 0h1m6 0h13", color: "#a5b4fc" },
];

function render2DServiceSymbol(
  name: string,
  archetype: ReturnType<typeof classifyArchetype>,
  statusColor?: string,
) {
  const fallback = { DATABASE: "sql", GATEWAY: "gateway", QUEUE: "queue", SERVICE: "service" }[archetype];
  const symbol = STUDIO_2D_SYMBOLS.find(({ kind, match }) => kind !== "service" && match.test(name.toLowerCase()))
    ?? STUDIO_2D_SYMBOLS.find(({ kind }) => kind === fallback)!;
  const color = statusColor ?? symbol.color;
  return (
    <g transform="translate(-26 -35) scale(1.0833)" data-studio-symbol={symbol.kind} aria-hidden="true"
      stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={symbol.body} fill="#101a2b" />
      <path d={symbol.detail} fill="none" />
    </g>
  );
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
  const isLightFill = /^#[b-fB-F]/.test(fillBase);
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
        strokeOpacity={isLightFill ? "0.75" : "0.65"}
        strokeWidth={strokeWidth * 0.9}
        strokeLinejoin="round"
      />
      <polygon points={leftPoints} fill={stroke} opacity={isLightFill ? "0.08" : "0.1"} />
      {/* Right Deep-Shaded Isometric Wall */}
      <polygon
        points={rightPoints}
        fill={isLightFill ? "#cbd5e1" : "#050811"}
        opacity={isLightFill ? "0.45" : "0.78"}
        stroke={stroke}
        strokeOpacity={isLightFill ? "0.7" : "0.55"}
        strokeWidth={strokeWidth * 0.9}
        strokeLinejoin="round"
      />
      {/* Top Illuminated Roof */}
      <polygon
        points={topPoints}
        fill={topFill ?? fillBase}
        stroke={stroke}
        strokeOpacity="0.92"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <polygon points={topPoints} fill={stroke} opacity={isLightFill ? "0.1" : "0.14"} />
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
  if (n.includes("inventory") || n.includes("catalog") || n.includes("product") || n.includes("warehouse")) {
    return (
      <g stroke={color} strokeWidth="1.3" fill="none">
        <polygon points={`${cx},${cy - 5.2} ${cx + 4.8},${cy - 2.6} ${cx + 4.8},${cy + 2.6} ${cx},${cy + 5.2} ${cx - 4.8},${cy + 2.6} ${cx - 4.8},${cy - 2.6}`} />
        <polyline points={`${cx - 4.8},${cy - 2.6} ${cx},${cy} ${cx + 4.8},${cy - 2.6}`} />
        <line x1={cx} y1={cy} x2={cx} y2={cy + 5.2} />
      </g>
    );
  }
  if (n.includes("user") || n.includes("account") || n.includes("customer") || n.includes("profile")) {
    return (
      <g stroke={color} strokeWidth="1.35" strokeLinecap="round" fill="none">
        <circle cx={cx} cy={cy - 2.2} r="2.3" />
        <path d={`M ${cx - 4.2},${cy + 4.2} C ${cx - 4.2},${cy + 1.5} ${cx + 4.2},${cy + 1.5} ${cx + 4.2},${cy + 4.2}`} />
      </g>
    );
  }
  if (n.includes("notif") || n.includes("mail") || n.includes("alert")) {
    return (
      <g stroke={color} strokeWidth="1.35" strokeLinecap="round" fill="none">
        <path d={`M ${cx - 3.6},${cy + 2.5} L ${cx - 3.6},${cy - 0.5} A 3.6 3.6 0 0 1 ${cx + 3.6},${cy - 0.5} L ${cx + 3.6},${cy + 2.5} Z`} />
        <circle cx={cx} cy={cy + 4} r="0.9" fill={color} />
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

function sculptureScale(replicas: number) {
  return 1 + 0.07 * Math.sqrt(Math.max(0, replicas - 1));
}

function render3DSeNodeSculpture(
  name: string,
  archetype: string,
  cx: number,
  cy: number,
  isStopped: boolean,
  theme: { stroke: string; cardFill: string; iconBg: string; accent: string },
) {
  const n = name.toLowerCase();
  const s = theme.stroke;
  const a = theme.accent;
  const fill = theme.cardFill;
  const top = theme.iconBg;
  const hScale = isStopped ? 0 : 2.2;

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
    const headerY = gy - 22;
    const headerHeight = 8;
    const roofY = headerY - headerHeight;
    return (
      <g>
        {/* Left Gateway Pillar */}
        {renderIsoBox(cx - 18, gy - 4, 11, 6, 24, s, fill, 1.3, top)}
        {/* Right Gateway Pillar */}
        {renderIsoBox(cx + 18, gy + 4, 11, 6, 24, s, fill, 1.3, top)}
        {/* Top Bridging Gateway Arch Header */}
        {renderIsoBox(cx, headerY, 34, 14, headerHeight, s, fill, 1.5, top)}
        {/* API routing arrow centered on the roof */}
        <path
          d={`M ${cx - 12},${roofY} L ${cx + 12},${roofY} M ${cx + 7},${roofY - 3} L ${cx + 12},${roofY} L ${cx + 7},${roofY + 3}`}
          stroke={a}
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
          fill={a}
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
          stroke={a}
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
        <circle cx={cx - 11} cy={ly - 7} r="2.4" fill={a} />
        <line x1={cx - 11} y1={ly - 5} x2={cx - 11} y2={ly - 1} stroke={a} strokeWidth="2" strokeLinecap="round" />
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
        <g stroke={a} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
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
        <ellipse cx={cx} cy={wy - 12} rx="11" ry="5.5" fill="none" stroke={a} strokeWidth="1.8" strokeDasharray="3 2" />
        <circle cx={cx} cy={wy - 12} r="2.5" fill={a} />
      </g>
    );
  }

  // 14. ORDER / CART / CHECKOUT: Clean Studio Sandbox Stepped Fulfillment Module
  if (n.includes("order") || n.includes("cart") || n.includes("checkout")) {
    const by = cy - 1;
    const baseH = isStopped ? 9 : 10;
    const upperH = isStopped ? 7 : 8;
    const roofY = by - baseH - upperH - 1;
    return (
      <g>
        {/* Solid Isometric Base Chassis */}
        {renderIsoBox(cx, by, 33, 15.5, baseH, s, fill, 1.4, top)}
        {/* Centered Upper Processing Deck */}
        {renderIsoBox(cx, by - baseH - 1, 22, 10.5, upperH, s, fill, 1.4, top)}
        {/* Subtle Status LED on Base Wall */}
        <circle cx={cx - 19} cy={by - baseH * 0.42} r="1.5" fill={a} />
        <circle cx={cx - 13} cy={by - baseH * 0.42 + 2.6} r="1.5" fill={isStopped ? "#f43f5e" : "#10b981"} />
        {/* Crisp Cart Emblem Centered on Upper Deck */}
        {renderNodeFunctionGlyph(name, archetype, cx, roofY, a)}
      </g>
    );
  }

  // 15. PAYMENT / BILLING / LEDGER / WALLET: Clean Studio Sandbox Isometric Vault Unit
  if (n.includes("payment") || n.includes("billing") || n.includes("ledger") || n.includes("wallet")) {
    const by = cy - 1;
    const h = isStopped ? 14 : 16;
    const roofY = by - h;
    return (
      <g>
        {/* Grounded Isometric Security Vault Chassis */}
        {renderIsoBox(cx, by, 32, 15, h, s, fill, 1.5, top)}
        {/* Recessed Metallic Ledger Seam across Front Walls */}
        <polyline
          points={`${cx - 32},${by - h * 0.45} ${cx},${by + 15 - h * 0.45} ${cx + 32},${by - h * 0.45}`}
          fill="none"
          stroke={a}
          strokeWidth="1.2"
          opacity="0.65"
        />
        {/* Vault Status LED */}
        <circle cx={cx - 19} cy={by - h * 0.72} r="1.5" fill={isStopped ? "#f43f5e" : "#10b981"} />
        {/* Crisp Payment Card Emblem Centered on Vault Roof */}
        {renderNodeFunctionGlyph(name, archetype, cx, roofY, a)}
      </g>
    );
  }

  // 16. CATALOG / PRODUCT / INVENTORY / WAREHOUSE: Clean Studio Sandbox 2-Bay Modular Storage Rack
  if (
    n.includes("catalog") ||
    n.includes("product") ||
    n.includes("inventory") ||
    n.includes("warehouse") ||
    n.includes("item")
  ) {
    const by = cy - 1;
    const tierH = isStopped ? 7.5 : 8.5;
    const roofY = by - tierH * 2 - 2.5;
    return (
      <g>
        {/* Lower Storage Blade */}
        {renderIsoBox(cx, by, 32, 15, tierH, s, fill, 1.4, top)}
        {/* Upper Aligned Index Blade */}
        {renderIsoBox(cx, by - tierH - 2.5, 32, 15, tierH, s, fill, 1.4, top)}
        {/* Subtle Bay Status LEDs */}
        <circle cx={cx - 19} cy={by - tierH * 0.45} r="1.4" fill={a} />
        <circle cx={cx - 19} cy={by - tierH * 1.45 - 2.5} r="1.4" fill={isStopped ? "#f43f5e" : "#10b981"} />
        {/* Crisp Inventory Cube Emblem Centered on Top Blade */}
        {renderNodeFunctionGlyph(name, archetype, cx, roofY, a)}
      </g>
    );
  }

  // 17. USER / ACCOUNT / CUSTOMER / PROFILE: Clean Studio Sandbox Identity Pedestal
  if (n.includes("user") || n.includes("account") || n.includes("customer") || n.includes("profile") || n.includes("member")) {
    const by = cy - 2;
    return (
      <g>
        <path
          d={`M ${cx - 26},${by - 10} L ${cx - 26},${by} A 26 11 0 0 0 ${cx + 26},${by} L ${cx + 26},${by - 10} Z`}
          fill={fill}
          stroke={s}
          strokeWidth="1.5"
        />
        <ellipse cx={cx} cy={by - 10} rx="26" ry="11" fill={top} stroke={s} strokeWidth="1.5" />
        <circle cx={cx} cy={by - 25} r="6.5" fill={top} stroke={a} strokeWidth="1.6" />
        <path
          d={`M ${cx - 13},${by - 10} C ${cx - 13},${by - 18} ${cx + 13},${by - 18} ${cx + 13},${by - 10}`}
          fill={fill}
          stroke={a}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    );
  }

  // 18. NOTIFICATION / MAIL / ALERT / SMS: Clean Studio Sandbox Broadcast Tower
  if (n.includes("notif") || n.includes("mail") || n.includes("alert") || n.includes("sms") || n.includes("push")) {
    const by = cy - 1;
    return (
      <g>
        {renderIsoBox(cx, by, 26, 12, 9, s, fill, 1.4, top)}
        <line x1={cx} y1={by - 10} x2={cx} y2={by - 27} stroke={a} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx={cx} cy={by - 28} r="3.2" fill={top} stroke={a} strokeWidth="1.5" />
        <path d={`M ${cx - 9},${by - 24} A 10 10 0 0 1 ${cx - 9},${by - 32}`} fill="none" stroke={a} strokeWidth="1.4" strokeLinecap="round" />
        <path d={`M ${cx + 9},${by - 24} A 10 10 0 0 0 ${cx + 9},${by - 32}`} fill="none" stroke={a} strokeWidth="1.4" strokeLinecap="round" />
      </g>
    );
  }

  // 19. SHIPPING / DELIVERY / LOGISTICS: Clean Studio Sandbox Dispatch Hub
  if (n.includes("ship") || n.includes("deliver") || n.includes("logistic") || n.includes("dispatch")) {
    const by = cy - 1;
    return (
      <g>
        {renderIsoBox(cx, by, 34, 15.5, 8, s, fill, 1.4, top)}
        {renderIsoBox(cx - 10, by - 8, 11, 5.5, 9, s, fill, 1.4, top)}
        <path
          d={`M ${cx + 2},${by - 9} L ${cx + 11},${by - 6} L ${cx + 5},${by - 2} M ${cx + 10},${by - 12} L ${cx + 19},${by - 9} L ${cx + 13},${by - 5}`}
          fill="none"
          stroke={a}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  // 20. GENERIC MICROSERVICE: Clean Studio Sandbox Container Unit + Domain Emblem
  const cyBase = cy - 1;
  const h = isStopped ? 14 : 16;
  const roofY = cyBase - h;
  return (
    <g>
      {renderIsoBox(cx, cyBase, 33, 16, h, s, fill, 1.5, top)}
      {/* Container Status LEDs on Front-Left Wall */}
      <circle cx={cx - 19} cy={cyBase - h * 0.45} r="1.5" fill={a} />
      <circle cx={cx - 12} cy={cyBase - h * 0.45 + 3} r="1.5" fill={isStopped ? "#f43f5e" : "#10b981"} />
      {/* Domain Emblem on Container Roof */}
      {renderNodeFunctionGlyph(name, archetype, cx, roofY, a)}
    </g>
  );
}

function getNodeLabel(name: string, view: "2D" | "3D") {
  const characters = Array.from(name);
  const text = characters.length > 20 ? characters.slice(0, 19).join("") + "…" : name;
  return view === "3D"
    ? { text, width: Math.max(114, Math.min(172, text.length * 7 + 50)), y: 10, height: 24 }
    : { text, width: Math.max(86, text.length * 6.5 + 34), y: 18, height: 20 };
}

function renderWireArrow(
  from: { x: number; y: number },
  to: { x: number; y: number },
  label: ReturnType<typeof getNodeLabel>,
  color: string,
  curved = false,
  scale = 1,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 24) return null;

  // Match the rendered cubic, whose two control points share the midpoint x.
  const pointAt = (t: number) => ({
    x: from.x + dx * (curved ? t * (1.5 - 1.5 * t + t * t) : t),
    y: from.y + dy * (curved ? t * t * (3 - 2 * t) : t),
  });
  const gap = 7;
  function coversArrow(t: number) {
    const point = pointAt(t);
    const x = Math.abs(point.x - to.x);
    const y = point.y - to.y;
    const overlapsIcon = x <= 45 * scale && y >= 8 - 48 * scale && y <= label.y + gap;
    const overlapsLabel = x <= label.width / 2 + gap && y >= label.y - gap && y <= label.y + label.height + gap;
    return overlapsIcon || overlapsLabel;
  }

  // Follow the path back from its endpoint, then refine where it clears the node.
  let low = 1;
  while (low > 0 && coversArrow(low)) low = Math.max(0, low - 1 / 32);
  if (low === 0 && coversArrow(low)) return null;
  let high = Math.min(1, low + 1 / 32);
  for (let step = 0; step < 8; step++) {
    const t = (low + high) / 2;
    if (coversArrow(t)) high = t;
    else low = t;
  }
  const point = pointAt(low);
  const next = pointAt(low + 0.001);
  const angle = (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI;

  return (
    <path
      data-studio-wire-arrow
      d="M -5 -2.7 L 0 0 L -5 2.7"
      transform={`translate(${point.x}, ${point.y}) rotate(${angle})`}
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.85"
      pointerEvents="none"
      aria-hidden="true"
    />
  );
}

export type StudioAuthorHighlights = {
  authorStoppedServices?: ReadonlySet<string>;
  impactTarget?: string | null;
  predictedUpstream?: ReadonlySet<string>;
  impactEdgeKeys?: ReadonlySet<string>;
  requiredTraceEdge?: { from: string; to: string } | null;
  scalableServices?: ReadonlySet<string>;
};

export function StudioObservability({
  data,
  selected,
  onSelect,
  busy = false,
  onQuickAction,
  onDropAuthorChip,
  onSelectEdge,
  authorHighlights,
  onSpawnBlock,
  onConnect,
  onDisconnect,
  onSound,
  nodeNames,
  configuredEdges,
  nodeStatus,
  simulated = false,
  canvasOnly = false,
  defaultView = "2D",
  surfaceTheme = "dark",
  studioStyle,
  showNodeTags = true,
  showEdgeTags = true,
}: {
  data: Studio;
  selected: string;
  onSelect: (service: string) => void;
  busy?: boolean;
  onQuickAction?: (command: StudioQuickAction) => void;
  onDropAuthorChip?: (chipId: string, service: string) => void;
  onSelectEdge?: (edge: { id: string; from: string; to: string }) => void;
  authorHighlights?: StudioAuthorHighlights | undefined;
  onSpawnBlock?: (presetKey: string) => string | undefined;
  onConnect?: (from: string, to: string) => void;
  onDisconnect?: (from: string, to: string) => void;
  onSound?: (sound: "select" | "place") => void;
  nodeNames?: Readonly<Record<string, string>>;
  configuredEdges?: ReadonlyArray<{ from: string; to: string; id: string; protocol: string; active: boolean }>;
  nodeStatus?: Readonly<Record<string, string>>;
  simulated?: boolean;
  canvasOnly?: boolean;
  defaultView?: "2D" | "3D";
  surfaceTheme?: "light" | "dark";
  studioStyle?: StudioStyleId | undefined;
  showNodeTags?: boolean | undefined;
  showEdgeTags?: boolean | undefined;
}) {
  const activeStyleId: StudioStyleId = resolveStudioStyle(
    studioStyle ?? (surfaceTheme === "light" ? "daylight" : "control"),
  );
  const styleCfg = STUDIO_STYLES[activeStyleId];
  const isLight = !styleCfg.isDark;
  const { t } = useLocale();
  const [view, setView] = useState<"2D" | "3D">(defaultView);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("LAYERED");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [camera, setCamera] = useState(DEFAULT_3D_CAMERA);
  const [cameraFormOpen, setCameraFormOpen] = useState(true);
  const [webglReady, setWebglReady] = useState(false);
  const handleWebglReadyChange = useCallback((ready: boolean) => {
    setWebglReady(ready);
  }, []);
  const webglActive = view === "3D" && webglReady;
  const [customOffsets, setCustomOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [draggedTool, setDraggedTool] = useState<DragPaletteItem | null>(null);
  const [dropTargetNode, setDropTargetNode] = useState<string | null>(null);
  const [traceId, setTraceId] = useState("");
  const [selectedWire, setSelectedWire] = useState<{ from: string; to: string } | null>(null);
  const [exportError, setExportError] = useState(false);

  const cameraDrag = useRef<{ x: number; y: number; mode: "ROTATE" | "PAN"; moved: boolean } | null>(null);
  const nodeDrag = useRef<{
    service: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const graphContent = useRef<SVGGElement>(null);
  const linkSource = useRef<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<{ from: string; x: number; y: number; target: string | null } | null>(null);
  const activePointer = useRef<number | null>(null);
  const canvasRightGesture = useRef(false);
  const endPointerInteraction = useCallback(() => {
    const pointerId = activePointer.current;
    activePointer.current = null;
    cameraDrag.current = null;
    nodeDrag.current = null;
    linkSource.current = null;
    setLinkPreview(null);
    setDraggingNode(null);
    if (pointerId !== null && svg.current?.hasPointerCapture(pointerId)) {
      svg.current.releasePointerCapture(pointerId);
    }
  }, []);
  useEffect(() => {
    const onPointerStart = () => { canvasRightGesture.current = false; };
    const onContextMenu = (event: MouseEvent) => {
      if (event.button === 2 && canvasRightGesture.current) {
        event.preventDefault();
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) endPointerInteraction();
    };
    window.addEventListener("blur", endPointerInteraction);
    window.addEventListener("pointerdown", onPointerStart, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("pointerup", endPointerInteraction);
    window.addEventListener("pointercancel", endPointerInteraction);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", endPointerInteraction);
      window.removeEventListener("pointerdown", onPointerStart, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("pointerup", endPointerInteraction);
      window.removeEventListener("pointercancel", endPointerInteraction);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [endPointerInteraction]);

  const reference = useApiQuery(
    "model",
    { modelId: data.modelVersionId ?? "", projectId: data.projectId ?? "" },
    { enabled: Boolean(data.modelVersionId && data.projectId) },
  );
  const telemetry = data.telemetry;
  const activeWire = selectedWire && (telemetry?.interactions.some((edge) =>
    edge.fromService === selectedWire.from && edge.toService === selectedWire.to,
  ) || configuredEdges?.some((edge) => edge.active && edge.from === selectedWire.from && edge.to === selectedWire.to))
    ? selectedWire : null;
  const spansByTraceAndId = useMemo(() => new Map(
    telemetry?.spans.map((span) => [`${span.traceId}:${span.spanId}`, span]),
  ), [telemetry?.spans]);
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

  const staticEdges = useMemo(() => {
    if (configuredEdges) return configuredEdges;
    const model = reference.data;
    if (!model?.edges?.length) return [];
    const serviceByElementId = new Map<string, string>();
    for (const [svc, id] of Object.entries(data.serviceMappings ?? {})) {
      if (id) serviceByElementId.set(id, svc);
    }
    const serviceByLowerName = new Map(
      data.services.map((svc) => [svc.toLowerCase(), svc] as const),
    );
    const elementsById = new Map(model.elements.map((el) => [el.id, el] as const));
    const resolveService = (elementId: string): string | undefined => {
      const direct = serviceByElementId.get(elementId);
      if (direct) return direct;
      let cur = elementsById.get(elementId);
      const visited = new Set<string>();
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        const mapped = serviceByElementId.get(cur.id);
        if (mapped) return mapped;
        const byName = serviceByLowerName.get(cur.name.toLowerCase());
        if (byName) return byName;
        cur = cur.parentId ? elementsById.get(cur.parentId) : undefined;
      }
      return undefined;
    };
    const seenPairs = new Set<string>();
    const resolved: Array<{ from: string; to: string; id: string; protocol: string }> = [];
    for (const edge of model.edges) {
      const from = resolveService(edge.from);
      const to = resolveService(edge.to);
      if (!from || !to || from === to) continue;
      const pairKey = `${from}->${to}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      resolved.push({ from, to, id: edge.id, protocol: edge.protocol ?? "HTTP" });
    }
    return resolved;
  }, [reference.data, data.serviceMappings, data.services, configuredEdges]);

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

  const clampedPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camera.pitch));
  const project3DPoint = useMemo(() => {
    const cosY = Math.cos(camera.yaw);
    const sinY = Math.sin(camera.yaw);
    const cosP = Math.cos(clampedPitch);
    const sinP = Math.sin(clampedPitch);
    const focal = 1950;
    return (wx: number, wy: number, wz: number) => {
      const rx = wx * cosY - wz * sinY;
      const rz = wx * sinY + wz * cosY;
      const ry = wy * cosP + rz * sinP;
      const depthZ = -wy * sinP + rz * cosP;
      const persp = focal / Math.max(600, focal - depthZ);
      return {
        x: 615 + rx * persp,
        y: 318 + ry * persp,
        z: depthZ,
        persp,
      };
    };
  }, [camera.yaw, clampedPitch]);

  // Camera-independent 3D world layout so orbiting/panning never rebuilds the WebGL scene
  const { worldPoints, deckBounds } = useMemo(() => {
    let minNodeX = Infinity;
    let maxNodeX = -Infinity;
    let minNodeZ = Infinity;
    let maxNodeZ = -Infinity;
    const deckPadding = 150;
    const pts = new Map<string, { wx: number; wz: number; tier: number }>();
    const total = Math.max(1, data.services.length);

    const tierGroups = new Map<number, string[]>();
    data.services.forEach((name) => {
      const tier = serviceDepth.get(name) ?? 0;
      const list = tierGroups.get(tier) ?? [];
      list.push(name);
      tierGroups.set(tier, list);
    });
    const tierKeys = [...tierGroups.keys()].sort((a, b) => a - b);
    const effectiveColumns: Array<{ tier: number; nodes: string[] }> = [];
    for (const tier of tierKeys) {
      const list = tierGroups.get(tier) ?? [];
      for (let i = 0; i < list.length; i += 4) {
        effectiveColumns.push({ tier, nodes: list.slice(i, i + 4) });
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
      const positionKey = "3D:" + name;
      const offset = customOffsets[positionKey] ?? { x: 0, y: 0 };
      const pinned = pinnedPositions[positionKey];
      let wx = 0;
      let wz = 0;
      if (layoutMode === "CIRCULAR") {
        const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
        const radius = Math.min(270, 175 + total * 12);
        wx = Math.cos(angle) * radius;
        wz = Math.sin(angle) * radius;
      } else if (layoutMode === "GRID") {
        const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
        const col = index % cols;
        const row = Math.floor(index / cols);
        const rows = Math.ceil(total / cols);
        const spX = Math.min(220, 520 / Math.max(1, cols - 1));
        const spZ = Math.min(210, 460 / Math.max(1, rows - 1));
        wx = (col - (cols - 1) / 2) * spX;
        wz = (row - (rows - 1) / 2) * spZ;
      } else {
        const loc = colLocation.get(name) ?? { colIdx: 0, rowIdx: 0, rowCount: 1 };
        const spX = totalCols <= 1 ? 0 : Math.min(220, 560 / (totalCols - 1));
        const spZ = loc.rowCount <= 1 ? 0 : Math.min(230, 480 / (loc.rowCount - 1));
        wx = (loc.colIdx - (totalCols - 1) / 2) * spX;
        wz = (loc.rowIdx - (loc.rowCount - 1) / 2) * spZ;
      }
      const nodeX = (pinned?.x ?? wx) + offset.x;
      const nodeZ = (pinned?.y ?? wz) + offset.y;
      minNodeX = Math.min(minNodeX, nodeX);
      maxNodeX = Math.max(maxNodeX, nodeX);
      minNodeZ = Math.min(minNodeZ, nodeZ);
      maxNodeZ = Math.max(maxNodeZ, nodeZ);
      pts.set(name, { wx: nodeX, wz: nodeZ, tier });
    });

    const bounds =
      Number.isFinite(minNodeX) && Number.isFinite(minNodeZ)
        ? {
            minX: Math.min(-220, minNodeX - deckPadding),
            maxX: Math.max(220, maxNodeX + deckPadding),
            minZ: Math.min(-180, minNodeZ - deckPadding),
            maxZ: Math.max(180, maxNodeZ + deckPadding),
          }
        : { minX: -260, maxX: 260, minZ: -200, maxZ: 200 };

    return { worldPoints: pts, deckBounds: bounds };
  }, [data.services, serviceDepth, layoutMode, customOffsets, pinnedPositions]);

  const svgProject3D = webglActive ? null : project3DPoint;

  const positions = useMemo(() => {
    const raw = new Map<
      string,
      { x: number; y: number; z: number; tier: number; wx: number; wz: number; persp: number }
    >();
    const total = Math.max(1, data.services.length);

    if (view === "3D") {
      for (const [name, pt] of worldPoints.entries()) {
        const proj = svgProject3D
          ? svgProject3D(pt.wx, 0, pt.wz)
          : { x: 615 + pt.wx, y: 318 + pt.wz, z: 0, persp: 1 };
        raw.set(name, {
          x: proj.x,
          y: proj.y,
          z: proj.z,
          tier: pt.tier,
          wx: pt.wx,
          wz: pt.wz,
          persp: proj.persp,
        });
      }
      return raw;
    }

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
        const spX = totalCols <= 1 ? 0 : Math.min(285, 980 / (totalCols - 1));
        const spY = loc.rowCount <= 1 ? 0 : Math.min(185, 480 / (loc.rowCount - 1));
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
        wx: 0,
        wz: 0,
        persp: 1,
      });
    });

    return raw;
  }, [
    data.services,
    serviceDepth,
    layoutMode,
    view,
    worldPoints,
    svgProject3D,
    customOffsets,
    pinnedPositions,
    snapToGrid,
  ]);

  const { threeNodes, threeEdges } = useMemo(() => {
    if (view !== "3D") {
      return { threeNodes: [] as StudioThreeNode[], threeEdges: [] as StudioThreeEdge[] };
    }
    const replicasFor = (svc: string) => {
      const liveSvc = telemetry?.services.find((item) => item.service === svc);
      return liveSvc ? liveSvc.runningReplicas : 1;
    };
    const selectedIsStopped = selected ? replicasFor(selected) === 0 : false;
    const confirmedActions = (data.actions ?? []).filter((a) => a.status === "CONFIRMED");
    const builtNodes: StudioThreeNode[] = [];
    for (const [name, point] of worldPoints.entries()) {
      const live = telemetry?.services.find((item) => item.service === name);
      const elId = data.serviceMappings?.[name];
      const element = reference.data?.elements.find((el) => el.id === elId);
      const archetype = classifyArchetype(name, element?.elementType, element?.layer);
      const isAffected = affected.has(elId ?? "");
      const isSelected = selected === name;
      const isDropTarget = dropTargetNode === name;
      const isNotLiveSession = data.executionStatus !== "RUNNING";
      const authorStartsDown =
        isNotLiveSession && Boolean(authorHighlights?.authorStoppedServices?.has(name));
      const isAuthorImpactTarget = authorHighlights?.impactTarget === name;
      const isAuthorPredictedUpstream = Boolean(authorHighlights?.predictedUpstream?.has(name));
      const isStopped = (live !== undefined && live.runningReplicas === 0) || authorStartsDown;
      const lastSvcAction = [...confirmedActions].reverse().find((a) => a.service === name);
      const isPaused = !isStopped && lastSvcAction?.action === "PAUSE";
      const cpuThrottlePct =
        !isStopped &&
        !isPaused &&
        lastSvcAction?.action === "THROTTLE_CPU" &&
        typeof lastSvcAction.cpuPercent === "number" &&
        lastSvcAction.cpuPercent < 100
          ? lastSvcAction.cpuPercent
          : null;
      const statsSummary = summarizeServiceStats(live?.stats);
      const [ramUsedStr, ramLimitStr] = statsSummary.memory.split("/").map((p) => p.trim());
      const ramUsedMiB = parseMemoryMiB(ramUsedStr);
      const ramLimitMiB = parseMemoryMiB(ramLimitStr) ?? data.limits?.memoryMiB;
      const ramPct =
        !isStopped && ramUsedMiB !== undefined && ramLimitMiB !== undefined && ramLimitMiB > 0
          ? Math.min(100, Math.round((ramUsedMiB / ramLimitMiB) * 100))
          : null;
      const cpuMatch = statsSummary.cpu.match(/[\d.]+/);
      const cpuNum = cpuMatch ? Number(cpuMatch[0]) : NaN;
      const cpuPct = !isStopped && Number.isFinite(cpuNum) ? Math.min(100, cpuNum) : null;
      const isImpactedByOutage = isAffected && selectedIsStopped && !isStopped;
      const status = nodeStatus?.[name];
      const isCritical = isStopped || status === "Overloaded";
      const isWarning =
        isPaused ||
        cpuThrottlePct !== null ||
        isImpactedByOutage ||
        isAuthorImpactTarget ||
        isAuthorPredictedUpstream ||
        status === "Bottleneck" ||
        status === "Rate limited";
      const palette = resolveStudioNodePalette(activeStyleId, name, archetype, {
        isCritical,
        isWarning,
        isSelected,
        isDropTarget,
      });
      const stereotype =
        archetype === "GATEWAY"
          ? "«gateway»"
          : archetype === "DATABASE"
            ? "«database»"
            : archetype === "QUEUE"
              ? "«broker»"
              : "«service»";
      const liveReplicas = live ? live.runningReplicas : authorStartsDown ? 0 : 1;
      builtNodes.push({
        id: name,
        label: nodeNames?.[name] ?? name,
        archetype,
        stereotype,
        tier: point.tier,
        wx: point.wx,
        wz: point.wz,
        replicas: liveReplicas,
        isStopped,
        isPaused,
        isCritical,
        isWarning,
        isSelected,
        isDropTarget,
        ramPct,
        cpuPct,
        cpuThrottlePct,
        ramLabel: ramPct !== null ? `${ramPct}%` : null,
        palette,
      });
    }

    const builtEdges: StudioThreeEdge[] = [];
    const staticProtocolByPair = new Map(
      staticEdges.map((edge) => [`${edge.from}->${edge.to}`, edge.protocol]),
    );
    const isAsyncProtocol = (proto?: string | null) =>
      Boolean(proto && /(kafka|amqp|rabbit|queue|event|async|pubsub|mq|stream|sqs|sns)/i.test(proto));
    const sgByPair = new Map(
      (telemetry?.serviceGraph ?? []).map((sg) => [`${sg.client}->${sg.server}`, sg]),
    );
    const rawEdges = (telemetry?.interactions ?? []).filter(
      (edge) => !traceId || edge.traceId === traceId,
    );
    const deduped = traceId
      ? rawEdges
      : [...new Map(rawEdges.map((edge) => [`${edge.fromService}->${edge.toService}`, edge])).values()];
    const observedPairs = new Set(
      deduped.map((edge) => `${edge.fromService}->${edge.toService}`),
    );

    // 1-to-1 edge rendering: suppress duplicate static dashed line when live observed traffic exists for the same pair
    for (const edge of staticEdges) {
      if (observedPairs.has(`${edge.from}->${edge.to}`)) continue;
      const pairKey = `${edge.from}->${edge.to}`;
      const targetStopped =
        replicasFor(edge.to) === 0 || Boolean(authorHighlights?.authorStoppedServices?.has(edge.to));
      const isImpactBlastEdge = Boolean(authorHighlights?.impactEdgeKeys?.has(pairKey));
      const isRequiredEdge = Boolean(
        authorHighlights?.requiredTraceEdge &&
          authorHighlights.requiredTraceEdge.from === edge.from &&
          authorHighlights.requiredTraceEdge.to === edge.to,
      );
      builtEdges.push({
        id: `static:${edge.id}`,
        from: edge.from,
        to: edge.to,
        kind: isRequiredEdge || isImpactBlastEdge ? "observed" : "static",
        color: targetStopped
          ? "#e11d48"
          : isImpactBlastEdge
            ? "#f59e0b"
            : isRequiredEdge
              ? "#38bdf8"
              : isLight
                ? "#94a3b8"
                : "#64748b",
        dashed: !isRequiredEdge && !isImpactBlastEdge,
        protocol: edge.protocol,
        isAsync: isAsyncProtocol(edge.protocol),
        label: isRequiredEdge
          ? t("Required edge", "Đường kiểm chứng")
          : isImpactBlastEdge
            ? t("Impact path", "Nhánh ảnh hưởng")
            : null,
        isSevered: targetStopped,
        isDegraded: isImpactBlastEdge && !targetStopped,
      });
    }

    deduped.forEach((edge, idx) => {
      const span = spansByTraceAndId.get(`${edge.traceId}:${edge.childSpanId}`);
      const sg = sgByPair.get(`${edge.fromService}->${edge.toService}`);
      const pairKey = `${edge.fromService}->${edge.toService}`;
      const protocol = staticProtocolByPair.get(pairKey) ?? null;
      const status = span?.httpStatusCode;
      const httpError = typeof status === "number" && status >= 400 && status <= 599;
      const edgeSevered =
        httpError ||
        span?.spanStatus?.toUpperCase() === "ERROR" ||
        (sg !== undefined && sg.errorRatePercent >= 5);
      const edgeDegraded =
        !edgeSevered &&
        sg !== undefined &&
        (sg.errorRatePercent > 0 || (sg.p95Ms ?? 0) >= 250);
      const faultLabel = span?.circuitOpen
        ? "CIRCUIT OPEN"
        : sg && sg.errorRatePercent >= 5
          ? `${Number(sg.rps.toFixed(1))} rps · ${Math.round(sg.errorRatePercent)}% err`
          : httpError
            ? `${status} ✕`
            : "CALL FAILED";
      const durationNs = span?.durationNanoseconds?.trim();
      const durationMs = durationNs ? Number(durationNs) / 1_000_000 : NaN;
      const latencyLabel = sg
        ? `${Number(sg.rps.toFixed(1))} rps${sg.p95Ms != null ? ` · ${Math.round(sg.p95Ms)}ms` : ""}`
        : Number.isFinite(durationMs) && durationMs >= 0
          ? `${simulated ? "≈ " : ""}${durationMs > 0 && durationMs < 0.1 ? "<0.1" : Number(durationMs.toFixed(durationMs < 10 ? 1 : 0))} ms`
          : null;
      const targetReplicas = replicasFor(edge.toService);
      // Unified 4-state wire palette: Rose=error, Amber=degraded, Emerald/Teal=healthy live traffic, Dashed Gray=static only
      const edgeColor = edgeSevered
        ? "#e11d48"
        : edgeDegraded
          ? "#d97706"
          : sg && sg.rps > 0
            ? isLight
              ? "#059669"
              : "#10b981"
            : isLight
              ? "#0d9488"
              : "#14b8a6";
      builtEdges.push({
        id: `obs:${edge.traceId}:${idx}`,
        from: edge.fromService,
        to: edge.toService,
        kind: "observed",
        color: edgeColor,
        dashed: false,
        protocol,
        isAsync: isAsyncProtocol(protocol) || isAsyncProtocol(span?.operationName),
        rps: sg?.rps ?? null,
        label: edgeSevered ? faultLabel : latencyLabel,
        isSevered: edgeSevered,
        isDegraded: edgeDegraded,
        speedSec: Math.max(0.7, 2.2 / Math.max(1, Math.min(targetReplicas, 6))),
      });
    });

    return { threeNodes: builtNodes, threeEdges: builtEdges };
  }, [
    view,
    worldPoints,
    telemetry,
    data.actions,
    data.limits?.memoryMiB,
    data.serviceMappings,
    reference.data,
    affected,
    selected,
    dropTargetNode,
    nodeStatus,
    activeStyleId,
    nodeNames,
    staticEdges,
    isLight,
    traceId,
    spansByTraceAndId,
    simulated,
    authorHighlights,
    t,
  ]);

  function nodeAt(clientX: number, clientY: number) {
    const node = document.elementFromPoint(clientX, clientY)?.closest("[data-studio-node]");
    return node && svg.current?.contains(node) ? node.getAttribute("data-studio-node") : null;
  }

  function graphPoint(clientX: number, clientY: number) {
    const matrix = graphContent.current?.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
  }

  function cutWire(from: string, to: string) {
    setSelectedWire(null);
    onDisconnect?.(from, to);
  }

  function renderConnectPort(name: string, x: number, y: number, active = false) {
    if (!onConnect || busy) return null;
    const stroke = active ? "#7dd3fc" : "#475569";
    return (
      <g
        data-studio-connect-port={name}
        className={`cursor-crosshair transition-opacity hover:opacity-100 ${active ? "opacity-95" : "opacity-35"}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || activePointer.current !== null || !svg.current) return;
          event.preventDefault();
          event.stopPropagation();
          activePointer.current = event.pointerId;
          linkSource.current = name;
          setLinkPreview({ from: name, x, y, target: null });
          svg.current.setPointerCapture(event.pointerId);
        }}
      >
        <title>{t("Drag to connect to another service")}</title>
        <circle cx={x} cy={y} r="10" fill="transparent" />
        <circle cx={x} cy={y} r="6" fill="#0b1220" stroke={stroke} strokeWidth="1.35" />
        <path d={`M ${x - 2.5} ${y} h 5 M ${x} ${y - 2.5} v 5`} stroke={stroke} strokeWidth="1.25" />
      </g>
    );
  }

  function resolveLiveReplicas(serviceName: string): number {
    // Prefer latest confirmed Docker action over potentially lagging telemetry poll
    const confirmed = [...data.actions]
      .reverse()
      .find((item) => item.service === serviceName && item.status === "CONFIRMED");
    if (confirmed?.result?.replicasAfter !== undefined) {
      return confirmed.result.replicasAfter;
    }
    const live = telemetry?.services.find((item) => item.service === serviceName);
    if (live) return live.runningReplicas;
    return 1;
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
      ? Math.max(1, Math.min(3, (current <= 0 ? 1 : current) + tool.delta))
      : Math.max(1, Math.min(3, tool.replicas ?? 2));
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

      {/* Floating Bottom-Left Viewport Controls Pill + Collapsible 3D Camera & Layout Form */}
      {canvasOnly ? (
        <div
          data-tour="studio-3d-controls-group"
          className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2"
        >
          {view === "3D" && (
            <section
              data-testid="studio-3d-controls"
              aria-label={t("3D Camera", "Góc nhìn 3D")}
              className={`pointer-events-auto ${
                cameraFormOpen ? "w-[216px]" : "w-auto"
              } ${styleCfg.floatingCardClass}`}
            >
              <div className="flex items-center justify-between gap-1.5 px-2 py-1">
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] font-bold tracking-tight">
                  <Box className="size-3 shrink-0 text-primary" aria-hidden="true" />
                  {t("3D Camera", "Góc nhìn 3D")}
                </span>
                <div className="flex items-center gap-1">
                  {cameraFormOpen && (
                    <span
                      className={`font-mono text-[10px] whitespace-nowrap ${styleCfg.subtleTextClass}`}
                    >
                      {Math.round(((((camera.yaw * 180) / Math.PI) % 360) + 360) % 360)}°·
                      {Math.round((clampedPitch * 180) / Math.PI)}°
                    </span>
                  )}
                  <button
                    type="button"
                    aria-expanded={cameraFormOpen}
                    aria-label={
                      cameraFormOpen
                        ? t("Collapse 3D controls", "Thu gọn điều khiển 3D")
                        : t("Expand 3D controls", "Mở điều khiển 3D")
                    }
                    onClick={() => setCameraFormOpen((open) => !open)}
                    className={`p-0.5 transition ${styleCfg.railIdleClass}`}
                  >
                    {cameraFormOpen ? (
                      <ChevronDown className="size-3" aria-hidden="true" />
                    ) : (
                      <ChevronUp className="size-3" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              {cameraFormOpen && (
                <div
                  className={`space-y-1.5 border-t px-2 py-1.5 ${
                    studioStyle === "pop"
                      ? "border-slate-900"
                      : studioStyle === "blueprint"
                        ? "border-blue-300/90"
                        : isLight
                          ? "border-sky-200/80"
                          : "border-slate-700/70"
                  }`}
                >
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ["Isometric", "Góc 3D", DEFAULT_3D_CAMERA.yaw, DEFAULT_3D_CAMERA.pitch],
                        ["Top-down", "Từ trên", TOP_DOWN_3D_CAMERA.yaw, TOP_DOWN_3D_CAMERA.pitch],
                        ["Elevation", "Mặt đứng", ELEVATION_3D_CAMERA.yaw, ELEVATION_3D_CAMERA.pitch],
                      ] as const
                    ).map(([labelEn, labelVi, presetYaw, presetPitch]) => {
                      const active =
                        Math.abs((((camera.yaw - presetYaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) < 0.06 &&
                        Math.abs(clampedPitch - presetPitch) < 0.05;
                      return (
                        <button
                          key={labelEn}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setPan({ x: 0, y: 0 });
                            setZoom(1);
                            setCamera({ yaw: presetYaw, pitch: presetPitch });
                          }}
                          className={`whitespace-nowrap border px-1 py-1 text-[10px] font-semibold transition ${styleCfg.controlRadiusClass} ${
                            active ? styleCfg.controlActiveClass : styleCfg.controlIdleClass
                          }`}
                        >
                          {t(labelEn, labelVi)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      type="button"
                      title={t("Rotate left", "Xoay trái")}
                      aria-label={t("Rotate left", "Xoay trái")}
                      onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw - 0.26 }))}
                      className={`inline-flex h-7 items-center justify-center border transition ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title={t("Rotate right", "Xoay phải")}
                      aria-label={t("Rotate right", "Xoay phải")}
                      onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw + 0.26 }))}
                      className={`inline-flex h-7 items-center justify-center border transition ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}
                    >
                      <RotateCw className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title={t("Tilt up", "Nâng góc")}
                      aria-label={t("Tilt up", "Nâng góc")}
                      onClick={() =>
                        setCamera((value) => ({
                          ...value,
                          pitch: Math.min(PITCH_MAX, value.pitch + 0.14),
                        }))
                      }
                      className={`inline-flex h-7 items-center justify-center border transition ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}
                    >
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title={t("Tilt down", "Hạ góc")}
                      aria-label={t("Tilt down", "Hạ góc")}
                      onClick={() =>
                        setCamera((value) => ({
                          ...value,
                          pitch: Math.max(PITCH_MIN, value.pitch - 0.14),
                        }))
                      }
                      className={`inline-flex h-7 items-center justify-center border transition ${styleCfg.controlRadiusClass} ${styleCfg.controlIdleClass}`}
                    >
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          <div
            data-tour="studio-viewport-pill"
            className={`pointer-events-auto inline-flex items-center gap-0.5 px-1 py-1 ${styleCfg.floatingPillClass}`}
          >
            {(["2D", "3D"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => {
                  if (view !== mode) onSound?.("select");
                  if (mode === "2D") setWebglReady(false);
                  setView(mode);
                }}
                className={`px-2 py-0.5 font-mono text-xs font-semibold transition ${
                  studioStyle === "blueprint" ? "rounded-sm" : "rounded-full"
                } ${
                  view === mode
                    ? `border ${styleCfg.controlActiveClass}`
                    : styleCfg.tabIdleClass
                }`}
              >
                {mode}
              </button>
            ))}
            <span
              className={`mx-0.5 h-4 w-px ${styleCfg.dividerClass}`}
              aria-hidden="true"
            />
            <button
              type="button"
              title={t("Auto-layout", "Tự sắp xếp")}
              aria-label={t("Auto-layout", "Tự sắp xếp")}
              onClick={() => {
                setCustomOffsets({});
                setPinnedPositions({});
              }}
              className={`p-1 transition ${styleCfg.railIdleClass}`}
            >
              <LayoutGrid className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={t("Fit to view", "Vừa khung hình")}
              aria-label={t("Fit to view", "Vừa khung hình")}
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1);
                setCamera(DEFAULT_3D_CAMERA);
              }}
              className={`p-1 transition ${styleCfg.railIdleClass}`}
            >
              <Maximize2 className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={t("Zoom out", "Thu nhỏ")}
              aria-label={t("Zoom out", "Thu nhỏ")}
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
              className={`rounded-full p-1 transition ${
                isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
              }`}
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={t("Zoom in", "Phóng to")}
              aria-label={t("Zoom in", "Phóng to")}
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
              className={`rounded-full p-1 transition ${
                isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
              }`}
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
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
              onClick={() => {
                if (view !== mode) onSound?.("select");
                if (mode === "2D") setWebglReady(false);
                setView(mode);
              }}
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
                  setCamera((value) => ({ ...value, pitch: Math.min(PITCH_MAX, value.pitch + 0.14) }))
                }
              >
                {t("Tilt up")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCamera((value) => ({ ...value, pitch: Math.max(PITCH_MIN, value.pitch - 0.14) }))
                }
              >
                {t("Tilt down")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera(DEFAULT_3D_CAMERA)}
              >
                {t("Isometric")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera(TOP_DOWN_3D_CAMERA)}
              >
                {t("Top-down")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCamera(ELEVATION_3D_CAMERA)}
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

      {/* Interactive 2D/3D Studio Canvas (Real Three.js WebGL 3D when view === "3D" + crisp 2D SVG) */}
      <div
        className={
          canvasOnly
            ? "relative flex min-h-0 flex-1 overflow-hidden"
            : "relative max-w-full overflow-x-auto"
        }
      >
        {view === "3D" && (
          <StudioThreeStage
            nodes={threeNodes}
            edges={threeEdges}
            deckBounds={deckBounds}
            camera={camera}
            zoom={zoom}
            pan={pan}
            styleId={activeStyleId}
            busy={busy}
            showNodeTags={showNodeTags}
            showEdgeTags={showEdgeTags}
            onCameraChange={setCamera}
            onZoomChange={setZoom}
            onPanChange={setPan}
            onMoveNode={(svc, deltaWx, deltaWz) => {
              const key = `3D:${svc}`;
              setCustomOffsets((prev) => {
                const cur = prev[key] ?? { x: 0, y: 0 };
                return {
                  ...prev,
                  [key]: {
                    x: Math.round(cur.x + deltaWx),
                    y: Math.round(cur.y + deltaWz),
                  },
                };
              });
            }}
            onSelect={(svc) => {
              if (svc && svc !== selected) onSound?.("select");
              onSelect(svc);
            }}
            {...(onSelectEdge ? { onSelectEdge } : {})}
            onDropTool={(toolId, targetService) => {
              if (toolId.startsWith("author-") && onDropAuthorChip) {
                onDropAuthorChip(toolId, targetService);
                setDraggedTool(null);
                return;
              }
              const tool = PALETTE_ITEMS.find((item) => item.id === toolId) ?? draggedTool ?? null;
              if (tool) applyPaletteToolToService(tool, targetService);
              setDraggedTool(null);
            }}
            onReadyChange={handleWebglReadyChange}
          />
        )}
        <svg
          ref={svg}
          data-studio-graph="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 660"
          className={
            canvasOnly
              ? "h-full w-full select-none"
              : "min-w-[640px] w-full select-none rounded-lg border bg-background shadow-inner"
          }
          role="group"
          aria-label={t("Runtime topology and impact")}
          onContextMenu={(event) => event.preventDefault()}
          onLostPointerCapture={endPointerInteraction}
          style={{
            ...(canvasOnly ? { background: styleCfg.canvasBgCss } : { maxHeight: 560 }),
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
              const point = graphPoint(event.clientX, event.clientY);
              if (!point) return;
              const { x: worldX, y: worldY } = point;
              const sinP = Math.max(0.4, Math.sin(clampedPitch));
              setPinnedPositions((prev) => ({
                ...prev,
                [view === "3D" ? "3D:" + createdName : createdName]: {
                  x: Math.round(view === "3D" ? (worldX-615)*Math.cos(camera.yaw)+((worldY-318)/sinP)*Math.sin(camera.yaw) : worldX),
                  y: Math.round(view === "3D" ? -(worldX-615)*Math.sin(camera.yaw)+((worldY-318)/sinP)*Math.cos(camera.yaw) : worldY),
                },
              }));
            }
          }}
          onPointerDownCapture={(event) => {
            if (event.button === 0 && !(event.target as Element).closest("[data-studio-edge-from], [data-studio-cut-wire]")) {
              setSelectedWire(null);
            }
          }}
          onPointerDown={(event) => {
            if (activePointer.current !== null || ![0,1,2].includes(event.button)) return;
            event.preventDefault();
            activePointer.current = event.pointerId;
            if (event.button === 2) canvasRightGesture.current = true;
            cameraDrag.current = {
              x: event.clientX,
              y: event.clientY,
              mode: view === "3D" && event.button === 2 ? "ROTATE" : "PAN",
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (event.pointerId !== activePointer.current) return;
            const from = linkSource.current;
            const to = from ? nodeAt(event.clientX, event.clientY) : null;
            const moved = nodeDrag.current?.moved;
            const clickedBlankCanvas =
              !from &&
              !nodeDrag.current &&
              cameraDrag.current?.mode === "PAN" &&
              !cameraDrag.current.moved;
            endPointerInteraction();
            if (from && to && from !== to) onConnect?.(from, to);
            else if (moved) onSound?.("place");
            else if (clickedBlankCanvas && selected) onSelect("");
          }}
          onPointerCancel={endPointerInteraction}
          onPointerMove={(event) => {
            if (event.buttons === 0) { endPointerInteraction(); return; }
            if (activePointer.current !== event.pointerId) return;
            if (linkSource.current) {
              const point = graphPoint(event.clientX, event.clientY);
              if (point) {
                setLinkPreview({
                  from: linkSource.current,
                  x: point.x,
                  y: point.y,
                  target: nodeAt(event.clientX, event.clientY),
                });
              }
              return;
            }
            if (nodeDrag.current && svg.current) {
              const matrix = svg.current.getScreenCTM();
              if (!matrix) return;
              const inverse = matrix.inverse();
              const start = new DOMPoint(nodeDrag.current.startX,nodeDrag.current.startY).matrixTransform(inverse);
              const current = new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse);
              const screenDx = (current.x-start.x)/zoom;
              const screenDy = (current.y-start.y)/zoom;
              const sinP = Math.max(0.4, Math.sin(clampedPitch));
              const dx = view === "3D" ? screenDx*Math.cos(camera.yaw)+(screenDy/sinP)*Math.sin(camera.yaw) : screenDx;
              const dy = view === "3D" ? -screenDx*Math.sin(camera.yaw)+(screenDy/sinP)*Math.cos(camera.yaw) : screenDy;
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
              moved: cameraDrag.current.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2,
            };
            if (cameraDrag.current.mode === "ROTATE") {
              const intentionalTilt = Math.abs(dy) > Math.abs(dx) * 0.35;
              setCamera((value) => ({
                yaw: value.yaw - dx * 0.008,
                pitch: intentionalTilt
                  ? Math.max(PITCH_MIN, Math.min(PITCH_MAX, value.pitch + dy * 0.004))
                  : Math.max(PITCH_MIN, Math.min(PITCH_MAX, value.pitch)),
              }));
            } else {
              const matrix = svg.current?.getScreenCTM();
              if (!matrix) return;
              const inverse = matrix.inverse();
              const origin = new DOMPoint(0, 0).matrixTransform(inverse);
              const delta = new DOMPoint(dx, dy).matrixTransform(inverse);
              setPan((prev) => ({
                x: Math.max(-3600, Math.min(3600, prev.x + delta.x - origin.x)),
                y: Math.max(-2400, Math.min(2400, prev.y + delta.y - origin.y)),
              }));
            }
          }}
        >
          <defs>
            {styleCfg.gridKind === "blueprint" ? (
              <>
                <pattern id="studio-grid-minor" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path
                    d="M 24 0 L 0 0 0 24"
                    fill="none"
                    stroke={styleCfg.gridColor}
                    strokeWidth="0.7"
                    opacity="0.75"
                  />
                </pattern>
                <pattern id="studio-grid" width="120" height="120" patternUnits="userSpaceOnUse">
                  <rect width="120" height="120" fill="url(#studio-grid-minor)" />
                  <path
                    d="M 120 0 L 0 0 0 120"
                    fill="none"
                    stroke={styleCfg.gridMajorColor}
                    strokeWidth="1.15"
                    opacity="0.8"
                  />
                  <path
                    d="M 116 0 L 124 0 M 0 116 L 0 124"
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="1.2"
                    opacity="0.55"
                  />
                </pattern>
              </>
            ) : styleCfg.gridKind === "plus" ? (
              <pattern id="studio-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path
                  d="M 14 11.5 V 16.5 M 11.5 14 H 16.5"
                  fill="none"
                  stroke={styleCfg.gridColor}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.85"
                />
              </pattern>
            ) : (
              <pattern id="studio-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle
                  cx="12"
                  cy="12"
                  r={isLight ? "1.1" : "1.05"}
                  fill={styleCfg.gridColor}
                  opacity={isLight ? "0.75" : "0.55"}
                />
              </pattern>
            )}
          </defs>

          {/* Infinite Camera Viewport Transform (draw.io / Figma style proportional zoom & pan) */}
          <g
            ref={graphContent}
            data-studio-scene
            transform={`translate(${600 + pan.x}, ${330 + pan.y}) scale(${zoom}) translate(-600, -330)`}
          >
            {/* Infinite Studio Blueprint Grid (spans 10,800 × 10,800 world units when zoomed out) */}
            <rect data-studio-background x="-4800" y="-4800" width="10800" height="10800" fill="url(#studio-grid)" />

          <g
            data-studio-svg-overlay
            opacity={webglActive ? 0 : 1}
            style={webglActive ? { pointerEvents: "none" } : undefined}
          >
          {/* 3D Top-Down Turntable Architecture Platform Deck (SVG fallback when WebGL is inactive) */}
          {view === "3D" &&
            (() => {
              const { minX, maxX, minZ, maxZ } = deckBounds;
              const corners = [
                { x: minX, z: minZ },
                { x: maxX, z: minZ },
                { x: maxX, z: maxZ },
                { x: minX, z: maxZ },
              ];
              const topCorners = corners.map(({ x, z }) => project3DPoint(x, 14, z));
              const botCorners = corners.map(({ x, z }) => project3DPoint(x, 28, z));
              const topPoly = topCorners.map((p) => `${p.x},${p.y}`).join(" ");
              const thirdX1 = minX + (maxX - minX) / 3;
              const thirdX2 = minX + ((maxX - minX) * 2) / 3;
              const midZ = (minZ + maxZ) / 2;
              const div1A = project3DPoint(thirdX1, 14, minZ);
              const div1B = project3DPoint(thirdX1, 14, maxZ);
              const div2A = project3DPoint(thirdX2, 14, minZ);
              const div2B = project3DPoint(thirdX2, 14, maxZ);
              const crossA = project3DPoint(minX, 14, midZ);
              const crossB = project3DPoint(maxX, 14, midZ);
              return (
                <g>
                  {/* Solid Top-Down Tabletop Surface (adapts cleanly to bright architectural diorama or dark NOC stage) */}
                  <polygon
                    data-testid="studio-deck"
                    points={topPoly}
                    fill={styleCfg.deckTopFill}
                    opacity={isLight ? "0.96" : "0.95"}
                    stroke={styleCfg.deckStroke}
                    strokeOpacity={isLight ? "0.9" : "0.55"}
                    strokeWidth={activeStyleId === "pop" ? "2" : "1.4"}
                    style={
                      isLight
                        ? { filter: "drop-shadow(0 18px 28px rgba(15,23,42,0.10))" }
                        : undefined
                    }
                  />
                  {/* Front-Facing 3D Slab Rim Walls ONLY */}
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
                        fill={styleCfg.deckRimFill}
                        stroke={styleCfg.deckStroke}
                        strokeWidth={activeStyleId === "pop" ? "1.6" : "1"}
                        opacity="0.92"
                      />
                    );
                  })}
                  {/* Inner Rotating Tier Divider Lines */}
                  <line
                    x1={div1A.x}
                    y1={div1A.y}
                    x2={div1B.x}
                    y2={div1B.y}
                    stroke={styleCfg.deckGridStroke}
                    strokeDasharray="4 5"
                    opacity={isLight ? "0.3" : "0.18"}
                  />
                  <line
                    x1={div2A.x}
                    y1={div2A.y}
                    x2={div2B.x}
                    y2={div2B.y}
                    stroke={styleCfg.deckGridStroke}
                    strokeDasharray="4 5"
                    opacity={isLight ? "0.3" : "0.18"}
                  />
                  <line
                    x1={crossA.x}
                    y1={crossA.y}
                    x2={crossB.x}
                    y2={crossB.y}
                    stroke={styleCfg.deckGridStroke}
                    strokeDasharray="3 6"
                    opacity={isLight ? "0.22" : "0.12"}
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

          {/* Static Dependency Edges + Observed Traffic + Interactive 2D/3D Service Blocks */}
          <g data-tour={webglActive ? undefined : "studio-services-graph"}>
          {(() => {
            const observedPairs = new Set(
              (telemetry?.interactions ?? [])
                .filter((edge) => !traceId || edge.traceId === traceId)
                .map((edge) => `${edge.fromService}->${edge.toService}`),
            );
            return staticEdges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const targetStopped = resolveLiveReplicas(edge.to) === 0;
            const hasObservedOverlay = observedPairs.has(`${edge.from}->${edge.to}`);
            if (hasObservedOverlay) return null;
            const isSkipColumn = view === "2D" && Math.abs(to.x - from.x) > 340;
            const useOrtho = view === "2D" && styleCfg.wireMode === "orthogonal";
            const ctrlX = (from.x + to.x) / 2;
            const ctrlY = isSkipColumn
              ? Math.max(from.y, to.y) + 68
              : (from.y + to.y) / 2;
            const staticPathD = useOrtho
              ? isSkipColumn
                ? `M ${from.x} ${from.y} L ${from.x} ${ctrlY} L ${to.x} ${ctrlY} L ${to.x} ${to.y}`
                : `M ${from.x} ${from.y} L ${ctrlX} ${from.y} L ${ctrlX} ${to.y} L ${to.x} ${to.y}`
              : isSkipColumn
                ? `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`
                : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
            const midX = isSkipColumn
              ? useOrtho
                ? ctrlX
                : 0.25 * from.x + 0.5 * ctrlX + 0.25 * to.x
              : (from.x + to.x) / 2;
            const midY = isSkipColumn
              ? useOrtho
                ? ctrlY
                : 0.25 * from.y + 0.5 * ctrlY + 0.25 * to.y
              : (from.y + to.y) / 2;
            return (
              <g key={edge.id}
                data-studio-edge-from={edge.from} data-studio-edge-to={edge.to}
                role={configuredEdges && onDisconnect ? "button" : undefined}
                tabIndex={configuredEdges && onDisconnect ? 0 : undefined}
                aria-label={configuredEdges ? `${nodeNames?.[edge.from] ?? edge.from} → ${nodeNames?.[edge.to] ?? edge.to}` : undefined}
                onPointerDown={(event) => { if (configuredEdges && event.button === 0) event.stopPropagation(); }}
                onClick={() => { if (configuredEdges && onDisconnect) setSelectedWire({ from: edge.from, to: edge.to }); }}
                onKeyDown={(event) => {
                  if (!configuredEdges || !onDisconnect) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedWire({ from: edge.from, to: edge.to });
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <title>{configuredEdges ? "Configured route, awaiting observed traces" : "Static dependency"} · {edge.protocol}</title>
                {configuredEdges && <path d={staticPathD} fill="none"
                  stroke="transparent" strokeWidth="16" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />}
                <path
                  d={staticPathD}
                  fill="none"
                  stroke={targetStopped ? "var(--destructive)" : activeWire?.from === edge.from && activeWire.to === edge.to ? "#0056D2" : isLight ? "#94a3b8" : "#64748b"}
                  strokeDasharray={targetStopped ? "6 4" : "5 5"}
                  strokeWidth={targetStopped ? "2.1" : "1.6"}
                  opacity={targetStopped ? "0.9" : "0.75"}
                />
                {renderWireArrow(isSkipColumn ? { x: ctrlX, y: ctrlY } : from, to, getNodeLabel(nodeNames?.[edge.to] ?? edge.to, view), targetStopped ? "var(--destructive)" : "#94a3b8", false, view === "3D" ? sculptureScale(resolveLiveReplicas(edge.to)) * Math.max(0.86, Math.min(1.12, to.persp)) : 1)}
                {targetStopped && !hasObservedOverlay && (
                  <g>
                    <rect
                      x={midX - 42}
                      y={midY - 10}
                      width="84"
                      height="19"
                      rx="9.5"
                      fill={isLight ? "#fff1f2" : "#2a0913"}
                      stroke="#e11d48"
                      strokeWidth="1.2"
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fill={isLight ? "#be123c" : "#fda4af"}
                      fontSize="9.5"
                      fontWeight="700"
                    >
                      Unavailable
                    </text>
                  </g>
                )}
              </g>
            );
          });
          })()}

          {/* Observed Live OTel Trace Edges + OTel servicegraph RED overlay */}
          {(() => {
            const sgByPair = new Map(
              (telemetry?.serviceGraph ?? []).map((sg) => [`${sg.client}->${sg.server}`, sg]),
            );
            const rawEdges = (telemetry?.interactions ?? []).filter(
              (edge) => !traceId || edge.traceId === traceId,
            );
            // Deduplicate per (from, to) pair in live view so 200 recent spans don't stack 200 identical SVG paths.
            const deduped = traceId
              ? rawEdges
              : [...new Map(rawEdges.map((edge) => [`${edge.fromService}->${edge.toService}`, edge])).values()];
            return deduped.map((edge, index) => {
              const from = positions.get(edge.fromService);
              const to = positions.get(edge.toService);
              if (!from || !to) return null;
              const span = spansByTraceAndId.get(`${edge.traceId}:${edge.childSpanId}`);
              const sg = sgByPair.get(`${edge.fromService}->${edge.toService}`);
              const status = span?.httpStatusCode;
              const httpError = typeof status === "number" && status >= 400 && status <= 599;
              const edgeSevered =
                httpError ||
                span?.spanStatus?.toUpperCase() === "ERROR" ||
                (sg !== undefined && sg.errorRatePercent >= 5);
              const edgeDegraded =
                !edgeSevered &&
                sg !== undefined &&
                (sg.errorRatePercent > 0 || (sg.p95Ms ?? 0) >= 250);
              const faultLabel = span?.circuitOpen
                ? "CIRCUIT OPEN"
                : sg && sg.errorRatePercent >= 5
                  ? `${Number(sg.rps.toFixed(1))} rps · ${Math.round(sg.errorRatePercent)}% err`
                  : httpError
                    ? `${status} ✕`
                    : "CALL FAILED";
              const durationNs = span?.durationNanoseconds?.trim();
              const durationMs = durationNs ? Number(durationNs) / 1_000_000 : NaN;
              const latencyLabel = sg
                ? `${Number(sg.rps.toFixed(1))} rps${sg.p95Ms != null ? ` · ${Math.round(sg.p95Ms)}ms` : ""}`
                : Number.isFinite(durationMs) && durationMs >= 0
                  ? `${simulated ? "≈ " : ""}${durationMs > 0 && durationMs < 0.1 ? "<0.1" : Number(durationMs.toFixed(durationMs < 10 ? 1 : 0))} ms`
                  : null;
              const wireLabel = edgeSevered ? faultLabel : latencyLabel;
              const badgeWidth = wireLabel ? Math.max(42, wireLabel.length * 6 + 12) : 0;
              const targetReplicas = resolveLiveReplicas(edge.toService);
              const dist3D = view === "3D" ? Math.hypot(to.wx - from.wx, to.wz - from.wz) : 0;
              const arcLift = Math.min(68, Math.max(24, dist3D * 0.16));
              const arcCtrl =
                view === "3D"
                  ? project3DPoint((from.wx + to.wx) / 2, -arcLift, (from.wz + to.wz) / 2)
                  : null;
              const mx = arcCtrl
                ? 0.25 * from.x + 0.5 * arcCtrl.x + 0.25 * to.x
                : (from.x + to.x) / 2;
              const my = arcCtrl
                ? 0.25 * from.y + 0.5 * arcCtrl.y + 0.25 * to.y
                : (from.y + to.y) / 2;
              const qx1 = from.x + (to.x - from.x) * 0.28;
              const qy1 = from.y + (to.y - from.y) * 0.28;
              const qx2 = from.x + (to.x - from.x) * 0.72;
              const qy2 = from.y + (to.y - from.y) * 0.72;
              const cx1 = from.x + (to.x - from.x) * 0.5;
              const cx2 = from.x + (to.x - from.x) * 0.5;
              const pathD =
                view === "3D" && arcCtrl
                  ? `M ${from.x} ${from.y} Q ${arcCtrl.x} ${arcCtrl.y} ${to.x} ${to.y}`
                  : view === "2D" && styleCfg.wireMode === "orthogonal"
                    ? `M ${from.x} ${from.y} L ${cx1} ${from.y} L ${cx1} ${to.y} L ${to.x} ${to.y}`
                    : `M ${from.x} ${from.y} C ${cx1} ${from.y}, ${cx2} ${to.y}, ${to.x} ${to.y}`;
              const speedSec = Math.max(0.7, 2.2 / Math.max(1, Math.min(targetReplicas, 6))).toFixed(
                2,
              );
              const wireSelected = activeWire?.from === edge.fromService && activeWire.to === edge.toService;
              const wireName = `${nodeNames?.[edge.fromService] ?? edge.fromService} → ${nodeNames?.[edge.toService] ?? edge.toService}`;
              const edgeColor = wireSelected
                ? "#0056D2"
                : edgeSevered
                  ? "#e11d48"
                  : edgeDegraded
                    ? "#d97706"
                    : sg && sg.rps > 0
                      ? isLight
                        ? "#059669"
                        : "#10b981"
                      : isLight
                        ? "#0d9488"
                        : "#14b8a6";
              const strokeWeight = wireSelected
                ? "3.2"
                : sg && sg.rps > 0
                  ? String(Math.min(3.6, Math.max(2.0, 1.6 + Math.log2(sg.rps + 1) * 0.55)).toFixed(1))
                  : edgeSevered
                    ? "2.2"
                    : "1.9";
              return (
                <g
                  key={edge.traceId + index}
                  data-studio-edge-from={edge.fromService}
                  data-studio-edge-to={edge.toService}
                  role={onDisconnect ? "button" : undefined}
                  tabIndex={onDisconnect ? 0 : undefined}
                  aria-label={onDisconnect ? wireName : undefined}
                  aria-pressed={onDisconnect ? wireSelected : undefined}
                  onPointerDown={(event) => {
                    if (event.button === 0) event.stopPropagation();
                  }}
                  onClick={() => {
                    if (!wireSelected) onSound?.("select");
                    if (onDisconnect) setSelectedWire({ from: edge.fromService, to: edge.toService });
                    else setTraceId(edge.traceId);
                  }}
                  onKeyDown={(event) => {
                    if (!onDisconnect) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedWire({ from: edge.fromService, to: edge.toService });
                    } else if (wireSelected && (event.key === "Delete" || event.key === "Backspace")) {
                      event.preventDefault();
                      cutWire(edge.fromService, edge.toService);
                    } else if (event.key === "Escape") {
                      setSelectedWire(null);
                    }
                  }}
                  className="group cursor-pointer outline-none"
                >
                  <title>
                    {span?.operationName || wireName}
                    {sg ? ` · ${Number(sg.rps.toFixed(1))} rps · err ${Number(sg.errorRatePercent.toFixed(1))}%` : ""}
                    {latencyLabel && !sg ? ` · ${simulated ? "Simulated latency" : "Trace duration"}: ${latencyLabel}` : ""}
                    {typeof status === "number" ? ` · HTTP ${status}` : ""}
                  </title>
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth="16"
                    vectorEffect="non-scaling-stroke" pointerEvents="stroke" data-studio-wire-hit />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={edgeColor}
                    pointerEvents="none"
                    className="group-hover:stroke-sky-300 group-focus-visible:stroke-sky-300 group-focus-visible:stroke-[3] group-focus-visible:opacity-100"
                    strokeDasharray={edgeSevered ? "6 4" : undefined}
                    strokeWidth={strokeWeight}
                    opacity={wireSelected || edgeSevered || (sg && sg.rps > 0) ? "0.95" : "0.6"}
                  />
                  {renderWireArrow(arcCtrl ?? from, to, getNodeLabel(nodeNames?.[edge.toService] ?? edge.toService, view), wireSelected || edgeSevered || edgeDegraded || (sg && sg.rps > 0) ? edgeColor : "#94a3b8", true, view === "3D" ? sculptureScale(targetReplicas) * Math.max(0.86, Math.min(1.12, to.persp)) : 1)}
                  {showEdgeTags && wireLabel && (
                    <g data-studio-wire-metric>
                      <rect
                        x={mx - badgeWidth / 2}
                        y={my - 9}
                        width={badgeWidth}
                        height="18"
                        rx="8"
                        fill={isLight ? (edgeSevered ? "#fff1f2" : edgeDegraded ? "#fffbeb" : "#ffffff") : "#090d16"}
                        stroke={edgeSevered ? "#e11d48" : edgeDegraded ? "#d97706" : wireSelected ? "#0056D2" : sg && sg.rps > 0 ? "#059669" : isLight ? "#cbd5e1" : "#334155"}
                        strokeWidth="1"
                      />
                      <text
                        x={mx}
                        y={my + 3.5}
                        textAnchor="middle"
                        fill={isLight ? (edgeSevered ? "#be123c" : edgeDegraded ? "#b45309" : "#0f172a") : (edgeSevered ? "#fda4af" : edgeDegraded ? "#fde68a" : "#e2e8f0")}
                        fontFamily="monospace"
                        fontSize="10"
                        fontWeight="600"
                      >
                        {wireLabel}
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
                  <circle
                    r={edgeSevered ? "3.6" : "3.8"}
                    fill={edgeSevered ? "#f43f5e" : "#38bdf8"}
                    opacity="0.9"
                    pointerEvents="none"
                  >
                    <animateMotion dur={`${speedSec}s`} repeatCount="indefinite" path={pathD} />
                  </circle>
                </g>
              );
            });
          })()}

          {/* Interactive Draggable 2D/3D Service Blocks + True Volumetric 3D Isometric Server Racks & Stacked Replica Cubes */}
          {[...positions.entries()]
            .sort((a, b) => (view === "3D" ? a[1].z - b[1].z : a[1].y - b[1].y))
            .map(([name, point]) => {
              const live = telemetry?.services.find((item) => item.service === name);
              const elId = data.serviceMappings?.[name];
              const element = reference.data?.elements.find((el) => el.id === elId);
              const archetype = classifyArchetype(name, element?.elementType, element?.layer);
              const isAffected = affected.has(elId ?? "");
              const isSelected = selected === name;
              function selectNode() {
                if (!isSelected) onSound?.("select");
                onSelect(name);
              }
              const isDropTarget = dropTargetNode === name ||
                (linkPreview?.target === name && linkPreview.from !== name);
              const isStopped = live !== undefined && live.runningReplicas === 0;
              const selectedIsStopped = selected ? resolveLiveReplicas(selected) === 0 : false;
              const isImpactedByOutage = isAffected && selectedIsStopped && !isStopped;
              const depthScale = view === "3D" ? Math.max(0.86, Math.min(1.12, point.persp)) : 1;
              const scale = sculptureScale(live?.runningReplicas ?? 1) * depthScale;
              const nodeName = nodeNames?.[name] ?? name;
              const { text: displayName, width: labelWidth, y: labelY, height: labelHeight } = getNodeLabel(nodeName, view);


              // Never paint healthy running callers red just because a downstream node is selected
              const baseTheme = getArchetypeTheme(
                archetype,
                isStopped,
                isSelected,
                isDropTarget,
                name,
              );

              const status = nodeStatus?.[name];
              const isCritical = isStopped || status === "Overloaded";
              const isWarning = isImpactedByOutage || status === "Bottleneck" || status === "Rate limited";
              const healthColor = isCritical ? "#f43f5e" : isWarning ? "#fbbf24" : undefined;
              const healthTint = isCritical ? "#fda4af" : isWarning ? "#fde68a" : undefined;
              const healthFill = isCritical ? "#881337" : isWarning ? "#422a0a" : undefined;
              const theme = healthColor && healthTint && healthFill
                ? { ...baseTheme, stroke: healthColor, accent: healthTint, iconBg: healthFill }
                : baseTheme;
              // Clean SE-Standard 3D Sculptures (NO base tray / pedestal) + Floating Pill Name Tag
              if (view === "3D") {
                const pillBadgeText = isStopped
                  ? "0"
                  : `×${live ? live.runningReplicas : 1}`;

                return (
                  <g
                    key={name}
                    role="button"
                    tabIndex={0}
                    aria-label={nodeName}
                    data-studio-node={name}
                    aria-pressed={isSelected}
                    style={{ outline: "none" }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || activePointer.current !== null) return;
                      selectNode();
                      event.stopPropagation();
                      event.preventDefault();
                      activePointer.current = event.pointerId;
                      svg.current?.setPointerCapture(event.pointerId);
                      const positionKey = view === "3D" ? "3D:" + name : name;
                      const existing = customOffsets[positionKey] ?? { x: 0, y: 0 };
                      nodeDrag.current = {
                        service: positionKey,
                        startX: event.clientX,
                        startY: event.clientY,
                        origX: existing.x,
                        origY: existing.y,
                        moved: false,
                      };
                      setDraggingNode(name);
                    }}
                    onClick={() => {
                      selectNode();
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
                      if (toolId.startsWith("author-") && onDropAuthorChip) {
                        onDropAuthorChip(toolId, name);
                        setDraggedTool(null);
                        return;
                      }
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
                        selectNode();
                      }
                    }}
                    className="cursor-grab outline-none focus:outline-none active:cursor-grabbing"
                  >
                    {/* Pure 3D Software Engineering Sculpture (glows ONLY when selected/clicked or crashed) */}
                    <title>{nodeName}</title>
                    {(() => {
                      const palette = resolveStudioNodePalette(activeStyleId, name, archetype, {
                        isCritical,
                        isWarning,
                        isSelected,
                        isDropTarget,
                      });
                      const sculptureTheme = {
                        stroke: palette.stroke,
                        cardFill: palette.cardFill,
                        iconBg: palette.iconBg,
                        accent: palette.accent,
                      };
                      const {
                        pillBg,
                        pillStroke,
                        pillChipBg,
                        pillIconColor,
                        pillTextFill,
                        pillCountFill,
                      } = palette;
                      return (
                        <>
                          <g
                            data-studio-sculpture
                            data-studio-icon-style={activeStyleId}
                            transform={`translate(${point.x} ${point.y + 8}) scale(${scale}) translate(${-point.x} ${-point.y - 8})`}
                            style={
                              palette.sculptureFilter
                                ? { filter: palette.sculptureFilter }
                                : undefined
                            }
                          >
                            {render3DSeNodeSculpture(name, archetype, point.x, point.y, isStopped, sculptureTheme)}
                          </g>

                          {/* Sleek Floating Pill Name Tag directly below the 3D Sculpture */}
                          <rect
                            data-studio-node-label
                            x={point.x - labelWidth / 2}
                            y={point.y + labelY}
                            width={labelWidth}
                            height={labelHeight}
                            rx={activeStyleId === "blueprint" ? "4" : "12"}
                            fill={pillBg}
                            fillOpacity="0.97"
                            stroke={pillStroke}
                            strokeOpacity={isSelected || isStopped || isLight ? "1" : "0.85"}
                            strokeWidth={isSelected || isStopped || activeStyleId === "pop" ? 1.8 : 1.1}
                            style={palette.pillFilter ? { filter: palette.pillFilter } : undefined}
                          />
                          {/* Left Functional Component Icon Badge inside the Pill */}
                          <rect
                            x={point.x - labelWidth / 2 + 4}
                            y={point.y + 14}
                            width="16"
                            height="16"
                            rx={activeStyleId === "blueprint" ? "3" : "8"}
                            fill={pillChipBg}
                          />
                          {renderNodeFunctionGlyph(
                            name,
                            archetype,
                            point.x - labelWidth / 2 + 12,
                            point.y + 22,
                            pillIconColor,
                          )}
                          <text
                            x={point.x - 4}
                            y={point.y + 25.5}
                            textAnchor="middle"
                            fill={pillTextFill}
                            fontFamily={styleCfg.nodeFontMono ? "monospace" : undefined}
                            fontSize="11"
                            fontWeight="700"
                          >
                            {displayName}
                          </text>
                          {/* Compact Replica Count Badge inside the right end of the Pill */}
                          <rect
                            x={point.x + labelWidth / 2 - 31}
                            y={point.y + 14}
                            width="25"
                            height="16"
                            rx={activeStyleId === "blueprint" ? "3" : "8"}
                            fill={pillChipBg}
                          />
                          <text
                            x={point.x + labelWidth / 2 - 18.5}
                            y={point.y + 25}
                            textAnchor="middle"
                            fill={pillCountFill}
                            fontSize="9.5"
                            fontWeight="700"
                          >
                            {pillBadgeText}
                          </text>
                        </>
                      );
                    })()}
                    {renderConnectPort(name, point.x + 29 * scale, point.y + 8 - 18 * scale, isSelected || isDropTarget)}
                  </g>
                );
              }

              return (
                <g
                  key={name}
                  role="button"
                  tabIndex={0}
                  aria-label={nodeName}
                  data-studio-node={name}
                  aria-pressed={isSelected}
                  style={{ outline: "none" }}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || activePointer.current !== null) return;
                    selectNode();
                    event.stopPropagation();
                    event.preventDefault();
                    activePointer.current = event.pointerId;
                    svg.current?.setPointerCapture(event.pointerId);
                    const positionKey = name;
                    const existing = customOffsets[positionKey] ?? { x: 0, y: 0 };
                    nodeDrag.current = {
                      service: positionKey,
                      startX: event.clientX,
                      startY: event.clientY,
                      origX: existing.x,
                      origY: existing.y,
                      moved: false,
                    };
                    setDraggingNode(name);
                  }}
                  onClick={() => {
                    selectNode();
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
                    if (toolId.startsWith("author-") && onDropAuthorChip) {
                      onDropAuthorChip(toolId, name);
                      setDraggedTool(null);
                      return;
                    }
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
                      selectNode();
                    }
                  }}
                  className="group cursor-grab outline-none active:cursor-grabbing"
                >
                  <title>{nodeName} · {live ? (isStopped ? t("Service stopped (Fault injected)") : t("running")) : t("Waiting for telemetry")}</title>
                  {(() => {
                    const lastSvcAction = [...(data.actions ?? [])]
                      .reverse()
                      .find((a) => a.service === name && a.status === "CONFIRMED");
                    const isPaused = !isStopped && lastSvcAction?.action === "PAUSE";
                    const isThrottled =
                      !isStopped &&
                      !isPaused &&
                      (lastSvcAction?.action === "THROTTLE_CPU" || status === "Bottleneck");
                    const replicasLabel = isStopped
                      ? "0×"
                      : live
                        ? `${live.runningReplicas}×`
                        : "1×";
                    const statePillText = isStopped
                      ? activeStyleId === "blueprint" ? "[DOWN 0×]" : "DOWN 0×"
                      : isPaused
                        ? activeStyleId === "blueprint" ? "[PAUSED]" : "PAUSED"
                        : isThrottled
                          ? activeStyleId === "blueprint" ? "[SLOW]" : "SLOW"
                          : isImpactedByOutage
                            ? activeStyleId === "blueprint" ? "[IMPACTED]" : "IMPACTED"
                            : activeStyleId === "blueprint"
                              ? `[LIVE ${replicasLabel}]`
                              : `LIVE ${replicasLabel}`;
                    const roleSubtitle =
                      archetype === "DATABASE"
                        ? "Database"
                        : archetype === "GATEWAY"
                          ? "API Gateway"
                          : archetype === "QUEUE"
                            ? "Message Broker"
                            : "Microservice";
                    const palette2D = resolveStudioNodePalette(activeStyleId, name, archetype, {
                      isCritical: isStopped,
                      isWarning: isPaused || isThrottled || isImpactedByOutage,
                      isSelected,
                      isDropTarget,
                    });
                    const stateAccent = palette2D.accent;
                    const pillW = Math.max(54, statePillText.length * 6.2 + 12);
                    const cardW = Math.max(204, displayName.length * 7.8 + pillW + 58);
                    const cardH = 68;
                    const halfW = cardW / 2;
                    const cardFill = palette2D.cardFill;
                    const cardStroke =
                      activeStyleId === "pop"
                        ? palette2D.stroke
                        : isStopped
                          ? "#e11d48"
                          : isPaused || isThrottled || isImpactedByOutage
                            ? "#d97706"
                            : isSelected || isDropTarget
                              ? "#0056D2"
                              : activeStyleId === "blueprint"
                                ? "#3b82f6"
                                : isLight
                                  ? "#cbd5e1"
                                  : "#334155";
                    const titleFill = isLight ? "#0f172a" : "#f8fafc";
                    const subFill = isLight ? "#475569" : "#94a3b8";
                    const iconBg = palette2D.pillChipBg;
                    const iconGlyphColor = palette2D.pillIconColor;
                    const pillBg = isStopped
                      ? isLight ? "#ffe4e6" : "#4c0519"
                      : isPaused || isThrottled || isImpactedByOutage
                        ? isLight ? "#fef3c7" : "#451a03"
                        : isLight ? "#ecfdf5" : "#064e3b";
                    const pillInk = isStopped
                      ? isLight ? "#be123c" : "#fda4af"
                      : isPaused || isThrottled || isImpactedByOutage
                        ? isLight ? "#b45309" : "#fcd34d"
                        : isLight ? "#047857" : "#6ee7b7";
                    const barColor = isStopped
                      ? "#e11d48"
                      : isPaused || isThrottled || isImpactedByOutage
                        ? "#f59e0b"
                        : "#10b981";
                    const barRatio = isStopped ? 1 : isPaused || isThrottled ? 0.85 : isImpactedByOutage ? 0.72 : 0.38;
                    const r = styleCfg.nodeRadius;

                    return (
                      <g transform={`translate(${point.x}, ${point.y})`}>
                        {/* Tactile Pop Hard Offset Shadow */}
                        {styleCfg.nodeHardShadowColor && archetype !== "DATABASE" && (
                          <rect
                            x={-halfW + 4}
                            y={-cardH / 2 + 4}
                            width={cardW}
                            height={cardH}
                            rx={r}
                            fill={isStopped ? "#e11d48" : styleCfg.nodeHardShadowColor}
                          />
                        )}

                        {archetype === "DATABASE" ? (
                          <g style={{ filter: isSelected ? "drop-shadow(0 0 10px rgba(0,86,210,0.32))" : styleCfg.nodeShadow }}>
                            <path
                              d={`M ${-halfW} ${-cardH / 2 + 11} L ${-halfW} ${cardH / 2 - 8} A ${halfW} 10 0 0 0 ${halfW} ${cardH / 2 - 8} L ${halfW} ${-cardH / 2 + 11} Z`}
                              fill={cardFill}
                              stroke={cardStroke}
                              strokeWidth={isSelected || isStopped ? 2.2 : styleCfg.nodeStrokeWidth}
                            />
                            <ellipse
                              cx="0"
                              cy={-cardH / 2 + 11}
                              rx={halfW}
                              ry="10"
                              fill={isStopped ? (isLight ? "#fecdd3" : "#4c0519") : (isLight ? "#a7f3d0" : "#065f46")}
                              stroke={cardStroke}
                              strokeWidth={isSelected || isStopped ? 2.2 : styleCfg.nodeStrokeWidth}
                            />
                          </g>
                        ) : (
                          <g style={{ filter: isSelected ? "drop-shadow(0 0 12px rgba(0,86,210,0.32))" : styleCfg.nodeShadow }}>
                            <rect
                              data-studio-node-label
                              x={-halfW}
                              y={-cardH / 2}
                              width={cardW}
                              height={cardH}
                              rx={r}
                              fill={cardFill}
                              stroke={cardStroke}
                              strokeWidth={isSelected || isStopped ? 2.2 : styleCfg.nodeStrokeWidth}
                            />
                            {/* Daylight Cloud & Control Glass vibrant color-coded top accent strip */}
                            {styleCfg.nodeTopStrip && (
                              <path
                                d={`M ${-halfW + r} ${-cardH / 2} L ${halfW - r} ${-cardH / 2} A ${r} ${r} 0 0 1 ${halfW} ${-cardH / 2 + 5} L ${-halfW} ${-cardH / 2 + 5} A ${r} ${r} 0 0 1 ${-halfW + r} ${-cardH / 2} Z`}
                                fill={stateAccent}
                                opacity={isLight ? "0.92" : "0.85"}
                              />
                            )}
                            {/* Architect Blueprint CAD 4-corner bracket ticks */}
                            {styleCfg.nodeCornerTicks && (
                              <g stroke={isStopped ? "#e11d48" : "#1d4ed8"} strokeWidth="2" fill="none">
                                <path d={`M ${-halfW - 3} ${-cardH / 2 + 7} V ${-cardH / 2 - 3} H ${-halfW + 7}`} />
                                <path d={`M ${halfW - 7} ${-cardH / 2 - 3} H ${halfW + 3} V ${-cardH / 2 + 7}`} />
                                <path d={`M ${-halfW - 3} ${cardH / 2 - 7} V ${cardH / 2 + 3} H ${-halfW + 7}`} />
                                <path d={`M ${halfW - 7} ${cardH / 2 + 3} H ${halfW + 3} V ${cardH / 2 - 7}`} />
                              </g>
                            )}
                          </g>
                        )}

                        {/* Component Icon Chip */}
                        <rect
                          x={-halfW + 12}
                          y={archetype === "DATABASE" ? -6 : -14}
                          width="30"
                          height="30"
                          rx={activeStyleId === "blueprint" ? "4" : "9"}
                          fill={iconBg}
                        />
                        {renderNodeFunctionGlyph(
                          name,
                          archetype,
                          -halfW + 27,
                          archetype === "DATABASE" ? 9 : 1,
                          iconGlyphColor,
                        )}

                        {/* Service Title + Role Subtitle */}
                        <text
                          x={-halfW + 50}
                          y={archetype === "DATABASE" ? 3 : -2}
                          textAnchor="start"
                          fill={titleFill}
                          fontFamily={styleCfg.nodeFontMono ? "monospace" : undefined}
                          fontSize="12.5"
                          fontWeight="700"
                        >
                          {displayName}
                        </text>
                        <text
                          x={-halfW + 50}
                          y={archetype === "DATABASE" ? 17 : 13}
                          textAnchor="start"
                          fill={subFill}
                          fontFamily={styleCfg.nodeFontMono ? "monospace" : undefined}
                          fontSize="10"
                          fontWeight="600"
                        >
                          {roleSubtitle}
                        </text>

                        {/* Integrated Status Pill inside top-right of card (original MAVIS Cloud Architecture badge) */}
                        <g transform={`translate(${halfW - pillW - 10}, ${archetype === "DATABASE" ? -8 : -16})`}>
                          <rect
                            x="0"
                            y="0"
                            width={pillW}
                            height="18"
                            rx={activeStyleId === "blueprint" ? "3" : "9"}
                            fill={pillBg}
                            stroke={activeStyleId === "pop" ? "#0f172a" : stateAccent}
                            strokeOpacity={activeStyleId === "pop" ? "0.9" : "0.4"}
                            strokeWidth={activeStyleId === "pop" ? "1.3" : "1"}
                          />
                          <text
                            x={pillW / 2}
                            y="12"
                            textAnchor="middle"
                            fill={pillInk}
                            fontFamily="monospace"
                            fontSize="9"
                            fontWeight="800"
                          >
                            {statePillText}
                          </text>
                        </g>

                        {/* Bottom Live Health Meter */}
                        <rect
                          x={-halfW + 12}
                          y={cardH / 2 - 9}
                          width={cardW - 24}
                          height="3.5"
                          rx="2"
                          fill={isLight ? "#e2e8f0" : "#1e293b"}
                        />
                        <rect
                          x={-halfW + 12}
                          y={cardH / 2 - 9}
                          width={(cardW - 24) * barRatio}
                          height="3.5"
                          rx="2"
                          fill={barColor}
                        />
                      </g>
                    );
                  })()}
                  {renderConnectPort(name, point.x + 102, point.y, isSelected || isDropTarget)}
                </g>
              );
            })}
          </g>
            {activeWire && (() => {
              const from = positions.get(activeWire.from);
              const to = positions.get(activeWire.to);
              if (!from || !to) return null;
              return (
                <g
                  data-studio-cut-wire
                  role="button"
                  tabIndex={0}
                  aria-label={t("Disconnect selected wire")}
                  transform={`translate(${(from.x + to.x) / 2}, ${(from.y + to.y) / 2 - 21})`}
                  className="cursor-pointer"
                  onPointerDown={(event) => {
                    if (event.button === 0) event.stopPropagation();
                  }}
                  onClick={() => cutWire(activeWire.from, activeWire.to)}
                  onKeyDown={(event) => {
                    if (["Enter", " ", "Delete"].includes(event.key)) {
                      event.preventDefault();
                      cutWire(activeWire.from, activeWire.to);
                    } else if (event.key === "Escape") {
                      setSelectedWire(null);
                    }
                  }}
                >
                  <title>{t("Disconnect selected wire")}</title>
                  <circle r="11" fill="#281520" stroke="#fda4af" strokeWidth="1.5" />
                  <path d="m-3.5-3.5 7 7m0-7-7 7" stroke="#fda4af" strokeWidth="1.7" strokeLinecap="round" />
                </g>
              );
            })()}
            {linkPreview && (() => {
              const from = positions.get(linkPreview.from);
              if (!from) return null;
              const scale = sculptureScale(resolveLiveReplicas(linkPreview.from));
              return <line
                data-studio-link-preview
                x1={from.x + (view === "3D" ? 29 * scale : 34)}
                y1={from.y + (view === "3D" ? 8 - 18 * scale : -9)}
                x2={linkPreview.x}
                y2={linkPreview.y}
                stroke="#7dd3fc"
                strokeWidth="2"
                strokeDasharray="5 4"
                pointerEvents="none"
              />;
            })()}
          </g>
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
            {([1, 2, 3] as const).map((preset) => (
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
                          {t("Service stopped (Fault injected)")}
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
      {!canvasOnly && workerImpact.data && (
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
      {!canvasOnly && workerImpact.isError && (
        <p role="status" className="text-sm">
          {t("Worker impact is unavailable. Static reference paths are shown above.")}
        </p>
      )}
      {!canvasOnly &&
        reference.data?.elements
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
                  {span.runtimeService} · {span.httpStatusCode != null && `HTTP ${span.httpStatusCode} · `}
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

const SNAPSHOT_MAX_DATA_URL_CHARS = 440_000;
const SNAPSHOT_MAX_EDGES = [1280, 960, 720] as const;

export async function captureStudioImage(svg: SVGSVGElement, wholeDiagram = false): Promise<string> {
  const styles = getComputedStyle(svg);
  const webglCanvas = svg.parentElement?.querySelector<HTMLCanvasElement>(
    "canvas[data-studio-webgl-canvas]",
  );
  const glCtx =
    webglCanvas?.getContext("webgl2") ?? webglCanvas?.getContext("webgl") ?? null;
  if (
    webglCanvas &&
    webglCanvas.width > 0 &&
    webglCanvas.height > 0 &&
    webglCanvas.offsetParent !== null &&
    !glCtx?.isContextLost()
  ) {
    const naturalW = webglCanvas.width;
    const naturalH = webglCanvas.height;
    const longest = Math.max(naturalW, naturalH);
    const bgFill =
      styles.backgroundColor && styles.backgroundColor !== "rgba(0, 0, 0, 0)"
        ? styles.backgroundColor
        : "#f3f8ff";
    // Perform a single GPU->2D readback once, then downscale purely on 2D canvas to avoid WebGL context loss.
    const sourceScale = Math.min(1, SNAPSHOT_MAX_EDGES[0] / longest);
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = Math.max(1, Math.round(naturalW * sourceScale));
    sourceCanvas.height = Math.max(1, Math.round(naturalH * sourceScale));
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) throw new Error("Could not render Studio snapshot");
    sourceCtx.fillStyle = bgFill;
    sourceCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    (webglCanvas as HTMLCanvasElement & { __mavisRenderNow?: () => void }).__mavisRenderNow?.();
    sourceCtx.drawImage(webglCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);

    const firstUrl = sourceCanvas.toDataURL("image/png");
    if (firstUrl.length <= SNAPSHOT_MAX_DATA_URL_CHARS) return firstUrl;

    const scaled = document.createElement("canvas");
    for (const maxEdge of SNAPSHOT_MAX_EDGES.slice(1)) {
      const scale = Math.min(1, maxEdge / longest);
      scaled.width = Math.max(1, Math.round(naturalW * scale));
      scaled.height = Math.max(1, Math.round(naturalH * scale));
      const context = scaled.getContext("2d");
      if (!context) throw new Error("Could not render Studio snapshot");
      context.fillStyle = bgFill;
      context.fillRect(0, 0, scaled.width, scaled.height);
      context.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);
      const dataUrl = scaled.toDataURL("image/png");
      if (dataUrl.length <= SNAPSHOT_MAX_DATA_URL_CHARS) return dataUrl;
    }
    throw new Error("Snapshot image too large");
  }
  const url = URL.createObjectURL(
    new Blob([serializeStudioGraph(svg, wholeDiagram)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render Studio snapshot"));
      image.src = url;
    });
    const naturalW = Math.max(1, image.naturalWidth);
    const naturalH = Math.max(1, image.naturalHeight);
    const longest = Math.max(naturalW, naturalH);
    const canvas = document.createElement("canvas");
    for (const maxEdge of SNAPSHOT_MAX_EDGES) {
      const scale = Math.min(1, maxEdge / longest);
      canvas.width = Math.max(1, Math.round(naturalW * scale));
      canvas.height = Math.max(1, Math.round(naturalH * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not render Studio snapshot");
      context.fillStyle = styles.backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length <= SNAPSHOT_MAX_DATA_URL_CHARS) return dataUrl;
    }
    throw new Error("Snapshot image too large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function serializeStudioGraph(
  svg: SVGSVGElement,
  wholeDiagram = false,
  preserveMotion = false,
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const overlayClone = clone.querySelector("[data-studio-svg-overlay]");
  if (overlayClone) {
    overlayClone.removeAttribute("opacity");
    overlayClone.removeAttribute("style");
  }
  const styles = getComputedStyle(svg);
  clone.setAttribute(
    "style",
    `color:${styles.color};background:${styles.backgroundColor};font-family:Arial,sans-serif`,
  );
  clone.setAttribute("width", "1400");
  clone.setAttribute("height", "920");
  if (wholeDiagram) {
    const scene = svg.querySelector<SVGGElement>("[data-studio-scene]");
    const sceneClone = clone.querySelector<SVGGElement>("[data-studio-scene]");
    if (scene && sceneClone) {
      const boxes = Array.from(scene.children)
        .filter((child): child is SVGGraphicsElement =>
          child instanceof SVGGraphicsElement &&
          !child.matches("[data-studio-background], [data-studio-link-preview], [data-studio-cut-wire]"),
        )
        .map((child) => child.getBBox())
        .filter((box) => box.width || box.height);
      if (boxes.length) {
        const padding = 36;
        const x = Math.min(...boxes.map((box) => box.x)) - padding;
        const y = Math.min(...boxes.map((box) => box.y)) - padding;
        const width = Math.max(...boxes.map((box) => box.x + box.width)) + padding - x;
        const height = Math.max(...boxes.map((box) => box.y + box.height)) + padding - y;
        const scale = Math.min(2, 1920 / Math.max(width, height));
        clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
        clone.setAttribute("width", String(Math.ceil(width * scale)));
        clone.setAttribute("height", String(Math.ceil(height * scale)));
        sceneClone.removeAttribute("transform");
        const background = sceneClone.querySelector("[data-studio-background]");
        if (background) {
          for (const [key, value] of Object.entries({ x, y, width, height })) {
            background.setAttribute(key, String(value));
          }
        }
      }
      const stripSelector = preserveMotion
        ? "[data-studio-cut-wire], [data-studio-link-preview], [data-studio-connect-port]"
        : "[data-studio-cut-wire], [data-studio-link-preview], [data-studio-connect-port], circle:has(animateMotion)";
      sceneClone.querySelectorAll(stripSelector).forEach((element) => element.remove());
    }
  }
  clone.querySelectorAll("[fill],[stroke]").forEach((element) => {
    for (const attribute of ["fill", "stroke"]) {
      const variable = element.getAttribute(attribute)?.match(/^var\((--[\w-]+)\)$/);
      if (variable) element.setAttribute(attribute, styles.getPropertyValue(variable[1]!).trim());
    }
  });
  return new XMLSerializer().serializeToString(clone);
}

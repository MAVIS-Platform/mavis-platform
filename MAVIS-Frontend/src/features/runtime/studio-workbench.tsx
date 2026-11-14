"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Camera,
  Database,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Server,
  ShieldAlert,
  Sparkles,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/shared/forms";
import { Badge } from "@/components/ui/badge";
import { LocaleSwitchButton, useLocale } from "@/lib/i18n/locale-context";
import { AppearanceSelector } from "@/components/appearance-selector";
import type { Response } from "@/lib/api/contracts";
import {
  StudioObservability,
  captureStudioImage,
  type StudioQuickAction,
} from "./studio-observability";
import { StudioControls } from "./studio-controls";

type StudioData = Response<"studioState">;

type SandboxTemplate = {
  id: string;
  name: string;
  description: string;
  services: string[];
  edges: Array<{ from: string; to: string; protocol: string }>;
  layers: Record<string, string>;
  types: Record<string, string>;
  baseCpu: Record<string, number>;
  baseRam: Record<string, number>;
};

const STUDIO_TEMPLATES: SandboxTemplate[] = [
  {
    id: "ecommerce-mesh",
    name: "E-Commerce Microservices Mesh",
    description:
      "API Gateway + Order / Payment / Inventory microservices + Kafka Broker + PostgreSQL.",
    services: [
      "api-gateway",
      "order-service",
      "payment-service",
      "inventory-service",
      "kafka-broker",
      "orders-postgres",
    ],
    edges: [
      { from: "api-gateway", to: "order-service", protocol: "HTTP" },
      { from: "api-gateway", to: "inventory-service", protocol: "HTTP" },
      { from: "order-service", to: "payment-service", protocol: "HTTP" },
      { from: "order-service", to: "inventory-service", protocol: "HTTP" },
      { from: "order-service", to: "kafka-broker", protocol: "AMQP" },
      { from: "order-service", to: "orders-postgres", protocol: "JDBC" },
    ],
    layers: {
      "api-gateway": "edge",
      "order-service": "application",
      "payment-service": "domain",
      "inventory-service": "domain",
      "kafka-broker": "infrastructure",
      "orders-postgres": "data",
    },
    types: {
      "api-gateway": "API_GATEWAY",
      "order-service": "SERVICE_CONTAINER",
      "payment-service": "SERVICE_CONTAINER",
      "inventory-service": "SERVICE_CONTAINER",
      "kafka-broker": "MESSAGE_BROKER",
      "orders-postgres": "DATABASE",
    },
    baseCpu: {
      "api-gateway": 22.4,
      "order-service": 38.5,
      "payment-service": 29.0,
      "inventory-service": 24.2,
      "kafka-broker": 19.5,
      "orders-postgres": 31.8,
    },
    baseRam: {
      "api-gateway": 180,
      "order-service": 260,
      "payment-service": 220,
      "inventory-service": 210,
      "kafka-broker": 320,
      "orders-postgres": 290,
    },
  },
  {
    id: "banking-core",
    name: "High-Availability FinTech Core",
    description:
      "Edge BFF + Ledger + Fraud Detector + Redis Cache + Settlement DB for 1 → 4 → 8 scaling tests.",
    services: [
      "edge-gateway",
      "ledger-service",
      "fraud-detector",
      "redis-cache",
      "settlement-db",
    ],
    edges: [
      { from: "edge-gateway", to: "ledger-service", protocol: "HTTP" },
      { from: "ledger-service", to: "fraud-detector", protocol: "gRPC" },
      { from: "ledger-service", to: "redis-cache", protocol: "RESP" },
      { from: "ledger-service", to: "settlement-db", protocol: "JDBC" },
    ],
    layers: {
      "edge-gateway": "edge",
      "ledger-service": "domain",
      "fraud-detector": "domain",
      "redis-cache": "data",
      "settlement-db": "data",
    },
    types: {
      "edge-gateway": "API_GATEWAY",
      "ledger-service": "SERVICE_CONTAINER",
      "fraud-detector": "SERVICE_CONTAINER",
      "redis-cache": "DATABASE",
      "settlement-db": "DATABASE",
    },
    baseCpu: {
      "edge-gateway": 18.0,
      "ledger-service": 44.0,
      "fraud-detector": 51.5,
      "redis-cache": 14.2,
      "settlement-db": 36.0,
    },
    baseRam: {
      "edge-gateway": 150,
      "ledger-service": 280,
      "fraud-detector": 310,
      "redis-cache": 140,
      "settlement-db": 340,
    },
  },
];

const LEFT_DOCK_ACTIONS = [
  {
    id: "palette-scale-plus-1",
    badge: "+1 POD",
    label: "Scale +1 Replica",
    sub: "+250 req/s · Incremental",
    action: "SCALE" as const,
    delta: 1,
    cardClass:
      "border-sky-500/35 bg-sky-500/10 hover:border-sky-400 hover:bg-sky-500/20",
    badgeClass: "border border-sky-400/40 bg-sky-500/20 text-sky-300",
  },
  {
    id: "palette-scale-4",
    badge: "×4 PODS",
    label: "Scale ×4 Cluster",
    sub: "1,000 req/s · High Availability",
    action: "SCALE" as const,
    replicas: 4,
    cardClass:
      "border-indigo-500/35 bg-indigo-500/10 hover:border-indigo-400 hover:bg-indigo-500/20",
    badgeClass: "border border-indigo-400/40 bg-indigo-500/20 text-indigo-300",
  },
  {
    id: "palette-scale-8",
    badge: "×8 PODS",
    label: "Scale ×8 Max Load",
    sub: "2,000 req/s · Peak Burst",
    action: "SCALE" as const,
    replicas: 8,
    cardClass:
      "border-purple-500/35 bg-purple-500/10 hover:border-purple-400 hover:bg-purple-500/20",
    badgeClass: "border border-purple-400/40 bg-purple-500/20 text-purple-300",
  },
  {
    id: "palette-stop",
    badge: "FAULT",
    label: "Stop Container",
    sub: "Inject HTTP 503 Crash",
    action: "STOP" as const,
    cardClass:
      "border-rose-500/40 bg-rose-500/10 hover:border-rose-400 hover:bg-rose-500/20",
    badgeClass: "border border-rose-400/50 bg-rose-500/25 text-rose-300",
  },
  {
    id: "palette-start",
    badge: "RECOVER",
    label: "Restart Service",
    sub: "Restore Healthy Pod",
    action: "START" as const,
    cardClass:
      "border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-400 hover:bg-emerald-500/20",
    badgeClass: "border border-emerald-400/50 bg-emerald-500/25 text-emerald-300",
  },
];

type LocalSnapshot = {
  id: string;
  capturedAt: string;
  explanation: string;
  digest: string;
  imageData?: string;
  replicasByService: Record<string, number>;
  totalInstances: number;
  totalRamMiB: number;
};

export function StudioWorkbench() {
  const { t } = useLocale();
  const params = useSearchParams();
  const initialSessionId = params.get("session") ?? "";
  const [mode, setMode] = useState<"SANDBOX" | "LIVE">(initialSessionId ? "LIVE" : "SANDBOX");
  const [templateId, setTemplateId] = useState<string>(STUDIO_TEMPLATES[0]!.id);
  const template =
    STUDIO_TEMPLATES.find((item) => item.id === templateId) ?? STUDIO_TEMPLATES[0]!;

  const [customServices, setCustomServices] = useState<string[]>(template.services);
  const [replicasMap, setReplicasMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(template.services.map((s) => [s, 1])),
  );
  const [baselineReplicasMap, setBaselineReplicasMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(template.services.map((s) => [s, 1])),
  );
  const [selectedService, setSelectedService] = useState<string>(
    template.services[1] ?? "order-service",
  );
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeArchetype, setNewNodeArchetype] = useState<
    "SERVICE" | "GATEWAY" | "DATABASE" | "QUEUE"
  >("SERVICE");
  const [actionsLog, setActionsLog] = useState<StudioData["actions"]>([]);
  const [localSnapshots, setLocalSnapshots] = useState<LocalSnapshot[]>([]);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState(initialSessionId);
  const [bottomTab, setBottomTab] = useState<"MATRIX" | "LOGS" | "SNAPSHOTS">("MATRIX");
  const [leftWidth, setLeftWidth] = useState(264);
  const [rightWidth, setRightWidth] = useState(330);
  const [bottomHeight, setBottomHeight] = useState(240);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  function startResize(
    axis: "left" | "right" | "bottom",
    startEvent: React.PointerEvent<HTMLDivElement>,
  ) {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const initialLeft = leftWidth;
    const initialRight = rightWidth;
    const initialBottom = bottomHeight;

    function onPointerMove(moveEvent: PointerEvent) {
      if (axis === "left") {
        const next = Math.max(180, Math.min(520, initialLeft + (moveEvent.clientX - startX)));
        setLeftCollapsed(false);
        setLeftWidth(next);
      } else if (axis === "right") {
        const next = Math.max(220, Math.min(600, initialRight - (moveEvent.clientX - startX)));
        setRightCollapsed(false);
        setRightWidth(next);
      } else {
        const next = Math.max(96, Math.min(560, initialBottom - (moveEvent.clientY - startY)));
        setBottomCollapsed(false);
        setBottomHeight(next);
      }
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const sessionsQuery = useApiQuery("runtimeReadSessions", { projectId: "*" });
  const liveSessions = sessionsQuery.data ?? [];

  function switchTemplate(nextId: string) {
    const found = STUDIO_TEMPLATES.find((item) => item.id === nextId) ?? STUDIO_TEMPLATES[0]!;
    setTemplateId(found.id);
    setCustomServices(found.services);
    const initialReps = Object.fromEntries(found.services.map((s) => [s, 1]));
    setReplicasMap(initialReps);
    setBaselineReplicasMap(initialReps);
    setSelectedService(found.services[1] ?? found.services[0] ?? "");
    setActionsLog([]);
  }

  function applySandboxAction(cmd: StudioQuickAction) {
    const svc = cmd.service;
    const before = replicasMap[svc] ?? 1;
    const after =
      cmd.action === "STOP"
        ? 0
        : cmd.action === "START"
          ? Math.max(1, before || 1)
          : Math.max(1, Math.min(8, cmd.replicas ?? 2));

    setReplicasMap((prev) => ({ ...prev, [svc]: after }));
    setSelectedService(svc);

    const baseLatency = 48;
    const p95Before = before <= 0 ? 950 : Math.round(baseLatency / Math.sqrt(Math.max(1, before)));
    const p95After = after <= 0 ? 1200 : Math.round(baseLatency / Math.sqrt(Math.max(1, after)));
    const errBefore = before <= 0 ? 100 : 0;
    const errAfter = after <= 0 ? 100 : 0;
    const reqBefore = before * 120;
    const reqAfter = after * 120;

    const now = new Date().toISOString();
    setActionsLog((prev) => [
      ...prev,
      {
        actionId: crypto.randomUUID(),
        action: cmd.action,
        service: svc,
        replicas: cmd.action === "SCALE" ? after : null,
        status: "CONFIRMED",
        requestedAt: now,
        completedAt: now,
        result: {
          action: cmd.action,
          service: svc,
          replicasBefore: before,
          replicasAfter: after,
          confirmed: true,
          metricsBefore: {
            requestCount: reqBefore,
            p95LatencyMs: p95Before,
            errorRatePercent: errBefore,
            traceIds: [`trace-before-${svc}-01`],
          },
          metricsAfter: {
            requestCount: reqAfter,
            p95LatencyMs: p95After,
            errorRatePercent: errAfter,
            traceIds: [`trace-after-${svc}-${after}pods`],
          },
        },
      },
    ]);
  }

  function addCustomBlock(presetArchetype?: "SERVICE" | "GATEWAY" | "DATABASE" | "QUEUE") {
    const arch = presetArchetype ?? newNodeArchetype;
    const rawName =
      newNodeName.trim() ||
      (arch === "DATABASE"
        ? `postgres-db-${customServices.length + 1}`
        : arch === "GATEWAY"
          ? `edge-gateway-${customServices.length + 1}`
          : arch === "QUEUE"
            ? `kafka-mq-${customServices.length + 1}`
            : `service-${customServices.length + 1}`);
    const clean = rawName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    if (!clean || customServices.includes(clean)) return undefined;
    setCustomServices((prev) => [...prev, clean]);
    setReplicasMap((prev) => ({ ...prev, [clean]: 1 }));
    setBaselineReplicasMap((prev) => ({ ...prev, [clean]: 1 }));
    setSelectedService(clean);
    setNewNodeName("");
    return clean;
  }

  function removeCustomBlock(svc: string) {
    if (customServices.length <= 2) return;
    const next = customServices.filter((item) => item !== svc);
    setCustomServices(next);
    if (selectedService === svc) {
      setSelectedService(next[0] ?? "");
    }
  }

  const activeEdges = useMemo(
    () => [
      ...template.edges.filter(
        (e) => customServices.includes(e.from) && customServices.includes(e.to),
      ),
      ...customServices
        .filter((s) => !template.services.includes(s))
        .map((s) => ({
          from: customServices[0] ?? "api-gateway",
          to: s,
          protocol: "HTTP",
        })),
    ],
    [template, customServices],
  );

  const sandboxStudioData: StudioData = useMemo(() => {
    const nowIso = new Date().toISOString();
    const interactions = activeEdges.flatMap((edge, idx) => {
      const fromRep = replicasMap[edge.from] ?? 1;
      const toRep = replicasMap[edge.to] ?? 1;
      if (fromRep <= 0 || toRep <= 0) return [];
      return [
        {
          traceId: `studio-trace-${idx + 1}`,
          fromService: edge.from,
          toService: edge.to,
          parentSpanId: `span-${edge.from}-${idx}`,
          childSpanId: `span-${edge.to}-${idx}`,
        },
      ];
    });

    const spans = customServices.flatMap((svc, idx) => {
      const reps = replicasMap[svc] ?? 1;
      const isDown = reps <= 0;
      const durationMs = isDown ? 980 : Math.max(8, Math.round(46 / Math.sqrt(Math.max(1, reps))));
      return [
        {
          traceId: `studio-trace-${(idx % Math.max(1, activeEdges.length)) + 1}`,
          spanId: `span-${svc}-${idx}`,
          parentSpanId: idx === 0 ? null : `span-${customServices[0]}-0`,
          runtimeService: svc,
          operationName: `HTTP GET /api/v1/${svc}/verify`,
          spanKind: "SERVER",
          spanStatus: isDown ? "ERROR" : "OK",
          httpMethod: "GET",
          httpStatusCode: isDown ? 503 : 200,
          durationNanoseconds: String(durationMs * 1_000_000),
        },
      ];
    });

    const servicesTelemetry = customServices.map((svc) => {
      const reps = replicasMap[svc] ?? 1;
      const baseCpuVal = template.baseCpu[svc] ?? 26.5;
      const baseRamVal = template.baseRam[svc] ?? 220;
      const perPodCpu = reps <= 0 ? 0 : Math.max(4.2, baseCpuVal / Math.pow(reps, 0.68));
      const perPodRam = reps <= 0 ? 0 : baseRamVal;
      const stats = Array.from({ length: Math.max(0, reps) }, (_, podIdx) => ({
        containerId: `${svc}-pod-${podIdx + 1}`,
        cpu: `${perPodCpu.toFixed(1)}%`,
        memory: `${Math.round(perPodRam)}MiB / 512MiB`,
        network: `${Math.round(140 / Math.max(1, reps))}KB / ${Math.round(95 / Math.max(1, reps))}KB`,
      }));
      return {
        service: svc,
        replicas: Math.max(1, reps),
        runningReplicas: reps,
        containers: stats.map((s) => ({
          id: s.containerId,
          name: s.containerId,
          state: "running",
          status: "Up (healthy)",
        })),
        stats,
        logs:
          reps <= 0
            ? `[WARN] ${svc}: CircuitBreaker OPEN — downstream container stopped (HTTP 503 fallback triggered)`
            : `[INFO] ${svc}: Active cluster running ${reps} replica(s) — load balanced (~${Math.round(100 / reps)}%/pod)`,
      };
    });

    return {
      sessionId: `standalone-${template.id}`,
      interactive: true,
      services: customServices,
      finishRequested: false,
      executionStatus: "RUNNING",
      cleanupStatus: "NOT_REQUIRED",
      actions: actionsLog,
      telemetry: {
        observedAt: nowIso,
        services: servicesTelemetry,
        spans,
        interactions,
        warnings: customServices.some((s) => (replicasMap[s] ?? 1) === 0)
          ? [
              "Fault injection active: one or more services have 0 running replicas (503 / CIRCUIT OPEN).",
            ]
          : [],
      },
      snapshots: localSnapshots.map((snap) => ({
        id: snap.id,
        sessionId: `standalone-${template.id}`,
        sourceSnapshotId: "standalone-source",
        modelVersionId: "standalone-model",
        capturedAt: snap.capturedAt,
        explanation: snap.explanation,
        digest: snap.digest,
      })),
    };
  }, [template, customServices, activeEdges, replicasMap, actionsLog, localSnapshots]);

  const deploymentRows = useMemo(() => {
    return customServices.map((svc) => {
      const before = baselineReplicasMap[svc] ?? 1;
      const now = replicasMap[svc] ?? 1;
      const baseCpuVal = template.baseCpu[svc] ?? 26.5;
      const baseRamVal = template.baseRam[svc] ?? 220;
      const perPodCpu = now <= 0 ? 0 : Math.max(4.2, baseCpuVal / Math.pow(now, 0.68));
      const perPodRam = now <= 0 ? 0 : baseRamVal;
      const totalRam = perPodRam * Math.max(0, now);
      const inbound = activeEdges.filter((e) => e.to === svc);
      const outbound = activeEdges.filter((e) => e.from === svc);
      const bottleneckTarget = outbound
        .map((e) => e.to)
        .find((ds) => now >= 4 && (replicasMap[ds] ?? 1) <= 1);
      const p95Now = now <= 0 ? 980 : Math.max(8, Math.round(48 / Math.sqrt(Math.max(1, now))));
      return {
        serviceName: svc,
        layer: template.layers[svc] ?? "domain",
        type: template.types[svc] ?? "SERVICE_CONTAINER",
        inboundCount: inbound.length,
        outboundCount: outbound.length,
        inboundCallers: inbound.map((e) => e.from),
        outboundTargets: outbound.map((e) => e.to),
        replicasBefore: before,
        replicasNow: now,
        perPodCpu,
        perPodRam,
        totalRam,
        p95Now,
        bottleneckTarget,
      };
    });
  }, [customServices, baselineReplicasMap, replicasMap, template, activeEdges]);

  const selectedRow =
    deploymentRows.find((r) => r.serviceName === selectedService) ?? deploymentRows[0];
  const totalRunningPods = deploymentRows.reduce((s, r) => s + r.replicasNow, 0);
  const totalRamMiB = deploymentRows.reduce((s, r) => s + r.totalRam, 0);
  const avgCpu =
    deploymentRows.length > 0
      ? deploymentRows.reduce((s, r) => s + r.perPodCpu, 0) / deploymentRows.length
      : 0;

  async function captureLocalSnapshot() {
    const graph = workspaceRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
    setCapturing(true);
    try {
      const imageData = graph ? await captureStudioImage(graph).catch(() => undefined) : undefined;
      const snap: LocalSnapshot = {
        id: `snap-${localSnapshots.length + 1}-${Date.now().toString(36)}`,
        capturedAt: new Date().toISOString(),
        explanation:
          snapshotNote.trim() ||
          `${selectedService}: ${replicasMap[selectedService] ?? 1} pods (${totalRunningPods} total cluster pods)`,
        digest: `sha256:${crypto.randomUUID().replace(/-/g, "")}`,
        ...(imageData ? { imageData } : {}),
        replicasByService: { ...replicasMap },
        totalInstances: totalRunningPods,
        totalRamMiB,
      };
      setLocalSnapshots((prev) => [...prev, snap]);
      setSnapshotNote("");
      setBottomTab("SNAPSHOTS");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div
      ref={workspaceRef}
      className="fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
    >
      {/* STANDALONE STUDIO TOP HEADER BAR (No Web Sidebar) */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Link href="/administration/health">
              <ArrowLeft className="size-3.5" />
              {t("Exit Studio")}
            </Link>
          </Button>
          <div className="flex items-center gap-2 border-l pl-2.5">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-xs font-extrabold text-emerald-400">
              MAVIS
            </span>
            <span className="text-sm font-bold tracking-tight">Studio</span>
            <Badge className="border border-sky-500/30 bg-sky-500/15 font-mono text-[10px] text-sky-300">
              3D / 2D WORKBENCH
            </Badge>
          </div>
          {mode === "SANDBOX" && (
            <select
              aria-label={t("Architecture Preset Template")}
              value={templateId}
              onChange={(e) => switchTemplate(e.target.value)}
              className="ml-1 h-8 rounded-md border border-indigo-500/30 bg-indigo-950/30 px-2.5 text-xs font-medium text-indigo-200"
            >
              {STUDIO_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id} className="bg-slate-950 text-slate-100">
                  {tpl.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* CENTER TELEMETRY PILL BAR (200Lab style Traffic + Resource Budget Bar) */}
        <div className="hidden items-center gap-4 rounded-full border border-border/80 bg-background/90 px-4 py-1 text-xs shadow-sm lg:flex">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase text-sky-400">⚡ Traffic</span>
            <span className="font-mono font-bold text-foreground">
              {(totalRunningPods * 240).toLocaleString()} req/s
            </span>
          </div>
          <div className="h-3.5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-emerald-400">Memory</span>
            <span className="font-mono font-bold text-foreground">
              {Math.round(totalRamMiB)} MiB
            </span>
            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all"
                style={{ width: `${Math.min(100, Math.round((totalRamMiB / 4096) * 100))}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">/ 4096 MiB</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setMode("SANDBOX")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                mode === "SANDBOX"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ▶ {t("Interactive Studio Sandbox (Instant)")}
            </button>
            <button
              type="button"
              onClick={() => setMode("LIVE")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                mode === "LIVE"
                  ? "bg-sky-500 text-slate-950 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Connect Live Docker Session")} ({liveSessions.length})
            </button>
          </div>
          <LocaleSwitchButton />
          <AppearanceSelector />
        </div>
      </header>

      {mode === "LIVE" ? (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-6xl space-y-4 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SelectField
                label={t("Select active or recent runtime session")}
                value={liveSessionId || (liveSessions[0]?.id ?? "")}
                onChange={setLiveSessionId}
                options={
                  liveSessions.length > 0
                    ? liveSessions.map((s) => ({
                        value: s.id,
                        label: `${s.id.slice(0, 8)} · ${s.scenarioName ?? "Studio Session"} · ${s.executionStatus}`,
                      }))
                    : [{ value: "", label: t("No live Docker sessions found") }]
                }
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setMode("SANDBOX")}>
                {t("Switch to Instant Sandbox Builder")}
              </Button>
            </div>
            {liveSessionId || liveSessions[0]?.id ? (
              <StudioControls
                key={liveSessionId || liveSessions[0]!.id}
                sessionId={liveSessionId || liveSessions[0]!.id}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "No live Docker session is currently active. Switch to Interactive Studio Sandbox above to test 2D/3D scaling and fault injection immediately.",
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* 4-ZONE STANDALONE WORKBENCH LAYOUT (MATCHING USER WIREFRAME) */
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* 1. LEFT VERTICAL TOOLBOX (Full Height): Drag-and-Drop Actions + 3D Block Spawner + Chaos */}
          {!leftCollapsed && (
            <aside
              style={{ width: leftWidth }}
              className="flex shrink-0 flex-col justify-between overflow-y-auto bg-card/80 p-3"
            >
            <div className="space-y-4">
              {/* Section A: Drag & Drop Action Blocks */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  1. {t("Studio Action Palette")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("Drag onto any 3D/2D block or click to apply to")}{" "}
                  <strong className="text-foreground">{selectedService}</strong>
                </p>
                <div className="space-y-1.5 pt-1">
                  {LEFT_DOCK_ACTIONS.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-mavis-studio-tool", item.id);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        const current = replicasMap[selectedService] ?? 1;
                        if (item.action === "STOP") {
                          applySandboxAction({ action: "STOP", service: selectedService });
                        } else if (item.action === "START") {
                          applySandboxAction({ action: "START", service: selectedService });
                        } else {
                          const nextReps = item.delta
                            ? Math.max(1, Math.min(8, (current <= 0 ? 1 : current) + item.delta))
                            : (item.replicas ?? 4);
                          applySandboxAction({
                            action: "SCALE",
                            service: selectedService,
                            replicas: nextReps,
                          });
                        }
                      }}
                      className={`flex cursor-grab items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition active:cursor-grabbing ${item.cardClass}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`rounded-md px-1.5 py-1 font-mono text-[10px] font-extrabold ${item.badgeClass}`}
                        >
                          {item.badge}
                        </span>
                        <div className="leading-tight">
                          <p className="font-semibold text-foreground">{t(item.label)}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                        </div>
                      </div>
                      <span className="text-muted-foreground">⋮⋮</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section B: 3D Architecture Block Spawner (Click OR Drag onto Canvas like draw.io) */}
              <div className="space-y-2 border-t pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  2. {t("3D Block Library (Add Node)")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Click để thêm ngay hoặc kéo thả trực tiếp ra vị trí bất kỳ trên Canvas
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-mavis-studio-spawn", "SERVICE");
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addCustomBlock("SERVICE")}
                    className="flex cursor-grab items-center justify-between gap-1.5 rounded-lg border border-indigo-500/35 bg-indigo-500/10 p-2 text-left text-[11px] transition hover:border-indigo-400 hover:bg-indigo-500/20 active:cursor-grabbing"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-indigo-500/25 text-indigo-300">
                        <Server className="size-3.5" />
                      </span>
                      <div className="min-w-0 leading-tight">
                        <p className="truncate font-semibold text-indigo-200">+ Service</p>
                        <p className="truncate text-[9px] text-indigo-300/75">App Server</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-indigo-300/60">⋮⋮</span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-mavis-studio-spawn", "GATEWAY");
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addCustomBlock("GATEWAY")}
                    className="flex cursor-grab items-center justify-between gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 p-2 text-left text-[11px] transition hover:border-amber-400 hover:bg-amber-500/20 active:cursor-grabbing"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-amber-500/25 text-amber-300">
                        <Workflow className="size-3.5" />
                      </span>
                      <div className="min-w-0 leading-tight">
                        <p className="truncate font-semibold text-amber-200">+ Gateway</p>
                        <p className="truncate text-[9px] text-amber-300/75">Load Balancer</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-amber-300/60">⋮⋮</span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-mavis-studio-spawn", "DATABASE");
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addCustomBlock("DATABASE")}
                    className="flex cursor-grab items-center justify-between gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2 text-left text-[11px] transition hover:border-emerald-400 hover:bg-emerald-500/20 active:cursor-grabbing"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-emerald-500/25 text-emerald-300">
                        <Database className="size-3.5" />
                      </span>
                      <div className="min-w-0 leading-tight">
                        <p className="truncate font-semibold text-emerald-200">+ Database</p>
                        <p className="truncate text-[9px] text-emerald-300/75">Relational DB</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-300/60">⋮⋮</span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-mavis-studio-spawn", "QUEUE");
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addCustomBlock("QUEUE")}
                    className="flex cursor-grab items-center justify-between gap-1.5 rounded-lg border border-purple-500/35 bg-purple-500/10 p-2 text-left text-[11px] transition hover:border-purple-400 hover:bg-purple-500/20 active:cursor-grabbing"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-purple-500/25 text-purple-300">
                        <Layers className="size-3.5" />
                      </span>
                      <div className="min-w-0 leading-tight">
                        <p className="truncate font-semibold text-purple-200">+ Broker</p>
                        <p className="truncate text-[9px] text-purple-300/75">Event Queue</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-purple-300/60">⋮⋮</span>
                  </button>
                </div>
                <div className="flex gap-1 pt-1">
                  <Input
                    value={newNodeName}
                    onChange={(e) => setNewNodeName(e.target.value)}
                    placeholder="Custom block name..."
                    className="h-7 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2"
                    onClick={() => addCustomBlock()}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Section C: Chaos & Cluster Reset */}
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                  3. {t("Resilience & Chaos")}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs shadow-sm"
                  onClick={() => {
                    const running = customServices.filter((s) => (replicasMap[s] ?? 1) > 0);
                    if (running.length > 0) {
                      const pick =
                        running[crypto.getRandomValues(new Uint32Array(1))[0]! % running.length]!;
                      applySandboxAction({ action: "STOP", service: pick });
                    }
                  }}
                >
                  <Zap className="size-3.5" />
                  {t("Chaos Monkey (Kill Random)")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 hover:bg-emerald-500/20"
                  onClick={() => switchTemplate(templateId)}
                >
                  <RotateCcw className="size-3.5" />
                  {t("Reset cluster")}
                </Button>
              </div>
            </div>

            {/* Active Nodes Quick List at Bottom of Left Dock */}
            <div className="space-y-1 border-t pt-2">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                {t("Cluster Nodes")} ({customServices.length})
              </p>
              <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                {customServices.map((svc) => {
                  const reps = replicasMap[svc] ?? 1;
                  return (
                    <div
                      key={svc}
                      className={`flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] ${
                        selectedService === svc
                          ? "border border-sky-500/40 bg-sky-500/15 font-semibold text-sky-300"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-1.5 truncate text-left"
                        onClick={() => setSelectedService(svc)}
                      >
                        <span
                          className={`size-2 rounded-full ${
                            reps === 0
                              ? "bg-rose-500"
                              : reps > 1
                                ? "bg-sky-400"
                                : "bg-emerald-400"
                          }`}
                        />
                        <span className="truncate">
                          {svc} (×{reps})
                        </span>
                      </button>
                      {customServices.length > 2 && (
                        <button
                          type="button"
                          aria-label={`Remove ${svc}`}
                          onClick={() => removeCustomBlock(svc)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
          )}

          {/* LEFT RESIZE SPLITTER */}
          <div
            role="separator"
            aria-orientation="vertical"
            title="Kéo để thay đổi độ rộng thanh công cụ trái (Double-click để thu gọn/mở rộng)"
            onPointerDown={(e) => startResize("left", e)}
            onDoubleClick={() => setLeftCollapsed((prev) => !prev)}
            className="group relative flex w-2 shrink-0 cursor-col-resize items-center justify-center border-x border-border/60 bg-muted/30 transition hover:bg-primary/30 active:bg-primary/50"
          >
            <div className="h-8 w-0.5 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
          </div>

          {/* RIGHT SIDE: TOP (CENTER CANVAS + RIGHT INSPECTOR) + BOTTOM (STATS DOCK) */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* TOP ROW: CENTER VISUAL WORKSPACE + RIGHT EXPLANATION INSPECTOR */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* 2. CENTER INTERACTIVE 3D / 2D CANVAS */}
              <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background/50 p-3">
                <StudioObservability
                  data={sandboxStudioData}
                  selected={selectedService}
                  onSelect={setSelectedService}
                  busy={false}
                  onQuickAction={applySandboxAction}
                  onSpawnBlock={addCustomBlock}
                  canvasOnly
                  defaultView="3D"
                />
              </main>

              {/* RIGHT RESIZE SPLITTER */}
              <div
                role="separator"
                aria-orientation="vertical"
                title="Kéo để thay đổi độ rộng cột giải thích bên phải (Double-click để thu gọn/mở rộng)"
                onPointerDown={(e) => startResize("right", e)}
                onDoubleClick={() => setRightCollapsed((prev) => !prev)}
                className="group relative flex w-2 shrink-0 cursor-col-resize items-center justify-center border-x border-border/60 bg-muted/30 transition hover:bg-primary/30 active:bg-primary/50"
              >
                <div className="h-8 w-0.5 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
              </div>

              {/* 3. RIGHT INSPECTOR DOCK: Explanation, Scaling Controls, Upstream/Downstream Impact & Snapshot */}
              {!rightCollapsed && (
              <aside
                style={{ width: rightWidth }}
                className="flex shrink-0 flex-col justify-between overflow-y-auto bg-card/80 p-3.5"
              >
                {selectedRow && (
                  <div className="space-y-3.5">
                    {/* Selected Node Header Banner with Semantic Archetype Tint */}
                    <div
                      className={`rounded-lg border p-3 ${
                        selectedRow.replicasNow === 0
                          ? "border-rose-500/50 bg-rose-950/30"
                          : selectedRow.type === "API_GATEWAY"
                            ? "border-amber-500/40 bg-amber-950/25"
                            : selectedRow.type === "DATABASE"
                              ? "border-emerald-500/40 bg-emerald-950/25"
                              : selectedRow.type === "MESSAGE_BROKER"
                                ? "border-purple-500/40 bg-purple-950/25"
                                : "border-indigo-500/40 bg-indigo-950/25"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            selectedRow.type === "API_GATEWAY"
                              ? "bg-amber-500/20 text-amber-300"
                              : selectedRow.type === "DATABASE"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : selectedRow.type === "MESSAGE_BROKER"
                                  ? "bg-purple-500/20 text-purple-300"
                                  : "bg-indigo-500/20 text-indigo-300"
                          }`}
                        >
                          {selectedRow.layer.toUpperCase()} · {selectedRow.type}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                            selectedRow.replicasNow === 0
                              ? "bg-rose-500/25 text-rose-300"
                              : selectedRow.replicasNow > 1
                                ? "bg-sky-500/25 text-sky-300"
                                : "bg-emerald-500/25 text-emerald-300"
                          }`}
                        >
                          {selectedRow.replicasNow === 0
                            ? "CRASHED (503)"
                            : `${selectedRow.replicasNow} POD(S) RUNNING`}
                        </span>
                      </div>
                      <h2 className="mt-1.5 font-mono text-base font-bold text-foreground">
                        {selectedRow.serviceName}
                      </h2>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        CPU <strong className="text-sky-400">{selectedRow.perPodCpu.toFixed(1)}%</strong> · RAM{" "}
                        <strong className="text-emerald-400">{Math.round(selectedRow.totalRam)} MiB</strong> · p95{" "}
                        <strong className="text-amber-300">{selectedRow.p95Now} ms</strong>
                      </p>
                    </div>

                    {/* Direct Replica Scaling Buttons (1 -> 2 -> 4 -> 8) */}
                    <div className="space-y-1.5 rounded-lg border border-sky-500/30 bg-sky-950/15 p-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                        {t("Direct Replica & Fault Control")}
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([1, 2, 4, 8] as const).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              applySandboxAction({
                                action: "SCALE",
                                service: selectedRow.serviceName,
                                replicas: preset,
                              })
                            }
                            className={`h-8 rounded-md border font-mono text-xs font-bold transition ${
                              selectedRow.replicasNow === preset
                                ? "border-sky-400 bg-sky-500 text-slate-950 shadow-xs"
                                : "border-border bg-background/80 text-foreground hover:border-sky-400/60"
                            }`}
                          >
                            ×{preset}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          type="button"
                          disabled={selectedRow.replicasNow === 0}
                          onClick={() =>
                            applySandboxAction({
                              action: "STOP",
                              service: selectedRow.serviceName,
                            })
                          }
                          className="h-7 rounded-md border border-rose-500/40 bg-rose-500/15 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-40"
                        >
                          {t("Stop service")}
                        </button>
                        <button
                          type="button"
                          disabled={selectedRow.replicasNow > 0}
                          onClick={() =>
                            applySandboxAction({
                              action: "START",
                              service: selectedRow.serviceName,
                            })
                          }
                          className="h-7 rounded-md border border-emerald-500/40 bg-emerald-500/15 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40"
                        >
                          {t("Start service")}
                        </button>
                      </div>
                    </div>

                    {/* Live Architecture & Scaling Impact Explanation */}
                    <div
                      className={`space-y-2 rounded-lg border border-l-4 p-3 text-xs ${
                        selectedRow.replicasNow === 0
                          ? "border-rose-500/40 border-l-rose-500 bg-rose-950/20"
                          : selectedRow.replicasNow > 1
                            ? "border-emerald-500/40 border-l-emerald-400 bg-emerald-950/15"
                            : "border-indigo-500/35 border-l-indigo-400 bg-indigo-950/15"
                      }`}
                    >
                      <p className="font-bold uppercase tracking-wider text-emerald-400">
                        🎯 {t("Architecture & Scaling Explanation")}
                      </p>
                      {selectedRow.replicasNow === 0 ? (
                        <div className="space-y-1.5 text-rose-300">
                          <p className="font-semibold flex items-center gap-1">
                            <ShieldAlert className="size-3.5 shrink-0" />
                            {t("503 / CIRCUIT OPEN — Service Unavailable")}
                          </p>
                          <p className="text-muted-foreground">
                            All containers for <strong>{selectedRow.serviceName}</strong> are
                            stopped. Upstream callers (
                            {selectedRow.inboundCallers.join(", ") || "Gateway"}) trip their Circuit
                            Breaker and return HTTP 503.
                          </p>
                        </div>
                      ) : selectedRow.replicasNow > 1 ? (
                        <div className="space-y-1.5">
                          <p className="font-medium text-foreground">
                            Horizontal scale: <strong>{selectedRow.replicasBefore}</strong> →{" "}
                            <strong className="text-sky-300">{selectedRow.replicasNow} instances</strong> (~
                            {Math.round(100 / selectedRow.replicasNow)}% traffic/pod).
                          </p>
                          <p className="text-muted-foreground">
                            Per-instance CPU dropped to{" "}
                            <strong className="text-emerald-300">{selectedRow.perPodCpu.toFixed(1)}%</strong> and p95 latency
                            improved to <strong className="text-emerald-300">{selectedRow.p95Now} ms</strong>, while total RAM
                            footprint scaled to <strong className="text-amber-300">{Math.round(selectedRow.totalRam)} MiB</strong>.
                          </p>
                          {selectedRow.bottleneckTarget && (
                            <p className="rounded border border-amber-500/50 bg-amber-500/15 p-2 font-medium text-amber-300">
                              ⚠ {t("Downstream bottleneck risk")}:{" "}
                              <strong>{selectedRow.serviceName}</strong> has{" "}
                              {selectedRow.replicasNow} pods calling{" "}
                              <strong>{selectedRow.bottleneckTarget}</strong> (only 1 pod), risking
                              connection pool exhaustion.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          Running single-instance baseline (100% load on 1 pod ·{" "}
                          <span className="text-sky-300">{selectedRow.perPodCpu.toFixed(1)}% CPU</span> ·{" "}
                          <span className="text-emerald-300">{selectedRow.perPodRam} MiB RAM</span>).
                          Scale to ×4 or ×8 to observe load distribution and downstream impact.
                        </p>
                      )}
                    </div>

                    {/* Upstream & Downstream Dependency Chains */}
                    <div className="space-y-2 rounded-lg border border-purple-500/30 border-l-4 border-l-purple-400 bg-purple-950/15 p-2.5 text-xs">
                      <p className="font-bold uppercase tracking-wider text-purple-300">
                        {t("Static Dependency Blast Radius")}
                      </p>
                      <div>
                        <span className="text-muted-foreground">{t("Direct callers")}: </span>
                        <span className="font-mono font-semibold text-amber-300">
                          {selectedRow.inboundCallers.length > 0
                            ? selectedRow.inboundCallers.join(", ")
                            : "None (Ingress / Root)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Downstream targets: </span>
                        <span className="font-mono font-semibold text-sky-300">
                          {selectedRow.outboundTargets.length > 0
                            ? selectedRow.outboundTargets.join(", ")
                            : "None (Leaf / Data store)"}
                        </span>
                      </div>
                    </div>

                    {/* Quick Snapshot Capture in Right Inspector */}
                    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/10 p-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        {t("Capture evidence snapshot")}
                      </p>
                      <Textarea
                        value={snapshotNote}
                        onChange={(e) => setSnapshotNote(e.target.value)}
                        placeholder={t("Explain the observed behavior")}
                        rows={2}
                        className="text-xs"
                      />
                      <button
                        type="button"
                        disabled={capturing}
                        onClick={() => void captureLocalSnapshot()}
                        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                      >
                        <Camera className="size-3.5" />
                        {t("Capture evidence snapshot")} ({localSnapshots.length})
                      </button>
                    </div>
                  </div>
                )}
              </aside>
              )}
            </div>

            {/* BOTTOM RESIZE SPLITTER */}
            <div
              role="separator"
              aria-orientation="horizontal"
              title="Kéo lên/xuống để thay đổi chiều cao thanh Stats (Double-click để thu gọn/mở rộng)"
              onPointerDown={(e) => startResize("bottom", e)}
              onDoubleClick={() => setBottomCollapsed((prev) => !prev)}
              className="group relative flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y border-border/60 bg-muted/30 transition hover:bg-primary/30 active:bg-primary/50"
            >
              <div className="h-0.5 w-10 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
            </div>

            {/* 4. BOTTOM STATS DOCK: Deployment & Scaling Impact Matrix + Action Logs + Snapshots */}
            <section
              style={{ height: bottomCollapsed ? 38 : bottomHeight }}
              className="flex shrink-0 flex-col bg-card"
            >
              <div className="flex items-center justify-between border-b px-4 py-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBottomCollapsed(false);
                      setBottomTab("MATRIX");
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      bottomTab === "MATRIX"
                        ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Project Deployment & Scaling Impact Matrix")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBottomCollapsed(false);
                      setBottomTab("LOGS");
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      bottomTab === "LOGS"
                        ? "border border-sky-500/40 bg-sky-500/20 text-sky-300"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Service metrics and logs")} ({actionsLog.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBottomCollapsed(false);
                      setBottomTab("SNAPSHOTS");
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      bottomTab === "SNAPSHOTS"
                        ? "border border-amber-500/40 bg-amber-500/20 text-amber-300"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Compare captured snapshots")} ({localSnapshots.length})
                  </button>
                </div>

                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="rounded bg-sky-500/15 px-2 py-0.5 text-sky-300">
                    {t("Total running instances")}: <strong>{totalRunningPods}</strong>
                  </span>
                  <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-indigo-300">
                    {t("Total CPU load")}: <strong>{avgCpu.toFixed(1)}%</strong>
                  </span>
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                    {t("Total RAM footprint")}: <strong>{Math.round(totalRamMiB)} MiB</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBottomCollapsed((prev) => !prev)}
                    className="rounded border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {bottomCollapsed ? "▲ Mở rộng" : "▼ Thu gọn"}
                  </button>
                </div>
              </div>

              {!bottomCollapsed && (
              <div className="flex-1 overflow-y-auto px-4 py-2">
                {bottomTab === "MATRIX" && (
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Service</th>
                        <th className="px-2 py-1.5 font-medium">{t("Layer / Type")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("Inbound / Outbound")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("Replicas (Before → Now)")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("Per-instance CPU / RAM")}</th>
                        <th className="px-2 py-1.5 font-medium">{t("Aggregated service RAM")}</th>
                        <th className="pl-2 py-1.5 font-medium">{t("Scaling & Fault Impact")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deploymentRows.map((row) => (
                        <tr
                          key={row.serviceName}
                          onClick={() => setSelectedService(row.serviceName)}
                          className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${
                            row.serviceName === selectedService ? "bg-sky-500/10 font-medium" : ""
                          }`}
                        >
                          <td className="py-1.5 pr-3 font-mono font-semibold">{row.serviceName}</td>
                          <td className="px-2 py-1.5 font-mono text-[11px]">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                row.type === "API_GATEWAY"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : row.type === "DATABASE"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : row.type === "MESSAGE_BROKER"
                                      ? "bg-purple-500/20 text-purple-300"
                                      : "bg-indigo-500/20 text-indigo-300"
                              }`}
                            >
                              {row.layer} · {row.type}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">
                            {row.inboundCount} in / {row.outboundCount} out
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {row.replicasBefore} →{" "}
                            <strong
                              className={
                                row.replicasNow === 0
                                  ? "text-rose-400"
                                  : row.replicasNow > 1
                                    ? "text-sky-400"
                                    : "text-emerald-400"
                              }
                            >
                              {row.replicasNow}
                            </strong>
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            <span className="text-sky-300">{row.perPodCpu.toFixed(1)}%</span> ·{" "}
                            <span className="text-emerald-300">{row.perPodRam} MiB</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            <strong className="text-amber-300">{row.totalRam} MiB</strong>
                          </td>
                          <td className="pl-2 py-1.5">
                            {row.replicasNow === 0 ? (
                              <span className="rounded bg-rose-500/20 px-2 py-0.5 font-semibold text-rose-300">
                                {t("Service stopped (Fault injected)")} · {t("503 / CIRCUIT OPEN")}
                              </span>
                            ) : row.replicasNow > 1 ? (
                              <span className="text-sky-300">
                                ~{Math.round(100 / row.replicasNow)}%/pod · p95: {row.p95Now}ms
                                {row.bottleneckTarget ? (
                                  <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                                    ⚠ Bottleneck: {row.bottleneckTarget} (1 pod)
                                  </span>
                                ) : (
                                  ""
                                )}
                              </span>
                            ) : (
                              <span className="text-emerald-300/85">
                                {t("Single instance baseline")} (100%/pod · p95: {row.p95Now}ms)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {bottomTab === "LOGS" && (
                  <div className="space-y-1.5 font-mono text-xs">
                    {sandboxStudioData.telemetry?.services.map((svc) => (
                      <div key={svc.service} className="rounded border bg-background px-2.5 py-1.5">
                        {svc.logs}
                      </div>
                    ))}
                  </div>
                )}

                {bottomTab === "SNAPSHOTS" && (
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {localSnapshots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No snapshots captured yet. Use the Right Inspector to capture Before and
                        After states.
                      </p>
                    ) : (
                      localSnapshots.map((snap, i) => (
                        <div key={snap.id} className="rounded border bg-background p-2 text-xs">
                          <p className="font-semibold">
                            #{i + 1} · {new Date(snap.capturedAt).toLocaleTimeString()}
                          </p>
                          <p className="text-muted-foreground">{snap.explanation}</p>
                          <p className="mt-1 font-mono text-[11px]">
                            Pods: {snap.totalInstances} · RAM: {snap.totalRamMiB} MiB
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

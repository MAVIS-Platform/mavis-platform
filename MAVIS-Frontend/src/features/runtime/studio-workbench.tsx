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
    action: "SCALE" as const,
    delta: 1,
  },
  {
    id: "palette-scale-4",
    badge: "×4 PODS",
    label: "Scale ×4 Cluster",
    action: "SCALE" as const,
    replicas: 4,
  },
  {
    id: "palette-scale-8",
    badge: "×8 PODS",
    label: "Scale ×8 Max Load",
    action: "SCALE" as const,
    replicas: 8,
  },
  {
    id: "palette-stop",
    badge: "FAULT",
    label: "Stop Container",
    action: "STOP" as const,
  },
  {
    id: "palette-start",
    badge: "RECOVER",
    label: "Restart Service",
    action: "START" as const,
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
  const workspaceRef = useRef<HTMLDivElement>(null);

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
    if (!clean || customServices.includes(clean)) return;
    setCustomServices((prev) => [...prev, clean]);
    setReplicasMap((prev) => ({ ...prev, [clean]: 1 }));
    setBaselineReplicasMap((prev) => ({ ...prev, [clean]: 1 }));
    setSelectedService(clean);
    setNewNodeName("");
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
            <Boxes className="size-4 text-primary" />
            <span className="text-sm font-bold tracking-tight">MAVIS STUDIO</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              3D / 2D WORKBENCH
            </Badge>
          </div>
          {mode === "SANDBOX" && (
            <select
              aria-label={t("Architecture Preset Template")}
              value={templateId}
              onChange={(e) => switchTemplate(e.target.value)}
              className="ml-2 h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
            >
              {STUDIO_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setMode("SANDBOX")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                mode === "SANDBOX"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Interactive Studio Sandbox (Instant)")}
            </button>
            <button
              type="button"
              onClick={() => setMode("LIVE")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                mode === "LIVE"
                  ? "bg-primary text-primary-foreground shadow-xs"
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
          <aside className="flex w-64 shrink-0 flex-col justify-between overflow-y-auto border-r bg-card/80 p-3">
            <div className="space-y-4">
              {/* Section A: Drag & Drop Action Blocks */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  1. {t("Studio Action Palette")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("Drag onto any 3D/2D block or click to apply to")} <strong>{selectedService}</strong>
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
                      className="flex cursor-grab items-center justify-between rounded-md border bg-background px-2.5 py-2 text-xs transition hover:border-primary hover:bg-accent/50 active:cursor-grabbing"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                          {item.badge}
                        </span>
                        <span className="font-medium">{t(item.label)}</span>
                      </div>
                      <span className="text-muted-foreground">⋮⋮</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section B: 3D Architecture Block Spawner */}
              <div className="space-y-2 border-t pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  2. {t("3D Block Library (Add Node)")}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 justify-start gap-1.5 px-2 text-[11px]"
                    onClick={() => addCustomBlock("SERVICE")}
                  >
                    <Server className="size-3.5 text-primary" />
                    + Service
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 justify-start gap-1.5 px-2 text-[11px]"
                    onClick={() => addCustomBlock("GATEWAY")}
                  >
                    <Workflow className="size-3.5 text-sky-400" />
                    + Gateway
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 justify-start gap-1.5 px-2 text-[11px]"
                    onClick={() => addCustomBlock("DATABASE")}
                  >
                    <Database className="size-3.5 text-emerald-400" />
                    + Database
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 justify-start gap-1.5 px-2 text-[11px]"
                    onClick={() => addCustomBlock("QUEUE")}
                  >
                    <Layers className="size-3.5 text-amber-400" />
                    + Broker
                  </Button>
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
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  3. {t("Resilience & Chaos")}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs"
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
                  className="w-full justify-start gap-2 text-xs"
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
                {customServices.map((svc) => (
                  <div
                    key={svc}
                    className={`flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] ${
                      selectedService === svc
                        ? "bg-primary/15 font-semibold text-primary"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 truncate text-left"
                      onClick={() => setSelectedService(svc)}
                    >
                      {svc} (×{replicasMap[svc] ?? 1})
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
                ))}
              </div>
            </div>
          </aside>

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
                  canvasOnly
                  defaultView="3D"
                />
              </main>

              {/* 3. RIGHT INSPECTOR DOCK: Explanation, Scaling Controls, Upstream/Downstream Impact & Snapshot */}
              <aside className="flex w-80 shrink-0 flex-col justify-between overflow-y-auto border-l bg-card/80 p-3.5">
                {selectedRow && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {selectedRow.layer.toUpperCase()} · {selectedRow.type}
                        </Badge>
                        <span
                          className={`font-mono text-xs font-bold ${
                            selectedRow.replicasNow === 0 ? "text-destructive" : "text-primary"
                          }`}
                        >
                          {selectedRow.replicasNow === 0
                            ? "STOPPED (503)"
                            : `${selectedRow.replicasNow} POD(S) RUNNING`}
                        </span>
                      </div>
                      <h2 className="mt-1.5 font-mono text-base font-bold">
                        {selectedRow.serviceName}
                      </h2>
                    </div>

                    {/* Direct Replica Scaling Buttons (1 -> 2 -> 4 -> 8) */}
                    <div className="space-y-1.5 rounded-lg border bg-background p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("Direct Replica & Fault Control")}
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([1, 2, 4, 8] as const).map((preset) => (
                          <Button
                            key={preset}
                            type="button"
                            size="sm"
                            variant={selectedRow.replicasNow === preset ? "default" : "outline"}
                            className="h-8 font-mono text-xs"
                            onClick={() =>
                              applySandboxAction({
                                action: "SCALE",
                                service: selectedRow.serviceName,
                                replicas: preset,
                              })
                            }
                          >
                            ×{preset}
                          </Button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={selectedRow.replicasNow === 0}
                          onClick={() =>
                            applySandboxAction({
                              action: "STOP",
                              service: selectedRow.serviceName,
                            })
                          }
                          className="h-7 text-xs text-destructive"
                        >
                          {t("Stop service")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={selectedRow.replicasNow > 0}
                          onClick={() =>
                            applySandboxAction({
                              action: "START",
                              service: selectedRow.serviceName,
                            })
                          }
                          className="h-7 text-xs"
                        >
                          {t("Start service")}
                        </Button>
                      </div>
                    </div>

                    {/* Live Architecture & Scaling Impact Explanation */}
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
                      <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("Architecture & Scaling Explanation")}
                      </p>
                      {selectedRow.replicasNow === 0 ? (
                        <div className="space-y-1.5 text-destructive">
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
                            <strong>{selectedRow.replicasNow} instances</strong> (~
                            {Math.round(100 / selectedRow.replicasNow)}% traffic/pod).
                          </p>
                          <p className="text-muted-foreground">
                            Per-instance CPU dropped to{" "}
                            <strong>{selectedRow.perPodCpu.toFixed(1)}%</strong> and p95 latency
                            improved to <strong>{selectedRow.p95Now} ms</strong>, while total RAM
                            footprint scaled to <strong>{Math.round(selectedRow.totalRam)} MiB</strong>.
                          </p>
                          {selectedRow.bottleneckTarget && (
                            <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 font-medium text-amber-400">
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
                          {selectedRow.perPodCpu.toFixed(1)}% CPU · {selectedRow.perPodRam} MiB RAM).
                          Scale to ×4 or ×8 to observe load distribution and downstream impact.
                        </p>
                      )}
                    </div>

                    {/* Upstream & Downstream Dependency Chains */}
                    <div className="space-y-2 rounded-lg border bg-background p-2.5 text-xs">
                      <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("Static Dependency Blast Radius")}
                      </p>
                      <div>
                        <span className="text-muted-foreground">{t("Direct callers")}: </span>
                        <span className="font-mono">
                          {selectedRow.inboundCallers.length > 0
                            ? selectedRow.inboundCallers.join(", ")
                            : "None (Ingress / Root)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Downstream targets: </span>
                        <span className="font-mono">
                          {selectedRow.outboundTargets.length > 0
                            ? selectedRow.outboundTargets.join(", ")
                            : "None (Leaf / Data store)"}
                        </span>
                      </div>
                    </div>

                    {/* Quick Snapshot Capture in Right Inspector */}
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("Capture evidence snapshot")}
                      </p>
                      <Textarea
                        value={snapshotNote}
                        onChange={(e) => setSnapshotNote(e.target.value)}
                        placeholder={t("Explain the observed behavior")}
                        rows={2}
                        className="text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="w-full gap-1.5 text-xs"
                        disabled={capturing}
                        onClick={() => void captureLocalSnapshot()}
                      >
                        <Camera className="size-3.5" />
                        {t("Capture evidence snapshot")} ({localSnapshots.length})
                      </Button>
                    </div>
                  </div>
                )}
              </aside>
            </div>

            {/* 4. BOTTOM STATS DOCK: Deployment & Scaling Impact Matrix + Action Logs + Snapshots */}
            <section className="flex h-60 shrink-0 flex-col border-t bg-card">
              <div className="flex items-center justify-between border-b px-4 py-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBottomTab("MATRIX")}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                      bottomTab === "MATRIX"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Project Deployment & Scaling Impact Matrix")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab("LOGS")}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                      bottomTab === "LOGS"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Service metrics and logs")} ({actionsLog.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab("SNAPSHOTS")}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                      bottomTab === "SNAPSHOTS"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Compare captured snapshots")} ({localSnapshots.length})
                  </button>
                </div>

                <div className="flex items-center gap-3 font-mono text-xs">
                  <span>
                    {t("Total running instances")}: <strong>{totalRunningPods}</strong>
                  </span>
                  <span>
                    {t("Total CPU load")}: <strong>{avgCpu.toFixed(1)}%</strong>
                  </span>
                  <span>
                    {t("Total RAM footprint")}: <strong>{Math.round(totalRamMiB)} MiB</strong>
                  </span>
                </div>
              </div>

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
                            row.serviceName === selectedService ? "bg-primary/10 font-medium" : ""
                          }`}
                        >
                          <td className="py-1.5 pr-3 font-mono font-semibold">{row.serviceName}</td>
                          <td className="px-2 py-1.5 font-mono text-[11px]">
                            {row.layer} · {row.type}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {row.inboundCount} in / {row.outboundCount} out
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {row.replicasBefore} → <strong>{row.replicasNow}</strong>
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {row.perPodCpu.toFixed(1)}% · {row.perPodRam} MiB
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            <strong>{row.totalRam} MiB</strong>
                          </td>
                          <td className="pl-2 py-1.5">
                            {row.replicasNow === 0 ? (
                              <span className="font-semibold text-destructive">
                                {t("Service stopped (Fault injected)")} · {t("503 / CIRCUIT OPEN")}
                              </span>
                            ) : row.replicasNow > 1 ? (
                              <span>
                                ~{Math.round(100 / row.replicasNow)}%/pod · p95: {row.p95Now}ms
                                {row.bottleneckTarget
                                  ? ` · ⚠ Bottleneck: ${row.bottleneckTarget} (1 pod)`
                                  : ""}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
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
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

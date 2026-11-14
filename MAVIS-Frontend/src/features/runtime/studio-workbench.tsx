"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Boxes, Play, Plus, RotateCcw, Server, Sparkles, Trash2 } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/shared/forms";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
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
    name: "E-Commerce Microservices Mesh (Gateway · Orders · Payment · Inventory · DB)",
    description:
      "Multi-tier Spring Boot & ASP.NET Core architecture with API Gateway, domain microservices, Kafka broker, and PostgreSQL data tier.",
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
    name: "High-Availability FinTech Core (BFF · Ledger · Fraud · Redis · Postgres)",
    description:
      "Low-latency payment settlement topology designed for testing 1 → 4 → 8 horizontal scaling and circuit-breaker fault isolation.",
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
  const [selectedService, setSelectedService] = useState<string>(template.services[1] ?? "order-service");
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeArchetype, setNewNodeArchetype] = useState<"SERVICE" | "GATEWAY" | "DATABASE" | "QUEUE">(
    "SERVICE",
  );
  const [actionsLog, setActionsLog] = useState<StudioData["actions"]>([]);
  const [localSnapshots, setLocalSnapshots] = useState<LocalSnapshot[]>([]);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [compareBeforeId, setCompareBeforeId] = useState("");
  const [compareAfterId, setCompareAfterId] = useState("");
  const [liveSessionId, setLiveSessionId] = useState(initialSessionId);
  const [chaosTarget, setChaosTarget] = useState("");
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

  function addCustomBlock() {
    const clean = newNodeName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-");
    if (!clean) return;
    const finalName =
      newNodeArchetype === "DATABASE" && !clean.includes("db") && !clean.includes("postgres")
        ? `${clean}-db`
        : newNodeArchetype === "GATEWAY" && !clean.includes("gateway")
          ? `${clean}-gateway`
          : newNodeArchetype === "QUEUE" && !clean.includes("kafka") && !clean.includes("mq")
            ? `${clean}-mq`
            : clean;
    if (customServices.includes(finalName)) return;
    setCustomServices((prev) => [...prev, finalName]);
    setReplicasMap((prev) => ({ ...prev, [finalName]: 1 }));
    setBaselineReplicasMap((prev) => ({ ...prev, [finalName]: 1 }));
    setSelectedService(finalName);
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

  const sandboxStudioData: StudioData = useMemo(() => {
    const nowIso = new Date().toISOString();
    const activeEdges = [
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
    ];

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
      // When scaling from 1 -> 4 -> 8, per-instance CPU drops proportionally while per-instance RAM stays steady
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
          ? ["Fault injection active: one or more services have 0 running replicas (503 / CIRCUIT OPEN)."]
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
  }, [template, customServices, replicasMap, actionsLog, localSnapshots]);

  async function captureLocalSnapshot() {
    const graph = workspaceRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
    setCapturing(true);
    try {
      const imageData = graph ? await captureStudioImage(graph).catch(() => undefined) : undefined;
      const totalInstances = Object.values(replicasMap).reduce((a, b) => a + b, 0);
      const totalRamMiB = customServices.reduce(
        (sum, s) => sum + (replicasMap[s] ?? 1) * (template.baseRam[s] ?? 220),
        0,
      );
      const snap: LocalSnapshot = {
        id: `snap-${localSnapshots.length + 1}-${Date.now().toString(36)}`,
        capturedAt: new Date().toISOString(),
        explanation:
          snapshotNote.trim() ||
          `Cluster state (${totalInstances} total running pods across ${customServices.length} services)`,
        digest: `sha256:${crypto.randomUUID().replace(/-/g, "")}`,
        ...(imageData ? { imageData } : {}),
        replicasByService: { ...replicasMap },
        totalInstances,
        totalRamMiB,
      };
      setLocalSnapshots((prev) => {
        const next = [...prev, snap];
        if (next.length >= 2) {
          setCompareBeforeId(next[0]!.id);
          setCompareAfterId(next[next.length - 1]!.id);
        }
        return next;
      });
      setSnapshotNote("");
    } finally {
      setCapturing(false);
    }
  }

  const beforeSnap =
    localSnapshots.find((s) => s.id === compareBeforeId) ?? localSnapshots[0];
  const afterSnap =
    localSnapshots.find((s) => s.id === compareAfterId) ?? localSnapshots.at(-1);

  return (
    <div ref={workspaceRef} className="space-y-5">
      {/* Top Banner: Standalone Shared Studio vs Live Docker Session */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-sky-500/5 to-emerald-500/10 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="gap-1">
                <Sparkles className="size-3.5" />
                {t("Standalone Shared Workbench")}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                2D / 3D Isometric · Drag & Drop Scaling (1 → 4 → 8) · Fault Injection
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Use this shared MAVIS Studio directly without stepping through course labs or quizzes. Design topologies, drag & drop scaling actions, inject faults, or attach to any live Docker session.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "SANDBOX" ? "default" : "outline"}
              onClick={() => setMode("SANDBOX")}
            >
              <Boxes className="mr-1.5 size-3.5" />
              {t("Interactive Studio Sandbox (Instant)")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "LIVE" ? "default" : "outline"}
              onClick={() => setMode("LIVE")}
            >
              <Server className="mr-1.5 size-3.5" />
              {t("Connect Live Docker Session")} ({liveSessions.length})
            </Button>
          </div>
        </div>
      </div>

      {mode === "LIVE" ? (
        <div className="space-y-4 rounded-xl border bg-card p-4">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode("SANDBOX")}
            >
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
      ) : (
        <div className="space-y-4">
          {/* Sandbox Setup & Custom Block Builder Bar */}
          <div className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[1.4fr_1.6fr]">
            <div className="space-y-2">
              <SelectField
                label={t("Architecture Preset Template")}
                value={templateId}
                onChange={switchTemplate}
                options={STUDIO_TEMPLATES.map((tpl) => ({
                  value: tpl.id,
                  label: tpl.name,
                }))}
              />
              <p className="text-xs text-muted-foreground">{template.description}</p>
            </div>

            <div className="space-y-2 border-t pt-3 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("Custom Studio Block Builder & Chaos Controls")}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  {t("Block name")}
                  <Input
                    value={newNodeName}
                    onChange={(e) => setNewNodeName(e.target.value)}
                    placeholder="e.g. billing-service"
                    className="mt-1 h-8 w-40 text-xs"
                  />
                </label>
                <SelectField
                  label={t("3D Archetype")}
                  value={newNodeArchetype}
                  onChange={(v) =>
                    setNewNodeArchetype(v as "SERVICE" | "GATEWAY" | "DATABASE" | "QUEUE")
                  }
                  options={[
                    { value: "SERVICE", label: "3D Server Rack (Service)" },
                    { value: "GATEWAY", label: "3D Ingress Gateway" },
                    { value: "DATABASE", label: "3D Database Cylinder" },
                    { value: "QUEUE", label: "3D Message Broker" },
                  ]}
                />
                <Button type="button" size="sm" variant="outline" onClick={addCustomBlock}>
                  <Plus className="mr-1 size-3.5" />
                  {t("Add Block")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const running = customServices.filter((s) => (replicasMap[s] ?? 1) > 0);
                    if (running.length > 0) {
                      const pick =
                        running[crypto.getRandomValues(new Uint32Array(1))[0]! % running.length]!;
                      setChaosTarget(pick);
                    }
                  }}
                >
                  <Play className="mr-1 size-3.5" />
                  {t("Chaos Monkey experiment")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => switchTemplate(templateId)}
                >
                  <RotateCcw className="mr-1 size-3.5" />
                  {t("Reset cluster")}
                </Button>
              </div>
              {chaosTarget && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs">
                  <span className="font-medium">
                    {t("Stop the selected running service")}: <strong>{chaosTarget}</strong>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      applySandboxAction({ action: "STOP", service: chaosTarget });
                      setChaosTarget("");
                    }}
                  >
                    {t("Confirm fault injection")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setChaosTarget("")}
                  >
                    {t("Cancel")}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {customServices.map((svc) => (
                  <span
                    key={svc}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] ${
                      selectedService === svc
                        ? "border-primary bg-primary/15 font-semibold"
                        : "bg-muted/40"
                    }`}
                  >
                    <button type="button" onClick={() => setSelectedService(svc)}>
                      {svc} (×{replicasMap[svc] ?? 1})
                    </button>
                    {customServices.length > 2 && (
                      <button
                        type="button"
                        aria-label={`Remove ${svc}`}
                        onClick={() => removeCustomBlock(svc)}
                        className="ml-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Main 2D / 3D Studio Observability Canvas + Deployment & Scaling Matrix */}
          <StudioObservability
            data={sandboxStudioData}
            selected={selectedService}
            onSelect={setSelectedService}
            busy={false}
            onQuickAction={applySandboxAction}
          />

          {/* Snapshot Capture & Side-by-Side Before/After Comparison */}
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-medium">{t("Capture evidence snapshot")} (Before vs. After)</h4>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Capture a baseline snapshot (e.g. 4 instances), scale to 8 instances or inject a fault, and capture an After snapshot to compare side-by-side.",
                  )}
                </p>
              </div>
              <Badge variant="outline">
                {localSnapshots.length} {t("snapshots captured")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[260px] flex-1">
                <Textarea
                  value={snapshotNote}
                  onChange={(e) => setSnapshotNote(e.target.value)}
                  placeholder={t(
                    "e.g. Scaled order-service from 4 to 8 replicas — per-pod CPU dropped by 45% while total RAM doubled",
                  )}
                  rows={2}
                />
              </div>
              <Button
                type="button"
                disabled={capturing}
                onClick={() => void captureLocalSnapshot()}
              >
                {t("Capture evidence snapshot")}
              </Button>
            </div>

            {localSnapshots.length >= 2 && beforeSnap && afterSnap && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <h5 className="font-medium">{t("Compare captured snapshots")}</h5>
                <div className="flex flex-wrap gap-3">
                  <SelectField
                    label={t("Before")}
                    value={beforeSnap.id}
                    onChange={setCompareBeforeId}
                    options={localSnapshots.map((s) => ({
                      value: s.id,
                      label: `${new Date(s.capturedAt).toLocaleTimeString()} · ${s.explanation}`,
                    }))}
                  />
                  <SelectField
                    label={t("After")}
                    value={afterSnap.id}
                    onChange={setCompareAfterId}
                    options={localSnapshots.map((s) => ({
                      value: s.id,
                      label: `${new Date(s.capturedAt).toLocaleTimeString()} · ${s.explanation}`,
                    }))}
                  />
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded border bg-background p-2.5">
                    <p className="font-semibold">
                      {t("Before")}: {beforeSnap.explanation}
                    </p>
                    <p className="font-mono text-muted-foreground">
                      {t("Total running instances")}: {beforeSnap.totalInstances} ·{" "}
                      {t("Total RAM footprint")}: {beforeSnap.totalRamMiB} MiB
                    </p>
                  </div>
                  <div className="rounded border bg-background p-2.5">
                    <p className="font-semibold">
                      {t("After")}: {afterSnap.explanation}
                    </p>
                    <p className="font-mono text-muted-foreground">
                      {t("Total running instances")}: {afterSnap.totalInstances} ·{" "}
                      {t("Total RAM footprint")}: {afterSnap.totalRamMiB} MiB
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

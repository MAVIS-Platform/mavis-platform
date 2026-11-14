"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Boxes,
  Camera,
  Cpu,
  CreditCard,
  Database,
  FileJson,
  Flame,
  GitFork,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Network,
  Package,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/shared/forms";
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

type StudioComponentPreset = {
  key: string;
  label: string;
  spec: string;
  category: "EDGE" | "COMPUTE" | "DATA" | "INFRA";
  layer: string;
  elementType: string;
  baseCpu: number;
  baseRam: number;
  cardClass: string;
  iconClass: string;
  titleClass: string;
  specClass: string;
};

const STUDIO_COMPONENT_CATALOG: StudioComponentPreset[] = [
  // 1. EDGE & INGRESS
  {
    key: "cdn-edge",
    label: "CDN Edge",
    spec: "5,000 req/s · 4ms",
    category: "EDGE",
    layer: "edge",
    elementType: "API_GATEWAY",
    baseCpu: 9.5,
    baseRam: 128,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-sky-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "waf-shield",
    label: "WAF",
    spec: "3,000 req/s · DDoS",
    category: "EDGE",
    layer: "edge",
    elementType: "API_GATEWAY",
    baseCpu: 14.0,
    baseRam: 150,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-sky-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "load-balancer",
    label: "Load Balancer",
    spec: "2,500 req/s · L7 LB",
    category: "EDGE",
    layer: "edge",
    elementType: "API_GATEWAY",
    baseCpu: 16.5,
    baseRam: 160,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-sky-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "edge-gateway",
    label: "Gateway",
    spec: "1,500 req/s · OAuth",
    category: "EDGE",
    layer: "edge",
    elementType: "API_GATEWAY",
    baseCpu: 22.0,
    baseRam: 180,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-sky-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },

  // 2. COMPUTE & SERVICES
  {
    key: "app-service",
    label: "Service",
    spec: "500 req/s · 220 MiB",
    category: "COMPUTE",
    layer: "application",
    elementType: "SERVICE_CONTAINER",
    baseCpu: 34.0,
    baseRam: 220,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-slate-300",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "async-worker",
    label: "Worker",
    spec: "300 jobs/s · Consumer",
    category: "COMPUTE",
    layer: "domain",
    elementType: "SERVICE_CONTAINER",
    baseCpu: 42.0,
    baseRam: 280,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-slate-300",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "auth-sso",
    label: "Auth / SSO",
    spec: "800 req/s · JWT IAM",
    category: "COMPUTE",
    layer: "domain",
    elementType: "SERVICE_CONTAINER",
    baseCpu: 21.0,
    baseRam: 160,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-slate-300",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "lambda-fn",
    label: "Serverless",
    spec: "1,200 req/s · Auto",
    category: "COMPUTE",
    layer: "application",
    elementType: "SERVICE_CONTAINER",
    baseCpu: 14.0,
    baseRam: 128,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-slate-300",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },

  // 3. DATA & STORAGE
  {
    key: "postgres-db",
    label: "Postgres",
    spec: "400 qps · ACID SQL",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 32.0,
    baseRam: 320,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-emerald-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "redis-cache",
    label: "Redis",
    spec: "10k ops/s · 2ms KV",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 15.0,
    baseRam: 190,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-emerald-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "mongo-nosql",
    label: "MongoDB",
    spec: "1,800 ops/s · NoSQL",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 28.0,
    baseRam: 290,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-emerald-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "s3-storage",
    label: "S3 Store",
    spec: "2,000 req/s · Blob",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 11.0,
    baseRam: 140,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-emerald-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "elastic-search",
    label: "Elastic",
    spec: "700 qps · Full-Text",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 39.0,
    baseRam: 380,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-emerald-400/90",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },

  // 4. MESSAGING & OBSERVABILITY
  {
    key: "kafka-broker",
    label: "Kafka",
    spec: "5,000 msg/s · Topic",
    category: "INFRA",
    layer: "infrastructure",
    elementType: "MESSAGE_BROKER",
    baseCpu: 24.0,
    baseRam: 310,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-slate-400",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "rabbitmq-bus",
    label: "RabbitMQ",
    spec: "1,500 msg/s · AMQP",
    category: "INFRA",
    layer: "infrastructure",
    elementType: "MESSAGE_BROKER",
    baseCpu: 19.0,
    baseRam: 210,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-slate-400",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
  },
  {
    key: "otel-collector",
    label: "OTel APM",
    spec: "2,000 spans/s · APM",
    category: "INFRA",
    layer: "infrastructure",
    elementType: "MESSAGE_BROKER",
    baseCpu: 16.0,
    baseRam: 190,
    cardClass:
      "border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80",
    iconClass: "text-slate-400",
    titleClass: "text-slate-100",
    specClass: "text-slate-400",
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

type NodeSimConfig = {
  instanceTier: "S" | "M" | "L";
  trafficMult: 1 | 2 | 4 | 8;
  injectedLatencyMs: 0 | 40 | 180 | 600;
  circuitBreaker: boolean;
  autoScaleHpa: boolean;
  readCache: boolean;
  rateLimiter: boolean;
};

const DEFAULT_NODE_CONFIG: NodeSimConfig = {
  instanceTier: "M",
  trafficMult: 1,
  injectedLatencyMs: 0,
  circuitBreaker: true,
  autoScaleHpa: false,
  readCache: false,
  rateLimiter: false,
};

function renderComponentIcon(keyOrName: string, className = "size-4") {
  const n = keyOrName.toLowerCase();
  if (n.includes("cdn")) return <Globe className={className} />;
  if (n.includes("waf") || n.includes("shield") || n.includes("firewall") || n.includes("fraud"))
    return <ShieldCheck className={className} />;
  if (n.includes("load-balancer") || n.includes("lb"))
    return <GitFork className={`${className} rotate-90`} />;
  if (n.includes("gateway") || n.includes("edge")) return <Network className={className} />;
  if (n.includes("worker") || n.includes("async")) return <Cpu className={className} />;
  if (n.includes("auth") || n.includes("sso") || n.includes("iam"))
    return <KeyRound className={className} />;
  if (n.includes("lambda") || n.includes("fn") || n.includes("serverless"))
    return <Zap className={className} />;
  if (n.includes("redis") || n.includes("cache")) return <Flame className={className} />;
  if (n.includes("mongo") || n.includes("nosql") || n.includes("doc"))
    return <FileJson className={className} />;
  if (n.includes("s3") || n.includes("storage") || n.includes("blob"))
    return <HardDrive className={className} />;
  if (n.includes("elastic") || n.includes("search")) return <Search className={className} />;
  if (n.includes("postgres") || n.includes("db") || n.includes("sql") || n.includes("settlement"))
    return <Database className={className} />;
  if (n.includes("rabbit") || n.includes("bus") || n.includes("mq"))
    return <Send className={className} />;
  if (n.includes("otel") || n.includes("prometheus") || n.includes("metric"))
    return <BarChart3 className={className} />;
  if (n.includes("kafka") || n.includes("stream") || n.includes("broker"))
    return <Activity className={className} />;
  if (n.includes("order")) return <ShoppingCart className={className} />;
  if (n.includes("payment") || n.includes("ledger")) return <CreditCard className={className} />;
  if (n.includes("inventory")) return <Package className={className} />;
  return <Server className={className} />;
}

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
  const [nodeConfigs, setNodeConfigs] = useState<Record<string, NodeSimConfig>>({});
  const [extraEdges, setExtraEdges] = useState<Array<{ from: string; to: string; protocol: string }>>([]);
  const [removedEdges, setRemovedEdges] = useState<string[]>([]);
  const [componentCategory, setComponentCategory] = useState<
    "ALL" | "EDGE" | "COMPUTE" | "DATA" | "INFRA"
  >("ALL");
  const [componentSearch, setComponentSearch] = useState("");
  const [actionsLog, setActionsLog] = useState<StudioData["actions"]>([]);
  const [localSnapshots, setLocalSnapshots] = useState<LocalSnapshot[]>([]);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState(initialSessionId);
  const [bottomTab, setBottomTab] = useState<"MATRIX" | "SNAPSHOTS">("MATRIX");
  const [leftWidth, setLeftWidth] = useState(286);
  const [rightWidth, setRightWidth] = useState(268);
  const [bottomHeight, setBottomHeight] = useState(242);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const leftGridCols = leftWidth >= 480 ? 4 : leftWidth >= 355 ? 3 : leftWidth >= 230 ? 2 : 1;

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
        const next = Math.max(160, Math.min(640, initialLeft + (moveEvent.clientX - startX)));
        setLeftCollapsed(false);
        setLeftWidth(next);
      } else if (axis === "right") {
        const next = Math.max(200, Math.min(520, initialRight - (moveEvent.clientX - startX)));
        setRightCollapsed(false);
        setRightWidth(next);
      } else {
        const next = Math.max(96, Math.min(480, initialBottom - (moveEvent.clientY - startY)));
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
    setNodeConfigs({});
    setExtraEdges([]);
    setRemovedEdges([]);
    setSelectedService(found.services[1] ?? found.services[0] ?? "");
    setActionsLog([]);
  }

  function getNodeConfig(svc: string): NodeSimConfig {
    return nodeConfigs[svc] ?? DEFAULT_NODE_CONFIG;
  }

  function updateNodeConfig(svc: string, patch: Partial<NodeSimConfig>) {
    setNodeConfigs((prev) => {
      const current = prev[svc] ?? DEFAULT_NODE_CONFIG;
      const next = { ...current, ...patch };
      // If Auto-Scale HPA is enabled and traffic is high, auto-bump replicas to at least 4
      if (next.autoScaleHpa && next.trafficMult >= 2 && (replicasMap[svc] ?? 1) < 4) {
        setReplicasMap((rm) => ({ ...rm, [svc]: 4 }));
      }
      return { ...prev, [svc]: next };
    });
  }

  function toggleOutboundEdge(fromSvc: string, toSvc: string) {
    if (!toSvc || fromSvc === toSvc) return;
    const key = `${fromSvc}->${toSvc}`;
    const existsInActive = activeEdges.some((e) => e.from === fromSvc && e.to === toSvc);
    if (existsInActive) {
      setRemovedEdges((prev) => [...prev, key]);
      setExtraEdges((prev) => prev.filter((e) => !(e.from === fromSvc && e.to === toSvc)));
    } else {
      setRemovedEdges((prev) => prev.filter((k) => k !== key));
      setExtraEdges((prev) => [...prev, { from: fromSvc, to: toSvc, protocol: "HTTP" }]);
    }
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

  function addCustomBlock(presetKey?: string) {
    const legacyMap: Record<string, string> = {
      SERVICE: "app-service",
      GATEWAY: "edge-gateway",
      DATABASE: "postgres-db",
      QUEUE: "kafka-broker",
    };
    const resolvedKey = presetKey ? (legacyMap[presetKey] ?? presetKey) : "app-service";
    const preset = STUDIO_COMPONENT_CATALOG.find((item) => item.key === resolvedKey);
    const baseSlug = newNodeName.trim() || preset?.key || resolvedKey;
    const cleanBase = baseSlug.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    if (!cleanBase) return undefined;
    let clean = cleanBase;
    let suffix = 2;
    while (customServices.includes(clean)) {
      clean = `${cleanBase}-${suffix}`;
      suffix += 1;
    }
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

  const activeEdges = useMemo(() => {
    const base = [
      ...template.edges.filter(
        (e) => customServices.includes(e.from) && customServices.includes(e.to),
      ),
      ...customServices
        .filter((s) => !template.services.includes(s))
        .map((s) => {
          const lower = s.toLowerCase();
          const gatewayNode = customServices[0] ?? "api-gateway";
          const primaryAppNode =
            customServices.find(
              (n) =>
                !/(gateway|cdn|waf|lb|balancer|postgres|mysql|mongo|redis|s3|elastic|kafka|rabbit|otel)/.test(
                  n.toLowerCase(),
                ),
            ) ?? gatewayNode;
          if (/(cdn|waf|shield|firewall|load-balancer)/.test(lower)) {
            return { from: s, to: gatewayNode, protocol: "HTTPS" };
          }
          if (
            /(postgres|mysql|mongo|redis|cache|s3|storage|elastic|search|kafka|rabbit|mq|otel|monitor)/.test(
              lower,
            )
          ) {
            return { from: primaryAppNode, to: s, protocol: "TCP" };
          }
          return {
            from: gatewayNode,
            to: s,
            protocol: "HTTP",
          };
        }),
      ...extraEdges.filter(
        (e) => customServices.includes(e.from) && customServices.includes(e.to),
      ),
    ];
    const seen = new Set<string>();
    return base.filter((e) => {
      const key = `${e.from}->${e.to}`;
      if (removedEdges.includes(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [template, customServices, extraEdges, removedEdges]);

  const sandboxStudioData: StudioData = useMemo(() => {
    const nowIso = new Date().toISOString();
    const interactions = activeEdges.map((edge, idx) => ({
      traceId: `studio-trace-${idx + 1}`,
      fromService: edge.from,
      toService: edge.to,
      parentSpanId: `span-${edge.from}-${idx}`,
      childSpanId: `span-${edge.to}-${idx}`,
    }));

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
      const catalogMatch = STUDIO_COMPONENT_CATALOG.find((item) => svc.startsWith(item.key));
      const baseCpuVal = template.baseCpu[svc] ?? catalogMatch?.baseCpu ?? 26.5;
      const baseRamVal = template.baseRam[svc] ?? catalogMatch?.baseRam ?? 220;
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
      const cfg = nodeConfigs[svc] ?? DEFAULT_NODE_CONFIG;
      const catalogMatch = STUDIO_COMPONENT_CATALOG.find((item) => svc.startsWith(item.key));
      const baseCpuVal = template.baseCpu[svc] ?? catalogMatch?.baseCpu ?? 26.5;
      const baseRamVal = template.baseRam[svc] ?? catalogMatch?.baseRam ?? 220;
      const tierCpuFactor = cfg.instanceTier === "S" ? 1.35 : cfg.instanceTier === "L" ? 0.62 : 1.0;
      const tierRamFactor = cfg.instanceTier === "S" ? 0.75 : cfg.instanceTier === "L" ? 1.45 : 1.0;
      const effectiveTraffic = cfg.rateLimiter ? Math.min(2, cfg.trafficMult) : cfg.trafficMult;
      const cacheCpuFactor = cfg.readCache ? 0.75 : 1.0;
      const rawPodCpu =
        now <= 0
          ? 0
          : ((baseCpuVal * tierCpuFactor * effectiveTraffic * cacheCpuFactor) /
              Math.pow(now, 0.68));
      const perPodCpu = now <= 0 ? 0 : Math.min(99.5, Math.max(4.2, rawPodCpu));
      const perPodRam = now <= 0 ? 0 : Math.round(baseRamVal * tierRamFactor);
      const totalRam = perPodRam * Math.max(0, now);
      const inbound = activeEdges.filter((e) => e.to === svc);
      const outbound = activeEdges.filter((e) => e.from === svc);
      const bottleneckTarget = outbound
        .map((e) => e.to)
        .find((ds) => (now >= 4 || cfg.trafficMult >= 2) && (replicasMap[ds] ?? 1) <= 1);
      const baseP95 = Math.max(8, Math.round((48 * Math.sqrt(effectiveTraffic)) / Math.sqrt(Math.max(1, now))));
      const cachedP95 = cfg.readCache ? Math.max(5, Math.round(baseP95 * 0.62)) : baseP95;
      const p95Now = now <= 0 ? 980 : cachedP95 + cfg.injectedLatencyMs;
      return {
        serviceName: svc,
        layer: template.layers[svc] ?? catalogMatch?.layer ?? "domain",
        type: template.types[svc] ?? catalogMatch?.elementType ?? "SERVICE_CONTAINER",
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
        cfg,
      };
    });
  }, [customServices, baselineReplicasMap, replicasMap, nodeConfigs, template, activeEdges]);

  const selectedRow =
    deploymentRows.find((r) => r.serviceName === selectedService) ?? deploymentRows[0];
  const totalRunningPods = deploymentRows.reduce((s, r) => s + r.replicasNow, 0);
  const totalRamMiB = deploymentRows.reduce((s, r) => s + r.totalRam, 0);
  const avgCpu =
    deploymentRows.length > 0
      ? deploymentRows.reduce((s, r) => s + r.perPodCpu, 0) / deploymentRows.length
      : 0;
  const healthyServicesCount = deploymentRows.filter((r) => r.replicasNow > 0).length;
  const downServicesCount = deploymentRows.length - healthyServicesCount;
  const bottleneckCount = deploymentRows.filter((r) => Boolean(r.bottleneckTarget)).length;
  const totalVcpuAllocated = deploymentRows.reduce((sum, r) => {
    const vcpuPerPod = r.cfg.instanceTier === "S" ? 0.5 : r.cfg.instanceTier === "L" ? 2.0 : 1.0;
    return sum + r.replicasNow * vcpuPerPod;
  }, 0);
  const maxServerVcpu = 16;
  const maxServerRamMiB = 4096;
  const peakCpuRow = [...deploymentRows].sort((a, b) => b.perPodCpu - a.perPodCpu)[0];
  const clusterRps = deploymentRows.reduce(
    (sum, r) => sum + r.replicasNow * r.cfg.trafficMult * 240,
    0,
  );
  const avgClusterP95 =
    healthyServicesCount > 0
      ? Math.round(
          deploymentRows
            .filter((r) => r.replicasNow > 0)
            .reduce((s, r) => s + r.p95Now, 0) / healthyServicesCount,
        )
      : 999;
  const e2eP95 =
    downServicesCount > 0
      ? 999
      : Math.round(avgClusterP95 * Math.min(3.0, Math.max(1.5, activeEdges.length * 0.35)));
  const clusterErrorRate =
    downServicesCount > 0
      ? Math.min(
          100,
          Number(((downServicesCount / Math.max(1, deploymentRows.length)) * 100).toFixed(1)),
        )
      : avgCpu > 80
        ? Number(((avgCpu - 75) * 0.4).toFixed(2))
        : 0.02;
  const clusterSla = Number(Math.max(0, 100 - clusterErrorRate).toFixed(2));

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
      {/* STANDALONE STUDIO TOP HEADER BAR (Meta / Linear SE Monochrome Header) */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 bg-[#0b101b] px-2.5">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-7 gap-1 border-slate-800 bg-slate-900/90 px-2 text-xs text-slate-200 hover:bg-slate-800">
            <Link href="/administration/health">
              <ArrowLeft className="size-3" />
              {t("Exit Studio")}
            </Link>
          </Button>
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
            <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-100">
              MAVIS
            </span>
            <span className="text-xs font-semibold tracking-tight text-slate-300">Studio</span>
          </div>
          {mode === "SANDBOX" && (
            <select
              aria-label={t("Architecture Preset Template")}
              value={templateId}
              onChange={(e) => switchTemplate(e.target.value)}
              className="h-7 rounded-md border border-slate-800 bg-slate-900/90 px-2 text-xs font-medium text-slate-200 transition hover:border-slate-700"
            >
              {STUDIO_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id} className="bg-slate-950 text-slate-100">
                  {tpl.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* CENTER TELEMETRY PILL BAR (Clean Monospace Engineering Bar) */}
        <div className="hidden items-center gap-3 rounded-full border border-slate-800 bg-slate-950/90 px-3.5 py-0.5 text-[11px] lg:flex">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase text-slate-400">Traffic</span>
            <span className="font-mono font-semibold text-slate-100">
              {(totalRunningPods * 240).toLocaleString()} req/s
            </span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase text-slate-400">RAM</span>
            <span className="font-mono font-semibold text-slate-100">
              {Math.round(totalRamMiB)} MiB
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-400/80 transition-all"
                style={{ width: `${Math.min(100, Math.round((totalRamMiB / 4096) * 100))}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-slate-500">/ 4096</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {mode === "SANDBOX" && (
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => setLeftCollapsed((p) => !p)}
                title="Ẩn/hiện thanh công cụ bên trái"
                className={`h-7 rounded border px-2 text-[11px] font-medium transition ${
                  !leftCollapsed
                    ? "border-slate-600 bg-slate-800 text-slate-100"
                    : "border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                ◧ Tools
              </button>
              <button
                type="button"
                onClick={() => setRightCollapsed((p) => !p)}
                title="Ẩn/hiện thanh Inspector bên phải"
                className={`h-7 rounded border px-2 text-[11px] font-medium transition ${
                  !rightCollapsed
                    ? "border-slate-600 bg-slate-800 text-slate-100"
                    : "border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                ◨ Inspector
              </button>
            </div>
          )}
          <div className="inline-flex rounded-full border border-slate-800 bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => setMode("SANDBOX")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                mode === "SANDBOX"
                  ? "bg-slate-100 text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Sandbox
            </button>
            <button
              type="button"
              onClick={() => setMode("LIVE")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                mode === "LIVE"
                  ? "bg-slate-100 text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Live ({liveSessions.length})
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
          {/* 1. LEFT VERTICAL TOOLBOX: Pure Functional Block Library + Smart Auto-Reflow Grid */}
          {!leftCollapsed && (
            <aside
              style={{ width: leftWidth }}
              className="flex shrink-0 flex-col justify-between overflow-y-auto bg-[#0b101b] p-2.5"
            >
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {/* Section A: 16-Component Functional Block Library (Smart 1/2/3/4 Column Auto-Grid) */}
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      3D Block Library ({STUDIO_COMPONENT_CATALOG.length})
                    </p>
                    <span className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                      {leftGridCols} col{leftGridCols > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Search Input */}
                  <Input
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    placeholder="Search functional blocks..."
                    className="h-7 rounded-full border-slate-800 bg-slate-900/90 px-3 text-[11px]"
                  />

                  {/* Category Filter Pills (Clean Monochrome Active State) */}
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ["ALL", "All"],
                        ["EDGE", "Edge"],
                        ["COMPUTE", "Compute"],
                        ["DATA", "Data"],
                        ["INFRA", "Infra"],
                      ] as const
                    ).map(([cat, label]) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setComponentCategory(cat)}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${
                          componentCategory === cat
                            ? "bg-slate-100 text-slate-950"
                            : "border border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Smart Auto-Distributing Functional Block Grid (1, 2, 3, or 4 columns as sidebar stretches) */}
                  <div
                    style={{
                      gridTemplateColumns: `repeat(${leftGridCols}, minmax(0, 1fr))`,
                    }}
                    className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto pr-0.5"
                  >
                    {STUDIO_COMPONENT_CATALOG.filter((item) => {
                      const matchesCat =
                        componentCategory === "ALL" || item.category === componentCategory;
                      const q = componentSearch.trim().toLowerCase();
                      const matchesSearch =
                        !q ||
                        item.label.toLowerCase().includes(q) ||
                        item.key.toLowerCase().includes(q) ||
                        item.spec.toLowerCase().includes(q);
                      return matchesCat && matchesSearch;
                    }).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        draggable
                        title={`${item.label} (${item.spec})`}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/x-mavis-studio-spawn", item.key);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addCustomBlock(item.key)}
                        className={`flex cursor-grab items-center gap-2 rounded-full border px-3 py-2 text-left text-[11.5px] font-medium text-slate-200 transition active:cursor-grabbing ${item.cardClass}`}
                      >
                        <span className={`shrink-0 ${item.iconClass}`}>
                          {renderComponentIcon(item.key, "size-3.5")}
                        </span>
                        <span className="truncate">+ {item.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1.5 pt-0.5">
                    <Input
                      value={newNodeName}
                      onChange={(e) => setNewNodeName(e.target.value)}
                      placeholder="Custom block name..."
                      className="h-7 rounded-full border-slate-800 bg-slate-900/90 px-3 text-[11px]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 w-8 shrink-0 rounded-full border border-slate-800 bg-slate-900 p-0 text-slate-200 hover:bg-slate-800"
                      onClick={() => addCustomBlock()}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Section B: Compact Cluster Scenarios (Smart Auto-Grid + Unified Monochrome Slate Pills) */}
                <div className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Cluster Scenarios
                  </p>
                  <div
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(3, leftGridCols)}, minmax(0, 1fr))`,
                    }}
                    className="grid gap-1.5"
                  >
                    <button
                      type="button"
                      title="Spike cluster traffic 4×"
                      onClick={() => {
                        setNodeConfigs(() =>
                          Object.fromEntries(
                            customServices.map((s) => [
                              s,
                              { ...(nodeConfigs[s] ?? DEFAULT_NODE_CONFIG), trafficMult: 4 },
                            ]),
                          ),
                        );
                        const gw = customServices[0];
                        if (gw) {
                          setReplicasMap((prev) => ({ ...prev, [gw]: 4 }));
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
                    >
                      <Flame className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">4× Surge</span>
                    </button>

                    <button
                      type="button"
                      title="Kill primary DB (503 test)"
                      onClick={() => {
                        const dbNode =
                          customServices.find((s) =>
                            /(postgres|db|mongo|redis|sql|settlement)/.test(s.toLowerCase()),
                          ) ?? customServices[customServices.length - 1];
                        if (dbNode) {
                          applySandboxAction({ action: "STOP", service: dbNode });
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-200 transition hover:border-rose-500/60 hover:bg-slate-800"
                    >
                      <ShieldAlert className="size-3.5 shrink-0 text-rose-400/90" />
                      <span className="truncate">DB Outage</span>
                    </button>

                    <button
                      type="button"
                      title="Kill random active pod"
                      onClick={() => {
                        const running = customServices.filter((s) => (replicasMap[s] ?? 1) > 0);
                        if (running.length > 0) {
                          const pick =
                            running[
                              crypto.getRandomValues(new Uint32Array(1))[0]! % running.length
                            ]!;
                          applySandboxAction({ action: "STOP", service: pick });
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
                    >
                      <Zap className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">Chaos</span>
                    </button>

                    <button
                      type="button"
                      title="Scale all ×4 + Enable Cache"
                      onClick={() => {
                        setReplicasMap(
                          Object.fromEntries(customServices.map((s) => [s, 4])),
                        );
                        setNodeConfigs((prev) =>
                          Object.fromEntries(
                            customServices.map((s) => [
                              s,
                              {
                                ...(prev[s] ?? DEFAULT_NODE_CONFIG),
                                autoScaleHpa: true,
                                readCache: true,
                              },
                            ]),
                          ),
                        );
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
                    >
                      <Sparkles className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">×4 HA Scale</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => switchTemplate(templateId)}
                    title={t("Reset cluster")}
                    className="flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset Cluster
                  </button>
                </div>
              </div>
            </aside>
          )}

          {/* LEFT RESIZE SPLITTER */}
          <div
            role="separator"
            aria-orientation="vertical"
            title="Kéo ra/vào để tự động chia 1, 2, 3, 4 cột khối chức năng (Double-click để thu gọn)"
            onPointerDown={(e) => startResize("left", e)}
            onDoubleClick={() => setLeftCollapsed((prev) => !prev)}
            className="group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-slate-800 bg-slate-950 transition hover:bg-slate-800"
          >
            <div className="h-10 w-0.5 rounded-full bg-slate-700 group-hover:bg-slate-400" />
          </div>

          {/* CENTER COLUMN: TOP (FULL-BLEED 3D/2D CANVAS) + BOTTOM (TELEMETRY DOCK) */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* 2. CENTER INTERACTIVE 3D / 2D CANVAS (Full-Bleed Edge-to-Edge) */}
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#070b14]">
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

            {/* BOTTOM RESIZE SPLITTER */}
            <div
              role="separator"
              aria-orientation="horizontal"
              title="Kéo lên/xuống để thay đổi chiều cao thanh Stats (Double-click để thu gọn/mở rộng)"
              onPointerDown={(e) => startResize("bottom", e)}
              onDoubleClick={() => setBottomCollapsed((prev) => !prev)}
              className="group relative flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-slate-800 bg-slate-950 transition hover:bg-slate-800"
            >
              <div className="h-0.5 w-10 rounded-full bg-slate-700 group-hover:bg-slate-400" />
            </div>

            {/* 4. BOTTOM TELEMETRY & IMPACT DOCK: Strictly inside Center Column between Left & Right Sidebars */}
            <section
              style={{ height: bottomCollapsed ? 36 : bottomHeight }}
              className="flex shrink-0 flex-col bg-[#0b101b]"
            >
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/60 px-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!bottomCollapsed && bottomTab === "MATRIX") {
                        setBottomCollapsed(true);
                      } else {
                        setBottomCollapsed(false);
                        setBottomTab("MATRIX");
                      }
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      !bottomCollapsed && bottomTab === "MATRIX"
                        ? "border border-slate-700 bg-slate-800 text-slate-100"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Service Telemetry & Impact ({deploymentRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!bottomCollapsed && bottomTab === "SNAPSHOTS") {
                        setBottomCollapsed(true);
                      } else {
                        setBottomCollapsed(false);
                        setBottomTab("SNAPSHOTS");
                      }
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      !bottomCollapsed && bottomTab === "SNAPSHOTS"
                        ? "border border-slate-700 bg-slate-800 text-slate-100"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Snapshots ({localSnapshots.length})
                  </button>
                </div>

                {/* Cluster-wide KPI Summary Pills (Clean Monochrome Engineering Readouts, Zero Emojis) */}
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="hidden rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-slate-400 sm:inline-block">
                    REQ/S <strong className="text-slate-100">{(totalRunningPods * 240).toLocaleString()}</strong>
                  </span>
                  <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-slate-400">
                    PODS <strong className="text-slate-100">{totalRunningPods}</strong>
                  </span>
                  <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-slate-400">
                    CPU <strong className="text-slate-100">{avgCpu.toFixed(1)}%</strong>
                  </span>
                  <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-slate-400">
                    RAM <strong className="text-slate-100">{Math.round(totalRamMiB)}M</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBottomCollapsed((prev) => !prev)}
                    className="ml-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-100"
                  >
                    {bottomCollapsed ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {!bottomCollapsed && (
                <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                  {bottomTab === "MATRIX" ? (
                    <>
                      {/* 1. WHOLE-SERVER ADMIN POV: 4-Card Cluster Host Overview */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Server Cluster Overview (Admin POV)
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            Host: mavis-prod-cluster-01 · {activeEdges.length} Mesh Links
                          </span>
                        </div>
                        <div
                          style={{
                            gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))",
                          }}
                          className="grid gap-2"
                        >
                          {/* Admin Card A: Cluster Availability & SLA */}
                          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-medium uppercase text-slate-400">
                                Cluster Health & SLA
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold ${
                                  downServicesCount > 0
                                    ? "bg-rose-500/15 text-rose-300"
                                    : bottleneckCount > 0
                                      ? "bg-amber-500/15 text-amber-300"
                                      : "bg-slate-800 text-emerald-400"
                                }`}
                              >
                                {downServicesCount > 0
                                  ? `${downServicesCount} DOWN (503)`
                                  : bottleneckCount > 0
                                    ? `${bottleneckCount} BOTTLENECK`
                                    : "● HEALTHY"}
                              </span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between font-mono">
                              <span className="text-sm font-bold text-slate-100">
                                {clusterSla}% SLA
                              </span>
                              <span className="text-[10.5px] text-slate-400">
                                {healthyServicesCount}/{deploymentRows.length} APIs · {totalRunningPods} Pods
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  downServicesCount > 0 ? "bg-rose-500" : "bg-sky-400/80"
                                }`}
                                style={{
                                  width: `${Math.round(
                                    (healthyServicesCount / Math.max(1, deploymentRows.length)) * 100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Admin Card B: Whole-Server CPU & vCPU Allocation */}
                          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-medium uppercase text-slate-400">
                                Server CPU & vCPU Pool
                              </span>
                              <span className="font-mono text-slate-400">
                                {totalVcpuAllocated.toFixed(1)} / {maxServerVcpu} vCPU
                              </span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between font-mono">
                              <span className="text-sm font-bold text-slate-100">
                                {avgCpu.toFixed(1)}% Avg Load
                              </span>
                              <span className="truncate text-[10px] text-slate-500">
                                Peak: {peakCpuRow?.serviceName ?? "n/a"} (
                                {peakCpuRow ? `${peakCpuRow.perPodCpu.toFixed(0)}%` : "0%"})
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  avgCpu > 75 ? "bg-amber-400" : "bg-sky-400/80"
                                }`}
                                style={{ width: `${Math.min(100, Math.round(avgCpu))}%` }}
                              />
                            </div>
                          </div>

                          {/* Admin Card C: Physical Host Memory Capacity */}
                          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-medium uppercase text-slate-400">
                                Host RAM Capacity
                              </span>
                              <span className="font-mono text-slate-400">
                                {Math.round((totalRamMiB / maxServerRamMiB) * 100)}% Used
                              </span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between font-mono">
                              <span className="text-sm font-bold text-slate-100">
                                {Math.round(totalRamMiB)} / {maxServerRamMiB} MiB
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Free: {Math.max(0, maxServerRamMiB - Math.round(totalRamMiB))}M
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  totalRamMiB > 3400 ? "bg-rose-400" : "bg-sky-400/80"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.round((totalRamMiB / maxServerRamMiB) * 100),
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Admin Card D: Global Traffic, E2E p95 Latency & 5xx Error Rate */}
                          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-medium uppercase text-slate-400">
                                Global Traffic & E2E p95
                              </span>
                              <span
                                className={`font-mono font-semibold ${
                                  clusterErrorRate > 1 ? "text-rose-400" : "text-slate-400"
                                }`}
                              >
                                5xx: {clusterErrorRate}%
                              </span>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between font-mono">
                              <span className="text-sm font-bold text-slate-100">
                                {clusterRps.toLocaleString()} req/s
                              </span>
                              <span className="text-[10.5px] text-slate-400">
                                E2E p95: <strong className="text-slate-200">{e2eP95}ms</strong>
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  clusterErrorRate > 1 ? "bg-rose-500" : "bg-sky-400/80"
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.round((clusterRps / 6000) * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 2. PER-SERVICE / API TELEMETRY BREAKDOWN */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Per-Service / API Telemetry ({deploymentRows.length})
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            Click any node card to inspect or scale inline (− / +)
                          </span>
                        </div>
                        <div
                          style={{
                            gridTemplateColumns: "repeat(auto-fill, minmax(235px, 1fr))",
                          }}
                          className="grid gap-2"
                        >
                      {deploymentRows.map((row) => {
                        const isSelected = row.serviceName === selectedService;
                        const isDown = row.replicasNow === 0;
                        const ramPct = Math.min(100, Math.round((row.perPodRam / 512) * 100));
                        return (
                          <div
                            key={row.serviceName}
                            onClick={() => setSelectedService(row.serviceName)}
                            className={`group flex cursor-pointer flex-col justify-between rounded-xl border p-2.5 transition ${
                              isDown
                                ? "border-rose-500/50 bg-rose-950/15"
                                : isSelected
                                  ? "border-sky-400/70 bg-slate-900 ring-1 ring-sky-400/20"
                                  : "border-slate-800/90 bg-slate-900/60 hover:border-slate-700"
                            }`}
                          >
                            {/* Row 1: Functional Icon + Service Name + Layer/Type + Quick Scale & Replica Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 ${
                                    isDown
                                      ? "text-rose-400"
                                      : row.type === "API_GATEWAY"
                                        ? "text-sky-400/90"
                                        : row.type === "DATABASE"
                                          ? "text-emerald-400/90"
                                          : "text-slate-300"
                                  }`}
                                >
                                  {renderComponentIcon(row.serviceName, "size-3.5")}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-xs font-semibold text-slate-100">
                                    {row.serviceName}
                                  </p>
                                  <p className="truncate font-mono text-[9.5px] uppercase text-slate-500">
                                    {row.layer} · {row.type.replace("_CONTAINER", "")}
                                  </p>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  title="Decrease replicas"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    applySandboxAction({
                                      action: row.replicasNow <= 1 ? "STOP" : "SCALE",
                                      service: row.serviceName,
                                      replicas: Math.max(0, row.replicasNow - 1),
                                    });
                                  }}
                                  className="flex size-5 items-center justify-center rounded border border-slate-800 bg-slate-950 font-mono text-[11px] text-slate-400 hover:border-slate-600 hover:text-slate-100"
                                >
                                  −
                                </button>
                                <span
                                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                    isDown
                                      ? "bg-rose-500/20 text-rose-300"
                                      : "border border-slate-700/80 bg-slate-800 text-slate-200"
                                  }`}
                                >
                                  {isDown
                                    ? "0 DOWN"
                                    : row.replicasBefore !== row.replicasNow
                                      ? `${row.replicasBefore}→×${row.replicasNow}`
                                      : `×${row.replicasNow}`}
                                </span>
                                <button
                                  type="button"
                                  title="Increase replicas"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    applySandboxAction({
                                      action: "SCALE",
                                      service: row.serviceName,
                                      replicas: Math.min(8, (row.replicasNow <= 0 ? 0 : row.replicasNow) + 1),
                                    });
                                  }}
                                  className="flex size-5 items-center justify-center rounded border border-slate-800 bg-slate-950 font-mono text-[11px] text-slate-400 hover:border-slate-600 hover:text-slate-100"
                                >
                                  +
                                </button>
                                {customServices.length > 2 && (
                                  <button
                                    type="button"
                                    aria-label={`Remove ${row.serviceName}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeCustomBlock(row.serviceName);
                                    }}
                                    className="ml-0.5 text-slate-500 opacity-60 transition hover:text-rose-400 group-hover:opacity-100"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Dual Metric Progress Bars (Unified Monochrome Numbers & Steel-Sky Bars) */}
                            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                  <span className="text-slate-500">CPU/pod</span>
                                  <span className="font-semibold text-slate-200">
                                    {isDown ? "0%" : `${row.perPodCpu.toFixed(1)}%`}
                                  </span>
                                </div>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isDown
                                        ? "bg-rose-500"
                                        : row.perPodCpu > 75
                                          ? "bg-amber-400"
                                          : "bg-sky-400/80"
                                    }`}
                                    style={{
                                      width: `${isDown ? 100 : Math.min(100, row.perPodCpu)}%`,
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                  <span className="text-slate-500">RAM</span>
                                  <span className="font-semibold text-slate-200">
                                    {isDown
                                      ? "0 MiB"
                                      : `${Math.round(row.perPodRam)}M (${Math.round(row.totalRam)}M)`}
                                  </span>
                                </div>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isDown ? "bg-rose-500/50" : "bg-sky-400/80"
                                    }`}
                                    style={{ width: `${isDown ? 0 : ramPct}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Row 3: Latency, Topology Links & Scaling/Fault Diagnosis (Zero Emojis) */}
                            <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1.5 font-mono text-[10px]">
                              <div className="flex items-center gap-2 text-slate-400">
                                <span
                                  className={
                                    isDown
                                      ? "font-semibold text-rose-400"
                                      : "text-slate-300"
                                  }
                                >
                                  p95: {row.p95Now}ms
                                </span>
                                <span className="text-slate-600">·</span>
                                <span>
                                  {row.inboundCount} in / {row.outboundCount} out
                                </span>
                              </div>
                              <span
                                className={`truncate font-medium ${
                                  isDown
                                    ? "text-rose-400"
                                    : row.bottleneckTarget
                                      ? "text-amber-300"
                                      : "text-slate-400"
                                }`}
                              >
                                {isDown
                                  ? "503 Circuit Open"
                                  : row.bottleneckTarget
                                    ? `Bottleneck → ${row.bottleneckTarget}`
                                    : row.replicasNow > 1
                                      ? `Balanced (${Math.round(100 / row.replicasNow)}%/pod)`
                                      : "● Baseline (100%/pod)"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                    </>
                  ) : localSnapshots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No snapshots captured yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {localSnapshots.map((snap, i) => (
                        <div
                          key={snap.id}
                          className="rounded-xl border bg-background/70 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <strong className="text-amber-300">Snapshot #{i + 1}</strong>
                            <span className="text-muted-foreground">
                              {snap.totalInstances} pods · {snap.totalRamMiB} MiB
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            {snap.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT RESIZE SPLITTER */}
          <div
            role="separator"
            aria-orientation="vertical"
            title="Kéo để thay đổi độ rộng cột giải thích bên phải (Double-click để thu gọn/mở rộng)"
            onPointerDown={(e) => startResize("right", e)}
            onDoubleClick={() => setRightCollapsed((prev) => !prev)}
            className="group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-slate-800 bg-slate-950 transition hover:bg-slate-800"
          >
            <div className="h-8 w-0.5 rounded-full bg-slate-700 group-hover:bg-slate-400" />
          </div>

          {/* 3. RIGHT INSPECTOR DOCK: Full-Height Interactive Node Control Center */}
          {!rightCollapsed && (
            <aside
              style={{ width: rightWidth }}
              className="flex shrink-0 flex-col justify-between overflow-y-auto bg-[#0b101b] p-2.5"
            >
              {selectedRow && (
                <div className="space-y-2.5">
                  {/* Card 1: Selected Node Identity + Replica & Lifecycle Controls */}
                  <div
                    className={`space-y-2 rounded-xl border p-2.5 ${
                      selectedRow.replicasNow === 0
                        ? "border-rose-500/50 bg-rose-950/20"
                        : "border-slate-800/90 bg-slate-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-slate-400">
                        {selectedRow.type}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold ${
                          selectedRow.replicasNow === 0
                            ? "bg-rose-500/20 text-rose-300"
                            : "border border-slate-700/80 bg-slate-800 text-slate-200"
                        }`}
                      >
                        {selectedRow.replicasNow === 0
                          ? "CRASHED (503)"
                          : `● ${selectedRow.replicasNow} POD(S)`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 ${
                          selectedRow.replicasNow === 0
                            ? "text-rose-400"
                            : selectedRow.type === "API_GATEWAY"
                              ? "text-sky-400/90"
                              : selectedRow.type === "DATABASE"
                                ? "text-emerald-400/90"
                                : "text-slate-300"
                        }`}
                      >
                        {renderComponentIcon(selectedRow.serviceName, "size-4")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-mono text-sm font-semibold text-slate-100">
                          {selectedRow.serviceName}
                        </h2>
                        <p className="font-mono text-[10.5px] text-slate-400">
                          CPU <strong className="text-slate-100">{selectedRow.perPodCpu.toFixed(1)}%</strong> · RAM{" "}
                          <strong className="text-slate-100">{Math.round(selectedRow.totalRam)}M</strong> · p95{" "}
                          <strong className="text-slate-100">{selectedRow.p95Now}ms</strong>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1 pt-0.5">
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
                          className={`h-7 rounded border font-mono text-xs font-semibold transition ${
                            selectedRow.replicasNow === preset
                              ? "border-slate-200 bg-slate-100 text-slate-950 shadow-xs"
                              : "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-600 hover:text-white"
                          }`}
                        >
                          ×{preset}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        disabled={selectedRow.replicasNow === 0}
                        onClick={() =>
                          applySandboxAction({
                            action: "STOP",
                            service: selectedRow.serviceName,
                          })
                        }
                        className="h-6 rounded border border-rose-500/40 bg-rose-500/15 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-40"
                      >
                        Stop
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
                        className="h-6 rounded border border-slate-700 bg-slate-800 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
                      >
                        Start
                      </button>
                      <button
                        type="button"
                        onClick={() => addCustomBlock(selectedRow.serviceName)}
                        className="h-6 rounded border border-slate-700 bg-slate-800 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
                      >
                        + Clone
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Hardware Spec & Stress Simulation (Instance Tier, Traffic Spike, Latency Fault) */}
                  <div className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5 text-[11px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Hardware & Stress Simulation
                    </p>

                    {/* Instance Tier */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Instance Size (vCPU / RAM)</span>
                        <span className="font-mono text-slate-200">
                          {selectedRow.cfg.instanceTier === "S"
                            ? "0.5 vCPU · 256M"
                            : selectedRow.cfg.instanceTier === "L"
                              ? "2 vCPU · 1024M"
                              : "1 vCPU · 512M"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {(
                          [
                            ["S", "Small"],
                            ["M", "Medium"],
                            ["L", "Large"],
                          ] as const
                        ).map(([tierKey, tierLabel]) => (
                          <button
                            key={tierKey}
                            type="button"
                            onClick={() =>
                              updateNodeConfig(selectedRow.serviceName, { instanceTier: tierKey })
                            }
                            className={`h-6 rounded border font-mono text-[10px] font-semibold transition ${
                              selectedRow.cfg.instanceTier === tierKey
                                ? "border-slate-200 bg-slate-100 text-slate-950"
                                : "border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                            }`}
                          >
                            {tierLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Traffic Multiplier */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Traffic Load Spike</span>
                        <span className="font-mono text-slate-200">
                          {selectedRow.cfg.trafficMult}× ({selectedRow.replicasNow * selectedRow.cfg.trafficMult * 240} req/s)
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {([1, 2, 4, 8] as const).map((mult) => (
                          <button
                            key={mult}
                            type="button"
                            onClick={() =>
                              updateNodeConfig(selectedRow.serviceName, { trafficMult: mult })
                            }
                            className={`h-6 rounded border font-mono text-[10px] font-semibold transition ${
                              selectedRow.cfg.trafficMult === mult
                                ? "border-slate-200 bg-slate-100 text-slate-950"
                                : "border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                            }`}
                          >
                            {mult}×
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Injected Network Latency */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Network / Query Lag</span>
                        <span className="font-mono text-slate-200">
                          +{selectedRow.cfg.injectedLatencyMs}ms
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {([0, 40, 180, 600] as const).map((lag) => (
                          <button
                            key={lag}
                            type="button"
                            onClick={() =>
                              updateNodeConfig(selectedRow.serviceName, { injectedLatencyMs: lag })
                            }
                            className={`h-6 rounded border font-mono text-[10px] font-semibold transition ${
                              selectedRow.cfg.injectedLatencyMs === lag
                                ? "border-slate-200 bg-slate-100 text-slate-950"
                                : "border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                            }`}
                          >
                            +{lag}ms
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Resilience & Architecture Policies (4 Interactive Toggles, Zero Emojis) */}
                  <div className="space-y-1.5 rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5 text-[11px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Resilience Policies
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["circuitBreaker", "Circuit Breaker"],
                          ["autoScaleHpa", "Auto-Scale HPA"],
                          ["readCache", "L1 Read Cache"],
                          ["rateLimiter", "Rate Limiter"],
                        ] as const
                      ).map(([field, label]) => {
                        const enabled = selectedRow.cfg[field];
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={() =>
                              updateNodeConfig(selectedRow.serviceName, { [field]: !enabled })
                            }
                            className={`flex items-center justify-between rounded border px-2 py-1 text-left text-[10px] font-medium transition ${
                              enabled
                                ? "border-slate-600 bg-slate-800 text-slate-100"
                                : "border-slate-800 bg-slate-950/70 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            <span
                              className={`ml-1 size-1.5 shrink-0 rounded-full ${
                                enabled ? "bg-emerald-400" : "bg-slate-600"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 4: Impact & Interactive Topology Wiring */}
                  <div
                    className={`space-y-2 rounded-xl border p-2.5 text-[11px] ${
                      selectedRow.replicasNow === 0
                        ? "border-rose-500/40 bg-rose-950/20"
                        : "border-slate-800/90 bg-slate-900/60"
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Impact & Live Topology Wiring
                    </p>
                    {selectedRow.replicasNow === 0 ? (
                      <p className="text-rose-300">
                        <ShieldAlert className="mr-1 inline size-3.5" />
                        <strong>503 Circuit Open:</strong> Callers (
                        {selectedRow.inboundCallers.join(", ") || "Gateway"}) failing fast.
                      </p>
                    ) : selectedRow.replicasNow > 1 ? (
                      <div className="space-y-1">
                        <p className="text-slate-200">
                          Scaled <strong>{selectedRow.replicasBefore}</strong> →{" "}
                          <strong>×{selectedRow.replicasNow}</strong> (~
                          {Math.round(100 / selectedRow.replicasNow)}%/pod · p95{" "}
                          <strong>{selectedRow.p95Now}ms</strong>).
                        </p>
                        {selectedRow.bottleneckTarget && (
                          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-300">
                            Bottleneck: <strong>{selectedRow.bottleneckTarget}</strong> (1 pod)
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-400">
                        Single-pod baseline (100% traffic). Scale ×4 or enable Cache/HPA to optimize.
                      </p>
                    )}

                    <div className="space-y-1.5 border-t border-slate-800/80 pt-1.5 font-mono text-[10px]">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-slate-500">In:</span>
                        {selectedRow.inboundCallers.length > 0 ? (
                          selectedRow.inboundCallers.map((caller) => (
                            <button
                              key={caller}
                              type="button"
                              onClick={() => setSelectedService(caller)}
                              className="rounded border border-slate-700/80 bg-slate-800 px-1.5 py-0.5 text-slate-200 hover:border-slate-500"
                            >
                              {caller}
                            </button>
                          ))
                        ) : (
                          <span className="text-slate-400">Ingress</span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-slate-500">Out:</span>
                          {selectedRow.outboundTargets.length > 0 ? (
                            selectedRow.outboundTargets.map((target) => (
                              <span
                                key={target}
                                className="inline-flex items-center gap-1 rounded border border-slate-700/80 bg-slate-800 px-1.5 py-0.5 text-slate-200"
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedService(target)}
                                  className="hover:underline"
                                >
                                  {target}
                                </button>
                                <button
                                  type="button"
                                  title={`Disconnect ${selectedRow.serviceName} → ${target}`}
                                  onClick={() =>
                                    toggleOutboundEdge(selectedRow.serviceName, target)
                                  }
                                  className="text-slate-400 hover:text-rose-400"
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">Leaf / Store</span>
                          )}
                        </div>
                        <select
                          aria-label="Connect outbound service"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              toggleOutboundEdge(selectedRow.serviceName, e.target.value);
                            }
                          }}
                          className="h-6 w-full rounded border border-slate-800 bg-slate-950/90 px-1.5 font-sans text-[10px] text-slate-300"
                        >
                          <option value="">+ Connect outbound link to...</option>
                          {customServices
                            .filter(
                              (s) =>
                                s !== selectedRow.serviceName &&
                                !selectedRow.outboundTargets.includes(s),
                            )
                            .map((s) => (
                              <option key={s} value={s} className="bg-slate-950 text-slate-100">
                                → {s}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Live Container Log Tail & Snapshot Capture */}
                  <div className="space-y-1.5 rounded-xl border border-slate-800/90 bg-slate-900/60 p-2">
                    <div className="rounded border border-slate-800 bg-slate-950 p-1.5 font-mono text-[9.5px] leading-relaxed text-slate-300">
                      <p className="truncate text-slate-400">
                        $ docker logs --tail 2 {selectedRow.serviceName}
                      </p>
                      <p className="truncate text-slate-300">
                        {selectedRow.replicasNow === 0
                          ? `[ERR] 503 CircuitBreaker OPEN — 0 pods running`
                          : `[OK] ${selectedRow.replicasNow} pod(s) · Tier=${selectedRow.cfg.instanceTier} · Load=${selectedRow.cfg.trafficMult}x`}
                      </p>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Snapshot ({localSnapshots.length})
                    </p>
                    <div className="flex gap-1">
                      <Input
                        value={snapshotNote}
                        onChange={(e) => setSnapshotNote(e.target.value)}
                        placeholder="Note..."
                        className="h-7 border-slate-800 bg-slate-950/90 text-[11px]"
                      />
                      <button
                        type="button"
                        disabled={capturing}
                        onClick={() => void captureLocalSnapshot()}
                        className="flex h-7 shrink-0 items-center gap-1 rounded bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-950 transition hover:bg-white disabled:opacity-50"
                      >
                        <Camera className="size-3" />
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

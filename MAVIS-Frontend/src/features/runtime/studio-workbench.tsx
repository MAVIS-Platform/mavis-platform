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
  // EDGE & SECURITY (4)
  {
    key: "cdn-edge",
    label: "CDN Edge",
    spec: "5,000 req/s · 4ms",
    category: "EDGE",
    layer: "edge",
    elementType: "API_GATEWAY",
    baseCpu: 9.5,
    baseRam: 128,
    cardClass: "border-cyan-500/35 bg-cyan-500/10 hover:border-cyan-400 hover:bg-cyan-500/20",
    iconClass: "bg-cyan-500/25 text-cyan-300",
    titleClass: "text-cyan-200",
    specClass: "text-cyan-300/70",
  },
  {
    key: "waf-shield",
    label: "WAF Firewall",
    spec: "3,000 req/s · DDoS",
    category: "EDGE",
    layer: "edge",
    elementType: "API_GATEWAY",
    baseCpu: 14.0,
    baseRam: 150,
    cardClass: "border-rose-500/35 bg-rose-500/10 hover:border-rose-400 hover:bg-rose-500/20",
    iconClass: "bg-rose-500/25 text-rose-300",
    titleClass: "text-rose-200",
    specClass: "text-rose-300/70",
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
    cardClass: "border-amber-500/35 bg-amber-500/10 hover:border-amber-400 hover:bg-amber-500/20",
    iconClass: "bg-amber-500/25 text-amber-300",
    titleClass: "text-amber-200",
    specClass: "text-amber-300/70",
  },
  {
    key: "edge-gateway",
    label: "API Gateway",
    spec: "1,500 req/s · OAuth",
    category: "EDGE",
    layer: "edge",
    elementType: "API_GATEWAY",
    baseCpu: 22.0,
    baseRam: 180,
    cardClass: "border-orange-500/35 bg-orange-500/10 hover:border-orange-400 hover:bg-orange-500/20",
    iconClass: "bg-orange-500/25 text-orange-300",
    titleClass: "text-orange-200",
    specClass: "text-orange-300/70",
  },

  // COMPUTE & MICROSERVICES (4)
  {
    key: "app-service",
    label: "App Server",
    spec: "500 req/s · 220 MiB",
    category: "COMPUTE",
    layer: "application",
    elementType: "SERVICE_CONTAINER",
    baseCpu: 34.0,
    baseRam: 220,
    cardClass: "border-indigo-500/35 bg-indigo-500/10 hover:border-indigo-400 hover:bg-indigo-500/20",
    iconClass: "bg-indigo-500/25 text-indigo-300",
    titleClass: "text-indigo-200",
    specClass: "text-indigo-300/70",
  },
  {
    key: "async-worker",
    label: "Worker Node",
    spec: "300 jobs/s · Consumer",
    category: "COMPUTE",
    layer: "domain",
    elementType: "SERVICE_CONTAINER",
    baseCpu: 42.0,
    baseRam: 280,
    cardClass: "border-blue-500/35 bg-blue-500/10 hover:border-blue-400 hover:bg-blue-500/20",
    iconClass: "bg-blue-500/25 text-blue-300",
    titleClass: "text-blue-200",
    specClass: "text-blue-300/70",
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
    cardClass: "border-teal-500/35 bg-teal-500/10 hover:border-teal-400 hover:bg-teal-500/20",
    iconClass: "bg-teal-500/25 text-teal-300",
    titleClass: "text-teal-200",
    specClass: "text-teal-300/70",
  },
  {
    key: "lambda-fn",
    label: "Serverless Fn",
    spec: "1,200 req/s · Auto",
    category: "COMPUTE",
    layer: "application",
    elementType: "SERVICE_CONTAINER",
    baseCpu: 14.0,
    baseRam: 128,
    cardClass: "border-sky-500/35 bg-sky-500/10 hover:border-sky-400 hover:bg-sky-500/20",
    iconClass: "bg-sky-500/25 text-sky-300",
    titleClass: "text-sky-200",
    specClass: "text-sky-300/70",
  },

  // DATA & STORAGE (5)
  {
    key: "postgres-db",
    label: "PostgreSQL DB",
    spec: "400 qps · ACID SQL",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 32.0,
    baseRam: 320,
    cardClass: "border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-400 hover:bg-emerald-500/20",
    iconClass: "bg-emerald-500/25 text-emerald-300",
    titleClass: "text-emerald-200",
    specClass: "text-emerald-300/70",
  },
  {
    key: "redis-cache",
    label: "Redis Cache",
    spec: "10k ops/s · 2ms KV",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 15.0,
    baseRam: 190,
    cardClass: "border-red-500/35 bg-red-500/10 hover:border-red-400 hover:bg-red-500/20",
    iconClass: "bg-red-500/25 text-red-300",
    titleClass: "text-red-200",
    specClass: "text-red-300/70",
  },
  {
    key: "mongo-nosql",
    label: "MongoDB Doc",
    spec: "1,800 ops/s · NoSQL",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 28.0,
    baseRam: 290,
    cardClass: "border-green-500/35 bg-green-500/10 hover:border-green-400 hover:bg-green-500/20",
    iconClass: "bg-green-500/25 text-green-300",
    titleClass: "text-green-200",
    specClass: "text-green-300/70",
  },
  {
    key: "s3-storage",
    label: "S3 Object Store",
    spec: "2,000 req/s · Blob",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 11.0,
    baseRam: 140,
    cardClass: "border-sky-500/35 bg-sky-500/10 hover:border-sky-400 hover:bg-sky-500/20",
    iconClass: "bg-sky-500/25 text-sky-300",
    titleClass: "text-sky-200",
    specClass: "text-sky-300/70",
  },
  {
    key: "elastic-search",
    label: "ElasticSearch",
    spec: "700 qps · Full-Text",
    category: "DATA",
    layer: "data",
    elementType: "DATABASE",
    baseCpu: 39.0,
    baseRam: 380,
    cardClass: "border-yellow-500/35 bg-yellow-500/10 hover:border-yellow-400 hover:bg-yellow-500/20",
    iconClass: "bg-yellow-500/25 text-yellow-300",
    titleClass: "text-yellow-200",
    specClass: "text-yellow-300/70",
  },

  // MESSAGING & OBSERVABILITY (3)
  {
    key: "kafka-broker",
    label: "Kafka Stream",
    spec: "5,000 msg/s · Topic",
    category: "INFRA",
    layer: "infrastructure",
    elementType: "MESSAGE_BROKER",
    baseCpu: 24.0,
    baseRam: 310,
    cardClass: "border-purple-500/35 bg-purple-500/10 hover:border-purple-400 hover:bg-purple-500/20",
    iconClass: "bg-purple-500/25 text-purple-300",
    titleClass: "text-purple-200",
    specClass: "text-purple-300/70",
  },
  {
    key: "rabbitmq-bus",
    label: "RabbitMQ Bus",
    spec: "1,500 msg/s · AMQP",
    category: "INFRA",
    layer: "infrastructure",
    elementType: "MESSAGE_BROKER",
    baseCpu: 19.0,
    baseRam: 210,
    cardClass: "border-fuchsia-500/35 bg-fuchsia-500/10 hover:border-fuchsia-400 hover:bg-fuchsia-500/20",
    iconClass: "bg-fuchsia-500/25 text-fuchsia-300",
    titleClass: "text-fuchsia-200",
    specClass: "text-fuchsia-300/70",
  },
  {
    key: "otel-collector",
    label: "Prometheus / OTel",
    spec: "2,000 spans/s · APM",
    category: "INFRA",
    layer: "infrastructure",
    elementType: "MESSAGE_BROKER",
    baseCpu: 16.0,
    baseRam: 190,
    cardClass: "border-pink-500/35 bg-pink-500/10 hover:border-pink-400 hover:bg-pink-500/20",
    iconClass: "bg-pink-500/25 text-pink-300",
    titleClass: "text-pink-200",
    specClass: "text-pink-300/70",
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
  const [leftWidth, setLeftWidth] = useState(236);
  const [rightWidth, setRightWidth] = useState(256);
  const [bottomHeight, setBottomHeight] = useState(196);
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
        const next = Math.max(170, Math.min(460, initialLeft + (moveEvent.clientX - startX)));
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

  const activeEdges = useMemo(
    () => [
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
      const catalogMatch = STUDIO_COMPONENT_CATALOG.find((item) => svc.startsWith(item.key));
      const baseCpuVal = template.baseCpu[svc] ?? catalogMatch?.baseCpu ?? 26.5;
      const baseRamVal = template.baseRam[svc] ?? catalogMatch?.baseRam ?? 220;
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
      {/* STANDALONE STUDIO TOP HEADER BAR (Ultra-Slim, Clean IDE Header) */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b bg-card px-2.5">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Link href="/administration/health">
              <ArrowLeft className="size-3" />
              {t("Exit Studio")}
            </Link>
          </Button>
          <div className="flex items-center gap-1.5 border-l pl-2">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-emerald-400">
              MAVIS
            </span>
            <span className="text-xs font-bold tracking-tight text-emerald-400">Studio</span>
          </div>
          {mode === "SANDBOX" && (
            <select
              aria-label={t("Architecture Preset Template")}
              value={templateId}
              onChange={(e) => switchTemplate(e.target.value)}
              className="h-7 rounded-md border border-indigo-500/30 bg-indigo-950/30 px-2 text-xs font-medium text-indigo-200"
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
        <div className="hidden items-center gap-3 rounded-full border border-border/80 bg-background/90 px-3.5 py-0.5 text-[11px] shadow-xs lg:flex">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase text-sky-400">⚡ Traffic</span>
            <span className="font-mono font-bold text-foreground">
              {(totalRunningPods * 240).toLocaleString()} req/s
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase text-emerald-400">RAM</span>
            <span className="font-mono font-bold text-foreground">
              {Math.round(totalRamMiB)} MiB
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all"
                style={{ width: `${Math.min(100, Math.round((totalRamMiB / 4096) * 100))}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">/ 4096</span>
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
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                    : "border-border text-muted-foreground hover:text-foreground"
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
                    ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                ◨ Inspector
              </button>
            </div>
          )}
          <div className="inline-flex rounded-full border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setMode("SANDBOX")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                mode === "SANDBOX"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ▶ Sandbox
            </button>
            <button
              type="button"
              onClick={() => setMode("LIVE")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                mode === "LIVE"
                  ? "bg-sky-500 text-slate-950 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
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
          {/* 1. LEFT VERTICAL TOOLBOX: Clean Component Spawner + Compact Action Grid + Nodes */}
          {!leftCollapsed && (
            <aside
              style={{ width: leftWidth }}
              className="flex shrink-0 flex-col justify-between overflow-y-auto bg-card/90 p-2.5"
            >
              <div className="space-y-3">
                {/* Section A: 16-Component System Design Catalog (Filterable + Searchable + Drag/Click) */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Components ({STUDIO_COMPONENT_CATALOG.length})
                  </p>

                  {/* Search Input */}
                  <Input
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    placeholder="🔍 Search 16 components..."
                    className="h-6 text-[11px]"
                  />

                  {/* Category Filter Pills (200Lab style: All | Edge | Compute | Data | Infra) */}
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
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                          componentCategory === cat
                            ? "bg-emerald-500 text-slate-950"
                            : "border border-border/70 bg-background/60 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Scrollable Component Cards */}
                  <div className="grid max-h-[360px] grid-cols-1 gap-1 overflow-y-auto pr-0.5">
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
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/x-mavis-studio-spawn", item.key);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addCustomBlock(item.key)}
                        className={`flex cursor-grab items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] transition active:cursor-grabbing ${item.cardClass}`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 shadow-xs ${item.iconClass}`}
                          >
                            {renderComponentIcon(item.key, "size-4")}
                          </span>
                          <div className="min-w-0 leading-tight">
                            <p className={`truncate font-semibold ${item.titleClass}`}>
                              {item.label}
                            </p>
                            <p className={`truncate font-mono text-[9px] ${item.specClass}`}>
                              {item.spec}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] opacity-55">⋮⋮</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1 pt-0.5">
                    <Input
                      value={newNodeName}
                      onChange={(e) => setNewNodeName(e.target.value)}
                      placeholder="Custom node name..."
                      className="h-6 text-[11px]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2"
                      onClick={() => addCustomBlock()}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* Section B: Compact Drag & Drop Actions (2-Column Pill Grid) */}
                <div className="space-y-1.5 border-t pt-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                    Actions
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
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
                        title={`${item.label} (${item.sub})`}
                        className={`flex cursor-grab items-center justify-between rounded-md border px-2 py-1.5 text-[11px] transition active:cursor-grabbing ${item.cardClass}`}
                      >
                        <span
                          className={`rounded px-1 py-0.5 font-mono text-[9px] font-extrabold ${item.badgeClass}`}
                        >
                          {item.badge}
                        </span>
                        <span className="text-[9px] text-muted-foreground">⋮⋮</span>
                      </div>
                    ))}
                    <button
                      type="button"
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
                      title={t("Chaos Monkey (Kill Random)")}
                      className="flex items-center justify-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/20 px-2 py-1.5 text-[10px] font-bold text-rose-200 transition hover:bg-rose-500/30"
                    >
                      <Zap className="size-3 text-rose-300" />
                      Chaos
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTemplate(templateId)}
                      title={t("Reset cluster")}
                      className="flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/25 col-span-2"
                    >
                      <RotateCcw className="size-3" />
                      Reset Cluster
                    </button>
                  </div>
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
            className="group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-border/60 bg-muted/20 transition hover:bg-primary/30 active:bg-primary/50"
          >
            <div className="h-8 w-0.5 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
          </div>

          {/* RIGHT SIDE: TOP (FULL-BLEED CENTER CANVAS + COMPACT INSPECTOR) + BOTTOM DRAWER */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* TOP ROW: CENTER VISUAL WORKSPACE + RIGHT EXPLANATION INSPECTOR */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
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

              {/* RIGHT RESIZE SPLITTER */}
              <div
                role="separator"
                aria-orientation="vertical"
                title="Kéo để thay đổi độ rộng cột giải thích bên phải (Double-click để thu gọn/mở rộng)"
                onPointerDown={(e) => startResize("right", e)}
                onDoubleClick={() => setRightCollapsed((prev) => !prev)}
                className="group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-border/60 bg-muted/20 transition hover:bg-primary/30 active:bg-primary/50"
              >
                <div className="h-8 w-0.5 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
              </div>

              {/* 3. RIGHT INSPECTOR DOCK: Clean 3-Card Inspector */}
              {!rightCollapsed && (
                <aside
                  style={{ width: rightWidth }}
                  className="flex shrink-0 flex-col justify-between overflow-y-auto bg-card/90 p-2.5"
                >
                  {selectedRow && (
                    <div className="space-y-2.5">
                      {/* Card 1: Selected Node + Inline Replica & Fault Controls */}
                      <div
                        className={`space-y-2 rounded-lg border p-2.5 ${
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
                        <div className="flex items-center justify-between gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                              selectedRow.type === "API_GATEWAY"
                                ? "bg-amber-500/20 text-amber-300"
                                : selectedRow.type === "DATABASE"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : selectedRow.type === "MESSAGE_BROKER"
                                    ? "bg-purple-500/20 text-purple-300"
                                    : "bg-indigo-500/20 text-indigo-300"
                            }`}
                          >
                            {selectedRow.type}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${
                              selectedRow.replicasNow === 0
                                ? "bg-rose-500/25 text-rose-300"
                                : selectedRow.replicasNow > 1
                                  ? "bg-sky-500/25 text-sky-300"
                                  : "bg-emerald-500/25 text-emerald-300"
                            }`}
                          >
                            {selectedRow.replicasNow === 0
                              ? "CRASHED (503)"
                              : `${selectedRow.replicasNow} POD(S)`}
                          </span>
                        </div>

                        <div>
                          <h2 className="truncate font-mono text-sm font-bold text-foreground">
                            {selectedRow.serviceName}
                          </h2>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            CPU <strong className="text-sky-400">{selectedRow.perPodCpu.toFixed(1)}%</strong> · RAM{" "}
                            <strong className="text-emerald-400">{Math.round(selectedRow.totalRam)}M</strong> · p95{" "}
                            <strong className="text-amber-300">{selectedRow.p95Now}ms</strong>
                          </p>
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
                              className={`h-7 rounded border font-mono text-xs font-bold transition ${
                                selectedRow.replicasNow === preset
                                  ? "border-sky-400 bg-sky-500 text-slate-950 shadow-xs"
                                  : "border-border bg-background/80 text-foreground hover:border-sky-400/60"
                              }`}
                            >
                              ×{preset}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-1">
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
                            className="h-6 rounded border border-emerald-500/40 bg-emerald-500/15 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40"
                          >
                            Start
                          </button>
                        </div>
                      </div>

                      {/* Card 2: Unified Impact & Topology Card */}
                      <div
                        className={`space-y-2 rounded-lg border border-l-4 p-2.5 text-[11px] ${
                          selectedRow.replicasNow === 0
                            ? "border-rose-500/40 border-l-rose-500 bg-rose-950/20"
                            : selectedRow.replicasNow > 1
                              ? "border-emerald-500/40 border-l-emerald-400 bg-emerald-950/15"
                              : "border-indigo-500/35 border-l-indigo-400 bg-indigo-950/15"
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          Impact & Topology
                        </p>
                        {selectedRow.replicasNow === 0 ? (
                          <p className="text-rose-300">
                            <ShieldAlert className="mr-1 inline size-3.5" />
                            <strong>503 Circuit Open:</strong> Callers (
                            {selectedRow.inboundCallers.join(", ") || "Gateway"}) failing fast.
                          </p>
                        ) : selectedRow.replicasNow > 1 ? (
                          <div className="space-y-1">
                            <p className="text-foreground">
                              Scaled <strong>{selectedRow.replicasBefore}</strong> →{" "}
                              <strong className="text-sky-300">×{selectedRow.replicasNow}</strong> (~
                              {Math.round(100 / selectedRow.replicasNow)}%/pod · p95{" "}
                              <strong className="text-emerald-300">{selectedRow.p95Now}ms</strong>).
                            </p>
                            {selectedRow.bottleneckTarget && (
                              <p className="rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-1 text-[10px] text-amber-300">
                                ⚠ Bottleneck: <strong>{selectedRow.bottleneckTarget}</strong> (1 pod)
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            Single-pod baseline (100% traffic). Scale ×4 or ×8 to distribute load.
                          </p>
                        )}

                        <div className="space-y-1 border-t border-border/60 pt-1.5 font-mono text-[10px]">
                          <div className="truncate">
                            <span className="text-muted-foreground">In: </span>
                            <span className="text-amber-300">
                              {selectedRow.inboundCallers.length > 0
                                ? selectedRow.inboundCallers.join(", ")
                                : "Ingress"}
                            </span>
                          </div>
                          <div className="truncate">
                            <span className="text-muted-foreground">Out: </span>
                            <span className="text-sky-300">
                              {selectedRow.outboundTargets.length > 0
                                ? selectedRow.outboundTargets.join(", ")
                                : "Leaf / Store"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card 3: Compact 1-Row Snapshot Capture */}
                      <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-950/10 p-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                          Snapshot ({localSnapshots.length})
                        </p>
                        <div className="flex gap-1">
                          <Input
                            value={snapshotNote}
                            onChange={(e) => setSnapshotNote(e.target.value)}
                            placeholder="Note..."
                            className="h-7 text-[11px]"
                          />
                          <button
                            type="button"
                            disabled={capturing}
                            onClick={() => void captureLocalSnapshot()}
                            className="flex h-7 shrink-0 items-center gap-1 rounded bg-emerald-500 px-2.5 text-[11px] font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
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

            {/* BOTTOM RESIZE SPLITTER */}
            <div
              role="separator"
              aria-orientation="horizontal"
              title="Kéo lên/xuống để thay đổi chiều cao thanh Stats (Double-click để thu gọn/mở rộng)"
              onPointerDown={(e) => startResize("bottom", e)}
              onDoubleClick={() => setBottomCollapsed((prev) => !prev)}
              className="group relative flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-border/60 bg-muted/20 transition hover:bg-primary/30 active:bg-primary/50"
            >
              <div className="h-0.5 w-10 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
            </div>

            {/* 4. BOTTOM TELEMETRY & IMPACT DOCK: Full-Width Structured Bento Grid with Complete Stats */}
            <section
              style={{ height: bottomCollapsed ? 36 : bottomHeight }}
              className="flex shrink-0 flex-col bg-card/95"
            >
              <div className="flex h-9 shrink-0 items-center justify-between border-b bg-muted/20 px-3">
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
                        ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "text-muted-foreground hover:text-foreground"
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
                        ? "border border-amber-500/40 bg-amber-500/15 text-amber-300"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Snapshots ({localSnapshots.length})
                  </button>
                </div>

                {/* Cluster-wide KPI Summary Pills */}
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="hidden rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-300 sm:inline-block">
                    ⚡ <strong>{(totalRunningPods * 240).toLocaleString()}</strong> req/s
                  </span>
                  <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-indigo-300">
                    📦 <strong>{totalRunningPods}</strong> pods
                  </span>
                  <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
                    🔥 CPU <strong>{avgCpu.toFixed(1)}%</strong>
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                    💾 RAM <strong>{Math.round(totalRamMiB)}</strong> MiB
                  </span>
                  <button
                    type="button"
                    onClick={() => setBottomCollapsed((prev) => !prev)}
                    className="ml-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {bottomCollapsed ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {!bottomCollapsed && (
                <div className="flex-1 overflow-y-auto p-2.5">
                  {bottomTab === "MATRIX" ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
                                ? "border-rose-500/50 bg-rose-950/20"
                                : isSelected
                                  ? "border-sky-400/80 bg-sky-500/10 shadow-xs"
                                  : "border-border/70 bg-background/65 hover:border-slate-600"
                            }`}
                          >
                            {/* Row 1: Functional Icon + Service Name + Layer/Type + Quick Scale & Replica Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 ${
                                    isDown
                                      ? "bg-rose-500/20 text-rose-400"
                                      : row.replicasNow > 1
                                        ? "bg-sky-500/20 text-sky-300"
                                        : "bg-emerald-500/20 text-emerald-300"
                                  }`}
                                >
                                  {renderComponentIcon(row.serviceName, "size-3.5")}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-xs font-bold text-foreground">
                                    {row.serviceName}
                                  </p>
                                  <p className="truncate font-mono text-[9.5px] uppercase text-muted-foreground">
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
                                  className="flex size-5 items-center justify-center rounded border border-border/70 bg-background/80 font-mono text-[11px] text-muted-foreground hover:border-slate-500 hover:text-foreground"
                                >
                                  −
                                </button>
                                <span
                                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                    isDown
                                      ? "bg-rose-500/25 text-rose-300"
                                      : row.replicasNow > 1
                                        ? "bg-sky-500/25 text-sky-300"
                                        : "bg-emerald-500/20 text-emerald-300"
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
                                  className="flex size-5 items-center justify-center rounded border border-border/70 bg-background/80 font-mono text-[11px] text-muted-foreground hover:border-slate-500 hover:text-foreground"
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
                                    className="ml-0.5 text-muted-foreground opacity-60 transition hover:text-destructive group-hover:opacity-100"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Dual Metric Progress Bars (Per-Pod CPU & Pod/Total RAM) */}
                            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                  <span className="text-muted-foreground">CPU/pod</span>
                                  <span className="font-semibold text-sky-300">
                                    {isDown ? "0%" : `${row.perPodCpu.toFixed(1)}%`}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isDown
                                        ? "bg-rose-500"
                                        : row.perPodCpu > 70
                                          ? "bg-amber-400"
                                          : "bg-sky-400"
                                    }`}
                                    style={{
                                      width: `${isDown ? 100 : Math.min(100, row.perPodCpu)}%`,
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                  <span className="text-muted-foreground">RAM</span>
                                  <span className="font-semibold text-emerald-300">
                                    {isDown
                                      ? "0 MiB"
                                      : `${Math.round(row.perPodRam)}M (${Math.round(row.totalRam)}M)`}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isDown ? "bg-rose-500/50" : "bg-emerald-400"
                                    }`}
                                    style={{ width: `${isDown ? 0 : ramPct}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Row 3: Latency, Topology Links & Scaling/Fault Diagnosis */}
                            <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-1.5 font-mono text-[10px]">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span
                                  className={
                                    isDown
                                      ? "font-semibold text-rose-400"
                                      : "text-foreground/90"
                                  }
                                >
                                  ⏱ p95: {row.p95Now}ms
                                </span>
                                <span>·</span>
                                <span>
                                  ⇄ {row.inboundCount} in / {row.outboundCount} out
                                </span>
                              </div>
                              <span
                                className={`truncate font-semibold ${
                                  isDown
                                    ? "text-rose-400"
                                    : row.bottleneckTarget
                                      ? "text-amber-300"
                                      : row.replicasNow > 1
                                        ? "text-sky-300"
                                        : "text-emerald-400"
                                }`}
                              >
                                {isDown
                                  ? "✕ 503 Circuit Open"
                                  : row.bottleneckTarget
                                    ? `⚠ Bottleneck → ${row.bottleneckTarget}`
                                    : row.replicasNow > 1
                                      ? `✓ Balanced (${Math.round(100 / row.replicasNow)}%/pod)`
                                      : "● Baseline (100%/pod)"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
        </div>
      )}
    </div>
  );
}

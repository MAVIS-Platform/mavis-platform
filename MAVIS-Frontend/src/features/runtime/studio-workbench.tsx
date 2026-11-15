"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  SlidersHorizontal,
  Send,
  Server,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Volume2,
  VolumeX,
  Workflow,
  Zap,
} from "lucide-react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LocaleSwitchButton, useLocale } from "@/lib/i18n/locale-context";
import { AppearanceSelector } from "@/components/appearance-selector";
import type { Response } from "@/lib/api/contracts";
import {
  StudioObservability,
  captureStudioImage,
  serializeStudioGraph,
  type StudioQuickAction,
} from "./studio-observability";
import { startStudioRecording } from "./studio-recording";
import { LiveStudioWorkbench } from "./live-studio-workbench";
import { useStudioSound } from "./studio-sound";
import {
  downloadStudioEvidence,
  loadStudioEvidence,
  storeStudioEvidence,
  deleteStudioEvidence,
  StudioVideo,
  StudioEvidenceReplay,
  type EvidenceFrame,
} from "./studio-evidence";

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
      { from: "order-service", to: "kafka-broker", protocol: "Kafka" },
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
    sub: "Stop service replicas",
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
  imageData: string;
  video?: Blob;
  durationMs?: number;
  frame: EvidenceFrame;
  replay: EvidenceFrame[];
  replicasByService: Record<string, number>;
  nodeNames: Record<string, string>;
  connections: Array<{ from: string; to: string; protocol: string }>;
  totalInstances: number;
  totalRamMiB: number;
};

const CLUSTER_SCENARIOS = [
  { id: "FLASH_SALE", icon: Flame, title: "Flash sale", detail: "Send 4× the current request rate to the gateway." },
  { id: "DB_OUTAGE", icon: Database, title: "Database outage", detail: "Stop all replicas of a database node." },
  { id: "SLOW_DB", icon: Database, title: "Slow database queries", detail: "Add 350 ms of latency to a running database." },
  { id: "RATE_LIMIT", icon: Network, title: "Gateway throttling", detail: "Send at least 1,200 req/s with a ceiling of 600 req/s." },
  { id: "POD_FAILURE", icon: Server, title: "Single pod failure", detail: "Remove one replica from the selected service." },
  { id: "NETWORK_DELAY", icon: Activity, title: "Slow upstream dependency", detail: "Add 700 ms of latency to a running dependency." },
  { id: "CPU_PRESSURE", icon: Cpu, title: "CPU quota reduction", detail: "Halve the selected service's CPU per pod, down to 0.25 vCPU." },
  { id: "SCALE_OUT", icon: Layers, title: "Scale out a service", detail: "Double the selected service's replicas, up to 256." },
] as const;

type NodeSimConfig = {
  instanceTier: "S" | "M" | "L" | "XL" | "CUSTOM";
  vcpuPerPod: number;
  ramPerPodMiB: number;
  targetRps: number;
  trafficMult: number;
  injectedLatencyMs: number;
  rateLimitRps: number;
  circuitBreaker: boolean;
  autoScaleHpa: boolean;
  readCache: boolean;
  rateLimiter: boolean;
};

type NodeProfile = { layer: string; type: string; baseCpu: number; baseRam: number };

type CopiedNode = {
  id: string;
  name: string;
  profile: NodeProfile;
  config: NodeSimConfig;
  replicas: number;
  baselineReplicas: number;
};

const DEFAULT_NODE_CONFIG: NodeSimConfig = {
  instanceTier: "M",
  vcpuPerPod: 1,
  ramPerPodMiB: 512,
  targetRps: 240,
  trafficMult: 1,
  injectedLatencyMs: 0,
  rateLimitRps: 1200,
  circuitBreaker: false,
  autoScaleHpa: false,
  readCache: false,
  rateLimiter: false,
};

function sandboxPodCapacity(config: NodeSimConfig) {
  return Math.max(80, Math.round(config.vcpuPerPod * (config.readCache ? 650 : 400)));
}

function sandboxProcessingProfile(service: string, type: string, baseCpu: number) {
  if (/redis|memcache|cache/.test(service)) return { floor: 0.7, work: 2.4 };
  if (/s3|bucket|blob|storage/.test(service)) return { floor: 8, work: 22 };
  if (/fraud|risk/.test(service)) return { floor: 8, work: 36 };
  if (type === "API_GATEWAY") return { floor: 2, work: 9 };
  if (type === "DATABASE") return { floor: 4, work: 21 };
  if (type === "MESSAGE_BROKER") return { floor: 2, work: 8 };
  return { floor: 5, work: 16 + baseCpu * 0.45 };
}

const SANDBOX_TRANSPORT_MS: Readonly<Record<string, number>> = {
  HTTP: 2, HTTPS: 3.5, GRPC: 1.5, JDBC: 2.4, RESP: 0.5,
  KAFKA: 3, AMQP: 2.5, MONGODB: 2, TCP: 1,
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
  const { soundEnabled, toggleSound, volume, changeVolume, playSound } = useStudioSound();
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
  const [clusterScenario, setClusterScenario] = useState<(typeof CLUSTER_SCENARIOS)[number]["id"]>("FLASH_SALE");
  const [scenarioMessage, setScenarioMessage] = useState("");
  const [scenarioApplied, setScenarioApplied] = useState(false);
  const scenario = CLUSTER_SCENARIOS.find(({ id }) => id === clusterScenario) ?? CLUSTER_SCENARIOS[0];
  const ScenarioIcon = scenario.icon;
  const [nodeNames, setNodeNames] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<{ service: string; message: string } | null>(null);
  const [nodeConfigs, setNodeConfigs] = useState<Record<string, NodeSimConfig>>({});
  const [nodeProfiles, setNodeProfiles] = useState<Record<string, NodeProfile>>({});
  const copiedNode = useRef<CopiedNode | null>(null);
  const [clipboardMessage, setClipboardMessage] = useState("");
  const [extraEdges, setExtraEdges] = useState<Array<{ from: string; to: string; protocol: string }>>([]);
  const [removedEdges, setRemovedEdges] = useState<string[]>([]);
  const [componentSearch, setComponentSearch] = useState("");
  const [customBlockOpen, setCustomBlockOpen] = useState(false);
  const [customBlockType, setCustomBlockType] = useState("app-service");
  const [serviceSearch, setServiceSearch] = useState("");
  const [actionsLog, setActionsLog] = useState<StudioData["actions"]>([]);
  const [localSnapshots, setLocalSnapshots] = useState<LocalSnapshot[]>([]);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [capturing, setCapturing] = useState(false);
  const videoRecording = useRef<ReturnType<typeof startStudioRecording> | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedSteps, setRecordedSteps] = useState(0);
  const [snapshotError, setSnapshotError] = useState("");
  const replayCapture = useRef<{
    started: number; frames: EvidenceFrame[]; lastCapture: unknown; lastScenario: string;
  } | null>(null);
  const [liveSessionId, setLiveSessionId] = useState(initialSessionId);
  const [bottomTab, setBottomTab] = useState<"MATRIX" | "STATS" | "SNAPSHOTS">("MATRIX");
  const [leftWidth, setLeftWidth] = useState(286);
  const [rightWidth, setRightWidth] = useState(268);
  const [bottomHeight, setBottomHeight] = useState(242);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const leftGridCols = leftWidth >= 480 ? 4 : leftWidth >= 355 ? 3 : leftWidth >= 230 ? 2 : 1;
  const blockQuery = componentSearch.trim().toLowerCase();
  const blockGroups = ([
    ["EDGE", "Edge & traffic"],
    ["COMPUTE", "Compute & identity"],
    ["DATA", "Data & storage"],
    ["INFRA", "Messaging & observability"],
  ] as const).map(([category, title]) => ({
    category, title,
    items: STUDIO_COMPONENT_CATALOG.filter((item) => item.category === category &&
      [item.label, item.key, item.spec, title].some((text) => text.toLowerCase().includes(blockQuery))),
  })).filter(({ items }) => items.length > 0);

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
    playSound("select");
    setTemplateId(found.id);
    setCustomServices(found.services);
    const initialReps = Object.fromEntries(found.services.map((s) => [s, 1]));
    setReplicasMap(initialReps);
    setBaselineReplicasMap(initialReps);
    setNodeConfigs({});
    setNodeProfiles({});
    setNodeNames({});
    setScenarioMessage("");
    setEditingName(null);
    setNameError(null);
    setExtraEdges([]);
    setRemovedEdges([]);
    setSelectedService(found.services[1] ?? found.services[0] ?? "");
    setActionsLog([]);
  }

  function getNodeConfig(svc: string): NodeSimConfig {
    return nodeConfigs[svc] ?? DEFAULT_NODE_CONFIG;
  }

  function updateNodeConfig(svc: string, patch: Partial<NodeSimConfig>) {
    const next = { ...getNodeConfig(svc), ...patch };
    if (patch.targetRps !== undefined && patch.trafficMult === undefined) {
      next.trafficMult = Math.max(0.1, Number((patch.targetRps / 240).toFixed(2)));
    } else if (patch.trafficMult !== undefined && patch.targetRps === undefined) {
      next.targetRps = Math.round(patch.trafficMult * 240);
    }
    setNodeConfigs((prev) => ({ ...prev, [svc]: next }));
    if (next.autoScaleHpa) {
      const demand = next.rateLimiter ? Math.min(next.targetRps, next.rateLimitRps) : next.targetRps;
      const neededPods = Math.min(256, Math.max(1, Math.ceil(demand / sandboxPodCapacity(next))));
      setReplicasMap((prev) => {
        const current = prev[svc] ?? 1;
        return current > 0 && current < neededPods ? { ...prev, [svc]: neededPods } : prev;
      });
    }
  }

  function connectOutboundEdge(from: string, to: string) {
    if (from === to || !customServices.includes(from) || !customServices.includes(to)) return;
    if (activeEdges.some((edge) => edge.from === from && edge.to === to)) return;
    playSound("connect");
    setRemovedEdges((prev) => prev.filter((key) => key !== `${from}->${to}`));
    if (template.edges.some((edge) => edge.from === from && edge.to === to)) return;

    const protocol = /postgres|mysql|mariadb|\bsql\b/i.test(to) ? "JDBC"
      : /redis/i.test(to) ? "RESP"
        : /mongo/i.test(to) ? "MongoDB"
          : /kafka/i.test(to) ? "Kafka"
            : /rabbit|amqp/i.test(to) ? "AMQP"
              : /s3|bucket|elastic|opensearch/i.test(to) ? "HTTPS"
                : "HTTP";
    setExtraEdges((prev) => prev.some((edge) => edge.from === from && edge.to === to)
      ? prev : [...prev, { from, to, protocol }]);
  }

  function disconnectOutboundEdge(from: string, to: string) {
    playSound("disconnect");
    if (template.edges.some((edge) => edge.from === from && edge.to === to)) {
      const key = `${from}->${to}`;
      setRemovedEdges((prev) => prev.includes(key) ? prev : [...prev, key]);
    }
    setExtraEdges((prev) => prev.filter((edge) => edge.from !== from || edge.to !== to));
  }


  function applySandboxAction(cmd: StudioQuickAction) {
    const svc = cmd.service;
    const before = replicasMap[svc] ?? 1;
    const after =
      cmd.action === "STOP"
        ? 0
        : cmd.action === "START"
          ? Math.max(1, before || 1)
          : Math.max(1, Math.min(256, cmd.replicas ?? 2));

    if (after !== before && after > 0) playSound("scale");
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

  function nodeLabel(service: string) {
    return nodeNames[service] ?? service;
  }

  function renameNode(service: string, rawName: string) {
    const name = rawName.trim();
    const duplicate = customServices.some((other) =>
      other !== service && nodeLabel(other).toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!name || duplicate) {
      playSound("blocked");
      setNameError({ service, message: t(!name ? "Enter a node name." : "A node already uses this name.") });
      return;
    }
    if (name !== nodeLabel(service)) playSound("select");
    setNodeNames((prev) => ({ ...prev, [service]: name }));
    setEditingName(null);
    setNameError(null);
  }

  function addCustomBlock(presetKey?: string, customName = "", copy?: CopiedNode) {
    const legacyMap: Record<string, string> = {
      SERVICE: "app-service",
      GATEWAY: "edge-gateway",
      DATABASE: "postgres-db",
      QUEUE: "kafka-broker",
    };
    const resolvedKey = presetKey ? (legacyMap[presetKey] ?? presetKey) : "app-service";
    const preset = STUDIO_COMPONENT_CATALOG.find((item) => item.key === resolvedKey);
    const requestedName = customName.trim();
    const baseSlug = preset?.key || resolvedKey;
    const cleanBase = baseSlug.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    if (!cleanBase) return undefined;
    let clean = cleanBase;
    let suffix = 2;
    while (customServices.includes(clean)) {
      clean = `${cleanBase}-${suffix}`;
      suffix += 1;
    }
    playSound("place");
    setCustomServices((prev) => [...prev, clean]);
    let label = requestedName || clean;
    let labelSuffix = 2;
    const usedNames = new Set(customServices.map((service) => nodeLabel(service).toLocaleLowerCase()));
    while (usedNames.has(label.toLocaleLowerCase())) {
      label = `${requestedName || clean} (${labelSuffix++})`;
    }
    setNodeNames((prev) => ({ ...prev, [clean]: label }));
    setReplicasMap((prev) => ({ ...prev, [clean]: copy?.replicas ?? 1 }));
    setBaselineReplicasMap((prev) => ({ ...prev, [clean]: copy?.baselineReplicas ?? 1 }));
    if (copy) {
      setNodeConfigs((prev) => ({ ...prev, [clean]: { ...copy.config } }));
      setNodeProfiles((prev) => ({ ...prev, [clean]: { ...copy.profile } }));
    } else {
      // A previously removed block can reuse this ID.
      setNodeConfigs((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== clean)));
      setNodeProfiles((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== clean)));
    }
    setSelectedService(clean);
    return clean;
  }

  function removeCustomBlock(svc: string) {
    if (customServices.length <= 2) return;
    playSound("disconnect");
    setExtraEdges((prev) => prev.filter((edge) => edge.from !== svc && edge.to !== svc));
    setRemovedEdges((prev) => [...new Set([
      ...prev,
      ...template.edges.filter((edge) => edge.from === svc || edge.to === svc)
        .map((edge) => `${edge.from}->${edge.to}`),
    ])]);
    const next = customServices.filter((item) => item !== svc);
    setCustomServices(next);
    setNodeProfiles((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== svc)));
    setNodeNames((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== svc)));
    setNameError((prev) => prev?.service === svc ? null : prev);
    if (selectedService === svc) {
      setSelectedService(next[0] ?? "");
    }
  }

  const activeEdges = useMemo(() => {
    const base = [
      ...template.edges.filter(
        (e) => customServices.includes(e.from) && customServices.includes(e.to),
      ),
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

  const deploymentRows = useMemo(() => {
    return customServices.map((svc) => {
      const before = baselineReplicasMap[svc] ?? 1;
      const now = replicasMap[svc] ?? 1;
      const cfg = nodeConfigs[svc] ?? DEFAULT_NODE_CONFIG;
      const catalogMatch = STUDIO_COMPONENT_CATALOG.find((item) => svc.startsWith(item.key));
      const baseCpuVal = nodeProfiles[svc]?.baseCpu ?? template.baseCpu[svc] ?? catalogMatch?.baseCpu ?? 26.5;
      const baseRamVal = nodeProfiles[svc]?.baseRam ?? template.baseRam[svc] ?? catalogMatch?.baseRam ?? 220;

      // Dynamic capacity & utilization physics driven by user-defined vCPU, RAM, and targetRps
      const podCapacityRps = sandboxPodCapacity(cfg);
      const maxCapacityRps = Math.max(0, now) * podCapacityRps;
      const demandRps = Math.max(0, cfg.targetRps);
      const effectiveRps = cfg.rateLimiter ? Math.min(cfg.rateLimitRps, demandRps) : demandRps;
      const rpsPerPod = now <= 0 ? 0 : effectiveRps / now;
      const utilizationPct =
        now <= 0 ? 100 : Math.round((effectiveRps / Math.max(1, maxCapacityRps)) * 100);
      const droppedRps =
        now <= 0 ? demandRps : Math.max(0, demandRps - Math.min(effectiveRps, maxCapacityRps));

      const rawPodCpu =
        now <= 0
          ? 0
          : (baseCpuVal * (rpsPerPod / 240)) / Math.max(0.25, Math.pow(cfg.vcpuPerPod, 0.85)) *
            (cfg.readCache ? 0.72 : 1.0);
      const perPodCpu = now <= 0 ? 0 : Math.min(99.9, Math.max(2.4, rawPodCpu));
      const ramBufferMiB = Math.min(cfg.ramPerPodMiB * 0.35, Math.round(rpsPerPod * 0.08));
      const perPodRam =
        now <= 0
          ? 0
          : Math.min(
              cfg.ramPerPodMiB,
              Math.round(baseRamVal * Math.sqrt(cfg.ramPerPodMiB / 512) + ramBufferMiB),
            );
      const totalRam = perPodRam * Math.max(0, now);
      const totalVcpu = cfg.vcpuPerPod * Math.max(0, now);

      const inbound = activeEdges.filter((e) => e.to === svc);
      const outbound = activeEdges.filter((e) => e.from === svc);
      const bottleneckTarget = outbound
        .map((e) => e.to)
        .find((ds) => {
          const dsReps = replicasMap[ds] ?? 1;
          const dsCfg = nodeConfigs[ds] ?? DEFAULT_NODE_CONFIG;
          const dsCap = dsReps * sandboxPodCapacity(dsCfg);
          return effectiveRps > dsCap * 0.85;
        });
      const queuePenaltyMs =
        utilizationPct > 80 ? Math.round(Math.pow(utilizationPct - 80, 1.38) * 1.6) : 0;
      const type = nodeProfiles[svc]?.type ?? template.types[svc] ?? catalogMatch?.elementType ?? "SERVICE_CONTAINER";
      const { floor, work } = sandboxProcessingProfile(svc, type, baseCpuVal);
      const processingMs = work * Math.sqrt(rpsPerPod / 240) / Math.sqrt(Math.max(0.25, cfg.vcpuPerPod));
      const p95Now = now <= 0 ? 980 : Math.round(
        (floor + processingMs * (cfg.readCache ? 0.62 : 1) + queuePenaltyMs + cfg.injectedLatencyMs) * 10,
      ) / 10;

      return {
        serviceName: svc,
        baseCpu: baseCpuVal,
        baseRam: baseRamVal,
        layer: nodeProfiles[svc]?.layer ?? template.layers[svc] ?? catalogMatch?.layer ?? "domain",
        type,
        inboundCount: inbound.length,
        outboundCount: outbound.length,
        inboundCallers: inbound.map((e) => e.from),
        outboundTargets: outbound.map((e) => e.to),
        replicasBefore: before,
        replicasNow: now,
        perPodCpu,
        perPodRam,
        totalRam,
        totalVcpu,
        demandRps,
        effectiveRps,
        maxCapacityRps,
        podCapacityRps,
        utilizationPct,
        droppedRps,
        status: now === 0 ? "Down"
          : effectiveRps > maxCapacityRps ? "Overloaded"
            : droppedRps > 0 ? "Rate limited"
              : bottleneckTarget || utilizationPct > 90 ? "Bottleneck" : "Running",
        p95Now,
        bottleneckTarget,
        cfg,
      };
    });
  }, [customServices, baselineReplicasMap, replicasMap, nodeConfigs, nodeProfiles, template, activeEdges]);

  const sandboxStudioData: StudioData = useMemo(() => {
    const nowIso = new Date().toISOString();
    const interactions = activeEdges.map((edge, idx) => ({
      traceId: `studio-trace-${idx + 1}`,
      fromService: edge.from,
      toService: edge.to,
      parentSpanId: `span-${edge.from}-${idx}`,
      childSpanId: `span-${edge.to}-${idx}`,
    }));

    const rowsByService = new Map(deploymentRows.map((row) => [row.serviceName, row]));
    const simulatedTimeoutMs = 1000;
    const spans = activeEdges.flatMap((edge, index) => {
      if ((replicasMap[edge.from] ?? 1) <= 0) return [];
      const source = rowsByService.get(edge.from)!;
      const target = rowsByService.get(edge.to)!;
      const isHttp = /^HTTPS?$/i.test(edge.protocol);
      const stopped = target.replicasNow === 0;
      const throttled = isHttp && !stopped && target.cfg.rateLimiter &&
        target.demandRps > target.cfg.rateLimitRps;
      const overloaded = !stopped && target.effectiveRps > target.maxCapacityRps;
      const transportMs = SANDBOX_TRANSPORT_MS[edge.protocol.toUpperCase()] ?? 1;
      const dispatchMs = Math.min(24, Math.max(0, source.utilizationPct - 70) * 0.18);
      const roundTripMs = target.p95Now + transportMs + dispatchMs;
      const timedOut = !stopped && roundTripMs >= simulatedTimeoutMs;
      // Sandbox has no rolling error window. An unhealthy downstream opens
      // the caller's circuit immediately and recovery closes it automatically.
      const circuitOpen = source.cfg.circuitBreaker && !throttled && (stopped || overloaded || timedOut);
      const httpStatusCode = !isHttp || stopped || circuitOpen ? null
        : throttled ? 429
          : overloaded ? 503
            : timedOut ? null : 200;
      const failure = circuitOpen ? "Circuit open at caller: upstream call skipped"
        : stopped ? "Destination unavailable"
        : throttled ? "Rate limit exceeded"
          : overloaded ? "Destination overloaded"
            : timedOut ? `Upstream timed out (simulated ${simulatedTimeoutMs} ms budget)` : null;
      const durationMs = circuitOpen ? 1 : stopped ? null : throttled || overloaded
        ? transportMs + dispatchMs + 2
        : Math.min(roundTripMs, simulatedTimeoutMs);
      return {
        traceId: `studio-trace-${index + 1}`,
        spanId: interactions[index]!.childSpanId,
        parentSpanId: interactions[index]!.parentSpanId,
        runtimeService: edge.from,
        operationName: `${edge.protocol} ${nodeNames[edge.from] ?? edge.from} → ${nodeNames[edge.to] ?? edge.to}${failure
          ? ` · ${failure}`
          : ` · Destination ≈ ${target.p95Now} ms · Transport ≈ ${transportMs} ms · Caller dispatch ≈ ${dispatchMs.toFixed(1)} ms`}`,
        spanKind: "CLIENT",
        spanStatus: failure ? "ERROR" : "OK",
        httpStatusCode, circuitOpen,
        durationNanoseconds: durationMs === null ? null : String(Math.round(durationMs * 1_000_000)),
      };
    });

    const servicesTelemetry = customServices.map((svc) => {
      const reps = replicasMap[svc] ?? 1;
      const catalogMatch = STUDIO_COMPONENT_CATALOG.find((item) => svc.startsWith(item.key));
      const baseCpuVal = nodeProfiles[svc]?.baseCpu ?? template.baseCpu[svc] ?? catalogMatch?.baseCpu ?? 26.5;
      const baseRamVal = nodeProfiles[svc]?.baseRam ?? template.baseRam[svc] ?? catalogMatch?.baseRam ?? 220;
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
            ? `[WARN] ${svc}: No running replicas`
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
              "Fault injection active: one or more services have 0 running replicas.",
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
  }, [template, customServices, activeEdges, replicasMap, actionsLog, localSnapshots, deploymentRows, nodeNames, nodeProfiles]);

  const previousFaults = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (mode !== "SANDBOX") {
      previousFaults.current = null;
      return;
    }
    const failedSpans = new Set(sandboxStudioData.telemetry?.spans
      .filter((span) => span.spanStatus === "ERROR")
      .map((span) => JSON.stringify([span.traceId, span.spanId])));
    const faults = new Set([
      ...deploymentRows.filter((row) => row.replicasNow === 0 || row.droppedRps > 0)
        .map((row) => JSON.stringify(["node", row.serviceName])),
      ...(sandboxStudioData.telemetry?.interactions ?? [])
        .filter((edge) => failedSpans.has(JSON.stringify([edge.traceId, edge.childSpanId])))
        .map((edge) => JSON.stringify(["wire", edge.fromService, edge.toService])),
    ]);
    const previous = previousFaults.current;
    previousFaults.current = faults;
    if (previous && [...faults].some((fault) => !previous.has(fault))) playSound("crash");
  }, [mode, deploymentRows, sandboxStudioData.telemetry, playSound]);

  const selectedRow =
    deploymentRows.find((r) => r.serviceName === selectedService) ?? deploymentRows[0];
  function captureNodeCopy(service: string): CopiedNode | undefined {
    const row = deploymentRows.find((item) => item.serviceName === service);
    if (!row) return;
    return {
      id: service, name: nodeLabel(service),
      profile: { type: row.type, layer: row.layer, baseCpu: row.baseCpu, baseRam: row.baseRam },
      config: { ...row.cfg }, replicas: row.replicasNow, baselineReplicas: row.replicasBefore,
    };
  }

  function pasteNode(copy: CopiedNode) {
    return addCustomBlock(copy.id, `${Array.from(copy.name).slice(0, 54).join("")} copy`, copy);
  }

  useEffect(() => {
    if (mode !== "SANDBOX") return;
    function handleNodeShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing ||
        !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof Element) ||
        (target !== document.body && !workspaceRef.current?.contains(target)) ||
        target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=textbox]") ||
        window.getSelection()?.isCollapsed === false) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        const copy = captureNodeCopy(selectedService);
        if (!copy) return;
        event.preventDefault();
        copiedNode.current = copy;
        setClipboardMessage(`Copied ${copy.name}`);
        playSound("select");
      } else if (key === "v" && copiedNode.current) {
        event.preventDefault();
        const copy = copiedNode.current;
        if (pasteNode(copy)) setClipboardMessage(`Pasted a copy of ${copy.name}`);
      }
    }
    window.addEventListener("keydown", handleNodeShortcut);
    return () => window.removeEventListener("keydown", handleNodeShortcut);
  });

  const visibleServiceRows = deploymentRows.filter((row) =>
    nodeLabel(row.serviceName).toLowerCase().includes(serviceSearch.trim().toLowerCase()),
  );
  const totalRunningPods = deploymentRows.reduce((s, r) => s + r.replicasNow, 0);
  const totalRamMiB = deploymentRows.reduce((s, r) => s + r.totalRam, 0);
  const avgCpu =
    deploymentRows.length > 0
      ? deploymentRows.reduce((s, r) => s + r.perPodCpu, 0) / deploymentRows.length
      : 0;
  const healthyServicesCount = deploymentRows.filter((r) => r.replicasNow > 0).length;
  const downServicesCount = deploymentRows.length - healthyServicesCount;
  const totalVcpuAllocated = deploymentRows.reduce((sum, r) => sum + r.totalVcpu, 0);
  const maxServerVcpu = Math.max(16, Math.ceil(totalVcpuAllocated / 16) * 16);
  const maxServerRamMiB = Math.max(4096, Math.ceil(totalRamMiB / 4096) * 4096);
  const peakCpuRow = [...deploymentRows].sort((a, b) => b.perPodCpu - a.perPodCpu)[0];
  const clusterDemandRps = deploymentRows.reduce((sum, row) => sum + row.demandRps, 0);
  const clusterDroppedRps = deploymentRows.reduce((sum, row) => sum + row.droppedRps, 0);
  const servicesUnderPressure = deploymentRows
    .filter((row) => row.replicasNow === 0 || row.droppedRps > 0 || row.utilizationPct > 90 || row.bottleneckTarget);
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

  function applyClusterScenario() {
    setScenarioApplied(false);
    const running = deploymentRows.filter((row) => row.replicasNow > 0);
    const gateway = running.find((row) => row.serviceName === selectedService && row.type === "API_GATEWAY")
      ?? running.find((row) => row.type === "API_GATEWAY");
    const databaseCandidates = running.filter((row) =>
      row.type === "DATABASE" && !/redis|cache|s3|storage|elastic|search/.test(row.serviceName),
    );
    const database = databaseCandidates.find((row) => row.serviceName === selectedService)
      ?? databaseCandidates[0];
    const dependency = running.find((row) => selectedRow?.outboundTargets.includes(row.serviceName))
      ?? running.find((row) => activeEdges.some((edge) => edge.to === row.serviceName));
    let target = selectedRow?.replicasNow ? selectedRow : undefined;
    let patch: Partial<NodeSimConfig> | undefined;
    let replicas: number | undefined;
    let unavailable = "Select a running service to apply this scenario.";
    let summary = "";

    switch (clusterScenario) {
      case "FLASH_SALE": {
        target = gateway;
        unavailable = "Add or start a gateway to apply this scenario.";
        if (!target) break;
        const demand = Math.min(1_000_000, Math.max(1, target.demandRps) * 4);
        patch = { targetRps: demand };
        summary = `incoming demand set to ${demand.toLocaleString()} req/s`;
        break;
      }
      case "DB_OUTAGE":
        target = database;
        unavailable = "Add or start a database to apply this scenario.";
        replicas = 0;
        summary = "all database replicas stopped";
        break;
      case "SLOW_DB":
        target = database;
        unavailable = "Add or start a database to apply this scenario.";
        patch = { injectedLatencyMs: 350 };
        summary = "350 ms query delay";
        break;
      case "RATE_LIMIT":
        target = gateway;
        unavailable = "Add or start a gateway to apply this scenario.";
        patch = { targetRps: Math.max(1200, target?.demandRps ?? 0), rateLimiter: true, rateLimitRps: 600 };
        summary = "rate limit set to 600 req/s";
        break;
      case "POD_FAILURE":
        if (!target) break;
        replicas = target.replicasNow - 1;
        summary = `one pod lost, ${replicas} remaining`;
        break;
      case "NETWORK_DELAY":
        target = dependency;
        unavailable = "Connect a running dependency to apply this scenario.";
        patch = { injectedLatencyMs: 700 };
        summary = "700 ms upstream delay";
        break;
      case "CPU_PRESSURE":
        if (!target) break;
        if (target.cfg.vcpuPerPod <= 0.25) {
          setScenarioMessage(`${nodeLabel(target.serviceName)} is already at the 0.25 vCPU minimum.`);
          return;
        }
        patch = { vcpuPerPod: Math.max(0.25, target.cfg.vcpuPerPod / 2), instanceTier: "CUSTOM" };
        summary = `CPU quota reduced to ${patch.vcpuPerPod} vCPU per pod`;
        break;
      case "SCALE_OUT":
        if (!target) break;
        if (target.replicasNow >= 256) {
          setScenarioMessage(`${nodeLabel(target.serviceName)} is already at the 256-pod limit.`);
          return;
        }
        replicas = Math.min(256, target.replicasNow * 2);
        summary = `scaled from ${target.replicasNow} to ${replicas} pods`;
        break;
    }

    if (!target) {
      playSound("blocked");
      setScenarioMessage(unavailable);
      return;
    }
    if (replicas !== 0) playSound(clusterScenario === "POD_FAILURE" ? "warning" : "scenario");
    if (patch) updateNodeConfig(target.serviceName, patch);
    if (replicas !== undefined) {
      applySandboxAction({
        action: replicas === 0 ? "STOP" : "SCALE",
        service: target.serviceName,
        replicas,
      });
    }
    setSelectedService(target.serviceName);
    setScenarioApplied(true);
    setScenarioMessage(`${nodeLabel(target.serviceName)} · ${summary}.`);
  }

  useEffect(() => {
    let current = true;
    void loadStudioEvidence<LocalSnapshot>().then((saved) => {
      if (!current || !saved.length) return;
      setLocalSnapshots((existing) => [
        ...new Map([...saved, ...existing].map((snapshot) => [snapshot.id, snapshot])).values(),
      ].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)));
    }).catch(() => {
      if (current) setSnapshotError("Browser storage is unavailable. Download evidence before leaving Studio.");
    });
    return () => { current = false; };
  }, []);

  const captureEvidenceFrame = useCallback((label: string, elapsedMs = 0): EvidenceFrame | null => {
    const graph = workspaceRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
    if (!graph) return null;
    return {
      elapsedMs, label, svg: serializeStudioGraph(graph, true),
      totals: {
        pods: totalRunningPods,
        demandRps: clusterDemandRps,
        handledRps: clusterDemandRps - clusterDroppedRps,
        droppedRps: clusterDroppedRps,
      },
      nodes: deploymentRows.map((row) => ({
        id: row.serviceName,
        name: nodeNames[row.serviceName] ?? row.serviceName,
        type: row.type,
        replicas: row.replicasNow,
        demandRps: row.demandRps,
        capacityRps: row.maxCapacityRps,
        droppedRps: row.droppedRps,
        p95Ms: row.replicasNow ? row.p95Now : null,
        configuration: { ...row.cfg },
      })),
      connections: activeEdges.map((edge) => ({ ...edge })),
    };
  }, [deploymentRows, activeEdges, nodeNames, totalRunningPods, clusterDemandRps, clusterDroppedRps]);

  useEffect(() => {
    const replay = replayCapture.current;
    if (!replay || replay.lastCapture === captureEvidenceFrame) return;
    const label = scenarioMessage && scenarioMessage !== replay.lastScenario ? scenarioMessage : "Configuration or topology changed";
    replay.lastCapture = captureEvidenceFrame;
    replay.lastScenario = scenarioMessage;
    if (replay.frames.length >= 39) return;
    const frame = captureEvidenceFrame(label, performance.now() - replay.started);
    if (frame) {
      replay.frames.push(frame);
      setRecordedSteps(replay.frames.length);
    }
  }, [captureEvidenceFrame, scenarioMessage]);

  useEffect(() => {
    if (!recordedSteps) return;
    const started = performance.now();
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((performance.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [recordedSteps > 0]);

  useEffect(() => () => { void videoRecording.current?.stop(); }, []);

  async function deleteSnapshot(id: string) {
    try {
      await deleteStudioEvidence(id);
      setLocalSnapshots((saved) => saved.filter((snapshot) => snapshot.id !== id));
    } catch {
      setSnapshotError("Could not delete the snapshot. Try again.");
    }
  }

  function startReplay() {
    const frame = captureEvidenceFrame("Initial state");
    if (!frame) return;
    const graph = workspaceRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
    if (!graph) return;
    try {
      videoRecording.current = startStudioRecording(graph);
    } catch {
      setSnapshotError("Video recording is unavailable in this browser.");
      return;
    }
    setRecordingSeconds(0);
    playSound("capture");
    replayCapture.current = { started: performance.now(), frames: [frame], lastCapture: captureEvidenceFrame, lastScenario: scenarioMessage };
    setRecordedSteps(1);
    setSnapshotError("");
  }

  function addReplayCheckpoint() {
    const replay = replayCapture.current;
    if (!replay || replay.frames.length >= 39) return;
    const frame = captureEvidenceFrame("Manual checkpoint", performance.now() - replay.started);
    if (frame) {
      playSound("checkpoint");
      replay.frames.push(frame);
      setRecordedSteps(replay.frames.length);
    }
  }

  async function captureLocalSnapshot() {
    const graph = workspaceRef.current?.querySelector<SVGSVGElement>("svg[data-studio-graph]");
    const recording = replayCapture.current;
    const frame = captureEvidenceFrame("Final state", recording ? performance.now() - recording.started : 0);
    if (!graph || !frame) return;
    const replay = recording ? [...recording.frames, frame] : [];
    setCapturing(true);
    setSnapshotError("");
    try {
      const video = await videoRecording.current?.stop();
      videoRecording.current = null;
      const imageData = await captureStudioImage(graph, true);
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ frame, replay })));
      const digest = "sha256:" + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const snap: LocalSnapshot = {
        id: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
        explanation: snapshotNote.trim() || `${template.name} · ${frame.nodes.length} nodes · ${frame.totals.pods} pods`,
        digest, imageData, frame, replay,
        ...(video ? { video: video.blob, durationMs: video.durationMs } : {}),
        replicasByService: Object.fromEntries(frame.nodes.map((node) => [node.id, node.replicas])),
        nodeNames: Object.fromEntries(frame.nodes.map((node) => [node.id, node.name])),
        connections: frame.connections,
        totalInstances: frame.totals.pods,
        totalRamMiB,
      };
      await storeStudioEvidence(snap).catch(() => {
        setSnapshotError("Could not save in browser storage. Download evidence before leaving Studio.");
      });
      playSound("capture");
      setLocalSnapshots((prev) => [...prev, snap]);
      replayCapture.current = null;
      setRecordedSteps(0);
      setSnapshotNote("");
      setBottomTab("SNAPSHOTS");
      setBottomCollapsed(false);
    } catch {
      setSnapshotError("Could not capture the diagram. Try saving again.");
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

        <div className="flex items-center gap-1.5">
          {mode === "SANDBOX" && (
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => { playSound("panel"); setLeftCollapsed((p) => !p); }}
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
                onClick={() => { playSound("panel"); setRightCollapsed((p) => !p); }}
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
              onClick={() => {
                if (mode !== "SANDBOX") playSound("select");
                setMode("SANDBOX");
              }}
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
              onClick={() => {
                if (mode !== "LIVE") playSound("select");
                setMode("LIVE");
              }}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                mode === "LIVE"
                  ? "bg-slate-100 text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Live ({liveSessions.length})
            </button>
          </div>
          <button
            type="button"
            aria-label={t("Studio sound effects")}
            aria-pressed={soundEnabled}
            title={soundEnabled ? t("Mute Studio sounds") : t("Enable Studio sounds")}
            onClick={toggleSound}
            className={`inline-flex h-7 w-7 items-center justify-center rounded border ${
              soundEnabled ? "border-sky-500/60 text-sky-200" : "border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            {soundEnabled && volume > 0 ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label={t("Studio volume settings")} title={t("Studio volume settings")}
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 text-slate-400 hover:text-slate-200">
                <SlidersHorizontal className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="z-[60] w-56 border-slate-700 bg-slate-950 p-3 text-slate-100">
              <div className="flex justify-between text-xs">
                <label htmlFor="studio-volume">{t("Effects volume")}</label>
                <output htmlFor="studio-volume" className="text-slate-300">{volume}%</output>
              </div>
              <input id="studio-volume" type="range" min={0} max={100} step={5} value={volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                className="my-2 w-full accent-sky-400" />
              <button type="button" disabled={!soundEnabled || volume === 0} onClick={() => playSound("capture")}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-sky-200 hover:bg-slate-800 disabled:opacity-40">
                {t("Preview sound")}
              </button>
            </PopoverContent>
          </Popover>
          <LocaleSwitchButton />
          <AppearanceSelector />
        </div>
      </header>

      <p role="status" className="sr-only">{clipboardMessage}</p>
      {mode === "LIVE" ? (
        <div className="flex min-h-0 w-full flex-1">
          <LiveStudioWorkbench
            sessions={liveSessions}
            sessionId={liveSessionId}
            onSelectSession={setLiveSessionId}
            onSwitchToSandbox={() => setMode("SANDBOX")}
          />
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
                <section aria-labelledby="cluster-scenarios-title" className="shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sky-500/15 text-sky-300">
                        <Activity aria-hidden="true" className="size-3.5" />
                      </span>
                      <h2 id="cluster-scenarios-title" className="text-xs font-semibold text-slate-100">Cluster Scenarios</h2>
                    </div>
                    <button type="button" onClick={() => switchTemplate(templateId)}
                      className="inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                      <RotateCcw aria-hidden="true" className="size-3" /> Reset Cluster
                    </button>
                  </header>
                  <div className="space-y-2.5 p-2.5">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                      <div className="flex items-center gap-2">
                        <ScenarioIcon aria-hidden="true" className="size-4 shrink-0 text-sky-300" />
                        <select
                          aria-label="Cluster scenario"
                          aria-describedby="cluster-scenario-impact"
                          value={clusterScenario}
                          onChange={(event) => {
                            const next = CLUSTER_SCENARIOS.find(({ id }) => id === event.target.value);
                            if (next && next.id !== clusterScenario) {
                              playSound("setting");
                              setClusterScenario(next.id);
                              setScenarioMessage("");
                            }
                          }}
                          className="min-h-7 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs font-medium text-slate-100"
                        >
                          {CLUSTER_SCENARIOS.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
                        </select>
                      </div>
                      <p id="cluster-scenario-impact" className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                        {scenario.detail}
                      </p>
                    </div>
                    <button type="button" onClick={applyClusterScenario}
                      className="flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md bg-sky-300 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-sky-200">
                      <Play aria-hidden="true" className="size-3" /> Apply scenario
                    </button>
                    <p role="status" hidden={!scenarioMessage} className={`rounded-md border px-2 py-1.5 text-[11px] leading-relaxed [overflow-wrap:anywhere] ${
                      scenarioApplied ? "border-sky-500/25 bg-sky-500/10 text-sky-100" : "border-amber-400/25 bg-amber-400/10 text-amber-100"
                    }`}>
                      <strong className="mr-1">{scenarioApplied ? "Applied:" : "Cannot apply:"}</strong>{scenarioMessage}
                    </p>
                  </div>
                </section>

                <section aria-labelledby="studio-library-title" className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <h2 id="studio-library-title" className="text-xs font-semibold text-slate-100">Block library</h2>
                    <button type="button" aria-expanded={customBlockOpen}
                      onClick={() => {
                        playSound("panel");
                        setCustomBlockOpen((open) => !open);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-sky-200 hover:bg-slate-800">
                      <Plus className="size-3" /> Custom block
                    </button>
                  </div>
                  {customBlockOpen && (
                    <form className="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (newNodeName.trim() && addCustomBlock(customBlockType, newNodeName)) {
                          setNewNodeName("");
                          setCustomBlockOpen(false);
                        }
                      }}>
                      <Input autoFocus aria-label="Custom block name" placeholder="Block name" value={newNodeName}
                        onChange={(event) => setNewNodeName(event.target.value)} maxLength={64} required
                        className="h-8 bg-slate-950 text-xs" />
                      <div className="flex flex-wrap gap-2">
                        <select aria-label="Custom block type" value={customBlockType} onChange={(event) => setCustomBlockType(event.target.value)}
                          className="h-7 min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 text-xs text-slate-100">
                          {STUDIO_COMPONENT_CATALOG.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                        </select>
                        <button type="submit" disabled={!newNodeName.trim()}
                          className="rounded bg-slate-100 px-2 text-xs font-semibold text-slate-950 disabled:opacity-40">
                          Add block
                        </button>
                      </div>
                    </form>
                  )}
                  <label className="relative block">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                    <Input type="search" aria-label="Search blocks" placeholder="Search blocks…"
                      value={componentSearch} onChange={(event) => setComponentSearch(event.target.value)}
                      className="h-8 rounded-md border-slate-700 bg-slate-950 pl-8 text-xs" />
                  </label>
                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
                    {blockGroups.map(({ category, title, items }) => (
                      <section key={category} className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/55 p-2">
                        <h3 className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
                        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${leftGridCols}, minmax(0, 1fr))` }}>
                          {items.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              aria-label={`+ ${item.label}`}
                              draggable
                              title={`${item.label} (${item.spec})`}
                              onDragStart={(event) => {
                                event.dataTransfer.setData("application/x-mavis-studio-spawn", item.key);
                                event.dataTransfer.effectAllowed = "copy";
                              }}
                              onClick={() => addCustomBlock(item.key)}
                              className="flex min-h-8 min-w-0 cursor-grab items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/60 px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-slate-200 hover:border-slate-600 hover:bg-slate-800 active:cursor-grabbing"
                            >
                              <span className={`shrink-0 ${item.iconClass}`}>{renderComponentIcon(item.key, "size-3.5")}</span>
                              <span className="min-w-0 break-words">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                    {blockGroups.length === 0 && <p className="px-1 text-xs text-slate-400">No matching blocks.</p>}
                  </div>
                </section>
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
                onConnect={connectOutboundEdge}
                onDisconnect={disconnectOutboundEdge}
                onSound={playSound}
                nodeNames={nodeNames}
                nodeStatus={Object.fromEntries(deploymentRows.map((row) => [row.serviceName, row.status]))}
                simulated
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
              className="flex min-h-0 max-h-[60%] shrink-0 flex-col bg-[#0b101b]"
            >
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/60 px-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={!bottomCollapsed && bottomTab === "STATS"}
                    onClick={() => {
                      playSound("panel");
                      if (!bottomCollapsed && bottomTab === "STATS") {
                        setBottomCollapsed(true);
                      } else {
                        setBottomCollapsed(false);
                        setBottomTab("STATS");
                      }
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${!bottomCollapsed && bottomTab === "STATS"
                      ? "border border-slate-700 bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"}`}
                  >
                    {t("Stats")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSound("panel");
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
                      playSound("panel");
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
                    Snapshots ({localSnapshots.length}){recordedSteps > 0 && " · REC"}
                  </button>
                </div>

                <button
                  type="button"
                  aria-label={bottomCollapsed ? t("Expand telemetry panel") : t("Collapse telemetry panel")}
                  aria-expanded={!bottomCollapsed}
                  onClick={() => {
                    playSound("panel");
                    setBottomCollapsed((prev) => !prev);
                  }}
                  className="ml-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-100"
                >
                  {bottomCollapsed ? "▲" : "▼"}
                </button>
              </div>

              {!bottomCollapsed && (
                <div data-testid="studio-dock-content" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
                  {bottomTab === "STATS" ? (
                    <section className="mx-auto max-w-6xl space-y-4 px-1 py-1.5" aria-labelledby="studio-cluster-overview">
                      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                        <div>
                          <h2 id="studio-cluster-overview" className="text-base font-semibold text-slate-100">
                            Cluster Overview
                          </h2>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            {[
                              ["Estimated 5xx", `${clusterErrorRate}%`],
                              ["Estimated SLA", `${clusterSla}%`],
                              ["Running pods", totalRunningPods.toLocaleString()],
                              ["Services down", downServicesCount.toLocaleString()],
                            ].map(([label, value]) => (
                              <div key={label} className="flex items-baseline gap-2">
                                <dt className="text-slate-400">{label}</dt>
                                <dd className="font-semibold tabular-nums text-slate-200">{value}</dd>
                              </div>
                            ))}
                          </dl>
                          <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                            downServicesCount ? "bg-rose-500/15 text-rose-300"
                              : servicesUnderPressure.length ? "bg-amber-500/15 text-amber-300"
                                : "bg-emerald-500/15 text-emerald-300"
                          }`}>
                            {downServicesCount ? `${downServicesCount} down`
                              : servicesUnderPressure.length ? `${servicesUnderPressure.length} need attention`
                                : deploymentRows.length ? "Healthy" : "No services"}
                          </span>
                        </div>
                      </header>

                      <section aria-label="Traffic & reliability">
                        <h3 className="mb-2 text-xs font-semibold text-slate-200">Traffic & reliability</h3>
                        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,140px),1fr))] gap-2">
                          {[
                            { label: "Incoming demand", value: clusterDemandRps, unit: "req/s", detail: "Sum across services" },
                            { label: "Handled traffic", value: clusterDemandRps - clusterDroppedRps, unit: "req/s", detail: "Within simulated limits" },
                            { label: "Dropped traffic", value: clusterDroppedRps, unit: "req/s", detail: "Stopped, throttled or overloaded", warning: clusterDroppedRps > 0 },
                            { label: "Estimated E2E p95", value: downServicesCount ? "—" : e2eP95, unit: downServicesCount ? "" : "ms", detail: "Simulation estimate" },
                          ].map(({ label, value, unit, detail, warning }) => (
                            <div key={label} className="rounded-lg border border-slate-700/80 bg-slate-900 p-3">
                              <dt className="text-xs font-medium text-slate-300">{label}</dt>
                              <dd className={`mt-1 font-mono text-lg font-semibold tabular-nums ${warning ? "text-rose-300" : "text-slate-100"}`}>
                                {value.toLocaleString()} <span className="text-[11px] text-slate-400">{unit}</span>
                                <span className="mt-1 block font-sans text-[11px] font-normal text-slate-400">{detail}</span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>

                      <section aria-label="Resource capacity">
                        <h3 className="mb-2 text-xs font-semibold text-slate-200">Resource capacity</h3>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-2">
                          {[
                            { label: "CPU allocation", value: totalVcpuAllocated, max: maxServerVcpu, units: "vCPU",
                              detail: `${avgCpu.toFixed(1)}% average CPU load${peakCpuRow ? ` · Highest: ${nodeLabel(peakCpuRow.serviceName)}` : ""}` },
                            { label: "RAM usage", value: Math.round(totalRamMiB), max: maxServerRamMiB, units: "MiB",
                              detail: `${Math.max(0, maxServerRamMiB - Math.round(totalRamMiB)).toLocaleString()} MiB free in simulated pool` },
                          ].map(({ label, value, max, units, detail }) => (
                            <div key={label} className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-900 p-3">
                              <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                                <span className="text-xs font-semibold text-slate-200">{label}</span>
                                <span className="font-mono text-xs tabular-nums text-slate-300">
                                  {value.toLocaleString()} / {max.toLocaleString()} {units}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                                <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
                              </div>
                              <p className="break-words text-[11px] text-slate-400">{detail}</p>
                            </div>
                          ))}
                        </div>
                      </section>

                    </section>
                  ) : bottomTab === "MATRIX" ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-xs font-semibold text-slate-300">Per-Service / API Telemetry ({deploymentRows.length})</h2>
                        <input
                          aria-label="Search services"
                          placeholder="Search services…"
                          value={serviceSearch}
                          onChange={(event) => setServiceSearch(event.target.value)}
                          className="w-48 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                        />
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full whitespace-nowrap text-left text-xs">
                          <thead className="bg-slate-900 text-[11px] text-slate-400">
                            <tr>
                              {["Service", "Status", "CPU / pod", "RAM total", "p95", "Replicas"].map((label) => (
                                <th key={label} scope="col" className="px-2.5 py-2 font-medium">{label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {visibleServiceRows.map((row) => {
                              const isDown = row.replicasNow === 0;
                              const { status } = row;
                              const isSelected = row.serviceName === selectedService;
                              return (
                                <tr key={row.serviceName} className={isSelected ? "bg-sky-950/35" : "hover:bg-slate-900"}>
                                  <td className="px-2.5 py-1.5">
                                    <button
                                      type="button"
                                      title={`${nodeLabel(row.serviceName)} · ${row.layer} · ${row.type}`}
                                      aria-pressed={isSelected}
                                      onClick={() => {
                                        setSelectedService(row.serviceName);
                                        setRightCollapsed(false);
                                      }}
                                      className="flex items-center gap-2 font-medium text-sky-200 hover:underline"
                                    >
                                      {renderComponentIcon(row.serviceName, "size-3.5 shrink-0")}
                                      {nodeLabel(row.serviceName)}
                                    </button>
                                  </td>
                                  <td className={`px-2.5 py-1.5 ${isDown || status === "Overloaded" ? "text-rose-300" : status === "Running" ? "text-emerald-300" : "text-amber-300"}`}
                                    title={row.bottleneckTarget ? `Bottleneck → ${nodeLabel(row.bottleneckTarget)}` : undefined}>
                                    {status}
                                  </td>
                                  <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-200">{isDown ? "—" : `${row.perPodCpu.toFixed(1)}%`}</td>
                                  <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-200">{Math.round(row.totalRam)} MiB</td>
                                  <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-200">{isDown ? "—" : `${row.p95Now} ms`}</td>
                                  <td className="px-2.5 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <button type="button" aria-label={`Decrease replicas for ${nodeLabel(row.serviceName)}`}
                                        disabled={isDown}
                                        onClick={() => applySandboxAction({
                                          action: row.replicasNow <= 1 ? "STOP" : "SCALE",
                                          service: row.serviceName,
                                          replicas: row.replicasNow - 1,
                                        })}
                                        className="size-6 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40">
                                        −
                                      </button>
                                      <span className="min-w-6 text-center font-mono text-slate-200">{row.replicasNow}</span>
                                      <button type="button" aria-label={`Increase replicas for ${nodeLabel(row.serviceName)}`}
                                        disabled={row.replicasNow >= 256}
                                        onClick={() => applySandboxAction({
                                          action: "SCALE",
                                          service: row.serviceName,
                                          replicas: row.replicasNow + 1,
                                        })}
                                        className="size-6 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40">
                                        +
                                      </button>
                                      {customServices.length > 2 && (
                                        <button
                                          type="button"
                                          aria-label={`Remove ${nodeLabel(row.serviceName)}`}
                                          onClick={() => removeCustomBlock(row.serviceName)}
                                          className="grid size-6 place-items-center text-slate-400 hover:text-rose-400"
                                        >
                                          <Trash2 className="size-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {visibleServiceRows.length === 0 && (
                              <tr><td colSpan={6} className="p-3 text-slate-400">No services found.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <section aria-label="Cluster evidence" className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-100">Cluster evidence</h2>
                          <p className="text-xs text-slate-400">Capture the complete diagram or record simulation changes for review.</p>
                        </div>
                        {recordedSteps > 0 && (
                          <span role="status" className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-200">
                            Recording · {recordingSeconds}s
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Input aria-label="Snapshot note" placeholder="Evidence note…" value={snapshotNote}
                          maxLength={4000} onChange={(event) => setSnapshotNote(event.target.value)}
                          className="h-8 min-w-36 flex-1 bg-slate-950 text-xs" />
                        {recordedSteps > 0 ? (
                          <button type="button" onClick={addReplayCheckpoint} disabled={capturing || recordedSteps >= 39}
                            className="rounded border border-slate-700 px-2 text-xs text-slate-200 disabled:opacity-50">
                            Add checkpoint
                          </button>
                        ) : (
                          <button type="button" onClick={startReplay} disabled={capturing}
                            className="rounded border border-sky-500/40 px-2 text-xs text-sky-200 disabled:opacity-50">
                            Record video
                          </button>
                        )}
                        <button type="button" disabled={capturing} onClick={() => void captureLocalSnapshot()}
                          className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50">
                          <Camera className="size-3" />
                          {capturing ? "Saving…" : recordedSteps > 0 ? "Stop & save video" : "Save snapshot"}
                        </button>
                      </div>
                      {snapshotError && <p role="alert" className="text-xs text-rose-300">{snapshotError}</p>}
                      {localSnapshots.length === 0 ? (
                        <p className="text-xs text-slate-400">No snapshots captured yet.</p>
                      ) : (
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2">

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
                          {snap.video ? (
                            <StudioVideo blob={snap.video} durationMs={snap.durationMs ?? 0} />
                          ) : snap.replay.length > 0 ? (
                            <StudioEvidenceReplay frames={snap.replay} onSound={playSound} />
                          ) : (
                            <img src={snap.imageData} alt="Captured complete diagram"
                              className="my-2 max-h-72 w-full rounded-md border border-slate-700 object-contain" />
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <button type="button" onClick={() => void deleteSnapshot(snap.id)}
                              className="text-red-300 hover:text-red-200">Delete snapshot</button>
                            <a href={snap.imageData} download={`mavis-${snap.id}.png`} className="text-sky-200 hover:underline">Download PNG</a>
                            <button type="button" onClick={() => downloadStudioEvidence(snap)} className="text-sky-200 hover:underline">
                              Download evidence
                            </button>
                          </div>
                          <details className="mt-1 text-[11px] text-slate-300">
                            <summary className="cursor-pointer">{t("Snapshot nodes")}</summary>
                            <ul className="mt-1 space-y-1">
                              {Object.entries(snap.nodeNames).map(([id, name]) => (
                                <li key={id} className="flex justify-between gap-2">
                                  <span className="break-all">{name}</span>
                                  <span className="shrink-0">×{snap.replicasByService[id]}</span>
                                </li>
                              ))}
                            </ul>
                            {snap.connections.length > 0 && (
                              <ul aria-label={t("Snapshot connections")} className="mt-2 space-y-1 border-t border-slate-700 pt-2">
                                {snap.connections.map(({ from, to, protocol }) => (
                                  <li key={JSON.stringify([from, to])} className="break-words text-slate-400">
                                    {snap.nodeNames[from]} → {snap.nodeNames[to]} · {protocol}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </details>
                        </div>
                      ))}
                      </div>
                      )}
                    </section>
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
                          ? "STOPPED"
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
                        {editingName === selectedRow.serviceName ? (
                          <>
                            <input
                              autoFocus
                              aria-label={t("Node name")}
                              aria-invalid={nameError?.service === selectedRow.serviceName || undefined}
                              maxLength={64}
                              defaultValue={nodeLabel(selectedRow.serviceName)}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={() => setNameError(null)}
                              onBlur={() => {
                                setEditingName(null);
                                setNameError(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.nativeEvent.isComposing) return;
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  renameNode(selectedRow.serviceName, event.currentTarget.value);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditingName(null);
                                  setNameError(null);
                                }
                              }}
                              className="w-full rounded-sm bg-slate-950 px-1 font-mono text-sm font-semibold text-slate-100 outline outline-1 outline-sky-500"
                            />
                            {nameError?.service === selectedRow.serviceName && (
                              <p role="alert" className="text-[11px] text-rose-300">{nameError.message}</p>
                            )}
                          </>
                        ) : (
                          <h2 className="font-mono text-sm font-semibold text-slate-100">
                            <button
                              type="button"
                              title={t("Double-click to rename node")}
                              onDoubleClick={() => setEditingName(selectedRow.serviceName)}
                              onClick={(event) => {
                                if (event.detail === 0) setEditingName(selectedRow.serviceName);
                              }}
                              className="block max-w-full cursor-text truncate text-left hover:text-sky-200"
                            >
                              {nodeLabel(selectedRow.serviceName)}
                            </button>
                          </h2>
                        )}
                        <p className="font-mono text-[10.5px] text-slate-400">
                          CPU <strong className="text-slate-100">{selectedRow.perPodCpu.toFixed(1)}%</strong> · RAM{" "}
                          <strong className="text-slate-100">{Math.round(selectedRow.totalRam)}M</strong> · p95{" "}
                          <strong className="text-slate-100">{selectedRow.p95Now}ms</strong>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[10.5px] text-slate-400">
                          <strong className={
                            selectedRow.status === "Down" || selectedRow.status === "Overloaded" ? "text-rose-300"
                              : selectedRow.status === "Running" ? "text-emerald-300" : "text-amber-300"
                          }>{selectedRow.status}</strong>
                          <span>· Tier {selectedRow.cfg.instanceTier}</span>
                          <span>· Load {selectedRow.cfg.trafficMult}×</span>
                        </p>
                      </div>
                    </div>

                    {/* Free-Form Replica / Pod Count Input + Quick Presets (No ×8 Cap!) */}
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                        <span>Custom Replicas (1–256 Pods)</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              applySandboxAction({
                                action: selectedRow.replicasNow <= 1 ? "STOP" : "SCALE",
                                service: selectedRow.serviceName,
                                replicas: Math.max(0, selectedRow.replicasNow - 1),
                              })
                            }
                            className="flex size-6 items-center justify-center rounded border border-slate-800 bg-slate-950 font-mono text-xs text-slate-300 hover:border-slate-600 hover:text-white"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={256}
                            aria-label="Custom pod replica count"
                            value={selectedRow.replicasNow}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(256, Math.trunc(Number(e.target.value)) || 0));
                              applySandboxAction({
                                action: val === 0 ? "STOP" : "SCALE",
                                service: selectedRow.serviceName,
                                replicas: val,
                              });
                            }}
                            className="h-6 w-14 rounded border border-slate-700 bg-slate-950 px-1.5 text-center font-mono text-xs font-semibold text-slate-100 focus:border-sky-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              applySandboxAction({
                                action: "SCALE",
                                service: selectedRow.serviceName,
                                replicas: Math.min(256, selectedRow.replicasNow + 1),
                              })
                            }
                            className="flex size-6 items-center justify-center rounded border border-slate-800 bg-slate-950 font-mono text-xs text-slate-300 hover:border-slate-600 hover:text-white"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {([1, 4, 8, 16, 32] as const).map((preset) => (
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
                            className={`h-6 rounded border font-mono text-[10.5px] font-semibold transition ${
                              selectedRow.replicasNow === preset
                                ? "border-slate-200 bg-slate-100 text-slate-950 shadow-xs"
                                : "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-600 hover:text-white"
                            }`}
                          >
                            ×{preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        type="button"
                        disabled={selectedRow.replicasNow === 0}
                        onClick={() =>
                          applySandboxAction({
                            action: "STOP",
                            service: selectedRow.serviceName,
                          })
                        }
                        className="h-6 rounded border border-amber-500/40 bg-amber-500/15 text-[11px] font-semibold text-amber-200 transition enabled:hover:bg-amber-500/25 disabled:opacity-40"
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
                        className="h-6 rounded border border-emerald-500/40 bg-emerald-500/15 text-[11px] font-semibold text-emerald-200 transition enabled:hover:bg-emerald-500/25 disabled:opacity-40"
                      >
                        Start
                      </button>
                      <button
                        type="button"
                        title={t("Clone node · Ctrl+C then Ctrl+V")}
                        aria-keyshortcuts="Control+C Control+V Meta+C Meta+V"
                        onClick={() => {
                          const copy = captureNodeCopy(selectedRow.serviceName);
                          if (copy) pasteNode(copy);
                        }}
                        className="h-6 rounded border border-sky-500/40 bg-sky-500/15 text-[11px] font-semibold text-sky-200 transition enabled:hover:bg-sky-500/25"
                      >
                        + Clone
                      </button>
                      <button
                        type="button"
                        disabled={customServices.length <= 2}
                        onClick={() => removeCustomBlock(selectedRow.serviceName)}
                        className="h-6 rounded border border-red-500/40 bg-red-500/15 text-[11px] font-semibold text-red-200 transition enabled:hover:bg-red-500/25 disabled:opacity-40"
                      >
                        {t("Delete")}
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Free-Form Hardware Spec & Stress Simulation (Custom vCPU, RAM, Traffic req/s, Latency ms) */}
                  <div className="space-y-2.5 rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5 text-[11px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Hardware & Stress Simulation
                    </p>

                    {/* 1. Custom Hardware Spec (vCPU & RAM per Pod) + Quick Tier Presets */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Pod Spec (vCPU / RAM MiB)</span>
                        <span className="font-mono text-slate-200">
                          {selectedRow.cfg.vcpuPerPod} vCPU · {selectedRow.cfg.ramPerPodMiB}M/pod
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/90 px-2 py-1 font-mono text-[10px] text-slate-400">
                          <span>vCPU</span>
                          <input
                            type="number"
                            min={0.25}
                            max={128}
                            step={0.5}
                            aria-label="vCPU per pod"
                            value={selectedRow.cfg.vcpuPerPod}
                            onChange={(e) => {
                              const v = Math.max(0.25, Math.min(128, Number(e.target.value) || 0.25));
                              updateNodeConfig(selectedRow.serviceName, {
                                instanceTier: "CUSTOM",
                                vcpuPerPod: v,
                              });
                            }}
                            className="w-12 bg-transparent text-right font-mono text-[11px] font-semibold text-slate-100 focus:outline-none"
                          />
                        </label>
                        <label className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/90 px-2 py-1 font-mono text-[10px] text-slate-400">
                          <span>RAM(M)</span>
                          <input
                            type="number"
                            min={64}
                            max={65536}
                            step={128}
                            aria-label="RAM MiB per pod"
                            value={selectedRow.cfg.ramPerPodMiB}
                            onChange={(e) => {
                              const m = Math.max(64, Math.min(65536, Number(e.target.value) || 64));
                              updateNodeConfig(selectedRow.serviceName, {
                                instanceTier: "CUSTOM",
                                ramPerPodMiB: m,
                              });
                            }}
                            className="w-14 bg-transparent text-right font-mono text-[11px] font-semibold text-slate-100 focus:outline-none"
                          />
                        </label>
                      </div>
                    </div>

                    {/* 2. Free-Form Incoming Traffic Input (req/s) + Presets */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Incoming Traffic (req/s)</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={1000000}
                            step={100}
                            aria-label="Custom incoming traffic req/s"
                            value={selectedRow.cfg.targetRps}
                            onChange={(e) => {
                              const rps = Math.max(0, Math.min(1000000, Number(e.target.value) || 0));
                              updateNodeConfig(selectedRow.serviceName, { targetRps: rps });
                            }}
                            className="h-6 w-20 rounded border border-slate-700 bg-slate-950 px-1.5 text-right font-mono text-[11px] font-semibold text-slate-100 focus:border-sky-400 focus:outline-none"
                          />
                          <span className="w-8 shrink-0 font-mono text-[9.5px] text-slate-500">req/s</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {(
                          [
                            [240, "240"],
                            [1000, "1k"],
                            [2500, "2.5k"],
                            [5000, "5k"],
                            [15000, "15k"],
                          ] as const
                        ).map(([rpsVal, rpsLabel]) => (
                          <button
                            key={rpsVal}
                            type="button"
                            onClick={() =>
                              updateNodeConfig(selectedRow.serviceName, { targetRps: rpsVal })
                            }
                            className={`h-6 rounded border font-mono text-[10px] font-semibold transition ${
                              selectedRow.cfg.targetRps === rpsVal
                                ? "border-slate-200 bg-slate-100 text-slate-950"
                                : "border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                            }`}
                          >
                            {rpsLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. Free-Form Network / Query Lag Input (+ms) + Presets */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Network / Query Lag (+ms)</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={30000}
                            step={25}
                            aria-label="Custom injected network latency ms"
                            value={selectedRow.cfg.injectedLatencyMs}
                            onChange={(e) => {
                              const ms = Math.max(0, Math.min(30000, Number(e.target.value) || 0));
                              updateNodeConfig(selectedRow.serviceName, { injectedLatencyMs: ms });
                            }}
                            className="h-6 w-20 rounded border border-slate-700 bg-slate-950 px-1.5 text-right font-mono text-[11px] font-semibold text-slate-100 focus:border-sky-400 focus:outline-none"
                          />
                          <span className="w-8 shrink-0 font-mono text-[9.5px] text-slate-500">ms</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {([0, 50, 200, 500, 1500] as const).map((lag) => (
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
                            +{lag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Resilience & Architecture Policies (4 Interactive Toggles + Custom Rate Limit Cap) */}
                  <div className="space-y-1.5 rounded-xl border border-slate-800/90 bg-slate-900/60 p-2.5 text-[11px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Resilience Policies
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["circuitBreaker", "Circuit Breaker", "Fail fast on unavailable, overloaded or timed-out dependencies."],
                          ["autoScaleHpa", "Auto-Scale HPA", "Add pods when admitted traffic exceeds capacity."],
                          ["readCache", "L1 Read Cache", "Simulate faster reads with lower CPU demand."],
                          ["rateLimiter", "Rate Limiter", "Reject requests above the configured rate."],
                        ] as const
                      ).map(([field, label, description]) => {
                        const enabled = selectedRow.cfg[field];
                        return (
                          <button
                            key={field}
                            type="button"
                            aria-pressed={enabled}
                            title={description}
                            onClick={() => {
                              playSound(enabled ? "policyOff" : "policyOn");
                              updateNodeConfig(selectedRow.serviceName, { [field]: !enabled });
                            }}
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
                    {selectedRow.cfg.rateLimiter && (
                      <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                        <span>Rate Limit Ceiling (req/s)</span>
                        <input
                          type="number"
                          min={50}
                          max={500000}
                          step={100}
                          value={selectedRow.cfg.rateLimitRps}
                          onChange={(e) =>
                            updateNodeConfig(selectedRow.serviceName, {
                              rateLimitRps: Math.max(50, Math.min(500000, Number(e.target.value) || 50)),
                            })
                          }
                          className="h-5 w-20 rounded border border-slate-700 bg-slate-950 px-1.5 text-right font-mono text-[10.5px] font-semibold text-slate-100"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <section aria-label="Load and capacity" className="space-y-2 rounded-xl border border-slate-700/80 bg-slate-900 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <h3 className="text-xs font-semibold text-slate-100">Load & capacity</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          selectedRow.replicasNow === 0 || selectedRow.utilizationPct > 100
                            ? "bg-rose-500/15 text-rose-300"
                            : selectedRow.utilizationPct > 80
                              ? "bg-amber-500/15 text-amber-200"
                              : "bg-sky-500/10 text-sky-200"
                        }`}>
                          {selectedRow.replicasNow === 0 ? "Stopped" : `${selectedRow.utilizationPct}% of capacity`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="min-w-0 rounded-md bg-slate-950/70 p-2">
                          <p className="text-slate-400">Incoming demand</p>
                          <p className="mt-1 break-words font-mono font-semibold text-slate-100">
                            {selectedRow.demandRps.toLocaleString()} <span className="font-normal text-slate-400">req/s</span>
                          </p>
                        </div>
                        <div className="min-w-0 rounded-md bg-slate-950/70 p-2">
                          <p className="text-slate-400">Max capacity</p>
                          <p className="mt-1 break-words font-mono text-slate-100">
                            <strong>{selectedRow.maxCapacityRps.toLocaleString()}</strong> <span className="text-slate-400">req/s</span>
                          </p>
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${selectedRow.utilizationPct > 100 ? "bg-rose-400" : selectedRow.utilizationPct > 80 ? "bg-amber-400" : "bg-sky-400"}`}
                          style={{ width: `${selectedRow.replicasNow === 0 ? 0 : Math.min(100, selectedRow.utilizationPct)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {(selectedRow.demandRps - selectedRow.droppedRps).toLocaleString()} req/s handled
                        {" · "}
                        <span className={selectedRow.droppedRps ? "font-semibold text-rose-300" : undefined}>
                          {selectedRow.droppedRps.toLocaleString()} req/s dropped
                        </span>
                      </p>
                    </section>

                    <section aria-label="Current configuration" className="space-y-2 rounded-xl border border-slate-700/80 bg-slate-900 p-3">
                      <h3 className="text-xs font-semibold text-slate-100">Current configuration</h3>
                      <dl className="grid grid-cols-2 gap-2 text-[11px]">
                        {[
                          ["Running pods", selectedRow.replicasNow.toLocaleString(), `Baseline: ${selectedRow.replicasBefore}`],
                          ["CPU allocated", `${selectedRow.totalVcpu.toFixed(1)} vCPU`, `${selectedRow.cfg.vcpuPerPod} vCPU per pod`],
                          ["RAM usage", `${selectedRow.totalRam.toLocaleString()} MiB`, `${selectedRow.perPodRam} MiB per pod`],
                          ["Estimated p95", selectedRow.replicasNow ? `${selectedRow.p95Now} ms` : "—", "Current simulation"],
                        ].map(([label, value, detail]) => (
                          <div key={label} className="min-w-0 rounded-md bg-slate-950/70 p-2">
                            <dt className="text-slate-400">{label}</dt>
                            <dd className="mt-1 break-words font-mono font-semibold text-slate-100">
                              {value}
                              <span className="font-sans font-normal text-slate-400"> · {detail}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    {[
                      ...(selectedRow.replicasNow === 0 ? [{
                        title: "No running pods", critical: true,
                      }] : []),
                      ...(selectedRow.replicasNow > 0 && selectedRow.utilizationPct > 85 ? [{
                        title: selectedRow.utilizationPct > 100 ? "Demand exceeds capacity" : "Capacity is nearly full",
                        critical: selectedRow.utilizationPct > 100,
                      }] : []),
                      ...(selectedRow.cfg.rateLimiter && selectedRow.demandRps > selectedRow.cfg.rateLimitRps ? [{
                        title: "Rate limit is rejecting requests", critical: true,
                      }] : []),
                      ...(selectedRow.bottleneckTarget ? [{
                        title: `Downstream pressure · ${nodeLabel(selectedRow.bottleneckTarget)}`, critical: false,
                      }] : []),
                    ].map(({ title, critical }) => (
                      <p key={title} className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${
                        critical ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                      }`}>{title}</p>
                    ))}

                    <div className="space-y-2 rounded-xl border border-slate-700/80 bg-slate-900 p-3 text-[11px]">
                      <h3 className="text-xs font-semibold text-slate-100">Connections</h3>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-slate-400">Called by:</span>
                        {selectedRow.inboundCallers.length > 0 ? (
                          selectedRow.inboundCallers.map((caller) => (
                            <button
                              key={nodeLabel(caller)}
                              type="button"
                              onClick={() => setSelectedService(caller)}
                              className="rounded border border-slate-700/80 bg-slate-800 px-1.5 py-0.5 text-slate-200 hover:border-slate-500"
                            >
                              {nodeLabel(caller)}
                            </button>
                          ))
                        ) : (
                          <span className="text-slate-400">No incoming connections</span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-slate-500">Calls:</span>
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
                                  {nodeLabel(target)}
                                </button>
                                <button
                                  type="button"
                                  title={`Disconnect ${nodeLabel(selectedRow.serviceName)} → ${nodeLabel(target)}`}
                                  onClick={() =>
                                    disconnectOutboundEdge(selectedRow.serviceName, target)
                                  }
                                  className="text-slate-400 hover:text-rose-400"
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">No outgoing connections</span>
                          )}
                        </div>
                        <select
                          aria-label="Connect outbound service"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              connectOutboundEdge(selectedRow.serviceName, e.target.value);
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
                                → {nodeLabel(s)}
                              </option>
                            ))}
                        </select>
                      </div>
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

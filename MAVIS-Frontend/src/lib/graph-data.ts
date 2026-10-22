export type Layer = "edge" | "domain" | "platform" | "data";
export type Health = "healthy" | "degraded" | "critical";

export type ServiceNode = {
  id: string;
  name: string;
  layer: Layer;
  health: Health;
  language: string;
  version: string;
  owner: string;
  instances: number;
  p95: string;
  rps: string;
  errorRate: string;
  vulns: number;
  x: number;
  y: number;
};

export type Edge = {
  from: string;
  to: string;
  protocol: "HTTP" | "gRPC" | "AMQP" | "SQL";
  calls: string;
};

export const NODE_W = 168;
export const NODE_H = 62;

export const services: ServiceNode[] = [
  { id: "gateway", name: "api-gateway", layer: "edge", health: "healthy", language: "Go", version: "v3.4.1", owner: "platform", instances: 6, p95: "38 ms", rps: "4.2k", errorRate: "0.11%", vulns: 0, x: 80, y: 300 },
  { id: "bff-web", name: "web-bff", layer: "edge", health: "degraded", language: "TypeScript", version: "v1.9.0", owner: "frontend", instances: 4, p95: "112 ms", rps: "2.8k", errorRate: "1.42%", vulns: 3, x: 330, y: 150 },
  { id: "bff-mobile", name: "mobile-bff", layer: "edge", health: "healthy", language: "TypeScript", version: "v1.4.7", owner: "mobile", instances: 3, p95: "96 ms", rps: "1.6k", errorRate: "0.34%", vulns: 1, x: 330, y: 450 },
  { id: "auth", name: "auth-service", layer: "domain", health: "healthy", language: "Go", version: "v2.2.0", owner: "security", instances: 5, p95: "24 ms", rps: "3.1k", errorRate: "0.05%", vulns: 0, x: 590, y: 60 },
  { id: "orders", name: "order-service", layer: "domain", health: "critical", language: "Java", version: "v5.0.3", owner: "commerce", instances: 8, p95: "268 ms", rps: "1.9k", errorRate: "4.10%", vulns: 7, x: 590, y: 220 },
  { id: "catalog", name: "catalog-service", layer: "domain", health: "healthy", language: "Kotlin", version: "v4.1.2", owner: "commerce", instances: 6, p95: "45 ms", rps: "2.4k", errorRate: "0.20%", vulns: 2, x: 590, y: 380 },
  { id: "payments", name: "payment-service", layer: "domain", health: "degraded", language: "Java", version: "v3.7.4", owner: "fintech", instances: 4, p95: "184 ms", rps: "740", errorRate: "1.05%", vulns: 4, x: 590, y: 540 },
  { id: "notify", name: "notification-svc", layer: "platform", health: "healthy", language: "Python", version: "v1.2.9", owner: "platform", instances: 3, p95: "62 ms", rps: "980", errorRate: "0.42%", vulns: 1, x: 850, y: 120 },
  { id: "search", name: "search-indexer", layer: "platform", health: "healthy", language: "Rust", version: "v0.9.6", owner: "platform", instances: 2, p95: "31 ms", rps: "610", errorRate: "0.08%", vulns: 0, x: 850, y: 300 },
  { id: "events", name: "event-bus", layer: "platform", health: "healthy", language: "Go", version: "v2.0.1", owner: "platform", instances: 5, p95: "9 ms", rps: "12k", errorRate: "0.01%", vulns: 0, x: 850, y: 470 },
  { id: "pgsql", name: "orders-postgres", layer: "data", health: "degraded", language: "PostgreSQL", version: "15.4", owner: "data", instances: 3, p95: "72 ms", rps: "3.6k", errorRate: "0.60%", vulns: 2, x: 1110, y: 220 },
  { id: "redis", name: "session-cache", layer: "data", health: "healthy", language: "Redis", version: "7.2", owner: "data", instances: 3, p95: "3 ms", rps: "8.4k", errorRate: "0.00%", vulns: 0, x: 1110, y: 400 },
];

export const edges: Edge[] = [
  { from: "gateway", to: "bff-web", protocol: "HTTP", calls: "2.8k/s" },
  { from: "gateway", to: "bff-mobile", protocol: "HTTP", calls: "1.6k/s" },
  { from: "bff-web", to: "auth", protocol: "gRPC", calls: "1.1k/s" },
  { from: "bff-web", to: "orders", protocol: "gRPC", calls: "820/s" },
  { from: "bff-web", to: "catalog", protocol: "gRPC", calls: "1.4k/s" },
  { from: "bff-mobile", to: "auth", protocol: "gRPC", calls: "640/s" },
  { from: "bff-mobile", to: "catalog", protocol: "gRPC", calls: "910/s" },
  { from: "bff-mobile", to: "payments", protocol: "HTTP", calls: "210/s" },
  { from: "orders", to: "payments", protocol: "HTTP", calls: "480/s" },
  { from: "orders", to: "events", protocol: "AMQP", calls: "1.2k/s" },
  { from: "orders", to: "pgsql", protocol: "SQL", calls: "3.1k/s" },
  { from: "catalog", to: "search", protocol: "gRPC", calls: "560/s" },
  { from: "catalog", to: "events", protocol: "AMQP", calls: "300/s" },
  { from: "auth", to: "redis", protocol: "SQL", calls: "2.9k/s" },
  { from: "auth", to: "notify", protocol: "AMQP", calls: "120/s" },
  { from: "payments", to: "events", protocol: "AMQP", calls: "260/s" },
  { from: "events", to: "notify", protocol: "AMQP", calls: "840/s" },
  { from: "search", to: "redis", protocol: "SQL", calls: "410/s" },
];

export const layerMeta: Record<Layer, { label: string; dot: string }> = {
  edge: { label: "Edge", dot: "bg-info" },
  domain: { label: "Domain", dot: "bg-primary" },
  platform: { label: "Platform", dot: "bg-success" },
  data: { label: "Data", dot: "bg-warning" },
};

export const healthMeta: Record<Health, { label: string; text: string; bg: string; stroke: string }> = {
  healthy: { label: "Healthy", text: "text-success", bg: "bg-success/10", stroke: "var(--success)" },
  degraded: { label: "Degraded", text: "text-warning", bg: "bg-warning/10", stroke: "var(--warning)" },
  critical: { label: "Critical", text: "text-destructive", bg: "bg-destructive/10", stroke: "var(--destructive)" },
};

export function serviceById(id: string): ServiceNode {
  return services.find((s) => s.id === id)!;
}

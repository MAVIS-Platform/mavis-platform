"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Code2,
  Copy,
  FileCode2,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { edges, healthMeta, layerMeta, serviceById, type Edge } from "@/lib/graph-data";

type Evidence = {
  path: string;
  language: string;
  commit: string;
  updated: string;
  startLine: number;
  highlight: number[];
  code: string[];
};

const evidenceByEdge: Record<string, Evidence[]> = {
  "bff-web->orders": [
    {
      path: "services/web-bff/src/resolvers/orders.resolver.ts",
      language: "TypeScript",
      commit: "a41f9c2",
      updated: "3 days ago",
      startLine: 42,
      highlight: [3, 4, 5],
      code: [
        "export class OrdersResolver {",
        "  constructor(private readonly orders: OrderServiceClient) {}",
        "",
        "  @Query(() => OrderConnection)",
        "  async orders(@Args() args: OrderArgs, @Ctx() ctx: Ctx) {",
        "    return this.orders.listOrders({ userId: ctx.userId, ...args });",
        "  }",
        "}",
      ],
    },
    {
      path: "services/web-bff/src/clients/order-service.client.ts",
      language: "TypeScript",
      commit: "7d20b18",
      updated: "11 days ago",
      startLine: 18,
      highlight: [2, 3],
      code: [
        "const channel = createChannel(config.ORDER_SERVICE_URL);",
        "",
        "export const OrderServiceClient = createClient(",
        "  OrderServiceDefinition, // proto: order/v5/order.proto",
        "  channel,",
        ");",
      ],
    },
  ],
  "orders->pgsql": [
    {
      path: "services/order-service/src/main/java/com/acme/order/OrderRepository.java",
      language: "Java",
      commit: "c93ae07",
      updated: "yesterday",
      startLine: 55,
      highlight: [2, 3, 4],
      code: [
        "@Repository",
        "public interface OrderRepository extends JpaRepository<Order, UUID> {",
        '  @Query("select o from Order o where o.customerId = :id and o.status in :st")',
        "  List<Order> findActiveByCustomer(UUID id, Collection<Status> st);",
        "}",
      ],
    },
  ],
};

const defaultEvidence: Evidence[] = [
  {
    path: "services/shared/clients/http-client.ts",
    language: "TypeScript",
    commit: "5b1e440",
    updated: "6 days ago",
    startLine: 24,
    highlight: [2, 3],
    code: [
      "export async function call(target: ServiceName, path: string, body?: unknown) {",
      "  const base = registry.resolve(target);",
      "  return fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', body: json(body) });",
      "}",
    ],
  },
];

function edgeKey(e: Edge) {
  return `${e.from}->${e.to}`;
}

export default function ExplainPage() {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(edgeKey(edges[3]!));
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return edges;
    return edges.filter((e) =>
      `${serviceById(e.from).name} ${serviceById(e.to).name} ${e.protocol}`
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  const edge = useMemo(
    () => edges.find((e) => edgeKey(e) === selectedKey) ?? edges[0]!,
    [selectedKey],
  );
  const from = serviceById(edge.from);
  const to = serviceById(edge.to);
  const evidence = evidenceByEdge[edgeKey(edge)] ?? defaultEvidence;

  const downstream = edges.filter((e) => e.from === to.id);
  const upstream = edges.filter((e) => e.to === from.id);

  useEffect(() => {
    setGenerated(false);
    setGenerating(true);
    const t = setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 1100);
    return () => clearTimeout(t);
  }, [selectedKey]);

  function regenerate() {
    setGenerated(false);
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 1200);
  }

  function copy(text: string, id: string) {
    void navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1500px]">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Analysis</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">AI-assisted explanation</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              AI-assisted explanation
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every claim is labelled:{" "}
              <span className="font-medium text-foreground">deterministic analysis</span> comes from
              static parsing of your source,{" "}
              <span className="font-medium text-foreground">AI-generated</span> content is a model
              interpretation on top of that evidence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LegendChip kind="static" />
            <LegendChip kind="ai" />
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
          {/* Dependency picker */}
          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-3">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search dependencies"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="max-h-[560px] overflow-y-auto p-2">
                {filtered.map((e) => {
                  const a = serviceById(e.from);
                  const b = serviceById(e.to);
                  const active = edgeKey(e) === selectedKey;
                  return (
                    <button
                      key={edgeKey(e)}
                      onClick={() => setSelectedKey(edgeKey(e))}
                      className={cn(
                        "mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                        active
                          ? "border-primary/40 bg-primary/5"
                          : "border-transparent hover:border-border hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-mono text-[12px] text-foreground">
                        <span className="truncate">{a.name}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{b.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded border border-border px-1 font-mono">
                          {e.protocol}
                        </span>
                        <span>{e.calls}</span>
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    No dependency matches.
                  </p>
                )}
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {/* Selected service & dependency */}
            <section className="rounded-xl border border-border bg-card p-5">
              <SectionLabel kind="static" title="Selected service & dependency" icon={Workflow} />
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                <ServiceCard id={from.id} role="Caller" />
                <div className="flex flex-col items-center gap-1 px-2">
                  <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                    {edge.protocol}
                  </span>
                  <ArrowRight className="h-5 w-5 text-primary" />
                  <span className="text-[11px] text-muted-foreground">{edge.calls}</span>
                </div>
                <ServiceCard id={to.id} role="Callee" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
                <Fact label="Call sites found" value={String(evidence.length)} />
                <Fact label="Upstream of caller" value={String(upstream.length)} />
                <Fact label="Downstream of callee" value={String(downstream.length)} />
                <Fact label="Coupling" value={downstream.length > 2 ? "Transitive" : "Direct"} />
              </dl>
            </section>

            {/* Code evidence */}
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionLabel kind="static" title="Source-code evidence" icon={FileCode2} />
                <span className="text-xs text-muted-foreground">
                  Parsed from the imported archive — no model involved
                </span>
              </div>
              <div className="mt-4 space-y-4">
                {evidence.map((ev) => (
                  <CodeViewer key={ev.path} ev={ev} copied={copied} onCopy={copy} />
                ))}
              </div>
            </section>

            {/* AI panels */}
            <section className="rounded-xl border border-primary/25 bg-primary/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionLabel kind="ai" title="AI-generated explanation" icon={Sparkles} />
                <button
                  onClick={regenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {generating ? "Generating" : "Regenerate"}
                </button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Model interpretation grounded in the {evidence.length} call site
                {evidence.length > 1 ? "s" : ""} above. Verify before acting on it.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <AiCard
                  title="Architecture explanation"
                  icon={Bot}
                  loading={generating || !generated}
                  body={`${from.name} sits in the ${layerMeta[from.layer].label.toLowerCase()} layer and delegates ${
                    edge.protocol === "SQL" ? "persistence" : "business capability"
                  } to ${to.name} over ${edge.protocol}. This keeps ${from.name} stateless and request-shaped, while ${
                    to.name
                  } owns the ${to.owner} domain model behind a versioned contract (${to.version}).`}
                />
                <AiCard
                  title="Change impact explanation"
                  icon={GitBranch}
                  loading={generating || !generated}
                  body={`A breaking change in ${to.name} propagates to ${from.name} first, then to ${
                    upstream.length
                  } upstream caller${upstream.length === 1 ? "" : "s"} such as ${
                    upstream[0] ? serviceById(upstream[0].from).name : "the gateway"
                  }. ${to.name} is currently ${healthMeta[to.health].label.toLowerCase()} at ${
                    to.errorRate
                  } errors, so deploy behind a contract test and a staged rollout.`}
                />
                <AiCard
                  title="Dependency reasoning"
                  icon={Workflow}
                  loading={generating || !generated}
                  body={`The dependency is justified: ${from.name} needs ${to.name}'s data on the synchronous path at ${
                    edge.calls
                  }. ${
                    downstream.length > 2
                      ? `Because ${to.name} fans out to ${downstream.length} further services, consider caching or an async read model to cut tail latency.`
                      : `Fan-out beyond ${to.name} is small, so the call chain stays shallow and predictable.`
                  }`}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function LegendChip({ kind }: { kind: "static" | "ai" }) {
  const ai = kind === "ai";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        ai
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {ai ? <Sparkles className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {ai ? "AI-generated" : "Deterministic analysis"}
    </span>
  );
}

function SectionLabel({
  kind,
  title,
  icon: Icon,
}: {
  kind: "static" | "ai";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border",
          kind === "ai"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[11px] text-muted-foreground">
          {kind === "ai"
            ? "AI-generated — model interpretation"
            : "Deterministic — static source analysis"}
        </p>
      </div>
    </div>
  );
}

function ServiceCard({ id, role }: { id: string; role: string }) {
  const s = serviceById(id);
  const h = healthMeta[s.health];
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{role}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", h.bg, h.text)}>
          {h.label}
        </span>
      </div>
      <p className="mt-1.5 font-mono text-sm font-semibold text-foreground">{s.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", layerMeta[s.layer].dot)} />
          {layerMeta[s.layer].label}
        </span>
        <span>{s.language}</span>
        <span>{s.version}</span>
        <span>p95 {s.p95}</span>
        <span>@{s.owner}</span>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function CodeViewer({
  ev,
  copied,
  onCopy,
}: {
  ev: Evidence;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Code2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs text-foreground">{ev.path}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded border border-border px-1.5 py-0.5">{ev.language}</span>
          <span className="font-mono">{ev.commit}</span>
          <span>{ev.updated}</span>
          <button
            onClick={() => onCopy(ev.code.join("\n"), ev.path)}
            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 transition-colors hover:bg-muted"
          >
            {copied === ev.path ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied === ev.path ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto py-2 text-[12.5px] leading-6">
        <code className="block font-mono">
          {ev.code.map((line, i) => {
            const hit = ev.highlight.includes(i);
            return (
              <span
                key={i}
                className={cn(
                  "grid grid-cols-[3.25rem_1fr] items-start",
                  hit && "bg-warning/10 shadow-[inset_2px_0_0_0_var(--warning)]",
                )}
              >
                <span className="select-none pr-3 text-right text-muted-foreground">
                  {ev.startLine + i}
                </span>
                <span className="whitespace-pre pr-4 text-foreground">{line || " "}</span>
              </span>
            );
          })}
        </code>
      </pre>
      <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Highlighted lines are the matched call sites for this dependency.
      </div>
    </div>
  );
}

function AiCard({
  title,
  icon: Icon,
  body,
  loading,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  body: string;
  loading: boolean;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <span className="block h-3 w-full animate-pulse rounded bg-muted" />
          <span className="block h-3 w-11/12 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-9/12 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      )}
      <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary">
        <Sparkles className="h-3 w-3" /> AI-generated
      </p>
    </article>
  );
}

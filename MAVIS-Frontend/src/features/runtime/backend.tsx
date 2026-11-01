"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Zap,
  ArrowRight,
  ExternalLink,
  Activity,
  Clock,
  AlertTriangle,
  Network,
  GitCommit,
  Layers,
  Play,
} from "lucide-react";
import {
  RuntimeStepperBanner,
  readStep1Target,
  httpMethodBadgeClass,
} from "./screens";
import { useMemo, useState } from "react";
import { useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
import { DetailPanel, StatusLabel } from "@/components/shared/data";
import { translatedStatusLabel } from "@/lib/status-label";
import { useLocale } from "@/lib/i18n/locale-context";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { SelectField, ConfirmDialog, SearchInput } from "@/components/shared/forms";
import { AdminToolbar } from "@/features/administration/operations";
import { Button } from "@/components/ui/button";

const active = new Set([
  "NOT_STARTED",
  "PENDING",
  "READY_FOR_DISPATCH",
  "APPROVED",
  "ALLOCATED",
  "RUNNING",
  "CANCELLING",
]);

interface ObservedStepItem {
  stepOrder?: number | null | undefined;
  messageId?: string | null | undefined;
  callerService?: string | null | undefined;
  calleeService?: string | null | undefined;
  operation?: string | null | undefined;
  httpMethod?: string | null | undefined;
  httpStatusCode?: number | null | undefined;
  durationMs?: number | null | undefined;
  traceId?: string | null | undefined;
  spanId?: string | null | undefined;
  parentSpanId?: string | null | undefined;
  callerResolutionStatus?: string | null | undefined;
  calleeResolutionStatus?: string | null | undefined;
  provenanceType?: string | null | undefined;
}

function normalizeEndpointDisplay(
  method: string | null | undefined,
  operation: string | null | undefined,
  callee: string | null | undefined,
): string {
  const m = (method ?? "GET").trim().toUpperCase();
  let op = (operation ?? "").trim();
  if (op.toUpperCase().startsWith(m + " ")) {
    op = op.slice(m.length).trim();
  }
  if (op.startsWith("HTTP -> ")) {
    op = "/api/" + op.slice("HTTP -> ".length).trim().toLowerCase();
  }
  if (!op || op === callee || !op.includes("/")) {
    const cleanSlug = (op || callee || "service")
      .replace(/^fruit[-_]/i, "")
      .replace(/[-_]service$/i, "")
      .toLowerCase();
    op = `/api/${cleanSlug}`;
  }
  return `${m} ${op}`;
}

function methodStrokeColor(method: string | null | undefined, isError = false): string {
  if (isError) return "#f43f5e";
  switch ((method ?? "GET").toUpperCase()) {
    case "GET":
      return "#10b981";
    case "POST":
      return "#38bdf8";
    case "PUT":
      return "#f59e0b";
    case "PATCH":
      return "#a855f7";
    case "DELETE":
      return "#f43f5e";
    default:
      return "#38bdf8";
  }
}

export type WorkflowMode = "OBSERVED" | "PLANNED";

// Observed spans are shown as-is. Without them we only draw the PLANNED workflow:
// scenario requests plus real model edges, never invented durations, statuses or trace ids.
export function deriveWorkflowSteps(
  observedSteps: ObservedStepItem[] | undefined,
  plannedRequests: Array<{ service: string; method: string; path: string }>,
  modelData:
    | {
        elements?: Array<{ id: string; name: string }>;
        edges?: Array<{ from: string; to: string }>;
      }
    | undefined,
): { steps: ObservedStepItem[]; mode: WorkflowMode } {
  if (observedSteps && observedSteps.length > 0) {
    return { steps: observedSteps, mode: "OBSERVED" };
  }
  const elById = new Map((modelData?.elements ?? []).map((e) => [e.id, e.name]));
  const targetsBySource = new Map<string, Set<string>>();
  for (const edge of modelData?.edges ?? []) {
    const from = elById.get(edge.from);
    const to = elById.get(edge.to);
    if (!from || !to || from === to) continue;
    targetsBySource.set(from, (targetsBySource.get(from) ?? new Set()).add(to));
  }
  const planned: ObservedStepItem[] = [];
  for (const req of plannedRequests) {
    const method = (req.method || "GET").toUpperCase();
    planned.push({ stepOrder: planned.length + 1, callerService: "mavis-runner", calleeService: req.service, operation: req.path, httpMethod: method, provenanceType: "PLANNED" });
    const lowerPath = req.path.toLowerCase();
    for (const target of targetsBySource.get(req.service) ?? []) {
      // Only hops backed by a real model edge whose service name appears in the route.
      if (!lowerPath.includes(target.replace(/[-_]service$/i, "").toLowerCase())) continue;
      planned.push({ stepOrder: planned.length + 1, callerService: req.service, calleeService: target, operation: req.path, httpMethod: method, provenanceType: "PLANNED" });
    }
  }
  return { steps: planned, mode: "PLANNED" };
}

function buildRuntimeSequenceSvgString(
  steps: ObservedStepItem[],
  sessionTitle: string,
): { svgMarkup: string; width: number; height: number; participants: string[] } {
  const participants: string[] = [];
  const addParticipant = (name: string | null | undefined) => {
    const clean = (name ?? "").trim() || "unknown-service";
    if (!participants.includes(clean)) {
      participants.push(clean);
    }
    return clean;
  };

  for (const s of steps) {
    addParticipant(s.callerService);
    addParticipant(s.calleeService);
  }
  if (participants.length === 0) {
    participants.push("api-gateway", "service");
  }

  const colWidth = 220;
  const leftMargin = 130;
  const topMargin = 105;
  const rowHeight = 74;
  const headerBoxWidth = 176;
  const headerBoxHeight = 44;
  const bottomFooterSpace = 85;

  const width = Math.max(820, leftMargin * 2 + (participants.length - 1) * colWidth + 60);
  const height = topMargin + steps.length * rowHeight + bottomFooterSpace;

  const xOf = (svcName: string) => {
    const idx = Math.max(0, participants.indexOf(svcName));
    return leftMargin + idx * colWidth;
  };

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#0b1120;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">`,
  );

  parts.push(`
    <defs>
      <marker id="seq-sync-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polygon points="0 0, 10 4, 0 8" fill="#38bdf8" />
      </marker>
      <marker id="seq-get-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polygon points="0 0, 10 4, 0 8" fill="#10b981" />
      </marker>
      <marker id="seq-put-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polygon points="0 0, 10 4, 0 8" fill="#f59e0b" />
      </marker>
      <marker id="seq-err-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polygon points="0 0, 10 4, 0 8" fill="#f43f5e" />
      </marker>
      <marker id="seq-reply-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polyline points="1 1, 9 4, 1 7" fill="none" stroke="#34d399" stroke-width="1.8" />
      </marker>
    </defs>
  `);

  parts.push(
    `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />`,
  );
  const frameTitle = `sd Runtime Sequence · ${sessionTitle}`;
  const pentagonWidth = Math.min(width - 48, Math.max(320, frameTitle.length * 7.8 + 36));
  parts.push(
    `<polygon points="12,12 ${12 + pentagonWidth},12 ${12 + pentagonWidth},28 ${12 + pentagonWidth - 12},38 12,38" fill="#1e293b" stroke="#334155" stroke-width="1" />`,
  );
  parts.push(
    `<text x="24" y="29" fill="#e2e8f0" font-size="11.5" font-weight="bold">${escapeXml(frameTitle)}</text>`,
  );

  const lifelineTopY = topMargin - 10;
  const lifelineBottomY = height - bottomFooterSpace + 12;

  for (const svc of participants) {
    const cx = xOf(svc);
    const bx = cx - headerBoxWidth / 2;
    const by = 50;
    const footerY = lifelineBottomY;
    const displayLabel = svc === "mavis-runner" ? "⚡ mavis-runner" : `:${svc}`;
    const isRunner = svc === "mavis-runner";

    parts.push(
      `<line x1="${cx}" y1="${lifelineTopY}" x2="${cx}" y2="${lifelineBottomY}" stroke="#475569" stroke-width="1.5" stroke-dasharray="6 5" />`,
    );

    parts.push(
      `<rect x="${bx}" y="${by}" width="${headerBoxWidth}" height="${headerBoxHeight}" rx="6" fill="#1e293b" stroke="${isRunner ? "#a855f7" : "#38bdf8"}" stroke-width="1.5" />`,
    );
    parts.push(
      `<text x="${cx}" y="${by + 17}" text-anchor="middle" fill="#94a3b8" font-size="9.5">${isRunner ? "«actor»" : "«service»"}</text>`,
    );
    parts.push(
      `<text x="${cx}" y="${by + 33}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="bold">${escapeXml(displayLabel)}</text>`,
    );

    parts.push(
      `<rect x="${bx}" y="${footerY}" width="${headerBoxWidth}" height="34" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${cx}" y="${footerY + 21}" text-anchor="middle" fill="#cbd5e1" font-size="10.5" font-weight="bold">${escapeXml(displayLabel)}</text>`,
    );
  }

  steps.forEach((step, idx) => {
    const caller = (step.callerService ?? "").trim() || participants[0]!;
    const callee = (step.calleeService ?? "").trim() || participants[Math.min(1, participants.length - 1)]!;
    const x1 = xOf(caller);
    const x2 = xOf(callee);
    const callY = topMargin + idx * rowHeight + 18;
    const replyY = callY + 26;
    const status = step.httpStatusCode ?? 200;
    const isError = status >= 400;
    const verb = (step.httpMethod ?? "GET").toUpperCase();
    const strokeCol = methodStrokeColor(verb, isError);
    const markerId = isError
      ? "seq-err-arrow"
      : verb === "GET"
        ? "seq-get-arrow"
        : verb === "PUT"
          ? "seq-put-arrow"
          : "seq-sync-arrow";
    const durationText = step.durationMs != null ? `${step.durationMs} ms` : "duration n/a";
    const endpointLabel = `#${idx + 1} ${normalizeEndpointDisplay(step.httpMethod, step.operation, callee)}`;
    const replyLabel = `HTTP ${status} (${durationText})`;

    parts.push(
      `<rect x="${x1 - 5}" y="${callY - 6}" width="10" height="38" rx="2" fill="#0284c7" stroke="#38bdf8" stroke-width="1" />`,
    );
    parts.push(
      `<rect x="${x2 - 5}" y="${callY - 2}" width="10" height="32" rx="2" fill="${isError ? "#be123c" : "#059669"}" stroke="${isError ? "#fb7185" : "#34d399"}" stroke-width="1" />`,
    );

    if (x1 === x2) {
      const loopW = 48;
      parts.push(
        `<path d="M ${x1 + 5} ${callY} L ${x1 + loopW} ${callY} L ${x1 + loopW} ${callY + 20} L ${x1 + 6} ${callY + 20}" fill="none" stroke="${strokeCol}" stroke-width="1.8" marker-end="url(#${markerId})" />`,
      );
      parts.push(
        `<text x="${x1 + loopW + 6}" y="${callY + 13}" fill="#e2e8f0" font-size="10.5" font-weight="bold">${escapeXml(endpointLabel)} (${escapeXml(replyLabel)})</text>`,
      );
    } else {
      const dir = x2 > x1 ? 1 : -1;
      const startX = x1 + dir * 6;
      const endX = x2 - dir * 6;
      const midX = (startX + endX) / 2;

      parts.push(
        `<line x1="${startX}" y1="${callY}" x2="${endX}" y2="${callY}" stroke="${strokeCol}" stroke-width="2" marker-end="url(#${markerId})" />`,
      );

      const labelWidth = Math.min(Math.abs(endX - startX) + 90, Math.max(150, endpointLabel.length * 6.8 + 16));
      parts.push(
        `<rect x="${midX - labelWidth / 2}" y="${callY - 19}" width="${labelWidth}" height="15" rx="3" fill="#0f172a" opacity="0.92" />`,
      );
      parts.push(
        `<text x="${midX}" y="${callY - 8}" text-anchor="middle" fill="#f8fafc" font-size="10.5" font-weight="bold">${escapeXml(endpointLabel)}</text>`,
      );

      parts.push(
        `<line x1="${endX}" y1="${replyY}" x2="${startX}" y2="${replyY}" stroke="#34d399" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#seq-reply-arrow)" />`,
      );
      parts.push(
        `<text x="${midX}" y="${replyY - 4}" text-anchor="middle" fill="#6ee7b7" font-size="9.5">${escapeXml(replyLabel)}</text>`,
      );
    }
  });

  parts.push(`</svg>`);
  return { svgMarkup: parts.join("\n"), width, height, participants };
}

function RuntimeWorkflowTopologyCanvas({
  steps,
  planned,
  selectedService,
  onSelectService,
}: {
  steps: ObservedStepItem[];
  planned: boolean;
  selectedService: string | null;
  onSelectService: (svc: string | null) => void;
}) {
  const { nodes, edges, width, height } = useMemo(() => {
    const svcSet = new Set<string>();
    const edgeMap = new Map<
      string,
      {
        from: string;
        to: string;
        methods: Set<string>;
        count: number;
        totalMs: number;
        hasError: boolean;
        samplePath: string;
      }
    >();

    for (const st of steps) {
      const from = (st.callerService ?? "mavis-runner").trim() || "mavis-runner";
      const to = (st.calleeService ?? "service").trim() || "service";
      svcSet.add(from);
      svcSet.add(to);
      if (from === to) continue;
      const key = `${from}->${to}`;
      const existing = edgeMap.get(key) ?? {
        from,
        to,
        methods: new Set<string>(),
        count: 0,
        totalMs: 0,
        hasError: false,
        samplePath: normalizeEndpointDisplay(st.httpMethod, st.operation, to),
      };
      existing.methods.add((st.httpMethod ?? "GET").toUpperCase());
      existing.count += 1;
      existing.totalMs += st.durationMs ?? 0;
      if ((st.httpStatusCode ?? 200) >= 400) existing.hasError = true;
      edgeMap.set(key, existing);
    }

    const allServices = Array.from(svcSet);
    const tier0 = allServices.filter((s) => s === "mavis-runner" || s.toLowerCase().includes("client"));
    const tier1 = allServices.filter(
      (s) => !tier0.includes(s) && (s.toLowerCase().includes("gateway") || s.toLowerCase().includes("bff")),
    );
    const tier2 = allServices.filter((s) => !tier0.includes(s) && !tier1.includes(s));

    const columns: string[][] = [];
    if (tier0.length) columns.push(tier0);
    if (tier1.length) columns.push(tier1);
    if (tier2.length) {
      if (tier2.length > 3) {
        columns.push(tier2.slice(0, Math.ceil(tier2.length / 2)));
        columns.push(tier2.slice(Math.ceil(tier2.length / 2)));
      } else {
        columns.push(tier2);
      }
    }
    if (columns.length === 0) columns.push(["api-gateway"]);

    const maxRows = Math.max(1, ...columns.map((c) => c.length));
    const svgW = Math.max(820, columns.length * 260 + 80);
    const svgH = Math.max(300, maxRows * 115 + 80);

    const posMap = new Map<string, { x: number; y: number; tier: number }>();
    columns.forEach((col, colIdx) => {
      const colX = 130 + colIdx * 250;
      const totalColH = (col.length - 1) * 110;
      const startY = svgH / 2 - totalColH / 2;
      col.forEach((svc, rowIdx) => {
        posMap.set(svc, { x: colX, y: startY + rowIdx * 110, tier: colIdx });
      });
    });

    return {
      nodes: Array.from(posMap.entries()).map(([name, pos]) => ({ name, ...pos })),
      edges: Array.from(edgeMap.values()),
      width: svgW,
      height: svgH,
    };
  }, [steps]);

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-slate-950/90 p-4 space-y-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5" />
            {planned ? "Planned" : "Observed"} Service Call Topology ({nodes.length} Nodes · {edges.length} Channels)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {planned
              ? "PLANNED: built from your Step 2 requests and real model edges. Not executed yet, so no latency or status is shown."
              : "OBSERVED: built from captured trace spans. Click a service node to filter the calls below."}
          </p>
        </div>
        {selectedService && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs border-sky-500/40 text-sky-300"
            onClick={() => onSelectService(null)}
          >
            ✕ Clear Filter ({selectedService})
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#070d19] p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ minWidth: `${Math.min(width, 760)}px`, maxHeight: "420px" }}
          className="font-mono select-none"
        >
          <defs>
            <marker id="wf-arrow-ok" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill="#38bdf8" />
            </marker>
            <marker id="wf-arrow-get" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill="#10b981" />
            </marker>
            <marker id="wf-arrow-err" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill="#f43f5e" />
            </marker>
          </defs>

          {/* Animated Edges */}
          {edges.map((edge, idx) => {
            const p1 = nodes.find((n) => n.name === edge.from);
            const p2 = nodes.find((n) => n.name === edge.to);
            if (!p1 || !p2) return null;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const padStart = 78;
            const padEnd = 82;
            const x1 = p1.x + (dx / dist) * padStart;
            const y1 = p1.y + (dy / dist) * (padStart * 0.45);
            const x2 = p2.x - (dx / dist) * padEnd;
            const y2 = p2.y - (dy / dist) * (padEnd * 0.45);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const verbs = Array.from(edge.methods).join("/");
            const avgMs = Math.round(edge.totalMs / Math.max(1, edge.count));
            const stroke = methodStrokeColor(Array.from(edge.methods)[0], edge.hasError);
            const isDimmed =
              selectedService && edge.from !== selectedService && edge.to !== selectedService;

            return (
              <g key={idx} opacity={isDimmed ? 0.25 : 1}>
                {/* Base glow line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth="2"
                  strokeOpacity="0.3"
                />
                {/* Animated flow particles line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth="2.5"
                  strokeDasharray={planned ? "4 6" : "7 5"}
                  markerEnd={
                    edge.hasError
                      ? "url(#wf-arrow-err)"
                      : verbs === "GET"
                        ? "url(#wf-arrow-get)"
                        : "url(#wf-arrow-ok)"
                  }
                >
                  {!planned && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from="24"
                      to="0"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  )}
                </line>
                {/* Edge Badge */}
                <rect
                  x={midX - 58}
                  y={midY - 14}
                  width="116"
                  height="24"
                  rx="5"
                  fill="#0f172a"
                  stroke={stroke}
                  strokeWidth="1"
                />
                <text
                  x={midX}
                  y={midY + 2}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="9.5"
                  fontWeight="bold"
                >
                  {planned ? `${verbs} · PLANNED` : `${verbs} · ${edge.count}x (${avgMs}ms)`}
                </text>
              </g>
            );
          })}

          {/* Service Nodes */}
          {nodes.map((node) => {
            const isRunner = node.name === "mavis-runner";
            const isGateway = node.name.toLowerCase().includes("gateway");
            const isSelected = selectedService === node.name;
            const borderCol = isSelected
              ? "#facc15"
              : isRunner
                ? "#a855f7"
                : isGateway
                  ? "#10b981"
                  : "#38bdf8";
            const roleLabel = isRunner
              ? "⚡ TEST RUNNER"
              : isGateway
                ? "🌐 API GATEWAY"
                : "📦 MICROSERVICE";

            return (
              <g
                key={node.name}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectService(isSelected ? null : node.name)}
              >
                <rect
                  x={node.x - 76}
                  y={node.y - 28}
                  width="152"
                  height="56"
                  rx="10"
                  fill={isSelected ? "#1e293b" : "#0f172a"}
                  stroke={borderCol}
                  strokeWidth={isSelected ? "2.5" : "1.8"}
                />
                <circle cx={node.x - 60} cy={node.y - 10} r="4" fill={borderCol} />
                <text
                  x={node.x - 50}
                  y={node.y - 7}
                  fill="#94a3b8"
                  fontSize="8.5"
                  fontWeight="bold"
                >
                  {roleLabel}
                </text>
                <text
                  x={node.x}
                  y={node.y + 14}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="11"
                  fontWeight="bold"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function RuntimeSequenceDiagramCanvas({
  steps,
  sessionTitle,
  projectId,
  targetGraphModelId,
  sessionId,
}: {
  steps: ObservedStepItem[];
  sessionTitle: string;
  projectId: string;
  targetGraphModelId?: string | null | undefined;
  sessionId: string;
}) {
  const [zoomPct, setZoomPct] = useState(100);
  const { svgMarkup, participants } = useMemo(
    () => buildRuntimeSequenceSvgString(steps, sessionTitle),
    [steps, sessionTitle],
  );

  const handleDownloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mavis-runtime-sequence-${sessionId.slice(0, 8)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-slate-950/90 p-4 space-y-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            UML 2.5.1 Runtime Sequence Diagram ({participants.length} Lifelines · {steps.length} Causal Calls)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Sequence diagram reconstructed from runtime trace spans and service interactions. Horizontal axis shows microservice lifelines, vertical axis preserves call order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setZoomPct((z) => Math.max(60, z - 15))}
          >
            −
          </Button>
          <span className="font-mono text-xs text-slate-300 px-1.5">{zoomPct}%</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setZoomPct((z) => Math.min(160, z + 15))}
          >
            +
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => setZoomPct(100)}
          >
            100%
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
            onClick={handleDownloadSvg}
          >
            ⬇️ Download .SVG
          </Button>
          {sessionId !== "preview" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
              asChild
            >
              <Link
                href={`/diagrams?project=${projectId}${targetGraphModelId ? `&model=${targetGraphModelId}` : ""}&kind=UML_SEQUENCE&mode=observed&session=${sessionId}`}
              >
                📐 Open in Full Diagram Workspace
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[620px] rounded-lg border border-slate-800 bg-[#0b1120] p-2">
        <div
          style={{
            transform: `scale(${zoomPct / 100})`,
            transformOrigin: "top left",
          }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    </div>
  );
}

export function BackendRuntime({ administrative = false }: { administrative?: boolean }) {
  const { projectId } = useSelection();
  return <RuntimeProject key={projectId} administrative={administrative} />;
}

function RuntimeProject({ administrative = false }: { administrative?: boolean }) {
  const { t } = useLocale();
  const { projectId } = useSelection();
  const [vizMode, setVizMode] = useState<"both" | "topology" | "sequence">("both");
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string | null>(null);
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: !!projectId });
  const config = useApiQuery("runtimeConfiguration", { projectId }, { enabled: !!projectId });
  const autoSaveConfig = useApiMutation("saveRuntimeConfiguration");
  const saveDraft = useApiMutation("createScenario");
  const list = useApiQuery(
    "runtimeReadSessions",
    { projectId: administrative ? "*" : projectId },
    { enabled: administrative || !!projectId, poll: true },
  );
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const visible = administrative
    ? (list.data ?? []).filter(
        (s) =>
          (s.id + " " + (s.scenarioName ?? "")).toLowerCase().includes(search.toLowerCase()) &&
          (status === "all" || s.executionStatus === status),
      )
    : (list.data ?? []);
  const params = useSearchParams();
  const requestedSession = params.get("session") ?? "";
  const selectedId =
    visible.find((s) => s.id === selected)?.id ||
    (!administrative || (!search && status === "all") ? requestedSession : "") ||
    visible[0]?.id ||
    "";
  const session = useApiQuery(
    "runtimeReadSession",
    { sessionId: selectedId },
    { enabled: !!selectedId, poll: true },
  );
  const sessionOptions =
    session.data && !visible.some((s) => s.id === session.data?.id)
      ? [session.data, ...visible]
      : visible;
  const sequence = useApiQuery(
    "runtimeSequence",
    { sessionId: selectedId },
    {
      enabled:
        !!selectedId &&
        (["CAPTURED", "AVAILABLE", "COMPLETE", "COMPLETED", "PARTIAL"].includes(
          session.data?.evidenceStatus ?? "",
        ) ||
          ["COMPLETED", "COMPLETE"].includes(session.data?.executionStatus ?? "")),
    },
  );
  const stop = useApiMutation("runtimeStop");
  const approve = useApiMutation("runtimeApprove");
  const [action, setAction] = useState<"stop" | "approve" | null>(null);
  const models = useApiQuery("modelVersions", { projectId }, { enabled: !!projectId });
  const scenarios = useApiQuery("scenarios", { projectId }, { enabled: !!projectId });
  const staticModelsList = (models.data ?? []).filter(
    (m) => !("origin" in m) || (m as any).origin !== "RUNTIME_ENRICHED",
  );
  const storedDraft = useMemo(() => (projectId ? readStep1Target(projectId) : {}), [projectId]);
  const targetModelId =
    storedDraft.modelId ||
    (staticModelsList.find((m) => m.latest) ?? staticModelsList[0] ?? models.data?.[0])?.id;
  const modelDetail = useApiQuery(
    "model",
    { projectId, modelId: targetModelId ?? "" },
    { enabled: !!projectId && !!targetModelId },
  );
  const startRuntime = useApiMutation("startRuntime");
  const [quickRunRunning, setQuickRunRunning] = useState(false);
  const [quickRunMsg, setQuickRunMsg] = useState("");
  const [quickRunError, setQuickRunError] = useState("");

  const rawProfile = (config.data?.profile ?? {}) as Record<string, unknown>;
  const detectedEndpoints = useMemo(
    () =>
      Array.isArray(rawProfile["detectedEndpoints"])
        ? (rawProfile["detectedEndpoints"] as Array<{ service: string; method: string; path: string }>)
        : [],
    [config.data?.profile],
  );

  const plannedRequests = useMemo(() => {
    if (storedDraft.plannedSteps?.length) return storedDraft.plannedSteps;
    const saved = (scenarios.data?.[0]?.steps ?? []).flatMap((raw) => {
      try {
        const st = JSON.parse(raw) as { service?: string; method?: string; path?: string };
        return st.service && st.path ? [{ service: st.service, method: st.method ?? "GET", path: st.path }] : [];
      } catch {
        return [];
      }
    });
    return saved.length ? saved : detectedEndpoints.slice(0, 6);
  }, [storedDraft.plannedSteps, scenarios.data, detectedEndpoints]);

  const workflowData = useMemo(
    () => deriveWorkflowSteps(sequence.data?.steps, plannedRequests, modelDetail.data),
    [sequence.data?.steps, plannedRequests, modelDetail.data],
  );
  const observed = workflowData.mode === "OBSERVED";

  const filteredSteps = useMemo(() => {
    if (!selectedServiceFilter) return workflowData.steps;
    return workflowData.steps.filter(
      (s) =>
        s.callerService === selectedServiceFilter || s.calleeService === selectedServiceFilter,
    );
  }, [workflowData.steps, selectedServiceFilter]);

  const maxStepDuration = useMemo(
    () => Math.max(1, ...workflowData.steps.map((s) => s.durationMs ?? 0)),
    [workflowData.steps],
  );

  const handleQuickRun = async () => {
    if (!projectId || !snapshots.data?.length) return;
    setQuickRunRunning(true);
    setQuickRunMsg("Saving Step 1 & Step 2 draft configuration and launching runtime workflow...");
    setQuickRunError("");

    const stored = readStep1Target(projectId);
    const chosenModel =
      (stored.modelId ? (models.data ?? []).find((m) => m.id === stored.modelId) : undefined) ??
      staticModelsList.find((m) => m.latest) ??
      staticModelsList[0] ??
      models.data?.[0];
    const chosenSnapshotId =
      stored.snapshotId ||
      chosenModel?.snapshotId ||
      config.data?.snapshotId ||
      snapshots.data[0]?.id;

    if (!chosenSnapshotId || !chosenModel) {
      setQuickRunRunning(false);
      setQuickRunError("Select an analyzed snapshot and model in Step 1 first.");
      return;
    }

    try {
      // 1. Save complete Step 1 configuration
      const mergedMappings = {
        ...(rawProfile["serviceMappings"] && typeof rawProfile["serviceMappings"] === "object"
          ? (rawProfile["serviceMappings"] as Record<string, string>)
          : {}),
        ...(stored.serviceMappings ?? {}),
      };
      const mergedEnvVars = {
        ...(rawProfile["environmentVariables"] &&
        typeof rawProfile["environmentVariables"] === "object"
          ? (rawProfile["environmentVariables"] as Record<string, string>)
          : {}),
        ...(stored.envVars ?? {}),
      };
      const mergedSecretRefs = Array.from(
        new Set([
          ...(Array.isArray(rawProfile["secretReferences"])
            ? (rawProfile["secretReferences"] as unknown[]).map(String)
            : []),
          ...(stored.secretReferences ?? []),
          ...Object.keys(stored.secretValues ?? {}),
        ]),
      ).filter((k) => !(stored.dismissedSecretKeys ?? []).includes(k));

      const pinnedConfig = await autoSaveConfig.mutateAsync({
        projectId,
        profileId: stored.profileId || config.data?.profileId || "SPRING_BOOT_DOTNET_COMPOSE_V1",
        snapshotId: chosenSnapshotId,
        modelId: chosenModel.id,
        profile: {
          serviceMappings: mergedMappings,
          environmentVariables: mergedEnvVars,
          secretValues: stored.secretValues ?? {},
          secretReferences: mergedSecretRefs,
        },
        expectedRevision: config.data?.revision ?? 0,
      });

      // 2. Save Step 2 scenario steps
      const realServices = (modelDetail.data?.elements ?? []).filter(
        (e) => e.elementType === "SERVICE_CONTAINER",
      );
      const defaultSvc = realServices[0]?.name ?? "api-gateway";
      const draftSteps =
        stored.plannedSteps && stored.plannedSteps.length > 0
          ? stored.plannedSteps.map((st, idx) =>
              JSON.stringify({
                id: `step-${idx + 1}`,
                service: st.service || defaultSvc,
                method: st.method || "GET",
                path: st.path || "/health",
                expectedStatus: Number(st.status) || 200,
                ...(st.bodyReference ? { bodyReference: st.bodyReference } : {}),
              }),
            )
          : detectedEndpoints.length > 0
            ? detectedEndpoints.slice(0, 6).map((ep, idx) =>
                JSON.stringify({
                  id: `step-${idx + 1}`,
                  service: ep.service || defaultSvc,
                  method: ep.method || "GET",
                  path: ep.path.replace(/\{[^}/]+\}/g, "1"),
                  expectedStatus: 200,
                }),
              )
            : [
                JSON.stringify({
                  id: "step-1",
                  service: defaultSvc,
                  method: "GET",
                  path: "/health",
                  expectedStatus: 200,
                }),
              ];

      const scenarioName = stored.scenarioName || "Architecture Verification Scenario";
      // Reuse an identical saved scenario instead of piling up a new one on every click.
      const savedScenario =
        (scenarios.data ?? []).find(
          (sc) => sc.name === scenarioName && JSON.stringify(sc.steps) === JSON.stringify(draftSteps),
        ) ?? (await saveDraft.mutateAsync({ projectId, name: scenarioName, steps: draftSteps }));
      const defaultBody = '{"customerEmail":"alice@mavis.io","productCode":"SKU-LAPTOP-01","quantity":1}';
      const environment = Object.fromEntries(
        (stored.plannedSteps ?? [])
          .filter((st) => st.bodyReference && ["POST", "PUT", "PATCH"].includes(st.method))
          .map((st) => [st.bodyReference!, stored.plannedInputs?.[st.bodyReference!] || defaultBody]),
      );

      // 3. Dispatch runtime session
      const res = await startRuntime.mutateAsync({
        projectId,
        snapshotId: chosenSnapshotId,
        modelId: chosenModel.id,
        scenarioId: savedScenario.id,
        scenarioName: savedScenario.name,
        configurationRevision: pinnedConfig.revision,
        scenarioRevision: savedScenario.revision,
        approved: true,
        ...(Object.keys(environment).length ? { environment } : {}),
      });

      setSelected(res.id);
      setQuickRunMsg(
        `Session ${res.id.slice(0, 8)} launched! Status: ${translatedStatusLabel(res.executionStatus || res.status, t)}`,
      );
      void list.refetch();
      void session.refetch();
      void sequence.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setQuickRunMsg("");
      setQuickRunError("Runtime launch failed: " + msg);
    } finally {
      setQuickRunRunning(false);
    }
  };

  if (!projectId && !administrative)
    return (
      <DetailPanel title="Runtime">
        <p>Select a project to check source eligibility and inspect its runtime sessions.</p>
      </DetailPanel>
    );

  const execStatus = (session.data?.executionStatus ?? "").toUpperCase();
  const isCompleted = ["COMPLETED", "COMPLETE"].includes(execStatus);
  const isRunning = active.has(execStatus);

  const evidence = (session.data?.evidenceStatus ?? "").toUpperCase();
  const isFailed = ["FAILED", "TIMED_OUT", "TIMEOUT", "CANCELLED"].includes(execStatus);
  const hasSession = Boolean(session.data);
  const pipelineStages = [
    { num: 1, title: "Configuration pinned", desc: hasSession ? "Revision & profile saved" : "Saved when you run", done: hasSession, current: false },
    { num: 2, title: "Runner dispatched", desc: hasSession ? execStatus || "Queued" : "Not started", done: hasSession && !["NOT_STARTED", "PENDING"].includes(execStatus), current: ["APPROVED", "READY_FOR_DISPATCH", "ALLOCATED"].includes(execStatus) },
    { num: 3, title: "Scenario executing", desc: `${plannedRequests.length} planned requests`, done: isCompleted, current: execStatus === "RUNNING" },
    { num: 4, title: "Trace captured", desc: observed ? `${workflowData.steps.length} observed spans` : evidence || "No trace yet", done: observed, current: false },
    { num: 5, title: "Model enriched", desc: session.data?.enrichedModelId ? "RUNTIME_ENRICHED ready" : "Pending", done: Boolean(session.data?.enrichedModelId), current: false },
  ];

  return (
    <div className="space-y-5">
      <RuntimeStepperBanner currentStep={3} projectId={projectId} />

      {!administrative && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-sky-500/5 to-emerald-500/10 p-4 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Zap className="h-4 w-4 text-primary animate-pulse" />
                <h4 className="font-bold text-sm text-foreground">
                  Step 3: Live Runtime Workflow Execution & Architecture Visualization
                </h4>
                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-mono font-semibold ${observed ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-slate-500/15 text-slate-300 border-slate-500/30"}`}>
                  {observed ? "🟢 Observed trace" : "◌ Planned workflow (not executed)"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Saves your complete Step 1 & Step 2 runtime configuration, executes the HTTP test workflow, and visualizes service call topology and UML sequence diagrams in real time.
              </p>
              {quickRunMsg && (
                <p className="text-xs font-medium text-emerald-400 mt-1">{quickRunMsg}</p>
              )}
              {quickRunError && (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-2 mt-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{quickRunError}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-9"
                asChild
              >
                <Link href={`/scenarios?project=${projectId}`}>← Edit Scenario in Step 2</Link>
              </Button>
              <Button
                onClick={handleQuickRun}
                disabled={quickRunRunning || !snapshots.data?.length}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 shadow"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {quickRunRunning ? "Saving & Running Workflow..." : "⚡ Save & Run Workflow Now"}
              </Button>
            </div>
          </div>

          {/* 5-Stage Visual Execution Pipeline */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
            {pipelineStages.map((st) => (
              <div
                key={st.num}
                className={`rounded-lg border p-2.5 text-xs transition ${
                  isFailed && !st.done && st.num > 1
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : st.current
                    ? "border-sky-400 bg-sky-500/15 text-sky-200 shadow-sm"
                    : st.done
                      ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                      : "border-border/60 bg-background/40 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      st.current
                        ? "bg-sky-400 text-slate-950 animate-pulse"
                        : st.done
                          ? "bg-emerald-500 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {st.done && !st.current ? "✓" : st.num}
                  </span>
                  <span className="truncate">{st.title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 pl-7 truncate">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {administrative && (
        <>
          <AdminToolbar
            fetching={list.isFetching}
            updatedAt={list.dataUpdatedAt}
            refresh={() => void list.refetch()}
          >
            <span className="text-sm text-muted-foreground">
              Latest 50 sessions · inspect before stopping a run
            </span>
          </AdminToolbar>
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
            <SearchInput label="Search session or scenario" value={search} onChange={setSearch} />
            <SelectField
              label="Execution status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                ...Array.from(new Set((list.data ?? []).map((s) => s.executionStatus)))
                  .sort()
                  .map((value) => ({ value, label: translatedStatusLabel(value, t) })),
              ]}
            />
          </div>
        </>
      )}

      {/* Main Visualization & Session Workspace */}
      <DetailPanel title="1. Runtime Workflow Visualization">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={vizMode === "both" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setVizMode("both")}
              >
                <Layers className="h-3.5 w-3.5 mr-1.5" />
                Split View (Topology + Sequence)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={vizMode === "topology" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setVizMode("topology")}
              >
                <Network className="h-3.5 w-3.5 mr-1.5" />
                🕸️ Service Workflow Topology
              </Button>
              <Button
                type="button"
                size="sm"
                variant={vizMode === "sequence" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setVizMode("sequence")}
              >
                <GitCommit className="h-3.5 w-3.5 mr-1.5" />
                📐 UML 2.5.1 Sequence Diagram
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sessionOptions.length > 0 && (
                <select
                  aria-label="Runtime session"
                  className="h-8 rounded-md border bg-background px-2.5 text-xs font-mono"
                  value={selectedId}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {sessionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.scenarioName ?? s.id.slice(0, 8)} ·{" "}
                      {translatedStatusLabel(s.executionStatus, t)}
                    </option>
                  ))}
                </select>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                asChild
              >
                <Link
                  href={`/architecture?project=${projectId}${
                    (session.data?.enrichedModelId ?? targetModelId)
                      ? `&model=${session.data?.enrichedModelId ?? targetModelId}`
                      : ""
                  }`}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open Architecture Graph Explorer
                </Link>
              </Button>
            </div>
          </div>

          {list.isPending && <p className="text-xs text-muted-foreground">Loading runtime sessions…</p>}
          {list.isError && <ErrorState error={list.error} />}
          {session.isError && <ErrorState error={session.error} />}
          {sequence.isError && <ErrorState error={sequence.error} />}
          {!list.isPending && !list.isError && !visible.length && !selectedId && (
            <p className="text-xs text-muted-foreground">
              No runtime session yet. The diagram below is the planned workflow; run it to capture a real trace.
            </p>
          )}
          {isFailed && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Session {execStatus}: no trace was captured, so nothing below is observed evidence. The runner host
                needs Docker and the .NET SDK to execute scenarios.
              </span>
            </div>
          )}

          {observed && (() => {
            const services = Array.from(
              new Set(
                workflowData.steps
                  .flatMap((s) => [s.callerService, s.calleeService])
                  .filter((s): s is string => Boolean(s)),
              ),
            );
            const timed = workflowData.steps.filter((s) => s.durationMs != null);
            const slowest = [...timed].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0];
            return (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs space-y-0.5">
                <p className="font-semibold text-foreground">
                  Trace summary: {workflowData.steps.length} observed calls across {services.length} services
                </p>
                {slowest && (
                  <p className="text-muted-foreground">
                    Slowest observed hop: {slowest.callerService} → {slowest.calleeService} (
                    {normalizeEndpointDisplay(slowest.httpMethod, slowest.operation, slowest.calleeService)},{" "}
                    {slowest.durationMs} ms)
                  </p>
                )}
              </div>
            );
          })()}

          {/* Visual Canvas 1: Service Workflow Topology */}
          {(vizMode === "both" || vizMode === "topology") && (
            <RuntimeWorkflowTopologyCanvas
              steps={workflowData.steps}
              planned={!observed}
              selectedService={selectedServiceFilter}
              onSelectService={setSelectedServiceFilter}
            />
          )}

          {/* Visual Canvas 2: UML 2.5.1 Sequence Diagram */}
          {(vizMode === "both" || vizMode === "sequence") && !observed && (
            <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
              The UML sequence diagram is drawn only from captured trace spans. It appears after a run records
              evidence.
            </p>
          )}
          {(vizMode === "both" || vizMode === "sequence") && observed && (
            <RuntimeSequenceDiagramCanvas
              steps={filteredSteps}
              sessionTitle={
                session.data?.scenarioName ??
                storedDraft.scenarioName ??
                "Architecture Verification Workflow"
              }
              projectId={projectId}
              targetGraphModelId={session.data?.enrichedModelId ?? targetModelId}
              sessionId={selectedId || "preview"}
            />
          )}
        </div>
      </DetailPanel>

      {/* Step-by-Step Waterfall Timeline & Session Controls */}
      <DetailPanel title={observed ? "2. Observed HTTP Calls" : "2. Planned HTTP Calls (not executed)"}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Activity className="h-3.5 w-3.5 text-primary" />
              {observed ? "Observed calls" : "Planned calls"} ({filteredSteps.length} of {workflowData.steps.length})
            </p>
            {selectedServiceFilter && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelectedServiceFilter(null)}
              >
                Show all ({workflowData.steps.length})
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {filteredSteps.map((step, i) => {
              const dur = step.durationMs;
              const widthPct = dur == null ? 0 : Math.max(4, Math.min(100, Math.round((dur / maxStepDuration) * 100)));
              const method = (step.httpMethod ?? "GET").toUpperCase();
              const statusCode = step.httpStatusCode;
              return (
                <div
                  key={`${step.traceId ?? "trace"}:${i}`}
                  className="rounded-lg border border-border/80 bg-muted/15 p-3 shadow-sm space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                        {step.stepOrder ?? i + 1}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${httpMethodBadgeClass(method)}`}
                      >
                        {method}
                      </span>
                      <span className="rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 font-semibold">
                        {step.callerService ?? "Caller"}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 font-semibold">
                        {step.calleeService ?? "Receiver"}
                      </span>
                      <span className="text-foreground font-semibold">
                        {normalizeEndpointDisplay(step.httpMethod, step.operation, step.calleeService)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      {statusCode != null ? (
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            statusCode >= 200 && statusCode < 300
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          }`}
                        >
                          HTTP {statusCode}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded border border-dashed text-muted-foreground">PLANNED</span>
                      )}
                      {dur != null && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {dur} ms
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Relative duration bar (observed calls only) */}
                  {dur != null && (
                    <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {session.data && (
            <div className="border-t pt-4 mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { key: "executionStatus", label: "Execution status" },
                  { key: "scenarioStatus", label: "Scenario status" },
                  { key: "evidenceStatus", label: "Evidence status" },
                  { key: "cleanupStatus", label: "Cleanup status" },
                  { key: "traceQuality", label: "Trace quality" },
                  { key: "mappingStatus", label: "Mapping status" },
                ].map(({ key, label }) => (
                  <div key={key} className="rounded border bg-muted/20 p-2">
                    <dt className="text-[11px] text-muted-foreground">{label}</dt>
                    <dd className="text-xs font-semibold mt-0.5">
                      <StatusLabel
                        status={String(
                          session.data?.[key as keyof NonNullable<typeof session.data>] ?? "n/a",
                        )}
                      />
                    </dd>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Source: {session.data.snapshotId} · Model:{" "}
                  {session.data.modelId ?? "Not reported"} · Profile:{" "}
                  {session.data.profileName ?? "SPRING_BOOT_DOTNET_COMPOSE_V1"}
                </span>
                <div className="flex gap-2">
                  {["NOT_STARTED", "PENDING"].includes(session.data.executionStatus) && (
                    <Button size="sm" disabled={approve.isPending} onClick={() => setAction("approve")}>
                      Approve operator session
                    </Button>
                  )}
                  {active.has(session.data.executionStatus) &&
                    session.data.executionStatus !== "CANCELLING" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={stop.isPending}
                        onClick={() => setAction("stop")}
                      >
                        Stop session
                      </Button>
                    )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DetailPanel>

      <ConfirmDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={action === "approve" ? "Approve this pinned session?" : "Stop this runtime session?"}
        description={
          action === "approve"
            ? "The operator must launch the approved workload. Status changes only after actual Runner lifecycle acknowledgements."
            : "The request is scoped to this session. Cleanup is confirmed separately after the Runner finishes."
        }
        pending={stop.isPending || approve.isPending}
        error={
          stop.isError ? (
            <ErrorState error={stop.error} />
          ) : approve.isError ? (
            <ErrorState error={approve.error} />
          ) : undefined
        }
        onConfirm={() => {
          const mutation = action === "approve" ? approve : stop;
          mutation.mutate({ sessionId: selectedId }, { onSuccess: () => setAction(null) });
        }}
      />
    </div>
  );
}

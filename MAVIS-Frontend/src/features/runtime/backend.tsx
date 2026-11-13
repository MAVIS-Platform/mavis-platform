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
  Play,
  Loader2,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  RuntimeStepperBanner,
  readStep1Target,
  writeStep1Target,
  httpMethodBadgeClass,
  isKnownInfraName,
  sanitizeServiceRoles,
} from "./screens";
import {
  boundRuntimeEnvironment,
  classifyApiFeatureCluster,
  resolveRuntimeTargetModel,
  type ApiFeatureClusterId,
  type ApiFeatureClusterMeta,
} from "./scenario-suggestions";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useApiMutation, useApiQuery, useSelection } from "@/hooks/use-api";
import { DetailPanel, StatusLabel } from "@/components/shared/data";
import { translatedStatusLabel } from "@/lib/status-label";
import { useLocale } from "@/lib/i18n/locale-context";
import { ErrorState } from "@/components/shared/request-state";
import { ConfirmDialog, Pagination, SearchInput, SelectField } from "@/components/shared/forms";
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

const TRACE_GROUP_PAGE_SIZE = 5;

function isRunnerActor(serviceName: string | null | undefined): boolean {
  const s = (serviceName ?? "").trim().toLowerCase();
  return s === "mavis-runner" || s === "scenario-runner";
}

function cleanServiceSlug(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^fruit[-_]/i, "")
    .replace(/[-_\s]*(service|services|api|app|svc|server|backend|container)$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

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
        elements?: Array<{
          id: string;
          name: string;
          elementType?: string | null | undefined;
          parentId?: string | null | undefined;
        }>;
        edges?: Array<{ from: string; to: string }>;
      }
    | undefined,
  serviceMappings?: Record<string, string>,
): { steps: ObservedStepItem[]; mode: WorkflowMode } {
  if (observedSteps && observedSteps.length > 0) {
    const isRegistryName = (name?: string | null) =>
      /^(service-discovery|discovery-service|eureka-server|eureka|config-server|consul)$/i.test(
        (name ?? "").trim(),
      );
    const businessSteps = observedSteps.filter(
      (s) => !isRegistryName(s.callerService) && !isRegistryName(s.calleeService),
    );
    const activeSteps =
      businessSteps.length > 0 && businessSteps.length < observedSteps.length
        ? businessSteps.map((s, idx) =>
            s.stepOrder !== undefined ? { ...s, stepOrder: idx + 1 } : s,
          )
        : observedSteps;
    return { steps: activeSteps, mode: "OBSERVED" };
  }

  const elements = modelData?.elements ?? [];
  const elemById = new Map(elements.map((e) => [e.id, e]));
  const resolveContainerId = (rawId: string): string | null => {
    let cur = elemById.get(rawId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (!cur.elementType || cur.elementType === "SERVICE_CONTAINER" || !cur.parentId) {
        return cur.id;
      }
      const parent = elemById.get(cur.parentId);
      if (!parent) return cur.id;
      cur = parent;
    }
    return cur?.id ?? null;
  };

  const slugToElementIds = new Map<string, string[]>();
  const lowerNameToId = new Map<string, string>();
  for (const el of elements) {
    if (el.elementType && el.elementType !== "SERVICE_CONTAINER") continue;
    lowerNameToId.set(el.name.trim().toLowerCase(), el.id);
    const slug = cleanServiceSlug(el.name);
    if (slug) {
      slugToElementIds.set(slug, [...(slugToElementIds.get(slug) ?? []), el.id]);
    }
  }
  if (lowerNameToId.size === 0) {
    for (const el of elements) {
      lowerNameToId.set(el.name.trim().toLowerCase(), el.id);
      const slug = cleanServiceSlug(el.name);
      if (slug) {
        slugToElementIds.set(slug, [...(slugToElementIds.get(slug) ?? []), el.id]);
      }
    }
  }

  const elementIdToDisplayName = new Map<string, string>();
  for (const el of elements) {
    elementIdToDisplayName.set(el.id, el.name);
  }
  const mappingEntries = Object.entries(serviceMappings ?? {});
  const serviceToElementId = (svcName: string): string | null => {
    const trimmed = svcName.trim();
    if (!trimmed) return null;
    const directMapped =
      serviceMappings?.[trimmed] ??
      mappingEntries.find(([k]) => k.trim().toLowerCase() === trimmed.toLowerCase())?.[1];
    if (directMapped) {
      if (elemById.has(directMapped)) return resolveContainerId(directMapped);
      const byMappedName = lowerNameToId.get(directMapped.trim().toLowerCase());
      if (byMappedName) return byMappedName;
    }
    const byName = lowerNameToId.get(trimmed.toLowerCase());
    if (byName) return byName;
    const slug = cleanServiceSlug(trimmed);
    const slugMatches = slug ? slugToElementIds.get(slug) : undefined;
    if (slugMatches && slugMatches.length === 1) return slugMatches[0]!;
    return null;
  };

  for (const [composeSvc, targetToken] of mappingEntries) {
    const resolvedId = elemById.has(targetToken)
      ? resolveContainerId(targetToken)
      : (lowerNameToId.get(targetToken.trim().toLowerCase()) ?? null);
    if (resolvedId && composeSvc.trim()) {
      elementIdToDisplayName.set(resolvedId, composeSvc.trim());
    }
  }

  const targetIdsBySourceId = new Map<string, Set<string>>();
  for (const edge of modelData?.edges ?? []) {
    const fromId = resolveContainerId(edge.from);
    const toId = resolveContainerId(edge.to);
    if (!fromId || !toId || fromId === toId) continue;
    targetIdsBySourceId.set(fromId, (targetIdsBySourceId.get(fromId) ?? new Set()).add(toId));
  }

  const planned: ObservedStepItem[] = [];
  for (const req of plannedRequests) {
    const method = (req.method || "GET").toUpperCase();
    planned.push({
      stepOrder: planned.length + 1,
      callerService: "mavis-runner",
      calleeService: req.service,
      operation: req.path,
      httpMethod: method,
      provenanceType: "PLANNED",
    });
    const lowerPath = req.path.toLowerCase();
    const srcId = serviceToElementId(req.service);
    if (!srcId) continue;
    for (const targetId of targetIdsBySourceId.get(srcId) ?? []) {
      const targetElem = elemById.get(targetId);
      const displayTarget = elementIdToDisplayName.get(targetId) ?? targetElem?.name;
      if (!displayTarget || displayTarget === req.service) continue;
      const candidateTokens = [
        displayTarget.replace(/[-_]service$/i, "").toLowerCase(),
        (targetElem?.name ?? "").replace(/[-_]service$/i, "").toLowerCase(),
        cleanServiceSlug(displayTarget),
        cleanServiceSlug(targetElem?.name),
      ].filter((tok) => tok.length >= 2);
      // Only hops backed by a real model edge whose service name/slug appears in the route.
      if (!candidateTokens.some((tok) => lowerPath.includes(tok))) continue;
      planned.push({
        stepOrder: planned.length + 1,
        callerService: req.service,
        calleeService: displayTarget,
        operation: req.path,
        httpMethod: method,
        provenanceType: "PLANNED",
      });
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

  const colWidth = 260;
  const leftMargin = 150;
  const topMargin = 105;
  const rowHeight = 74;
  const headerBoxWidth = 176;
  const headerBoxHeight = 44;
  const bottomFooterSpace = 85;

  const width = Math.max(880, leftMargin * 2 + (participants.length - 1) * colWidth + 60);
  const height = topMargin + steps.length * rowHeight + bottomFooterSpace;

  const xOf = (svcName: string) => {
    const idx = Math.max(0, participants.indexOf(svcName));
    return leftMargin + idx * colWidth;
  };

  const escapeXml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    const isRunner = isRunnerActor(svc);
    const displayLabel = isRunner ? `⚡ ${svc}` : `:${svc}`;

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
    const callee =
      (step.calleeService ?? "").trim() || participants[Math.min(1, participants.length - 1)]!;
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

      const labelWidth = Math.min(
        Math.abs(endX - startX) + 90,
        Math.max(150, endpointLabel.length * 6.8 + 16),
      );
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const dragRef = useRef<{
    name: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const { baseNodes, edges, width, height } = useMemo(() => {
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
    const tier0 = allServices.filter((s) => isRunnerActor(s) || s.toLowerCase().includes("client"));
    const tier1 = allServices.filter(
      (s) =>
        !tier0.includes(s) &&
        (s.toLowerCase().includes("gateway") || s.toLowerCase().includes("bff")),
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
    const svgW = Math.max(880, columns.length * 300 + 120);
    const svgH = Math.max(360, maxRows * 130 + 110);

    const posMap = new Map<string, { x: number; y: number; tier: number }>();
    columns.forEach((col, colIdx) => {
      const colX = 140 + colIdx * 290;
      const totalColH = (col.length - 1) * 125;
      const startY = svgH / 2 - totalColH / 2;
      col.forEach((svc, rowIdx) => {
        posMap.set(svc, { x: colX, y: startY + rowIdx * 125, tier: colIdx });
      });
    });

    return {
      baseNodes: Array.from(posMap.entries()).map(([name, pos]) => ({ name, ...pos })),
      edges: Array.from(edgeMap.values()),
      width: svgW,
      height: svgH,
    };
  }, [steps]);

  const nodes = useMemo(
    () =>
      baseNodes.map((n) => {
        const custom = customPositions[n.name];
        return custom
          ? {
              ...n,
              x: Math.max(84, Math.min(width - 84, custom.x)),
              y: Math.max(40, Math.min(height - 40, custom.y)),
            }
          : n;
      }),
    [baseNodes, customPositions, width, height],
  );

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const ctm = svg.getScreenCTM?.();
    if (ctm && typeof svg.createSVGPoint === "function") {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * width,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * height,
    };
  };

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-slate-950/90 p-4 space-y-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5" />
            {planned ? "Planned" : "Observed"} Service Call Topology ({nodes.length} Nodes ·{" "}
            {edges.length} Channels)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {planned
              ? "PLANNED: built from your Step 2 requests and real model edges. Drag nodes to rearrange or click a node to filter."
              : "OBSERVED: built from captured trace spans. Drag nodes to rearrange or click a service node to filter calls below."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(customPositions).length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={() => setCustomPositions({})}
            >
              ↺ Reset Layout
            </Button>
          )}
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
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#070d19] p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ maxHeight: "460px", touchAction: "none" }}
          className="font-mono select-none"
        >
          <defs>
            <marker
              id="wf-arrow-ok"
              markerWidth="9"
              markerHeight="7"
              refX="8"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 9 3.5, 0 7" fill="#38bdf8" />
            </marker>
            <marker
              id="wf-arrow-get"
              markerWidth="9"
              markerHeight="7"
              refX="8"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 9 3.5, 0 7" fill="#10b981" />
            </marker>
            <marker
              id="wf-arrow-err"
              markerWidth="9"
              markerHeight="7"
              refX="8"
              refY="3.5"
              orient="auto"
            >
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
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth="2"
                  strokeOpacity="0.3"
                />
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
                {!planned && (
                  <>
                    <circle r="7" fill={stroke} fillOpacity="0.28">
                      <animateMotion
                        dur="2.4s"
                        repeatCount="indefinite"
                        keyPoints="0;0;1;1"
                        keyTimes={p1.tier <= 1 ? "0;0.04;0.48;1" : "0;0.48;0.94;1"}
                        calcMode="linear"
                        path={`M ${x1} ${y1} L ${x2} ${y2}`}
                      />
                      <animate
                        attributeName="opacity"
                        values={p1.tier <= 1 ? "0;1;1;0;0" : "0;0;1;1;0"}
                        keyTimes={p1.tier <= 1 ? "0;0.04;0.46;0.50;1" : "0;0.46;0.50;0.92;1"}
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle r="4" fill="#f8fafc" stroke={stroke} strokeWidth="2">
                      <animateMotion
                        dur="2.4s"
                        repeatCount="indefinite"
                        keyPoints="0;0;1;1"
                        keyTimes={p1.tier <= 1 ? "0;0.04;0.48;1" : "0;0.48;0.94;1"}
                        calcMode="linear"
                        path={`M ${x1} ${y1} L ${x2} ${y2}`}
                      />
                      <animate
                        attributeName="opacity"
                        values={p1.tier <= 1 ? "0;1;1;0;0" : "0;0;1;1;0"}
                        keyTimes={p1.tier <= 1 ? "0;0.04;0.46;0.50;1" : "0;0.46;0.50;0.92;1"}
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}
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
            const isRunner = isRunnerActor(node.name);
            const isGateway = node.name.toLowerCase().includes("gateway");
            const isSelected = selectedService === node.name;
            const isDragging = draggingNode === node.name;
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
                style={{ cursor: isDragging ? "grabbing" : "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const pt = toSvgPoint(e.clientX, e.clientY);
                  dragRef.current = {
                    name: node.name,
                    offsetX: pt.x - node.x,
                    offsetY: pt.y - node.y,
                    startX: e.clientX,
                    startY: e.clientY,
                    moved: false,
                  };
                  setDraggingNode(node.name);
                }}
                onPointerMove={(e) => {
                  const activeDrag = dragRef.current;
                  if (!activeDrag || activeDrag.name !== node.name) return;
                  if (
                    Math.hypot(e.clientX - activeDrag.startX, e.clientY - activeDrag.startY) > 4
                  ) {
                    activeDrag.moved = true;
                  }
                  const pt = toSvgPoint(e.clientX, e.clientY);
                  const nextX = Math.max(84, Math.min(width - 84, pt.x - activeDrag.offsetX));
                  const nextY = Math.max(36, Math.min(height - 36, pt.y - activeDrag.offsetY));
                  setCustomPositions((prev) => ({
                    ...prev,
                    [node.name]: { x: nextX, y: nextY },
                  }));
                }}
                onPointerUp={(e) => {
                  const activeDrag = dragRef.current;
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                  dragRef.current = null;
                  setDraggingNode(null);
                  if (activeDrag && !activeDrag.moved) {
                    onSelectService(isSelected ? null : node.name);
                  }
                }}
                onPointerCancel={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                  dragRef.current = null;
                  setDraggingNode(null);
                }}
              >
                <rect
                  x={node.x - 76}
                  y={node.y - 28}
                  width="152"
                  height="56"
                  rx="10"
                  fill={isSelected ? "#1e293b" : "#0f172a"}
                  stroke={borderCol}
                  strokeWidth={isSelected || isDragging ? "2.5" : "1.8"}
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
            UML 2.5.1 Runtime Sequence Diagram ({participants.length} Lifelines · {steps.length}{" "}
            Causal Calls)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Sequence diagram reconstructed from runtime trace spans and service interactions.
            Horizontal axis shows microservice lifelines, vertical axis preserves call order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900">
            <button
              type="button"
              title="Zoom out"
              className="h-7 px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white rounded-l-md"
              onClick={() => setZoomPct((z) => Math.max(60, z - 15))}
            >
              −
            </button>
            <button
              type="button"
              title="Reset zoom to 100%"
              className="h-7 px-2 font-mono text-xs text-slate-300 hover:bg-slate-800 hover:text-white border-x border-slate-700"
              onClick={() => setZoomPct(100)}
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              title="Zoom in"
              className="h-7 px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white rounded-r-md"
              onClick={() => setZoomPct((z) => Math.min(160, z + 15))}
            >
              +
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs bg-slate-900 border-sky-400/50 text-sky-300 hover:bg-sky-950 hover:text-sky-200"
            onClick={handleDownloadSvg}
          >
            Download .SVG
          </Button>
          {projectId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs bg-slate-900 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950 hover:text-emerald-200"
              asChild
            >
              <Link
                href={`/diagrams?project=${encodeURIComponent(projectId)}${
                  targetGraphModelId ? `&model=${encodeURIComponent(targetGraphModelId)}` : ""
                }&kind=UML_SEQUENCE&mode=observed&session=${encodeURIComponent(sessionId)}`}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in Architecture Diagrams
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[620px] rounded-lg border border-slate-800 bg-[#0b1120] p-2">
        <div
          className="w-fit mx-auto"
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

function buildRuntimeActivitySvgString(
  steps: ObservedStepItem[],
  sessionTitle: string,
): { svgMarkup: string; width: number; height: number; partitions: string[] } {
  const partitions: string[] = [];
  const ensurePartition = (raw: string | null | undefined) => {
    const clean = (raw ?? "").trim();
    if (!clean || isRunnerActor(clean)) return;
    if (!partitions.includes(clean)) partitions.push(clean);
  };
  for (const s of steps) {
    ensurePartition(s.callerService);
    ensurePartition(s.calleeService);
  }
  if (partitions.length === 0) {
    const fallback =
      (steps[0]?.calleeService ?? steps[0]?.callerService ?? "service").trim() || "service";
    partitions.push(fallback);
  }

  const laneWidth = 310;
  const leftMargin = 24;
  const topMargin = 54;
  const headerHeight = 52;
  const rowHeight = 104;
  const nodeW = 246;
  const nodeH = 58;

  const width = Math.max(760, leftMargin * 2 + partitions.length * laneWidth);
  const totalRows = Math.max(1, steps.length) + 2;
  const laneHeight = headerHeight + totalRows * rowHeight + 36;
  const height = topMargin + laneHeight + 24;

  const laneIndex = (svc: string | null | undefined) => {
    const clean = (svc ?? "").trim();
    const idx = partitions.indexOf(clean);
    return idx >= 0 ? idx : 0;
  };
  const cxOfLane = (idx: number) => leftMargin + idx * laneWidth + laneWidth / 2;

  const escapeXml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#0b1120;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">`,
  );
  parts.push(`
    <defs>
      <marker id="act-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polyline points="1 1, 9 4, 1 7" fill="none" stroke="#38bdf8" stroke-width="1.8" />
      </marker>
      <marker id="act-err-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polyline points="1 1, 9 4, 1 7" fill="none" stroke="#f43f5e" stroke-width="1.8" />
      </marker>
    </defs>
  `);

  const frameTitle = `act Runtime Activity · ${sessionTitle}`;
  parts.push(
    `<text x="${leftMargin}" y="34" fill="#e2e8f0" font-size="12" font-weight="bold">${escapeXml(frameTitle)}</text>`,
  );

  // Swimlane partitions
  partitions.forEach((partName, idx) => {
    const lx = leftMargin + idx * laneWidth;
    const ly = topMargin;
    parts.push(
      `<rect x="${lx}" y="${ly}" width="${laneWidth}" height="${laneHeight}" fill="${
        idx % 2 === 0 ? "#0f172a" : "#111c33"
      }" stroke="#334155" stroke-width="1.5" />`,
    );
    parts.push(
      `<rect x="${lx}" y="${ly}" width="${laneWidth}" height="${headerHeight}" fill="#1e293b" stroke="#334155" stroke-width="1.5" />`,
    );
    parts.push(
      `<text x="${lx + laneWidth / 2}" y="${ly + 20}" text-anchor="middle" fill="#94a3b8" font-size="9.5">«partition»</text>`,
    );
    parts.push(
      `<text x="${lx + laneWidth / 2}" y="${ly + 38}" text-anchor="middle" fill="#f8fafc" font-size="11.5" font-weight="bold">${escapeXml(partName)}</text>`,
    );
  });

  if (steps.length > 0) {
    const firstStep = steps[0]!;
    const firstLane = laneIndex(
      firstStep.calleeService && !isRunnerActor(firstStep.calleeService)
        ? firstStep.calleeService
        : firstStep.callerService,
    );
    const initCx = cxOfLane(firstLane);
    const initCy = topMargin + headerHeight + 36;

    // Initial node
    parts.push(
      `<circle cx="${initCx}" cy="${initCy}" r="12" fill="#38bdf8" stroke="#bae6fd" stroke-width="2" />`,
    );

    let prevCx = initCx;
    let prevBottomY = initCy + 12;

    steps.forEach((step, idx) => {
      const targetSvc =
        step.calleeService && !isRunnerActor(step.calleeService)
          ? step.calleeService
          : step.callerService;
      const lIdx = laneIndex(targetSvc);
      const cx = cxOfLane(lIdx);
      const cy = topMargin + headerHeight + (idx + 1) * rowHeight;
      const topY = cy - nodeH / 2;
      const bottomY = cy + nodeH / 2;
      const status = step.httpStatusCode ?? 200;
      const isError = status >= 400;
      const verb = (step.httpMethod ?? "GET").toUpperCase();
      const strokeCol = methodStrokeColor(verb, isError);
      const endpointLabel = `#${idx + 1} ${normalizeEndpointDisplay(
        step.httpMethod,
        step.operation,
        targetSvc,
      )}`;
      const shortEndpoint =
        endpointLabel.length > 34 ? `${endpointLabel.slice(0, 32)}…` : endpointLabel;
      const durText = step.durationMs != null ? `${step.durationMs}ms` : "n/a";
      const caller = (step.callerService ?? "").trim();
      const fromText =
        caller && !isRunnerActor(caller) && caller !== targetSvc ? `from ${caller} · ` : "";
      const subLabel = `${fromText}HTTP ${status} · ${durText}`;

      // Orthogonal control-flow edge from previous node to this action node
      const midY = Math.round((prevBottomY + topY) / 2);
      const marker = isError ? "act-err-arrow" : "act-arrow";
      const edgeStroke = isError ? "#f43f5e" : "#38bdf8";
      if (prevCx === cx) {
        parts.push(
          `<line x1="${prevCx}" y1="${prevBottomY}" x2="${cx}" y2="${topY - 2}" stroke="${edgeStroke}" stroke-width="1.8" marker-end="url(#${marker})" />`,
        );
      } else {
        parts.push(
          `<path d="M ${prevCx} ${prevBottomY} L ${prevCx} ${midY} L ${cx} ${midY} L ${cx} ${topY - 2}" fill="none" stroke="${edgeStroke}" stroke-width="1.8" marker-end="url(#${marker})" />`,
        );
      }

      // Rounded UML Activity Action node
      parts.push(
        `<rect x="${cx - nodeW / 2}" y="${topY}" width="${nodeW}" height="${nodeH}" rx="18" fill="${
          isError ? "#3b0a1e" : "#0f172a"
        }" stroke="${strokeCol}" stroke-width="1.8" />`,
      );
      parts.push(
        `<text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#f8fafc" font-size="10.5" font-weight="bold">${escapeXml(shortEndpoint)}</text>`,
      );
      parts.push(
        `<text x="${cx}" y="${cy + 15}" text-anchor="middle" fill="${
          isError ? "#fda4af" : "#6ee7b7"
        }" font-size="9.5">${escapeXml(subLabel)}</text>`,
      );

      prevCx = cx;
      prevBottomY = bottomY;
    });

    // Activity Final node (bull's eye)
    const finalCx = prevCx;
    const finalCy = prevBottomY + 48;
    parts.push(
      `<line x1="${prevCx}" y1="${prevBottomY}" x2="${finalCx}" y2="${finalCy - 16}" stroke="#38bdf8" stroke-width="1.8" marker-end="url(#act-arrow)" />`,
    );
    parts.push(
      `<circle cx="${finalCx}" cy="${finalCy}" r="14" fill="none" stroke="#34d399" stroke-width="2" />`,
    );
    parts.push(`<circle cx="${finalCx}" cy="${finalCy}" r="8" fill="#34d399" />`);
  }

  parts.push(`</svg>`);
  return { svgMarkup: parts.join("\n"), width, height, partitions };
}

function RuntimeActivityDiagramCanvas({
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
  const { svgMarkup, partitions } = useMemo(
    () => buildRuntimeActivitySvgString(steps, sessionTitle),
    [steps, sessionTitle],
  );

  const handleDownloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mavis-runtime-activity-${sessionId.slice(0, 8)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-slate-950/90 p-4 space-y-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            UML 2.5.1 Runtime Activity Diagram ({partitions.length} Swimlanes · {steps.length}{" "}
            Actions)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Multi-swimlane activity workflow reconstructed from captured runtime spans. Each column
            is a microservice partition and each rounded node is an executed action.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900">
            <button
              type="button"
              title="Zoom out"
              className="h-7 px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white rounded-l-md"
              onClick={() => setZoomPct((z) => Math.max(60, z - 15))}
            >
              −
            </button>
            <button
              type="button"
              title="Reset zoom to 100%"
              className="h-7 px-2 font-mono text-xs text-slate-300 hover:bg-slate-800 hover:text-white border-x border-slate-700"
              onClick={() => setZoomPct(100)}
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              title="Zoom in"
              className="h-7 px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white rounded-r-md"
              onClick={() => setZoomPct((z) => Math.min(160, z + 15))}
            >
              +
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs bg-slate-900 border-sky-400/50 text-sky-300 hover:bg-sky-950 hover:text-sky-200"
            onClick={handleDownloadSvg}
          >
            Download .SVG
          </Button>
          {projectId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs bg-slate-900 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950 hover:text-emerald-200"
              asChild
            >
              <Link
                href={`/diagrams?project=${encodeURIComponent(projectId)}${
                  targetGraphModelId ? `&model=${encodeURIComponent(targetGraphModelId)}` : ""
                }&kind=UML_ACTIVITY&mode=observed&session=${encodeURIComponent(sessionId)}`}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in Architecture Diagrams
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[620px] rounded-lg border border-slate-800 bg-[#0b1120] p-2">
        <div
          className="w-fit mx-auto"
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

function studioMetric(value: unknown) {
  return typeof value === "number" ? Number(value.toFixed(2)) : "Unavailable";
}

export function BackendRuntime({ administrative = false }: { administrative?: boolean }) {
  const { projectId } = useSelection();
  return <RuntimeProject key={projectId} administrative={administrative} />;
}

function RuntimeProject({ administrative = false }: { administrative?: boolean }) {
  const { t } = useLocale();
  const { projectId } = useSelection();
  const [vizMode, setVizMode] = useState<"topology" | "sequence" | "activity">("topology");
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string | null>(null);
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<ApiFeatureClusterId | null>(
    null,
  );
  const [traceGroupPages, setTraceGroupPages] = useState<Record<string, number>>({});
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: !!projectId });
  const config = useApiQuery("runtimeConfiguration", { projectId }, { enabled: !!projectId });
  const autoSaveConfig = useApiMutation("saveRuntimeConfiguration");
  const buildImages = useApiMutation("buildRuntimeSandboxImages");
  const saveDraft = useApiMutation("createScenario");
  const updateScenario = useApiMutation("saveScenario");
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

  const upperEvidenceStatus = (session.data?.evidenceStatus ?? "").toUpperCase();
  const upperExecStatus = (session.data?.executionStatus ?? "").toUpperCase();
  const sequenceEnabled =
    !!selectedId &&
    (["CAPTURED", "AVAILABLE", "COMPLETE", "COMPLETED", "PARTIAL"].includes(upperEvidenceStatus) ||
      ["COMPLETED", "COMPLETE"].includes(upperExecStatus) ||
      Boolean(session.data?.enrichedModelId));

  const sequence = useApiQuery(
    "runtimeSequence",
    { sessionId: selectedId },
    { enabled: sequenceEnabled },
  );
  const stop = useApiMutation("runtimeStop");
  const approve = useApiMutation("runtimeApprove");
  const [action, setAction] = useState<"stop" | "approve" | null>(null);
  const models = useApiQuery("modelVersions", { projectId }, { enabled: !!projectId });
  const scenarios = useApiQuery("scenarios", { projectId }, { enabled: !!projectId });
  const staticModelsList = (models.data ?? []).filter(
    (m) => !("origin" in m) || (m as { origin?: string | null }).origin !== "RUNTIME_ENRICHED",
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
  const [studioAction, setStudioAction] = useState<"OBSERVE" | "STOP" | "START" | "SCALE">("OBSERVE");
  const [studioService, setStudioService] = useState("");
  const [studioReplicas, setStudioReplicas] = useState(2);

  useEffect(() => {
    setSelectedServiceFilter(null);
    setSelectedClusterFilter(null);
  }, [selectedId]);

  const lastSyncedSignature = useRef("");
  useEffect(() => {
    if (!selectedId || !session.data) return;
    const sig = `${selectedId}:${upperExecStatus}:${upperEvidenceStatus}:${session.data.enrichedModelId ?? ""}`;
    if (sig === lastSyncedSignature.current) return;
    lastSyncedSignature.current = sig;
    if (!active.has(upperExecStatus) || session.data.enrichedModelId) {
      void list.refetch();
      if (projectId) void models.refetch();
      if (sequenceEnabled) void sequence.refetch();
    }
  }, [
    selectedId,
    upperExecStatus,
    upperEvidenceStatus,
    session.data,
    sequenceEnabled,
    projectId,
    list,
    models,
    sequence,
  ]);

  const rawProfile = (config.data?.profile ?? {}) as Record<string, unknown>;
  const runtimeApplicationServices = useMemo(() => {
    const apps = rawProfile["applications"];
    return apps && typeof apps === "object" && !Array.isArray(apps) ? Object.keys(apps) : [];
  }, [rawProfile]);
  const selectedStudioService = studioService || runtimeApplicationServices[0] || "";
  const detectedEndpoints = useMemo(
    () =>
      Array.isArray(rawProfile["detectedEndpoints"])
        ? (rawProfile["detectedEndpoints"] as Array<{
            service: string;
            method: string;
            path: string;
            sampleJsonBody?: string;
          }>)
        : [],
    [config.data?.profile],
  );

  const effectiveServiceMappings = useMemo(
    () => ({
      ...(rawProfile["recommendedServiceMappings"] &&
      typeof rawProfile["recommendedServiceMappings"] === "object"
        ? (rawProfile["recommendedServiceMappings"] as Record<string, string>)
        : {}),
      ...(rawProfile["serviceMappings"] && typeof rawProfile["serviceMappings"] === "object"
        ? (rawProfile["serviceMappings"] as Record<string, string>)
        : {}),
      ...(storedDraft.serviceMappings ?? {}),
    }),
    [config.data?.profile, storedDraft.serviceMappings],
  );

  const savedScenarioSteps = useMemo(
    () =>
      (scenarios.data?.[0]?.steps ?? []).flatMap((raw) => {
        try {
          const st = JSON.parse(raw) as {
            service?: string;
            method?: string;
            path?: string;
            journeyPhase?: string;
            rationale?: string;
          };
          return st.service && st.path
            ? [
                {
                  service: st.service,
                  method: st.method ?? "GET",
                  path: st.path,
                  ...(st.journeyPhase ? { journeyPhase: st.journeyPhase } : {}),
                  ...(st.rationale ? { rationale: st.rationale } : {}),
                },
              ]
            : [];
        } catch {
          return [];
        }
      }),
    [scenarios.data],
  );

  const aiPhaseByRoute = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of [...savedScenarioSteps, ...(storedDraft.plannedSteps ?? [])]) {
      if (s.journeyPhase && s.path) {
        map.set(`${(s.method ?? "GET").toUpperCase()}:${s.path}`, s.journeyPhase);
        map.set(s.path, s.journeyPhase);
      }
    }
    return map;
  }, [savedScenarioSteps, storedDraft.plannedSteps]);

  const plannedRequests = useMemo(() => {
    if (session.data?.stepResults?.length) {
      return session.data.stepResults
        .filter((sr) => Boolean(sr.service && sr.path))
        .map((sr) => ({
          service: sr.service ?? "api-gateway",
          method: sr.method ?? "GET",
          path: sr.path ?? "/",
        }));
    }
    if (storedDraft.plannedSteps?.length) return storedDraft.plannedSteps;
    return savedScenarioSteps.length ? savedScenarioSteps : detectedEndpoints.slice(0, 6);
  }, [session.data?.stepResults, storedDraft.plannedSteps, savedScenarioSteps, detectedEndpoints]);

  const workflowData = useMemo(
    () =>
      deriveWorkflowSteps(
        sequence.data?.steps,
        plannedRequests,
        modelDetail.data,
        effectiveServiceMappings,
      ),
    [sequence.data?.steps, plannedRequests, modelDetail.data, effectiveServiceMappings],
  );
  const observed = workflowData.mode === "OBSERVED";

  const rootMetaByTraceId = useMemo(() => {
    const map = new Map<string, ApiFeatureClusterMeta>();
    for (const sr of session.data?.stepResults ?? []) {
      const tid = sr.traceId?.trim().toLowerCase();
      if (!tid || map.has(tid)) continue;
      const routeKey = `${(sr.method ?? "GET").toUpperCase()}:${sr.path ?? "/"}`;
      const aiPhase = aiPhaseByRoute.get(routeKey) ?? aiPhaseByRoute.get(sr.path ?? "");
      map.set(tid, classifyApiFeatureCluster(sr.path, "api-gateway", sr.service, aiPhase));
    }
    for (const st of workflowData.steps) {
      const tid = st.traceId?.trim().toLowerCase();
      if (!tid || map.has(tid)) continue;
      const callerLow = (st.callerService ?? "").toLowerCase();
      if (callerLow.includes("gateway") || isRunnerActor(st.callerService)) {
        const routeKey = `${(st.httpMethod ?? "GET").toUpperCase()}:${st.operation ?? "/"}`;
        const aiPhase = aiPhaseByRoute.get(routeKey) ?? aiPhaseByRoute.get(st.operation ?? "");
        map.set(
          tid,
          classifyApiFeatureCluster(st.operation, st.callerService, st.calleeService, aiPhase),
        );
      }
    }
    return map;
  }, [session.data?.stepResults, workflowData.steps, aiPhaseByRoute]);

  const resolveStepClusterMeta = (st: ObservedStepItem): ApiFeatureClusterMeta => {
    const tid = st.traceId?.trim().toLowerCase();
    if (tid && rootMetaByTraceId.has(tid)) {
      return rootMetaByTraceId.get(tid)!;
    }
    const routeKey = `${(st.httpMethod ?? "GET").toUpperCase()}:${st.operation ?? "/"}`;
    const aiPhase = aiPhaseByRoute.get(routeKey) ?? aiPhaseByRoute.get(st.operation ?? "");
    return classifyApiFeatureCluster(st.operation, st.callerService, st.calleeService, aiPhase);
  };

  const featureClusters = useMemo(() => {
    const byId = new Map<
      ApiFeatureClusterId,
      {
        meta: ApiFeatureClusterMeta;
        steps: ObservedStepItem[];
        services: Set<string>;
        routes: string[];
        firstIndex: number;
      }
    >();
    workflowData.steps.forEach((st, idx) => {
      const meta = resolveStepClusterMeta(st);
      let entry = byId.get(meta.id);
      if (!entry) {
        entry = { meta, steps: [], services: new Set<string>(), routes: [], firstIndex: idx };
        byId.set(meta.id, entry);
      }
      entry.steps.push(st);
      if (st.calleeService && st.calleeService !== "mavis-runner") {
        entry.services.add(st.calleeService);
      }
      const routeLabel = `${(st.httpMethod ?? "GET").toUpperCase()} ${st.operation ?? "/"}`;
      if (!entry.routes.includes(routeLabel)) {
        entry.routes.push(routeLabel);
      }
    });
    return Array.from(byId.values()).sort(
      (a, b) => a.firstIndex - b.firstIndex || a.meta.order - b.meta.order,
    );
  }, [workflowData.steps, rootMetaByTraceId, aiPhaseByRoute]);

  const filteredSteps = useMemo(() => {
    return workflowData.steps.filter((s) => {
      if (selectedClusterFilter) {
        const meta = resolveStepClusterMeta(s);
        if (meta.id !== selectedClusterFilter) return false;
      }
      if (selectedServiceFilter) {
        if (
          s.callerService !== selectedServiceFilter &&
          s.calleeService !== selectedServiceFilter
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    workflowData.steps,
    selectedClusterFilter,
    selectedServiceFilter,
    rootMetaByTraceId,
    aiPhaseByRoute,
  ]);

  const maxStepDuration = useMemo(
    () => Math.max(1, ...workflowData.steps.map((s) => s.durationMs ?? 0)),
    [workflowData.steps],
  );

  const handleQuickRun = async () => {
    if (!projectId || quickRunRunning) return;
    setQuickRunRunning(true);
    setQuickRunMsg("Saving Step 1 & Step 2 runtime configuration and launching workflow...");
    setQuickRunError("");

    const [snapshotsList, modelsList, configData, scenariosList] = await Promise.all([
      snapshots.data
        ? Promise.resolve(snapshots.data)
        : snapshots.refetch().then((r) => r.data ?? []),
      models.data ? Promise.resolve(models.data) : models.refetch().then((r) => r.data ?? []),
      config.data ? Promise.resolve(config.data) : config.refetch().then((r) => r.data),
      scenarios.data
        ? Promise.resolve(scenarios.data)
        : scenarios.refetch().then((r) => r.data ?? []),
    ]);

    const stored = readStep1Target(projectId);
    const chosenModel = resolveRuntimeTargetModel(
      modelsList,
      stored.modelId,
      configData?.modelId || session.data?.modelId,
    );
    const chosenSnapshotId =
      chosenModel?.snapshotId ||
      stored.snapshotId ||
      configData?.snapshotId ||
      session.data?.snapshotId ||
      snapshotsList[0]?.id;

    if (!chosenSnapshotId || !chosenModel) {
      setQuickRunRunning(false);
      setQuickRunMsg("");
      setQuickRunError("Select an analyzed snapshot and model in Step 1 first.");
      return;
    }

    try {
      const rawProfile = (configData?.profile ?? {}) as Record<string, unknown>;
      const activeEndpoints = Array.isArray(rawProfile["detectedEndpoints"])
        ? (rawProfile["detectedEndpoints"] as Array<{
            service: string;
            method: string;
            path: string;
            sampleJsonBody?: string;
          }>)
        : detectedEndpoints;
      const infraSet = new Set(
        Array.isArray(rawProfile["infrastructureServices"])
          ? (rawProfile["infrastructureServices"] as unknown[]).map(String)
          : [],
      );
      const mergedRoles = sanitizeServiceRoles({
        ...(rawProfile["serviceRoles"] && typeof rawProfile["serviceRoles"] === "object"
          ? (rawProfile["serviceRoles"] as Record<string, "APP" | "INFRA">)
          : {}),
        ...(stored.serviceRoles ?? {}),
      });
      const existingImageOverrides: Record<string, string> = {
        ...(rawProfile["serviceImageOverrides"] &&
        typeof rawProfile["serviceImageOverrides"] === "object"
          ? (rawProfile["serviceImageOverrides"] as Record<string, string>)
          : {}),
        ...(stored.serviceImageOverrides ?? {}),
      };

      const rawIssues = Array.isArray(rawProfile["unresolvableRunnerIssues"])
        ? (rawProfile["unresolvableRunnerIssues"] as unknown[]).map(String)
        : Array.isArray(rawProfile["runnerIssues"])
          ? (rawProfile["runnerIssues"] as unknown[]).map(String)
          : [];
      const localBuildAvailable = rawProfile["localImageBuildAvailable"] === true;
      const missingBuildServices = Array.from(
        new Set(
          rawIssues
            .map((iss) => {
              const m = /^Service '([^']+)' (?:uses build:|image |has no image)/i.exec(iss);
              return m?.[1] ?? "";
            })
            .filter(
              (svc) =>
                Boolean(svc) &&
                !existingImageOverrides[svc]?.trim() &&
                mergedRoles[svc] !== "INFRA",
            ),
        ),
      );

      let autoBuiltOverrides: Record<string, string> = {};
      let activeConfigRevision = Math.max(configData?.revision ?? 0, stored.savedRevision ?? 0);
      if (missingBuildServices.length > 0 && localBuildAvailable) {
        setQuickRunMsg(
          `🔨 Auto-building ${missingBuildServices.length} local sandbox image(s) (${missingBuildServices.join(", ")})...`,
        );
        const buildRes = await buildImages.mutateAsync({
          projectId,
          snapshotId: chosenSnapshotId,
          services: missingBuildServices,
        });
        autoBuiltOverrides = buildRes.builtImages ?? {};
        if (Object.keys(autoBuiltOverrides).length > 0) {
          writeStep1Target(projectId, {
            serviceImageOverrides: { ...existingImageOverrides, ...autoBuiltOverrides },
          });
          const refreshed = await config.refetch();
          if (refreshed.data?.revision !== undefined) {
            activeConfigRevision = Math.max(activeConfigRevision, refreshed.data.revision);
          }
        }
      }

      const mergedMappings = {
        ...(rawProfile["recommendedServiceMappings"] &&
        typeof rawProfile["recommendedServiceMappings"] === "object"
          ? (rawProfile["recommendedServiceMappings"] as Record<string, string>)
          : {}),
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
      const mergedImageOverrides = {
        ...existingImageOverrides,
        ...autoBuiltOverrides,
      };

      const configPayload = {
        projectId,
        profileId: stored.profileId || configData?.profileId || "SPRING_BOOT_DOTNET_COMPOSE_V1",
        snapshotId: chosenSnapshotId,
        modelId: chosenModel.id,
        profile: {
          serviceMappings: mergedMappings,
          serviceRoles: mergedRoles,
          serviceImageOverrides: mergedImageOverrides,
          environmentVariables: mergedEnvVars,
          secretValues: stored.secretValues ?? {},
          secretReferences: mergedSecretRefs,
        },
      };
      let pinnedConfig: { revision: number };
      try {
        pinnedConfig = await autoSaveConfig.mutateAsync({
          ...configPayload,
          expectedRevision: activeConfigRevision,
        });
      } catch (firstErr) {
        const refreshed = await config.refetch();
        if (
          refreshed.data?.revision !== undefined &&
          refreshed.data.revision !== activeConfigRevision
        ) {
          pinnedConfig = await autoSaveConfig.mutateAsync({
            ...configPayload,
            expectedRevision: refreshed.data.revision,
          });
        } else {
          throw firstErr;
        }
      }
      writeStep1Target(projectId, { savedRevision: pinnedConfig.revision });

      // 2. Resolve runnable application service & Step 2 scenario steps
      const composeSvcs =
        Array.isArray(rawProfile["composeServices"]) && rawProfile["composeServices"].length > 0
          ? (rawProfile["composeServices"] as unknown[]).map(String)
          : Array.isArray(rawProfile["detectedServices"])
            ? (rawProfile["detectedServices"] as unknown[]).map(String)
            : [];
      const runnableComposeSvcs = composeSvcs.filter(
        (svc) =>
          !isKnownInfraName(svc) &&
          ((!infraSet.has(svc) && mergedRoles[svc] !== "INFRA") || mergedRoles[svc] === "APP"),
      );
      const realServices = (modelDetail.data?.elements ?? []).filter(
        (e) => e.elementType === "SERVICE_CONTAINER",
      );
      const defaultSvc =
        runnableComposeSvcs[0] ??
        Object.keys(mergedMappings)[0] ??
        realServices[0]?.name ??
        "api-gateway";

      const defaultBody =
        '{"customerEmail":"alice@mavis.io","productCode":"SKU-LAPTOP-01","quantity":1}';
      const environment: Record<string, string> = {};
      for (const [k, v] of Object.entries(stored.plannedInputs ?? {})) {
        if (/^[A-Z][A-Z0-9_]{0,63}$/.test(k) && typeof v === "string" && v.trim()) {
          environment[k] = v.trim();
        }
      }

      const runnableEndpoints = activeEndpoints.filter(
        (ep) => !ep.service || (!infraSet.has(ep.service) && mergedRoles[ep.service] !== "INFRA"),
      );
      const fallbackSavedScenario =
        (session.data?.scenarioName
          ? scenariosList.find((sc) => sc.name === session.data?.scenarioName)
          : undefined) ?? scenariosList[0];

      const draftSteps =
        stored.plannedSteps && stored.plannedSteps.length > 0
          ? stored.plannedSteps.map((st, idx) => {
              const method = (st.method || "GET").toUpperCase();
              if (
                st.bodyReference &&
                /^[A-Z][A-Z0-9_]{0,63}$/.test(st.bodyReference) &&
                ["POST", "PUT", "PATCH"].includes(method)
              ) {
                const matchedSample = runnableEndpoints.find(
                  (ep) =>
                    (!ep.service || ep.service === (st.service || defaultSvc)) &&
                    (ep.method || "POST").toUpperCase() === method &&
                    ep.path === st.path,
                )?.sampleJsonBody;
                const candidate =
                  stored.plannedInputs?.[st.bodyReference]?.trim() || matchedSample?.trim();
                if (candidate) {
                  environment[st.bodyReference] = candidate;
                }
              }
              for (const hdr of st.envHeaders ?? []) {
                if (
                  hdr.reference &&
                  /^[A-Z][A-Z0-9_]{0,63}$/.test(hdr.reference) &&
                  !environment[hdr.reference]
                ) {
                  environment[hdr.reference] = "Bearer sandbox-verification-token";
                }
              }
              for (const refKey of Object.values(st.environmentVariables ?? {})) {
                if (refKey && /^[A-Z][A-Z0-9_]{0,63}$/.test(refKey) && !environment[refKey]) {
                  environment[refKey] = "1";
                }
              }
              const normalizedPath = (st.path || "/health").replace(
                /(?<!\{)\{([^{}/]+)\}(?!\})/g,
                (_, p: string) =>
                  /uuid|guid/i.test(p)
                    ? "00000000-0000-0000-0000-000000000001"
                    : /code|sku/i.test(p)
                      ? "SKU-LAPTOP-01"
                      : "1",
              );
              return JSON.stringify({
                id: `step-${idx + 1}`,
                service: st.service || defaultSvc,
                method,
                path: normalizedPath,
                expectedStatus: Number(st.status) || 200,
                allowClientError: st.allowClientError ?? true,
                ...(st.bodyReference && /^[A-Z][A-Z0-9_]{0,63}$/.test(st.bodyReference)
                  ? { bodyReference: st.bodyReference }
                  : {}),
                ...(st.environmentVariables && Object.keys(st.environmentVariables).length
                  ? { environmentVariables: st.environmentVariables }
                  : {}),
                ...(st.envHeaders && st.envHeaders.length ? { envHeaders: st.envHeaders } : {}),
                ...(st.headers && Object.keys(st.headers).length ? { headers: st.headers } : {}),
                ...(st.extract && Object.keys(st.extract).length ? { extract: st.extract } : {}),
              });
            })
          : fallbackSavedScenario?.steps?.length
            ? fallbackSavedScenario.steps.map((rawStep) => {
                try {
                  const parsed = JSON.parse(rawStep) as {
                    service?: string;
                    method?: string;
                    path?: string;
                    bodyReference?: string;
                    envHeaders?: Array<{ reference?: string }>;
                    environmentVariables?: Record<string, string>;
                  };
                  if (
                    parsed.bodyReference &&
                    /^[A-Z][A-Z0-9_]{0,63}$/.test(parsed.bodyReference) &&
                    !environment[parsed.bodyReference]
                  ) {
                    const matchedSample = runnableEndpoints.find(
                      (ep) =>
                        (!ep.service || ep.service === parsed.service) &&
                        (ep.method || "POST").toUpperCase() ===
                          (parsed.method || "POST").toUpperCase() &&
                        ep.path === parsed.path,
                    )?.sampleJsonBody;
                    if (matchedSample?.trim()) {
                      environment[parsed.bodyReference] = matchedSample.trim();
                    }
                  }
                  for (const hdr of parsed.envHeaders ?? []) {
                    if (
                      hdr.reference &&
                      /^[A-Z][A-Z0-9_]{0,63}$/.test(hdr.reference) &&
                      !environment[hdr.reference]
                    ) {
                      environment[hdr.reference] = "Bearer sandbox-verification-token";
                    }
                  }
                  for (const refKey of Object.values(parsed.environmentVariables ?? {})) {
                    if (refKey && /^[A-Z][A-Z0-9_]{0,63}$/.test(refKey) && !environment[refKey]) {
                      environment[refKey] = "1";
                    }
                  }
                } catch {
                  // Keep raw saved step intact
                }
                return rawStep;
              })
            : runnableEndpoints.length > 0
              ? runnableEndpoints.slice(0, 6).map((ep, idx) => {
                  const method = (ep.method || "GET").toUpperCase();
                  const isWrite = ["POST", "PUT", "PATCH"].includes(method);
                  const bodyRef = isWrite ? `STEP_${idx + 1}_BODY` : undefined;
                  if (bodyRef) {
                    environment[bodyRef] = ep.sampleJsonBody?.trim() || defaultBody;
                  }
                  return JSON.stringify({
                    id: `step-${idx + 1}`,
                    service: ep.service || defaultSvc,
                    method,
                    path: ep.path.replace(/\{[^}/]+\}/g, "1"),
                    expectedStatus: 200,
                    allowClientError: true,
                    ...(bodyRef ? { bodyReference: bodyRef } : {}),
                  });
                })
              : [
                  JSON.stringify({
                    id: "step-1",
                    service: defaultSvc,
                    method: "GET",
                    path: "/health",
                    expectedStatus: 200,
                    allowClientError: true,
                  }),
                ];

      const boundedEnv = boundRuntimeEnvironment(environment);

      const scenarioName =
        stored.scenarioName ||
        (fallbackSavedScenario?.steps?.length ? fallbackSavedScenario.name : "") ||
        "Architecture Verification Scenario";
      const exactMatch = scenariosList.find(
        (sc) => sc.name === scenarioName && JSON.stringify(sc.steps) === JSON.stringify(draftSteps),
      );
      const sameNameScenario = scenariosList.find((sc) => sc.name === scenarioName);
      const savedScenario =
        exactMatch ??
        (sameNameScenario
          ? await updateScenario.mutateAsync({
              projectId,
              scenarioId: sameNameScenario.id,
              name: scenarioName,
              steps: draftSteps,
              expectedRevision: sameNameScenario.revision,
            })
          : await saveDraft.mutateAsync({ projectId, name: scenarioName, steps: draftSteps }));

      // 3. Dispatch runtime session
      const isEnrichedChoice =
        "origin" in chosenModel &&
        (chosenModel as { origin?: string | null }).origin === "RUNTIME_ENRICHED";
      const res = await startRuntime.mutateAsync({
        projectId,
        snapshotId: chosenSnapshotId,
        ...(!isEnrichedChoice ? { modelId: chosenModel.id } : {}),
        scenarioId: savedScenario.id,
        scenarioName: savedScenario.name,
        configurationRevision: pinnedConfig.revision,
        scenarioRevision: savedScenario.revision,
        approved: true,
        infrastructureActions: selectedStudioService && studioAction !== "OBSERVE"
          ? [{
              action: studioAction,
              service: selectedStudioService,
              ...(studioAction === "SCALE" ? { replicas: studioReplicas } : {}),
            }]
          : undefined,
        ...(Object.keys(boundedEnv).length ? { environment: boundedEnv } : {}),
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

  const execStatus = upperExecStatus;
  const scenarioStatus = (session.data?.scenarioStatus ?? "").toUpperCase();
  const isCompleted = ["COMPLETED", "COMPLETE"].includes(execStatus);
  const isCancelled = execStatus === "CANCELLED" || scenarioStatus === "CANCELLED";
  const isTimedOut = ["TIMED_OUT", "TIMEOUT"].includes(execStatus) || scenarioStatus === "TIMEOUT";
  const isExecFailed = execStatus === "FAILED";
  const isScenarioFailed = isCompleted && scenarioStatus === "FAILED";
  const isTerminalProblem = isExecFailed || isTimedOut || isCancelled || isScenarioFailed;
  const isAwaitingDispatch = ["NOT_STARTED", "PENDING", "APPROVED", "READY_FOR_DISPATCH"].includes(
    execStatus,
  );
  const evidence = upperEvidenceStatus;
  const hasSession = Boolean(session.data);
  const enrichedModelId = session.data?.enrichedModelId ?? null;
  const publicationGate = (session.data?.publicationGateStatus ?? "").toUpperCase();
  const stepResults = session.data?.stepResults ?? [];
  const diagnostics = session.data?.diagnostics ?? [];
  const capturedSpans = session.data?.capturedSpanCount;

  const pipelineStages = [
    {
      num: 1,
      title: "Configuration pinned",
      desc: hasSession ? "Revision & profile saved" : "Saved when you run",
      done: hasSession,
      current: false,
    },
    {
      num: 2,
      title: "Runner dispatched",
      desc: hasSession ? execStatus || "Queued" : "Not started",
      done:
        hasSession &&
        !["NOT_STARTED", "PENDING", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEOUT"].includes(
          execStatus,
        ),
      current: ["APPROVED", "READY_FOR_DISPATCH", "ALLOCATED"].includes(execStatus),
    },
    {
      num: 3,
      title: "Scenario executing",
      desc:
        stepResults.length > 0
          ? `${stepResults.filter((s) => s.status === "PASSED").length}/${stepResults.length} steps passed`
          : `${plannedRequests.length} planned requests`,
      done: isCompleted && scenarioStatus === "PASSED",
      current: execStatus === "RUNNING",
    },
    {
      num: 4,
      title: "Trace captured",
      desc: observed
        ? `${workflowData.steps.length} observed hop(s)${capturedSpans != null ? ` · ${capturedSpans} spans` : ""}`
        : evidence || "No trace yet",
      done: observed || (capturedSpans != null && capturedSpans > 0),
      current: false,
    },
    {
      num: 5,
      title: "Model enriched",
      desc: enrichedModelId
        ? publicationGate === "PROMOTED"
          ? "PROMOTED latest valid"
          : "RUNTIME_ENRICHED ready"
        : "Pending",
      done: Boolean(enrichedModelId),
      current: false,
    },
  ];

  return (
    <div className="space-y-5">
      <RuntimeStepperBanner currentStep={3} projectId={projectId} />

      {!administrative && (
        <div
          data-tour="session-launch-bar"
          className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-sky-500/5 to-emerald-500/10 p-4 shadow-sm space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Zap className="h-4 w-4 text-primary animate-pulse" />
                <h4 className="font-bold text-sm text-foreground">
                  Step 3: Live Runtime Workflow Execution & Architecture Visualization
                </h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Saves your complete Step 1 & Step 2 runtime configuration, executes the HTTP test
                workflow, and visualizes service call topology and UML sequence diagrams in real
                time.
              </p>
              {quickRunMsg && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mt-1">
                  {quickRunMsg}
                </p>
              )}
              {quickRunError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-2 mt-2"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{quickRunError}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2 shrink-0">
              <SelectField
                label="MAVIS Studio action"
                value={studioAction}
                onChange={(value) => setStudioAction(value as "OBSERVE" | "STOP" | "START" | "SCALE")}
                options={[
                  { value: "OBSERVE", label: "Observe only" },
                  { value: "SCALE", label: "Scale replicas" },
                  { value: "STOP", label: "Stop service" },
                  { value: "START", label: "Start service" },
                ]}
              />
              {studioAction !== "OBSERVE" && <SelectField
                label="Target service"
                value={selectedStudioService}
                onChange={setStudioService}
                options={runtimeApplicationServices.map((service) => ({ value: service, label: service }))}
              />}
              {studioAction === "SCALE" && (
                <label className="text-xs">
                  Replicas (1–8)
                  <Input
                    className="mt-1 h-9 w-20"
                    type="number"
                    min={1}
                    max={8}
                    value={studioReplicas}
                    onChange={(event) => setStudioReplicas(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
                  />
                </label>
              )}
              {selectedId &&
                (isExecFailed || isTimedOut || (isCompleted && scenarioStatus !== "PASSED")) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-9 border-violet-500/40 text-violet-300"
                    asChild
                  >
                    <Link href={`/scenarios?project=${projectId}&repairSession=${selectedId}`}>
                      ✨ AI Repair in Step 2
                    </Link>
                  </Button>
                )}
              <Button variant="outline" size="sm" className="text-xs h-9" asChild>
                <Link href={`/scenarios?project=${projectId}`}>← Edit Scenario in Step 2</Link>
              </Button>
              <Button
                onClick={handleQuickRun}
                disabled={quickRunRunning || active.has(upperExecStatus) || !snapshots.data?.length || (studioAction !== "OBSERVE" && !selectedStudioService)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 shadow"
              >
                {quickRunRunning || active.has(upperExecStatus) ? (
                  <Loader2
                    className="h-3.5 w-3.5 mr-1.5 animate-spin shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                )}
                {quickRunRunning
                  ? "Saving & Running Workflow..."
                  : active.has(upperExecStatus)
                    ? `Sandbox Running (${execStatus})...`
                    : "⚡ Save & Run Workflow Now"}
              </Button>
            </div>
          </div>

          {/* 5-Stage Visual Execution Pipeline */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
            {pipelineStages.map((st) => (
              <div
                key={st.num}
                className={`rounded-lg border p-2.5 text-xs transition ${
                  (isExecFailed || isTimedOut) && !st.done && st.num > 1
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : st.current
                      ? "border-sky-400 bg-sky-500/15 text-sky-800 dark:text-sky-200 shadow-sm"
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
                          : (isExecFailed || isTimedOut) && st.num > 1
                            ? "bg-destructive/20 text-destructive"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {st.done && !st.current
                      ? "✓"
                      : (isExecFailed || isTimedOut) && st.num === 2
                        ? "✕"
                        : st.num}
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

      {/* Runtime-Enriched Architecture Hub */}
      {enrichedModelId && projectId && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Runtime-Enriched Architecture Revision Ready
              </span>
              {publicationGate && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border border-emerald-600/40 bg-emerald-600/15 text-emerald-900 dark:text-emerald-200">
                  {publicationGate === "PROMOTED"
                    ? "PROMOTED (LATEST VALID)"
                    : publicationGate === "HELD_NON_PROMOTED"
                      ? "ENRICHED SNAPSHOT (BASELINE KEPT)"
                      : publicationGate}
                </span>
              )}
              {capturedSpans != null && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {capturedSpans} correlated span(s)
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Model <code className="font-mono text-foreground">{enrichedModelId.slice(0, 8)}</code>{" "}
              combines static source analysis with real OpenTelemetry trace provenance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
              asChild
            >
              <Link
                href={`/architecture?project=${encodeURIComponent(projectId)}&model=${encodeURIComponent(enrichedModelId)}`}
              >
                <ExternalLink className="h-3 w-3 mr-1.5" />
                Architecture Graph
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-emerald-600/40 text-emerald-800 dark:text-emerald-300"
              asChild
            >
              <Link
                href={`/diagrams?project=${encodeURIComponent(projectId)}&model=${encodeURIComponent(enrichedModelId)}&kind=UML_SEQUENCE&mode=observed&session=${encodeURIComponent(selectedId)}`}
              >
                Sequence Diagram
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-emerald-600/40 text-emerald-800 dark:text-emerald-300"
              asChild
            >
              <Link
                href={`/diagrams?project=${encodeURIComponent(projectId)}&model=${encodeURIComponent(enrichedModelId)}&kind=UML_ACTIVITY&mode=observed&session=${encodeURIComponent(selectedId)}`}
              >
                Activity Diagram
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Main Visualization & Session Workspace */}
      <DetailPanel title="1. Runtime Workflow Visualization">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
              <button
                type="button"
                data-tour-tab="sess-topology"
                onClick={() => setVizMode("topology")}
                className={`inline-flex items-center h-7 px-3 rounded-md text-xs font-medium transition ${
                  vizMode === "topology"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Network className="h-3.5 w-3.5 mr-1.5" />
                Topology
              </button>
              <button
                type="button"
                data-tour-tab="sess-sequence"
                onClick={() => setVizMode("sequence")}
                className={`inline-flex items-center h-7 px-3 rounded-md text-xs font-medium transition ${
                  vizMode === "sequence"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <GitCommit className="h-3.5 w-3.5 mr-1.5" />
                Sequence
              </button>
              <button
                type="button"
                data-tour-tab="sess-activity"
                onClick={() => setVizMode("activity")}
                className={`inline-flex items-center h-7 px-3 rounded-md text-xs font-medium transition ${
                  vizMode === "activity"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Activity className="h-3.5 w-3.5 mr-1.5" />
                Activity
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sessionOptions.length > 0 && (
                <select
                  aria-label="Runtime session"
                  className="h-8 rounded-md border bg-background px-2.5 text-xs font-mono text-foreground"
                  value={selectedId}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {sessionOptions.map((s, idx) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
                      {`#${sessionOptions.length - idx} (${s.id.slice(0, 6)}) · ${s.scenarioName ?? s.id.slice(0, 8)} · ${translatedStatusLabel(s.executionStatus, t)}`}
                    </option>
                  ))}
                </select>
              )}
              {projectId && !enrichedModelId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-emerald-600/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                  asChild
                >
                  <Link
                    href={`/architecture?project=${encodeURIComponent(projectId)}${
                      targetModelId ? `&model=${encodeURIComponent(targetModelId)}` : ""
                    }`}
                  >
                    <ExternalLink className="h-3 w-3 mr-1.5" />
                    Architecture Graph
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {list.isPending && (
            <p className="text-xs text-muted-foreground">Loading runtime sessions…</p>
          )}
          {list.isError && <ErrorState error={list.error} />}
          {session.isError && <ErrorState error={session.error} />}
          {sequence.isError && <ErrorState error={sequence.error} />}
          {!list.isPending && !list.isError && !visible.length && !selectedId && (
            <p className="text-xs text-muted-foreground">
              No runtime session yet. The diagram below is the planned workflow; run it to capture a
              real trace.
            </p>
          )}

          {hasSession && isAwaitingDispatch && !administrative && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="font-semibold text-sky-800 dark:text-sky-300">
                  Session {selectedId.slice(0, 8)} is queued ({execStatus})
                </p>
                <p className="text-muted-foreground">
                  Waiting for runner execution or receipt sync. You can trigger immediate dispatch /
                  outbox sync now.
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={approve.isPending}
                onClick={() =>
                  approve.mutate(
                    { sessionId: selectedId },
                    {
                      onSuccess: () => {
                        void session.refetch();
                        void list.refetch();
                        void sequence.refetch();
                      },
                    },
                  )
                }
              >
                <Play className="h-3 w-3 mr-1" />
                {approve.isPending ? "Dispatching..." : "Dispatch / Sync Runner"}
              </Button>
            </div>
          )}

          {isTerminalProblem && (
            <div
              role="alert"
              className={`rounded-lg border p-3 text-xs space-y-2 ${
                isCancelled
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                  : isTimedOut
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="font-semibold">
                    {isCancelled
                      ? "Session cancelled"
                      : isTimedOut
                        ? "Session timed out"
                        : isScenarioFailed
                          ? "Scenario verification failed (HTTP expectation mismatch)"
                          : `Session ${execStatus}`}{" "}
                    —{" "}
                    {session.data?.failureReason ||
                      (observed
                        ? "Execution did not pass all assertions, though captured spans were preserved below."
                        : "No observed trace spans were captured; no synthetic trace was generated.")}
                  </p>
                  <p className="text-[11px] opacity-90">
                    {observed
                      ? "Captured OpenTelemetry spans from executed steps are shown below (held non-promoted so your baseline latest model remains protected)."
                      : "Because no OpenTelemetry spans were recorded, the topology below shows only the PLANNED workflow without invented latency or status."}
                  </p>
                </div>
              </div>
              {diagnostics.length > 0 && (
                <div className="pl-6 space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider opacity-80">
                    Runner Diagnostics ({diagnostics.length})
                  </p>
                  <div className="rounded bg-slate-950/60 border border-border/40 p-2 font-mono text-[11px] text-slate-300 space-y-0.5 max-h-28 overflow-y-auto">
                    {diagnostics.map((d, idx) => (
                      <div key={idx} className="break-words">
                        • {d}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {observed &&
            (() => {
              const services = Array.from(
                new Set(
                  workflowData.steps
                    .flatMap((s) => [s.callerService, s.calleeService])
                    .filter((s): s is string => Boolean(s)),
                ),
              );
              const timed = workflowData.steps.filter((s) => s.durationMs != null);
              const slowest = [...timed].sort(
                (a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0),
              )[0];
              return (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs space-y-0.5">
                  <p className="font-semibold text-foreground">
                    Trace summary: {workflowData.steps.length} observed call(s) across{" "}
                    {services.length} participant(s)
                  </p>
                  {slowest && (
                    <p className="text-muted-foreground">
                      Slowest observed hop: {slowest.callerService} → {slowest.calleeService} (
                      {normalizeEndpointDisplay(
                        slowest.httpMethod,
                        slowest.operation,
                        slowest.calleeService,
                      )}
                      , {slowest.durationMs} ms)
                    </p>
                  )}
                </div>
              );
            })()}

          {/* Visual Feature Cluster Flow Pipeline */}
          {featureClusters.length > 0 && (
            <div
              data-tour="session-flow-clusters"
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    🧩 API Feature Flow Clusters ({featureClusters.length} Functional Groups)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Click any functional cluster to isolate its Topology, Sequence Diagram & API
                    calls
                  </span>
                </div>
                {(selectedClusterFilter || selectedServiceFilter) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-sky-500/40 text-sky-300"
                    onClick={() => {
                      setSelectedClusterFilter(null);
                      setSelectedServiceFilter(null);
                    }}
                  >
                    ✕ Show Full End-to-End Flow ({workflowData.steps.length})
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedClusterFilter(null)}
                  className={`rounded-lg border px-3 py-2 text-left transition flex flex-col justify-between min-w-[155px] ${
                    selectedClusterFilter === null
                      ? "border-primary bg-primary/15 text-foreground shadow-sm"
                      : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">🌐 Full End-to-End</span>
                    <span className="rounded-full bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                      {featureClusters.length} flows
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    All {workflowData.steps.length} {observed ? "observed" : "planned"} hops
                    combined
                  </p>
                </button>

                {featureClusters.map((cluster, idx) => {
                  const isSelected = selectedClusterFilter === cluster.meta.id;
                  const svcs = Array.from(cluster.services);
                  return (
                    <div key={cluster.meta.id} className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-mono text-xs select-none">
                        {idx === 0 ? "∶" : "→"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedClusterFilter(isSelected ? null : cluster.meta.id)
                        }
                        className={`rounded-lg border px-3 py-2 text-left transition min-w-[200px] max-w-[290px] space-y-1 ${
                          isSelected
                            ? `${cluster.meta.badgeClass} ring-1 ring-sky-400/50 shadow-sm`
                            : `${cluster.meta.cardBorderClass} hover:border-slate-600`
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-100 truncate">
                            <span className="mr-1">{cluster.meta.icon}</span>
                            {idx + 1}. {cluster.meta.shortTitle}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold border shrink-0 ${cluster.meta.badgeClass}`}
                          >
                            {cluster.routes.length} API{cluster.routes.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {svcs.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {svcs.map((svc) => (
                              <span
                                key={svc}
                                className="rounded bg-slate-900/90 border border-slate-700/80 px-1.5 py-0.2 font-mono text-[10px] text-emerald-300"
                              >
                                {svc}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="font-mono text-[10px] text-slate-400 truncate">
                          {cluster.routes.slice(0, 2).join(" → ")}
                          {cluster.routes.length > 2 ? ` (+${cluster.routes.length - 2})` : ""}
                        </p>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Visual Canvas 1: Service Workflow Topology */}
            {Boolean(session.data?.infrastructureActions?.length) && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <h3 className="font-medium">Studio results</h3>
                {session.data?.infrastructureActions?.filter((action) => action.confirmed).map((action, index) => (
                  <div className="space-y-1" key={index}>
                    <p className="font-medium">{action.action} {action.service}</p>
                    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
                      <dt>Running replicas</dt><dd>{action.replicasBefore} → {action.replicasAfter}</dd>
                      <dt>Requests measured</dt><dd>{studioMetric(action.metricsBefore["requestCount"])} → {studioMetric(action.metricsAfter["requestCount"])}</dd>
                      <dt>p95 latency (ms)</dt><dd>{studioMetric(action.metricsBefore["p95LatencyMs"])} → {studioMetric(action.metricsAfter["p95LatencyMs"])}</dd>
                      <dt>Request error rate (%)</dt><dd>{studioMetric(action.metricsBefore["errorRatePercent"])} → {studioMetric(action.metricsAfter["errorRatePercent"])}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            )}
            {vizMode === "topology" && (
              <div data-tour="session-topology" className="min-w-0">
                <RuntimeWorkflowTopologyCanvas
                  steps={filteredSteps}
                  planned={!observed}
                  selectedService={selectedServiceFilter}
                  onSelectService={setSelectedServiceFilter}
                />
              </div>
            )}

            {/* Visual Canvas 2: UML 2.5.1 Sequence Diagram */}
            {vizMode === "sequence" && !observed && (
              <div data-tour="session-sequence" className="min-w-0">
                <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                  The UML sequence diagram is drawn only from captured trace spans. It appears after
                  a run records evidence.
                </p>
              </div>
            )}
            {vizMode === "sequence" && observed && (
              <div data-tour="session-sequence" className="min-w-0">
                <RuntimeSequenceDiagramCanvas
                  steps={filteredSteps}
                  sessionTitle={
                    session.data?.scenarioName ??
                    storedDraft.scenarioName ??
                    "Architecture Verification Workflow"
                  }
                  projectId={projectId}
                  targetGraphModelId={enrichedModelId ?? targetModelId}
                  sessionId={selectedId || "preview"}
                />
              </div>
            )}

            {/* Visual Canvas 3: UML 2.5.1 Activity Diagram */}
            {vizMode === "activity" && !observed && (
              <div data-tour="session-activity" className="min-w-0">
                <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                  The runtime UML activity diagram is drawn from captured trace spans. Run the
                  scenario to record observed swimlane actions, or inspect static code-inferred
                  activity flows in Architecture Diagrams.
                </p>
              </div>
            )}
            {vizMode === "activity" && observed && (
              <div data-tour="session-activity" className="min-w-0">
                <RuntimeActivityDiagramCanvas
                  steps={filteredSteps}
                  sessionTitle={
                    session.data?.scenarioName ??
                    storedDraft.scenarioName ??
                    "Architecture Verification Workflow"
                  }
                  projectId={projectId}
                  targetGraphModelId={enrichedModelId ?? targetModelId}
                  sessionId={selectedId || "preview"}
                />
              </div>
            )}
          </div>
        </div>
      </DetailPanel>

      {/* Per-Step HTTP Scenario Execution Verification */}
      {stepResults.length > 0 && (
        <DetailPanel
          title={`2. Scenario HTTP Step Verification (${stepResults.filter((s) => s.status === "PASSED" && !(s.statusCode != null && s.statusCode >= 500)).length}/${stepResults.length} Passed)`}
        >
          <div className="space-y-2">
            {stepResults.map((sr, idx) => {
              const stUpper = (sr.status || "PENDING").toUpperCase();
              const isServerError = sr.statusCode != null && sr.statusCode >= 500;
              const passed = stUpper === "PASSED" && !isServerError;
              const failed = stUpper === "FAILED" || stUpper === "TIMED_OUT" || isServerError;
              const verb = (sr.method || "GET").toUpperCase();
              return (
                <div
                  key={`${sr.id}:${idx}`}
                  className={`rounded-lg border p-2.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
                    passed
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : failed
                        ? "border-rose-500/30 bg-rose-500/5"
                        : "border-border/70 bg-muted/15"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 font-mono min-w-0">
                    {passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : failed ? (
                      <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-[11px] text-muted-foreground">#{idx + 1}</span>
                    {(() => {
                      const aiPhase =
                        aiPhaseByRoute.get(`${verb}:${sr.path ?? "/"}`) ??
                        aiPhaseByRoute.get(sr.path ?? "");
                      const clusterMeta = classifyApiFeatureCluster(
                        sr.path,
                        sr.service,
                        sr.service,
                        aiPhase,
                      );
                      return (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border ${clusterMeta.badgeClass}`}
                        >
                          {clusterMeta.icon} {clusterMeta.shortTitle}
                        </span>
                      );
                    })()}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${httpMethodBadgeClass(verb)}`}
                    >
                      {verb}
                    </span>
                    {sr.service && (
                      <span className="rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 font-semibold">
                        {sr.service}
                      </span>
                    )}
                    <span className="text-foreground font-semibold truncate">{sr.path ?? "/"}</span>
                    {sr.failureReason && (
                      <span className="text-rose-300 font-sans text-[11px]">
                        — {sr.failureReason}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                    {sr.expectedStatus != null && (
                      <span className="text-muted-foreground">exp {sr.expectedStatus}</span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold border ${
                        passed
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : failed
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                            : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {sr.statusCode != null ? `HTTP ${sr.statusCode}` : stUpper}
                    </span>
                    {sr.durationMs != null && (
                      <span className="text-muted-foreground">{sr.durationMs} ms</span>
                    )}
                    {sr.traceId && (
                      <span
                        className="text-[10px] text-slate-400"
                        title={`W3C traceId: ${sr.traceId}`}
                      >
                        trace:{sr.traceId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DetailPanel>
      )}

      {/* Step-by-Step Waterfall Timeline & Session Controls */}
      <DetailPanel
        title={
          observed
            ? `${stepResults.length > 0 ? "3" : "2"}. Observed Trace Calls`
            : `${stepResults.length > 0 ? "3" : "2"}. Planned HTTP Calls (not executed)`
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Activity className="h-3.5 w-3.5 text-primary" />
              {observed ? "Observed calls" : "Planned calls"} ({filteredSteps.length} of{" "}
              {workflowData.steps.length})
            </p>
            {(selectedServiceFilter || selectedClusterFilter) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  setSelectedServiceFilter(null);
                  setSelectedClusterFilter(null);
                }}
              >
                Show all ({workflowData.steps.length})
              </Button>
            )}
          </div>

          {(() => {
            // Merge consecutive PLANNED gateway -> downstream hops into a single chained call row
            type ChainedCallItem = {
              step: ObservedStepItem;
              chainServices: string[];
              cluster: ApiFeatureClusterMeta;
              displayIndex: number;
            };
            const chainedItems: ChainedCallItem[] = [];
            for (let i = 0; i < filteredSteps.length; i++) {
              const cur = filteredSteps[i]!;
              const next = filteredSteps[i + 1];
              if (
                !observed &&
                cur.callerService === "mavis-runner" &&
                next &&
                next.callerService === cur.calleeService &&
                next.operation === cur.operation &&
                next.httpMethod === cur.httpMethod
              ) {
                const chain = [
                  cur.callerService ?? "mavis-runner",
                  cur.calleeService ?? "api-gateway",
                  next.calleeService ?? "service",
                ];
                const aiPhase =
                  aiPhaseByRoute.get(
                    `${(next.httpMethod ?? "GET").toUpperCase()}:${next.operation ?? "/"}`,
                  ) ?? aiPhaseByRoute.get(next.operation ?? "");
                const cluster = classifyApiFeatureCluster(
                  next.operation,
                  cur.calleeService,
                  next.calleeService,
                  aiPhase,
                );
                chainedItems.push({
                  step: next,
                  chainServices: chain,
                  cluster,
                  displayIndex: chainedItems.length + 1,
                });
                i++;
              } else {
                const chain = [cur.callerService ?? "Caller", cur.calleeService ?? "Receiver"];
                const aiPhase =
                  aiPhaseByRoute.get(
                    `${(cur.httpMethod ?? "GET").toUpperCase()}:${cur.operation ?? "/"}`,
                  ) ?? aiPhaseByRoute.get(cur.operation ?? "");
                const cluster = classifyApiFeatureCluster(
                  cur.operation,
                  cur.callerService,
                  cur.calleeService,
                  aiPhase,
                );
                chainedItems.push({
                  step: cur,
                  chainServices: chain,
                  cluster,
                  displayIndex: chainedItems.length + 1,
                });
              }
            }

            // Group chained items into visual Feature Cluster sections
            const clusterGroups: Array<{
              meta: ApiFeatureClusterMeta;
              items: ChainedCallItem[];
            }> = [];
            const groupById = new Map<
              ApiFeatureClusterId,
              { meta: ApiFeatureClusterMeta; items: ChainedCallItem[] }
            >();
            for (const item of chainedItems) {
              let grp = groupById.get(item.cluster.id);
              if (!grp) {
                grp = { meta: item.cluster, items: [] };
                groupById.set(item.cluster.id, grp);
                clusterGroups.push(grp);
              }
              grp.items.push(item);
            }

            return (
              <div className="space-y-4">
                {clusterGroups.map((grp, gIdx) => {
                  const pageCount = Math.max(
                    1,
                    Math.ceil(grp.items.length / TRACE_GROUP_PAGE_SIZE),
                  );
                  const currentPage = Math.min(traceGroupPages[grp.meta.id] ?? 1, pageCount);
                  const pageStart = (currentPage - 1) * TRACE_GROUP_PAGE_SIZE;
                  const visibleItems = grp.items.slice(
                    pageStart,
                    pageStart + TRACE_GROUP_PAGE_SIZE,
                  );
                  return (
                    <div
                      key={grp.meta.id}
                      className={`rounded-xl border p-3.5 space-y-2.5 ${grp.meta.cardBorderClass}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-bold border ${grp.meta.badgeClass}`}
                          >
                            {grp.meta.icon} Flow Group {gIdx + 1}: {grp.meta.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {grp.meta.description}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-300">
                          {grp.items.length} {grp.items.length === 1 ? "API step" : "API steps"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {visibleItems.map(({ step, chainServices, displayIndex }, i) => {
                          const dur = step.durationMs;
                          const widthPct =
                            dur == null
                              ? 0
                              : Math.max(
                                  4,
                                  Math.min(100, Math.round((dur / maxStepDuration) * 100)),
                                );
                          const method = (step.httpMethod ?? "GET").toUpperCase();
                          const statusCode = step.httpStatusCode;
                          return (
                            <div
                              key={`${step.traceId ?? "trace"}:${displayIndex}:${i}`}
                              className="rounded-lg border border-border/80 bg-slate-950/70 p-2.5 shadow-sm space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                                    {displayIndex}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${httpMethodBadgeClass(method)}`}
                                  >
                                    {method}
                                  </span>
                                  {chainServices.map((svcName, sIdx) => (
                                    <span
                                      key={`${svcName}:${sIdx}`}
                                      className="inline-flex items-center gap-1.5"
                                    >
                                      {sIdx > 0 && (
                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                      <span
                                        className={`rounded px-2 py-0.5 font-semibold border ${
                                          sIdx === 0
                                            ? "bg-slate-800/90 text-slate-300 border-slate-700"
                                            : sIdx === chainServices.length - 1
                                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                              : "bg-sky-500/15 text-sky-400 border-sky-500/30"
                                        }`}
                                      >
                                        {svcName}
                                      </span>
                                    </span>
                                  ))}
                                  <span className="text-foreground font-semibold ml-1">
                                    {normalizeEndpointDisplay(
                                      step.httpMethod,
                                      step.operation,
                                      step.calleeService,
                                    )}
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
                                    <span className="px-1.5 py-0.5 rounded border border-dashed text-muted-foreground">
                                      PLANNED
                                    </span>
                                  )}
                                  {dur != null && (
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {dur} ms
                                    </span>
                                  )}
                                </div>
                              </div>

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
                      {pageCount > 1 && (
                        <Pagination
                          page={currentPage}
                          pageCount={pageCount}
                          onPageChange={(nextPage) =>
                            setTraceGroupPages((current) => ({
                              ...current,
                              [grp.meta.id]: nextPage,
                            }))
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

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
                <div className="flex flex-wrap gap-2">
                  {["NOT_STARTED", "PENDING", "APPROVED", "READY_FOR_DISPATCH"].includes(
                    execStatus,
                  ) && (
                    <Button
                      size="sm"
                      disabled={approve.isPending}
                      onClick={() => setAction("approve")}
                    >
                      Approve & Dispatch Runner
                    </Button>
                  )}
                  {active.has(execStatus) && execStatus !== "CANCELLING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={stop.isPending}
                      onClick={() => setAction("stop")}
                    >
                      Stop session
                    </Button>
                  )}
                  {!active.has(execStatus) && !administrative && snapshots.data?.length ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={quickRunRunning}
                      onClick={handleQuickRun}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Re-run Workflow
                    </Button>
                  ) : null}
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
        title={
          action === "approve"
            ? "Approve & dispatch this pinned session?"
            : "Stop this runtime session?"
        }
        description={
          action === "approve"
            ? "Approves the pinned workload, syncs any completed receipt in the runner outbox, or dispatches the managed runner."
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
          mutation.mutate(
            { sessionId: selectedId },
            {
              onSuccess: () => {
                setAction(null);
                void session.refetch();
                void list.refetch();
                void sequence.refetch();
              },
            },
          );
        }}
      />
    </div>
  );
}

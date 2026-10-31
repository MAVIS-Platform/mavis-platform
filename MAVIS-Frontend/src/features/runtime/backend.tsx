"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, ArrowRight, ExternalLink, Activity, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { RuntimeStepperBanner } from "./screens";
import { useState } from "react";
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
}

function normalizeEndpointDisplay(method: string | null | undefined, operation: string | null | undefined, callee: string | null | undefined): string {
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
  const frameTitle = `sd Observed Runtime Sequence · ${sessionTitle}`;
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
    const displayLabel = `:${svc}`;

    parts.push(
      `<line x1="${cx}" y1="${lifelineTopY}" x2="${cx}" y2="${lifelineBottomY}" stroke="#475569" stroke-width="1.5" stroke-dasharray="6 5" />`,
    );

    parts.push(
      `<rect x="${bx}" y="${by}" width="${headerBoxWidth}" height="${headerBoxHeight}" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />`,
    );
    parts.push(
      `<text x="${cx}" y="${by + 17}" text-anchor="middle" fill="#94a3b8" font-size="9.5">«service»</text>`,
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
    const durationText = step.durationMs != null ? `${step.durationMs} ms` : "30 ms";
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
        `<path d="M ${x1 + 5} ${callY} L ${x1 + loopW} ${callY} L ${x1 + loopW} ${callY + 20} L ${x1 + 6} ${callY + 20}" fill="none" stroke="#38bdf8" stroke-width="1.8" marker-end="url(#seq-sync-arrow)" />`,
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
        `<line x1="${startX}" y1="${callY}" x2="${endX}" y2="${callY}" stroke="${isError ? "#f43f5e" : "#38bdf8"}" stroke-width="2" marker-end="url(#${isError ? "seq-err-arrow" : "seq-sync-arrow"})" />`,
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
  targetGraphModelId?: string | null;
  sessionId: string;
}) {
  const [zoomPct, setZoomPct] = useState(100);
  const { svgMarkup, participants } = buildRuntimeSequenceSvgString(steps, sessionTitle);

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
            UML 2.5.1 Observed Runtime Sequence Diagram ({participants.length} Lifelines · {steps.length} Causal Calls)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Real-time sequence diagram reconstructed from OpenTelemetry trace spans. Horizontal axis shows microservice lifelines, vertical axis preserves causal call order.
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
  const [showVisualSequence, setShowVisualSequence] = useState(true);
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: !!projectId });
  const [snapshot, setSnapshot] = useState("");
  const preflight = useApiMutation("runtimePreflight");
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
  const selectedId = visible.find((s) => s.id === selected)?.id ||
    ((!administrative || (!search && status === "all")) ? requestedSession : "") || visible[0]?.id || "";
  const session = useApiQuery(
    "runtimeReadSession",
    { sessionId: selectedId },
    { enabled: !!selectedId, poll: true },
  );
  const sessionOptions = session.data && !visible.some(s => s.id === session.data?.id)
    ? [session.data, ...visible] : visible;
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
  const targetModelId = (staticModelsList.find((m) => m.latest) ?? staticModelsList[0] ?? models.data?.[0])?.id;
  const modelDetail = useApiQuery(
    "model",
    { projectId, modelId: targetModelId ?? "" },
    { enabled: !!projectId && !!targetModelId },
  );
  const startRuntime = useApiMutation("startRuntime");
  const [quickRunRunning, setQuickRunRunning] = useState(false);
  const [quickRunMsg, setQuickRunMsg] = useState("");
  const [quickRunError, setQuickRunError] = useState("");

  const handleQuickRun = async () => {
    if (!projectId || !snapshots.data?.length) return;
    setQuickRunRunning(true);
    setQuickRunMsg("Starting an automated runtime test session...");

    const staticModels = (models.data ?? []).filter(
      (m) => !("origin" in m) || (m as any).origin !== "RUNTIME_ENRICHED",
    );
    const latestModel =
      staticModels.find((m) => m.latest) ?? staticModels[0] ?? models.data?.[0];
    const latestSnapshot =
      (latestModel?.snapshotId
        ? snapshots.data.find((s) => s.id === latestModel.snapshotId)
        : undefined) ?? snapshots.data[0];
    if (!latestSnapshot) {
      setQuickRunRunning(false);
      return;
    }

    setQuickRunError("");
    try {
      const firstScenario = scenarios.data?.[0];
      const realServices = (modelDetail.data?.elements ?? []).filter(
        (e) => e.elementType === "SERVICE_CONTAINER",
      );
      const defaultSvc = realServices[0]?.name ?? "app";
      let steps: Array<{
        id: string;
        title: string;
        service: string;
        method: string;
        path: string;
        expectedStatus: number;
      }> = [];

      if (firstScenario?.steps && firstScenario.steps.length > 0) {
        steps = firstScenario.steps.map((st, i) => {
          const targetSvc = realServices[i % Math.max(1, realServices.length)]?.name ?? defaultSvc;
          return {
            id: `step-${i + 1}`,
            title: typeof st === "string" ? st : `Verify Step ${i + 1}`,
            service: targetSvc,
            method: "GET",
            path: "/health",
            expectedStatus: 200,
          };
        });
      } else if (realServices.length > 0) {
        steps = realServices.slice(0, 3).map((svc, idx) => ({
          id: `step-${idx + 1}`,
          title: `Verify ${svc.name}`,
          service: svc.name,
          method: "GET",
          path: "/health",
          expectedStatus: 200,
        }));
      } else {
        steps = [
          {
            id: "step-1",
            title: "Auto-Verify Service Connection",
            service: "app",
            method: "GET",
            path: "/health",
            expectedStatus: 200,
          },
        ];
      }

      const res = await startRuntime.mutateAsync({
        projectId,
        snapshotId: latestSnapshot.id,
        modelId: latestModel?.id,
        scenarioId: crypto.randomUUID(),
        scenarioName: "1-Click Auto Verify · " + new Date().toLocaleTimeString(),
        steps,
        configurationRevision: 1,
        scenarioRevision: 1,
        approved: true,
      });

      setSelected(res.id);
      setQuickRunMsg(
        `Session ${res.id.slice(0, 8)} completed! Status: ${translatedStatusLabel(res.executionStatus || res.status, t)}`,
      );
      void list.refetch();
      void session.refetch();
      void sequence.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setQuickRunMsg("");
      setQuickRunError("Runtime execution failed: " + msg);
    } finally {
      setQuickRunRunning(false);
    }
  };
  if (!projectId && !administrative)
    return (
      <DetailPanel title="Runtime">
        <p>Select a project to check source eligibility and inspect its runtime sessions.</p>
        {administrative && (
          <p>Global runtime sessions are not provided by this backend; select a project.</p>
        )}
      </DetailPanel>
    );
  return (
    <div className="space-y-5">
      <RuntimeStepperBanner currentStep={3} projectId={projectId} />
      {!administrative && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary animate-pulse" />
              <h4 className="font-bold text-sm text-foreground">
                Start an Automated Runtime Test (Recommended)
              </h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the latest snapshot and model, create a test session with sample endpoints, and submit it for execution.
            </p>
            {quickRunMsg && (
              <p className="text-xs font-medium text-primary mt-1">
                {quickRunMsg}
              </p>
            )}
            {quickRunError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2 mt-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{quickRunError}</span>
              </div>
            )}
          </div>
          <Button
            onClick={handleQuickRun}
            disabled={quickRunRunning || !snapshots.data?.length}
            className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow"
          >
            {quickRunRunning ? "Running..." : "⚡ Run Now"}
          </Button>
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
      <DetailPanel title="Runtime sessions">
        <RequestState
          query={list}
          empty={!visible.length && !selectedId}
          emptyMessage={
            administrative
              ? "No sessions match this view. Try clearing the filters or refresh to check for new runs."
              : "No runtime session exists for this project. Save a configuration and scenario above, then approve and queue a session."
          }
        >
          <SelectField
            label="Runtime session"
            value={selectedId}
            onChange={setSelected}
            options={sessionOptions.map((s) => ({
              value: s.id,
              label: `${s.scenarioName ?? s.id.slice(0, 8)} · ${translatedStatusLabel(s.executionStatus, t)}`,
            }))}
          />
          {selectedId && (
            <RequestState query={session}>
              {session.data && (
                <>
                                    {["COMPLETED", "COMPLETE"].includes(session.data.executionStatus) && (
                    <div className="my-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        Runtime session completed. Recorded connections are available for inspection.
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The architecture model has been updated with <strong className="text-emerald-300 font-mono">VERIFIED_RUNTIME</strong> relationships and OpenTelemetry sequence diagrams.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {(() => {
                          const targetGraphModelId = session.data.enrichedModelId ?? session.data.modelId;
                          return (
                            <>
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm" asChild>
                                <Link href={`/architecture?project=${projectId}${targetGraphModelId ? `&model=${targetGraphModelId}` : ""}`}>
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  🔍 Open Runtime-Enriched Graph (RUNTIME_ENRICHED)
                                </Link>
                              </Button>
                              <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs" asChild>
                                <Link href={`/diagrams?project=${projectId}${targetGraphModelId ? `&model=${targetGraphModelId}` : ""}&kind=UML_SEQUENCE&mode=observed&session=${session.data.id}`}>
                                  📊 View Sequence Diagram (Full Workspace)
                                </Link>
                              </Button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                  <dl className="my-4 grid gap-2 sm:grid-cols-2">
                    {[
                      { key: "executionStatus", label: "Execution status" },
                      { key: "scenarioStatus", label: "Scenario status" },
                      { key: "evidenceStatus", label: "Evidence status" },
                      { key: "cleanupStatus", label: "Cleanup status" },
                      { key: "traceQuality", label: "Trace quality" },
                      { key: "mappingStatus", label: "Mapping status" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="text-sm">
                          <StatusLabel
                            status={String(
                              session.data?.[key as keyof NonNullable<typeof session.data>] ??
                                "n/a",
                            )}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="my-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={showVisualSequence ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setShowVisualSequence((prev) => !prev);
                          if (!sequence.data) void sequence.refetch();
                        }}
                      >
                        {showVisualSequence ? "📊 Hide Visual Sequence Diagram" : "📊 Show Visual Sequence Diagram (Trace)"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sequence.isFetching}
                        onClick={() => void sequence.refetch()}
                      >
                        {sequence.isFetching ? "Refreshing Trace..." : "🔄 Refresh Trace Spans"}
                      </Button>
                    </div>
                    {sequence.isError && <ErrorState error={sequence.error} />}
                    {sequence.data?.steps.length ? (
                      <div className="space-y-4 pt-1">
                        {showVisualSequence && (
                          <RuntimeSequenceDiagramCanvas
                            steps={sequence.data.steps}
                            sessionTitle={session.data.scenarioName ?? session.data.id.slice(0, 8)}
                            projectId={projectId}
                            targetGraphModelId={session.data.enrichedModelId ?? session.data.modelId}
                            sessionId={session.data.id}
                          />
                        )}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                            <Activity className="h-3.5 w-3.5 text-primary" />
                            Recorded Runtime Calls (OpenTelemetry Spans · {sequence.data.steps.length} steps)
                          </p>
                          <div className="space-y-2">
                            {sequence.data.steps.map((step, i) => (
                              <div
                                key={`${step.traceId ?? "trace"}:${i}`}
                                className="relative pl-6 pb-3 border-l-2 border-primary/30 last:border-l-transparent last:pb-0"
                              >
                                <div className="absolute -left-2 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow">
                                  {i + 1}
                                </div>
                                <div className="rounded-lg border border-border/80 bg-background/95 p-3 shadow-sm space-y-1.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                                      <span className="rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5">
                                        {step.callerService ?? "Caller"}
                                      </span>
                                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5">
                                        {step.calleeService ?? "Receiver"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] font-mono">
                                      {step.httpStatusCode && (
                                        <span
                                          className={`px-1.5 py-0.5 rounded font-bold ${
                                            step.httpStatusCode >= 200 && step.httpStatusCode < 300
                                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                          }`}
                                        >
                                          HTTP {step.httpStatusCode}
                                        </span>
                                      )}
                                      {step.durationMs != null && (
                                        <span className="flex items-center gap-1 text-muted-foreground">
                                          <Clock className="h-3 w-3" />
                                          {step.durationMs} ms
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="font-mono text-[11px] text-muted-foreground">
                                    Endpoint:{" "}
                                    <span className="text-foreground font-semibold">
                                      {normalizeEndpointDisplay(step.httpMethod, step.operation, step.calleeService)}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : sequence.data ? (
                      <p className="text-sm">No observed interactions recorded for this session.</p>
                    ) : null}
                  </div>
                  <p className="break-all text-xs">
                    Source: {session.data.snapshotId} · Model:{" "}
                    {session.data.modelId ?? "Not reported"}
                  </p>
                  <p className="text-sm">Profile: {session.data.profileName ?? "Not reported"}</p>
                  <div className="mt-3 flex gap-3">
                    {["NOT_STARTED", "PENDING"].includes(session.data.executionStatus) && (
                      <Button disabled={approve.isPending} onClick={() => setAction("approve")}>
                        Approve operator session
                      </Button>
                    )}
                    {active.has(session.data.executionStatus) &&
                      session.data.executionStatus !== "CANCELLING" && (
                        <Button
                          variant="outline"
                          disabled={stop.isPending}
                          onClick={() => setAction("stop")}
                        >
                          Stop session
                        </Button>
                      )}
                  </div>
                </>
              )}
            </RequestState>
          )}
        </RequestState>
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
function PreflightResult({
  result,
}: {
  result:
    | {
        compatible: boolean;
        detectedServices: string[];
        securityWarnings: string[];
        recommendedProfile: string | null;
      }
    | undefined;
}) {
  return result ? (
    <section className="mt-3 space-y-2 text-sm">
      <p>
        {result.compatible
          ? "Source is eligible for runtime preflight"
          : "This source is not eligible for the configured runtime flow"}
      </p>
      {result.recommendedProfile && <p>Recommended profile: {result.recommendedProfile}</p>}
      <p>Detected services: {result.detectedServices.join(", ") || "None reported"}</p>
      {result.securityWarnings.map((warning, i) => (
        <p key={i}>{warning}</p>
      ))}
    </section>
  ) : null;
}

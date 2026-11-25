"use client";

import type { Response } from "@/lib/api/contracts";
import { useLocale } from "@/lib/i18n/locale-context";

type Studio = Response<"studioState">;
type HistoryFrame = NonNullable<Studio["telemetryHistory"]>[number];
type StudioActionItem = Studio["actions"][number];
type StudioSpan = NonNullable<Studio["telemetry"]>["spans"][number];
type ServiceGraphEdge = NonNullable<NonNullable<Studio["telemetry"]>["serviceGraph"]>[number];

export type RedPoint = {
  observedAt: string;
  tMs: number;
  rps: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  errorRatePercent: number | null;
  spanCount: number;
  errorSpanCount: number;
};

export type ActionMarker = {
  actionId: string;
  label: string;
  action: string;
  tMs: number;
  xRatio: number;
};

export type BeforeAfterWindow = {
  actionLabel: string;
  completedAt: string;
  beforeSamples: number;
  afterSamples: number;
  rpsBefore: number | null;
  rpsAfter: number | null;
  p95BeforeMs: number | null;
  p95AfterMs: number | null;
  errorBeforePct: number | null;
  errorAfterPct: number | null;
};

type StudioInteraction = NonNullable<NonNullable<Studio["telemetry"]>["interactions"]>[number];

export type WaterfallRow = {
  spanId: string;
  parentSpanId: string | null;
  runtimeService: string;
  targetService?: string | null | undefined;
  label: string;
  depth: number;
  offsetPct: number;
  widthPct: number;
  durationMs: number;
  httpStatusCode: number | null;
  isError: boolean;
  circuitOpen: boolean;
};

function finiteNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Number(value.toFixed(digits)).toString();
}

function avg(values: ReadonlyArray<number | null>): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/** Extracts the last 60 frames of RED telemetry plus x-positioned vertical markers for confirmed actions. */
export function buildRedSeries(
  history: ReadonlyArray<HistoryFrame> | null | undefined,
  actions: ReadonlyArray<StudioActionItem> | null | undefined,
): { points: RedPoint[]; markers: ActionMarker[] } {
  const recent = (history ?? []).slice(-60);
  const points: RedPoint[] = [];
  for (const frame of recent) {
    const tMs = Date.parse(frame.observedAt);
    if (!Number.isFinite(tMs)) continue;
    const probe = frame.probe ?? null;
    points.push({
      observedAt: frame.observedAt,
      tMs,
      rps: probe ? finiteNum(probe["rps"]) : null,
      p50Ms: probe ? finiteNum(probe["p50Ms"]) : null,
      p95Ms: probe ? finiteNum(probe["p95Ms"]) : null,
      p99Ms: probe ? finiteNum(probe["p99Ms"]) : null,
      errorRatePercent: probe ? finiteNum(probe["errorRatePercent"]) : null,
      spanCount: frame.spanCount ?? 0,
      errorSpanCount: frame.errorSpanCount ?? 0,
    });
  }
  if (points.length < 2) return { points, markers: [] };
  const minT = points[0]!.tMs;
  const maxT = points[points.length - 1]!.tMs;
  const spanMs = Math.max(1, maxT - minT);
  const markers: ActionMarker[] = [];
  for (const act of actions ?? []) {
    if (act.status !== "CONFIRMED") continue;
    const iso = act.completedAt ?? act.requestedAt;
    const tMs = Date.parse(iso);
    if (!Number.isFinite(tMs) || tMs < minT || tMs > maxT) continue;
    markers.push({
      actionId: act.actionId,
      action: act.action,
      label: `${act.action} ${act.service}${act.replicas ? `=${act.replicas}` : ""}`,
      tMs,
      xRatio: Math.min(1, Math.max(0, (tMs - minT) / spanMs)),
    });
  }
  return { points, markers };
}

/** Computes a 30s Before vs 30s After RED comparison around the most recent confirmed infrastructure action. */
export function computeBeforeAfterWindow(
  history: ReadonlyArray<HistoryFrame> | null | undefined,
  actions: ReadonlyArray<StudioActionItem> | null | undefined,
  windowMs = 30_000,
): BeforeAfterWindow | null {
  const lastConfirmed = [...(actions ?? [])]
    .reverse()
    .find((a) => a.status === "CONFIRMED" && Boolean(a.completedAt ?? a.requestedAt));
  if (!lastConfirmed) return null;
  const completedAt = lastConfirmed.completedAt ?? lastConfirmed.requestedAt;
  const pivotMs = Date.parse(completedAt);
  if (!Number.isFinite(pivotMs)) return null;

  const { points } = buildRedSeries(history, []);
  const before = points.filter((p) => p.tMs >= pivotMs - windowMs && p.tMs < pivotMs && p.rps !== null);
  const after = points.filter((p) => p.tMs >= pivotMs && p.tMs <= pivotMs + windowMs && p.rps !== null);
  if (before.length === 0 && after.length === 0) return null;

  return {
    actionLabel: `${lastConfirmed.action} ${lastConfirmed.service}${lastConfirmed.replicas ? ` → ${lastConfirmed.replicas}` : ""}`,
    completedAt,
    beforeSamples: before.length,
    afterSamples: after.length,
    rpsBefore: avg(before.map((p) => p.rps)),
    rpsAfter: avg(after.map((p) => p.rps)),
    p95BeforeMs: avg(before.map((p) => p.p95Ms)),
    p95AfterMs: avg(after.map((p) => p.p95Ms)),
    errorBeforePct: avg(before.map((p) => p.errorRatePercent)),
    errorAfterPct: avg(after.map((p) => p.errorRatePercent)),
  };
}

/** Orders spans in one trace into an indented causal waterfall with relative start/duration percentages. */
export function buildTraceWaterfall(
  spans: ReadonlyArray<StudioSpan> | null | undefined,
  traceId: string,
  interactions?: ReadonlyArray<StudioInteraction> | null | undefined,
): { rows: WaterfallRow[]; totalMs: number } {
  const group = (spans ?? []).filter((s) => s.traceId === traceId);
  if (group.length === 0) return { rows: [], totalMs: 0 };

  // Resolve downstream target service for outbound spans via OTel interactions so child bars show caller -> callee.
  const targetBySpanId = new Map<string, string>();
  for (const edge of interactions ?? []) {
    if (edge.traceId && edge.traceId !== traceId) continue;
    if (edge.parentSpanId && edge.toService && !targetBySpanId.has(edge.parentSpanId)) {
      targetBySpanId.set(edge.parentSpanId, edge.toService);
    }
    if (edge.childSpanId && edge.toService && !targetBySpanId.has(edge.childSpanId)) {
      targetBySpanId.set(edge.childSpanId, edge.toService);
    }
  }

  const parsed = group.map((span, idx) => {
    const startNs = span.startTimeUnixNano ? Number(span.startTimeUnixNano) : NaN;
    const durNs = span.durationNanoseconds ? Number(span.durationNanoseconds) : NaN;
    const safeStart = Number.isFinite(startNs) && startNs >= 0 ? startNs : idx * 1_000_000;
    const safeDur = Number.isFinite(durNs) && durNs >= 0 ? durNs : 0;
    const status = span.spanStatus?.toUpperCase();
    const isError =
      status === "ERROR" || (typeof span.httpStatusCode === "number" && span.httpStatusCode >= 500) || span.circuitOpen === true;
    const rawOp = span.operationName?.trim() || "";
    const isGenericStatusOp = /^HTTP\s+\d{3}$/i.test(rawOp);
    const label =
      (rawOp && !isGenericStatusOp ? rawOp : null) ||
      (span.route ? `${span.httpMethod ? `${span.httpMethod} ` : ""}${span.route}` : null) ||
      (span.httpMethod ? span.httpMethod : "HTTP");
    const mappedTarget = targetBySpanId.get(span.spanId) ?? null;
    const targetService =
      mappedTarget && mappedTarget !== span.runtimeService ? mappedTarget : null;
    return {
      span,
      startNs: safeStart,
      endNs: safeStart + safeDur,
      durationMs: safeDur / 1e6,
      isError,
      label,
      targetService,
    };
  });

  const minStart = Math.min(...parsed.map((p) => p.startNs));
  const maxEnd = Math.max(...parsed.map((p) => p.endNs), minStart + 1_000_000);
  const totalNs = Math.max(1, maxEnd - minStart);

  const byId = new Map(parsed.map((p) => [p.span.spanId, p]));
  const children = new Map<string | null, typeof parsed>();
  for (const item of parsed) {
    const pid = item.span.parentSpanId && byId.has(item.span.parentSpanId) ? item.span.parentSpanId : null;
    const list = children.get(pid) ?? [];
    list.push(item);
    children.set(pid, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.startNs - b.startNs || a.span.spanId.localeCompare(b.span.spanId));
  }

  const rows: WaterfallRow[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const item of children.get(parentId) ?? []) {
      if (visited.has(item.span.spanId)) continue;
      visited.add(item.span.spanId);
      const offsetPct = Math.min(98, Math.max(0, ((item.startNs - minStart) / totalNs) * 100));
      const widthPct = Math.min(100 - offsetPct, Math.max(2, ((item.endNs - item.startNs) / totalNs) * 100));
      rows.push({
        spanId: item.span.spanId,
        parentSpanId: item.span.parentSpanId ?? null,
        runtimeService: item.span.runtimeService,
        targetService: item.targetService,
        label: item.label,
        depth: Math.min(depth, 6),
        offsetPct,
        widthPct,
        durationMs: item.durationMs,
        httpStatusCode: item.span.httpStatusCode ?? null,
        isError: item.isError,
        circuitOpen: item.span.circuitOpen === true,
      });
      walk(item.span.spanId, depth + 1);
    }
  };
  walk(null, 0);
  // Append any cyclic/orphan spans defensively so no span is ever dropped.
  for (const item of parsed) {
    if (!visited.has(item.span.spanId)) {
      walk(item.span.parentSpanId ?? null, 0);
      if (!visited.has(item.span.spanId)) {
        visited.add(item.span.spanId);
        const offsetPct = Math.min(98, Math.max(0, ((item.startNs - minStart) / totalNs) * 100));
        const widthPct = Math.min(100 - offsetPct, Math.max(2, ((item.endNs - item.startNs) / totalNs) * 100));
        rows.push({
          spanId: item.span.spanId,
          parentSpanId: item.span.parentSpanId ?? null,
          runtimeService: item.span.runtimeService,
          targetService: item.targetService,
          label: item.label,
          depth: 0,
          offsetPct,
          widthPct,
          durationMs: item.durationMs,
          httpStatusCode: item.span.httpStatusCode ?? null,
          isError: item.isError,
          circuitOpen: item.span.circuitOpen === true,
        });
      }
    }
  }
  return { rows, totalMs: totalNs / 1e6 };
}

function SvgSeriesCard({
  title,
  latestLabel,
  unit,
  series,
  markers,
  yMaxFloor,
  isLight = false,
}: {
  title: string;
  latestLabel: string;
  unit: string;
  series: ReadonlyArray<{ name: string; color: string; values: ReadonlyArray<number | null> }>;
  markers: ReadonlyArray<ActionMarker>;
  yMaxFloor: number;
  isLight?: boolean | undefined;
}) {
  const width = 260;
  const height = 64;
  const padX = 4;
  const padY = 6;
  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  const maxVal = Math.max(yMaxFloor, ...allValues, 1);
  const count = Math.max(1, series[0]?.values.length ?? 0);

  return (
    <div
      className={`rounded-xl border p-3 ${
        isLight ? "border-slate-200 bg-white shadow-2xs" : "border-slate-800 bg-slate-900/75"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className={`font-medium ${isLight ? "text-slate-600" : "text-slate-300"}`}>{title}</span>
        <span className={`font-mono font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
          {latestLabel}
          {latestLabel !== "—" && unit ? (
            <span className={`ml-0.5 text-[10px] font-normal ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              {unit}
            </span>
          ) : null}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full overflow-visible">
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke={isLight ? "#cbd5e1" : "#1e293b"}
          strokeWidth="1"
        />
        <line
          x1={padX}
          y1={padY}
          x2={width - padX}
          y2={padY}
          stroke={isLight ? "#e2e8f0" : "#1e293b"}
          strokeWidth="0.7"
          strokeDasharray="2 3"
        />
        {markers.map((m) => {
          const x = padX + m.xRatio * (width - padX * 2);
          const color = m.action === "STOP" ? "#e11d48" : m.action === "SCALE" ? "#0284c7" : "#059669";
          return (
            <g key={m.actionId}>
              <line x1={x} y1={2} x2={x} y2={height - 2} stroke={color} strokeWidth="1.2" strokeDasharray="3 2" />
              <title>{m.label}</title>
            </g>
          );
        })}
        {series.map((s) => {
          const coords: string[] = [];
          s.values.forEach((val, idx) => {
            if (val === null || !Number.isFinite(val)) return;
            const x = count === 1 ? width / 2 : padX + (idx / (count - 1)) * (width - padX * 2);
            const y = height - padY - (Math.min(maxVal, Math.max(0, val)) / maxVal) * (height - padY * 2);
            coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          });
          if (coords.length < 2) return null;
          return (
            <polyline
              key={s.name}
              fill="none"
              stroke={s.color}
              strokeWidth="1.9"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={coords.join(" ")}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-2">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
        <span className="font-mono">max {fmt(maxVal, 0)}{unit}</span>
      </div>
    </div>
  );
}

export function StudioRedCharts({
  history,
  actions,
  serviceGraph,
  spans,
  onSelectTrace,
  isLight = false,
}: {
  history: ReadonlyArray<HistoryFrame> | null | undefined;
  actions: ReadonlyArray<StudioActionItem> | null | undefined;
  serviceGraph: ReadonlyArray<ServiceGraphEdge> | null | undefined;
  spans: ReadonlyArray<StudioSpan> | null | undefined;
  onSelectTrace?: ((traceId: string) => void) | undefined;
  isLight?: boolean | undefined;
}) {
  const { t } = useLocale();
  const { points, markers } = buildRedSeries(history, actions);
  const beforeAfter = computeBeforeAfterWindow(history, actions);
  const probePoints = points.filter((p) => p.rps !== null);

  // Slowest trace exemplar so clicking jumps straight into its real waterfall.
  let exemplarTraceId: string | null = null;
  let exemplarMs = -1;
  for (const span of spans ?? []) {
    const ms = span.durationNanoseconds ? Number(span.durationNanoseconds) / 1e6 : NaN;
    if (Number.isFinite(ms) && ms > exemplarMs) {
      exemplarMs = ms;
      exemplarTraceId = span.traceId;
    }
  }

  if (probePoints.length === 0 && (serviceGraph?.length ?? 0) === 0 && !beforeAfter) {
    return null;
  }

  const latest = probePoints[probePoints.length - 1];

  return (
    <div className="space-y-2.5">
      {probePoints.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={`font-semibold ${isLight ? "text-slate-900" : "text-slate-200"}`}>
              {t("Live RED Time-Series", "Biểu đồ RED trực tiếp")} ({probePoints.length} {t("frames", "mẫu")})
            </span>
            <div className="flex items-center gap-2">
              {markers.length > 0 && (
                <span className={`text-[11px] ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  {t(
                    `Dashed lines = ${markers.length} action${markers.length > 1 ? "s" : ""}`,
                    `Vạch đứt = ${markers.length} thao tác`,
                  )}
                </span>
              )}
              {exemplarTraceId && onSelectTrace && (
                <button
                  type="button"
                  onClick={() => onSelectTrace(exemplarTraceId)}
                  className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${
                    isLight
                      ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                      : "border-sky-500/40 bg-sky-950/50 text-sky-200 hover:bg-sky-900/60"
                  }`}
                >
                  {t("Inspect slowest trace", "Xem trace chậm nhất")} ({fmt(exemplarMs, 1)} ms)
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <SvgSeriesCard
              title={t("Throughput", "Lưu lượng (RPS)")}
              latestLabel={fmt(latest?.rps, 1)}
              unit="rps"
              markers={markers}
              yMaxFloor={5}
              isLight={isLight}
              series={[{ name: "RPS", color: "#059669", values: points.map((p) => p.rps) }]}
            />
            <SvgSeriesCard
              title={t("Latency", "Độ trễ (ms)")}
              latestLabel={fmt(latest?.p95Ms, 1)}
              unit="ms"
              markers={markers}
              yMaxFloor={25}
              isLight={isLight}
              series={[
                { name: "p50", color: "#0284c7", values: points.map((p) => p.p50Ms) },
                { name: "p95", color: "#d97706", values: points.map((p) => p.p95Ms) },
                { name: "p99", color: "#e11d48", values: points.map((p) => p.p99Ms) },
              ]}
            />
            <SvgSeriesCard
              title={t("Error Rate", "Tỉ lệ lỗi (%)")}
              latestLabel={fmt(latest?.errorRatePercent, 1)}
              unit="%"
              markers={markers}
              yMaxFloor={10}
              isLight={isLight}
              series={[{ name: "Err %", color: "#e11d48", values: points.map((p) => p.errorRatePercent) }]}
            />
          </div>
        </div>
      )}

      {beforeAfter && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${
            isLight ? "border-sky-200/80 bg-sky-50/55 text-slate-800" : "border-slate-800 bg-slate-900/75 text-slate-200"
          }`}
        >
          <span className="font-semibold">
            {t("30s Before / After", "So sánh 30s Trước / Sau")} ·{" "}
            <span className={`font-mono ${isLight ? "text-sky-700" : "text-sky-300"}`}>
              {beforeAfter.actionLabel}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11.5px] tabular-nums">
            <span>
              <span className="text-muted-foreground">RPS </span>
              {fmt(beforeAfter.rpsBefore, 1)}→{fmt(beforeAfter.rpsAfter, 1)}
            </span>
            <span>
              <span className="text-muted-foreground">p95 </span>
              {fmt(beforeAfter.p95BeforeMs, 1)}→{fmt(beforeAfter.p95AfterMs, 1)}ms
            </span>
            <span
              className={`font-semibold ${
                (beforeAfter.errorAfterPct ?? 0) > (beforeAfter.errorBeforePct ?? 0) + 1
                  ? isLight ? "text-rose-600" : "text-rose-300"
                  : isLight ? "text-emerald-700" : "text-emerald-300"
              }`}
            >
              <span className="font-normal text-muted-foreground">Err </span>
              {fmt(beforeAfter.errorBeforePct, 1)}%→{fmt(beforeAfter.errorAfterPct, 1)}%
            </span>
          </div>
        </div>
      )}

      {serviceGraph && serviceGraph.length > 0 && (() => {
        const failingEdges = serviceGraph.filter((edge) => edge.errorRatePercent > 0).length;
        return (
          <details
            className={`overflow-hidden rounded-lg border text-xs ${
              isLight ? "border-slate-200 bg-slate-50/70 text-slate-700" : "border-slate-800 bg-slate-900/65 text-slate-300"
            }`}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 font-medium select-none">
              <span className="inline-flex items-center gap-2">
                <span>
                  {t("Service-to-service edges", "Đường gọi giữa các service")} ({serviceGraph.length})
                </span>
                {failingEdges > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                      isLight ? "bg-rose-100 text-rose-700" : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    {failingEdges} {t(failingEdges > 1 ? "errors" : "error", "lỗi")}
                  </span>
                )}
              </span>
              <span className="text-[11px] text-muted-foreground">{t("Details", "Chi tiết")} ▾</span>
            </summary>
            <div className={`overflow-x-auto border-t ${isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-slate-950/50"}`}>
              <table className="mavis-tabular w-full text-left font-mono text-xs">
                <thead
                  className={`border-b text-[11px] uppercase tracking-wide ${
                    isLight
                      ? "border-slate-200 bg-slate-50 text-slate-600"
                      : "border-slate-800 text-slate-500"
                  }`}
                >
                  <tr>
                    <th className="px-3 py-1.5 font-semibold">
                      {t("Live Edge (OTel servicegraph)", "Đường gọi thực tế (OTel)")}
                    </th>
                    <th className="px-3 py-1.5 font-semibold">RPS</th>
                    <th className="px-3 py-1.5 font-semibold">p95</th>
                    <th className="px-3 py-1.5 font-semibold">{t("Error %", "Lỗi %")}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? "divide-slate-200/80" : "divide-slate-800/70"}`}>
                  {serviceGraph.map((edge) => (
                    <tr key={`${edge.client}->${edge.server}`}>
                      <td className={`px-3 py-1.5 ${isLight ? "text-slate-900" : "text-slate-200"}`}>
                        {edge.client} <span className="text-slate-400">→</span> {edge.server}
                      </td>
                      <td className={`px-3 py-1.5 font-semibold ${isLight ? "text-emerald-700" : "text-emerald-300"}`}>
                        {fmt(edge.rps, 1)}
                      </td>
                      <td className={`px-3 py-1.5 ${isLight ? "text-slate-800" : "text-slate-200"}`}>
                        {edge.p95Ms != null ? `${fmt(edge.p95Ms, 1)} ms` : "—"}
                      </td>
                      <td
                        className={`px-3 py-1.5 font-semibold ${
                          edge.errorRatePercent > 0
                            ? isLight ? "text-rose-600" : "text-rose-300"
                            : isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {fmt(edge.errorRatePercent, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })()}
    </div>
  );
}

export function TraceWaterfallPanel({
  spans,
  interactions,
  traceId,
  onClose,
  isLight = false,
}: {
  spans: ReadonlyArray<StudioSpan> | null | undefined;
  interactions?: ReadonlyArray<StudioInteraction> | null | undefined;
  traceId: string;
  onClose: () => void;
  isLight?: boolean | undefined;
}) {
  const { t } = useLocale();
  const { rows, totalMs } = buildTraceWaterfall(spans, traceId, interactions);
  if (rows.length === 0) return null;

  return (
    <div
      className={`mb-2 rounded-xl border p-3 font-mono text-xs ${
        isLight
          ? "border-sky-200 bg-sky-50/50 text-slate-900"
          : "border-sky-500/30 bg-[#080d18] text-slate-100"
      }`}
    >
      <div
        className={`mb-2 flex items-center justify-between gap-2 border-b pb-1.5 ${
          isLight ? "border-sky-200" : "border-slate-800"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isLight ? "text-sky-700" : "text-sky-300"}`}>
            Trace Waterfall
          </span>
          <span className={isLight ? "text-slate-600" : "text-slate-400"}>{traceId.slice(0, 12)}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10.5px] ${
              isLight ? "bg-white text-slate-700 border border-slate-200" : "bg-slate-800 text-slate-200"
            }`}
          >
            {rows.length} spans · {fmt(totalMs, 1)} ms
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`text-[11px] font-medium ${
            isLight ? "text-slate-600 hover:text-slate-900" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          {t("Close", "Đóng")}
        </button>
      </div>
      <div className="space-y-1">
        {rows.map((row) => {
          const svcDisplay = row.targetService
            ? `${row.runtimeService} → ${row.targetService}`
            : row.runtimeService;
          const labelAlreadyHasStatus =
            row.httpStatusCode != null && row.label.includes(String(row.httpStatusCode));
          return (
          <div key={row.spanId} className="grid grid-cols-[minmax(180px,42%)_1fr_64px] items-center gap-2">
            <div
              className={`truncate ${isLight ? "text-slate-900" : "text-slate-200"}`}
              style={{ paddingLeft: `${row.depth * 12}px` }}
              title={`${svcDisplay} — ${row.label}${row.httpStatusCode != null ? ` (${row.httpStatusCode})` : ""}`}
            >
              <span className={`font-semibold ${isLight ? "text-sky-700" : "text-sky-300"}`}>
                {svcDisplay}
              </span>{" "}
              <span className={isLight ? "text-slate-600" : "text-slate-400"}>{row.label}</span>
              {row.httpStatusCode != null && !labelAlreadyHasStatus && (
                <span
                  className={`ml-1 text-[10.5px] font-semibold ${
                    row.httpStatusCode >= 500
                      ? isLight ? "text-rose-600" : "text-rose-300"
                      : row.httpStatusCode >= 400
                        ? isLight ? "text-amber-700" : "text-amber-300"
                        : isLight ? "text-emerald-700" : "text-emerald-300"
                  }`}
                >
                  {row.httpStatusCode}
                </span>
              )}
            </div>
            <div
              className={`relative h-3 overflow-hidden rounded ${
                isLight ? "bg-slate-200" : "bg-slate-900"
              }`}
            >
              <div
                className={`absolute top-0.5 h-2 rounded-sm ${
                  row.isError ? "bg-rose-500" : "bg-sky-500"
                }`}
                style={{ left: `${row.offsetPct}%`, width: `${row.widthPct}%` }}
              />
            </div>
            <div className={`text-right tabular-nums ${isLight ? "text-slate-700" : "text-slate-300"}`}>
              {fmt(row.durationMs, 1)} ms
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

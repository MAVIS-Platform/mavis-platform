"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Check, Copy, Search, Terminal } from "lucide-react";
import type { Response } from "@/lib/api/contracts";

type Studio = Response<"studioState">;

export type TerminalLogLevel = "ERROR" | "WARN" | "INFO" | "PLAIN";

export type TerminalLogEntry = {
  id: string;
  seq: number;
  service: string;
  sourceLabel: string;
  timestampMs: number | null;
  timestampLabel: string;
  level: TerminalLogLevel;
  message: string;
};

const SERVICE_COLORS = [
  { text: "text-cyan-400", dot: "bg-cyan-400" },
  { text: "text-emerald-400", dot: "bg-emerald-400" },
  { text: "text-amber-300", dot: "bg-amber-300" },
  { text: "text-violet-400", dot: "bg-violet-400" },
  { text: "text-pink-400", dot: "bg-pink-400" },
  { text: "text-sky-300", dot: "bg-sky-300" },
] as const;

const SYSTEM_SERVICE_COLORS: Record<string, { text: string; dot: string }> = {
  "mavis-runner": { text: "text-indigo-300", dot: "bg-indigo-400" },
  "otel-collector": { text: "text-amber-300", dot: "bg-amber-400" },
};

const COMPOSE_PREFIX_RE = /^([a-zA-Z0-9_.-]+)\s*\|\s*(.*)$/;
const ISO_TS_RE =
  /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)$/;
const CLOCK_TS_RE = /^(\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s+(.*)$/;
const ERROR_LINE_RE =
  /\b(ERROR|FATAL|SEVERE|PANIC|EXCEPTION|ECONNREFUSED|OOMKILLED|CRASHED)\b/i;
const STACK_LINE_RE = /^\s*(at\s+[\w.$<>]+\(|Caused by:|\.\.\.\s+\d+\s+more)/;
const WARN_LINE_RE =
  /\b(WARN|WARNING|DEPRECATED|TIMEOUT|TIMED OUT|RETRYING|CIRCUIT[\s_-]?OPEN)\b/i;
const INFO_LINE_RE = /\b(INFO|STARTED|LISTENING|READY|HEALTHY|BOOTED)\b/i;

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function parseTimestampPrefix(line: string): {
  timestampMs: number | null;
  timestampLabel: string;
  body: string;
} {
  const isoMatch = line.match(ISO_TS_RE);
  if (isoMatch) {
    const rawTs = isoMatch[1]!.replace(",", ".").replace(" ", "T");
    const parsed = new Date(rawTs);
    const ms = parsed.getTime();
    if (Number.isFinite(ms)) {
      return {
        timestampMs: ms,
        timestampLabel: formatClock(parsed),
        body: isoMatch[2] ?? "",
      };
    }
    const timePart = isoMatch[1]!.slice(11, 19);
    return { timestampMs: null, timestampLabel: timePart, body: isoMatch[2] ?? "" };
  }
  const clockMatch = line.match(CLOCK_TS_RE);
  if (clockMatch) {
    return {
      timestampMs: null,
      timestampLabel: clockMatch[1]!.slice(0, 8),
      body: clockMatch[2] ?? "",
    };
  }
  return { timestampMs: null, timestampLabel: "", body: line };
}

function classifyLogLevel(
  message: string,
  previousLevel: TerminalLogLevel,
): TerminalLogLevel {
  if (STACK_LINE_RE.test(message)) {
    return previousLevel === "WARN" ? "WARN" : "ERROR";
  }
  if (ERROR_LINE_RE.test(message)) return "ERROR";
  if (WARN_LINE_RE.test(message)) return "WARN";
  if (INFO_LINE_RE.test(message)) return "INFO";
  return "PLAIN";
}

function safeMetric(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(2)).toString()
    : "—";
}

export function buildTerminalEntries(data: Studio): TerminalLogEntry[] {
  const entries: TerminalLogEntry[] = [];
  let seq = 0;

  for (const svc of data.telemetry?.services ?? []) {
    if (!svc.logs?.trim()) continue;
    let lastTsMs: number | null = null;
    let lastLevel: TerminalLogLevel = "PLAIN";
    for (const rawLine of svc.logs.split(/\r?\n/)) {
      const trimmedEnd = rawLine.trimEnd();
      if (!trimmedEnd.trim()) continue;
      const prefixMatch = trimmedEnd.match(COMPOSE_PREFIX_RE);
      const sourceLabel = prefixMatch ? prefixMatch[1]! : svc.service;
      const afterPrefix = prefixMatch ? prefixMatch[2]! : trimmedEnd;
      const { timestampMs, timestampLabel, body } = parseTimestampPrefix(afterPrefix);
      const effectiveTs = timestampMs ?? lastTsMs;
      if (timestampMs !== null) lastTsMs = timestampMs;
      const level = classifyLogLevel(body, lastLevel);
      lastLevel = level;
      entries.push({
        id: `log-${svc.service}-${seq}`,
        seq: seq++,
        service: svc.service,
        sourceLabel,
        timestampMs: effectiveTs,
        timestampLabel,
        level,
        message: body,
      });
    }
  }

  for (const action of data.actions) {
    const rawIso = action.completedAt ?? action.requestedAt;
    const parsed = rawIso ? new Date(rawIso) : null;
    const tsMs = parsed && Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
    const summaryParts = [
      `[${action.status}]`,
      `${action.action} ${action.service}${action.replicas ? ` -> ${action.replicas}` : ""}`,
    ];
    if (action.result) {
      summaryParts.push(
        `(replicas ${action.result.replicasBefore}->${action.result.replicasAfter}, req ${safeMetric(action.result.metricsAfter["requestCount"])}, p95 ${safeMetric(action.result.metricsAfter["p95LatencyMs"])}ms, err ${safeMetric(action.result.metricsAfter["errorRatePercent"])}%)`,
      );
    }
    const level: TerminalLogLevel =
      action.status === "FAILED"
        ? "ERROR"
        : action.status === "INTERRUPTED"
          ? "WARN"
          : "INFO";
    entries.push({
      id: `act-${action.actionId}`,
      seq: seq++,
      service: action.service,
      sourceLabel: "mavis-runner",
      timestampMs: tsMs,
      timestampLabel: tsMs !== null ? formatClock(new Date(tsMs)) : "",
      level,
      message: summaryParts.join(" "),
    });
  }

  for (const warning of data.telemetry?.warnings ?? []) {
    if (!warning.trim()) continue;
    const parsed = data.telemetry?.observedAt ? new Date(data.telemetry.observedAt) : null;
    const tsMs = parsed && Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
    entries.push({
      id: `warn-${seq}`,
      seq: seq++,
      service: "otel-collector",
      sourceLabel: "otel-collector",
      timestampMs: tsMs,
      timestampLabel: tsMs !== null ? formatClock(new Date(tsMs)) : "",
      level: "WARN",
      message: warning.trim(),
    });
  }

  // Only interleave chronologically when multiple sources carry parseable timestamps;
  // otherwise keep exact per-service emission order so untimestamped stdout stays intact.
  const timedServices = new Set(
    entries.filter((entry) => entry.timestampMs !== null).map((entry) => entry.sourceLabel),
  );
  if (timedServices.size >= 2) {
    entries.sort((a, b) => {
      if (a.timestampMs !== null && b.timestampMs !== null && a.timestampMs !== b.timestampMs) {
        return a.timestampMs - b.timestampMs;
      }
      return a.seq - b.seq;
    });
  }

  return entries;
}

function serviceColorFor(name: string, orderedServices: readonly string[]) {
  if (SYSTEM_SERVICE_COLORS[name]) return SYSTEM_SERVICE_COLORS[name]!;
  const baseIdx = orderedServices.findIndex(
    (svc) => name === svc || name.startsWith(`${svc}-`) || name.startsWith(`${svc}_`),
  );
  const idx =
    baseIdx >= 0
      ? baseIdx
      : [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return SERVICE_COLORS[idx % SERVICE_COLORS.length]!;
}

type LiveTerminalConsoleProps = {
  data: Studio;
  projectName?: string | undefined;
  isPreviewMode: boolean;
  waiting: boolean;
  statusLabel: string;
};

export function LiveTerminalConsole({
  data,
  projectName,
  isPreviewMode,
  waiting,
  statusLabel,
}: LiveTerminalConsoleProps) {
  const [view, setView] = useState<"console" | "traces">("console");
  const [serviceFilter, setServiceFilter] = useState<string>("ALL");
  const [levelFilter, setLevelFilter] = useState<"ALL" | "WARN" | "ERROR">("ALL");
  const [query, setQuery] = useState("");
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => buildTerminalEntries(data), [data]);
  const spans = data.telemetry?.spans ?? [];

  const serviceList = useMemo(() => {
    const names = new Set<string>(data.services);
    for (const entry of entries) {
      if (entry.service && entry.service !== "otel-collector") names.add(entry.service);
    }
    for (const span of spans) {
      if (span.runtimeService) names.add(span.runtimeService);
    }
    return [...names];
  }, [data.services, entries, spans]);

  const errorCount = useMemo(
    () => entries.filter((entry) => entry.level === "ERROR").length,
    [entries],
  );
  const warnCount = useMemo(
    () => entries.filter((entry) => entry.level === "WARN").length,
    [entries],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (serviceFilter !== "ALL" && entry.service !== serviceFilter) return false;
      if (levelFilter === "ERROR" && entry.level !== "ERROR") return false;
      if (levelFilter === "WARN" && entry.level !== "WARN" && entry.level !== "ERROR") {
        return false;
      }
      if (
        normalizedQuery &&
        !entry.message.toLowerCase().includes(normalizedQuery) &&
        !entry.sourceLabel.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, serviceFilter, levelFilter, normalizedQuery]);

  const filteredSpans = useMemo(() => {
    return spans.filter((span) => {
      if (serviceFilter !== "ALL" && span.runtimeService !== serviceFilter) return false;
      if (normalizedQuery) {
        const hay = `${span.runtimeService} ${span.operationName ?? ""} ${span.traceId} ${span.httpStatusCode ?? ""}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [spans, serviceFilter, normalizedQuery]);

  const maxSpanMs = useMemo(() => {
    let peak = 1;
    for (const span of filteredSpans.slice(0, 60)) {
      const ns = span.durationNanoseconds ? Number(span.durationNanoseconds) : NaN;
      if (Number.isFinite(ns) && ns > 0) peak = Math.max(peak, ns / 1e6);
    }
    return peak;
  }, [filteredSpans]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || view !== "console") return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredEntries.length, view]);

  const projectSlug = useMemo(() => {
    const raw = (projectName || data.sessionId || "mavis-stack").trim().toLowerCase();
    return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mavis-stack";
  }, [projectName, data.sessionId]);

  const observedClock = useMemo(() => {
    if (!data.telemetry?.observedAt) return null;
    const parsed = new Date(data.telemetry.observedAt);
    return Number.isFinite(parsed.getTime()) ? formatClock(parsed) : null;
  }, [data.telemetry?.observedAt]);

  const hasTimestamps = useMemo(
    () => filteredEntries.some((entry) => entry.timestampLabel.length > 0),
    [filteredEntries],
  );

  async function copyVisibleOutput() {
    const text =
      view === "console"
        ? filteredEntries
            .map((entry) =>
              [entry.timestampLabel, `${entry.sourceLabel} |`, entry.message]
                .filter(Boolean)
                .join(" "),
            )
            .join("\n")
        : filteredSpans
            .map(
              (span) =>
                `${span.traceId.slice(0, 8)} ${span.runtimeService} ${span.operationName ?? "span"} HTTP=${span.httpStatusCode ?? "-"} ${span.spanStatus ?? "OK"}`,
            )
            .join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable in restricted contexts.
    }
  }

  return (
    <section
      aria-label="Project runtime terminal"
      className="flex h-full min-h-[168px] flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#05080f]"
    >
      {/* Terminal Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 bg-[#0a0f1a] px-2.5 py-1.5 text-[11px]">
        <div
          role="tablist"
          aria-label="Console view mode"
          className="inline-flex shrink-0 items-center rounded border border-slate-800 bg-[#05080f] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "console"}
            onClick={() => setView("console")}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10.5px] font-medium transition ${
              view === "console"
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal aria-hidden="true" className="size-3 text-emerald-400" />
            Terminal ({entries.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "traces"}
            onClick={() => setView("traces")}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10.5px] font-medium transition ${
              view === "traces"
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity aria-hidden="true" className="size-3 text-sky-400" />
            Traces ({spans.length})
          </button>
        </div>

        {/* Service filter pills */}
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setServiceFilter("ALL")}
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
              serviceFilter === "ALL"
                ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                : "border-slate-800 bg-[#05080f] text-slate-400 hover:text-slate-200"
            }`}
          >
            all
          </button>
          {serviceList.map((svc) => {
            const color = serviceColorFor(svc, serviceList);
            const active = serviceFilter === svc;
            return (
              <button
                key={svc}
                type="button"
                onClick={() => setServiceFilter(active ? "ALL" : svc)}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                  active
                    ? "border-sky-500/50 bg-sky-500/15 text-slate-100"
                    : "border-slate-800 bg-[#05080f] text-slate-400 hover:text-slate-200"
                }`}
              >
                <span aria-hidden="true" className={`size-1.5 rounded-full ${color.dot}`} />
                {svc}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {view === "console" && (
            <div className="inline-flex items-center rounded border border-slate-800 bg-[#05080f] p-0.5 font-mono text-[10px]">
              {(
                [
                  ["ALL", "ALL"],
                  ["WARN", warnCount > 0 ? `WARN (${warnCount})` : "WARN"],
                  ["ERROR", errorCount > 0 ? `ERR (${errorCount})` : "ERR"],
                ] as const
              ).map(([lvl, label]) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl)}
                  className={`rounded px-1.5 py-0.5 transition ${
                    levelFilter === lvl
                      ? lvl === "ERROR"
                        ? "bg-rose-500/20 text-rose-200"
                        : lvl === "WARN"
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <label className="relative flex items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2 size-3 text-slate-500"
            />
            <input
              type="search"
              aria-label="Filter terminal output"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="grep…"
              className="h-6 w-28 rounded border border-slate-800 bg-[#05080f] pl-6 pr-2 font-mono text-[10.5px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none sm:w-36"
            />
          </label>

          {view === "console" && (
            <button
              type="button"
              aria-pressed={wrap}
              onClick={() => setWrap((prev) => !prev)}
              className={`h-6 rounded border px-1.5 font-mono text-[10px] transition ${
                wrap
                  ? "border-slate-700 bg-slate-800/80 text-slate-200"
                  : "border-slate-800 bg-[#05080f] text-slate-400 hover:text-slate-200"
              }`}
              title="Toggle line wrap"
            >
              wrap
            </button>
          )}

          <button
            type="button"
            disabled={
              view === "console" ? filteredEntries.length === 0 : filteredSpans.length === 0
            }
            onClick={() => void copyVisibleOutput()}
            className="inline-flex h-6 items-center gap-1 rounded border border-slate-800 bg-[#05080f] px-1.5 font-mono text-[10px] text-slate-300 transition hover:border-slate-700 hover:text-slate-100 disabled:opacity-40"
            title="Copy visible terminal output"
          >
            {copied ? (
              <>
                <Check aria-hidden="true" className="size-3 text-emerald-400" />
                copied
              </>
            ) : (
              <>
                <Copy aria-hidden="true" className="size-3" />
                copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      {view === "console" ? (
        <div
          ref={scrollRef}
          style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 #05080f" }}
          className="min-h-0 flex-1 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-[1.55]"
        >
          {/* Authentic compose command header */}
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-1.5 text-[10.5px]">
            <span className="text-slate-400">
              <span className="text-emerald-400">$</span> docker compose -p {projectSlug} logs -f
              {serviceFilter !== "ALL" ? ` ${serviceFilter}` : ""}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px]">
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  isPreviewMode
                    ? "bg-slate-500"
                    : waiting
                      ? "animate-pulse bg-amber-400"
                      : "animate-pulse bg-emerald-400"
                }`}
              />
              <span
                className={
                  isPreviewMode
                    ? "text-slate-400"
                    : waiting
                      ? "text-amber-300"
                      : "text-emerald-300"
                }
              >
                {isPreviewMode
                  ? "STANDBY · PREVIEW"
                  : waiting
                    ? `BOOTING · ${statusLabel}`
                    : `LIVE${observedClock ? ` · ${observedClock}` : ""}`}
              </span>
            </span>
          </div>

          {filteredEntries.length > 0 ? (
            <div role="log" aria-live="polite" className="space-y-0.5">
              {filteredEntries.map((entry, idx) => {
                const color = serviceColorFor(entry.sourceLabel, serviceList);
                const rowTone =
                  entry.level === "ERROR"
                    ? "bg-rose-500/[0.07] text-rose-200"
                    : entry.level === "WARN"
                      ? "bg-amber-500/[0.05] text-amber-200"
                      : "text-slate-200";
                return (
                  <div
                    key={entry.id}
                    className={`flex items-start rounded-sm px-1 py-0.5 hover:bg-slate-800/35 ${rowTone}`}
                  >
                    <span className="w-7 shrink-0 select-none pr-2 text-right text-[10px] tabular-nums text-slate-600">
                      {idx + 1}
                    </span>
                    {hasTimestamps && (
                      <span className="w-[62px] shrink-0 select-none pr-2 text-[10px] tabular-nums text-slate-500">
                        {entry.timestampLabel || "—"}
                      </span>
                    )}
                    <span
                      title={entry.sourceLabel}
                      className={`w-32 shrink-0 truncate border-r border-slate-800/90 pr-2 text-right font-semibold sm:w-36 ${color.text}`}
                    >
                      {entry.sourceLabel}
                    </span>
                    <span
                      className={`min-w-0 flex-1 pl-2 ${
                        wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                      }`}
                    >
                      {entry.message}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : entries.length > 0 ? (
            <div className="flex items-center justify-between gap-2 py-3 text-slate-400">
              <span>No terminal lines match the active filter.</span>
              <button
                type="button"
                onClick={() => {
                  setServiceFilter("ALL");
                  setLevelFilter("ALL");
                  setQuery("");
                }}
                className="text-sky-300 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="space-y-1 py-1 text-[11px]">
              <div className="flex items-start px-1">
                <span className="w-32 shrink-0 border-r border-slate-800/90 pr-2 text-right font-semibold text-indigo-300 sm:w-36">
                  mavis-runner
                </span>
                <span className="pl-2 text-slate-300">
                  {isPreviewMode
                    ? "Compose stack is in Lab Setup preview (containers not booted)."
                    : waiting
                      ? `Session ${statusLabel} — booting Docker Compose containers and attaching stdout/stderr…`
                      : `Session ${statusLabel} — attached to container logs; waiting for stdout/stderr output.`}
                </span>
              </div>
              <div className="flex items-start px-1">
                <span className="w-32 shrink-0 border-r border-slate-800/90 pr-2 text-right font-semibold text-indigo-300 sm:w-36">
                  mavis-runner
                </span>
                <span className="pl-2 text-slate-400">
                  Services ({serviceList.length}):{" "}
                  <span className="text-slate-200">
                    {serviceList.length > 0 ? serviceList.join(", ") : "none configured"}
                  </span>
                </span>
              </div>
              {isPreviewMode && (
                <div className="flex items-start px-1">
                  <span className="w-32 shrink-0 border-r border-slate-800/90 pr-2 text-right font-semibold text-indigo-300 sm:w-36">
                    mavis-runner
                  </span>
                  <span className="pl-2 text-slate-400">
                    Click <span className="text-emerald-300">Test Live Docker</span> in the top bar
                    to run containers and stream real service stdout/stderr + OpenTelemetry traces.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-1 pt-1 text-slate-500">
                <span className="text-emerald-400">{projectSlug}$</span>
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-1.5 animate-pulse bg-emerald-400/80"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 #05080f" }}
          className="min-h-0 flex-1 overflow-auto font-mono text-[11px]"
        >
          {filteredSpans.length > 0 ? (
            <table className="mavis-tabular w-full whitespace-nowrap text-left">
              <thead className="sticky top-0 bg-[#0a0f1a] text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Trace</th>
                  <th className="px-2.5 py-1.5 font-medium">Service</th>
                  <th className="px-2.5 py-1.5 font-medium">Operation</th>
                  <th className="px-2.5 py-1.5 font-medium">HTTP</th>
                  <th className="px-2.5 py-1.5 font-medium">Status</th>
                  <th className="px-2.5 py-1.5 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredSpans.slice(0, 60).map((span) => {
                  const ns = span.durationNanoseconds ? Number(span.durationNanoseconds) : NaN;
                  const ms = Number.isFinite(ns) && ns >= 0 ? ns / 1e6 : null;
                  const derivedStatus =
                    span.spanStatus && span.spanStatus !== "UNSET"
                      ? span.spanStatus
                      : typeof span.httpStatusCode === "number"
                        ? span.httpStatusCode >= 400
                          ? "ERROR"
                          : "OK"
                        : "OK";
                  const isErr = derivedStatus.toUpperCase() === "ERROR";
                  const color = serviceColorFor(span.runtimeService, serviceList);
                  const httpTone =
                    typeof span.httpStatusCode !== "number"
                      ? "text-slate-500"
                      : span.httpStatusCode >= 500
                        ? "text-rose-300"
                        : span.httpStatusCode >= 400
                          ? "text-amber-300"
                          : "text-emerald-300";
                  const barPct = ms !== null ? Math.min(100, Math.max(4, (ms / maxSpanMs) * 100)) : 0;
                  return (
                    <tr key={span.spanId} className="hover:bg-slate-900/60">
                      <td className="px-2.5 py-1 text-slate-500">{span.traceId.slice(0, 8)}</td>
                      <td className={`px-2.5 py-1 font-semibold ${color.text}`}>
                        {span.runtimeService}
                      </td>
                      <td className="max-w-[260px] truncate px-2.5 py-1 text-slate-200">
                        {span.operationName ||
                          (span.httpStatusCode ? `HTTP ${span.httpStatusCode}` : "Trace span")}
                        {span.circuitOpen && (
                          <span className="ml-1.5 rounded bg-rose-500/20 px-1 py-0.5 text-[9.5px] text-rose-300">
                            CIRCUIT OPEN
                          </span>
                        )}
                      </td>
                      <td className={`px-2.5 py-1 ${httpTone}`}>{span.httpStatusCode ?? "—"}</td>
                      <td
                        className={`px-2.5 py-1 font-semibold ${
                          isErr ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {derivedStatus}
                      </td>
                      <td className="px-2.5 py-1 text-slate-300">
                        {ms !== null ? (
                          <div className="flex items-center gap-2">
                            <span className="w-16 text-right tabular-nums">
                              {ms.toFixed(1)} ms
                            </span>
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800"
                            >
                              <span
                                className={`block h-full rounded-full ${
                                  isErr ? "bg-rose-400" : "bg-sky-400"
                                }`}
                                style={{ width: `${barPct}%` }}
                              />
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-4 text-slate-400">
              {spans.length > 0
                ? "No OpenTelemetry spans match the active filter."
                : isPreviewMode
                  ? "No OpenTelemetry spans yet — run Live Docker to capture distributed traces."
                  : "Waiting for OpenTelemetry spans from the running services…"}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

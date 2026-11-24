"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Check, Copy, Filter, Search, Terminal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Response } from "@/lib/api/contracts";
import { TraceWaterfallPanel } from "./studio-red-charts";

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
  isNoise?: boolean;
  isAction?: boolean;
  friendlyMessage?: string;
};

const SERVICE_COLORS_DARK = [
  { text: "text-cyan-400", dot: "bg-cyan-400" },
  { text: "text-emerald-400", dot: "bg-emerald-400" },
  { text: "text-amber-300", dot: "bg-amber-300" },
  { text: "text-violet-400", dot: "bg-violet-400" },
  { text: "text-pink-400", dot: "bg-pink-400" },
  { text: "text-sky-300", dot: "bg-sky-300" },
] as const;

const SERVICE_COLORS_LIGHT = [
  { text: "text-cyan-700", dot: "bg-cyan-600" },
  { text: "text-emerald-700", dot: "bg-emerald-600" },
  { text: "text-amber-700", dot: "bg-amber-600" },
  { text: "text-violet-700", dot: "bg-violet-600" },
  { text: "text-pink-700", dot: "bg-pink-600" },
  { text: "text-sky-700", dot: "bg-sky-600" },
] as const;

const SYSTEM_SERVICE_COLORS_DARK: Record<string, { text: string; dot: string }> = {
  "mavis-runner": { text: "text-indigo-300", dot: "bg-indigo-400" },
  "otel-collector": { text: "text-amber-300", dot: "bg-amber-400" },
};

const SYSTEM_SERVICE_COLORS_LIGHT: Record<string, { text: string; dot: string }> = {
  "mavis-runner": { text: "text-indigo-700", dot: "bg-indigo-600" },
  "otel-collector": { text: "text-amber-700", dot: "bg-amber-600" },
};

const COMPOSE_PREFIX_RE = /^([a-zA-Z0-9_.-]+)\s*\|\s*(.*)$/;
const ISO_TS_RE =
  /^\[?(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)\]?\s+(.*)$/;
const OTEL_AGENT_TS_RE =
  /^\[otel\.javaagent\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})[:.,](\d{1,3})\s*([+-]\d{2}:?\d{2}|Z)?\]\s*(.*)$/i;
const CLOCK_TS_RE = /^(\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s+(.*)$/;
const ERROR_LINE_RE =
  /\b(ERROR|FATAL|SEVERE|PANIC|EXCEPTION|ECONNREFUSED|OOMKILLED|CRASHED)\b/i;
const STACK_LINE_RE = /^\s*(at\s+[\w.$<>]+\(|Caused by:|\.\.\.\s+\d+\s+more)/;
const WARN_LINE_RE =
  /\b(WARN|WARNING|DEPRECATED|TIMEOUT|TIMED OUT|RETRYING|CIRCUIT[\s_-]?OPEN)\b/i;
const INFO_LINE_RE = /\b(INFO|STARTED|LISTENING|READY|HEALTHY|BOOTED)\b/i;
const JVM_CDS_NOISE_RE = /^OpenJDK 64-Bit Server VM warning:\s*Sharing is only supported/i;
const BOOT_NOISE_RE =
  /^(Picked up JAVA_TOOL_OPTIONS:|OpenJDK 64-Bit Server VM warning:\s*Sharing is only supported|\[otel\.javaagent\].*VersionLogger|ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION$|MISSING_PARENT_SPAN$)|No active profile set, falling back to|opentelemetry-javaagent\s*-\s*version/i;

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function isBootNoiseMessage(message: string): boolean {
  return BOOT_NOISE_RE.test(message.trim());
}

export function explainRuntimeDiagnostic(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/BACKEND_RESTART_RECOVERY/i.test(text)) {
    return "Previous Docker session stopped because the backend server restarted during deployment. Click Run to start a fresh Docker session.";
  }
  if (/DOCKER_UP_FAILED/i.test(text)) {
    return "Docker Compose failed to start all lab containers. Check the error lines below or click Run to retry.";
  }
  if (/STUDIO_MAX_DURATION_AUTO_FINISHED/i.test(text)) {
    return "Docker session reached its maximum session lease and automatically sealed your confirmed evidence. Review your receipt or click Run for a new session.";
  }
  if (/TIMED_?OUT|SESSION_TIMED_OUT/i.test(text)) {
    return "Docker session timed out or became inactive and was cleaned up. Click Run to launch a new session.";
  }
  if (/STUDIO_QUEUE_FULL|QUEUE_INACTIVE/i.test(text)) {
    return "All Runner slots were busy or the tab stayed inactive while queued. Click Run again to rejoin the queue.";
  }
  if (/^ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION$/i.test(text)) {
    return "OTel privacy filter active: sensitive span attributes and event payloads are redacted.";
  }
  if (/^MISSING_PARENT_SPAN$/i.test(text)) {
    return "Partial OTel trace captured (child span arrived before root parent span).";
  }
  return null;
}

export function parseTimestampPrefix(line: string): {
  timestampMs: number | null;
  timestampLabel: string;
  body: string;
} {
  const otelMatch = line.match(OTEL_AGENT_TS_RE);
  if (otelMatch) {
    const dateTime = otelMatch[1]!.replace(" ", "T");
    const millis = otelMatch[2]!.padEnd(3, "0").slice(0, 3);
    const rawTz = otelMatch[3] ?? "Z";
    const tz =
      rawTz === "Z"
        ? "Z"
        : rawTz.includes(":")
          ? rawTz
          : `${rawTz.slice(0, 3)}:${rawTz.slice(3)}`;
    const parsed = new Date(`${dateTime}.${millis}${tz}`);
    const ms = parsed.getTime();
    const rest = (otelMatch[4] ?? "").trim();
    const cleanedBody = rest ? `[otel.javaagent] ${rest}` : "[otel.javaagent]";
    if (Number.isFinite(ms)) {
      return {
        timestampMs: ms,
        timestampLabel: formatClock(parsed),
        body: cleanedBody,
      };
    }
    return {
      timestampMs: null,
      timestampLabel: otelMatch[1]!.slice(11, 19),
      body: cleanedBody,
    };
  }
  const isoMatch = line.match(ISO_TS_RE);
  if (isoMatch) {
    const normalized = isoMatch[1]!.replace(",", ".").replace(" ", "T");
    // Linux container logs emit UTC timestamps without an explicit Z suffix; treat bare ISO as UTC.
    const rawTs = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
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

/** Strict weak ordering (null timestamps last) so interleaved container + runner logs never violate transitivity. */
export function compareTerminalEntries(
  a: Pick<TerminalLogEntry, "timestampMs" | "seq">,
  b: Pick<TerminalLogEntry, "timestampMs" | "seq">,
): number {
  const aTs = a.timestampMs ?? Number.MAX_SAFE_INTEGER;
  const bTs = b.timestampMs ?? Number.MAX_SAFE_INTEGER;
  if (aTs !== bTs) return aTs - bTs;
  return a.seq - b.seq;
}

function classifyLogLevel(
  message: string,
  previousLevel: TerminalLogLevel,
): TerminalLogLevel {
  if (JVM_CDS_NOISE_RE.test(message)) return "PLAIN";
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

export function buildTerminalEntries(
  data: Studio,
  diagnosticLines: readonly string[] = [],
): TerminalLogEntry[] {
  const entries: TerminalLogEntry[] = [];
  let seq = 0;

  const observedParsed = data.telemetry?.observedAt ? new Date(data.telemetry.observedAt) : null;
  const observedAtMs =
    observedParsed && Number.isFinite(observedParsed.getTime()) ? observedParsed.getTime() : null;
  const observedClockLabel = observedAtMs !== null ? formatClock(new Date(observedAtMs)) : "";

  for (const svc of data.telemetry?.services ?? []) {
    if (!svc.logs?.trim()) continue;
    const rawLines = svc.logs.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const parsedLines = rawLines.map((rawLine) => {
      const trimmedEnd = rawLine.trimEnd();
      const prefixMatch = trimmedEnd.match(COMPOSE_PREFIX_RE);
      const sourceLabel = prefixMatch ? prefixMatch[1]! : svc.service;
      const afterPrefix = prefixMatch ? prefixMatch[2]! : trimmedEnd;
      const parsed = parseTimestampPrefix(afterPrefix);
      return { sourceLabel, ...parsed };
    });
    const firstContainerTsMs =
      parsedLines.find((item) => item.timestampMs !== null)?.timestampMs ?? null;
    let lastTsMs: number | null = firstContainerTsMs;
    let lastLevel: TerminalLogLevel = "PLAIN";
    for (const item of parsedLines) {
      const effectiveTs = item.timestampMs ?? lastTsMs;
      if (item.timestampMs !== null) lastTsMs = item.timestampMs;
      const effectiveLabel =
        item.timestampLabel ||
        (effectiveTs !== null ? formatClock(new Date(effectiveTs)) : observedClockLabel);
      const level = classifyLogLevel(item.body, lastLevel);
      lastLevel = level;
      const noise = isBootNoiseMessage(item.body);
      const friendly = explainRuntimeDiagnostic(item.body) ?? undefined;
      entries.push({
        id: `log-${svc.service}-${seq}`,
        seq: seq++,
        service: svc.service,
        sourceLabel: item.sourceLabel,
        timestampMs: effectiveTs,
        timestampLabel: effectiveLabel,
        level,
        message: item.body,
        isNoise: noise,
        ...(friendly ? { friendlyMessage: friendly } : {}),
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
      timestampLabel: tsMs !== null ? formatClock(new Date(tsMs)) : observedClockLabel,
      level,
      message: summaryParts.join(" "),
      isAction: true,
    });
  }

  for (const warning of data.telemetry?.warnings ?? []) {
    const trimmed = warning.trim();
    if (!trimmed) continue;
    const noise = isBootNoiseMessage(trimmed);
    const friendly = explainRuntimeDiagnostic(trimmed) ?? undefined;
    entries.push({
      id: `warn-${seq}`,
      seq: seq++,
      service: "otel-collector",
      sourceLabel: "otel-collector",
      timestampMs: observedAtMs,
      timestampLabel: observedClockLabel,
      level: "WARN",
      message: trimmed,
      isNoise: noise,
      ...(friendly ? { friendlyMessage: friendly } : {}),
    });
  }

  // Only interleave chronologically when multiple sources carry parseable timestamps;
  // otherwise keep exact per-service emission order so untimestamped stdout stays intact.
  const timedServices = new Set(
    entries.filter((entry) => entry.timestampMs !== null).map((entry) => entry.sourceLabel),
  );
  if (timedServices.size >= 2) {
    entries.sort(compareTerminalEntries);
  }

  if (diagnosticLines.length > 0) {
    const seenDiagnostics = new Set<string>();
    for (const rawDiag of diagnosticLines) {
      const trimmed = rawDiag.trim();
      if (!trimmed || seenDiagnostics.has(trimmed)) continue;
      seenDiagnostics.add(trimmed);
      const friendly = explainRuntimeDiagnostic(trimmed) ?? undefined;
      entries.push({
        id: `diag-${seq}`,
        seq: seq++,
        service: "mavis-runner",
        sourceLabel: "mavis-runner",
        timestampMs: null,
        timestampLabel: observedClockLabel,
        level: "ERROR",
        message: trimmed,
        ...(friendly ? { friendlyMessage: friendly } : {}),
      });
    }
  }

  return entries;
}

function serviceColorFor(name: string, orderedServices: readonly string[], isLight = false) {
  const sysMap = isLight ? SYSTEM_SERVICE_COLORS_LIGHT : SYSTEM_SERVICE_COLORS_DARK;
  const palette = isLight ? SERVICE_COLORS_LIGHT : SERVICE_COLORS_DARK;
  if (sysMap[name]) return sysMap[name]!;
  const baseIdx = orderedServices.findIndex(
    (svc) => name === svc || name.startsWith(`${svc}-`) || name.startsWith(`${svc}_`),
  );
  const idx =
    baseIdx >= 0
      ? baseIdx
      : [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[idx % palette.length]!;
}

type LiveTerminalConsoleProps = {
  data: Studio;
  projectName?: string | undefined;
  isPreviewMode: boolean;
  isBooting?: boolean | undefined;
  waiting: boolean;
  statusLabel: string;
  systemError?: string | null | undefined;
  diagnosticLines?: readonly string[] | undefined;
  selectedTraceId?: string | null | undefined;
  onSelectTrace?: ((traceId: string | null) => void) | undefined;
  isLight?: boolean | undefined;
};

export function LiveTerminalConsole({
  data,
  projectName,
  isPreviewMode,
  isBooting = false,
  waiting,
  statusLabel,
  systemError = null,
  diagnosticLines = [],
  selectedTraceId,
  onSelectTrace,
  isLight = false,
}: LiveTerminalConsoleProps) {
  const [view, setView] = useState<"console" | "traces">("console");
  const [localTraceId, setLocalTraceId] = useState<string | null>(null);
  const activeTraceId = selectedTraceId !== undefined ? selectedTraceId : localTraceId;
  const setActiveTraceId = (tid: string | null) => {
    setLocalTraceId(tid);
    onSelectTrace?.(tid);
  };
  useEffect(() => {
    if (selectedTraceId) setView("traces");
  }, [selectedTraceId]);
  const [serviceFilter, setServiceFilter] = useState<string>("ALL");
  const [levelFilter, setLevelFilter] = useState<"ALL" | "ACT" | "WARN" | "ERROR">("ALL");
  const [hideNoise, setHideNoise] = useState(true);
  const [query, setQuery] = useState("");
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [runnerEvents, setRunnerEvents] = useState<TerminalLogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTrackedStateRef = useRef<string>("");
  const lastTrackedErrorRef = useRef<string>("");
  const eventSeqRef = useRef(0);

  // Reset client-side runner timeline only when switching to a different live session
  useEffect(() => {
    setRunnerEvents([]);
    lastTrackedStateRef.current = "";
    lastTrackedErrorRef.current = "";
  }, [data.sessionId]);

  // Stream real Docker provisioning / lifecycle transitions directly into the terminal
  useEffect(() => {
    const rawStatus =
      isBooting && data.executionStatus === "NOT_STARTED"
        ? "STARTING"
        : data.executionStatus;
    const stateKey = `${isBooting ? "BOOT" : "IDLE"}:${rawStatus}:${data.queuePosition ?? ""}`;
    if (stateKey === lastTrackedStateRef.current) return;
    lastTrackedStateRef.current = stateKey;

    if (isPreviewMode && !isBooting && rawStatus === "NOT_STARTED") return;

    let message = "";
    let level: TerminalLogLevel = "INFO";
    if (rawStatus === "QUEUED") {
      const posLabel = data.queuePosition ? `#${data.queuePosition} in line` : "waiting in FIFO queue";
      const slotInfo =
        data.activeSlots != null && data.maxSlots != null
          ? ` (${data.activeSlots}/${data.maxSlots} Runner slots active)`
          : "";
      message = `Queued (${posLabel})${slotInfo} — containers will boot automatically as soon as a Runner slot frees up…`;
    } else if (isBooting) {
      message =
        rawStatus === "STARTING" || rawStatus === "PENDING"
          ? `Provisioning Docker Compose containers on Runner (${rawStatus}) — waiting for health checks (~15–45s)…`
          : `Runner stage -> ${rawStatus} (attaching stdout/stderr & OpenTelemetry collector)…`;
    } else if (rawStatus === "RUNNING") {
      message =
        "Containers ready (RUNNING) — streaming container stdout/stderr & OpenTelemetry traces.";
    } else if (rawStatus === "FAILED") {
      level = "ERROR";
      message =
        "Runner session FAILED — inspect container logs above or click Run to start a fresh session.";
    } else if (rawStatus === "TIMED_OUT" || rawStatus === "TIMEDOUT" || rawStatus === "TIMEOUT") {
      level = "ERROR";
      message =
        "Runner session TIMED OUT — inspect container logs above or click Run to start a fresh session.";
    } else if (rawStatus === "COMPLETED") {
      message = "Session completed and runtime evidence sealed.";
    } else if (rawStatus === "CANCELLED") {
      level = "WARN";
      message = "Session cancelled; containers cleaned up.";
    }
    if (!message) return;

    const now = new Date();
    const seq = eventSeqRef.current++;
    setRunnerEvents((prev) => [
      ...prev.slice(-49),
      {
        id: `runner-state-${seq}`,
        seq: -10000 + seq,
        service: "mavis-runner",
        sourceLabel: "mavis-runner",
        timestampMs: now.getTime(),
        timestampLabel: formatClock(now),
        level,
        message,
      },
    ]);
  }, [data.executionStatus, data.queuePosition, data.activeSlots, data.maxSlots, isBooting, isPreviewMode]);

  // Stream runtime / setup errors straight into the terminal instead of top page banners
  useEffect(() => {
    const trimmed = systemError?.trim() ?? "";
    if (!trimmed) {
      lastTrackedErrorRef.current = "";
      return;
    }
    if (trimmed === lastTrackedErrorRef.current) return;
    lastTrackedErrorRef.current = trimmed;
    const now = new Date();
    const seq = eventSeqRef.current++;
    const friendly = explainRuntimeDiagnostic(trimmed) ?? undefined;
    setRunnerEvents((prev) => [
      ...prev.slice(-49),
      {
        id: `runner-err-${seq}`,
        seq: -10000 + seq,
        service: "mavis-runner",
        sourceLabel: "mavis-runner",
        timestampMs: now.getTime(),
        timestampLabel: formatClock(now),
        level: "ERROR",
        message: trimmed,
        ...(friendly ? { friendlyMessage: friendly } : {}),
      },
    ]);
  }, [systemError]);

  const entries = useMemo(() => {
    const base = buildTerminalEntries(data, diagnosticLines);
    if (runnerEvents.length === 0) return base;
    return [...runnerEvents, ...base].sort(compareTerminalEntries);
  }, [data, diagnosticLines, runnerEvents]);
  const spans = data.telemetry?.spans ?? [];

  const serviceList = useMemo(() => {
    const names = new Set<string>(data.services);
    for (const entry of entries) {
      if (
        entry.service &&
        entry.service !== "otel-collector" &&
        entry.service !== "mavis-runner"
      ) {
        names.add(entry.service);
      }
    }
    for (const span of spans) {
      if (span.runtimeService) names.add(span.runtimeService);
    }
    return [...names];
  }, [data.services, entries, spans]);

  const hiddenNoiseCount = useMemo(
    () => entries.filter((entry) => entry.isNoise).length,
    [entries],
  );
  const visibleBaseEntries = useMemo(
    () => (hideNoise ? entries.filter((entry) => !entry.isNoise) : entries),
    [entries, hideNoise],
  );
  const errorCount = useMemo(
    () => visibleBaseEntries.filter((entry) => entry.level === "ERROR").length,
    [visibleBaseEntries],
  );
  const warnCount = useMemo(
    () => visibleBaseEntries.filter((entry) => entry.level === "WARN").length,
    [visibleBaseEntries],
  );
  const actionCount = useMemo(
    () => visibleBaseEntries.filter((entry) => entry.isAction).length,
    [visibleBaseEntries],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const activeServiceFilter =
    serviceFilter !== "ALL" && serviceList.includes(serviceFilter) ? serviceFilter : "ALL";

  const filteredEntries = useMemo(() => {
    return visibleBaseEntries.filter((entry) => {
      if (activeServiceFilter !== "ALL" && entry.service !== activeServiceFilter) return false;
      if (levelFilter === "ACT" && !entry.isAction) return false;
      if (levelFilter === "ERROR" && entry.level !== "ERROR") return false;
      if (levelFilter === "WARN" && entry.level !== "WARN" && entry.level !== "ERROR") {
        return false;
      }
      if (
        normalizedQuery &&
        !entry.message.toLowerCase().includes(normalizedQuery) &&
        !(entry.friendlyMessage ?? "").toLowerCase().includes(normalizedQuery) &&
        !entry.sourceLabel.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [visibleBaseEntries, activeServiceFilter, levelFilter, normalizedQuery]);

  const filteredSpans = useMemo(() => {
    return spans.filter((span) => {
      if (activeServiceFilter !== "ALL" && span.runtimeService !== activeServiceFilter) return false;
      if (normalizedQuery) {
        const hay = `${span.runtimeService} ${span.operationName ?? ""} ${span.traceId} ${span.httpStatusCode ?? ""}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [spans, activeServiceFilter, normalizedQuery]);

  // Newest spans first: the Runner sends spans oldest→newest, and only the recent window matters live.
  const visibleSpans = useMemo(() => filteredSpans.slice(-60).reverse(), [filteredSpans]);

  const maxSpanMs = useMemo(() => {
    let peak = 1;
    for (const span of visibleSpans) {
      const ns = span.durationNanoseconds ? Number(span.durationNanoseconds) : NaN;
      if (Number.isFinite(ns) && ns > 0) peak = Math.max(peak, ns / 1e6);
    }
    return peak;
  }, [visibleSpans]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || view !== "console") return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredEntries.length, view]);

  const projectSlug = useMemo(() => {
    if (projectName?.trim()) {
      const cleaned = projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (cleaned) return cleaned;
    }
    if (data.sessionId) return `studio-${data.sessionId.slice(0, 8)}`;
    return "studio-live";
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
      className={`flex h-full min-h-[168px] flex-col overflow-hidden rounded-xl border ${
        isLight
          ? "border-slate-200 bg-white text-slate-900"
          : "border-slate-800 bg-[#05080f] text-slate-100"
      }`}
    >
      {/* Terminal Toolbar */}
      <div
        className={`flex flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5 text-[11px] ${
          isLight
            ? "border-slate-200 bg-slate-50/90 text-slate-700"
            : "border-slate-800 bg-[#0a0f1a] text-slate-200"
        }`}
      >
        <div
          role="tablist"
          aria-label="Console view mode"
          className={`inline-flex shrink-0 items-center rounded-lg border p-0.5 ${
            isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-[#05080f]"
          }`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "console"}
            onClick={() => setView("console")}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold transition ${
              view === "console"
                ? isLight
                  ? "bg-slate-900 text-white"
                  : "bg-slate-800 text-slate-100"
                : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal aria-hidden="true" className={`size-3 ${isLight && view !== "console" ? "text-emerald-600" : "text-emerald-400"}`} />
            Logs ({visibleBaseEntries.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "traces"}
            onClick={() => setView("traces")}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold transition ${
              view === "traces"
                ? isLight
                  ? "bg-slate-900 text-white"
                  : "bg-slate-800 text-slate-100"
                : isLight
                  ? "text-slate-600 hover:text-slate-900"
                  : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity aria-hidden="true" className={`size-3 ${isLight && view !== "traces" ? "text-sky-600" : "text-sky-400"}`} />
            Traces ({spans.length})
          </button>
        </div>

        {/* Service filter dropdown */}
        <Select value={activeServiceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger
            aria-label="Filter by service"
            className={`h-7 w-auto min-w-[138px] max-w-[220px] shrink-0 gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium transition focus:ring-1 focus:ring-offset-0 ${
              activeServiceFilter !== "ALL"
                ? isLight
                  ? "border-sky-400 bg-sky-50 text-sky-900"
                  : "border-sky-500/50 bg-sky-500/15 text-sky-100"
                : isLight
                  ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  : "border-slate-800 bg-[#05080f] text-slate-200 hover:border-slate-700"
            }`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="start"
            className={
              isLight
                ? "border-slate-200 bg-white text-slate-900 shadow-lg"
                : "border-slate-700 bg-[#0c1322] text-slate-100 shadow-xl"
            }
          >
            <SelectItem
              value="ALL"
              className={`min-h-8 py-1.5 font-mono text-xs ${
                isLight
                  ? "focus:bg-slate-100 focus:text-slate-900"
                  : "focus:bg-slate-800 focus:text-slate-100"
              }`}
            >
              All services ({serviceList.length})
            </SelectItem>
            {serviceList.map((svc) => {
              const color = serviceColorFor(svc, serviceList, isLight);
              return (
                <SelectItem
                  key={svc}
                  value={svc}
                  className={`min-h-8 py-1.5 font-mono text-xs ${
                    isLight
                      ? "focus:bg-slate-100 focus:text-slate-900"
                      : "focus:bg-slate-800 focus:text-slate-100"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${color.dot}`} />
                    {svc}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {view === "console" && (
            <div
              className={`inline-flex items-center rounded-md border p-0.5 font-mono text-[10.5px] ${
                isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-[#05080f]"
              }`}
            >
              {(
                [
                  ["ALL", "ALL"],
                  ["ACT", actionCount > 0 ? `ACT (${actionCount})` : "ACT"],
                  ["WARN", warnCount > 0 ? `WARN (${warnCount})` : "WARN"],
                  ["ERROR", errorCount > 0 ? `ERR (${errorCount})` : "ERR"],
                ] as const
              ).map(([lvl, label]) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl)}
                  className={`rounded px-1.5 py-0.5 font-medium transition ${
                    levelFilter === lvl
                      ? lvl === "ERROR"
                        ? isLight ? "bg-rose-100 text-rose-700" : "bg-rose-500/20 text-rose-200"
                        : lvl === "WARN"
                          ? isLight ? "bg-amber-100 text-amber-800" : "bg-amber-500/20 text-amber-200"
                          : lvl === "ACT"
                            ? isLight ? "bg-indigo-100 text-indigo-800" : "bg-indigo-500/20 text-indigo-200"
                            : isLight ? "bg-slate-900 text-white" : "bg-slate-800 text-slate-100"
                      : isLight
                        ? "text-slate-600 hover:text-slate-900"
                        : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {view === "console" && hiddenNoiseCount > 0 && (
            <button
              type="button"
              data-testid="studio-logs-noise-toggle"
              aria-pressed={!hideNoise}
              onClick={() => setHideNoise((prev) => !prev)}
              className={`inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-mono text-[10.5px] transition ${
                !hideNoise
                  ? isLight
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-sky-500/40 bg-sky-500/15 text-sky-200"
                  : isLight
                    ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    : "border-slate-800 bg-[#05080f] text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
              title={
                hideNoise
                  ? "Show hidden JVM/OTel startup boilerplate lines"
                  : "Hide repetitive JVM/OTel startup boilerplate lines"
              }
            >
              <Filter aria-hidden="true" className="size-3" />
              {hideNoise ? `Clean (+${hiddenNoiseCount} boot)` : "Raw logs"}
            </button>
          )}

          <label className="relative flex items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2 size-3 text-slate-400"
            />
            <input
              type="search"
              aria-label="Filter terminal output"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="grep…"
              className={`h-6 w-28 rounded-md border pl-6 pr-2 font-mono text-[11px] focus:border-sky-500 focus:outline-none sm:w-36 ${
                isLight
                  ? "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                  : "border-slate-800 bg-[#05080f] text-slate-200 placeholder:text-slate-500"
              }`}
            />
          </label>

          {view === "console" && (
            <button
              type="button"
              aria-pressed={wrap}
              onClick={() => setWrap((prev) => !prev)}
              className={`h-6 rounded-md border px-1.5 font-mono text-[10.5px] transition ${
                wrap
                  ? isLight
                    ? "border-slate-300 bg-slate-100 text-slate-900"
                    : "border-slate-700 bg-slate-800/80 text-slate-200"
                  : isLight
                    ? "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
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
            className={`inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-mono text-[10.5px] transition disabled:opacity-40 ${
              isLight
                ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                : "border-slate-800 bg-[#05080f] text-slate-300 hover:border-slate-700 hover:text-slate-100"
            }`}
            title="Copy visible terminal output"
          >
            {copied ? (
              <>
                <Check aria-hidden="true" className="size-3 text-emerald-500" />
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
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: isLight ? "#cbd5e1 #ffffff" : "#334155 #05080f",
          }}
          className={`min-h-0 flex-1 overflow-auto px-2.5 py-2 font-mono text-[11.5px] leading-[1.55] ${
            isLight ? "bg-[#F8FAFC] text-slate-800" : ""
          }`}
        >
          {filteredEntries.length > 0 ? (
            <div role="log" aria-live="polite" className="space-y-0.5">
              {filteredEntries.map((entry, idx) => {
                const color = serviceColorFor(entry.sourceLabel, serviceList, isLight);
                const shortSource = entry.sourceLabel.replace(/-\d+$/, "");
                const badgeText = entry.isAction
                  ? "ACT"
                  : entry.level === "ERROR"
                    ? "ERR"
                    : entry.level === "WARN"
                      ? "WARN"
                      : "INFO";
                const badgeClass = entry.isAction
                  ? isLight
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-indigo-500/20 text-indigo-200"
                  : entry.level === "ERROR"
                    ? isLight
                      ? "bg-rose-100 text-rose-800"
                      : "bg-rose-500/25 text-rose-200"
                    : entry.level === "WARN"
                      ? isLight
                        ? "bg-amber-100 text-amber-800"
                        : "bg-amber-500/20 text-amber-200"
                      : isLight
                        ? "bg-slate-200/80 text-slate-600"
                        : "bg-slate-800 text-slate-400";
                const rowTone =
                  entry.level === "ERROR"
                    ? isLight
                      ? "bg-rose-50/90 text-rose-900"
                      : "bg-rose-500/[0.08] text-rose-200"
                    : entry.level === "WARN"
                      ? isLight
                        ? "bg-amber-50/80 text-amber-950"
                        : "bg-amber-500/[0.06] text-amber-200"
                      : entry.isAction
                        ? isLight
                          ? "bg-indigo-50/60 text-slate-900"
                          : "bg-indigo-500/[0.07] text-indigo-100"
                        : isLight
                          ? "text-slate-800"
                          : "text-slate-200";
                return (
                  <div
                    key={entry.id}
                    data-log-row
                    role={entry.level === "ERROR" ? "alert" : undefined}
                    className={`flex items-start gap-1.5 rounded-sm px-1.5 py-0.5 ${
                      isLight ? "hover:bg-slate-200/50" : "hover:bg-slate-800/40"
                    } ${rowTone}`}
                  >
                    <span
                      className={`w-6 shrink-0 select-none text-right text-[10px] tabular-nums ${
                        isLight ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    {hasTimestamps && (
                      <span
                        data-log-time
                        className={`w-[58px] shrink-0 select-none text-[10.5px] tabular-nums ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {entry.timestampLabel || observedClock || "boot"}
                      </span>
                    )}
                    <span
                      className={`mt-0.5 inline-flex w-10 shrink-0 justify-center rounded px-1 py-px text-[9.5px] font-bold tracking-wide ${badgeClass}`}
                    >
                      {badgeText}
                    </span>
                    <span
                      title={entry.sourceLabel}
                      className={`w-32 shrink-0 truncate border-r pr-2 text-right font-semibold sm:w-36 ${
                        isLight ? "border-slate-200" : "border-slate-800/90"
                      } ${color.text}`}
                    >
                      {shortSource}
                    </span>
                    <span
                      className={`min-w-0 flex-1 pl-1 ${
                        wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                      }`}
                    >
                      {entry.friendlyMessage ? (
                        <>
                          <span className="font-sans font-medium">{entry.friendlyMessage}</span>
                          <span
                            className={`ml-1.5 text-[10px] opacity-70 ${
                              isLight ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            ({entry.message})
                          </span>
                        </>
                      ) : (
                        entry.message
                      )}
                    </span>
                  </div>
                );
              })}
              {(isBooting || data.executionStatus === "RUNNING") && (
                <div className="flex items-center gap-1.5 px-1 pt-1 text-slate-500">
                  <span className={isLight ? "font-bold text-emerald-600" : "text-emerald-400"}>
                    {projectSlug}$
                  </span>
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-1.5 animate-pulse bg-emerald-500/80"
                  />
                </div>
              )}
            </div>
          ) : entries.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-slate-500">
              <span>
                {hideNoise && hiddenNoiseCount > 0 && levelFilter === "ALL" && !normalizedQuery
                  ? `${hiddenNoiseCount} repetitive JVM/OTel startup lines are hidden in Clean view.`
                  : "No terminal lines match the active filter."}
              </span>
              <div className="flex items-center gap-2">
                {hideNoise && hiddenNoiseCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setHideNoise(false)}
                    className={isLight ? "font-medium text-sky-700 hover:underline" : "font-medium text-sky-300 hover:underline"}
                  >
                    Show raw boot logs ({hiddenNoiseCount})
                  </button>
                )}
                {(activeServiceFilter !== "ALL" || levelFilter !== "ALL" || normalizedQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setServiceFilter("ALL");
                      setLevelFilter("ALL");
                      setQuery("");
                    }}
                    className={isLight ? "text-sky-700 hover:underline" : "text-sky-300 hover:underline"}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1 py-1 text-[11px]">
              <div className="flex items-start px-1">
                <span
                  className={`w-32 shrink-0 border-r pr-2 text-right font-semibold sm:w-36 ${
                    isLight
                      ? "border-slate-200 text-indigo-700"
                      : "border-slate-800/90 text-indigo-300"
                  }`}
                >
                  mavis-runner
                </span>
                <span className={`pl-2 ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                  {isPreviewMode
                    ? "Compose stack is in Lab Setup preview (containers not booted)."
                    : waiting
                      ? `Session ${statusLabel} — booting Docker Compose containers and attaching stdout/stderr…`
                      : `Session ${statusLabel} — attached to container logs; waiting for stdout/stderr output.`}
                </span>
              </div>
              <div className="flex items-start px-1">
                <span
                  className={`w-32 shrink-0 border-r pr-2 text-right font-semibold sm:w-36 ${
                    isLight
                      ? "border-slate-200 text-indigo-700"
                      : "border-slate-800/90 text-indigo-300"
                  }`}
                >
                  mavis-runner
                </span>
                <span className={`pl-2 ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  Services ({serviceList.length}):{" "}
                  <span className={isLight ? "font-medium text-slate-900" : "text-slate-200"}>
                    {serviceList.length > 0 ? serviceList.join(", ") : "none configured"}
                  </span>
                </span>
              </div>
              {isPreviewMode && (
                <div className="flex items-start px-1">
                  <span
                    className={`w-32 shrink-0 border-r pr-2 text-right font-semibold sm:w-36 ${
                      isLight
                        ? "border-slate-200 text-indigo-700"
                        : "border-slate-800/90 text-indigo-300"
                    }`}
                  >
                    mavis-runner
                  </span>
                  <span className={`pl-2 ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                    Click{" "}
                    <span className={isLight ? "font-semibold text-emerald-700" : "text-emerald-300"}>
                      Run
                    </span>{" "}
                    in the command dock to boot containers and stream real service stdout/stderr + OpenTelemetry traces.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-1 pt-1 text-slate-500">
                <span className={isLight ? "font-bold text-emerald-600" : "text-emerald-400"}>
                  {projectSlug}$
                </span>
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-1.5 animate-pulse bg-emerald-500/80"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: isLight ? "#cbd5e1 #ffffff" : "#334155 #05080f",
          }}
          className={`min-h-0 flex-1 overflow-auto font-mono text-[11.5px] ${
            isLight ? "bg-white text-slate-800" : ""
          }`}
        >
          {activeTraceId && (
            <div className="p-2 pb-0">
              <TraceWaterfallPanel
                spans={spans}
                traceId={activeTraceId}
                isLight={isLight}
                onClose={() => setActiveTraceId(null)}
              />
            </div>
          )}
          {filteredSpans.length > 0 ? (
            <table className="mavis-tabular w-full whitespace-nowrap text-left">
              <thead
                className={`sticky top-0 text-[10.5px] uppercase tracking-wide ${
                  isLight
                    ? "bg-slate-50 text-slate-600 border-b border-slate-200"
                    : "bg-[#0a0f1a] text-slate-500"
                }`}
              >
                <tr>
                  <th className="px-2.5 py-1.5 font-semibold">Trace</th>
                  <th className="px-2.5 py-1.5 font-semibold">Service</th>
                  <th className="px-2.5 py-1.5 font-semibold">Operation</th>
                  <th className="px-2.5 py-1.5 font-semibold">HTTP</th>
                  <th className="px-2.5 py-1.5 font-semibold">Status</th>
                  <th className="px-2.5 py-1.5 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? "divide-slate-200/80" : "divide-slate-800/70"}`}>
                {visibleSpans.map((span) => {
                  const ns = span.durationNanoseconds ? Number(span.durationNanoseconds) : NaN;
                  const ms = Number.isFinite(ns) && ns >= 0 ? ns / 1e6 : null;
                  const reportedStatus = span.spanStatus?.toUpperCase();
                  const derivedStatus =
                    reportedStatus && reportedStatus !== "UNSET"
                      ? reportedStatus
                      : typeof span.httpStatusCode === "number"
                        ? span.httpStatusCode >= 400
                          ? "ERROR"
                          : "OK"
                        : "OK";
                  const isErr = derivedStatus === "ERROR";
                  const color = serviceColorFor(span.runtimeService, serviceList, isLight);
                  const httpTone =
                    typeof span.httpStatusCode !== "number"
                      ? "text-slate-400"
                      : span.httpStatusCode >= 500
                        ? isLight ? "text-rose-600" : "text-rose-300"
                        : span.httpStatusCode >= 400
                          ? isLight ? "text-amber-700" : "text-amber-300"
                          : isLight ? "text-emerald-700" : "text-emerald-300";
                  const barPct = ms !== null ? Math.min(100, Math.max(4, (ms / maxSpanMs) * 100)) : 0;
                  const rowSelected = activeTraceId === span.traceId;
                  return (
                    <tr
                      key={`${span.traceId}:${span.spanId}`}
                      onClick={() => setActiveTraceId(rowSelected ? null : span.traceId)}
                      title="Click to inspect full trace waterfall"
                      className={`cursor-pointer ${
                        rowSelected
                          ? isLight ? "bg-sky-50" : "bg-sky-950/40"
                          : isLight ? "hover:bg-slate-50" : "hover:bg-slate-900/60"
                      }`}
                    >
                      <td className="px-2.5 py-1 text-slate-500">{span.traceId.slice(0, 8)}</td>
                      <td className={`px-2.5 py-1 font-semibold ${color.text}`}>
                        {span.runtimeService}
                      </td>
                      <td className={`max-w-[260px] truncate px-2.5 py-1 ${isLight ? "text-slate-800" : "text-slate-200"}`}>
                        {span.operationName ||
                          (span.httpStatusCode ? `HTTP ${span.httpStatusCode}` : "Trace span")}
                        {span.circuitOpen && (
                          <span
                            className={`ml-1.5 rounded px-1 py-0.5 text-[9.5px] font-semibold ${
                              isLight
                                ? "bg-rose-100 text-rose-700"
                                : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            CIRCUIT OPEN
                          </span>
                        )}
                      </td>
                      <td className={`px-2.5 py-1 font-semibold ${httpTone}`}>{span.httpStatusCode ?? "—"}</td>
                      <td
                        className={`px-2.5 py-1 font-semibold ${
                          isErr
                            ? isLight ? "text-rose-600" : "text-rose-300"
                            : isLight ? "text-emerald-700" : "text-emerald-300"
                        }`}
                      >
                        {derivedStatus}
                      </td>
                      <td className={`px-2.5 py-1 ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                        {ms !== null ? (
                          <div className="flex items-center gap-2">
                            <span className="w-16 text-right tabular-nums">
                              {ms.toFixed(1)} ms
                            </span>
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-16 overflow-hidden rounded-full ${
                                isLight ? "bg-slate-200" : "bg-slate-800"
                              }`}
                            >
                              <span
                                className={`block h-full rounded-full ${
                                  isErr ? "bg-rose-500" : "bg-sky-500"
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
            <div className="px-3 py-4 text-slate-500">
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

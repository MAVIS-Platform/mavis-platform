import type { Response } from "@/lib/api/contracts";

type Studio = Response<"studioState">;

export type SmartSnapshotExerciseType =
  | "CHANGE_IMPACT"
  | "SCALE_UNDER_LOAD"
  | "CIRCUIT_BREAKER"
  | "CONFIG_REGRESSION"
  | "GENERAL";

export type SmartSnapshotStat = {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
};

export type SmartSnapshotPlan = {
  exerciseType: SmartSnapshotExerciseType;
  badge: string;
  accentColor: string;
  primaryService: string | null;
  focusServices: string[];
  focusSummary: string;
  autoCheckSummary: { text: string; passed: boolean } | null;
  stats: SmartSnapshotStat[];
  suggestedNote: string;
};

export type SmartSnapshotOverlay = Pick<
  SmartSnapshotPlan,
  "badge" | "accentColor" | "focusSummary" | "focusServices" | "stats" | "autoCheckSummary"
> & {
  autoFocus?: boolean;
  includeStats?: boolean;
};

export type FocusCameraFraming = {
  lookX: number;
  lookZ: number;
  dist: number;
  pitch: number;
  yaw: number;
  panX: number;
  panY: number;
  zoom: number;
  focusedIds: string[];
};

type ExerciseCriteriaLike = {
  exerciseType?: string;
  predictionRequired?: boolean;
  targetChangeAction?: {
    action?: string;
    service?: string;
    replicas?: number | null;
    cpuPercent?: number | null;
    targetRps?: number | null;
  } | null;
  minReplicas?: Array<{ service?: string; count?: number }> | null;
  requiredTraceEdge?: { from?: string; to?: string } | null;
  maxErrorRatePercent?: number | null;
  maxP95Ms?: number | null;
  minF1?: number | null;
};

function fmtNum(value: unknown, digits = 1): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits)).toString();
}

function uniqueValidServices(
  candidates: ReadonlyArray<string | null | undefined>,
  knownServices: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const raw of candidates) {
    const svc = (raw ?? "").trim();
    if (!svc) continue;
    if (knownServices.size > 0 && !knownServices.has(svc)) continue;
    if (!out.includes(svc)) out.push(svc);
  }
  return out;
}

function normalizeExerciseType(raw?: string | null): SmartSnapshotExerciseType | null {
  const upper = (raw ?? "").trim().toUpperCase();
  if (upper === "CHANGE_IMPACT" || upper === "CASCADING_FAILURE") return "CHANGE_IMPACT";
  if (upper === "SCALE_UNDER_LOAD") return "SCALE_UNDER_LOAD";
  if (upper === "CIRCUIT_BREAKER") return "CIRCUIT_BREAKER";
  if (upper === "CONFIG_REGRESSION") return "CONFIG_REGRESSION";
  return null;
}

function detectExerciseType(
  data: Pick<Studio, "actions" | "exerciseCriteria" | "exerciseEvaluation" | "prediction" | "topology">,
  authoringExerciseType?: string | null,
): SmartSnapshotExerciseType {
  const criteria = (data.exerciseCriteria ?? null) as ExerciseCriteriaLike | null;
  const explicit =
    normalizeExerciseType(data.exerciseEvaluation?.exerciseType) ??
    normalizeExerciseType(criteria?.exerciseType) ??
    normalizeExerciseType(authoringExerciseType);
  if (explicit) return explicit;

  const confirmed = (data.actions ?? []).filter((a) => a.status === "CONFIRMED");
  if (confirmed.some((a) => a.action === "THROTTLE_CPU")) return "CONFIG_REGRESSION";
  if (confirmed.some((a) => a.action === "SCALE" || a.action === "SET_LOAD")) {
    return "SCALE_UNDER_LOAD";
  }
  if (data.prediction?.predictedServices?.length) return "CHANGE_IMPACT";
  if (data.topology?.blocks?.some((b) => b.initiallyStopped)) return "CIRCUIT_BREAKER";
  if (confirmed.some((a) => a.action === "PAUSE" || a.action === "STOP")) return "CHANGE_IMPACT";
  return "GENERAL";
}

function findDirectNeighbors(
  target: string,
  data: Pick<Studio, "telemetry" | "topology">,
  direction: "upstream" | "both",
): string[] {
  const result: string[] = [];
  const push = (svc?: string | null) => {
    const clean = (svc ?? "").trim();
    if (clean && clean !== target && !result.includes(clean)) result.push(clean);
  };
  for (const sg of data.telemetry?.serviceGraph ?? []) {
    if (sg.server === target) push(sg.client);
    else if (direction === "both" && sg.client === target) push(sg.server);
  }
  for (const edge of data.telemetry?.interactions ?? []) {
    if (edge.toService === target) push(edge.fromService);
    else if (direction === "both" && edge.fromService === target) push(edge.toService);
  }
  for (const conn of data.topology?.connections ?? []) {
    if (conn.to === target) push(conn.from);
    else if (direction === "both" && conn.from === target) push(conn.to);
  }
  return result;
}

function readServiceCpuMem(
  data: Pick<Studio, "telemetry">,
  service: string | null,
): { cpu: string | null; memory: string | null; runningReplicas: number | null } {
  if (!service) return { cpu: null, memory: null, runningReplicas: null };
  const live = data.telemetry?.services?.find((s) => s.service === service);
  if (!live) return { cpu: null, memory: null, runningReplicas: null };
  const firstStat = live.stats.find((s) => s.cpu || s.memory) ?? live.stats[0];
  return {
    cpu: firstStat?.cpu?.trim() || null,
    memory: firstStat?.memory?.trim() || null,
    runningReplicas: live.runningReplicas,
  };
}

/**
 * Automatically detects the current Studio exercise type, selects the relevant service cluster to
 * focus on, and builds only the KPI stats required as evidence for that specific drill.
 */
export function buildSmartSnapshotPlan(
  data: Studio,
  options?: {
    locale?: "en" | "vi";
    selectedService?: string | null;
    authoringExerciseType?: string | null;
    authoringTargetService?: string | null;
    includeAutoCheck?: boolean;
  },
): SmartSnapshotPlan {
  const isVi = (options?.locale ?? "vi") === "vi";
  const t = (en: string, vi: string) => (isVi ? vi : en);
  const known = new Set(data.services ?? []);
  const criteria = (data.exerciseCriteria ?? null) as ExerciseCriteriaLike | null;
  const evaluation = data.exerciseEvaluation ?? null;
  const confirmed = (data.actions ?? []).filter((a) => a.status === "CONFIRMED");
  const firstConfirmed = confirmed[0];
  const lastConfirmed = confirmed[confirmed.length - 1];
  const probe = data.telemetry?.probe ?? null;
  const exerciseType = detectExerciseType(data, options?.authoringExerciseType);

  const liveErrPct =
    probe?.errorRatePercent ??
    (typeof lastConfirmed?.result?.metricsAfter?.["errorRatePercent"] === "number"
      ? (lastConfirmed.result.metricsAfter["errorRatePercent"] as number)
      : null);
  const beforeErrPct =
    typeof firstConfirmed?.result?.metricsBefore?.["errorRatePercent"] === "number"
      ? (firstConfirmed.result.metricsBefore["errorRatePercent"] as number)
      : null;
  const liveP95Ms =
    probe?.p95Ms ??
    (typeof lastConfirmed?.result?.metricsAfter?.["p95LatencyMs"] === "number"
      ? (lastConfirmed.result.metricsAfter["p95LatencyMs"] as number)
      : null);
  const beforeP95Ms =
    typeof firstConfirmed?.result?.metricsBefore?.["p95LatencyMs"] === "number"
      ? (firstConfirmed.result.metricsBefore["p95LatencyMs"] as number)
      : null;

  const formatDelta = (before: number | null, after: number | null, unit: string, digits = 1): string => {
    const a = fmtNum(after, digits);
    const b = fmtNum(before, digits);
    if (b !== null && a !== null && b !== a) return `${b} → ${a}${unit}`;
    if (a !== null) return `${a}${unit}`;
    if (b !== null) return `${b}${unit}`;
    return "—";
  };

  // Auto-check grading badge is reserved exclusively for Lecturer grading (never shown to students in Studio).
  let autoCheckSummary: { text: string; passed: boolean } | null = null;
  if (options?.includeAutoCheck && evaluation?.evaluated) {
    const parts: string[] = [];
    if (evaluation.impact) {
      parts.push(`F1 ${Math.round(evaluation.impact.f1Score * 100)}%`);
    }
    if (evaluation.totalRules > 0) {
      parts.push(
        t(
          `${evaluation.passedRules}/${evaluation.totalRules} checks`,
          `${evaluation.passedRules}/${evaluation.totalRules} tiêu chí`,
        ),
      );
    }
    if (parts.length > 0) {
      autoCheckSummary = {
        text: `${t("Auto-check", "Tự kiểm tra")}: ${parts.join(" · ")}`,
        passed: Boolean(evaluation.passed),
      };
    }
  }

  // Primary service resolution tailored to the exercise
  const actionOf = (...kinds: string[]) =>
    [...confirmed].reverse().find((a) => kinds.includes(a.action));
  const scaledService =
    criteria?.minReplicas?.find((m) => m.service)?.service ??
    actionOf("SCALE")?.service ??
    data.telemetry?.services?.find((s) => s.runningReplicas > 1)?.service;
  const initiallyStopped = data.topology?.blocks?.find((b) => b.initiallyStopped)?.service;
  const throttledService = actionOf("THROTTLE_CPU")?.service;
  const faultService = actionOf("PAUSE", "STOP")?.service;
  const recoveredService = actionOf("START", "RESUME")?.service;

  let primaryService: string | null = null;
  let focusCandidates: Array<string | null | undefined> = [];
  let badge = t("STUDIO SNAPSHOT", "STUDIO SNAPSHOT");
  let accentColor = "#10b981";
  let stats: SmartSnapshotStat[] = [];

  if (exerciseType === "CHANGE_IMPACT") {
    badge = t("CHANGE IMPACT", "PHÂN TÍCH ẢNH HƯỞNG");
    accentColor = "#f59e0b";
    primaryService =
      criteria?.targetChangeAction?.service ??
      faultService ??
      options?.authoringTargetService ??
      options?.selectedService ??
      null;

    const observedAffected = evaluation?.observedAffectedServices ?? [];
    const predicted = evaluation?.predictedServices ?? data.prediction?.predictedServices ?? [];
    const failingEdges = (data.telemetry?.serviceGraph ?? [])
      .filter((sg) => sg.errorRatePercent > 0)
      .flatMap((sg) => [sg.client, sg.server]);
    const upstreamFallback = primaryService ? findDirectNeighbors(primaryService, data, "upstream") : [];

    focusCandidates = [
      primaryService,
      ...observedAffected,
      ...failingEdges,
      ...(observedAffected.length === 0 ? predicted.slice(0, 3) : []),
      ...(observedAffected.length === 0 && predicted.length === 0 ? upstreamFallback.slice(0, 3) : []),
    ];

    const targetAction = primaryService
      ? [...confirmed].reverse().find((a) => a.service === primaryService)
      : undefined;
    const targetLive = readServiceCpuMem(data, primaryService);
    const targetState =
      targetAction?.action === "PAUSE"
        ? "PAUSED"
        : targetLive.runningReplicas === 0 || targetAction?.action === "STOP"
          ? "STOPPED"
          : targetLive.runningReplicas !== null
            ? `RUNNING ×${targetLive.runningReplicas}`
            : "READY";

    const affectedLabel =
      observedAffected.length > 0
        ? `${observedAffected.slice(0, 2).join(", ")}${observedAffected.length > 2 ? ` +${observedAffected.length - 2}` : ""} (${observedAffected.length})`
        : t("0 affected (baseline)", "Chưa lan lỗi (baseline)");

    const predictionLabel =
      options?.includeAutoCheck && evaluation?.impact
        ? `F1 ${Math.round(evaluation.impact.f1Score * 100)}% (P ${Math.round(evaluation.impact.precision * 100)}% · R ${Math.round(evaluation.impact.recall * 100)}%)`
        : predicted.length > 0
          ? t(`Locked (${predicted.length} svc)`, `Đã khóa (${predicted.length} dịch vụ)`)
          : t("Not locked", "Chưa khóa dự đoán");

    stats = [
      {
        label: t("Target", "Mục tiêu"),
        value: primaryService ? `${primaryService} · ${targetState}` : targetState,
        tone: targetState === "PAUSED" || targetState === "STOPPED" ? "warn" : "neutral",
      },
      {
        label: t("Observed Impact", "Ảnh hưởng thực tế"),
        value: affectedLabel,
        tone: observedAffected.length > 0 ? "bad" : "good",
      },
      {
        label: t("Prediction", "Dự đoán"),
        value: predictionLabel,
        tone:
          options?.includeAutoCheck && evaluation?.impact
            ? evaluation.impact.f1Score >= (criteria?.minF1 ?? 0.7)
              ? "good"
              : "warn"
            : "neutral",
      },
      {
        label: t("Error / p95", "Tỉ lệ lỗi / p95"),
        value: `${formatDelta(beforeErrPct, liveErrPct, "%")} · ${formatDelta(beforeP95Ms, liveP95Ms, " ms", 0)}`,
        tone: (liveErrPct ?? 0) >= 5 ? "bad" : "good",
      },
    ];
  } else if (exerciseType === "SCALE_UNDER_LOAD") {
    badge = t("SCALE UNDER LOAD", "CHỊU TẢI & SCALE");
    accentColor = "#0ea5e9";
    primaryService =
      scaledService ??
      criteria?.targetChangeAction?.service ??
      options?.authoringTargetService ??
      options?.selectedService ??
      null;

    const upstream = primaryService ? findDirectNeighbors(primaryService, data, "upstream") : [];
    focusCandidates = [primaryService, ...upstream.slice(0, 2)];

    const scaleAction = primaryService
      ? [...confirmed].reverse().find((a) => a.action === "SCALE" && a.service === primaryService)
      : actionOf("SCALE");
    const svcLive = readServiceCpuMem(data, primaryService);
    const repBefore = scaleAction?.result?.replicasBefore;
    const repAfter = svcLive.runningReplicas ?? scaleAction?.result?.replicasAfter ?? scaleAction?.replicas;
    const replicaText =
      typeof repBefore === "number" && typeof repAfter === "number" && repBefore !== repAfter
        ? `${primaryService ?? "service"}: ${repBefore} → ${repAfter}×`
        : `${primaryService ?? "service"}: ${repAfter ?? 1}×`;

    const rpsNow = fmtNum(probe?.rps, 1);
    const targetRps = probe?.targetRps ?? actionOf("SET_LOAD")?.targetRps ?? criteria?.targetChangeAction?.targetRps;
    const rpsText =
      rpsNow !== null
        ? `${rpsNow} req/s${targetRps ? ` (target ${targetRps})` : ""}`
        : targetRps
          ? `Target ${targetRps} req/s`
          : "—";

    const resParts = [svcLive.cpu ? `CPU ${svcLive.cpu}` : null, svcLive.memory ? `RAM ${svcLive.memory.split("/")[0]?.trim()}` : null].filter(Boolean);

    stats = [
      {
        label: t("Replicas", "Bản sao (Scale)"),
        value: replicaText,
        tone: (repAfter ?? 1) >= 2 ? "good" : "neutral",
      },
      {
        label: t("Load (RPS)", "Lưu lượng (RPS)"),
        value: rpsText,
        tone: "neutral",
      },
      {
        label: t("p95 Latency", "Độ trễ p95"),
        value: formatDelta(beforeP95Ms, liveP95Ms, " ms", 0),
        tone: (liveP95Ms ?? 0) > (criteria?.maxP95Ms ?? 500) ? "warn" : "good",
      },
      {
        label: t("Error / Resources", "Lỗi / Tài nguyên"),
        value: `${fmtNum(liveErrPct, 1) ?? "0"}%${resParts.length ? ` · ${resParts.join(" · ")}` : ""}`,
        tone: (liveErrPct ?? 0) >= 5 ? "bad" : "good",
      },
    ];
  } else if (exerciseType === "CIRCUIT_BREAKER") {
    badge = t("OUTAGE RECOVERY", "KHÔI PHỤC SỰ CỐ");
    accentColor = "#f43f5e";
    primaryService =
      initiallyStopped ??
      criteria?.targetChangeAction?.service ??
      recoveredService ??
      faultService ??
      options?.authoringTargetService ??
      options?.selectedService ??
      null;

    const reqEdge = criteria?.requiredTraceEdge;
    const upstream = primaryService ? findDirectNeighbors(primaryService, data, "upstream") : [];
    focusCandidates = [primaryService, reqEdge?.from, reqEdge?.to, ...upstream.slice(0, 2)];

    const svcLive = readServiceCpuMem(data, primaryService);
    const circuitOpen = (data.telemetry?.spans ?? []).some((sp) => sp.circuitOpen);
    const isUp = (svcLive.runningReplicas ?? 0) > 0;

    const edgeFrom = reqEdge?.from ?? upstream[0];
    const edgeTo = reqEdge?.to ?? primaryService;
    const edgeSg =
      edgeFrom && edgeTo
        ? (data.telemetry?.serviceGraph ?? []).find((sg) => sg.client === edgeFrom && sg.server === edgeTo)
        : undefined;
    const edgeLabel =
      edgeFrom && edgeTo
        ? `${edgeFrom} → ${edgeTo} (${edgeSg ? (edgeSg.errorRatePercent >= 5 ? `${Math.round(edgeSg.errorRatePercent)}% err` : "OK") : isUp ? "LIVE" : "DOWN"})`
        : "—";

    stats = [
      {
        label: t("Target Service", "Dịch vụ sự cố"),
        value: `${primaryService ?? "service"} · ${isUp ? `UP (×${svcLive.runningReplicas})` : "DOWN (×0)"}`,
        tone: isUp ? "good" : "bad",
      },
      {
        label: "Circuit Breaker",
        value: circuitOpen
          ? t("OPEN (Tripped)", "OPEN (Đang ngắt mạch)")
          : isUp
            ? t("CLOSED (Healthy)", "CLOSED (Ổn định)")
            : t("DEGRADED", "GIÁN ĐOẠN"),
        tone: circuitOpen || !isUp ? "bad" : "good",
      },
      {
        label: t("Error Rate", "Tỉ lệ lỗi"),
        value: formatDelta(beforeErrPct, liveErrPct, "%"),
        tone: (liveErrPct ?? 0) >= 5 ? "bad" : "good",
      },
      {
        label: t("Trace Path / p95", "Đường gọi / p95"),
        value: `${edgeLabel} · ${fmtNum(liveP95Ms, 0) ?? "—"} ms`,
        tone: edgeSg && edgeSg.errorRatePercent >= 5 ? "bad" : "neutral",
      },
    ];
  } else if (exerciseType === "CONFIG_REGRESSION") {
    badge = t("CPU DEGRADATION", "TẮC NGHẼN CPU");
    accentColor = "#8b5cf6";
    primaryService =
      throttledService ??
      criteria?.targetChangeAction?.service ??
      options?.authoringTargetService ??
      options?.selectedService ??
      null;

    const upstream = primaryService ? findDirectNeighbors(primaryService, data, "upstream") : [];
    focusCandidates = [primaryService, ...upstream.slice(0, 2)];

    const throttleAction = primaryService
      ? [...confirmed].reverse().find((a) => a.action === "THROTTLE_CPU" && a.service === primaryService)
      : actionOf("THROTTLE_CPU");
    const svcLive = readServiceCpuMem(data, primaryService);
    const cpuLimit = throttleAction?.cpuPercent ?? criteria?.targetChangeAction?.cpuPercent;

    stats = [
      {
        label: t("CPU Throttle", "Giới hạn CPU"),
        value: `${primaryService ?? "service"} · ${cpuLimit ? `Quota ${cpuLimit}%` : svcLive.cpu ? `Live ${svcLive.cpu}` : "100%"}`,
        tone: cpuLimit && cpuLimit < 100 ? "warn" : "neutral",
      },
      {
        label: t("p95 Latency", "Độ trễ p95"),
        value: formatDelta(beforeP95Ms, liveP95Ms, " ms", 0),
        tone: (liveP95Ms ?? 0) >= 250 ? "warn" : "good",
      },
      {
        label: t("Error Rate", "Tỉ lệ lỗi"),
        value: formatDelta(beforeErrPct, liveErrPct, "%"),
        tone: (liveErrPct ?? 0) >= 5 ? "bad" : "good",
      },
      {
        label: t("Resources", "Tài nguyên"),
        value: `${svcLive.cpu ?? "—"} CPU · ${svcLive.memory ? svcLive.memory.split("/")[0]?.trim() : "—"} RAM`,
        tone: "neutral",
      },
    ];
  } else {
    badge = "STUDIO SNAPSHOT";
    accentColor = "#10b981";
    primaryService = lastConfirmed?.service ?? options?.selectedService ?? null;
    if (primaryService) {
      focusCandidates = [primaryService, ...findDirectNeighbors(primaryService, data, "both").slice(0, 2)];
    }

    const totalSvcs = data.services?.length ?? 0;
    const runningSvcs = (data.telemetry?.services ?? []).filter((s) => s.runningReplicas > 0).length;
    const totalPods = (data.telemetry?.services ?? []).reduce((sum, s) => sum + s.runningReplicas, 0);

    stats = [
      {
        label: t("Services", "Dịch vụ chạy"),
        value: `${runningSvcs}/${totalSvcs} (${totalPods} pods)`,
        tone: runningSvcs === totalSvcs && totalSvcs > 0 ? "good" : "warn",
      },
      {
        label: t("Traffic (RPS)", "Lưu lượng"),
        value: probe ? `${fmtNum(probe.rps, 1) ?? "0"} req/s` : "—",
        tone: "neutral",
      },
      {
        label: t("p95 Latency", "Độ trễ p95"),
        value: formatDelta(beforeP95Ms, liveP95Ms, " ms", 0),
        tone: (liveP95Ms ?? 0) >= 300 ? "warn" : "good",
      },
      {
        label: t("Error Rate", "Tỉ lệ lỗi"),
        value: formatDelta(beforeErrPct, liveErrPct, "%"),
        tone: (liveErrPct ?? 0) >= 5 ? "bad" : "good",
      },
    ];
  }

  const focusServices = uniqueValidServices(focusCandidates, known).slice(0, 5);
  const focusSummary =
    focusServices.length === 0
      ? t(`Full topology (${known.size} services)`, `Toàn cảnh (${known.size} dịch vụ)`)
      : focusServices.length === 1
        ? `Focus: ${focusServices[0]}`
        : `Focus: ${focusServices[0]} (+${focusServices.length - 1})`;

  const suggestedNote = `[${badge}] ${stats
    .map((item) => `${item.label}: ${item.value}`)
    .join(" · ")}${autoCheckSummary ? ` · ${autoCheckSummary.text}` : ""}`;

  return {
    exerciseType,
    badge,
    accentColor,
    primaryService: primaryService && (known.size === 0 || known.has(primaryService)) ? primaryService : focusServices[0] ?? null,
    focusServices,
    focusSummary,
    autoCheckSummary,
    stats,
    suggestedNote,
  };
}

/**
 * Computes an exact isometric Three.js camera framing that centers and zooms onto `focusServices`
 * while leaving clean vertical margins for the top Smart Stats HUD and bottom MSSV watermark.
 */
export function computeFocusCameraFraming(
  nodes: ReadonlyArray<{ id: string; x: number; z: number }>,
  focusServices: readonly string[],
  options: {
    aspect: number;
    fovDeg: number;
    currentYaw: number;
    baseDist: number;
  },
): FocusCameraFraming | null {
  if (!focusServices.length || nodes.length === 0) return null;
  const focusSet = new Set(focusServices);
  const matched = nodes.filter((n) => focusSet.has(n.id));
  if (matched.length === 0) return null;
  // If focusing almost the entire large graph, skip close-crop and keep clean full overview.
  if (nodes.length >= 5 && matched.length >= nodes.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const node of matched) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.z < minZ) minZ = node.z;
    if (node.z > maxZ) maxZ = node.z;
  }

  // Pad around block plinth (1.22x0.90), stacked replicas, and floating service tag pills
  const padX = matched.length === 1 ? 1.55 : 1.35;
  const padZ = matched.length === 1 ? 1.45 : 1.25;
  const lookX = (minX + maxX) / 2;
  const lookZ = (minZ + maxZ) / 2;
  const spanX = maxX - minX + padX * 2;
  const spanZ = maxZ - minZ + padZ * 2;

  const yaw = Number.isFinite(options.currentYaw) ? options.currentYaw : 0.62;
  const pitch = 0.60; // ~34° isometric angle: crisp block tops, side replicas, and readable tags
  const cosY = Math.abs(Math.cos(yaw));
  const sinY = Math.abs(Math.sin(yaw));
  const projectedW = spanX * cosY + spanZ * sinY;
  const projectedD = spanX * sinY + spanZ * cosY;
  // Vertical screen height spans projected depth foreshortened by sin(pitch) + block/tag vertical height (~1.65)
  const projectedH = projectedD * Math.sin(pitch) + 1.85;

  const halfFovRad = ((options.fovDeg || 34) * Math.PI) / 360;
  const tanV = Math.max(0.15, Math.tan(halfFovRad));
  const aspect = Math.max(0.7, Math.min(2.6, options.aspect || 1.6));
  const tanH = tanV * aspect;

  // Leave ~14% top HUD + ~6% bottom MSSV bar clearance so zero focused nodes get hidden behind overlays
  const distForH = (projectedH / 2 / tanV) * 1.42;
  const distForW = (projectedW / 2 / tanH) * 1.28;
  const minDist = matched.length === 1 ? 5.6 : 6.6;
  const maxDist = Math.max(minDist, options.baseDist);
  const dist = Math.max(minDist, Math.min(maxDist, Math.max(distForH, distForW)));

  const panScale = 0.0085;
  const panX = Math.max(-900, Math.min(900, Math.round(-lookX / panScale)));
  const panY = Math.max(-600, Math.min(600, Math.round(-lookZ / panScale)));
  const zoom = Math.max(0.55, Math.min(2.1, Number((options.baseDist / dist).toFixed(3))));

  return {
    lookX,
    lookZ,
    dist,
    pitch,
    yaw,
    panX,
    panY,
    zoom,
    focusedIds: matched.map((n) => n.id),
  };
}

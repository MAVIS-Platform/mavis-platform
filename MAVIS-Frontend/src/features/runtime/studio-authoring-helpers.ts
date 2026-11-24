import type { Response } from "@/lib/api/contracts";

export type StudioGoalId = "change-impact" | "scale" | "recovery" | "cpu";
export type AuthorBlockChipId =
  | "author-starts-down"
  | "author-impact-target"
  | "author-scale-2x"
  | "author-cpu-target";

export type ExerciseTypeKey =
  | "CHANGE_IMPACT"
  | "CASCADING_FAILURE"
  | "CIRCUIT_BREAKER"
  | "SCALE_UNDER_LOAD"
  | "CONFIG_REGRESSION"
  | "CUSTOM";

export type TargetChangeAction = {
  action: "STOP" | "START" | "SCALE" | "PAUSE" | "RESUME" | "THROTTLE_CPU" | "SET_LOAD";
  service: string;
  replicas?: number | null;
  cpuPercent?: number | null;
  targetRps?: number | null;
};

export interface StudioGoalOption {
  id: StudioGoalId;
  exerciseType: ExerciseTypeKey;
  titleEn: string;
  titleVi: string;
  descEn: string;
  descVi: string;
  accent: "amber" | "sky" | "rose" | "violet";
}

export const AUTHOR_GOALS: readonly StudioGoalOption[] = [
  {
    id: "change-impact",
    exerciseType: "CHANGE_IMPACT",
    titleEn: "Change Impact",
    titleVi: "Phân tích ảnh hưởng",
    descEn: "Predict blast radius when 1 service fails",
    descVi: "Phân tích ảnh hưởng khi 1 service chết",
    accent: "amber",
  },
  {
    id: "scale",
    exerciseType: "SCALE_UNDER_LOAD",
    titleEn: "Scale-Out",
    titleVi: "Chịu tải & Scale",
    descEn: "Handle load spike & scale replicas",
    descVi: "Chịu tải & Scale replica",
    accent: "sky",
  },
  {
    id: "recovery",
    exerciseType: "CIRCUIT_BREAKER",
    titleEn: "Outage Recovery",
    titleVi: "Khôi phục sự cố",
    descEn: "Diagnose a stopped service & recover",
    descVi: "Chẩn đoán & khôi phục sự cố",
    accent: "rose",
  },
  {
    id: "cpu",
    exerciseType: "CONFIG_REGRESSION",
    titleEn: "CPU Degradation",
    titleVi: "Tắc nghẽn CPU",
    descEn: "Throttle CPU & diagnose latency jump",
    descVi: "Tắc nghẽn CPU & độ trễ tăng cao",
    accent: "violet",
  },
];

export interface AuthorDragChip {
  id: AuthorBlockChipId;
  labelEn: string;
  labelVi: string;
  hintEn: string;
  hintVi: string;
  accent: "rose" | "amber" | "sky" | "violet";
}

export const AUTHOR_DRAG_CHIPS: readonly AuthorDragChip[] = [
  {
    id: "author-starts-down",
    labelEn: "Starts Down",
    labelVi: "Sự cố ban đầu",
    hintEn: "Boot this service stopped when students enter",
    hintVi: "Tắt sẵn service này khi sinh viên mở bài",
    accent: "rose",
  },
  {
    id: "author-impact-target",
    labelEn: "Impact Target",
    labelVi: "Mục tiêu Change Impact",
    hintEn: "Mark PAUSE target & preview Reverse BFS blast radius",
    hintVi: "Đặt mục tiêu PAUSE & tô sáng các nhánh bị ảnh hưởng",
    accent: "amber",
  },
  {
    id: "author-scale-2x",
    labelEn: "Scale >= 2x",
    labelVi: "Cho phép Scale >= 2x",
    hintEn: "Enable scaling & require >= 2 replicas to pass",
    hintVi: "Bật cho phép Scale & yêu cầu >= 2 replica",
    accent: "sky",
  },
  {
    id: "author-cpu-target",
    labelEn: "CPU 25%",
    labelVi: "Mục tiêu bóp CPU",
    hintEn: "Mark target for 25% CPU throttling drill",
    hintVi: "Đặt mục tiêu bóp CPU xuống 25%",
    accent: "violet",
  },
];

export interface StaticBlastRadius {
  target: string;
  upstreamImpacted: string[];
  impactedEdgeKeys: Set<string>;
}

/**
 * Static Reverse BFS on directed service edges (caller `from` depends on callee `to`).
 * Terminates safely on cycles and returns all upstream services & edges affected when `target` fails.
 */
export function computeStaticBlastRadius(
  target: string | null | undefined,
  edges: ReadonlyArray<{ from: string; to: string }>,
): StaticBlastRadius {
  const cleanTarget = (target ?? "").trim();
  if (!cleanTarget) {
    return { target: "", upstreamImpacted: [], impactedEdgeKeys: new Set() };
  }
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.from || !edge.to || edge.from === edge.to) continue;
    const callers = reverseAdj.get(edge.to) ?? [];
    if (!callers.includes(edge.from)) callers.push(edge.from);
    reverseAdj.set(edge.to, callers);
  }
  const visited = new Set<string>([cleanTarget]);
  const upstream: string[] = [];
  const impactedEdgeKeys = new Set<string>();
  const queue: string[] = [cleanTarget];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const callers = (reverseAdj.get(current) ?? []).slice().sort();
    for (const caller of callers) {
      impactedEdgeKeys.add(`${caller}->${current}`);
      if (!visited.has(caller)) {
        visited.add(caller);
        upstream.push(caller);
        queue.push(caller);
      }
    }
  }
  return { target: cleanTarget, upstreamImpacted: upstream, impactedEdgeKeys };
}

/**
 * Resolves static architecture model edges (element IDs) onto Compose service names
 * using the same mapping hierarchy as StudioObservability so Reverse BFS matches the 3D stage.
 */
export function resolveModelServiceEdges(
  model:
    | {
        elements: ReadonlyArray<{ id: string; name: string; parentId?: string | null | undefined }>;
        edges: ReadonlyArray<{ from: string; to: string }>;
      }
    | null
    | undefined,
  serviceMappings: Readonly<Record<string, string>> | null | undefined,
  services: readonly string[],
): Array<{ from: string; to: string }> {
  if (!model?.edges?.length) return [];
  const serviceByElementId = new Map<string, string>();
  for (const [svc, id] of Object.entries(serviceMappings ?? {})) {
    if (id) serviceByElementId.set(id, svc);
  }
  const serviceByLowerName = new Map(services.map((svc) => [svc.toLowerCase(), svc] as const));
  const elementsById = new Map(model.elements.map((el) => [el.id, el] as const));
  const resolveService = (elementId: string): string | undefined => {
    const direct = serviceByElementId.get(elementId);
    if (direct) return direct;
    let cur = elementsById.get(elementId);
    const visited = new Set<string>();
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      const mapped = serviceByElementId.get(cur.id);
      if (mapped) return mapped;
      const byName = serviceByLowerName.get(cur.name.toLowerCase());
      if (byName) return byName;
      cur = cur.parentId ? elementsById.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  const seen = new Set<string>();
  const resolved: Array<{ from: string; to: string }> = [];
  for (const edge of model.edges) {
    const from = resolveService(edge.from);
    const to = resolveService(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({ from, to });
  }
  return resolved;
}

export interface EndpointOption {
  path: string;
  label: string;
  service?: string | undefined;
}

function scoreEndpointPath(path: string, service?: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (service && /gateway|edge|proxy|bff/.test(service.toLowerCase())) score += 40;
  if (lower.includes("live-flow") || lower.includes("storefront") || lower.includes("checkout")) score += 50;
  if (lower.includes("/api/") && !lower.includes("{")) score += 25;
  if (lower.includes("order")) score += 15;
  if (lower === "/" || lower === "/health" || lower.includes("actuator")) score -= 30;
  if (lower.includes("{") || lower.includes(":")) score -= 20;
  return score;
}

/**
 * Extracts real GET baseline endpoints from runtimeConfiguration.profile
 * (studio-preset scenario steps + ComposePreflight detectedEndpoints) so lecturers pick real paths instead of typing `/`.
 */
export function extractRepoEndpointOptions(
  profile: Record<string, unknown> | null | undefined,
  currentPath?: string | null,
): EndpointOption[] {
  const candidates = new Map<string, EndpointOption & { score: number }>();
  const add = (rawPath: unknown, service?: string, bonus = 0) => {
    if (typeof rawPath !== "string") return;
    const cleaned = rawPath.trim();
    if (!cleaned.startsWith("/") || cleaned.length > 200) return;
    if (cleaned.includes("{") || cleaned.includes("*")) return;
    const score = scoreEndpointPath(cleaned, service) + bonus;
    const existing = candidates.get(cleaned);
    if (!existing || score > existing.score) {
      candidates.set(cleaned, {
        path: cleaned,
        service,
        label: service ? `GET ${cleaned} (${service})` : `GET ${cleaned}`,
        score,
      });
    }
  };

  if (profile && typeof profile === "object") {
    const scenario = profile["scenario"];
    if (scenario && typeof scenario === "object") {
      const steps = (scenario as Record<string, unknown>)["steps"];
      if (Array.isArray(steps)) {
        for (const step of steps) {
          if (!step || typeof step !== "object") continue;
          const rec = step as Record<string, unknown>;
          const method = String(rec["method"] ?? "GET").toUpperCase();
          if (method !== "GET" && method !== "HEAD") continue;
          const svc = typeof rec["service"] === "string" ? rec["service"] : undefined;
          add(rec["path"], svc, 60);
        }
      }
    }
    const detected = profile["detectedEndpoints"];
    if (Array.isArray(detected)) {
      for (const ep of detected) {
        if (!ep || typeof ep !== "object") continue;
        const rec = ep as Record<string, unknown>;
        const method = String(rec["method"] ?? "GET").toUpperCase();
        if (method !== "GET" && method !== "HEAD") continue;
        const svc = typeof rec["service"] === "string" ? rec["service"] : undefined;
        add(rec["path"], svc, 10);
      }
    }
  }

  if (currentPath && currentPath.trim().startsWith("/") && currentPath.trim() !== "/") {
    add(currentPath, undefined, 5);
  }
  add("/health", undefined, -40);

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 12)
    .map(({ path, label, service }) => ({ path, label, ...(service ? { service } : {}) }));
}

export interface DerivedExerciseFromDemo {
  exerciseType: ExerciseTypeKey;
  predictionRequired: boolean;
  minImpactF1: number | null;
  targetChangeAction: TargetChangeAction | null;
  stoppedServices: string[];
  minReplicas: Array<{ service: string; count: number }>;
  scalableServices: string[];
  allowedActions: string[];
  maxErrorRatePercent: string;
  instructions: string;
  summary: string;
}

type StudioActionItem = Response<"studioState">["actions"][number];

/**
 * Author-by-Doing: derives a complete exercise definition from the lecturer's confirmed live Docker actions.
 */
export function deriveExerciseFromLiveActions(
  actions: readonly StudioActionItem[],
  currentStoppedServices: readonly string[],
  locale: "en" | "vi" = "en",
): DerivedExerciseFromDemo | null {
  const confirmed = actions.filter((item) => item.status === "CONFIRMED");
  if (confirmed.length === 0 && currentStoppedServices.length === 0) return null;

  const latestPauseOrStop = [...confirmed]
    .reverse()
    .find((a) => a.action === "PAUSE" || a.action === "STOP");
  const latestScale = [...confirmed]
    .reverse()
    .find((a) => a.action === "SCALE" && (a.replicas ?? a.result?.replicasAfter ?? 0) >= 2);
  const latestLoad = [...confirmed].reverse().find((a) => a.action === "SET_LOAD");
  const latestCpu = [...confirmed].reverse().find((a) => a.action === "THROTTLE_CPU");
  const latestRecover = [...confirmed]
    .reverse()
    .find((a) => a.action === "START" || a.action === "RESUME");

  if (latestScale) {
    const target = latestScale.service;
    const count = Math.max(2, Math.min(3, latestScale.replicas ?? latestScale.result?.replicasAfter ?? 2));
    const rps = latestLoad?.targetRps ?? 20;
    return {
      exerciseType: "SCALE_UNDER_LOAD",
      predictionRequired: false,
      minImpactF1: null,
      targetChangeAction: { action: "SCALE", service: target, replicas: count },
      stoppedServices: [],
      minReplicas: [{ service: target, count }],
      scalableServices: [target],
      allowedActions: ["SCALE", "SET_LOAD", "START", "STOP"],
      maxErrorRatePercent: "5",
      instructions:
        locale === "vi"
          ? `Tăng tải probe lên ${rps} RPS, quan sát độ trễ p95 trên ${target}, sau đó scale ${target} lên tối thiểu ${count} replica trong khi giữ tỉ lệ lỗi <= 5%.`
          : `Raise probe load to ${rps} RPS, observe latency on ${target}, then scale ${target} to at least ${count} replicas while keeping error rate <= 5%.`,
      summary:
        locale === "vi"
          ? `Scale-Out: ${target} >= ${count}x (tải ${rps} RPS)`
          : `Scale-Out: ${target} >= ${count}x (load ${rps} RPS)`,
    };
  }

  if (latestCpu) {
    const target = latestCpu.service;
    const pct = Math.max(5, Math.min(90, latestCpu.cpuPercent ?? 25));
    return {
      exerciseType: "CONFIG_REGRESSION",
      predictionRequired: false,
      minImpactF1: null,
      targetChangeAction: { action: "THROTTLE_CPU", service: target, cpuPercent: pct },
      stoppedServices: [],
      minReplicas: [],
      scalableServices: [target],
      allowedActions: ["THROTTLE_CPU", "SET_LOAD", "SCALE", "START", "STOP"],
      maxErrorRatePercent: "5",
      instructions:
        locale === "vi"
          ? `Bóp CPU của ${target} xuống ${pct}%, chụp snapshot ghi nhận mức tăng độ trễ p95 và giải thích điểm nghẽn tới các service upstream.`
          : `Throttle ${target} CPU to ${pct}%, capture latency degradation evidence, and explain the bottleneck across upstream callers.`,
      summary:
        locale === "vi"
          ? `Tắc nghẽn CPU: ${target} mức ${pct}% CPU`
          : `CPU Degradation: ${target} at ${pct}% CPU`,
    };
  }

  if (latestPauseOrStop && !latestRecover) {
    const target = latestPauseOrStop.service;
    const act = latestPauseOrStop.action === "STOP" ? "STOP" : "PAUSE";
    return {
      exerciseType: "CHANGE_IMPACT",
      predictionRequired: true,
      minImpactF1: 0.7,
      targetChangeAction: { action: act, service: target },
      stoppedServices: [],
      minReplicas: [],
      scalableServices: [],
      allowedActions: ["PAUSE", "RESUME", "STOP", "START", "SET_LOAD"],
      maxErrorRatePercent: "",
      instructions:
        locale === "vi"
          ? `Quan sát sơ đồ phụ thuộc, dự đoán tất cả service bị ảnh hưởng khi ${act} ${target}, khóa dự đoán, sau đó thực hiện ${act} trên ${target} và chụp snapshot Before/After.`
          : `Inspect the live service graph, predict every service affected when ${target} is ${act === "PAUSE" ? "paused" : "stopped"}, lock your prediction, then execute ${act} on ${target} and capture Before/After evidence.`,
      summary:
        locale === "vi"
          ? `Change Impact: ${act} ${target} (chấm tự động F1 >= 70%)`
          : `Change Impact: ${act} ${target} (Auto-Graded F1 >= 70%)`,
    };
  }

  const recoverTarget = latestRecover?.service ?? currentStoppedServices[0];
  if (recoverTarget) {
    return {
      exerciseType: "CIRCUIT_BREAKER",
      predictionRequired: false,
      minImpactF1: null,
      targetChangeAction: { action: "START", service: recoverTarget },
      stoppedServices: [recoverTarget],
      minReplicas: [],
      scalableServices: [],
      allowedActions: ["START", "STOP", "PAUSE", "RESUME", "CONNECT", "DISCONNECT"],
      maxErrorRatePercent: "0",
      instructions:
        locale === "vi"
          ? `Chẩn đoán service ${recoverTarget} đang tắt, quan sát lỗi lan truyền lên các service upstream, khởi động lại ${recoverTarget} để khôi phục 0% lỗi và chụp snapshot Before/After.`
          : `Diagnose the stopped ${recoverTarget} service, observe error propagation across upstream callers, start ${recoverTarget} to recover 0% errors, and capture Before/After evidence.`,
      summary:
        locale === "vi"
          ? `Khôi phục sự cố: tắt sẵn ${recoverTarget} -> khôi phục 0% lỗi`
          : `Outage Recovery: starts ${recoverTarget} Down -> 0% err`,
    };
  }

  return null;
}

export interface MiniTopologyNode {
  service: string;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MiniTopologyEdge {
  from: string;
  to: string;
  key: string;
  path: string;
}

export interface MiniTopologyLayout {
  nodes: MiniTopologyNode[];
  edges: MiniTopologyEdge[];
  width: number;
  height: number;
  hiddenCount: number;
}

const MINI_GATEWAY_RE = /(gateway|ingress|edge|proxy|bff|router)/i;
const MINI_SINK_RE = /(worker|consumer|processor|notifier|cron|job|db|database|postgres|mysql|mongo|redis|kafka|rabbit|queue|broker|mq)/i;

/**
 * Computes a compact left-to-right architectural SVG layout for the Lab Studio Launchpad.
 * Caps large repositories (15-25+ services) to `maxNodes` while keeping highlighted targets visible.
 */
export function computeMiniTopologyLayout(
  services: readonly string[],
  rawEdges: ReadonlyArray<{ from: string; to: string }>,
  options?: { priorityServices?: readonly string[]; maxNodes?: number },
): MiniTopologyLayout {
  const unique = Array.from(
    new Set(services.map((svc) => svc.trim()).filter(Boolean)),
  );
  if (unique.length === 0) {
    return { nodes: [], edges: [], width: 320, height: 120, hiddenCount: 0 };
  }

  const maxNodes = Math.max(1, options?.maxNodes ?? 12);
  const prioritySet = new Set(options?.priorityServices ?? []);
  const degree = new Map<string, number>();
  for (const edge of rawEdges) {
    if (!edge.from || !edge.to || edge.from === edge.to) continue;
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  let shown = unique;
  if (unique.length > maxNodes) {
    const ranked = unique
      .map((svc, index) => ({
        svc,
        index,
        score:
          (prioritySet.has(svc) ? 100 : 0) +
          (MINI_GATEWAY_RE.test(svc) ? 40 : 0) +
          (degree.get(svc) ?? 0) * 3,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxNodes);
    const keep = new Set(ranked.map((r) => r.svc));
    shown = unique.filter((svc) => keep.has(svc));
  }
  const hiddenCount = unique.length - shown.length;
  const shownSet = new Set(shown);

  const edgeSeen = new Set<string>();
  const validEdges: Array<{ from: string; to: string }> = [];
  for (const edge of rawEdges) {
    if (
      !edge.from ||
      !edge.to ||
      edge.from === edge.to ||
      !shownSet.has(edge.from) ||
      !shownSet.has(edge.to)
    ) {
      continue;
    }
    const key = `${edge.from}->${edge.to}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    validEdges.push({ from: edge.from, to: edge.to });
  }

  const colByService = new Map<string, number>();
  if (validEdges.length > 0) {
    const outAdj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const svc of shown) {
      outAdj.set(svc, []);
      inDeg.set(svc, 0);
    }
    for (const e of validEdges) {
      outAdj.get(e.from)!.push(e.to);
      inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }

    const roots = shown.filter(
      (svc) => (inDeg.get(svc) ?? 0) === 0 || MINI_GATEWAY_RE.test(svc),
    );
    if (roots.length === 0) {
      const seed = shown.slice().sort(
        (a, b) => (outAdj.get(b)?.length ?? 0) - (outAdj.get(a)?.length ?? 0),
      )[0]!;
      roots.push(seed);
    }

    const queue: Array<{ svc: string; depth: number; trail: Set<string> }> = [];
    for (const root of roots) {
      colByService.set(root, 0);
      queue.push({ svc: root, depth: 0, trail: new Set([root]) });
    }
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++]!;
      for (const next of outAdj.get(cur.svc) ?? []) {
        if (cur.trail.has(next)) continue; // Cycle guard
        const nextDepth = Math.min(3, cur.depth + 1);
        if ((colByService.get(next) ?? -1) < nextDepth) {
          colByService.set(next, nextDepth);
          const nextTrail = new Set(cur.trail);
          nextTrail.add(next);
          queue.push({ svc: next, depth: nextDepth, trail: nextTrail });
        }
      }
    }
    const maxAssigned = Math.max(1, ...Array.from(colByService.values(), (c) => c));
    for (const svc of shown) {
      if (!colByService.has(svc)) {
        colByService.set(
          svc,
          MINI_GATEWAY_RE.test(svc) ? 0 : MINI_SINK_RE.test(svc) ? maxAssigned : 1,
        );
      }
    }
  } else {
    // No static edges yet: group by role into balanced columns (max 4 rows per column)
    for (const svc of shown) {
      colByService.set(
        svc,
        MINI_GATEWAY_RE.test(svc) ? 0 : MINI_SINK_RE.test(svc) ? 2 : 1,
      );
    }
  }

  // Group into contiguous columns and cap rows per column at 4 so tall flat lists wrap cleanly
  const rawCols = Array.from(new Set(colByService.values())).sort((a, b) => a - b);
  const columns: string[][] = [];
  for (const colIdx of rawCols) {
    const members = shown
      .filter((svc) => colByService.get(svc) === colIdx)
      .sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < members.length; i += 4) {
      columns.push(members.slice(i, i + 4));
    }
  }

  const nodeW = 142;
  const nodeH = 34;
  const colGap = 48;
  const rowGap = 14;
  const padX = 16;
  const padY = 18;
  const colCount = Math.max(1, columns.length);
  const maxRows = Math.max(1, ...columns.map((c) => c.length));
  const width = padX * 2 + colCount * nodeW + Math.max(0, colCount - 1) * colGap;
  const height = Math.max(156, padY * 2 + maxRows * nodeH + Math.max(0, maxRows - 1) * rowGap);

  const nodes: MiniTopologyNode[] = [];
  const nodeByService = new Map<string, MiniTopologyNode>();
  columns.forEach((colServices, colIndex) => {
    const x = padX + colIndex * (nodeW + colGap);
    const colH = colServices.length * nodeH + Math.max(0, colServices.length - 1) * rowGap;
    const startY = Math.round((height - colH) / 2);
    colServices.forEach((svc, rowIndex) => {
      const node: MiniTopologyNode = {
        service: svc,
        col: colIndex,
        x,
        y: startY + rowIndex * (nodeH + rowGap),
        w: nodeW,
        h: nodeH,
      };
      nodes.push(node);
      nodeByService.set(svc, node);
    });
  });

  const edges: MiniTopologyEdge[] = validEdges.flatMap((e) => {
    const a = nodeByService.get(e.from);
    const b = nodeByService.get(e.to);
    if (!a || !b) return [];
    const ay = a.y + a.h / 2;
    const by = b.y + b.h / 2;
    let path: string;
    if (a.col < b.col) {
      const x1 = a.x + a.w;
      const x2 = b.x;
      const c = Math.max(20, (x2 - x1) * 0.5);
      path = `M ${x1} ${ay} C ${x1 + c} ${ay}, ${x2 - c} ${by}, ${x2} ${by}`;
    } else if (a.col === b.col) {
      const x1 = a.x + a.w;
      const bow = x1 + 22;
      path = `M ${x1} ${ay} C ${bow} ${ay}, ${bow} ${by}, ${x1} ${by}`;
    } else {
      const x1 = a.x;
      const x2 = b.x + b.w;
      const archY = Math.max(8, Math.min(a.y, b.y) - 16);
      path = `M ${x1} ${ay} C ${x1 - 22} ${archY}, ${x2 + 22} ${archY}, ${x2} ${by}`;
    }
    return [{ from: e.from, to: e.to, key: `${e.from}->${e.to}`, path }];
  });

  return { nodes, edges, width, height, hiddenCount };
}

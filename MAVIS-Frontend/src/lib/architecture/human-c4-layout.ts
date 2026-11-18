import type { ArchitecturalModel } from "@/types/domain";
import {
  extractDeclarativeClientTarget,
  isDeclarativeClientElement,
} from "@/features/architecture/classifier-semantics";

type ModelElement = ArchitecturalModel["elements"][number];
type ModelEdge = ArchitecturalModel["edges"][number];

export type HumanC4Kind = "CONTEXT" | "CONTAINER" | "COMPONENT";

export type HumanNodeShape =
  | "person"
  | "system"
  | "container"
  | "database"
  | "broker"
  | "external"
  | "component-api"
  | "component-service"
  | "component-data"
  | "component-client";

export interface HumanC4Node {
  id: string;
  canonicalId: string | null;
  name: string;
  badge: string;
  subtitle: string;
  metaChips?: string[];
  shape: HumanNodeShape;
  x: number;
  y: number;
  width: number;
  height: number;
  column?: number;
  tier?: number;
  inBoundary?: boolean;
}

export interface HumanC4Edge {
  id: string;
  canonicalId: string | null;
  from: string;
  to: string;
  label: string;
  protocol: string;
  style: "solid" | "dashed";
  underlyingEdgeIds: string[];
  pathD: string;
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
}

export interface HumanC4Boundary {
  id: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HumanC4Scene {
  kind: HumanC4Kind;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  boundary?: HumanC4Boundary;
  nodes: HumanC4Node[];
  edges: HumanC4Edge[];
}

const DEPLOYMENT_PROTOCOLS = new Set(["DECLARED_COMPOSE", "DECLARED_LINK"]);

const PROTOCOL_PRIORITY: Record<string, number> = {
  GATEWAY_ROUTE: 100,
  SERVICE_HTTP_CALL: 95,
  RUNTIME_OBSERVED: 90,
  DATABASE_ACCESS: 85,
  DATABASE_QUERY: 82,
  MESSAGE_PUBLISH: 80,
  MESSAGE_SUBSCRIBE: 78,
  USES_API: 70,
  CODE_DEPENDENCY: 60,
  CONFIGURATION_DEPENDENCY: 40,
  CONFIGURED_ENDPOINT: 20,
};

function isDeploymentEdge(edge: ModelEdge): boolean {
  return (
    DEPLOYMENT_PROTOCOLS.has(edge.protocol) ||
    edge.originLayer === "DEPLOYMENT"
  );
}

function humanizeSegment(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function looksMeaningfulSystemName(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  // Reject obvious random keysmash like "fvdbgvfb" (single token >=6 chars with no vowels)
  if (!trimmed.includes(" ") && trimmed.length >= 5 && !/[aeiouyáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữự]/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Derives a clean human system name from real analyzed services or project metadata,
 * avoiding random assignment slugs like "fvdbgvfb".
 */
export function resolveHumanSystemName(
  model: ArchitecturalModel,
  preferredName?: string | null,
  locale: "en" | "vi" = "vi",
): string {
  const services = model.elements.filter((e) => e.elementType === "SERVICE_CONTAINER");
  // Check if services share a clean domain prefix like "fruit-order-service", "fruit-payment-service"
  if (services.length >= 2) {
    const firstTokens = services
      .map((s) => s.name.toLowerCase().split(/[-_\s]+/)[0] ?? "")
      .filter((t) => t.length >= 3 && !["service", "app", "api", "mavis", "ms"].includes(t));
    if (firstTokens.length >= Math.ceil(services.length * 0.6)) {
      const freq = new Map<string, number>();
      for (const tok of firstTokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) {
        const domain = humanizeSegment(top[0]);
        if (!looksMeaningfulSystemName(preferredName)) {
          return locale === "vi"
            ? `Hệ thống Microservices ${domain}`
            : `${domain} Microservices Platform`;
        }
      }
    }
  }
  if (looksMeaningfulSystemName(preferredName)) {
    return preferredName!.trim();
  }
  if (services.length === 1) {
    return humanizeSegment(services[0]!.name);
  }
  return locale === "vi" ? "Hệ thống Microservices đang phân tích" : "Analyzed Microservices System";
}

function formatHumanTech(tech?: string | null): string {
  if (!tech) return "";
  const upper = tech.toUpperCase();
  if (upper === "JAVA_SPRING") return "Java / Spring Boot";
  if (upper === "DOTNET" || upper === "CSHARP_ASPNET") return ".NET / ASP.NET Core";
  if (upper === "POSTGRES" || upper === "POSTGRESQL") return "PostgreSQL";
  if (upper === "MYSQL") return "MySQL";
  if (upper === "MONGODB") return "MongoDB";
  if (upper === "REDIS") return "Redis";
  if (upper === "RABBITMQ") return "RabbitMQ";
  if (upper === "KAFKA") return "Apache Kafka";
  return tech.replace(/_/g, " ");
}

function humanRelationLabel(
  protocol: string,
  fromEl?: ModelElement,
  toEl?: ModelElement,
  locale: "en" | "vi" = "vi",
): string {
  const fromClient = fromEl && isDeclarativeClientElement(fromEl);
  switch (protocol) {
    case "GATEWAY_ROUTE":
      return locale === "vi" ? "Định tuyến API" : "API Route";
    case "SERVICE_HTTP_CALL":
      return fromClient ? "OpenFeign · REST" : "REST / HTTP";
    case "RUNTIME_OBSERVED":
      return locale === "vi" ? "Gọi HTTP (Runtime)" : "HTTP (Observed)";
    case "DATABASE_ACCESS":
    case "DATABASE_QUERY": {
      const tech = toEl?.technology ? formatHumanTech(toEl.technology) : "";
      if (tech && /postgres|mysql|mongo|redis/i.test(tech)) {
        return locale === "vi" ? `Đọc/Ghi (${tech})` : `Reads/Writes (${tech})`;
      }
      return locale === "vi" ? "Đọc / Ghi CSDL" : "JDBC / Database";
    }
    case "MESSAGE_PUBLISH":
      return locale === "vi" ? "Phát sự kiện" : "Publishes";
    case "MESSAGE_SUBSCRIBE":
      return locale === "vi" ? "Nhận sự kiện" : "Subscribes";
    case "CODE_DEPENDENCY":
      return locale === "vi" ? "Gọi xử lý" : "Calls";
    case "USES_API":
      return locale === "vi" ? "Dùng API" : "Uses API";
    case "CONFIGURED_ENDPOINT":
      if (toEl?.elementType === "DATABASE") {
        return locale === "vi" ? "Kết nối CSDL" : "DB Connection";
      }
      if (toEl?.elementType === "MESSAGE_CHANNEL" || toEl?.elementType === "QUEUE_BROKER") {
        return locale === "vi" ? "Kết nối Broker" : "Broker Connection";
      }
      return "REST / HTTP";
    default:
      return protocol.replace(/_/g, " ");
  }
}

function ownerRootId(model: ArchitecturalModel, id: string): string {
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const seen = new Set<string>();
  let cur = id;
  while (!seen.has(cur)) {
    seen.add(cur);
    const parent = byId.get(cur)?.parentId;
    if (!parent || !byId.has(parent)) break;
    cur = parent;
  }
  return cur;
}

interface ConsolidatedEdge {
  from: string;
  to: string;
  protocol: string;
  underlyingEdgeIds: string[];
  label: string;
  style: "solid" | "dashed";
}

/**
 * Consolidates parallel raw edges sharing the same (from, to) pair into ONE clean,
 * human-readable architectural relationship while preserving all underlying edge IDs for 3E.
 */
export function consolidateDirectedEdges(
  rawEdges: Array<{ id: string; from: string; to: string; protocol: string }>,
  elById: Map<string, ModelElement>,
  locale: "en" | "vi" = "vi",
): ConsolidatedEdge[] {
  const grouped = new Map<
    string,
    { from: string; to: string; bestProtocol: string; bestScore: number; ids: string[] }
  >();

  for (const edge of rawEdges) {
    if (!edge.from || !edge.to || edge.from === edge.to) continue;
    const key = `${edge.from}-->${edge.to}`;
    const score = PROTOCOL_PRIORITY[edge.protocol] ?? 30;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        from: edge.from,
        to: edge.to,
        bestProtocol: edge.protocol,
        bestScore: score,
        ids: [edge.id],
      });
    } else {
      if (!existing.ids.includes(edge.id)) existing.ids.push(edge.id);
      if (score > existing.bestScore) {
        existing.bestProtocol = edge.protocol;
        existing.bestScore = score;
      }
    }
  }

  return [...grouped.values()]
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    .map((entry) => {
      const fromEl = elById.get(entry.from);
      const toEl = elById.get(entry.to);
      const isAsync =
        entry.bestProtocol === "MESSAGE_PUBLISH" ||
        entry.bestProtocol === "MESSAGE_SUBSCRIBE" ||
        entry.bestProtocol === "CONFIGURED_ENDPOINT";
      return {
        from: entry.from,
        to: entry.to,
        protocol: entry.bestProtocol,
        underlyingEdgeIds: entry.ids,
        label: humanRelationLabel(entry.bestProtocol, fromEl, toEl, locale),
        style: isAsync ? "dashed" : "solid",
      };
    });
}

function estimateLabelWidth(label: string): number {
  return Math.max(76, Math.min(185, label.length * 7.2 + 22));
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 8,
): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

/**
 * Resolves edge label collisions iteratively so no two relationship pills overlap
 * each other or cover any node box.
 */
function resolveLabelCollisions(edges: HumanC4Edge[], nodes: HumanC4Node[]): void {
  const nodeBoxes = nodes.map((n) => ({
    x: n.x + n.width / 2,
    y: n.y + n.height / 2,
    w: n.width,
    h: n.height,
  }));

  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < edges.length; i++) {
      const ei = edges[i]!;
      for (let j = i + 1; j < edges.length; j++) {
        const ej = edges[j]!;
        const boxI = { x: ei.labelX, y: ei.labelY, w: ei.labelWidth, h: ei.labelHeight };
        const boxJ = { x: ej.labelX, y: ej.labelY, w: ej.labelWidth, h: ej.labelHeight };
        if (boxesOverlap(boxI, boxJ, 6)) {
          const overlapY = (ei.labelHeight + ej.labelHeight) / 2 + 8 - Math.abs(ej.labelY - ei.labelY);
          const push = Math.max(12, overlapY / 2 + 2);
          if (ei.labelY <= ej.labelY) {
            ei.labelY -= push;
            ej.labelY += push;
          } else {
            ei.labelY += push;
            ej.labelY -= push;
          }
          moved = true;
        }
      }

      const boxI = { x: ei.labelX, y: ei.labelY, w: ei.labelWidth, h: ei.labelHeight };
      for (const nb of nodeBoxes) {
        if (boxesOverlap(boxI, nb, 4)) {
          if (ei.labelY <= nb.y) ei.labelY = nb.y - nb.h / 2 - ei.labelHeight / 2 - 8;
          else ei.labelY = nb.y + nb.h / 2 + ei.labelHeight / 2 + 8;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

function cubicPoint(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function findVerticalCorridorX(
  preferredX: number,
  blockingNodes: HumanC4Node[],
): number {
  if (blockingNodes.length === 0) return preferredX;
  const sorted = [...blockingNodes].sort((a, b) => a.x - b.x);
  const corridors: number[] = [];
  corridors.push(sorted[0]!.x - 30);
  for (let i = 0; i < sorted.length - 1; i++) {
    const leftEdge = sorted[i]!.x + sorted[i]!.width;
    const rightEdge = sorted[i + 1]!.x;
    corridors.push((leftEdge + rightEdge) / 2);
  }
  corridors.push(sorted[sorted.length - 1]!.x + sorted[sorted.length - 1]!.width + 30);

  let best = corridors[0]!;
  let bestDist = Math.abs(best - preferredX);
  for (const c of corridors) {
    const d = Math.abs(c - preferredX);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function buildSmoothEdge(
  edge: ConsolidatedEdge,
  idx: number,
  nodeMap: Map<string, HumanC4Node>,
  allNodes: HumanC4Node[],
  orientation: "vertical" | "horizontal",
  portOffsetFrom: number,
  portOffsetTo: number,
  outTotalFrom: number,
): HumanC4Edge | null {
  const src = nodeMap.get(edge.from);
  const dst = nodeMap.get(edge.to);
  if (!src || !dst) return null;

  let sx: number;
  let sy: number;
  let tx: number;
  let ty: number;
  let pathD: string;
  let labelX: number;
  let labelY: number;

  if (orientation === "horizontal") {
    const goingRight = dst.x >= src.x;
    sx = goingRight ? src.x + src.width : src.x;
    sy = src.y + src.height / 2 + portOffsetFrom;
    tx = goingRight ? dst.x : dst.x + dst.width;
    ty = dst.y + dst.height / 2 + portOffsetTo;

    if (Math.abs(src.x - dst.x) < 20) {
      const goingDown = dst.y >= src.y;
      sx = src.x + src.width / 2 + portOffsetFrom;
      sy = goingDown ? src.y + src.height : src.y;
      tx = dst.x + dst.width / 2 + portOffsetTo;
      ty = goingDown ? dst.y : dst.y + dst.height;
      const midY = (sy + ty) / 2;
      pathD = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
      labelX = (sx + tx) / 2;
      labelY = midY;
    } else {
      const dx = Math.max(48, Math.abs(tx - sx) * 0.48);
      const c1x = goingRight ? sx + dx : sx - dx;
      const c2x = goingRight ? tx - dx : tx + dx;
      pathD = `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
      // On multi-way fan-out (e.g. Service -> 4 adapters), place label cleanly at t=0.62 where curves diverge!
      const tPos = outTotalFrom >= 3 ? 0.62 : 0.5;
      labelX = cubicPoint(tPos, sx, c1x, c2x, tx);
      labelY = cubicPoint(tPos, sy, sy, ty, ty);
    }
  } else {
    // Vertical layered routing (C1 & C2)
    const sameRow = Math.abs(src.y - dst.y) < 35;
    if (sameRow) {
      const goingRight = dst.x > src.x;
      const adjacent = Math.abs(dst.x - src.x) <= src.width + 120;
      if (adjacent) {
        sx = goingRight ? src.x + src.width : src.x;
        sy = src.y + src.height / 2 + portOffsetFrom;
        tx = goingRight ? dst.x : dst.x + dst.width;
        ty = dst.y + dst.height / 2 + portOffsetTo;
        const midX = (sx + tx) / 2;
        pathD = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
        labelX = midX;
        labelY = (sy + ty) / 2 - 12;
      } else {
        sx = src.x + src.width / 2 + portOffsetFrom;
        sy = src.y + src.height;
        tx = dst.x + dst.width / 2 + portOffsetTo;
        ty = dst.y + dst.height;
        const arcY = Math.max(sy, ty) + 42;
        pathD = `M ${sx} ${sy} C ${sx} ${arcY}, ${tx} ${arcY}, ${tx} ${ty}`;
        labelX = (sx + tx) / 2;
        labelY = arcY - 6;
      }
    } else {
      const goingDown = dst.y > src.y;
      const minY = goingDown ? src.y + src.height : dst.y + dst.height;
      const maxY = goingDown ? dst.y : src.y;

      // Detect intermediate tier nodes sitting vertically between src and dst (e.g., Tier 1 -> Tier 3)
      const midTierNodes = allNodes.filter(
        (n) =>
          n.id !== src.id &&
          n.id !== dst.id &&
          n.y + n.height > minY + 12 &&
          n.y < maxY - 12,
      );
      const directX = (src.x + src.width / 2 + dst.x + dst.width / 2) / 2;
      const directBlocked = midTierNodes.some(
        (n) => directX >= n.x - 16 && directX <= n.x + n.width + 16,
      );

      if (goingDown && midTierNodes.length > 0 && directBlocked) {
        // Route cleanly through the nearest open gap corridor between Tier 2 boxes!
        const corridorX = findVerticalCorridorX(dst.x + dst.width / 2, midTierNodes);
        const exitRight = corridorX >= src.x + src.width / 2;
        sx = exitRight ? src.x + src.width : src.x;
        sy = src.y + src.height * 0.68 + portOffsetFrom * 0.25;
        tx = dst.x + dst.width / 2 + portOffsetTo;
        ty = dst.y;
        const midTopY = Math.min(...midTierNodes.map((n) => n.y)) - 16;
        const midBotY = Math.max(...midTierNodes.map((n) => n.y + n.height)) + 26;
        pathD = `M ${sx} ${sy} C ${corridorX} ${sy}, ${corridorX} ${midTopY}, ${corridorX} ${(midTopY + midBotY) / 2} C ${corridorX} ${midBotY}, ${tx} ${midBotY}, ${tx} ${ty}`;
        labelX = (corridorX + tx) / 2;
        labelY = midBotY + 12;
      } else {
        sx = src.x + src.width / 2 + portOffsetFrom;
        sy = goingDown ? src.y + src.height : src.y;
        tx = dst.x + dst.width / 2 + portOffsetTo;
        ty = goingDown ? dst.y : dst.y + dst.height;
        const dy = Math.max(42, Math.abs(ty - sy) * 0.48);
        const c1y = goingDown ? sy + dy : sy - dy;
        const c2y = goingDown ? ty - dy : ty + dy;
        pathD = `M ${sx} ${sy} C ${sx} ${c1y}, ${tx} ${c2y}, ${tx} ${ty}`;
        labelX = cubicPoint(0.5, sx, sx, tx, tx);
        labelY = cubicPoint(0.5, sy, c1y, c2y, ty);
      }
    }
  }

  return {
    id: `hc4-edge-${idx}-${edge.from}-${edge.to}`,
    canonicalId: edge.underlyingEdgeIds[0] ?? null,
    from: edge.from,
    to: edge.to,
    label: edge.label,
    protocol: edge.protocol,
    style: edge.style,
    underlyingEdgeIds: edge.underlyingEdgeIds,
    pathD,
    labelX,
    labelY,
    labelWidth: estimateLabelWidth(edge.label),
    labelHeight: 24,
  };
}

function attachEdgesWithDistributedPorts(
  consolidated: ConsolidatedEdge[],
  nodes: HumanC4Node[],
  orientation: "vertical" | "horizontal",
): HumanC4Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Sort outbound edges by destination coordinate (Y for horizontal, X for vertical)
  // and inbound edges by source coordinate so fan-out ribbons NEVER cross each other!
  const outLists = new Map<string, ConsolidatedEdge[]>();
  const inLists = new Map<string, ConsolidatedEdge[]>();
  for (const e of consolidated) {
    if (!outLists.has(e.from)) outLists.set(e.from, []);
    if (!inLists.has(e.to)) inLists.set(e.to, []);
    outLists.get(e.from)!.push(e);
    inLists.get(e.to)!.push(e);
  }
  const coordOf = (id: string) => {
    const n = nodeMap.get(id);
    if (!n) return 0;
    return orientation === "horizontal" ? n.y + n.height / 2 : n.x + n.width / 2;
  };
  for (const list of outLists.values()) {
    list.sort((a, b) => coordOf(a.to) - coordOf(b.to));
  }
  for (const list of inLists.values()) {
    list.sort((a, b) => coordOf(a.from) - coordOf(b.from));
  }

  const result: HumanC4Edge[] = [];
  consolidated.forEach((edge, idx) => {
    const oList = outLists.get(edge.from) ?? [edge];
    const iList = inLists.get(edge.to) ?? [edge];
    const oi = oList.indexOf(edge);
    const ii = iList.indexOf(edge);
    const oc = oList.length;
    const ic = iList.length;

    const spread = orientation === "vertical" ? 26 : 16;
    const offsetFrom = (oi - (oc - 1) / 2) * spread;
    const offsetTo = (ii - (ic - 1) / 2) * spread;

    const built = buildSmoothEdge(
      edge,
      idx,
      nodeMap,
      nodes,
      orientation,
      offsetFrom,
      offsetTo,
      oc,
    );
    if (built) result.push(built);
  });

  resolveLabelCollisions(result, nodes);
  return result;
}

/**
 * Builds a clean, human-architect C1 System Context diagram grounded directly in
 * the real analyzed project elements & entrypoints.
 */
function buildC1ContextScene(
  model: ArchitecturalModel,
  systemName: string,
  locale: "en" | "vi",
): HumanC4Scene {
  const services = model.elements.filter((e) => e.elementType === "SERVICE_CONTAINER");
  const databases = model.elements.filter((e) => e.elementType === "DATABASE");
  const brokers = model.elements.filter(
    (e) => e.elementType === "MESSAGE_CHANNEL" || e.elementType === "QUEUE_BROKER",
  );
  const persons = model.elements.filter((e) => e.elementType === "PERSON");
  const externals = model.elements.filter((e) => e.elementType === "EXTERNAL_SYSTEM");
  const gateways = model.elements.filter(
    (e) => e.elementType === "API_GATEWAY" || /gateway/i.test(e.name),
  );
  const controllers = model.elements.filter(
    (e) =>
      e.elementType === "COMPONENT" &&
      (/controller|resource|endpoint/i.test(e.name) ||
        e.properties?.["responsibility"] === "Exposes HTTP endpoints"),
  );

  const nodes: HumanC4Node[] = [];
  const rawEdges: ConsolidatedEdge[] = [];

  const canvasCenterX = 520;
  const sysW = 360;
  const sysH = 148;
  const sysY = 230;
  const sysId = `c1:system:${model.projectId}`;

  // Top Row: Explicit Persons or grounded API Consumer actor
  const topActors: HumanC4Node[] = [];
  if (persons.length > 0) {
    persons.forEach((p, idx) => {
      topActors.push({
        id: p.id,
        canonicalId: p.id,
        name: p.name,
        badge: locale === "vi" ? "Tác nhân (Person)" : "Person",
        subtitle: p.description || (locale === "vi" ? "Người dùng hệ thống" : "System user"),
        shape: "person",
        x: 0,
        y: 36,
        width: 230,
        height: 112,
      });
      rawEdges.push({
        from: p.id,
        to: sysId,
        protocol: "SERVICE_HTTP_CALL",
        underlyingEdgeIds: [],
        label: locale === "vi" ? "Gọi API / Tương tác" : "Uses · HTTPS/REST",
        style: "solid",
      });
      void idx;
    });
  } else {
    const entryHint =
      gateways.length > 0
        ? `Gateway: ${gateways.map((g) => g.name).slice(0, 2).join(", ")}`
        : controllers.length > 0
          ? locale === "vi"
            ? `Gọi ${controllers.length} REST Controller đã phát hiện`
            : `Calls ${controllers.length} detected REST Controller(s)`
          : locale === "vi"
            ? `Tương tác với ${services.length} dịch vụ`
            : `Interacts with ${services.length} service(s)`;
    const actorId = "c1:actor:client";
    topActors.push({
      id: actorId,
      canonicalId: gateways[0]?.id ?? services[0]?.id ?? null,
      name: locale === "vi" ? "Người dùng / Client API" : "End User / API Client",
      badge: locale === "vi" ? "Tác nhân gọi vào" : "External Consumer",
      subtitle: entryHint,
      shape: "person",
      x: 0,
      y: 36,
      width: 260,
      height: 112,
    });
    rawEdges.push({
      from: actorId,
      to: sysId,
      protocol: "SERVICE_HTTP_CALL",
      underlyingEdgeIds: [],
      label: "HTTPS / REST API",
      style: "solid",
    });
  }

  // Center actors horizontally
  const actorGap = 44;
  const totalActorsW =
    topActors.reduce((sum, n) => sum + n.width, 0) + Math.max(0, topActors.length - 1) * actorGap;
  let ax = Math.max(48, canvasCenterX - totalActorsW / 2);
  for (const actor of topActors) {
    actor.x = ax;
    ax += actor.width + actorGap;
    nodes.push(actor);
  }

  // Center Row: Software System Box
  const serviceSummary = [
    services.length
      ? `${services.length} ${locale === "vi" ? "Microservices" : "Services"}`
      : null,
    databases.length
      ? `${databases.length} ${locale === "vi" ? "CSDL" : "Databases"}`
      : null,
    brokers.length
      ? `${brokers.length} ${locale === "vi" ? "Broker" : "Broker"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const sysNode: HumanC4Node = {
    id: sysId,
    canonicalId: services[0]?.id ?? null,
    name: systemName,
    badge: locale === "vi" ? "Hệ thống phần mềm (System)" : "Software System",
    subtitle:
      serviceSummary ||
      (locale === "vi" ? "Kiến trúc mã nguồn đang phân tích" : "Analyzed software architecture"),
    metaChips: services.slice(0, 4).map((s) => s.name),
    shape: "system",
    x: canvasCenterX - sysW / 2,
    y: sysY,
    width: sysW,
    height: sysH,
  };
  nodes.push(sysNode);

  // Bottom Row: External Systems + Real Detected Backing Infrastructure (DBs / Message Brokers)
  const bottomNodes: HumanC4Node[] = [];
  for (const ext of externals) {
    bottomNodes.push({
      id: ext.id,
      canonicalId: ext.id,
      name: ext.name,
      badge: locale === "vi" ? "Hệ thống bên ngoài" : "External System",
      subtitle: ext.description || formatHumanTech(ext.technology) || "External API",
      shape: "external",
      x: 0,
      y: 468,
      width: 240,
      height: 108,
    });
    rawEdges.push({
      from: sysId,
      to: ext.id,
      protocol: "SERVICE_HTTP_CALL",
      underlyingEdgeIds: [],
      label: "HTTPS / API",
      style: "solid",
    });
  }
  if (databases.length > 0) {
    const dbGroupId = "c1:infra:databases";
    bottomNodes.push({
      id: dbGroupId,
      canonicalId: databases[0]?.id ?? null,
      name:
        locale === "vi"
          ? `Tầng Cơ sở dữ liệu (${databases.length})`
          : `Data Stores (${databases.length})`,
      badge: "Database Cluster",
      subtitle: databases
        .slice(0, 3)
        .map((d) => d.name)
        .join(", ") + (databases.length > 3 ? ` +${databases.length - 3}` : ""),
      shape: "database",
      x: 0,
      y: 464,
      width: 260,
      height: 118,
    });
    rawEdges.push({
      from: sysId,
      to: dbGroupId,
      protocol: "DATABASE_ACCESS",
      underlyingEdgeIds: [],
      label: locale === "vi" ? "Lưu trữ & Truy vấn (JDBC)" : "Persists data (JDBC)",
      style: "solid",
    });
  }
  if (brokers.length > 0) {
    const brokerGroupId = "c1:infra:brokers";
    bottomNodes.push({
      id: brokerGroupId,
      canonicalId: brokers[0]?.id ?? null,
      name:
        brokers.length === 1
          ? brokers[0]!.name
          : locale === "vi"
            ? `Hạ tầng Hàng đợi (${brokers.length})`
            : `Message Brokers (${brokers.length})`,
      badge: "Async Messaging",
      subtitle: brokers.map((b) => b.name).slice(0, 3).join(", "),
      shape: "broker",
      x: 0,
      y: 468,
      width: 240,
      height: 108,
    });
    rawEdges.push({
      from: sysId,
      to: brokerGroupId,
      protocol: "MESSAGE_PUBLISH",
      underlyingEdgeIds: [],
      label: locale === "vi" ? "Trao đổi sự kiện bất đồng bộ" : "Async Events",
      style: "dashed",
    });
  }

  const botGap = 48;
  const totalBotW =
    bottomNodes.reduce((sum, n) => sum + n.width, 0) + Math.max(0, bottomNodes.length - 1) * botGap;
  const canvasW = Math.max(960, totalActorsW + 120, totalBotW + 120);
  const trueCenterX = canvasW / 2;

  // Re-center all 3 tiers cleanly around trueCenterX
  let rx = trueCenterX - totalActorsW / 2;
  for (const actor of topActors) {
    actor.x = rx;
    rx += actor.width + actorGap;
  }
  sysNode.x = trueCenterX - sysNode.width / 2;
  let bx = trueCenterX - totalBotW / 2;
  for (const bn of bottomNodes) {
    bn.x = bx;
    bx += bn.width + botGap;
    nodes.push(bn);
  }

  const edges = attachEdgesWithDistributedPorts(rawEdges, nodes, "vertical");
  const canvasH = bottomNodes.length > 0 ? 625 : 430;

  return {
    kind: "CONTEXT",
    title: locale === "vi" ? `C1 · Bối cảnh Hệ thống — ${systemName}` : `C1 · System Context — ${systemName}`,
    subtitle:
      locale === "vi"
        ? "Góc nhìn tổng quan ở mức cao nhất: Tác nhân bên ngoài, Hệ thống phần mềm và Hạ tầng lưu trữ/tích hợp."
        : "Highest-level overview showing external consumers, the software system, and backing infrastructure.",
    width: canvasW,
    height: canvasH,
    nodes,
    edges,
  };
}

/**
 * Builds a clean, zero-crossing layered C2 Container diagram:
 * - Tier 0 (above boundary): External Actors / Gateways / Frontends
 * - Tier 1 (upper boundary): Orchestrator microservices (services calling >=2 other services)
 * - Tier 2 (lower boundary): Downstream domain microservices
 * - Tier 3 (bottom): 3D Database Cylinders & Message Brokers aligned directly below their calling services!
 */
function buildC2ContainerScene(
  model: ArchitecturalModel,
  systemName: string,
  locale: "en" | "vi",
): HumanC4Scene {
  const elById = new Map(model.elements.map((e) => [e.id, e]));
  const rootElements = model.elements.filter(
    (e) =>
      !e.parentId &&
      [
        "SERVICE_CONTAINER",
        "DATABASE",
        "MESSAGE_CHANNEL",
        "QUEUE_BROKER",
        "API_GATEWAY",
        "FRONTEND_APP",
        "EXTERNAL_SYSTEM",
        "PERSON",
      ].includes(e.elementType ?? ""),
  );

  // Project all non-deployment edges up to container root level & consolidate duplicates
  const rootIds = new Set(rootElements.map((e) => e.id));
  const liftedRawEdges: Array<{ id: string; from: string; to: string; protocol: string }> = [];
  for (const edge of model.edges) {
    if (isDeploymentEdge(edge)) continue;
    const from = ownerRootId(model, edge.from);
    const to = ownerRootId(model, edge.to);
    if (from === to || !rootIds.has(from) || !rootIds.has(to)) continue;
    liftedRawEdges.push({ id: edge.id, from, to, protocol: edge.protocol });
  }
  const consolidated = consolidateDirectedEdges(liftedRawEdges, elById, locale);

  // Partition into semantic tiers
  const topExternal = rootElements.filter((e) =>
    ["PERSON", "FRONTEND_APP", "API_GATEWAY", "EXTERNAL_SYSTEM"].includes(e.elementType ?? ""),
  );
  const services = rootElements.filter((e) => e.elementType === "SERVICE_CONTAINER");
  const dataStores = rootElements.filter((e) =>
    ["DATABASE", "MESSAGE_CHANNEL", "QUEUE_BROKER"].includes(e.elementType ?? ""),
  );

  // Split services into Orchestrator (Tier 1) vs Domain Downstream (Tier 2)
  // so orchestrator sits centered above downstream services (zero spaghetti horizontal crossing!)
  const serviceIdSet = new Set(services.map((s) => s.id));
  const outServiceDegree = new Map<string, number>();
  const inServiceDegree = new Map<string, number>();
  for (const e of consolidated) {
    if (serviceIdSet.has(e.from) && serviceIdSet.has(e.to)) {
      outServiceDegree.set(e.from, (outServiceDegree.get(e.from) ?? 0) + 1);
      inServiceDegree.set(e.to, (inServiceDegree.get(e.to) ?? 0) + 1);
    }
  }

  let tier1Services: ModelElement[] = [];
  let tier2Services: ModelElement[] = [];
  if (services.length >= 3) {
    const orchestrators = services.filter(
      (s) => (outServiceDegree.get(s.id) ?? 0) >= 2 && (inServiceDegree.get(s.id) ?? 0) === 0,
    );
    const strongCallers =
      orchestrators.length > 0
        ? orchestrators
        : services.filter((s) => (outServiceDegree.get(s.id) ?? 0) >= 2);
    if (strongCallers.length > 0 && strongCallers.length < services.length) {
      const topIds = new Set(strongCallers.map((s) => s.id));
      tier1Services = strongCallers.sort((a, b) => a.name.localeCompare(b.name));
      tier2Services = services
        .filter((s) => !topIds.has(s.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      tier1Services = [...services].sort((a, b) => a.name.localeCompare(b.name));
    }
  } else {
    tier1Services = [...services].sort((a, b) => a.name.localeCompare(b.name));
  }

  const cardW = 228;
  const cardH = 98;
  const dbW = 204;
  const dbH = 104;
  const gapX = 56;
  const boundaryPadX = 48;

  const rowWidth = (count: number, w: number, gap = gapX) =>
    count > 0 ? count * w + (count - 1) * gap : 0;

  const maxInnerW = Math.max(
    520,
    rowWidth(tier1Services.length, cardW),
    rowWidth(tier2Services.length, cardW),
  );
  const maxOuterW = Math.max(
    maxInnerW + boundaryPadX * 2,
    rowWidth(topExternal.length, cardW),
    rowWidth(dataStores.length, dbW, 40),
  );
  const canvasW = Math.max(960, maxOuterW + 96);
  const centerX = canvasW / 2;

  const nodes: HumanC4Node[] = [];
  const componentCountByService = new Map<string, number>();
  for (const el of model.elements) {
    if (el.parentId && el.elementType === "COMPONENT") {
      componentCountByService.set(el.parentId, (componentCountByService.get(el.parentId) ?? 0) + 1);
    }
  }

  let cursorY = 36;

  // Tier 0: Top External / Gateway / Frontend
  if (topExternal.length > 0) {
    const w = rowWidth(topExternal.length, cardW);
    let x = centerX - w / 2;
    for (const el of topExternal) {
      nodes.push({
        id: el.id,
        canonicalId: el.id,
        name: el.name,
        badge:
          el.elementType === "PERSON"
            ? "Person"
            : el.elementType === "API_GATEWAY"
              ? "API Gateway"
              : el.elementType === "FRONTEND_APP"
                ? "Web App"
                : "External System",
        subtitle: formatHumanTech(el.technology) || el.description || "Entry point",
        shape:
          el.elementType === "PERSON"
            ? "person"
            : el.elementType === "EXTERNAL_SYSTEM"
              ? "external"
              : "container",
        x,
        y: cursorY,
        width: cardW,
        height: cardH,
        tier: 0,
        inBoundary: false,
      });
      x += cardW + gapX;
    }
    cursorY += cardH + 74;
  }

  // System Boundary starts here
  const boundaryTopY = cursorY;
  cursorY += 62; // Space for boundary header

  const placeServiceRow = (row: ModelElement[], tier: number) => {
    if (row.length === 0) return;
    const w = rowWidth(row.length, cardW);
    let x = centerX - w / 2;
    for (const svc of row) {
      const compCount = componentCountByService.get(svc.id) ?? 0;
      const tech = formatHumanTech(svc.technology) || "Microservice";
      nodes.push({
        id: svc.id,
        canonicalId: svc.id,
        name: svc.name,
        badge: "Microservice",
        subtitle:
          compCount > 0
            ? `${tech} · ${compCount} ${locale === "vi" ? "thành phần" : "components"}`
            : tech,
        shape: "container",
        x,
        y: cursorY,
        width: cardW,
        height: cardH,
        tier,
        inBoundary: true,
      });
      x += cardW + gapX;
    }
    cursorY += cardH;
  };

  placeServiceRow(tier1Services, 1);
  if (tier2Services.length > 0) {
    cursorY += 86;
    placeServiceRow(tier2Services, 2);
  }

  const boundaryBottomY = cursorY + 38;
  const boundaryW = Math.min(canvasW - 48, maxInnerW + boundaryPadX * 2);
  const boundary: HumanC4Boundary | undefined =
    services.length > 0
      ? {
          id: "c2:system-boundary",
          title: systemName,
          subtitle: locale === "vi" ? "Ranh giới Hệ thống (Software System)" : "Software System Boundary",
          x: centerX - boundaryW / 2,
          y: boundaryTopY,
          width: boundaryW,
          height: boundaryBottomY - boundaryTopY,
        }
      : undefined;

  cursorY = boundaryBottomY + 78;

  // Tier 3: Data Stores & Brokers — Barycenter X-aligned under the exact services calling them!
  if (dataStores.length > 0) {
    const placedById = new Map(nodes.map((n) => [n.id, n]));
    const scoredStores = dataStores.map((ds) => {
      const callers = consolidated
        .filter((e) => e.to === ds.id || e.from === ds.id)
        .map((e) => (e.to === ds.id ? e.from : e.to))
        .map((id) => placedById.get(id))
        .filter((n): n is HumanC4Node => Boolean(n));
      const barycenterX =
        callers.length > 0
          ? callers.reduce((sum, n) => sum + (n.x + n.width / 2), 0) / callers.length
          : centerX;
      return { ds, barycenterX };
    });
    scoredStores.sort((a, b) => a.barycenterX - b.barycenterX || a.ds.name.localeCompare(b.ds.name));

    const dbGap = 40;
    const totalDbW = rowWidth(scoredStores.length, dbW, dbGap);
    let dx = centerX - totalDbW / 2;
    for (const { ds } of scoredStores) {
      const isBroker = ds.elementType === "MESSAGE_CHANNEL" || ds.elementType === "QUEUE_BROKER";
      nodes.push({
        id: ds.id,
        canonicalId: ds.id,
        name: ds.name,
        badge: isBroker ? "Message Broker" : "Database",
        subtitle:
          formatHumanTech(ds.technology) ||
          (isBroker
            ? locale === "vi"
              ? "Hàng đợi bất đồng bộ"
              : "Async Message Queue"
            : locale === "vi"
              ? "Cơ sở dữ liệu"
              : "Relational Data Store"),
        shape: isBroker ? "broker" : "database",
        x: dx,
        y: cursorY,
        width: dbW,
        height: dbH,
        tier: 3,
        inBoundary: false,
      });
      dx += dbW + dbGap;
    }
    cursorY += dbH + 44;
  }

  const edges = attachEdgesWithDistributedPorts(consolidated, nodes, "vertical");

  return {
    kind: "CONTAINER",
    title: locale === "vi" ? `C2 · Sơ đồ Container — ${systemName}` : `C2 · Container Diagram — ${systemName}`,
    subtitle:
      locale === "vi"
        ? "Phân tầng rõ ràng: Service điều phối → Service nghiệp vụ → Cơ sở dữ liệu & Hàng đợi (gộp dây trùng lặp, không đè chữ)."
        : "Layered microservices view: Orchestrators → Domain Services → Databases & Brokers (consolidated clean arrows).",
    width: canvasW,
    height: Math.max(460, cursorY),
    ...(boundary ? { boundary } : {}),
    nodes,
    edges,
  };
}

function classifyComponentLayer(el: ModelElement): {
  col: 0 | 1 | 2;
  shape: HumanNodeShape;
  stereotype: string;
  techHint: string;
} {
  const n = el.name.toLowerCase();
  const resp = String(el.properties?.["responsibility"] ?? "").toLowerCase();

  if (isDeclarativeClientElement(el) || /feign|client|proxy|adapter|gateway/i.test(n)) {
    return {
      col: 2,
      shape: "component-client",
      stereotype: "«Feign Client»",
      techHint: "Outbound HTTP / REST",
    };
  }
  if (/controller|resource|endpoint|handler|listener|consumer|resolver/i.test(n) || resp.includes("http")) {
    return {
      col: 0,
      shape: "component-api",
      stereotype: "«Controller»",
      techHint: "REST API Entry",
    };
  }
  if (/repository|repo|dao|store|publisher|producer|mapper/i.test(n)) {
    return {
      col: 2,
      shape: "component-data",
      stereotype: /publisher|producer/i.test(n) ? "«Publisher»" : "«Repository»",
      techHint: /publisher|producer/i.test(n) ? "Async Event" : "Data Access (JPA)",
    };
  }
  return {
    col: 1,
    shape: "component-service",
    stereotype: "«Service»",
    techHint: "Business Logic",
  };
}

/**
 * Builds a clean 4-column Left-to-Right C3 Component Diagram for a single microservice:
 * Col 0: Inbound Controllers -> Col 1: Domain Services -> Col 2: Repositories & Feign Clients -> Col 3 (Outside): DB & Downstream Microservices
 */
function buildC3ComponentScene(
  model: ArchitecturalModel,
  containerId: string | undefined,
  locale: "en" | "vi",
): HumanC4Scene {
  const elById = new Map(model.elements.map((e) => [e.id, e]));
  const allServices = model.elements.filter((e) => e.elementType === "SERVICE_CONTAINER");
  const focusService =
    (containerId ? elById.get(containerId) : undefined) ?? allServices[0];

  if (!focusService) {
    return {
      kind: "COMPONENT",
      title: locale === "vi" ? "C3 · Sơ đồ Thành phần" : "C3 · Component Diagram",
      subtitle: locale === "vi" ? "Chưa tìm thấy Service nào để phân tích." : "No service available.",
      width: 820,
      height: 320,
      nodes: [],
      edges: [],
    };
  }

  const internalComponents = model.elements.filter(
    (e) => e.parentId === focusService.id && e.elementType !== "CLASS_INTERFACE",
  );
  const internalIds = new Set(internalComponents.map((e) => e.id));

  // Gather all edges involving internal components (plus synthetic FeignClient -> target service links)
  const rawLinks: Array<{ id: string; from: string; to: string; protocol: string }> = [];
  const externalNeighborIds = new Set<string>();

  for (const edge of model.edges) {
    if (isDeploymentEdge(edge)) continue;
    const fromIn = internalIds.has(edge.from);
    const toIn = internalIds.has(edge.to);
    if (!fromIn && !toIn) continue;

    const mappedFrom = fromIn ? edge.from : ownerRootId(model, edge.from);
    const mappedTo = toIn ? edge.to : ownerRootId(model, edge.to);
    if (mappedFrom === mappedTo || mappedFrom === focusService.id || mappedTo === focusService.id) {
      continue;
    }
    rawLinks.push({ id: edge.id, from: mappedFrom, to: mappedTo, protocol: edge.protocol });
    if (!internalIds.has(mappedFrom) && elById.has(mappedFrom)) externalNeighborIds.add(mappedFrom);
    if (!internalIds.has(mappedTo) && elById.has(mappedTo)) externalNeighborIds.add(mappedTo);
  }

  // Ensure FeignClients show their target microservice even if raw edge sat at container level
  for (const comp of internalComponents) {
    if (!isDeclarativeClientElement(comp)) continue;
    const hasOut = rawLinks.some((e) => e.from === comp.id && !internalIds.has(e.to));
    if (hasOut) continue;
    const targetName = extractDeclarativeClientTarget(comp);
    if (!targetName) continue;
    const targetLower = targetName.toLowerCase();
    const targetStem = targetLower.replace(/-service$/, "");
    const match = allServices.find((s) => {
      if (s.id === focusService.id) return false;
      const sl = s.name.toLowerCase();
      return (
        sl === targetLower ||
        sl.endsWith("-" + targetLower) ||
        sl.replace(/-service$/, "") === targetStem ||
        sl.endsWith("-" + targetStem + "-service")
      );
    });
    if (match) {
      rawLinks.push({
        id: `c3:feign:${comp.id}->${match.id}`,
        from: comp.id,
        to: match.id,
        protocol: "SERVICE_HTTP_CALL",
      });
      externalNeighborIds.add(match.id);
    }
  }

  const consolidated = consolidateDirectedEdges(rawLinks, elById, locale);

  // Distribute internal components across 3 semantic columns
  const cols: [ModelElement[], ModelElement[], ModelElement[]] = [[], [], []];
  for (const comp of internalComponents) {
    const info = classifyComponentLayer(comp);
    cols[info.col].push(comp);
  }
  cols.forEach((col) => col.sort((a, b) => a.name.localeCompare(b.name)));

  const cardW = 224;
  const cardH = 82;
  const gapY = 34;
  const colGapX = 128;
  const startX = 48;
  const startY = 82;

  const activeInternalCols = cols.filter((c) => c.length > 0);
  const maxRows = Math.max(1, ...cols.map((c) => c.length), externalNeighborIds.size);
  const totalStackH = maxRows * cardH + (maxRows - 1) * gapY;

  const nodes: HumanC4Node[] = [];
  let currentX = startX;
  let lastInnerRight = startX + cardW;

  for (let c = 0; c < 3; c++) {
    const colItems = cols[c]!;
    if (colItems.length === 0) continue;
    const colH = colItems.length * cardH + (colItems.length - 1) * gapY;
    let y = startY + (totalStackH - colH) / 2;
    for (const comp of colItems) {
      const meta = classifyComponentLayer(comp);
      nodes.push({
        id: comp.id,
        canonicalId: comp.id,
        name: comp.name,
        badge: meta.stereotype,
        subtitle: meta.techHint,
        shape: meta.shape,
        x: currentX,
        y,
        width: cardW,
        height: cardH,
        column: c,
        inBoundary: true,
      });
      y += cardH + gapY;
    }
    lastInnerRight = currentX + cardW;
    currentX += cardW + colGapX;
  }

  const boundary: HumanC4Boundary = {
    id: `c3:boundary:${focusService.id}`,
    title: `${focusService.name} · ${locale === "vi" ? "Thành phần bên trong" : "Internal Components"}`,
    subtitle: formatHumanTech(focusService.technology) || "Microservice Container",
    x: startX - 24,
    y: 28,
    width: Math.max(320, lastInnerRight - startX + 48),
    height: totalStackH + 84,
  };

  // Place External Dependencies (Col 3 outside right of boundary), Y-aligned to their calling adapter!
  const placedInternal = new Map(nodes.map((n) => [n.id, n]));
  const extList = [...externalNeighborIds]
    .map((id) => elById.get(id))
    .filter((e): e is ModelElement => Boolean(e))
    .map((ext) => {
      const callers = consolidated
        .filter((e) => e.to === ext.id || e.from === ext.id)
        .map((e) => (e.to === ext.id ? e.from : e.to))
        .map((id) => placedInternal.get(id))
        .filter((n): n is HumanC4Node => Boolean(n));
      const baryY =
        callers.length > 0
          ? callers.reduce((s, n) => s + (n.y + n.height / 2), 0) / callers.length
          : startY + totalStackH / 2;
      return { ext, baryY };
    })
    .sort((a, b) => a.baryY - b.baryY || a.ext.name.localeCompare(b.ext.name));

  const extX = boundary.x + boundary.width + 156;
  const extW = 220;
  const extH = 92;
  if (extList.length > 0) {
    const extStackH = extList.length * extH + (extList.length - 1) * gapY;
    let ey = startY + (totalStackH - extStackH) / 2;
    for (const { ext } of extList) {
      const isDb = ext.elementType === "DATABASE";
      const isBroker =
        ext.elementType === "MESSAGE_CHANNEL" || ext.elementType === "QUEUE_BROKER";
      nodes.push({
        id: ext.id,
        canonicalId: ext.id,
        name: ext.name,
        badge: isDb ? "Database" : isBroker ? "Message Broker" : "Downstream Service",
        subtitle: formatHumanTech(ext.technology) || (isDb ? "Data Store" : "Microservice"),
        shape: isDb ? "database" : isBroker ? "broker" : "container",
        x: extX,
        y: ey,
        width: extW,
        height: extH,
        column: 3,
        inBoundary: false,
      });
      ey += extH + gapY;
    }
  }

  const edges = attachEdgesWithDistributedPorts(consolidated, nodes, "horizontal");
  const canvasW =
    extList.length > 0
      ? extX + extW + 48
      : Math.max(760, boundary.x + boundary.width + 48 + (activeInternalCols.length === 0 ? 120 : 0));
  const canvasH = Math.max(380, boundary.y + boundary.height + 40);

  return {
    kind: "COMPONENT",
    title:
      locale === "vi"
        ? `C3 · Kiến trúc Thành phần — ${focusService.name}`
        : `C3 · Component Diagram — ${focusService.name}`,
    subtitle:
      locale === "vi"
        ? "Luồng xử lý từ trái sang phải: Controller (API) → Service (Nghiệp vụ) → Repository / Feign Client → CSDL & Service liên quan."
        : "Clean left-to-right layered flow: Controllers → Services → Repositories & Clients → Databases & Downstream Services.",
    width: canvasW,
    height: canvasH,
    boundary,
    nodes,
    edges,
  };
}

export function buildHumanC4Scene(
  model: ArchitecturalModel,
  kind: HumanC4Kind,
  options?: {
    containerId?: string | undefined;
    systemName?: string | undefined;
    locale?: "en" | "vi" | undefined;
  },
): HumanC4Scene {
  const locale = options?.locale ?? "vi";
  const systemName = resolveHumanSystemName(model, options?.systemName, locale);
  if (kind === "CONTEXT") return buildC1ContextScene(model, systemName, locale);
  if (kind === "COMPONENT") return buildC3ComponentScene(model, options?.containerId, locale);
  return buildC2ContainerScene(model, systemName, locale);
}

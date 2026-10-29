import type {
  ArchitecturalModel,
  ArchitectureElement,
  Evidence,
} from "@/types/domain";

export type ArchitectureEdge = ArchitecturalModel["edges"][number];

export const COMMUNICATION_RELATIONSHIPS = [
  "SERVICE_HTTP_CALL",
  "GATEWAY_ROUTE",
  "MESSAGE_PUBLISH",
  "MESSAGE_SUBSCRIBE",
  "DECLARED_COMPOSE",
  "DECLARED_LINK",
  "CONFIGURED_ENDPOINT",
  "CONFIGURATION_DEPENDENCY",
  "SERVICE_DISCOVERY",
  "DATABASE_ACCESS",
  "RUNTIME_OBSERVED",
] as const;

const COMM_SET = new Set<string>(COMMUNICATION_RELATIONSHIPS);

export function isCommunicationEdge(edge: ArchitectureEdge): boolean {
  const rel = (edge as any).relationship ?? edge.protocol ?? (edge as any).relationType;
  return COMM_SET.has(rel);
}

/**
 * Resolves any element (COMPONENT, API_ENDPOINT, SERVICE_CONTAINER, etc.)
 * up the parentId chain to its owning SERVICE_CONTAINER (or top-level container).
 */
export function resolveOwningService(
  model: ArchitecturalModel,
  elementId: string,
): ArchitectureElement | undefined {
  const byId = new Map(model.elements.map((el) => [el.id, el]));
  let current = byId.get(elementId);
  const visited = new Set<string>();

  while (current && current.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.elementType === "SERVICE_CONTAINER") {
      return current;
    }
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export function edgeEvidence(
  model: ArchitecturalModel,
  edge: ArchitectureEdge,
): Evidence[] {
  if (Array.isArray(edge.evidence) && edge.evidence.length > 0) {
    return edge.evidence;
  }
  const ids = new Set(edge.evidenceIds ?? []);
  if ((model as any).evidence && Array.isArray((model as any).evidence)) {
    return (model as any).evidence.filter((item: any) => ids.has(item.id));
  }
  return [];
}

export function nodeCommunications(
  model: ArchitecturalModel,
  elementId: string,
): ArchitectureEdge[] {
  const element = model.elements.find((e) => e.id === elementId);
  const childIds = new Set<string>([elementId]);

  if (element) {
    // Recursively include all child elements (e.g. COMPONENTs inside a SERVICE_CONTAINER)
    let added = true;
    while (added) {
      added = false;
      for (const el of model.elements) {
        if (el.parentId && childIds.has(el.parentId) && !childIds.has(el.id)) {
          childIds.add(el.id);
          added = true;
        }
      }
    }
  }

  return model.edges.filter(
    (edge) =>
      isCommunicationEdge(edge) &&
      (childIds.has(edge.from) || childIds.has(edge.to)),
  );
}

export interface DockerOrInfraItem {
  id: string;
  category: "DOCKER_COMPOSE" | "CONFIG_BINDING" | "PROTOCOL_TECH" | "RUNTIME_OTEL";
  label: string;
  detail: string;
  file?: string | undefined;
  line?: number | undefined;
  snippet?: string | undefined;
}

export interface SideCodeEvidenceItem {
  id: string;
  direction: "OUTBOUND_TO_PEER" | "INBOUND_FROM_PEER" | "CHANNEL_BINDING";
  roleLabel: string; // e.g. "Gọi sang B" or "Đón request từ B"
  componentName: string;
  file: string;
  line?: number | undefined;
  httpMethod?: string | undefined;
  apiPath?: string | undefined;
  technology?: string | undefined;
  snippet?: string | undefined;
}

export interface PeerServiceConnectionGroup {
  pairKey: string;
  /** Subject A (always the service clicked by the user, standing first on the left) */
  subjectId: string;
  subjectName: string;
  subjectType: string;
  /** Connected peer B, C, ... (standing on the right of A ↔ B) */
  peerId: string;
  peerName: string;
  peerType: string;
  /** Summary badges (e.g. HTTP, Feign, Docker, Runtime) */
  protocols: string[];
  edgeCount: number;
  /** "- Docker / Hạ tầng & Công nghệ kết nối" items */
  dockerAndInfraItems: DockerOrInfraItem[];
  /** "+ A:" code evidence items standing inside Subject A */
  subjectCodeItems: SideCodeEvidenceItem[];
  /** "+ B:" code evidence items standing inside Peer B */
  peerCodeItems: SideCodeEvidenceItem[];
  /** Raw edges in this pair */
  edges: ArchitectureEdge[];
}

function asStr(val: unknown): string | undefined {
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined;
}

function asNum(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "" && !Number.isNaN(Number(val))) {
    return Number(val);
  }
  return undefined;
}

// File/line and snippet must describe the same proof, not unrelated metadata.
function sourceSide(props: Record<string, unknown>, prefix: "caller" | "callee", proof: Evidence | undefined, node: ArchitectureElement | undefined) {
  const snippet = asStr(props[prefix + "Snippet"]);
  if (snippet) return { file: asStr(props[prefix + "File"]) ?? "", line: asNum(props[prefix + "Line"]), snippet };
  const proofFile = asStr(proof?.location) ?? asStr((proof as (Evidence & { locator?: unknown }) | undefined)?.locator);
  const proofSnippet = asStr(proof?.snippet);
  if (proofSnippet) return { file: proofFile ?? "", line: undefined, snippet: proofSnippet };
  return { file: asStr(props[prefix + "File"]) ?? proofFile ?? asStr(node?.properties?.["sourceFile"]) ?? "", line: asNum(props[prefix + "Line"]), snippet: undefined };
}

/**
 * Builds the exact hierarchical A ↔ B, A ↔ C groups for a selected node or edge.
 * Subject A ALWAYS stands first on the left.
 */
export function buildPeerConnectionGroups(
  model: ArchitecturalModel,
  selectedId: string,
): PeerServiceConnectionGroup[] {
  const byId = new Map(model.elements.map((el) => [el.id, el]));

  // Check if selectedId is an edge or a node
  const directEdge = model.edges.find((e) => e.id === selectedId);
  let subjectService: ArchitectureElement | undefined;
  let relevantEdges: ArchitectureEdge[] = [];

  if (directEdge) {
    subjectService =
      resolveOwningService(model, directEdge.from) ?? byId.get(directEdge.from);
    const peerService =
      resolveOwningService(model, directEdge.to) ?? byId.get(directEdge.to);
    if (subjectService && peerService) {
      // Include all edges between these two services so Docker + Code both show up
      const allForSubject = nodeCommunications(model, subjectService.id);
      relevantEdges = allForSubject.filter((e) => {
        const sFrom = resolveOwningService(model, e.from) ?? byId.get(e.from);
        const sTo = resolveOwningService(model, e.to) ?? byId.get(e.to);
        return (
          (sFrom?.id === subjectService!.id && sTo?.id === peerService.id) ||
          (sFrom?.id === peerService.id && sTo?.id === subjectService!.id)
        );
      });
      if (relevantEdges.length === 0) {
        relevantEdges = [directEdge];
      }
    }
  } else {
    const clickedNode = byId.get(selectedId);
    if (!clickedNode) return [];
    subjectService = resolveOwningService(model, clickedNode.id) ?? clickedNode;
    relevantEdges = nodeCommunications(model, subjectService.id);
  }

  if (!subjectService) return [];

  // Also Resolve Message Channels (if A -> MESSAGE_PUBLISH -> Channel <- MESSAGE_SUBSCRIBE <- B)
  // so that A <-> B or A <-> Channel is clearly represented.
  const groupsMap = new Map<string, PeerServiceConnectionGroup>();

  for (const edge of relevantEdges) {
    const rawFrom = byId.get(edge.from);
    const rawTo = byId.get(edge.to);
    const ownerFrom = resolveOwningService(model, edge.from) ?? rawFrom;
    const ownerTo = resolveOwningService(model, edge.to) ?? rawTo;
    if (!ownerFrom || !ownerTo) continue;

    // Skip purely internal edges within the exact same service unless the user specifically clicked a child component
    if (ownerFrom.id === subjectService.id && ownerTo.id === subjectService.id) {
      continue;
    }

    const isOutboundFromA = ownerFrom.id === subjectService.id;
    const peer = isOutboundFromA ? ownerTo : ownerFrom;

    let group = groupsMap.get(peer.id);
    if (!group) {
      group = {
        pairKey: `${subjectService.id}<->${peer.id}`,
        subjectId: subjectService.id,
        subjectName: subjectService.name,
        subjectType: subjectService.elementType ?? "SERVICE_CONTAINER",
        peerId: peer.id,
        peerName: peer.name,
        peerType: peer.elementType ?? "SERVICE_CONTAINER",
        protocols: [],
        edgeCount: 0,
        dockerAndInfraItems: [],
        subjectCodeItems: [],
        peerCodeItems: [],
        edges: [],
      };
      groupsMap.set(peer.id, group);
    }

    group.edgeCount += 1;
    group.edges.push(edge);

    const props = (edge.properties ?? {}) as any;
    const evList = edgeEvidence(model, edge);
    const firstEv = evList[0];
    const firstEvLoc = (firstEv as any)?.location ?? (firstEv as any)?.locator ?? "";
    const firstEvSnip = (firstEv as any)?.snippet ?? (firstEv as any)?.excerpt ?? "";

    const relName = (edge as any).relationship ?? edge.protocol;
    const tech =
      asStr(props.technology) ??
      asStr(props.clientFramework) ??
      asStr(props.resolutionKind) ??
      edge.protocol ??
      relName;

    if (tech && !group.protocols.push) {
      // safety
    } else if (tech && !group.protocols.includes(tech)) {
      group.protocols.push(tech);
    }

    // 1. Check if this edge is a Docker / Compose / Config / Infra declaration
    if (
      relName === "DECLARED_COMPOSE" ||
      relName === "DECLARED_LINK" ||
      relName === "CONFIGURED_ENDPOINT" ||
      relName === "CONFIGURATION_DEPENDENCY" ||
      relName === "SERVICE_DISCOVERY"
    ) {
      const isDocker =
        relName === "DECLARED_COMPOSE" ||
        relName === "DECLARED_LINK" ||
        firstEvLoc.toLowerCase().includes("docker-compose") ||
        firstEvSnip.toLowerCase().includes("docker-compose");

      const configKey = asStr(props.configKey) ?? asStr(props.envVar);
      const configVal = asStr(props.configValue) ?? asStr(props.resolvedUrl) ?? asStr(props.targetUrl);

      group.dockerAndInfraItems.push({
        id: `${edge.id}-infra`,
        category: isDocker ? "DOCKER_COMPOSE" : "CONFIG_BINDING",
        label: isDocker
          ? `Docker Compose (${relName === "DECLARED_COMPOSE" ? "depends_on / service link" : "environment link"})`
          : `Connection configuration (${tech})`,
        detail:
          configKey && configVal
            ? `${configKey} = ${configVal}`
            : firstEvSnip
              ? firstEvSnip
              : `${isOutboundFromA ? group.subjectName : group.peerName} → ${isOutboundFromA ? group.peerName : group.subjectName} (${relName})`,
        file: asStr(props.callerFile) ?? (firstEvLoc || undefined),
        line: asNum(props.callerLine),
        snippet: asStr(props.callerSnippet) ?? (firstEvSnip || undefined),
      });
    } else {
      // Also record the transport technology in Docker/Infra summary so "- Docker / Công nghệ..." is always informative
      const isValidated = Boolean((edge as any).Validated || (edge as any).validated || edge.originLayer === "RUNTIME" || edge.originLayer === "STATIC_AND_RUNTIME");
      const techLabel = `${tech}${isValidated ? " (observed in OTel runtime evidence)" : ""}`;
      const existingTech = group.dockerAndInfraItems.some(
        (item) => item.category === "PROTOCOL_TECH" && item.label === techLabel,
      );
      if (!existingTech) {
        group.dockerAndInfraItems.push({
          id: `${edge.id}-tech`,
          category: isValidated ? "RUNTIME_OTEL" : "PROTOCOL_TECH",
          label: techLabel,
          detail:
            asStr(props.configKey) && asStr(props.configValue)
              ? `Binding: ${asStr(props.configKey)} = ${asStr(props.configValue)}`
              : `Connection between ${group.subjectName} and ${group.peerName} using ${tech}`,
          file: asStr(props.configFile),
        });
      }
    }

    // Evidence array order does not identify which service owns a snippet.
    const sourceProofs = evList.filter(item => item.origin !== "preview" && item.sourceType !== "MODEL_METADATA_PREVIEW");
    const callerProof = sourceProofs.find(item => item.communicationRole === "CALL_SITE") ??
      sourceProofs.find(item => item.communicationRole === "CLIENT_CONTRACT") ??
      sourceProofs.find(item => item.communicationRole === "CLIENT_DECLARATION");
    const calleeProof = sourceProofs.find(item => item.communicationRole === "SERVER_ENDPOINT");
    // 2. Extract Caller & Callee code evidence and assign strictly to "+ A:" (subjectCodeItems) and "+ B:" (peerCodeItems)
    const callerComponent =
      asStr(props.callerComponent) ??
      (rawFrom && rawFrom.id !== ownerFrom.id ? rawFrom.name : asStr(props.clientInterface)?.split(".").at(-1) ?? "Caller class not identified");
    const callerSource = sourceSide(props, "caller", callerProof, rawFrom);
    const callerFile = callerSource.file, callerLine = callerSource.line, callerSnippet = callerSource.snippet;

    const calleeController =
      asStr(props.calleeController) ??
      (rawTo && rawTo.id !== ownerTo.id ? rawTo.name : "Target class/endpoint not identified");
    const calleeSource = sourceSide(props, "callee", calleeProof, rawTo);
    const calleeFile = calleeSource.file, calleeLine = calleeSource.line, calleeSnippet = calleeSource.snippet;

    const httpMethod = asStr(props.httpMethod) ?? ( edge.protocol?.startsWith("HTTP") ? "HTTP" : undefined );
    const httpPath =
      asStr(props.httpPath) ??
      asStr(props.calleeRoute) ??
      asStr(props.path) ??
      asStr(props.routePath) ??
      (edge as any).label;
    const calleeRoute = asStr(props.calleeRoute) ?? httpPath;

    // Skip adding empty code entries for pure DECLARED_COMPOSE edges that already sit in dockerAndInfraItems
    if (relName === "DECLARED_COMPOSE" || relName === "DECLARED_LINK") {
      continue;
    }

    if (isOutboundFromA) {
      // A is Caller, B is Callee
      group.subjectCodeItems.push({
        id: `${edge.id}-A-out`,
        direction: "OUTBOUND_TO_PEER",
        roleLabel: `Calls ${group.peerName}`,
        componentName: callerComponent,
        file: callerFile || `(In service ${group.subjectName})`,
        line: callerLine,
        httpMethod,
        apiPath: httpPath,
        technology: tech,
        snippet: callerSnippet,
      });

      group.peerCodeItems.push({
        id: `${edge.id}-B-in`,
        direction: "INBOUND_FROM_PEER",
        roleLabel: `Receives requests from ${group.subjectName}`,
        componentName: calleeController,
        file: calleeFile || `(Endpoint in ${group.peerName})`,
        line: calleeLine,
        httpMethod,
        apiPath: calleeRoute,
        technology: tech,
        snippet: calleeSnippet,
      });
    } else {
      // B is Caller, A is Callee — Still keep A under "+ A:" and B under "+ B:"!
      group.subjectCodeItems.push({
        id: `${edge.id}-A-in`,
        direction: "INBOUND_FROM_PEER",
        roleLabel: `Receives requests from ${group.peerName}`,
        componentName: calleeController,
        file: calleeFile || `(Endpoint in ${group.subjectName})`,
        line: calleeLine,
        httpMethod,
        apiPath: calleeRoute,
        technology: tech,
        snippet: calleeSnippet,
      });

      group.peerCodeItems.push({
        id: `${edge.id}-B-out`,
        direction: "OUTBOUND_TO_PEER",
        roleLabel: `Calls ${group.subjectName}`,
        componentName: callerComponent,
        file: callerFile || `(In service ${group.peerName})`,
        line: callerLine,
        httpMethod,
        apiPath: httpPath,
        technology: tech,
        snippet: callerSnippet,
      });
    }
  }

  return Array.from(groupsMap.values()).sort((a, b) =>
    a.peerName.localeCompare(b.peerName),
  );
}

// Preserve existing helper functions
export function communicationDescription(edge: ArchitectureEdge): string | null {
  const rel = (edge as any).relationship ?? edge.protocol;
  if (rel === "MESSAGE_PUBLISH" || rel === "MESSAGE_SUBSCRIBE")
    return "Messaging source evidence links a publisher or consumer to a channel. It does not prove runtime message delivery or a direct HTTP call between services.";
  if (rel === "DECLARED_COMPOSE" || rel === "DECLARED_LINK")
    return "Docker Compose declares a deployment dependency or link. This alone does not prove HTTP calls, database access or message delivery.";
  if (rel === "SERVICE_HTTP_CALL")
    return "Source declares an HTTP dependency. Inspect saved source/configuration evidence; runtime execution is not established by this declaration.";
  return null;
}

export function communicationTitle(edge: ArchitectureEdge): string {
  const rel = (edge as any).relationship ?? edge.protocol;
  if (edge.properties?.["clientFramework"] === "OPENFEIGN") {
    const method = edge.properties["httpMethod"];
    const path = edge.properties["httpPath"];
    return `Feign · HTTP${typeof method === "string" && method ? ` ${method}` : ""}${typeof path === "string" && path ? ` ${path}` : ""}`;
  }
  if (rel === "MESSAGE_PUBLISH") return "Messaging · publish to channel";
  if (rel === "MESSAGE_SUBSCRIBE") return "Messaging · consume from channel";
  if (rel === "DECLARED_COMPOSE" || rel === "DECLARED_LINK")
    return "Docker Compose · deployment dependency";
  return rel === "SERVICE_HTTP_CALL" ? "Declared HTTP dependency" : rel;
}

export function communicationEvidenceRole(evidence: Evidence): string | null {
  const roles = {
    CLIENT_DECLARATION: "Caller · Feign client declaration",
    CLIENT_CONFIGURATION: "Caller · Feign target configuration",
    CLIENT_CONTRACT: "Caller · HTTP method contract",
    CALL_SITE: "Caller · invocation in source",
    SERVER_ENDPOINT: "Receiver · matching HTTP endpoint",
  };
  return evidence.communicationRole ? roles[evidence.communicationRole] : null;
}

export function feignContract(edge: ArchitectureEdge) {
  if (edge.properties?.["clientFramework"] !== "OPENFEIGN") return null;
  const p = edge.properties;
  const text = (key: string) =>
    typeof p[key] === "string" && p[key] ? String(p[key]) : "Not established";
  return {
    title: communicationTitle(edge),
    sourceService: text("sourceService"),
    targetService: text("targetService"),
    clientInterface: text("clientInterface"),
    clientMethod: text("clientMethod"),
    serverMatch: text("serverMatch"),
    targetSelector: text("targetSelector"),
    callSiteCount: typeof p["callSiteCount"] === "number" ? p["callSiteCount"] : null,
    invocationResolution: text("invocationResolution"),
    limitation:
      "Source evidence describes a declared HTTP contract or call site. It does not prove that a request executed at runtime.",
  };
}

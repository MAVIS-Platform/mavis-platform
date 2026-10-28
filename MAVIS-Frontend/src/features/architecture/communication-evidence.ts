import type { ArchitecturalModel, Evidence } from "@/types/domain";

type Edge = ArchitecturalModel["edges"][number];
export function communicationDescription(edge: Edge): string | null {
  if (edge.protocol === "MESSAGE_PUBLISH" || edge.protocol === "MESSAGE_SUBSCRIBE")
    return "Messaging source evidence links a publisher or consumer to a channel. It does not prove runtime message delivery or a direct HTTP call between services.";
  if (edge.protocol === "DECLARED_COMPOSE" || edge.protocol === "DECLARED_LINK")
    return "Docker Compose declares a deployment dependency or link. This alone does not prove HTTP calls, database access or message delivery.";
  if (edge.protocol === "SERVICE_HTTP_CALL")
    return "Source declares an HTTP dependency. Inspect saved source/configuration evidence; runtime execution is not established by this declaration.";
  return null;
}
export function communicationTitle(edge: Edge): string {
  if (edge.properties?.["clientFramework"] === "OPENFEIGN") {
    const method = edge.properties["httpMethod"];
    const path = edge.properties["httpPath"];
    return `Feign · HTTP${typeof method === "string" && method ? ` ${method}` : ""}${typeof path === "string" && path ? ` ${path}` : ""}`;
  }
  if (edge.protocol === "MESSAGE_PUBLISH") return "Messaging · publish to channel";
  if (edge.protocol === "MESSAGE_SUBSCRIBE") return "Messaging · consume from channel";
  if (edge.protocol === "DECLARED_COMPOSE" || edge.protocol === "DECLARED_LINK")
    return "Docker Compose · deployment dependency";
  return edge.protocol === "SERVICE_HTTP_CALL" ? "Declared HTTP dependency" : edge.protocol;
}
export function nodeCommunications(model: ArchitecturalModel, selectedId: string): Edge[] {
  const owned = new Set([selectedId]);
  const children = new Map<string, string[]>();
  for (const node of model.elements)
    if (node.parentId) {
      const list = children.get(node.parentId) ?? [];
      list.push(node.id);
      children.set(node.parentId, list);
    }
  const pending = [selectedId];
  while (pending.length)
    for (const id of children.get(pending.pop()!) ?? []) {
      if (!owned.has(id)) {
        owned.add(id);
        pending.push(id);
      }
    }
  return model.edges.filter(
    (edge) =>
      [
        "SERVICE_HTTP_CALL",
        "MESSAGE_PUBLISH",
        "MESSAGE_SUBSCRIBE",
        "DECLARED_COMPOSE",
        "DECLARED_LINK",
      ].includes(edge.protocol) && owned.has(edge.from) !== owned.has(edge.to),
  );
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
export function feignContract(edge: Edge) {
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

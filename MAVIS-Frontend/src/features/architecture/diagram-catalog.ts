import type { ArchitecturalModel } from "@/types/domain";
import {
  extractDeclarativeClientTarget,
  isDeclarativeClientElement,
} from "./classifier-semantics";
import { contextProjection, logicalProjection, processProjection } from "./diagram-projections";
import { planArchitectureViews } from "@/lib/architecture/view-planner";
import type { DiagramDocument } from "@/lib/drawio/rules";
export type DiagramFamily = "C4" | "4+1" | "UML";
export type DiagramKind =
  | "CONTEXT"
  | "CONTAINER"
  | "COMPONENT"
  | "LOGICAL"
  | "DEVELOPMENT"
  | "PROCESS"
  | "DEPLOYMENT"
  | "SCENARIOS"
  | "UML_SEQUENCE"
  | "UML_CLASS"
  | "UML_PACKAGE"
  | "UML_DEPLOYMENT"
  | "UML_ACTIVITY"
  | "UML_STATE";
export const diagramKinds: Record<
  DiagramFamily,
  { value: DiagramKind; label: string; description: string }[]
> = {
  C4: [
    {
      value: "CONTAINER",
      label: "Container",
      description: "Services, data stores and their architectural interactions.",
    },
    {
      value: "COMPONENT",
      label: "Component",
      description: "Components inside one service and its direct dependencies.",
    },
  ],
  "4+1": [
    {
      value: "LOGICAL",
      label: "Logical",
      description: "Application abstractions and their structural relationships.",
    },
    {
      value: "DEVELOPMENT",
      label: "Development",
      description: "Source packages and implementation dependencies.",
    },
    {
      value: "PROCESS",
      label: "Process",
      description: "Independent execution units and their declared communication.",
    },
    {
      value: "DEPLOYMENT",
      label: "Physical / Deployment",
      description: "Declared deployment resources and dependencies.",
    },
    {
      value: "SCENARIOS",
      label: "Scenarios (+1)",
      description: "Designed collaboration scenarios or observed runtime interactions.",
    },
  ],
  UML: [
    {
      value: "UML_SEQUENCE",
      label: "Sequence",
      description:
        "Lifeline interactions, activation bars, fragments (alt/opt/loop/par/break/critical), and interaction uses.",
    },
    {
      value: "UML_CLASS",
      label: "Class",
      description:
        "Classifiers, visibility, compartments, overloads, and structural/dependency relationships.",
    },
    {
      value: "UML_PACKAGE",
      label: "Package",
      description:
        "Namespace/package hierarchy, classifier ownership, and package-level dependencies.",
    },
    {
      value: "UML_DEPLOYMENT",
      label: "Deployment",
      description:
        "Deployment nodes, execution environments, artifacts, manifestations, and communication paths.",
    },
    {
      value: "UML_ACTIVITY",
      label: "Activity",
      description:
        "Service-partitioned control/object workflows, actions, decisions/merges, and fork/join nodes.",
    },
    {
      value: "UML_STATE",
      label: "State Machine",
      description:
        "Entity lifecycle states, initial/choice/final pseudostates, and guarded transitions.",
    },
  ],
};
export const canonicalDiagramCatalog = [
  { id: "C4_CONTAINER", family: "C4", kind: "CONTAINER", milestone: "M1", label: "C4 Level 2 · Container" },
  { id: "C4_COMPONENT", family: "C4", kind: "COMPONENT", milestone: "M2", label: "C4 Level 3 · Component" },
  { id: "UML_SEQUENCE", family: "UML", kind: "UML_SEQUENCE", milestone: "M3", label: "UML Sequence Diagram" },
  { id: "UML_CLASS", family: "UML", kind: "UML_CLASS", milestone: "M4", label: "UML Class Diagram" },
  { id: "UML_PACKAGE", family: "UML", kind: "UML_PACKAGE", milestone: "M4", label: "UML Package Diagram" },
  { id: "UML_DEPLOYMENT", family: "UML", kind: "UML_DEPLOYMENT", milestone: "M5", label: "UML Deployment Diagram" },
  { id: "UML_ACTIVITY", family: "UML", kind: "UML_ACTIVITY", milestone: "M6", label: "UML Activity Diagram" },
  { id: "UML_STATE", family: "UML", kind: "UML_STATE", milestone: "M7", label: "UML State Machine Diagram" },
] as const;
export function resolveDiagramKind(value: string | null): DiagramKind {
  if (value === "SCENARIOS") return "UML_SEQUENCE";
  return canonicalDiagramCatalog.find(item => item.kind === value)?.kind ?? "CONTAINER";
}
export function modelDocument(model: ArchitecturalModel): DiagramDocument {
  const nodes: DiagramDocument["layoutJson"]["nodes"] = model.elements.map((node) => {
    const isClient = isDeclarativeClientElement(node);
    const isGrpc = isClient && /grpc/i.test(node.name);
    const defaultClientTech = isGrpc ? "Java / gRPC Client" : "Java / Spring Cloud Feign";
    const resolvedTech = isClient
      ? node.technology && node.technology !== "JAVA_SPRING" && node.technology !== "JAVA"
        ? node.technology
        : defaultClientTech
      : node.technology;
    return {
      id: node.id,
      name: node.name,
      kind: isClient ? "COMPONENT" : (node.elementType ?? "UNKNOWN"),
      parentId: node.parentId,
      languageStack: resolvedTech,
      description:
        node.description ?? (isClient ? "Declarative outbound HTTP/REST client proxy" : null),
      properties: node.properties,
    };
  });
  const edges: DiagramDocument["layoutJson"]["edges"] = model.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.protocol,
    relationType: edge.protocol,
    originLayer: edge.originLayer,
    resolutionStatus: edge.resolutionStatus,
    properties: edge.properties,
  }));

  for (const elem of model.elements) {
    if (!isDeclarativeClientElement(elem)) continue;
    const hasOutboundHttp = edges.some(
      (e) =>
        (e.from === elem.id || e.from === elem.parentId) &&
        (e.type === "SERVICE_HTTP_CALL" || e.relationType === "SERVICE_HTTP_CALL") &&
        e.from === elem.id,
    );
    if (hasOutboundHttp) continue;
    const targetServiceName = extractDeclarativeClientTarget(elem);
    if (!targetServiceName) continue;
    const targetLower = targetServiceName.toLowerCase();
    const targetStem = targetLower.replace(/-service$/, "");
    const candidates = nodes.filter(
      (n) =>
        (n.kind === "SERVICE_CONTAINER" || n.kind === "EXTERNAL_SYSTEM") &&
        n.id !== elem.parentId,
    );
    let targetNode =
      candidates.find((n) => n.name.toLowerCase() === targetLower) ??
      candidates.find((n) => {
        const nl = n.name.toLowerCase();
        return (
          nl.endsWith("-" + targetLower) ||
          targetLower.endsWith("-" + nl) ||
          nl.replace(/-service$/, "") === targetStem ||
          nl.endsWith("-" + targetStem + "-service")
        );
      });
    if (!targetNode) {
      targetNode = {
        id: `external:target:${targetLower}`,
        name: targetServiceName,
        kind: "SERVICE_CONTAINER",
        languageStack: "HTTP / REST API",
        description: `Outbound target service (${targetServiceName})`,
      };
      nodes.push(targetNode);
    }
    const edgeId = `synth:http:${elem.id}->${targetNode.id}`;
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({
        id: edgeId,
        from: elem.id,
        to: targetNode.id,
        type: "SERVICE_HTTP_CALL",
        relationType: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        resolutionStatus: "RESOLVED",
      });
    }
  }

  return {
    modelVersionId: model.id,
    notation: "C4",
    level: "COMPONENT",
    layoutJson: {
      nodes,
      edges,
    },
  };
}
export function selectDiagram(
  model: ArchitecturalModel,
  kind: DiagramKind,
  containerId?: string,
  options?: { systemName?: string | undefined },
): { document: DiagramDocument | null; notice?: string; reason?: string; key: string } {
  const raw = modelDocument(model),
    pack = planArchitectureViews(raw, options);
  const key = `${kind.toLowerCase()}${["COMPONENT", "LOGICAL"].includes(kind) ? ":" + (containerId ?? "") : ""}`;
  function ready(document: DiagramDocument, notice?: string) {
    return {
      key,
      document: {
        ...document,
        viewId: key,
        viewTitle: ["COMPONENT", "LOGICAL"].includes(kind)
          ? `${kind === "COMPONENT" ? "C4 · Component" : "4+1 · Logical"} · ${model.elements.find((n) => n.id === containerId)?.name ?? "Service"}`
          : kind === "CONTAINER"
            ? "C4 · Container"
            : `4+1 · ${diagramKinds["4+1"].find((item) => item.value === kind)?.label ?? kind}`,
      },
      ...(notice ? { notice } : {}),
    };
  }
  if (kind === "CONTAINER") return ready(pack.views.find((v) => v.id === "containers")!.document);
  if (kind === "COMPONENT") {
    const view = pack.views.find((v) => v.id === `components:${containerId}`);
    return view
      ? ready(view.document)
      : {
          key,
          document: null,
          reason:
            "No source components are assigned to this service. Choose another service or inspect its Container view.",
        };
  }
  if (kind === "CONTEXT") return { key, ...contextProjection(model, raw, options) };
  if (kind === "DEVELOPMENT") {
    const groups = new Map<
        string,
        { id: string; name: string; kind: string; underlyingNodeIds: string[] }
      >(),
      membership = new Map<string, string>();
    for (const node of model.elements) {
      const qualified = node.properties?.["qualifiedName"];
      if (typeof qualified !== "string" || !qualified.includes(".") || !node.parentId) continue;
      const name = qualified.slice(0, qualified.lastIndexOf(".")),
        id = `package:${node.parentId}:${name}`;
      if (!groups.has(id)) groups.set(id, { id, name, kind: "PACKAGE", underlyingNodeIds: [] });
      groups.get(id)!.underlyingNodeIds.push(node.id);
      membership.set(node.id, id);
    }
    if (!groups.size)
      return {
        key,
        document: null,
        reason:
          "Source package ownership has not been extracted for this model. Re-analyze with package metadata to generate the Development view.",
      };
    const links = new Map<string, DiagramDocument["layoutJson"]["edges"][number]>();
    for (const edge of model.edges) {
      if (edge.protocol !== "CODE_DEPENDENCY") continue;
      const from = membership.get(edge.from),
        to = membership.get(edge.to);
      if (!from || !to || from === to) continue;
      const token = JSON.stringify([from, to]);
      const previous = links.get(token);
      if (previous) (previous["underlyingEdgeIds"] as string[]).push(edge.id);
      else
        links.set(token, {
          id: edge.id,
          from,
          to,
          type: "CODE_DEPENDENCY",
          underlyingEdgeIds: [edge.id],
        });
    }
    return ready(
      {
        ...raw,
        notation: "VIEW_4_PLUS_1",
        level: "DEVELOPMENT",
        layoutJson: { nodes: [...groups.values()], edges: [...links.values()] },
      },
      "Source packages containing extracted components are shown; build dependencies and unparsed packages are not implied.",
    );
  }
  if (kind === "DEPLOYMENT") {
    const view = pack.views.find((v) => v.id === "deployment");
    return view
      ? ready(
          { ...view.document, notation: "VIEW_4_PLUS_1", level: "DEPLOYMENT" },
          "Scope: declared deployment resources and startup dependencies. Physical host placement is not available in this model.",
        )
      : {
          key,
          document: null,
          reason: "No deployment configuration was extracted for this model.",
        };
  }
  if (kind === "LOGICAL") {
    const view = logicalProjection(model, raw, containerId);
    return view.document ? ready(view.document, view.notice) : { key, ...view };
  }
  if (kind === "PROCESS") {
    const view = processProjection(model, raw);
    return view.document ? ready(view.document, view.notice) : { key, ...view };
  }
  return {
    key,
    document: null,
    reason: "Select an observed runtime scenario linked to this model.",
  };
}
export function diagramMembers(doc: DiagramDocument, id: string, model: ArchitecturalModel) {
  const node = doc.layoutJson.nodes.find((node) => node.id === id),
    edge = doc.layoutJson.edges.find((edge) => edge.id === id);
  const ids =
    node?.["underlyingNodeIds"] ?? edge?.["underlyingEdgeIds"] ?? edge?.["underlyingNodeIds"];
  return Array.isArray(ids)
    ? ids.filter(
        (id): id is string =>
          typeof id === "string" &&
          (model.elements.some((n) => n.id === id) || model.edges.some((e) => e.id === id)),
      )
    : [];
}

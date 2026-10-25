import type { ArchitecturalModel } from "@/types/domain";
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
      value: "CONTEXT",
      label: "System Context",
      description: "The system and its known external dependencies.",
    },
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
      label: "UML Sequence",
      description:
        "Lifeline interactions, activation bars, fragments (alt/opt/loop/par/break/critical), and interaction uses.",
    },
    {
      value: "UML_CLASS",
      label: "UML Class",
      description:
        "Classifiers, visibility, compartments, overloads, and structural/dependency relationships.",
    },
    {
      value: "UML_PACKAGE",
      label: "UML Package",
      description:
        "Namespace/package hierarchy, classifier ownership, and package-level dependencies.",
    },
    {
      value: "UML_DEPLOYMENT",
      label: "UML Deployment",
      description:
        "Deployment nodes, execution environments, artifacts, manifestations, and communication paths.",
    },
    {
      value: "UML_ACTIVITY",
      label: "UML Activity",
      description:
        "Service-partitioned control/object workflows, actions, decisions/merges, and fork/join nodes.",
    },
    {
      value: "UML_STATE",
      label: "UML State Machine",
      description:
        "Entity lifecycle states, initial/choice/final pseudostates, and guarded transitions.",
    },
  ],
};
export const canonicalNineDiagramCatalog = [
  { id: "C4_CONTEXT", family: "C4", kind: "CONTEXT", milestone: "M1", label: "C4 Level 1 · System Context" },
  { id: "C4_CONTAINER", family: "C4", kind: "CONTAINER", milestone: "M1", label: "C4 Level 2 · Container" },
  { id: "C4_COMPONENT", family: "C4", kind: "COMPONENT", milestone: "M2", label: "C4 Level 3 · Component" },
  { id: "UML_SEQUENCE", family: "UML", kind: "UML_SEQUENCE", milestone: "M3", label: "UML Sequence Diagram" },
  { id: "UML_CLASS", family: "UML", kind: "UML_CLASS", milestone: "M4", label: "UML Class Diagram" },
  { id: "UML_PACKAGE", family: "UML", kind: "UML_PACKAGE", milestone: "M4", label: "UML Package Diagram" },
  { id: "UML_DEPLOYMENT", family: "UML", kind: "UML_DEPLOYMENT", milestone: "M5", label: "UML Deployment Diagram" },
  { id: "UML_ACTIVITY", family: "UML", kind: "UML_ACTIVITY", milestone: "M6", label: "UML Activity Diagram" },
  { id: "UML_STATE", family: "UML", kind: "UML_STATE", milestone: "M7", label: "UML State Machine Diagram" },
] as const;
export function modelDocument(model: ArchitecturalModel): DiagramDocument {
  return {
    modelVersionId: model.id,
    notation: "C4",
    level: "COMPONENT",
    layoutJson: {
      nodes: model.elements.map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.elementType ?? "UNKNOWN",
        parentId: node.parentId,
        languageStack: node.technology,
        description: node.description,
        properties: node.properties,
      })),
      edges: model.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        type: edge.protocol,
        relationType: edge.protocol,
        originLayer: edge.originLayer,
        resolutionStatus: edge.resolutionStatus,
        properties: edge.properties,
      })),
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

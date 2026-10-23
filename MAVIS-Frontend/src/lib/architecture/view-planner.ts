import {
  diagramDocument,
  ends,
  kindOf,
  projectDiagram,
  type DiagramDocument,
} from "../drawio/rules";
export const VIEW_POLICY_VERSION = "architecture-views-1";
export type ArchitectureView = {
  id: string;
  title: string;
  purpose: string;
  kind: "overview" | "container" | "component" | "deployment" | "messaging";
  document: DiagramDocument;
};
const deployment = (edge: DiagramDocument["layoutJson"]["edges"][number]) =>
  edge.relationType === "DECLARED_COMPOSE" ||
  edge.type === "DECLARED_COMPOSE" ||
  edge.originLayer === "DEPLOYMENT";
export function planArchitectureViews(raw: unknown) {
  const model = diagramDocument.parse(raw);
  const nodes = model.layoutJson.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots = nodes.filter((node) => kindOf(node) !== "COMPONENT" && !node.parentId);
  const owner = (id: string): string => {
    const seen = new Set<string>();
    while (byId.get(id)?.parentId && !seen.has(id)) {
      seen.add(id);
      id = byId.get(id)!.parentId!;
    }
    return id;
  };
  function document(
    id: string,
    notation: string,
    level: string,
    selectedNodes: typeof nodes,
    edges: typeof model.layoutJson.edges,
  ): DiagramDocument {
    const visible = new Set(
      selectedNodes.flatMap((node) =>
        Array.isArray(node["underlyingNodeIds"])
          ? (node["underlyingNodeIds"] as string[])
          : [node.id],
      ),
    );
    const includedEdges = new Set(
      edges.flatMap((edge) =>
        Array.isArray(edge["underlyingEdgeIds"])
          ? (edge["underlyingEdgeIds"] as string[])
          : [edge.id],
      ),
    );
    return {
      ...model,
      notation,
      level,
      viewId: id,
      policyVersion: VIEW_POLICY_VERSION,
      omittedNodes: nodes.filter((node) => !visible.has(node.id)).length,
      omittedEdges: model.layoutJson.edges.filter((edge) => !includedEdges.has(edge.id)).length,
      projection: {
        includedNodeIds: [...visible],
        includedEdgeIds: [...includedEdges],
        excludedNodes: nodes
          .filter((node) => !visible.has(node.id))
          .map((node) => ({
            id: node.id,
            reason:
              kindOf(node) === "COMPONENT"
                ? "internal-to-container-or-outside-scope"
                : "outside-view-scope",
          })),
        excludedEdges: model.layoutJson.edges
          .filter((edge) => !includedEdges.has(edge.id))
          .map((edge) => ({
            id: edge.id,
            reason: deployment(edge) ? "deployment-view" : "internal-or-outside-view-scope",
          })),
      },
      layoutJson: { nodes: selectedNodes, edges },
    };
  }
  // Container edges are architectural interactions; startup ordering stays in deployment views.
  const aggregated = new Map<string, (typeof model.layoutJson.edges)[number]>();
  for (const edge of model.layoutJson.edges.filter((edge) => !deployment(edge))) {
    const points = ends(edge),
      from = owner(points.from),
      to = owner(points.to);
    if (from === to || !byId.has(from) || !byId.has(to)) continue;
    const type = edge.relationType ?? edge.type ?? "UNKNOWN";
    const key = JSON.stringify([from, to, type, edge.originLayer ?? "UNKNOWN"]);
    const prior = aggregated.get(key);
    if (prior) (prior["underlyingEdgeIds"] as string[]).push(edge.id);
    else
      aggregated.set(key, {
        ...edge,
        id: `view:${edge.id}`,
        from,
        to,
        source: from,
        target: to,
        underlyingEdgeIds: [edge.id],
      });
  }
  const applicationIds = new Set(
    [...aggregated.values()].flatMap((edge) => [ends(edge).from, ends(edge).to]),
  );
  for (const node of nodes) if (node.parentId) applicationIds.add(owner(node.id));
  const applicationRoots = roots.filter((node) => applicationIds.has(node.id));
  const views: ArchitectureView[] = [
    {
      id: "containers",
      title: "Application architecture",
      purpose:
        "Applications, data stores and their source/configuration interactions. Startup ordering is shown separately.",
      kind: "container",
      document: document(
        "containers",
        "C4",
        "CONTAINER",
        applicationRoots.length ? applicationRoots : roots,
        [...aggregated.values()],
      ),
    },
  ];
  const applications = applicationRoots.filter((node) => kindOf(node) === "SERVICE_CONTAINER");
  const channelsInApplication = applicationRoots.filter(
    (node) => kindOf(node) === "MESSAGE_CHANNEL",
  );
  const datastoresInApplication = applicationRoots.filter((node) => kindOf(node) === "DATABASE");
  const groups = [
    {
      id: "group:datastores",
      name: `Application data stores (${datastoresInApplication.length})`,
      kind: "DATASTORE_GROUP",
      members: datastoresInApplication,
    },
    {
      id: "group:applications",
      name: `Application services (${applications.length})`,
      kind: "SERVICE_GROUP",
      members: applications,
    },
    {
      id: "group:channels",
      name: `Message channels (${channelsInApplication.length})`,
      kind: "CHANNEL_GROUP",
      members: channelsInApplication,
    },
  ].filter((group) => group.members.length > 0);
  if (applications.length > 3) {
    const grouped = new Map(
      groups.flatMap((group) => group.members.map((member) => [member.id, group.id] as const)),
    );
    const overviewNodes = [
      ...groups.map((group) => ({
        id: group.id,
        name: group.name,
        kind: group.kind,
        description: group.members
          .map((node) => node.name.replace(/ \[.*\]$/, " "))
          .sort()
          .join("; "),
        underlyingNodeIds: group.members.map((node) => node.id),
      })),
      ...applicationRoots.filter((node) => !grouped.has(node.id)),
    ];
    const overviewEdges = new Map<string, (typeof model.layoutJson.edges)[number]>();
    for (const edge of aggregated.values()) {
      const endpoint = ends(edge),
        from = grouped.get(endpoint.from) ?? endpoint.from,
        to = grouped.get(endpoint.to) ?? endpoint.to;
      if (from === to) continue;
      const key = JSON.stringify([from, to, edge.relationType ?? edge.type, edge.originLayer]);
      const previous = overviewEdges.get(key);
      if (previous)
        (previous["underlyingEdgeIds"] as string[]).push(
          ...(edge["underlyingEdgeIds"] as string[]),
        );
      else
        overviewEdges.set(key, {
          ...edge,
          id: `overview:${edge.id}`,
          from,
          to,
          source: from,
          target: to,
          underlyingEdgeIds: [...(edge["underlyingEdgeIds"] as string[])],
        });
    }
    views.unshift({
      id: "overview",
      title: "Architecture overview",
      purpose:
        "Application services and channels are explicitly grouped for readability. Every group lists its members; use Application architecture and service views for individual relationships.",
      kind: "overview",
      document: document("overview", "ARCHITECTURE_OVERVIEW", "SYSTEM", overviewNodes, [
        ...overviewEdges.values(),
      ]),
    });
  }
  for (const container of roots
    .filter((node) => kindOf(node) === "SERVICE_CONTAINER")
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const children = nodes.filter(
      (node) => node.parentId === container.id && kindOf(node) === "COMPONENT",
    );
    if (!children.length) continue;
    const scoped = projectDiagram({ ...model, notation: "C4", level: "COMPONENT" }, container.id);
    const edges = scoped.layoutJson.edges.filter((edge) => !deployment(edge));
    const ids = new Set([container.id, ...children.map((node) => node.id)]);
    for (const edge of edges) {
      const { from, to } = ends(edge);
      ids.add(from);
      ids.add(to);
    }
    views.push({
      id: `components:${container.id}`,
      title: `${container.name} · Components`,
      purpose:
        "Source-extracted Spring components inside this service, with directly connected dependencies. Component abstraction remains subject to semantic review.",
      kind: "component",
      document: {
        ...document(
          `components:${container.id}`,
          "C4",
          "COMPONENT",
          nodes.filter((node) => ids.has(node.id)),
          edges,
        ),
        scopeContainerId: container.id,
      },
    });
  }
  const messages = model.layoutJson.edges.filter((edge) =>
    ["MESSAGE_PUBLISH", "MESSAGE_SUBSCRIBE"].includes(edge.relationType ?? edge.type ?? ""),
  );
  if (messages.length) {
    const ids = new Set(messages.flatMap((edge) => [ends(edge).from, ends(edge).to]));
    views.push({
      id: "messaging",
      title: "Messaging channels",
      purpose:
        "Declared publishing and handling endpoints. These arrows do not assert delivery or runtime execution order.",
      kind: "messaging",
      document: document(
        "messaging",
        "DEPENDENCY_GRAPH",
        "SERVICE",
        nodes.filter((node) => ids.has(node.id)),
        messages,
      ),
    });
    for (const channel of nodes.filter((node) => kindOf(node) === "MESSAGE_CHANNEL")) {
      const edges = messages.filter(
        (edge) => ends(edge).from === channel.id || ends(edge).to === channel.id,
      );
      if (!edges.length) continue;
      const ids = new Set(edges.flatMap((edge) => [ends(edge).from, ends(edge).to]));
      views.push({
        id: `messaging:${channel.id}`,
        title: `${channel.name} · Endpoints`,
        purpose: "One channel with its declared publishers and handlers.",
        kind: "messaging",
        document: document(
          `messaging:${channel.id}`,
          "DEPENDENCY_GRAPH",
          "SERVICE",
          nodes.filter((node) => ids.has(node.id)),
          edges,
        ),
      });
    }
  }
  const deploymentRoots = roots.filter(
    (node) =>
      kindOf(node) !== "MESSAGE_CHANNEL" &&
      !(
        node["properties"] &&
        typeof node["properties"] === "object" &&
        "resourceRole" in node["properties"] &&
        node["properties"].resourceRole === "LOGICAL_DATASTORE"
      ),
  );
  const declared = model.layoutJson.edges.filter(deployment);
  if (declared.length) {
    views.push({
      id: "deployment",
      title: "Deployment dependencies",
      purpose:
        "Declared startup/configuration dependencies. Arrows do not imply HTTP calls or observed traffic.",
      kind: "deployment",
      document: document("deployment", "DEPENDENCY_GRAPH", "SERVICE", deploymentRoots, declared),
    });
    for (const service of roots.filter((node) => kindOf(node) === "SERVICE_CONTAINER")) {
      const edges = declared.filter((edge) => ends(edge).from === service.id);
      if (!edges.length) continue;
      const ids = new Set([service.id, ...edges.map((edge) => ends(edge).to)]);
      views.push({
        id: `deployment:${service.id}`,
        title: `${service.name} · Deployment`,
        purpose:
          "Startup dependencies of one service; the complete deployment view remains available.",
        kind: "deployment",
        document: document(
          `deployment:${service.id}`,
          "DEPENDENCY_GRAPH",
          "SERVICE",
          roots.filter((node) => ids.has(node.id)),
          edges,
        ),
      });
    }
  }
  for (const view of views) view.document["viewTitle"] = view.title;
  const findings = nodes
    .filter(
      (node) =>
        node["status"] === "UNCERTAIN_MAPPING" ||
        (node["properties"] &&
          typeof node["properties"] === "object" &&
          "resolutionIssue" in node["properties"]),
    )
    .map((node) => ({
      code:
        node["properties"] &&
        typeof node["properties"] === "object" &&
        "resolutionIssue" in node["properties"]
          ? String(node["properties"].resolutionIssue)
          : "UNCERTAIN_ELEMENT",
      elementId: node.id,
      name: node.name,
    }));
  const legacyEdges = model.layoutJson.edges.filter(
    (edge) => edge["resolutionStatus"] !== "RESOLVED",
  ).length;
  return {
    modelId: model.modelVersionId,
    policyVersion: VIEW_POLICY_VERSION,
    status: "requires-review" as const,
    coverage: {
      elements: nodes.length,
      missingTechnology: nodes.filter((node) => !node.languageStack).length,
      missingResponsibility: nodes.filter((node) => !node.description).length,
      relationships: model.layoutJson.edges.length,
      unresolvedElements: findings.length,
      relationshipsWithoutResolutionMetadata: legacyEdges,
    },
    findings,
    limitations: [
      "Static extraction is not proof of runtime traffic.",
      "Component grouping and messaging coverage require validation against a source-backed reference manifest.",
    ],
    views,
  };
}

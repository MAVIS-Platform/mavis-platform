import {
  diagramDocument,
  ends,
  kindOf,
  projectDiagram,
  type DiagramDocument,
} from "../drawio/rules";
export const VIEW_POLICY_VERSION = "architecture-views-2";
export type ArchitectureView = {
  id: string;
  title: string;
  purpose: string;
  kind: "overview" | "container" | "component" | "deployment" | "messaging";
  document: DiagramDocument;
};
// S2d system-scope classification for the C4 Container view. Membership reuses existing node
// metadata only (elementType + properties.resourceRole) — never layout position, name patterns
// or connections. Unresolved ownership stays outside the boundary with an explicit warning.
// This classification is MAVISS projection policy based on the verified model contract — it is
// NOT a universal C4 rule that every SERVICE_CONTAINER/MESSAGE_CHANNEL belongs to one system.
const SYSTEM_BOUNDARY_ID = "system:boundary";
const insideSystemScope = (node: DiagramDocument["layoutJson"]["nodes"][number]) => {
  const kind = kindOf(node);
  if (kind === "SERVICE_CONTAINER" || kind === "MESSAGE_CHANNEL") return true;
  const role =
    node["properties"] && typeof node["properties"] === "object"
      ? (node["properties"] as Record<string, unknown>)["resourceRole"]
      : undefined;
  return kind === "DATABASE" && role === "LOGICAL_DATASTORE";
};
const outsideAsExternal = (node: DiagramDocument["layoutJson"]["nodes"][number]) =>
  ["EXTERNAL_SYSTEM", "PERSON"].includes(kindOf(node));
const deployment = (edge: DiagramDocument["layoutJson"]["edges"][number]) =>
  edge.relationType === "DECLARED_COMPOSE" || edge.relationType === "DECLARED_LINK" ||
  edge.type === "DECLARED_COMPOSE" || edge.type === "DECLARED_LINK" ||
  edge.originLayer === "DEPLOYMENT";
export function planArchitectureViews(
  raw: unknown,
  options?: { systemName?: string | undefined },
) {
  const model = diagramDocument.parse(raw);
  const nodes = model.layoutJson.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots = nodes.filter((node) => !node.parentId);
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
    // S2d review: includedNodeIds must contain source element IDs only. Synthetic view-local
    // nodes (the system boundary) stay in the layout but are listed in syntheticNodeIds instead.
    const visible = new Set(
      selectedNodes
        .filter((node) => node["viewLocal"] !== true)
        .flatMap((node) =>
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
  function mergeOriginLayer(a?: string, b?: string): string | undefined {
    if (a === "STATIC_AND_RUNTIME" || b === "STATIC_AND_RUNTIME") return "STATIC_AND_RUNTIME";
    const isRuntime = (v?: string) => v === "RUNTIME";
    const isStatic = (v?: string) => v === "STATIC" || v === "CONFIG";
    if ((isRuntime(a) && isStatic(b)) || (isStatic(a) && isRuntime(b))) {
      return "STATIC_AND_RUNTIME";
    }
    return isRuntime(a) || isRuntime(b) ? "RUNTIME" : (a ?? b);
  }
  // Container edges are architectural interactions; startup ordering stays in deployment views.
  const aggregated = new Map<string, (typeof model.layoutJson.edges)[number]>();
  for (const edge of model.layoutJson.edges.filter((edge) => !deployment(edge))) {
    const points = ends(edge),
      from = owner(points.from),
      to = owner(points.to);
    if (from === to || !byId.has(from) || !byId.has(to)) continue;
    const type = edge.relationType ?? edge.type ?? "UNKNOWN";
    const key = JSON.stringify([from, to, type, edge["properties"] && typeof edge["properties"] === "object" ? (edge["properties"] as Record<string, unknown>)["profile"] ?? null : null]);
    const prior = aggregated.get(key);
    if (prior) {
      (prior["underlyingEdgeIds"] as string[]).push(edge.id);
      const mergedOrigin = mergeOriginLayer(prior.originLayer, edge.originLayer);
      if (mergedOrigin) prior.originLayer = mergedOrigin;
    } else
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
  // S2d: C4 Container system boundary. Internal containers sit inside a named system boundary;
  // external systems/persons stay outside; ownership that the model does not establish is left
  // outside with an explicit warning instead of a boundary that would assert fake membership.
  // Recognition is independent of connectivity: isolated infrastructure is still
  // a container. Unparented module COMPONENTs (e.g., standalone C# projects) with
  // architectural container edges are also kept as unresolved container roots.
  const architecturalRootIds = new Set(
    [...aggregated.values()]
      .filter((edge) => {
        const edgeType = String(edge.relationType ?? edge.type ?? "").toUpperCase();
        return edgeType !== "CODE_DEPENDENCY" && edgeType !== "DEPENDS_ON";
      })
      .flatMap((edge) => [ends(edge).from, ends(edge).to]),
  );
  const knownContainers = roots.filter(
    (node) =>
      ["SERVICE_CONTAINER", "DATABASE", "QUEUE_BROKER", "MESSAGE_CHANNEL", "EXTERNAL_SYSTEM", "PERSON"].includes(
        kindOf(node),
      ) ||
      (kindOf(node) === "COMPONENT" && architecturalRootIds.has(node.id)),
  );
  const containerSelection = knownContainers.length ? knownContainers : applicationRoots.length ? applicationRoots : roots;
  const insideNodes = containerSelection.filter(insideSystemScope);
  const externalNodes = containerSelection.filter(outsideAsExternal);
  const unresolvedNodes = containerSelection.filter(
    (node) => !insideSystemScope(node) && !outsideAsExternal(node),
  );
  const boundaryName = options?.systemName?.trim() || "Analyzed system";
  const containerNodes = insideNodes.length
    ? [
        ...insideNodes.map((node) => ({ ...node, parentId: SYSTEM_BOUNDARY_ID })),
        {
          id: SYSTEM_BOUNDARY_ID,
          name: boundaryName,
          kind: "SYSTEM_BOUNDARY",
          description: "Software system · analyzed source scope",
          viewLocal: true,
        },
        ...externalNodes,
        ...unresolvedNodes,
      ]
    : containerSelection;
  // Legend carries a summarized list; the full name list stays traceable in
  // systemBoundary.unresolvedIds and in the pack limitations.
  const summarizedNames = unresolvedNodes
    .slice(0, 3)
    .map((node) => node.name)
    .join(", ");
  const remaining = unresolvedNodes.length - Math.min(3, unresolvedNodes.length);
  const scopeWarning = !insideNodes.length
    ? "System scope could not be determined for this model; no system boundary is drawn."
    : unresolvedNodes.length
      ? `Ownership unresolved for ${unresolvedNodes.length} element(s) left outside the system boundary: ${summarizedNames}${remaining > 0 ? ` (+${remaining} more; full list in view metadata)` : ""}.`
      : undefined;
  const scopeWarningDetail = unresolvedNodes.length
    ? `Ownership unresolved for ${unresolvedNodes.length} element(s) left outside the system boundary: ${unresolvedNodes
        .map((node) => node.name)
        .join(", ")}.`
    : undefined;
  const views: ArchitectureView[] = [
    {
      id: "containers",
      title: "Application architecture",
      purpose:
        "Applications, data stores and their source/configuration interactions. Startup ordering is shown separately.",
      kind: "container",
      document: (() => {
        const containerNodeIds = new Set(containerNodes.map((n) => n.id));
        const validEdges = [...aggregated.values()].filter((edge) => {
          const { from, to } = ends(edge);
          return containerNodeIds.has(from) && containerNodeIds.has(to);
        });
        const doc = document(
          "containers",
          "C4",
          "CONTAINER",
          containerNodes,
          validEdges,
        );
        if (scopeWarning) doc["scopeWarning"] = scopeWarning;
        if (insideNodes.length) {
          doc["syntheticNodeIds"] = [SYSTEM_BOUNDARY_ID];
          doc["systemBoundary"] = {
            id: SYSTEM_BOUNDARY_ID,
            name: boundaryName,
            scope: "Software system · analyzed source scope",
            memberIds: insideNodes.map((node) => node.id),
            unresolvedIds: unresolvedNodes.map((node) => node.id),
          };
        }
        return doc;
      })(),
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
      const key = JSON.stringify([from, to, edge.relationType ?? edge.type]);
      const previous = overviewEdges.get(key);
      if (previous) {
        (previous["underlyingEdgeIds"] as string[]).push(
          ...(edge["underlyingEdgeIds"] as string[]),
        );
        const mergedOrigin = mergeOriginLayer(previous.originLayer, edge.originLayer);
        if (mergedOrigin) previous.originLayer = mergedOrigin;
      } else
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
      ...(scopeWarningDetail ? [scopeWarningDetail] : []),
    ],
    views,
  };
}

const CANONICAL_SERVICE_ORDER = [
  "api-gateway",
  "identity-service",
  "catalog-service",
  "order-service",
  "notification-service",
  "service-discovery",
];

/**
 * Builds a single grouped C3 Component overview containing all populated
 * microservices as boundary containers and their internal + cross-service component
 * interactions (synchronous Feign/HTTP & asynchronous Kafka messaging).
 */
export function buildAllServicesComponentDocument(raw: unknown): DiagramDocument | null {
  const model = diagramDocument.parse(raw);
  const nodes = model.layoutJson.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const populatedContainers = nodes
    .filter((node) => kindOf(node) === "SERVICE_CONTAINER")
    .filter((container) =>
      nodes.some((child) => child.parentId === container.id && kindOf(child) === "COMPONENT"),
    )
    .sort((a, b) => {
      const ia = CANONICAL_SERVICE_ORDER.indexOf(a.name);
      const ib = CANONICAL_SERVICE_ORDER.indexOf(b.name);
      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }
      return a.name.localeCompare(b.name);
    });

  if (populatedContainers.length === 0) return null;

  const selectedIds = new Set<string>();
  const componentIds = new Set<string>();
  const MAX_NODES = 90;

  for (const container of populatedContainers) {
    if (selectedIds.size >= MAX_NODES) break;
    const children = nodes
      .filter((child) => child.parentId === container.id && kindOf(child) === "COMPONENT")
      .sort((a, b) => a.name.localeCompare(b.name));
    if (selectedIds.size + 1 + children.length > MAX_NODES && selectedIds.size > 0) {
      continue;
    }
    selectedIds.add(container.id);
    for (const child of children) {
      if (selectedIds.size >= MAX_NODES) break;
      selectedIds.add(child.id);
      componentIds.add(child.id);
    }
  }

  const candidateEdges = model.layoutJson.edges
    .filter((edge) => !deployment(edge))
    .filter((edge) => {
      const { from, to } = ends(edge);
      const fromEl = byId.get(from);
      const toEl = byId.get(to);
      if (!fromEl || !toEl) return false;
      const fromIsComp = componentIds.has(from);
      const toIsComp = componentIds.has(to);
      if (fromIsComp && toIsComp) return true;
      const fromIsChannel = ["MESSAGE_CHANNEL", "QUEUE_BROKER"].includes(kindOf(fromEl));
      const toIsChannel = ["MESSAGE_CHANNEL", "QUEUE_BROKER"].includes(kindOf(toEl));
      return (fromIsComp && toIsChannel) || (fromIsChannel && toIsComp);
    })
    .slice(0, 180);

  for (const edge of candidateEdges) {
    const { from, to } = ends(edge);
    if (byId.has(from)) selectedIds.add(from);
    if (byId.has(to)) selectedIds.add(to);
  }

  const selectedNodes = nodes.filter((node) => selectedIds.has(node.id));
  const includedEdges = new Set(candidateEdges.map((edge) => edge.id));

  return {
    ...model,
    notation: "C4",
    level: "COMPONENT",
    viewId: "components:all",
    viewTitle: "C4 · Component · All Services",
    policyVersion: VIEW_POLICY_VERSION,
    omittedNodes: nodes.filter((node) => !selectedIds.has(node.id)).length,
    omittedEdges: model.layoutJson.edges.filter((edge) => !includedEdges.has(edge.id)).length,
    projection: {
      includedNodeIds: [...selectedIds],
      includedEdgeIds: [...includedEdges],
      excludedNodes: nodes
        .filter((node) => !selectedIds.has(node.id))
        .map((node) => ({ id: node.id, reason: "outside-view-scope" })),
      excludedEdges: model.layoutJson.edges
        .filter((edge) => !includedEdges.has(edge.id))
        .map((edge) => ({ id: edge.id, reason: "outside-view-scope" })),
    },
    layoutJson: {
      nodes: selectedNodes,
      edges: candidateEdges,
    },
  };
}

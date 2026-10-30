import { resolveReceiver, resolveCalledMethods } from "./source-call-resolution";
import type { ArchitecturalModel } from "@/types/domain";
import type {
  UmlActivityDiagramProjection,
  UmlActivityOperationOption,
  UmlActivityNode,
  UmlActivityEdge,
} from "./uml-diagrams";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : [];
function cfgFor(model: ArchitecturalModel, operation: UmlActivityOperationOption) {
  const owner = model.elements.find((node) => node.id === operation.classifierId);
  return rows(record(owner?.properties?.["umlClassifier"])["methodsCfg"]).find(
    (cfg) =>
      String(cfg["signatureKey"] ?? cfg["signature"] ?? cfg["methodName"]) ===
      operation.signatureKey,
  );
}
export function isActivityWorkflowEntry(
  model: ArchitecturalModel,
  operation: UmlActivityOperationOption,
): boolean {
  if (operation.operationId.startsWith("flow:")) return false;
  const cfg = cfgFor(model, operation);
  if (!cfg || !rows(cfg["nodes"]).length) return false;
  const owner = model.elements.find((node) => node.id === operation.classifierId);
  const metadata = record(owner?.properties?.["umlClassifier"]);
  const annotations = Array.isArray(metadata["annotations"])
    ? metadata["annotations"].map(String)
    : [];
  return (
    (Array.isArray(cfg["endpointDeclarations"]) && cfg["endpointDeclarations"].length > 0) ||
    annotations.some((annotation) =>
      /(^|\.)(Service|RestController|Controller)$/.test(
        annotation.replace(/^@/, "").split("(")[0] ?? "",
      ),
    ) ||
    /(?:Service|CommandHandler|EventHandler|Consumer)$/.test(operation.classifierName)
  );
}

// Inline only an unambiguous source call with an available, valid callee CFG.
// The caller's guards and edges remain intact; graph dependencies never create steps.
export function expandSourceActivityWorkflow(
  model: ArchitecturalModel,
  entry: UmlActivityOperationOption,
  root: UmlActivityDiagramProjection,
  projectMethod: (id: string) => UmlActivityDiagramProjection,
): UmlActivityDiagramProjection {
  const byId = new Map(model.elements.map((node) => [node.id, node]));
  const partitions = new Map<string, UmlActivityDiagramProjection["partitions"][number]>();
  const limits = new Set(root.unsupportedConstructs);
  const warnings = new Set<string>();
  const lane = (ownerId: string) => {
    const owner = byId.get(ownerId)!;
    const service = owner.parentId ? byId.get(owner.parentId) : undefined;
    const id = "partition:classifier:" + ownerId;
    if (!partitions.has(id))
      partitions.set(id, {
        partitionId: id,
        name: `${service?.name ?? "Unassigned service"} · ${owner.name}`,
        serviceId: service?.elementType === "SERVICE_CONTAINER" ? service.id : null,
      });
    return partitions.get(id)!;
  };
  let expandedCalls = 0;
  function expand(
    operation: UmlActivityOperationOption,
    projection: UmlActivityDiagramProjection,
    prefix: string,
    stack: Set<string>,
    depth: number,
  ): { nodes: UmlActivityNode[]; edges: UmlActivityEdge[] } {
    const part = lane(operation.classifierId);
    const cfg = cfgFor(model, operation);
    const rawNodes = rows(cfg?.["nodes"]);
    const calls = rows(cfg?.["calls"]);
    if (calls.length && !rawNodes.some((node) => typeof node["line"] === "number"))
      warnings.add(
        "Call-to-action source lines are unavailable; analyze the snapshot again for method expansion.",
      );
    const nodes = projection.nodes.map((node) => ({
      ...node,
      nodeId: prefix + node.nodeId,
      partitionId: part.partitionId,
      partitionName: part.name,
    }));
    let edges = projection.edges.map((edge) => ({
      ...edge,
      edgeId: prefix + edge.edgeId,
      from: prefix + edge.from,
      to: prefix + edge.to,
    }));
    const nextStack = new Set(stack).add(operation.operationId);
    for (const source of projection.nodes) {
      if (source.kind !== "ACTION") continue;
      const raw = rawNodes.find((node) => String(node["nodeId"] ?? node["id"]) === source.nodeId);
      const matching = calls.filter(
        (call) =>
          Number.isFinite(Number(raw?.["line"])) &&
          Number(call["line"]) === Number(raw?.["line"]) &&
          source.label.includes(String(call["methodName"]) + "("),
      );
      if (!matching.length) continue;
      if (matching.length !== 1 || /=>|->|\btry\s*\{/.test(source.label)) {
        warnings.add("Nested, lambda or multiple calls in one action were not expanded.");
        continue;
      }
      const call = matching[0]!;
      const receiverType = String(call["receiverType"] ?? "");
      const owner = byId.get(operation.classifierId)!;
      const targets = resolveReceiver(model, owner, receiverType);
      if (targets.length !== 1) {
        warnings.add(`Unresolved or ambiguous receiver: ${receiverType || "unknown"}.`);
        continue;
      }
      let target = targets[0]!;
      let targetMethods = resolveCalledMethods(rows(record(target.properties?.["umlClassifier"])["methodsCfg"]), call);
      if (!targetMethods.length && typeof target.properties?.["targetService"] === "string") {
        const members = resolveCalledMethods(rows(record(target.properties?.["umlClassifier"])["members"]), call);
        const mappings =
          members.length === 1 && Array.isArray(members[0]!["endpointDeclarations"])
            ? (members[0]!["endpointDeclarations"] as unknown[]).map(String)
            : [];
        const services = model.elements.filter(
          (node) =>
            node.elementType === "SERVICE_CONTAINER" &&
            node.name.toLowerCase() === String(target.properties!["targetService"]).toLowerCase(),
        );
        const remotes =
          services.length === 1
            ? model.elements
                .filter((node) => node.parentId === services[0]!.id)
                .flatMap((node) =>
                  rows(record(node.properties?.["umlClassifier"])["methodsCfg"])
                    .filter(
                      (method) =>
                        Array.isArray(method["endpointDeclarations"]) &&
                        (method["endpointDeclarations"] as unknown[]).some((endpoint) =>
                          mappings.includes(String(endpoint)),
                        ),
                    )
                    .map((method) => ({ node, method })),
                )
            : [];
        if (remotes.length === 1) {
          target = remotes[0]!.node;
          targetMethods = [remotes[0]!.method];
        } else
          warnings.add(
            `No unique exact remote endpoint for ${target.name}.${String(call["methodName"])}.`,
          );
      }
      if (targetMethods.length !== 1) {
        warnings.add(`No unique method body CFG for ${target.name}.${String(call["methodName"])}.`);
        continue;
      }
      const targetCfg = targetMethods[0]!;
      const signature = String(
        targetCfg["signatureKey"] ?? targetCfg["signature"] ?? targetCfg["methodName"],
      );
      const targetId = target.id + "::" + signature;
      if (depth >= 4 || expandedCalls >= 24 || nextStack.has(targetId)) {
        warnings.add("Recursive or large call expansion stopped at the source workflow limit.");
        continue;
      }
      const child = projectMethod(targetId);
      const initials = child.nodes.filter((node) => node.kind === "INITIAL");
      const finals = child.nodes.filter((node) => node.kind === "ACTIVITY_FINAL");
      if (
        child.selectedOperationId !== targetId ||
        initials.length !== 1 ||
        !finals.length ||
        child.nodes.some((node) => node.kind === "FLOW_FINAL") ||
        child.validationIssues.some((issue) => issue.severity === "ERROR")
      ) {
        warnings.add(
          `Callee control flow is incomplete or has unsupported termination: ${target.name}.${String(call["methodName"])}.`,
        );
        continue;
      }
      if (child.extractionCompleteness === "PARTIAL")
        warnings.add(`Partial callee CFG: ${target.name}.${String(call["methodName"])}.`);
      for (const limit of child.unsupportedConstructs) limits.add(limit);
      expandedCalls++;
      const childPrefix = prefix + source.nodeId + ":call:";
      const childOperation: UmlActivityOperationOption = {
        ...operation,
        operationId: targetId,
        classifierId: target.id,
        classifierName: target.name,
        signatureKey: signature,
        methodName: String(targetCfg["methodName"]),
      };
      const expanded = expand(childOperation, child, childPrefix, nextStack, depth + 1);
      const childStarts = new Set(initials.map((node) => childPrefix + node.nodeId));
      const childEnds = new Set(finals.map((node) => childPrefix + node.nodeId));
      nodes.push(
        ...expanded.nodes.map((node) =>
          childStarts.has(node.nodeId)
            ? {
                ...node,
                kind: "ACTION" as const,
                label: `Enter ${target.name}.${String(call["methodName"])}`,
              }
            : childEnds.has(node.nodeId)
              ? {
                  ...node,
                  kind: "ACTION" as const,
                  label: `Return from ${target.name}.${String(call["methodName"])}`,
                }
              : node,
        ),
      );
      const callerId = prefix + source.nodeId;
      const continuations = edges.filter((edge) => edge.from === callerId);
      edges = edges.filter((edge) => edge.from !== callerId);
      edges.push(...expanded.edges, {
        edgeId: childPrefix + "enter",
        from: callerId,
        to: childPrefix + initials[0]!.nodeId,
        flowKind: "CONTROL_FLOW",
        guard: null,
        provenance: "EXTRACTED",
      });
      for (const end of childEnds)
        for (const continuation of continuations)
          edges.push({
            ...continuation,
            edgeId: childPrefix + end + ":" + continuation.edgeId,
            from: end,
          });
    }
    return { nodes, edges };
  }
  const expanded = expand(entry, root, "", new Set(), 0);
  for (const warning of warnings) limits.add(warning);
  return {
    ...root,
    ...expanded,
    partitions: [...partitions.values()],
    extractionCompleteness:
      warnings.size || root.extractionCompleteness === "PARTIAL"
        ? "PARTIAL"
        : root.extractionCompleteness,
    unsupportedConstructs: [...limits],
    validationIssues: [
      ...root.validationIssues,
      {
        code: "SOURCE_CALL_WORKFLOW",
        severity: "INFO",
        message: `Source CFG with ${expandedCalls} uniquely resolved method call(s) expanded. Lanes represent classifier responsibility, not observed execution or a complete distributed business process.`,
      },
      ...[...warnings].map((message) => ({
        code: "SOURCE_WORKFLOW_PARTIAL",
        severity: "WARNING" as const,
        message,
      })),
    ],
  };
}

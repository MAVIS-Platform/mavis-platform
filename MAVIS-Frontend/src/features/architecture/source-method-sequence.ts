import { resolveReceiver, resolveCalledMethods } from "./source-call-resolution";
import type { ArchitecturalModel } from "@/types/domain";
import type {
  DetectedSequenceFlow,
  InteractionDocument,
  SequenceMessage,
  SequenceParticipant,
  CombinedFragment,
} from "./scenario-design";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : [];
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
function methods(node: ArchitecturalModel["elements"][number]) {
  return rows(record(node.properties?.["umlClassifier"])["methodsCfg"]);
}
export function sourceMethodFlows(
  model: ArchitecturalModel,
  level?: string,
  serviceId?: string | null,
): DetectedSequenceFlow[] {
  return model.elements.flatMap((node) => {
    if (serviceId && node.parentId !== serviceId) return [];
    const service = model.elements.find((item) => item.id === node.parentId);
    return methods(node)
      .filter(
        (method) =>
          strings(method["endpointDeclarations"]).length > 0 && rows(method["calls"]).length > 0,
      )
      .map((method) => ({
        flowId: "method:" + node.id + ":" + String(method["signature"]),
        viewId: "scenarios:source-method:" + node.id + ":" + String(method["signature"]),
        title: ("Source endpoint · " + node.name + "." + String(method["methodName"])).slice(
          0,
          120,
        ),
        description:
          [
            service?.name,
            node.name + "." + String(method["methodName"]),
            ...strings(method["endpointDeclarations"]),
          ]
            .filter(Boolean)
            .join(" · ") +
          ". Source method calls in lexical evaluation order. Only uniquely resolved receiver types and exact Feign endpoint matches are expanded; this is static analysis, not observed execution.",
        level: level === "MACRO" ? ("MACRO" as const) : ("MICRO" as const),
        serviceId: node.parentId ?? null,
        serviceName: service?.name ?? null,
        participantElementIds: [node.id],
        steps: [],
        sourceMethod: { classifierId: node.id, signature: String(method["signature"]) },
      }));
  });
}
export function buildSourceMethodInteraction(
  model: ArchitecturalModel,
  flow: DetectedSequenceFlow,
): InteractionDocument {
  const byId = new Map(model.elements.map((node) => [node.id, node]));
  const participants = new Map<string, SequenceParticipant>();
  const messages: SequenceMessage[] = [];
  const fragments: CombinedFragment[] = [];
  const limitations = new Set<string>([
    "STATIC_METHOD_ANALYSIS_NOT_OBSERVED",
    "Unresolved receivers, polymorphism, exceptions and downstream internals without an exact endpoint match are not expanded.",
  ]);
  function participant(node: ArchitecturalModel["elements"][number]) {
    const id = "part:" + node.id;
    participants.set(id, {
      participantId: id,
      modelElementId: node.id,
      role: null,
      name: node.name,
      elementType: node.elementType ?? "COMPONENT",
      abstractionLevel: "COMPONENT",
      resolutionStatus: "RESOLVED",
      provenance: "STATIC",
    });
    return id;
  }
  function walk(
    ownerId: string,
    signature: string,
    depth: number,
    inheritedLoops: string[] = [],
    stack = new Set<string>(),
  ) {
    const owner = byId.get(ownerId);
    if (!owner || depth > 8) {
      limitations.add("EXPANSION_DEPTH_LIMIT");
      return;
    }
    const key = ownerId + ":" + signature;
    if (stack.has(key)) {
      limitations.add("RECURSIVE_CALL_NOT_EXPANDED");
      return;
    }
    const cfg = methods(owner).find((method) => method["signature"] === signature);
    if (!cfg) return;
    const nextStack = new Set(stack).add(key);
    if (
      rows(cfg["nodes"]).some(
        (node) => node["kind"] === "DECISION" && !String(node["label"]).startsWith("each "),
      )
    )
      limitations.add(
        "CONDITIONAL_PATHS_NOT_EXPANDED: source call order is not a guarantee that all calls execute on one path",
      );
    const from = participant(owner);
    for (const call of rows(cfg["calls"])) {
      const candidates = resolveReceiver(model, owner, String(call["receiverType"] ?? ""));
      if (candidates.length !== 1) {
        if (!/Logger|Log$/.test(String(call["receiverType"])))
          limitations.add("UNRESOLVED_RECEIVER: " + String(call["receiverType"]));
        continue;
      }
      const target = candidates[0]!;
      const start = messages.length;
      const loops = [...inheritedLoops, ...strings(call["loopConditions"])];
      const relationship = model.edges.filter(
        (edge) => edge.from === owner.id && edge.to === target.id,
      );
      messages.push({
        messageId: "source-call-" + messages.length,
        sequenceIndex: messages.length + 1,
        fromParticipantId: from,
        toParticipantId: participant(target),
        label:
          String(call["receiver"]) +
          "." +
          String(call["methodName"]) +
          "(" +
          String(call["arguments"] ?? "[]").replace(/^\[|\]$/g, "") +
          ") · L" +
          String(call["line"]),
        messageSort: "SYNCH_CALL",
        endpointKind: "COMPLETE",
        sourceRelationshipIds: relationship.map((edge) => edge.id),
        evidenceIds: relationship.flatMap((edge) => edge.evidenceIds ?? []),
        causalParentMessageIds: [],
        provenance: "STATIC",
        isUncertain: false,
      });
      const localMethods = resolveCalledMethods(methods(target), call);
      if (localMethods.length === 1)
        walk(target.id, String(localMethods[0]!["signature"]), depth + 1, loops, nextStack);
      else if (localMethods.length > 1) limitations.add("AMBIGUOUS_OVERLOAD: " + target.name + "." + String(call["methodName"]));
      const targetService = target.properties?.["targetService"];
      if (typeof targetService === "string") {
        const member = resolveCalledMethods(rows(record(target.properties?.["umlClassifier"])["members"]), call);
        const mappings = member.length === 1 ? strings(member[0]!["endpointDeclarations"]) : [];
        const service = model.elements.filter(
          (node) =>
            node.elementType === "SERVICE_CONTAINER" &&
            node.name.toLowerCase() === targetService.toLowerCase(),
        );
        const remotes =
          service.length === 1
            ? model.elements
                .filter((node) => node.parentId === service[0]!.id)
                .flatMap((node) =>
                  methods(node)
                    .filter((method) =>
                      strings(method["endpointDeclarations"]).some((endpoint) =>
                        mappings.includes(endpoint),
                      ),
                    )
                    .map((method) => ({ node, method })),
                )
            : [];
        if (remotes.length === 1) {
          const remote = remotes[0]!;
          messages.push({
            messageId: "source-call-" + messages.length,
            sequenceIndex: messages.length + 1,
            fromParticipantId: participant(target),
            toParticipantId: participant(remote.node),
            label: "Feign · " + mappings.join(" "),
            messageSort: "SYNCH_CALL",
            endpointKind: "COMPLETE",
            sourceRelationshipIds: [],
            evidenceIds: [],
            causalParentMessageIds: [],
            provenance: "STATIC",
            isUncertain: false,
          });
          walk(remote.node.id, String(remote.method["signature"]), depth + 1, loops, nextStack);
        } else
          limitations.add(
            "FEIGN_TARGET_METHOD_UNRESOLVED: " + target.name + "." + String(call["methodName"]),
          );
      }
      if (strings(call["loopConditions"]).length && messages.length > start)
        fragments.push({
          fragmentId: "source-loop-" + start,
          operator: "loop",
          label: "Source forEach/for loop",
          provenance: "STATIC",
          coveredParticipantIds: [
            ...new Set(
              messages
                .slice(start)
                .flatMap((message) => [message.fromParticipantId, message.toParticipantId]),
            ),
          ],
          operands: [
            {
              operandId: "source-loop-body-" + start,
              guard: strings(call["loopConditions"]).join("; "),
              messageIds: messages.slice(start).map((message) => message.messageId),
            },
          ],
        });
    }
  }
  if (flow.sourceMethod) walk(flow.sourceMethod.classifierId, flow.sourceMethod.signature, 0);
  return {
    schemaVersion: 2,
    interactionId: flow.viewId,
    name: flow.title.slice(0, 120),
    modelId: model.id,
    baseModelId: model.id,
    snapshotId: model.snapshotId,
    mode: "DESIGNED",
    semanticStatus: "PARTIAL",
    provenance: { origin: "STATIC" },
    participants: [...participants.values()],
    messages,
    executions: [],
    fragments,
    interactionUses: [],
    limitations: [...limitations],
  };
}

import { z } from "zod";
import type { ArchitecturalModel } from "@/types/domain";
export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["PERSON", "EXTERNAL_SYSTEM"]),
  state: z.enum(["PROPOSED", "CONFIRMED", "REJECTED"]),
  targetKey: z.string(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  basis: z.string(),
  proposalOrigin: z.string(),
  sourceModelId: z.string().optional(),
  existingElementKey: z.string().optional(),
  sourceLocator: z.string().optional(),
  sourceExcerpt: z.string().optional(),
  confirmedBy: z.string().optional(),
  boundary: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(),
});
export const keyOf = (node: ArchitecturalModel["elements"][number]) =>
  String(
    node.properties?.["logicalKey"] ??
      (node.properties?.["workerLogicalId"]
        ? `worker:${node.properties["workerLogicalId"]}`
        : `element:${node.id}`),
  );
export function withContextCandidates(model: ArchitecturalModel, values: unknown[]) {
  if (!values.length) return model;
  const anchor =
    model.elements.find((n) => n.properties?.["contextReview"] !== undefined) ??
    model.elements.find((n) => !["PERSON", "EXTERNAL_SYSTEM"].includes(n.elementType ?? ""));
  if (!anchor) return model;
  const raw = anchor.properties?.["contextReview"];
  const review = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const stored = Array.isArray(review["entries"]) ? review["entries"] : [];
  const ids = new Set(
    stored.flatMap((v) => {
      const parsed = candidateSchema.safeParse(v);
      return parsed.success ? [parsed.data.id] : [];
    }),
  );
  const entries = values.flatMap((v) => {
    const parsed = candidateSchema.safeParse(v);
    return parsed.success &&
      parsed.data.state === "PROPOSED" &&
      parsed.data.proposalOrigin === "SOURCE_CANDIDATE" &&
      !ids.has(parsed.data.id)
      ? [parsed.data]
      : [];
  });
  if (!entries.length) return model;
  return {
    ...model,
    elements: model.elements.map((n) =>
      n.id === anchor.id
        ? {
            ...n,
            properties: {
              ...n.properties,
              contextReview: { ...review, entries: [...stored, ...entries] },
            },
          }
        : n,
    ),
  };
}

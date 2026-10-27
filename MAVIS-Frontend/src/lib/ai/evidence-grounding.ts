import type {
  ThreeEAiPromptContext,
  ThreeEAiSimplifiedExplanation,
} from "@/features/architecture/three-e-content";
import type {
  C4AiDiagramEnrichment,
  CompactC4AiContext,
} from "@/features/architecture/diagram-projections";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, limit = 1200) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const list = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => text(item, 500))
        .filter(Boolean)
        .slice(0, 5)
    : [];
export function literalSourceContext(context: ThreeEAiPromptContext): ThreeEAiPromptContext {
  return {
    ...context,
    codeSnippets: context.codeSnippets.filter(
      (item) =>
        !/preview|model_metadata/i.test(item.sourceType) &&
        !item.id.startsWith("ast-") &&
        !!item.snippet.trim(),
    ),
  };
}
export function normalizeThreeE(
  candidate: unknown,
  input: ThreeEAiPromptContext,
): ThreeEAiSimplifiedExplanation {
  const context = literalSourceContext(input),
    source = context.codeSnippets;
  const supplied = source.length,
    omitted = context.omittedSnippets ?? 0;
  const grounding = {
    status: supplied ? ("PARTIAL_SOURCE" as const) : ("MODEL_ONLY" as const),
    suppliedSnippets: supplied,
    omittedSnippets: omitted,
    notice: supplied
      ? "Interpretation of " +
        supplied +
        " selected snippet(s); evidence is partial and runtime behavior is not verified."
      : "Model metadata only; no saved source snippets were supplied. Implementation behavior and business roles are unknown.",
  };
  const data = supplied ? record(candidate) : {};
  const allowed = new Set(source.map((item) => item.id));
  const snippetNotes = Object.fromEntries(
    Object.entries(record(data["snippetNotes"]))
      .filter(([id, note]) => allowed.has(id) && !!text(note))
      .map(([id, note]) => [id, text(note, 500)]),
  );
  return {
    explainSimple:
      text(data["explainSimple"]) ||
      "The model represents " +
        context.title +
        " as " +
        context.type +
        ". Business roles and runtime behavior are not established by names or connection counts.",
    exploreSimple: text(data["exploreSimple"]) || grounding.notice,
    evaluateSimple:
      text(data["evaluateSimple"]) ||
      "Correctness, architectural quality and operational safety cannot be established from this partial context.",
    snippetNotes,
    grounding,
    assumptions: list(data["assumptions"]),
    unknowns: [grounding.notice, ...list(data["unknowns"])],
  };
}
export function normalizeC4(
  candidate: unknown,
  context: CompactC4AiContext,
): C4AiDiagramEnrichment {
  if (!context.astSkeleton.trim()) return {};
  const data = record(candidate);
  const allowedNodes = new Set(
    context.nodes.filter((node) => node.hasSourceEvidence).map((node) => node.id),
  );
  const nodeDescriptions = Object.fromEntries(
    Object.entries(record(data["nodeDescriptions"]))
      .filter(([id, value]) => allowedNodes.has(id) && !!text(value))
      .map(([id, value]) => [id, text(value, 54)]),
  );
  // Actor identity, business purpose and external interaction labels remain the
  // explicit model's facts. The LLM may only annotate nodes with source evidence.
  return { nodeDescriptions };
}

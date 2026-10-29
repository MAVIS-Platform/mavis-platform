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
  locale: "en" | "vi" = "en",
): ThreeEAiSimplifiedExplanation {
  const context = literalSourceContext(input),
    source = context.codeSnippets;
  const supplied = source.length,
    omitted = context.omittedSnippets ?? 0;
  const noticeEn = supplied
    ? "Interpretation of " +
      supplied +
      " selected snippet(s); evidence is partial and runtime behavior is not verified."
    : "Model metadata only; no saved source snippets were supplied. Implementation behavior and business roles are unknown.";
  const noticeVi = supplied
    ? "Chỉ diễn giải dựa trên các đoạn mã bằng chứng đang chọn; đây chưa phải là xác minh toàn bộ mã nguồn hoặc Runtime."
    : "Chỉ có siêu dữ liệu mô hình. Chưa có đoạn mã nguồn trích xuất trực tiếp; hành vi chi tiết và vai trò nghiệp vụ chưa được xác lập.";
  const grounding = {
    status: supplied ? ("PARTIAL_SOURCE" as const) : ("MODEL_ONLY" as const),
    suppliedSnippets: supplied,
    omittedSnippets: omitted,
    notice: locale === "vi" ? noticeVi : noticeEn,
  };
  const data = supplied ? record(candidate) : {};
  const allowed = new Set(source.map((item) => item.id));
  const snippetNotes = Object.fromEntries(
    Object.entries(record(data["snippetNotes"]))
      .filter(([id, note]) => allowed.has(id) && !!text(note))
      .map(([id, note]) => [id, text(note, 500)]),
  );
  const defaultExplain = locale === "vi"
    ? `Mô hình biểu diễn "${context.title}" dưới dạng ${context.type}. Vai trò nghiệp vụ và hành vi Runtime chưa được xác lập chỉ qua tên gọi hoặc số lượng kết nối.`
    : "The model represents " +
      context.title +
      " as " +
      context.type +
      ". Business roles and runtime behavior are not established by names or connection counts.";
  const defaultEvaluate = locale === "vi"
    ? "Tính đúng đắn, chất lượng kiến trúc và độ an toàn vận hành chưa thể xác lập đầy đủ từ ngữ cảnh thu gọn này."
    : "Correctness, architectural quality and operational safety cannot be established from this partial context.";
  return {
    explainSimple: text(data["explainSimple"]) || defaultExplain,
    exploreSimple: text(data["exploreSimple"]) || grounding.notice,
    evaluateSimple: text(data["evaluateSimple"]) || defaultEvaluate,
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

import type { OutlineItemData } from "./java-coursera-curriculum-data";

export type ModuleFlowStepKind =
  | "THEORY"
  | "STATIC_DIAGRAM"
  | "QUIZ"
  | "STUDIO_RUNTIME"
  | "MODULE_SUBMIT";

export type AssignmentMetaLike = {
  id: string;
  title?: string | null | undefined;
  labMode?: string | null | undefined;
  requireRuntimeTrace?: boolean | null | undefined;
  referenceSource?:
    | {
        modelId?: string | null | undefined;
        snapshotId?: string | null | undefined;
      }
    | null
    | undefined;
  aiPolicy?: Record<string, unknown> | string | null | undefined;
};

export function resolveModuleFlowKind(item: Pick<OutlineItemData, "id" | "type">): ModuleFlowStepKind {
  if (item.type === "THEORY") return "THEORY";
  if (item.type === "QUIZ") return "QUIZ";
  if (item.id.startsWith("static-view:")) return "STATIC_DIAGRAM";
  if (item.id.startsWith("runtime-studio:")) return "STUDIO_RUNTIME";
  if (item.id.startsWith("module-submit:")) return "MODULE_SUBMIT";
  return item.type === "RUNTIME_LAB" ? "STUDIO_RUNTIME" : "STATIC_DIAGRAM";
}

export function resolveLabStepForItem(
  item: Pick<OutlineItemData, "id" | "type">,
  requiresRuntime = true,
): 1 | 2 | 3 {
  if (item.id.startsWith("static-view:")) return 1;
  if (item.id.startsWith("runtime-studio:")) return requiresRuntime ? 2 : 3;
  if (item.id.startsWith("module-submit:")) return 3;
  return 1;
}

export function expandModuleFlowItems(
  items: ReadonlyArray<OutlineItemData>,
  assignments: ReadonlyArray<AssignmentMetaLike> = [],
  locale: "en" | "vi" = "vi",
): OutlineItemData[] {
  const filtered = items.filter((item) => item.type !== "ESSAY");
  const theoryItems = filtered.filter((item) => item.type === "THEORY");
  const quizItems = [...filtered.filter((item) => item.type === "QUIZ")];
  const labItem =
    filtered.find(
      (item) =>
        item.assignmentId && ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type),
    ) ??
    filtered.find((item) => ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type));

  const linkedAssignment = labItem?.assignmentId
    ? assignments.find((candidate) => candidate.id === labItem.assignmentId)
    : undefined;
  const aiPolicy =
    linkedAssignment?.aiPolicy &&
    typeof linkedAssignment.aiPolicy === "object" &&
    !Array.isArray(linkedAssignment.aiPolicy)
      ? (linkedAssignment.aiPolicy as Record<string, unknown>)
      : null;

  const skipsQuiz =
    linkedAssignment?.labMode === "THEORY_ONLY" ||
    aiPolicy?.["skipQuiz"] === true ||
    aiPolicy?.["labTier"] === "THEORY_ONLY";
  const requiresRuntime = linkedAssignment
    ? linkedAssignment.requireRuntimeTrace === true ||
      linkedAssignment.labMode === "THEORY_QUIZ_STUDIO"
    : labItem?.type === "RUNTIME_LAB";
  const hasReferenceArch = linkedAssignment
    ? Boolean(
        linkedAssignment.referenceSource?.modelId ||
          linkedAssignment.referenceSource?.snapshotId,
      ) || linkedAssignment.labMode !== "THEORY_ONLY"
    : Boolean(labItem);

  if (quizItems.length === 0 && labItem?.assignmentId && !skipsQuiz) {
    quizItems.push({
      id: `lab-quiz:${labItem.assignmentId}`,
      type: "QUIZ",
      title: `Quiz · ${linkedAssignment?.title ?? labItem.title}`,
      description: null,
      position: labItem.position,
      assignmentId: labItem.assignmentId,
      required: true,
      quizQuestions: [],
    });
  }

  const isVi = locale === "vi";
  const ordered: OutlineItemData[] = [...theoryItems];

  if (labItem?.assignmentId && hasReferenceArch) {
    ordered.push({
      id: `static-view:${labItem.assignmentId}`,
      type: "STATIC_LAB",
      title: isVi
        ? "Khám phá Sơ đồ Tĩnh (C1–C3 & Dependency Graph)"
        : "Explore Static Diagrams (C1–C3 & Dependency Graph)",
      description: isVi
        ? "Xem sơ đồ C1–C3, đồ thị phụ thuộc và hỏi trợ lý AI trước khi làm Quiz."
        : "Inspect C1–C3 diagrams, service dependencies, and ask MAVIS AI before the Quiz.",
      position: ordered.length + 1,
      assignmentId: labItem.assignmentId,
      required: true,
    });
  }

  for (const quiz of quizItems) {
    ordered.push(quiz);
  }

  if (labItem?.assignmentId && requiresRuntime) {
    ordered.push({
      id: `runtime-studio:${labItem.assignmentId}`,
      type: "RUNTIME_LAB",
      title: isVi
        ? "Thực hành MAVIS Studio (Sơ đồ Động & Bài tập)"
        : "MAVIS Studio Practice (Dynamic Diagrams & Tasks)",
      description:
        labItem.description ??
        (isVi
          ? "Chạy hệ thống Docker thực tế, thao tác hạ tầng, chụp Snapshot và ghi nhận RuntimeReceipt."
          : "Run live Docker containers, inject operations, capture snapshots, and record a RuntimeReceipt."),
      position: ordered.length + 1,
      assignmentId: labItem.assignmentId,
      required: true,
    });
  }

  if (labItem?.assignmentId) {
    ordered.push({
      id: `module-submit:${labItem.assignmentId}`,
      type: "IMPACT_LAB",
      title: isVi ? "Tổng hợp & Nộp bài Module" : "Module Summary & Submit",
      description: isVi
        ? "Kiểm tra lại kết quả cả 4 bước và viết giải trình để nộp bài cho Giảng viên chấm."
        : "Review all 4 steps and submit your explanation and evidence to your lecturer.",
      position: ordered.length + 1,
      assignmentId: labItem.assignmentId,
      required: true,
    });
  } else if (labItem) {
    ordered.push(labItem);
  }

  return ordered;
}

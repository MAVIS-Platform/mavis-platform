import type { OutlineItemData } from "./java-coursera-curriculum-data";
import {
  detectAuditTrack,
  resolveModuleAuditLens,
  resolveModuleIndex,
  type AuditTrack,
} from "../architecture/module-audit-lens";

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

export type ModuleFlowOptions = {
  courseCode?: string | null | undefined;
  modulePosition?: number | null | undefined;
  curriculumCode?: string | null | undefined;
  track?: AuditTrack | undefined;
};

/**
 * Idempotently maps any static diagram step title (including legacy saved titles)
 * to the module's dedicated Audit Lens title for either Java or C#.
 */
export function resolveStaticAuditStepTitle(
  rawTitle: string,
  options: {
    courseCode?: string | null | undefined;
    modulePosition?: number | null | undefined;
    curriculumCode?: string | null | undefined;
    locale?: "en" | "vi" | undefined;
    isStaticStep?: boolean | undefined;
  } = {},
): string {
  const trimmed = rawTitle.trim();
  const looksLegacyStatic =
    options.isStaticStep === true ||
    /khám phá sơ đồ tĩnh|explore static diagrams|static-view/i.test(trimmed);
  if (!looksLegacyStatic && trimmed.length > 0) {
    return rawTitle;
  }
  const track = detectAuditTrack({
    workspaceCode: options.courseCode,
    labTitle: trimmed,
  });
  const moduleIndex = resolveModuleIndex({
    modulePosition: options.modulePosition,
    labTitle: trimmed,
    curriculumCode: options.curriculumCode,
  });
  const lens = resolveModuleAuditLens(track, moduleIndex);
  return (options.locale ?? "vi") === "vi" ? lens.stepTitleVi : lens.stepTitleEn;
}

function inferTrackForModuleFlow(
  items: ReadonlyArray<OutlineItemData>,
  assignments: ReadonlyArray<AssignmentMetaLike>,
  labLabel: string,
  options?: ModuleFlowOptions,
): AuditTrack {
  if (options?.track) return options.track;
  const combinedHint = [
    labLabel,
    ...items.map((item) => `${item.id} ${item.curriculumCode ?? ""} ${item.title}`),
    ...assignments.map((a) => a.title ?? ""),
  ].join(" ");
  if (
    /csharp|dotnet|\.net|trái cây|fruit|polly|roslyn|masstransit/i.test(combinedHint)
  ) {
    return detectAuditTrack({
      workspaceCode: options?.courseCode ?? "CSHARP",
      labTitle: combinedHint,
    });
  }
  return detectAuditTrack({
    workspaceCode: options?.courseCode,
    labTitle: combinedHint,
  });
}

function buildLabModuleSequence(
  labItem: OutlineItemData,
  matchedQuizzes: ReadonlyArray<OutlineItemData>,
  assignments: ReadonlyArray<AssignmentMetaLike>,
  isVi: boolean,
  positionStart: number,
  options?: ModuleFlowOptions,
  allItems: ReadonlyArray<OutlineItemData> = [],
): OutlineItemData[] {
  const assignmentId = labItem.assignmentId;
  if (!assignmentId) return [labItem];

  const linkedAssignment = assignments.find((candidate) => candidate.id === assignmentId);
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
    : labItem.type === "RUNTIME_LAB";
  const hasReferenceArch = linkedAssignment
    ? Boolean(
        linkedAssignment.referenceSource?.modelId ||
          linkedAssignment.referenceSource?.snapshotId,
      ) || linkedAssignment.labMode !== "THEORY_ONLY"
    : true;

  const hasModuleQuiz = allItems.some(
    (item) => item.type === "QUIZ" && !item.assignmentId,
  );
  const quizzes =
    matchedQuizzes.length > 0
      ? [...matchedQuizzes]
      : !skipsQuiz && !hasModuleQuiz
        ? [
            {
              id: `lab-quiz:${assignmentId}`,
              type: "QUIZ" as const,
              title: `Quiz · ${linkedAssignment?.title ?? labItem.title}`,
              description: null,
              position: labItem.position,
              assignmentId,
              required: true,
              quizQuestions: [],
            },
          ]
        : [];

  const labLabel = (linkedAssignment?.title ?? labItem.title).trim();
  const track = inferTrackForModuleFlow(allItems, assignments, labLabel, options);
  const moduleIndex = resolveModuleIndex({
    modulePosition: options?.modulePosition,
    labTitle: labLabel,
    curriculumCode: options?.curriculumCode ?? labItem.curriculumCode ?? labItem.id,
  });
  const activeLens = resolveModuleAuditLens(track, moduleIndex);
  const sequence: OutlineItemData[] = [];
  if (hasReferenceArch) {
    sequence.push({
      id: `static-view:${assignmentId}`,
      type: "STATIC_LAB",
      title: isVi ? activeLens.stepTitleVi : activeLens.stepTitleEn,
      description: isVi ? activeLens.stepDescriptionVi : activeLens.stepDescriptionEn,
      position: positionStart + sequence.length + 1,
      assignmentId,
      required: true,
    });
  }
  for (const quiz of quizzes) {
    sequence.push(quiz);
  }
  if (requiresRuntime) {
    sequence.push({
      id: `runtime-studio:${assignmentId}`,
      type: "RUNTIME_LAB",
      title: isVi
        ? `Thực hành MAVIS Studio · ${labLabel}`
        : `MAVIS Studio Practice · ${labLabel}`,
      description:
        labItem.description ??
        (isVi
          ? "Chạy hệ thống Docker thực tế, thao tác hạ tầng, chụp Snapshot và ghi nhận RuntimeReceipt."
          : "Run live Docker containers, inject operations, capture snapshots, and record a RuntimeReceipt."),
      position: positionStart + sequence.length + 1,
      assignmentId,
      required: true,
    });
  }
  sequence.push({
    id: `module-submit:${assignmentId}`,
    type: "IMPACT_LAB",
    title: isVi ? `Tổng hợp & Nộp bài · ${labLabel}` : `Summary & Submit · ${labLabel}`,
    description: isVi
      ? "Kiểm tra lại toàn bộ tiến độ và gửi bài tổng hợp cho Giảng viên."
      : "Review your progress and submit your final reflection for grading.",
    position: positionStart + sequence.length + 1,
    assignmentId,
    required: true,
  });
  return sequence;
}

export function expandModuleFlowItems(
  items: ReadonlyArray<OutlineItemData>,
  assignments: ReadonlyArray<AssignmentMetaLike> = [],
  locale: "en" | "vi" = "vi",
  options?: ModuleFlowOptions,
): OutlineItemData[] {
  const filtered = items.filter((item) => item.type !== "ESSAY");
  const theoryItems = filtered.filter((item) => item.type === "THEORY");
  const quizItems = [...filtered.filter((item) => item.type === "QUIZ")];
  const rawLabItems = filtered.filter((item) =>
    ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type),
  );
  const labItems: OutlineItemData[] = [];
  const seenLabAssignments = new Set<string>();
  for (const candidate of rawLabItems) {
    if (candidate.assignmentId) {
      if (seenLabAssignments.has(candidate.assignmentId)) continue;
      seenLabAssignments.add(candidate.assignmentId);
    }
    labItems.push(candidate);
  }

  const isVi = locale === "vi";
  const ordered: OutlineItemData[] = [...theoryItems];

  if (labItems.length <= 1) {
    const labItem = labItems[0];
    if (labItem?.assignmentId) {
      ordered.push(
        ...buildLabModuleSequence(
          labItem,
          quizItems,
          assignments,
          isVi,
          ordered.length,
          options,
          filtered,
        ),
      );
    } else {
      for (const quiz of quizItems) ordered.push(quiz);
      if (labItem) {
        ordered.push(
          labItem.type === "STATIC_LAB"
            ? {
                ...labItem,
                title: resolveStaticAuditStepTitle(labItem.title, {
                  courseCode: options?.courseCode,
                  modulePosition: options?.modulePosition,
                  curriculumCode: options?.curriculumCode ?? labItem.curriculumCode,
                  locale,
                  isStaticStep: true,
                }),
              }
            : labItem,
        );
      }
    }
    return ordered;
  }

  const matchedQuizIds = new Set<string>();
  for (const labItem of labItems) {
    const labQuizzes = labItem.assignmentId
      ? quizItems.filter((q) => q.assignmentId === labItem.assignmentId)
      : [];
    for (const q of labQuizzes) matchedQuizIds.add(q.id);
    ordered.push(
      ...buildLabModuleSequence(
        labItem,
        labQuizzes,
        assignments,
        isVi,
        ordered.length,
        options,
        filtered,
      ),
    );
  }
  for (const quiz of quizItems) {
    if (!matchedQuizIds.has(quiz.id)) {
      ordered.push(quiz);
    }
  }
  return ordered;
}

import type { Response } from "@/lib/api/contracts";
import { COURSEWORK_DIAGRAM_TYPES } from "@/lib/architecture/coursework-diagram-types";

export type Assignment = Response<"assignments">[number];
export const DIAGRAM_REQUIREMENTS = COURSEWORK_DIAGRAM_TYPES;

export type LabTier = "THEORY_ONLY" | "THEORY_QUIZ" | "THEORY_QUIZ_STUDIO";

export function resolveLabTier(
  assignment?: {
    labMode?: string | null | undefined;
    requireRuntimeTrace?: boolean | null | undefined;
    aiPolicy?: unknown;
  } | null,
): LabTier {
  if (!assignment) return "THEORY_QUIZ_STUDIO";
  let policyObj: Record<string, unknown> | null = null;
  if (assignment.aiPolicy && typeof assignment.aiPolicy === "object") {
    policyObj = assignment.aiPolicy as Record<string, unknown>;
  } else if (typeof assignment.aiPolicy === "string" && assignment.aiPolicy.trim().startsWith("{")) {
    try {
      policyObj = JSON.parse(assignment.aiPolicy) as Record<string, unknown>;
    } catch {
      policyObj = null;
    }
  }
  if (
    policyObj?.["labTier"] === "THEORY_ONLY" ||
    policyObj?.["skipQuiz"] === true ||
    assignment.labMode === "THEORY_ONLY"
  ) {
    return "THEORY_ONLY";
  }
  if (
    assignment.requireRuntimeTrace === true ||
    assignment.labMode === "THEORY_QUIZ_STUDIO" ||
    policyObj?.["labTier"] === "THEORY_QUIZ_STUDIO"
  ) {
    return "THEORY_QUIZ_STUDIO";
  }
  return "THEORY_QUIZ";
}

export function labTierMeta(tier: LabTier) {
  if (tier === "THEORY_ONLY") {
    return {
      en: "Theory Only",
      vi: "Lab chỉ Lý thuyết",
      shortEn: "Theory",
      shortVi: "Chỉ Lý thuyết",
    };
  }
  if (tier === "THEORY_QUIZ") {
    return {
      en: "Theory + Quiz",
      vi: "Lab Lý thuyết + Quiz",
      shortEn: "Theory + Quiz",
      shortVi: "Lý thuyết + Quiz",
    };
  }
  return {
    en: "Theory + Quiz + Studio",
    vi: "Lab Lý thuyết + Quiz + Studio",
    shortEn: "Full Studio",
    shortVi: "Có cả Studio",
  };
}

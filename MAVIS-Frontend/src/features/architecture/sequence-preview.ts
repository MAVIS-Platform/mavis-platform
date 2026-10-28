import { z } from "zod";
import type { ArchitecturalModel } from "@/types/domain";
import {
  interactionToDrawioXml,
  type DetectedSequenceFlow,
  type InteractionDocument,
} from "./scenario-design";

export function partitionSequenceFlows(flows: DetectedSequenceFlow[]) {
  return {
    sequences: flows.filter((flow) => Boolean(flow.sourceMethod)),
    dependencies: flows.filter((flow) => !flow.sourceMethod),
  };
}

export function renderSequencePreview(
  document: InteractionDocument | null,
  model: ArchitecturalModel,
): { xml: string; error: string; empty: string } {
  if (!document || document.limitations.includes("DEPENDENCY_ONLY_NOT_AN_EXECUTION_TRACE"))
    return { xml: "", error: "", empty: "" };
  if (!document.messages.length)
    return {
      xml: "",
      error: "",
      empty:
        "No supported calls could be resolved for this endpoint. This does not mean the service has no behavior. Check the analysis limitations below or inspect an observed runtime trace.",
    };
  try {
    return { xml: interactionToDrawioXml(document, model), error: "", empty: "" };
  } catch (error) {
    const reason =
      error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : "Unknown diagram validation error.";
    return { xml: "", error: `Unable to render this sequence. ${reason}`, empty: "" };
  }
}

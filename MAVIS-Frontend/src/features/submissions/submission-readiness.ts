import type { ArtifactSelection } from "./artifact-selector";
import {
  documentDiagramType,
  projectionDiagramType,
} from "@/lib/architecture/coursework-diagram-types";
export function artifactNotation(viewId: string): string {
  return documentDiagramType(viewId);
}
export function missingDiagramRequirements(
  required: readonly string[],
  selection: ArtifactSelection | null,
  generated: readonly { id: string; notation: string; level?: string }[],
): string[] {
  const available = new Set([
    ...(selection?.documents ?? []).map((d) => artifactNotation(d.viewId)),
    ...generated
      .filter((d) => selection?.diagramVersionIds.includes(d.id))
      .map((d) => projectionDiagramType(d.notation, d.level)),
  ]);
  if ([...available].some((type) => type.startsWith("C4_"))) available.add("C4");
  return required.filter((type) => !available.has(type));
}
export function isDeadlinePassed(dueAt: string | undefined, now = Date.now()): boolean {
  if (!dueAt || dueAt === "No deadline") return false;
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && now > due;
}
export function runtimeEvidenceBlocked(
  required: boolean,
  pending: boolean,
  failed: boolean,
): boolean {
  return required && (pending || failed);
}

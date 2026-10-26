import type { ArtifactSelection } from "./artifact-selector";
export function artifactNotation(viewId: string): string {
  const key = viewId.toLowerCase();
  return key.startsWith("uml-class")
    ? "UML_CLASS"
    : key.startsWith("uml-package")
      ? "UML_PACKAGE"
      : key.startsWith("uml-deployment")
        ? "UML_DEPLOYMENT"
        : key.startsWith("uml-activity")
          ? "UML_ACTIVITY"
          : key.startsWith("uml-state")
            ? "UML_STATE"
            : key.includes("scenario") || key.includes("sequence")
              ? "UML_SEQUENCE"
              : key.includes("c4")
                ? "C4"
                : "DEPENDENCY_GRAPH";
}
export function missingDiagramRequirements(
  required: readonly string[],
  selection: ArtifactSelection | null,
  generated: readonly { id: string; notation: string }[],
): string[] {
  const available = new Set([
    ...(selection?.documents ?? []).map((d) => artifactNotation(d.viewId)),
    ...generated.filter((d) => selection?.diagramVersionIds.includes(d.id)).map((d) => d.notation),
  ]);
  return required.filter((type) => !available.has(type));
}
export function isDeadlinePassed(dueAt: string | undefined, now = Date.now()): boolean {
  if (!dueAt || dueAt === "No deadline") return false;
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && now > due;
}

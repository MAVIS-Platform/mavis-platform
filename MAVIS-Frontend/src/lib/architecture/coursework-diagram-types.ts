// Exact diagram identities used in assignment requirements and frozen bundles.
// C4 is a family; its three levels must not satisfy one another's requirements.
export const COURSEWORK_DIAGRAM_TYPES = [
  { id: "C4_CONTEXT", label: "C4 · System Context" },
  { id: "C4_COMPONENT", label: "C4 · Component Diagram" },
  { id: "C4_CONTAINER", label: "C4 · Container Diagram" },
  { id: "UML_CLASS", label: "UML Class Diagram" },
  { id: "UML_SEQUENCE", label: "UML Sequence Diagram" },
  { id: "UML_PACKAGE", label: "UML Package Diagram" },
  { id: "UML_DEPLOYMENT", label: "UML Deployment Diagram" },
  { id: "UML_ACTIVITY", label: "UML Activity Diagram" },
  { id: "UML_STATE", label: "UML State Diagram" },
  { id: "DEPENDENCY_GRAPH", label: "Graph" },
] as const;
export function diagramTypeLabel(id: string): string {
  return (
    COURSEWORK_DIAGRAM_TYPES.find((type) => type.id === id)?.label ??
    (id === "C4"
      ? "C4 (legacy group)"
      : id === "VIEW_4_PLUS_1"
        ? "Legacy 4+1 requirement — edit assignment"
        : id)
  );
}
export function normalizeDiagramRequirements(types: readonly string[]): string[] {
  const current = new Set(COURSEWORK_DIAGRAM_TYPES.map((t) => t.id as string));
  return [
    ...new Set(
      types.flatMap((type) =>
        type === "C4"
          ? ["C4_CONTEXT", "C4_CONTAINER", "C4_COMPONENT"]
          : current.has(type)
            ? [type]
            : [],
      ),
    ),
  ];
}
export function documentDiagramType(viewId: string): string {
  const key = viewId.toLowerCase().split(":")[0]!;
  if (["context", "c4-context", "c4_context"].includes(key)) return "C4_CONTEXT";
  if (["container", "containers", "c4-container", "c4_container"].includes(key))
    return "C4_CONTAINER";
  if (["component", "components", "c4-component", "c4_component"].includes(key))
    return "C4_COMPONENT";
  for (const type of COURSEWORK_DIAGRAM_TYPES)
    if (key === type.id.toLowerCase().replaceAll("_", "-") || key === type.id.toLowerCase())
      return type.id;
  if (key.includes("scenario") || key.includes("sequence")) return "UML_SEQUENCE";
  if (["graph", "dependency-graph", "dependency_graph", "overview"].includes(key))
    return "DEPENDENCY_GRAPH";
  // Kept for reading old documents, never presented as a new assignment type.
  if (["logical", "development", "process", "deployment"].includes(key)) return "VIEW_4_PLUS_1";
  return "UNKNOWN";
}
export function projectionDiagramType(notation: string, level?: string): string {
  if (notation === "C4" && ["CONTEXT", "CONTAINER", "COMPONENT"].includes(level ?? ""))
    return `C4_${level}`;
  return notation;
}

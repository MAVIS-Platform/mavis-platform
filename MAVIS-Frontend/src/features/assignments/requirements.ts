import type { Response } from "@/lib/api/contracts";
export type Assignment = Response<"assignments">[number];
export const DIAGRAM_REQUIREMENTS = [
  "DEPENDENCY_GRAPH",
  "C4",
  "VIEW_4_PLUS_1",
  "UML_SEQUENCE",
  "UML_CLASS",
  "UML_PACKAGE",
  "UML_DEPLOYMENT",
  "UML_ACTIVITY",
  "UML_STATE",
] as const;

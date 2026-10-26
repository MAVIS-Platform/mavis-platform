import type { Response } from "@/lib/api/contracts";
import {COURSEWORK_DIAGRAM_TYPES} from "@/lib/architecture/coursework-diagram-types";
export type Assignment = Response<"assignments">[number];
export const DIAGRAM_REQUIREMENTS = COURSEWORK_DIAGRAM_TYPES;

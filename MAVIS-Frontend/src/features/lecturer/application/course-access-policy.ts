export type LecturerCourseStatus = string | undefined;

export type LecturerCourseAccess = {
  isActive: boolean;
  isEditable: boolean;
  canCreateModules: boolean;
  canCreateLabs: boolean;
  mode: "read-only" | "edit";
};

/**
 * Single source of truth for the Lecturer course lifecycle.
 *
 * ACTIVE is the learner-facing, immutable published state. INACTIVE is the
 * Lecturer authoring state. ARCHIVED remains a terminal legacy state.
 */
export function lecturerCourseAccess(status: LecturerCourseStatus): LecturerCourseAccess {
  const isActive = status === "ACTIVE";
  const isAuthoring = !isActive && status !== "ARCHIVED";
  return {
    isActive,
    isEditable: isAuthoring,
    canCreateModules: isAuthoring,
    canCreateLabs: isAuthoring,
    mode: isActive ? "read-only" : "edit",
  };
}

export function canEditLecturerCourse(
  status: LecturerCourseStatus,
  hasManageRole: boolean,
): boolean {
  return hasManageRole && lecturerCourseAccess(status).isEditable;
}

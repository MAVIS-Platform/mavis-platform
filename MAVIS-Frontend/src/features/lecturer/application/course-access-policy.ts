export type LecturerCourseStatus = string | undefined;

export type LecturerCourseAccess = {
  isActive: boolean;
  isArchived: boolean;
  isEditable: boolean;
  canCreateModules: boolean;
  canCreateLabs: boolean;
  canManageGrades: boolean;
  canManageStudents: boolean;
  canManageSettings: boolean;
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
  const isArchived = status === "ARCHIVED";
  const isAuthoring = !isActive && !isArchived;
  const canOperateClass = !isArchived;
  return {
    isActive,
    isArchived,
    isEditable: isAuthoring,
    canCreateModules: isAuthoring,
    canCreateLabs: isAuthoring,
    canManageGrades: canOperateClass,
    canManageStudents: canOperateClass,
    canManageSettings: canOperateClass,
    mode: isActive ? "read-only" : "edit",
  };
}

export function canEditLecturerCourse(
  status: LecturerCourseStatus,
  hasManageRole: boolean,
): boolean {
  return hasManageRole && lecturerCourseAccess(status).isEditable;
}

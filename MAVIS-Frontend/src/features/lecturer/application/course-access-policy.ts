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
 * The current API exposes ACTIVE/ARCHIVED. Until the backend introduces an
 * explicit INACTIVE state, ARCHIVED is the API representation of an inactive
 * course in the Lecturer application.
 */
export function lecturerCourseAccess(status: LecturerCourseStatus): LecturerCourseAccess {
  const isActive = status !== "ARCHIVED";
  return {
    isActive,
    // Active courses remain operational. Only structural creation is frozen.
    isEditable: true,
    canCreateModules: !isActive,
    canCreateLabs: !isActive,
    mode: "edit",
  };
}

export function canEditLecturerCourse(
  status: LecturerCourseStatus,
  hasManageRole: boolean,
): boolean {
  return hasManageRole && lecturerCourseAccess(status).isEditable;
}

"use client";

import { CourseOutline } from "./course-outline";

/**
 * Lecturer Curriculum Overview rendered on Tab 1 (`Overview & Setup`) and `/roadmap`.
 * Individual Labs are managed inside Lab Creation -> Lab Library.
 */
export function LecturerCurriculumManager({
  workspaceId,
  active = true,
}: {
  workspaceId: string;
  active?: boolean | undefined;
}) {
  return (
    <div className="space-y-6">
      {/* Passkey moved to CourseWorkspaceShell header next to ACTIVE badge (Active Class Passkeys: <CoursePasskey />) */}
      <CourseOutline workspaceId={workspaceId} canManage active={active} />
    </div>
  );
}

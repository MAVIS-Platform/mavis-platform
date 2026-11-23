const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Lecturer architecture owns one fail-closed course lifecycle policy", () => {
  const policy = read("src/features/lecturer/application/course-access-policy.ts");
  assert.match(policy, /status !== "ARCHIVED"/);
  assert.match(policy, /isEditable: !isActive/);
  assert.match(policy, /hasManageRole && lecturerCourseAccess\(status\)\.isEditable/);
});

test("Global and Course Lecturer workspaces consume the shared lifecycle policy", () => {
  const globalWorkspace = read("src/features/workspaces/screens.tsx");
  const courseShell = read("src/features/courses/course-workspace-shell.tsx");
  assert.match(globalWorkspace, /lecturerCourseAccess\(workspace\.status\)/);
  assert.match(globalWorkspace, /canEditLecturerCourse\(workspace\?\.status, canManage\)/);
  assert.match(courseShell, /Khóa học đang hoạt động — chỉ xem/);
  assert.match(courseShell, /actions && courseAccess\.isEditable/);
});

test("Active Lecturer courses keep content, Lab, roster, grading and settings read-only", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  const labs = read("src/features/assignments/screens.tsx");
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const grades = read("src/features/submissions/screens.tsx");
  assert.match(workspace, /disabled=\{remove\.isPending \|\| !canEdit\}/);
  assert.match(workspace, /activeTab === "authoring" && canManage && canEdit/);
  assert.match(labs, /courseAccess\.isEditable &&/);
  assert.match(authoring, /!courseAccess\.isEditable/);
  assert.match(grades, /!courseAccess\.isEditable[\s\S]*ClassGradebookMatrix/);
});

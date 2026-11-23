const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Lecturer lifecycle keeps Active courses operational but freezes structural creation", () => {
  const policy = read("src/features/lecturer/application/course-access-policy.ts");
  assert.match(policy, /status !== "ARCHIVED"/);
  assert.match(policy, /isEditable: true/);
  assert.match(policy, /canCreateModules: !isActive/);
  assert.match(policy, /canCreateLabs: !isActive/);
  assert.match(policy, /hasManageRole && lecturerCourseAccess\(status\)\.isEditable/);
});

test("Course Lecturer workspace consumes the shared lifecycle policy", () => {
  const globalWorkspace = read("src/features/workspaces/screens.tsx");
  const courseShell = read("src/features/courses/course-workspace-shell.tsx");
  assert.match(globalWorkspace, /canEditLecturerCourse\(workspace\?\.status, canManage\)/);
  assert.doesNotMatch(courseShell, /Khóa học đang hoạt động — chỉ xem/);
  assert.match(courseShell, /actions && <div/);
});

test("Active Lecturer courses only block new Modules and Labs", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  const labs = read("src/features/assignments/screens.tsx");
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const courseBuilder = read("src/features/courses/course-builder.tsx");
  assert.match(workspace, /disabled=\{remove\.isPending \|\| !canEdit\}/);
  assert.match(workspace, /activeTab === "authoring" && canManage && canEdit/);
  assert.match(workspace, /canCreateModules=\{courseAccess\.canCreateModules\}/);
  assert.match(labs, /courseAccess\.canCreateLabs &&/);
  assert.match(authoring, /!assignment && !courseAccess\.canCreateLabs/);
  assert.match(courseBuilder, /if \(!canCreateModules\) return/);
});

test("Global Lecturer workspace hides its sidebar and uses a single Course Management heading", () => {
  const shell = read("src/components/app-shell.tsx");
  const workspace = read("src/features/workspaces/screens.tsx");
  assert.match(shell, /pathname === "\/workspaces" && !selectedWorkspaceId/);
  assert.match(workspace, /t\("Course Management", "Quản lý khóa học"\)/);
  assert.doesNotMatch(workspace, /A great class starts here/);
  assert.doesNotMatch(workspace, /Your teaching space/);
  assert.doesNotMatch(workspace, /Open a class to organize/);
});

test("Lecturer course cards open directly and own an Active-Inactive lifecycle toggle", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  assert.match(workspace, /role="link"/);
  assert.match(workspace, /onClick=\{\(\) => window\.location\.assign\(workspaceUrl\)\}/);
  assert.match(workspace, /<Switch/);
  assert.match(workspace, /archiveWorkspace\.mutateAsync/);
  assert.match(workspace, /updateWorkspace\.mutateAsync/);
  assert.doesNotMatch(workspace, /t\("Open class", "Mở lớp"\)/);
  assert.doesNotMatch(workspace, /Active · read only/);
});

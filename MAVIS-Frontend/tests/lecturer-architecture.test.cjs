const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Lecturer lifecycle makes Active content read-only and Inactive content editable", () => {
  const policy = read("src/features/lecturer/application/course-access-policy.ts");
  assert.match(policy, /status === "ACTIVE"/);
  assert.match(policy, /isEditable: isAuthoring/);
  assert.match(policy, /canCreateModules: isAuthoring/);
  assert.match(policy, /canCreateLabs: isAuthoring/);
  assert.match(policy, /hasManageRole && lecturerCourseAccess\(status\)\.isEditable/);
});

test("Course Lecturer workspace consumes the shared lifecycle policy", () => {
  const globalWorkspace = read("src/features/workspaces/screens.tsx");
  const courseShell = read("src/features/courses/course-workspace-shell.tsx");
  assert.match(globalWorkspace, /canEditLecturerCourse\(workspace\?\.status, canManage\)/);
  assert.doesNotMatch(courseShell, /Khóa học đang hoạt động — chỉ xem/);
  assert.match(courseShell, /actions && <div/);
});

test("Lecturer Course navigation centralizes authoring in Overview", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  const navigation = read("src/lib/navigation.ts");
  const hub = read("src/features/courses/course-content-hub.tsx");
  const flowNavigation = read("src/features/courses/course-setup-flow-navigation.tsx");
  const referenceManager = read("src/features/workspaces/reference-manage.tsx");
  const lesson = read("src/features/workspaces/theory-library.tsx");
  const quiz = read("src/features/courses/quiz-library.tsx");
  const lab = read("src/features/assignments/lab-authoring.tsx");
  assert.doesNotMatch(shell, /en: "Modules"|en: "Labs"/);
  assert.doesNotMatch(navigation, /label: "Modules"|label: "Labs"/);
  assert.match(hub, /Add Repository/);
  assert.match(hub, /Add Lesson/);
  assert.match(hub, /Add Quiz/);
  assert.match(hub, /Add Lab/);
  assert.match(hub, /Update Course/);
  assert.match(flowNavigation, /Repository/);
  assert.match(flowNavigation, /Lesson/);
  assert.match(flowNavigation, /Quiz/);
  assert.match(flowNavigation, /MAVIS Studio Lab/);
  assert.match(flowNavigation, /Arrange Modules/);
  assert.match(flowNavigation, /Publish Changes/);
  assert.match(flowNavigation, /Back to Overview/);
  assert.match(flowNavigation, /Next:/);
  assert.match(flowNavigation, /from=first-setup/);
  assert.match(referenceManager, /onAnalysisComplete/);
  assert.match(referenceManager, /toast\.success/);
  assert.match(referenceManager, /courseSetupStepHref\(workspaceId, "lesson"\)/);
  assert.match(referenceManager, /currentStep="repository"/);
  assert.match(lesson, /currentStep="lesson"/);
  assert.match(quiz, /currentStep="quiz"/);
  assert.match(lab, /currentStep="lab"/);
  assert.match(workspace, /currentStep=\{requestedFlowStep\}/);
  assert.doesNotMatch(workspace, /CourseFirstSetupFlow/);
  assert.match(workspace, /\/references\?workspace=\$\{encodeURIComponent\(workspace\.id\)\}&from=first-setup/);
});

test("Active Lecturer courses lock authoring while Inactive courses expose module and Lab creation", () => {
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
  assert.match(courseBuilder, /t\("Publish Changes", "Publish Changes"\)/);
  assert.match(courseBuilder, /status: "ACTIVE"/);
});

test("Global Lecturer workspace hides its sidebar and uses a single Course Management heading", () => {
  const shell = read("src/components/app-shell.tsx");
  const workspace = read("src/features/workspaces/screens.tsx");
  assert.match(shell, /pathname === "\/workspaces" && !selectedWorkspaceId/);
  assert.match(workspace, /t\("Course Management", "Quản lý khóa học"\)/);
  assert.doesNotMatch(workspace, /A great class starts here/);
  assert.doesNotMatch(workspace, /Your teaching space/);
  assert.doesNotMatch(workspace, /Open a class to organize/);
  assert.doesNotMatch(shell, /label: t\("Course Workspace"/);
  assert.doesNotMatch(shell, /label: t\("Grades", "Chấm điểm"\)/);
});

test("Lecturer course cards open directly and own an Active-Inactive lifecycle toggle", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  assert.match(workspace, /role="link"/);
  assert.match(workspace, /onClick=\{\(\) => window\.location\.assign\(workspaceUrl\)\}/);
  assert.match(workspace, /<Switch/);
  assert.match(workspace, /updateWorkspace\.mutateAsync/);
  assert.doesNotMatch(workspace, /t\("Open class", "Mở lớp"\)/);
  assert.doesNotMatch(workspace, /Active · read only/);
  assert.match(workspace, /course\.modules\.some\(\(module\) => module\.items\.length === 0\)/);
  assert.match(workspace, /Complete Course setup/);
});

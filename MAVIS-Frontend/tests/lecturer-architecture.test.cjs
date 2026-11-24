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
  assert.match(policy, /canManageGrades: canOperateClass/);
  assert.match(policy, /canManageStudents: canOperateClass/);
  assert.match(policy, /canManageSettings: canOperateClass/);
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
  assert.match(lesson, /!embedded \?/);
  assert.match(quiz, /currentStep="quiz"/);
  assert.doesNotMatch(quiz, /flow.*first-setup/);
  assert.match(lab, /currentStep="lab"/);
  assert.doesNotMatch(lab, /LabTheorySection|id: "theory"|Lab theory/);
  assert.match(lesson, /theory-assets\/import-file/);
  assert.match(lesson, /theory-assets\/import-url/);
  assert.match(lesson, /Smart Format/);
  assert.match(workspace, /currentStep=\{requestedFlowStep\}/);
  assert.doesNotMatch(workspace, /CourseFirstSetupFlow/);
  assert.match(workspace, /\/references\?workspace=\$\{encodeURIComponent\(workspace\.id\)\}&from=first-setup/);
});

test("Active Lecturer courses lock Overview authoring but keep Grades, Students and Settings operational", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  const submissions = read("src/features/submissions/screens.tsx");
  const labs = read("src/features/assignments/screens.tsx");
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const courseBuilder = read("src/features/courses/course-builder.tsx");
  assert.match(workspace, /disabled=\{remove\.isPending \|\| !courseAccess\.canManageStudents\}/);
  assert.match(submissions, /!courseAccess\.canManageGrades/);
  assert.match(workspace, /<WorkspaceControls[\s\S]*mode="overview"/);
  assert.match(workspace, /activeTab === "authoring" && canManage && canEdit/);
  assert.match(workspace, /canCreateModules=\{courseAccess\.canCreateModules\}/);
  assert.match(labs, /courseAccess\.canCreateLabs &&/);
  assert.match(authoring, /!assignment && !courseAccess\.canCreateLabs/);
  assert.match(courseBuilder, /if \(!canCreateModules\) return/);
  assert.match(courseBuilder, /t\("Publish Changes", "Công bố khóa học"\)/);
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

test("Commit #05 completes 6-step Lecturer setup with curated repos, lesson/quiz libraries and studio essay config", () => {
  const sourcePicker = read("src/features/assignments/source-picker.tsx");
  const refManage = read("src/features/workspaces/reference-manage.tsx");
  const theoryLib = read("src/features/workspaces/theory-library.tsx");
  const quizLib = read("src/features/courses/quiz-library.tsx");
  const labAuthoring = read("src/features/assignments/lab-authoring.tsx");
  const labInfo = read("src/features/assignments/lab-info-form.tsx");

  for (const repoName of [
    "Moc-Huong-Shop",
    "mavis-commerce-seed",
    "fruit-shop-dotnet-microservices",
    "mavis-studio-live-demo",
    "mavis-studio-live-seed",
  ]) {
    assert.ok(sourcePicker.includes(repoName), `Missing curated repo ${repoName}`);
  }
  assert.match(sourcePicker, /otherWorkspaceProjects/);
  assert.match(refManage, /CURATED_SAMPLE_REPOS/);
  assert.match(theoryLib, /course-curriculum/);
  assert.match(theoryLib, /theory-assets\/reusable/);
  assert.match(theoryLib, /Smart Format/);
  assert.match(quizLib, /quiz-assets\/catalog/);
  assert.match(quizLib, /staticDiagramQuizTemplate/);
  assert.match(quizLib, /<QuizBuilder/);
  assert.doesNotMatch(labAuthoring, /LabQuizSection|id: "quiz"|LabTheorySection/);
  assert.match(labInfo, /essayPrompts/);
});

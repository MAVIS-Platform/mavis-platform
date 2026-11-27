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
  const workspaceOverview = workspace.slice(
    workspace.indexOf("export function WorkspaceOverview"),
    workspace.indexOf("export function WorkspaceMembers"),
  );
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  const navigation = read("src/lib/navigation.ts");
  const hub = read("src/features/courses/course-content-hub.tsx");
  const flowNavigation = read("src/features/courses/course-setup-flow-navigation.tsx");
  const referenceManager = read("src/features/workspaces/reference-manage.tsx");
  const lesson = read("src/features/workspaces/theory-library.tsx");
  const quiz = read("src/features/courses/quiz-library.tsx");
  const lab = read("src/features/assignments/lab-authoring.tsx");
  const courseBuilder = read("src/features/courses/course-builder.tsx");
  const courseOutline = read("src/features/courses/course-outline.tsx");
  assert.doesNotMatch(shell, /en: "Modules"|en: "Labs"/);
  assert.doesNotMatch(navigation, /label: "Modules"|label: "Labs"/);
  assert.match(hub, /Add Repository/);
  assert.match(hub, /Add Lesson/);
  assert.match(hub, /Add Quiz/);
  assert.match(hub, /Add Lab/);
  assert.doesNotMatch(hub, /Update Course/);
  assert.match(flowNavigation, /Repository/);
  assert.match(flowNavigation, /Lesson/);
  assert.match(flowNavigation, /Quiz/);
  assert.match(flowNavigation, /MAVIS Studio Lab/);
  assert.match(flowNavigation, /Update Course/);
  assert.match(flowNavigation, /Publish Changes/);
  assert.match(flowNavigation, /Back to Add content/);
  assert.match(flowNavigation, /Next:/);
  assert.match(flowNavigation, /flowMode: CourseSetupFlowMode = "content"/);
  assert.match(flowNavigation, /flowMode === "setup"/);
  assert.doesNotMatch(flowNavigation, /Course content flow|Add content and update your course/);
  assert.match(referenceManager, /onAnalysisComplete/);
  assert.match(referenceManager, /toast\.success/);
  assert.match(referenceManager, /flowMode === "setup" \? "lesson" : "arrange"/);
  assert.match(referenceManager, /CourseSetupFlowFrame/);
  assert.match(lesson, /CourseSetupFlowFrame/);
  assert.match(quiz, /CourseSetupFlowFrame/);
  assert.doesNotMatch(quiz, /flow.*first-setup/);
  assert.match(lab, /CourseSetupFlowFrame/);
  assert.doesNotMatch(lab, /LabTheorySection|id: "theory"|Lab theory/);
  assert.match(lesson, /theory-assets\/import-file/);
  assert.match(lesson, /theory-assets\/import-url/);
  assert.match(lesson, /Smart Format/);
  assert.match(workspace, /currentStep=\{requestedFlowStep\}/);
  assert.match(workspace, /contentStep=\{contentStep\}/);
  assert.doesNotMatch(workspace, /CourseFirstSetupFlow/);
  assert.doesNotMatch(workspaceOverview, /Start course setup|Bắt đầu thiết lập khóa học/);
  assert.match(
    courseOutline,
    /courseSetupStepHref\(workspaceId, "repository", undefined, "setup"\)/,
  );
  assert.match(courseOutline, /Click to start setting up your course/);
  assert.doesNotMatch(workspaceOverview, /Review submissions|Update Course/);
  assert.match(courseBuilder, /isPublishStep/);
  assert.match(courseBuilder, /window\.location\.assign/);
  assert.match(courseBuilder, /workspace-overview\?workspace=/);
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

test("Active Lecturer Overview uses nested view-only previews without student learning actions", () => {
  const manager = read("src/features/courses/lecturer-curriculum-manager.tsx");
  const outline = read("src/features/courses/course-outline.tsx");
  const preview = read("src/features/courses/lecturer-active-course-preview.tsx");

  assert.match(manager, /lecturerPreview=\{active\}/);
  assert.match(outline, /<LecturerActiveCoursePreview/);
  assert.match(preview, /function LecturerReadOnlyQuizPreview/);
  assert.match(preview, /aria-controls=\{`lecturer-preview-module-/);
  assert.match(preview, /aria-controls=\{`lecturer-preview-item-/);
  assert.match(preview, /t\("View only", "Chỉ xem"\)/);
  assert.match(preview, /assignment\?\.instructions\?\.trim\(\)/);
  assert.match(preview, /<MarkdownPreview markdown=\{assignment\.instructions\}/);
  assert.doesNotMatch(preview, /ChapterQuizRunner|CourseEssayItemPanel|href=|useMutation/);
});

test("Add content uses a modal for Lesson, Quiz and Runtime Practice with event errors", () => {
  const courseBuilder = read("src/features/courses/course-builder.tsx");
  assert.match(courseBuilder, /function AddContentDialog/);
  assert.match(courseBuilder, /Add content to this milestone/);
  assert.match(courseBuilder, /Practice · Studio Lab/);
  assert.match(courseBuilder, /C1–C3 Architecture Theory/);
  assert.match(courseBuilder, /referenceVersions/);
  assert.match(courseBuilder, /Select Quiz/);
  assert.match(courseBuilder, /assignment\.requireRuntimeTrace/);
  assert.doesNotMatch(courseBuilder, /Require a student explanation|Assignment requirements/);
  assert.match(courseBuilder, /managed in MAVIS Studio/);
  assert.match(courseBuilder, /Due date \(optional\)/);
  assert.match(courseBuilder, /Estimated duration \(min\)/);
  assert.match(courseBuilder, /role="alert"/);
  assert.match(courseBuilder, /toast\.success/);
  assert.match(courseBuilder, /toast\.error/);
  assert.doesNotMatch(courseBuilder, /isDraft && addingItemModule \? \(/);
});

test("Publish Changes reports actionable Module and learning-item validation errors", () => {
  const courseBuilder = read("src/features/courses/course-builder.tsx");
  const apiErrors = read("src/lib/errors/api-error.ts");
  assert.match(courseBuilder, /function collectPublishIssues/);
  assert.match(courseBuilder, /has no learning content/);
  assert.match(courseBuilder, /Complete these items before publishing/);
  assert.match(courseBuilder, /Course is not ready to publish/);
  assert.match(courseBuilder, /<Dialog open=\{publishErrorOpen\}/);
  assert.doesNotMatch(courseBuilder, /publishIssues\.length > 0 && \(\s*<div/);
  assert.match(courseBuilder, /setPublishIssues\(\[message\]\)/);
  assert.match(apiErrors, /COURSE_MODULE_EMPTY/);
  assert.match(apiErrors, /COURSE_STUDIO_TOPOLOGY/);
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
  assert.doesNotMatch(shell, /t\("Switch class", "Chọn lớp"\)/);
  assert.doesNotMatch(shell, /t\("Quick switch class", "Chuyển nhanh lớp học"\)/);
});

test("Course Management filters Archived classes separately from Inactive classes", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  assert.match(workspace, /"all" \| "active" \| "inactive" \| "archived"/);
  assert.match(workspace, /statusFilter === "inactive" && status !== "INACTIVE"/);
  assert.match(workspace, /statusFilter === "archived" && status !== "ARCHIVED"/);
  assert.match(workspace, /t\("Archived", "Đã lưu trữ"\)/);
  assert.match(workspace, /Reopen this archived course/);
});

test("opening a notification decrements unread count without removing notification history", () => {
  const {
    applyOptimisticNotificationRead,
  } = require("../src/features/notifications/read-cache.ts");
  const unread = { id: "unread", createdAt: "2026-11-27T09:00:00Z", readAt: null };
  const data = {
    items: [unread],
    total: 5,
    unreadCount: 5,
    page: 0,
    size: 5,
    asOf: "2026-11-27T10:00:00Z",
  };
  const next = applyOptimisticNotificationRead(
    data,
    { page: 0, size: 5, unreadOnly: false },
    "unread",
    "2026-11-27T10:01:00Z",
  );
  assert.equal(next.unreadCount, 4);
  assert.equal(next.total, 5);
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].readAt, "2026-11-27T10:01:00Z");
  assert.equal(
    applyOptimisticNotificationRead(
      next,
      { page: 0, size: 5, unreadOnly: false },
      "unread",
      "2026-11-27T10:02:00Z",
    ),
    next,
  );
});

test("Lecturer course cards open directly and own an Active-Inactive lifecycle toggle", () => {
  const workspace = read("src/features/workspaces/screens.tsx");
  assert.match(workspace, /role="link"/);
  assert.match(workspace, /onClick=\{\(\) => window\.location\.assign\(workspaceUrl\)\}/);
  assert.match(workspace, /<Switch/);
  assert.match(workspace, /updateWorkspace\.mutateAsync/);
  assert.doesNotMatch(workspace, /t\("Open class", "Mở lớp"\)/);
  assert.doesNotMatch(workspace, /t\("Submissions", "Bài nộp"\)/);
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
  assert.match(refManage, /useApiMutation\("publishReference"\)/);
  assert.match(refManage, /onAnalysisComplete=\{\(\{ projectId, snapshotId \}\) =>/);
  assert.match(refManage, /publishReference\.mutate/);
  assert.match(theoryLib, /course-curriculum/);
  assert.match(theoryLib, /theory-assets\/reusable/);
  assert.match(theoryLib, /Smart Format/);
  assert.match(quizLib, /quiz-assets\/catalog/);
  assert.match(quizLib, /staticDiagramQuizTemplate/);
  assert.match(quizLib, /<QuizBuilder/);
  assert.doesNotMatch(labAuthoring, /LabQuizSection|id: "quiz"|LabTheorySection/);
  assert.doesNotMatch(labInfo, /essayPrompts|Essay & Rubric Prompts|Due date/);
  assert.match(labInfo, /Description \(optional, Markdown\)/);
});

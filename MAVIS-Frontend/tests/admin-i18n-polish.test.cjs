const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

test("Wave 2: lecturer sidebar submenus and admin health messages have Vietnamese translations", () => {
  const locale = read("src/lib/i18n/locale-context.tsx");
  const requiredKeys = [
    '"Overview & Setup":',
    '"Curriculum & Materials":',
    '"Grading & Gradebook":',
    '"Students & Access":',
    '"Responding to authenticated requests.":',
    '"Connection validation succeeded.":',
    '"Readiness endpoint responded successfully.":',
    '"Storage volume is accessible.":',
    '"Execution Profiles":',
    '"Live Sessions & Force-Stop":',
    '"AI Quotas & Integrations":',
    '"Create Account":',
  ];
  for (const key of requiredKeys) {
    assert.ok(locale.includes(key), `Missing VI dictionary entry: ${key}`);
  }
});

test("Wave 2: student contextual sidebar hides duplicate group heading", () => {
  const shell = read("src/components/app-shell.tsx");
  assert.match(shell, /hideGroupHeading=\{role === "student" && scope === "workspace"\}/);
  assert.match(shell, /\{!collapsed && !hideGroupHeading && \(/);
});

test("Wave 2: Admin Control Center unifies Hero surface and uses calm high-contrast KPI cards", () => {
  const ops = read("src/features/administration/operations.tsx");
  assert.match(ops, /<section className="mavis-hero-surface p-6 text-white">/);
  assert.doesNotMatch(ops, /from-indigo-600 to-indigo-800/);
  assert.doesNotMatch(ops, /from-rose-600 to-rose-800/);
  assert.match(ops, /border-t-4 border-t-primary bg-card/);
  assert.match(ops, /border-t-4 border-t-rose-500 bg-card/);
  assert.match(ops, /border-t-4 border-t-sky-500 bg-card/);
  assert.match(ops, /border-t-4 border-t-emerald-500 bg-card/);
  assert.match(ops, /export function SystemHealth\(\) \{\s*const \{ t \} = useLocale\(\);/);
  assert.match(ops, /export function AdminRuntimeSummary\(\) \{\s*const \{ t \} = useLocale\(\);/);
});

test("Wave 2: Admin Accounts & RuntimeProfiles fix double-plus bug and localize controls", () => {
  const screens = read("src/features/administration/screens.tsx");
  assert.doesNotMatch(screens, /"\+ Create Account"/);
  assert.match(screens, /t\("Create Account", "Tạo tài khoản"\)/);
  assert.match(screens, /t\("Close form", "Đóng biểu mẫu"\)/);
  assert.match(screens, /t\("Execution Profiles", "Hồ sơ thực thi Runtime"\)/);
  assert.match(screens, /t\("Live Sessions & Force-Stop", "Phiên chạy thực tế & Dừng khẩn cấp"\)/);
  assert.match(screens, /t\("AI Quotas & Integrations", "Hạn mức AI & Tích hợp"\)/);
});

test("Wave 2: Passkey CRUD table action buttons stay single-line with whitespace-nowrap", () => {
  const courseAccess = read("src/features/workspaces/course-access.tsx");
  assert.match(courseAccess, /className="whitespace-nowrap px-4 py-3"/);
  assert.match(courseAccess, /openDialog\("renew"\)/);
});

test("Wave 3: status labels normalize TIMED_OUT/TIMEDOUT without underscores while keeping formatStatusLabel intact", () => {
  const ts = require("typescript");
  const mod = { exports: {} };
  const compiled = ts.transpileModule(read("src/lib/status-label.ts"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("module", "exports", compiled)(mod, mod.exports);

  const { formatStatusLabel, translatedStatusLabel } = mod.exports;
  assert.equal(formatStatusLabel("READY_FOR_DISPATCH"), "Ready_for_dispatch");
  assert.equal(translatedStatusLabel("TIMED_OUT", (s) => s), "Timed out");
  assert.equal(translatedStatusLabel("TIMEDOUT", (s) => s), "Timed out");
  assert.equal(translatedStatusLabel("READY_FOR_DISPATCH", (s) => s), "Ready for dispatch");
  assert.equal(
    translatedStatusLabel("TIMED_OUT", (s) => (s === "Timed out" ? "Quá thời gian chờ" : s)),
    "Quá thời gian chờ",
  );
});

test("Wave 3: StatusBadge prevents multi-line wrapping and Pagination localizes Next button", () => {
  const data = read("src/components/shared/data.tsx");
  const forms = read("src/components/shared/forms.tsx");
  assert.match(data, /<Badge[^>]*className="whitespace-nowrap"/);
  assert.match(forms, /t\("Next",\s*"Trang sau"\)/);
});

test("Wave 3: Announcements, inbox, AppShell avatar contrast, and nested main fixes are in place", () => {
  const announcements = read("src/features/administration/announcements.tsx");
  const inbox = read("src/features/notifications/inbox.tsx");
  const appShell = read("src/components/app-shell.tsx");
  const labAuthoring = read("src/features/assignments/lab-authoring.tsx");

  assert.match(announcements, /useLocale\(/);
  assert.match(inbox, /useLocale\(/);
  assert.match(appShell, /bg-primary text-primary-foreground/);
  assert.match(appShell, /"Grades"/);
  assert.match(appShell, /"My Grades & Submissions"/);
  assert.doesNotMatch(labAuthoring, /<main\b/);
});

test("Bug #04: CourseWorkspaceShell header omits duplicate passkey pill, keeps localized status, and Settings default Passkey label is localized", () => {
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.doesNotMatch(shell, /ClassHeaderPasskey/);
  assert.match(shell, /t\("Active", "Đang hoạt động"\)/);
  assert.match(shell, /t\("Archived", "Đã lưu trữ"\)/);
  assert.match(access, /t\("Class Passkey", "Passkey lớp học"\)/);
});

test("Bug #08: workspaces exposes an h1 landmark, singular/plural counts avoid '1 students'/'1 Labs', and Admin createdAt separates date/time", () => {
  const ws = read("src/features/workspaces/screens.tsx");
  const pages = read("src/features/courses/mavis-pages.tsx");
  const admin = read("src/features/administration/screens.tsx");

  assert.match(ws, /<h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">/);
  assert.match(ws, /students === 1 \? t\("student", "sinh viên"\) : t\("students", "sinh viên"\)/);
  assert.match(ws, /totalLabs === 1 \? t\("Lab", "Lab"\) : t\("Labs", "Labs"\)/);
  assert.match(pages, /course\.labCount === 1 \? t\("Lab", "bài Lab"\) : t\("Labs", "bài Lab"\)/);
  assert.match(admin, /date\.toLocaleDateString\("vi-VN"\)\}<\/span>\{" "\}/);
});

test("Bug #09: CourseBuilder uses single-scroll accordion with slide-over drawer and Passkey table compacts padding with truncated labels", () => {
  const builder = read("src/features/courses/course-builder.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.match(builder, /fixed inset-0 z-50 flex justify-end bg-black\/40/);
  assert.match(builder, /role="dialog"/);
  assert.match(builder, /overflow-x-auto rounded-lg border bg-background p-4/);
  assert.match(access, /className="whitespace-nowrap px-4 py-3 text-muted-foreground"/);
  assert.match(access, /className="px-4 py-2 font-medium"/);
});

test("Bug #10: Admin Health diagnostics and Accounts filter controls are localized in EN/VI dictionary", () => {
  const ops = read("src/features/administration/operations.tsx");
  const admin = read("src/features/administration/screens.tsx");
  const locale = read("src/lib/i18n/locale-context.tsx");

  assert.match(ops, /\{t\(data\.scope\)\}/);
  assert.match(ops, /\{t\(w\)\}/);
  assert.match(admin, /label=\{t\("Search name or email"/);
  assert.match(admin, /label=\{t\("Account status"/);
  assert.match(locale, /"Application API":\s*"API Ứng dụng"/);
  assert.match(locale, /host-wide metrics and workload Runner are not probed\./);
  assert.match(locale, /gVisor \(runsc\) not installed on host/);
});

test("Bug #16: AppShell cancels active React Query requests before sign-out", () => {
  const shell = read("src/components/app-shell.tsx");

  assert.match(
    shell,
    /async function logout\(\)\s*\{[\s\S]*?await queryClient\.cancelQueries\(\);\s*await signOut\.mutateAsync\(\{\}\);/,
  );
});

test("Lecturer UX Pack 1: single-line breadcrumbs & class tabs, Google mark isolation, Passkey copy feedback, Step 5 Templates CTA, Finish tooltip, Curriculum scroll, Members loading, SpeedGrader Next & quick score", () => {
  const page = read("src/components/layout/page.tsx");
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  const social = read("src/features/auth/social-sign-in.tsx");
  const access = read("src/features/workspaces/course-access.tsx");
  const assignments = read("src/features/assignments/screens.tsx");
  const studioSection = read("src/features/assignments/lab-studio-section.tsx");
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");
  const builder = read("src/features/courses/course-builder.tsx");
  const workspaces = read("src/features/workspaces/screens.tsx");
  const subScreens = read("src/features/submissions/screens.tsx");
  const grading = read("src/features/submissions/grading.tsx");
  const subComponents = read("src/features/submissions/components.tsx");

  assert.match(page, /overflow-hidden whitespace-nowrap/);
  assert.match(shell, /flex w-max min-w-full flex-nowrap items-center gap-1/);
  assert.match(social, /\[clip-path:circle\(50%\)\]/);
  assert.match(social, /colorScheme: "light"/);
  assert.match(access, /copiedId === current\.id \? t\("Copied!", "Đã sao chép!"\) : current\.code/);
  assert.match(assignments, /xl:flex-row xl:items-center xl:justify-between/);
  assert.match(studioSection, /Open Visual Studio Builder/);
  assert.doesNotMatch(studioSection, /Configure Exercise & Templates/);
  assert.doesNotMatch(studioSection, /1-Click Exercise Templates/);
  assert.match(workbench, /finishDisabledReason/);
  assert.match(builder, /scrollIntoView\(\{ behavior: "smooth", block: "nearest" \}\)/);
  assert.match(workspaces, /gradebookLoading/);
  assert.match(subScreens, /Next pending/);
  assert.match(grading, /applyScoreToAllSnapshots/);
  assert.doesNotMatch(subComponents, /Technical verification IDs & digests/);
});

test("Council Scope Gap Pack: THEORY_ONLY Markdown reader, Admin Test Connection, and VI parity", () => {
  const courses = read("src/features/courses/screens.tsx");
  const admin = read("src/features/administration/screens.tsx");
  const locale = read("src/lib/i18n/locale-context.tsx");
  const subScreens = read("src/features/submissions/screens.tsx");
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");

  assert.match(courses, /Lesson & Reading Material/);
  assert.match(courses, /<MarkdownPreview markdown=\{labInstructions\} \/>/);
  assert.match(admin, /useApiMutation\("testIntegration"\)/);
  assert.match(admin, /Test connection/);
  assert.match(admin, /adminRuntimeHealth/);
  assert.match(locale, /"Grading · SpeedGrader":\s*"Chấm bài · Chấm nhanh"/);
  assert.match(locale, /"Submission Review":\s*"Đánh giá bài nộp"/);
  assert.match(locale, /"Submissions Queue":\s*"Danh sách chờ chấm"/);
  assert.match(locale, /"Loading evidence":\s*"Đang tải minh chứng"/);
  assert.match(subScreens, /label=\{t\("Search submissions", "Tìm kiếm bài nộp"\)\}/);
  assert.match(workbench, /t\("Finish Studio", "Kết thúc Studio"\)/);
  assert.match(workbench, /t\("Service Telemetry", "Thông số Dịch vụ"\)/);
});

test("Coursera Profile & Unified Avatar System: UserAvatar everywhere, AvatarStudioDialog cropper, BFF avatar routes, and bounded projectOverviews", () => {
  const userAvatar = read("src/components/shared/user-avatar.tsx");
  const avatarDialog = read("src/features/profile/avatar-studio-dialog.tsx");
  const profile = read("src/features/profile/profile.tsx");
  const appShell = read("src/components/app-shell.tsx");
  const workspaces = read("src/features/workspaces/screens.tsx");
  const admin = read("src/features/administration/screens.tsx");
  const backendPath = read("src/lib/api/backend-path.ts");
  const domain = read("src/types/domain.ts");

  assert.match(userAvatar, /referrerPolicy="no-referrer"/);
  assert.match(userAvatar, /onError=\{\(\) => setBroken\(true\)\}/);
  assert.match(avatarDialog, /\/api\/backend\/auth\/me\/avatar/);
  assert.match(avatarDialog, /image\/webp/);
  assert.match(profile, /<AvatarStudioDialog/);
  assert.match(profile, /lg:grid-cols-\[minmax\(0,1fr\)_18rem\]/);
  assert.doesNotMatch(profile, /Classes Teaching|Enrolled Courses/);
  assert.match(appShell, /<UserAvatar[\s\S]*avatarUrl=\{avatarUrl\}/);
  assert.match(workspaces, /<UserAvatar name=\{m\.name\} avatarUrl=\{m\.avatarUrl\}/);
  assert.match(admin, /<UserAvatar name=\{a\.name\} avatarUrl=\{a\.avatarUrl\}/);
  assert.ok(backendPath.includes("auth\\/(?:login|me(?:\\/avatar)?|avatars\\/[a-f0-9-]+)"));
  assert.match(domain, /export const avatarUrlSchema/);
});

test("Task #02 i18n parity: Notifications localize completely in VI, 'all'/'All' maps cleanly to 'Tất cả', and Admin/Lab badges are localized", () => {
  const { localizeNotification } = require("../src/features/notifications/localize.ts");
  const locale = read("src/lib/i18n/locale-context.tsx");
  const inbox = read("src/features/notifications/inbox.tsx");
  const admin = read("src/features/administration/screens.tsx");
  const courses = read("src/features/courses/screens.tsx");
  const components = read("src/features/architecture/components.tsx");

  const unlocked = localizeNotification(
    { title: "Next Lab unlocked", body: "Lab 02: Circuit Breaker is now available." },
    "vi",
  );
  assert.equal(unlocked.title, "Bài Lab tiếp theo đã được mở khóa");
  assert.match(unlocked.body, /hiện đã được mở khóa/);

  const published = localizeNotification(
    { title: "Course Published: SWD392 Java", body: "Submission received" },
    "vi",
  );
  assert.equal(published.title, "Khóa học đã xuất bản: SWD392 Java");

  const runtimeNotice = localizeNotification(
    {
      title: "Runtime session updated",
      body: "OrderPlatform. Execution: COMPLETED. Review evidence and cleanup.",
    },
    "vi",
  );
  assert.equal(runtimeNotice.title, "Phiên thực nghiệm Runtime đã cập nhật");
  assert.match(runtimeNotice.body, /Trạng thái thực thi: Hoàn tất/);

  const enNotice = localizeNotification(
    { title: "Submission received", body: "Your assignment submission has been saved." },
    "en",
  );
  assert.equal(enNotice.title, "Submission received");

  assert.match(inbox, /localizeNotification\(item, locale\)/);
  assert.match(locale, /\ball:\s*"Tất cả"/);
  assert.match(locale, /\bAll:\s*"Tất cả"/);
  assert.match(locale, /"Announcement Management":\s*"Quản lý Thông báo"/);
  assert.match(admin, /formatAuditActionLabel/);
  assert.doesNotMatch(courses, /chuyển Lab sang WF-04|sẵn sàng cho WF-04/);
  assert.match(components, /"Tất cả tầng kiến trúc"/);
});

test("Task #06 modern Profile: social hero cover, Back navigation, single-line Role badge, non-truncating stats, and no external URL field", () => {
  const profile = read("src/features/profile/profile.tsx");

  assert.match(profile, /Social profile header/);
  assert.match(profile, /<ArrowLeft/);
  assert.match(profile, /whitespace-nowrap/);
  assert.doesNotMatch(profile, /Advanced: Use an external image URL/);
  assert.doesNotMatch(profile, /<dt className="truncate/);
});

test("Task #07 Navigation & Layout: SectionHeader supports backHref, /submissions/[id] avoids raw UUID crumb, Lecturer breadcrumb targets workspace-overview, and /lab removes sticky overlap", () => {
  const page = read("src/components/layout/page.tsx");
  const subDetail = read("app/submissions/[submissionId]/page.tsx");
  const notifPage = read("app/notifications/page.tsx");
  const appShell = read("src/components/app-shell.tsx");
  const courses = read("src/features/courses/screens.tsx");
  const wsShell = read("src/features/courses/course-workspace-shell.tsx");

  assert.match(page, /backHref\?:/);
  assert.doesNotMatch(subDetail, /contextName=\{submissionId\}/);
  assert.doesNotMatch(subDetail, /backHref="\/submissions"/);
  assert.match(notifPage, /backHref="\/"/);
  assert.match(appShell, /\/workspace-overview\?workspace=\$\{encodeURIComponent\(selectedWorkspaceId\)\}/);
  assert.match(wsShell, /Back to classes/);
  assert.doesNotMatch(courses, /<LabToc/);
  assert.doesNotMatch(courses, /lg:grid-cols-\[276px_minmax\(0,1fr\)\]/);
  assert.match(courses, /<Sheet open=\{tocOpen\}/);
  assert.doesNotMatch(courses, /sticky bottom-3/);
  assert.match(courses, /id="lab-switcher"[\s\S]*sm:min-w-\[240px\] sm:max-w-\[380px\]/);
});

test("Task #09 i18n, Modal Overlay & Navigation Polish: Inspector Evidence localized, double-escaped generics decoded, CourseBuilder prefix deduplicated, and Admin tabs/AppShell fixed", () => {
  const { decodePlainTextEntities } = require("../src/lib/format/course-display.ts");
  assert.equal(decodePlainTextEntities("Cấu hình phân tán với IOptions&amp;lt;T&gt;"), "Cấu hình phân tán với IOptions<T>");
  assert.equal(decodePlainTextEntities("Cấu hình phân tán với IOptions&amp;lt;T>"), "Cấu hình phân tán với IOptions<T>");
  assert.equal(decodePlainTextEntities("&amp;lt;script&amp;gt;"), "&lt;script&gt;");

  const archComp = read("src/features/architecture/components.tsx");
  const appShell = read("src/components/app-shell.tsx");
  const adminScreens = read("src/features/administration/screens.tsx");
  const builder = read("src/features/courses/course-builder.tsx");
  const dialog = read("src/components/ui/dialog.tsx");
  const teacherDash = read("src/features/workspaces/teacher-dashboard.tsx");

  assert.match(archComp, /t\(\s*"No evidence is attached directly to this element\."/);
  assert.match(archComp, /Evidence for related relationships/);
  assert.match(appShell, /reviewSubmissionId/);
  assert.match(appShell, /"Modules"/);
  assert.match(adminScreens, /role="tab"[\s\S]*aria-selected=\{tab === "profiles"\}/);
  assert.match(builder, /\^\(\?:Module\|Chương\)\\s\*\\d\+/);
  assert.match(dialog, /backdrop-blur-xs/);
  assert.match(teacherDash, /decodePlainTextEntities\(workspace\.description\)/);
});

test("Task #11 Final Polish: NOT_APPLICABLE Cleanup translates cleanly in EN/VI and Breadcrumbs filter empty labels & protect current-page width", () => {
  const { translatedStatusLabel } = require("../src/lib/status-label.ts");
  const locale = read("src/lib/i18n/locale-context.tsx");
  const pageLayout = read("src/components/layout/page.tsx");
  const appShell = read("src/components/app-shell.tsx");

  assert.match(locale, /"Not applicable":\s*"Không áp dụng"/);
  assert.match(locale, /NOT_APPLICABLE:\s*"Không áp dụng"/);
  assert.equal(
    translatedStatusLabel("NOT_APPLICABLE", (s) => (s === "Not applicable" || s === "NOT_APPLICABLE" ? "Không áp dụng" : s)),
    "Không áp dụng",
  );
  assert.equal(
    translatedStatusLabel("NOT_APPLICABLE", (s) => s),
    "Not applicable",
  );

  assert.match(pageLayout, /const visibleItems = items\.filter/);
  assert.match(pageLayout, /isLast\s*\?\s*"flex min-w-24 flex-1"/);
  assert.match(appShell, /hidden h-8 max-w-40[\s\S]*lg:inline-flex/);
});

test("Task #12 Admin Runtime Sessions Timeout: backend-adapter grants runtimeReadSessions 60s budget", () => {
  const backendAdapter = read("src/lib/api/backend-adapter.ts");
  assert.match(backendAdapter, /"contextCandidates",\s*"runtimeReadSessions",\s*\]\.includes\(operation\)\s*\?\s*60000/);
});

test("Task #13 Studio Snapshot Sync, Zero-Snapshot Submit Guard, Live Stats & Copy Polish", () => {
  const cachePolicy = read("src/lib/api/cache-policy.ts");
  const studioHook = read("src/features/runtime/use-studio-session.ts");
  const labSubmission = read("src/features/courses/lab-submission-v2.tsx");
  const courseScreens = read("src/features/courses/screens.tsx");
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");

  assert.match(cachePolicy, /studioCapture:\s*\["studioState"/);
  assert.match(cachePolicy, /studioFinish:\s*\[\s*"studioState"/);
  assert.match(
    studioHook,
    /captureSnapshot[\s\S]*queryClient\.invalidateQueries\(\{\s*queryKey:\s*\["api",\s*"studioState",\s*\{\s*sessionId\s*\}\]\s*\}\)/,
  );
  assert.match(studioHook, /captureSnapshot[\s\S]*student-lab-studio-sessions/);

  assert.match(courseScreens, /capturedSnapshotCount=\{/);
  assert.match(labSubmission, /missingStudioSnapshot/);
  assert.match(labSubmission, /disabled=\{submit\.isPending \|\| missingStudioSnapshot\}/);
  assert.doesNotMatch(labSubmission, /WF-04 readiness|DS-04b|QA \/ Demo Dossier Presets/);

  assert.match(workbench, /hasAnyReplicaSample/);
  assert.match(workbench, /Live Docker running — awaiting probe traffic/);
});

test("Commit #04 i18n copy polish simplifies roles, hides unclassified layer and removes internal spec codes", () => {
  const { roleLabels } = require("../src/lib/navigation.ts");
  const archComp = read("src/features/architecture/components.tsx");
  const grading = read("src/features/submissions/grading.tsx");
  const step2 = read("src/features/courses/step2-static-impact.tsx");
  const courseBuilder = read("src/features/courses/course-builder.tsx");
  const flowNav = read("src/features/courses/course-setup-flow-navigation.tsx");

  assert.deepEqual(roleLabels, {
    student: "Student",
    lecturer: "Lecturer",
    admin: "Admin",
  });
  assert.match(archComp, /if \(key === "unclassified"\) return null/);
  assert.match(archComp, /domain:\s*\{\s*en:\s*"Domain",\s*vi:\s*"Nghiệp vụ"\s*\}/);
  assert.match(archComp, /edge:\s*\{\s*en:\s*"Edge",\s*vi:\s*"Cổng biên"\s*\}/);
  assert.match(archComp, /formatArchitectureLayerLabel\(element\.layer, t\)/);
  assert.match(courseBuilder, /Công bố khóa học/);
  assert.match(flowNav, /Công bố khóa học/);
  assert.doesNotMatch(grading, /5\.01|BR-10/);
  assert.doesNotMatch(step2, /DS-03b/);
});

test("Commit #07 streamlines 1-click avatar upload, removes unavailable services stat, and unifies MavisShell header profile", () => {
  const profile = read("src/features/profile/profile.tsx");
  const mavisShell = read("src/components/mavis-shell.tsx");

  assert.doesNotMatch(profile, /Services indexed/);
  assert.doesNotMatch(profile, /Profile Photo/);
  assert.match(profile, /Click to change or remove photo/);
  assert.match(profile, /grid-cols-3/);
  assert.match(mavisShell, /UserAvatar/);
  assert.match(mavisShell, /DropdownMenu/);
  assert.match(mavisShell, /Sign out/);
});

test("Commit #08 scopes notification categories by role and coalesces duplicate notification items", () => {
  const inbox = read("src/features/notifications/inbox.tsx");
  assert.match(inbox, /export function visibleCategoriesForRole/);
  assert.match(inbox, /if \(role === "student"\)[\s\S]*c\.value !== "SYSTEM" && c\.value !== "ANALYSIS"/);
  assert.match(
    inbox,
    /if \(role === "lecturer"\)[\s\S]*c\.value === "" \|\| c\.value === "SUBMISSION"/,
  );
  assert.match(inbox, /export function groupDuplicateNotifications/);
  assert.match(inbox, /visibleCategoriesForRole\(session\.data\?\.user\?\.role\)/);
  assert.match(inbox, /groupDuplicateNotifications\(items\)/);
  assert.match(inbox, /item\.duplicateCount > 1/);
});
test("Commit #10 strips legacy preview/CB tags across submission views, prevents profile stat word breaks, and cleans Quiz Gate copy", () => {
  const ts = require("typescript");
  const source = read("src/features/submissions/submission-text.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", compiled)(mod.exports, mod);
  const { stripLegacySubmissionNoise } = mod.exports;

  assert.equal(
    stripLegacySubmissionNoise(
      "[RubricPreview=8.8/10; CB=true; DBPerService=true; Idempotency=true] Clear answer\nScorePreview=8.8/10 (APPROVED_ELIGIBLE)",
    ),
    "Clear answer",
  );
  assert.equal(stripLegacySubmissionNoise("[CB=true; DBPerService=true; Idempotency=true]"), "");

  for (const rel of [
    "src/features/submissions/frozen-artifacts.tsx",
    "src/features/submissions/components.tsx",
    "src/features/submissions/grading.tsx",
    "src/features/submissions/studio-evidence.tsx",
  ]) {
    assert.match(read(rel), /stripLegacySubmissionNoise/, `${rel} must sanitize submission text`);
  }

  const profile = read("src/features/profile/profile.tsx");
  assert.match(profile, /break-normal/);

  const login = read("app/login/page.tsx");
  assert.doesNotMatch(login, /Quiz Gate/);

  const workspaces = read("src/features/workspaces/screens.tsx");
  assert.match(workspaces, /already published \(Active\)/);
});
test("E2E #05 Admin UI: keeps hero tabs single-row, preserves KPIs, deduplicates Refresh and sidebar heading", () => {
  const ops = read("src/features/administration/operations.tsx");
  const screens = read("src/features/administration/screens.tsx");
  const shell = read("src/components/app-shell.tsx");
  const useApi = read("src/hooks/use-api.ts");

  assert.match(ops, /flex flex-nowrap gap-1\.5 overflow-x-auto/);
  assert.match(ops, /showRefresh = true/);
  assert.match(ops, /placeholderData|staleTime: 60000/);
  assert.match(useApi, /placeholderData: \(previousData\) => previousData/);
  assert.match(screens, /showCreate \? \(\s*<X className="mr-1 size-4"/);
  assert.match(screens, /showRefresh=\{false\}/);
  assert.match(shell, /hideGroupHeading=\{role === "admin"\}/);
});

test("E2E #06 i18n parity: Admin diagnostics, 24h VI timestamps, audit actions, EN notifications, and course copy", () => {
  const ops = read("src/features/administration/operations.tsx");
  const screens = read("src/features/administration/screens.tsx");
  const locale = read("src/lib/i18n/locale-context.tsx");
  const builder = read("src/features/courses/course-builder.tsx");
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const notifySource = read("src/features/notifications/localize.ts");

  assert.match(ops, /toLocaleTimeString\(\s*locale === "vi" \? "vi-VN" : "en-US",\s*locale === "vi" \? \{ hour12: false \} : undefined/);
  assert.match(locale, /"REMOTE_WORKER mode without MAVIS_RUNNER_SANDBOX_REGISTRY: Dockerfile-built Labs need a shared registry so remote Worker VPSs can pull images\."/);
  assert.match(locale, /"Audit Records": "Nhật ký hệ thống & Quản trị"/);

  for (const actionKey of [
    "ADMIN_CREATE_USER",
    "AUTH_SUCCESS",
    "COURSE_ENROLLED",
    "COURSE_PASSKEY_CREATED",
    "TEST_INTEGRATION",
    "RUNTIME_FORCE_STOP",
  ]) {
    assert.ok(screens.includes(`${actionKey}:`), `Missing audit label for ${actionKey}`);
  }
  assert.doesNotMatch(screens, /CPU, RAM, timeout, đồng thời/);
  assert.doesNotMatch(screens, /nhà cung cấp hoặc model/);
  assert.match(screens, /function formatAdminProjectName/);

  const ts = require("typescript");
  const compiled = ts.transpileModule(notifySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", compiled)(mod.exports, mod);
  const { localizeNotificationBody } = mod.exports;

  assert.equal(
    localizeNotificationBody("Repository khóa học · reference. Open the result to review the outcome.", "en"),
    "Course repository · reference. Open the result to review the outcome.",
  );
  assert.equal(
    localizeNotificationBody("Repository khóa học · reference. Open the result to review the outcome.", "vi"),
    "Kho mã nguồn khóa học · tham chiếu. Mở kết quả để xem báo cáo phân tích chi tiết.",
  );

  assert.doesNotMatch(builder, /Chưa có phiên bản được publish\./);
  assert.doesNotMatch(syllabus, /Hãy vào Evidence & Submit trong Lab để nộp bài\./);
});

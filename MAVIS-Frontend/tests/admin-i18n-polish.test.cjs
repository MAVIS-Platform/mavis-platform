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
  assert.match(courseAccess, /flex flex-nowrap items-center justify-end gap-1/);
  assert.match(courseAccess, /className="h-7 whitespace-nowrap px-2 text-xs"/);
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
  assert.match(appShell, /"Grading & Gradebook"/);
  assert.match(appShell, /"My Grades & Submissions"/);
  assert.doesNotMatch(labAuthoring, /<main\b/);
});

test("Bug #04: CourseWorkspaceShell header status/key prefix and default Passkey label are localized", () => {
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.match(shell, /t\("Key", "Mã"\)/);
  assert.match(shell, /t\("Active", "Đang hoạt động"\)/);
  assert.match(shell, /t\("Archived", "Đã lưu trữ"\)/);
  assert.match(access, /item\.label === "Mã ghi danh lớp học" \|\| item\.label === "Class Passkey"/);
  assert.match(access, /t\("Class Passkey", "Mã ghi danh lớp học"\)/);
});

test("Bug #08: workspaces exposes an h1 landmark, singular/plural counts avoid '1 students'/'1 Labs', and Admin createdAt separates date/time", () => {
  const ws = read("src/features/workspaces/screens.tsx");
  const pages = read("src/features/courses/mavis-pages.tsx");
  const admin = read("src/features/administration/screens.tsx");

  assert.match(ws, /<h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">/);
  assert.match(ws, /students === 1 \? t\("student", "sinh viên"\) : t\("students", "sinh viên"\)/);
  assert.match(ws, /totalLabs === 1 \? t\("Lab", "Lab"\) : t\("Labs", "Labs"\)/);
  assert.match(pages, /course\.labCount === 1 \? t\("Lab", "Lab"\) : t\("Labs", "Labs"\)/);
  assert.match(admin, /date\.toLocaleDateString\("vi-VN"\)\}<\/span>\{" "\}/);
});

test("Bug #09: CourseBuilder prevents horizontal grid overflow and Passkey table compacts padding with truncated labels", () => {
  const builder = read("src/features/courses/course-builder.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.match(builder, /className="min-w-0 space-y-4"/);
  assert.match(builder, /className="min-w-0 space-y-4 rounded-xl border bg-muted\/15 p-4 lg:sticky lg:top-6"/);
  assert.match(builder, /overflow-x-auto rounded-lg border bg-background p-3/);
  assert.match(access, /className="block max-w-40 truncate"/);
  assert.match(access, /className="whitespace-nowrap px-2\.5 py-2 font-medium"/);
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
  assert.match(access, /isCopied \? t\("Copied!", "Đã chép!"\) : item\.code/);
  assert.match(assignments, /xl:flex-row xl:items-center xl:justify-between/);
  assert.match(studioSection, /Configure Exercise & Templates/);
  assert.match(studioSection, /1-Click Exercise Templates/);
  assert.match(workbench, /finishDisabledReason/);
  assert.match(builder, /scrollIntoView\(\{ behavior: "smooth", block: "nearest" \}\)/);
  assert.match(workspaces, /gradebookLoading/);
  assert.match(subScreens, /Next pending/);
  assert.match(grading, /applyScoreToAllSnapshots/);
  assert.match(subComponents, /Technical verification IDs & digests/);
});

test("Council Scope Gap Pack: Student Download Reference ZIP, THEORY_ONLY Markdown reader, Admin Test Connection, and VI parity", () => {
  const courses = read("src/features/courses/screens.tsx");
  const admin = read("src/features/administration/screens.tsx");
  const locale = read("src/lib/i18n/locale-context.tsx");
  const subScreens = read("src/features/submissions/screens.tsx");
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");

  assert.match(courses, /\/api\/backend\/assignments\/\$\{encodeURIComponent\(labId\)\}\/reference-source/);
  assert.match(courses, /Download Reference \.zip/);
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
  assert.match(profile, /lg:grid-cols-\[340px_minmax\(0,1fr\)\]/);
  assert.match(appShell, /<UserAvatar[\s\S]*avatarUrl=\{avatarUrl\}/);
  assert.match(workspaces, /<UserAvatar name=\{m\.name\} avatarUrl=\{m\.avatarUrl\}/);
  assert.match(admin, /<UserAvatar name=\{a\.name\} avatarUrl=\{a\.avatarUrl\}/);
  assert.ok(backendPath.includes("auth\\/(?:login|me(?:\\/avatar)?|avatars\\/[a-f0-9-]+)"));
  assert.match(domain, /export const avatarUrlSchema/);
});

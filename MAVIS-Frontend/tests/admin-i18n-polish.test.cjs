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

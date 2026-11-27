const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Studio Live & Studio Workbench inspector action buttons use 2x2 grid with whitespace-nowrap to prevent Vietnamese label clipping", () => {
  const parity = read("src/features/runtime/live-sandbox-parity.tsx");
  const workbench = read("src/features/runtime/studio-workbench.tsx");
  const live = read("src/features/runtime/live-studio-workbench.tsx");

  assert.match(parity, /<div className="grid grid-cols-2 gap-1\.5">[\s\S]*Stop[\s\S]*Start[\s\S]*Clone[\s\S]*Delete/);
  assert.match(parity, /whitespace-nowrap/);
  assert.match(workbench, /<div className="grid grid-cols-2 gap-1\.5">[\s\S]*Stop[\s\S]*Start[\s\S]*\+ Clone/);
  assert.match(workbench, /whitespace-nowrap/);
  assert.match(live, /!hasConfirmedAction/);
  assert.doesNotMatch(live, /before sealing your signed receipt/);
  assert.match(live, /mavis-tabular/);
});

test("Teacher Dashboard uses unified mavis-hero-surface and links only to valid registered routes", () => {
  const dashboard = read("src/features/workspaces/teacher-dashboard.tsx");
  const workspacesScreens = read("src/features/workspaces/screens.tsx");
  assert.match(dashboard, /mavis-hero-surface[^"]*text-white/);
  assert.match(dashboard, /mavis-card-hover/);
  assert.match(dashboard, /mavis-tabular/);
  assert.doesNotMatch(dashboard, /from-indigo-950 via-indigo-700 to-purple-700/);
  assert.doesNotMatch(dashboard, /\/workspace-members|\/assignments\/new/, "TeacherDashboard must not contain 404 dead links");
  assert.doesNotMatch(workspacesScreens, /\/workspace-members/, "Workspace screens must link to /members instead of 404 /workspace-members");
});

test("Lecturer Grading Workspace enforces side-by-side layout at lg+ and displays immediate BR-10 outcome feedback", () => {
  const screens = read("src/features/submissions/screens.tsx");
  const grading = read("src/features/submissions/grading.tsx");

  assert.match(screens, /lg:grid-cols-\[minmax\(0,1\.65fr\)_minmax\(340px,1fr\)\]/);
  assert.match(screens, /lg:sticky lg:top-20/);
  assert.match(grading, /PASS — unlocks the next Lab/);
  assert.match(grading, /NEEDS REVISION — next Lab remains locked/);
  assert.match(grading, /mavis-tabular/);
});

test("Studio Live uses original MAVIS Architecture Workbench layout with 4 distinct visual styles, bright 3D stage, left tool rail, centered bottom dock, and style-aware drawers", () => {
  const styles = read("src/features/runtime/studio-styles.ts");
  const obs = read("src/features/runtime/studio-observability.tsx");
  const live = read("src/features/runtime/live-studio-workbench.tsx");
  const standalone = read("src/features/runtime/standalone-studio-live.tsx");

  assert.match(styles, /"daylight"/);
  assert.match(styles, /"blueprint"/);
  assert.match(styles, /"pop"/);
  assert.match(styles, /"control"/);
  assert.match(styles, /wireMode: "orthogonal"/);
  assert.match(obs, /studioStyle\?: StudioStyleId/);
  assert.match(obs, /styleCfg\.deckTopFill/);
  assert.match(obs, /absolute bottom-\[72px\] left-\[76px\]/);
  assert.match(live, /const \[studioStyle, setStudioStyle\] = useState<StudioStyleId>\("daylight"\)/);
  assert.match(live, /const \[bottomCollapsed, setBottomCollapsed\] = useState\(true\)/);
  assert.match(live, /defaultView="3D"/);
  assert.match(live, /Studio tools/);
  assert.match(live, /Live Command Dock/);
  assert.match(live, /verifiedModalOpen/);
  assert.doesNotMatch(live, /bg-\[#FEF08A\]/, "MAVIS Studio Live must not copy 200Lab's yellow Post-it sticky note");
  assert.match(standalone, /missionCard=\{missionCardProps\}/);
});

test("Commit #06 cleans student submission evidence, enables dark-mode Mermaid preview and streamlines grading footer", () => {
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");
  const grading = read("src/features/submissions/grading.tsx");

  assert.match(frozen, /style=\{isDark \? "dark" : "clean"\}/);
  assert.doesNotMatch(frozen, /Evidence package SHA-256/);
  assert.doesNotMatch(subV2, /\[CB=|DBPerService=|sectionId: "MITIGATION"/);
  assert.match(grading, /t\("Save draft", "Lưu nháp"\)/);
  assert.match(grading, /t\("Grade & Publish", "Chấm điểm & Công bố"\)/);
  assert.doesNotMatch(grading, /Return for changes|Refresh review/);
});

test("Phase 2: Studio Lab dossiers without a per-Lab quiz never render contradictory Theory Only badges", () => {
  const components = read("src/features/submissions/components.tsx");
  const screens = read("src/features/submissions/screens.tsx");
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");

  assert.match(components, /const isStudioLab =[\s\S]*THEORY_QUIZ_STUDIO[\s\S]*studioEvidence[\s\S]*studioVerified/);
  assert.match(components, /const isTheoryOnly =\s*!isStudioLab/);
  assert.match(screens, /courseQuizEvidence\?\.status === "NOT_REQUIRED" &&[\s\S]*labMode !== "THEORY_QUIZ_STUDIO"/);
  assert.match(frozen, /quizEv\.status !== "NOT_REQUIRED"/);
});

test("Adversarial QA hardening: portal lightbox, WebGL release, UUID URL guards, clean Passkey UX, 409 reload & strict > 50 KPI", () => {
  const evidence = read("src/features/runtime/studio-evidence.tsx");
  const three = read("src/features/runtime/studio-three-stage.tsx");
  const access = read("src/features/workspaces/course-access.tsx");
  const grading = read("src/features/submissions/grading.tsx");
  const courseScreens = read("src/features/courses/screens.tsx");
  const theoryLib = read("src/features/workspaces/theory-library.tsx");
  const apiError = read("src/lib/errors/api-error.ts");

  assert.match(evidence, /createPortal\(/);
  assert.match(three, /forceContextLoss\(\)/);
  assert.match(access, /UUID_SEGMENT_RE\.test\(workspaceId\)/);
  assert.doesNotMatch(access, /NOT_ENROLLED/);
  assert.match(access, /Math\.min\(8760, Math\.max\(1, validHours \|\| 720\)\)/);
  assert.match(grading, /onReloadLatest\?\.\(\)/);
  assert.match(grading, /reviseHref/);
  assert.match(grading, /tooManyDecimals/);
  assert.match(courseScreens, /score > 50/);
  assert.match(theoryLib, /usePermission\("workspace:manage"\)/);
  assert.match(apiError, /APPROVAL_SUMMARY_REQUIRED/);
  assert.match(apiError, /REPLICA_BOUNDS_EXCEEDED/);
});

test("Lecturer Submission Review Refactor: 2 clean left sections (Quiz + Written Assignment), collapsed technical artifacts, localized DiagramPreview, and streamlined right grading panel", () => {
  const screens = read("src/features/submissions/screens.tsx");
  const grading = read("src/features/submissions/grading.tsx");
  const studioEvidence = read("src/features/submissions/studio-evidence.tsx");
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");
  const diagramPreview = read("src/features/architecture/diagram-preview.tsx");

  assert.match(screens, /t\("1\. Quiz Result", "1\. Kết quả bài kiểm tra \(Quiz\)"\)/);
  assert.match(screens, /t\("2\. Student Written Assignment", "2\. Bài tập tự luận của sinh viên"\)/);
  assert.match(screens, /t\("Back to submissions", "Quay lại danh sách bài nộp"\)/);
  assert.match(screens, /<details className="rounded-xl border bg-card px-4 py-3 text-xs">/);
  assert.doesNotMatch(screens, /<details open/);
  assert.match(screens, /mode="media"/);
  assert.match(screens, /mode="assistant"/);
  assert.match(studioEvidence, /mode = "full"/);
  assert.match(frozen, /technicalOnly\?: boolean/);

  assert.match(diagramPreview, /useLocale/);
  assert.match(diagramPreview, /Kéo để di chuyển/);
  assert.match(diagramPreview, /t\("Fit diagram", "Vừa khung"\)/);
  assert.match(diagramPreview, /t\("Fullscreen", "Toàn màn hình"\)/);

  assert.match(grading, /\["10", "9", "8", "7", "5"\]/);
  assert.doesNotMatch(grading, /Phân tích đúng nguyên nhân và minh chứng Studio rõ ràng/);
  assert.doesNotMatch(grading, /giải trình/i);
  assert.doesNotMatch(frozen, /giải trình/i);
});

test("Branch 4 hardening: CSV formula injection defense, DOM-attached artifact download, and localized confirms", () => {
  const ts = require("typescript");
  const screens = read("src/features/submissions/screens.tsx");
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");
  const grading = read("src/features/submissions/grading.tsx");
  const workspacesScreens = read("src/features/workspaces/screens.tsx");

  const match = screens.match(/export function escapeGradebookCsvCell[\s\S]*?\n\}/);
  assert.ok(match, "escapeGradebookCsvCell export must exist in submissions/screens.tsx");
  const compiled = ts.transpileModule(match[0], {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", compiled)(mod.exports, mod);
  const { escapeGradebookCsvCell } = mod.exports;

  assert.equal(escapeGradebookCsvCell("=CMD|'/C calc'!A0"), `"'=CMD|'/C calc'!A0"`);
  assert.equal(escapeGradebookCsvCell("+1+1"), `"'+1+1"`);
  assert.equal(escapeGradebookCsvCell("-2"), `"'-2"`);
  assert.equal(escapeGradebookCsvCell("@SUM(A1)"), `"'@SUM(A1)"`);
  assert.equal(escapeGradebookCsvCell("\tcmd"), `"'\tcmd"`);
  assert.equal(escapeGradebookCsvCell('Nguyễn "A"'), `"Nguyễn ""A"""`);

  assert.match(screens, /document\.body\.appendChild\(a\)/);
  assert.match(screens, /a\.remove\(\)/);
  assert.match(frozen, /document\.body\.appendChild\(anchor\)/);
  assert.match(frozen, /anchor\.remove\(\)/);
  assert.match(grading, /t\("Publish this score and summary to the student\?", "Công bố điểm số và nhận xét này cho sinh viên\?"\)/);
  assert.match(grading, /t\("Return this submission with change requests\?", "Trả lại bài nộp này kèm yêu cầu chỉnh sửa\?"\)/);
  assert.match(workspacesScreens, /Xóa \$\{m\.name\} khỏi lớp học này\?/);
});

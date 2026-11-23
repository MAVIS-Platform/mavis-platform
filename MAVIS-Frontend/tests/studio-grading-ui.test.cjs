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
  assert.match(obs, /absolute bottom-4 left-4/);
  assert.match(live, /const \[studioStyle, setStudioStyle\] = useState<StudioStyleId>\("daylight"\)/);
  assert.match(live, /const \[bottomCollapsed, setBottomCollapsed\] = useState\(true\)/);
  assert.match(live, /defaultView="3D"/);
  assert.match(live, /Studio tools/);
  assert.match(live, /Live Command Dock/);
  assert.match(live, /verifiedModalOpen/);
  assert.doesNotMatch(live, /bg-\[#FEF08A\]/, "MAVIS Studio Live must not copy 200Lab's yellow Post-it sticky note");
  assert.match(standalone, /missionCard=\{missionCardProps\}/);
});

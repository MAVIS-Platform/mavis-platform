const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

if (!require.extensions[".ts"]) {
  const compileTypeScript = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    module._compile(
      compiled.replace(
        /require\(["']@\/([^"']+)["']\)/g,
        (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
      ),
      filename,
    );
  };
  require.extensions[".ts"] = compileTypeScript;
  require.extensions[".tsx"] = compileTypeScript;
}

test("Student global navigation excludes Free Studio Sandbox and locks to guided learning destinations", () => {
  const { globalNavigation } = require("../src/lib/navigation.ts");
  const studentItems = globalNavigation.student.flatMap((group) => group.items);

  assert.equal(
    studentItems.some((item) => item.href === "/studio" || /sandbox/i.test(item.label)),
    false,
    "Student navigation must not contain /studio or Free Studio Sandbox",
  );
  assert.equal(studentItems.some((item) => item.href === "/courses"), true);
  assert.equal(studentItems.some((item) => item.href === "/roadmap"), true);
  assert.equal(studentItems.some((item) => item.href === "/submissions"), true);
});

test("AppShell renders Learning workspace for Student instead of Teaching workspace", () => {
  const shell = read("src/components/app-shell.tsx");
  assert.match(shell, /role === "student"\s*\?\s*"Learning workspace"\s*:\s*"Teaching workspace"/);
});

test("Student Courses & Syllabus portals use theme-adaptive mavis-hero-surface without Free Studio Sandbox CTA", () => {
  const dashboard = read("src/features/courses/student-courses-dashboard.tsx");
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const submissions = read("src/features/submissions/screens.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.match(dashboard, /mavis-hero-surface/);
  assert.doesNotMatch(
    dashboard,
    /mavis-hero-surface[^"]*text-white/,
    "Theme-adaptive mavis-hero-surface must use semantic text-foreground instead of hardcoded text-white",
  );
  assert.match(dashboard, /mavis-card-hover/);
  assert.match(dashboard, /mavis-tabular/);
  assert.doesNotMatch(
    dashboard,
    /Free Studio Sandbox|Sandbox Studio Tự Do/,
    "Student /courses Hero must not display Free Studio Sandbox button",
  );
  assert.match(syllabus, /mavis-hero-surface/);
  assert.doesNotMatch(syllabus, /mavis-hero-surface[^"]*text-white/);
  assert.match(submissions, /href=\{`\/roadmap\?workspace=\$\{encodeURIComponent\(workspace\.id\)\}`\}/);
  assert.match(access, /border-destructive\/30 bg-destructive\/10/);
  assert.match(access, /border-l-emerald-500/);
  assert.match(access, /border-l-primary/);
});

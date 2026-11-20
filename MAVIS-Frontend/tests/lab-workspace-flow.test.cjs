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

test("LabWorkspace unifies navigation into a single sticky horizontal stepper without duplicate left sidebar", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { LabToc } = require("../src/features/courses/lab-toc.tsx");
  const screens = read("src/features/courses/screens.tsx");

  assert.match(screens, /<LabToc[\s\S]*layout="stepper"/);
  assert.doesNotMatch(
    screens,
    /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/,
    "Duplicate 260px left LabToc sidebar should be removed so diagrams use full width",
  );
  assert.match(screens, /Lab objective/);
  assert.match(screens, /Impact Analysis Workspace/);

  const html = renderToStaticMarkup(
    React.createElement(LabToc, {
      layout: "stepper",
      activeStep: 1,
      progress: 50,
      moduleTitle: "Microservices Boundaries",
      items: [{ id: "t1", title: "C4 Overview", type: "THEORY" }],
      steps: [
        { id: 1, label: "Static Studio", state: "current", href: "/lab?step=1" },
        { id: 2, label: "MAVIS Runtime Studio", state: "available", href: "/lab?step=2" },
        {
          id: 3,
          label: "Evidence & Submit",
          state: "locked",
          reason: "Finish Runtime Studio first.",
        },
      ],
    }),
  );

  assert.match(html, /sticky top-14/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="50"/);
  assert.match(html, /Static Studio/);
  assert.match(html, /Finish Runtime Studio first\./);
});

test("LabWorkspace uses the Module Quiz as the sole Runtime Studio prerequisite", () => {
  const screens = read("src/features/courses/screens.tsx");
  assert.match(screens, /Pass this module's Quiz to unlock MAVIS Runtime Studio/);
  assert.match(screens, /Pass the Module Quiz to unlock MAVIS Runtime Studio/);
  assert.doesNotMatch(
    screens,
    /<CourseQuiz/,
    "The Lab workspace must not embed a second Quiz Gate.",
  );
});

test("LabWorkspace uses zero-overlap ELK/MxGraph ArchitectureDiagrams for C1-C3 and preserves Mermaid spacing fallback", () => {
  const screens = read("src/features/courses/screens.tsx");
  const diagrams = read("src/features/architecture/architecture-diagrams.tsx");
  const renderer = read("src/features/architecture/diagram-renderer.ts");
  assert.match(screens, /<ArchitectureDiagrams[\s\S]*guidedStatic[\s\S]*controlledKind=\{inlineC4View\}[\s\S]*hideKindSelector/);
  assert.match(diagrams, /controlledKind\?: DiagramKind/);
  assert.match(renderer, /c4:\s*\{[\s\S]*c4ShapeMargin:\s*64[\s\S]*c4ShapePadding:\s*24/);
  assert.match(renderer, /flowchart:\s*\{[\s\S]*nodeSpacing:\s*64[\s\S]*rankSpacing:\s*84/);
  assert.match(renderer, /UpdateLayoutConfig\(\$c4ShapeInRow="3", \$c4BoundaryInRow="1"\)/);
});

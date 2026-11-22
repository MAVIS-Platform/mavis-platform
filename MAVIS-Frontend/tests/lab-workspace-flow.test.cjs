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
  assert.match(screens, /Learning objective/);
  assert.match(screens, /Static impact hypothesis/);

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
          label: "Evidence Review",
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

test("LabWorkspace keeps module prerequisites outside the three-phase Lab UI", () => {
  const screens = read("src/features/courses/screens.tsx");
  assert.match(screens, /Runtime Studio is not available yet/);
  assert.match(screens, /Runtime Studio chưa sẵn sàng/);
  assert.doesNotMatch(
    screens,
    /<CourseQuiz/,
    "The Lab workspace must not embed a course quiz.",
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

test("Bug #06: Step footer clarifies locked Runtime Studio, lab switcher truncates cleanly, and scroll sections clear sticky stepper", () => {
  const screens = read("src/features/courses/screens.tsx");
  assert.match(screens, /t\("Check Runtime Studio Requirement", "Xem yêu cầu Runtime Studio"\)/);
  assert.match(screens, /id="lab-ai-tutor" className="scroll-mt-36/);
  assert.match(screens, /id="lab-switcher"[\s\S]*truncate[\s\S]*leading-tight/);
});

test("Non-runtime Labs (THEORY_ONLY / THEORY_QUIZ) omit Runtime (N/A) step and render a clean 2-step flow", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { LabToc } = require("../src/features/courses/lab-toc.tsx");
  const screens = read("src/features/courses/screens.tsx");

  assert.doesNotMatch(screens, /Runtime \(N\/A\)/);
  assert.match(screens, /const displayedStep: 1 \| 2 \| 3 = !requiresRuntime && activeStep === 2 \? 3 : activeStep;/);
  assert.match(screens, /learningSteps\.filter\(\(step\) => step\.id !== 2\)/);
  assert.match(screens, /const prevStep: 1 \| 2 = step === 3 && !requiresRuntime \? 1 : \(\(step - 1\) as 1 \| 2\);/);
  assert.match(screens, /const totalPhases = requiresRuntime \? 3 : 2;/);

  const html = renderToStaticMarkup(
    React.createElement(LabToc, {
      layout: "stepper",
      activeStep: 1,
      progress: 50,
      steps: [
        { id: 1, label: "Static Studio", state: "complete", href: "/lab?step=1" },
        { id: 3, label: "Evidence Review", state: "available", href: "/lab?step=3" },
      ],
      items: [],
    }),
  );

  assert.match(html, /sm:grid-cols-2/);
  assert.match(html, /1\. Static Studio/);
  assert.match(html, /2\. Evidence Review/);
  assert.doesNotMatch(html, /3\. Evidence Review/);
});

test("Step 3 submission flow hides dead Jump to Submission Box after submit, focuses textarea before submit, and links directly to submission detail", () => {
  const screens = read("src/features/courses/screens.tsx");
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");

  assert.match(screens, /const hasSubmittedLab = Boolean\(studentContext\?\.latestSubmission\?\.id\);/);
  assert.match(screens, /!hasSubmittedLab && !preview \?/);
  assert.match(screens, /querySelector<HTMLTextAreaElement>\("textarea"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(subV2, /href=\{`\/submissions\/\$\{encodeURIComponent\(latest\.id\)\}`\}/);
});

test("Coursera CDS contrast palette & simplified Lab header deduplicate prefixes and show real lab instructions", () => {
  const css = read("src/styles.css");
  const layout = read("app/layout.tsx");
  const data = read("src/components/shared/data.tsx");
  const screens = read("src/features/courses/screens.tsx");
  const step2 = read("src/features/courses/step2-static-impact.tsx");
  const toc = read("src/features/courses/lab-toc.tsx");

  assert.match(css, /--background:\s*#F7F9FC;/);
  assert.match(css, /--foreground:\s*#0F1114;/);
  assert.match(css, /--muted-foreground:\s*#374151;/);
  assert.match(css, /--primary:\s*#0056D2;/);
  assert.match(css, /--font-ui:\s*"Source Sans 3"/);
  assert.match(layout, /Source\+Sans\+3/);
  assert.doesNotMatch(css, /-webkit-font-smoothing:\s*antialiased/);
  assert.match(data, /semanticStatusClasses/);
  assert.match(screens, /\/\^\(\?:Module\|Chương\)\\s\+\\d\+\/i\.test\(currentModule\.title\.trim\(\)\)/);
  assert.match(screens, /\/\^Lab\\s\+\\d\+\/i\.test\(item\.title\.trim\(\)\)/);
  assert.match(screens, /step === 1 && labInstructions\?\.trim\(\)/);
  assert.match(screens, /\[a-f0-9\]\{40\}/);
  assert.doesNotMatch(step2, /QA \/ Demo Edge Cases/);
  assert.doesNotMatch(toc, /mavis-tabular/);
});

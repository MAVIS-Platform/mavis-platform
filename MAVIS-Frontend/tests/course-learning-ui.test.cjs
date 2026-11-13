const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

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

test("course learning routes are registered in the shared authenticated shell", () => {
  const routes = read("app/[screen]/page.tsx");
  const home = read("app/page.tsx");

  assert.match(routes, /courses:\s*\{[^}]*component:\s*Courses/s);
  assert.match(routes, /roadmap:\s*\{[^}]*component:\s*CourseRoadmap/s);
  assert.match(routes, /lab:\s*\{[^}]*component:\s*LabWorkspace/s);
  assert.match(home, /activeId="courses"/);
  assert.match(home, /<Courses\s*\/>/);
});

test("student navigation follows Course to Roadmap to Lab and submissions", () => {
  const navigation = read("src/lib/navigation.ts");

  for (const label of [
    "My Courses",
    "Join Course",
    "Course Roadmap",
    "Lab Workspace",
    "My Submissions",
  ])
    assert.ok(navigation.includes(label), label);
  assert.match(navigation, /href:\s*"\/roadmap"/);
  assert.match(navigation, /href:\s*"\/lab"/);
});

test("Lab UI keeps unavailable progress gates honest and deep-links real assignment data", () => {
  const course = read("src/features/courses/screens.tsx");
  const access = read("src/features/workspaces/course-access.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");

  assert.ok(course.includes('<CourseEnrollment destination="roadmap" />'));
  assert.ok(access.includes('"course-enrollments/redeem"'));
  assert.ok(access.includes("course-roadmap"));
  assert.ok(access.includes('state: "LOCKED" | "UNLOCKED" | "PASSED"'));
  assert.match(access, /\/lab\?workspace=.*&assignment=.*&step=1/s);
  assert.match(course, /state: model \? "READY" : referenceSnapshotId \? "IN PROGRESS" : "MISSING"/);
  assert.match(course, /job\.status === "completed" && job\.analysisState !== "PARTIAL"/);
  assert.match(course, /<CourseQuiz workspaceId=\{workspaceId\} labId=\{labId\}/);
  assert.match(quiz, /queryKey: \["api", "course-quiz", workspaceId, labId\]/);
  assert.match(quiz, /api<Result>\(`\$\{path\}\/attempts`/);
  assert.match(course, /\/assignments\?workspace=.*&assignment=/s);
  assert.match(course, /\/submissions\?workspace=.*&assignment=/s);
});

test("guided Lab resumes a Runtime session scoped to its selected project and static model", () => {
  const course = read("src/features/courses/screens.tsx");
  assert.match(course, /item\.projectId === projectId && item\.modelId === model\.id/);
  assert.match(course, /new URLSearchParams\(\{ project: projectId, session: runtimeSession\.id \}\)/);
  assert.match(course, /Open Runtime session/);
});

test("assignment and submission screens preserve the selected Lab context", () => {
  const assignments = read("src/features/assignments/screens.tsx");
  const submissions = read("src/features/submissions/screens.tsx");

  assert.ok(assignments.includes('params?.get("assignment")'));
  assert.ok(assignments.includes("scrollIntoView"));
  assert.ok(assignments.includes("ring-2 ring-primary/40"));
  assert.ok(submissions.includes("submission.assignmentId === assignmentId"));
  assert.ok(submissions.includes("No snapshot has been submitted for this Lab yet"));
});

test("lecturer review requires comments and maps the documented pass threshold to /100", () => {
  const grading = read("src/features/submissions/grading.tsx");

  assert.match(grading, /const PASSING_SCORE = 50/);
  assert.match(grading, /score > PASSING_SCORE \? "PASS" : "NEEDS REVISION"/);
  assert.ok(grading.includes('status !== "DRAFT" && !summary.trim()'));
  assert.ok(grading.includes('status === "GRADED"'));
  assert.ok(grading.includes('status === "RETURNED"'));
});

test("new Course and Lab surfaces expose direct Vietnamese copy", () => {
  const course = read("src/features/courses/screens.tsx");

  for (const text of [
    "Khóa học của tôi",
    "Lộ trình học tập",
    "Thao tác Lab",
    "Mở bài tập và nộp bài",
    "Bằng chứng runtime",
  ])
    assert.ok(course.includes(text), text);
});

test("Guided Lab Step 1 exposes read-only C1-C3 quick views, pinned IDs, and 5-rule severity separation", () => {
  const course = read("src/features/courses/screens.tsx");
  assert.ok(course.includes("Read-Only Structural Views (C1–C3 + Dependency Graph) · Static source evidence only (not runtime trace)"));
  assert.ok(course.includes("C1 System Context"));
  assert.ok(course.includes("C2 Container"));
  assert.ok(course.includes("C3 Component"));
  assert.ok(course.includes("kind=CONTEXT"));
  assert.ok(course.includes("kind=CONTAINER"));
  assert.ok(course.includes("kind=COMPONENT"));
  assert.ok(course.includes("Service Dependency Graph (Read-Only)"));
  assert.ok(course.includes("sourceSnapshotId"));
  assert.ok(course.includes("modelVersionId"));
  assert.ok(course.includes("Model Revision"));
  assert.ok(course.includes("StaticEvaluationSummary"));
  assert.ok(course.includes("Missing Call-Site / Evidence Grounding"));
});

test("Stage 4 Reverse BFS terminates safely on cyclic dependencies, reports unaffected/isolated nodes, and avoids false positives on diamonds", () => {
  const { computeArchitectureImpact } = require("../src/lib/architecture/reverse-bfs.ts");
  const node = (id, name, elementType = "SERVICE_CONTAINER") => ({
    id,
    name,
    elementType,
    description: "",
    layer: "unclassified",
    evidence: [],
  });

  const cyclicModel = {
    id: "m-cycle",
    projectId: "p1",
    snapshotId: "s1",
    revision: 1,
    label: "Cyclic",
    elements: [
      node("gw", "gateway"),
      node("ord", "order-service"),
      node("pay", "payment-service"),
      node("inv", "inventory-service"),
      node("aud", "audit-isolated"),
    ],
    edges: [
      { id: "e1", from: "gw", to: "ord", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC", uncertain: false, evidence: [] },
      { id: "e2", from: "ord", to: "pay", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC", uncertain: false, evidence: [] },
      { id: "e3", from: "pay", to: "ord", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC", uncertain: false, evidence: [] },
      { id: "e4", from: "inv", to: "ord", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC", uncertain: false, evidence: [] },
    ],
  };

  const impact = computeArchitectureImpact(cyclicModel, "pay", "all");
  assert.equal(impact.cyclesDetected, true);
  assert.ok(impact.cycleNodeNames.includes("order-service"));
  assert.ok(impact.cycleNodeNames.includes("payment-service"));
  assert.equal(impact.directImpactCount, 1);
  assert.equal(impact.indirectImpactCount, 2);
  assert.deepEqual(
    impact.upstreamImpacted.map((e) => e.name).sort(),
    ["gateway", "inventory-service", "order-service"],
  );
  assert.equal(impact.isolatedCount, 1);
  assert.deepEqual(
    impact.unaffectedElements.map((e) => ({ name: e.name, isolated: e.isolated })),
    [{ name: "audit-isolated", isolated: true }],
  );

  const diamondModel = {
    id: "m-diamond",
    projectId: "p1",
    snapshotId: "s1",
    revision: 1,
    label: "Diamond",
    elements: [
      node("a", "edge-gateway"),
      node("b", "checkout-svc"),
      node("c", "billing-svc"),
      node("d", "user-db", "DATABASE"),
    ],
    edges: [
      { id: "d1", from: "a", to: "b", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC", uncertain: false, evidence: [] },
      { id: "d2", from: "a", to: "c", protocol: "SERVICE_HTTP_CALL", originLayer: "STATIC", uncertain: false, evidence: [] },
      { id: "d3", from: "b", to: "d", protocol: "DATABASE_ACCESS", originLayer: "STATIC", uncertain: false, evidence: [] },
      { id: "d4", from: "c", to: "d", protocol: "DATABASE_ACCESS", originLayer: "STATIC", uncertain: false, evidence: [] },
    ],
  };

  const diamondImpact = computeArchitectureImpact(diamondModel, "d", "all");
  assert.equal(diamondImpact.cyclesDetected, false);
  assert.equal(diamondImpact.directImpactCount, 2);
  assert.equal(diamondImpact.indirectImpactCount, 1);
});

test("Stage 4 Step 2 UI integrates Reverse BFS Explorer, C1-C3 Back-Links, and explicit Quiz/Runtime Gate state", () => {
  const course = read("src/features/courses/screens.tsx");
  const step2 = read("src/features/courses/step2-static-impact.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");

  assert.ok(course.includes("<Step2StaticImpact"));
  assert.ok(course.includes("runtimeStepHref="));
  assert.ok(step2.includes("computeArchitectureImpact"));
  assert.ok(step2.includes("Cycle Detected & Safely Terminated"));
  assert.ok(step2.includes("Unaffected & Isolated Elements"));
  assert.ok(step2.includes("kind=CONTEXT"));
  assert.ok(step2.includes("kind=CONTAINER"));
  assert.ok(step2.includes("kind=COMPONENT"));
  assert.ok(step2.includes("/impact?"));

  assert.ok(quiz.includes("PASSED (v${quiz.version})"));
  assert.ok(quiz.includes("NEEDS_RETRY (v${quiz.version})"));
  assert.ok(quiz.includes("Proceed to Step 3: Live Runtime"));
  assert.ok(quiz.includes("Step 3 Live Docker Runtime is locked until you score at least"));
});

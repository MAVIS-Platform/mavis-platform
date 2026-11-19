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

test("MAVIS catalog pages own the new shell while roadmap and Lab keep the existing flow", () => {
  const routes = read("app/[screen]/page.tsx");
  const home = read("app/page.tsx");
  const mavisPages = read("src/features/courses/mavis-pages.tsx");

  assert.match(routes, /courses:\s*\{[^}]*component:\s*MavisCoursesPage/s);
  assert.match(routes, /screen === "courses"[^\n]*<MavisCoursesPage/);
  assert.match(routes, /roadmap:\s*\{[^}]*component:\s*CourseRoadmap/s);
  assert.match(routes, /lab:\s*\{[^}]*component:\s*LabWorkspace/s);
  assert.match(routes, /<AppShell\s+scope=\{config\.scope\}\s+activeId=\{screen\}/);
  assert.match(mavisPages, /export function MavisHomePage/);
  assert.match(mavisPages, /export function AllCoursesPage/);
  assert.match(mavisPages, /<MavisShell>/);
  assert.match(mavisPages, /t\("Enroll", "Ghi danh"\)/);
  assert.doesNotMatch(mavisPages, /course\.categories\.map/);
  assert.match(mavisPages, /<PasskeyEnrollmentModal/);
  assert.doesNotMatch(mavisPages, /Enrollment required/);
  assert.match(mavisPages, /const COURSES_PER_PAGE = 6/);
  assert.match(mavisPages, /<CourseCover courseId=\{workspace\.id\}/);
  assert.match(mavisPages, /<CourseCover courseId=\{course\.workspaceId\}/);
  assert.match(home, /<PublicHomepage\s*\/>/);
});

test("lecturer and student course cards share deterministic cover artwork", () => {
  const lecturer = read("src/features/workspaces/screens.tsx");
  const cover = read("src/components/course-cover.tsx");

  assert.match(lecturer, /<CourseCover\s+courseId=\{workspace\.id\}/);
  assert.match(cover, /function courseCoverIndex\(courseId/);
  assert.match(cover, /hash % coverColors\.length/);
});

test("student navigation keeps one unified Learning section and preserves all-role destinations", () => {
  const navigation = read("src/lib/navigation.ts");
  const shell = read("src/components/app-shell.tsx");

  for (const label of [
    "My Courses",
    "Lab Roadmap & Course",
    "My Grades & Submissions",
    "My Classes",
    "Curriculum & Labs",
    "Grading & Gradebook",
    "System Overview",
    "Users & Roles",
    "Governance & Audit",
  ])
    assert.ok(navigation.includes(label), label);
  assert.match(navigation, /href:\s*"\/courses"/);
  assert.match(navigation, /href:\s*"\/roadmap"/);
  assert.match(navigation, /href:\s*"\/submissions"/);
  assert.match(navigation, /href:\s*"\/workspaces"/);
  assert.match(navigation, /href:\s*"\/workspace-overview"/);
  assert.match(navigation, /href:\s*"\/administration\/health"/);
  assert.doesNotMatch(navigation, /studentWorkspaceNavigation/);
  assert.doesNotMatch(shell, /Learning workspace/);
  assert.match(shell, /children:\s*workspaceEntries/);
  assert.match(shell, /const showSidebar = live \|\| role !== "student"/);
  assert.match(shell, /showSidebar && <Sidebar/);
});

test("student course landing prioritizes joined classes, defers curriculum and keeps Passkey deep-link", () => {
  const course = read("src/features/courses/screens.tsx");
  const dashboard = read("src/features/courses/student-courses-dashboard.tsx");
  const curriculum = read("src/features/courses/curriculum.tsx");
  const nav = read("src/lib/navigation.ts");
  assert.ok(dashboard.includes('id="course-passkey"'));
  assert.ok(dashboard.includes('aria-controls="course-passkey-form"'));
  assert.ok(dashboard.includes("Continue learning"));
  assert.ok(course.includes("Reference materials: Java and C#"));
  assert.match(curriculum, /useCurriculum\(open\)/);
  assert.ok(
    nav.includes('href: "/courses"') &&
      nav.includes('href: "/submissions"') &&
      nav.includes('href: "/roadmap"'),
  );
});

test("student class outline uses published roadmap and markdown activities with a legacy roadmap fallback", () => {
  const outline = read("src/features/courses/course-outline.tsx");
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  assert.ok(outline.includes("usePublishedCourse(workspaceId)"));
  assert.ok(outline.includes("legacyLabs.length > 0"));
  assert.ok(outline.includes("<MarkdownPreview"));
  assert.ok(outline.includes("Pass the preceding Labs to unlock this activity."));
  assert.ok(shell.includes("STUDENT_TABS") && shell.includes("STAFF_TABS"));
});

test("student submissions are scoped by selected class workspaceId and retain class navigation", () => {
  const submissions = read("src/features/submissions/screens.tsx");
  assert.ok(submissions.includes("submission.workspaceId === workspaceId"));
  assert.ok(
    submissions.includes('<CourseWorkspaceShell workspace={workspace} active="submissions">'),
  );
});

test("Lab UI keeps unavailable progress gates honest and runs 4-step V2 workflow inside /lab", () => {
  const course = read("src/features/courses/screens.tsx");
  const dashboard = read("src/features/courses/student-courses-dashboard.tsx");
  const access = read("src/features/workspaces/course-access.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");

  assert.ok(dashboard.includes('<CourseEnrollment destination="roadmap" />'));
  assert.ok(access.includes('"course-enrollments/redeem"'));
  assert.ok(access.includes("course-roadmap"));
  assert.ok(access.includes('state: "LOCKED" | "UNLOCKED" | "PASSED"'));
  assert.match(access, /\/lab\?workspace=.*&assignment=.*&step=1/s);
  assert.match(
    course,
    /state:\s*activeModelId\s*\?\s*"READY"\s*:\s*referenceSnapshotId\s*\?\s*"IN PROGRESS"\s*:\s*"MISSING"/,
  );
  assert.match(course, /job\.status === "completed" && job\.analysisState !== "PARTIAL"/);
  assert.match(course, /<CourseQuiz\s+workspaceId=\{workspaceId\}\s+labId=\{labId\}/);
  assert.match(quiz, /queryKey: \["api", "course-quiz", workspaceId, labId\]/);
  assert.match(quiz, /api<Result>\(`\$\{path\}\/attempts`/);
  assert.match(course, /\/submissions\?workspace=.*&assignment=/s);
  assert.ok(course.includes("useStudentLabContext("));
  assert.ok(course.includes("useStudentLabStudioSessions("));
});

test("guided Lab embeds LiveStudioWorkbench directly in Step 4 without external /sessions redirect", () => {
  const course = read("src/features/courses/screens.tsx");
  const stepContentSource = course.slice(course.indexOf("function StepContent("));
  assert.ok(course.includes("<LiveStudioWorkbench"));
  assert.ok(course.includes("useStartLabStudioSession("));
  assert.ok(course.includes("useBootstrapLabStudio("));
  assert.ok(!stepContentSource.includes("href={`/sessions?"));
  assert.ok(!stepContentSource.includes("href={`/diagrams?"));
  assert.ok(!stepContentSource.includes("href={`/architecture?"));
  assert.ok(!stepContentSource.includes("href={`/assignments?"));
});

test("lecturer Lab authoring is a dedicated workspace with ordered authoring steps", () => {
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const info = read("src/features/assignments/lab-info-form.tsx");
  const source = read("src/features/assignments/lab-source-section.tsx");
  const publish = read("src/features/assignments/lab-publish-section.tsx");
  const assignments = read("src/features/assignments/screens.tsx");

  for (const label of [
    "Lab information",
    "Theory",
    "Reference source",
    "Quiz",
    "Studio Live",
    "Check & add to class",
  ])
    assert.ok(authoring.includes(label), label);
  assert.ok(info.includes('t("Next Step 2: Lab Theory", "Sang Bước 2: Lý thuyết Lab")'));
  assert.ok(info.includes("Attach the reference source and publish it in the next steps."));
  assert.match(source, /referenceModelId:\s*modelId/);
  assert.match(publish, /Preview as student/);
  assert.match(publish, /preview: "1"/);
  assert.ok(assignments.includes('t("Create a Lab", "Tạo Lab")'));
  assert.match(assignments, /lab-authoring\?workspace=/);
  assert.doesNotMatch(assignments, /CreateAssignment/);
  assert.throws(() => read("src/features/assignments/create.tsx"), /ENOENT/);
});

test("Course Builder edits structured theory items and starts a draft on the real endpoint", () => {
  const builder = read("src/features/courses/course-builder.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.ok(
    access.includes("`workspaces/${workspaceId}/course/draft`"),
    "startDraft must POST /course/draft",
  );
  assert.doesNotMatch(
    access,
    /course\/draft\/start/,
    "the non-existent /draft/start route must be gone",
  );
  assert.match(builder, /body: draft\.body/);
  assert.match(builder, /prompt: draft\.prompt/);
  assert.match(builder, /Theory content|Nội dung lý thuyết/);
  assert.doesNotMatch(
    builder,
    /Structured activity content JSON/,
    "THEORY must not be edited as raw JSON",
  );
  assert.match(builder, /updateModule/);
  assert.match(builder, /moveItem/);
  assert.match(builder, /deleteItem/);
  assert.match(builder, /RUNTIME_LAB/);
});

test("assignment authoring separates details, theory, source, quiz, studio and publishing", () => {
  const info = read("src/features/assignments/lab-info-form.tsx");
  const theory = read("src/features/assignments/lab-theory-section.tsx");
  const source = read("src/features/assignments/lab-source-section.tsx");
  const quiz = read("src/features/assignments/lab-quiz-section.tsx");
  const studio = read("src/features/assignments/lab-studio-section.tsx");
  const publish = read("src/features/assignments/lab-publish-section.tsx");

  assert.ok(info.includes("Instructions, learning goals and completion criteria"));
  assert.ok(theory.includes("THEORY"));
  assert.ok(source.includes("AssignmentSourcePicker"));
  assert.ok(quiz.includes("QuizBuilder"));
  assert.ok(studio.includes("useAutoConfigureStudio"));
  assert.ok(!studio.includes("runtime-config?project="));
  assert.ok(publish.includes("CourseSetupPanel"));
  assert.match(publish, /theoryReady/);
});

test("Coursera-style Lab table of contents shows progress, module items and lock reasons", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { LabToc } = require("../src/features/courses/lab-toc.tsx");
  const html = renderToStaticMarkup(
    React.createElement(LabToc, {
      activeStep: 2,
      progress: 25,
      preview: true,
      moduleTitle: "Foundations",
      items: [
        { id: "i1", title: "Service boundaries", type: "THEORY" },
        { id: "i2", title: "Boundary quiz", type: "QUIZ" },
      ],
      steps: [
        { id: 1, label: "Static architecture", state: "complete" },
        { id: 2, label: "Theory and quiz", state: "current" },
        {
          id: 3,
          label: "Runtime observation",
          state: "locked",
          reason: "Pass the current Quiz to open Runtime.",
        },
        {
          id: 4,
          label: "Studio receipt",
          state: "locked",
          reason: "Runtime evidence is required.",
        },
      ],
    }),
  );
  assert.match(html, /Foundations/);
  assert.match(html, /Service boundaries/);
  assert.match(html, /Pass the current Quiz to open Runtime/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="25"/);
  assert.match(html, /Preview/);
});

test("LabWorkspace uses a class-module-Lab breadcrumb, published theory and a read-only preview", () => {
  const course = read("src/features/courses/screens.tsx");

  assert.match(course, /LabToc/);
  assert.match(course, /preview/i);
  assert.match(course, /moduleItems/);
  assert.match(course, /content\??\.(body|\["body"\])/);
  assert.match(course, /t\("Class", "Lớp"\)/);
  assert.match(course, /t\("Module", "Chương"\)/);
});

test("assignment and submission screens preserve the selected Lab context", () => {
  const assignments = read("src/features/assignments/screens.tsx");
  const submissions = read("src/features/submissions/screens.tsx");

  assert.ok(assignments.includes('params?.get("assignment")'));
  assert.ok(assignments.includes("scrollIntoView"));
  assert.ok(assignments.includes("ring-2 ring-primary/40"));
  assert.ok(submissions.includes("submission.assignmentId !== assignmentId"));
  assert.ok(submissions.includes("No snapshot has been submitted for this Lab yet"));
});

test("WF-04 submission UI exposes every evidence gate and the sealed package digest", () => {
  const composer = read("src/features/submissions/composer.tsx");
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");
  const contract = read("src/lib/api/java-operations.ts");

  for (const gate of [
    "Step 1 · Static C1–C3 &amp; AI:",
    "Step 2 · Theory Quiz",
    "Step 3 · OpenTelemetry Runtime View:",
    "Step 4 · MAVIS Studio RuntimeReceipt",
  ])
    assert.ok(composer.includes(gate), gate);
  assert.match(composer, /const requiresStudio = guided && requiresRuntime/);
  assert.match(composer, /useCourseQuiz\(workspaceId, assignmentId, guided\)/);
  assert.match(composer, /guided && !stage2Ready/);
  assert.match(composer, /requiresStudio && !stage4Ready/);
  assert.match(
    composer,
    /\.\.\.\(interactiveStudio\s*\? capturedStudioSnapshots\.map/,
    "guided interactive Studio captures must be included in the C04 submission payload",
  );
  assert.match(
    composer,
    /staticExplanation\.trim\(\)\.length > 0\s+&& \(!requiresStudio \|\| \(interactiveStudio \? capturedStudioSnapshots\.length > 0 : runtimeExplanation\.trim\(\)\.length > 0\)\)/,
  );
  assert.ok(frozen.includes("Evidence package SHA-256"));
  assert.match(contract, /evidencePackageDigest:\s*z\s*\.string\(\)\s*\.regex/);
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
  const course =
    read("src/features/courses/screens.tsx") +
    read("src/features/courses/student-courses-dashboard.tsx");

  for (const text of [
    "Lớp học của tôi",
    "Lộ trình học tập",
    "Thao tác Lab",
    "Bài nộp & Điểm",
    "Thực nghiệm Studio Live & Nộp bài",
  ])
    assert.ok(course.includes(text), text);
});

test("Guided Lab Step 1 exposes inline C1-C3 & Dependency Graph views, pinned IDs, and 5-rule 3E evaluation", () => {
  const course = read("src/features/courses/screens.tsx");
  assert.ok(
    course.includes(
      "Read-Only Structural Views (C1–C3 + Dependency Graph) · Static source evidence only (not runtime trace)",
    ),
  );
  assert.ok(course.includes("C1 System Context"));
  assert.ok(course.includes("C2 Container"));
  assert.ok(course.includes("C3 Component"));
  assert.ok(course.includes("Service Dependency Graph"));
  assert.ok(course.includes("DiagramPreview"));
  assert.ok(course.includes("ArchitectureGraph"));
  assert.doesNotMatch(course, />sourceSnapshotId</);
  assert.doesNotMatch(course, />modelVersionId</);
  assert.doesNotMatch(course, /"Pinned learning context"/);
  assert.doesNotMatch(course, /"Lab readiness"/);
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
      {
        id: "e1",
        from: "gw",
        to: "ord",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e2",
        from: "ord",
        to: "pay",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e3",
        from: "pay",
        to: "ord",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "e4",
        from: "inv",
        to: "ord",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };

  const impact = computeArchitectureImpact(cyclicModel, "pay", "all");
  assert.equal(impact.cyclesDetected, true);
  assert.ok(impact.cycleNodeNames.includes("order-service"));
  assert.ok(impact.cycleNodeNames.includes("payment-service"));
  assert.equal(impact.directImpactCount, 1);
  assert.equal(impact.indirectImpactCount, 2);
  assert.deepEqual(impact.upstreamImpacted.map((e) => e.name).sort(), [
    "gateway",
    "inventory-service",
    "order-service",
  ]);
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
      {
        id: "d1",
        from: "a",
        to: "b",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "d2",
        from: "a",
        to: "c",
        protocol: "SERVICE_HTTP_CALL",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "d3",
        from: "b",
        to: "d",
        protocol: "DATABASE_ACCESS",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
      {
        id: "d4",
        from: "c",
        to: "d",
        protocol: "DATABASE_ACCESS",
        originLayer: "STATIC",
        uncertain: false,
        evidence: [],
      },
    ],
  };

  const diamondImpact = computeArchitectureImpact(diamondModel, "d", "all");
  assert.equal(diamondImpact.cyclesDetected, false);
  assert.equal(diamondImpact.directImpactCount, 2);
  assert.equal(diamondImpact.indirectImpactCount, 1);
});

test("Stage 4 Step 2 UI integrates Reverse BFS Explorer, inline Step 1 Back-Links, and explicit Step 3 Quiz Gate", () => {
  const course = read("src/features/courses/screens.tsx");
  const step2 = read("src/features/courses/step2-static-impact.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");

  assert.ok(course.includes("<Step2StaticImpact"));
  assert.ok(course.includes("onOpenC1C3View="));
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
  assert.ok(quiz.includes("quiz.runtimeUnlocked"));
  assert.ok(quiz.includes("quiz.latestStatus"));
  assert.match(course, /quiz\.data\?\.runtimeUnlocked === true/);
  assert.ok(quiz.includes("Proceed to Step 4: Studio Live & Submit"));
  assert.ok(quiz.includes("Step 4 Live Studio & Submission is locked until you score at least"));
});

test("Studio in the guided Lab unlocks Step 4 after Quiz Gate and embeds simulated sandbox bootstrap", () => {
  const course = read("src/features/courses/screens.tsx");
  assert.match(course, /id === 4 && runtimeReady/);
  assert.ok(course.includes("Start Studio Live Session"));
  assert.ok(course.includes("Activate Simulated Sandbox Telemetry"));
});

test("static Guided Labs unlock Step 4 LabSubmissionV2 immediately after passing Quiz Gate", () => {
  const lab = read("src/features/courses/screens.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");
  assert.match(lab, /submissionHref=\{!requiresRuntime \? submitHref : undefined\}/);
  assert.match(quiz, /href=\{submissionHref \?\? runtimeStepHref\}/);
});

test("WF-04 per-snapshot submission explanations, > 5.0/10 grading rule, and SR-15 EN/VI runtime/studio translations", async () => {
  const composer = read("src/features/submissions/composer.tsx");
  const grading = read("src/features/submissions/grading.tsx");
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");
  const runtimeScreens = read("src/features/runtime/screens.tsx");
  const dict = read("src/lib/i18n/locale-context.tsx");

  assert.ok(composer.includes("Captured Snapshots & Written Theoretical Explanations"));
  assert.ok(composer.includes("Snapshot 1 · Static C1–C3 Architecture & 3E Reasoning"));
  assert.ok(
    composer.includes("Snapshot 2 · MAVIS Studio Runtime Stop/Scale Before-After Analysis"),
  );
  assert.ok(composer.includes("(guided && !hasWrittenExplanation)"));

  assert.ok(grading.includes("const SNAPSHOT_PASS_EXCLUSIVE = 5.0"));
  assert.ok(grading.includes("Per-snapshot grading results (> 5.0 / 10 required)"));
  assert.ok(frozen.includes("Submitted Snapshots &amp; Theoretical Explanations"));
  assert.ok(runtimeScreens.includes('t("Step 2: Test Scenarios")'));

  for (const key of [
    "Studio results (Before vs. After)",
    "Step 2: Test Scenarios",
    "Step 3: Run & Trace",
    "Captured Snapshots & Written Theoretical Explanations",
    "Every required snapshot must score > 5.0 / 10 (5.01 or higher) with a mandatory overall summary to pass and unlock the next Lab; any snapshot <= 5.0 results in NEEDS REVISION.",
  ]) {
    assert.ok(dict.includes(key), `Missing Vietnamese dictionary entry for: ${key}`);
  }

  const { MockAdapter } = require("../src/lib/api/mock-adapter.ts");
  const adapter = new MockAdapter("normal", 0);
  await adapter.execute("mockLogin", { role: "student" });
  const subs = await adapter.execute("submissions", {});
  const targetSub = subs[0];
  assert.ok(targetSub, "Expected mock student submission");

  await adapter.execute("mockLogin", { role: "lecturer" });
  const failReview = await adapter.execute("gradeSubmission", {
    submissionId: targetSub.id,
    expectedRevision: 0,
    status: "GRADED",
    score: null,
    summary: "One snapshot at exact 5.0 threshold.",
    snapshotGrades: [
      { snapshotId: "STEP_1_STATIC", title: "Static C1-C3", score: 8.5, comment: "Solid" },
      {
        snapshotId: "STEP_4_RUNTIME",
        title: "Runtime Studio",
        score: 5.0,
        comment: "Missing trace link",
      },
    ],
  });
  assert.equal(failReview.labOutcome, "NEEDS_REVISION");
  assert.equal(failReview.score, 67.5);

  const passReview = await adapter.execute("gradeSubmission", {
    submissionId: targetSub.id,
    expectedRevision: 1,
    status: "GRADED",
    score: null,
    summary: "Both snapshots exceed > 5.0/10.",
    snapshotGrades: [
      { snapshotId: "STEP_1_STATIC", title: "Static C1-C3", score: 5.1, comment: "Pass" },
      { snapshotId: "STEP_4_RUNTIME", title: "Runtime Studio", score: 6.9, comment: "Verified" },
    ],
  });
  assert.equal(passReview.labOutcome, "PASSED");
  assert.equal(passReview.score, 60);

  // TC-GR01 / TC-GR02 / TC-GR03: Verify resolveSubmissionOutcome & SubmissionResult logic on > 5.0 / 10 rule
  const submissionsScreen = read("src/features/submissions/screens.tsx");
  const { resolveSubmissionOutcome } = require("../src/features/submissions/grading.tsx");
  // TC-GR01: [5.1, 8.0] -> PASS
  assert.equal(
    resolveSubmissionOutcome({
      status: "GRADED",
      score: 65.5,
      labOutcome: "PASSED",
      snapshotGrades: [{ score: 5.1 }, { score: 8.0 }],
    }),
    "PASS",
  );
  // TC-GR02: [9.0, 5.0] -> score: 70, labOutcome: "NEEDS_REVISION" -> NEEDS REVISION
  assert.equal(
    resolveSubmissionOutcome({
      status: "GRADED",
      score: 70,
      labOutcome: "NEEDS_REVISION",
      snapshotGrades: [{ score: 9.0 }, { score: 5.0 }],
    }),
    "NEEDS REVISION",
  );
  assert.equal(
    resolveSubmissionOutcome({
      status: "GRADED",
      score: 70,
      snapshotGrades: [{ score: 9.0 }, { score: 5.0 }],
    }),
    "NEEDS REVISION",
  );
  // TC-GR03: [4.9, 9.5] -> score: 72 -> NEEDS REVISION even without explicit labOutcome
  assert.equal(
    resolveSubmissionOutcome({
      status: "GRADED",
      score: 72,
      snapshotGrades: [{ score: 4.9 }, { score: 9.5 }],
    }),
    "NEEDS REVISION",
  );
  assert.equal(
    resolveSubmissionOutcome({
      status: "GRADED",
      score: 60,
      labOutcome: "PASSED",
      snapshotGrades: [{ score: 5.1 }, { score: 6.9 }],
    }),
    "PASS",
  );
  assert.ok(submissionsScreen.includes("resolveSubmissionOutcome(query.data)"));
  assert.ok(grading.includes("At least one snapshot scored <= 5.0 / 10"));
});

test("Stage 1 reference views, Step 4 submit bridge, and student BFF endpoints are wired", () => {
  const course = read("src/features/courses/screens.tsx");
  const composer = read("src/features/submissions/composer.tsx");
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");
  const ws = "11111111-1111-1111-1111-111111111111";
  const labId = "22222222-2222-2222-2222-222222222222";
  const sessId = "33333333-3333-3333-3333-333333333333";

  assert.ok(course.includes("const referenceModelQuery ="));
  assert.ok(course.includes("Jump to Submission Box"));
  assert.equal(allowedBackendPath(`workspaces/${ws}/course-labs/${labId}/student-context`), true);
  assert.equal(allowedBackendPath(`workspaces/${ws}/course-labs/${labId}/studio-sessions`), true);
  assert.equal(
    allowedBackendPath(
      `workspaces/${ws}/course-labs/${labId}/studio-sessions/${sessId}/bootstrap-studio`,
    ),
    true,
  );
  assert.ok(composer.includes('id="submission-composer"'));
  assert.ok(
    composer.includes(
      "(guided || useReferenceSnapshot) && requirements?.referenceSource?.snapshotId",
    ),
  );
  assert.ok(composer.includes("Run Static Analysis Now"));
});

test("Curated course seeding remains available without a standalone library card", () => {
  const access = read("src/features/workspaces/course-access.tsx");
  const course = read("src/features/courses/screens.tsx");
  const assignments = read("src/features/assignments/screens.tsx");
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");

  assert.ok(access.includes("export function SeedCuratedCourseLabs"));
  assert.ok(access.includes("course-labs/seed-curated"));
  assert.ok(access.includes("STANDARD_DEMO"));
  assert.ok(access.includes("FULL_CURRICULUM"));
  assert.equal(
    allowedBackendPath("workspaces/11111111-1111-1111-1111-111111111111/course-labs/seed-curated"),
    true,
  );
  assert.equal(course.includes("<SeedCuratedCourseLabs workspaceId={workspaceId}"), false);
  assert.equal(assignments.includes("<SeedCuratedCourseLabs workspaceId={workspaceId}"), false);
});

test("Course builder exposes immutable publishing and BFF routes for structured roadmap content", () => {
  const builder = read("src/features/courses/course-builder.tsx");
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");
  const workspace = "11111111-1111-1111-1111-111111111111";
  assert.ok(builder.includes("Publish course version"));
  assert.ok(builder.includes("STATIC_LAB"));
  assert.ok(builder.includes("RUNTIME_LAB"));
  assert.ok(builder.includes("prerequisiteModuleId"));
  assert.ok(builder.includes('t("Theory content", "Nội dung lý thuyết")'));
  const module = "22222222-2222-2222-2222-222222222222";
  const item = "33333333-3333-3333-3333-333333333333";
  for (const path of [
    `workspaces/${workspace}/course`,
    `workspaces/${workspace}/course/draft`,
    `workspaces/${workspace}/course/draft/start`,
    `workspaces/${workspace}/course/modules`,
    `workspaces/${workspace}/course/modules/${module}`,
    `workspaces/${workspace}/course/modules/${module}/move`,
    `workspaces/${workspace}/course/modules/${module}/items`,
    `workspaces/${workspace}/course/modules/${module}/items/${item}`,
    `workspaces/${workspace}/course/modules/${module}/items/${item}/move`,
    `workspaces/${workspace}/course/publish`,
    `workspaces/${workspace}/course/versions/1`,
    `workspaces/${workspace}/course/published`,
  ])
    assert.equal(allowedBackendPath(path), true, path);
  assert.equal(allowedBackendPath(`workspaces/${workspace}/course/draft/unsafe`), false);
  assert.equal(
    allowedBackendPath(`workspaces/${workspace}/course/modules/${module}/unsafe`),
    false,
  );
});

test("lecturer preview bypasses the roadmap lock and authoring keeps unsaved drafts", () => {
  const course = read("src/features/courses/screens.tsx");
  const builder = read("src/features/courses/course-builder.tsx");

  assert.match(course, /!preview &&\s*roadmap\.data\.guided/);
  assert.match(course, /type === "IMPACT_LAB"\) return 2/);
  assert.match(builder, /score === undefined \|\| score === "" \? 10 : Number\(score\)/);
  assert.doesNotMatch(builder, /course\.data\?\.draftRevision, course\.data\?\.title/);
});

test("BFF backend proxy exposes the mutation methods used by course authoring and grading", () => {
  const route = read("app/api/backend/[...path]/route.ts");
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    assert.match(route, new RegExp(`handler as ${method}`), method);
  }
});

test("lecturer course setup checklist links the reference runtime and Studio Live", () => {
  const access = read("src/features/workspaces/course-access.tsx");
  const course = read("src/features/courses/screens.tsx");
  const studio = read("src/features/assignments/lab-studio-section.tsx");
  const panel = read("src/features/courses/course-setup.tsx");
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");

  assert.ok(access.includes("export function useCourseAuthoring"));
  assert.ok(course.includes("<CourseBuilder workspaceId={workspaceId}"));
  assert.ok(access.includes("workspaces/${workspaceId}/course/publish"));
  assert.ok(access.includes("course-setup"));
  assert.match(panel, /Course setup/);
  assert.match(panel, /Auto-Configure Studio|Studio Live/);
  assert.match(panel, /lab-authoring\?/);
  assert.ok(!panel.includes("runtime-config?project="));
  assert.ok(course.includes("<CourseSetupPanel workspaceId={workspaceId}"));
  assert.ok(studio.includes("useAutoConfigureStudio"));
  assert.ok(!studio.includes("runtime-config?project="));
  assert.equal(
    allowedBackendPath("workspaces/11111111-1111-1111-1111-111111111111/course-setup"),
    true,
  );
});

test("guided submission attaches verified Studio session when required and renders LabSubmissionV2 in Step 4", () => {
  const lab = read("src/features/courses/screens.tsx");
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");
  const composer = read("src/features/submissions/composer.tsx");
  assert.ok(lab.includes("runtimeSessionId={verifiedSessionForSubmit}"));
  assert.match(
    subV2,
    /canSubmit\s*=\s*answer\.trim\(\)\.length > 0 && \(!studio \|\| Boolean\(runtimeSessionId\)\)/,
  );
  assert.match(composer, /s\.studioVerified && s\.snapshotId === model\.snapshotId/);
  assert.match(composer, /stage3Ready && selectedRuntime\?\.studioVerified === true/);
});

test("lecturer grading uses frozen Snapshot rows and preserves matching draft grades", () => {
  const { buildInitialSnapshotGrades } = require("../src/features/submissions/grading.tsx");
  const review = {
    snapshotGrades: [
      { snapshotId: "static", title: "Old title", score: 5.01, comment: "Checked" },
      { snapshotId: "orphan", title: "Old evidence", score: 10 },
    ],
  };
  const snapshots = [
    { snapshotId: "static", title: "Frozen static" },
    { snapshotId: "runtime", title: "Frozen runtime" },
  ];

  assert.deepEqual(buildInitialSnapshotGrades(review, snapshots), [
    { snapshotId: "static", title: "Frozen static", score: "5.01", comment: "Checked" },
    { snapshotId: "runtime", title: "Frozen runtime", score: "", comment: "" },
  ]);
  assert.equal(buildInitialSnapshotGrades(review)[0].score, "5.01");
});

test("a partial grading draft keeps valid entered scores and leaves publication incomplete", () => {
  const { parseSnapshotGradeRows } = require("../src/features/submissions/grading.tsx");
  const rows = [
    { snapshotId: "static", title: "Static", score: "5.01", comment: " Verified " },
    { snapshotId: "runtime", title: "Studio", score: "", comment: "" },
  ];
  assert.deepEqual(parseSnapshotGradeRows(rows), {
    items: [{ snapshotId: "static", title: "Static", score: 5.01, comment: "Verified" }],
    invalid: false,
    complete: false,
  });
  assert.equal(parseSnapshotGradeRows([rows[0], { ...rows[1], score: "10.01" }]).invalid, true);
  assert.equal(parseSnapshotGradeRows([rows[0], { ...rows[1], score: "5.00" }]).complete, true);
});

test("WF-04 released review state wins over legacy score fallback", () => {
  const { resolveSubmissionOutcome } = require("../src/features/submissions/grading.tsx");
  assert.equal(
    resolveSubmissionOutcome({
      status: "RETURNED",
      score: 90,
      snapshotGrades: [{ score: 9 }, { score: 8 }],
    }),
    "NEEDS REVISION",
  );
  assert.equal(
    resolveSubmissionOutcome({
      status: "PENDING",
      score: 90,
      snapshotGrades: [{ score: 9 }],
    }),
    null,
  );
});

test("a missing Course draft is an empty state, not a class-content load error", () => {
  const { ApiError } = require("../src/lib/errors/api-error.ts");
  const { isMissingCourseError } = require("../src/features/courses/course-outline.tsx");
  assert.equal(isMissingCourseError(new ApiError("not-found", 404)), true);
  assert.equal(isMissingCourseError(new ApiError("server", 500)), false);
  assert.equal(isMissingCourseError(new Error("network")), false);
  const source = read("src/features/courses/course-outline.tsx");
  assert.match(source, /isMissingCourseError\(authoring\.error\)/);
  assert.match(source, /isMissingCourseError\(publishedQuery\.error\)/);
});

test("Lab v2 info removes diagram submission and theory is lesson + repo + C1-C3", () => {
  const info = read("src/features/assignments/lab-info-form.tsx");
  const theory = read("src/features/assignments/lab-theory-section.tsx");

  assert.doesNotMatch(info, /Required architecture views/);
  assert.doesNotMatch(info, /DIAGRAM_REQUIREMENTS/);
  assert.ok(info.includes("Theory + Quiz"));
  assert.ok(info.includes("Theory + Quiz + Studio"));
  assert.ok(info.includes("Students do not submit diagrams"));
  assert.ok(theory.includes("MarkdownEditor"));
  assert.ok(theory.includes("MarkdownPreview"));
  assert.ok(theory.includes("Sample repository"));
  assert.ok(theory.includes("C1 System Context"));
  assert.ok(theory.includes("AssignmentSourceDetails"));
});

test("smartFormatMarkdown converts raw pasted text into headings, lists, paragraphs and callouts", () => {
  const { smartFormatMarkdown } = require("../src/features/assignments/lab-theory-section.tsx");
  const raw = [
    "Chapter 1: Java Foundations",
    "Line one of a broken",
    "PDF paragraph.",
    "• Bullet A",
    "– Bullet B",
    "Note: Always pin your version.",
  ].join("\n");
  const formatted = smartFormatMarkdown(raw);
  assert.ok(formatted.includes("## Chapter 1: Java Foundations"));
  assert.ok(formatted.includes("Line one of a broken PDF paragraph."));
  assert.ok(formatted.includes("- Bullet A"));
  assert.ok(formatted.includes("- Bullet B"));
  assert.ok(formatted.includes("> **Note:** Always pin your version."));
});

test("MarkdownPreview supports whole-lesson presentation themes without altering text", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const {
    MarkdownPreview,
    applyMarkdownTheme,
    extractMarkdownTheme,
  } = require("../src/components/shared/markdown-preview.tsx");

  const withAcademic = applyMarkdownTheme("# Title\n\nBody text", "academic");
  assert.ok(withAcademic.startsWith("<!-- theme: academic -->\n"));
  assert.deepEqual(extractMarkdownTheme(withAcademic), {
    theme: "academic",
    body: "# Title\n\nBody text",
  });
  assert.equal(applyMarkdownTheme(withAcademic, "coursera"), "# Title\n\nBody text");

  const docsHtml = renderToStaticMarkup(
    React.createElement(MarkdownPreview, {
      markdown: "<!-- theme: docs -->\n# Heading\n\nParagraph content.",
    }),
  );
  assert.ok(docsHtml.includes('data-markdown-theme="docs"'));
  assert.ok(!docsHtml.includes("theme: docs"));
  assert.match(docsHtml, /<h1[^>]*>Heading<\/h1>/);
});

test("MarkdownPreview renders safe headings, emphasis and links without raw HTML", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { MarkdownPreview } = require("../src/components/shared/markdown-preview.tsx");
  const html = renderToStaticMarkup(
    React.createElement(MarkdownPreview, {
      markdown:
        "# Lesson\n\n**Bold** and [docs](https://example.com).\n\n- One\n- Two\n\n<script>alert(1)</script>",
    }),
  );
  assert.match(html, /<h1[^>]*>Lesson<\/h1>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /<li>One<\/li>/);
  assert.doesNotMatch(html, /<script>/);
});

test("Quiz builder supports manual types, import/export, bank, versions and 80 percent", () => {
  const builder = read("src/features/assignments/quiz-builder.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");
  const types = read("src/features/assignments/quiz-types.ts");

  for (const label of ["Questions", "Preview", "Import / Export", "Question bank", "Versions"])
    assert.ok(builder.includes(label), label);
  assert.ok(builder.includes("SINGLE_CHOICE"));
  assert.ok(builder.includes("MULTI_CHOICE"));
  assert.ok(builder.includes("TRUE_FALSE"));
  assert.ok(builder.includes("Publish version"));
  assert.ok(builder.includes("parseQuizJson"));
  assert.ok(builder.includes("parseQuizCsv"));
  assert.ok(types.includes("DEFAULT_PASS_PERCENT = 80"));
  assert.ok(quiz.includes("selections:"));
  assert.ok(quiz.includes("Select all that apply"));
  assert.ok(quiz.includes("questionResults"));
});

test("quiz import parser validates JSON and CSV into typed questions", () => {
  const {
    parseQuizJson,
    parseQuizCsv,
    quizToCsv,
  } = require("../src/features/assignments/quiz-types.ts");
  const json = parseQuizJson(
    JSON.stringify({
      lesson: "Boundaries",
      passPercent: 80,
      questions: [
        { prompt: "Pick one", options: ["A", "B"], correctOption: 1, explanation: "B" },
        {
          prompt: "Pick many",
          type: "MULTI_CHOICE",
          options: ["A", "B", "C"],
          correctOptions: [0, 2],
        },
      ],
    }),
  );
  assert.deepEqual(json.errors, []);
  assert.equal(json.draft.questions.length, 2);
  assert.equal(json.draft.questions[1].type, "MULTI_CHOICE");

  const csv = parseQuizCsv(
    'type,prompt,options,correct,explanation,points\nSINGLE_CHOICE,"Pick one","A|B",1,"Because B",1',
  );
  assert.deepEqual(csv.errors, []);
  assert.equal(csv.draft.questions[0].correctOption, 1);
  assert.match(quizToCsv(csv.draft.questions), /SINGLE_CHOICE/);
});

test("BFF allows Quiz draft, publish, versions and question bank paths", () => {
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");
  const workspace = "11111111-1111-1111-1111-111111111111";
  const lab = "22222222-2222-2222-2222-222222222222";
  const question = "33333333-3333-3333-3333-333333333333";
  for (const path of [
    `workspaces/${workspace}/course-labs/${lab}/quiz/draft`,
    `workspaces/${workspace}/course-labs/${lab}/quiz/draft/curriculum`,
    `workspaces/${workspace}/course-labs/${lab}/quiz/publish`,
    `workspaces/${workspace}/course-labs/${lab}/quiz/versions`,
    `workspaces/${workspace}/course-labs/${lab}/quiz/generate`,
    `workspaces/${workspace}/course-labs/${lab}/export`,
    `workspaces/${workspace}/course-labs/import`,
    `workspaces/${workspace}/theory-assets`,
    `workspaces/${workspace}/theory-assets/import-file`,
    `workspaces/${workspace}/theory-assets/import-url`,
    `workspaces/${workspace}/theory-assets/${lab}`,
    `workspaces/${workspace}/course-labs/${lab}/theory-assets`,
    `workspaces/${workspace}/course-labs/${lab}/theory-assets/${question}`,
    `workspaces/${workspace}/course-labs/${lab}/theory-assets/generate`,
    `workspaces/${workspace}/lab-prerequisites`,
    `workspaces/${workspace}/course-labs/${lab}/prerequisites`,
    `workspaces/${workspace}/course-labs/${lab}/studio-exercise`,
    `workspaces/${workspace}/quiz-bank/questions`,
    `workspaces/${workspace}/quiz-bank/questions/${question}`,
  ]) {
    assert.equal(allowedBackendPath(path), true, path);
  }
  assert.equal(allowedBackendPath(`workspaces/${workspace}/quiz-bank/unsafe`), false);
  assert.equal(allowedBackendPath(`workspaces/${workspace}/theory-assets/unsafe`), false);
});

test("Lab Library is available inside Lab Creation and Quiz can be generated from Lab theory", () => {
  const navigation = read("src/lib/navigation.ts");
  const assignments = read("src/features/assignments/screens.tsx");
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const quiz = read("src/features/assignments/quiz-builder.tsx");
  const transfer = read("src/features/assignments/lab-transfer.tsx");
  const publish = read("src/features/assignments/lab-publish-section.tsx");
  const theory = read("src/features/assignments/lab-theory-section.tsx");

  assert.doesNotMatch(navigation, /label: "Lab Library"|label: "Theory Library"/);
  assert.ok(authoring.includes('id: "library", en: "Lab Library"'));
  assert.ok(authoring.includes('id: "theory-library", en: "Theory Library"'));
  assert.ok(authoring.includes("<Assignments embedded />"));
  assert.ok(authoring.includes("<TheoryLibrary />"));
  assert.match(navigation, /id: "lab-authoring"[\s\S]*?label: "Lab Creation"/);
  assert.ok(authoring.includes('id: "library", en: "Lab Library"'));
  assert.ok(authoring.includes('id: "theory-library", en: "Theory Library"'));
  assert.ok(authoring.includes("<Assignments embedded />"));
  assert.ok(authoring.includes("<TheoryLibrary />"));
  assert.doesNotMatch(navigation, /label: "Lab Authoring"/);
  assert.ok(assignments.includes("Library draft"));
  assert.ok(assignments.includes("In class"));
  assert.ok(assignments.includes("<PublishCourseLab"));
  assert.ok(authoring.includes("Back to Lab Library"));
  assert.ok(quiz.includes("/quiz/generate"));
  assert.ok(quiz.includes("Generate from theory"));
  assert.ok(quiz.includes("sourceTheoryItems"));
  assert.ok(assignments.includes("ImportLabButton"));
  assert.ok(publish.includes("ExportLabButton"));
  assert.ok(transfer.includes("course-labs/${assignmentId}/export"));
  assert.ok(transfer.includes("course-labs/import"));
  assert.ok(theory.includes("Theory library"));
  assert.ok(theory.includes("/theory-assets"));
  assert.ok(theory.includes("theory-assets/import-file"));
  assert.ok(theory.includes("theory-assets/import-url"));
  assert.ok(theory.includes(".pdf,.docx,.pptx"));
  assert.ok(theory.includes("AI draft from evidence"));
  assert.ok(theory.includes("Save to library & attach"));
  const prerequisites = read("src/features/assignments/lab-prerequisites-dialog.tsx");
  assert.ok(assignments.includes("LabPrerequisitesDialog"));
  assert.ok(prerequisites.includes("lab-prerequisites"));
  assert.ok(prerequisites.includes("/prerequisites"));
  const studioExercise = read("src/features/assignments/studio-exercise-editor.tsx");
  assert.ok(studioExercise.includes("studio-exercise"));
  assert.ok(studioExercise.includes("Baseline workload"));
  assert.ok(studioExercise.includes("no code editing"));
});

test("Theory Library is available inside Lab Creation with editing and course publishing", () => {
  const screen = read("src/features/workspaces/theory-library.tsx");
  const page = read("app/[screen]/page.tsx");
  const navigation = read("src/lib/navigation.ts");
  const authoring = read("src/features/assignments/lab-authoring.tsx");

  assert.match(page, /"theory-library"/);
  assert.doesNotMatch(navigation, /id: "theory-library"/);
  assert.ok(authoring.includes("<TheoryLibrary />"));
  assert.ok(screen.includes("theory-assets"));
  assert.ok(screen.includes("New lesson"));
  assert.ok(screen.includes("Edit theory lesson"));
  assert.ok(screen.includes("Delete lesson"));
  assert.ok(screen.includes("Publish course version"));
  assert.ok(screen.includes("MarkdownPreview"));
});

test("Studio Live authoring runs self-contained inline topology and playtest without external jumps", () => {
  const studio = read("src/features/assignments/lab-studio-section.tsx");
  const theory = read("src/features/assignments/lab-theory-section.tsx");
  const workbench = read("src/features/runtime/studio-workbench.tsx");
  const live = read("src/features/runtime/live-studio-workbench.tsx");

  assert.ok(studio.includes("useAutoConfigureStudio"));
  assert.ok(studio.includes("LiveStudioWorkbench"));
  assert.ok(!studio.includes("/sessions?"));
  assert.ok(!studio.includes("/studio?"));
  assert.ok(!theory.includes("/diagrams?"));
  assert.ok(!theory.includes("/architecture?"));
  assert.match(workbench, /Live project/);
  assert.match(workbench, /Select a project/);
  assert.match(workbench, /session\.projectId === projectId/);
  assert.match(workbench, /executionStatus === "RUNNING"/);
  assert.match(workbench, /requestedReturnTo/);
  assert.match(live, /projectId/);
  assert.match(live, /projectName/);
  assert.match(live, /project: projectId/);
});

test("Studio Live setup uses a visual prepared topology builder and Lab session context", () => {
  const editor = read("src/features/runtime/prepared-topology-editor.tsx");
  const studio = read("src/features/assignments/lab-studio-section.tsx");
  const contract = read("src/lib/api/contracts.ts");
  const domain = read("src/types/domain.ts");
  const runtime = read("src/features/runtime/backend.tsx");
  const screens = read("src/features/runtime/screens.tsx");

  assert.ok(editor.includes("Add block"));
  assert.ok(editor.includes("Add connection"));
  assert.ok(editor.includes("Save prepared topology"));
  assert.ok(editor.includes("Advanced JSON"));
  assert.doesNotMatch(editor, /textarea[^>]*Prepared Studio topology JSON/);
  assert.ok(studio.includes("PreparedTopologyEditor"));
  assert.ok(studio.includes("verifiedSession"));
  assert.ok(studio.includes("sessionId={verifiedSession"));
  assert.ok(studio.includes("useAutoConfigureStudio"));
  assert.ok(screens.includes('assignmentId ? `&assignment=${assignmentId}` : ""'));
  assert.ok(
    screens.includes('studioTopology: config.data.profile["studioTopology"]') ||
      screens.includes('studioTopology: config.data?.profile?.["studioTopology"]'),
  );
  assert.match(runtime, /studioTopology:\s*rawProfile\["studioTopology"\]/);
  assert.match(screens, /studioTopology:\s*rawProf\["studioTopology"\]/);
});

test("submission v2 draft keys isolate user, workspace and assignment and clear on submit", () => {
  const { labSubmissionDraftKey } = require("../src/features/courses/lab-submission-v2.tsx");
  const source = read("src/features/courses/lab-submission-v2.tsx");

  const a = labSubmissionDraftKey("u1", "w1", "lab1");
  const b = labSubmissionDraftKey("u2", "w1", "lab1");
  const c = labSubmissionDraftKey("u1", "w2", "lab1");
  const d = labSubmissionDraftKey("u1", "w1", "lab2");
  assert.equal(new Set([a, b, c, d]).size, 4);
  assert.equal(labSubmissionDraftKey(undefined, "w1", "lab1"), "mavis:lab-v2-draft:anon:w1:lab1");

  assert.match(source, /window\.localStorage\.getItem\(draftKey\)/);
  assert.match(source, /window\.localStorage\.setItem\(draftKey,\s*next\)/);
  assert.match(source, /onSuccess:[\s\S]*window\.localStorage\.removeItem\(draftKey\)/);
});

test("FrozenArtifacts renders digest, quiz proof and snapshot explanations for Lab v2 without diagram layout", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { FrozenArtifacts } = require("../src/features/submissions/frozen-artifacts.tsx");

  const html = renderToStaticMarkup(
    React.createElement(FrozenArtifacts, {
      submission: {
        id: "sub-v2",
        assignmentId: "lab-1",
        assignmentTitle: "Lab V2",
        studentId: "stu-1",
        studentName: "Student 1",
        model: { id: "mod-1", revision: 1, elements: [], edges: [] },
        snapshot: { id: "snap-1", digest: "sha256:snap" },
        diagramVersionId: null,
        diagramLayout: null,
        evidencePackageDigest: "sha256:" + "e".repeat(64),
        courseQuizEvidence: {
          status: "PASSED",
          correctCount: 4,
          questionCount: 4,
          passPercent: 80,
          quizVersion: 1,
        },
        studentSnapshots: [
          {
            snapshotId: "THEORY_THEORY",
            step: "THEORY",
            title: "Theory explanation",
            writtenExplanation: "Isolated databases preserve service autonomy.",
          },
        ],
        feedback: [],
        submittedAt: "2026-11-17T10:00:00Z",
      },
    }),
  );

  assert.ok(html.includes("Frozen Lab evidence"));
  assert.ok(html.includes("Evidence package SHA-256:"));
  assert.ok(html.includes("Course Quiz Gate Proof"));
  assert.ok(html.includes("Submitted Snapshots &amp; Theoretical Explanations"));
  assert.ok(html.includes("Isolated databases preserve service autonomy."));
  assert.ok(html.includes("No diagram artifact required for this Lab mode."));
});

test("GradeForm renders student snapshot explanations and preserves dirty draft across review revision sync", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const { LocaleProvider } = require("../src/lib/i18n/locale-context.tsx");
  const { ApiContext } = require("../src/providers/app-context.ts");
  const { GradeForm } = require("../src/features/submissions/grading.tsx");
  const source = read("src/features/submissions/grading.tsx");

  assert.match(source, /<GradeForm\s+key=\{submissionId\}/);
  assert.match(source, /if\s*\(review\.revision\s*!==\s*syncedRevision\)/);
  assert.match(source, /if\s*\(!dirty\)/);
  assert.match(source, /expectedRevision:\s*review\.revision/);

  const html = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        React.createElement(
          ApiContext.Provider,
          { value: {} },
          React.createElement(GradeForm, {
            guidedLab: true,
            review: {
              submissionId: "sub-1",
              revision: 2,
              status: "PENDING",
              score: null,
              summary: "",
              lecturerId: null,
              lecturerName: null,
              updatedAt: null,
              snapshotGrades: [],
              labOutcome: "PENDING",
            },
            studentSnapshots: [
              {
                snapshotId: "THEORY_THEORY",
                step: "THEORY",
                title: "Theory explanation",
                writtenExplanation: "Orders route controller delegates cleanly to payment.",
              },
            ],
          }),
        ),
      ),
    ),
  );

  assert.ok(html.includes("Theory explanation"));
  assert.ok(html.includes("Orders route controller delegates cleanly to payment."));
});

test("FE-02 Student Submissions eliminate ReadOnlyDrawio iframe/.drawio and isolate classes strictly by workspaceId", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { FrozenArtifacts } = require("../src/features/submissions/frozen-artifacts.tsx");
  const { filterStudentSubmissions } = require("../src/features/submissions/screens.tsx");
  const frozenSource = read("src/features/submissions/frozen-artifacts.tsx");
  const screensSource = read("src/features/submissions/screens.tsx");
  const componentsSource = read("src/features/submissions/components.tsx");

  assert.doesNotMatch(frozenSource, /ReadOnlyDrawio|submission-viewer\.html|\.drawio/);
  assert.doesNotMatch(
    screensSource,
    /ArchitectureGraph|ElementDetailsPanel|FeedbackPanel|Runtime evidence not submitted/,
  );
  assert.ok(screensSource.includes("ClassGradebookMatrix"));
  assert.match(componentsSource, /if\s*\(!canReview\)\s*\{?\s*return/);

  const legacyDrawioHtml = renderToStaticMarkup(
    React.createElement(FrozenArtifacts, {
      submission: {
        id: "sub-legacy",
        assignmentId: "lab-legacy",
        assignmentTitle: "Legacy Lab",
        studentId: "stu-1",
        studentName: "Student 1",
        model: { id: "mod-1", revision: 1, elements: [], edges: [] },
        snapshot: { id: "snap-1", digest: "sha256:snap" },
        diagramVersionId: "diag-1",
        diagramLayout: {
          artifacts: [
            {
              notation: "C4_CONTAINER",
              layoutJson: { drawioXml: "<mxfile><diagram>legacy</diagram></mxfile>" },
            },
          ],
        },
        feedback: [],
        submittedAt: "2026-11-17T10:00:00Z",
      },
    }),
  );
  assert.ok(!legacyDrawioHtml.includes("submission-viewer.html"));
  assert.ok(!legacyDrawioHtml.includes(".drawio"));
  assert.ok(legacyDrawioHtml.includes("Download diagram JSON"));

  const subClassA = {
    id: "sub-a",
    assignmentId: "lab-1",
    workspaceId: "ws-a",
    studentId: "stu-1",
    model: { id: "m1", revision: 1, elements: [], edges: [] },
    snapshot: { id: "s1", digest: "d1" },
    diagramVersionId: null,
    diagramLayout: null,
    feedback: [],
    submittedAt: "2026-11-17T10:00:00Z",
  };
  const subClassB = {
    ...subClassA,
    id: "sub-b",
    assignmentId: "lab-2",
    workspaceId: "ws-b",
  };
  const filtered = filterStudentSubmissions([subClassA, subClassB], "ws-a", "");
  assert.deepEqual(
    filtered.map((s) => s.id),
    ["sub-a"],
  );
});

test("ADM-V2 Enterprise Control Center removes /administration/studio links and wires 1-click user/session controls", () => {
  const adminScreens = read("src/features/administration/screens.tsx");
  const adminOps = read("src/features/administration/operations.tsx");
  const runtimeBackend = read("src/features/runtime/backend.tsx");
  const nav = read("src/lib/navigation.ts");

  assert.doesNotMatch(adminScreens, /administration\/studio/);
  assert.doesNotMatch(adminOps, /administration\/studio/);
  assert.doesNotMatch(runtimeBackend, /administration\/studio/);
  assert.doesNotMatch(nav, /administration\/studio/);
  assert.ok(adminScreens.includes("createAccount"));
  assert.ok(adminScreens.includes("Activate"));
  assert.ok(adminOps.includes("forceStopRuntimeSession"));
  assert.ok(adminScreens.includes("actorName"));
});

test("Lecturer flow, 1-Click Login, MockAdapter JAVA-MS-2026, and clean routes have no 404 links or hidden Passkeys", () => {
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");
  assert.equal(allowedBackendPath("workspaces/bootstrap-java-coursera"), true);

  const loginSrc = read("app/login/page.tsx");
  assert.ok(!loginSrc.includes("1-Click Test Login"));
  assert.ok(loginSrc.includes("gv.java@mavis.edu.vn"));
  assert.ok(loginSrc.includes("sv.java@mavis.edu.vn"));
  assert.ok(loginSrc.includes("admin@mavis.edu.vn"));
  assert.ok(loginSrc.includes("JAVA-MS-2026"));
  assert.ok(loginSrc.includes("JAVA2026"));

  const workspacesSrc = read("src/features/workspaces/screens.tsx");
  const teacherDashSrc = read("src/features/workspaces/teacher-dashboard.tsx");
  assert.ok(!workspacesSrc.includes("/workspace-members"));
  assert.ok(!teacherDashSrc.includes("/workspace-members"));
  assert.ok(workspacesSrc.includes("#class-passkey"));
  assert.ok(teacherDashSrc.includes("#class-passkey"));

  const managerSrc = read("src/features/courses/lecturer-curriculum-manager.tsx");
  assert.ok(!managerSrc.includes("/theory-assets"));
  assert.ok(!managerSrc.includes("/assignments/new"));
  assert.ok(!managerSrc.includes('className={showPasskeyDrawer ? "block" : "sr-only'));
  assert.ok(managerSrc.includes("Active Class Passkeys:"));
  assert.ok(managerSrc.includes("<CoursePasskey"));

  const outlineSrc = read("src/features/courses/course-outline.tsx");
  assert.ok(!outlineSrc.includes("#course-builder"));
  assert.ok(outlineSrc.includes("view=course-authoring"));

  const essaySrc = read("src/features/courses/course-essay-panel.tsx");
  assert.ok(essaySrc.includes("row.title || row.criterion"));
  assert.ok(essaySrc.includes("row.weightPoints ?? row.maxScore"));

  const mockSrc = read("src/lib/api/mock-adapter.ts");
  assert.ok(mockSrc.includes("workspace-java-ms-2026"));
  assert.ok(mockSrc.includes("JAVA-MS-2026"));
});

test("courseQuizEvidenceSchema accepts Theory-only PASSED and NOT_REQUIRED payloads without referenceModelId", () => {
  const { courseQuizEvidenceSchema } = require("../src/types/domain.ts");
  const passedWithoutModel = courseQuizEvidenceSchema.parse({
    status: "PASSED",
    attemptId: "a1",
    quizVersion: 1,
    correctCount: 2,
    questionCount: 2,
    passPercent: 100,
    submittedAt: "2026-11-19T00:00:00Z",
  });
  assert.equal(passedWithoutModel.status, "PASSED");
  assert.equal(passedWithoutModel.referenceModelId, undefined);

  const notRequired = courseQuizEvidenceSchema.parse({
    status: "NOT_REQUIRED",
    labTier: "THEORY_ONLY",
  });
  assert.equal(notRequired.status, "NOT_REQUIRED");
});

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
  assert.match(routes, /<AppShell\s+scope=\{config\.scope\}\s+activeId=\{screen\}/);
  assert.match(home, /<PublicHomepage\s*\/>/);
});

test("student navigation follows Course to Roadmap to Lab and submissions", () => {
  const navigation = read("src/lib/navigation.ts");

  for (const label of [
    "My Courses",
    "Join Course",
    "Course Roadmap",
    "Lab Workspace",
    "My Submissions",
    "Free Studio Sandbox",
  ])
    assert.ok(navigation.includes(label), label);
  assert.match(navigation, /href:\s*"\/roadmap"/);
  assert.match(navigation, /href:\s*"\/lab"/);
  assert.match(navigation, /href:\s*"\/courses"/);
});

test("student course landing prioritizes joined classes, defers curriculum and keeps Passkey deep-link", () => {
  const course = read("src/features/courses/screens.tsx");
  const curriculum = read("src/features/courses/curriculum.tsx");
  const nav = read("src/lib/navigation.ts");
  assert.ok(course.includes('id="course-passkey"'));
  assert.ok(course.includes('aria-controls="course-passkey-form"'));
  assert.ok(course.includes("Continue learning"));
  assert.ok(course.includes("Reference materials: Java and C#"));
  assert.match(curriculum, /useCurriculum\(open\)/);
  assert.match(nav, /\/courses#course-passkey/);
});

test("student class outline uses published roadmap and markdown activities with a legacy roadmap fallback", () => {
  const outline = read("src/features/courses/course-outline.tsx");
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  assert.ok(outline.includes("usePublishedCourse(workspaceId)"));
  assert.ok(outline.includes("legacyLabs.length > 0"));
  assert.ok(outline.includes("<MarkdownPreview"));
  assert.ok(outline.includes("Pass the preceding Labs to unlock this activity."));
  assert.ok(shell.includes('tab === "content" || tab === "submissions"'));
});

test("student submissions are scoped by selected class roster and retain class navigation", () => {
  const submissions = read("src/features/submissions/screens.tsx");
  assert.ok(submissions.includes("idsInSelectedClass.has(submission.studentId)"));
  assert.ok(
    submissions.includes('<CourseWorkspaceShell workspace={workspace} active="submissions">'),
  );
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
  assert.match(
    course,
    /state: model \? "READY" : referenceSnapshotId \? "IN PROGRESS" : "MISSING"/,
  );
  assert.match(course, /job\.status === "completed" && job\.analysisState !== "PARTIAL"/);
  assert.match(course, /<CourseQuiz workspaceId=\{workspaceId\} labId=\{labId\}/);
  assert.match(quiz, /queryKey: \["api", "course-quiz", workspaceId, labId\]/);
  assert.match(quiz, /api<Result>\(`\$\{path\}\/attempts`/);
  assert.match(course, /\/assignments\?workspace=.*&assignment=/s);
  assert.match(course, /\/submissions\?workspace=.*&assignment=/s);
});

test("guided Lab resumes a Runtime session scoped to its selected project and static model", () => {
  const course = read("src/features/courses/screens.tsx");
  assert.match(course, /item\.projectId === projectId && item\.modelId === model\?\.id/);
  assert.match(course, /sessionId \? \{ session: sessionId \}/);
  assert.match(course, /Open Runtime session/);
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
    "Check & publish",
  ])
    assert.ok(authoring.includes(label), label);
  assert.ok(info.includes('t("Save Lab draft", "Lưu bản nháp Lab")'));
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
  assert.ok(studio.includes("runtime-config?project="));
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
  assert.ok(submissions.includes("submission.assignmentId === assignmentId"));
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
  assert.ok(
    course.includes(
      "Read-Only Structural Views (C1–C3 + Dependency Graph) · Static source evidence only (not runtime trace)",
    ),
  );
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
  assert.ok(quiz.includes("quiz.runtimeUnlocked"));
  assert.ok(quiz.includes("quiz.latestStatus"));
  assert.match(course, /quiz\.data\?\.runtimeUnlocked === true/);
  assert.ok(quiz.includes("Proceed to Step 3: Live Runtime"));
  assert.ok(quiz.includes("Step 3 Live Docker Runtime is locked until you score at least"));
});

test("Studio in the guided Lab requires observed traces on the current model", () => {
  const course = read("src/features/courses/screens.tsx");
  assert.match(course, /item\.projectId === projectId && item\.modelId === model\?\.id/);
  assert.match(course, /const studioReady = runtimeReady && Boolean\(observedRuntime\)/);
  assert.match(course, /id === 4 && studioReady/);
});

test("static Guided Labs proceed from a passing Quiz to submission", () => {
  const lab = read("src/features/courses/screens.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");
  assert.match(lab, /!requiresRuntime && activeStep > 2 \? 2 : activeStep/);
  assert.match(lab, /submissionHref=\{staticSubmission \? submitHref : undefined\}/);
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

test("Stage 1 reference views, 1-click workspace init, Step 4 submit bridge, and composer 1-click analysis", () => {
  const course = read("src/features/courses/screens.tsx");
  const composer = read("src/features/submissions/composer.tsx");

  assert.ok(course.includes("const referenceModelQuery ="));
  assert.ok(course.includes("Initialize & Analyze My Lab Workspace"));
  assert.ok(course.includes("Proceed to Submit Lab"));
  assert.ok(course.includes("#submission-composer"));
  assert.ok(composer.includes('id="submission-composer"'));
  assert.ok(
    composer.includes(
      "(guided || useReferenceSnapshot) && requirements?.referenceSource?.snapshotId",
    ),
  );
  assert.ok(composer.includes("Run Static Analysis Now"));
});

test("Stage 3 lecturer 1-click curated course lab seeder is wired on courses and assignments pages", () => {
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
  assert.ok(course.includes("<SeedCuratedCourseLabs workspaceId={workspaceId}"));
  assert.ok(assignments.includes("<SeedCuratedCourseLabs workspaceId={workspaceId}"));
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

  assert.match(course, /!preview && roadmap\.data\.guided/);
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
  assert.match(panel, /Studio Live/);
  assert.match(panel, /runtime-config\?project=/);
  assert.ok(course.includes("<CourseSetupPanel workspaceId={workspaceId}"));
  assert.ok(studio.includes("runtime-config?project="));
  assert.equal(
    allowedBackendPath("workspaces/11111111-1111-1111-1111-111111111111/course-setup"),
    true,
  );
});

test("guided submission requires Studio evidence on the selected model", () => {
  const lab = read("src/features/courses/screens.tsx");
  const composer = read("src/features/submissions/composer.tsx");
  assert.match(lab, /canSubmitFromStep4 = step === 4 && runtimeReady && studioVerified/);
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
    `workspaces/${workspace}/quiz-bank/questions`,
    `workspaces/${workspace}/quiz-bank/questions/${question}`,
  ]) {
    assert.equal(allowedBackendPath(path), true, path);
  }
  assert.equal(allowedBackendPath(`workspaces/${workspace}/quiz-bank/unsafe`), false);
});

test("Studio Live authoring and standalone Studio carry project and return context", () => {
  const studio = read("src/features/assignments/lab-studio-section.tsx");
  const workbench = read("src/features/runtime/studio-workbench.tsx");
  const live = read("src/features/runtime/live-studio-workbench.tsx");

  assert.ok(studio.includes("Start Live session"));
  assert.ok(studio.includes("Open MAVIS Studio"));
  assert.match(studio, /\/sessions\?/);
  assert.match(studio, /\/studio\?/);
  assert.match(studio, /returnTo/);
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
  assert.ok(studio.includes("assignment: assignment.id"));
  assert.match(contract, /assignmentId:\s*id\.optional\(\)/);
  assert.match(domain, /assignmentId:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(runtime, /assignmentId \? \{ assignmentId \}/);
  assert.ok(studio.includes("&assignment=${assignment.id}"));
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

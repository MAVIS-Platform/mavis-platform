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
    "Grades",
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
  assert.match(shell, /pathname === "\/workspaces" && !selectedWorkspaceId/);
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

test("Lab UI keeps unavailable progress gates honest and runs the 3-phase Studio workflow inside /lab", () => {
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
    /Lab thực hành Studio Live/,
  );
  assert.match(course, /job\.status === "completed" && job\.analysisState !== "PARTIAL"/);
  assert.match(course, /Runtime Studio is not available yet/);
  assert.doesNotMatch(course, /<CourseQuiz/);
  assert.match(quiz, /queryKey: \["api", "course-quiz", workspaceId, labId\]/);
  assert.match(quiz, /api<Result>\(`\$\{path\}\/attempts`/);
  assert.match(course, /\/submissions\?workspace=.*&assignment=/s);
  assert.ok(course.includes("useStudentLabContext("));
  assert.ok(course.includes("useStudentLabStudioSessions("));
});

test("guided Lab launches standalone full-screen Runtime Studio without external /sessions redirect", () => {
  const course = read("src/features/courses/screens.tsx");
  const standalone = read("src/features/runtime/standalone-studio-live.tsx");
  const screenPage = read("app/[screen]/page.tsx");
  const stepContentSource = course.slice(course.indexOf("function StepContent("));
  assert.ok(course.includes("buildStudioLiveHref("));
  assert.ok(standalone.includes("<LiveStudioWorkbench"));
  assert.ok(standalone.includes("useStartLabStudioSession("));
  assert.ok(!standalone.includes("useBootstrapLabStudio("));
  assert.ok(!standalone.includes("step=2"));
  assert.ok(standalone.includes("step=3#lab-submit"));
  assert.ok(standalone.includes("Runtime access required"));
  assert.ok(!standalone.includes("Quiz Gate Required"));
  assert.ok(screenPage.includes('if (screen === "studio-live") return <StandaloneStudioLive />;'));
  assert.ok(!stepContentSource.includes("href={`/sessions?"));
  assert.ok(!stepContentSource.includes("href={`/diagrams?"));
  assert.ok(!stepContentSource.includes("href={`/architecture?"));
  assert.ok(!stepContentSource.includes("href={`/assignments?"));
});

test("lecturer Lab authoring keeps only Lab information and Studio Live phases", () => {
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const info = read("src/features/assignments/lab-info-form.tsx");
  const assignments = read("src/features/assignments/screens.tsx");

  for (const label of ["Lab information", "Studio Live"])
    assert.ok(authoring.includes(label), label);
  assert.doesNotMatch(authoring, /LabSourceSection|LabPublishSection|Reference source|Check & add to class/);
  assert.ok(info.includes('t("Next Step 2: Studio Live", "Sang Bước 2: Studio Live")'));
  assert.ok(info.includes("Studio Live is configured next."));
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

test("assignment authoring keeps Lab details and Studio while Course owns source and publishing", () => {
  const info = read("src/features/assignments/lab-info-form.tsx");
  const source = read("src/features/assignments/lab-source-section.tsx");
  const studio = read("src/features/assignments/lab-studio-section.tsx");
  const publish = read("src/features/assignments/lab-publish-section.tsx");

  assert.ok(info.includes("Instructions, learning goals and completion criteria"));
  assert.ok(source.includes("AssignmentSourcePicker"));
  assert.ok(studio.includes("useAutoConfigureStudio"));
  assert.ok(!studio.includes("runtime-config?project="));
  assert.ok(publish.includes("CourseSetupPanel"));
  assert.doesNotMatch(publish, /theoryReady|tab: "theory"/);
  assert.doesNotMatch(read("src/features/assignments/lab-authoring.tsx"), /LabSourceSection|LabPublishSection/);
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

test("LabWorkspace uses a class-module-Lab breadcrumb, a focused entry summary and a read-only preview", () => {
  const course = read("src/features/courses/screens.tsx");

  assert.doesNotMatch(course, /<LabToc/);
  assert.match(course, /expandModuleFlowItems/);
  assert.match(course, /preview/i);
  assert.doesNotMatch(course, /Learning objective/);
  assert.doesNotMatch(course, /Reference snapshot/);
  assert.doesNotMatch(course, /Next requirement/);
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
  assert.doesNotMatch(frozen, /Evidence package SHA-256/);
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
    "MAVIS Runtime Studio",
  ])
    assert.ok(course.includes(text), text);
});

test("Guided Lab Step 1 exposes inline C1-C3 & Dependency Graph views and hides clutter banners", () => {
  const course = read("src/features/courses/screens.tsx");
  assert.ok(!course.includes("Explore the curated C1–C3 views and Dependency Graph."));
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
  assert.doesNotMatch(course, /StaticEvaluationSummary/);
  assert.doesNotMatch(course, /"Download Reference \.zip"/);
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

test("Static Studio provides the Reverse BFS hypothesis before Runtime Studio validates it", () => {
  const course = read("src/features/courses/screens.tsx");
  const step2 = read("src/features/courses/step2-static-impact.tsx");

  assert.ok(course.includes("<Step2StaticImpact"));
  assert.ok(course.includes("onOpenC1C3View="));
  assert.ok(step2.includes("computeArchitectureImpact"));
  assert.ok(step2.includes("Cycle Detected & Safely Terminated"));
  assert.ok(step2.includes("Unaffected & Isolated Elements"));
  assert.ok(step2.includes("kind=CONTEXT"));
  assert.ok(step2.includes("kind=CONTAINER"));
  assert.ok(step2.includes("kind=COMPONENT"));
  assert.ok(step2.includes("/impact?"));

  assert.match(course, /quiz\.data\?\.runtimeUnlocked === true/);
  assert.ok(course.includes("compare predicted and observed impact"));
});

test("Studio in the guided Lab keeps Runtime Studio as a separate phase and connects to Studio Live", () => {
  const course = read("src/features/courses/screens.tsx");
  const standalone = read("src/features/runtime/standalone-studio-live.tsx");
  assert.match(course, /if \(id === 2\) return runtimeReady/);
  assert.ok(course.includes("Open Studio Live"));
  assert.ok(
    !standalone.includes("Activate Simulated Sandbox Telemetry"),
    "Studio Live must stay strictly real-Docker and never offer simulated sandbox telemetry fallback",
  );
});

test("Evidence & Submit receives the verified Runtime Studio session", () => {
  const lab = read("src/features/courses/screens.tsx");
  assert.match(lab, /runtimeSessionId=\{verifiedSessionForSubmit\}/);
  assert.match(lab, /Boolean\(studentContext\?\.latestSubmission\)/);
  assert.match(
    lab,
    /const runtimeEvidenceSatisfied = Boolean\(verifiedStudioSession\) \|\| hasSubmitted/,
  );
  assert.match(lab, /Complete the MAVIS Studio Live session and capture a snapshot/);
  assert.ok(!lab.includes("1. Tiến độ hoàn thành Module"));
  assert.ok(!lab.includes("2. Kết quả bài kiểm tra (Quiz)"));
  assert.match(lab, /studioSessionData=\{requiresRuntime \? runtimeEvidence : undefined\}/);
  assert.doesNotMatch(lab, /Telemetry & service interactions/);
  assert.doesNotMatch(lab, /Before \/ After studio actions/);
  assert.match(lab, /\(step === 2 \|\| step === 3\)/);
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
  assert.ok(grading.includes("Per-item grading breakdown (> 5.0 / 10 required)"));
  assert.ok(frozen.includes("Student work & explanation"));
  assert.ok(runtimeScreens.includes('t("Step 2: Test Scenarios")'));

  for (const key of [
    "Studio results (Before vs. After)",
    "Step 2: Test Scenarios",
    "Step 3: Run & Trace",
    "Captured Snapshots & Written Theoretical Explanations",
    "Every required snapshot must score above 5.0 / 10 with a mandatory overall summary to pass and unlock the next Lab; any snapshot <= 5.0 results in NEEDS REVISION.",
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
  assert.ok(!course.includes("Jump to Submission Box"));
  assert.ok(course.includes('document.getElementById("lab-submit")'));
  assert.ok(course.includes('scrollIntoView({ behavior: "smooth", block: "start" })'));
  assert.ok(course.includes("Runtime Studio is not configured"));
  assert.ok(course.includes("Configure Runtime Studio"));
  assert.ok(course.includes("Complete the Module Quiz first"));
  assert.ok(course.includes("Pass the Module Quiz to unlock Runtime Studio."));
  assert.ok(course.includes("Go to Module Quiz"));
  assert.ok(
    read("src/features/courses/student-course-syllabus.tsx").includes('searchParams.get("item")'),
  );
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

test("Curated library UI stays removed while the seeding API remains available", () => {
  const access = read("src/features/workspaces/course-access.tsx");
  const course = read("src/features/courses/screens.tsx");
  const assignments = read("src/features/assignments/screens.tsx");
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");

  assert.doesNotMatch(
    [access, course, assignments].join("\n"),
    /SeedCuratedCourseLabs|MAVIS Curated Course & Lab Library/,
  );
  assert.equal(
    allowedBackendPath("workspaces/11111111-1111-1111-1111-111111111111/course-labs/seed-curated"),
    true,
  );
});

test("Course builder delegates publishing to lifecycle activation and keeps structured roadmap routes", () => {
  const builder = read("src/features/courses/course-builder.tsx");
  const { allowedBackendPath } = require("../src/lib/api/backend-path.ts");
  const workspace = "11111111-1111-1111-1111-111111111111";
  assert.ok(!builder.includes("Publish changes"));
  assert.ok(builder.includes('t("Add Module", "Thêm chương")'));
  assert.ok(builder.includes("border-dashed"));
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
  assert.match(course, /type === "RUNTIME_LAB"\) return 2/);
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

test("Lab phases surface concise issue dialogs with a recovery action", () => {
  const lab = read("src/features/courses/screens.tsx");
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");
  assert.doesNotMatch(lab, /Copy report for lecturer/);
  assert.match(lab, /Static Studio data could not load/);
  assert.match(lab, /Runtime Studio session needs attention/);
  assert.match(lab, /Runtime evidence is incomplete/);
  assert.match(lab, /onRequestHelp=\{\(reason\) => openPhaseIssue\(reason\)\}/);
  assert.match(subV2, /onRequestHelp\?\.\("submission-failed"\)/);
  assert.match(
    subV2,
    /studio && !runtimeSessionId \? "submission-runtime" : "submission-explanation"/,
  );
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

test("Lab v2 info removes diagram submission and sends authoring directly to reference source", () => {
  const info = read("src/features/assignments/lab-info-form.tsx");
  const theory = read("src/features/assignments/lab-theory-section.tsx");

  assert.doesNotMatch(info, /Required architecture views/);
  assert.doesNotMatch(info, /DIAGRAM_REQUIREMENTS/);
  assert.doesNotMatch(info, /Lab learning flow/);
  assert.doesNotMatch(read("src/features/assignments/lab-publish-section.tsx"), /BR-06 Quiz Gate|tab: "quiz"/);
  assert.doesNotMatch(info, /Lab Theory|Lý thuyết Lab/);
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
    `workspaces/${workspace}/theory-assets/reusable`,
    `workspaces/${workspace}/quiz-assets`,
    `workspaces/${workspace}/quiz-assets/catalog`,
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

test("Lab Creation omits Lab Theory while Lesson owns document, URL and smart-format authoring", () => {
  const navigation = read("src/lib/navigation.ts");
  const assignments = read("src/features/assignments/screens.tsx");
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const quiz = read("src/features/assignments/quiz-builder.tsx");
  const transfer = read("src/features/assignments/lab-transfer.tsx");
  const publish = read("src/features/assignments/lab-publish-section.tsx");
  const lesson = read("src/features/workspaces/theory-library.tsx");

  assert.doesNotMatch(navigation, /label: "Lab Library"|label: "Theory Library"/);
  assert.ok(authoring.includes('id: "library", en: "Lab Library"'));
  assert.ok(authoring.includes("<Assignments embedded />"));
  assert.doesNotMatch(authoring, /LabTheorySection|id: "theory"|Lab theory/);
  assert.doesNotMatch(navigation, /id: "lab-authoring"[\s\S]*?label: "Labs"/);
  assert.ok(authoring.includes('id: "library", en: "Lab Library"'));
  assert.ok(authoring.includes("<Assignments embedded />"));
  assert.doesNotMatch(navigation, /label: "Lab Authoring"/);
  assert.ok(assignments.includes("Library draft"));
  assert.ok(assignments.includes("In class"));
  assert.ok(assignments.includes("<PublishCourseLab"));
  assert.ok(authoring.includes("Back to Lab Library"));
  assert.ok(quiz.includes("/quiz/generate"));
  assert.ok(quiz.includes("Generate from materials"));
  assert.ok(quiz.includes("sourceTheoryItems"));
  assert.ok(assignments.includes("ImportLabButton"));
  assert.ok(publish.includes("ExportLabButton"));
  assert.ok(transfer.includes("course-labs/${assignmentId}/export"));
  assert.ok(transfer.includes("course-labs/import"));
  assert.ok(lesson.includes("/theory-assets"));
  assert.ok(lesson.includes("theory-assets/import-file"));
  assert.ok(lesson.includes("theory-assets/import-url"));
  assert.ok(lesson.includes(".pdf,.docx,.pptx"));
  assert.ok(lesson.includes("Use AI to format"));
  assert.ok(lesson.includes("Smart Format"));
  const prerequisites = read("src/features/assignments/lab-prerequisites-dialog.tsx");
  assert.ok(assignments.includes("LabPrerequisitesDialog"));
  assert.ok(prerequisites.includes("lab-prerequisites"));
  assert.ok(prerequisites.includes("/prerequisites"));
  const studioExercise = read("src/features/assignments/studio-exercise-editor.tsx");
  assert.ok(studioExercise.includes("studio-exercise"));
  assert.ok(studioExercise.includes("Baseline workload"));
  assert.ok(studioExercise.includes("no code editing"));
});

test("Theory Library edits the inactive draft and delegates publishing to Course activation", () => {
  const screen = read("src/features/workspaces/theory-library.tsx");
  const page = read("app/[screen]/page.tsx");
  const navigation = read("src/lib/navigation.ts");
  const authoring = read("src/features/assignments/lab-authoring.tsx");

  assert.match(page, /"theory-library"/);
  assert.doesNotMatch(navigation, /id: "theory-library"/);
  assert.doesNotMatch(authoring, /TheoryLibrary/);
  assert.ok(screen.includes("theory-assets"));
  assert.ok(screen.includes("New lesson"));
  assert.ok(screen.includes("Edit theory lesson"));
  assert.ok(screen.includes("Delete lesson"));
  assert.ok(!screen.includes("Publish course version"));
  assert.ok(screen.includes("published automatically when the course is activated"));
  assert.ok(screen.includes("MarkdownPreview"));
});

test("Studio Live authoring prepares Docker runtime in Step 5 and opens standalone full-screen Studio Live with Action Toolbox", () => {
  const studio = read("src/features/assignments/lab-studio-section.tsx");
  const standalone = read("src/features/runtime/standalone-studio-live.tsx");
  const parity = read("src/features/runtime/live-sandbox-parity.tsx");
  const theory = read("src/features/assignments/lab-theory-section.tsx");
  const workbench = read("src/features/runtime/studio-workbench.tsx");
  const live = read("src/features/runtime/live-studio-workbench.tsx");

  assert.ok(studio.includes("useAutoConfigureStudio"));
  assert.ok(studio.includes("buildStudioLiveHref"));
  assert.ok(standalone.includes("LiveStudioWorkbench"));
  assert.ok(parity.includes("Action Toolbox"));
  assert.ok(parity.includes("application/x-mavis-studio-tool"));
  assert.ok(parity.includes("Visual Builder"));
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
  assert.ok(studio.includes("Open Visual Studio Builder"));
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

  assert.ok(html.includes("Student work &amp; explanation"));
  assert.ok(!html.includes("sha256:"));
  assert.ok(!html.includes("Lab Quiz Result"));
  assert.ok(html.includes("Student explanation"));
  assert.ok(html.includes("Isolated databases preserve service autonomy."));
  assert.ok(!html.includes("No diagram artifact required for this Lab mode."));
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

  assert.ok(html.includes('id="mavis-simple-score"'));
  assert.ok(html.includes("9.5") && html.includes("8.5") && html.includes("7.0"));
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

test("ADM-V2 Enterprise Control Center wires Admin Studio Setup Hub and 1-click user/session controls", () => {
  const adminScreens = read("src/features/administration/screens.tsx");
  const adminOps = read("src/features/administration/operations.tsx");
  const adminPage = read("app/administration/[screen]/page.tsx");
  const runtimeBackend = read("src/features/runtime/backend.tsx");
  const nav = read("src/lib/navigation.ts");

  assert.match(
    nav,
    /id:\s*"studio-setup",\s*label:\s*"Studio".*href:\s*"\/administration\/studio-setup"/,
  );
  assert.match(adminOps, /href:\s*"\/administration\/studio-setup"/);
  assert.match(
    adminPage,
    /"studio-setup":\s*\{\s*title:\s*"Studio Setup",\s*component:\s*AdminStudioSetup\s*\}/,
  );
  assert.match(adminScreens, /export function AdminStudioSetup\(\)/);
  assert.match(adminScreens, /href="\/workspaces"/);
  assert.doesNotMatch(adminScreens, /href="\/administration\/studio"/);
  assert.doesNotMatch(runtimeBackend, /administration\/studio/);
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
  assert.ok(!workspacesSrc.includes("ClassPasskeyDialog"));
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

test("Learning Workspace keeps curriculum and previous/next navigation within the active module", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");

  assert.match(syllabus, /activeModule\?\.items\.map\(\(item\)/);
  assert.match(syllabus, /const activeModuleItemIndex =\s*activeModule\?\.items\.findIndex/);
  assert.match(syllabus, /activeModule\.items\[activeModuleItemIndex \+ 1\]/);
  assert.match(syllabus, /activeModule\.items\[activeModuleItemIndex - 1\]/);
  assert.match(syllabus, /router\.push\(/);
  assert.match(syllabus, /\["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"\]\.includes\(item\.type\)/);
  assert.doesNotMatch(syllabus, /Lab journey/);
  assert.doesNotMatch(syllabus, /Module Quiz/);
  assert.doesNotMatch(syllabus, /4-Step Guided Learning Checklist/);
});

test("Round 4 guards isolate each Lab entry, adapt Theory Only labs, prevent sign-out 401, and allow repo-less feedback", () => {
  const screens = read("src/features/courses/screens.tsx");
  const appShell = read("src/components/app-shell.tsx");
  const ops = read("src/lib/api/java-operations.ts");

  assert.match(
    screens,
    /const hasReferenceArch = Boolean\(activeModelId \|\| referenceSnapshotId\)/,
  );
  assert.match(screens, /Lab objective/);
  assert.match(screens, /title: "Static Studio"/);
  assert.match(screens, /title: "MAVIS Runtime Studio"/);
  assert.match(screens, /title: "Summary & Submit"/);
  assert.doesNotMatch(screens, /<CourseQuiz/);
  assert.match(appShell, /const canQueryAuth =\s*!signingOut/);
  assert.match(
    ops,
    /pinned\["modelVersionId"\] != null && pinned\["modelVersionId"\] !== id\(input, "modelId"\)/,
  );
});

test("Round 5 guards strip Theory theme metadata, check quizVersion > 0, hydrate latestSubmission, and preserve Studio freeze errors", () => {
  const theoryLib = read("src/features/workspaces/theory-library.tsx");
  const labScreens = read("src/features/assignments/screens.tsx");
  const authoring = read("src/features/assignments/lab-authoring.tsx");
  const submissionV2 = read("src/features/courses/lab-submission-v2.tsx");
  const apiError = read("src/lib/errors/api-error.ts");

  assert.match(theoryLib, /extractMarkdownTheme\(asset\.body\)\s*\.body/);
  assert.match(labScreens, /setupLab\?\.quizPublished && \(setupLab\?\.quizVersion \?\? 0\) > 0/);
  assert.doesNotMatch(authoring, /quizPublished|LabQuizSection|id: "quiz"/);
  assert.match(submissionV2, /const latest =\s*mine\[0\] \?\?\s*\(initialSubmission/);
  assert.match(submissionV2, /activeReview\?\.labOutcome === "NEEDS_REVISION"/);
  assert.match(apiError, /STUDIO_VALIDATION_REQUIRED/);
});

test("Round 6 reuses core ArchitecturePresentation in Lab Creation, fixes Step 2 readiness, and exposes top-bar Snapshot", () => {
  const sourceSection = read("src/features/assignments/lab-source-section.tsx");
  const theorySection = read("src/features/assignments/lab-theory-section.tsx");
  const components = read("src/features/architecture/components.tsx");
  const studioWorkbench = read("src/features/runtime/live-studio-workbench.tsx");
  const curriculumMgr = read("src/features/courses/lecturer-curriculum-manager.tsx");

  assert.match(sourceSection, /<ArchitecturePresentation[\s\S]*guidedStatic[\s\S]*controlledKind=/);
  assert.match(theorySection, /<ArchitecturePresentation[\s\S]*guidedStatic[\s\S]*controlledKind=/);
  assert.match(sourceSection, /studioComposeReady/);
  assert.match(components, /const \[origin, setOrigin\] = useState<[^>]+>\("all"\);/);
  assert.match(studioWorkbench, /Snapshot[\s\S]*captureSnapshot/);
  assert.doesNotMatch(curriculumMgr, /2D Studio/);
});

test("Lecturer Studio Live authoring uses unified single top bar, non-red healthy nodes, 409 auto-retry, and Step 6 handoff", () => {
  const live = read("src/features/runtime/live-studio-workbench.tsx");
  const standalone = read("src/features/runtime/standalone-studio-live.tsx");
  const access = read("src/features/workspaces/course-access.tsx");
  const obs = read("src/features/runtime/studio-observability.tsx");

  assert.match(live, /standaloneHeader\?\.left/);
  assert.match(live, /aria-label="Lecturer setup panel tabs"/);
  assert.doesNotMatch(live, /Test Live Docker/);
  assert.match(live, /isBooting \? "Booting…" : "Run"/);
  assert.match(live, /Visual Studio Builder/);
  assert.match(live, /Student Will Receive/);
  assert.match(live, /isTerminalAuthorSession/);
  assert.match(live, /services\.includes\(studio\.service\)/);
  assert.match(live, /Expand telemetry dock/);
  assert.doesNotMatch(live, /aria-label="Lecturer Lab Setup Guide"/);
  assert.match(standalone, /Done · Course Builder/);
  assert.match(standalone, /\/workspace-overview\?workspace=.*view=course-authoring&flowStep=arrange/);
  assert.match(standalone, /setQueryData\(\["api", "runtimeConfiguration"/);
  assert.match(standalone, /cause\.status === 409/);
  assert.match(access, /queryKey: \["api", "runtimeConfiguration"\]/);
  assert.match(obs, /confirmed\?\.result\?\.replicasAfter !== undefined/);
  assert.match(obs, /isImpactedByOutage/);
  assert.doesNotMatch(obs, /isStopped \|\| isAffected/);
  assert.match(
    live,
    /const canvasSelected = services\.includes\(studio\.service\) \? studio\.service : "";/,
  );
  assert.match(obs, /else if \(clickedBlankCanvas && selected\) onSelect\(""\);/);
  assert.doesNotMatch(obs, /const accentColor = isStopped \? s : "#(38bdf8|2dd4bf|a78bfa)"/);
  const parity = read("src/features/runtime/live-sandbox-parity.tsx");
  assert.match(parity, /LIVE_LIFECYCLE_TOOLS/);
  assert.match(parity, /LIVE_SCALE_TOOLS/);
  assert.match(parity, /Drag onto block/);
  assert.doesNotMatch(parity, /Scale ×8 Max Load/);
  assert.doesNotMatch(live, /Preview · Select a block/);
  assert.match(live, /Cluster Overview[\s\S]*<StudioRedCharts[\s\S]*Traffic &amp; reliability[\s\S]*Resource capacity/);
  assert.doesNotMatch(live, /Decrease \$\{service\} replicas|Increase \$\{service\} replicas/);
  assert.match(live, /Service Telemetry[\s\S]*p95 \/ Traffic & Err%[\s\S]*detailed telemetry/);
  assert.match(live, /<LiveTerminalConsole/);
  const recording = read("src/features/runtime/studio-recording.ts");
  const evidence = read("src/features/runtime/studio-evidence.tsx");
  assert.match(obs, /preserveMotion = false/);
  assert.match(recording, /canvas\[data-studio-webgl-canvas\]/);
  assert.match(recording, /video\/webm;codecs=vp8/);
  assert.match(evidence, /aria-label="Step traffic flows"/);
  assert.match(live, /Capture evidence snapshot[\s\S]*Record 3D video/);
  assert.match(live, /aria-label="Runtime traffic flows"/);
  const exerciseEditor = read("src/features/assignments/studio-exercise-editor.tsx");
  const apiErrors = read("src/lib/errors/api-error.ts");
  assert.doesNotMatch(standalone, /StudioExerciseEditor|PreparedTopologyEditor/);
  assert.doesNotMatch(
    exerciseEditor,
    /Recommended Studio Live Exercise Preset|Studio exercise \(teacher\)/,
  );
  assert.doesNotMatch(standalone, /composePoolServices[\s\S]{0,400}detectedServices/);
  assert.match(standalone, /stripTransientRuntimeProfile/);
  assert.match(apiErrors, /STUDIO_TOPOLOGY_INVALID/);
  assert.match(parity, /isPreview[\s\S]*"Starts Down"[\s\S]*"Prepared"/);
  assert.doesNotMatch(live, /Provisioning real Docker containers on Runner/);
  assert.match(
    live,
    /<LiveTerminalConsole[\s\S]*isBooting=\{isBooting\}[\s\S]*systemError=\{terminalSystemError\}/,
  );
});

test("Studio Live project terminal parser multiplexes compose logs, stack traces, runner actions and warnings", () => {
  const { buildTerminalEntries } = require("../src/features/runtime/live-terminal-console.tsx");
  const entries = buildTerminalEntries({
    sessionId: "s-1",
    interactive: true,
    services: ["api-gateway", "order-service"],
    finishRequested: false,
    executionStatus: "RUNNING",
    cleanupStatus: "PENDING",
    actions: [
      {
        actionId: "00000000-0000-4000-8000-000000000001",
        action: "SCALE",
        service: "order-service",
        replicas: 2,
        status: "CONFIRMED",
        requestedAt: "2026-11-20T09:15:15.000Z",
        completedAt: "2026-11-20T09:15:16.000Z",
        result: {
          action: "SCALE",
          service: "order-service",
          replicasBefore: 1,
          replicasAfter: 2,
          confirmed: true,
          metricsBefore: {},
          metricsAfter: { requestCount: 12, p95LatencyMs: 38, errorRatePercent: 0 },
        },
      },
    ],
    telemetry: {
      observedAt: "2026-11-20T09:15:17.000Z",
      services: [
        {
          service: "api-gateway",
          replicas: 1,
          runningReplicas: 1,
          stats: [],
          logs: [
            "api-gateway-1  | 2026-11-20T09:15:14.000Z ERROR Upstream timeout calling order-service",
            "api-gateway-1  |   at com.mavis.Gateway.route(Gateway.java:42)",
          ].join("\n"),
        },
        {
          service: "order-service",
          replicas: 2,
          runningReplicas: 2,
          stats: [],
          logs: "order-service-1 | 2026-11-20T09:15:12.000Z INFO Started OrderApplication in 1.8s",
        },
      ],
      spans: [],
      interactions: [],
      warnings: ["Collector dropped 1 span"],
    },
  });

  assert.equal(entries.length, 5);
  assert.equal(entries[0].sourceLabel, "order-service-1");
  assert.equal(entries[0].level, "INFO");
  assert.equal(entries[1].sourceLabel, "api-gateway-1");
  assert.equal(entries[1].level, "ERROR");
  assert.equal(entries[2].level, "ERROR");
  assert.match(entries[2].message, /Gateway\.java:42/);
  assert.equal(entries[3].sourceLabel, "mavis-runner");
  assert.match(entries[3].message, /\[CONFIRMED\] SCALE order-service -> 2/);
  assert.equal(entries[4].sourceLabel, "otel-collector");
  assert.equal(entries[4].level, "WARN");
});

test("Step 2 Reference Architecture and C1-C3 native SVG preview eliminate Draw.io iframes and use theme-adaptive blueprint styling", () => {
  const sourceSection = read("src/features/assignments/lab-source-section.tsx");
  const diagrams = read("src/features/architecture/architecture-diagrams.tsx");
  const svgViewer = read("src/features/architecture/architecture-svg-viewer.tsx");
  const drawioEditor = read("src/features/architecture/drawio-editor.tsx");
  const drawioSnapshot = read("src/features/architecture/drawio-snapshot.tsx");

  assert.match(sourceSection, /Reference Architecture/);
  assert.match(sourceSection, /formatStack/);
  assert.match(sourceSection, /formatProtocol/);
  assert.match(sourceSection, /hasConnectionFiles/);
  assert.match(sourceSection, /Application Containers/);
  assert.doesNotMatch(sourceSection, /Lab Studio Setup/);
  assert.doesNotMatch(diagrams, /This view shows the system boundary/);
  assert.match(
    diagrams,
    /<ArchitectureSvgViewer[\s\S]*selectedId=\{selectedId\}[\s\S]*onSelect=\{onSelect\}/,
  );
  assert.match(svgViewer, /getSvgNodePalette/);
  assert.match(svgViewer, /shape === "cylinder"/);
  assert.match(svgViewer, /shape === "channel"/);
  assert.match(svgViewer, /exitX !== null && edge\.exitY !== null/);
  assert.match(svgViewer, /aria-label="Architecture diagram SVG preview"/);
  assert.match(svgViewer, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svgViewer, /translate3d\(\$\{view\.pan\.x\}px, \$\{view\.pan\.y\}px, 0\) scale\(\$\{view\.zoom\}\)/);
  assert.match(svgViewer, /<DiagramViewportToolbar/);
  assert.doesNotMatch(svgViewer, /<iframe|diagrams\.net|127\.0\.0\.1:8090/);
  assert.doesNotMatch(
    drawioEditor,
    /<iframe|diagrams\.net|Draw\.io Local|Draw\.io Cloud|127\.0\.0\.1:8090/,
  );
  assert.doesNotMatch(drawioSnapshot, /<iframe|diagrams\.net|127\.0\.0\.1:8090/);
});

test("Studio Live terminal surfaces backend failureReason and Runner diagnostics on FAILED sessions without resetting to STANDBY", () => {
  const { buildTerminalEntries } = require("../src/features/runtime/live-terminal-console.tsx");
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");
  const terminal = read("src/features/runtime/live-terminal-console.tsx");

  const entries = buildTerminalEntries(
    {
      sessionId: "sess-fail-1",
      interactive: true,
      services: ["api-gateway", "order-service"],
      finishRequested: false,
      executionStatus: "FAILED",
      cleanupStatus: "CONFIRMED",
      actions: [],
    },
    [
      "Sandbox container startup failed (DOCKER_UP_FAILED).",
      "MAVIS_RUNTIME_DIAGNOSTIC=DOCKER_UP_FAILED",
      "MAVIS_RUNTIME_DIAGNOSTIC=DOCKER_UP_FAILED",
    ],
  );

  assert.equal(entries.length, 2);
  assert.equal(entries[0].sourceLabel, "mavis-runner");
  assert.equal(entries[0].level, "ERROR");
  assert.match(entries[0].message, /DOCKER_UP_FAILED/);
  assert.equal(entries[1].message, "MAVIS_RUNTIME_DIAGNOSTIC=DOCKER_UP_FAILED");

  assert.match(workbench, /useApiQuery\(\s*"runtimeReadSession"/);
  assert.match(workbench, /const terminalData: Studio = useMemo/);
  assert.match(workbench, /isPreviewMode=\{isPreviewMode && !lastSessionFailed\}/);
  assert.match(workbench, /diagnosticLines=\{failedDiagnostics\}/);
  assert.match(terminal, /diagnosticLines\.length > 0/);
});

test("Studio Live workbench and terminal display live FIFO queue position for QUEUED sessions", () => {
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");
  const terminal = read("src/features/runtime/live-terminal-console.tsx");
  const contracts = read("src/lib/api/contracts.ts");
  const errors = read("src/lib/errors/api-error.ts");

  assert.match(contracts, /queuePosition:/);
  assert.match(contracts, /activeSlots:/);
  assert.match(contracts, /maxSlots:/);
  assert.match(workbench, /const isQueued = data\.executionStatus\.toUpperCase\(\) === "QUEUED"/);
  assert.match(workbench, /QUEUED\$\{data\.queuePosition \? ` #\$\{data\.queuePosition\}` : ""\}/);
  assert.match(terminal, /Queued \(\$\{posLabel\}\)\$\{slotInfo\}/);
  assert.match(errors, /STUDIO_QUEUE_FULL:/);
});

test("normalizeWorkspaceGradebook maps Java userId/completedLabsCount/sequenceOrder to FE gradebook fields", () => {
  const { normalizeWorkspaceGradebook } = require("../src/lib/format/gradebook.ts");
  const normalized = normalizeWorkspaceGradebook({
    workspaceId: "ws-java",
    workspaceName: "JAVA-MS-2026",
    labs: [
      {
        assignmentId: "lab-1",
        title: "Service Boundaries",
        sequenceOrder: 1,
        published: true,
        quizPassScore: 70,
      },
    ],
    students: [
      {
        userId: "stu-1",
        fullName: "Nguyen Van A",
        email: "sv.java@mavis.edu.vn",
        completedLabsCount: 1,
        totalLabsCount: 5,
        averageScore: 95,
        averageScoreTenScale: 9.5,
        cells: [],
      },
    ],
  });

  assert.equal(normalized.labs[0].labOrder, 1);
  assert.equal(normalized.students[0].studentId, "stu-1");
  assert.equal(normalized.students[0].passedLabs, 1);
  assert.equal(normalized.students[0].totalLabsCount, 5);
  assert.equal(normalized.students[0].averageScoreTenScale, 9.5);
});

test("Wave 2: MarkdownPreview formats inline LaTeX math safely without touching prices or code spans", () => {
  const { formatInlineMath } = require("../src/components/shared/markdown-preview.tsx");
  assert.equal(
    formatInlineMath(
      "Scale from $1 \\to 4$ ($8$ instances) with $\\ge 70\\%$ coverage and $\\rightarrow$ arrow",
    ),
    "Scale from 1 → 4 (8 instances) with ≥ 70% coverage and → arrow",
  );
  assert.equal(
    formatInlineMath("Budget is $100 and limit is $200"),
    "Budget is $100 and limit is $200",
  );
  assert.equal(
    formatInlineMath("Code `$1 \\to 4$` stays literal"),
    "Code `$1 \\to 4$` stays literal",
  );
});

test("Wave 2: Course access removes JAVA2026 leak, FrozenArtifacts handles V2 null/undefined diagramVersionId, and AI Tutor uses threeEChat", () => {
  const courseAccess = read("src/features/workspaces/course-access.tsx");
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");
  const screens = read("src/features/courses/screens.tsx");

  assert.doesNotMatch(
    courseAccess,
    /JAVA2026|EXPIRED_KEY_999|Quick test helpers|useBootstrapJavaCoursera/,
  );
  assert.match(frozen, /!submission\.diagramVersionId/);
  assert.match(screens, /threeEChat/);
  assert.doesNotMatch(screens, /PaymentClient\.java/);
});

test("Bug #01: useCourseAuthoring and CourseOutline gate course/published fetches on publishedVersion > 0", () => {
  const courseAccess = read("src/features/workspaces/course-access.tsx");
  const outline = read("src/features/courses/course-outline.tsx");

  assert.match(
    courseAccess,
    /export function usePublishedCourse\(workspaceId: string, enabled = true\)/,
  );
  assert.match(courseAccess, /publishedVersion \?\? 0\) > 0/);
  assert.match(outline, /function LecturerCourseOutline/);
  assert.match(outline, /published=\{authoring\.published\.data\}/);
  assert.match(outline, /usePublishedCourse\(workspaceId\)/);
});

test("Bug #02: CourseBuilder resolves linked Lab assignment tiers and keeps module headers tag-free", () => {
  const builder = read("src/features/courses/course-builder.tsx");
  const outline = read("src/features/courses/course-outline.tsx");

  assert.match(builder, /resolveBuilderItemType/);
  assert.match(builder, /itemTypeForAssignment\(linked\)/);
  assert.doesNotMatch(builder, /meta\.tone/);
  assert.doesNotMatch(builder, /inspectedMeta\.tone/);
  assert.doesNotMatch(outline, /Theory Only|Full Studio/);
});

test("Bug #03: decodePlainTextEntities decodes escaped entities and StudentCourseSyllabus shows empty roadmap notice", () => {
  const { decodePlainTextEntities } = require("../src/lib/format/course-display.ts");
  assert.equal(
    decodePlainTextEntities("IOptions&lt;T&gt; &amp; ValidateOnStart"),
    "IOptions<T> & ValidateOnStart",
  );
  assert.equal(decodePlainTextEntities("&amp;lt;script&amp;gt;"), "&lt;script&gt;");

  const pages = read("src/features/courses/mavis-pages.tsx");
  const ws = read("src/features/workspaces/screens.tsx");
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  assert.match(pages, /decodePlainTextEntities/);
  assert.match(ws, /decodePlainTextEntities/);
  assert.match(syllabus, /No modules have been published for this class yet\./);
  assert.match(syllabus, /No published modules yet/);
});

test("Bug #05: Reverse BFS analysis stays contextual and does not show stale Quiz instructions", () => {
  const step2Impact = read("src/features/courses/step2-static-impact.tsx");

  assert.doesNotMatch(step2Impact, /Proceed to Step 3 Quiz|How to complete Step 2/);
  assert.match(step2Impact, /Static impact analysis/);
  assert.match(step2Impact, /Static dependency only/);
  assert.match(step2Impact, /onImpactChange/);
});

test("Bug #07: formatLabModeLabel humanizes labMode enums and SubmissionReview back link avoids trailing ampersand", () => {
  const { formatLabModeLabel } = require("../src/lib/format/course-display.ts");
  assert.equal(
    formatLabModeLabel("THEORY_QUIZ_STUDIO", (en) => en),
    "Theory + Quiz + Studio",
  );
  assert.equal(
    formatLabModeLabel("THEORY_QUIZ_STUDIO", (_en, vi) => vi),
    "Lý thuyết + Quiz + Studio",
  );
  assert.equal(
    formatLabModeLabel("THEORY_QUIZ", (en) => en),
    "Theory + Quiz",
  );
  assert.equal(
    formatLabModeLabel("THEORY_ONLY", (en) => en),
    "Theory Only",
  );

  const screens = read("src/features/submissions/screens.tsx");
  const components = read("src/features/submissions/components.tsx");
  assert.match(screens, /new URLSearchParams\(\)/);
  assert.match(screens, /formatLabModeLabel\(s\.labMode, t\)/);
  assert.match(components, /formatLabModeLabel\(submission\.labMode, t\)/);
});

test("Bug #11: ChapterQuizRunner allows partial submit with confirmation, auto-submits at 00:00, shows questionResults feedback, honors dynamic passPercent & MULTI_CHOICE", () => {
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");
  const timer = read("src/features/courses/quiz-timer.tsx");

  assert.match(runner, /questionResults\?:/);
  assert.match(runner, /type=\{multi \? "checkbox" : "radio"\}/);
  assert.match(runner, /const passPercent =/);
  assert.match(runner, /confirmPartialOpen/);
  assert.match(runner, /Bạn còn \$\{remainingCount\} câu chưa trả lời/);
  assert.match(runner, /disabled=\{submitting\}/);
  assert.match(runner, /autoSubmittedAttemptRef/);
  assert.doesNotMatch(runner, /if \(!backendQuizEnabled \|\| allAnsweredInRunner\)/);
  assert.match(timer, /Time left:/);
  assert.match(timer, /Còn lại:/);
  assert.doesNotMatch(timer, /Giới hạn/);
  assert.match(timer, /text-2xl/);
  assert.match(runner, /queryKey: \["api", "course-roadmap", workspaceId\]/);
  assert.match(runner, /queryKey: \["api", "workspace-gradebook", workspaceId\]/);
  assert.match(runner, /queryKey: \["api", "workspaces"\]/);
  assert.match(
    runner,
    /canViewFeedback =\s*\(!backendQuizEnabled && !inlineBackendQuizEnabled\) \|\| Boolean\(currentAttempt\.questionResults\?\.length\)/,
  );
  assert.match(runner, /<QuizPreview[\s\S]*?questions=\{displayedQuestions\}/);
});

test("Bug #12 + Coursera Clean Theory: THEORY lessons omit InteractiveConceptStage, render clean Markdown + Mark as completed, and avoid Java quiz fallback leakage", () => {
  const {
    getScenarioForLessonOrLab,
  } = require("../src/features/courses/designed-to-scale-scenarios.ts");
  for (let ch = 1; ch <= 12; ch++) {
    const code = `csharp-v2-ch${String(ch).padStart(2, "0")}`;
    const mod = ch <= 3 ? 1 : ch <= 6 ? 2 : ch <= 9 ? 3 : ch <= 11 ? 4 : 5;
    const scenario = getScenarioForLessonOrLab(mod, code, "CSHARP-MS-2026");
    assert.ok(scenario.code.startsWith("csharp-"), `${code} should map to csharp-* scenario`);
    const dump = JSON.stringify(scenario);
    assert.doesNotMatch(dump, /Java 21|Resilience4j|Tomcat|OpenFeign|Eureka/);
  }
  const ch10 = getScenarioForLessonOrLab(
    4,
    "Chương 10: Polly v8 & Microsoft.Extensions.Http.Resilience",
    "CSHARP-MS-2026",
  );
  assert.equal(ch10.code, "csharp-v2-ch10");

  const {
    theoryCompletionStorageKey,
    toggleCompletedTheoryId,
  } = require("../src/lib/coursera-ui-helpers.ts");
  assert.notEqual(
    theoryCompletionStorageKey("student-1", "ws-1"),
    theoryCompletionStorageKey("student-2", "ws-1"),
  );
  assert.notEqual(
    theoryCompletionStorageKey("student-1", "ws-1"),
    theoryCompletionStorageKey("student-1", "ws-2"),
  );
  const key = theoryCompletionStorageKey("student-1", "ws-1");
  assert.deepEqual(toggleCompletedTheoryId(key, [], "item-1"), ["item-1"]);
  assert.deepEqual(toggleCompletedTheoryId(key, ["item-1"], "item-1"), []);

  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const outline = read("src/features/courses/course-outline.tsx");
  assert.doesNotMatch(syllabus, /<InteractiveConceptStage/);
  assert.doesNotMatch(outline, /<InteractiveConceptStage/);
  assert.match(syllabus, /Mark as completed/);
  assert.match(outline, /Mark as completed/);
  assert.match(syllabus, /isJavaCourseraWorkspace && !item\.assignmentId/);
  assert.match(outline, /LazyOutlineQuizDetails/);
});

test("Bug #13: MarkdownPreview handles nested inline code in bold, blockquote bullets, extended LaTeX & clean titles", () => {
  const { formatInlineMath } = require("../src/components/shared/markdown-preview.tsx");
  const { formatCoursePlainText } = require("../src/lib/format/course-display.ts");
  const md = read("src/components/shared/markdown-preview.tsx");

  assert.equal(
    formatInlineMath("Scale $$1 \\to 4$$ or $ 1 \\to 4 $ and $1 \\\\to 4$"),
    "Scale 1 → 4 or 1 → 4 and 1 → 4",
  );
  assert.equal(
    formatInlineMath(
      "Server=${DB_HOST};Database=app;User=${DB_USER:-postgres};Password=${DB_PASS}",
    ),
    "Server=${DB_HOST};Database=app;User=${DB_USER:-postgres};Password=${DB_PASS}",
  );
  assert.equal(
    formatCoursePlainText("Chương 06: Dùng `IHttpClientFactory` & IOptions&lt;T&gt; ($1 \\to 4$)"),
    "Chương 06: Dùng IHttpClientFactory & IOptions<T> (1 → 4)",
  );
  assert.match(md, /inline\(inner, depth \+ 1\)/);
  assert.match(md, /bqBullet/);
});

test("Bug #14: StudentCourseSyllabus fixes Module badge label, disables locked Lab cards & adds bottom lesson nav", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");

  assert.doesNotMatch(
    syllabus,
    /t\(`Chapter \$\{activeModule\.position\}`, `Chương \$\{activeModule\.position\}`\)/,
  );
  assert.match(
    syllabus,
    /t\(`Module \$\{activeModule\.position\}`, `Module \$\{activeModule\.position\}`\)/,
  );
  assert.match(syllabus, /disabled=\{isLocked\}/);
  assert.match(syllabus, /Pass previous Lab to unlock/);
  assert.match(syllabus, /isItemLockedLab/);
  assert.match(syllabus, /t\("Next", "Tiếp theo"\)/);
});

test("Bug #15: THEORY_ONLY labMode is preserved in contracts, submissionSchema and submission mapper", () => {
  const contracts = read("src/lib/api/contracts.ts");
  const domain = read("src/types/domain.ts");
  const ops = read("src/lib/api/java-operations.ts");

  assert.match(
    contracts,
    /createAssignment[\s\S]*?z\.enum\(\["LEGACY", "THEORY_ONLY", "THEORY_QUIZ", "THEORY_QUIZ_STUDIO"\]\)/,
  );
  assert.match(
    contracts,
    /updateAssignment[\s\S]*?z\.enum\(\["LEGACY", "THEORY_ONLY", "THEORY_QUIZ", "THEORY_QUIZ_STUDIO"\]\)/,
  );
  assert.match(
    domain,
    /labMode:\s*z\.enum\(\["LEGACY", "THEORY_ONLY", "THEORY_QUIZ", "THEORY_QUIZ_STUDIO"\]\)/,
  );
  assert.match(ops, /sub\.labMode === "THEORY_ONLY"/);
});

test("Bug #17: locked Module Quizzes are gated in syllabus/outline and ChapterQuizRunner handles 403 prerequisite lock", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const outline = read("src/features/courses/course-outline.tsx");
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");

  assert.match(syllabus, /const isItemLocked = \(item: OutlineItemData\)/);
  assert.match(syllabus, /hasAssignmentGate = isLabItem \|\| item\.type === "QUIZ"/);
  assert.match(syllabus, /disabled=\{!nextEntry \|\| isItemLocked\(nextEntry\.item\)\}/);
  assert.match(outline, /item\.type === "QUIZ" &&\s*\(!lockedForStudent \|\| canManage\)/);
  assert.match(runner, /backendQuiz\.error\.status === 403/);
  assert.match(runner, /This module Quiz is locked until you pass the previous Lab\./);
});

test("Full-Course E2E hardening: user-scoped Quiz storage, WF-04 422 codes, Snapshot/Finish serialization, accurate Submission detail & Dark Mode tokens", () => {
  const { attemptStorageKey } = require("../src/features/courses/chapter-quiz-runner.tsx");
  assert.notEqual(
    attemptStorageKey("user-1", "ws-1", "lab-1", "Quiz 1"),
    attemptStorageKey("user-2", "ws-1", "lab-1", "Quiz 1"),
  );

  const { publicErrors, backendErrorCode } = require("../src/lib/errors/api-error.ts");
  assert.ok(publicErrors.STUDIO_SNAPSHOT_REQUIRED);
  assert.ok(publicErrors.STUDIO_EVIDENCE_REQUIRED);
  assert.equal(
    backendErrorCode("submissions", 422, "STUDIO_SNAPSHOT_REQUIRED"),
    "STUDIO_SNAPSHOT_REQUIRED",
  );
  assert.equal(
    backendErrorCode("submissions", 422, "STUDIO_EVIDENCE_REQUIRED"),
    "STUDIO_EVIDENCE_REQUIRED",
  );

  const useStudio = read("src/features/runtime/use-studio-session.ts");
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");
  assert.match(useStudio, /capturePromiseRef/);
  assert.match(workbench, /capturing \|\|\s*capture\.isPending/);

  const subComponents = read("src/features/submissions/components.tsx");
  const frozen = read("src/features/submissions/frozen-artifacts.tsx");
  assert.match(subComponents, /submission\.studioEvidence/);
  assert.match(
    frozen,
    /quizScorePercent = quizTotal > 0 \? Math\.round\(\(quizCorrect \/ quizTotal\) \* 100\) : 0/,
  );

  const css = read("src/styles.css");
  const darkBlock = css.slice(css.indexOf('.dark, [data-theme="dark"]'));
  assert.match(darkBlock, /--hero-background:/);
  assert.match(darkBlock, /--section-background:/);

  const shell = read("src/components/app-shell.tsx");
  assert.match(shell, /params\.get\("tab"\) === "settings"\s*\?\s*"settings"\s*:\s*"members"/);

  const publish = read("src/features/assignments/lab-publish-section.tsx");
  assert.match(publish, /topologyFrozen=\{topologyFrozen\}/);
  assert.match(publish, /hasSource && hasStudio/);

  const info = read("src/features/assignments/lab-info-form.tsx");
  assert.match(info, /THEORY_QUIZ_STUDIO/);
  assert.match(info, /type="datetime-local"/);

  const builder = read("src/features/courses/course-builder.tsx");
  assert.match(builder, /estimatedMinutes/);

  const wsScreens = read("src/features/workspaces/screens.tsx");
  assert.match(wsScreens, /key:\s*"email"/);
});

test("Task #05 Quiz & Theory UX: Theory lessons stay unlocked before Quizzes, MarkdownPreview decodes HTML entities, InteractiveConceptStage avoids label truncation, and Countdown Timer scales with questions", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const {
    calculateQuizDurationMinutes,
    formatCountdown,
    computeRemainingSeconds,
  } = require("../src/features/courses/quiz-timer.tsx");
  const { MarkdownPreview } = require("../src/components/shared/markdown-preview.tsx");

  assert.equal(calculateQuizDurationMinutes(2), 5);
  assert.equal(calculateQuizDurationMinutes(5), 8);
  assert.equal(calculateQuizDurationMinutes(12), 18);
  assert.equal(formatCountdown(125), "02:05");
  assert.equal(formatCountdown(0), "00:00");
  assert.equal(
    computeRemainingSeconds("2026-11-22T00:00:00Z", 600, Date.parse("2026-11-22T00:01:30Z")),
    510,
  );
  assert.equal(
    computeRemainingSeconds("2026-11-22T00:00:00Z", 60, Date.parse("2026-11-22T00:05:00Z")),
    0,
  );

  const decodedHtml = renderToStaticMarkup(
    React.createElement(MarkdownPreview, {
      markdown: "Configure `IOptions&lt;ServiceUrlOptions&gt;` &lt;---&gt; CatalogAPI",
    }),
  );
  assert.match(decodedHtml, /IOptions&lt;ServiceUrlOptions&gt;|IOptions<ServiceUrlOptions>/);
  assert.doesNotMatch(decodedHtml, /&amp;lt;/);

  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const quiz = read("src/features/courses/course-quiz.tsx");
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");
  const stage = read("src/components/shared/interactive-concept-stage.tsx");

  assert.match(syllabus, /if \(item\.type === "THEORY"\) return false;/);
  assert.match(quiz, /<details open className="/);
  assert.match(quiz, /<QuizCountdownBanner/);
  assert.doesNotMatch(quiz, /Step 4|Bước 4|Test DS-02b/);
  assert.match(runner, /calculateQuizDurationMinutes/);
  assert.match(runner, /<QuizCountdownBanner/);
  assert.doesNotMatch(stage, /node\.label\.length > 18/);
});

test("Task #08 Coursera UX Polish: CourseBuilder/CourseOutline keep Quiz distinct from Studio Labs, Gradebook prevents overflow, and Lecturer workspaces avoids dash hang", () => {
  const builder = read("src/features/courses/course-builder.tsx");
  const outline = read("src/features/courses/course-outline.tsx");
  const shell = read("src/features/courses/course-workspace-shell.tsx");
  const submissions = read("src/features/submissions/screens.tsx");
  const workspaces = read("src/features/workspaces/screens.tsx");

  assert.match(
    builder,
    /if \(item\.type === "THEORY" \|\| item\.type === "QUIZ" \|\| item\.type === "ESSAY"\)/,
  );
  assert.match(builder, /shortVi: "Trắc nghiệm"/);
  assert.match(outline, /QUIZ:\s*\{\s*en: "Quiz", vi: "Bài trắc nghiệm \(Quiz\)"/);
  assert.match(shell, /className="min-w-0 max-w-full space-y-6"/);
  assert.match(submissions, /className="min-w-0 max-w-full space-y-4"/);
  assert.match(
    submissions,
    /className="min-w-0 max-w-full overflow-x-auto rounded-xl border bg-card"/,
  );
  assert.match(
    workspaces,
    /submissions\.isLoading \? "…" : submissions\.isSuccess \? pendingReviews : 0/,
  );
});

test("Task #10 Perf & Gradebook UX: Gradebook compacts Lab columns for 1280px and /lab renders loading status while models hydrate", () => {
  const submissions = read("src/features/submissions/screens.tsx");
  const courses = read("src/features/courses/screens.tsx");
  const javaOps = read("src/lib/api/java-operations.ts");

  assert.match(submissions, /className="min-w-0 max-w-full space-y-4"/);
  assert.match(submissions, /className="min-w-28 px-2\.5 py-2\.5 font-semibold"/);
  assert.match(courses, /studentContextLoading \|\| fallbackModelQuery\.isPending/);
  assert.match(javaOps, /mapWithConcurrency\(rows,\s*10,/);
});

test("Studio Live Telemetry & Stats preserve failed/timed-out service status and Logs & Traces badge count instead of falling back to Preview Prepared", () => {
  const workbench = read("src/features/runtime/live-studio-workbench.tsx");
  const {
    resolveTelemetryServiceStatus,
  } = require("../src/features/runtime/live-studio-workbench.tsx");

  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: true,
      running: 1,
      executionStatus: "NOT_STARTED",
      lastSessionFailed: false,
      isTimedOut: false,
      isBooting: false,
    }).label,
    "Prepared",
  );
  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: true,
      running: 0,
      executionStatus: "NOT_STARTED",
      lastSessionFailed: false,
      isTimedOut: false,
      isBooting: false,
    }).label,
    "Starts Down",
  );
  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: false,
      running: undefined,
      executionStatus: "FAILED",
      lastSessionFailed: true,
      isTimedOut: false,
      isBooting: false,
    }).label,
    "Failed",
  );
  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: false,
      running: undefined,
      executionStatus: "TIMED_OUT",
      lastSessionFailed: true,
      isTimedOut: true,
      isBooting: false,
    }).label,
    "Timed Out",
  );
  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: false,
      running: 0,
      executionStatus: "FAILED",
      lastSessionFailed: true,
      isTimedOut: false,
      isBooting: false,
    }).label,
    "Down",
  );
  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: false,
      running: 1,
      executionStatus: "RUNNING",
      lastSessionFailed: false,
      isTimedOut: false,
      isBooting: false,
    }).label,
    "Running",
  );
  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: false,
      running: undefined,
      executionStatus: "QUEUED",
      lastSessionFailed: false,
      isTimedOut: false,
      isBooting: true,
    }).label,
    "Booting",
  );
  assert.equal(
    resolveTelemetryServiceStatus({
      isPreview: false,
      running: undefined,
      executionStatus: "CANCELLED",
      lastSessionFailed: false,
      isTimedOut: false,
      isBooting: false,
    }).label,
    "Stopped",
  );

  assert.match(workbench, /const observedData: Studio = useMemo/);
  assert.match(workbench, /const isTelemetryPreview = isPreviewMode && !lastSessionFailed;/);
  assert.match(workbench, /const logsAndTracesCount =/);
  assert.match(workbench, /id === "logs" && \(terminalAlertSignal \|\| isBooting\)/);
  assert.match(workbench, /hasLiveRuntimeState/);
});

test("CourseOutline header renders course description and step-by-step learning outcomes", () => {
  const { stripModulePrefix } = require("../src/features/courses/course-outline.tsx");
  assert.equal(
    stripModulePrefix("Module 1: .NET 8 Microservices Foundations"),
    ".NET 8 Microservices Foundations",
  );
  assert.equal(stripModulePrefix("Chương 2 - Phân tích phụ thuộc"), "Phân tích phụ thuộc");
  assert.equal(stripModulePrefix("Observability Basics"), "Observability Basics");

  const outline = read("src/features/courses/course-outline.tsx");
  assert.ok(outline.includes("Learning Outcomes & Progression"));
  assert.ok(outline.includes("syllabusSummary"));
  assert.ok(outline.includes("published?.snapshot.description"));
});


test("Workflow V2 Item #01: expandModuleFlowItems enforces 4-Step Module order (Theory -> Static Diagram -> Quiz -> Studio -> Summary & Submit)", () => {
  const {
    expandModuleFlowItems,
    resolveModuleFlowKind,
    resolveLabStepForItem,
  } = require("../src/features/courses/module-steps.ts");

  const baseItems = [
    { id: "th-1", type: "THEORY", title: "Chapter 1", position: 1 },
    { id: "th-2", type: "THEORY", title: "Chapter 2", position: 2 },
    { id: "quiz-1", type: "QUIZ", title: "Module 1 Quiz", position: 3, assignmentId: "lab-1" },
    { id: "lab-1-item", type: "RUNTIME_LAB", title: "Studio Lab 1", position: 4, assignmentId: "lab-1" },
  ];
  const assignmentsRuntime = [
    {
      id: "lab-1",
      title: "Studio Lab 1",
      labMode: "THEORY_QUIZ_STUDIO",
      requireRuntimeTrace: true,
      referenceSource: { modelId: "m-1", snapshotId: "s-1" },
    },
  ];
  const runtimeExpanded = expandModuleFlowItems(baseItems, assignmentsRuntime, "vi");
  assert.deepEqual(
    runtimeExpanded.map((i) => resolveModuleFlowKind(i)),
    ["THEORY", "THEORY", "STATIC_DIAGRAM", "QUIZ", "STUDIO_RUNTIME", "MODULE_SUBMIT"],
  );
  assert.equal(resolveLabStepForItem(runtimeExpanded[2], true), 1);
  assert.equal(resolveLabStepForItem(runtimeExpanded[4], true), 2);
  assert.equal(resolveLabStepForItem(runtimeExpanded[5], true), 3);

  const nonRuntimeExpanded = expandModuleFlowItems(
    [
      { id: "th-1", type: "THEORY", title: "Chapter 1", position: 1 },
      { id: "lab-2-item", type: "STATIC_LAB", title: "Static Lab 2", position: 2, assignmentId: "lab-2" },
    ],
    [{ id: "lab-2", title: "Static Lab 2", labMode: "THEORY_QUIZ", requireRuntimeTrace: false }],
    "vi",
  );
  assert.deepEqual(
    nonRuntimeExpanded.map((i) => resolveModuleFlowKind(i)),
    ["THEORY", "STATIC_DIAGRAM", "QUIZ", "MODULE_SUBMIT"],
  );

  // Multi-lab modules preserve every Lab's sequence rather than dropping downstream Labs.
  const multiLabExpanded = expandModuleFlowItems(
    [
      { id: "th-1", type: "THEORY", title: "Theory Lab 01", position: 1 },
      { id: "q-1", type: "QUIZ", title: "Quiz Lab 01", position: 2, assignmentId: "lab-1" },
      { id: "l-1", type: "STATIC_LAB", title: "Lab 01", position: 3, assignmentId: "lab-1" },
      { id: "q-2", type: "QUIZ", title: "Quiz Lab 02", position: 4, assignmentId: "lab-2" },
      { id: "l-2", type: "RUNTIME_LAB", title: "Lab 02", position: 5, assignmentId: "lab-2" },
    ],
    [
      { id: "lab-1", title: "Lab 01", labMode: "THEORY_QUIZ", requireRuntimeTrace: false },
      { id: "lab-2", title: "Lab 02", labMode: "THEORY_QUIZ_STUDIO", requireRuntimeTrace: true },
    ],
    "vi",
  );
  assert.deepEqual(
    multiLabExpanded.map((i) => `${i.assignmentId ?? "none"}:${resolveModuleFlowKind(i)}`),
    [
      "none:THEORY",
      "lab-1:STATIC_DIAGRAM",
      "lab-1:QUIZ",
      "lab-1:MODULE_SUBMIT",
      "lab-2:STATIC_DIAGRAM",
      "lab-2:QUIZ",
      "lab-2:STUDIO_RUNTIME",
      "lab-2:MODULE_SUBMIT",
    ],
  );
});

test("Commit #01: /home and /courses filter ARCHIVED/[QA] workspaces into Archived tab and syllabus resets state per workspaceId", () => {
  const { isArchivedOrQaCourse } = require("../src/features/courses/mavis-pages.tsx");
  assert.equal(isArchivedOrQaCourse({ status: "ACTIVE", name: "Java Microservices", code: "JAVA-MS-2026" }), false);
  assert.equal(isArchivedOrQaCourse({ status: "ARCHIVED", name: "Java Old", code: "JAVA-OLD" }), true);
  assert.equal(isArchivedOrQaCourse({ status: "ACTIVE", name: "[QA-AUTO] Smoke", code: "SMOKE" }), true);
  assert.equal(isArchivedOrQaCourse({ status: "ACTIVE", name: "[QA] MAVIS backend BM04", code: "QA-BM04-123" }), true);

  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  assert.match(syllabus, /useEffect\(\(\) => \{\s*setSelectedItemId\(""\);[\s\S]*\}, \[workspaceId\]\);/);
  assert.match(syllabus, /COURSE_ARCHIVED/);
});

test("Quiz Module owns the full Quiz Builder and Lab Creation no longer owns Quiz", () => {
  const lab = read("src/features/assignments/lab-authoring.tsx");
  const library = read("src/features/courses/quiz-library.tsx");
  const builder = read("src/features/assignments/quiz-builder.tsx");
  const backendPath = read("src/lib/api/backend-path.ts");

  assert.doesNotMatch(lab, /LabQuizSection|id: "quiz"|en: "Quiz"/);
  assert.match(library, /<QuizBuilder/);
  assert.match(library, /quiz-assets/);
  assert.match(library, /quizAssetId/);
  assert.match(builder, /assetMode/);
  assert.match(builder, /quiz-assets\/generate/);
  assert.match(backendPath, /quiz-assets\\\/generate/);
});

test("Commit #04: single-row bottom lesson nav removes clutter note and deduplicates Quiz Next buttons", () => {
  const screens = read("src/features/courses/screens.tsx");
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");
  const courseQuiz = read("src/features/courses/course-quiz.tsx");

  assert.doesNotMatch(screens, /Progress is saved directly in this Lab workspace\.|Tiến độ được lưu trực tiếp trong không gian Lab này\.|Clock3/);
  assert.match(screens, /flex items-center justify-between gap-4 rounded-xl border bg-card/);
  assert.match(screens, /t\("Previous", "Trước"\)/);
  assert.doesNotMatch(syllabus, /onNextLesson=/);
  assert.match(syllabus, /flex items-center justify-between gap-4 border-t pt-4/);
  assert.doesNotMatch(runner, /Go to next lesson|Sang bài tiếp theo/);
  assert.match(courseQuiz, /showNextCta = false/);
});

test("Commit #05: Studio Live links route directly to standalone studio-live with step=3 returnTo and skip 2.1/2.2/2.3 intermediate box", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const screens = read("src/features/courses/screens.tsx");
  const standalone = read("src/features/runtime/standalone-studio-live.tsx");

  assert.match(syllabus, /if \(targetStep === 2 && itemRequiresRuntime\)[\s\S]*buildStudioLiveHref\(/);
  assert.match(screens, /resolvedStep === 2 && requiresRuntime && !preview[\s\S]*buildStudioLiveHref\(/);
  assert.match(screens, /shouldAutoOpenStudio[\s\S]*router\.replace\(standaloneStudioHref\)/);
  assert.doesNotMatch(screens, /2\.1 \{t\("Start Studio Session"/);
  assert.doesNotMatch(screens, /2\.2 \{t\("Operate & Finish Studio"/);
  assert.doesNotMatch(screens, /2\.3 \{t\("Capture runtime evidence"/);
  assert.match(standalone, /step=3#lab-submit/);
});

test("Commit #06: Module Summary & Submit fixes stuck studioStateQuery.isPending bug and renders 4-part layout + Next Module CTA", () => {
  const screens = read("src/features/courses/screens.tsx");
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.match(
    screens,
    /const isStudioEvidenceLoading = Boolean\(activeStudioSessionId\) && studioStateQuery\.isLoading;/,
  );
  assert.doesNotMatch(screens, /studioStateQuery\.isPending/);
  assert.match(screens, /quizSummary=\{quizSummary\}/);
  assert.match(screens, /nextModuleHref=\{nextModuleHref\}/);
  assert.match(access, /latestCorrectCount\?:\s*number \| null/);
  assert.match(subV2, /t\("Confirm & Submit for Grading", "Xác nhận nộp bài"\)/);
  assert.match(subV2, /Revise and resubmit/);
});

test("Commit #07: Quiz timer renders as compact badge, Retake Quiz works across passed/failed states, and student copy removes bureaucratic jargon", () => {
  const timer = read("src/features/courses/quiz-timer.tsx");
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");
  const courseQuiz = read("src/features/courses/course-quiz.tsx");
  const screens = read("src/features/courses/screens.tsx");
  const steps = read("src/features/courses/module-steps.ts");
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");

  assert.match(timer, /inline-flex items-center gap-2\.5/);
  assert.match(runner, /Retake Quiz/);
  assert.match(runner, /Làm lại bài/);
  assert.match(courseQuiz, /handleRetake/);
  assert.match(courseQuiz, /Làm lại bài/);
  assert.match(courseQuiz, /quiz\.runtimeUnlocked && !retakeMode/);
  assert.doesNotMatch(screens, /niêm phong|phần giải trình|seal the receipt/);
  assert.doesNotMatch(steps, /viết giải trình/);
  assert.doesNotMatch(subV2, /giải trình|niêm phong/);
});

test("Sprint 2 #01: learning pages unlock window scroll and use concise Previous/Next labels", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const screens = read("src/features/courses/screens.tsx");

  assert.doesNotMatch(syllabus, /overflow-y-scroll|overscroll-contain|scrollbar-gutter:stable/);
  assert.match(syllabus, /window\.scrollTo\(\{\s*top:\s*0\s*\}\)/);
  assert.match(syllabus, /<span>\{t\("Previous", "Trước"\)\}<\/span>/);
  assert.match(syllabus, /t\("Next", "Tiếp theo"\)/);
  assert.match(screens, /<span>\{t\("Previous", "Trước"\)\}<\/span>/);
  assert.match(screens, /<span>\{t\("Next", "Tiếp theo"\)\}<\/span>/);
});


test("Sprint 2 #03 Module Submit: streamlines step=3 to Lab review, visual media gallery, and confirmation without redundant Module/Quiz sections", () => {
  const lab = read("src/features/courses/screens.tsx");
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");
  assert.ok(!lab.includes("1. Tiến độ hoàn thành Module"));
  assert.ok(!lab.includes("2. Kết quả bài kiểm tra (Quiz)"));
  assert.ok(subV2.includes("Review & Confirm Lab Submission"));
  assert.ok(subV2.includes("StudioSnapshotPreviewCard"));
  assert.doesNotMatch(lab, /Telemetry & service interactions|Before \/ After studio actions|Verified Studio session/);
  assert.doesNotMatch(subV2, /4\. Kết quả nộp bài/);
});


test("Sprint 2 #04 Syllabus & Quiz Copy: removes fake 15-min label, deduplicates Module/Quiz titles, and cleans Quiz Gate wording", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const quizRunner = read("src/features/courses/chapter-quiz-runner.tsx");
  assert.doesNotMatch(syllabus, /Đọc · 15 phút|Reading · 15 min/);
  assert.match(syllabus, /function stripModulePrefix/);
  assert.match(syllabus, /function formatModuleHeading/);
  assert.match(syllabus, /function formatSyllabusItemDescription/);
  assert.match(syllabus, /hideTitle/);
  assert.match(quizRunner, /hideTitle\?: boolean \| undefined/);
});


test("Sprint 2 #05 Banners & Nav: left-aligns all Back buttons, declutters hero banners, and normalizes VI sentence case", () => {
  const submissions = read("src/features/submissions/screens.tsx");
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const dashboard = read("src/features/courses/student-courses-dashboard.tsx");
  const lab = read("src/features/courses/screens.tsx");

  assert.ok(submissions.indexOf('t("Back to class"') < submissions.indexOf('t("Submissions & Grades"'));
  const syllabusHeroStart = syllabus.indexOf('<section className="mavis-hero-surface');
  assert.ok(syllabusHeroStart !== -1 && syllabus.indexOf('t("Back to courses"', syllabusHeroStart) < syllabus.indexOf("{workspace.name}", syllabusHeroStart));
  const lecturerHero = lab.indexOf("from-teal-900 via-teal-800");
  assert.ok(lecturerHero !== -1 && lab.indexOf('t("Back to courses"', lecturerHero) < lab.indexOf("{workspace.name}", lecturerHero));
  assert.doesNotMatch(syllabus, /Học Tiếp Bài Hiện Tại|Tiến Độ Hoàn Thành Khóa Học/);
  assert.doesNotMatch(dashboard, /Tiến Độ Khóa Học/);
  assert.doesNotMatch(lab, /Biên nhận Studio|Điều kiện khóa học/);
});


test("Sprint 3 #01 Quiz Scoring: grades exact latest attempt and never overwrites retake score with prior pass", () => {
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");
  const courseQuiz = read("src/features/courses/course-quiz.tsx");
  const screens = read("src/features/courses/screens.tsx");
  const access = read("src/features/workspaces/course-access.tsx");

  assert.doesNotMatch(runner, /activeAttempt\.scorePercent \?\? computedScore/);
  assert.match(runner, /scorePercent: computedScore/);
  assert.match(runner, /const recordedPassed = backendQuiz\.data\.latestStatus === "PASSED"/);
  assert.match(runner, /cache\.setQueryData/);
  assert.match(courseQuiz, /bestPassedCorrectCount\?: number \| null/);
  assert.match(access, /bestPassedCorrectCount\?: number \| null/);
  assert.match(screens, /bestPassedQuizCorrect/);
});


test("Sprint 3 #02 Syllabus Duration & Grounded AI Quiz: hides ~45m notes, grounds AI quiz in theory + C1-C3 diagrams, and supports NotebookLM import", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const builder = read("src/features/assignments/quiz-builder.tsx");
  const { parseNotebookLmQuiz } = require("../src/features/assignments/quiz-types.ts");

  assert.doesNotMatch(syllabus, /~\$\{item\.estimatedMinutes\}|~\$\{activeItem\.estimatedMinutes\}/);
  assert.match(builder, /AI tạo từ học liệu/);
  assert.match(builder, /includeStaticDiagrams/);
  assert.match(builder, /Nhập từ NotebookLM/);

  const md = parseNotebookLmQuiz(
    `1. Dịch vụ nào xử lý đơn hàng?\nA. catalog-service\nB. order-service\nAnswer: B\nExplanation: [Sơ đồ tĩnh] order-service quản lý đơn hàng.\n\n2. Chọn thành phần hạ tầng.\n- [x] Kafka\n- [x] PostgreSQL\n- [ ] React\nGiải thích: [Lý thuyết] Hệ thống dùng Kafka & PostgreSQL.`,
  );
  assert.equal(md.errors.length, 0);
  assert.equal(md.draft.questions.length, 2);
  assert.equal(md.draft.questions[0].correctOption, 1);
  assert.deepEqual(md.draft.questions[1].correctOptions, [0, 1]);

  const jsonQuiz = parseNotebookLmQuiz(
    JSON.stringify({
      title: "NotebookLM Export",
      questions: [
        {
          question: "Which edge connects gateway and order?",
          answerOptions: [
            { text: "HTTP_REST", isCorrect: true, rationale: "[Static Diagram] Gateway calls order over HTTP." },
            { text: "GRPC_STREAM", isCorrect: false },
          ],
        },
      ],
    }),
  );
  assert.equal(jsonQuiz.errors.length, 0);
  assert.equal(jsonQuiz.draft.questions[0].correctOption, 0);
});


test("Sprint 3 #03 Hero Banners: aligns top-row CTAs on /roadmap and two-row action layout on /lab", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  const lab = read("src/features/courses/screens.tsx");

  const roadmapHero = syllabus.indexOf('<section className="mavis-hero-surface p-6 text-white">');
  const roadmapTopRowEnd = syllabus.indexOf("</div>", syllabus.indexOf('t("Continue learning"', roadmapHero));
  assert.ok(
    roadmapHero !== -1 &&
      roadmapTopRowEnd !== -1 &&
      syllabus.indexOf('t("Back to courses"', roadmapHero) < roadmapTopRowEnd &&
      syllabus.indexOf('t("Continue learning"', roadmapHero) < roadmapTopRowEnd,
  );

  const labHero = lab.indexOf('<header className="mavis-hero-surface');
  const labHeading = lab.indexOf("<h1", labHero);
  assert.ok(
    labHero !== -1 &&
      labHeading !== -1 &&
      lab.indexOf('t("Contents", "Mục lục")', labHero) < labHeading &&
      lab.indexOf('id="lab-switcher"', labHero) > labHeading &&
      lab.indexOf('t("Submissions & Grades", "Bài nộp & Điểm")', labHero) > labHeading,
  );
});


test("Sprint 3 #04 Section 3 Essay Panel: streamlines to essay prompt, full student response, and bottom-right Submit", () => {
  const subV2 = read("src/features/courses/lab-submission-v2.tsx");
  const screens = read("src/features/courses/screens.tsx");
  assert.doesNotMatch(subV2, /Đã đính kèm dữ liệu Studio|Studio data attached/);
  assert.doesNotMatch(subV2, /Sang Module tiếp theo|Next Module:|Xem bài nộp|View submission/);
  assert.doesNotMatch(subV2, /line-clamp-4/);
  assert.match(subV2, /essayPrompt\?: string \| undefined/);
  assert.match(screens, /essayPrompt=\{labInstructions\}/);
});


test("Sprint 3 #05 Lab Header Row 1 & Quiz AI/Date i18n: keeps /lab Row 1 single-line and localizes AI error + date format", () => {
  const screens = read("src/features/courses/screens.tsx");
  const builder = read("src/features/assignments/quiz-builder.tsx");
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");

  assert.match(screens, /className="flex items-center justify-between gap-3"/);
  assert.match(screens, /className="flex min-w-0 flex-1 items-center gap-1\.5 overflow-hidden text-xs text-sky-100"/);
  assert.match(screens, /shrink-0 whitespace-nowrap border-white\/30 bg-white\/12 text-white/);
  assert.match(builder, /function localizeQuizGenerationError/);
  assert.match(builder, /localizeQuizGenerationError\(generateFromTheory\.error\.message, t\)/);
  assert.match(runner, /locale === "vi" \? "vi-VN" : "en-US"/);
});


test("E2E #01 Passkey Create: rejects maxUses <= 0 inline instead of silently wiping to unlimited", () => {
  const access = read("src/features/workspaces/course-access.tsx");
  assert.match(access, /const createMaxUsesInvalid =/);
  assert.match(access, /onChange=\{\(event\) => setMaxUses\(event\.target\.value\)\}/);
  assert.match(access, /disabled=\{mutating \|\| createMaxUsesInvalid\}/);
  assert.doesNotMatch(access, /if \(next === "" \|\| Number\(next\) <= 0\) \{\s*setMaxUses\(""\);/);
});

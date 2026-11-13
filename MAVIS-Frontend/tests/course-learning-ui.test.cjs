const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

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

  assert.ok(course.includes('<CourseEnrollment destination="roadmap" />'));
  assert.ok(access.includes('"course-enrollments/redeem"'));
  assert.ok(access.includes("course-roadmap"));
  assert.ok(access.includes('state: "LOCKED" | "UNLOCKED" | "PASSED"'));
  assert.match(access, /\/lab\?workspace=.*&assignment=.*&step=1/s);
  assert.ok(course.includes("Final completion state must come from the readiness API"));
  assert.ok(course.includes("Quiz attempt state is awaiting the versioned Quiz API"));
  assert.match(course, /\/assignments\?workspace=.*&assignment=/s);
  assert.match(course, /\/submissions\?workspace=.*&assignment=/s);
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

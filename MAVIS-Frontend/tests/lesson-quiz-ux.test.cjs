const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

test("Quiz countdown timer scales proportionally to question count (1.5 min/Q, min 3 min)", () => {
  const runner = read("src/features/courses/chapter-quiz-runner.tsx");
  assert.match(runner, /export function computeRecommendedQuizSeconds\(questionCount: number\)/);
  assert.match(runner, /Math\.max\(3, Math\.ceil\(safeCount \* 1\.5\)\)/);
  assert.match(runner, /role="timer"/);
  assert.match(runner, /setTimedOut\(true\)/);
  assert.match(runner, /setViewMode\("single"\)/);
  assert.match(runner, /setViewMode\("all"\)/);
  assert.match(runner, /Question Map/);
});

test("Lab Step 3 Gatekeeper Quiz also exposes proportional countdown timer", () => {
  const quiz = read("src/features/courses/course-quiz.tsx");
  assert.match(quiz, /computeRecommendedQuizSeconds\(quiz\.questions\.length\)/);
  assert.match(quiz, /role="timer"/);
  assert.match(quiz, /formatQuizClock\(remainingSeconds\)/);
});

test("StudentCourseSyllabus removes nested 4-column squeeze and provides dedicated full-page Lesson & Quiz routes", () => {
  const syllabus = read("src/features/courses/student-course-syllabus.tsx");
  assert.doesNotMatch(
    syllabus,
    /xl:grid-cols-\[minmax\(0,1fr\)_18rem\]/,
    "Nested right summary aside must be replaced with horizontal KPI strip to keep reading pane wide",
  );
  assert.match(syllabus, /const focusView: "lesson" \| "quiz" \| "essay" \| null/);
  assert.match(syllabus, /&view=\$\{view\}&item=\$\{encodeURIComponent\(itemId\)\}/);
  assert.match(syllabus, /Open Full Lesson Page/);
  assert.match(syllabus, /Start Timed Quiz \(Full Page\)/);
  assert.match(syllabus, /Back to Course Syllabus/);
  assert.match(syllabus, /<ChapterQuizRunner[\s\S]*fullPage/);
});

test("MarkdownPreview recursively parses inline code inside bold spans", () => {
  const md = read("src/components/shared/markdown-preview.tsx");
  assert.match(md, /function inline\(text: string, depth = 0\)/);
  assert.match(md, /depth < 2 \? inline\(inner, depth \+ 1\) : inner/);
});

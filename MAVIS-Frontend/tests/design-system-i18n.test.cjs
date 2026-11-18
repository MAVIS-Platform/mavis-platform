const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("DESIGN.md exists and documents OKLCH, typography, Dual-Surface, and anti-AI-slop rules", () => {
  const designPath = path.join(root, "DESIGN.md");
  assert.ok(fs.existsSync(designPath), "MAVIS-Frontend/DESIGN.md must exist");
  const content = fs.readFileSync(designPath, "utf8");
  assert.match(content, /OKLCH/i);
  assert.match(content, /JetBrains Mono/i);
  assert.match(content, /Dual-Surface/i);
  assert.match(content, /ForumFlash/i);
  assert.match(content, /AI Slop/i);
});

test("styles.css exposes MAVIS design polish utilities and reduced-motion safeguards", () => {
  const css = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
  assert.match(css, /--font-technical:\s*"JetBrains Mono"/);
  assert.match(css, /\.mavis-grid-pattern\s*\{/);
  assert.match(css, /\.mavis-hero-surface\s*\{/);
  assert.match(css, /\.mavis-card-hover\s*\{/);
  assert.match(css, /\.mavis-tabular\s*\{/);
  assert.match(css, /@keyframes mavis-packet-flow\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("locale-context.tsx defines Vietnamese translations for Student sidebar, Login, 4-stage Lab, and BR-10 grading", () => {
  const locale = fs.readFileSync(path.join(root, "src/lib/i18n/locale-context.tsx"), "utf8");
  const requiredPairs = [
    ['"Learning workspace":', "Không gian học tập"],
    ['"My Grades & Submissions":', "Điểm & Bài nộp"],
    ['"Course Roadmap":', "Lộ trình khóa học"],
    ['"Back to home":', "Quay lại trang chủ"],
    ['"Understand your services.":', "Hiểu rõ các service của bạn."],
    ['"See the connections.":', "Xem các mối liên kết."],
    ['"Static C1–C3 & AI":', "Kiến trúc tĩnh C1–C3 & AI"],
    ['"Theory & Quiz Gate":', "Lý thuyết & Quiz Gate"],
    ['"Live Runtime View":', "Trực quan Runtime thật"],
    ['"MAVIS Studio & Submit":', "MAVIS Studio & Nộp bài"],
    ['"Every required snapshot must exceed 5.0 / 10 to unlock the next Lab.":', "5.0 / 10"],
  ];
  for (const [key, expectedVi] of requiredPairs) {
    assert.ok(locale.includes(key), `Missing dictionary key: ${key}`);
    assert.ok(locale.includes(expectedVi), `Missing Vietnamese value: ${expectedVi}`);
  }
});

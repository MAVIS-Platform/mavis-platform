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
  assert.match(css, /\.mavis-panel\s*\{[^}]*box-shadow:\s*var\(--shadow-low\)/);
  assert.match(css, /@keyframes mavis-packet-flow\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /#F7F8FC|#E8EDFF|#53638F/, "Light mode must avoid glaring lavender-tinted fatigue tokens");
  assert.match(css, /:root,\s*\[data-theme="light"\]\s*\{[\s\S]*--background:\s*#E4EAF2;/);
  assert.match(css, /:root,\s*\[data-theme="light"\]\s*\{[\s\S]*--border:\s*#9FB0C4;/);
  assert.match(css, /:root,\s*\[data-theme="light"\]\s*\{[\s\S]*--foreground:\s*#0B1220;/);
  assert.match(css, /:root,\s*\[data-theme="light"\]\s*\{[\s\S]*--muted-foreground:\s*#334155;/);
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
    ['"Theory & Module Quiz":', "Lý thuyết & Trắc nghiệm"],
    ['"Live Runtime View":', "Trực quan Runtime thật"],
    ['"MAVIS Studio & Submit":', "MAVIS Studio & Nộp bài"],
    ['"Every required snapshot must exceed 5.0 / 10 to unlock the next Lab.":', "5.0 / 10"],
  ];
  for (const [key, expectedVi] of requiredPairs) {
    assert.ok(locale.includes(key), `Missing dictionary key: ${key}`);
    assert.ok(locale.includes(expectedVi), `Missing Vietnamese value: ${expectedVi}`);
  }
  assert.match(locale, /tag === "CANVAS"/);
  assert.match(locale, /tag === "IFRAME"/);
  assert.match(locale, /isContentEditable/);
});

const ts = require("typescript");

function loadTsModule(relativePath) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function("exports", "require", "module", "__filename", "__dirname", compiled);
  fn(mod.exports, require, mod, fullPath, path.dirname(fullPath));
  return mod.exports;
}

test("date-time formatters enforce 24h Vietnamese formatting without AM/PM markers and handle invalid inputs safely", () => {
  const dt = loadTsModule("src/lib/format/date-time.ts");
  const isoAfternoon = "2026-11-27T14:05:09.000Z";

  const viTime = dt.formatLocalizedTime(isoAfternoon, "vi");
  const viDateTimeShort = dt.formatLocalizedDateTime(isoAfternoon, "vi", { seconds: false });
  const viDate = dt.formatLocalizedDate(isoAfternoon, "vi");
  const enDate = dt.formatLocalizedDate(isoAfternoon, "en");

  assert.doesNotMatch(viTime, /AM|PM|SA|CH/i);
  assert.doesNotMatch(viDateTimeShort, /AM|PM|SA|CH/i);
  assert.match(viTime, /\d{2}:\d{2}:\d{2}/);
  assert.ok(viDate.includes("2026"));
  assert.ok(enDate.includes("2026"));
  assert.equal(dt.formatLocalizedDateTime(null, "vi"), "—");
  assert.equal(dt.formatLocalizedDateTime("not-a-date", "vi", { fallback: "N/A" }), "N/A");
  assert.equal(dt.formatLocalizedTime(undefined, "en", { fallback: "--:--" }), "--:--");
});

test("all single-arg t() calls across src/ exist in EXACT_VI_DICTIONARY and Admin Accounts avoids hardcoded vi-VN", () => {
  const localeSrc = fs.readFileSync(path.join(root, "src/lib/i18n/locale-context.tsx"), "utf8");
  const start = localeSrc.indexOf("const EXACT_VI_DICTIONARY");
  const end = localeSrc.indexOf("const PATTERN_REPLACEMENTS");
  assert.ok(start !== -1 && end > start);
  const dictSrc = localeSrc.slice(start, end);
  const dictKeys = new Set();
  for (const m of dictSrc.matchAll(/(?:"((?:[^"\\]|\\.)+)"|([A-Za-z_$][\w$]*))\s*:/g)) {
    dictKeys.add(m[1] ?? m[2]);
  }

  const missing = [];
  const srcRoot = path.join(root, "src");
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        for (const m of text.matchAll(/\bt\(\s*"([^"]+)"\s*\)/g)) {
          if (!dictKeys.has(m[1])) {
            missing.push(path.relative(root, full) + ": " + m[1]);
          }
        }
      }
    }
  }
  walk(srcRoot);
  assert.deepEqual(missing, [], "Missing EXACT_VI_DICTIONARY entries: " + missing.join(", "));

  const adminSrc = fs.readFileSync(path.join(root, "src/features/administration/screens.tsx"), "utf8");
  assert.doesNotMatch(adminSrc, /toLocale(?:Date|Time)?String\("vi-VN"/);
  assert.match(adminSrc, /formatLocalizedDateTime\(a\.at, locale\)/);
});

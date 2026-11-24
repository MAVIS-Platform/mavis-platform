const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Public Homepage aligns 4-stage pipeline with BM04 and removes Studio Sandbox FAQ", () => {
  const homepage = read("src/features/homepage/public-homepage.tsx");
  const requestDemo = read("src/features/homepage/request-demo.tsx");
  const homepageCss = read("src/features/homepage/homepage.css");

  assert.match(homepage, /Static C1–C3 & AI/);
  assert.match(homepage, /Theory, Reverse BFS & Module Quiz/);
  assert.match(homepage, /Live Docker & OTel Runtime/);
  assert.match(homepage, /MAVIS Studio & 4-Stage Submission/);
  assert.doesNotMatch(
    homepage,
    /Studio Sandbox simulates changes/,
    "FAQ should not promote Free Studio Sandbox as a student workflow",
  );
  assert.match(requestDemo, /mavis-packet-edge/);
  assert.match(homepageCss, /position:\s*sticky/);
  assert.match(homepageCss, /backdrop-filter:\s*blur\(12px\)/);
});

test("Login page enforces full VI/EN localization, back-to-home navigation, and 3E pillars", () => {
  const login = read("app/login/page.tsx");

  assert.match(login, /LocaleSwitchButton/);
  assert.match(login, /useLocale/);
  assert.match(login, /href="\/"/);
  assert.match(login, /Back to home/);
  assert.match(login, /Quay lại trang chủ/);
  assert.match(login, /t\("You’re signed out\.", "Bạn đã đăng xuất\."\)/);
  assert.match(login, /t\("Explore", "Khám phá"\)/);
  assert.match(login, /t\("Explain", "Giải thích"\)/);
  assert.match(login, /t\("Experience", "Trải nghiệm"\)/);
});

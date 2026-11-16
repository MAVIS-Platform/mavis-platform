const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://127.0.0.1:3110";
const screenshots = process.env.MAVIS_HOMEPAGE_SCREENSHOTS;

async function checkShortDesktop(page, name) {
  await page.setViewportSize({ width: 1351, height: 608 });
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const selector of [".v2-hero-actions", "#demo"]) {
    const bounds = await page.locator(selector).boundingBox();
    assert.ok(
      bounds && bounds.y >= 0 && bounds.y + bounds.height <= 608,
      `${name}: ${selector} should fit in the viewport`,
    );
  }
  if (screenshots) {
    await page.screenshot({ path: join(screenshots, `hero-${name}.png`) });
  }
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.MAVIS_TEST_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const apiRequests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });

    await page.goto(base, { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { level: 1, name: "Follow a request across microservices" })
      .waitFor();
    if (screenshots) {
      mkdirSync(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, "desktop-light.png"), fullPage: true });
    }
    await checkShortDesktop(page, "en-light");
    await page.getByRole("link", { name: "Try the sample scenario" }).click();
    assert.equal(new URL(page.url()).hash, "#demo");

    await page.getByRole("button", { name: "Payments", exact: true }).press("Enter");
    await page.getByText("PaymentClient.java", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Follow the trace" }).click();
    const spans = page.getByRole("list", { name: "Spans in request order" });
    assert.equal(
      await spans.getByRole("button", { name: /Payments/ }).getAttribute("aria-pressed"),
      "true",
    );
    await spans.getByRole("button", { name: /Inventory/ }).click();
    await page.getByText("HTTP POST /inventory/reservations", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Compare impact" }).click();
    await page.getByRole("button", { name: "Simulate stopping Payments" }).press("Enter");
    await page.getByText("503 · Unavailable", { exact: true }).waitFor();
    if (screenshots) {
      await page.locator("#demo").screenshot({ path: join(screenshots, "sample-impact.png") });
    }
    await page.getByRole("button", { name: "Trace", exact: true }).click();
    await page.getByRole("heading", { name: "Trace before the change" }).waitFor();
    await page.getByText("503 · Unavailable", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Impact", exact: true }).click();
    await page.getByRole("button", { name: "Restore Payments" }).click();
    await page.getByText("200 · Succeeded", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Reset scenario" }).click();
    await page.getByText("OrderService.java", { exact: true }).waitFor();

    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link", { name: "Workspace" })
      .click();
    const gallery = page.getByRole("group", { name: "Workspace screens" });
    const preview = page.locator("#v2-workspace-preview");
    for (const [name, asset] of [
      ["MAVIS Studio", "studio"],
      ["Course setup", "course"],
      ["Architecture Explorer", "architecture"],
    ]) {
      const button = gallery.getByRole("button", { name });
      await button.press("Enter");
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      const src = `/homepage/${asset}.webp`;
      assert.equal(await preview.getByRole("img").getAttribute("src"), src);
      assert.equal(
        await preview.getByRole("link", { name: /Open full image/ }).getAttribute("href"),
        src,
      );
      assert.ok(
        await preview.getByRole("img").evaluate(async (image) => {
          await image.decode();
          return image.naturalWidth === 800;
        }),
      );
    }

    await page.getByText("Where can I get a Passkey?", { exact: true }).click();
    await page.getByText(/Your lecturer issues the Passkey/).waitFor();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `EN overflow at ${width}px`,
      );
    }
    await page.getByRole("button", { name: /Switch to Vietnamese/ }).click();
    await checkShortDesktop(page, "vi-light");
    await page.getByRole("button", { name: "Chuyển sang giao diện tối" }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("heading", { level: 1, name: "Theo dấu một yêu cầu qua hệ thống microservices" })
      .waitFor();
    assert.equal(await page.locator("html").getAttribute("data-appearance"), "dark");
    assert.equal(await page.locator("html").getAttribute("lang"), "vi");
    await checkShortDesktop(page, "vi-dark");
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `VI overflow at ${width}px`,
      );
    }
    if (screenshots) {
      await page.setViewportSize({ width: 768, height: 900 });
      await page.screenshot({ path: join(screenshots, "tablet-dark-vi.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: join(screenshots, "mobile-dark-vi.png"), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Menu trang").click();
    const mobileNav = page.getByRole("navigation", { name: "Trên trang này" });
    await mobileNav.getByRole("link", { name: "Workspace" }).press("Enter");
    assert.equal(new URL(page.url()).hash, "#workspace");
    assert.equal(await mobileNav.isVisible(), false);
    const header = await page.locator(".v2-header").boundingBox();
    const workspace = await page.locator("#workspace").boundingBox();
    assert.ok(header && workspace && workspace.y >= header.y + header.height);

    await page.getByRole("button", { name: /Switch to English/ }).click();
    await checkShortDesktop(page, "en-dark");
    await page.getByRole("button", { name: /Switch to Vietnamese/ }).click();
    assert.deepEqual(apiRequests, []);
    assert.deepEqual(errors, []);
    await page.goto(base + "/#course-passkey");
    await page.getByRole("link", { name: "Có Passkey? Vào lớp" }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/login" && url.searchParams.get("next") === "/courses#course-passkey",
    );

    const legacy = await page.request.get(base + "/?workspace=sample&project=example&model=v1", {
      maxRedirects: 0,
    });
    assert.equal(legacy.status(), 307);
    const destination = new URL(legacy.headers().location, base);
    assert.equal(destination.pathname, "/courses");
    assert.equal(destination.searchParams.get("workspace"), "sample");
    assert.equal(destination.searchParams.get("project"), "example");
    assert.equal(destination.searchParams.get("model"), "v1");

    const staticPage = await browser.newPage({ javaScriptEnabled: false });
    await staticPage.goto(base);
    await staticPage
      .getByRole("heading", { level: 1, name: "Follow a request across microservices" })
      .waitFor();

    if (process.argv.includes("--backend")) {
      await page.goto(base + "/courses?workspace=sample#course-passkey");
      await page.waitForURL(
        (url) =>
          url.pathname === "/login" &&
          url.searchParams.get("next") === "/courses?workspace=sample#course-passkey",
      );

      const student = await browser.newPage();
      const session = { user: { id: "sample-student", name: "Sample Student", role: "student" } };
      await student.route("**/api/mavis/signIn", (route) => route.fulfill({ json: session }));
      await student.route("**/api/mavis/session?*", (route) => route.fulfill({ json: session }));
      await student.route("**/api/mavis/workspaces?*", (route) => route.fulfill({ json: [] }));
      await student.goto(base);
      await student.getByRole("link", { name: "Have a Passkey? Join a class" }).click();
      await student.getByLabel("Email", { exact: true }).fill("sample@example.test");
      await student.getByLabel("Password", { exact: true }).fill("Example-Password");
      await student.getByRole("button", { name: "Sign in", exact: true }).click();
      await student.waitForURL("**/courses#course-passkey");
      await student.locator("#course-passkey").getByLabel("Passkey", { exact: true }).waitFor();
    }
    console.log("Homepage V2 browser checks passed.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

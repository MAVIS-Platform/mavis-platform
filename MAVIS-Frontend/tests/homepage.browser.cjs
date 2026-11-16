const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://127.0.0.1:3110";
const screenshots = process.env.MAVIS_HOMEPAGE_SCREENSHOTS;

async function checkAppearance(page, theme) {
  assert.equal(await page.locator("html").getAttribute("data-appearance"), theme);
  const gallery = page.locator(".v2-previews");
  await gallery.scrollIntoViewIfNeeded();
  const images = gallery.getByRole("img");
  assert.equal(await images.count(), 3);
  assert.equal(await gallery.getByRole("link").count(), 0);
  for (const [index, name] of ["architecture", "studio", "course"].entries()) {
    const image = images.nth(index);
    const suffix = theme === "dark" ? "-dark" : "";
    assert.equal(await image.getAttribute("src"), `/homepage/${name}${suffix}.webp`);
    const brightness = await image.evaluate(async (img) => {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 10;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0, 16, 10);
      const { data } = context.getImageData(0, 0, 16, 10);
      let total = 0;
      for (let pixel = 0; pixel < data.length; pixel += 4) {
        total += data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722;
      }
      return total / 160;
    });
    assert.ok(
      theme === "dark" ? brightness < 110 : brightness > 150,
      `${name} ${theme}: ${brightness}`,
    );
  }
  if (screenshots) {
    await gallery.screenshot({ path: join(screenshots, `workspace-${theme}.png`) });
    await page.locator("#demo").screenshot({ path: join(screenshots, `demo-${theme}.png`) });
  }
  return page.locator("#demo").evaluate((element) => getComputedStyle(element).backgroundColor);
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
      .getByRole("heading", { level: 1, name: "Explore microservices architecture" })
      .waitFor();
    if (screenshots) {
      mkdirSync(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, "desktop-light.png"), fullPage: true });
    }
    const lightDemo = await checkAppearance(page, "light");
    await page.getByRole("link", { name: "Try the architecture demo" }).click();
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
    await page.getByRole("button", { name: "Chuyển sang giao diện tối" }).click();
    const darkDemo = await checkAppearance(page, "dark");
    assert.notEqual(darkDemo, lightDemo);
    await page.getByRole("button", { name: "Chuyển sang giao diện sáng" }).click();
    assert.equal(await checkAppearance(page, "light"), lightDemo);
    await page.getByRole("button", { name: "Chuyển sang giao diện tối" }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("heading", { level: 1, name: "Khám phá kiến trúc microservices" })
      .waitFor();
    assert.equal(await page.locator("html").getAttribute("data-appearance"), "dark");
    assert.equal(await page.locator("html").getAttribute("lang"), "vi");
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
      .getByRole("heading", { level: 1, name: "Explore microservices architecture" })
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

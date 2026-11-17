const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:3000";
const PROJECT = process.env.MAVIS_E2E_PROJECT;
const ASSIGNMENT = process.env.MAVIS_E2E_ASSIGNMENT;
const EMAIL = process.env.MAVIS_E2E_LECTURER_EMAIL;
const PASSWORD = process.env.MAVIS_E2E_LECTURER_PASSWORD;

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });

  await page.goto(
    `${BASE}/sessions?${new URLSearchParams({ project: PROJECT, assignment: ASSIGNMENT, studio: "1" })}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(4000);
  const start = page.getByRole("button", { name: /Start Studio session/i });
  if (await start.count()) {
    await start.click();
    console.log("[start] clicked");
    await page.waitForTimeout(12000);
  }
  const studio = page.getByRole("region", { name: "MAVIS Studio" });
  await studio.waitFor({ timeout: 30000 });

  async function capture(explanation) {
    await studio.getByLabel(/Explain the observed behavior/).fill(explanation);
    await studio.getByRole("button", { name: /Capture evidence snapshot/i }).click();
    await page.waitForTimeout(1800);
  }
  async function action(name) {
    await studio.locator("select").first().selectOption("payment");
    await studio.getByRole("button", { name }).click();
    await page.waitForTimeout(2500);
  }

  await capture("Baseline: payment runs one replica.");
  await action("Stop service");
  await action("Start service");
  await studio.locator('input[type="number"]').first().fill("2");
  await page.waitForTimeout(300);
  await studio.getByRole("button", { name: "Scale replicas" }).click();
  await page.waitForTimeout(3500);
  await capture("After: payment runs two replicas and recovers after restart.");
  await page.waitForTimeout(800);
  await studio.getByRole("button", { name: /Finish Studio and save evidence/i }).click();
  await page.waitForTimeout(15000);
  console.log("[final]", (await page.locator("#main-content").innerText()).slice(0, 2200));
  await page.screenshot({ path: ".artifacts/e2e-local/52-student-studio-finished.png", fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

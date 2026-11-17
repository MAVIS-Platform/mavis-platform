const { chromium } = require("playwright");

const BASE = process.env.MAVIS_E2E_BASE ?? "http://127.0.0.1:3000";
const EMAIL = process.env.MAVIS_E2E_LECTURER_EMAIL;
const PASSWORD = process.env.MAVIS_E2E_LECTURER_PASSWORD;
const PROJECT = process.env.MAVIS_E2E_PROJECT;
const SESSION = process.env.MAVIS_E2E_SESSION;
const ASSIGNMENT = process.env.MAVIS_E2E_ASSIGNMENT;
const ACTION = process.env.MAVIS_STUDIO_ACTION ?? "INSPECT";
const SERVICE = process.env.MAVIS_STUDIO_SERVICE ?? "payment";
const REPLICAS = Number(process.env.MAVIS_STUDIO_REPLICAS ?? "2");

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });

  const q = new URLSearchParams({ project: PROJECT, studio: "1" });
  if (SESSION) q.set("session", SESSION);
  if (ASSIGNMENT) q.set("assignment", ASSIGNMENT);
  await page.goto(`${BASE}/sessions?${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  if (process.env.MAVIS_STUDIO_ACTION === "START_SESSION") {
    await page.getByRole("button", { name: /Start Studio session/i }).click();
    await page.waitForTimeout(15000);
    console.log("[started]", (await page.locator("#main-content").innerText()).slice(0, 1800));
    await page.screenshot({ path: ".artifacts/e2e-local/51-student-studio-started.png", fullPage: true });
    await browser.close();
    return;
  }
  const studio = page.getByRole("region", { name: "MAVIS Studio" });
  const target = studio.locator("select").first();
  console.log("[target-options]", await target.locator("option").allInnerTexts());
  await target.selectOption(SERVICE);
  await page.waitForTimeout(400);
  for (const name of ["Start service", "Stop service", "Scale replicas"]) {
    console.log(`[button:${name}]`, await studio.getByRole("button", { name }).isDisabled());
  }
  console.log("[body]", (await page.locator("#main-content").innerText()).slice(0, 2500));

  if (ACTION !== "INSPECT") {
    if (ACTION === "CAPTURE") {
      await studio.getByLabel(/Explain the observed behavior/).fill(process.env.MAVIS_STUDIO_EXPLANATION ?? "Observed runtime state after a Studio action.");
      await studio.getByRole("button", { name: /Capture evidence snapshot/i }).click();
    } else if (ACTION === "SCALE") {
      await studio.locator('input[type="number"]').first().fill(String(REPLICAS));
      await studio.getByRole("button", { name: "Scale replicas" }).click();
    } else if (ACTION === "FINISH") {
      await studio.getByRole("button", { name: /Finish Studio and save evidence/i }).click();
    } else {
      await studio.getByRole("button", { name: ACTION === "STOP" ? "Stop service" : "Start service" }).click();
    }
    await page.waitForTimeout(12000);
    console.log("[after]", (await page.locator("#main-content").innerText()).slice(0, 2600));
    await page.screenshot({ path: `.artifacts/e2e-local/50-studio-${ACTION.toLowerCase()}.png`, fullPage: true });
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

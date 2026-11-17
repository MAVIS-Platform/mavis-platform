const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:3000";
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill("hoangnt@fpt.edu.vn");
  await page.locator('input[type="password"]').fill("MavisTest123!");
  await page.getByRole("button", { name: /sign in|đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  await page.goto(`${BASE}/submissions/${process.env.MAVIS_SUBMISSION}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  console.log((await page.locator("#main-content").innerText()).slice(0, 5000));
  await page.screenshot({ path: ".artifacts/e2e-local/60-review-v2.png", fullPage: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

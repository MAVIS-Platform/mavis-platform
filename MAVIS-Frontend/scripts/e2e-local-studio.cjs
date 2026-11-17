const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.MAVIS_E2E_BASE ?? "http://127.0.0.1:3000";
const EMAIL = process.env.MAVIS_E2E_LECTURER_EMAIL;
const PASSWORD = process.env.MAVIS_E2E_LECTURER_PASSWORD;
const ART = path.resolve(__dirname, "..", ".artifacts", "e2e-local");

async function shot(page, name) {
  fs.mkdirSync(ART, { recursive: true });
  await page.screenshot({ path: path.join(ART, `${name}.png`), fullPage: true });
  console.log(`[shot] ${name} ${page.url()}`);
}

(async () => {
  if (!EMAIL || !PASSWORD) throw new Error("Missing E2E credentials in env");
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const api = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) api.push(`${r.status()} ${r.request().method()} ${u.pathname}${u.search}`);
  });
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[console] ${m.text()}`);
  });
  page.on("requestfailed", (r) => console.log(`[requestfailed] ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on("request", (r) => {
    if (/startRuntime|startStudio|saveRuntimeConfiguration/.test(r.url()))
      console.log(`[request-body] ${r.url()} ${(r.postData() ?? "").slice(0, 1500)}`);
  });
  page.on("response", async (r) => {
    if (/startRuntime|startStudio/.test(r.url()) && r.status() >= 400)
      console.log(`[error-body] ${r.status()} ${r.url()} ${(await r.text().catch(() => "")).slice(0, 800)}`);
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  console.log(`[login] ${page.url()}`);
  await shot(page, "01-after-login");

  if (process.env.MAVIS_E2E_STUDENT_LAB && process.env.MAVIS_E2E_WORKSPACE && process.env.MAVIS_E2E_ASSIGNMENT) {
    await page.goto(
      `${BASE}/lab?workspace=${process.env.MAVIS_E2E_WORKSPACE}&assignment=${process.env.MAVIS_E2E_ASSIGNMENT}&step=${process.env.MAVIS_E2E_STEP ?? "1"}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(3500);
    await shot(page, "40-student-lab");
    console.log("[student-lab]", (await page.locator("#main-content").innerText()).slice(0, 5000));
    console.log(
      "[student-buttons]",
      JSON.stringify(await page.locator("#main-content button, #main-content a").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
    );
    console.log("[api-student]\n" + api.slice(-20).join("\n"));
    if (process.env.MAVIS_E2E_INIT_WORKSPACE) {
      const init = page.getByRole("button", { name: /Initialize & Analyze My Lab Workspace/i });
      if (await init.count()) {
        await init.click();
        await page.waitForTimeout(12000);
        await shot(page, "43-student-workspace-initialized");
        console.log("[workspace-init]", (await page.locator("#main-content").innerText()).slice(0, 2500));
        console.log("[api-init]\n" + api.slice(-12).join("\n"));
      }
    }
    if (process.env.MAVIS_E2E_SUBMIT_QUIZ) {
      const radios = page.locator('#main-content input[type="radio"]');
      if (await radios.count()) {
        await radios.first().check({ force: true });
        await page.getByRole("button", { name: /^Submit Quiz$/ }).click();
        await page.waitForTimeout(3000);
        await shot(page, "41-student-quiz-submitted");
        console.log("[quiz-submitted]", (await page.locator("#main-content").innerText()).slice(0, 3000));
        console.log("[api-quiz-submit]\n" + api.slice(-12).join("\n"));
      } else {
        console.log("[quiz-submitted] already passed");
      }
    }
    if (process.env.MAVIS_E2E_SUBMIT_THEORY) {
      if (!(await page.getByLabel(/Submission explanation/).count())) {
        await page.getByRole("button", { name: /Revise and resubmit/i }).click();
        await page.waitForTimeout(600);
      }
      await page.getByLabel(/Submission explanation/).fill(
        "The orders service calls payment through the prepared route controller. C1-C3 show the boundary and the pinned repository proves the call path.",
      );
      await page.getByRole("button", { name: /^Submit Lab$/ }).click();
      await page.waitForTimeout(4000);
      await shot(page, "42-student-theory-submitted");
      console.log("[theory-submitted]", (await page.locator("#main-content").innerText()).slice(0, 3200));
      console.log("[api-theory-submit]\n" + api.slice(-15).join("\n"));
    }
    await browser.close();
    return;
  }

  if (process.env.MAVIS_E2E_PROJECT && process.env.MAVIS_E2E_RUNTIME_CONFIG) {
    await page.goto(
      `${BASE}/runtime-config?project=${process.env.MAVIS_E2E_PROJECT}${process.env.MAVIS_E2E_ASSIGNMENT ? `&assignment=${process.env.MAVIS_E2E_ASSIGNMENT}` : ""}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(3000);
    await shot(page, "30-runtime-config");
    console.log("[runtime-config]", (await page.locator("#main-content").innerText()).slice(0, 5000));
    console.log(
      "[runtime-inputs]",
      JSON.stringify(
        await page.locator("#main-content input, #main-content textarea, #main-content select").evaluateAll((els) =>
          els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 60) })),
        ),
        null,
        1,
      ),
    );
    console.log(
      "[runtime-buttons]",
      JSON.stringify(await page.locator("#main-content button, #main-content a").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
    );
    console.log("[api-runtime]\n" + api.slice(-15).join("\n"));
    if (process.env.MAVIS_E2E_CHECK) {
      await page.getByRole("button", { name: /^Check$/ }).click();
      await page.waitForTimeout(4000);
      await shot(page, "31-runtime-checked");
      console.log("[runtime-checked]", (await page.locator("#main-content").innerText()).slice(0, 5000));
      console.log(
        "[runtime-checked-inputs]",
        JSON.stringify(
          await page.locator("#main-content input, #main-content textarea, #main-content select").evaluateAll((els) =>
            els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 60) })),
          ),
          null,
          1,
        ),
      );
      console.log(
        "[runtime-checked-buttons]",
        JSON.stringify(await page.locator("#main-content button, #main-content a").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
      );
      console.log("[api-checked]\n" + api.slice(-12).join("\n"));
      if (process.env.MAVIS_E2E_CONTINUE_CONFIG) {
        await page.getByRole("button", { name: /Continue to Step 2/i }).click();
        await page.waitForTimeout(3000);
        await shot(page, "32-runtime-step2");
        console.log("[runtime-step2]", (await page.locator("#main-content").innerText()).slice(0, 5000));
        console.log(
          "[runtime-step2-buttons]",
          JSON.stringify(await page.locator("#main-content button, #main-content a").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
        );
        console.log("[api-step2]\n" + api.slice(-12).join("\n"));
        if (process.env.MAVIS_E2E_CONFIRM_RUN) {
          await page.getByRole("button", { name: /Confirm & Run in Step 3/i }).click();
          await page.waitForTimeout(4000);
          await shot(page, "33-runtime-step3");
          console.log("[runtime-step3]", (await page.locator("#main-content").innerText()).slice(0, 4000));
          console.log("[api-step3]\n" + api.slice(-12).join("\n"));
        }
      }
    }
    await browser.close();
    return;
  }

  await page.goto(`${BASE}/workspaces`, { waitUntil: "domcontentloaded" });
  await shot(page, "02-workspaces");
  if (process.env.MAVIS_E2E_ASSIGNMENT && process.env.MAVIS_E2E_WORKSPACE) {
    const workspace = process.env.MAVIS_E2E_WORKSPACE;
    const assignment = process.env.MAVIS_E2E_ASSIGNMENT;
    const tab = process.env.MAVIS_E2E_TAB ?? "source";
    await page.goto(`${BASE}/lab-authoring?workspace=${workspace}&assignment=${assignment}&tab=${tab}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    if (tab !== "source") {
      await shot(page, `20-${tab}`);
      console.log(`[${tab}]`, (await page.locator("#main-content").innerText()).slice(0, 4000));
      console.log(
        `[${tab}-inputs]`,
        JSON.stringify(
          await page.locator("#main-content input, #main-content textarea, #main-content select").evaluateAll((els) =>
            els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 60) })),
          ),
          null,
          1,
        ),
      );
      console.log(
        `[${tab}-buttons]`,
        JSON.stringify(await page.locator("#main-content button").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
      );
      console.log("[api-tab]\n" + api.slice(-12).join("\n"));
      if (process.env.MAVIS_E2E_ADD_BLOCK) {
        await page.getByRole("button", { name: /^Add block$/ }).click();
        await page.waitForTimeout(800);
        await shot(page, "27-studio-block-added");
        console.log("[studio-block]", (await page.locator("#main-content").innerText()).slice(0, 3500));
        console.log(
          "[studio-block-inputs]",
          JSON.stringify(
            await page.locator("#main-content input, #main-content textarea, #main-content select").evaluateAll((els) =>
              els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 60) })),
            ),
            null,
            1,
          ),
        );
        console.log(
          "[studio-block-options]",
          JSON.stringify(await page.locator("#main-content select option").evaluateAll((els) => els.map((el) => ({ value: el.value, text: el.innerText.trim() }))), null, 1),
        );
        if (process.env.MAVIS_E2E_SAVE_TOPOLOGY) {
          await page.getByRole("button", { name: /^Add block$/ }).click();
          await page.waitForTimeout(600);
          await page.locator("#main-content select").nth(1).selectOption("payment");
          await page.waitForTimeout(400);
          if (process.env.MAVIS_E2E_SCALE_BLOCK) {
            await page.locator('#main-content input[type="checkbox"]').nth(2).check({ force: true });
          }
          await page.getByRole("button", { name: /Save prepared topology/i }).click();
          await page.waitForTimeout(3000);
          await shot(page, "28-topology-saved");
          console.log("[topology-saved]", (await page.locator("#main-content").innerText()).slice(0, 2600));
          console.log("[api-topology]\n" + api.slice(-10).join("\n"));
        }
      }
      if (process.env.MAVIS_E2E_CREATE_COURSE) {
        await page.getByRole("button", { name: /Create Course draft/i }).click();
        await page.waitForTimeout(2500);
        await shot(page, `21-${tab}-course-created`);
        console.log(`[${tab}-course]`, (await page.locator("#main-content").innerText()).slice(0, 3500));
        console.log("[api-course]\n" + api.slice(-10).join("\n"));
      }
      if (process.env.MAVIS_E2E_MODULE_TITLE) {
        const titleInput = page.getByPlaceholder(/Service boundaries/);
        await titleInput.fill(process.env.MAVIS_E2E_MODULE_TITLE);
        await page.getByRole("button", { name: /^Add module$/i }).click();
        await page.waitForTimeout(2500);
        await shot(page, `22-${tab}-module-created`);
        console.log(`[${tab}-module]`, (await page.locator("#main-content").innerText()).slice(0, 4000));
        console.log("[api-module]\n" + api.slice(-10).join("\n"));
      }
      if (process.env.MAVIS_E2E_LESSON_TITLE) {
        await page.getByPlaceholder("Lesson title").fill(process.env.MAVIS_E2E_LESSON_TITLE);
        await page.locator("#main-content textarea").first().fill(
          process.env.MAVIS_E2E_LESSON_CONTENT ??
            "# Lesson 1\n\nRead the sample repository and trace the `orders` → `payment` call.\n\n- Inspect the route controller\n- Compare C1–C3 views",
        );
        await page.getByRole("button", { name: /^Add lesson$/i }).click();
        await page.waitForTimeout(2500);
        await shot(page, `23-${tab}-lesson-created`);
        console.log(`[${tab}-lesson]`, (await page.locator("#main-content").innerText()).slice(0, 4000));
        console.log("[api-lesson]\n" + api.slice(-10).join("\n"));
      }
      if (process.env.MAVIS_E2E_SHOW_IMPORT) {
        await page.getByRole("button", { name: /^Import \/ Export$/ }).click();
        await page.waitForTimeout(600);
        await shot(page, "34-quiz-import-tab");
        console.log("[quiz-import]", (await page.locator("#main-content").innerText()).slice(-2600));
        console.log(
          "[quiz-import-inputs]",
          JSON.stringify(
            await page.locator("#main-content input, #main-content textarea").evaluateAll((els) =>
              els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 60) })),
            ),
            null,
            1,
          ),
        );
        console.log(
          "[quiz-import-buttons]",
          JSON.stringify(await page.locator("#main-content button").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
        );
        if (process.env.MAVIS_E2E_IMPORT_JSON) {
          await page
            .getByPlaceholder(/type,prompt,options,correct,explanation,points/)
            .fill(
              JSON.stringify({
                lesson: "Answer the Quiz to unlock the Studio practice step.",
                passPercent: 80,
                questions: [
                  {
                    prompt: "Which prepared component forwards orders traffic to payment?",
                    type: "SINGLE_CHOICE",
                    options: ["orders-payment-route", "payment"],
                    correctOption: 0,
                    explanation: "The route controller is the prepared wire between orders and payment.",
                    points: 1,
                  },
                ],
              }),
            );
          await page.getByRole("button", { name: /^Parse JSON$/ }).click();
          await page.waitForTimeout(1200);
          await shot(page, "35-quiz-imported");
          console.log("[quiz-imported]", (await page.locator("#main-content").innerText()).slice(-2200));
          await page.getByRole("button", { name: /^Save draft$/ }).click();
          await page.waitForTimeout(2200);
          console.log("[quiz-import-saved]", (await page.locator("#main-content").innerText()).slice(-1200));
          if (process.env.MAVIS_E2E_PUBLISH_QUIZ) {
            await page.getByRole("button", { name: /^Publish version$/ }).click();
            await page.waitForTimeout(2200);
            console.log("[quiz-import-published]", (await page.locator("#main-content").innerText()).slice(0, 900));
            console.log("[api-import-publish]\n" + api.slice(-8).join("\n"));
          }
        }
      }
      if (process.env.MAVIS_E2E_ADD_QUESTION) {
        await page.getByPlaceholder(/Short lesson or instructions/).fill(
          "Answer the Quiz to unlock the Studio practice step.",
        );
        await page.getByRole("button", { name: /^Single choice$/ }).click();
        await page.waitForTimeout(800);
        await shot(page, "24-quiz-question-added");
        console.log("[quiz-question]", (await page.locator("#main-content").innerText()).slice(0, 3500));
        console.log(
          "[quiz-inputs]",
          JSON.stringify(
            await page.locator("#main-content input, #main-content textarea").evaluateAll((els) =>
              els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 60) })),
            ),
            null,
            1,
          ),
        );
      }
      if (process.env.MAVIS_E2E_FILL_QUESTION) {
        await page.locator("#main-content textarea").nth(1).fill(
          "Which prepared component forwards orders traffic to payment?",
        );
        const optionInputs = page.locator('#main-content input:not([type])');
        await optionInputs.nth(0).fill("orders-payment-route");
        await optionInputs.nth(1).fill("payment");
        await page.locator('#main-content input[type="radio"]').first().check({ force: true });
        if (process.env.MAVIS_E2E_DEBUG_QUIZ) {
          console.log(
            "[quiz-filled-values]",
            JSON.stringify(
              await page.locator("#main-content input, #main-content textarea").evaluateAll((els) =>
                els.map((el) => ({ tag: el.tagName, type: el.type, value: el.value?.slice(0, 80), checked: el.checked })),
              ),
              null,
              1,
            ),
          );
          console.log("[quiz-alerts]", await page.locator('[role="alert"]').allInnerTexts());
          console.log(
            "[save-disabled]",
            await page.getByRole("button", { name: /^Save draft$/ }).isDisabled(),
          );
        }
        await page.getByRole("button", { name: /^Save draft$/ }).click();
        await page.waitForTimeout(2500);
        await shot(page, "25-quiz-draft-saved");
        console.log("[quiz-draft]", (await page.locator("#main-content").innerText()).slice(-1800));
        console.log("[api-quiz-draft]\n" + api.slice(-8).join("\n"));
        if (process.env.MAVIS_E2E_PUBLISH_QUIZ) {
          await page.getByRole("button", { name: /^Publish version$/ }).click();
          await page.waitForTimeout(2500);
          await shot(page, "26-quiz-published");
          console.log("[quiz-published]", (await page.locator("#main-content").innerText()).slice(0, 2200));
          console.log("[api-quiz-publish]\n" + api.slice(-8).join("\n"));
        }
      }
      if (process.env.MAVIS_E2E_FREEZE) {
        await page.getByRole("button", { name: /Freeze Studio topology/i }).click();
        await page.waitForTimeout(2500);
        await shot(page, "37-topology-frozen");
        console.log("[frozen]", (await page.locator("#main-content").innerText()).slice(0, 1600));
        console.log("[api-freeze]\n" + api.slice(-8).join("\n"));
      }
      if (process.env.MAVIS_E2E_PUBLISH_LAB) {
        page.once("dialog", (dialog) => void dialog.accept());
        await page.getByRole("button", { name: /Publish as lab/i }).click();
        await page.waitForTimeout(3000);
        await shot(page, "36-lab-published");
        console.log("[lab-published]", (await page.locator("#main-content").innerText()).slice(0, 2600));
        console.log("[api-publish-lab]\n" + api.slice(-10).join("\n"));
      }
      if (process.env.MAVIS_E2E_START_SESSION) {
        const href = await page.getByRole("link", { name: /Start Live session/i }).getAttribute("href");
        console.log("[session-href]", href);
        await page.goto(new URL(href, BASE).toString(), { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(5000);
        await shot(page, "29-live-session");
        console.log("[live-session]", (await page.locator("#main-content").innerText()).slice(0, 5000));
        console.log(
          "[live-buttons]",
          JSON.stringify(await page.locator("#main-content button, #main-content a").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
        );
        console.log("[api-session]\n" + api.slice(-20).join("\n"));
        if (process.env.MAVIS_E2E_START_STUDIO) {
          await page.getByRole("button", { name: /Start Studio session/i }).click();
          await page.waitForTimeout(12000);
          await shot(page, "30-studio-session-started");
          console.log("[studio-session]", (await page.locator("#main-content").innerText()).slice(0, 5000));
          console.log("[api-studio-session]\n" + api.slice(-25).join("\n"));
        }
      }
      await browser.close();
      return;
    }
    await shot(page, "10-source-step");
    console.log("[source]", (await page.locator("#main-content").innerText()).slice(0, 3000));
    console.log(
      "[source-inputs]",
      JSON.stringify(
        await page.locator("#main-content input, #main-content textarea, #main-content select").evaluateAll((els) =>
          els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, accept: el.accept, value: el.value?.slice(0, 40) })),
        ),
        null,
        1,
      ),
    );
    console.log(
      "[source-buttons]",
      JSON.stringify(await page.locator("#main-content button").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
    );
    if (process.env.MAVIS_E2E_ZIP) {
      await page.getByRole("button", { name: /^Upload ZIP$/ }).click();
      await page.waitForTimeout(500);
      await page.locator('input[type="file"]').setInputFiles(process.env.MAVIS_E2E_ZIP);
      await page.waitForTimeout(800);
      await shot(page, "11-source-zip-selected");
      console.log("[zip-state]", (await page.locator("#main-content").innerText()).slice(0, 2500));
      console.log(
        "[zip-buttons]",
        JSON.stringify(await page.locator("#main-content button").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
      );
      console.log("[api-zip]\n" + api.slice(-10).join("\n"));
      if (process.env.MAVIS_E2E_ANALYZE) {
        await page.getByRole("button", { name: /Import & analyze source/i }).click();
        for (let i = 0; i < 30; i++) {
          await page.waitForTimeout(3000);
          const text = await page.locator("#main-content").innerText();
          if (/analysis|analyzed|model|failed|error|lỗi/i.test(text) && !/Analyzing|Importing|Đang phân tích/i.test(text)) break;
        }
        await shot(page, "12-source-analyzed");
        console.log("[analyzed]", (await page.locator("#main-content").innerText()).slice(0, 3000));
        console.log(
          "[model-options]",
          JSON.stringify(await page.locator("#main-content select option").evaluateAll((els) => els.map((el) => ({ value: el.value, text: el.innerText.trim() }))), null, 1),
        );
        console.log("[api-analyze]\n" + api.slice(-15).join("\n"));
        console.log("[api-mutations]\n" + api.filter((x) => !x.startsWith("200 GET")).join("\n"));
        if (process.env.MAVIS_E2E_SAVE_SOURCE) {
          await page.getByRole("button", { name: /Save source to Lab/i }).click();
          await page.waitForTimeout(2500);
          await shot(page, "13-source-saved");
          console.log("[source-saved]", (await page.locator("#main-content").innerText()).slice(0, 2200));
          console.log("[api-saved]\n" + api.slice(-8).join("\n"));
        }
      }
    }
    await browser.close();
    return;
  }
  let workspaceId = process.env.MAVIS_E2E_WORKSPACE;
  if (!workspaceId) {
    await page.getByRole("button", { name: /create class|tạo lớp/i }).first().click();
    const code = process.env.MAVIS_E2E_CLASS_CODE ?? `E2E-${Date.now()}`;
    const name = process.env.MAVIS_E2E_CLASS_NAME ?? `MAVIS E2E ${new Date().toISOString().slice(0, 16)}`;
    await page.getByPlaceholder(/SE181070/).fill(code);
    await page.getByPlaceholder(/Software Architecture/).fill(name);
    await page.getByRole("button", { name: /^create class$/i }).click();
    await page.waitForTimeout(1500);
    const link = page.locator('a[href*="/workspace-overview?workspace="]').first();
    workspaceId = new URL(await link.getAttribute("href"), BASE).searchParams.get("workspace");
    await shot(page, "04-class-created");
    console.log("[class]", workspaceId, code, name);
  }

  await page.goto(`${BASE}/workspace-overview?workspace=${workspaceId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await shot(page, "05-class-content");
  console.log("[api-class]\n" + api.slice(-20).join("\n"));
  console.log("[body]", (await page.locator("body").innerText()).slice(0, 3000));
  console.log(
    "[links]",
    JSON.stringify(await page.locator("a").evaluateAll((els) => els.map((el) => ({ text: el.innerText.trim().slice(0, 60), href: el.getAttribute("href") })).filter((x) => x.href)), null, 1),
  );
  console.log(
    "[buttons]",
    JSON.stringify(await page.locator("button").evaluateAll((els) => els.map((el) => el.innerText.trim()).filter(Boolean)), null, 1),
  );

  await page.getByRole("button", { name: /^authoring$/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, "06-authoring");
  console.log("[authoring]", (await page.locator("#main-content").innerText()).slice(0, 2500));

  await page.goto(`${BASE}/lab-authoring?workspace=${workspaceId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await shot(page, "07-lab-authoring");
  console.log("[lab-authoring]", (await page.locator("#main-content").innerText()).slice(0, 3500));
  console.log(
    "[lab-inputs]",
    JSON.stringify(await page.locator("#main-content input, #main-content textarea, #main-content select").evaluateAll((els) => els.map((el) => ({ tag: el.tagName, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 40) }))), null, 1),
  );
  console.log("[api-lab]\n" + api.slice(-20).join("\n"));

  await page
    .getByRole("button", {
      name: process.env.MAVIS_E2E_LAB_MODE === "studio" ? /Theory \+ Quiz \+ Studio/ : /Theory \+ Quiz(?! \+ Studio)/,
    })
    .click();
  await page.getByPlaceholder(/Service resilience/).fill("E2E Studio Lab");
  await page
    .getByPlaceholder(/Describe the learning goal/)
    .fill("E2E: inspect the reference topology, run Studio Stop/Start/Scale and collect evidence.");
  await page.getByRole("button", { name: /Save Lab draft/i }).click();
  await page.waitForTimeout(3000);
  await shot(page, "08-lab-saved");
  console.log("[after-save]", (await page.locator("#main-content").innerText()).slice(0, 3000));
  console.log("[url]", page.url());
  console.log("[api-save]\n" + api.slice(-12).join("\n"));

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

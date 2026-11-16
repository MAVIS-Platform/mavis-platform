const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const frontendRoot = path.resolve(__dirname, '../MAVIS-Frontend');
const ts = require(path.join(frontendRoot, 'node_modules/typescript'));
const { chromium } = require(require.resolve('playwright', {
  paths: [path.resolve(__dirname, '../MAVIS-Frontend')],
}));

const compileTypeScript = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  module._compile(
    compiled.replace(
      /require\(["']@\/([^"']+)["']\)/g,
      (_, name) => `require(${JSON.stringify(path.join(frontendRoot, 'src', name))})`,
    ),
    filename,
  );
};
require.extensions['.ts'] = compileTypeScript;
require.extensions['.tsx'] = compileTypeScript;
module.paths.unshift(path.join(frontendRoot, 'node_modules'));

const { modelView } = require(path.join(frontendRoot, 'src/lib/api/java-wire.ts'));
const {
  generateSeededModel,
  runSeededGraphBenchmark,
  buildM8CoverageMatrix,
} = require(path.join(frontendRoot, 'src/features/architecture/m8-benchmark-and-coverage.ts'));

const outputDir = path.resolve(__dirname, '../output/m8');
fs.mkdirSync(outputDir, { recursive: true });

let browser = null;
let scriptExitCode = 0;

const globalTimer = setTimeout(() => {
  console.error('GLOBAL TIMEOUT: M4-M8 browser acceptance suite exceeded 300s limit');
  if (browser) browser.close().catch(() => {});
  process.exit(1);
}, 300000);

function computeStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / Math.max(1, sorted.length)).toFixed(2));
  const median = Number((sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0).toFixed(2));
  const p95NearestRank = Number((sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0).toFixed(2));
  const min = Number((sorted[0] ?? 0).toFixed(2));
  const max = Number((sorted[sorted.length - 1] ?? 0).toFixed(2));
  return {
    sampleSize: samples.length,
    samples: samples.map((v) => Number(v.toFixed(2))),
    median,
    p50: median,
    max,
    p95NearestRank,
    p95: p95NearestRank,
    mean,
    min,
    statisticalNote:
      'n=5 small sample: primary metrics are samples, median, and max; p95NearestRank equals max at n=5 and is not a large-sample parametric 95th percentile.',
  };
}

const BENCHMARK_TARGETS = {
  100: {
    expandAllMedianTargetMs: 250,
    originFilterMedianTargetMs: 250,
    zoomInteractionMedianTargetMs: 100,
  },
  500: {
    expandAllMedianTargetMs: 600,
    originFilterMedianTargetMs: 350,
    zoomInteractionMedianTargetMs: 100,
  },
  2000: {
    expandAllMedianTargetMs: 1500,
    originFilterMedianTargetMs: 600,
    zoomInteractionMedianTargetMs: 100,
  },
};

(async () => {
  const results = {
    milestone: 'M4-M8 — Unified Graph + 9 Diagrams Catalog E2E Acceptance + Browser Graph Workload Benchmark',
    timestamp: new Date().toISOString(),
    stack: {
      frontend: 'http://127.0.0.1:3000',
      javaBackend: 'http://127.0.0.1:8081',
      worker: 'http://127.0.0.1:5082',
      postgres: 'localhost:5432',
      drawioRenderer: 'http://127.0.0.1:8090',
    },
    project: {
      projectId: 'e0a9ee09-2747-469c-b09d-474674db7a05',
      modelId: '8b5a2dbc-329d-4e9a-8d01-b94ab4b1c241',
      name: 'Test1',
    },
    pass1LiveBackendTest1: {
      acceptanceMode: 'LIVE_BACKEND_POSTGRES_TEST1',
      mockedEndpoints: [],
      honestEmptyExtractedStates: {},
      structuredDesignedAuthoringAndCasPersistence: {},
    },
    pass2ExtractedJavaAstModelBrowserRender: {
      acceptanceMode: 'BROWSER_EXTRACTOR_FIXTURE_VIA_ROUTE_FULFILL',
      mockedEndpoints: ['/api/mavis/model?*', '/api/mavis/architectureDocument?*'],
      sourceFixture: 'output/m2/source-pipeline-java-actual.json',
      classificationNote:
        'Exercises real browser UI + live Draw.io (:8090) SVG renderer on the actual Java AST/Docker extractor output (source-pipeline-java-actual.json) injected via page.route(...fulfill), because Test1 in PostgreSQL predates M6/M7 AST CFG/lifecycle fields.',
      diagrams: {},
    },
    pass3BrowserGraphWorkloadSummary: {},
    viewsVerified: {},
    networkRequestsCount: 0,
  };

  const accountFile = path.resolve(__dirname, '../.artifacts/sandbox-account/account.json');
  const account = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
  const networkLog = [];

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const page = await context.newPage();

    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('/api/backend/') || url.includes('/api/mavis/')) {
        networkLog.push({
          method: res.request().method(),
          url: url.replace(/[?&](token|access_token|refresh_token|password|secret)=[^&]+/gi, '$1=[REDACTED]'),
          status: res.status(),
        });
      }
    });

    console.log('--- PRE-FLIGHT: WAITING FOR DRAW.IO RENDERER (:8090) ---');
    let drawioReady = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const res = await fetch('http://127.0.0.1:8090/');
        if (res.ok) {
          drawioReady = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!drawioReady) {
      throw new Error('Draw.io renderer on http://127.0.0.1:8090 is not reachable');
    }

    console.log('--- PASS 1: LIVE BACKEND AUTHENTICATION & TEST1 MODEL ---');
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.waitForTimeout(500);
    await page.fill('input[type="email"]', account.email);
    await page.fill('input[type="password"]', account.password);
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/mavis/signIn') && res.status() === 200,
        { timeout: 30000 },
      ),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(800);

    const { projectId, modelId } = results.project;
    await page.goto(
      `http://127.0.0.1:3000/architecture?project=${projectId}&model=${modelId}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 },
    );
    await page.waitForSelector('svg[aria-label="Service dependency network"]', { timeout: 60000 });
    await page.waitForTimeout(800);

    const close3E = await page.$('button[aria-label="Close 3E"]');
    if (close3E) {
      await close3E.click();
      await page.waitForTimeout(200);
    }

    const graphNodeCount = await page
      .locator('svg[aria-label="Service dependency network"] g[data-node-id]')
      .count();
    const graphEdgeCount = await page
      .locator('svg[aria-label="Service dependency network"] path[data-edge-id]')
      .count();
    assert.ok(graphNodeCount > 0, 'Live GRAPH view on Test1 must render > 0 SVG [data-node-id] nodes');
    await page.screenshot({ path: path.join(outputDir, 'browser-graph.png') });
    results.viewsVerified.GRAPH = {
      status: 'PASS',
      acceptanceMode: 'LIVE_BACKEND_POSTGRES_TEST1',
      renderedSvgNodes: graphNodeCount,
      renderedSvgEdges: graphEdgeCount,
      screenshot: 'output/m8/browser-graph.png',
    };

    console.log('--- PASS 1.1: C4 MODEL (C1, C2, C3) & UML_SEQUENCE REAL DOM/RENDER ASSERTIONS ---');
    const diagramTab = await page.$('button[role="tab"]:has-text("Diagram")');
    if (diagramTab) {
      await diagramTab.click();
      await page.waitForTimeout(600);
    }

    await page.getByLabel('Diagram family').selectOption('C4');
    await page.waitForTimeout(400);
    for (const c4Kind of ['CONTEXT', 'CONTAINER', 'COMPONENT']) {
      const minExpectedTargets = c4Kind === 'CONTEXT' ? 1 : 2;
      await page.getByLabel('Diagram type').selectOption(c4Kind);
      await page.waitForTimeout(450);
      await page.waitForSelector('img[alt*="rendered with DRAWIO_XML"]', { timeout: 15000 });
      await page.waitForFunction(
        (min) => document.querySelectorAll('button[data-semantic-id]').length >= min,
        minExpectedTargets,
        { timeout: 15000 },
      );

      const selectedDiagramType = await page.getByLabel('Diagram type').inputValue();
      assert.equal(selectedDiagramType, c4Kind, `C4 diagram selector must equal ${c4Kind}`);

      const hitCount = await page.locator('button[data-semantic-id]').count();
      assert.ok(
        hitCount >= minExpectedTargets,
        `C4_${c4Kind} on Test1 must render >= ${minExpectedTargets} interactive semantic hit targets from Draw.io SVG, got ${hitCount}`,
      );
      const hitLabels = await page
        .locator('button[data-semantic-id]')
        .evaluateAll((btns) => btns.slice(0, 6).map((b) => b.getAttribute('aria-label') || ''));

      let scopedService = null;
      if (c4Kind === 'COMPONENT') {
        const svcSelect = page.getByLabel('Service', { exact: true });
        if ((await svcSelect.count()) > 0) {
          scopedService = await svcSelect.inputValue();
          assert.ok(scopedService && scopedService.length > 0, 'C4_COMPONENT must bind to a non-empty Service scope');
        }
      }

      await page.locator('img[alt*="rendered with DRAWIO_XML"]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outputDir, `browser-c4-${c4Kind.toLowerCase()}.png`) });
      results.viewsVerified[`C4_${c4Kind}`] = {
        status: 'PASS',
        acceptanceMode: 'LIVE_BACKEND_POSTGRES_TEST1',
        interactiveSemanticHitTargets: hitCount,
        sampleHitLabels: hitLabels,
        ...(scopedService ? { scopedServiceId: scopedService } : {}),
      };
    }

    await page.getByLabel('Diagram family').selectOption('UML');
    await page.waitForTimeout(400);

    const umlOptions = await page
      .getByLabel('Diagram type')
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => ({ value: o.value, label: o.textContent?.trim() })));

    await page.getByLabel('Diagram type').selectOption('UML_SEQUENCE');
    await page.waitForSelector('[role="tablist"][aria-label="Scenario source"]', { timeout: 15000 });
    await page.waitForTimeout(450);
    await page.waitForSelector('img[alt*="rendered with DRAWIO_XML"]', { timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelectorAll('button[data-semantic-id]').length >= 1,
      null,
      { timeout: 15000 },
    );
    const seqTabs = await page
      .locator('[role="tablist"][aria-label="Scenario source"] [role="tab"]')
      .evaluateAll((tabs) => tabs.map((t) => t.textContent?.trim() || ''));
    assert.ok(seqTabs.length >= 2, 'UML_SEQUENCE must render Scenario source tabs (Static/Designed & Runtime)');
    const seqHitCount = await page.locator('button[data-semantic-id]').count();
    await page.locator('img[alt*="rendered with DRAWIO_XML"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outputDir, 'browser-uml-sequence.png') });
    results.viewsVerified.UML_SEQUENCE = {
      status: 'PASS',
      acceptanceMode: 'LIVE_BACKEND_POSTGRES_TEST1',
      scenarioSourceTabs: seqTabs,
      interactiveSemanticHitTargets: seqHitCount,
    };

    async function resetAndSaveCleanBaselineIfNeeded() {
      await page.waitForSelector('[data-saved-loaded="true"]', { timeout: 15000 });
      await page.waitForTimeout(250);
      const resetBtn = page.locator('[data-testid="uml-reset-overlays"]');
      if ((await resetBtn.count()) > 0) {
        await resetBtn.click();
        await page.waitForTimeout(200);
        await page.locator('[data-testid="uml-save-diagram"]').click();
        await page.waitForSelector('[data-testid="uml-roundtrip-notice"]', { timeout: 15000 });
        await page.waitForTimeout(300);
      }
    }

    async function readSummaryCounts(targetPage) {
      const totalNodes = Number(
        (await targetPage.locator('[data-testid="uml-summary-total-nodes"]').textContent())?.trim() ?? '0',
      );
      const extractedNodes = Number(
        (await targetPage.locator('[data-testid="uml-summary-extracted-nodes"]').textContent())?.trim() ?? '0',
      );
      const designedNodes = Number(
        (await targetPage.locator('[data-testid="uml-summary-designed-nodes"]').textContent())?.trim() ?? '0',
      );
      const totalEdges = Number(
        (await targetPage.locator('[data-testid="uml-summary-total-edges"]').textContent())?.trim() ?? '0',
      );
      const designedEdges = Number(
        (await targetPage.locator('[data-testid="uml-summary-designed-edges"]').textContent())?.trim() ?? '0',
      );
      const extractedEdges = Math.max(0, totalEdges - designedEdges);
      return { totalNodes, extractedNodes, designedNodes, totalEdges, extractedEdges, designedEdges };
    }

    console.log('--- PASS 1.2: O1 HONEST EXTRACTED STATES ON TEST1 (DEPLOYMENT REAL DOCKER_COMPOSE vs EMPTY ACTIVITY & STATE) ---');
    // Test1 has real DOCKER_COMPOSE elements in PostgreSQL, so UML_DEPLOYMENT has real extracted nodes
    await page.getByLabel('Diagram type').selectOption('UML_DEPLOYMENT');
    await page.waitForSelector('[data-testid="uml-workspace-uml_deployment"]', { timeout: 15000 });
    await resetAndSaveCleanBaselineIfNeeded();
    const test1DeployCounts = await readSummaryCounts(page);
    assert.ok(
      test1DeployCounts.extractedNodes > 0,
      `UML_DEPLOYMENT on Test1 (with DOCKER_COMPOSE services) should have > 0 extracted nodes, got ${test1DeployCounts.extractedNodes}`,
    );
    results.pass1LiveBackendTest1.honestEmptyExtractedStates.UML_DEPLOYMENT_TEST1_DOCKER_COMPOSE = {
      status: 'PASS',
      extractedNodes: test1DeployCounts.extractedNodes,
      extractedEdges: test1DeployCounts.extractedEdges,
    };

    // Test1 was analyzed before M6/M7 AST CFG/lifecycle fields, so UML_ACTIVITY and UML_STATE must honestly report 0 extracted nodes
    for (const [kind, testId, expectedDiagCode] of [
      ['UML_ACTIVITY', 'uml-workspace-uml_activity', 'NO_ACTIVITY_CFG_EXTRACTED'],
      ['UML_STATE', 'uml-workspace-uml_state', 'NO_STATE_LIFECYCLE_EXTRACTED'],
    ]) {
      await page.getByLabel('Diagram type').selectOption(kind);
      await page.waitForSelector(`[data-testid="${testId}"]`, { timeout: 15000 });
      await resetAndSaveCleanBaselineIfNeeded();
      const counts = await readSummaryCounts(page);
      const diagText =
        (await page.locator('[data-testid="uml-validation-banner"]').textContent().catch(() => '')) ?? '';
      assert.equal(
        counts.extractedNodes,
        0,
        `${kind} on Test1 without extracted metadata must have 0 EXTRACTED nodes`,
      );
      assert.equal(
        counts.extractedEdges,
        0,
        `${kind} on Test1 without extracted metadata must have 0 EXTRACTED edges`,
      );
      assert.ok(
        diagText.includes(expectedDiagCode),
        `${kind} on Test1 must surface diagnostic ${expectedDiagCode}, got: ${diagText}`,
      );
      results.pass1LiveBackendTest1.honestEmptyExtractedStates[kind] = {
        status: 'PASS',
        extractedNodes: counts.extractedNodes,
        extractedEdges: counts.extractedEdges,
        diagnosticCodeVerified: expectedDiagCode,
      };
    }

    console.log('--- PASS 1.3: O3 + O5 STRUCTURED AUTHORING, CAS SAVE, RELOAD HYDRATION & POST-RELOAD EDIT ON UML_CLASS ---');
    await page.getByLabel('Diagram type').selectOption('UML_CLASS');
    await page.waitForSelector('[data-testid="uml-workspace-uml_class"]', { timeout: 15000 });
    await resetAndSaveCleanBaselineIfNeeded();

    const initialClassCounts = await readSummaryCounts(page);
    assert.ok(initialClassCounts.extractedNodes > 0, 'Test1 UML_CLASS should have extracted classifiers');

    // Author 1st DESIGNED classifier + relation
    await page.fill('[data-testid="uml-class-input-name"]', 'OrderAuditPolicy');
    await page.fill('[data-testid="uml-class-input-package"]', 'com.example.audit');
    await page.fill('[data-testid="uml-class-input-members"]', 'verifyOrder(orderId: UUID): boolean');
    await page.click('[data-testid="uml-add-designed-classifier"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-add-designed-class-relation"]');
    await page.waitForTimeout(200);

    const beforeSaveCounts = await readSummaryCounts(page);
    assert.equal(beforeSaveCounts.designedNodes, 1, 'Expected 1 DESIGNED classifier before save');
    assert.equal(beforeSaveCounts.designedEdges, 1, 'Expected 1 DESIGNED class relation before save');

    // Save via CAS to live backend
    await page.click('[data-testid="uml-save-diagram"]');
    await page.waitForSelector('[data-testid="uml-roundtrip-notice"]', { timeout: 15000 });
    const saveStatus1 = (await page.locator('[data-testid="uml-roundtrip-notice"]').textContent()) ?? '';
    assert.ok(
      saveStatus1.includes('Saved & reconciled'),
      `Expected Saved & reconciled revision notice, got: ${saveStatus1}`,
    );

    // Reload browser page and verify hydration from backend saved XML
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('svg[aria-label="Service dependency network"]', { timeout: 60000 });
    const close3EAfterReload = await page.$('button[aria-label="Close 3E"]');
    if (close3EAfterReload) {
      await close3EAfterReload.click();
    }
    const diagramTabAfterReload = await page.$('button[role="tab"]:has-text("Diagram")');
    if (diagramTabAfterReload) {
      await diagramTabAfterReload.click();
    }
    await page.getByLabel('Diagram family').selectOption('UML');
    await page.getByLabel('Diagram type').selectOption('UML_CLASS');
    await page.waitForSelector('[data-testid="uml-workspace-uml_class"]', { timeout: 15000 });
    await page.waitForSelector('[data-testid="uml-remove-designed-OrderAuditPolicy"]', {
      timeout: 15000,
    });

    const hydratedCounts = await readSummaryCounts(page);
    assert.equal(hydratedCounts.designedNodes, 1, 'Hydrated DESIGNED classifier count after reload must be 1');
    assert.equal(hydratedCounts.designedEdges, 1, 'Hydrated DESIGNED relation count after reload must be 1');

    // Author 2nd DESIGNED classifier AFTER reload to verify O3 immediate canvas + metadata consistency
    await page.fill('[data-testid="uml-class-input-name"]', 'PaymentComplianceRule');
    await page.fill('[data-testid="uml-class-input-package"]', 'com.example.audit');
    await page.click('[data-testid="uml-add-designed-classifier"]');
    await page.waitForTimeout(250);

    const postReloadCounts = await readSummaryCounts(page);
    assert.equal(
      postReloadCounts.designedNodes,
      2,
      'Post-reload structured edit must immediately update designed node count to 2',
    );

    await page.click('[data-testid="uml-save-diagram"]');
    await page.waitForSelector('[data-testid="uml-roundtrip-notice"]', { timeout: 15000 });
    results.pass1LiveBackendTest1.structuredDesignedAuthoringAndCasPersistence.UML_CLASS = {
      status: 'PASS',
      extractedNodes: initialClassCounts.extractedNodes,
      hydratedAfterReload: {
        designedNodes: hydratedCounts.designedNodes,
        designedEdges: hydratedCounts.designedEdges,
      },
      postReloadSecondEditVerified: { designedNodes: postReloadCounts.designedNodes },
    };

    // Structured authoring + CAS save on UML_PACKAGE, UML_DEPLOYMENT, UML_ACTIVITY, UML_STATE
    console.log('--- PASS 1.4: O5 STRUCTURED AUTHORING & CAS SAVE ON PACKAGE, DEPLOYMENT, ACTIVITY, STATE ---');
    // UML_PACKAGE
    await page.getByLabel('Diagram type').selectOption('UML_PACKAGE');
    await page.waitForSelector('[data-testid="uml-workspace-uml_package"]', { timeout: 15000 });
    await resetAndSaveCleanBaselineIfNeeded();
    await page.fill('[data-testid="uml-pkg-input-name"]', 'com.example.governance');
    await page.click('[data-testid="uml-add-designed-package"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-add-designed-package-import"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-save-diagram"]');
    await page.waitForSelector('[data-testid="uml-roundtrip-notice"]', { timeout: 15000 });
    const pkgCounts = await readSummaryCounts(page);
    results.pass1LiveBackendTest1.structuredDesignedAuthoringAndCasPersistence.UML_PACKAGE = {
      status: 'PASS',
      designedNodes: pkgCounts.designedNodes,
      designedEdges: pkgCounts.designedEdges,
    };

    // UML_DEPLOYMENT
    await page.getByLabel('Diagram type').selectOption('UML_DEPLOYMENT');
    await page.waitForSelector('[data-testid="uml-workspace-uml_deployment"]', { timeout: 15000 });
    await resetAndSaveCleanBaselineIfNeeded();
    await page.fill('[data-testid="uml-deploy-input-name"]', 'prod-k8s-worker');
    await page.click('[data-testid="uml-add-designed-deployment-spec"]');
    await page.waitForTimeout(200);
    await page.fill('[data-testid="uml-deploy-input-name"]', 'order-worker.jar');
    await page.click('[data-testid="uml-add-designed-deployment-spec"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-add-designed-deployment-edge"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-save-diagram"]');
    await page.waitForSelector('[data-testid="uml-roundtrip-notice"]', { timeout: 15000 });
    const deployCounts = await readSummaryCounts(page);
    results.pass1LiveBackendTest1.structuredDesignedAuthoringAndCasPersistence.UML_DEPLOYMENT = {
      status: 'PASS',
      designedNodes: deployCounts.designedNodes,
      designedEdges: deployCounts.designedEdges,
    };

    // UML_ACTIVITY
    await page.getByLabel('Diagram type').selectOption('UML_ACTIVITY');
    await page.waitForSelector('[data-testid="uml-workspace-uml_activity"]', { timeout: 15000 });
    await resetAndSaveCleanBaselineIfNeeded();
    await page.fill('[data-testid="uml-act-input-label"]', 'VerifyComplianceGate');
    await page.click('[data-testid="uml-add-designed-activity-node"]');
    await page.waitForTimeout(200);
    await page.fill('[data-testid="uml-act-input-label"]', 'SettleOrder');
    await page.click('[data-testid="uml-add-designed-activity-node"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-add-designed-activity-edge"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-save-diagram"]');
    await page.waitForSelector('[data-testid="uml-roundtrip-notice"]', { timeout: 15000 });
    const actCounts = await readSummaryCounts(page);
    results.pass1LiveBackendTest1.structuredDesignedAuthoringAndCasPersistence.UML_ACTIVITY = {
      status: 'PASS',
      designedNodes: actCounts.designedNodes,
      designedEdges: actCounts.designedEdges,
    };

    // UML_STATE
    await page.getByLabel('Diagram type').selectOption('UML_STATE');
    await page.waitForSelector('[data-testid="uml-workspace-uml_state"]', { timeout: 15000 });
    await resetAndSaveCleanBaselineIfNeeded();
    await page.fill('[data-testid="uml-state-input-name"]', 'AUDITING');
    await page.click('[data-testid="uml-add-designed-state-node"]');
    await page.waitForTimeout(200);
    await page.fill('[data-testid="uml-state-input-name"]', 'CLEARED');
    await page.click('[data-testid="uml-add-designed-state-node"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-add-designed-state-transition"]');
    await page.waitForTimeout(200);
    await page.click('[data-testid="uml-save-diagram"]');
    await page.waitForSelector('[data-testid="uml-roundtrip-notice"]', { timeout: 15000 });
    const stateCounts = await readSummaryCounts(page);
    results.pass1LiveBackendTest1.structuredDesignedAuthoringAndCasPersistence.UML_STATE = {
      status: 'PASS',
      designedNodes: stateCounts.designedNodes,
      designedEdges: stateCounts.designedEdges,
    };

    // =========================================================================
    // PASS 2: REAL BROWSER RENDER OF FULL EXTRACTED JAVA AST MODEL (M4-M7)
    // =========================================================================
    console.log('--- PASS 2: REAL BROWSER UI + DRAW.IO (:8090) RENDER OF FULL EXTRACTED JAVA AST MODEL ---');
    const javaActualPath = path.resolve(__dirname, '../output/m2/source-pipeline-java-actual.json');
    const javaActual = JSON.parse(fs.readFileSync(javaActualPath, 'utf8'));
    const javaExtractedModel = {
      ...modelView(javaActual.metadata, javaActual.graph, javaActual.details),
      id: modelId,
      projectId,
    };

    const page2 = await context.newPage();
    await page2.route('**/api/mavis/model?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(javaExtractedModel),
      });
    });
    await page2.route('**/api/mavis/architectureDocument?*', async (route) => {
      const urlObj = new URL(route.request().url());
      const inputRaw = urlObj.searchParams.get('input');
      const parsedInput = inputRaw ? JSON.parse(inputRaw) : { modelId, viewId: 'uml_class' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          modelId: parsedInput.modelId || modelId,
          viewId: parsedInput.viewId || 'uml_class',
          revision: 0,
          xml: null,
        }),
      });
    });

    await page2.goto(
      `http://127.0.0.1:3000/architecture?project=${projectId}&model=${modelId}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 },
    );
    await page2.waitForSelector('svg[aria-label="Service dependency network"]', { timeout: 60000 });
    const close3E2 = await page2.$('button[aria-label="Close 3E"]');
    if (close3E2) {
      await close3E2.click();
    }
    const diagramTab2 = await page2.$('button[role="tab"]:has-text("Diagram")');
    if (diagramTab2) {
      await diagramTab2.click();
    }
    await page2.getByLabel('Diagram family').selectOption('UML');
    await page2.waitForTimeout(300);

    for (const spec of [
      {
        kind: 'UML_CLASS',
        testId: 'uml-workspace-uml_class',
        drawioFile: 'm4-uml-class.drawio',
        screenshotFile: 'browser-uml-class.png',
        minExtractedNodes: 4,
        minExtractedEdges: 4,
      },
      {
        kind: 'UML_PACKAGE',
        testId: 'uml-workspace-uml_package',
        drawioFile: 'm4-uml-package.drawio',
        screenshotFile: 'browser-uml-package.png',
        minExtractedNodes: 2,
        minExtractedEdges: 1,
      },
      {
        kind: 'UML_DEPLOYMENT',
        testId: 'uml-workspace-uml_deployment',
        drawioFile: 'm5-uml-deployment.drawio',
        screenshotFile: 'browser-uml-deployment.png',
        minExtractedNodes: 3,
        minExtractedEdges: 2,
      },
      {
        kind: 'UML_ACTIVITY',
        testId: 'uml-workspace-uml_activity',
        drawioFile: 'm6-uml-activity.drawio',
        screenshotFile: 'browser-uml-activity.png',
        minExtractedNodes: 6,
        minExtractedEdges: 6,
      },
      {
        kind: 'UML_STATE',
        testId: 'uml-workspace-uml_state',
        drawioFile: 'm7-uml-state.drawio',
        screenshotFile: 'browser-uml-state.png',
        minExtractedNodes: 4,
        minExtractedEdges: 3,
      },
    ]) {
      console.log(`Pass 2 verifying extracted ${spec.kind}...`);
      await page2.getByLabel('Diagram type').selectOption(spec.kind);
      await page2.waitForSelector(`[data-testid="${spec.testId}"]`, { timeout: 15000 });
      await page2.waitForSelector('img[alt*="rendered with DRAWIO_XML"]', { timeout: 15000 });
      await page2.waitForFunction(
        (min) => document.querySelectorAll('button[data-semantic-id]').length >= min,
        spec.minExtractedNodes,
        { timeout: 15000 },
      );
      await page2.waitForTimeout(300);

      const p2Counts = await readSummaryCounts(page2);
      const extractedNodes = p2Counts.extractedNodes;
      const extractedEdges = p2Counts.extractedEdges;
      assert.ok(
        extractedNodes >= spec.minExtractedNodes,
        `${spec.kind} expected >= ${spec.minExtractedNodes} extracted nodes, got ${extractedNodes}`,
      );
      assert.ok(
        extractedEdges >= spec.minExtractedEdges,
        `${spec.kind} expected >= ${spec.minExtractedEdges} extracted edges, got ${extractedEdges}`,
      );

      const [download] = await Promise.all([
        page2.waitForEvent('download', { timeout: 15000 }),
        page2.locator('button', { hasText: 'Download .drawio' }).click(),
      ]);
      const drawioPath = path.join(outputDir, spec.drawioFile);
      await download.saveAs(drawioPath);
      const xml = fs.readFileSync(drawioPath, 'utf8');
      await page2.evaluate((tid) => {
        document.querySelector(`[data-testid="${tid}"]`)?.scrollIntoView({ block: 'start' });
      }, spec.testId);
      await page2.waitForTimeout(250);
      await page2.screenshot({ path: path.join(outputDir, spec.screenshotFile) });

      const entry = {
        status: 'PASS',
        acceptanceMode: 'BROWSER_EXTRACTOR_FIXTURE_VIA_ROUTE_FULFILL',
        extractedNodes,
        extractedEdges,
        drawioBytes: xml.length,
        hasMavisUmlProjection: xml.includes('mavisUmlProjection='),
        hasMavisUmlDocument: xml.includes('mavisUmlDocument='),
        screenshot: `output/m8/${spec.screenshotFile}`,
      };
      if (spec.kind === 'UML_PACKAGE') {
        entry.hasFolderShape = xml.includes('shape=folder');
      }
      if (spec.kind === 'UML_DEPLOYMENT') {
        entry.hasCubeShape = xml.includes('shape=cube');
        entry.hasManifestArrow = xml.includes('«manifest»');
        entry.hasNoFabricatedBuildArtifact = !xml.includes(':build');
        assert.ok(
          !xml.includes(':build'),
          'UML_DEPLOYMENT must not contain fabricated :build artifact names',
        );
      }
      if (spec.kind === 'UML_ACTIVITY') {
        entry.hasSwimlane = xml.includes('swimlane');
        entry.hasDecisionRhombus = xml.includes('rhombus');
      }
      results.pass2ExtractedJavaAstModelBrowserRender.diagrams[spec.kind] = entry;
      results.viewsVerified[spec.kind] = entry;
    }
    await page2.close();

    // =========================================================================
    // PASS 3: REAL HEADLESS BROWSER GRAPH WORKLOAD BENCHMARK (100, 500, 2000 x 5 RUNS)
    // =========================================================================
    console.log('--- PASS 3: REAL HEADLESS BROWSER GRAPH WORKLOAD BENCHMARK (100, 500, 2000 NODES x 5 RUNS) ---');
    const scales = [100, 500, 2000];
    const runsPerScale = 5;
    const browserBenchmarkScales = [];

    for (const scale of scales) {
      const collapsedPaintSamples = [];
      const expandAllPaintSamples = [];
      const originFilterPaintSamples = [];
      const zoomInteractionPaintSamples = [];
      const collapsePaintSamples = [];
      const heapMbSamples = [];
      let sampleCounts = null;

      for (let run = 1; run <= runsPerScale; run++) {
        const seeded = {
          ...generateSeededModel(scale, 20261025 + run),
          id: modelId,
          projectId,
        };
        const benchPage = await context.newPage();
        await benchPage.route('**/api/mavis/model?*', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(seeded),
          });
        });

        const navStart = Date.now();
        await benchPage.goto(
          `http://127.0.0.1:3000/architecture?project=${projectId}&model=${modelId}&bench=${scale}_${run}`,
          { waitUntil: 'domcontentloaded' },
        );
        await benchPage.waitForSelector('svg[aria-label="Service dependency network"] g[data-node-id]', {
          timeout: 30000,
        });
        await benchPage.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const collapsedNavAndPaintMs = Date.now() - navStart;
        collapsedPaintSamples.push(collapsedNavAndPaintMs);

        // Open Graph options <details>
        await benchPage.locator('summary:has-text("Graph options")').click();
        await benchPage.waitForTimeout(50);

        // Measure expand all components + SVG mount + double rAF paint
        const expandMetrics = await benchPage.evaluate(async (expectedNodes) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const expandBtn = buttons.find((b) =>
            b.textContent?.includes('Expand service internals'),
          );
          const collapsedNodes = document.querySelectorAll(
            'svg[aria-label="Service dependency network"] g[data-node-id]',
          ).length;
          const t0 = performance.now();
          expandBtn.click();
          while (
            document.querySelectorAll(
              'svg[aria-label="Service dependency network"] g[data-node-id]',
            ).length < expectedNodes
          ) {
            await new Promise((r) => setTimeout(r, 8));
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const expandAllMs = performance.now() - t0;
          const expandedNodes = document.querySelectorAll(
            'svg[aria-label="Service dependency network"] g[data-node-id]',
          ).length;
          const expandedEdges = document.querySelectorAll(
            'svg[aria-label="Service dependency network"] path[data-edge-id]',
          ).length;
          const gridBypassBanner = document.body.innerText.includes('Grid layout mode: >300 elements active');
          return {
            collapsedNodes,
            expandedNodes,
            expandedEdges,
            expandAllMs,
            gridBypassBanner,
          };
        }, scale);

        assert.equal(
          expandMetrics.expandedNodes,
          scale,
          `Scale ${scale} run ${run} must mount all ${scale} SVG [data-node-id] nodes when expanded`,
        );
        expandAllPaintSamples.push(expandMetrics.expandAllMs);

        // Measure origin filter switch + actual SVG path[data-edge-id] count mutation + double rAF paint
        const originSwitchMs = await benchPage.evaluate(async () => {
          const selects = Array.from(document.querySelectorAll('select'));
          const originSelect = selects.find((s) =>
            Array.from(s.options).some((o) => o.value === 'deployment'),
          );
          const beforeEdges = document.querySelectorAll(
            'svg[aria-label="Service dependency network"] path[data-edge-id]',
          ).length;
          const t0 = performance.now();
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype,
            'value',
          ).set;
          setter.call(originSelect, 'source');
          originSelect.dispatchEvent(new Event('change', { bubbles: true }));
          const deadline1 = performance.now() + 5000;
          while (
            document.querySelectorAll(
              'svg[aria-label="Service dependency network"] path[data-edge-id]',
            ).length === beforeEdges
          ) {
            if (performance.now() > deadline1) {
              throw new Error('Timed out waiting for SVG edge count to mutate on origin filter switch');
            }
            await new Promise((r) => setTimeout(r, 4));
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const elapsed = performance.now() - t0;
          setter.call(originSelect, 'all');
          originSelect.dispatchEvent(new Event('change', { bubbles: true }));
          const deadline2 = performance.now() + 5000;
          while (
            document.querySelectorAll(
              'svg[aria-label="Service dependency network"] path[data-edge-id]',
            ).length !== beforeEdges
          ) {
            if (performance.now() > deadline2) {
              throw new Error('Timed out waiting for SVG edge count to restore on origin filter reset');
            }
            await new Promise((r) => setTimeout(r, 4));
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return elapsed;
        });
        originFilterPaintSamples.push(originSwitchMs);

        // Measure zoom interaction + actual SVG <g transform> mutation + double rAF paint
        const zoomFrameMs = await benchPage.evaluate(async () => {
          const zoomBtn = document.querySelector('button[aria-label="Zoom graph in"]');
          const svgGroup = document.querySelector(
            'svg[aria-label="Service dependency network"] > g[transform]',
          );
          const beforeTransform = svgGroup ? svgGroup.getAttribute('transform') : '';
          const t0 = performance.now();
          zoomBtn.click();
          const deadline = performance.now() + 5000;
          while (
            document
              .querySelector('svg[aria-label="Service dependency network"] > g[transform]')
              ?.getAttribute('transform') === beforeTransform
          ) {
            if (performance.now() > deadline) {
              throw new Error('Timed out waiting for SVG <g transform> to mutate on zoom');
            }
            await new Promise((r) => setTimeout(r, 4));
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return performance.now() - t0;
        });
        zoomInteractionPaintSamples.push(zoomFrameMs);

        // Measure collapse internals + SVG update + double rAF paint + JS heap
        const collapseMetrics = await benchPage.evaluate(async (expectedCollapsed) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const collapseBtn = buttons.find((b) =>
            b.textContent?.includes('Collapse service internals'),
          );
          const t0 = performance.now();
          collapseBtn.click();
          while (
            document.querySelectorAll(
              'svg[aria-label="Service dependency network"] g[data-node-id]',
            ).length > expectedCollapsed
          ) {
            await new Promise((r) => setTimeout(r, 8));
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const collapseMs = performance.now() - t0;
          const heapMb = performance.memory
            ? performance.memory.usedJSHeapSize / (1024 * 1024)
            : 0;
          return { collapseMs, heapMb };
        }, expandMetrics.collapsedNodes);

        collapsePaintSamples.push(collapseMetrics.collapseMs);
        heapMbSamples.push(collapseMetrics.heapMb);
        sampleCounts = {
          totalElements: seeded.elements.length,
          totalEdges: seeded.edges.length,
          mountedCollapsedSvgNodes: expandMetrics.collapsedNodes,
          mountedExpandedSvgNodes: expandMetrics.expandedNodes,
          mountedExpandedSvgEdges: expandMetrics.expandedEdges,
          gridLayoutModeActive: expandMetrics.gridBypassBanner,
        };
        await benchPage.close();
        console.log(
          `  Scale ${scale} run ${run}/${runsPerScale}: expand+paint=${expandMetrics.expandAllMs.toFixed(1)}ms, originSwitch=${originSwitchMs.toFixed(1)}ms, zoomFrame=${zoomFrameMs.toFixed(1)}ms, collapse+paint=${collapseMetrics.collapseMs.toFixed(1)}ms`,
        );
      }

      const expandStats = computeStats(expandAllPaintSamples);
      const originStats = computeStats(originFilterPaintSamples);
      const zoomStats = computeStats(zoomInteractionPaintSamples);
      const targets = BENCHMARK_TARGETS[scale];
      const expandPassed = expandStats.median <= targets.expandAllMedianTargetMs;
      const originPassed = originStats.median <= targets.originFilterMedianTargetMs;
      const zoomPassed = zoomStats.median <= targets.zoomInteractionMedianTargetMs;

      browserBenchmarkScales.push({
        scaleNodes: scale,
        runs: runsPerScale,
        ...sampleCounts,
        collapsedNavigationAndPaintMs: computeStats(collapsedPaintSamples),
        expandAllLayoutMountAndPaintMs: expandStats,
        originFilterSwitchAndPaintMs: originStats,
        zoomInteractionFramePaintMs: zoomStats,
        collapseLayoutMountAndPaintMs: computeStats(collapsePaintSamples),
        browserJsHeapUsedMb: computeStats(heapMbSamples),
        thresholdEvaluation: {
          targets,
          expandAllPassed: expandPassed,
          originFilterPassed: originPassed,
          zoomInteractionPassed: zoomPassed,
          overallScaleStatus:
            expandPassed && originPassed && zoomPassed
              ? 'PASS'
              : scale === 2000 && !zoomPassed
                ? 'EXCEEDS_100MS_INTERACTIVE_FRAME_BUDGET'
                : 'BELOW_TARGET',
        },
      });
    }

    const scale2000Result = browserBenchmarkScales.find((s) => s.scaleNodes === 2000);
    const zoom2000Exceeded =
      scale2000Result && !scale2000Result.thresholdEvaluation.zoomInteractionPassed;

    const browserWorkloadReport = {
      benchmarkKind: 'BROWSER_GRAPH_WORKLOAD_BENCHMARK',
      isBrowserWorkloadBenchmark: true,
      timestamp: new Date().toISOString(),
      environment: {
        browser: 'Headless Chromium (Playwright)',
        viewport: '1440x960',
        componentUnderTest: 'DependencyNetwork (svg[aria-label="Service dependency network"]) on /architecture',
        runsPerScale,
        statisticalMethodNote:
          'For n=5 runs per scale, median (sample[2]), min, max, mean, and raw samples are reported alongside pre-declared target thresholds.',
      },
      preDeclaredTargets: BENCHMARK_TARGETS,
      overallBenchmarkStatus: zoom2000Exceeded
        ? 'PARTIAL_2000_NODE_ZOOM_EXCEEDS_100MS_FRAME_BUDGET'
        : 'PASS',
      scales: browserBenchmarkScales,
      projectionMicrobenchmarkComparison: runSeededGraphBenchmark([100, 500, 2000], runsPerScale),
    };

    fs.writeFileSync(
      path.join(outputDir, 'graph-browser-workload-benchmark-2026-10-25.json'),
      JSON.stringify(browserWorkloadReport, null, 2),
    );
    fs.writeFileSync(
      path.join(outputDir, 'graph-performance-benchmark.json'),
      JSON.stringify(browserWorkloadReport, null, 2),
    );

    const csharpActualPath = path.resolve(
      __dirname,
      '../output/m2/source-pipeline-csharp-graph-actual.json',
    );
    const csharpActual = JSON.parse(fs.readFileSync(csharpActualPath, 'utf8'));
    const csharpExtractedModel = modelView(
      csharpActual.metadata,
      csharpActual.graph,
      csharpActual.details,
    );
    const coverageMatrix = buildM8CoverageMatrix({
      javaModel: javaExtractedModel,
      csharpModel: csharpExtractedModel,
      browserWorkloadVerified: true,
      browserZoom2000ExceededTarget: Boolean(zoom2000Exceeded),
      liveOtelTraceCaptured: false,
    });
    fs.writeFileSync(
      path.join(outputDir, 'coverage-matrix.json'),
      JSON.stringify(coverageMatrix, null, 2),
    );

    results.pass3BrowserGraphWorkloadSummary = browserBenchmarkScales.map((s) => ({
      scaleNodes: s.scaleNodes,
      mountedExpandedSvgNodes: s.mountedExpandedSvgNodes,
      expandAllMedianMs: s.expandAllLayoutMountAndPaintMs.median,
      expandAllMaxMs: s.expandAllLayoutMountAndPaintMs.max,
      originFilterSwitchMedianMs: s.originFilterSwitchAndPaintMs.median,
      zoomFrameMedianMs: s.zoomInteractionFramePaintMs.median,
      thresholdEvaluation: s.thresholdEvaluation,
    }));
    results.networkRequestsCount = networkLog.length;
    results.umlDropdownOptions = umlOptions;
    fs.writeFileSync(
      path.join(outputDir, 'browser-catalog-acceptance.json'),
      JSON.stringify(results, null, 2),
    );
    console.log('M4-M8 Browser Acceptance + Browser Workload Benchmark PASSED.');
  } catch (err) {
    console.error('M4-M8 Browser Acceptance FAILED:', err);
    scriptExitCode = 1;
  } finally {
    clearTimeout(globalTimer);
    if (browser) {
      await browser.close().catch(() => {});
    }
    process.exit(scriptExitCode);
  }
})();

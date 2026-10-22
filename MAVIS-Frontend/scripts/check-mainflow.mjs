import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const temp = mkdtempSync(join(tmpdir(), "mavis-mainflow-"));
try {
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "src/lib/mainflow-api.ts",
      "--outDir",
      temp,
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--skipLibCheck",
    ],
    { stdio: "inherit" },
  );
  const {
    api,
    ApiError,
    terminalJob,
    publishedModel,
    contextHref,
    isImpactService,
    validateJobScope,
    githubImportRequest,
  } = createRequire(import.meta.url)(join(temp, "mainflow-api.js"));
  assert.equal(isImpactService({ type: "SERVICE_CONTAINER" }), true);
  assert.equal(isImpactService({ type: "COMPONENT" }), false);
  assert.throws(
    () =>
      validateJobScope({ projectId: "other", sourceSnapshotId: "snapshot" }, "project", "snapshot"),
    /different project/,
  );
  assert.throws(
    () =>
      validateJobScope({ projectId: "project", sourceSnapshotId: "other" }, "project", "snapshot"),
    /different project/,
  );
  assert.deepEqual(
    githubImportRequest(
      "p",
      " https://github.com/spring-petclinic/spring-petclinic-microservices.git/ ",
      "main",
      "",
    ),
    {
      projectId: "p",
      repositoryUrl: "https://github.com/spring-petclinic/spring-petclinic-microservices",
      branchName: "main",
    },
  );
  for (const url of [
    "http://github.com/a/b",
    "https://github.com.evil.invalid/a/b",
    "https://user:token@github.com/a/b",
    "https://github.com/a/b/tree/main",
    "https://127.0.0.1/a/b",
    "https://github.com/a/b?token=secret",
  ])
    assert.throws(() => githubImportRequest("p", url, "main", ""));
  assert.throws(() => githubImportRequest("p", "https://github.com/a/b", "main?download=1", ""));
  assert.throws(() => githubImportRequest("p", "https://github.com/a/b", "main", "invalid"));
  assert.equal(
    githubImportRequest("p", "https://github.com/a/b", "feature/demo", "a".repeat(40)).commitSha,
    "a".repeat(40),
  );
  let calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ data: { jobId: "job" } }, { status: 202 });
  };
  assert.deepEqual(
    await api("analyzer/snapshots/snapshot/analyze", {
      method: "POST",
      headers: { "Idempotency-Key": "stable-key" },
    }),
    { jobId: "job" },
  );
  assert.equal(calls[0].init.headers.get("Idempotency-Key"), "stable-key");
  assert.equal(calls[0].init.credentials, "same-origin");
  const form = new FormData();
  form.append("file", new Blob(["zip"]), "source.zip");
  await api("analyzer/upload?projectId=project", { method: "POST", body: form });
  assert.equal(
    calls[1].init.headers.has("Content-Type"),
    false,
    "Browser must set multipart boundary",
  );
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    return Response.json({ message: "denied" }, { status: 403 });
  };
  await assert.rejects(
    api("projects", { method: "POST", body: "{}" }),
    (error) => error instanceof ApiError && error.status === 403 && error.message === "denied",
  );
  assert.equal(attempts, 1, "Mutations must not be retried implicitly");
  assert.equal(terminalJob({ status: "CANCELLING" }), false);
  for (const status of ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"])
    assert.equal(terminalJob({ status }), true);
  assert.equal(publishedModel({ status: "RUNNING" }), undefined);
  assert.equal(
    publishedModel({ status: "COMPLETED", resultManifest: { modelVersionId: "published" } }),
    "published",
  );
  assert.equal(
    publishedModel({ status: "FAILED", resultManifest: { otherModel: "wrong" } }),
    undefined,
  );
  assert.equal(publishedModel({ status: "FAILED", modelVersionId: "stale-model" }), undefined);
  const url = new URL(
    contextHref("/explain", "project", "model", { target: "node", kind: "element" }),
    "http://local",
  );
  assert.equal(url.searchParams.get("model"), "model");
  assert.equal(url.searchParams.get("target"), "node");
  console.log(
    "Mainflow contract checks passed: envelopes, multipart, idempotency, errors/no retry, job states, published model and versioned navigation.",
  );
} finally {
  assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
  assert.ok(basename(temp).startsWith("mavis-mainflow-"));
  rmSync(temp, { recursive: true, force: true });
}

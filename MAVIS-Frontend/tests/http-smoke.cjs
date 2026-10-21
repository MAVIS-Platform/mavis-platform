const assert = require("node:assert/strict");
const base = process.argv[2] ?? "http://127.0.0.1:3092";
const mode = process.argv[3] ?? "mock";
async function main() {
  const routes = [
    "/",
    "/architecture",
    "/impact",
    "/explain",
    "/import",
    "/design-system",
    "/login",
    "/profile",
    "/project-overview",
    "/snapshots",
    "/analysis-history",
    "/model",
    "/diagrams",
    "/compare",
    "/runtime-config",
    "/scenarios",
    "/sessions",
    "/workspaces",
    "/workspace-overview",
    "/members",
    "/assignments",
    "/references",
    "/submissions",
    "/submissions/submission-example",
    ...[
      "users",
      "integrations",
      "health",
      "jobs",
      "usage",
      "runtime-summary",
      "audit",
      "profiles",
      "admin-sessions",
    ].map((name) => `/administration/${name}`),
  ];
  for (const route of routes) {
    const response = await fetch(new URL(route, base));
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.ok(!html.includes("Internal Server Error"), route);
  }
  for (const route of ["/unknown-screen", "/administration/unknown-screen"])
    assert.equal((await fetch(new URL(route, base))).status, 404, route);
  const login = await (await fetch(new URL("/login", base))).text();
  assert.ok(
    login.includes(
      mode === "mock"
        ? "Choose a sample account"
        : "Backend mode requires a server-managed session",
    ),
  );
  const design = await (await fetch(new URL("/design-system", base))).text();
  assert.ok(design.includes("All content is illustrative"));
  assert.equal((await fetch(new URL("/api/mavis/projects", base))).status, 501);
  assert.equal((await fetch(new URL("/api/mavis/mockLogin", base))).status, 501);
  console.log(
    `${routes.length} rendered routes, 2 missing routes, mode disclosure and unconfigured API isolation passed (${mode}). Browser hydration is not covered.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

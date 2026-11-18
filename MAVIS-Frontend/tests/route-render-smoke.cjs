const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const base = process.argv[2] || "http://127.0.0.1:3092";

function screenNames(relative) {
  const source = ts.createSourceFile(relative, fs.readFileSync(path.join(root, relative), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let names = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "screens" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      names = node.initializer.properties.filter(ts.isPropertyAssignment).map(property => property.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!names.length) throw Error("Route registry not found: " + relative);
  return names;
}
const routes = [...new Set([
  "/", "/home", "/all-courses", "/architecture", "/impact", "/explain", "/import", "/design-system", "/login", "/profile", "/notifications",
  ...screenNames("app/[screen]/page.tsx").map(name => "/" + name),
  ...screenNames("app/administration/[screen]/page.tsx").map(name => "/administration/" + name),
  ...["register", "verify", "forgot-password", "reset-password"].map(name => "/auth/" + name),
  "/submissions/11111111-1111-4111-8111-111111111111",
])];

async function main() {
  const results = [];
  for (const route of routes) {
    const started = performance.now();
    try {
      const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(30000), redirect: "follow" });
      const html = await response.text();
      // Next can stream an RSC error after the response headers have already said 200.
      let decoded = html;
      for (let layer = 0; layer < 5; layer++) decoded = decoded.replaceAll(String.fromCharCode(92, 34), String.fromCharCode(34));
      const errorChunk = /[0-9a-f]+:E\{[^}]*"digest"[^}]*\}/i.exec(decoded)?.[0];
      const boundary = /This page could not be displayed|Internal Server Error/.test(html);
      const publiclyRendered = route !== "/" || html.includes('id="home-title"');
      const ok = response.status === 200 && !errorChunk && !boundary && publiclyRendered;
      results.push({ route, status: response.status, ok, durationMs: Math.round(performance.now() - started), errorChunk: errorChunk || null });
    } catch (error) {
      results.push({ route, ok: false, error: error.message });
    }
  }
  for (const result of results) console.log(JSON.stringify(result));
  const failures = results.filter(result => !result.ok);
  if (process.env.MAVIS_ROUTE_REPORT) fs.writeFileSync(process.env.MAVIS_ROUTE_REPORT, JSON.stringify({ base, checkedAt: new Date().toISOString(), results }, null, 2));
  console.log(results.length + " routes checked; " + failures.length + " server-render failure(s). Authentication, permissions and browser hydration require separate tests.");
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

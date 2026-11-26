const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(
    output.replace(
      /require\(["']@\/([^"']+)["']\)/g,
      (_, name) => `require(${JSON.stringify(path.join(root, "src", name))})`,
    ),
    filename,
  );
};
const { NextRequest } = require("next/server");

const authConfigRoute = require("../app/api/auth-config/route.ts");
const githubStartRoute = require("../app/api/auth/github/start/route.ts");
const githubCallbackRoute = require("../app/api/auth/github/callback/route.ts");

function withEnv(t, overrides) {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test("auth-config exposes both googleClientId and githubClientId without caching", async (t) => {
  withEnv(t, {
    MAVIS_GOOGLE_CLIENT_ID: "google-cid-123",
    MAVIS_GITHUB_CLIENT_ID: "github-cid-456",
  });
  const res = authConfigRoute.GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), {
    googleClientId: "google-cid-123",
    githubClientId: "github-cid-456",
  });
});

test("GitHub OAuth start sets HttpOnly CSRF state cookie and redirects to GitHub", (t) => {
  withEnv(t, {
    MAVIS_GITHUB_CLIENT_ID: "gh-client-1",
    MAVIS_PUBLIC_URL: undefined,
  });
  const req = new NextRequest("http://localhost:3000/api/auth/github/start?next=%2Fworkspaces");
  const res = githubStartRoute.GET(req);
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get("location"));
  assert.equal(location.origin, "https://github.com");
  assert.equal(location.pathname, "/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "gh-client-1");
  assert.equal(
    location.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/auth/github/callback",
  );
  assert.equal(location.searchParams.get("scope"), "read:user user:email");
  const state = location.searchParams.get("state");
  assert.ok(state && state.length >= 20);
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /mavis_oauth_state=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
});

test("GitHub OAuth start redirects with AUTH_OAUTH_UNCONFIGURED when client ID is missing", (t) => {
  withEnv(t, { MAVIS_GITHUB_CLIENT_ID: "" });
  const req = new NextRequest("http://localhost:3000/api/auth/github/start");
  const res = githubStartRoute.GET(req);
  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get("location"),
    "http://localhost:3000/login?oauthError=AUTH_OAUTH_UNCONFIGURED",
  );
});

test("GitHub OAuth callback rejects mismatched CSRF state and clears state cookie", async (t) => {
  withEnv(t, { MAVIS_API_MODE: "backend", MAVIS_JAVA_URL: "https://java.invalid" });
  const req = new NextRequest(
    "http://localhost:3000/api/auth/github/callback?code=abc&state=wrong-state",
    {
      headers: {
        cookie: `mavis_oauth_state=${encodeURIComponent(JSON.stringify({ state: "expected-state", next: null }))}`,
      },
    },
  );
  const res = await githubCallbackRoute.GET(req);
  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get("location"),
    "http://localhost:3000/login?oauthError=AUTH_OAUTH_FAILED",
  );
});

test("GitHub OAuth callback exchanges code with Java, sets HttpOnly cookies, and redirects to safe next", async (t) => {
  withEnv(t, { MAVIS_API_MODE: "backend", MAVIS_JAVA_URL: "https://java.invalid" });
  const userId = "11111111-1111-4111-8111-111111111111";
  let captured;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return Response.json({
      code: 200,
      data: {
        token: "jwt-github-secret",
        refreshToken: "refresh-token-12345678901234567890",
        userId,
        fullName: "Octo Dev",
        role: "STUDENT",
        email: "octo@example.com",
      },
    });
  });

  const statePayload = JSON.stringify({ state: "valid-csrf-state-12345", next: "/home" });
  const req = new NextRequest(
    "http://localhost:3000/api/auth/github/callback?code=gh-auth-code&state=valid-csrf-state-12345",
    {
      headers: {
        cookie: `mavis_oauth_state=${encodeURIComponent(statePayload)}`,
      },
    },
  );
  const res = await githubCallbackRoute.GET(req);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "http://localhost:3000/home");
  assert.equal(captured.url, "https://java.invalid/api/v1/auth/github");
  assert.deepEqual(captured.body, {
    code: "gh-auth-code",
    redirectUri: "http://localhost:3000/api/auth/github/callback",
  });
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie().join("; ") : res.headers.get("set-cookie");
  assert.match(cookies, /mavis_session=jwt-github-secret/);
  assert.match(cookies, /mavis_refresh=refresh-token-12345678901234567890/);
  assert.match(cookies, /HttpOnly/i);
});

test("GitHub OAuth callback maps backend LOGIN_LOCKED and provider cancellation to login error banner", async (t) => {
  withEnv(t, { MAVIS_API_MODE: "backend", MAVIS_JAVA_URL: "https://java.invalid" });

  const cancelledReq = new NextRequest(
    "http://localhost:3000/api/auth/github/callback?error=access_denied",
  );
  const cancelledRes = await githubCallbackRoute.GET(cancelledReq);
  assert.equal(cancelledRes.status, 302);
  assert.equal(
    cancelledRes.headers.get("location"),
    "http://localhost:3000/login?oauthError=AUTH_OAUTH_CANCELLED",
  );

  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ code: 403, errorCode: "LOGIN_LOCKED", message: "Locked" }, { status: 403 }),
  );
  const statePayload = JSON.stringify({ state: "csrf-2", next: null });
  const lockedReq = new NextRequest(
    "http://localhost:3000/api/auth/github/callback?code=gh-code&state=csrf-2",
    {
      headers: { cookie: `mavis_oauth_state=${encodeURIComponent(statePayload)}` },
    },
  );
  const lockedRes = await githubCallbackRoute.GET(lockedReq);
  assert.equal(lockedRes.status, 302);
  assert.equal(
    lockedRes.headers.get("location"),
    "http://localhost:3000/login?oauthError=LOGIN_LOCKED",
  );
});

test("SocialSignIn uses singleton GSI script, validates google.accounts.id methods, and isolates DOM translation", () => {
  const src = fs.readFileSync(path.join(root, "src/features/auth/social-sign-in.tsx"), "utf8");
  assert.match(src, /script#mavis-google-gsi/);
  assert.match(src, /typeof api\.initialize === "function" && typeof api\.renderButton === "function"/);
  assert.doesNotMatch(src, /script\?\.remove\(\)/, "Must not tear down global gsi/client script tag on unmount");
  assert.match(src, /data-no-translate/);
});

# FE mainflow integration

## Run

Requires Node.js 20.9+ and Java API running. From MAVIS-Frontend:

```powershell
npm ci
# Copy .env.example to .env.local and set MAVIS_JAVA_URL when Java uses another port.
npm run dev
```

Local acceptance uses http://127.0.0.1:3000, Java http://127.0.0.1:8081 and Worker http://localhost:5082. Java and Worker share immutable artifact storage and service/grant configuration. FE needs only the Java URL; it never receives database credentials, Worker keys or Runner keys.

Sign in with an active verified account. Account registration/mail delivery is outside this UI scope. Seed placeholder passwords are not usable login credentials. A dedicated cloud test account was created for acceptance; its credentials stay in the operator's local artifacts, outside Git.

## Implemented mainflow

- Login/logout via a same-origin allowlisted Next route; JWT is held in an HttpOnly SameSite cookie and stripped from login JSON. Mutations require matching Origin; session is checked against Java. Backend authorization remains authoritative.
- Minimal personal project creation/selection. Upload ZIP up to 100 MB or import a public GitHub repository by root URL, branch (default main) and optional full commit SHA; explicit analysis with a stable Idempotency-Key. Retry reuses the key; preparing a new analysis creates a new key. Job polling stops at terminal status or request error, supports retry/cancel and survives refresh through URL context.
- Graph and model detail use explicit published model ID. Project/model and job/snapshot scope checks prevent stale context mixing. UUIDs are retained. Large graph SVG shows up to 120 matching elements, with search and full element/relationship selectors.
- Node/edge evidence, grounded AI explanation and provider/fallback labels; no static fake metrics or canned answers. Impact uses SERVICE_CONTAINER IDs and displays excluded/unconfirmed-edge limitations.
- Diagram selection and MERMAID/PLANTUML/DRAWIO_XML/JSON downloads. The API returns an envelope with textual content; FE downloads that content only after matching the model ID.
- Existing AppShell/design tokens/appearance remain; live routes suppress illustrative banners and preview account menus. Design-system previews remain separate.

## Verification commands

```powershell
npm run test:mainflow
npx tsc --noEmit
npm run build
```

Lint was run on changed files: zero errors, one existing Next metadata/fast-refresh warning. The contract script checks HTTP envelopes/errors, multipart boundary handling, no automatic mutation retry, stable idempotency header, job terminal states, publication gating, scope fencing, service type and versioned links.

## Acceptance evidence — 22 October 2026

Real production FE/browser + Java + Aiven test database:

- Petclinic ZIP 1,485,489 bytes: uploaded, analysis completed with review; graph 24 elements/21 relationships. OwnerResource returned 4 source evidences. Grounded AI returned 200 with DETERMINISTIC_EVIDENCE_SYNTHESIS. Mermaid file downloaded successfully.
- eShop ZIP 14,058,380 bytes: uploaded; Java job COMPLETED, C# Worker COMPLETED, analysis COMPLETED_WITH_REVIEW; graph 697 elements. Reloaded the job URL and recovered the terminal state/model link. Static C# coverage remains PartialSyntax, not runtime proof.
- Impact request through Java/Worker returned 200. Petclinic had zero affected services under the confirmed-HTTP-edge policy; exclusions are shown, not replaced by mock results. A nonzero path was not established by this fixture.
- Browser negative/scope checks passed: job from another project blocked, a new explicit analysis got a new job, refresh during execution retained job context, cancellation reached CANCELLED with no model link, and a malformed ZIP reached FAILED with no model link. Switching eShop → Petclinic cleared model context and loaded exactly 24 Petclinic elements; the separate Explain page returned cached grounded explanation with HTTP 200.
- Browser network recovery passed using an explicit request abort: Retry status issued no analysis POST, recovered the real job, and polling stopped after terminal status. The mainflow responses themselves were not mocked.
- Proxy integration: 11/11 checks passed for unauthenticated access, login, HttpOnly cookie, omitted JWT, server-verified session, project list, callback-route exclusion, cross-origin mutation rejection and logout.
- Upload acceptance exposed Spring's default 1 MB limit. Java now configures 100 MB file/101 MB request and returns 413 for oversized input; GlobalExceptionHandler regression passed and reactor package succeeded.

Browser artifacts and credentials are local and excluded from commits. Test projects are retained for manual demos; shared seed data was not changed.

## Deferred scope

Business CRUD, workspace/member/admin/assignment/submission/feedback, evaluation/revision and runtime UI/dispatch remain outside this static-mainflow release. Runner is still an operator adapter: approval does not itself launch a workload. SMTP delivery and live AI quota are not accepted by this suite. Do not call the entire product or the expanded runtime plan complete from these checks.

## GitHub import

On Import & Analyze, choose a project, click GitHub URL, enter https://github.com/owner/repository and the actual branch name, then Import from GitHub. A 40-character commit SHA is optional and overrides the branch. Once the snapshot appears, click Analyze snapshot; job polling and graph navigation are identical to ZIP import.

The current Java importer does not accept GitHub credentials, so this UI supports public repositories. Private repositories can be uploaded as ZIP. URLs with credentials, non-GitHub hosts, /tree paths or query parameters are rejected both in the UI and in the Next proxy. No OAuth/PAT is collected by this form.

Browser acceptance passed with spring-petclinic/spring-petclinic-microservices: branch-only main import returned 200, pinned commit 1d76b00d683e86b62867a6bf59530f8ab301244f import returned 200, analysis completed with review and graph contained 24 elements. Three server-proxy negative cases (fake GitHub host, branch query injection, invalid SHA) returned 400. Build, TypeScript, contract checks and changed-file lint passed. A separate test project was used; the user's Nhut project was not imported into or modified by acceptance.

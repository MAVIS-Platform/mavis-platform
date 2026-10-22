# API integration checklist

Status: the operation contracts described in this document are provisional; no `/api/mavis` operation has been verified against a running MAVIS backend. Mock mode is the default. Backend mode never falls back to mock data. The separately integrated analysis mainflow uses `/api/backend`; see [MAINFLOW_INTEGRATION.md](../MAINFLOW_INTEGRATION.md). With `MAVIS_API_MODE=backend`, Import, Architecture, Impact and Explain use that mainflow, while other screens retain the provisional operation contracts below.

## Confirmed from repository source, not live responses

- Java `UploadController` declares `POST /api/v1/analyzer/upload`, multipart `file` plus UUID `projectId`. It returns `ApiResponse<String>` containing a server file path and emits an analysis event. This differs from the frontend's validated snapshot response and separate start-analysis flow. Do not point the frontend operation directly at it without an agreed translation and lifecycle change. Never display its server path as source evidence.
- Worker `JobsController` declares `POST /api/Jobs/submit` with `AnalysisRequest`, and `GET /api/Jobs/{jobId}`. The submission response contains jobId/message/projectId. This worker contract is not the frontend analysis-job schema. Its source location/raw findings are internal analyzer inputs, not values to fabricate in browser code.
- Worker `AnalysisController` declares `POST /api/analysis`; it is documented for Java-to-worker communication. Its `AnalysisResult` is not the architectural-model frontend contract.
- Java `SecurityConfig` currently permits all requests and disables CSRF. It does not establish a browser session or production authorization model. The frontend guard cannot compensate for that backend configuration.

## Frontend contract surface

The exact typed inputs and validated outputs live in `src/lib/api/contracts.ts` and `src/types/domain.ts`. `Request<Operation>` and `Response<Operation>` derive from those schemas; no separately duplicated DTOs are maintained.

- Authentication/profile: `session`, `signOut`. `mockLogin` exists only for sample accounts and the server proxy always rejects it. Session user data contains ID/name/role, no credentials. Profile editing is intentionally unavailable pending a contract.
- Projects/source/analysis: `projects`, `project`, `snapshots`, `importSource`, `analysisJobs`, `startAnalysis`, `analysisJob`. Upload sends the real Blob in multipart form; a mock run stores sample metadata only. Backend source validation must return valid/invalid/unsupported and evidence coverage, with stable snapshot IDs.
- Architecture: `models`, `model`, `saveModel`; model revisions include project/source IDs and evidence. Saves include the expected base revision and create a new immutable ID.
- Runtime: `runtimeConfiguration`, `saveRuntimeConfiguration`, `scenarios`, `saveScenario`, `runtimeSessions`, `runtimeSession`, `startRuntime`, `stopRuntime`. Starting requires explicit approval and exact configuration/scenario revisions. A submission must never reference a mutable current session result.
- Impact/explanations: `impact`, `explain`. Return limitations, evidence IDs and provenance. Sample explanations are marked `sample: true` and never claim an AI call.
- Education: `workspaces`, `assignments`, `referenceVersions`, `submissions`, `submission`, `submit`, `feedback`. Submitted/reference model and source payloads are frozen. Feedback must target the selected submission model. Assignment creation/publication and membership mutations need additional contracts before UI actions can be enabled.
- Administration: `accounts`, `setAccountLock`, `integrations`, `configureIntegration`, `profiles`, `configureProfile`, `audit`, `adminJobs`, `platformSummary`. Counts/health require actual telemetry; no mock health check is labeled healthy. Integration secrets are excluded from all responses.

## Backend configuration

Copy `.env.example` to a local environment file. Use `MAVIS_API_MODE=mock` for sample development. `MAVIS_MOCK_SCENARIO` supports `normal`, `empty`, `error`, `analysis-failed`, `incomplete-evidence`, `runtime-failed`, `unsupported`, `invalid-source`. These scenarios are controlled once at the adapter boundary, not in screen components.

For backend mode configure server-only `MAVIS_API_MODE=backend`, `MAVIS_BACKEND_URL`, `MAVIS_SESSION_COOKIES` and `MAVIS_API_OPERATIONS`. The latter is a JSON object mapping a frontend operation name to an explicitly agreed `{ "path": "/...", "method": "GET|POST|PUT|PATCH|DELETE" }`. No endpoint mapping is supplied as confirmed functionality. Missing operations return 501. Read operations must use upstream GET and pass typed input as query parameters; writes use the mapped method and JSON, except multipart `importSource`. Parameterized-path/wrapped-response services need explicit server translation before a mapping is usable. The current proxy deliberately does not guess those transformations.

All browser requests target the same-origin `/api/mavis/[operation]` proxy. This is a frontend-owned proxy route, not a claim about backend endpoints. Server proxy errors use status codes only; arbitrary backend error formats are not assumed. The browser normalizes 400/401/403/404/409/422/429/5xx, network, cancellation, timeout and schema failures. Writes require the request Origin to match the app origin. Only allowlisted session-cookie names are forwarded; configure same-origin cookie attributes and avoid unrelated upstream Domain values.

## Unresolved and required before live integration

- [ ] Agree a public frontend API/OpenAPI contract and translate existing Java/Worker DTOs. Confirm identifier formats (sample IDs are intentionally not production UUIDs).
- [ ] Verify session lookup, login/identity-provider redirect, logout, expiry, cookie names/attributes, CSRF mechanism, production app origin and ownership/membership/role enforcement. No refresh-token scheme is implemented.
- [ ] Confirm project creation and project/workspace membership, role combinations and access to submitted/reference results.
- [ ] Agree upload size/deployment limits, multipart fields, ZIP validation, language support, secret detection, asynchronous job lifecycle, failure reasons and evidence completeness.
- [ ] Agree immutable model/source IDs, revision preconditions, conflict response and graph/provenance wire formats.
- [ ] Confirm runtime eligibility/prerequisites, profile provisioning, approved configuration snapshots, scenario revisions, run approval, cancellation vs termination, outcome semantics, trace retention and uncertain mappings.
- [ ] Guarantee frozen submission/reference snapshots and version-scoped feedback, including optional runtime results. Define duplicates, deadlines, resubmissions and assignment publication rules.
- [ ] Define pagination/cursors/sorting/filtering, large-graph chunking and server collection limits. Current small sample lists filter/page locally.
- [ ] Define administration audit semantics, lock/unlock concurrency, integration/profile configuration versions and actual health/usage telemetry.
- [ ] Agree structured field-validation errors and Retry-After semantics if supported. The current UI does not parse an invented error envelope, automatically replay writes, or display raw server errors.
- [ ] Confirm all production endpoints/methods; add translation functions and schema/transport tests for actual wire responses before configuring mappings.
- [ ] Capture a real successful and failed response for each enabled operation; verify authenticated and unauthorized behavior. Until then, describe functionality as mock/frontend-ready only.

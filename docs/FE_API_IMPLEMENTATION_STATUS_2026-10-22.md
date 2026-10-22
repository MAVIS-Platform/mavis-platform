# FE API integration implementation — 22 October 2026

## Branch and scope

Branch `feat/fe-api-contract-integration`, based on main `02c663b` (PR #29). Implements the prioritized P0–P3 slices of `FE_API_CONNECTION_PLAN_2026-10-22.md` and operator-facing runtime observation/control from P4. Business/education/admin CRUD P5/P6 remains deferred according to the mainflow-first scope. No database migration/reset was needed.

## Implemented

- One authenticated AppProvider/query cache and URL-based project/workspace/model selection. Real backend login at /login, HttpOnly JWT cookie, current active-user role from Java /auth/me, sign-out/cache reset. Backend reads/writes no longer depend on provisional cookie forwarding or JSON environment route maps.
- Typed, explicit Java wire translation and envelope validation. Same-origin mutation checks, Bearer only server-side, no automatic mutation retry, bounded HTTP, input/response scope checks. Mock mode remains separate; unsupported operations return 501.
- Project list/detail/create, source ZIP/GitHub import, snapshot catalog, job history/status/cancel, stable Idempotency-Key, refresh recovery, real review/partial/cancel/timeout states and nullable progress.
- Selected model metadata/graph, lazy node/edge evidence, all UUIDs and saved properties retained, unclassified layer rather than guessed data, diagram export, impact limits and AI cache/fallback attribution.
- Controlled revisions preserve existing properties and immutable base/source; stale base returns 409. Compare comes from Java. Evaluation and findings are pinned to model/run.
- Runtime preflight and project session list/detail/approve/stop/sequence use independent execution/scenario/evidence/cleanup/trace/mapping fields. No fake registry IDs, no "approval means running", no invented terminate action. Operator still creates/provisions/launches the pinned workload.

## Java changes

New guarded read endpoints:

- GET /api/v1/auth/me — active current-user identity without JWT/password.
- GET /api/v1/projects/{projectId}/snapshots — includes snapshots not yet analyzed, omits storage paths.
- GET /api/v1/analyzer/snapshots/{snapshotId}.
- GET /api/v1/analyzer/models/{modelVersionId}/elements.
- GET /api/v1/analyzer/models/{modelVersionId}/elements/{elementId} — rejects cross-model IDs.

Graph now authorizes project before querying nodes and returns an empty graph for an existing empty model. Model/diagram/impact read checks use the shared project policy; revision/layout require project-write policy. Evaluation read/run/findings are project-authorized. Atomic stale-base revision protection reports 409 rather than a generic 400. Integration harness constructors were updated to use the real access policy.

## Verification achieved

- Java targeted auth/read/graph/model/diagram/evaluation: 34 passed, zero failures/errors. Java reactor package succeeded.
- FE contract/mocks/auth/translators: 23 passed. Existing mainflow contract script passed. Typecheck and changed-file lint passed; production backend-mode build succeeded with isolated `.next-integration` output.
- Real browser + Java + Aiven test DB: login, snapshot catalog, shared sidebar scope, selected Petclinic graph 24 nodes/21 edges, lazy OwnerResource evidence 4 entries, Mermaid download, evaluation HTTP 200 with score 85.
- AI check: initial automatic review rejected a potential provider-egress request. Resolver code and all 8 key-file candidates were checked; no configured key was present. A safe local-cache check was then approved and returned HTTP 200/provider CACHE. No new live provider test is claimed.
- Fresh public GitHub pinned Petclinic import → analyze → refresh while polling → graph succeeded on a dedicated test project. Controlled description edit created revision 2 with a new ID and the same snapshot. Java compare reported one modified element, no added/removed items. Stale revision through the new proxy returned 409.
- Real eShop ZIP through new operation adapter: Worker COMPLETED, analysis COMPLETED_WITH_REVIEW, graph 697 elements/581 relationships. C# is PartialSyntax, not a claim of runtime coverage.
- Runtime browser preflight returned 200/compatible with 11 detected services on the dedicated Petclinic source. Session list was empty; no automatic workload dispatch, approve/stop/sequence with a live operator session is claimed by this acceptance.
- Outsider account was denied with 403 by all eight tested resources: project, snapshot list/detail, model, graph, elements, diagrams and evaluations. Only the newly created outsider account was inactivated afterward.
- Browser new-analysis/cancel after refresh returned 200 and terminal cancelled with zero published-model links.
- Auth proxy live checks: eight passed (unauthenticated denial, login without token in JSON, server session, project list, unsupported registry 501, stale revision 409, logout, post-logout denial).

## Limits and follow-on gates

Runtime profile/config/scenario management APIs and automatic dispatcher are not supplied by the current Java API. Existing operator sessions can be observed/approved/stopped; this delivery does not claim an automatic end-to-end runtime launch from the new UI. Full runtime failure/recovery acceptance belongs to the previously tested Runner implementation and must be rerun with a chosen dispatcher before declaring P4 fully complete.

Business workspace/assignment/submission/feedback/admin integrations and global telemetry remain P5/P6 backlog; their mock screens are not labeled as live successes. SMTP delivery/live AI quota and production deployment are not accepted here. Petclinic Java parser logs record-language-level limitations; review status is retained and no claim of exhaustive source parsing is made.

Local test accounts/projects and source artifacts are isolated from user projects. Credentials, browser logs, build output and DB dumps are excluded from commits. The primary checkout's pre-existing Worker modifications are unchanged.

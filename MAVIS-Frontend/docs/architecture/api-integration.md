# Java API integration — current implementation

The mainflow now uses the same AppProvider, session and operation boundary as the component screens. Set `MAVIS_API_MODE=backend` and `MAVIS_JAVA_URL` server-side. `MAVIS_API_OPERATIONS` and cookie passthrough mappings are no longer the mainflow integration mechanism.

`app/api/mavis/[operation]/route.ts` validates typed inputs and same-origin writes. `src/lib/api/java-operations.ts` explicitly maps each supported operation to Java path/query/body and response composition; `java-wire.ts` validates actual DTOs before returning view DTOs. JWT is read only from the HttpOnly `mavis_session` cookie and sent to Java as Bearer. Login strips JWT from browser JSON; `/api/v1/auth/me` checks current active user/role. Local sign-out clears the cookie; it is not a global JWT-revocation service.

Supported in this delivery: identity/login/logout, project list/detail/create, snapshot list/detail/import ZIP/GitHub, analysis jobs/start/cancel, version metadata/selected graph, element/relationship evidence, diagrams/export, impact, AI provider attribution, controlled revision/compare, evaluation/findings, runtime preflight/project session list/detail/approve/stop/observed sequence. Runtime profile/scenario registry and automatic dispatch are not fabricated; operator execution remains explicit.

Unsupported business/admin operations return 501 with no mock fallback. Their complete backlog is recorded in `docs/FE_API_CONNECTION_PLAN_2026-10-22.md` at repository root. Mock mode remains a separate, labeled adapter for previews.

Wire differences are intentional: unavailable progress/service counts/runtime capabilities and evidence completeness are nullable, rather than invented; unknown element layer remains unclassified. Model metadata lists do not hydrate every historical graph. Evidence is fetched only for the selected target. Source/job/model/evaluation scope is validated at API and UI boundaries. Backend resource authorization remains authoritative.

The compatibility `/api/backend` route remains temporarily for old links/clients, but the four production screens use the shared feature boundary. Internal Worker/Runner service keys, grants, lifecycle/receipt/recovery routes are never exposed through this operation router.

See `../MAINFLOW_INTEGRATION.md` and root `docs/FE_API_IMPLEMENTATION_STATUS_2026-10-22.md` for tested scope and remaining gates.

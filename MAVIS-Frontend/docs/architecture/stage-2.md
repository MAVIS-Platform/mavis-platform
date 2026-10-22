# Stage 2 frontend architecture

The App Router, Stage 1 shell, semantic tokens, typography, theme provider, role navigation groups and Radix primitives remain the foundation. Existing feature bodies now use typed data instead of importing sample datasets and running simulation timers inside components. Previously planned navigation destinations now resolve to feature screens in the existing groups. No dependency was added.

## Structure and ownership

- `app/`: Next.js entrypoints, route error boundary, login options and the server API proxy. `[screen]` and `administration/[screen]` accept an explicit screen registry; unknown names return 404.
- `src/components/ui/`: existing accessible Radix and native primitives, including Skeleton, Dialog, Drawer/Sheet, Toast/Sonner and menus.
- `src/components/layout/`: typed Header, Sidebar, Breadcrumbs, PageContainer, SectionHeader and ContextPanel; AppShell composes the application chrome.
- `src/components/shared/`: request lifecycle, generic DataTable, status/summary/detail presentation, form fields, search/filter/select, confirmation/modal/drawer/action-menu and pagination.
- `src/features/`: project, source-analysis, architecture, runtime, workspace, assignment, submission, explanation, auth and administration behavior. Graph layout calculation lives separately from rendering. Feature hooks and containers own queries/mutations; presentational graph, evidence, table and timeline components accept typed data.
- `src/types/domain.ts`: provisional domain contracts and response schemas. SVG coordinates, graph selections and draft edits are UI state; they are not domain records.
- `src/lib/api/`: typed operation registry, interchangeable adapters and server configuration. The mock adapter is the sole owner of sample data and simulated progression. `src/lib/graph-data.ts` is retained solely as its legacy sample seed, never consumed by product presentation.
- `src/lib/auth/` and `src/lib/errors/`: frontend permission vocabulary and normalized errors.
- `src/providers/`: one TanStack Query cache, API adapter, selected project/workspace IDs. User identity and role are read from the session query, never copied into local role state.

## State and request lifecycle

TanStack Query owns response data, cancellation, cache, refetch, initial loading and mutation progress. Query keys contain operation and exact input, including project, model, source or submission ID. Selections, filters, zoom, dialog visibility and uncommitted edits remain component state. Selected project/workspace IDs are the only shared domain selections. Theme and sidebar preferences keep the Stage 1 storage keys; no authentication secret is stored in browser storage.

Queries retry one network/server failure. Validation, permission, authentication, conflict, missing-resource and rate-limit failures require user action. Mutations never retry automatically. Successful writes invalidate related domain queries through `cache-policy.ts`; terminal job/session updates refresh derived models, project status and summaries. No optimistic write is displayed as committed data. Running jobs/sessions poll every 1.5 seconds and stop on terminal state, error or unmount. Collections stop polling when no record is active and refetch on focus or explicit invalidation. Request errors show a local retry or form recovery path; unexpected rendering failures use `app/error.tsx`.

Disabled queries correspond to an unselected context; the selector is the idle state. RequestState renders loading, error/retry, empty or successful content and announces refetch activity. Mutation buttons disable while pending; failures retain form data and confirmations. Sonner reports success/failure; inline errors remain available after the toast.

Small collections use local filtering/pagination. Server pagination, cursors and sorting remain unresolved contracts; do not describe these as paginated backend endpoints. Large graphs use paginated element controls above 300 visible nodes or 1,000 visible relationships to avoid rendering an unbounded SVG. Relationships have an accessible select control and nodes have keyboard-operable buttons. At most 1,000 relationship options are shown; filter by layer/service first. Stage 3 must benchmark representative large models before selecting a graph virtualization engine.

## Version and evidence invariants

- Source import checks extension, size and ZIP signature locally; server validation owns archive contents, supported projects and secret detection. Mock validation is explicitly simulated and never inspects uploaded source. Invalid/unsupported snapshots cannot start analysis. Failed jobs can be retried; incomplete evidence remains labeled.
- Architecture state is keyed by model ID. A new version clears graph element selections. Evidence carries its source/runtime provenance; absent edge evidence remains uncertain.
- Model editor descriptions are drafts until a confirmed save creates a new revision. The old model remains unchanged. Expected revisions detect stale saves. Switching model/element is disabled while a draft is dirty; discard or save first. Navigating away or selecting another project discards local drafts; they are not persisted or represented as committed results.
- Runtime approval captures source ID, scenario revision and configuration revision. The service validates all prerequisites and versions again when starting a run. Outcome, execution status, trace availability and mapping confidence are presented separately. Unsupported projects cannot run. Cancel/terminate confirmations name the exact session.
- Submission creation sends assignment ID and exact model/source/runtime IDs. The mock service deep-copies these into an immutable submission. Review renders only that payload, never a current-project query. Feedback contains both submission ID and submitted model ID. A backend must provide the same immutable/version-scoped guarantee.
- Administrative account locks, integration toggles and runtime profile changes require role permission, explicit confirmation and mutation feedback. Integration/profile changes include expected revisions. Secret integration credentials remain server settings.

## Authentication and backend mode

AppShell guards feature mounting with a session query and page permission. Navigation reflects the authenticated role; design-system role controls remain a visual preview. A 401 clears domain query data, cancels reads and replaces the session with an unauthenticated result. Signing out and choosing a sample role clear the cache to prevent cross-account reuse. Frontend checks are UI behavior, not security enforcement: backend authorization, membership and ownership checks are mandatory.

Mock mode starts with a sample student. `/login` selects a sample role; switching roles preserves the in-memory sample service so a student submission can be reviewed as a lecturer. Reload resets sample changes. No password, token or refresh behavior is invented. Backend mode uses same-origin, server-managed cookies through the proxy; it has no fabricated login flow. Without a session contract it shows an honest configuration error and sign-in explanation.

The root layout is dynamic so runtime mode changes cannot leave a statically built mock page beside a backend proxy. Invalid mode settings fail configuration validation. The proxy forwards only configured session-cookie names, requires exact same-origin writes, rejects upstream redirects and validates input/output. Responses must match the requested resource, project and version; frozen submission payloads must reference the same source snapshot. Upstream errors and arbitrary payloads are not exposed. Production cookie attributes, CSRF defenses, login/logout, response mapping and deployment origin must be agreed and verified before deployment.

## Validation and Stage 3 handoff

Use `npm run typecheck`, `npm test`, `npm run build`. The tests use Node's built-in test runner in the same process plus the existing TypeScript compiler (the restricted Windows sandbox cannot spawn test workers). They exercise service and transport boundaries, version immutability, stale saves, exact feedback scope, execution prerequisites, permissions, cancellation/timeouts, malformed responses, server-proxy isolation and pre-paint theme resolution. They do not certify browser behavior or backend integration.

Use the [integration checklist](api-integration.md) before enabling backend operations. Stage 3 must check Light/Dark/System persistence and live OS changes, focus/trapping/return, route gating, role switching, keyboard graph controls, real ZIP upload behavior, error recovery, 390/768/1024/1440 widths, graph performance, production authentication and complete backend request traces. Browser availability and actual verification results are recorded in `stage-2-validation.md`.

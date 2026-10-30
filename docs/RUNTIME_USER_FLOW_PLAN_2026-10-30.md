# Runtime with minimal user input

Scope: backend microservices in explicitly supported Java/C# execution profiles. Context actor discovery and frontend analysis are deferred. This document separates implemented local foundations from the target workflow; it is not a production acceptance report.

## Product target

The ordinary user imports a project, reviews a proposed run, supplies only genuinely missing test inputs/secret references, and approves once. MAVIS prepares the approved workload, executes requests, captures actual traces, maps evidence, reports independent execution/scenario/evidence/cleanup statuses, and releases resources. Repeat runs reuse versioned settings and scenarios while rechecking prerequisites.

## Work the platform owns

- Inspect source and Compose; resolve service mappings only when unambiguous.
- Check runner availability, accepted execution profile, pinned images, source/image lineage, instrumentation, collector, test environment and resource capacity before offering Run.
- Extract actual HTTP endpoints, controller prefixes, request constraints and available API schemas.
- Produce a bounded draft with evidence per request and an explicit list of unresolved values. A model confidence score is not an accuracy measurement.
- Keep immutable snapshot/model/profile/configuration/scenario identifiers with the approved plan. Changes invalidate approval where relevant.
- Run through the dedicated runner boundary, retain redacted diagnostics, and verify cleanup.

## Work only a user or operator can supply

- Business-specific valid test values when source/schema/examples do not establish them.
- Test credentials or third-party keys through protected inputs, never through AI prompts or ordinary scenario JSON.
- Required data preparation/reset rules and permission to run requests that change state.
- Operator provisioning of supported runner profiles, trust and image/instrumentation inventory. This is not work to repeat for every learner.

## Local foundations implemented in this iteration

- Removed model-derived synthetic trace execution from the production dispatcher. A missing or failing runner cannot substitute fabricated observed evidence.
- Removed frontend adapter fallbacks that fabricated saved scenarios/configuration, revisions or execution after API errors.
- Draft suggestions now use backend endpoint declarations and controller prefixes; orders/payment placeholder requests are removed.
- Parameter values, access declarations, missing request data, unresolved prefixes and unsupported Compose mappings prevent automatic draft selection.
- Drafts initially select parameter-free GET requests only. HTTP 200 remains an explicit reviewable expectation, not an observed fact or a promise of endpoint behavior.
- Saving a scenario does not start a runtime session. Approval references the persisted scenario ID/revision and the matching source/model configuration.
- User edits survive background model refresh; repeated clicks are guarded; an unchanged saved draft is reused for a subsequent approval attempt.

These suggestions are deterministic and currently cover extracted Spring endpoint metadata. They are not an AI business-scenario generator, a full OpenAPI planner or proof of Java/C# runtime-profile acceptance.

## Next implementation gates

1. Dedicated runner dispatch/claim bridge and live capability inventory. Existing AUTO mode launches a local CLI and is not a remote runner integration.
2. Prepare/readiness API returning a versioned plan and concrete missing inputs; the main application must not receive a host Docker socket as a shortcut.
3. Per-session protected inputs are now implemented locally: env form/import, AES-256-GCM storage bound to session/source/model, runner-only active-session retrieval, body/header/path bindings and approved application environment bindings. Deployment requires migration V25 and a persistent base64 32-byte MAVIS_RUNTIME_ENVIRONMENT_KEY. No key is generated or logged by the application. Project-level credential reuse/rotation/retention remains future work.
4. Schema/request binding for bodies, path/query values, authentication and response extracts. Prepared test values and fixture reset must be explicit; do not guess business data.
5. Optional AI proposal step over source-backed endpoints/schemas. Validate endpoint IDs, allowed service mappings, variable dependencies, supported assertions and budgets before showing an approvable plan. AI cannot execute workloads or mark evidence as observed.
6. Real source/image correspondence verification and acceptance of each declared Java/C# profile. An Unverified marker must not be changed without evidence.
7. Fresh end-to-end acceptance through real MAVIS APIs on two reviewed backend projects, including success, HTTP failure, unavailable dependency, timeout, cancellation, partial trace and confirmed cleanup.

## Critical self-review

- Fewer clicks must not hide invalid mappings, guessed URLs, unavailable infrastructure or approval of unknown writes.
- A read-only HTTP method is a conservative draft-selection heuristic, not proof that an application has no side effects.
- A failed scenario and unavailable/partial tracing are different results. A successful HTTP response does not prove complete tracing or cleanup.
- A lost response to a dispatch request may be an uncertain execution outcome. Do not silently retry via another API or create another run; reconcile sessions and add server-side dispatch idempotency before automatic retries.
- Same-host controlled PoC and an isolated runner for untrusted imported projects are different acceptance conditions. The current application VPS has not been provisioned as a runner.
- AI cannot invent absent credentials, external-service access, user intent or initial business state. Report what remains missing.

## Validation boundary

Unit/contract tests and a headless browser fixture validate local control flow and user actions. The fixture uses simulated API responses; no real Docker workload or live AI scenario generation has been accepted in this iteration. Deployment and purchase/provisioning of a runner remain separate actions.

## Env-only draft update

The ordinary draft now builds supported GET requests (or bounded write requests when no read draft exists), creates missing path/auth/body input fields and reads approved application environment references. The user may import a dotenv file locally; only required names are submitted. Raw values are never saved into scenario JSON or sent to AI. The request editor is optional advanced UI. JSON request data that cannot be inferred remains a test input rather than a fabricated business value.

Protected values are pinned to one session before approval. They are excluded from session JSON serialization and start-request string logging. Only a trusted runner credential can retrieve them while the session is ready/allocated/running; the worker requires HTTPS for non-loopback retrieval. Application overrides cannot replace instrumentation/control variables. The runner's Linux project directory is owner-only; application env values necessarily exist in its private, temporary Compose override during execution, not in receipts/scenario exports.

This does not make arbitrary Compose repositories executable. Existing accepted-profile constraints, image pinning, Compose interpolation limitations and operator provisioning still apply. A separate runner bridge, real source/image lineage and live acceptance are outstanding. No deployment or workload execution is implied by this implementation.

## Local validation on 2026-10-31

- Frontend: 319 passing unit/contract tests for the commit scope (paused Context changes excluded); production build passed; 38 routes rendered without server errors.
- Java analyzer runtime/security/AST selection: 56 passing tests; selected platform security tests also passed.
- Worker: 228 passing tests, 3 platform/real-Docker cases skipped. Final protected environment binding tests passed after the last instrumentation guard change.
- Headless browser with simulated APIs: env-only inputs, local dotenv import, filtering unused keys, optional advanced request editor, no raw values in saved scenario, save without execution, pinned approval payload, invalid JSON rejection and unavailable protected-input setup all passed.
- No real Docker workload, live AI business-scenario generation, production migration, runner provisioning or deployment was performed.

Compose env literals escape dollar signs before writing the override, following https://docs.docker.com/reference/compose-file/interpolation/ . This avoids expanding user values against the runner host environment; live Docker verification remains an acceptance gate.

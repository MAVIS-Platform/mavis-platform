# MAVIS Studio runtime

Studio opens a managed Docker session and accepts Start, Stop and Scale commands while the session is running. The guided Lab links to /sessions?project=<project-id>&studio=1. Select **Interactive Studio session**, launch the session, wait for Runner readiness, and use the Studio controls. Scale accepts 1–8 replicas.

Each session pins its source, model, profile and confirmed service mappings. The backend checks project write access and the current Lab Quiz gate before queuing a command. Commands execute sequentially. Reusing an action UUID with the same payload returns the recorded command. Reusing it with a different payload returns HTTP 409.

## Runtime requirements

- Apply Flyway V29 and V30 with the other pending migrations.
- Deploy the Java backend, frontend and updated managed Runner together.
- Configure the existing Runner service credential, state root, Linux Docker Engine, collector and approved execution profile.
- Interactive mode requires the managed Runner transport. Existing one-shot scenarios keep their execution flow.
- Each session accepts at most 32 commands and remains bounded by the execution profile timeout, at most 300 seconds including startup.

## Measurements and evidence

The initial scenario runs before the command loop. For GET/HEAD workloads, Runner replays the same workload after each confirmed command and records request count, p95 step latency and HTTP error rate. The UI displays the measured values and leaves missing measurements empty. Workloads containing other HTTP methods are executed initially, with replica measurements available for subsequent actions.

**Finish Studio and save evidence** becomes available after a confirmed command and waits for any pending command to settle. Runner drains traces, cleans the allocation, writes its durable receipt and delivers it through the existing receipt endpoint. **Cancel Studio session** also triggers cleanup. A timeout, cancellation or failed execution preserves the observed action results.

The Studio state endpoint stores command history in PostgreSQL. Reloading the page restores that history. Terminal sessions display unfinished commands as interrupted. Receipt verification matches requested commands against confirmed Runner results and keeps the existing trace and cleanup checks.

## Observation workspace

Runner samples running replica counts, Docker CPU/memory/network statistics, container logs and captured OTel spans while Studio is active. Samples are published every eight seconds after the preceding sample finishes and immediately after actions. The displayed observation timestamp identifies the latest sample. Protected environment values are removed before delivery, and Java applies the existing secret redactor before persistence.

The graph offers 2D and perspective-projected 3D views. Camera rotation, selection and instance markers use the same session service identities. Solid edges come from captured interactions. Dashed edges come from the pinned static model. Selecting a service loads its evidence and Worker impact paths, with cycle-safe static traversal retained as reference context.

Trace spans can be filtered by service and trace identity. Before/After action details retain the workload trace IDs used for each measurement. Resilience events are shown only when captured logs explicitly contain circuit-breaker, fallback, retry or bulkhead events.

The Chaos Monkey control chooses one observed running service and requires confirmation before sending a real STOP action. Scale has both an integer input and a 1–8 slider.

## Frozen evidence

Capture requires an explanation and observed telemetry. The browser captures the current graph as PNG. Java rejects a capture if a newer telemetry sample has replaced the displayed sample, validates the bounded PNG, and freezes the image, explanation, source/model identities, telemetry and actions under a SHA-256 digest.

Snapshots are fetched separately for download so the regular polling response carries snapshot metadata instead of full images. The graph also supports direct SVG and PNG exports.

New interactive receipt callbacks carry an HMAC-SHA256 signature over the canonical receipt digest using the existing Runner service credential. Java verifies the signature before committing the receipt. Downloaded receipt evidence includes the digest, signature and receipt body. Existing trusted local outbox recovery retains its compatibility path.

When an interactive Studio session is attached to a coursework submission, submission creation requires a captured snapshot and a completed, verified run with confirmed cleanup. V30 freezes the Studio snapshots and receipt into the submission. Later captures or telemetry updates do not change that submitted evidence. Full Studio evidence is included in the submission export; list/detail summaries omit large images and trace payloads.

## API

All paths are relative to /api/v1/analyzer/runtime/sessions/{sessionId}/studio.

- GET / reads Studio state with project read access.
- POST /actions accepts an action UUID, START/STOP/SCALE, service and replicas for SCALE.
- POST /finish requests evidence capture after a confirmed action.
- GET /commands?resourceProject=... is a Runner-only polling endpoint.
- POST /ack is a Runner-only idempotent acknowledgement endpoint.
- POST /telemetry accepts bounded, session-scoped Runner observations.
- POST /snapshots freezes an explained screenshot and the matching observed state.
- GET /snapshots/{snapshotId} downloads that immutable evidence.
- GET /receipt downloads the committed receipt and its available signature.

An acknowledgement must match the session allocation and command. A confirmed SCALE result must contain the requested number of replicas. Unknown or terminal sessions reject new actions.

## Verification

From MAVIS-Frontend, run npm run typecheck and node tests/studio-ui.browser.cjs. The browser test uses a synthetic API fixture around the actual Studio component to verify pending locks, measured results, finish and mobile layout.

Java tests include RuntimeStudioServiceTest and RuntimeStudioApiIntegrationTest. The integration test requires a dedicated PostgreSQL database through MAVIS_DB_URL, MAVIS_DB_USERNAME and MAVIS_DB_PASSWORD.

For real Docker verification, initialize MAVIS.Worker/samples/runtime-poc/Initialize-Poc.ps1 from the repository root. Set MAVIS_MANAGED_DOCKER_TEST_ROOT to the absolute sample directory and run ManagedDockerRuntimeTests. The interactive test exercises Stop, Start and Scale through a fixture Java transport with real Docker, telemetry and receipt delivery. The existing managed test exercises five success/cancellation cycles and cleanup.

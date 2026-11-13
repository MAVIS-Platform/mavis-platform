# MAVIS Studio runtime

Studio opens a managed Docker session and accepts Start, Stop and Scale commands while the session is running. The guided Lab links to /sessions?project=<project-id>&studio=1. Select **Interactive Studio session**, launch the session, wait for Runner readiness, and use the Studio controls. Scale accepts 1–8 replicas.

Each session pins its source, model, profile and confirmed service mappings. The backend checks project write access and the current Lab Quiz gate before queuing a command. Commands execute sequentially. Reusing an action UUID with the same payload returns the recorded command. Reusing it with a different payload returns HTTP 409.

## Runtime requirements

- Apply Flyway V29 with the other pending migrations.
- Deploy the Java backend, frontend and updated managed Runner together.
- Configure the existing Runner service credential, state root, Linux Docker Engine, collector and approved execution profile.
- Interactive mode requires the managed Runner transport. Existing one-shot scenarios keep their execution flow.
- Each session accepts at most 32 commands and remains bounded by the execution profile timeout, at most 300 seconds including startup.

## Measurements and evidence

The initial scenario runs before the command loop. For GET/HEAD workloads, Runner replays the same workload after each confirmed command and records request count, p95 step latency and HTTP error rate. The UI displays the measured values and leaves missing measurements empty. Workloads containing other HTTP methods are executed initially, with replica measurements available for subsequent actions.

**Finish Studio and save evidence** becomes available after a confirmed command and waits for any pending command to settle. Runner drains traces, cleans the allocation, writes its durable receipt and delivers it through the existing receipt endpoint. **Cancel Studio session** also triggers cleanup. A timeout, cancellation or failed execution preserves the observed action results.

The Studio state endpoint stores command history in PostgreSQL. Reloading the page restores that history. Terminal sessions display unfinished commands as interrupted. Receipt verification matches requested commands against confirmed Runner results and keeps the existing trace and cleanup checks.

## API

All paths are relative to /api/v1/analyzer/runtime/sessions/{sessionId}/studio.

- GET / reads Studio state with project read access.
- POST /actions accepts an action UUID, START/STOP/SCALE, service and replicas for SCALE.
- POST /finish requests evidence capture after a confirmed action.
- GET /commands?resourceProject=... is a Runner-only polling endpoint.
- POST /ack is a Runner-only idempotent acknowledgement endpoint.

An acknowledgement must match the session allocation and command. A confirmed SCALE result must contain the requested number of replicas. Unknown or terminal sessions reject new actions.

## Verification

From MAVIS-Frontend, run npm run typecheck and node tests/studio-ui.browser.cjs. The browser test uses a synthetic API fixture around the actual Studio component to verify pending locks, measured results, finish and mobile layout.

Java tests include RuntimeStudioServiceTest and RuntimeStudioApiIntegrationTest. The integration test requires a dedicated PostgreSQL database through MAVIS_DB_URL, MAVIS_DB_USERNAME and MAVIS_DB_PASSWORD.

For real Docker verification, initialize MAVIS.Worker/samples/runtime-poc/Initialize-Poc.ps1 from the repository root. Set MAVIS_MANAGED_DOCKER_TEST_ROOT to the absolute sample directory and run ManagedDockerRuntimeTests. The interactive test exercises Stop, Start and Scale through a fixture Java transport with real Docker, telemetry and receipt delivery. The existing managed test exercises five success/cancellation cycles and cleanup.

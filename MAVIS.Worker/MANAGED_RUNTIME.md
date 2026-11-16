# Managed Java runtime adapter

## Orphan recovery (Java V11 counterpart required)

For an operator-confirmed dead Runner process before execution receipt creation:

```powershell
dotnet run --project src/MAVIS.Runner -- managed-recover https://java.example C:/private/mavis-runner-state mavisrun-0123456789abcdef0123456789abcdef
```

The command requires the durable allocation manifest containing all pinned IDs. It takes the allocator lease, removes only the exact owned Docker project and scenario helpers, and verifies no containers/networks/volumes remain. A recovery result is durably recorded before removing active session files; HTTP failure leaves it available for resending without rerunning Docker cleanup. A validated Java recovery ack is saved separately. Existing execution receipts must be delivered instead; recovery never fabricates a scenario result or promotes a model. Incomplete cleanup fails without reporting Confirmed. Stop/recover should be used only after confirming the original process is no longer running; the allocator lease enforces this locally.

Java exposes `POST /api/v1/analyzer/runtime/sessions/{id}/recovery-result`, requires matching pinned scope and Runner service auth/project policy, serializes with receipt/lifecycle, and rejects conflicting recovery or late execution receipt after recovery. Migration V11 adds recovery-result storage. This migration must be deployed before enabling the endpoint; cloud migration status is recorded separately from source implementation.

Implemented on `feat/runtime-allocation`, based on the Java round-2 proposal. Java main `9243cfa` adds the callback endpoints; review fixes are being verified in `feat/java-runtime-contract-fixes`. Do not treat this implementation as Java/PostgreSQL E2E acceptance. Contract candidates and independent canonical vectors: [runtime fixtures](contracts/runtime-v1/README.md).

## Commands

Existing operator positional commands remain supported. New commands use Java base URL and an absolute operator state-root:

```powershell
$env:MAVIS_RUNNER_ALLOW_LOCAL_POC = '1'
# Supply MAVIS_RUNNER_SERVICE_KEY through operator secret configuration, not source or CLI arguments.
dotnet run --project src/MAVIS.Runner -- managed https://java.example fixture-session C:/test/collector.yaml C:/private/mavis-runner-state
dotnet run --project src/MAVIS.Runner -- deliver https://java.example C:/private/mavis-runner-state mavisrun-0123456789abcdef0123456789abcdef
dotnet run --project src/MAVIS.Runner -- deliver-pending https://java.example C:/private/mavis-runner-state
dotnet run --project src/MAVIS.Runner -- ack-lifecycle https://java.example C:/private/mavis-runner-state/events/mavisrun-0123456789abcdef0123456789abcdef-allocated.json
```

Arguments above are illustrative: choose an actual Java session and operator paths. `managed` fetches definition, validates its session/pinned ID and confirmed UUID service mappings, unwraps ApiResponse.data if needed, and uses the same Runner core. Unknown definition fields are rejected. Direct operator plan/run also accept raw or wrapped definitions. Java lifecycle/receipt endpoints must match the candidate before using managed mode.

HTTP requests use X-Mavis-Runner-Key; HTTP is allowed only for loopback, other hosts require HTTPS. Redirects are disabled. Responses, request timeouts and retries are bounded. Errors do not expose keys or arbitrary backend response bodies.

Optional `MAVIS_RUNNER_SECRET_ALLOWLIST` is a comma-separated list of environment-variable names approved by the operator. Their in-memory values satisfy scenario secretHeaders reference keys. Definitions cannot select arbitrary environment values. Missing references fail before allocation; secrets are not written into definitions/receipts/logs/CLI arguments.

## Lifecycle and cancellation

- ALLOCATED is journaled after reservation/session files exist, before Docker start. Managed execution waits for matching acknowledgement before starting Docker.
- RUNNING is journaled only after Docker start, enforcement checks and readiness. Failure to acknowledge stops scenario execution and follows evidence/cleanup.
- Events persist under `<state-root>/events/<project>-allocated.json` and `...-running.json`. Timestamp/scope are retained for retries. `ack-lifecycle` replays an event, never starts a workload. Java must reject stale/terminal transitions and handle duplicate events idempotently.
- stderr MAVIS_SESSION_RESOURCE remains only an identity diagnostic, not start proof.
- Cancel transport is the shared-root `<state-root>/<project>/cancel.request` marker in this first adapter. There is no claim of cross-host cancellation support.

## Receipt delivery and recovery

Runner saves the receipt before sending it. Sender sends the same receipt on retries, then validates matching session/resourceProject/digest and COMMITTED or ALREADY_COMMITTED. It atomically writes a separate `.ack.json` and keeps the original receipt. Locks are per receipt, independent of execution allocator lease. Wrong ack/digest or permanent 4xx/redirect never produces a successful local ack.

There are at most five retries after the first attempt (six attempts), for network/408/429/5xx only; backoff is 1/2/4/8/16 seconds with bounded Retry-After. After execution cancellation/teardown, managed mode uses a fresh two-minute delivery window. Failure leaves receipt pending. `deliver-pending` reconciles up to 256 saved receipts and never launches executions again.

Process death before a receipt exists still requires explicit operator `recover <state-root> <project>`. It confirms local cleanup but does not fabricate scenario success or send an undefined recovery-result ack to Java. Java orphan-session reconciliation is a remaining contract gate.

Scenario helper containers can remain Created after cancellation kills their Docker CLI. Cleanup/recovery now removes only helpers matching the exact allocation project and mavis-scenario service labels. Compose teardown is still attempted if helper removal fails; remaining resources prevent cleanup confirmation.

## Verification

```powershell
dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --no-restore --filter 'FullyQualifiedName~ManagedRuntimeTests'
# Initialize the existing PoC images/instrumentation first; no fixture image digests are executable by themselves.
$env:MAVIS_MANAGED_DOCKER_TEST_ROOT = (Resolve-Path samples/runtime-poc).Path
dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --no-restore --filter 'FullyQualifiedName~ManagedDockerRuntimeTests'
```

Managed Docker smoke runs actual .NET/Java workloads, readiness, trace capture, cancel and Docker cleanup, with a **fake Java HTTP message handler**. Evidence receipts/events/ack files remain under `samples/runtime-poc/artifacts/managed-tests-*`. Canonical vectors are independently generated with Python and checked by .NET, not yet accepted by Java. Java's missing golden receipt, deployed callbacks, DB concurrency/publication and orphan recovery acknowledgement remain required before declaring full integration complete.

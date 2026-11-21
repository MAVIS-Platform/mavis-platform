# Runtime integrity and System Context completion

Status: in progress. This is not a claim of production runtime readiness.

## Verified existing capabilities

Runtime configuration/scenarios, session APIs, managed Docker runner, Java/.NET OpenTelemetry instrumentation, scenario execution, cancellation, bounded cleanup, durable receipt handling and model enrichment already exist. The managed Docker profile supports approved images and instrumentation; arbitrary imported repositories are not automatically buildable.

## Implemented in this change

- Removed the synthetic trace dispatch path entirely. Missing or failed managed execution cannot substitute model-derived spans, fake HTTP results or placeholder image IDs.
- Runner availability is checked before automatic approval. Async dispatch failures are recorded without claiming cleanup was confirmed; failures after allocation require recovery.
- CLI execution has a bounded deadline and redirected log output so an unread pipe cannot block execution. Availability probes have bounded waits.
- Unverified image/source correspondence cannot promote a revision, even if the old PoC bypass flag is set. Default and production declarations disable that flag.
- System Context explicitly warns when no actor interactions are established. The exported diagram also carries the incomplete/review status. Endpoint declarations are not converted into human actors.

## Required next acceptance gates

1. Choose a dedicated runner host or local Docker test host. Do not assume the 3 GB web VPS can host imported systems safely.
2. Provision approved images, instrumentation volume, collector configuration, shared artifacts, scoped runner credentials and versioned service mappings. Do not mount a Docker socket into the web backend as a shortcut.
3. Run a real Java/.NET scenario, compare actual requests and captured spans with the receipt and resulting model, and verify cancellation/timeout/cleanup on the same host.
4. Keep simulation/demo data outside observed-runtime ingestion and verify historical runtime revisions before treating old synthetic receipts as evidence. This change does not delete or rewrite existing production data.
5. Add persisted context review: actor/external-system candidates with source references, explicit system-boundary decisions, confirmation/rejection and revision-aware audit history. This workflow is not implemented by the warning banner.
6. Only confirmed context should produce PERSON and external boundary relationships. AI suggestions and runtime observations must retain distinct provenance; runtime service identity does not establish a human business role.

## Test boundaries

Backend runtime unit/integration tests use mocks for portions of persistence/execution. Frontend regression tests do not prove live instrumentation. The opt-in real Docker test requires a prepared host; production deployment and that acceptance run remain outstanding.

## Retest on 2026-10-29

- Runtime Java regression: 41 passed, 0 failed.
- Runner C# targeted regression: 39 passed, 0 failed, 1 skipped. The skipped case is the opt-in real Docker managed test. These numbers are not live execution acceptance evidence.
- Both local Docker contexts (desktop-linux and default) failed to answer version probes within 15 seconds. Docker Desktop processes exist, but that does not demonstrate daemon readiness.
- Executable sample projects are under MAVIS.Worker/samples/runtime-poc: orders (.NET) -> payment (Java), and gateway (Java) -> catalog (.NET). The sample driver also covers HTTP failure, startup failure, timeout and cancellation.
- Existing POC_EVIDENCE.json is historical. It is not a fresh result from this retest.
- User selected a separate runner host. Hostname/IP, SSH identity and port have not yet been supplied, so deployment and real execution on that host have not occurred.

### Real-run acceptance checklist

1. Initialize-Poc.ps1 must build/publish samples and runner, verify instrumentation checksums, validate collector config, and capture actual image digests in a newly generated manifest.
2. Run Invoke-Poc.ps1 for Success, SecondProject, Failure, StartupFailure, Timeout and Cancel; retain fresh receipts and raw capture artifacts locally.
3. Independently compare HTTP results, trace/span parentage and expected orders -> payment / gateway -> catalog interactions. A static model edge is not a substitute for an observed span.
4. Check session-labeled containers/networks/volumes after cleanup. A successful scenario does not establish cleanup success.
5. Run the managed test with MAVIS_MANAGED_DOCKER_TEST_ROOT pointing at the prepared sample directory. Its Java HTTP endpoint is mocked; it proves real Docker execution plus a simulated Java boundary, not full production end-to-end acceptance.
6. Finally run the same workload through real MAVIS session export/lifecycle/receipt APIs and inspect the persisted revision/evidence. Do not label the system production-ready until this gate passes.

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

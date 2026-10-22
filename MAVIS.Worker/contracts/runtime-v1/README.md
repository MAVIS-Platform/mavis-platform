# Runtime round-2 interoperability candidate

These fixtures are a .NET implementation candidate for the Java round-2 agreement, not proof that Java callbacks are deployed. Main `35eb3fa` does not have the new lifecycle/receipt acknowledgement contract. Java must run these vectors and provide its missing golden receipt before cross-language digest acceptance.

- `definition.json` and `definition-wrapped.json`: structural fixtures only. Fake image/config digests and sample IDs must not be used for actual Docker execution. The executable Docker test generates inputs from operator-local `samples/runtime-poc/artifacts/manifest.json`.
- `receipt-startup-failure.json`: safe example with nullable trace/scenario and no enriched-model requirement.
- `canonical-vectors.json`: canonical text and SHA-256 independently generated with Python stdlib and checked by .NET tests. These do not replace the absent Java payload for the PDF's `0346fac...` hash.

## Proposed HTTP callback details requiring Java counterpart

`GET /api/v1/analyzer/runtime/sessions/{sessionId}/run-definition` returns raw definition or `ApiResponse.data`. Managed execution requires the selected session ID and a pinned resourceProject. HTTP loopback is permitted for local tests; non-loopback uses HTTPS. `X-Mavis-Runner-Key` is configured outside source. Redirects are disabled.

`POST .../{sessionId}/lifecycle-ack` receives the six pinned IDs, resourceProject, stage (`ALLOCATED` or `RUNNING`), sequence (1 or 2), observedAt (wire timestamp; internal journal retains occurredAt). The response is raw or wrapped data containing matching sessionId/resourceProject/stage. ALLOCATED occurs after reservation/files exist, before Docker is invoked; RUNNING occurs after start, enforcement inspection and readiness. Receiver must treat duplicate events idempotently and reject terminal/stale events rather than resurrect a session.

`POST .../{sessionId}/ingest-receipt-ack` sends the exact saved receipt. Ack data must contain matching sessionId/resourceProject/receiptDigest and persistenceStatus COMMITTED or ALREADY_COMMITTED. enrichedModelVersionId may be null. Java controls publication; the sender never assumes a committed receipt promoted a model.

## Canonicalization candidate

Parse with duplicate object keys rejected. Omit null-valued object members recursively; keep null array members and array order. Sort object keys ordinally. No Unicode normalization. Serialize compact UTF-8 without BOM, relaxed JSON string escaping (quotes/backslash/control characters escaped; ordinary Unicode unescaped), then full lowercase SHA-256 with `sha256:` prefix. Current receipt schema only contains integers; unsupported fractional/exponent/out-of-range number tokens fail rather than use an unagreed numeric normalization. Unicode supplementary/control-character edge vectors and any schema extension need explicit Java agreement. Receipt hashing precedes redacted DB projection, over the safe sender receipt itself; raw credentials must not be in the receipt.

Client uses at most five retries after the first request (six attempts), backoff 1/2/4/8/16 seconds, bounded Retry-After up to 30 seconds. Network/408/429/5xx only; 400/401/403/409 and redirects fail. Receipt remains available on failure. Valid ack is atomically persisted in a separate sidecar; a delivery lock is per receipt, independent from the allocator lease.

## Recovery boundary

`deliver`/`deliver-pending` reconcile receipts that already exist. `ack-lifecycle` replays a journaled event, without restarting the workload. A process killed before receipt creation still needs explicit operator `recover`; that command confirms Docker cleanup locally but does not fabricate a scenario result or send an undefined recovery-ack schema to Java. The Java counterpart must reconcile such orphan sessions through an agreed recovery-result contract before claiming crash-recovery E2E is complete.

Compatibility update: Java main 9243cfa adds lifecycle-ack and ingest-receipt-ack; sender uses the latter. Java hardening fixes are being verified in feat/java-runtime-contract-fixes.

# Worker independent API v1

Internal contract v1 is implemented and independently verified; the real Java dispatcher/client is not integrated. See [N01.md](N01.md) for scoped grants, deployment, health/readiness, error codes and Java fixtures. All /api/v1 endpoints require X-Mavis-Worker-Key. Legacy /api/analysis and /api/jobs are disabled by default in every environment.

## Source analysis

`POST /api/v1/dotnet/analyze` returns a result directly. `POST /api/v1/dotnet/jobs` accepts the same input and returns 202 with a polling Location:

```json
{
  "schemaVersion": "1.0",
  "artifactGrant": "<keyId>.<payload-base64url>.<signature-base64url>"
}
```

Result: signed input identifiers including attemptId, analyzerVersion, findings, coverage and warnings. A finding has kind/projectPath/target/httpMethod/evidence, optional subject/id/additionalEvidence and confidence. Evidence contains snapshot-relative filePath, startLine/endLine (1-based); it never contains source snippets. Configuration values and HTTP credentials/query strings are omitted. Configuration-key evidence currently spans the configuration file, not an exact property line.

Static profile 1.4+ returns `inputDigest`; N01 grant claims require `expectedInputDigest` to reject changed analysis inputs. This is not the platform ZIP/source-snapshot hash: it covers discovered .cs/.csproj/.sln/appsettings*.json files, including excluded compile files, under the guarded root. Sort normalized snapshot-relative paths ordinally; for each append UTF-8 path, a zero byte, and SHA-256 of UTF-8 decoded file text; SHA-256 the concatenation and encode lowercase hex. BOM is consumed by StreamReader, line endings are retained. Imported source still must be immutable while read; this digest does not authenticate its origin or cover ignored/unsupported files.

`confidence=ResolvedSymbol` means resolved in the bounded host-runtime compilation, not proof of a runtime interaction or an exact target build. Default `Syntax` means pattern/candidate evidence. `coverage.mode=PartialSyntax` remains the conservative compatibility label; read warnings for missing dependencies, incomplete project evaluation and unresolved patterns. Partial declarations share an ID and expose additionalEvidence. Service mapping remains Java's responsibility.

`GET /api/v1/dotnet/jobs/{jobId}?attemptId=...` returns jobId/attemptId/sourceSnapshotId/status/createdAt/completedAt/result/error/ephemeral. States: Queued, Running, Cancelling, Cancelled, Completed, Failed, TimedOut. This is Worker execution status, not Java model-publication status.

`POST /api/v1/dotnet/jobs/{jobId}/cancel?attemptId=...` is idempotent. A terminal result is preserved if it wins the cancellation race. Cancelling is pending; Cancelled confirms stopped local analysis. No rollback of arbitrary external operations is involved.

Duplicate (jobId, attemptId) with identical resolved input returns the existing job; changed input returns 409. Admission queue is bounded to 64 entries, retained records to 256, with terminal records eligible for eviction after 30 minutes on submission. Overload returns 429. Jobs are ephemeral, not restart-safe; Java must retain its durable state and reconcile/retry as a new attempt after Worker loss. API validation is shared with the direct use case. Invalid source/request is 400, invalid grant is 403, direct deadline is 408, missing attempt is 404. Background failures use sanitized diagnostics in the job record.

## Versioned impact

`POST /api/v1/impact`:

```json
{
  "modelVersionId": "model-001",
  "graphModelVersionId": "model-001",
  "graphRevisionId": "graph-001",
  "graphReady": true,
  "targetServiceId": "Payment",
  "serviceIds": ["Order", "Payment"],
  "edges": [{"id":"edge-001","from":"Order","to":"Payment","kind":"HttpRestCall","evidenceIds":["evidence-001"]}],
  "maxDepth": 10,
  "runtime": []
}
```

Inputs must refer to a ready graph matching the selected model. Unique service/edge IDs and valid endpoints are required. Bounds: 10,000 services, 50,000 edges/observations, depth 1–100. Allowed impact-edge types are HttpRestCall and ServiceDependency; containment and other types are excluded with warnings. Reference existence in the platform store must be checked by Java.

Result includes modelVersionId/graphRevisionId/targetServiceId, affectedServices, truncated, warnings and runtimeContext. Each affected service contains Direct/Indirect classification, distance, one shortest hops path, all matching parallel edgeIds along that path, and evidenceIds. Traversal reuses the existing reverse-BFS engine. Cycles never add the selected service to dependents. Max-depth truncation and valid-empty coverage limits are explicit.

Optional runtime observations have sessionId/modelVersionId/from/to/traceId/mappingConfirmed. Only compatible, confirmed observations matching allowed static graph edges are attached. Others produce review warnings; no static dependency is removed and no runtime-only edge is inserted into the selected model. Java must establish session/source/profile provenance before calling; Worker checks the declared model and mapping fields, not artifact authenticity.

Legacy `/api/analysis` and `/api/jobs/*` are separate transitional contracts; do not send these v1 payloads to them.

## HTTP endpoint identity — static profile 1.5

For OutgoingHttp, OutgoingHttpCandidate, HttpClientBaseAddressCandidate and ConfiguredHttpHost, target is lowercase host plus effective port: http://localhost:5001 becomes localhost:5001; https://payments becomes payments:443; http://payments becomes payments:80. IPv6 retains brackets, for example [::1]:5001. User info, path, query and fragment are excluded. This changes the host-only target convention in profile 1.4; consumers must use analyzerVersion when interpreting old results. Finding kind names remain compatible. These values are mapping hints, never confirmed canonical service IDs. No alias resolution or merging of distinct ports is performed.

## Impact path response budget — N07

Optional maxPaths defaults to 1000 and accepts 1..10000. The existing BFS still evaluates the input graph (bounded to 10000 services/50000 edges); the adapter enriches and returns at most maxPaths paths, ordered by distance then ordinal service ID. MAX_PATHS_REACHED and truncated=true indicate omitted services; MAX_DEPTH_REACHED independently indicates the depth boundary. A capped result must never be presented as the complete affected set. RuntimeContext retains compatible observations from the supplied graph and is not restricted to returned paths. This is an output/enrichment budget, not a new traversal engine or Java schema agreement.

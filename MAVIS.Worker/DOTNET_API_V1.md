# Worker independent API v1

Implemented local contract, not yet approved or integrated by the Java consumer. JSON properties use camelCase. Run against a controlled internal endpoint; configure `DotnetAnalysis:AllowedSourceRoots` before analysis. No target MSBuild/restore/assembly execution occurs.

## Source analysis

`POST /api/v1/dotnet/analyze` returns a result directly. `POST /api/v1/dotnet/jobs` accepts the same input and returns 202 with a polling Location:

```json
{
  "schemaVersion": "1.0",
  "jobId": "job-001",
  "projectId": "project-001",
  "sourceSnapshotId": "snapshot-001",
  "sourceLocation": "C:/samples/Orders"
}
```

Result: input identifiers, analyzerVersion, findings, coverage and warnings. A finding has kind/projectPath/target/httpMethod/evidence, optional subject/id/additionalEvidence and confidence. Evidence contains snapshot-relative filePath, startLine/endLine (1-based); it never contains source snippets. Configuration values and HTTP credentials/query strings are omitted. Configuration-key evidence currently spans the configuration file, not an exact property line.

`confidence=ResolvedSymbol` means resolved in the bounded host-runtime compilation, not proof of a runtime interaction or an exact target build. Default `Syntax` means pattern/candidate evidence. `coverage.mode=PartialSyntax` remains the conservative compatibility label; read warnings for missing dependencies, incomplete project evaluation and unresolved patterns. Partial declarations share an ID and expose additionalEvidence. Service mapping remains Java's responsibility.

`GET /api/v1/dotnet/jobs/{jobId}` returns jobId/sourceSnapshotId/status/createdAt/completedAt/result/error/ephemeral. States: Queued, Running, Cancelling, Cancelled, Completed, Failed. This is Worker execution status, not Java model-publication status.

`POST /api/v1/dotnet/jobs/{jobId}/cancel` is idempotent. A terminal result is preserved if it wins the cancellation race. Cancelling is pending; Cancelled confirms stopped local analysis. No rollback of arbitrary external operations is involved.

Duplicate jobId with identical input returns the existing job; changed input returns 409. Admission queue is bounded to 64 entries, retained records to 256, with terminal records eligible for eviction after 30 minutes on submission. Overload returns 429. Jobs are ephemeral, not restart-safe; Java must retain its durable state and reconcile/retry as a new job after Worker loss. API validation is shared with the direct use case. Invalid source/request is 400, direct deadline is 408, missing job is 404. Background failures use sanitized diagnostics in the job record.

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

# Static Java/.NET integration

## Configuration

Java client is disabled by default. Import `worker-integration-example.yml` explicitly or configure equivalent `mavis.worker.*` properties. Snapshot root is the Java extraction parent; artifact root is a separate directory accessible by Java for writes and mounted into Worker read-only. Java's host path can differ from Worker's `ArtifactScope:Root`; both refer to the same volume contents.

Set service key, grant key ID and grant secret through deployment configuration. Worker needs the matching `WorkerAccess:ApiKey` and `ArtifactScope:GrantKeys:<id>`. Do not deploy fixture credentials. Apply V3 migration before enabling publication; existing Evidence rows retain null provenance, newly imported Worker evidence carries full source IDs/locators/hashes in JSONB.

The current Java orchestrator allocates an attempt UUID in the job manifest, calls the scoped Worker client outside DB transactions, then calls WorkerModelPublisher. Job and project row locks prevent duplicate publication and serialize revision allocation; publication verifies attempt, snapshot/project and absolute deadline. The authoritative ZIP path comes from the stored snapshot. This is not a durable attempt/lease scheduler or restart recovery implementation.

## Publication behavior

- Java-only input: Worker NOT_APPLICABLE, no network. Java publishes normally.
- C#-only input: unavailable/rejected/timed-out Worker fails the job without publishing an empty model.
- Mixed input with Worker failure: Java can publish a draft marked manifest completeness PARTIAL; it does not replace latest complete. Existing job DB status remains COMPLETED for this retained partial result; clients **must inspect completeness and dotnetAdapter**, not status alone.
- Successful adapters: manifest ADAPTERS_COMPLETED, canonicalMapping REQUIRES_REVIEW. Candidate C# elements are NEEDS_REVIEW; success does not mean architectural mapping was validated.
- Cancelled Worker/expired attempt/scope mismatch rejects publication. A cancelled/superseded job cannot receive a late result. Explicit platform cancellation API and durable retries remain separate work.
- Import maps logical IDs to new Java DB UUIDs and stores logical keys in properties. Evidence rows are created per element/relationship association, preserving common source evidence ID/hash in provenance; no snippets are fabricated. Modules/endpoint aliases are not guessed to be runtime services.
- Java name/fuzzy service matching from the pre-existing pipeline is not used for the C# import. Cross-language service reconciliation can use the explicit snapshot binding profile below; do not feed unreviewed module/alias edges directly into service impact.

## Explicit service bindings

Place `mavis.bindings.json` at the extracted snapshot root, using [the example](contracts/service-bindings.example.json). Schema `1.0` associates exact Compose/service names with .csproj paths, Java source roots and HTTP endpoint aliases. Services must already exist uniquely in the selected model as SERVICE_CONTAINER. This is declared CONFIG evidence, not automatic confirmation of runtime behavior.

Worker project ownership is matched by snapshot-relative projectPath. Java call ownership uses the longest matching source-root prefix with path-segment boundaries. Endpoint aliases use lowercase host and effective port; 80/443 defaults and IPv6 are retained. Endpoint paths do not affect service identity. Client names, class names, incomplete hostname-only references and fuzzy contains matches are never substituted for endpoint aliases. Literal Java RestTemplate/WebClient arguments expose a separate endpointAlias field while retaining compatibility fields for the old Java pipeline.

Multiple owners/alias candidates or duplicate service nodes produce an ambiguous count; missing mappings produce an unresolved count. No first-match edge is emitted. Derived service edges are tagged CONFIG_BOUND/requiresReview, keep original Worker edges intact, carry original source evidence plus binding-file SHA-256, and use batch persistence in the same publish transaction. Module parent assignment uses explicit ownership. The resultManifest includes serviceMapping counts and bindingHash. No binding file means no derived links.

The file is optional, bounded to 256 KiB/1000 bindings, rejects links/out-of-scope paths and unsupported schema fields. Its raw-byte SHA-256 is separate from Worker's analysis digest (the Worker does not parse this Java merge profile). Java's snapshot storage must keep the binding file immutable with the rest of the snapshot. Invalid declared bindings fail publication rather than silently choosing a service. This profile does not yet infer ownership from arbitrary Compose build contexts or framework runtime overrides; those remain review/corpus work.

## Reproduce integration tests

Publish the committed producer (or a clean export) with SDK 10.0.204:

```powershell
cd MAVIS.Worker
dotnet publish src/MAVIS.Worker.Api/MAVIS.Worker.Api.csproj -c Release -p:RestoreLockedMode=true -p:UseAppHost=false -o .artifacts/worker-publish
pwsh -File scripts/Test-JavaWorkerIntegration.ps1 -Database
```

Requires Docker Linux Engine and Maven image availability. The script runs a non-root Worker process with readonly root/source mount, a Java 21 test container and optional fresh PostgreSQL 16 database. No host ports are published. It tests actual platform client calls and optional canonical DB publication, and removes its named containers/network. Maven cache and staged artifacts remain under ignored `.artifacts/`; production retention/quota/janitor is not implemented by this test harness.

Database tests apply V1, V2 and V3 in fresh isolated schemas, then verify publication/reload, provenance, duplicate/foreign attempt rejection, missing C# policy, partial draft preservation, SQL failure rollback and cancellation. The upload API tests also exercise the real Spring MVC multipart/job controllers, transactional ingestion, after-commit async event dispatch and actual Worker calls. MVC is driven with MockMvc's servlet harness; there is no browser, deployed servlet socket or production JWT filter chain in that test. Dataset-dependent full Java suite still requires the missing fruit-market fixture to be repaired separately.

## Frontend job state projection

Job API retains database `status` for compatibility and adds `analysisState`, `dotnetStatus`, `modelVersionId` and `promotedLatest` derived from the stored result manifest. Use `analysisState` for the displayed outcome: PARTIAL means Java results were retained but C# was unavailable/rejected; COMPLETED_WITH_REVIEW means adapters finished but architectural mappings/candidates still require review; COMPLETED_LEGACY means older results lack completeness metadata. RUNNING/PENDING/FAILED/CANCELLED preserve their normal meanings. Never show a PARTIAL job as fully analyzed based only on raw COMPLETED status. The actual frontend still needs to consume these fields and pass its own acceptance tests.

The async analysis listener runs AFTER_COMMIT so uploaded job/snapshot records are visible to its separate DB transaction. `fallbackExecution=true` preserves explicitly published events outside a transaction for legacy internal callers. This is still the existing auto-analyze ingestion flow; the SRS requirement to separate import from an explicit analysis action remains an independent migration gate, not solved by the after-commit fix.

## Diagram and evidence API

Publication creates DEPENDENCY_GRAPH/SERVICE, C4/CONTAINER and C4/COMPONENT diagram rows in one batch inside the model transaction. These are deterministic grid projections of the selected saved model, not an independent re-analysis or a validated architectural interpretation. A pure code snapshot with no declared services can legitimately have an empty container/service view. Partial models retain partial semantics from their job manifest.

- `GET /api/v1/analyzer/models/{modelVersionId}/diagrams`
- `GET /api/v1/analyzer/diagrams/{diagramId}`
- `PUT /api/v1/analyzer/diagrams/{diagramId}/layout` with `{"nodes":[{"id":"<existing node UUID>","x":123,"y":456}]}`
- `GET /api/v1/analyzer/evidences/element/{elementId}`
- `GET /api/v1/analyzer/evidences/relationship/{relationshipId}`

Layout updates accept only known node coordinates (finite/bounded values, no duplicate IDs); they cannot insert nodes/edges, change ownership, rename model elements or alter evidence. Evidence DTOs expose modelVersionId/sourceSnapshotId, locator, adapter and provenance without fabricated snippets. These endpoints currently enforce project-owner access through the existing SecurityUtils policy. Shared workspace/lecturer access and production JWT acceptance remain separate platform policy work. Browser rendering and interaction have not been acceptance-tested.

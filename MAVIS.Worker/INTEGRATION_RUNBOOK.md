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
- Java name/fuzzy service matching from the pre-existing pipeline is not used for the C# import. Cross-language endpoint/service reconciliation remains a separate unresolved mapping gate; do not feed unreviewed module/alias edges directly into service impact.

## Reproduce integration tests

Publish the committed producer (or a clean export) with SDK 10.0.204:

```powershell
cd MAVIS.Worker
dotnet publish src/MAVIS.Worker.Api/MAVIS.Worker.Api.csproj -c Release -p:RestoreLockedMode=true -p:UseAppHost=false -o .artifacts/worker-publish
pwsh -File scripts/Test-JavaWorkerIntegration.ps1 -Database
```

Requires Docker Linux Engine and Maven image availability. The script runs a non-root Worker process with readonly root/source mount, a Java 21 test container and optional fresh PostgreSQL 16 database. No host ports are published. It tests actual platform client calls and optional canonical DB publication, and removes its named containers/network. Maven cache and staged artifacts remain under ignored `.artifacts/`; production retention/quota/janitor is not implemented by this test harness.

Database test applies V1, V2 and V3 on a disposable database, then verifies publication/reload, provenance, duplicate/foreign attempt rejection, missing C# policy, partial draft preservation, SQL failure rollback and cancellation. It is a service-layer vertical slice, not an authenticated public upload/controller or frontend acceptance test. Dataset-dependent full Java suite still requires the missing fruit-market fixture to be repaired separately.

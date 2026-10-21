# MAVIS Dedicated Runner

`src/MAVIS.Runner` is a separate .NET 8 executable. The Roslyn API does not launch Docker. The local PoC adapter supports prebuilt, content-addressed Linux images and synchronous HTTP scenarios. It is not a production service for unrestricted repositories.

## Reproduce the two sample projects

Use PowerShell 7, the pinned .NET SDK 10.0.204 (global.json), and Docker Desktop with Linux Engine running. Initialization downloads official artifacts, verifies agent SHA-256 values, builds only MAVIS-owned samples and creates a reusable instrumentation volume. It needs internet access and Docker disk space.

From `MAVIS.Worker`:

```powershell
./samples/runtime-poc/Initialize-Poc.ps1
./samples/runtime-poc/Invoke-Poc.ps1 -Case Success
./samples/runtime-poc/Invoke-Poc.ps1 -Case Failure
./samples/runtime-poc/Invoke-Poc.ps1 -Case StartupFailure
./samples/runtime-poc/Invoke-Poc.ps1 -Case Timeout
./samples/runtime-poc/Invoke-Poc.ps1 -Case Cancel
./samples/runtime-poc/Invoke-Poc.ps1 -Case SecondProject
```

Project one is ASP.NET Core Orders -> Spring Boot Payment. Project two is Spring Boot Gateway -> ASP.NET Core Catalog. Scenarios use stateless test endpoints; the repeat test does not validate reset of a real database or authenticated business data.

The scripts check execution/scenario/evidence/cleanup outcomes and require the expected parent-child service interaction in successful/request-failure traces. Artifacts under `samples/runtime-poc/artifacts/` are gitignored. Curated acceptance evidence is in `samples/runtime-poc/POC_EVIDENCE.json`; raw telemetry and credentials are not committed.

Reusable image caches and the managed instrumentation volume remain for repeat runs. They are profile artifacts, distinct from session containers/networks/volumes, which are removed and checked after each session. Keep the operator state root private and outside target source. Do not expose this CLI or its Docker socket to target applications.

## Profile tested by the local PoC

- Linux x64/glibc .NET 8 and Java 21/Spring Boot 3.5.7 samples.
- .NET automatic instrumentation 1.17.0, Java agent 2.32.0, Collector contrib 0.163.1. Runtime/Collector image digests and agent checksums are pinned in the bootstrap script; application and scenario-runner image IDs are recorded after build.
- Bundle volume has `mavis.dotnet.version` and `mavis.java.version` labels checked against the selected profile. These labels declare operator-provisioned versions; they are not a cryptographic attestation of mutable volume contents. Bootstrap verifies downloaded bytes before provisioning.
- Explicit literal Compose environment, image IDs/repository digests, bounded service count and session-owned named data volumes. No Compose build, host ports, host mounts, devices, privilege escalation, host networking, external data volumes, env_file, interpolation or YAML aliases from target input.
- The generated override attaches the trusted instrumentation volume read-only and a trusted generated Collector config. Apps, scenario runner and Collector share an internal network; no application port is published on the host. The first live experiment showed `internal` publishing did not yield a usable host endpoint, so HTTP execution now runs inside that network.
- Resource/capability controls are inspected against Docker HostConfig before execution: memory, CPU, PIDs, read-only root filesystem, dropped capabilities and no-new-privileges; internal network is checked separately. A mismatch fails the session. This remains shared-kernel container isolation on a developer machine, not acceptance of the required dedicated production execution host.

The tested samples do not establish compatibility with every image, JVM, distribution, architecture, framework or instrumentation version. Building arbitrary repositories and unrestricted asynchronous tracing remain outside this adapter's profile.

## Commands and contract

```powershell
dotnet run --project src/MAVIS.Runner -- preflight C:/test/compose.yaml
dotnet run --project src/MAVIS.Runner -- plan C:/test/session.json C:/test/collector.yaml
dotnet run --project src/MAVIS.Runner -- scenario C:/test/scenario.json C:/test/endpoints.json
dotnet run --project src/MAVIS.Runner -- correlate session-001 model-001 C:/test/otlp.json C:/test/mappings.json
```

`preflight` only checks syntax/profile compatibility and reports limitations. It does not build, allocate, start or establish readiness. `plan` emits the temporary override for review; it also does not run containers.

Host-only `scenario` accepts known loopback HTTP endpoints, disallows redirects and does not load secrets from command arguments. Internal `stdin-scenario` is used only by the allocator's constrained scenario container: endpoint hostnames must match configured service names. Scenario definitions and protected values are sent through stdin, not process arguments. Backend callers can provide protected reference values in memory; the local CLI examples are anonymous samples and do not implement a platform secret store.

`RuntimeRunDefinition` fixes session/model/source/profile/run-configuration/scenario version IDs, Compose input, an approved local PoC profile, scenario and confirmed model mappings. See `Invoke-Poc.ps1` for an executable payload example. `RunnerExecutionProfile` requires a content-addressed Collector image, instrumentation volume, application runtime/port/readiness mappings, resource/deadline limits, approvedForLocalPoc and a content-addressed scenario-runner image.

```powershell
$env:MAVIS_RUNNER_ALLOW_LOCAL_POC = '1'
dotnet run --project src/MAVIS.Runner -- run C:/test/session.json C:/test/collector.yaml C:/private/mavis-runner-state
```

One allocator lease is allowed per state root. All local invocations must use the same operator-managed root; this does not replace a platform-wide capacity policy. Each session uses a generated `mavisrun-<32 hex>` project name. stderr emits `MAVIS_SESSION_RESOURCE=<id>` for orchestration without revealing credentials. The receipt includes selected versions, actual application/Collector image IDs, declared instrumentation versions and sandbox-check outcome. Source/image correspondence and platform profile acceptance remain explicitly `Unverified` until the platform establishes them.

Scenario profile: ordered GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS, expected HTTP status, JSON bodies with string-variable substitution, earlier-step variables through object JSON pointers, literal headers or protected header references. Definitions, dependencies and known references are validated before allocation. Responses are bounded to 1 MiB; bodies/extracted values/headers are not returned in results. Setup/reset may be authored as ordinary supported HTTP requests; there is no automatic database rollback or guarantee that later reset steps run after a failed request.

## Cancellation, cleanup and recovery

Ctrl+C or creation of `<state-root>/<resource-project>/cancel.request` requests cancellation. Only the trusted operator/orchestrator should write this marker. The active work is stopped and then follows the same bounded preservation/teardown path. An accepted request is not a confirmed stop; inspect the final receipt.

Application workloads stop while Collector remains alive for their final flush; Collector then stops before evidence is copied. Active/rotated `traces*.json` files are bounded and processed before session volumes are removed. Capture failure never skips cleanup. Cleanup is confirmed only after Docker reports no session containers, networks or volumes with the generated project label. Failure retains session files and an explicit recovery requirement. Keep permissions on retained state restrictive because temporary Compose files may contain test settings.

For a dead allocator, use the exact generated project ID and original state root:

```powershell
$env:MAVIS_RUNNER_ALLOW_LOCAL_POC = '1'
dotnet run --project src/MAVIS.Runner -- recover C:/private/mavis-runner-state mavisrun-0123456789abcdef0123456789abcdef
```

Recovery refuses arbitrary project names/linked paths and acquires the same lease. It tears down only that project's resources and confirms all three resource types before deleting its directory. This command recovers cleanup; it does not reconstruct a killed process's in-memory scenario result or guarantee preservation of unflushed trace data. Automated platform reconciliation and durable result delivery remain integration work.

## Trace and result semantics

Trace correlation preserves original trace/span/parent IDs and derives causal edges without timestamp sorting or cross-trace concatenation. Cross-service causal interactions retain confirmed model IDs. Timing/status/HTTP response-code metadata is retained when available, while attributes, names, messages and events are not forwarded wholesale. Collector performs an allowlist transform before file export; final result projection removes remaining unsupported telemetry fields.

The receipt separates executionStatus, scenarioStatus, evidenceStatus, traceQuality, mappingStatus, cleanupStatus and caller-owned persistence. A failed HTTP scenario can have useful traces. Missing/invalid spans, cyclic parents, unmapped services and timing gaps remain warnings. HTTP runner injects a trace context without exporting a synthetic root span, so a missing parent can be expected and is still reported. Saved traces never prove complete execution coverage or remove static dependencies.

Java must authenticate/authorize runtime actions, provide verified version/artifact mappings, save the result durably and implement Admin oversight. Generate Diagram is a separate operation on saved evidence; this executable does not generate diagrams or publish model versions.

Instrumentation configuration follows the [official .NET settings](https://opentelemetry.io/docs/zero-code/dotnet/configuration/) and [Java agent setup](https://opentelemetry.io/docs/zero-code/java/agent/getting-started/). Revalidate compatibility when profile settings or versions change.

The Runner now targets .NET 10 and uses its own pinned ASP.NET 10 runtime image. Sample applications remain .NET 8. POC_EVIDENCE.json now includes net10RunnerRegression: both mixed-language directions, request failure, startup failure, timeout, cancellation and abandoned-allocator recovery passed on 21/10/2026. Earlier fields are retained as historical evidence. All seven checks confirmed cleanup; the successful/failing HTTP cases retained causal service interactions. This verifies the local PoC profile, not dedicated production isolation or Java result persistence. NuGet lock files are checked with dotnet restore --locked-mode.

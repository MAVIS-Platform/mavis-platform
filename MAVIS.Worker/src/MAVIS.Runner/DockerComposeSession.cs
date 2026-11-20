using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MAVIS.Runner;

public sealed record RuntimeRunDefinition(string SessionId, string ModelVersionId, string SourceSnapshotId,
    string ProfileVersionId, string ComposeYaml, RunnerExecutionProfile Profile, HttpScenarioDefinition Scenario,
    IReadOnlyDictionary<string, string> ConfirmedServiceMappings, string? RunConfigurationVersionId = null, string? ScenarioVersionId = null,
    string? ResourceProject = null, bool ProtectedEnvironmentAvailable = false,
    IReadOnlyList<RuntimeInfrastructureActionDefinition>? InfrastructureActions = null, bool InteractiveStudio = false);

public sealed record RuntimeInfrastructureActionDefinition(string Action, string Service, int? Replicas = null);
public sealed record RuntimeInfrastructureActionResult(string Action, string Service, int ReplicasBefore, int ReplicasAfter,
    JsonObject MetricsBefore, JsonObject MetricsAfter, DateTimeOffset PerformedAt, bool Confirmed);

/// <summary>Operator-invoked local PoC adapter. Not an internet-facing arbitrary repository execution service.</summary>
public sealed class DockerComposeSession(RuntimeRunDefinition definition, string stateRoot, string collectorConfiguration,
    IDockerCommands docker, IReadOnlyDictionary<string, string>? secrets = null,
    IRuntimeLifecycleObserver? lifecycle = null, JavaRuntimeClient? studio = null) : IRuntimeSessionBackend
{
    public string ResourceProject { get; } = RuntimeAllocation.ProjectName(definition.ResourceProject);
    public bool InteractiveStudio => definition.InteractiveStudio;
    public bool AllocationReserved { get; private set; }
    public string Stage { get; private set; } = "VALIDATE";
    public Dictionary<string, string> ActualImageIds { get; } = new(StringComparer.Ordinal);
    public bool ImageSourceCorrespondenceVerified { get; private set; }
    public bool SandboxEnforcementConfirmed { get; private set; }
    public Dictionary<string, string> DeclaredInstrumentationVersions { get; } = new(StringComparer.Ordinal);
    private string? _directory;
    private FileStream? _lease;
    private bool _resourcesMayExist;
    private readonly Dictionary<string, Uri> _endpoints = new();
    private readonly Dictionary<string, string> _studioTraceSteps = new(StringComparer.Ordinal);
    private readonly List<RuntimeInfrastructureActionResult> _observedActions = [];
    public IReadOnlyList<RuntimeInfrastructureActionResult> ObservedInfrastructureActions => _observedActions.AsReadOnly();

    public async Task PrepareAndStartAsync(CancellationToken ct)
    {
        if (!Path.IsPathFullyQualified(stateRoot) || string.IsNullOrWhiteSpace(definition.SessionId) ||
            definition.Scenario.SessionId != definition.SessionId || string.IsNullOrWhiteSpace(definition.ModelVersionId) ||
            string.IsNullOrWhiteSpace(definition.SourceSnapshotId) || string.IsNullOrWhiteSpace(definition.ProfileVersionId) ||
            string.IsNullOrWhiteSpace(definition.RunConfigurationVersionId) || string.IsNullOrWhiteSpace(definition.ScenarioVersionId))
            throw new ArgumentException("Invalid session provenance or operator state root.");
        var preflight = ComposePreflight.Check(definition.ComposeYaml);
        if (!preflight.Compatible) throw new RuntimeStageException("PREFLIGHT_FAILED");
        ValidateStudioTopology();
        _ = ComposeOverrideBuilder.Build(preflight, definition.Profile, Path.Combine(Path.GetFullPath(stateRoot), "validate", "collector.yaml"), secrets);
        if (!PinnedRunnerImage(definition.Profile.ScenarioRunnerImage)) throw new ArgumentException("A content-addressed scenario runner image is required.");
        new HttpScenarioRunner(allowContainerDns: true).ValidateDefinition(definition.Scenario,
            definition.Profile.Applications.ToDictionary(p => p.Key, p => new Uri($"http://{p.Key}:{p.Value.ContainerPort}")),
            secrets ?? new Dictionary<string, string>());
        Stage = "ALLOCATE";
        RuntimeAllocation.RejectLinks(stateRoot);
        var leasePath = Path.Combine(stateRoot, "runner-" + ResourceProject + ".lock");
        RuntimeAllocation.RejectLinks(leasePath);
        Directory.CreateDirectory(stateRoot);
        // Sessions are independent resources; serialize only the same resource project.
        _lease = new FileStream(leasePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        _directory = RuntimeAllocation.Reserve(Path.GetFullPath(stateRoot), ResourceProject, definition);
        AllocationReserved = true;
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(_directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var collectorPath = Path.Combine(_directory, "collector.yaml");
        Stage = "OVERRIDE";
        var overrides = ComposeOverrideBuilder.Build(preflight, definition.Profile, collectorPath, secrets);
        await File.WriteAllTextAsync(collectorPath, collectorConfiguration, ct);
        if (!OperatingSystem.IsWindows())
            File.SetUnixFileMode(collectorPath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.OtherRead);
        await File.WriteAllTextAsync(Path.Combine(_directory, "compose.yaml"), definition.ComposeYaml, ct);
        await File.WriteAllTextAsync(Path.Combine(_directory, "override.json"), overrides, ct);
        await CheckpointAsync("ALLOCATED", 1, ct);
        Stage = "DOCKER_INFO";
        var info = await docker.RunAsync(["info", "--format", "{{.OSType}}"], _directory, 10, ct);
        if (info.ExitCode != 0 || info.StandardOutput.Trim() != "linux") throw new InvalidOperationException("Linux Docker engine is unavailable.");
        Stage = "INSTRUMENTATION_PROFILE";
        var instrumentedRuntimes = definition.Profile.Applications.Values.Select(a => a.Runtime).Where(r => r != "passthrough").Distinct().ToArray();
        if (instrumentedRuntimes.Length > 0)
        {
            var volume = await docker.RunAsync(["volume", "inspect", "--format", "{{json .Labels}}", definition.Profile.InstrumentationVolume], _directory, 10, ct);
            if (volume.ExitCode != 0) throw new RuntimeStageException("INSTRUMENTATION_BUNDLE_UNAVAILABLE");
            using var labels = JsonDocument.Parse(volume.StandardOutput);
            foreach (var runtime in instrumentedRuntimes)
            {
                var isJava = runtime == "java";
                var label = runtime == "dotnet8-linux-x64-musl" ? "mavis.dotnet.musl.version"
                    : isJava ? "mavis.java.version" : "mavis.dotnet.version";
                var expected = isJava ? definition.Profile.JavaInstrumentationVersion : definition.Profile.DotnetInstrumentationVersion;
                if (string.IsNullOrWhiteSpace(expected) || !labels.RootElement.TryGetProperty(label, out var actual) || actual.GetString() != expected)
                    throw new RuntimeStageException("INSTRUMENTATION_VERSION_MISMATCH");
                DeclaredInstrumentationVersions[isJava ? "java" : "dotnet"] = expected;
            }
        }
        _resourcesMayExist = true; // Even a failed `up` may allocate partial resources.
        Stage = "DOCKER_UP";
        await Require(["up", "--detach", "--wait", "--wait-timeout", "90"], ct);
        Stage = "IMAGE_PROVENANCE";
        foreach (var service in preflight.Services.Append("mavis-collector"))
        {
            var containers = await Require(["ps", "--all", "--quiet", service], ct);
            var id = containers.StandardOutput.Trim();
            if (id.Length != 64 || !id.All(Uri.IsHexDigit)) throw new RuntimeStageException("INVALID_CONTAINER_ID");
            var inspected = await docker.RunAsync(["inspect", "--format", "{{.Image}}", id], _directory, 10, ct);
            if (inspected.ExitCode != 0 || !inspected.StandardOutput.Trim().StartsWith("sha256:", StringComparison.Ordinal))
                throw new RuntimeStageException("IMAGE_PROVENANCE_UNAVAILABLE");
            ActualImageIds[service] = inspected.StandardOutput.Trim();
            var requested = service == "mavis-collector"
                ? definition.Profile.CollectorImage
                : preflight.PinnedImages?.GetValueOrDefault(service);
            if (requested is null) throw new RuntimeStageException("IMAGE_SOURCE_CORRESPONDENCE_UNCONFIRMED");
            // Registry pins identify manifests. Docker reports a config image ID on each container.
            // Resolve the exact pinned reference locally before comparing the two image IDs.
            var expectedImageId = requested;
            if (!requested.StartsWith("sha256:", StringComparison.Ordinal))
            {
                var image = await docker.RunAsync(["image", "inspect", "--format", "{{.Id}}", requested], _directory, 10, ct);
                if (image.ExitCode != 0 || !image.StandardOutput.Trim().StartsWith("sha256:", StringComparison.Ordinal))
                    throw new RuntimeStageException("IMAGE_PROVENANCE_UNAVAILABLE");
                expectedImageId = image.StandardOutput.Trim();
            }
            if (!StringComparer.Ordinal.Equals(expectedImageId, ActualImageIds[service]))
                throw new RuntimeStageException("IMAGE_ID_MISMATCH");
            var config = await docker.RunAsync(["inspect", "--format", "{{json .HostConfig}}", id], _directory, 10, ct);
            if (config.ExitCode != 0) throw new RuntimeStageException("SANDBOX_ENFORCEMENT_UNCONFIRMED");
            using var host = JsonDocument.Parse(config.StandardOutput);
            var settings = host.RootElement;
            var memory = service == "mavis-collector" ? 256 : definition.Profile.MemoryMiB;
            var cpus = service == "mavis-collector" ? 1 : definition.Profile.Cpus;
            var pids = service == "mavis-collector" ? 64 : 256;
            if (settings.GetProperty("Privileged").GetBoolean() || !settings.GetProperty("ReadonlyRootfs").GetBoolean() ||
                settings.GetProperty("Memory").GetInt64() != memory * 1024L * 1024L ||
                settings.GetProperty("NanoCpus").GetInt64() != (long)(cpus * 1_000_000_000) ||
                settings.GetProperty("PidsLimit").GetInt64() != pids ||
                !settings.GetProperty("CapDrop").EnumerateArray().Any(c => c.GetString() == "ALL") ||
                !settings.GetProperty("SecurityOpt").EnumerateArray().Any(c => c.GetString()?.StartsWith("no-new-privileges", StringComparison.Ordinal) == true))
                throw new RuntimeStageException("SANDBOX_ENFORCEMENT_UNCONFIRMED");
        }
        var network = await docker.RunAsync(["network", "inspect", ResourceProject + "_default", "--format", "{{.Internal}}"], _directory, 10, ct);
        if (network.ExitCode != 0 || network.StandardOutput.Trim() != "true") throw new RuntimeStageException("INTERNAL_NETWORK_UNCONFIRMED");
        ImageSourceCorrespondenceVerified = true;
        SandboxEnforcementConfirmed = true;
        foreach (var app in definition.Profile.Applications)
            _endpoints[app.Key] = new Uri($"http://{app.Key}:{app.Value.ContainerPort}");
        _endpoints["mavis-collector"] = new Uri("http://mavis-collector:13133");

    }

    public async Task WaitUntilReadyAsync(CancellationToken ct)
    {
        Stage = "READINESS";
        var steps = definition.Profile.Applications.Select(p => new HttpScenarioStep(p.Key, p.Key, "GET", p.Value.ReadinessPath, 200, AllowClientError: p.Value.AllowClientErrorReadiness))
            .Append(new("collector", "mavis-collector", "GET", "/", 200)).ToArray();
        var probe = new HttpScenarioDefinition("readiness", steps, Math.Clamp(steps.Length * 3, 5, 30));
        for (var attempt = 0; attempt < 90; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            HttpScenarioOutcome? result = null;
            try
            {
                result = await RunInsideNetwork(probe, _endpoints, new Dictionary<string, string>(), ct);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                // A probe can time out while Docker is still warming up. The session deadline still applies.
                if (!await ScenarioContainerCleanup.RemoveAsync(docker, _directory!, ResourceProject, ct))
                    throw new RuntimeStageException("READINESS_PROBE_CLEANUP_UNCONFIRMED");
            }

            if (result?.Status == "Passed")
            {
                if (definition.InteractiveStudio && definition.Profile.StudioTopology is { } topology)
                {
                    var stopped = topology.Blocks.Where(block => block.InitiallyStopped).Select(block => block.Service)
                        .Concat(topology.Connections.Where(link => link.InitiallyStopped).Select(link => link.ControllerService))
                        .ToArray();
                    if (stopped.Length > 0)
                        await Require(new[] { "stop", "--timeout", "5" }.Concat(stopped).ToArray(), ct);
                }
                await CheckpointAsync("RUNNING", 2, ct);
                return;
            }
            await Task.Delay(1000, ct);
        }
        throw new RuntimeStageException("READINESS_NOT_CONFIRMED");
    }

    public async Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct)
    {
        Stage = "SCENARIO";
        _scenario = await ExecuteWorkloadAsync(ct);
        foreach (var step in _scenario.Steps) _studioTraceSteps[step.TraceId] = step.StepId;
        return _scenario;
    }

    private Task<HttpScenarioOutcome> ExecuteWorkloadAsync(CancellationToken ct) =>
        RunInsideNetwork(definition.Scenario, _endpoints.Where(p => p.Key != "mavis-collector").ToDictionary(),
            secrets ?? new Dictionary<string, string>(), ct);

    private void ValidateStudioTopology()
    {
        if (definition.Profile.StudioTopology is not { } topology) return;
        if (!definition.InteractiveStudio || topology.Version != 1 || topology.Blocks is null ||
            topology.Connections is null || topology.Blocks.Count is < 1 or > 10 || topology.Connections.Count > 20)
            throw new ArgumentException("Invalid prepared Studio topology.");
        var blocks = new HashSet<string>(StringComparer.Ordinal);
        foreach (var block in topology.Blocks)
            if (block is null || !definition.Profile.Applications.ContainsKey(block.Service) ||
                !definition.ConfirmedServiceMappings.ContainsKey(block.Service) ||
                string.IsNullOrWhiteSpace(block.Label) || block.Label.Length > 64 || !blocks.Add(block.Service))
                throw new ArgumentException("Invalid prepared Studio block.");
        var controllers = new HashSet<string>(StringComparer.Ordinal);
        var pairs = new HashSet<(string, string)>();
        foreach (var connection in topology.Connections)
            if (connection is null || !blocks.Contains(connection.From) || !blocks.Contains(connection.To) ||
                connection.From == connection.To || blocks.Contains(connection.ControllerService) ||
                !definition.Profile.Applications.ContainsKey(connection.ControllerService) ||
                !definition.ConfirmedServiceMappings.ContainsKey(connection.ControllerService) ||
                string.IsNullOrWhiteSpace(connection.Protocol) || connection.Protocol.Length > 32 ||
                !controllers.Add(connection.ControllerService) || !pairs.Add((connection.From, connection.To)))
                throw new ArgumentException("Invalid prepared Studio connection.");
    }

    public async Task<IReadOnlyList<RuntimeInfrastructureActionResult>> ExecuteInfrastructureActionsAsync(CancellationToken ct)
    {
        if (definition.InteractiveStudio) {
            if (studio is null) throw new RuntimeStageException("STUDIO_REQUIRES_MANAGED_RUNNER");
            var nextSample = DateTimeOffset.MinValue;
            while (true) {
                ct.ThrowIfCancellationRequested();
                if (DateTimeOffset.UtcNow >= nextSample) {
                    await PublishStudioTelemetryAsync(ct);
                    nextSample=DateTimeOffset.UtcNow.AddSeconds(8);
                }
                var command = await studio.NextStudioCommandAsync(definition.SessionId, ResourceProject, ct);
                if (command.FinishRequested) return _observedActions.ToArray();
                if (command.Command is null) { await Task.Delay(500, ct); continue; }
                var item = command.Command;
                RuntimeInfrastructureActionResult? result = null;
                var status = "FAILED";
                var resultCount = _observedActions.Count;
                try {
                    await ExecuteActionsAsync([new(item.Action, item.Service, item.Replicas)], ct);
                    result = _observedActions.Last();
                    status = result.Confirmed ? "CONFIRMED" : "FAILED";
                } catch (RuntimeStageException) {
                    result = _observedActions.Count > resultCount ? _observedActions.Last() : null;
                }
                await studio.AcknowledgeStudioActionAsync(definition.SessionId, ResourceProject, item.ActionId, status, result, ct);
                nextSample=DateTimeOffset.MinValue;
            }
        }
        return await ExecuteActionsAsync(definition.InfrastructureActions ?? [], ct);
    }

    private async Task<IReadOnlyList<RuntimeInfrastructureActionResult>> ExecuteActionsAsync(
        IReadOnlyList<RuntimeInfrastructureActionDefinition> requested, CancellationToken ct)
    {
        if (requested.Count == 0) return [];
        var results = _observedActions;
        bool replayable = definition.Scenario.Steps.Count > 0 && definition.Scenario.Steps.All(step => step.Method is "GET" or "HEAD");
        var beforeWorkload = replayable ? _scenario : null;
        foreach (var item in requested)
        {
            var action = item.Action?.Trim().ToUpperInvariant();
            var service = item.Service?.Trim();
            if (action is not ("STOP" or "START" or "SCALE") || string.IsNullOrWhiteSpace(service) ||
                !definition.Profile.Applications.ContainsKey(service))
                throw new RuntimeStageException("INFRASTRUCTURE_ACTION_INVALID");
            if (action == "SCALE" && item.Replicas is not (>= 1 and <= 8))
                throw new RuntimeStageException("REPLICA_BOUNDS_EXCEEDED");

            Stage = "INFRASTRUCTURE_" + action;
            var before = await ReadServiceMetrics(service, ct);
            if (action == "STOP") await Require(["stop", "--timeout", "5", service], ct);
            else if (action == "START") await Require(["start", service], ct);
            else await Require(["up", "--detach", "--no-deps", "--no-recreate", "--no-build", "--pull", "never",
                "--wait", "--wait-timeout", "30", "--scale", service + "=" + item.Replicas, service], ct);
            var after = await ReadServiceMetrics(service, ct);
            var expected = action switch
            {
                "STOP" => before.running > 0 && after.running == 0,
                "START" => before.running == 0 && after.running >= 1,
                _ => before.running > 0 && after.running == item.Replicas && before.running != after.running
            };
            if (expected && action is "START" or "SCALE")
                expected = await WaitForServiceReadyAsync(service, ct);
            var performedAt = DateTimeOffset.UtcNow;
            results.Add(new(action, service, before.running, after.running,
                Metrics(before, beforeWorkload), Metrics(after, null), performedAt, expected));
            var afterWorkload = expected && beforeWorkload is not null ? await ExecuteWorkloadAsync(ct) : null;
            if (afterWorkload is not null)
                foreach (var step in afterWorkload.Steps) _studioTraceSteps[step.TraceId] = step.StepId;
            results[^1] = results[^1] with { MetricsAfter = Metrics(after, afterWorkload) };
            beforeWorkload = afterWorkload;
            _scenario = afterWorkload ?? _scenario;
            if (!expected) throw new RuntimeStageException("INFRASTRUCTURE_ACTION_UNCONFIRMED");
        }
        return results;

        static JsonObject Metrics((int total, int running) value, HttpScenarioOutcome? workload)
        {
            var metrics = new JsonObject
            {
                ["replicas"] = value.total,
                ["runningReplicas"] = value.running
            };
            if (workload is not null)
            {
                var traceIds=new JsonArray();
                foreach(var traceId in workload.Steps.Select(step=>step.TraceId).Distinct()) traceIds.Add(traceId);
                metrics["traceIds"]=traceIds;
                var samples = workload.Steps.Select(step => step.ElapsedMilliseconds).Order().ToArray();
                metrics["requestCount"] = samples.Length;
                if (samples.Length > 0)
                {
                    metrics["p95LatencyMs"] = samples[(int)Math.Ceiling(samples.Length * 0.95) - 1];
                    metrics["errorRatePercent"] = 100d * workload.Steps.Count(step =>
                        step.StatusCode is null or >= 400) / samples.Length;
                }
            }
            return metrics;
        }
    }

    private async Task<bool> WaitForServiceReadyAsync(string service, CancellationToken ct)
    {
        var app = definition.Profile.Applications[service];
        var probe = new HttpScenarioDefinition("studio-readiness",
            [new("ready", service, "GET", app.ReadinessPath, 200, AllowClientError: app.AllowClientErrorReadiness)], 3);
        using var readinessDeadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        readinessDeadline.CancelAfter(TimeSpan.FromSeconds(30));
        while (!readinessDeadline.IsCancellationRequested)
        {
            ct.ThrowIfCancellationRequested();
            try {
                var outcome = await RunInsideNetwork(probe, _endpoints, new Dictionary<string, string>(), readinessDeadline.Token);
                if (outcome.Status == "Passed") return true;
            } catch (OperationCanceledException) when (!ct.IsCancellationRequested) {
                if (!await ScenarioContainerCleanup.RemoveAsync(docker, _directory!, ResourceProject, ct))
                    throw new RuntimeStageException("STUDIO_READINESS_PROBE_CLEANUP_UNCONFIRMED");
            }
            await Task.Delay(500, ct);
        }
        ct.ThrowIfCancellationRequested();
        return false;
    }

    private async Task<(int total, int running)> ReadServiceMetrics(string service, CancellationToken ct)
    {
        var all = await Require(["ps", "--all", "--quiet", service], ct);
        var running = await Require(["ps", "--quiet", service], ct);
        return (Lines(all.StandardOutput), Lines(running.StandardOutput));
        static int Lines(string value) => value.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).Length;
    }

    public async Task<TraceCorrelationResult?> PreserveEvidenceAsync(CancellationToken ct)
    {
        if (!_resourcesMayExist || _directory is null) return null;
        await Task.Delay(1500, ct); // Bounded final drain; does not assert complete trace coverage.
        await Require(new[] { "stop", "--timeout", "5" }.Concat(definition.Profile.Applications.Keys).ToArray(), ct);
        await Task.Delay(1500, ct); // Collector stays alive while application shutdown hooks flush spans.
        await Require(["stop", "--timeout", "5", "mavis-collector"], ct);
        return await ReadTraceEvidenceAsync(ct, live: false);
    }

    private async Task PublishStudioTelemetryAsync(CancellationToken ct)
    {
        var services = new List<object>();
        foreach (var service in definition.Profile.Applications.Keys) {
            var metrics=await ReadServiceMetrics(service,ct);
            var ids=await Require(["ps","--quiet",service],ct);
            var containerIds=ids.StandardOutput.Split((char[]?)null,StringSplitOptions.RemoveEmptyEntries);
            var stats=new List<object>();
            if(containerIds.Length>0) {
                var result=await docker.RunAsync(new[]{"stats","--no-stream","--format","{{json .}}"}.Concat(containerIds).ToArray(),_directory!,15,ct);
                foreach(var line in result.StandardOutput.Split('\n',StringSplitOptions.RemoveEmptyEntries)) {
                    try {
                        using var json=JsonDocument.Parse(line);
                        var data=json.RootElement;
                        stats.Add(new {containerId=data.GetProperty("Container").GetString(),cpu=data.GetProperty("CPUPerc").GetString(),
                            memory=data.GetProperty("MemUsage").GetString(),network=data.GetProperty("NetIO").GetString()});
                    } catch(Exception error) when(error is JsonException or KeyNotFoundException) { }
                }
            }
            var logs=await Command(["logs","--no-color","--tail","10",service],ct);
            var text=logs.StandardOutput;
            foreach(var secret in (secrets?.Values ?? []).Where(value=>!string.IsNullOrWhiteSpace(value)).OrderByDescending(value=>value.Length))
                text=text.Replace(secret,"[REDACTED]",StringComparison.Ordinal);
            services.Add(new {service,replicas=metrics.total,runningReplicas=metrics.running,stats,logs=text[..Math.Min(text.Length,4000)]});
        }
        var trace=await ReadTraceEvidenceAsync(ct,live:true);
        await studio!.PublishStudioTelemetryAsync(definition.SessionId,ResourceProject,new {
            observedAt=DateTimeOffset.UtcNow,services,
            spans=trace?.Spans.TakeLast(200).ToArray() ?? [],
            interactions=trace?.Interactions?.TakeLast(200).ToArray() ?? [],
            warnings=trace?.Warnings ?? [],workload=_scenario
        },ct);
    }

    private async Task<TraceCorrelationResult?> ReadTraceEvidenceAsync(CancellationToken ct, bool live)
    {
        if (_directory is null) return null;
        var directory = Path.Combine(_directory, "raw-traces");
        Directory.CreateDirectory(directory);
        var copied = await Command(["cp", "mavis-collector:/traces/.", directory], ct);
        if (copied.ExitCode != 0 || !Directory.Exists(directory)) return null;
        var paths = Directory.EnumerateFiles(directory, "traces*.json").Order(StringComparer.Ordinal).ToArray();
        if (paths.Length == 0) return null;
        if (paths.Length > 4 || paths.Sum(p => new FileInfo(p).Length) > 16_777_216) throw new InvalidOperationException("Trace artifact exceeds profile limits.");
        var resources = new JsonArray();
        foreach (var path in paths)
        {
            var text = await File.ReadAllTextAsync(path, ct);
            try { Append(JsonNode.Parse(text)); }
            catch (JsonException)
            {
                var lines=text.Split('\n',StringSplitOptions.RemoveEmptyEntries);
                for(var index=0;index<lines.Length;index++) {
                    ct.ThrowIfCancellationRequested();
                    try {Append(JsonNode.Parse(lines[index]));}
                    catch(JsonException) when(live && index==lines.Length-1) { }
                }
            }
        }
        var payload = new JsonObject { ["resourceSpans"] = resources }.ToJsonString();
        var stepMap = _studioTraceSteps.Count > 0 ? _studioTraceSteps : _scenario?.Steps.ToDictionary(s => s.TraceId, s => s.StepId);
        return TraceCorrelator.Correlate(definition.SessionId, definition.ModelVersionId, payload, definition.ConfirmedServiceMappings, stepMap);

        void Append(JsonNode? node)
        {
            if (node?["resourceSpans"] is JsonArray array)
                foreach (var resource in array) resources.Add(resource?.DeepClone());
        }
    }

    private HttpScenarioOutcome? _scenario;

    private async Task CheckpointAsync(string stage, int sequence, CancellationToken ct)
    {
        Stage = "ACK_" + stage;
        var notification = new RuntimeLifecycleEvent(definition.SessionId, definition.ModelVersionId,
            definition.SourceSnapshotId, definition.ProfileVersionId, definition.RunConfigurationVersionId!,
            definition.ScenarioVersionId!, ResourceProject, stage, sequence, DateTimeOffset.UtcNow);
        RuntimeLifecycleJournal.Record(stateRoot, notification);
        if (lifecycle is not null) await lifecycle.AcknowledgeAsync(notification, ct);
        ct.ThrowIfCancellationRequested();
    }

    public async Task<bool> CleanupAsync(CancellationToken ct)
    {
        try
        {
            if (_directory is null) return true;
            if (_resourcesMayExist)
            {
                var helpersRemoved = await ScenarioContainerCleanup.RemoveAsync(docker, _directory, ResourceProject, ct);
                var down = await Command(["down", "--volumes", "--remove-orphans", "--timeout", "5"], ct);
                if (down.ExitCode != 0) return false;
                // Confirm no containers with this generated project label remain, including stopped workloads.
                var remaining = await docker.RunAsync(["ps", "-aq", "--filter", "label=com.docker.compose.project=" + ResourceProject], _directory, 10, ct);
                if (remaining.ExitCode != 0 || !string.IsNullOrWhiteSpace(remaining.StandardOutput)) return false;
                foreach (var kind in new[] { "volume", "network" })
                {
                    var resources = await docker.RunAsync([kind, "ls", "-q", "--filter", "label=com.docker.compose.project=" + ResourceProject], _directory, 10, ct);
                    if (resources.ExitCode != 0 || !string.IsNullOrWhiteSpace(resources.StandardOutput)) return false;
                }
                if (!helpersRemoved) return false;
            }
            var expected = Path.Combine(Path.GetFullPath(stateRoot), ResourceProject);
            RuntimeAllocation.RejectLinks(_directory);
            if (!Path.GetFullPath(_directory).Equals(expected, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
                throw new InvalidOperationException("Unexpected cleanup target.");
            Directory.Delete(_directory, recursive: true);
            return true;
        }
        finally { _lease?.Dispose(); _lease = null; }
    }

    private async Task<HttpScenarioOutcome> RunInsideNetwork(HttpScenarioDefinition scenario, IReadOnlyDictionary<string, Uri> endpoints,
        IReadOnlyDictionary<string, string> protectedValues, CancellationToken ct)
    {
        var image = definition.Profile.ScenarioRunnerImage;
        if (image is null || !(image.StartsWith("sha256:", StringComparison.Ordinal) || image.Contains("@sha256:", StringComparison.Ordinal)))
            throw new RuntimeStageException("PINNED_SCENARIO_RUNNER_IMAGE_REQUIRED");
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };
        var input = JsonSerializer.Serialize(new ScenarioEnvelope(scenario, endpoints, protectedValues), options);
        var result = await docker.RunWithInputAsync(["run", "--rm", "--interactive", "--network", ResourceProject + "_default",
            "--label", "com.docker.compose.project=" + ResourceProject, "--label", "com.docker.compose.service=mavis-scenario",
            "--memory", "256m", "--cpus", "1", "--pids-limit", "64", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--env", "MAVIS_RUNNER_INTERNAL_NETWORK=1",
            // Container startup is outside the HTTP deadline; the session token still bounds the whole run.
            image, "stdin-scenario"], _directory!, Math.Min(300, scenario.TimeoutSeconds + 30), input, ct);
        if (string.IsNullOrWhiteSpace(result.StandardOutput)) throw new RuntimeStageException("SCENARIO_CONTAINER_FAILED");
        return JsonSerializer.Deserialize<HttpScenarioOutcome>(result.StandardOutput, options) ?? throw new RuntimeStageException("SCENARIO_OUTPUT_INVALID");
    }

    private Task<DockerCommandResult> Command(IReadOnlyList<string> arguments, CancellationToken ct) => docker.RunAsync(
        new[] { "compose", "--project-name", ResourceProject, "--file", Path.Combine(_directory!, "compose.yaml"), "--file", Path.Combine(_directory!, "override.json") }.Concat(arguments).ToArray(),
        _directory!, arguments[0] == "up" ? 120 : (arguments[0] is "down" or "stop" ? 45 : 15), ct);

    private static bool PinnedRunnerImage(string? image)
    {
        if (image is null) return false;
        var digest = image.StartsWith("sha256:", StringComparison.Ordinal) ? image[7..] :
            image.Contains("@sha256:", StringComparison.Ordinal) ? image.Split("@sha256:").Last() : "";
        return digest.Length == 64 && digest.All(Uri.IsHexDigit);
    }

    private async Task<DockerCommandResult> Require(IReadOnlyList<string> args, CancellationToken ct)
    {
        var result = await Command(args, ct);
        if (result.ExitCode != 0)
        {
            // Classify known infrastructure errors without exporting arbitrary stderr/source values.
            var category = result.StandardError?.Contains("invalid reference format", StringComparison.OrdinalIgnoreCase) == true ? "INVALID_IMAGE_REFERENCE" :
                result.StandardError?.Contains("must be a", StringComparison.OrdinalIgnoreCase) == true ? "INVALID_COMPOSE_SCHEMA" : "FAILED";
            throw new RuntimeStageException("DOCKER_" + args[0].ToUpperInvariant() + "_" + category);
        }
        return result;
    }
}

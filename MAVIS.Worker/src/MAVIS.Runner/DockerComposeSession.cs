using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MAVIS.Runner;

public sealed record RuntimeRunDefinition(string SessionId, string ModelVersionId, string SourceSnapshotId,
    string ProfileVersionId, string ComposeYaml, RunnerExecutionProfile Profile, HttpScenarioDefinition Scenario,
    IReadOnlyDictionary<string, string> ConfirmedServiceMappings, string? RunConfigurationVersionId = null, string? ScenarioVersionId = null,
    string? ResourceProject = null, bool ProtectedEnvironmentAvailable = false,
    IReadOnlyList<RuntimeInfrastructureActionDefinition>? InfrastructureActions = null, bool InteractiveStudio = false);

public sealed record RuntimeInfrastructureActionDefinition(string Action, string Service, int? Replicas = null, int? CpuPercent = null, int? TargetRps = null, string? EnvKey = null, string? EnvValue = null, string? TargetImage = null);
public sealed record RuntimeInfrastructureActionResult(string Action, string Service, int ReplicasBefore, int ReplicasAfter,
    JsonObject MetricsBefore, JsonObject MetricsAfter, DateTimeOffset PerformedAt, bool Confirmed);

/// <summary>Operator-invoked local PoC adapter. Not an internet-facing arbitrary repository execution service.</summary>
public sealed class DockerComposeSession(RuntimeRunDefinition definition, string stateRoot, string collectorConfiguration,
    IDockerCommands docker, IReadOnlyDictionary<string, string>? secrets = null,
    IRuntimeLifecycleObserver? lifecycle = null, JavaRuntimeClient? studio = null,
    string? ociRuntime = null, bool writableRootfsUnderKernelSandbox = true, Action? onRemoteCancel = null) : IRuntimeSessionBackend
{
    public string ResourceProject { get; } = RuntimeAllocation.ProjectName(definition.ResourceProject);
    public bool InteractiveStudio => definition.InteractiveStudio;
    public bool AllocationReserved { get; private set; }
    public string Stage { get; private set; } = "VALIDATE";
    public string IsolationRuntime { get; private set; } = "runc";
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
    private readonly List<string> _failureDiagnostics = [];
    private IReadOnlyList<string> _composeServices = [];
    private Dictionary<string, string> _originalPinnedImages = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Dictionary<string, string>> _actionEnvOverrides = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _actionImageOverrides = new(StringComparer.Ordinal);
    private bool _hasActionOverride;
    public IReadOnlyList<RuntimeInfrastructureActionResult> ObservedInfrastructureActions => _observedActions.AsReadOnly();
    public IReadOnlyList<string> FailureDiagnostics => _failureDiagnostics.AsReadOnly();

    public async Task PrepareAndStartAsync(CancellationToken ct)
    {
        if (!Path.IsPathFullyQualified(stateRoot) || string.IsNullOrWhiteSpace(definition.SessionId) ||
            definition.Scenario.SessionId != definition.SessionId || string.IsNullOrWhiteSpace(definition.ModelVersionId) ||
            string.IsNullOrWhiteSpace(definition.SourceSnapshotId) || string.IsNullOrWhiteSpace(definition.ProfileVersionId) ||
            string.IsNullOrWhiteSpace(definition.RunConfigurationVersionId) || string.IsNullOrWhiteSpace(definition.ScenarioVersionId))
            throw new ArgumentException("Invalid session provenance or operator state root.");
        var preflight = ComposePreflight.Check(definition.ComposeYaml);
        if (!preflight.Compatible) throw new RuntimeStageException("PREFLIGHT_FAILED");
        _composeServices = preflight.Services;
        _originalPinnedImages = preflight.PinnedImages is null
            ? new Dictionary<string, string>(StringComparer.Ordinal)
            : new Dictionary<string, string>(preflight.PinnedImages, StringComparer.Ordinal);
        ValidateStudioTopology();
        var requestedRuntime = ComposeOverrideBuilder.NormalizeOciRuntime(ociRuntime);
        _ = ComposeOverrideBuilder.Build(preflight, definition.Profile, Path.Combine(Path.GetFullPath(stateRoot), "validate", "collector.yaml"), secrets,
            requestedRuntime == "auto" ? null : requestedRuntime, writableRootfsUnderKernelSandbox);
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
        IsolationRuntime = await ResolveIsolationRuntimeAsync(docker, _directory, requestedRuntime, ct);
        if (ComposeOverrideBuilder.IsKernelSandboxedRuntime(IsolationRuntime))
        {
            overrides = ComposeOverrideBuilder.Build(preflight, definition.Profile, collectorPath, secrets, IsolationRuntime, writableRootfsUnderKernelSandbox);
            await File.WriteAllTextAsync(Path.Combine(_directory, "override.json"), overrides, ct);
        }
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
        Stage = "IMAGE_AVAILABILITY";
        if (preflight.PinnedImages is not null)
        {
            foreach (var pair in preflight.PinnedImages)
            {
                if (!pair.Value.StartsWith("sha256:", StringComparison.Ordinal)) continue;
                var localImg = await docker.RunAsync(["image", "inspect", "--format", "{{.Id}}", pair.Value], _directory, 10, ct);
                if (localImg.ExitCode != 0 || !localImg.StandardOutput.Trim().StartsWith("sha256:", StringComparison.Ordinal))
                    throw new RuntimeStageException(DiagnosticCode("LOCAL_IMAGE_MISSING", pair.Key));
            }
        }
        _resourcesMayExist = true; // Even a failed `up` may allocate partial resources.
        Stage = "DOCKER_UP";
        using var startupCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        using var cancelWatcherStop = new CancellationTokenSource();
        var cancelWatcher = WatchRemoteCancelDuringStartupAsync(startupCts, cancelWatcherStop.Token);
        try
        {
            await Require(["up", "--detach", "--wait", "--wait-timeout",
                Math.Clamp(definition.Profile.TimeoutSeconds, 1, 300).ToString(System.Globalization.CultureInfo.InvariantCulture)], startupCts.Token);
        }
        catch (Exception error) when (error is RuntimeStageException or OperationCanceledException)
        {
            // Startup cancellation must not discard logs before the lifecycle tears down containers.
            using var diagnostics = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await CaptureFailureDiagnosticsAsync(preflight.Services, diagnostics.Token);
            throw;
        }
        finally
        {
            cancelWatcherStop.Cancel();
            try { await cancelWatcher; } catch (OperationCanceledException) { }
        }
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
            var workloadUsesKernelSandbox = service != "mavis-collector" && ComposeOverrideBuilder.IsKernelSandboxedRuntime(IsolationRuntime);
            var expectReadonlyRootfs = service == "mavis-collector" || !(workloadUsesKernelSandbox && writableRootfsUnderKernelSandbox);
            if (settings.GetProperty("Privileged").GetBoolean() ||
                (expectReadonlyRootfs && !settings.GetProperty("ReadonlyRootfs").GetBoolean()) ||
                (workloadUsesKernelSandbox && (!settings.TryGetProperty("Runtime", out var actualRuntime) ||
                    !StringComparer.Ordinal.Equals(actualRuntime.GetString(), IsolationRuntime))) ||
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
        HttpScenarioOutcome? lastResult = null;
        using var readinessCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        using var cancelWatcherStop = new CancellationTokenSource();
        var cancelWatcher = WatchRemoteCancelDuringStartupAsync(readinessCts, cancelWatcherStop.Token);
        var effectiveCt = readinessCts.Token;
        try
        {
            for (var attempt = 0; attempt < 120; attempt++)
            {
                effectiveCt.ThrowIfCancellationRequested();
                HttpScenarioOutcome? result = null;
                try
                {
                    result = await RunInsideNetwork(probe, _endpoints, new Dictionary<string, string>(), effectiveCt);
                }
                catch (OperationCanceledException) when (!effectiveCt.IsCancellationRequested)
                {
                    // A probe can time out while Docker is still warming up. The session deadline still applies.
                    if (!await ScenarioContainerCleanup.RemoveAsync(docker, _directory!, ResourceProject, effectiveCt))
                        throw new RuntimeStageException("READINESS_PROBE_CLEANUP_UNCONFIRMED");
                }

                if (result is not null) lastResult = result;
                if (result?.Status == "Passed")
                {
                    if (definition.Profile.SeedHook is { } seed)
                        await ExecuteSeedHookAsync(seed, effectiveCt);
                    if (definition.InteractiveStudio && definition.Profile.StudioTopology is { } topology)
                    {
                        var stopped = topology.Blocks.Where(block => block.InitiallyStopped).Select(block => block.Service)
                            .Concat(topology.Connections.Where(link => link.InitiallyStopped).Select(link => link.ControllerService))
                            .ToArray();
                        if (stopped.Length > 0)
                            await Require(new[] { "stop", "--timeout", "5" }.Concat(stopped).ToArray(), effectiveCt);
                    }
                    await CheckpointAsync("RUNNING", 2, effectiveCt);
                    return;
                }
                await Task.Delay(2000, effectiveCt);
            }
        }
        catch (OperationCanceledException) when (effectiveCt.IsCancellationRequested)
        {
            // The session deadline usually ends readiness; still record which probe failed and why, then rethrow.
            RecordReadinessFailures(lastResult);
            using var diagnostics = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await CaptureFailureDiagnosticsAsync(_composeServices.Count > 0 ? _composeServices : definition.Profile.Applications.Keys, diagnostics.Token);
            throw;
        }
        finally
        {
            cancelWatcherStop.Cancel();
            try { await cancelWatcher; } catch (OperationCanceledException) { }
        }
        RecordReadinessFailures(lastResult);
        await CaptureFailureDiagnosticsAsync(_composeServices.Count > 0 ? _composeServices : definition.Profile.Applications.Keys, ct);
        throw new RuntimeStageException("READINESS_NOT_CONFIRMED");
    }

    private void RecordReadinessFailures(HttpScenarioOutcome? lastResult)
    {
        if (lastResult?.Steps is null)
        {
            RecordDiagnostic("READINESS_NO_PROBE_RESULT");
            return;
        }
        foreach (var failed in lastResult.Steps.Where(step => step.Status != "Passed"))
        {
            var suffix = failed.StatusCode is int statusCode ? "HTTP_" + statusCode : "UNREACHABLE";
            RecordDiagnostic(DiagnosticCode("READINESS_FAILED", failed.StepId, suffix));
        }
    }

    public async Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct)
    {
        Stage = "SCENARIO";
        _scenario = await ExecuteWorkloadAsync(ct);
        RememberTraceSteps(_scenario);
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
            // Publish the initial baseline frame before entering the command loop so the UI gets an immediate observedAt.
            await PublishStudioTelemetrySafeAsync(ct);
            using var telemetryStop = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var probeName = ResourceProject + "-probe";
            _currentProbeRps = Math.Clamp(definition.Profile.ProbeRps, 1, 50);
            var probeHandle = await StartLiveProbeAsync(probeName, telemetryStop.Token);
            _probeStream = probeHandle as ILineStreamHandle;
            var telemetryLoop = RunTelemetryLoopAsync(telemetryStop.Token);
            try {
                var consecutivePollErrors = 0;
                while (true) {
                    ct.ThrowIfCancellationRequested();
                    Stage = "STUDIO_LOOP";
                    JavaRuntimeClient.StudioPoll command;
                    try {
                        command = await studio.NextStudioCommandAsync(definition.SessionId, ResourceProject, ct);
                        consecutivePollErrors = 0;
                    } catch (Exception) when (!ct.IsCancellationRequested && ++consecutivePollErrors <= 3) {
                        await Task.Delay(1000, ct);
                        continue;
                    }
                    if (command.CancelRequested)
                    {
                        onRemoteCancel?.Invoke();
                        ct.ThrowIfCancellationRequested();
                        throw new OperationCanceledException(ct);
                    }
                    if (command.FinishRequested) return _observedActions.ToArray();
                    if (command.Command is null) { await Task.Delay(400, ct); continue; }
                    var item = command.Command;
                    RuntimeInfrastructureActionResult? result = null;
                    var status = "FAILED";
                    var resultCount = _observedActions.Count;
                    try {
                        await ExecuteActionsAsync([new(item.Action, item.Service, item.Replicas, item.CpuPercent, item.TargetRps, item.EnvKey, item.EnvValue, item.TargetImage)], ct);
                        result = _observedActions.Last();
                        status = result.Confirmed ? "CONFIRMED" : "FAILED";
                    } catch (Exception) when (!ct.IsCancellationRequested) {
                        // Any single action failure (command timeout, bad probe output) is acknowledged, not fatal to the session.
                        result = _observedActions.Count > resultCount ? _observedActions.Last() : null;
                    } finally {
                        Stage = "STUDIO_LOOP";
                    }
                    await AcknowledgeActionSafeAsync(item.ActionId, status, result, ct);
                    // Publish the post-action frame before polling the next command or finishRequested so no action's state is lost.
                    _forceTraceRefresh = true;
                    await PublishStudioTelemetrySafeAsync(ct);
                }
            } finally {
                _probeStream = null;
                telemetryStop.Cancel();
                try { await telemetryLoop; } catch (OperationCanceledException) { }
                if (probeHandle is not null)
                {
                    try { await probeHandle.DisposeAsync(); } catch { }
                    try
                    {
                        using var rmCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                        await docker.RunAsync(["rm", "--force", probeName], _directory!, 5, rmCts.Token);
                    }
                    catch { }
                }
            }
        }
        return await ExecuteActionsAsync(definition.InfrastructureActions ?? [], ct);
    }

    private async Task AcknowledgeActionSafeAsync(string actionId, string status, RuntimeInfrastructureActionResult? result, CancellationToken ct)
    {
        if (studio is null) return;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                await studio.AcknowledgeStudioActionAsync(definition.SessionId, ResourceProject, actionId, status, result, ct);
                return;
            }
            catch (Exception) when (!ct.IsCancellationRequested && attempt == 0)
            {
                await Task.Delay(500, ct);
            }
            catch (Exception) when (!ct.IsCancellationRequested)
            {
                if (status == "CONFIRMED")
                {
                    try { await studio.AcknowledgeStudioActionAsync(definition.SessionId, ResourceProject, actionId, "FAILED", null, ct); }
                    catch (Exception) when (!ct.IsCancellationRequested) { }
                }
                return;
            }
        }
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
            if (action is not ("STOP" or "START" or "SCALE" or "PAUSE" or "RESUME" or "THROTTLE_CPU" or "SET_LOAD" or "SET_ENV" or "SWAP_VERSION") || string.IsNullOrWhiteSpace(service) ||
                !definition.Profile.Applications.ContainsKey(service))
                throw new RuntimeStageException("INFRASTRUCTURE_ACTION_INVALID");
            if (action == "SCALE" && item.Replicas is not (>= 1 and <= 3))
                throw new RuntimeStageException("REPLICA_BOUNDS_EXCEEDED");
            if (action == "THROTTLE_CPU" && item.CpuPercent is not (>= 10 and <= 100))
                throw new RuntimeStageException("CPU_THROTTLE_BOUNDS_EXCEEDED");
            if (action == "SET_LOAD" && item.TargetRps is not (>= 1 and <= 50))
                throw new RuntimeStageException("LOAD_BOUNDS_EXCEEDED");
            if (action == "SET_ENV" && !IsAllowedRuntimeEnvOverride(service, item.EnvKey, item.EnvValue))
                throw new RuntimeStageException("ENV_OVERRIDE_INVALID");
            if (action == "SWAP_VERSION" && !IsAllowedAlternateImage(service, item.TargetImage))
                throw new RuntimeStageException("SWAP_IMAGE_INVALID");

            Stage = "INFRASTRUCTURE_" + action;
            var before = await ReadServiceState(service, ct);
            // Spring Boot + OTel javaagent + Kafka/RabbitMQ replicas can take ~65s under load to pass healthchecks cleanly.
            var actionWaitTimeout = ComposeOverrideBuilder.IsKernelSandboxedRuntime(IsolationRuntime) ? "150" : "120";
            double? appliedCpus = null;
            int? rpsBefore = null;
            int? rpsAfter = null;
            string? appliedEnvKey = null;
            string? appliedEnvVal = null;
            string? imageBefore = null;
            string? imageAfter = null;
            if (action == "STOP") await Require(["stop", "--timeout", "5", service], ct);
            else if (action == "START") await Require(["start", service], ct);
            else if (action == "PAUSE") await Require(["pause", service], ct);
            else if (action == "RESUME") await Require(["unpause", service], ct);
            else if (action == "THROTTLE_CPU")
            {
                if (before.runningIds.Length == 0) throw new RuntimeStageException("INFRASTRUCTURE_ACTION_UNCONFIRMED");
                appliedCpus = Math.Min(definition.Profile.Cpus, Math.Max(0.05, Math.Round(definition.Profile.Cpus * item.CpuPercent!.Value / 100.0, 2)));
                var cpuArg = appliedCpus.Value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
                var updated = await docker.RunAsync(new[] { "update", "--cpus", cpuArg }.Concat(before.runningIds).ToArray(), _directory!, 15, ct);
                if (updated.ExitCode != 0) throw new RuntimeStageException("DOCKER_UPDATE_FAILED");
            }
            else if (action == "SET_LOAD")
            {
                if (_probeStream is null) throw new RuntimeStageException("LIVE_PROBE_UNAVAILABLE");
                rpsBefore = _currentProbeRps > 0 ? _currentProbeRps : Math.Clamp(definition.Profile.ProbeRps, 1, 50);
                rpsAfter = item.TargetRps!.Value;
                var cmdJson = JsonSerializer.Serialize(new { targetRps = rpsAfter.Value });
                await _probeStream.WriteLineAsync(cmdJson, ct);
                _currentProbeRps = rpsAfter.Value;
            }
            else if (action == "SET_ENV")
            {
                appliedEnvKey = item.EnvKey!.Trim();
                appliedEnvVal = item.EnvValue!;
                if (!_actionEnvOverrides.TryGetValue(service, out var envMap))
                    _actionEnvOverrides[service] = envMap = new Dictionary<string, string>(StringComparer.Ordinal);
                var hadPrevEnv = envMap.TryGetValue(appliedEnvKey, out var prevEnvVal);
                envMap[appliedEnvKey] = appliedEnvVal;
                await WriteActionOverrideAsync(ct);
                try
                {
                    await Require(["up", "--detach", "--no-deps", "--force-recreate", "--no-build", "--pull", "never",
                        "--wait", "--wait-timeout", actionWaitTimeout, service], ct);
                }
                catch
                {
                    if (hadPrevEnv) envMap[appliedEnvKey] = prevEnvVal!;
                    else envMap.Remove(appliedEnvKey);
                    await WriteActionOverrideAsync(CancellationToken.None);
                    throw;
                }
            }
            else if (action == "SWAP_VERSION")
            {
                imageBefore = _actionImageOverrides.GetValueOrDefault(service) ?? _originalPinnedImages.GetValueOrDefault(service) ?? "";
                imageAfter = item.TargetImage!.Trim();
                var hadPrevImage = _actionImageOverrides.TryGetValue(service, out var prevImgVal);
                _actionImageOverrides[service] = imageAfter;
                await WriteActionOverrideAsync(ct);
                try
                {
                    await Require(["up", "--detach", "--no-deps", "--force-recreate", "--no-build", "--pull", "never",
                        "--wait", "--wait-timeout", actionWaitTimeout, service], ct);
                }
                catch
                {
                    if (hadPrevImage) _actionImageOverrides[service] = prevImgVal!;
                    else _actionImageOverrides.Remove(service);
                    await WriteActionOverrideAsync(CancellationToken.None);
                    throw;
                }
            }
            else await Require(["up", "--detach", "--no-deps", "--no-recreate", "--no-build", "--pull", "never",
                "--wait", "--wait-timeout", actionWaitTimeout, "--scale", service + "=" + item.Replicas, service], ct);
            var after = await ReadServiceState(service, ct);
            if (action == "RESUME" && (after.paused > 0 || after.running == 0))
            {
                for (var settle = 0; settle < 4 && (after.paused > 0 || after.running == 0); settle++)
                {
                    await Task.Delay(250, ct);
                    after = await ReadServiceState(service, ct);
                }
            }
            else if (action == "PAUSE" && (after.paused == 0 || after.running > 0))
            {
                for (var settle = 0; settle < 4 && (after.paused == 0 || after.running > 0); settle++)
                {
                    await Task.Delay(250, ct);
                    after = await ReadServiceState(service, ct);
                }
            }
            var expected = action switch
            {
                "STOP" => before.running > 0 && after.running == 0,
                "START" => before.running == 0 && after.running >= 1,
                "PAUSE" => before.running > 0 && after.running == 0 && after.paused > 0,
                "RESUME" => before.paused > 0 && after.running >= 1 && after.paused == 0,
                "THROTTLE_CPU" => before.running > 0 && after.running == before.running,
                "SET_LOAD" => after.running == before.running && rpsAfter is >= 1 and <= 50,
                "SET_ENV" => after.running >= 1 && !string.IsNullOrEmpty(appliedEnvKey),
                "SWAP_VERSION" => after.running >= 1 && !string.IsNullOrEmpty(imageAfter),
                _ => before.running > 0 && after.running == item.Replicas && before.running != after.running
            };
            if (expected && action is "START" or "SCALE" or "RESUME" or "SET_ENV" or "SWAP_VERSION")
                expected = await WaitForServiceReadyAsync(service, ct);
            var performedAt = DateTimeOffset.UtcNow;
            results.Add(new(action, service, before.running, after.running,
                Metrics(before, beforeWorkload, null, null, rpsBefore, null, null, imageBefore),
                Metrics(after, null, item.CpuPercent, appliedCpus, rpsAfter, appliedEnvKey, appliedEnvVal is null ? null : RedactSecrets(appliedEnvVal), imageAfter),
                performedAt, expected));
            var afterWorkload = expected && beforeWorkload is not null ? await ExecuteWorkloadAsync(ct) : null;
            if (afterWorkload is not null)
                RememberTraceSteps(afterWorkload);
            results[^1] = results[^1] with { MetricsAfter = Metrics(after, afterWorkload, item.CpuPercent, appliedCpus, rpsAfter, appliedEnvKey, appliedEnvVal is null ? null : RedactSecrets(appliedEnvVal), imageAfter) };
            beforeWorkload = afterWorkload;
            _scenario = afterWorkload ?? _scenario;
            if (!expected) throw new RuntimeStageException("INFRASTRUCTURE_ACTION_UNCONFIRMED");
        }
        return results;

        static JsonObject Metrics((int total, int running, int paused, string[] runningIds) value, HttpScenarioOutcome? workload,
            int? cpuPercent, double? appliedCpus, int? targetRps, string? envKey, string? envValue, string? image)
        {
            var metrics = new JsonObject
            {
                ["replicas"] = value.total,
                ["runningReplicas"] = value.running
            };
            if (value.paused > 0) metrics["pausedReplicas"] = value.paused;
            if (cpuPercent is int pct) metrics["cpuPercent"] = pct;
            if (appliedCpus is double cpus) metrics["targetCpus"] = cpus;
            if (targetRps is int rps) metrics["targetRps"] = rps;
            if (!string.IsNullOrEmpty(envKey)) metrics["envKey"] = envKey;
            if (envValue is not null) metrics["envValue"] = envValue;
            if (!string.IsNullOrEmpty(image)) metrics["image"] = image;
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
                    metrics["errorRatePercent"] = 100d * workload.Steps.Count(step => step.Status != "Passed") / samples.Length;
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
        // A restarted JVM can legitimately need more than 30 seconds to become ready on a
        // CPU-limited runner. Treating that warm-up as an infrastructure-action failure makes
        // STOP -> START flaky even though Docker has started the service successfully.
        var readinessSeconds = 60;
        readinessDeadline.CancelAfter(TimeSpan.FromSeconds(readinessSeconds));
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
            await Task.Delay(2000, ct);
        }
        ct.ThrowIfCancellationRequested();
        return false;
    }

    private async Task<(int total, int running, int paused, string[] runningIds)> ReadServiceState(string service, CancellationToken ct)
    {
        var ps = await Require(["ps", "--all", "--format", "{{.ID}}|{{.State}}", service], ct);
        var total = 0;
        var paused = 0;
        var runningIds = new List<string>();
        foreach (var rawLine in ps.StandardOutput.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = rawLine.Split('|');
            var id = parts[0].Trim();
            if (string.IsNullOrEmpty(id)) continue;
            total++;
            var state = parts.Length > 1 ? parts[1].Trim() : "";
            if (state.Equals("running", StringComparison.OrdinalIgnoreCase))
                runningIds.Add(id);
            else if (state.Equals("paused", StringComparison.OrdinalIgnoreCase))
                paused++;
        }
        return (total, runningIds.Count, paused, runningIds.ToArray());
    }

    private async Task<List<(string Service, int Total, int Running, string[] Ids)>> ReadAllServiceStatesAsync(CancellationToken ct)
    {
        var ps = await Command(["ps", "--all", "--format", "{{.Service}}|{{.ID}}|{{.State}}"], ct);
        var totals = new Dictionary<string, int>(StringComparer.Ordinal);
        var running = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (ps.ExitCode == 0 && !string.IsNullOrWhiteSpace(ps.StandardOutput))
        {
            foreach (var rawLine in ps.StandardOutput.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = rawLine.Split('|');
                if (parts.Length < 3) continue;
                var svc = parts[0].Trim();
                var id = parts[1].Trim();
                var state = parts[2].Trim();
                if (string.IsNullOrEmpty(svc) || string.IsNullOrEmpty(id)) continue;
                totals[svc] = totals.GetValueOrDefault(svc) + 1;
                if (state.Equals("running", StringComparison.OrdinalIgnoreCase))
                {
                    if (!running.TryGetValue(svc, out var list)) running[svc] = list = [];
                    list.Add(id);
                }
            }
        }
        var states = new List<(string Service, int Total, int Running, string[] Ids)>();
        foreach (var service in definition.Profile.Applications.Keys)
        {
            var ids = running.TryGetValue(service, out var list) ? list.ToArray() : [];
            states.Add((service, totals.GetValueOrDefault(service), ids.Length, ids));
        }
        return states;
    }

    private IReadOnlyDictionary<string, string>? SnapshotTraceSteps()
    {
        lock (_studioTraceSteps)
        {
            if (_studioTraceSteps.Count > 0) return new Dictionary<string, string>(_studioTraceSteps, StringComparer.Ordinal);
        }
        return _scenario?.Steps.GroupBy(s => s.TraceId).ToDictionary(g => g.Key, g => g.First().StepId);
    }

    private void RememberTraceSteps(HttpScenarioOutcome outcome)
    {
        lock (_studioTraceSteps)
            foreach (var step in outcome.Steps) _studioTraceSteps[step.TraceId] = step.StepId;
    }

    private static readonly TimeSpan TelemetryInterval = TimeSpan.FromSeconds(2);
    private readonly SemaphoreSlim _telemetryGate = new(1, 1);
    private readonly object _probeLock = new();
    private ILineStreamHandle? _probeStream;
    private int _currentProbeRps = 1;
    private JsonNode? _latestProbeNode;
    private JsonNode? _latestServiceGraphNode;
    private TraceCorrelationResult? _lastLiveTrace;
    private int _telemetryPublishCount;
    private volatile bool _forceTraceRefresh = true;

    private async Task<IAsyncDisposable?> StartLiveProbeAsync(string containerName, CancellationToken ct)
    {
        if (_directory is null || !PinnedRunnerImage(definition.Profile.ScenarioRunnerImage)) return null;
        var appEndpoints = _endpoints.Where(p => p.Key != "mavis-collector").ToDictionary(p => p.Key, p => p.Value);
        if (appEndpoints.Count == 0) return null;
        try
        {
            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var envelope = new LiveProbeEnvelope(
                definition.Scenario,
                appEndpoints,
                secrets ?? new Dictionary<string, string>(),
                TargetRps: Math.Clamp(definition.Profile.ProbeRps, 1, 50));
            var input = JsonSerializer.Serialize(envelope, options);
            var args = new List<string>
            {
                "run", "--rm", "--interactive", "--name", containerName,
                "--network", ResourceProject + "_default",
                "--label", "com.docker.compose.project=" + ResourceProject,
                "--label", "com.docker.compose.service=mavis-scenario",
                "--label", "mavis.role=live-probe",
                "--memory", "128m", "--cpus", "0.5", "--pids-limit", "64",
                "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                "--env", "MAVIS_RUNNER_INTERNAL_NETWORK=1",
                "--env", "MAVIS_STUDIO_MAX_SESSION_SECONDS=" + RuntimeSessionLifecycle.ResolveInteractiveSessionMaxSeconds()
            };
            if (ComposeOverrideBuilder.IsKernelSandboxedRuntime(IsolationRuntime))
            {
                args.Add("--runtime");
                args.Add(IsolationRuntime);
            }
            args.Add(definition.Profile.ScenarioRunnerImage!);
            args.Add("live-probe");
            var interactive = await docker.StartInteractiveLineStreamAsync(args, _directory, input, OnLiveProbeLine, ct);
            if (interactive is not null) return interactive;
            return await docker.StartLineStreamAsync(args, _directory, input, OnLiveProbeLine, ct);
        }
        catch
        {
            return null; // Continuous live probe is strictly best-effort and must never fail a Studio session.
        }
    }

    private void OnLiveProbeLine(string line)
    {
        try
        {
            var node = JsonNode.Parse(line);
            if (node is not JsonObject obj) return;
            lock (_probeLock)
            {
                if (obj["probe"] is JsonNode probe) _latestProbeNode = probe.DeepClone();
                if (obj["serviceGraph"] is JsonArray graph && graph.Count > 0) _latestServiceGraphNode = graph.DeepClone();
            }
        }
        catch (JsonException) { }
    }

    private async Task<bool> PublishStudioTelemetrySafeAsync(CancellationToken ct)
    {
        try
        {
            await _telemetryGate.WaitAsync(ct);
            try { await PublishStudioTelemetryAsync(ct); return true; }
            finally { _telemetryGate.Release(); }
        }
        catch (Exception)
        {
            return false; // A missed telemetry frame must never fail the Studio session.
        }
    }

    // Runs beside the command loop while idle so Stop/Start/Scale polling is never blocked by a telemetry sweep.
    private async Task RunTelemetryLoopAsync(CancellationToken ct)
    {
        var failures = 0;
        while (!ct.IsCancellationRequested)
        {
            var delay = failures == 0 ? TelemetryInterval : TimeSpan.FromSeconds(Math.Min(15, 3 * failures));
            try { await Task.Delay(delay, ct); }
            catch (OperationCanceledException) { return; }
            if (await PublishStudioTelemetrySafeAsync(ct)) failures = 0;
            else if (ct.IsCancellationRequested) return;
            else failures++;
        }
    }

    public async Task<TraceCorrelationResult?> PreserveEvidenceAsync(CancellationToken ct)
    {
        if (!_resourcesMayExist || _directory is null) return null;
        await Task.Delay(1500, ct); // Bounded final drain; does not assert complete trace coverage.
        // Best-effort stops: a slow or failed stop must not skip copying the evidence already on disk.
        await Command(new[] { "stop", "--timeout", "5" }.Concat(definition.Profile.Applications.Keys).ToArray(), ct);
        await Task.Delay(1500, ct); // Collector stays alive while application shutdown hooks flush spans.
        await Command(["stop", "--timeout", "5", "mavis-collector"], ct);
        return await ReadTraceEvidenceAsync(ct, live: false);
    }

    private async Task PublishStudioTelemetryAsync(CancellationToken ct)
    {
        var states = await ReadAllServiceStatesAsync(ct);
        // One `docker stats` call for every container: per-service calls cost ~1-2 s each.
        var statsById = new List<(string Id, object Stat)>();
        var allIds = states.SelectMany(s => s.Ids).ToArray();
        if (allIds.Length > 0)
        {
            var result = await docker.RunAsync(new[] { "stats", "--no-stream", "--format", "{{json .}}" }.Concat(allIds).ToArray(), _directory!, 15, ct);
            foreach (var line in result.StandardOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    using var json = JsonDocument.Parse(line);
                    var data = json.RootElement;
                    var container = data.GetProperty("Container").GetString() ?? "";
                    var shortId = data.TryGetProperty("ID", out var idValue) ? idValue.GetString() ?? "" : "";
                    statsById.Add((container.Length > 0 ? container : shortId, new { containerId = container, cpu = data.GetProperty("CPUPerc").GetString(),
                        memory = data.GetProperty("MemUsage").GetString(), network = data.GetProperty("NetIO").GetString() }));
                }
                catch (Exception error) when (error is JsonException or KeyNotFoundException) { }
            }
        }
        var logTasks = states.Select(s => Command(["logs", "--no-color", "--tail", "10", s.Service], ct)).ToArray();
        var logResults = await Task.WhenAll(logTasks);
        var services = new List<object>();
        for (var index = 0; index < states.Count; index++)
        {
            var state = states[index];
            var stats = statsById.Where(s => state.Ids.Any(id => id.StartsWith(s.Id, StringComparison.Ordinal) || s.Id.StartsWith(id, StringComparison.Ordinal)))
                .Select(s => s.Stat).ToList();
            var logs = logResults[index];
            var text = RedactSecrets(logs.StandardOutput + (string.IsNullOrEmpty(logs.StandardError) ? "" : "\n" + logs.StandardError));
            services.Add(new { service = state.Service, replicas = state.Total, runningReplicas = state.Running, stats, logs = text[..Math.Min(text.Length, 4000)] });
        }
        var publishCount = ++_telemetryPublishCount;
        var shouldCopyTrace = _forceTraceRefresh || _lastLiveTrace is null || (publishCount % 3 == 1);
        _forceTraceRefresh = false;
        var trace = shouldCopyTrace ? await ReadTraceEvidenceAsync(ct, live: true) : _lastLiveTrace;
        // Correlator output is causal (topological) order; the live view needs the most recent spans by start time.
        var recentSpans = trace?.Spans.OrderBy(s => ulong.TryParse(s.StartTimeUnixNano, out var t) ? t : 0UL).TakeLast(200).ToArray() ?? [];
        var startBySpan = recentSpans.ToDictionary(s => (s.TraceId, s.SpanId), s => ulong.TryParse(s.StartTimeUnixNano, out var t) ? t : 0UL);
        var recentInteractions = trace?.Interactions?
            .OrderBy(i => startBySpan.GetValueOrDefault((i.TraceId, i.ChildSpanId)))
            .TakeLast(200).ToArray() ?? [];
        JsonNode? probeSnapshot;
        JsonNode? serviceGraphSnapshot;
        lock (_probeLock)
        {
            probeSnapshot = _latestProbeNode?.DeepClone();
            serviceGraphSnapshot = _latestServiceGraphNode?.DeepClone();
        }
        await studio!.PublishStudioTelemetryAsync(definition.SessionId,ResourceProject,new {
            observedAt=DateTimeOffset.UtcNow,services,
            spans=recentSpans,
            interactions=recentInteractions,
            warnings=trace?.Warnings ?? [],workload=_scenario,
            probe=probeSnapshot,
            serviceGraph=serviceGraphSnapshot ?? new JsonArray()
        },ct);
    }

    private async Task<TraceCorrelationResult?> ReadTraceEvidenceAsync(CancellationToken ct, bool live)
    {
        if (_directory is null) return null;
        var directory = Path.Combine(_directory, "raw-traces");
        Directory.CreateDirectory(directory);
        var copied = await Command(["cp", "mavis-collector:/traces/.", directory], ct);
        if (copied.ExitCode != 0 || !Directory.Exists(directory))
        {
            if (live && _lastLiveTrace is not null)
            {
                var warnings = _lastLiveTrace.Warnings.Contains("TRACE_COPY_FAILED", StringComparer.Ordinal)
                    ? _lastLiveTrace.Warnings
                    : _lastLiveTrace.Warnings.Append("TRACE_COPY_FAILED").ToArray();
                return _lastLiveTrace with { Warnings = warnings };
            }
            return null;
        }
        var paths = Directory.EnumerateFiles(directory, "traces*.json").ToArray();
        if (paths.Length == 0) return live ? _lastLiveTrace : null;
        var selected = TraceFileBudget.Select(paths, live ? TraceFileBudget.LiveBudgetBytes : TraceFileBudget.FinalBudgetBytes, out var truncated);
        var resources = new JsonArray();
        var malformed = false;
        foreach (var path in selected)
        {
            var (text, tailOnly) = live
                ? await TraceFileBudget.ReadTailAsync(path, TraceFileBudget.LiveBudgetBytes, ct)
                : (await File.ReadAllTextAsync(path, ct), false);
            truncated |= tailOnly;
            try { Append(JsonNode.Parse(text)); }
            catch (JsonException)
            {
                // NDJSON: a line cut by a killed collector or copy loses only that batch, never the whole evidence.
                foreach (var line in text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    ct.ThrowIfCancellationRequested();
                    try { Append(JsonNode.Parse(line)); }
                    catch (JsonException) { malformed = true; }
                }
            }
        }
        var payload = new JsonObject { ["resourceSpans"] = resources }.ToJsonString();
        var stepMap = SnapshotTraceSteps();
        var result = TraceCorrelator.Correlate(definition.SessionId, definition.ModelVersionId, payload, definition.ConfirmedServiceMappings, stepMap);
        var extra = new List<string>();
        if (truncated) extra.Add("TRACE_TRUNCATED_TO_PROFILE_BUDGET");
        if (malformed && !live) extra.Add("TRACE_BATCH_MALFORMED_SKIPPED");
        var finalResult = extra.Count > 0 ? result with { Warnings = result.Warnings.Concat(extra).ToArray() } : result;
        if (live) _lastLiveTrace = finalResult;
        return finalResult;

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
        if (lifecycle is not null)
        {
            try
            {
                await lifecycle.AcknowledgeAsync(notification, ct);
            }
            catch (InvalidOperationException) when (definition.InteractiveStudio && studio is not null && !ct.IsCancellationRequested)
            {
                // If Java rejected lifecycle-ack (HTTP 409) because the learner cancelled mid-boot, classify as Cancelled instead of Failed.
                using var checkCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                var poll = await studio.NextStudioCommandAsync(definition.SessionId, ResourceProject, checkCts.Token);
                if (poll.CancelRequested)
                {
                    onRemoteCancel?.Invoke();
                    throw new OperationCanceledException("Session cancelled before lifecycle acknowledgement.", ct);
                }
                throw;
            }
        }
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
        var args = new List<string>
        {
            "run", "--rm", "--interactive", "--network", ResourceProject + "_default",
            "--label", "com.docker.compose.project=" + ResourceProject, "--label", "com.docker.compose.service=mavis-scenario",
            "--memory", "256m", "--cpus", "1", "--pids-limit", "64", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--env", "MAVIS_RUNNER_INTERNAL_NETWORK=1"
        };
        if (ComposeOverrideBuilder.IsKernelSandboxedRuntime(IsolationRuntime))
        {
            args.Add("--runtime");
            args.Add(IsolationRuntime);
        }
        // Container startup is outside the HTTP deadline; the session token still bounds the whole run.
        args.Add(image);
        args.Add("stdin-scenario");
        var result = await docker.RunWithInputAsync(args, _directory!, Math.Min(300, scenario.TimeoutSeconds + 30), input, ct);
        if (string.IsNullOrWhiteSpace(result.StandardOutput)) throw new RuntimeStageException("SCENARIO_CONTAINER_FAILED");
        try
        {
            return JsonSerializer.Deserialize<HttpScenarioOutcome>(result.StandardOutput, options)
                ?? throw new RuntimeStageException("SCENARIO_OUTPUT_INVALID");
        }
        catch (JsonException)
        {
            throw new RuntimeStageException(result.ExitCode is 0 or 1 ? "SCENARIO_OUTPUT_INVALID" : "SCENARIO_CONTAINER_FAILED");
        }
    }

    private async Task ExecuteSeedHookAsync(SeedHookProfile seed, CancellationToken ct)
    {
        var method = seed.Method?.Trim().ToUpperInvariant() ?? "POST";
        var path = seed.Path?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(seed.Service) || !_endpoints.ContainsKey(seed.Service)
            || method is not ("GET" or "POST")
            || !path.StartsWith('/') || path.StartsWith("//", StringComparison.Ordinal) || path.Contains('\\') || path.Length > 256
            || seed.ExpectedStatus is < 200 or >= 300)
            throw new RuntimeStageException("SEED_HOOK_INVALID");
        Stage = "SEED_HOOK";
        var seedScenario = new HttpScenarioDefinition("studio-seed",
            [new("seed", seed.Service, method, path, seed.ExpectedStatus)], 15);
        var outcome = await RunInsideNetwork(seedScenario, _endpoints, secrets ?? new Dictionary<string, string>(), ct);
        if (outcome.Status != "Passed")
        {
            RecordDiagnostic(DiagnosticCode("SEED_HOOK_FAILED", seed.Service));
            throw new RuntimeStageException("SEED_HOOK_FAILED");
        }
    }

    private bool IsAllowedRuntimeEnvOverride(string service, string? envKey, string? envValue)
    {
        if (string.IsNullOrWhiteSpace(envKey) || envValue is null || envValue.Length > 256) return false;
        if (envValue.Any(c => c is '\r' or '\n' or '\0')) return false;
        var key = envKey.Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(key, "^[A-Z][A-Z0-9_]{0,63}$")) return false;
        if (key == "PATH" || new[] { "OTEL_", "JAVA_", "JDK_", "DOTNET_", "CORECLR_", "LD_", "MAVIS_" }
                .Any(prefix => key.StartsWith(prefix, StringComparison.Ordinal)))
            return false;
        if (definition.Profile.AllowedEnvKeys is not null
            && definition.Profile.AllowedEnvKeys.TryGetValue(service, out var allowed)
            && allowed is { Count: > 0 }
            && !allowed.Contains(key, StringComparer.Ordinal))
            return false;
        return true;
    }

    private bool IsAllowedAlternateImage(string service, string? targetImage)
    {
        if (string.IsNullOrWhiteSpace(targetImage)) return false;
        var img = targetImage.Trim();
        if (!PinnedRunnerImage(img)) return false;
        if (definition.Profile.AlternateImages is not null
            && definition.Profile.AlternateImages.TryGetValue(service, out var alt)
            && StringComparer.Ordinal.Equals(alt, img))
            return true;
        return _originalPinnedImages.TryGetValue(service, out var orig) && StringComparer.Ordinal.Equals(orig, img);
    }

    private async Task WriteActionOverrideAsync(CancellationToken ct)
    {
        var servicesObj = new Dictionary<string, object>();
        foreach (var svc in _actionEnvOverrides.Keys.Union(_actionImageOverrides.Keys, StringComparer.Ordinal))
        {
            var entry = new Dictionary<string, object>();
            if (_actionImageOverrides.TryGetValue(svc, out var img)) entry["image"] = img;
            if (_actionEnvOverrides.TryGetValue(svc, out var env) && env.Count > 0)
            {
                // Escape '$' so Docker Compose never expands runner host env vars.
                entry["environment"] = env.ToDictionary(kv => kv.Key, kv => kv.Value.Replace("$", "$$", StringComparison.Ordinal));
            }
            servicesObj[svc] = entry;
        }
        var path = Path.Combine(_directory!, "action-override.json");
        var json = JsonSerializer.Serialize(new { services = servicesObj }, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(path, json, ct);
        _hasActionOverride = true;
    }

    private async Task WatchRemoteCancelDuringStartupAsync(CancellationTokenSource startupCts, CancellationToken stopping)
    {
        if (!definition.InteractiveStudio || studio is null) return;
        try
        {
            await Task.Delay(TimeSpan.FromMilliseconds(250), stopping);
            while (!stopping.IsCancellationRequested)
            {
                try
                {
                    var poll = await studio.NextStudioCommandAsync(definition.SessionId, ResourceProject, stopping);
                    if (poll.CancelRequested)
                    {
                        onRemoteCancel?.Invoke();
                        startupCts.Cancel();
                        return;
                    }
                }
                catch (OperationCanceledException) when (stopping.IsCancellationRequested) { return; }
                catch { /* Transient poll failures during DOCKER_UP must not abort startup. */ }
                await Task.Delay(TimeSpan.FromMilliseconds(1500), stopping);
            }
        }
        catch (OperationCanceledException) { }
    }

    private Task<DockerCommandResult> Command(IReadOnlyList<string> arguments, CancellationToken ct)
    {
        var cmd = new List<string>
        {
            "compose", "--project-name", ResourceProject,
            "--file", Path.Combine(_directory!, "compose.yaml"),
            "--file", Path.Combine(_directory!, "override.json")
        };
        if (_hasActionOverride)
        {
            cmd.Add("--file");
            cmd.Add(Path.Combine(_directory!, "action-override.json"));
        }
        cmd.AddRange(arguments);
        return docker.RunAsync(
            cmd,
            _directory!, arguments[0] == "up" ? Math.Max(Math.Clamp(definition.Profile.TimeoutSeconds, 1, 300), 150) + 30
                : (arguments[0] is "down" or "stop" ? 45 : 15), ct);
    }

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
            var stderr = result.StandardError ?? "";
            var category =
                stderr.Contains("invalid reference format", StringComparison.OrdinalIgnoreCase) ? "INVALID_IMAGE_REFERENCE" :
                stderr.Contains("must be a", StringComparison.OrdinalIgnoreCase) ? "INVALID_COMPOSE_SCHEMA" :
                stderr.Contains("pull access denied", StringComparison.OrdinalIgnoreCase) ||
                stderr.Contains("No such image", StringComparison.OrdinalIgnoreCase) ||
                stderr.Contains("manifest unknown", StringComparison.OrdinalIgnoreCase) ? "IMAGE_NOT_FOUND" :
                stderr.Contains("OOMKilled", StringComparison.OrdinalIgnoreCase) ||
                stderr.Contains("Cannot allocate memory", StringComparison.OrdinalIgnoreCase) ? "OUT_OF_MEMORY" :
                stderr.Contains("is unhealthy", StringComparison.OrdinalIgnoreCase) ? "CONTAINER_UNHEALTHY" :
                stderr.Contains("exited (", StringComparison.OrdinalIgnoreCase) ? "CONTAINER_EXITED" :
                "FAILED";
            throw new RuntimeStageException("DOCKER_" + args[0].ToUpperInvariant() + "_" + category);
        }
        return result;
    }

    private async Task CaptureFailureDiagnosticsAsync(IEnumerable<string> services, CancellationToken ct)
    {
        if (_directory is null || ct.IsCancellationRequested) return;
        using var diagCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        diagCts.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            var ps = await Command(["ps", "--all", "--format", "{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}"], diagCts.Token);
            var states = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            var failedServices = new HashSet<string>(StringComparer.Ordinal);
            if (ps.ExitCode == 0 && !string.IsNullOrWhiteSpace(ps.StandardOutput))
            {
                foreach (var rawLine in ps.StandardOutput.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = rawLine.Split('|');
                    if (parts.Length < 4) continue;
                    var svc = parts[0].Trim();
                    var state = parts[1].Trim().ToLowerInvariant();
                    var health = parts[2].Trim().ToLowerInvariant();
                    var exitCodeText = parts[3].Trim();
                    if (string.IsNullOrEmpty(svc)) continue;
                    if (!states.TryGetValue(svc, out var serviceStates)) states[svc] = serviceStates = [];
                    serviceStates.Add(state);
                    if (health == "unhealthy")
                    {
                        failedServices.Add(svc);
                        RecordDiagnostic(DiagnosticCode("CONTAINER_UNHEALTHY", svc));
                    }
                    else if (state is "exited" or "dead" || (int.TryParse(exitCodeText, out var exitVal) && exitVal != 0))
                    {
                        failedServices.Add(svc);
                        var exitSuffix = int.TryParse(exitCodeText, out var ec) && ec >= 0 ? "CODE_" + ec : "FAILED";
                        RecordDiagnostic(DiagnosticCode("CONTAINER_EXITED", svc, exitSuffix));
                    }
                }
            }
            if (!definition.InteractiveStudio || studio is null) return;
            var diagServices = new List<object>();
            // Reuse the single status snapshot and collect failed-service logs first.
            // Querying every healthy container can exhaust this deadline before the failing broker is reached.
            var diagnosticTargets = failedServices.Count > 0 ? failedServices : services.Distinct(StringComparer.Ordinal);
            foreach (var service in diagnosticTargets.Take(8))
            {
                if (string.IsNullOrWhiteSpace(service)) continue;
                var serviceStates = states.GetValueOrDefault(service) ?? [];
                var logs = await Command(["logs", "--no-color", "--tail", "25", service], diagCts.Token);
                var text = RedactSecrets(logs.StandardOutput + (string.IsNullOrEmpty(logs.StandardError) ? "" : "\n" + logs.StandardError));
                diagServices.Add(new
                {
                    service,
                    replicas = serviceStates.Count,
                    runningReplicas = serviceStates.Count(state => state == "running"),
                    stats = Array.Empty<object>(),
                    logs = text[..Math.Min(text.Length, 4000)]
                });
            }
            if (diagServices.Count > 0)
            {
                await studio.PublishStudioTelemetryAsync(definition.SessionId, ResourceProject, new
                {
                    observedAt = DateTimeOffset.UtcNow,
                    services = diagServices,
                    spans = Array.Empty<object>(),
                    interactions = Array.Empty<object>(),
                    warnings = _failureDiagnostics.ToArray(),
                    workload = _scenario
                }, diagCts.Token);
            }
        }
        catch
        {
            // Failure diagnostic collection must never mask the primary error or delay container cleanup.
        }
    }

    private string RedactSecrets(string text) =>
        secrets is null || secrets.Count == 0 ? text : RedactSecretValues(text, secrets.Values);

    public static string RedactSecretValues(string text, IEnumerable<string> values)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var variants = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in values)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            variants.Add(raw);
            if (raw.Length >= 4)
            {
                var urlEncoded = Uri.EscapeDataString(raw);
                if (urlEncoded.Length >= 4) variants.Add(urlEncoded);
                var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(raw));
                if (base64.Length >= 4) variants.Add(base64);
            }
        }
        foreach (var token in variants.OrderByDescending(v => v.Length))
            text = text.Replace(token, "[REDACTED]", StringComparison.Ordinal);
        return text;
    }

    private void RecordDiagnostic(string code)
    {
        if (_failureDiagnostics.Count >= 12 || string.IsNullOrEmpty(code)) return;
        if (!_failureDiagnostics.Contains(code, StringComparer.Ordinal)) _failureDiagnostics.Add(code);
    }

    private static string DiagnosticCode(string prefix, string service, string? suffix = null)
    {
        var token = new string(service.ToUpperInvariant().Select(c => char.IsAsciiLetterOrDigit(c) ? c : '_').ToArray()).Trim('_');
        if (string.IsNullOrEmpty(token)) token = "SERVICE";
        var tail = string.IsNullOrEmpty(suffix) ? "" : "_" + suffix;
        var maxToken = Math.Max(1, 80 - prefix.Length - 1 - tail.Length);
        if (token.Length > maxToken) token = token[..maxToken].TrimEnd('_');
        return $"{prefix}_{token}{tail}";
    }

    internal static async Task<string> ResolveIsolationRuntimeAsync(IDockerCommands docker, string workingDirectory,
        string requestedRuntime, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(requestedRuntime) || requestedRuntime == "runc") return "runc";
        var probe = await docker.RunAsync(["info", "--format", "{{json .Runtimes}}"], workingDirectory, 10, ct);
        var available = new HashSet<string>(StringComparer.Ordinal);
        if (probe.ExitCode == 0 && !string.IsNullOrWhiteSpace(probe.StandardOutput))
        {
            try
            {
                using var doc = JsonDocument.Parse(probe.StandardOutput);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                    foreach (var prop in doc.RootElement.EnumerateObject()) available.Add(prop.Name);
            }
            catch (JsonException) { }
        }
        if (requestedRuntime == "auto") return available.Contains("runsc") ? "runsc" : "runc";
        if (!available.Contains(requestedRuntime)) throw new RuntimeStageException("OCI_RUNTIME_UNAVAILABLE");
        return requestedRuntime;
    }
}

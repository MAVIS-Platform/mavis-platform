using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MAVIS.Runner;

public sealed record RuntimeRunDefinition(string SessionId, string ModelVersionId, string SourceSnapshotId,
    string ProfileVersionId, string ComposeYaml, RunnerExecutionProfile Profile, HttpScenarioDefinition Scenario,
    IReadOnlyDictionary<string, string> ConfirmedServiceMappings, string? RunConfigurationVersionId = null, string? ScenarioVersionId = null);

/// <summary>Operator-invoked local PoC adapter. Not an internet-facing arbitrary repository execution service.</summary>
public sealed class DockerComposeSession(RuntimeRunDefinition definition, string stateRoot, string collectorConfiguration,
    IDockerCommands docker, IReadOnlyDictionary<string, string>? secrets = null) : IRuntimeSessionBackend
{
    public string ResourceProject { get; } = "mavisrun-" + Guid.NewGuid().ToString("N");
    public string Stage { get; private set; } = "VALIDATE";
    public Dictionary<string, string> ActualImageIds { get; } = new(StringComparer.Ordinal);
    public bool SandboxEnforcementConfirmed { get; private set; }
    public Dictionary<string, string> DeclaredInstrumentationVersions { get; } = new(StringComparer.Ordinal);
    private string? _directory;
    private FileStream? _lease;
    private bool _resourcesMayExist;
    private readonly Dictionary<string, Uri> _endpoints = new();

    public async Task PrepareAndStartAsync(CancellationToken ct)
    {
        if (!Path.IsPathFullyQualified(stateRoot) || string.IsNullOrWhiteSpace(definition.SessionId) ||
            definition.Scenario.SessionId != definition.SessionId || string.IsNullOrWhiteSpace(definition.ModelVersionId) ||
            string.IsNullOrWhiteSpace(definition.SourceSnapshotId) || string.IsNullOrWhiteSpace(definition.ProfileVersionId) ||
            string.IsNullOrWhiteSpace(definition.RunConfigurationVersionId) || string.IsNullOrWhiteSpace(definition.ScenarioVersionId))
            throw new ArgumentException("Invalid session provenance or operator state root.");
        var preflight = ComposePreflight.Check(definition.ComposeYaml);
        if (!preflight.Compatible) throw new ArgumentException("Compose preflight rejected this execution profile.");
        _ = ComposeOverrideBuilder.Build(preflight, definition.Profile, Path.Combine(Path.GetFullPath(stateRoot), "validate", "collector.yaml"));
        if (!PinnedRunnerImage(definition.Profile.ScenarioRunnerImage)) throw new ArgumentException("A content-addressed scenario runner image is required.");
        new HttpScenarioRunner(allowContainerDns: true).ValidateDefinition(definition.Scenario,
            definition.Profile.Applications.ToDictionary(p => p.Key, p => new Uri($"http://{p.Key}:{p.Value.ContainerPort}")),
            secrets ?? new Dictionary<string, string>());
        Stage = "ALLOCATE";
        Directory.CreateDirectory(stateRoot);
        // One local allocator at a time. Every invocation must use the same operator-managed state root.
        _lease = new FileStream(Path.Combine(stateRoot, "runner.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        _directory = Path.Combine(stateRoot, ResourceProject);
        Directory.CreateDirectory(_directory);
        var collectorPath = Path.Combine(_directory, "collector.yaml");
        Stage = "OVERRIDE";
        var overrides = ComposeOverrideBuilder.Build(preflight, definition.Profile, collectorPath);
        await File.WriteAllTextAsync(collectorPath, collectorConfiguration, ct);
        await File.WriteAllTextAsync(Path.Combine(_directory, "compose.yaml"), definition.ComposeYaml, ct);
        await File.WriteAllTextAsync(Path.Combine(_directory, "override.json"), overrides, ct);
        Stage = "DOCKER_INFO";
        var info = await docker.RunAsync(["info", "--format", "{{.OSType}}"], _directory, 10, ct);
        if (info.ExitCode != 0 || info.StandardOutput.Trim() != "linux") throw new InvalidOperationException("Linux Docker engine is unavailable.");
        Stage = "INSTRUMENTATION_PROFILE";
        var volume = await docker.RunAsync(["volume", "inspect", "--format", "{{json .Labels}}", definition.Profile.InstrumentationVolume], _directory, 10, ct);
        if (volume.ExitCode != 0) throw new RuntimeStageException("INSTRUMENTATION_BUNDLE_UNAVAILABLE");
        using var labels = JsonDocument.Parse(volume.StandardOutput);
        foreach (var runtime in definition.Profile.Applications.Values.Select(a => a.Runtime).Distinct())
        {
            var isJava = runtime == "java";
            var label = isJava ? "mavis.java.version" : "mavis.dotnet.version";
            var expected = isJava ? definition.Profile.JavaInstrumentationVersion : definition.Profile.DotnetInstrumentationVersion;
            if (string.IsNullOrWhiteSpace(expected) || !labels.RootElement.TryGetProperty(label, out var actual) || actual.GetString() != expected)
                throw new RuntimeStageException("INSTRUMENTATION_VERSION_MISMATCH");
            DeclaredInstrumentationVersions[isJava ? "java" : "dotnet"] = expected;
        }
        _resourcesMayExist = true; // Even a failed `up` may allocate partial resources.
        Stage = "DOCKER_UP";
        await Require(["up", "--detach", "--wait", "--wait-timeout", "30"], ct);
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
            if (preflight.PinnedImages?.GetValueOrDefault(service) is { } requested && requested.StartsWith("sha256:", StringComparison.Ordinal) && requested != ActualImageIds[service])
                throw new RuntimeStageException("IMAGE_ID_MISMATCH");
            var config = await docker.RunAsync(["inspect", "--format", "{{json .HostConfig}}", id], _directory, 10, ct);
            if (config.ExitCode != 0) throw new RuntimeStageException("SANDBOX_ENFORCEMENT_UNCONFIRMED");
            using var host = JsonDocument.Parse(config.StandardOutput);
            var settings = host.RootElement;
            var memory = service == "mavis-collector" ? 256 : definition.Profile.MemoryMiB;
            var cpus = service == "mavis-collector" ? 1 : definition.Profile.Cpus;
            var pids = service == "mavis-collector" ? 64 : 128;
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
        SandboxEnforcementConfirmed = true;
        foreach (var app in definition.Profile.Applications)
            _endpoints[app.Key] = new Uri($"http://{app.Key}:{app.Value.ContainerPort}");
        _endpoints["mavis-collector"] = new Uri("http://mavis-collector:13133");
    }

    public async Task WaitUntilReadyAsync(CancellationToken ct)
    {
        Stage = "READINESS";
        for (var attempt = 0; attempt < 30; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            var steps = definition.Profile.Applications.Select(p => new HttpScenarioStep(p.Key, p.Key, "GET", p.Value.ReadinessPath, 200))
                .Append(new("collector", "mavis-collector", "GET", "/", 200)).ToArray();
            var result = await RunInsideNetwork(new(definition.SessionId, steps, 2), _endpoints, new Dictionary<string, string>(), ct);
            if (result.Status == "Passed") return;
            await Task.Delay(1000, ct);
        }
        throw new InvalidOperationException("Readiness could not be confirmed.");
    }

    public async Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct)
    {
        Stage = "SCENARIO";
        _scenario = await RunInsideNetwork(definition.Scenario,
            _endpoints.Where(p => p.Key != "mavis-collector").ToDictionary(), secrets ?? new Dictionary<string, string>(), ct);
        return _scenario;
    }

    public async Task<TraceCorrelationResult?> PreserveEvidenceAsync(CancellationToken ct)
    {
        if (!_resourcesMayExist || _directory is null) return null;
        await Task.Delay(1500, ct); // Bounded final drain; does not assert complete trace coverage.
        await Require(new[] { "stop", "--timeout", "5" }.Concat(definition.Profile.Applications.Keys).ToArray(), ct);
        await Task.Delay(1500, ct); // Collector stays alive while application shutdown hooks flush spans.
        await Require(["stop", "--timeout", "5", "mavis-collector"], ct);
        var directory = Path.Combine(_directory, "raw-traces");
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
                foreach (var line in text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                { ct.ThrowIfCancellationRequested(); Append(JsonNode.Parse(line)); }
            }
        }
        var payload = new JsonObject { ["resourceSpans"] = resources }.ToJsonString();
        var stepMap = _scenario?.Steps.ToDictionary(s => s.TraceId, s => s.StepId);
        return TraceCorrelator.Correlate(definition.SessionId, definition.ModelVersionId, payload, definition.ConfirmedServiceMappings, stepMap);

        void Append(JsonNode? node)
        {
            if (node?["resourceSpans"] is JsonArray array)
                foreach (var resource in array) resources.Add(resource?.DeepClone());
        }
    }

    private HttpScenarioOutcome? _scenario;

    public async Task<bool> CleanupAsync(CancellationToken ct)
    {
        try
        {
            if (_directory is null) return true;
            if (_resourcesMayExist)
            {
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
            }
            var expected = Path.Combine(Path.GetFullPath(stateRoot), ResourceProject);
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
            image, "stdin-scenario"], _directory!, Math.Min(300, scenario.TimeoutSeconds + 10), input, ct);
        if (string.IsNullOrWhiteSpace(result.StandardOutput)) throw new RuntimeStageException("SCENARIO_CONTAINER_FAILED");
        return JsonSerializer.Deserialize<HttpScenarioOutcome>(result.StandardOutput, options) ?? throw new RuntimeStageException("SCENARIO_OUTPUT_INVALID");
    }

    private Task<DockerCommandResult> Command(IReadOnlyList<string> arguments, CancellationToken ct) => docker.RunAsync(
        new[] { "compose", "--project-name", ResourceProject, "--file", Path.Combine(_directory!, "compose.yaml"), "--file", Path.Combine(_directory!, "override.json") }.Concat(arguments).ToArray(),
        _directory!, 15, ct);

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

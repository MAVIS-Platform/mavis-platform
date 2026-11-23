using System.Text.Json;
using System.Text.Json.Nodes;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class StudioInfrastructureActionTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-studio-" + Guid.NewGuid().ToString("N"));
    private const string ResourceProject = "mavisrun-fedcba9876543210fedcba9876543210";

    private sealed class MockDocker : IDockerCommands
    {
        public Dictionary<string, int> RunningCounts { get; } = new(StringComparer.Ordinal)
        {
            ["order-service"] = 1,
            ["payment-service"] = 1
        };

        public List<IReadOnlyList<string>> Calls { get; } = [];
        public string RemainingContainersOutput { get; set; } = "";
        public string RemainingVolumesOutput { get; set; } = "";
        public string RemainingNetworksOutput { get; set; } = "";
        public bool TimeoutNextProbe { get; set; }
        public int StudioProbesNotReady { get; set; }

        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string directory, int timeout, CancellationToken ct)
        {
            Calls.Add(args);
            if (args.Count > 0 && args[0] == "compose")
            {
                var sub = args.FirstOrDefault(a => a is "ps" or "stop" or "start" or "up" or "down");
                if (sub == "ps")
                {
                    var fmtIdx = args.ToList().IndexOf("--format");
                    if (fmtIdx >= 0 && fmtIdx + 1 < args.Count)
                    {
                        var fmt = args[fmtIdx + 1];
                        if (fmt.Contains("{{.Service}}", StringComparison.Ordinal))
                        {
                            var lines = RunningCounts.SelectMany(kv =>
                                kv.Value > 0
                                    ? Enumerable.Range(1, kv.Value).Select(i => $"{kv.Key}|{kv.Key}-{i}|running")
                                    : [$"{kv.Key}|{kv.Key}-1|exited"]);
                            return Task.FromResult(new DockerCommandResult(0, string.Join("\n", lines)));
                        }
                        var svc = args[^1];
                        RunningCounts.TryGetValue(svc, out var count);
                        var svcLines = count > 0
                            ? Enumerable.Range(1, count).Select(i => $"{svc}-{i}|running")
                            : [$"{svc}-1|exited"];
                        return Task.FromResult(new DockerCommandResult(0, string.Join("\n", svcLines)));
                    }
                    var fallbackSvc = args[^1];
                    RunningCounts.TryGetValue(fallbackSvc, out var fallbackCount);
                    var displayCount = args.Contains("--all") ? Math.Max(fallbackCount, 1) : fallbackCount;
                    var output = string.Join("\n", Enumerable.Range(1, displayCount).Select(i => $"{fallbackSvc}-{i}"));
                    return Task.FromResult(new DockerCommandResult(0, output));
                }
                if (sub == "stop" && args[^1] is string stopSvc && RunningCounts.ContainsKey(stopSvc))
                {
                    RunningCounts[stopSvc] = 0;
                    return Task.FromResult(new DockerCommandResult(0, ""));
                }
                if (sub == "start" && args[^1] is string startSvc && RunningCounts.ContainsKey(startSvc))
                {
                    RunningCounts[startSvc] = 1;
                    return Task.FromResult(new DockerCommandResult(0, ""));
                }
                if (sub == "up")
                {
                    var scaleIdx = args.ToList().IndexOf("--scale");
                    if (scaleIdx >= 0 && scaleIdx + 1 < args.Count)
                    {
                        var parts = args[scaleIdx + 1].Split('=', 2);
                        RunningCounts[parts[0]] = int.Parse(parts[1]);
                    }
                    return Task.FromResult(new DockerCommandResult(0, ""));
                }
                if (sub == "down")
                {
                    return Task.FromResult(new DockerCommandResult(0, ""));
                }
            }

            if (args.Count >= 2 && args[0] == "ps" && args[1] == "-aq")
                return Task.FromResult(new DockerCommandResult(0, RemainingContainersOutput));
            if (args.Count >= 2 && args[0] == "volume" && args[1] == "ls")
                return Task.FromResult(new DockerCommandResult(0, RemainingVolumesOutput));
            if (args.Count >= 2 && args[0] == "network" && args[1] == "ls")
                return Task.FromResult(new DockerCommandResult(0, RemainingNetworksOutput));

            return Task.FromResult(new DockerCommandResult(0, ""));
        }

        public Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> args, string directory, int timeout, string input, CancellationToken ct)
        {
            Calls.Add(args);
            if (TimeoutNextProbe)
            {
                TimeoutNextProbe = false;
                throw new OperationCanceledException();
            }
            bool ready = true;
            if (StudioProbesNotReady > 0 && input.Contains("\"studio-readiness\"", StringComparison.Ordinal))
            {
                StudioProbesNotReady--;
                ready = false;
            }
            var outcome = new HttpScenarioOutcome("s1", ready ? "Passed" : "Failed",
            [
                new HttpStepOutcome("step-1", ready ? "Passed" : "Failed", ready ? 200 : 503,
                    "4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", 42L)
            ]);
            var json = JsonSerializer.Serialize(outcome, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            return Task.FromResult(new DockerCommandResult(0, json));
        }
    }

    [Fact]
    public async Task PreparedTopologyStopsOptionalBlockAfterReadinessBeforeBaseline()
    {
        var docker = new MockDocker();
        var definition = CreateDefinition([]);
        definition = definition with
        {
            InteractiveStudio = true,
            Profile = definition.Profile with
            {
                StudioTopology = new(1,
                    [new("order-service", "Orders", true), new("payment-service", "Payment", InitiallyStopped: true)], [])
            }
        };
        var session = new DockerComposeSession(definition, _root, "receivers: {}", docker);
        var directory = Path.Combine(_root, ResourceProject);
        Directory.CreateDirectory(directory);
        typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .SetValue(session, directory);
        await session.WaitUntilReadyAsync(CancellationToken.None);
        Assert.Equal(0, docker.RunningCounts["payment-service"]);
        Assert.Equal(1, docker.RunningCounts["order-service"]);
        Assert.Empty(session.ObservedInfrastructureActions);
    }

    private static RuntimeRunDefinition CreateDefinition(IReadOnlyList<RuntimeInfrastructureActionDefinition> actions)
    {
        var digest = new string('a', 64);
        var apps = new Dictionary<string, RuntimeServiceProfile>(StringComparer.Ordinal)
        {
            ["order-service"] = new("java", 8080),
            ["payment-service"] = new("java", 8081)
        };
        var compose = $"services:\n  order-service:\n    image: order@sha256:{digest}\n  payment-service:\n    image: payment@sha256:{digest}\n";
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1", apps,
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        // Use a GET scenario so after-workload replay executes and records metricsBefore / metricsAfter
        var scenario = new HttpScenarioDefinition("s1", [new("step-1", "order-service", "GET", "/orders", 200)]);
        var mappings = new Dictionary<string, string>
        {
            ["order-service"] = "550e8400-e29b-41d4-a716-446655440001",
            ["payment-service"] = "550e8400-e29b-41d4-a716-446655440002"
        };
        return new("s1", "m1", "snap1", "prof1", compose, profile, scenario, mappings, "cfg1", "scn1",
            ResourceProject, InfrastructureActions: actions);
    }

    [Fact]
    public async Task ReadinessRetriesHelperTimeoutWithSessionDeadlineIntact()
    {
        var directory = Path.Combine(_root, ResourceProject);
        Directory.CreateDirectory(directory);
        var docker = new MockDocker { TimeoutNextProbe = true };
        var definition = CreateDefinition([]);
        var session = new DockerComposeSession(definition, _root, "receivers: {}", docker);
        typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .SetValue(session, directory);
        typeof(DockerComposeSession).GetProperty(nameof(DockerComposeSession.AllocationReserved))!
            .SetValue(session, true);
        await session.WaitUntilReadyAsync(CancellationToken.None);

        Assert.Equal(2, docker.Calls.Count(args => args.Contains("stdin-scenario")));
        Assert.Contains(docker.Calls, args => args.Contains("label=com.docker.compose.service=mavis-scenario"));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => session.WaitUntilReadyAsync(new CancellationToken(true)));
        Assert.Equal(2, docker.Calls.Count(args => args.Contains("stdin-scenario")));
    }

    [Fact]
    public async Task ExecutesStopStartAndScale1To4WithBeforeAfterMetrics()
    {
        Directory.CreateDirectory(_root);
        var docker = new MockDocker { StudioProbesNotReady = 10 };
        var def = CreateDefinition(
        [
            new("STOP", "payment-service"),
            new("START", "payment-service"),
            new("SCALE", "order-service", 3)
        ]);
        var session = new DockerComposeSession(def, _root, "receivers: {}", docker);

        var dir = Path.Combine(_root, ResourceProject);
        Directory.CreateDirectory(dir);
        typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .SetValue(session, dir);
        var endpoints = (Dictionary<string, Uri>)typeof(DockerComposeSession).GetField("_endpoints", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .GetValue(session)!;
        endpoints["order-service"] = new Uri("http://order-service:8080");
        endpoints["payment-service"] = new Uri("http://payment-service:8081");

        await session.ExecuteScenarioAsync(CancellationToken.None);
        var results = await session.ExecuteInfrastructureActionsAsync(CancellationToken.None);

        Assert.Equal(3, results.Count);

        Assert.Equal("STOP", results[0].Action);
        Assert.Equal("payment-service", results[0].Service);
        Assert.Equal(1, results[0].ReplicasBefore);
        Assert.Equal(0, results[0].ReplicasAfter);
        Assert.True(results[0].Confirmed);
        Assert.Equal(1, results[0].MetricsBefore["requestCount"]!.GetValue<int>());
        Assert.Equal(1, results[0].MetricsAfter["requestCount"]!.GetValue<int>());

        Assert.Equal("START", results[1].Action);
        Assert.Equal("payment-service", results[1].Service);
        Assert.Equal(0, results[1].ReplicasBefore);
        Assert.Equal(1, results[1].ReplicasAfter);
        Assert.True(results[1].Confirmed);

        Assert.Equal("SCALE", results[2].Action);
        Assert.Equal("order-service", results[2].Service);
        Assert.Equal(1, results[2].ReplicasBefore);
        Assert.Equal(3, results[2].ReplicasAfter);
        Assert.True(results[2].Confirmed);
        Assert.NotNull(results[2].MetricsAfter["p95LatencyMs"]);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    [InlineData(9)]
    public async Task RejectsScaleOutOfBoundsWithReplicaBoundsExceeded(int invalidReplicas)
    {
        var docker = new MockDocker();
        var def = CreateDefinition([new("SCALE", "order-service", invalidReplicas)]);
        var session = new DockerComposeSession(def, _root, "receivers: {}", docker);

        var ex = await Assert.ThrowsAsync<RuntimeStageException>(() => session.ExecuteInfrastructureActionsAsync(CancellationToken.None));
        Assert.Equal("REPLICA_BOUNDS_EXCEEDED", ex.Code);
    }

    [Fact]
    public async Task RejectsUnknownServiceNotInProfileWithInfrastructureActionInvalid()
    {
        var docker = new MockDocker();
        var def = CreateDefinition([new("SCALE", "rogue-service", 2)]);
        var session = new DockerComposeSession(def, _root, "receivers: {}", docker);

        var ex = await Assert.ThrowsAsync<RuntimeStageException>(() => session.ExecuteInfrastructureActionsAsync(CancellationToken.None));
        Assert.Equal("INFRASTRUCTURE_ACTION_INVALID", ex.Code);
    }

    [Fact]
    public async Task CleanupVerifiesZeroOrphanContainersVolumesAndNetworks()
    {
        var dir = Path.Combine(_root, ResourceProject);
        Directory.CreateDirectory(dir);
        var docker = new MockDocker();
        var def = CreateDefinition([]);
        var session = new DockerComposeSession(def, _root, "receivers: {}", docker);
        typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .SetValue(session, dir);
        typeof(DockerComposeSession).GetField("_resourcesMayExist", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .SetValue(session, true);

        var cleaned = await session.CleanupAsync(CancellationToken.None);
        Assert.True(cleaned);
        Assert.Contains(docker.Calls, args => args.Contains("down") && args.Contains("--volumes") && args.Contains("--remove-orphans"));
        Assert.Contains(docker.Calls, args => args[0] == "ps" && args[1] == "-aq");
        Assert.Contains(docker.Calls, args => args[0] == "volume" && args[1] == "ls");
        Assert.Contains(docker.Calls, args => args[0] == "network" && args[1] == "ls");
        Assert.False(Directory.Exists(dir));
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_root)) Directory.Delete(_root, true); } catch { }
    }
}

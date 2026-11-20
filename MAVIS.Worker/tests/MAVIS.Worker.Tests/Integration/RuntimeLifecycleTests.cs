using System.Text.Json;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class RuntimeLifecycleTests
{
    private sealed class Backend : IRuntimeSessionBackend
    {
        public string Stage => "READINESS";
        public bool FailStart, FailEvidence, FailCleanup, Cancel;
        public int CleanupCalls, PreserveCalls;
        public IReadOnlyList<RuntimeInfrastructureActionResult> Actions = [];
        public bool FailActions;
        public bool Interactive;
        public int ScenarioCalls;
        public bool InteractiveStudio => Interactive;
        public IReadOnlyList<RuntimeInfrastructureActionResult> ObservedInfrastructureActions => Actions;
        public Task PrepareAndStartAsync(CancellationToken ct)
        {
            if (FailStart) throw new InvalidOperationException("SECRET_SENTINEL");
            if (Cancel) throw new OperationCanceledException();
            return Task.CompletedTask;
        }
        public Task WaitUntilReadyAsync(CancellationToken ct) => Task.CompletedTask;
        public Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct)
        {
            ScenarioCalls++;
            return Task.FromResult(new HttpScenarioOutcome("s", ScenarioCalls > 1 ? "Passed" : "Failed", []));
        }
        public Task<IReadOnlyList<RuntimeInfrastructureActionResult>> ExecuteInfrastructureActionsAsync(CancellationToken ct) =>
            FailActions ? throw new RuntimeStageException("INFRASTRUCTURE_ACTION_UNCONFIRMED") : Task.FromResult(Actions);
        public Task<TraceCorrelationResult?> PreserveEvidenceAsync(CancellationToken ct)
        {
            PreserveCalls++;
            if (FailEvidence) throw new InvalidOperationException("SECRET_SENTINEL");
            return Task.FromResult<TraceCorrelationResult?>(new("s", "m", [], [], ["NO_USABLE_SPANS"]));
        }
        public Task<bool> CleanupAsync(CancellationToken ct) { CleanupCalls++; return Task.FromResult(!FailCleanup); }
    }

    [Fact]
    public async Task EvidenceFailureNeverSkipsCleanupOrLeaksDiagnostics()
    {
        var backend = new Backend { FailStart = true, FailEvidence = true };
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5);
        Assert.Equal("Failed", result.ExecutionStatus); Assert.Equal("Failed", result.EvidenceStatus);
        Assert.Equal("Confirmed", result.CleanupStatus); Assert.Equal(1, backend.CleanupCalls);
        Assert.DoesNotContain("SECRET_SENTINEL", JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task ScenarioFailureIsSeparateFromProcessingAndCleanup()
    {
        var result = await RuntimeSessionLifecycle.RunAsync(new Backend { FailCleanup = true }, 5);
        Assert.Equal("Completed", result.ExecutionStatus); Assert.Equal("Failed", result.ScenarioStatus);
        Assert.Equal("Empty", result.EvidenceStatus); Assert.Equal("Incomplete", result.CleanupStatus);
    }

    [Fact]
    public async Task ConfirmedInfrastructureActionsAreIncludedInOutcomeBeforeReceiptSerialization()
    {
        var action = new RuntimeInfrastructureActionResult("SCALE", "orders", 1, 4,
            new() { ["replicas"] = 1 }, new() { ["replicas"] = 4 }, DateTimeOffset.UtcNow, true);
        var result = await RuntimeSessionLifecycle.RunAsync(new Backend { Actions = [action] }, 5);
        Assert.Equal(action, Assert.Single(result.InfrastructureActions!));
    }

    [Fact]
    public async Task StudioScenarioIsCheckedAgainAfterConfirmedActions()
    {
        var action = new RuntimeInfrastructureActionResult("START", "payment", 0, 1,
            new() { ["replicas"] = 0 }, new() { ["replicas"] = 1 }, DateTimeOffset.UtcNow, true);
        var backend = new Backend { Actions = [action], Interactive = true };

        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5);

        Assert.Equal(2, backend.ScenarioCalls);
        Assert.Equal("Passed", result.ScenarioStatus);
    }

    [Fact]
    public async Task PartialActionEvidenceSurvivesFailureAndCleanup()
    {
        var action = new RuntimeInfrastructureActionResult("STOP", "orders", 1, 0,
            new() { ["replicas"] = 1 }, new() { ["replicas"] = 0 }, DateTimeOffset.UtcNow, true);
        var backend = new Backend { Actions = [action], FailActions = true };
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5);
        Assert.Equal("Failed", result.ExecutionStatus);
        Assert.Equal(action, Assert.Single(result.InfrastructureActions!));
        Assert.Equal("Confirmed", result.CleanupStatus);
        Assert.Equal(1, backend.CleanupCalls);
    }

    [Fact]
    public async Task CancellationStillPreservesEvidenceAndCleansWithFreshToken()
    {
        var backend = new Backend { Cancel = true };
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5, new CancellationToken(true));
        Assert.Equal("Cancelled", result.ExecutionStatus); Assert.Equal(1, backend.PreserveCalls); Assert.Equal(1, backend.CleanupCalls);
    }

    [Fact]
    public async Task TimeoutReportsStageAndStillCleansUp()
    {
        var backend = new Backend { Cancel = true };
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5);
        Assert.Equal("TimedOut", result.ExecutionStatus);
        Assert.Contains("SESSION_TIMED_OUT_AT_READINESS", result.Diagnostics);
        Assert.Equal("Confirmed", result.CleanupStatus);
    }

    [Fact]
    public void OverrideForcesResourcesIsolationAndInstrumentation()
    {
        var digest = new string('a', 64);
        var preflight = ComposePreflight.Check($"services:\n  app:\n    image: app@sha256:{digest}");
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["app"] = new("dotnet8-linux-x64-glibc", 8080) }, ApprovedForLocalPoc: true);
        using var json = JsonDocument.Parse(ComposeOverrideBuilder.Build(preflight, profile, Path.GetFullPath("collector.yaml")));
        var app = json.RootElement.GetProperty("services").GetProperty("app");
        Assert.Equal("ALL", app.GetProperty("cap_drop")[0].GetString());
        Assert.False(app.TryGetProperty("ports", out _));
        Assert.Equal("1", app.GetProperty("environment").GetProperty("CORECLR_ENABLE_PROFILING").GetString());
        Assert.True(json.RootElement.GetProperty("networks").GetProperty("default").GetProperty("internal").GetBoolean());
        Assert.Throws<ArgumentException>(() => ComposeOverrideBuilder.Build(preflight, profile with { ApprovedForLocalPoc = false }, Path.GetFullPath("collector.yaml")));
    }

    private sealed class FailingDocker : IDockerCommands
    {
        public bool FailHelperQuery;
        public List<IReadOnlyList<string>> Commands { get; } = [];
        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string directory, int timeout, CancellationToken ct)
        {
            if (args.Contains("up"))
                Assert.True(timeout > int.Parse(args[args.ToList().IndexOf("--wait-timeout") + 1]), "The CLI must outlive Compose's own readiness deadline.");
            Commands.Add(args);
            if (FailHelperQuery && args.Contains("--no-trunc")) throw new IOException("helper query unavailable");
            if (args.Count > 1 && args[0] == "volume" && args[1] == "inspect")
                return Task.FromResult(new DockerCommandResult(0, "{\"mavis.java.version\":\"2.32.0\",\"mavis.dotnet.version\":\"1.17.0\"}"));
            return Task.FromResult(args[0] == "info" ? new DockerCommandResult(0, "linux") :
                args.Contains("up") ? new DockerCommandResult(1, "") : new DockerCommandResult(0, ""));
        }
    }

    [Fact]
    public async Task RecoveryTargetsOnlyGeneratedProjectAndConfirmedResources()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-recovery-" + Guid.NewGuid().ToString("N"));
        var project = "mavisrun-" + Guid.NewGuid().ToString("N");
        var directory = Path.Combine(root, project);
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "compose.yaml"), "services: {}");
        File.WriteAllText(Path.Combine(directory, "override.json"), "{}");
        var docker = new FailingDocker();
        try
        {
            await Assert.ThrowsAsync<ArgumentException>(() => SessionRecovery.RecoverAsync(root, "../other", docker));
            Assert.True(await SessionRecovery.RecoverAsync(root, project, docker));
            Assert.False(Directory.Exists(directory));
            Assert.True(File.Exists(Path.Combine(root, ".allocation-" + project + ".json")));
            Assert.Contains(docker.Commands, c => c.Contains(project) && c.Contains("down"));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Theory]
    [InlineData(30)]
    [InlineData(300)]
    public async Task ComposeStartupUsesTheApprovedProfileDeadline(int seconds)
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-deadline-" + Guid.NewGuid().ToString("N"));
        var digest = new string('b', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("java", 8080) },
            TimeoutSeconds: seconds, ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile",
            $"services:\n  orders:\n    image: demo/orders@sha256:{digest}", profile,
            new("s", [new("health", "orders", "GET", "/health", 200)]), new Dictionary<string, string>(), "config", "scenario");
        var docker = new FailingDocker();
        try
        {
            await RuntimeSessionLifecycle.RunAsync(new DockerComposeSession(definition, root, "receivers: {}", docker), 30);
            var startup = Assert.Single(docker.Commands.Where(command => command.Contains("up")));
            Assert.Equal(seconds.ToString(), startup[startup.ToList().IndexOf("--wait-timeout") + 1]);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FailedComposeUpStillRunsDownAndConfirmsEveryResourceKind(bool helperFailure)
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-session-" + Guid.NewGuid().ToString("N"));
        var digest = new string('a', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["app"] = new("java", 8080) }, ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile", $"services:\n  app:\n    image: app@sha256:{digest}",
            profile, new("s", [new("health", "app", "GET", "/health", 200)]), new Dictionary<string, string>(), "config", "scenario");
        var docker = new FailingDocker { FailHelperQuery = helperFailure };
        try
        {
            var result = await RuntimeSessionLifecycle.RunAsync(new DockerComposeSession(definition, root, "receivers: {}", docker), 30);
            Assert.Equal("Failed", result.ExecutionStatus); Assert.Equal(helperFailure ? "Incomplete" : "Confirmed", result.CleanupStatus);
            Assert.Contains(docker.Commands, c => c.Contains("down") && c.Contains("--volumes"));
            Assert.Contains(docker.Commands, c => c[0] == "volume"); Assert.Contains(docker.Commands, c => c[0] == "network");
            Assert.Equal(helperFailure, Directory.GetDirectories(root).Any(p => Path.GetFileName(p).StartsWith("mavisrun-", StringComparison.Ordinal)));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    private sealed class CrashInspectDocker : IDockerCommands
    {
        public bool MissingLocalImage { get; init; }
        public string UpStdErr { get; init; } = "container mavisrun-sandbox-postgres-1 exited (1)";
        public string PsTable { get; init; } = "sandbox-postgres|exited||1\norder-service|created||0\n";
        public string CrashLogs { get; init; } = "Error: password=SECRET_DB_PASS is required";
        public List<IReadOnlyList<string>> Commands { get; } = [];

        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string directory, int timeout, CancellationToken ct)
        {
            Commands.Add(args);
            if (args[0] == "info") return Task.FromResult(new DockerCommandResult(0, "linux"));
            if (args.Count > 1 && args[0] == "volume" && args[1] == "inspect")
                return Task.FromResult(new DockerCommandResult(0, "{\"mavis.java.version\":\"2.32.0\",\"mavis.dotnet.version\":\"1.17.0\"}"));
            if (args.Count > 1 && args[0] == "image" && args[1] == "inspect")
                return Task.FromResult(MissingLocalImage
                    ? new DockerCommandResult(1, "", "No such image")
                    : new DockerCommandResult(0, args[^1]));
            if (args.Contains("up")) return Task.FromResult(new DockerCommandResult(1, "", UpStdErr));
            if (args.Contains("ps") && args.Contains("--format")) return Task.FromResult(new DockerCommandResult(0, PsTable));
            if (args.Contains("logs")) return Task.FromResult(new DockerCommandResult(0, CrashLogs));
            return Task.FromResult(new DockerCommandResult(0, ""));
        }
    }

    [Fact]
    public async Task MissingLocalSha256ImageFailsFastBeforeComposeUpWithServiceCode()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-img-" + Guid.NewGuid().ToString("N"));
        var digest = new string('a', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["order-service"] = new("java", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile",
            $"services:\n  order-service:\n    image: sha256:{digest}",
            profile, new("s", [new("health", "order-service", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario");
        var docker = new CrashInspectDocker { MissingLocalImage = true };
        try
        {
            var result = await RuntimeSessionLifecycle.RunAsync(new DockerComposeSession(definition, root, "receivers: {}", docker), 30);
            Assert.Equal("Failed", result.ExecutionStatus);
            Assert.Contains("LOCAL_IMAGE_MISSING_ORDER_SERVICE", result.Diagnostics);
            Assert.DoesNotContain(docker.Commands, c => c.Contains("up"));
            Assert.Equal("Confirmed", result.CleanupStatus);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task FailedComposeUpCapturesExitedContainerCodeAndRedactsTelemetryLogsWithoutLeakingSecrets()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-crash-" + Guid.NewGuid().ToString("N"));
        var digest = new string('b', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["order-service"] = new("java", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile",
            $"services:\n  order-service:\n    image: sha256:{digest}\n  sandbox-postgres:\n    image: postgres@sha256:{digest}",
            profile, new("s", [new("health", "order-service", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario", InteractiveStudio: true);
        var docker = new CrashInspectDocker();
        var secrets = new Dictionary<string, string> { ["POSTGRES_PASSWORD"] = "SECRET_DB_PASS" };
        try
        {
            var result = await RuntimeSessionLifecycle.RunAsync(
                new DockerComposeSession(definition, root, "receivers: {}", docker, secrets), 30);
            Assert.Equal("Failed", result.ExecutionStatus);
            Assert.Contains("DOCKER_UP_CONTAINER_EXITED", result.Diagnostics);
            Assert.Contains("CONTAINER_EXITED_SANDBOX_POSTGRES_CODE_1", result.Diagnostics);
            Assert.DoesNotContain("SECRET_DB_PASS", JsonSerializer.Serialize(result));
            Assert.Equal("Confirmed", result.CleanupStatus);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }
}

using System.Text.Json;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class RuntimeLifecycleTests
{
    private sealed class Backend : IRuntimeSessionBackend
    {
        public bool FailStart, FailEvidence, FailCleanup, Cancel;
        public int CleanupCalls, PreserveCalls;
        public Task PrepareAndStartAsync(CancellationToken ct)
        {
            if (FailStart) throw new InvalidOperationException("SECRET_SENTINEL");
            if (Cancel) throw new OperationCanceledException();
            return Task.CompletedTask;
        }
        public Task WaitUntilReadyAsync(CancellationToken ct) => Task.CompletedTask;
        public Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct) => Task.FromResult(new HttpScenarioOutcome("s", "Failed", []));
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
    public async Task CancellationStillPreservesEvidenceAndCleansWithFreshToken()
    {
        var backend = new Backend { Cancel = true };
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5, new CancellationToken(true));
        Assert.Equal("Cancelled", result.ExecutionStatus); Assert.Equal(1, backend.PreserveCalls); Assert.Equal(1, backend.CleanupCalls);
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
            var result = await RuntimeSessionLifecycle.RunAsync(new DockerComposeSession(definition, root, "receivers: {}", docker), 5);
            Assert.Equal("Failed", result.ExecutionStatus); Assert.Equal(helperFailure ? "Incomplete" : "Confirmed", result.CleanupStatus);
            Assert.Contains(docker.Commands, c => c.Contains("down") && c.Contains("--volumes"));
            Assert.Contains(docker.Commands, c => c[0] == "volume"); Assert.Contains(docker.Commands, c => c[0] == "network");
            Assert.Equal(helperFailure, Directory.GetDirectories(root).Any(p => Path.GetFileName(p).StartsWith("mavisrun-", StringComparison.Ordinal)));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }
}

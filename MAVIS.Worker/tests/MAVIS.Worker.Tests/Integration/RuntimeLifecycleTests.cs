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
        public string[]? ScenarioStatuses;
        public bool InteractiveStudio => Interactive;
        public IReadOnlyList<RuntimeInfrastructureActionResult> ObservedInfrastructureActions => Actions;
        public Task PrepareAndStartAsync(CancellationToken ct)
        {
            if (FailStart) throw new InvalidOperationException("SECRET_SENTINEL");
            // Faithful to a real hang: block until the session deadline (or caller) cancels the token.
            if (Cancel) return Task.Delay(Timeout.Infinite, ct);
            return Task.CompletedTask;
        }
        public Task WaitUntilReadyAsync(CancellationToken ct) => Task.CompletedTask;
        public Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct)
        {
            var idx = ScenarioCalls++;
            var outcome = ScenarioStatuses is not null && idx < ScenarioStatuses.Length
                ? ScenarioStatuses[idx]
                : (ScenarioCalls > 1 ? "Passed" : "Failed");
            return Task.FromResult(new HttpScenarioOutcome("s", outcome, []));
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
    public async Task StudioPreservesPassingBaselineWhenFaultOrLoadDrillEndsDegraded()
    {
        var action = new RuntimeInfrastructureActionResult("PAUSE", "catalog", 1, 0,
            new() { ["replicas"] = 1 }, new() { ["replicas"] = 0 }, DateTimeOffset.UtcNow, true);
        var degradedEnd = new Backend { Actions = [action], Interactive = true, ScenarioStatuses = ["Passed", "Failed"] };
        var passedDrill = await RuntimeSessionLifecycle.RunAsync(degradedEnd, 5);
        Assert.Equal(2, degradedEnd.ScenarioCalls);
        Assert.Equal("Passed", passedDrill.ScenarioStatus);

        var unrecovered = new Backend { Actions = [action], Interactive = true, ScenarioStatuses = ["Failed", "Failed"] };
        var failedRecovery = await RuntimeSessionLifecycle.RunAsync(unrecovered, 5);
        Assert.Equal(2, unrecovered.ScenarioCalls);
        Assert.Equal("Failed", failedRecovery.ScenarioStatus);
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
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 1);
        Assert.Equal("TimedOut", result.ExecutionStatus);
        Assert.Contains("SESSION_TIMED_OUT_AT_READINESS", result.Diagnostics);
        Assert.Equal("Confirmed", result.CleanupStatus);
    }

    private sealed class InteractiveLeaseBackend : IRuntimeSessionBackend
    {
        public string Stage => "STUDIO_LOOP";
        public bool InteractiveStudio => true;
        public IReadOnlyList<RuntimeInfrastructureActionResult> ObservedInfrastructureActions { get; set; } = [];
        public int ActionLoopDelayMs { get; set; } = 1500;
        public int ScenarioCalls { get; private set; }
        public int CleanupCalls { get; private set; }
        public Task PrepareAndStartAsync(CancellationToken ct) => Task.CompletedTask;
        public Task WaitUntilReadyAsync(CancellationToken ct) => Task.CompletedTask;
        public Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct)
        {
            ScenarioCalls++;
            return Task.FromResult(new HttpScenarioOutcome("s", "Passed", []));
        }
        public async Task<IReadOnlyList<RuntimeInfrastructureActionResult>> ExecuteInfrastructureActionsAsync(CancellationToken ct)
        {
            await Task.Delay(ActionLoopDelayMs, ct);
            return ObservedInfrastructureActions;
        }
        public Task<TraceCorrelationResult?> PreserveEvidenceAsync(CancellationToken ct) =>
            Task.FromResult<TraceCorrelationResult?>(new("s", "m", [], [], []));
        public Task<bool> CleanupAsync(CancellationToken ct) { CleanupCalls++; return Task.FromResult(true); }
    }

    [Fact]
    public async Task InteractiveStudioOutlivesBootTimeoutAndAutoFinishesGracefullyWhenCeilingHitsWithActions()
    {
        var action = new RuntimeInfrastructureActionResult("PAUSE", "payment", 1, 0,
            new() { ["replicas"] = 1 }, new() { ["replicas"] = 0 }, DateTimeOffset.UtcNow, true);

        // Runs 1.4s in STUDIO_LOOP with 1s boot timeout and 3s interactive lease -> completes normally without timing out.
        var normal = new InteractiveLeaseBackend { ObservedInfrastructureActions = [action], ActionLoopDelayMs = 1400 };
        var normalResult = await RuntimeSessionLifecycle.RunAsync(normal, timeoutSeconds: 1, interactiveSessionMaxSeconds: 3);
        Assert.Equal("Completed", normalResult.ExecutionStatus);
        Assert.Equal("Passed", normalResult.ScenarioStatus);
        Assert.Equal("Confirmed", normalResult.CleanupStatus);
        Assert.DoesNotContain("STUDIO_MAX_DURATION_AUTO_FINISHED", normalResult.Diagnostics);

        // Hits 1s interactive ceiling while holding a confirmed action -> graceful auto-finish seals Completed instead of TimedOut.
        var autoFinish = new InteractiveLeaseBackend { ObservedInfrastructureActions = [action], ActionLoopDelayMs = 5000 };
        var autoResult = await RuntimeSessionLifecycle.RunAsync(autoFinish, timeoutSeconds: 5, interactiveSessionMaxSeconds: 1);
        Assert.Equal("Completed", autoResult.ExecutionStatus);
        Assert.Equal("Passed", autoResult.ScenarioStatus);
        Assert.Equal("Confirmed", autoResult.CleanupStatus);
        Assert.Contains("STUDIO_MAX_DURATION_AUTO_FINISHED", autoResult.Diagnostics);
        Assert.Single(autoResult.InfrastructureActions!);
    }

    [Fact]
    public async Task InteractiveStudioCeilingWithoutActionsMarksTimedOutAndCleansUp()
    {
        var idle = new InteractiveLeaseBackend { ObservedInfrastructureActions = [], ActionLoopDelayMs = 5000 };
        var result = await RuntimeSessionLifecycle.RunAsync(idle, timeoutSeconds: 5, interactiveSessionMaxSeconds: 1);
        Assert.Equal("TimedOut", result.ExecutionStatus);
        Assert.Contains("SESSION_TIMED_OUT_AT_STUDIO_LOOP", result.Diagnostics);
        Assert.Equal("Confirmed", result.CleanupStatus);
        Assert.Equal(1, idle.CleanupCalls);
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

        // A hung `compose up` ends only when the session deadline (or caller) cancels the token, like real Docker.
        private static async Task<DockerCommandResult> HangUntilCancelled(CancellationToken ct)
        {
            await Task.Delay(Timeout.Infinite, ct);
            throw new InvalidOperationException("unreachable");
        }
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
        public bool CancelUp { get; init; }
        public Action? BeforeUpCancellation { get; init; }
        public string UpStdErr { get; init; } = "container mavisrun-sandbox-postgres-1 exited (1)";
        public string PsTable { get; init; } = "sandbox-postgres|exited||1\norder-service|created||0\n";
        public string CrashLogs { get; init; } = "Error: password=SECRET_DB_PASS is required";
        public bool CrashLogsOnStderr { get; init; }
        public List<IReadOnlyList<string>> Commands { get; } = [];

        // A hung `compose up` ends only when the session deadline (or caller) cancels the token, like real Docker.
        private static async Task<DockerCommandResult> HangUntilCancelled(CancellationToken ct)
        {
            await Task.Delay(Timeout.Infinite, ct);
            throw new InvalidOperationException("unreachable");
        }

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
            if (args.Contains("up") && CancelUp) { BeforeUpCancellation?.Invoke(); return HangUntilCancelled(ct); }
            if (args.Contains("up")) return Task.FromResult(new DockerCommandResult(1, "", UpStdErr));
            if (args.Contains("ps") && args.Contains("--format")) return Task.FromResult(new DockerCommandResult(0, PsTable));
            if (args.Contains("logs")) return Task.FromResult(CrashLogsOnStderr
                ? new DockerCommandResult(0, "", CrashLogs) : new DockerCommandResult(0, CrashLogs));
            return Task.FromResult(new DockerCommandResult(0, ""));
        }
    }

    private sealed class DiagnosticTransport : HttpMessageHandler
    {
        public JsonElement Payload;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            using var document = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Payload = document.RootElement.Clone();
            return new(System.Net.HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new
            {
                code = 200, data = new { sessionId = "s", resourceProject = Payload.GetProperty("resourceProject").GetString() }
            })) };
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task StartupDiagnosticsPrioritizeFailedBrokerAfterManyHealthyServicesAndRetainRedaction(bool stderr)
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-diagnostics-" + Guid.NewGuid().ToString("N"));
        var digest = new string('b', 64);
        var names = new[] { "order-service" }.Concat(Enumerable.Range(0, 10).Select(i => "healthy-" + i)).Append("kafka").ToArray();
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["order-service"] = new("java", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile",
            "services:\n" + string.Concat(names.Select(name => $"  {name}:\n    image: demo/service@sha256:{digest}\n")),
            profile, new("s", [new("health", "order-service", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario", InteractiveStudio: true);
        var docker = new CrashInspectDocker
        {
            PsTable = string.Concat(names.Where(name => name != "kafka").Select(name => name + "|running|healthy|0\n")) + "kafka|exited||1\n",
            CrashLogs = "Permission denied password=SECRET_DB_PASS", CrashLogsOnStderr = stderr
        };
        var transport = new DiagnosticTransport();
        using var studio = new JavaRuntimeClient(new Uri("https://java.invalid"), "fixture-only", transport);
        try
        {
            await RuntimeSessionLifecycle.RunAsync(new DockerComposeSession(definition, root, "receivers: {}", docker,
                new Dictionary<string, string> { ["PASSWORD"] = "SECRET_DB_PASS" }, studio: studio), 30);
            var service = Assert.Single(transport.Payload.GetProperty("telemetry").GetProperty("services").EnumerateArray());
            Assert.Equal("kafka", service.GetProperty("service").GetString());
            Assert.Equal(1, service.GetProperty("replicas").GetInt32());
            Assert.Equal(0, service.GetProperty("runningReplicas").GetInt32());
            Assert.Contains("Permission denied", service.GetProperty("logs").GetString());
            Assert.DoesNotContain("SECRET_DB_PASS", transport.Payload.ToString());
            Assert.Single(docker.Commands.Where(command => command.Contains("logs")));
            Assert.DoesNotContain(docker.Commands, command => command[0] == "compose" && command.Contains("ps") && command.Contains("--quiet"));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ComposeStartupTimeoutOrCancelStillPublishesRedactedLogsBeforeCleanup(bool cancelled)
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-timeout-logs-" + Guid.NewGuid().ToString("N"));
        var digest = new string('b', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["order-service"] = new("java", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile",
            $"services:\n  order-service:\n    image: demo/service@sha256:{digest}\n", profile,
            new("s", [new("health", "order-service", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario", InteractiveStudio: true);
        using var cancellation = new CancellationTokenSource();
        var docker = new CrashInspectDocker { CancelUp = true, BeforeUpCancellation = () => { if (cancelled) cancellation.Cancel(); },
            PsTable = "order-service|running|starting|0\n" };
        var transport = new DiagnosticTransport();
        using var studio = new JavaRuntimeClient(new Uri("https://java.invalid"), "fixture-only", transport);
        try
        {
            var outcome = await RuntimeSessionLifecycle.RunAsync(new DockerComposeSession(definition, root,
                "receivers: {}", docker, new Dictionary<string, string> { ["PASSWORD"] = "SECRET_DB_PASS" }, studio: studio), 2, cancellation.Token);
            Assert.Equal(cancelled ? "Cancelled" : "TimedOut", outcome.ExecutionStatus);
            if (!cancelled) Assert.Contains("SESSION_TIMED_OUT_AT_DOCKER_UP", outcome.Diagnostics);
            Assert.Equal("Confirmed", outcome.CleanupStatus);
            var service = Assert.Single(transport.Payload.GetProperty("telemetry").GetProperty("services").EnumerateArray());
            Assert.Equal("order-service", service.GetProperty("service").GetString());
            Assert.Contains("[REDACTED]", service.GetProperty("logs").GetString());
            Assert.DoesNotContain("SECRET_DB_PASS", transport.Payload.ToString());
            var logsAt = docker.Commands.FindIndex(command => command.Contains("logs"));
            var downAt = docker.Commands.FindIndex(command => command.Contains("down"));
            Assert.True(logsAt >= 0 && downAt > logsAt);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
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

    [Fact]
    public void OverrideBuilderAppliesKernelSandboxRuntimeAndRejectsUnknownRuntime()
    {
        var digest = new string('d', 64);
        var preflight = ComposePreflight.Check($"services:\n  api:\n    image: app@sha256:{digest}\n");
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["api"] = new("java", 8080) }, ApprovedForLocalPoc: true);

        using var doc = JsonDocument.Parse(ComposeOverrideBuilder.Build(
            preflight, profile, Path.GetFullPath("collector.yaml"), ociRuntime: "runsc", writableRootfsUnderKernelSandbox: true));
        var api = doc.RootElement.GetProperty("services").GetProperty("api");
        Assert.Equal("runsc", api.GetProperty("runtime").GetString());
        Assert.False(api.GetProperty("read_only").GetBoolean());
        var collector = doc.RootElement.GetProperty("services").GetProperty("mavis-collector");
        Assert.True(collector.GetProperty("read_only").GetBoolean());
        Assert.False(collector.TryGetProperty("runtime", out _));

        Assert.Throws<ArgumentException>(() => ComposeOverrideBuilder.Build(
            preflight, profile, Path.GetFullPath("collector.yaml"), ociRuntime: "untrusted-oci"));
    }

    [Fact]
    public async Task ExplicitRunscFailsWithOciRuntimeUnavailableWhenDaemonLacksGvisor()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-gvisor-missing-" + Guid.NewGuid().ToString("N"));
        var digest = new string('e', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["api"] = new("passthrough", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile",
            $"services:\n  api:\n    image: sha256:{digest}", profile,
            new("s", [new("health", "api", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario");
        var docker = new RuntimesMockDocker("{\"runc\":{\"path\":\"runc\"}}", hostConfigRuntime: "runc");
        try
        {
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker, ociRuntime: "runsc");
            var result = await RuntimeSessionLifecycle.RunAsync(session, 30);
            Assert.Equal("Failed", result.ExecutionStatus);
            Assert.Contains("OCI_RUNTIME_UNAVAILABLE", result.Diagnostics);
            Assert.Equal("Confirmed", result.CleanupStatus);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task AutoRuntimeSelectsGvisorAndVerifiesHostConfigRuntimeEnforcement()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-gvisor-ok-" + Guid.NewGuid().ToString("N"));
        var digest = new string('f', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["api"] = new("passthrough", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var definition = new RuntimeRunDefinition("s", "m", "snapshot", "profile",
            $"services:\n  api:\n    image: sha256:{digest}", profile,
            new("s", [new("health", "api", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario");
        var docker = new RuntimesMockDocker("{\"runc\":{\"path\":\"runc\"},\"runsc\":{\"path\":\"/usr/bin/runsc\"}}", hostConfigRuntime: "runc");
        try
        {
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker, ociRuntime: "auto", writableRootfsUnderKernelSandbox: true);
            var result = await RuntimeSessionLifecycle.RunAsync(session, 30);
            Assert.Equal("runsc", session.IsolationRuntime);
            // Docker returned HostConfig.Runtime="runc" even though override requested "runsc" -> must reject!
            Assert.Equal("Failed", result.ExecutionStatus);
            Assert.Contains("SANDBOX_ENFORCEMENT_UNCONFIRMED", result.Diagnostics);
            Assert.Equal("Confirmed", result.CleanupStatus);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task RemoteStudioCancelRequestedCancelsSessionCleanly()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-remote-cancel-" + Guid.NewGuid().ToString("N"));
        var digest = new string('a', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["api"] = new("passthrough", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var project = "mavisrun-" + new string('c', 32);
        var definition = new RuntimeRunDefinition("session-rc", "m", "snapshot", "profile",
            $"services:\n  api:\n    image: sha256:{digest}", profile,
            new("session-rc", [new("health", "api", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario", ResourceProject: project, InteractiveStudio: true);
        var docker = new RuntimesMockDocker("{\"runc\":{\"path\":\"runc\"}}", hostConfigRuntime: "runc", imageId: "sha256:" + digest);
        using var handler = new CancelPollHandler("session-rc", project);
        using var java = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080"), "svc-key", handler);
        using var cts = new CancellationTokenSource();
        try
        {
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker,
                lifecycle: java, studio: java, onRemoteCancel: cts.Cancel);
            var result = await RuntimeSessionLifecycle.RunAsync(session, 30, cts.Token);
            Assert.Equal("Cancelled", result.ExecutionStatus);
            Assert.Equal("Confirmed", result.CleanupStatus);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task RemoteStudioCancelDuringDockerUpAbortsStartupPromptlyAndCleansUp()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-remote-cancel-up-" + Guid.NewGuid().ToString("N"));
        var digest = new string('a', 64);
        var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile> { ["api"] = new("passthrough", 8080) },
            ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
        var project = "mavisrun-" + new string('d', 32);
        var definition = new RuntimeRunDefinition("session-rc-up", "m", "snapshot", "profile",
            $"services:\n  api:\n    image: sha256:{digest}", profile,
            new("session-rc-up", [new("health", "api", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario", ResourceProject: project, InteractiveStudio: true);
        var docker = new RuntimesMockDocker("{\"runc\":{\"path\":\"runc\"}}", hostConfigRuntime: "runc",
            imageId: "sha256:" + digest, blockComposeUpUntilCancelled: true);
        using var handler = new CancelPollHandler("session-rc-up", project);
        using var java = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080"), "svc-key", handler);
        using var cts = new CancellationTokenSource();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker,
                lifecycle: java, studio: java, onRemoteCancel: cts.Cancel);
            var result = await RuntimeSessionLifecycle.RunAsync(session, 30, cts.Token);
            sw.Stop();
            Assert.Equal("Cancelled", result.ExecutionStatus);
            Assert.Equal("Confirmed", result.CleanupStatus);
            Assert.True(sw.Elapsed < TimeSpan.FromSeconds(8), $"Expected prompt cancel during DOCKER_UP, took {sw.Elapsed}");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    private sealed class RuntimesMockDocker(string runtimesJson, string hostConfigRuntime, string? imageId = null, bool blockComposeUpUntilCancelled = false) : IDockerCommands
    {
        private readonly string _appId = new('1', 64);
        private readonly string _collectorId = new('2', 64);
        private readonly string _image = imageId ?? "sha256:" + new string('f', 64);
        public async Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, CancellationToken ct)
        {
            if (args[0] == "info" && args.Contains("{{.OSType}}")) return new DockerCommandResult(0, "linux\n", "");
            if (args[0] == "info" && args.Contains("{{json .Runtimes}}")) return new DockerCommandResult(0, runtimesJson, "");
            if (args[0] == "image" && args[1] == "inspect") return new DockerCommandResult(0, _image + "\n", "");
            if (args[0] == "compose" && args.Contains("up"))
            {
                if (blockComposeUpUntilCancelled) await Task.Delay(Timeout.InfiniteTimeSpan, ct);
                return new DockerCommandResult(0, "", "");
            }
            if (args[0] == "compose" && args.Contains("ps") && args.Contains("--quiet"))
                return new DockerCommandResult(0, (args.Contains("mavis-collector") ? _collectorId : _appId) + "\n", "");
            if (args[0] == "compose" && args.Contains("ps") && args.Contains("--format"))
                return new DockerCommandResult(0, $"api|{_appId}|running\n", "");
            if (args[0] == "compose" && args.Contains("down")) return new DockerCommandResult(0, "", "");
            if (args[0] == "inspect" && args.Contains("{{.Image}}")) return new DockerCommandResult(0, _image + "\n", "");
            if (args[0] == "inspect" && args.Contains("{{json .HostConfig}}"))
            {
                var isCollector = args.Contains(_collectorId);
                var mem = 256 * 1024L * 1024L;
                var pids = isCollector ? 64 : 256;
                var ro = !isCollector && hostConfigRuntime == "runsc" ? "false" : "true";
                return new DockerCommandResult(0,
                    $"{{\"Privileged\":false,\"ReadonlyRootfs\":{ro},\"Runtime\":\"{hostConfigRuntime}\",\"Memory\":{mem},\"NanoCpus\":1000000000,\"PidsLimit\":{pids},\"CapDrop\":[\"ALL\"],\"SecurityOpt\":[\"no-new-privileges:true\"]}}", "");
            }
            if (args[0] == "network" && args[1] == "inspect") return new DockerCommandResult(0, "true\n", "");
            return new DockerCommandResult(0, "", "");
        }

        public Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, string input, CancellationToken ct)
        {
            var outcome = JsonSerializer.Serialize(new HttpScenarioOutcome("s", "Passed",
                [new HttpStepOutcome("health", "Passed", 200, new string('1', 32), new string('2', 16), 1)]),
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            return Task.FromResult(new DockerCommandResult(0, outcome, ""));
        }
    }

    private sealed class CancelPollHandler(string sessionId, string project) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            string payload;
            if (path.EndsWith("/lifecycle-ack", StringComparison.Ordinal))
            {
                var body = request.Content!.ReadAsStringAsync(cancellationToken).Result;
                using var doc = JsonDocument.Parse(body);
                var stage = doc.RootElement.GetProperty("stage").GetString();
                payload = JsonSerializer.Serialize(new { status = 200, data = new { sessionId, resourceProject = project, stage } });
            }
            else if (path.EndsWith("/studio/commands", StringComparison.Ordinal))
                payload = JsonSerializer.Serialize(new { status = 200, data = new { sessionId, resourceProject = project, finishRequested = false, cancelRequested = true, command = (object?)null } });
            else
                payload = JsonSerializer.Serialize(new { status = 200, data = new { sessionId, resourceProject = project } });
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent(payload, System.Text.Encoding.UTF8, "application/json") });
        }
    }
}

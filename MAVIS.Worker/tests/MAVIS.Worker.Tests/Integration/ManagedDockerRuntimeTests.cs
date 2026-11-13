using System.Net;
using System.Text;
using System.Text.Json;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class ManagedDockerFactAttribute : FactAttribute
{
    public ManagedDockerFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("MAVIS_MANAGED_DOCKER_TEST_ROOT") is null)
            Skip = "Opt-in real Docker PoC; supply absolute samples/runtime-poc directory.";
    }
}

public sealed class ManagedDockerRuntimeTests
{
    [ManagedDockerFact]
    public async Task RealDockerSuccessAndCancellationUseManagedIdentityAndDurableAcknowledgement()
    {
        var poc = Environment.GetEnvironmentVariable("MAVIS_MANAGED_DOCKER_TEST_ROOT")!;
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(poc, "artifacts", "manifest.json")));
        var profile = manifest.RootElement;
        var root = Path.Combine(poc, "artifacts", "managed-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        // DS-03c: repeat enough mixed terminal paths to prove teardown leaves zero
        // managed projects behind, instead of relying on a single happy-path run.
        foreach (var cancel in new[] { false, true, false, true, false })
        {
            var session = "managed-" + Guid.NewGuid().ToString("N");
            var project = "mavisrun-" + Guid.NewGuid().ToString("N");
            var image = profile.GetProperty("images");
            var definition = new RuntimeRunDefinition(session, "poc-model", "poc-source", "poc-profile",
                $"services:\n  orders:\n    image: {image.GetProperty("orders").GetString()}\n    environment:\n      PAYMENT_URL: http://payment:8080\n  payment:\n    image: {image.GetProperty("payment").GetString()}\n",
                new(profile.GetProperty("collectorImage").GetString()!, profile.GetProperty("instrumentationVolume").GetString()!,
                    new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("dotnet8-linux-x64-glibc", 8080), ["payment"] = new("java", 8080) },
                    MemoryMiB: 512, TimeoutSeconds: 290, ApprovedForLocalPoc: true, ScenarioRunnerImage: image.GetProperty("runner").GetString()),
                new(session, [new("request", "orders", "GET", "/orders", 200)]),
                new Dictionary<string, string> { ["orders"] = "550e8400-e29b-41d4-a716-446655440001", ["payment"] = "550e8400-e29b-41d4-a716-446655440002" }, "poc-config", "poc-scenario", project,
                InfrastructureActions: [new("SCALE", "orders", 2)]);
            var events = new List<string>();
            var handler = new FakeJava(definition, root, cancel, events);
            using var java = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080"), "fixture-managed-key", handler);
            var outcome = await new ManagedRuntimeAdapter(java, new RecordedDocker(root)).RunAsync(session, Path.Combine(poc, "collector.yaml"), root);
            Assert.Equal(cancel ? "Cancelled" : "Completed", outcome.ExecutionStatus);
            Assert.Equal("Confirmed", outcome.CleanupStatus);
            if (!cancel)
            {
                Assert.Equal("Passed", outcome.ScenarioStatus);
                Assert.Equal("Available", outcome.EvidenceStatus);
                Assert.NotEmpty(outcome.Trace!.Interactions!);
                var action = Assert.Single(outcome.InfrastructureActions!);
                Assert.Equal("SCALE", action.Action);
                Assert.Equal(1, action.ReplicasBefore);
                Assert.Equal(2, action.ReplicasAfter);
                Assert.True(action.Confirmed);
                Assert.Equal(1, action.MetricsBefore["requestCount"]!.GetValue<int>());
                Assert.Equal(1, action.MetricsAfter["requestCount"]!.GetValue<int>());
                Assert.NotNull(action.MetricsAfter["p95LatencyMs"]);
                Assert.Equal(0d, action.MetricsAfter["errorRatePercent"]!.GetValue<double>());
            }
            Assert.Equal(new[] { "ALLOCATED", "RUNNING" }, events);
            var receiptPath = Path.Combine(root, "receipts", project + ".json");
            Assert.True(File.Exists(receiptPath));
            Assert.True(File.Exists(Path.Combine(root, "receipts", project + ".ack.json")));
            using var receipt = JsonDocument.Parse(File.ReadAllText(receiptPath));
            Assert.Equal(project, receipt.RootElement.GetProperty("resourceProject").GetString());
            Assert.True(receipt.RootElement.GetProperty("sandboxEnforcementConfirmed").GetBoolean());
            Assert.Equal("Verified", receipt.RootElement.GetProperty("imageSourceCorrespondence").GetString());
            Assert.Equal("Verified", receipt.RootElement.GetProperty("profileAcceptance").GetString());
            if (!cancel) Assert.Single(receipt.RootElement.GetProperty("infrastructureActions").EnumerateArray());
            Assert.False(Directory.Exists(Path.Combine(root, project)));
            // Cleanup result itself checks actual containers, volumes and networks through DockerCommands.
        }
        // Keep redacted receipts/events as local evidence; never delete leftover Docker state after a failing assertion.
    }

    // Keep command timing, never stdin/headers, so an opt-in infrastructure failure is diagnosable.
    private sealed class RecordedDocker(string root) : IDockerCommands
    {
        private readonly DockerCommands docker = new();
        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string directory, int timeout, CancellationToken ct)
            => Record(args, () => docker.RunAsync(args, directory, timeout, ct));
        public Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> args, string directory, int timeout, string input, CancellationToken ct)
            => Record(args, () => docker.RunWithInputAsync(args, directory, timeout, input, ct));
        private async Task<DockerCommandResult> Record(IReadOnlyList<string> args, Func<Task<DockerCommandResult>> run)
        {
            var timer = System.Diagnostics.Stopwatch.StartNew();
            try { var result = await run(); Log("exit=" + result.ExitCode); return result; }
            catch (Exception ex) { Log(ex.GetType().Name); throw; }
            void Log(string result) => File.AppendAllText(Path.Combine(root, "docker-commands.log"),
                $"{timer.ElapsedMilliseconds}ms {result} {string.Join(' ', args)}{Environment.NewLine}");
        }
    }

    private sealed class FakeJava(RuntimeRunDefinition definition, string root, bool cancel, List<string> events) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.Equal("fixture-managed-key", Assert.Single(request.Headers.GetValues("X-Mavis-Runner-Key")));
            var action = request.RequestUri!.Segments.Last();
            object result;
            if (action == "run-definition") result = definition;
            else
            {
                var body = await request.Content!.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(body);
                if (action == "lifecycle-ack")
                {
                    var stage = doc.RootElement.GetProperty("stage").GetString()!;
                    events.Add(stage);
                    Assert.True(File.Exists(Path.Combine(root, "events", definition.ResourceProject + "-" + stage.ToLowerInvariant() + ".json")));
                    if (cancel && stage == "RUNNING")
                        File.WriteAllText(Path.Combine(root, definition.ResourceProject!, "cancel.request"), "cancel");
                    result = new { definition.SessionId, definition.ResourceProject, stage };
                }
                else
                {
                    Assert.Equal("ingest-receipt-ack", action);
                    Assert.True(File.Exists(Path.Combine(root, "receipts", definition.ResourceProject + ".json")));
                    result = new { definition.SessionId, definition.ResourceProject, receiptDigest = ReceiptCanonicalJson.Digest(body), persistenceStatus = "COMMITTED" };
                }
            }
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { status = 200, data = result }, RuntimeLifecycleJournal.Json), Encoding.UTF8, "application/json") };
        }
    }
}

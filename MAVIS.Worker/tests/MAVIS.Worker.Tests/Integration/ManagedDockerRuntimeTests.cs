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
        foreach (var cancel in new[] { false, true })
        {
            var session = "managed-" + Guid.NewGuid().ToString("N");
            var project = "mavisrun-" + Guid.NewGuid().ToString("N");
            var image = profile.GetProperty("images");
            var definition = new RuntimeRunDefinition(session, "poc-model", "poc-source", "poc-profile",
                $"services:\n  orders:\n    image: {image.GetProperty("orders").GetString()}\n    environment:\n      PAYMENT_URL: http://payment:8080\n  payment:\n    image: {image.GetProperty("payment").GetString()}\n",
                new(profile.GetProperty("collectorImage").GetString()!, profile.GetProperty("instrumentationVolume").GetString()!,
                    new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("dotnet8-linux-x64-glibc", 8080), ["payment"] = new("java", 8080) },
                    MemoryMiB: 512, TimeoutSeconds: 120, ApprovedForLocalPoc: true, ScenarioRunnerImage: image.GetProperty("runner").GetString()),
                new(session, [new("request", "orders", "GET", "/orders", 200)]),
                new Dictionary<string, string> { ["orders"] = "550e8400-e29b-41d4-a716-446655440001", ["payment"] = "550e8400-e29b-41d4-a716-446655440002" }, "poc-config", "poc-scenario", project);
            var events = new List<string>();
            var handler = new FakeJava(definition, root, cancel, events);
            using var java = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080"), "fixture-managed-key", handler);
            var outcome = await new ManagedRuntimeAdapter(java, new DockerCommands()).RunAsync(session, Path.Combine(poc, "collector.yaml"), root);
            Assert.Equal(cancel ? "Cancelled" : "Completed", outcome.ExecutionStatus);
            Assert.Equal("Confirmed", outcome.CleanupStatus);
            if (!cancel)
            {
                Assert.Equal("Passed", outcome.ScenarioStatus);
                Assert.Equal("Available", outcome.EvidenceStatus);
                Assert.NotEmpty(outcome.Trace!.Interactions!);
            }
            Assert.Equal(new[] { "ALLOCATED", "RUNNING" }, events);
            var receiptPath = Path.Combine(root, "receipts", project + ".json");
            Assert.True(File.Exists(receiptPath));
            Assert.True(File.Exists(Path.Combine(root, "receipts", project + ".ack.json")));
            using var receipt = JsonDocument.Parse(File.ReadAllText(receiptPath));
            Assert.Equal(project, receipt.RootElement.GetProperty("resourceProject").GetString());
            Assert.True(receipt.RootElement.GetProperty("sandboxEnforcementConfirmed").GetBoolean());
            Assert.False(Directory.Exists(Path.Combine(root, project)));
            // Cleanup result itself checks actual containers, volumes and networks through DockerCommands.
        }
        // Keep redacted receipts/events as local evidence; never delete leftover Docker state after a failing assertion.
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

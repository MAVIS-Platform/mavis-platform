using System.Net;
using System.Text;
using System.Text.Json;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class ManagedRuntimeTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "mavis-managed-" + Guid.NewGuid().ToString("N"));
    private const string Project = "mavisrun-0123456789abcdef0123456789abcdef";
    private const string Receipt = "{\"sessionId\":\"s\",\"resourceProject\":\"" + Project + "\",\"outcome\":{\"cleanupStatus\":\"Confirmed\"}}";

    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public int Calls;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            Assert.Equal("test-runner-key", Assert.Single(request.Headers.GetValues("X-Mavis-Runner-Key")));
            return await respond(request);
        }
    }

    private static HttpResponseMessage Json(object data) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(new { status = 200, data }, RuntimeLifecycleJournal.Json), Encoding.UTF8, "application/json")
    };

    private static JavaRuntimeClient Client(Handler handler) => new(new Uri("http://127.0.0.1:8080/"), "test-runner-key", handler, (_, _) => Task.CompletedTask);

    private static RuntimeRunDefinition Definition()
    {
        var digest = new string('a', 64);
        return new("s", "m", "snapshot", "profile", $"services:\n  app:\n    image: app@sha256:{digest}",
            new("collector@sha256:" + digest, "mavis-agents-v1",
                new Dictionary<string, RuntimeServiceProfile> { ["app"] = new("java", 8080) },
                ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest),
            new("s", [new("health", "app", "GET", "/health", 200)]),
            new Dictionary<string, string> { ["app"] = "550e8400-e29b-41d4-a716-446655440001" }, "config", "scenario", Project);
    }

    [Fact]
    public void ContractFixturesMatchDefinitionAndIndependentCanonicalVectors()
    {
        var fixtures = Path.Combine(AppContext.BaseDirectory, "RuntimeFixtures");
        foreach (var name in new[] { "definition.json", "definition-wrapped.json" })
            Assert.Equal("fixture-session", RuntimeDefinitionReader.Read(File.ReadAllText(Path.Combine(fixtures, name)), "fixture-session").SessionId);
        using var vectors = JsonDocument.Parse(File.ReadAllText(Path.Combine(fixtures, "canonical-vectors.json")));
        foreach (var vector in vectors.RootElement.EnumerateArray())
        {
            var input = vector.GetProperty("input").GetRawText();
            Assert.Equal(vector.GetProperty("canonical").GetString(), Encoding.UTF8.GetString(ReceiptCanonicalJson.Canonicalize(input)));
            Assert.Equal(vector.GetProperty("digest").GetString(), ReceiptCanonicalJson.Digest(input));
        }
    }

    [Fact]
    public void RawAndWrappedDefinitionsMatchAndWrongManagedScopeIsRejected()
    {
        var raw = JsonSerializer.Serialize(Definition(), RuntimeLifecycleJournal.Json);
        var wrapped = "{\"status\":200,\"data\":" + raw + "}";
        Assert.Equal(Project, RuntimeDefinitionReader.Read(raw, "s").ResourceProject);
        Assert.Equal(Project, RuntimeDefinitionReader.Read(wrapped, "s").ResourceProject);
        Assert.Throws<ArgumentException>(() => RuntimeDefinitionReader.Read(wrapped, "other"));
        Assert.Throws<ArgumentException>(() => RuntimeDefinitionReader.Read(raw.Replace("\"resourceProject\":\"" + Project + "\"", "\"resourceProject\":null"), "s"));
        Assert.Throws<JsonException>(() => RuntimeDefinitionReader.Read("{\"unknown\":true}"));
    }

    [Fact]
    public void CanonicalReceiptSortsObjectsOmitsObjectNullsAndPreservesArrayNulls()
    {
        const string input = "{\"z\":null,\"b\":[null,{\"y\":2,\"x\":1}],\"a\":\"Việt\"}";
        Assert.Equal("{\"a\":\"Việt\",\"b\":[null,{\"x\":1,\"y\":2}]}", Encoding.UTF8.GetString(ReceiptCanonicalJson.Canonicalize(input)));
        Assert.Equal("sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a", ReceiptCanonicalJson.Digest("{}"));
        Assert.Throws<ArgumentException>(() => ReceiptCanonicalJson.Digest("{\"x\":null,\"x\":1}"));
        Assert.Throws<ArgumentException>(() => ReceiptCanonicalJson.Digest("{\"x\":1.5}"));
    }

    [Fact]
    public async Task ReceiptRetryUsesSamePayloadAndWritesAckOnlyAfterMatchingCommit()
    {
        var sent = new List<string>();
        var handler = new Handler(async request =>
        {
            Assert.EndsWith("/sessions/s/ingest-receipt-ack", request.RequestUri!.AbsolutePath);
            sent.Add(await request.Content!.ReadAsStringAsync());
            if (sent.Count == 1) throw new HttpRequestException("lost connection");
            return Json(new { sessionId = "s", resourceProject = Project, receiptDigest = ReceiptCanonicalJson.Digest(Receipt), persistenceStatus = "ALREADY_COMMITTED", enrichedModelVersionId = (string?)null });
        });
        using var java = Client(handler);
        var path = RuntimeReceiptStore.Save(root, Project, Receipt);
        var delivery = new RuntimeReceiptDelivery(java);
        var ack = await delivery.DeliverAsync(root, Project);
        Assert.True(File.Exists(ack));
        Assert.Equal(Receipt, File.ReadAllText(path));
        Assert.Equal(2, handler.Calls);
        Assert.All(sent, value => Assert.Equal(Receipt, value));
        await delivery.DeliverAsync(root, Project); // Restart with matching local ack needs no HTTP.
        Assert.Equal(2, handler.Calls);
    }

    [Theory]
    [InlineData(400)]
    [InlineData(401)]
    [InlineData(403)]
    [InlineData(409)]
    [InlineData(302)]
    public async Task PermanentFailureDoesNotRetryOrAcknowledge(int code)
    {
        var handler = new Handler(_ => Task.FromResult(new HttpResponseMessage((HttpStatusCode)code)));
        using var java = Client(handler);
        RuntimeReceiptStore.Save(root, Project, Receipt);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new RuntimeReceiptDelivery(java).DeliverAsync(root, Project));
        Assert.Equal(1, handler.Calls);
        Assert.False(File.Exists(Path.Combine(root, "receipts", Project + ".ack.json")));
    }

    [Theory]
    [InlineData(408)]
    [InlineData(429)]
    [InlineData(503)]
    public async Task TransientFailureHasFiveRetriesAndNoAck(int code)
    {
        var handler = new Handler(_ => Task.FromResult(new HttpResponseMessage((HttpStatusCode)code)));
        using var java = Client(handler);
        RuntimeReceiptStore.Save(root, Project, Receipt);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new RuntimeReceiptDelivery(java).DeliverAsync(root, Project));
        Assert.Equal(6, handler.Calls);
        Assert.False(File.Exists(Path.Combine(root, "receipts", Project + ".ack.json")));
    }

    [Fact]
    public async Task WrongDigestNeverWritesAckAndCanRetryAfterCorrectedServer()
    {
        var wrong = true;
        var handler = new Handler(_ => Task.FromResult(Json(new { sessionId = "s", resourceProject = Project,
            receiptDigest = wrong ? "sha256:wrong" : ReceiptCanonicalJson.Digest(Receipt), persistenceStatus = "COMMITTED" })));
        using var java = Client(handler);
        RuntimeReceiptStore.Save(root, Project, Receipt);
        var delivery = new RuntimeReceiptDelivery(java);
        await Assert.ThrowsAsync<InvalidOperationException>(() => delivery.DeliverAsync(root, Project));
        Assert.False(File.Exists(Path.Combine(root, "receipts", Project + ".ack.json")));
        wrong = false;
        Assert.True(File.Exists(await delivery.DeliverAsync(root, Project)));
    }

    [Fact]
    public async Task MismatchedLifecycleAckStopsBeforeDockerButRetainsCheckpoint()
    {
        var handler = new Handler(async request =>
        {
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            Assert.Equal("ALLOCATED", body.RootElement.GetProperty("stage").GetString());
            Assert.True(body.RootElement.TryGetProperty("observedAt", out _));
            Assert.False(body.RootElement.TryGetProperty("occurredAt", out _));
            return Json(new { sessionId = "other", resourceProject = Project, stage = "ALLOCATED" });
        });
        using var java = Client(handler);
        var docker = new RecordingDocker();
        var backend = new DockerComposeSession(Definition(), root, "receivers: {}", docker, lifecycle: java);
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5);
        Assert.Equal("Failed", result.ExecutionStatus);
        Assert.Equal("Confirmed", result.CleanupStatus);
        Assert.Equal(0, docker.Calls);
        Assert.True(File.Exists(Path.Combine(root, "events", Project + "-allocated.json")));
        Assert.False(File.Exists(Path.Combine(root, "events", Project + "-running.json")));
        Assert.False(Directory.Exists(Path.Combine(root, Project)));
    }

    [Fact]
    public async Task ManagedStartupFailurePersistsReceiptAndReceivesAck()
    {
        var routes = new List<string>();
        var handler = new Handler(async request =>
        {
            var action = request.RequestUri!.Segments.Last();
            routes.Add(action);
            if (action == "run-definition") return Json(Definition());
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            if (action == "lifecycle-ack") return Json(new { sessionId = "s", resourceProject = Project, stage = body.RootElement.GetProperty("stage").GetString() });
            Assert.Equal("Failed", body.RootElement.GetProperty("outcome").GetProperty("executionStatus").GetString());
            return Json(new { sessionId = "s", resourceProject = Project, receiptDigest = ReceiptCanonicalJson.Digest(body.RootElement.GetRawText()), persistenceStatus = "COMMITTED", enrichedModelVersionId = (string?)null });
        });
        using var java = Client(handler);
        Directory.CreateDirectory(root);
        var collector = Path.Combine(root, "collector.yaml");
        File.WriteAllText(collector, "receivers: {}");
        var outcome = await new ManagedRuntimeAdapter(java, new RecordingDocker()).RunAsync("s", collector, root);
        Assert.Equal("Failed", outcome.ExecutionStatus);
        Assert.Equal(new[] { "run-definition", "lifecycle-ack", "ingest-receipt-ack" }, routes);
        Assert.True(File.Exists(Path.Combine(root, "receipts", Project + ".json")));
        Assert.True(File.Exists(Path.Combine(root, "receipts", Project + ".ack.json")));
    }

    [Fact]
    public async Task CallerCancellationDoesNotRetry()
    {
        var handler = new Handler(_ => throw new OperationCanceledException());
        using var java = Client(handler);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => java.GetDefinitionAsync("s", cancellation.Token));
        Assert.Equal(0, handler.Calls);
    }

    private sealed class RecordingDocker : IDockerCommands
    {
        public int Calls;
        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> arguments, string directory, int timeout, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(new DockerCommandResult(1, ""));
        }
    }

    public void Dispose() { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
}

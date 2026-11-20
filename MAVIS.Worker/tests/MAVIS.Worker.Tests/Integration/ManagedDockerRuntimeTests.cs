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
    public async Task InteractiveStudioProcessesStopStartScaleBeforeFinishingAndCleaning()
        => await RunInteractiveStudio(false);

    [ManagedDockerFact]
    public async Task PreparedStudioActivatesMissingBlockAndConfirmsRealDockerChanges()
        => await RunInteractiveStudio(true);

    [ManagedDockerFact]
    public async Task MuslStudioCollectsRealTracesAndConfirmsDockerChanges()
        => await RunInteractiveStudio(false, true);

    private static async Task RunInteractiveStudio(bool prepared, bool musl = false)
    {
        var poc = Environment.GetEnvironmentVariable("MAVIS_MANAGED_DOCKER_TEST_ROOT")!;
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(poc, "artifacts", "manifest.json")));
        var images = manifest.RootElement.GetProperty("images");
        var project = "mavisrun-" + Guid.NewGuid().ToString("N");
        var root = Path.Combine(poc, "artifacts", "studio-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var definition = new RuntimeRunDefinition("studio-" + Guid.NewGuid().ToString("N"), "model", "source", "profile",
            $"services:\n  orders:\n    image: {images.GetProperty(musl ? "orders-musl" : "orders").GetString()}\n    environment:\n      PAYMENT_URL: http://payment:8080\n  payment:\n    image: {images.GetProperty("payment").GetString()}\n",
            new(manifest.RootElement.GetProperty("collectorImage").GetString()!,
                manifest.RootElement.GetProperty("instrumentationVolume").GetString()!,
                new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new(musl ? "dotnet8-linux-x64-musl" : "dotnet8-linux-x64-glibc",8080), ["payment"] = new("java",8080) },
                MemoryMiB:512, TimeoutSeconds:290, ApprovedForLocalPoc:true, ScenarioRunnerImage:images.GetProperty("runner").GetString()),
            new("placeholder", [new("request","orders","GET","/orders",200)]),
            new Dictionary<string,string> { ["orders"]="550e8400-e29b-41d4-a716-446655440001", ["payment"]="550e8400-e29b-41d4-a716-446655440002" },
            "config","scenario",project,InteractiveStudio:true);
        definition = definition with { Scenario = definition.Scenario with { SessionId = definition.SessionId } };
        if (prepared) {
            var applications = new Dictionary<string, RuntimeServiceProfile>(definition.Profile.Applications)
                { ["orders-payment-route"] = new("dotnet8-linux-x64-glibc",8080) };
            var mappings = new Dictionary<string,string>(definition.ConfirmedServiceMappings)
                { ["orders-payment-route"] = "550e8400-e29b-41d4-a716-446655440003" };
            definition = definition with {
                ComposeYaml = definition.ComposeYaml.Replace("PAYMENT_URL: http://payment:8080", "PAYMENT_URL: http://orders-payment-route:8080")
                    + $"  orders-payment-route:\n    image: {images.GetProperty("route-controller").GetString()}\n    environment:\n      UPSTREAM_URL: http://payment:8080\n",
                ConfirmedServiceMappings = mappings,
                Profile = definition.Profile with {
                    Applications = applications,
                    StudioTopology = new(1, [new("orders", "Orders", true), new("payment", "Payment", InitiallyStopped: true)],
                        [new("orders","payment","orders-payment-route","HTTP",true)])
                }
            };
        }
        var handler = new StudioJava(definition, prepared);
        using var client = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080"),"fixture-managed-key",handler);
        var outcome = await new ManagedRuntimeAdapter(client,new RecordedDocker(root))
            .RunAsync(definition.SessionId,Path.Combine(poc,"collector.yaml"),root);
        Assert.Equal("Completed",outcome.ExecutionStatus);
        Assert.Equal("Confirmed",outcome.CleanupStatus);
        Assert.Equal(prepared ? new[]{"START","START","STOP","START","SCALE"} : new[]{"STOP","START","SCALE"}, outcome.InfrastructureActions!.Select(action=>action.Action));
        if (prepared) {
            Assert.Equal(0, outcome.InfrastructureActions![0].ReplicasBefore);
            Assert.Equal(1, outcome.InfrastructureActions[0].ReplicasAfter);
            Assert.Equal(0d, outcome.InfrastructureActions[1].MetricsAfter["errorRatePercent"]!.GetValue<double>());
            Assert.Equal(100d, outcome.InfrastructureActions[2].MetricsAfter["errorRatePercent"]!.GetValue<double>());
            Assert.Equal(0d, outcome.InfrastructureActions[3].MetricsAfter["errorRatePercent"]!.GetValue<double>());
        }
        Assert.All(outcome.InfrastructureActions!, action=>Assert.True(action.Confirmed));
        Assert.Equal(2,outcome.InfrastructureActions!.Last().ReplicasAfter);
        Assert.Equal(prepared ? 5 : 3,handler.Acknowledged);
        Assert.True(handler.Telemetry.Count>=4);
        Assert.Contains(handler.Telemetry,sample=>sample.GetProperty("spans").GetArrayLength()>0);
        Assert.All(handler.Telemetry,sample=>Assert.Equal(prepared ? 3 : 2,sample.GetProperty("services").GetArrayLength()));
        Assert.False(Directory.Exists(Path.Combine(root,project)));
        Assert.NotEmpty(outcome.Trace!.Spans);
    }

    private sealed class StudioJava(RuntimeRunDefinition definition, bool prepared = false) : HttpMessageHandler
    {
        public int Acknowledged;
        public List<JsonElement> Telemetry {get;}=[];
        private readonly string[] ids = Enumerable.Range(0,5).Select(_=>Guid.NewGuid().ToString()).ToArray();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
        {
            object response;
            var route=request.RequestUri!.Segments.Last();
            if(route=="run-definition") response=definition;
            else if(route=="commands")
                response=new {definition.SessionId,definition.ResourceProject,finishRequested=Acknowledged==(prepared?5:3),
                    command=Acknowledged==(prepared?5:3)?null:new {actionId=ids[Acknowledged],action=(prepared ? new[]{"START","START","STOP","START","SCALE"} : new[]{"STOP","START","SCALE"})[Acknowledged],
                        service=Acknowledged==(prepared?4:2)?"orders":prepared&&Acknowledged>0?"orders-payment-route":"payment",
                        replicas=Acknowledged==(prepared?4:2)?(int?)2:null}};
            else {
                var body=await request.Content!.ReadAsStringAsync(ct);
                using var json=JsonDocument.Parse(body);
                if(route=="telemetry") {
                    Telemetry.Add(json.RootElement.GetProperty("telemetry").Clone());
                    response=new {definition.SessionId,definition.ResourceProject};
                }
                else if(route=="ack") {
                    Assert.Equal(ids[Acknowledged],json.RootElement.GetProperty("actionId").GetString());
                    Assert.Equal("CONFIRMED",json.RootElement.GetProperty("status").GetString());
                    response=new {actionId=ids[Acknowledged++],status="CONFIRMED"};
                } else if(route=="lifecycle-ack")
                    response=new {definition.SessionId,definition.ResourceProject,stage=json.RootElement.GetProperty("stage").GetString()};
                else {
                    Assert.Equal("ingest-receipt-ack",route);
                    var signature=System.Security.Cryptography.HMACSHA256.HashData(Encoding.UTF8.GetBytes("fixture-managed-key"),
                        Encoding.UTF8.GetBytes(ReceiptCanonicalJson.Digest(body)));
                    Assert.Equal("hmac-sha256:"+Convert.ToHexString(signature).ToLowerInvariant(),
                        Assert.Single(request.Headers.GetValues("X-Mavis-Receipt-Signature")));
                    response=new {definition.SessionId,definition.ResourceProject,receiptDigest=ReceiptCanonicalJson.Digest(body),persistenceStatus="COMMITTED"};
                }
            }
            return new(HttpStatusCode.OK) {Content=new StringContent(JsonSerializer.Serialize(new {status=200,data=response},RuntimeLifecycleJournal.Json),Encoding.UTF8,"application/json")};
        }
    }

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

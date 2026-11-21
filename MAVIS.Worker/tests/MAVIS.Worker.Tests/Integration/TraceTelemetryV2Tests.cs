using System.Text;
using MAVIS.Runner;
using Xunit;

namespace MAVIS.Worker.Tests.Integration;

public sealed class TraceTelemetryV2Tests
{
    [Fact]
    public void CorrelatorKeepsRouteAndMethodButIgnoresRedactedSpanNames()
    {
        var trace = new string('a', 32);
        var json = """
        {"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"orders"}}]},
          "scopeSpans":[{"spans":[
            {"traceId":"TRACE","spanId":"SPAN1","name":"GET /orders/{id}","kind":2,
             "startTimeUnixNano":"1000","endTimeUnixNano":"5000",
             "attributes":[{"key":"http.request.method","value":{"stringValue":"GET"}},
                           {"key":"http.route","value":{"stringValue":"/orders/{id}"}},
                           {"key":"http.response.status_code","value":{"intValue":"200"}}]},
            {"traceId":"TRACE","spanId":"SPAN2","parentSpanId":"SPAN1","name":"SELECT secret_table WHERE ssn=1","kind":3,
             "startTimeUnixNano":"2000","endTimeUnixNano":"3000",
             "attributes":[{"key":"db.system","value":{"stringValue":"postgresql"}},
                           {"key":"db.operation.name","value":{"stringValue":"SELECT"}}]}
          ]}]}]}
        """.Replace("TRACE", trace).Replace("SPAN1", new string('1', 16)).Replace("SPAN2", new string('2', 16));

        var result = TraceCorrelator.Correlate("s", "m", json, new Dictionary<string, string> { ["orders"] = "model-orders" });

        var server = result.Spans.Single(s => s.SpanId == new string('1', 16));
        Assert.Equal("GET", server.HttpMethod);
        Assert.Equal("/orders/{id}", server.Route);
        Assert.Equal(200, server.HttpStatusCode);
        var db = result.Spans.Single(s => s.SpanId == new string('2', 16));
        Assert.Equal("postgresql SELECT", db.Route);
        Assert.Null(db.HttpMethod);
        Assert.DoesNotContain("ssn", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public void BudgetOrdersByRotationNameNotMtimeAndStopsAtFirstGap()
    {
        var root = Directory.CreateTempSubdirectory("mavis-trace-budget-").FullName;
        try
        {
            var oldest = Path.Combine(root, "traces-2026-11-20T10-00-00.000.json");
            var older = Path.Combine(root, "traces-2026-11-20T11-00-00.000.json");
            var live = Path.Combine(root, "traces.json");
            File.WriteAllText(oldest, new string('o', 100));
            File.WriteAllText(older, new string('x', 600));
            File.WriteAllText(live, new string('y', 600));
            // docker cp may give the live file the OLDEST mtime; selection must not depend on it.
            File.SetLastWriteTimeUtc(live, DateTime.UtcNow.AddHours(-3));
            File.SetLastWriteTimeUtc(older, DateTime.UtcNow);
            File.SetLastWriteTimeUtc(oldest, DateTime.UtcNow);

            var selected = TraceFileBudget.Select([oldest, older, live], 1000, out var truncated);

            Assert.True(truncated);
            // Newest (live) kept; "older" does not fit, so the small "oldest" must NOT be added after the gap.
            Assert.Equal([live], selected);

            var all = TraceFileBudget.Select([oldest, older, live], 5000, out var notTruncated);
            Assert.False(notTruncated);
            Assert.Equal([oldest, older, live], all);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task SingleCommandTimeoutIsNotReportedAsSessionTimeout()
    {
        var outcome = await RuntimeSessionLifecycle.RunAsync(new CommandTimeoutBackend(), 30);
        Assert.Equal("Failed", outcome.ExecutionStatus);
        Assert.Contains("COMMAND_TIMED_OUT_AT_DOCKER_UP", outcome.Diagnostics);
        Assert.DoesNotContain(outcome.Diagnostics, d => d.StartsWith("SESSION_TIMED_OUT", StringComparison.Ordinal));
        Assert.Equal("Confirmed", outcome.CleanupStatus);
    }

    private sealed class CommandTimeoutBackend : IRuntimeSessionBackend
    {
        public string Stage => "DOCKER_UP";
        public async Task PrepareAndStartAsync(CancellationToken ct)
        {
            // Mirrors DockerCommands: a per-command timeout token linked to (but not equal to) the session deadline.
            using var perCommand = CancellationTokenSource.CreateLinkedTokenSource(ct);
            perCommand.CancelAfter(TimeSpan.FromMilliseconds(10));
            await Task.Delay(Timeout.Infinite, perCommand.Token);
        }
        public Task WaitUntilReadyAsync(CancellationToken ct) => Task.CompletedTask;
        public Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct) => throw new InvalidOperationException();
        public Task<TraceCorrelationResult?> PreserveEvidenceAsync(CancellationToken ct) => Task.FromResult<TraceCorrelationResult?>(null);
        public Task<bool> CleanupAsync(CancellationToken ct) => Task.FromResult(true);
    }

    [Fact]
    public async Task TailReadDropsPartialFirstLineAndKeepsWholeRecords()
    {
        var path = Path.GetTempFileName();
        try
        {
            var builder = new StringBuilder();
            for (var i = 0; i < 50; i++) builder.Append("{\"line\":").Append(i).Append("}\n");
            await File.WriteAllTextAsync(path, builder.ToString());

            var (text, truncated) = await TraceFileBudget.ReadTailAsync(path, 64, CancellationToken.None);

            Assert.True(truncated);
            var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            Assert.NotEmpty(lines);
            Assert.All(lines, line => Assert.StartsWith("{\"line\":", line));
            Assert.EndsWith("{\"line\":49}", lines[^1]);

            var (whole, wholeTruncated) = await TraceFileBudget.ReadTailAsync(path, 1_000_000, CancellationToken.None);
            Assert.False(wholeTruncated);
            Assert.Equal(builder.ToString(), whole);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void RedactSecretValuesRedactsRawUrlEncodedAndBase64Variants()
    {
        const string secret = "p@ss/word+123";
        var urlEncoded = Uri.EscapeDataString(secret);
        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(secret));
        var log = $"raw={secret} url={urlEncoded} b64={base64} keep=ok";

        var redacted = DockerComposeSession.RedactSecretValues(log, [secret, "ok"]);

        Assert.DoesNotContain(secret, redacted);
        Assert.DoesNotContain(urlEncoded, redacted);
        Assert.DoesNotContain(base64, redacted);
        Assert.Contains("raw=[REDACTED] url=[REDACTED] b64=[REDACTED]", redacted);
    }

    [Fact]
    public async Task InteractiveStudioPublishesBaselineAndPostActionTelemetryForBackToBackActions()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-studio-telem-" + Guid.NewGuid().ToString("N"));
        var project = "mavisrun-" + Guid.NewGuid().ToString("N");
        var dir = Path.Combine(root, project);
        Directory.CreateDirectory(dir);
        try
        {
            var digest = new string('a', 64);
            var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
                new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("java", 8080), ["payment"] = new("java", 8080) },
                ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
            var definition = new RuntimeRunDefinition("s1", "m1", "snap1", "prof1",
                $"services:\n  orders:\n    image: orders@sha256:{digest}\n  payment:\n    image: payment@sha256:{digest}\n",
                profile, new("s1", [new("req", "orders", "GET", "/orders", 200)]),
                new Dictionary<string, string> { ["orders"] = "id-1", ["payment"] = "id-2" },
                "cfg", "scn", project, InteractiveStudio: true);
            var docker = new BackToBackStudioDocker();
            using var handler = new BackToBackStudioHandler(definition);
            using var studio = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080"), "fixture-key", handler);
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker, studio: studio);
            typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                .SetValue(session, dir);

            var actions = await session.ExecuteInfrastructureActionsAsync(CancellationToken.None);

            Assert.Equal(3, actions.Count);
            Assert.Equal(3, handler.AckCount);
            // Baseline + 3 post-action snapshots must never be dropped even when commands fire back-to-back.
            Assert.True(handler.TelemetryCount >= 4, $"Expected >= 4 telemetry frames, got {handler.TelemetryCount}");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void ServiceGraphScraperComputesPerWindowRpsErrorRateAndHistogramP95()
    {
        var scraper = new PrometheusServiceGraphScraper();
        var scrape1 = """
        # TYPE traces_service_graph_request_total counter
        traces_service_graph_request_total{client="orders",server="payment"} 10
        traces_service_graph_request_failed_total{client="orders",server="payment"} 1
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="0.01"} 5
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="0.05"} 9
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="0.1"} 10
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="+Inf"} 10
        """;
        var first = scraper.Update(scrape1, 2.0);
        var edge1 = Assert.Single(first);
        Assert.Equal("orders", edge1.Client);
        Assert.Equal("payment", edge1.Server);
        Assert.Equal(5.0, edge1.Rps);
        Assert.Equal(0.5, edge1.ErrorsPerSec);
        Assert.Equal(10.0, edge1.ErrorRatePercent);
        Assert.NotNull(edge1.P95Ms);
        Assert.InRange(edge1.P95Ms!.Value, 50.0, 100.0);

        // Second scrape 1s later: +20 requests, +4 failed (20%), all within 50ms bucket.
        var scrape2 = """
        traces_service_graph_request_total{client="orders",server="payment"} 30
        traces_service_graph_request_failed_total{client="orders",server="payment"} 5
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="0.01"} 15
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="0.05"} 29
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="0.1"} 30
        traces_service_graph_request_server_seconds_bucket{client="orders",server="payment",le="+Inf"} 30
        """;
        var second = scraper.Update(scrape2, 1.0);
        var edge2 = Assert.Single(second);
        Assert.Equal(20.0, edge2.Rps);
        Assert.Equal(4.0, edge2.ErrorsPerSec);
        Assert.Equal(20.0, edge2.ErrorRatePercent);
        Assert.NotNull(edge2.P95Ms);
        Assert.InRange(edge2.P95Ms!.Value, 10.0, 50.0);
    }

    [Fact]
    public void LiveProbePercentileUsesNearestRank()
    {
        var samples = Enumerable.Range(1, 20).Select(x => (double)x).ToArray();
        Assert.Equal(10.0, LiveProbeRunner.Percentile(samples, 0.50));
        Assert.Equal(19.0, LiveProbeRunner.Percentile(samples, 0.95));
        Assert.Equal(20.0, LiveProbeRunner.Percentile(samples, 0.99));
        Assert.Null(LiveProbeRunner.Percentile([], 0.95));
    }

    [Fact]
    public async Task PauseResumeAndThrottleCpuConfirmRealDockerStateAndCpus()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-faults-" + Guid.NewGuid().ToString("N"));
        var project = "mavisrun-" + Guid.NewGuid().ToString("N");
        var dir = Path.Combine(root, project);
        Directory.CreateDirectory(dir);
        try
        {
            var digest = new string('a', 64);
            var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
                new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("java", 8080) },
                Cpus: 1.0, ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest);
            var definition = new RuntimeRunDefinition("s1", "m1", "snap1", "prof1",
                $"services:\n  orders:\n    image: orders@sha256:{digest}\n",
                profile, new("s1", [new("req", "orders", "GET", "/orders", 200)]),
                new Dictionary<string, string> { ["orders"] = "id-1" },
                "cfg", "scn", project,
                InfrastructureActions: [
                    new("THROTTLE_CPU", "orders", CpuPercent: 25),
                    new("PAUSE", "orders"),
                    new("RESUME", "orders")
                ]);
            var docker = new FaultActionMockDocker();
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker);
            typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                .SetValue(session, dir);

            var results = await session.ExecuteInfrastructureActionsAsync(CancellationToken.None);

            Assert.Equal(3, results.Count);
            Assert.All(results, r => Assert.True(r.Confirmed));
            Assert.Equal("THROTTLE_CPU", results[0].Action);
            Assert.Equal(25, results[0].MetricsAfter["cpuPercent"]!.GetValue<int>());
            Assert.Equal(0.25, results[0].MetricsAfter["targetCpus"]!.GetValue<double>());
            Assert.Contains(docker.Calls, c => c[0] == "update" && c.Contains("--cpus") && c.Contains("0.25"));
            Assert.Equal("PAUSE", results[1].Action);
            Assert.Equal(1, results[1].ReplicasBefore);
            Assert.Equal(0, results[1].ReplicasAfter);
            Assert.Equal("RESUME", results[2].Action);
            Assert.Equal(0, results[2].ReplicasBefore);
            Assert.Equal(1, results[2].ReplicasAfter);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void LiveProbeParsesAndClampsDynamicTargetRpsCommands()
    {
        Assert.True(LiveProbeRunner.TryParseTargetRpsCommand("{\"targetRps\":25}", out var rps25));
        Assert.Equal(25, rps25);
        Assert.True(LiveProbeRunner.TryParseTargetRpsCommand("{\"targetRps\":999}", out var clampedHigh));
        Assert.Equal(50, clampedHigh);
        Assert.True(LiveProbeRunner.TryParseTargetRpsCommand("{\"targetRps\":0}", out var clampedLow));
        Assert.Equal(1, clampedLow);
        Assert.False(LiveProbeRunner.TryParseTargetRpsCommand("not-json", out _));
        Assert.False(LiveProbeRunner.TryParseTargetRpsCommand("{}", out _));
    }

    [Fact]
    public void ServiceGraphScraperNormalizesPascalCaseOtelServiceNamesToCanonicalKeys()
    {
        var scraper = new PrometheusServiceGraphScraper(["api-gateway", "fruit-catalog-api"]);
        var exposition = """
            traces_service_graph_request_total{client="ApiGateway",server="FruitCatalog.API"} 10
            traces_service_graph_request_failed_total{client="ApiGateway",server="FruitCatalog.API"} 2
            """;

        var edges = scraper.Update(exposition, 2.0);

        var edge = Assert.Single(edges);
        Assert.Equal("api-gateway", edge.Client);
        Assert.Equal("fruit-catalog-api", edge.Server);
        Assert.Equal(20.0, edge.ErrorRatePercent);
    }

    [Fact]
    public async Task LiveProbeEmitsFramesAndAppliesDynamicTargetRpsEvenWithSynchronizedBlockingStdin()
    {
        // Regression test: SyncTextReader (Console.In) blocks synchronously on ReadLineAsync; LiveProbeRunner must still emit frames and react to SET_LOAD.
        using var pipe = new BlockingQueueTextReader();
        var syncReader = TextReader.Synchronized(pipe);
        var frames = new System.Collections.Concurrent.ConcurrentQueue<string>();
        using var output = new CallbackTextWriter(line => frames.Enqueue(line));
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));

        var envelope = new LiveProbeEnvelope(
            new HttpScenarioDefinition("s1", []),
            new Dictionary<string, Uri>(),
            new Dictionary<string, string>(),
            TargetRps: 5,
            CollectorMetricsUrl: null);

        var runTask = new LiveProbeRunner().RunAsync(envelope, output, cts.Token, syncReader);

        // Wait for first frame with initial targetRps=5 while stdin remains open with no second line yet.
        var deadline = DateTimeOffset.UtcNow.AddSeconds(10);
        string? firstLine = null;
        while (DateTimeOffset.UtcNow < deadline && !frames.TryDequeue(out firstLine))
            await Task.Delay(50);
        Assert.NotNull(firstLine);
        using (var doc = System.Text.Json.JsonDocument.Parse(firstLine!))
            Assert.Equal(5, doc.RootElement.GetProperty("probe").GetProperty("targetRps").GetInt32());

        // Send dynamic SET_LOAD command over the open synchronized stdin.
        pipe.Enqueue("{\"targetRps\":25}");

        var updatedSeen = false;
        deadline = DateTimeOffset.UtcNow.AddSeconds(10);
        while (DateTimeOffset.UtcNow < deadline)
        {
            if (frames.TryDequeue(out var nextLine))
            {
                using var doc = System.Text.Json.JsonDocument.Parse(nextLine);
                if (doc.RootElement.GetProperty("probe").GetProperty("targetRps").GetInt32() == 25)
                {
                    updatedSeen = true;
                    break;
                }
            }
            await Task.Delay(50);
        }
        Assert.True(updatedSeen, "Expected LiveProbeRunner to update targetRps to 25 from open control stdin.");

        cts.Cancel();
        await runTask.WaitAsync(TimeSpan.FromSeconds(3));
    }

    private sealed class BlockingQueueTextReader : TextReader
    {
        private readonly System.Collections.Concurrent.BlockingCollection<string?> _lines = new();
        public void Enqueue(string? line) => _lines.Add(line);
        public override string? ReadLine() => _lines.TryTake(out var line, Timeout.Infinite) ? line : null;
        protected override void Dispose(bool disposing)
        {
            if (disposing) { _lines.CompleteAdding(); _lines.Dispose(); }
            base.Dispose(disposing);
        }
    }

    private sealed class CallbackTextWriter(Action<string> onLine) : TextWriter
    {
        public override Encoding Encoding => Encoding.UTF8;
        public override void WriteLine(string? value) { if (value is not null) onLine(value); }
        public override Task WriteLineAsync(string? value) { if (value is not null) onLine(value); return Task.CompletedTask; }
    }

    [Fact]
    public async Task SetLoadStreamsTargetRpsToInteractiveLiveProbeWithoutRestartingContainers()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-setload-" + Guid.NewGuid().ToString("N"));
        var project = "mavisrun-" + Guid.NewGuid().ToString("N");
        var dir = Path.Combine(root, project);
        Directory.CreateDirectory(dir);
        try
        {
            var digest = new string('a', 64);
            var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
                new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("java", 8080) },
                ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest, ProbeRps: 5);
            var definition = new RuntimeRunDefinition("s1", "m1", "snap1", "prof1",
                $"services:\n  orders:\n    image: orders@sha256:{digest}\n",
                profile, new("s1", [new("req", "orders", "GET", "/orders", 200)]),
                new Dictionary<string, string> { ["orders"] = "id-1" },
                "cfg", "scn", project, InteractiveStudio: true);
            var probeStream = new RecordingLineStream();
            var docker = new SetLoadStudioDocker(probeStream);
            using var handler = new SetLoadStudioHandler(definition);
            using var studio = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080"), "fixture-key", handler);
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker, studio: studio);
            typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                .SetValue(session, dir);
            var endpoints = (Dictionary<string, Uri>)typeof(DockerComposeSession)
                .GetField("_endpoints", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                .GetValue(session)!;
            endpoints["orders"] = new Uri("http://orders:8080");

            var actions = await session.ExecuteInfrastructureActionsAsync(CancellationToken.None);

            var setLoad = Assert.Single(actions);
            Assert.True(setLoad.Confirmed);
            Assert.Equal("SET_LOAD", setLoad.Action);
            Assert.Equal(5, setLoad.MetricsBefore["targetRps"]!.GetValue<int>());
            Assert.Equal(30, setLoad.MetricsAfter["targetRps"]!.GetValue<int>());
            var written = Assert.Single(probeStream.WrittenLines);
            Assert.Equal("{\"targetRps\":30}", written);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    private sealed class RecordingLineStream : ILineStreamHandle
    {
        public List<string> WrittenLines { get; } = [];
        public Task WriteLineAsync(string line, CancellationToken ct) { WrittenLines.Add(line); return Task.CompletedTask; }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class SetLoadStudioDocker(ILineStreamHandle stream) : IDockerCommands
    {
        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, CancellationToken ct)
        {
            if (args[0] == "compose" && args.Contains("ps"))
            {
                var fmtIdx = args.ToList().IndexOf("--format");
                var fmt = fmtIdx >= 0 ? args[fmtIdx + 1] : "";
                return Task.FromResult(new DockerCommandResult(0,
                    fmt.Contains("{{.Service}}", StringComparison.Ordinal) ? "orders|orders-1|running\n" : "orders-1|running\n"));
            }
            return Task.FromResult(new DockerCommandResult(0, ""));
        }

        public Task<ILineStreamHandle?> StartInteractiveLineStreamAsync(IReadOnlyList<string> args, string workingDirectory, string initialLine, Action<string> onLine, CancellationToken ct)
            => Task.FromResult<ILineStreamHandle?>(stream);

        public Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, string input, CancellationToken ct)
        {
            var outcome = new HttpScenarioOutcome("s1", "Passed",
                [new HttpStepOutcome("req", "Passed", 200, new string('1', 32), new string('2', 16), 4)]);
            var json = System.Text.Json.JsonSerializer.Serialize(outcome, new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            return Task.FromResult(new DockerCommandResult(0, json));
        }
    }

    private sealed class SetLoadStudioHandler(RuntimeRunDefinition definition) : HttpMessageHandler
    {
        private int _acked;
        private readonly string _actionId = Guid.NewGuid().ToString();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var route = request.RequestUri!.Segments.Last();
            object data = route switch
            {
                "commands" => _acked >= 1
                    ? new { definition.SessionId, definition.ResourceProject, finishRequested = true, command = (object?)null }
                    : new
                    {
                        definition.SessionId,
                        definition.ResourceProject,
                        finishRequested = false,
                        command = new { actionId = _actionId, action = "SET_LOAD", service = "orders", replicas = (int?)null, cpuPercent = (int?)null, targetRps = (int?)30 }
                    },
                "telemetry" => new { definition.SessionId, definition.ResourceProject },
                _ => new { actionId = _actionId, status = _acked++ == 0 ? "CONFIRMED" : "CONFIRMED" }
            };
            var body = System.Text.Json.JsonSerializer.Serialize(new { status = 200, data }, RuntimeLifecycleJournal.Json);
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
        }
    }

    [Fact]
    public async Task SetEnvAndSwapVersionEnforceAllowlistsAndWriteActionOverrideFile()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-envswap-" + Guid.NewGuid().ToString("N"));
        var project = "mavisrun-" + Guid.NewGuid().ToString("N");
        var dir = Path.Combine(root, project);
        Directory.CreateDirectory(dir);
        try
        {
            var v1 = "orders@sha256:" + new string('a', 64);
            var v2 = "orders@sha256:" + new string('b', 64);
            var unauthorized = "evil@sha256:" + new string('c', 64);
            var profile = new RunnerExecutionProfile("collector@sha256:" + new string('a', 64), "mavis-agents-v1",
                new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("java", 8080) },
                ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + new string('a', 64),
                AllowedEnvKeys: new Dictionary<string, IReadOnlyList<string>> { ["orders"] = ["FEATURE_FAST_CHECKOUT"] },
                AlternateImages: new Dictionary<string, string> { ["orders"] = v2 });
            var definition = new RuntimeRunDefinition("s1", "m1", "snap1", "prof1",
                $"services:\n  orders:\n    image: {v1}\n",
                profile, new("s1", [new("req", "orders", "GET", "/orders", 200)]),
                new Dictionary<string, string> { ["orders"] = "id-1" },
                "cfg", "scn", project,
                InfrastructureActions: [
                    new("SET_ENV", "orders", EnvKey: "FEATURE_FAST_CHECKOUT", EnvValue: "true$1"),
                    new("SWAP_VERSION", "orders", TargetImage: v2)
                ]);
            var docker = new FaultActionMockDocker();
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker);
            typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                .SetValue(session, dir);
            typeof(DockerComposeSession).GetField("_originalPinnedImages", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                .SetValue(session, new Dictionary<string, string> { ["orders"] = v1 });

            var results = await session.ExecuteInfrastructureActionsAsync(CancellationToken.None);

            Assert.Equal(2, results.Count);
            Assert.All(results, r => Assert.True(r.Confirmed));
            Assert.Equal("FEATURE_FAST_CHECKOUT", results[0].MetricsAfter["envKey"]!.GetValue<string>());
            Assert.Equal(v2, results[1].MetricsAfter["image"]!.GetValue<string>());
            var overrideText = await File.ReadAllTextAsync(Path.Combine(dir, "action-override.json"));
            Assert.Contains("true$$1", overrideText);
            Assert.Contains(v2, overrideText);
            Assert.Contains(docker.Calls, c => c.Contains("action-override.json", StringComparer.OrdinalIgnoreCase) || c.Any(a => a.EndsWith("action-override.json", StringComparison.OrdinalIgnoreCase)));

            // Reject reserved OTEL_* key and unlisted alternate image
            var badEnvDef = definition with { InfrastructureActions = [new("SET_ENV", "orders", EnvKey: "OTEL_EXPORTER", EnvValue: "http://evil")] };
            var badEnvSession = new DockerComposeSession(badEnvDef, root, "receivers: {}", docker);
            typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.SetValue(badEnvSession, dir);
            var ex1 = await Assert.ThrowsAsync<RuntimeStageException>(() => badEnvSession.ExecuteInfrastructureActionsAsync(CancellationToken.None));
            Assert.Equal("ENV_OVERRIDE_INVALID", ex1.Code);

            var badSwapDef = definition with { InfrastructureActions = [new("SWAP_VERSION", "orders", TargetImage: unauthorized)] };
            var badSwapSession = new DockerComposeSession(badSwapDef, root, "receivers: {}", docker);
            typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.SetValue(badSwapSession, dir);
            var ex2 = await Assert.ThrowsAsync<RuntimeStageException>(() => badSwapSession.ExecuteInfrastructureActionsAsync(CancellationToken.None));
            Assert.Equal("SWAP_IMAGE_INVALID", ex2.Code);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task DeterministicSeedHookRunsOnceAfterReadinessBeforeInitialStop()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-seed-" + Guid.NewGuid().ToString("N"));
        var project = "mavisrun-" + Guid.NewGuid().ToString("N");
        var dir = Path.Combine(root, project);
        Directory.CreateDirectory(dir);
        try
        {
            var digest = new string('a', 64);
            var profile = new RunnerExecutionProfile("collector@sha256:" + digest, "mavis-agents-v1",
                new Dictionary<string, RuntimeServiceProfile> { ["orders"] = new("java", 8080) },
                ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest,
                SeedHook: new SeedHookProfile("orders", "POST", "/internal/seed", 200));
            var definition = new RuntimeRunDefinition("s1", "m1", "snap1", "prof1",
                $"services:\n  orders:\n    image: orders@sha256:{digest}\n",
                profile, new("s1", [new("req", "orders", "GET", "/orders", 200)]),
                new Dictionary<string, string> { ["orders"] = "id-1" },
                "cfg", "scn", project);
            var inputs = new List<string>();
            var docker = new SeedHookDocker(inputs);
            var session = new DockerComposeSession(definition, root, "receivers: {}", docker);
            typeof(DockerComposeSession).GetField("_directory", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.SetValue(session, dir);
            var endpoints = (Dictionary<string, Uri>)typeof(DockerComposeSession)
                .GetField("_endpoints", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(session)!;
            endpoints["orders"] = new Uri("http://orders:8080");
            endpoints["mavis-collector"] = new Uri("http://mavis-collector:13133");

            await session.WaitUntilReadyAsync(CancellationToken.None);

            Assert.Equal(2, inputs.Count); // 1 = readiness probe, 2 = studio-seed hook
            Assert.Contains("/internal/seed", inputs[1]);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }

    private sealed class SeedHookDocker(List<string> inputs) : IDockerCommands
    {
        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, CancellationToken ct)
            => Task.FromResult(new DockerCommandResult(0, ""));

        public Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, string input, CancellationToken ct)
        {
            inputs.Add(input);
            var outcome = new HttpScenarioOutcome("s1", "Passed",
                [new HttpStepOutcome("seed", "Passed", 200, new string('1', 32), new string('2', 16), 3)]);
            var json = System.Text.Json.JsonSerializer.Serialize(outcome, new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            return Task.FromResult(new DockerCommandResult(0, json));
        }
    }

    private sealed class FaultActionMockDocker : IDockerCommands
    {
        private string _state = "running";
        public List<IReadOnlyList<string>> Calls { get; } = [];

        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, CancellationToken ct)
        {
            Calls.Add(args);
            if (args[0] == "compose")
            {
                if (args.Contains("ps")) return Task.FromResult(new DockerCommandResult(0, $"orders-1|{_state}\n"));
                if (args.Contains("pause")) { _state = "paused"; return Task.FromResult(new DockerCommandResult(0, "")); }
                if (args.Contains("unpause")) { _state = "running"; return Task.FromResult(new DockerCommandResult(0, "")); }
            }
            return Task.FromResult(new DockerCommandResult(0, ""));
        }

        public Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, string input, CancellationToken ct)
        {
            var outcome = new HttpScenarioOutcome("s1", "Passed",
                [new HttpStepOutcome("req", "Passed", 200, new string('1', 32), new string('2', 16), 4)]);
            var json = System.Text.Json.JsonSerializer.Serialize(outcome, new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            return Task.FromResult(new DockerCommandResult(0, json));
        }
    }

    private sealed class BackToBackStudioDocker : IDockerCommands
    {
        private readonly Dictionary<string, int> _running = new(StringComparer.Ordinal) { ["orders"] = 1, ["payment"] = 1 };

        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, CancellationToken ct)
        {
            if (args[0] == "compose")
            {
                var sub = args.FirstOrDefault(a => a is "ps" or "stop" or "start" or "up" or "logs" or "cp");
                if (sub == "ps")
                {
                    var fmtIdx = args.ToList().IndexOf("--format");
                    var fmt = fmtIdx >= 0 ? args[fmtIdx + 1] : "";
                    if (fmt.Contains("{{.Service}}", StringComparison.Ordinal))
                    {
                        var all = _running.SelectMany(kv => kv.Value > 0
                            ? Enumerable.Range(1, kv.Value).Select(i => $"{kv.Key}|{kv.Key}-{i}|running")
                            : [$"{kv.Key}|{kv.Key}-1|exited"]);
                        return Task.FromResult(new DockerCommandResult(0, string.Join("\n", all)));
                    }
                    var svc = args[^1];
                    var cnt = _running.GetValueOrDefault(svc);
                    var lines = cnt > 0
                        ? Enumerable.Range(1, cnt).Select(i => $"{svc}-{i}|running")
                        : [$"{svc}-1|exited"];
                    return Task.FromResult(new DockerCommandResult(0, string.Join("\n", lines)));
                }
                if (sub == "stop") { _running[args[^1]] = 0; return Task.FromResult(new DockerCommandResult(0, "")); }
                if (sub == "start") { _running[args[^1]] = 1; return Task.FromResult(new DockerCommandResult(0, "")); }
                if (sub == "up")
                {
                    var idx = args.ToList().IndexOf("--scale");
                    if (idx >= 0) { var p = args[idx + 1].Split('='); _running[p[0]] = int.Parse(p[1]); }
                    return Task.FromResult(new DockerCommandResult(0, ""));
                }
            }
            return Task.FromResult(new DockerCommandResult(0, ""));
        }

        public Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> args, string workingDirectory, int timeoutSeconds, string input, CancellationToken ct)
        {
            var outcome = new HttpScenarioOutcome("s1", "Passed",
                [new HttpStepOutcome("req", "Passed", 200, new string('1', 32), new string('2', 16), 5)]);
            var json = System.Text.Json.JsonSerializer.Serialize(outcome, new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            return Task.FromResult(new DockerCommandResult(0, json));
        }
    }

    private sealed class BackToBackStudioHandler(RuntimeRunDefinition definition) : HttpMessageHandler
    {
        public int AckCount;
        public int TelemetryCount;
        private readonly string[] _ids = [Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), Guid.NewGuid().ToString()];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var route = request.RequestUri!.Segments.Last();
            object data;
            if (route == "commands")
            {
                data = AckCount >= 3
                    ? new { definition.SessionId, definition.ResourceProject, finishRequested = true, command = (object?)null }
                    : new
                    {
                        definition.SessionId,
                        definition.ResourceProject,
                        finishRequested = false,
                        command = new
                        {
                            actionId = _ids[AckCount],
                            action = new[] { "STOP", "START", "SCALE" }[AckCount],
                            service = AckCount == 2 ? "orders" : "payment",
                            replicas = AckCount == 2 ? (int?)2 : null
                        }
                    };
            }
            else if (route == "telemetry")
            {
                Interlocked.Increment(ref TelemetryCount);
                data = new { definition.SessionId, definition.ResourceProject };
            }
            else
            {
                data = new { actionId = _ids[AckCount++], status = "CONFIRMED" };
            }
            var body = System.Text.Json.JsonSerializer.Serialize(new { status = 200, data }, RuntimeLifecycleJournal.Json);
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
        }
    }
}

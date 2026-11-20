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

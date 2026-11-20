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
}

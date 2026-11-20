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
    public void BudgetKeepsNewestFilesAndFlagsTruncation()
    {
        var root = Directory.CreateTempSubdirectory("mavis-trace-budget-").FullName;
        try
        {
            var older = Path.Combine(root, "traces-1.json");
            var newer = Path.Combine(root, "traces.json");
            File.WriteAllText(older, new string('x', 600));
            File.WriteAllText(newer, new string('y', 600));
            File.SetLastWriteTimeUtc(older, DateTime.UtcNow.AddMinutes(-5));
            File.SetLastWriteTimeUtc(newer, DateTime.UtcNow);

            var selected = TraceFileBudget.Select([older, newer], 1000, out var truncated);

            Assert.True(truncated);
            Assert.Equal([newer], selected);

            var all = TraceFileBudget.Select([older, newer], 5000, out var notTruncated);
            Assert.False(notTruncated);
            Assert.Equal([older, newer], all);
        }
        finally { Directory.Delete(root, recursive: true); }
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

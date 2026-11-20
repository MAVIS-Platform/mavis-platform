using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MAVIS.Runner;

public sealed record LiveProbeEnvelope(
    HttpScenarioDefinition Scenario,
    IReadOnlyDictionary<string, Uri> Endpoints,
    IReadOnlyDictionary<string, string> Secrets,
    int TargetRps = 5,
    string? CollectorMetricsUrl = "http://mavis-collector:8889/metrics");

public sealed record LiveProbeRouteMetrics(
    string StepId,
    string Service,
    string Method,
    string Path,
    double Rps,
    int Requests,
    int Errors,
    double ErrorRatePercent,
    double? P50Ms,
    double? P95Ms,
    double? P99Ms);

public sealed record LiveProbeMetrics(
    int TargetRps,
    double Rps,
    int Requests,
    int Errors,
    double ErrorRatePercent,
    double? P50Ms,
    double? P95Ms,
    double? P99Ms,
    IReadOnlyList<LiveProbeRouteMetrics> Routes);

public sealed record ServiceGraphEdgeMetrics(
    string Client,
    string Server,
    double Rps,
    double ErrorsPerSec,
    double ErrorRatePercent,
    double? P95Ms);

public sealed record LiveProbeFrame(
    DateTimeOffset ObservedAt,
    LiveProbeMetrics Probe,
    IReadOnlyList<ServiceGraphEdgeMetrics> ServiceGraph);

/// <summary>
/// Runs inside the isolated sandbox network to generate bounded read-only GET/HEAD traffic
/// and scrape OTel Collector Prometheus servicegraph metrics, emitting one NDJSON frame per second.
/// </summary>
public sealed class LiveProbeRunner
{
    private sealed record Sample(HttpScenarioStep Step, double ElapsedMs, bool Passed);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task RunAsync(LiveProbeEnvelope envelope, TextWriter output, CancellationToken ct)
    {
        var targetRps = Math.Clamp(envelope.TargetRps, 1, 50);
        var safeSteps = envelope.Scenario.Steps
            .Where(step => step.Method is "GET" or "HEAD" && envelope.Endpoints.ContainsKey(step.Service))
            .ToArray();
        using var client = HttpScenarioRunner.CreateClient();
        var samples = new ConcurrentQueue<Sample>();
        var scraper = new PrometheusServiceGraphScraper();
        using var inFlight = new SemaphoreSlim(Math.Clamp(targetRps * 2, 2, 16));

        var loadTask = safeSteps.Length > 0
            ? RunLoadLoopAsync(client, safeSteps, envelope.Endpoints, envelope.Secrets, targetRps, inFlight, samples, ct)
            : Task.CompletedTask;

        try
        {
            using var emitTimer = new PeriodicTimer(TimeSpan.FromSeconds(1));
            var lastEmit = Stopwatch.StartNew();
            while (await emitTimer.WaitForNextTickAsync(ct))
            {
                var windowSeconds = Math.Max(0.2, lastEmit.Elapsed.TotalSeconds);
                lastEmit.Restart();
                var drained = new List<Sample>();
                while (samples.TryDequeue(out var s)) drained.Add(s);

                var probe = AggregateProbe(targetRps, windowSeconds, safeSteps, drained);
                var edges = await ScrapeServiceGraphAsync(client, envelope.CollectorMetricsUrl, scraper, windowSeconds, ct);
                var frame = new LiveProbeFrame(DateTimeOffset.UtcNow, probe, edges);
                await output.WriteLineAsync(JsonSerializer.Serialize(frame, JsonOptions));
                await output.FlushAsync(ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        finally
        {
            try { await loadTask; } catch (OperationCanceledException) { }
        }
    }

    private static async Task RunLoadLoopAsync(
        HttpClient client,
        HttpScenarioStep[] steps,
        IReadOnlyDictionary<string, Uri> endpoints,
        IReadOnlyDictionary<string, string> secrets,
        int targetRps,
        SemaphoreSlim inFlight,
        ConcurrentQueue<Sample> samples,
        CancellationToken ct)
    {
        var interval = TimeSpan.FromMilliseconds(Math.Max(20, 1000.0 / targetRps));
        using var ticker = new PeriodicTimer(interval);
        var index = 0;
        while (await ticker.WaitForNextTickAsync(ct))
        {
            if (!inFlight.Wait(0)) continue; // Backpressure: never pile up unbounded tasks if services stall.
            var step = steps[index++ % steps.Length];
            _ = SendOneAsync(client, step, endpoints[step.Service], secrets, inFlight, samples, ct);
        }
    }

    private static async Task SendOneAsync(
        HttpClient client,
        HttpScenarioStep step,
        Uri baseUri,
        IReadOnlyDictionary<string, string> secrets,
        SemaphoreSlim inFlight,
        ConcurrentQueue<Sample> samples,
        CancellationToken ct)
    {
        var watch = Stopwatch.StartNew();
        var passed = false;
        try
        {
            var trace = ActivityTraceId.CreateRandom().ToHexString();
            var span = ActivitySpanId.CreateRandom().ToHexString();
            using var request = new HttpRequestMessage(new HttpMethod(step.Method), new Uri(baseUri, step.Path));
            request.Headers.TryAddWithoutValidation("traceparent", $"00-{trace}-{span}-01");
            foreach (var h in step.Headers ?? new Dictionary<string, string>())
                if (!h.Key.Equals("Host", StringComparison.OrdinalIgnoreCase) && !h.Key.Equals("traceparent", StringComparison.OrdinalIgnoreCase))
                    request.Headers.TryAddWithoutValidation(h.Key, h.Value);
            foreach (var h in step.SecretHeaders ?? new Dictionary<string, string>())
                if (secrets.TryGetValue(h.Value, out var val)) request.Headers.TryAddWithoutValidation(h.Key, val);
            foreach (var h in step.EnvHeaders ?? [])
                if (secrets.TryGetValue(h.Reference, out var val)) request.Headers.TryAddWithoutValidation(h.Name, val);

            using var reqCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            reqCts.CancelAfter(TimeSpan.FromSeconds(3));
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, reqCts.Token);
            // Drain bounded body so keep-alive connections are cleanly reused.
            await using var stream = await response.Content.ReadAsStreamAsync(reqCts.Token);
            var buf = new byte[4096];
            var total = 0;
            while (total < 262_144)
            {
                var n = await stream.ReadAsync(buf, reqCts.Token);
                if (n <= 0) break;
                total += n;
            }
            var code = (int)response.StatusCode;
            passed = step.AllowClientError ? code is >= 200 and < 500 : code == step.ExpectedStatus;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            inFlight.Release();
            return;
        }
        catch
        {
            passed = false;
        }
        finally
        {
            watch.Stop();
        }
        samples.Enqueue(new Sample(step, watch.Elapsed.TotalMilliseconds, passed));
        inFlight.Release();
    }

    private static LiveProbeMetrics AggregateProbe(int targetRps, double windowSeconds, HttpScenarioStep[] steps, List<Sample> drained)
    {
        var allLatencies = drained.Select(s => s.ElapsedMs).Order().ToArray();
        var total = drained.Count;
        var errors = drained.Count(s => !s.Passed);
        var routes = new List<LiveProbeRouteMetrics>(steps.Length);
        foreach (var step in steps)
        {
            var group = drained.Where(s => s.Step.Id == step.Id).ToList();
            var lats = group.Select(s => s.ElapsedMs).Order().ToArray();
            var reqs = group.Count;
            var errs = group.Count(s => !s.Passed);
            routes.Add(new LiveProbeRouteMetrics(
                step.Id, step.Service, step.Method, step.Path,
                Math.Round(reqs / windowSeconds, 2),
                reqs, errs,
                reqs > 0 ? Math.Round(100.0 * errs / reqs, 2) : 0.0,
                Percentile(lats, 0.50), Percentile(lats, 0.95), Percentile(lats, 0.99)));
        }
        return new LiveProbeMetrics(
            targetRps,
            Math.Round(total / windowSeconds, 2),
            total, errors,
            total > 0 ? Math.Round(100.0 * errors / total, 2) : 0.0,
            Percentile(allLatencies, 0.50),
            Percentile(allLatencies, 0.95),
            Percentile(allLatencies, 0.99),
            routes);
    }

    private static async Task<IReadOnlyList<ServiceGraphEdgeMetrics>> ScrapeServiceGraphAsync(
        HttpClient client, string? metricsUrl, PrometheusServiceGraphScraper scraper, double windowSeconds, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(metricsUrl)) return [];
        try
        {
            using var scrapeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            scrapeCts.CancelAfter(TimeSpan.FromMilliseconds(1500));
            var text = await client.GetStringAsync(metricsUrl, scrapeCts.Token);
            return scraper.Update(text, windowSeconds);
        }
        catch
        {
            return [];
        }
    }

    public static double? Percentile(double[] sorted, double q)
    {
        if (sorted.Length == 0) return null;
        var index = Math.Clamp((int)Math.Ceiling(sorted.Length * q) - 1, 0, sorted.Length - 1);
        return Math.Round(sorted[index], 2);
    }
}

/// <summary>
/// Parses Prometheus cumulative counters/histograms from OTel servicegraph connector and computes per-window edge deltas.
/// </summary>
public sealed class PrometheusServiceGraphScraper
{
    private sealed class EdgeCounters
    {
        public double Total;
        public double Failed;
        public Dictionary<double, double> ServerBuckets { get; } = new();
        public Dictionary<double, double> ClientBuckets { get; } = new();
    }

    private static readonly Regex MetricLine = new(
        @"^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[+-]?Inf|NaN)",
        RegexOptions.Compiled | RegexOptions.NonBacktracking);

    private static readonly Regex LabelPair = new(
        @"([a-zA-Z_][a-zA-Z0-9_]*)=""((?:\\.|[^""\\])*)""",
        RegexOptions.Compiled | RegexOptions.NonBacktracking);

    private Dictionary<(string Client, string Server), EdgeCounters> _previous = new();

    public IReadOnlyList<ServiceGraphEdgeMetrics> Update(string expositionText, double windowSeconds)
    {
        var current = Parse(expositionText);
        var duration = Math.Max(0.2, windowSeconds);
        var results = new List<ServiceGraphEdgeMetrics>();

        foreach (var (key, cur) in current.OrderBy(kv => kv.Key.Client, StringComparer.Ordinal).ThenBy(kv => kv.Key.Server, StringComparer.Ordinal))
        {
            _previous.TryGetValue(key, out var prev);
            var deltaTotal = Math.Max(0.0, cur.Total - (prev?.Total ?? 0.0));
            var deltaFailed = Math.Max(0.0, cur.Failed - (prev?.Failed ?? 0.0));
            if (deltaTotal <= 0.0 && deltaFailed <= 0.0) continue;

            var buckets = cur.ServerBuckets.Count > 0 ? cur.ServerBuckets : cur.ClientBuckets;
            var prevBuckets = cur.ServerBuckets.Count > 0 ? prev?.ServerBuckets : prev?.ClientBuckets;
            var p95Seconds = HistogramQuantile(buckets, prevBuckets, 0.95);
            var rps = Math.Round(deltaTotal / duration, 2);
            var errPerSec = Math.Round(deltaFailed / duration, 2);
            var errPct = deltaTotal > 0.0 ? Math.Round(100.0 * deltaFailed / deltaTotal, 2) : 0.0;
            results.Add(new ServiceGraphEdgeMetrics(
                key.Client, key.Server, rps, errPerSec, errPct,
                p95Seconds is double s ? Math.Round(s * 1000.0, 2) : null));
        }

        _previous = current;
        return results;
    }

    private static Dictionary<(string Client, string Server), EdgeCounters> Parse(string text)
    {
        var map = new Dictionary<(string Client, string Server), EdgeCounters>();
        foreach (var raw in text.Split('\n'))
        {
            if (raw.Length == 0 || raw[0] == '#') continue;
            var match = MetricLine.Match(raw);
            if (!match.Success) continue;
            var name = match.Groups[1].Value;
            var isTotal = name.EndsWith("service_graph_request_total", StringComparison.Ordinal);
            var isFailed = name.EndsWith("service_graph_request_failed_total", StringComparison.Ordinal);
            var isServerBucket = name.EndsWith("service_graph_request_server_seconds_bucket", StringComparison.Ordinal);
            var isClientBucket = !isServerBucket && name.EndsWith("service_graph_request_client_seconds_bucket", StringComparison.Ordinal);
            if (!isTotal && !isFailed && !isServerBucket && !isClientBucket) continue;

            if (!double.TryParse(match.Groups[3].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
                continue;

            string? client = null, server = null, leText = null;
            foreach (Match lp in LabelPair.Matches(match.Groups[2].Value))
            {
                var k = lp.Groups[1].Value;
                var v = lp.Groups[2].Value;
                if (k == "client") client = v;
                else if (k == "server") server = v;
                else if (k == "le") leText = v;
            }
            if (string.IsNullOrEmpty(client) || string.IsNullOrEmpty(server)) continue;

            var key = (client, server);
            if (!map.TryGetValue(key, out var counters)) map[key] = counters = new EdgeCounters();
            if (isTotal) counters.Total += value;
            else if (isFailed) counters.Failed += value;
            else if (leText is not null)
            {
                var le = leText == "+Inf" ? double.PositiveInfinity
                    : (double.TryParse(leText, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? parsed : double.NaN);
                if (!double.IsNaN(le))
                {
                    var target = isServerBucket ? counters.ServerBuckets : counters.ClientBuckets;
                    target[le] = target.GetValueOrDefault(le) + value;
                }
            }
        }
        return map;
    }

    private static double? HistogramQuantile(Dictionary<double, double> cur, Dictionary<double, double>? prev, double q)
    {
        if (cur.Count == 0) return null;
        var sorted = cur.Keys.Order().ToArray();
        var deltas = new double[sorted.Length];
        for (var i = 0; i < sorted.Length; i++)
        {
            var prevVal = prev is not null && prev.TryGetValue(sorted[i], out var pv) ? pv : 0.0;
            deltas[i] = Math.Max(0.0, cur[sorted[i]] - prevVal);
        }
        var total = deltas[^1];
        if (total <= 0.0) return null;
        var rank = q * total;
        var prevBound = 0.0;
        var prevCount = 0.0;
        for (var i = 0; i < sorted.Length; i++)
        {
            if (deltas[i] >= rank)
            {
                var upper = sorted[i];
                if (double.IsPositiveInfinity(upper)) return prevBound > 0.0 ? prevBound : null;
                var bucketCount = deltas[i] - prevCount;
                if (bucketCount <= 0.0) return upper;
                return prevBound + (upper - prevBound) * ((rank - prevCount) / bucketCount);
            }
            prevBound = sorted[i];
            prevCount = deltas[i];
        }
        return null;
    }
}

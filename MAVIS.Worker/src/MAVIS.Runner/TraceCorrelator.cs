using System.Text.Json;

namespace MAVIS.Runner;

public sealed record CorrelatedSpan(string TraceId, string SpanId, string? ParentSpanId, string RuntimeService,
    string? ModelServiceId, string Kind, string? ScenarioStepId, string? StartTimeUnixNano = null,
    string? DurationNanoseconds = null, string? SpanStatus = null, int? HttpStatusCode = null,
    string? HttpMethod = null, string? Route = null);
public sealed record CausalSpanEdge(string TraceId, string ParentSpanId, string ChildSpanId);
public sealed record ObservedServiceInteraction(string TraceId, string FromService, string ToService,
    string? FromModelServiceId, string? ToModelServiceId, string ParentSpanId, string ChildSpanId);
public sealed record TraceCorrelationResult(string SessionId, string ModelVersionId, IReadOnlyList<CorrelatedSpan> Spans,
    IReadOnlyList<CausalSpanEdge> CausalEdges, IReadOnlyList<string> Warnings, IReadOnlyList<ObservedServiceInteraction>? Interactions = null);

/// <summary>OTLP JSON parent-child correlation. No timeline sorting, attribute forwarding or guessed cross-trace links.</summary>
public static class TraceCorrelator
{
    public static TraceCorrelationResult Correlate(string sessionId, string modelVersionId, string otlpJson,
        IReadOnlyDictionary<string, string> confirmedMappings, IReadOnlyDictionary<string, string>? traceSteps = null)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(modelVersionId) || otlpJson.Length > 16_777_216)
            throw new ArgumentException("Invalid correlation input.");
        var spans = new Dictionary<(string Trace, string Span), CorrelatedSpan>();
        var warnings = new HashSet<string>(StringComparer.Ordinal);
        using var document = JsonDocument.Parse(otlpJson, new JsonDocumentOptions { MaxDepth = 64 });
        if (!document.RootElement.TryGetProperty("resourceSpans", out var resources) || resources.ValueKind != JsonValueKind.Array)
            throw new ArgumentException("Expected OTLP JSON resourceSpans array.");
        foreach (var resource in resources.EnumerateArray())
        {
            var service = "unknown";
            if (resource.TryGetProperty("resource", out var metadata) && metadata.TryGetProperty("attributes", out var attributes))
                foreach (var attribute in attributes.EnumerateArray())
                    if (attribute.TryGetProperty("key", out var key) && key.GetString() == "service.name" &&
                        attribute.TryGetProperty("value", out var value) && value.TryGetProperty("stringValue", out var text)) service = text.GetString() ?? "unknown";
            if (!resource.TryGetProperty("scopeSpans", out var scopes)) { warnings.Add("MISSING_SCOPE_SPANS"); continue; }
            foreach (var scope in scopes.EnumerateArray())
            {
                if (!scope.TryGetProperty("spans", out var entries)) continue;
                foreach (var entry in entries.EnumerateArray())
                {
                    var trace = Text(entry, "traceId").ToLowerInvariant();
                    var id = Text(entry, "spanId").ToLowerInvariant();
                    var parent = Text(entry, "parentSpanId").ToLowerInvariant();
                    if (!Hex(trace, 32) || !Hex(id, 16) || parent.Length > 0 && !Hex(parent, 16))
                    { warnings.Add("INVALID_SPAN_ID"); continue; }
                    if (spans.Count >= 100_000) throw new ArgumentException("Trace span limit exceeded.");
                    var mapped = confirmedMappings.GetValueOrDefault(service);
                    if (string.IsNullOrWhiteSpace(mapped)) { mapped = null; warnings.Add("UNMAPPED_SERVICE"); }
                    string? startTime = null, duration = null, status = null;
                    if (ulong.TryParse(Text(entry, "startTimeUnixNano"), out var start) && ulong.TryParse(Text(entry, "endTimeUnixNano"), out var end) && end >= start)
                    { startTime = start.ToString(System.Globalization.CultureInfo.InvariantCulture); duration = (end - start).ToString(System.Globalization.CultureInfo.InvariantCulture); }
                    else warnings.Add("MISSING_OR_INVALID_SPAN_TIMING");
                    if (entry.TryGetProperty("status", out var spanStatus)) status = Text(spanStatus, "code") switch
                        { "2" or "STATUS_CODE_ERROR" => "Error", "1" or "STATUS_CODE_OK" => "Ok", "0" or "STATUS_CODE_UNSET" => "Unset", _ => null };
                    int? httpStatus = null;
                    string? httpMethod = null, route = null, dbSystem = null, dbOperation = null, messagingSystem = null, destination = null;
                    if (entry.TryGetProperty("attributes", out var spanAttributes))
                        foreach (var attribute in spanAttributes.EnumerateArray())
                        {
                            var attributeKey = Text(attribute, "key");
                            if (!attribute.TryGetProperty("value", out var value)) continue;
                            var stringValue = Text(value, "stringValue");
                            switch (attributeKey)
                            {
                                case "http.response.status_code" or "http.status_code":
                                    if (int.TryParse(Text(value, "intValue"), out var code) && code is >= 100 and <= 599) httpStatus = code;
                                    break;
                                case "http.request.method" or "http.method": httpMethod = Label(stringValue, 16); break;
                                case "http.route": route = Label(stringValue, 128); break;
                                case "db.system": dbSystem = Label(stringValue, 32); break;
                                case "db.operation" or "db.operation.name": dbOperation = Label(stringValue, 64); break;
                                case "messaging.system": messagingSystem = Label(stringValue, 32); break;
                                case "messaging.destination.name": destination = Label(stringValue, 96); break;
                            }
                        }
                    // Labels come only from allowlisted low-cardinality attributes; free-form span names are never trusted.
                    route ??= dbOperation is not null ? Label($"{dbSystem ?? "db"} {dbOperation}", 128)
                        : destination is not null ? Label($"{messagingSystem ?? "messaging"} {destination}", 128) : null;
                    var span = new CorrelatedSpan(trace, id, parent.Length == 0 ? null : parent, service, mapped,
                        Text(entry, "kind"), traceSteps?.GetValueOrDefault(trace), startTime, duration, status, httpStatus, httpMethod, route);
                    if (!spans.TryAdd((trace, id), span)) warnings.Add("DUPLICATE_SPAN_ID");
                }
            }
        }
        var edges = new List<CausalSpanEdge>();
        var children = new Dictionary<(string Trace, string Span), List<(string Trace, string Span)>>();
        var pending = spans.Keys.ToDictionary(k => k, _ => 0);
        foreach (var (key, span) in spans)
        {
            if (span.ParentSpanId is null) continue;
            var parent = (span.TraceId, span.ParentSpanId);
            if (!spans.ContainsKey(parent)) { if (traceSteps?.ContainsKey(span.TraceId) != true) warnings.Add("MISSING_PARENT_SPAN"); continue; }
            if (!children.TryGetValue(parent, out var list)) children[parent] = list = [];
            list.Add(key); pending[key]++;
            edges.Add(new(span.TraceId, span.ParentSpanId, span.SpanId));
        }
        var queue = new Queue<(string Trace, string Span)>(pending.Where(p => p.Value == 0).Select(p => p.Key));
        var ordered = new List<CorrelatedSpan>();
        while (queue.TryDequeue(out var key))
        {
            ordered.Add(spans[key]);
            foreach (var child in children.GetValueOrDefault(key) ?? []) if (--pending[child] == 0) queue.Enqueue(child);
        }
        if (ordered.Count != spans.Count)
        {
            warnings.Add("CAUSAL_CYCLE");
            // Keep available evidence but exclude invalid cycle edges from a claimed execution sequence.
            ordered.AddRange(pending.Where(p => p.Value > 0).Select(p => spans[p.Key]));
            edges.RemoveAll(e => pending[(e.TraceId, e.ParentSpanId)] > 0 || pending[(e.TraceId, e.ChildSpanId)] > 0);
        }
        if (spans.Count == 0) warnings.Add("NO_USABLE_SPANS");
        warnings.Add("ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION");
        var interactions = edges.Select(e => (edge: e, parent: spans[(e.TraceId, e.ParentSpanId)], child: spans[(e.TraceId, e.ChildSpanId)]))
            .Where(p => p.parent.RuntimeService != p.child.RuntimeService)
            .Select(p => new ObservedServiceInteraction(p.edge.TraceId, p.parent.RuntimeService, p.child.RuntimeService,
                p.parent.ModelServiceId, p.child.ModelServiceId, p.edge.ParentSpanId, p.edge.ChildSpanId)).ToArray();
        return new(sessionId, modelVersionId, ordered, edges, warnings.ToArray(), interactions);
    }

    private static string Text(JsonElement e, string key) => e.TryGetProperty(key, out var value) ? value.ToString() : "";
    private static bool Hex(string value, int length) => value.Length == length && value.All(Uri.IsHexDigit) && value.Any(c => c != '0');
    // Bounded, control-free labels only; values come from untrusted workload spans.
    private static string? Label(string value, int max)
    {
        var trimmed = value.Trim();
        if (trimmed.Length == 0 || trimmed.Any(char.IsControl)) return null;
        return trimmed.Length > max ? trimmed[..max] : trimmed;
    }
}

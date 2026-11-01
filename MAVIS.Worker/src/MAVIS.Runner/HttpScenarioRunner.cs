using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MAVIS.Runner;

public sealed record EnvironmentHeader(string Name, string Reference);
public sealed record HttpScenarioStep(string Id, string Service, string Method, string Path, int ExpectedStatus,
    string? JsonBody = null, IReadOnlyDictionary<string, string>? Headers = null,
    IReadOnlyDictionary<string, string>? SecretHeaders = null, IReadOnlyDictionary<string, string>? Extract = null,
    IReadOnlyDictionary<string, string>? EnvironmentVariables = null, string? BodyReference = null, IReadOnlyList<EnvironmentHeader>? EnvHeaders = null,
    bool AllowClientError = false);
public sealed record HttpScenarioDefinition(string SessionId, IReadOnlyList<HttpScenarioStep> Steps, int TimeoutSeconds = 120);
public sealed record HttpStepOutcome(string StepId, string Status, int? StatusCode, string TraceId, string ParentSpanId, long ElapsedMilliseconds);
public sealed record HttpScenarioOutcome(string SessionId, string Status, IReadOnlyList<HttpStepOutcome> Steps);

/// <summary>Bounded HTTP executor for loopback endpoints supplied by a trusted session allocator.</summary>
public sealed class HttpScenarioRunner(bool allowContainerDns = false)
{
    private static readonly HashSet<string> Methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    private static readonly Regex Variable = new("\\{\\{([a-zA-Z][a-zA-Z0-9_]*)\\}\\}", RegexOptions.NonBacktracking);
    private const int MaxResponseBytes = 1_048_576;

    public static HttpClient CreateClient() => new(new HttpClientHandler
        { AllowAutoRedirect = false, UseProxy = false, AutomaticDecompression = DecompressionMethods.None })
        { Timeout = Timeout.InfiniteTimeSpan };

    public void ValidateDefinition(HttpScenarioDefinition scenario, IReadOnlyDictionary<string, Uri> endpoints, IReadOnlyDictionary<string, string> secrets)
        => Validate(scenario, endpoints, secrets);

    public async Task<HttpScenarioOutcome> RunAsync(HttpScenarioDefinition scenario, IReadOnlyDictionary<string, Uri> endpoints,
        IReadOnlyDictionary<string, string> secrets, CancellationToken ct = default)
    {
        using var client = CreateClient();
        return await ExecuteAsync(client, scenario, endpoints, secrets, ct);
    }

    public async Task<HttpScenarioOutcome> ExecuteAsync(HttpClient client, HttpScenarioDefinition scenario,
        IReadOnlyDictionary<string, Uri> endpoints, IReadOnlyDictionary<string, string> secrets, CancellationToken ct = default)
    {
        Validate(scenario, endpoints, secrets);
        var variables = new Dictionary<string, string>(StringComparer.Ordinal);
        var outcomes = new List<HttpStepOutcome>();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(scenario.TimeoutSeconds));
        foreach (var step in scenario.Steps)
        {
            deadline.Token.ThrowIfCancellationRequested();
            foreach (var binding in step.EnvironmentVariables ?? new Dictionary<string,string>()) variables[binding.Key] = secrets[binding.Value];
            var watch = Stopwatch.StartNew();
            var trace = ActivityTraceId.CreateRandom().ToHexString();
            var span = ActivitySpanId.CreateRandom().ToHexString();
            try
            {
                var path = Substitute(step.Path, encode: true);
                using var request = new HttpRequestMessage(new HttpMethod(step.Method), new Uri(endpoints[step.Service], path));
                request.Headers.TryAddWithoutValidation("traceparent", $"00-{trace}-{span}-01");
                foreach (var header in step.Headers ?? new Dictionary<string, string>())
                    AddHeader(header.Key, Substitute(header.Value, encode: false));
                foreach (var header in step.SecretHeaders ?? new Dictionary<string, string>())
                {
                    if (!secrets.TryGetValue(header.Value, out var secret)) throw new InvalidOperationException("Missing protected reference.");
                    AddHeader(header.Key, secret);
                }
                var jsonBody = step.BodyReference is null ? step.JsonBody : secrets[step.BodyReference];
                foreach (var header in step.EnvHeaders ?? []) AddHeader(header.Name, secrets[header.Reference]);
                if (jsonBody is not null)
                {
                    // Body is a complete JSON document; no raw text substitution into JSON syntax.
                    using var body = JsonDocument.Parse(jsonBody);
                    request.Content = new StringContent(JsonSerializer.Serialize(Replace(body.RootElement)), Encoding.UTF8, "application/json");
                }
                using var stepTimeout = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
                stepTimeout.CancelAfter(TimeSpan.FromSeconds(30));
                using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, stepTimeout.Token);
                await using var stream = await response.Content.ReadAsStreamAsync(stepTimeout.Token);
                using var buffer = new MemoryStream();
                var chunk = new byte[8192];
                int count;
                while ((count = await stream.ReadAsync(chunk, stepTimeout.Token)) > 0)
                {
                    if (buffer.Length + count > MaxResponseBytes) throw new InvalidOperationException("Response size limit exceeded.");
                    buffer.Write(chunk, 0, count);
                }
                var passed = step.AllowClientError ? (int)response.StatusCode is >= 200 and < 500 : (int)response.StatusCode == step.ExpectedStatus;
                if (passed && step.Extract?.Count > 0)
                {
                    using var json = JsonDocument.Parse(buffer.ToArray());
                    foreach (var extract in step.Extract)
                    {
                        var resolved = false;
                        foreach (var candidatePointer in extract.Value.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                        {
                            var value = json.RootElement;
                            var ok = true;
                            foreach (var segment in candidatePointer.TrimStart('/').Split('/', StringSplitOptions.RemoveEmptyEntries))
                            {
                                var unescaped = segment.Replace("~1", "/").Replace("~0", "~");
                                if (value.ValueKind == JsonValueKind.Object && value.TryGetProperty(unescaped, out var prop))
                                    value = prop;
                                else if (value.ValueKind == JsonValueKind.Array && int.TryParse(unescaped, out var idx) && idx >= 0 && idx < value.GetArrayLength())
                                    value = value[idx];
                                else { ok = false; break; }
                            }
                            if (ok && value.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null))
                            {
                                variables[extract.Key] = value.ValueKind == JsonValueKind.String ? value.GetString()! : value.GetRawText();
                                resolved = true;
                                break;
                            }
                        }
                        if (!resolved) throw new KeyNotFoundException($"Missing JSON pointer '{extract.Value}'.");
                    }
                }
                outcomes.Add(new(step.Id, passed ? "Passed" : "Failed", (int)response.StatusCode, trace, span, watch.ElapsedMilliseconds));
                if (!passed) return new(scenario.SessionId, "Failed", outcomes);

                void AddHeader(string name, string value)
                {
                    if (name.Equals("Host", StringComparison.OrdinalIgnoreCase) || name.Equals("traceparent", StringComparison.OrdinalIgnoreCase) ||
                        name.Equals("tracestate", StringComparison.OrdinalIgnoreCase) || value.Contains('\r') || value.Contains('\n') || !request.Headers.TryAddWithoutValidation(name, value))
                        throw new InvalidOperationException("Unsupported scenario header.");
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (OperationCanceledException)
            {
                outcomes.Add(new(step.Id, "TimedOut", null, trace, span, watch.ElapsedMilliseconds));
                return new(scenario.SessionId, "TimedOut", outcomes);
            }
            catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or JsonException or KeyNotFoundException or ArgumentException or FormatException)
            {
                outcomes.Add(new(step.Id, "Failed", null, trace, span, watch.ElapsedMilliseconds));
                return new(scenario.SessionId, "Failed", outcomes);
            }
        }
        return new(scenario.SessionId, "Passed", outcomes);

        string Substitute(string value, bool encode) => Variable.Replace(value, match => variables.TryGetValue(match.Groups[1].Value, out var result)
            ? encode ? Uri.EscapeDataString(result) : result : throw new InvalidOperationException("Unavailable scenario variable."));
        object? Replace(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.String)
            {
                var raw = element.GetString()!;
                var m = Variable.Match(raw);
                if (m.Success && m.Index == 0 && m.Length == raw.Length && variables.TryGetValue(m.Groups[1].Value, out var exact) && long.TryParse(exact, out var num))
                    return num;
                return Substitute(raw, false);
            }
            return element.ValueKind switch
            {
                JsonValueKind.Object => element.EnumerateObject().ToDictionary(p => p.Name, p => Replace(p.Value)),
                JsonValueKind.Array => element.EnumerateArray().Select(Replace).ToArray(),
                _ => element.Clone()
            };
        }
    }

    private void Validate(HttpScenarioDefinition scenario, IReadOnlyDictionary<string, Uri> endpoints, IReadOnlyDictionary<string, string> secrets)
    {
        if (string.IsNullOrWhiteSpace(scenario.SessionId) || scenario.Steps is null || scenario.Steps.Count is < 1 or > 100 || scenario.TimeoutSeconds is < 1 or > 300)
            throw new ArgumentException("Invalid scenario bounds.");
        var ids = new HashSet<string>();
        var available = new HashSet<string>(StringComparer.Ordinal);
        foreach (var step in scenario.Steps)
        {
            if (step is null || string.IsNullOrWhiteSpace(step.Id) || !ids.Add(step.Id) || !Methods.Contains(step.Method) ||
                step.ExpectedStatus is < 100 or > 599 || step.Path is null || !step.Path.StartsWith('/') || step.Path.StartsWith("//", StringComparison.Ordinal) || step.Path.Contains('\\') ||
                !endpoints.TryGetValue(step.Service, out var endpoint) || endpoint is null || !endpoint.IsAbsoluteUri || endpoint.Scheme != "http" ||
                !AllowedHost(endpoint.Host, step.Service) || endpoint.UserInfo.Length > 0 ||
                endpoint.AbsolutePath != "/" || endpoint.Query.Length > 0 || endpoint.Fragment.Length > 0)
                throw new ArgumentException("Scenario must use known loopback service endpoints and relative paths.");
            if (step.Path.Length > 8192 || (step.JsonBody?.Length ?? 0) > 1_048_576 || (step.Headers?.Count ?? 0) > 64 || (step.SecretHeaders?.Count ?? 0) > 64)
                throw new ArgumentException("Scenario step exceeds profile limits.");
            if (step.EnvHeaders?.Count > 64 || step.EnvHeaders?.Any(header => header is null || !Regex.IsMatch(header.Name, "^[A-Za-z][A-Za-z0-9-]{0,63}$") || !secrets.ContainsKey(header.Reference) || new[]{"Host","traceparent","tracestate"}.Contains(header.Name,StringComparer.OrdinalIgnoreCase)) == true)
                throw new ArgumentException("Protected header input is unavailable or unsupported.");
            if (step.EnvironmentVariables?.Count > 64) throw new ArgumentException("Too many environment bindings.");
            foreach (var binding in step.EnvironmentVariables ?? new Dictionary<string,string>())
            {
                if (!Regex.IsMatch(binding.Key, "^[A-Z][A-Z0-9_]{0,63}$") || !secrets.ContainsKey(binding.Value)) throw new ArgumentException("Protected input reference is unavailable.");
                available.Add(binding.Key);
            }
            string? refBodyInput = null;
            if (step.BodyReference is not null)
            {
                if (step.JsonBody is not null || !secrets.TryGetValue(step.BodyReference,out refBodyInput) || refBodyInput.Length > MaxResponseBytes) throw new ArgumentException("Protected body reference unavailable.");
                using var body = JsonDocument.Parse(refBodyInput);
            }
            if (step.JsonBody is not null) { using var body = JsonDocument.Parse(step.JsonBody); }
            foreach (var value in new[] { step.Path, step.JsonBody ?? "", refBodyInput ?? "" }.Concat(step.Headers?.Values ?? []))
                foreach (Match match in Variable.Matches(value))
                    if (!available.Contains(match.Groups[1].Value)) throw new ArgumentException("Scenario variable is used before definition.");
            if (step.SecretHeaders?.Values.Any(reference => !secrets.ContainsKey(reference)) == true)
                throw new ArgumentException("Protected header reference is unavailable.");
            foreach (var extract in step.Extract ?? new Dictionary<string, string>())
            {
                if (string.IsNullOrWhiteSpace(extract.Key) || extract.Value is null || !extract.Value.StartsWith('/') || extract.Value.Length > 512)
                    throw new ArgumentException("Unsupported scenario extraction pointer.");
                available.Add(extract.Key);
            }
        }
    }

    private bool AllowedHost(string host, string service) => IPAddress.TryParse(host, out var ip) ? IPAddress.IsLoopback(ip) :
        allowContainerDns && host == service && service.Length is > 0 and <= 63 && service.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
}

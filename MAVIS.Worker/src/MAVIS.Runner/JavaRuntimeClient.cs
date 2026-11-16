using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace MAVIS.Runner;

/// <summary>Proposed round-2 Java callback transport. No credentials or response bodies in errors.</summary>
public sealed class JavaRuntimeClient : IRuntimeLifecycleObserver, IDisposable
{
    public sealed record StudioCommand(string ActionId, string Action, string Service, int? Replicas);
    public sealed record StudioPoll(bool FinishRequested, StudioCommand? Command);
    public async Task PublishStudioTelemetryAsync(string sessionId, string project, object telemetry, CancellationToken ct)
    {
        var json = await SendAsync(HttpMethod.Post, Route(sessionId, "studio/telemetry"),
            JsonSerializer.Serialize(new {sessionId,resourceProject=project,telemetry},RuntimeLifecycleJournal.Json),ct);
        using var doc=JsonDocument.Parse(json);
        RequireIdentity(Data(doc.RootElement),sessionId,project);
    }
    public async Task<StudioPoll> NextStudioCommandAsync(string sessionId, string project, CancellationToken ct)
    {
        var json = await SendAsync(HttpMethod.Get, Route(sessionId, "studio/commands") + "?resourceProject=" + Uri.EscapeDataString(project), null, ct);
        using var doc = JsonDocument.Parse(json);
        var data = Data(doc.RootElement);
        RequireIdentity(data, sessionId, project);
        return data.Deserialize<StudioPoll>(RuntimeLifecycleJournal.Json) ?? throw new InvalidOperationException("Invalid Studio command.");
    }
    public async Task AcknowledgeStudioActionAsync(string sessionId, string project, string actionId, string status,
        RuntimeInfrastructureActionResult? result, CancellationToken ct)
    {
        var json = await SendAsync(HttpMethod.Post, Route(sessionId, "studio/ack"),
            JsonSerializer.Serialize(new { sessionId, resourceProject = project, actionId, status, result }, RuntimeLifecycleJournal.Json), ct);
        using var doc = JsonDocument.Parse(json);
        var data = Data(doc.RootElement);
        if (data.GetProperty("actionId").GetString() != actionId || data.GetProperty("status").GetString() != status)
            throw new InvalidOperationException("Studio acknowledgement mismatch.");
    }
    private readonly HttpClient client;
    private readonly Uri baseUri;
    private readonly string serviceKey;
    private readonly Func<TimeSpan, CancellationToken, Task> delay;

    public JavaRuntimeClient(Uri baseUri, string serviceKey, HttpMessageHandler? handler = null,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        if (!baseUri.IsAbsoluteUri || (baseUri.Scheme != "https" && !(baseUri.Scheme == "http" && baseUri.IsLoopback)) ||
            baseUri.UserInfo.Length != 0 || baseUri.Query.Length != 0 || baseUri.Fragment.Length != 0 ||
            string.IsNullOrWhiteSpace(serviceKey) || serviceKey.Length > 512 || serviceKey.Any(char.IsControl))
            throw new ArgumentException("Invalid Java runtime transport configuration.");
        client = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan };
        this.baseUri = new Uri(baseUri.AbsoluteUri.TrimEnd('/') + "/");
        this.serviceKey = serviceKey;
        this.delay = delay ?? ((duration, ct) => Task.Delay(duration, ct));
    }

    public async Task<RuntimeRunDefinition> GetDefinitionAsync(string sessionId, CancellationToken ct)
    {
        var json = await SendAsync(HttpMethod.Get, Route(sessionId, "run-definition"), null, ct);
        return RuntimeDefinitionReader.Read(json, sessionId);
    }

    public async Task<IReadOnlyDictionary<string,string>> GetEnvironmentAsync(RuntimeRunDefinition definition, CancellationToken ct)
    {
        var response = await SendAsync(HttpMethod.Get, Route(definition.SessionId, "protected-environment"), null, ct);
        using var document = JsonDocument.Parse(response);
        var data = Data(document.RootElement);
        RequireIdentity(data, definition.SessionId, definition.ResourceProject!);
        var values = data.GetProperty("values").Deserialize<Dictionary<string,string>>() ?? throw new InvalidOperationException("Missing protected environment.");
        if (values.Count > 64 || values.Any(pair => pair.Key.Length is < 1 or > 64 || pair.Value.Length > 16000 || pair.Key.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_')))
            throw new InvalidOperationException("Invalid protected environment.");
        return values;
    }

    public async Task AcknowledgeAsync(RuntimeLifecycleEvent notification, CancellationToken ct)
    {
        _ = RuntimeAllocation.ProjectName(notification.ResourceProject);
        if ((notification.Stage == "ALLOCATED" ? notification.Sequence != 1 : notification.Stage != "RUNNING" || notification.Sequence != 2) ||
            new[] { notification.ModelVersionId, notification.SourceSnapshotId, notification.ProfileVersionId,
                notification.RunConfigurationVersionId, notification.ScenarioVersionId }.Any(string.IsNullOrWhiteSpace))
            throw new ArgumentException("Invalid lifecycle event scope/stage.");
        var json = await SendAsync(HttpMethod.Post, Route(notification.SessionId, "lifecycle-ack"),
            JsonSerializer.Serialize(new { notification.SessionId, notification.ResourceProject, notification.Stage, observedAt = notification.OccurredAt }, RuntimeLifecycleJournal.Json), ct);
        using var document = JsonDocument.Parse(json);
        var data = Data(document.RootElement);
        RequireIdentity(data, notification.SessionId, notification.ResourceProject);
        if (!data.TryGetProperty("stage", out var stage) || stage.GetString() != notification.Stage)
            throw new InvalidOperationException("Lifecycle acknowledgement stage mismatch.");
    }

    public async Task<string> PostReceiptAsync(string sessionId, string receipt, CancellationToken ct) =>
        await SendAsync(HttpMethod.Post, Route(sessionId, "ingest-receipt-ack"), receipt, ct);

    public async Task<string> PostRecoveryAsync(string sessionId, string result, CancellationToken ct) =>
        await SendAsync(HttpMethod.Post, Route(sessionId, "recovery-result"), result, ct);

    public static JsonElement Data(JsonElement root)
    {
        if (!root.TryGetProperty("data", out var data)) return root;
        if (root.TryGetProperty("status", out var status) && (!status.TryGetInt32(out var code) || code != 200))
            throw new InvalidOperationException("Java runtime envelope indicates failure.");
        return data;
    }

    public static void RequireIdentity(JsonElement data, string sessionId, string project)
    {
        if (data.GetProperty("sessionId").GetString() != sessionId || data.GetProperty("resourceProject").GetString() != project)
            throw new InvalidOperationException("Runtime acknowledgement scope mismatch.");
    }

    private static string Route(string sessionId, string action)
    {
        if (sessionId.Length is < 1 or > 128 || sessionId.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_')))
            throw new ArgumentException("Invalid runtime session ID.");
        return "api/v1/analyzer/runtime/sessions/" + sessionId + "/" + action;
    }

    private async Task<string> SendAsync(HttpMethod method, string route, string? body, CancellationToken ct)
    {
        // At most five retries (six total attempts). Never retries permanent 4xx or follows redirects.
        for (var attempt = 0; ; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
            deadline.CancelAfter(TimeSpan.FromSeconds(10));
            TimeSpan backoff = TimeSpan.FromSeconds(Math.Min(1 << attempt, 16));
            try
            {
                using var request = new HttpRequestMessage(method, new Uri(baseUri, route));
                request.Headers.Add("X-Mavis-Runner-Key", serviceKey);
                if (route.EndsWith("/ingest-receipt-ack", StringComparison.Ordinal) && body is not null) {
                    var signature=System.Security.Cryptography.HMACSHA256.HashData(Encoding.UTF8.GetBytes(serviceKey),
                        Encoding.UTF8.GetBytes(ReceiptCanonicalJson.Digest(body)));
                    request.Headers.Add("X-Mavis-Receipt-Signature","hmac-sha256:"+Convert.ToHexString(signature).ToLowerInvariant());
                }
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
                using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
                if (!response.IsSuccessStatusCode)
                {
                    var retryable = response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests || (int)response.StatusCode >= 500;
                    if (!retryable || attempt >= 5) throw new InvalidOperationException("Java runtime request rejected (HTTP " + (int)response.StatusCode + ").");
                    var retryAfter = response.Headers.RetryAfter;
                    var wait = retryAfter?.Delta ?? (retryAfter?.Date - DateTimeOffset.UtcNow);
                    if (wait is not null) backoff = TimeSpan.FromSeconds(Math.Clamp(wait.Value.TotalSeconds, 0, 30));
                }
                else
                {
                    var mediaType = response.Content.Headers.ContentType?.MediaType;
                    if (mediaType != "application/json" && mediaType?.EndsWith("+json", StringComparison.Ordinal) != true)
                        throw new InvalidOperationException("Expected JSON runtime response.");
                    using var input = await response.Content.ReadAsStreamAsync(deadline.Token);
                    using var output = new MemoryStream();
                    var buffer = new byte[8192];
                    int count;
                    while ((count = await input.ReadAsync(buffer, deadline.Token)) != 0)
                    {
                        if (output.Length + count > 1_048_576) throw new InvalidOperationException("Runtime response exceeds budget.");
                        output.Write(buffer, 0, count);
                    }
                    return Encoding.UTF8.GetString(output.ToArray());
                }
            }
            catch (HttpRequestException) { if (attempt >= 5) throw new InvalidOperationException("Java runtime delivery unavailable."); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested && attempt < 5) { }
            await delay(backoff, ct);
        }
    }

    public void Dispose() => client.Dispose();
}

using System.Net;
using System.Text;
using System.Text.Json;
using MAVIS.Runner;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;

namespace MAVIS.Worker.Tests.Integration;

public sealed class RunnerComponentTests
{
    private static readonly string Digest = new('a', 64);

    [Fact]
    public void PreflightAcceptsStrictProfileWithoutStartingAnything()
    {
        var result = ComposePreflight.Check($"services:\n  app:\n    image: example/app@sha256:{Digest}\n    environment:\n      MODE: test\n");
        Assert.True(result.Compatible); Assert.Equal("app", Assert.Single(result.Services));
        Assert.Contains("NO_BUILD_OR_START_PERFORMED", result.Limitations);
    }

    [Theory]
    [InlineData("privileged: true")]
    [InlineData("network_mode: host")]
    [InlineData("build: .")]
    [InlineData("env_file: /host/secret")]
    [InlineData("volumes: ['/var/run/docker.sock:/var/run/docker.sock']")]
    [InlineData("ports: ['8080:8080']")]
    public void PreflightRejectsUnsupportedOrPrivilegedCompose(string option)
    {
        var result = ComposePreflight.Check($"services:\n  app:\n    image: example/app@sha256:{Digest}\n    {option}\n");
        Assert.False(result.Compatible);
        Assert.DoesNotContain("/host/secret", JsonSerializer.Serialize(result));
    }

    [Fact]
    public void PreflightRequiresDigestAndRejectsExternalVolumeDrivers()
    {
        Assert.False(ComposePreflight.Check("services:\n  app:\n    image: app:latest").Compatible);
        Assert.False(ComposePreflight.Check($"services:\n  app:\n    image: app@sha256:{Digest}\nvolumes:\n  data:\n    external: true").Compatible);
    }

    private sealed class Handler(Func<HttpRequestMessage, int, HttpResponseMessage> handle) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(handle(request, ++Calls));
    }

    [Fact]
    public async Task ScenarioVariablesTraceParentAndProtectedHeadersStayOutOfResults()
    {
        using var handler = new Handler((request, call) =>
        {
            Assert.True(request.Headers.Contains("traceparent"));
            if (call == 2)
            {
                Assert.Equal("/orders/abc", request.RequestUri!.AbsolutePath);
                Assert.Equal("Bearer SECRET_SENTINEL", request.Headers.GetValues("Authorization").Single());
            }
            return new(HttpStatusCode.OK) { Content = new StringContent("{\"id\":\"abc\",\"token\":\"SECRET_SENTINEL\"}", Encoding.UTF8, "application/json") };
        });
        using var client = new HttpClient(handler);
        var scenario = new HttpScenarioDefinition("session", [new("create", "app", "POST", "/orders", 200, Extract: new Dictionary<string, string> { ["id"] = "/id" }),
            new("read", "app", "GET", "/orders/{{id}}", 200, SecretHeaders: new Dictionary<string, string> { ["Authorization"] = "auth" })]);
        var result = await new HttpScenarioRunner().ExecuteAsync(client, scenario, new Dictionary<string, Uri> { ["app"] = new("http://127.0.0.1:12345") },
            new Dictionary<string, string> { ["auth"] = "Bearer SECRET_SENTINEL" });
        Assert.Equal("Passed", result.Status); Assert.Equal(2, handler.Calls);
        Assert.DoesNotContain("SECRET_SENTINEL", JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task FailedRequestStopsFollowingStepsAndUnknownDestinationsAreRejected()
    {
        using var handler = new Handler((_, _) => new(HttpStatusCode.InternalServerError)); using var client = new HttpClient(handler);
        var scenario = new HttpScenarioDefinition("s", [new("a", "app", "GET", "/", 200), new("b", "app", "GET", "/", 200)]);
        var result = await new HttpScenarioRunner().ExecuteAsync(client, scenario, new Dictionary<string, Uri> { ["app"] = new("http://127.0.0.1:12345") }, new Dictionary<string, string>());
        Assert.Equal("Failed", result.Status); Assert.Equal(1, handler.Calls);
        await Assert.ThrowsAsync<ArgumentException>(() => new HttpScenarioRunner().ExecuteAsync(client, scenario,
            new Dictionary<string, Uri> { ["app"] = new("http://example.com") }, new Dictionary<string, string>()));
    }

    [Fact]
    public void PreflightRejectsAliasesDeepYamlAndHostInterpolation()
    {
        Assert.False(ComposePreflight.Check($"services: &services\n  app:\n    image: app@sha256:{Digest}").Compatible);
        Assert.False(ComposePreflight.Check($"services:\n  app:\n    image: app@sha256:{Digest}\n    command: echo ${{HOME}}").Compatible);
        Assert.Contains(ComposePreflight.Check("services: " + new string('[', 70) + new string(']', 70)).Errors, e => e.Code == "COMPOSE_DEPTH_LIMIT");
    }

    [Fact]
    public async Task ContainerDnsRequiresExplicitPolicyAndDefinedVariables()
    {
        using var handler = new Handler((_, _) => new(HttpStatusCode.OK)); using var client = new HttpClient(handler);
        var endpoints = new Dictionary<string, Uri> { ["orders"] = new("http://orders:8080") };
        var scenario = new HttpScenarioDefinition("s", [new("a", "orders", "GET", "/", 200)]);
        await Assert.ThrowsAsync<ArgumentException>(() => new HttpScenarioRunner().ExecuteAsync(client, scenario, endpoints, new Dictionary<string, string>()));
        Assert.Equal("Passed", (await new HttpScenarioRunner(allowContainerDns: true).ExecuteAsync(client, scenario, endpoints, new Dictionary<string, string>())).Status);
        await Assert.ThrowsAsync<ArgumentException>(() => new HttpScenarioRunner(allowContainerDns: true).ExecuteAsync(client,
            scenario with { Steps = [new("bad", "orders", "GET", "/{{undefined}}", 200)] }, endpoints, new Dictionary<string, string>()));
        Assert.ThrowsAny<JsonException>(() => new HttpScenarioRunner(allowContainerDns: true).ValidateDefinition(
            scenario with { Steps = [new("bad", "orders", "POST", "/", 200, JsonBody: "{ invalid")] }, endpoints, new Dictionary<string, string>()));
    }

    [Fact]
    public async Task ScenarioRunsAgainstRealLoopbackServerWithoutFollowingRedirects()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        await using var app = builder.Build();
        var reached = 0;
        app.MapGet("/health", () => new { ok = true });
        app.MapGet("/redirect", () => Microsoft.AspNetCore.Http.Results.Redirect("/not-allowed"));
        app.MapGet("/not-allowed", () => { Interlocked.Increment(ref reached); return "unexpected"; });
        await app.StartAsync();
        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        var endpoints = new Dictionary<string, Uri> { ["app"] = new(address) };
        var scenario = new HttpScenarioDefinition("real-loopback", [new("health", "app", "GET", "/health", 200)]);
        Assert.Equal("Passed", (await new HttpScenarioRunner().RunAsync(scenario, endpoints, new Dictionary<string, string>())).Status);
        var redirect = scenario with { Steps = [new("redirect", "app", "GET", "/redirect", 200)] };
        Assert.Equal("Failed", (await new HttpScenarioRunner().RunAsync(redirect, endpoints, new Dictionary<string, string>())).Status);
        Assert.Equal(0, reached);
        await app.StopAsync();
    }

    [Fact]
    public void CorrelationUsesParentLinksNotTimestampsAndRedactsAttributes()
    {
        var trace = new string('a', 32); var parent = new string('b', 16); var child = new string('c', 16);
        var json = JsonSerializer.Serialize(new { resourceSpans = new[] { new {
            resource = new { attributes = new[] { new { key = "service.name", value = new { stringValue = "orders" } } } },
            scopeSpans = new[] { new { spans = new[] {
                new { traceId=trace, spanId=child, parentSpanId=parent, kind=2, startTimeUnixNano="1", name="SECRET_SENTINEL" },
                new { traceId=trace, spanId=parent, parentSpanId="", kind=3, startTimeUnixNano="999", name="SECRET_SENTINEL" }
            } } }
        } } });
        var result = TraceCorrelator.Correlate("s", "m", json, new Dictionary<string, string> { ["orders"] = "model-orders" });
        Assert.Equal(parent, result.Spans[0].SpanId);
        Assert.Equal(child, Assert.Single(result.CausalEdges).ChildSpanId);
        Assert.DoesNotContain("SECRET_SENTINEL", JsonSerializer.Serialize(result));
    }

    [Fact]
    public void TimingAndErrorMetadataAreRetainedWithoutSensitiveMessages()
    {
        var trace = new string('a', 32); var span = new string('b', 16);
        var json = JsonSerializer.Serialize(new { resourceSpans = new[] { new { scopeSpans = new[] { new { spans = new[] {
            new { traceId=trace, spanId=span, startTimeUnixNano="100", endTimeUnixNano="250",
                status=new { code=2, message="SECRET_SENTINEL" }, attributes=new[] { new { key="http.response.status_code", value=new { intValue="503" } } } }
        } } } } } });
        var result = TraceCorrelator.Correlate("s", "m", json, new Dictionary<string, string>());
        var item = Assert.Single(result.Spans);
        Assert.Equal("150", item.DurationNanoseconds); Assert.Equal("Error", item.SpanStatus); Assert.Equal(503, item.HttpStatusCode);
        Assert.DoesNotContain("SECRET_SENTINEL", JsonSerializer.Serialize(result));
    }

    [Fact]
    public void UnrelatedTracesAndCyclicSpansDoNotProduceFictionalEdges()
    {
        var trace = new string('a', 32); var otherTrace = new string('d', 32);
        var a = new string('b', 16); var b = new string('c', 16);
        var json = JsonSerializer.Serialize(new { resourceSpans = new[] { new { scopeSpans = new[] { new { spans = new[] {
            new { traceId = trace, spanId = a, parentSpanId = b }, new { traceId = trace, spanId = b, parentSpanId = a },
            new { traceId = otherTrace, spanId = b, parentSpanId = a }
        } } } } } });
        var result = TraceCorrelator.Correlate("s", "m", json, new Dictionary<string, string>());
        Assert.Empty(result.CausalEdges);
        Assert.Contains("CAUSAL_CYCLE", result.Warnings); Assert.Contains("MISSING_PARENT_SPAN", result.Warnings);
        Assert.Equal(3, result.Spans.Count);
    }

    [Fact]
    public void PassthroughRuntimeAndScopedEnvironmentBindingsOmitJvmAgentAndIsolateSecrets()
    {
        var compose = $"services:\n  node-api:\n    image: node@sha256:{Digest}\n  order-svc:\n    image: order@sha256:{Digest}\n  postgres:\n    image: postgres@sha256:{Digest}\n    user: postgres\n    volumes:\n      - type: volume\n        source: postgres_data\n        target: /var/lib/postgresql/data\nvolumes:\n  postgres_data: {{}}\n";
        var preflight = ComposePreflight.Check(compose);
        Assert.True(preflight.Compatible);

        var profile = new RunnerExecutionProfile(
            "collector@sha256:" + Digest,
            "mavis-agents-v1",
            new Dictionary<string, RuntimeServiceProfile>
            {
                ["node-api"] = new("passthrough", 3000, "/", AllowClientErrorReadiness: true),
                ["order-svc"] = new("passthrough", 8080, "/health")
            },
            ApprovedForLocalPoc: true,
            EnvironmentBindings: new Dictionary<string, IReadOnlyList<RuntimeEnvironmentBinding>>
            {
                ["node-api"] = [new("DB_PASSWORD", "NODE_API__DB_PASSWORD")],
                ["order-svc"] = [new("DB_PASSWORD", "ORDER_SVC__DB_PASSWORD")]
            });
        var values = new Dictionary<string, string>
        {
            ["NODE_API__DB_PASSWORD"] = "node_secret_1",
            ["ORDER_SVC__DB_PASSWORD"] = "order_secret_2"
        };
        using var overrideDoc = JsonDocument.Parse(ComposeOverrideBuilder.Build(preflight, profile, Path.Combine(Path.GetTempPath(), "collector.yaml"), values));
        var nodeConfig = overrideDoc.RootElement.GetProperty("services").GetProperty("node-api");
        Assert.False(nodeConfig.TryGetProperty("volumes", out _));
        var nodeEnv = nodeConfig.GetProperty("environment");
        Assert.Equal("node-api", nodeEnv.GetProperty("OTEL_SERVICE_NAME").GetString());
        Assert.Equal("http://mavis-collector:4318", nodeEnv.GetProperty("OTEL_EXPORTER_OTLP_ENDPOINT").GetString());
        Assert.False(nodeEnv.TryGetProperty("JAVA_TOOL_OPTIONS", out _));
        Assert.False(nodeEnv.TryGetProperty("OTEL_JAVAAGENT_ENABLED", out _));
        Assert.False(nodeEnv.TryGetProperty("CORECLR_ENABLE_PROFILING", out _));
        var javaOverride = JsonDocument.Parse(ComposeOverrideBuilder.Build(
            preflight,
            profile with { Applications = new Dictionary<string, RuntimeServiceProfile> { ["node-api"] = new("java", 8080), ["order-svc"] = new("passthrough", 3001) } },
            Path.Combine(Path.GetTempPath(), "collector.yaml"),
            values));
        Assert.Equal("true", javaOverride.RootElement.GetProperty("services").GetProperty("node-api").GetProperty("environment").GetProperty("OTEL_JAVAAGENT_ENABLED").GetString());
        Assert.Equal("false", javaOverride.RootElement.GetProperty("services").GetProperty("node-api").GetProperty("environment").GetProperty("MANAGEMENT_HEALTH_MAIL_ENABLED").GetString());
        var javaEnvironment = javaOverride.RootElement.GetProperty("services").GetProperty("node-api").GetProperty("environment");
        Assert.False(javaEnvironment.TryGetProperty("MANAGEMENT_ENDPOINT_HEALTH_STATUS_HTTP_MAPPING_DOWN", out _));
        Assert.False(javaEnvironment.TryGetProperty("MANAGEMENT_ENDPOINT_HEALTH_STATUS_HTTP_MAPPING_OUT_OF_SERVICE", out _));
        var warmup = javaOverride.RootElement.GetProperty("services").GetProperty("node-api").GetProperty("healthcheck");
        Assert.Equal("120s", warmup.GetProperty("start_period").GetString());
        Assert.False(warmup.TryGetProperty("test", out _));
        Assert.False(warmup.TryGetProperty("disable", out _));
        using var muslOverride = JsonDocument.Parse(ComposeOverrideBuilder.Build(preflight,
            profile with { TimeoutSeconds = 300, Applications = new Dictionary<string, RuntimeServiceProfile> {
                ["node-api"] = new("dotnet8-linux-x64-musl", 8080),
                ["order-svc"] = new("passthrough", 3001) } },
            Path.Combine(Path.GetTempPath(), "collector.yaml"), values));
        var muslEnvironment = muslOverride.RootElement.GetProperty("services").GetProperty("node-api").GetProperty("environment");
        Assert.Equal("/mavis-otel/dotnet-musl/linux-musl-x64/OpenTelemetry.AutoInstrumentation.Native.so", muslEnvironment.GetProperty("CORECLR_PROFILER_PATH").GetString());
        Assert.Equal("/mavis-otel/dotnet-musl", muslEnvironment.GetProperty("OTEL_DOTNET_AUTO_HOME").GetString());
        Assert.Equal("console", muslEnvironment.GetProperty("OTEL_DOTNET_AUTO_LOGGER").GetString());
        Assert.Equal("300s", muslOverride.RootElement.GetProperty("services").GetProperty("node-api").GetProperty("healthcheck").GetProperty("start_period").GetString());
        Assert.False(nodeEnv.TryGetProperty("OTEL_DOTNET_AUTO_LOGGER", out _));
        Assert.Equal("/mavis-otel/dotnet-musl/net/OpenTelemetry.AutoInstrumentation.StartupHook.dll", muslEnvironment.GetProperty("DOTNET_STARTUP_HOOKS").GetString());
        Assert.Equal("node_secret_1", nodeEnv.GetProperty("DB_PASSWORD").GetString());
        Assert.Equal("order_secret_2", overrideDoc.RootElement.GetProperty("services").GetProperty("order-svc").GetProperty("environment").GetProperty("DB_PASSWORD").GetString());
        Assert.False(overrideDoc.RootElement.GetProperty("volumes").TryGetProperty("mavis-instrumentation", out _));
    }

    [Fact]
    public async Task AllowClientErrorReadinessAccepts4xxLivenessResponsesAndRejects5xx()
    {
        using var handler = new Handler((req, _) => req.RequestUri!.AbsolutePath switch
        {
            "/unmapped-root" => new(HttpStatusCode.NotFound),
            "/secured-root" => new(HttpStatusCode.Unauthorized),
            _ => new(HttpStatusCode.ServiceUnavailable)
        });
        using var client = new HttpClient(handler);
        var endpoints = new Dictionary<string, Uri> { ["app"] = new("http://127.0.0.1:12345") };

        var okOutcome = await new HttpScenarioRunner().ExecuteAsync(client,
            new("readiness", [
                new("s1", "app", "GET", "/unmapped-root", 200, AllowClientError: true),
                new("s2", "app", "GET", "/secured-root", 200, AllowClientError: true)
            ]), endpoints, new Dictionary<string, string>());
        Assert.Equal("Passed", okOutcome.Status);

        var failOutcome = await new HttpScenarioRunner().ExecuteAsync(client,
            new("readiness-5xx", [new("s3", "app", "GET", "/starting", 200, AllowClientError: true)]),
            endpoints, new Dictionary<string, string>());
        Assert.Equal("Failed", failOutcome.Status);
    }

    [Fact]
    public async Task BodyReferenceSubstitutesVariablesCoercesIntegersAndSupportsMultiPointerExtract()
    {
        string? capturedOrderJson = null;
        string? capturedAuthHeader = null;
        using var handler = new Handler((req, call) =>
        {
            if (call == 1)
                return new(HttpStatusCode.Created) { Content = new StringContent("{\"data\":{\"id\":42,\"token\":\"jwt-xyz\"}}", Encoding.UTF8, "application/json") };
            using var reader = new StreamReader(req.Content!.ReadAsStream());
            capturedOrderJson = reader.ReadToEnd();
            capturedAuthHeader = req.Headers.GetValues("Authorization").Single();
            return new(HttpStatusCode.Created) { Content = new StringContent("{\"orderId\":99}", Encoding.UTF8, "application/json") };
        });
        using var client = new HttpClient(handler);
        var scenario = new HttpScenarioDefinition("stateful", [
            new("seed", "app", "POST", "/users", 201,
                Extract: new Dictionary<string, string> { ["USER_ID"] = "/id|/data/id", ["AUTH_TOKEN"] = "/accessToken|/data/token" }),
            new("order", "app", "POST", "/orders", 201,
                BodyReference: "order_body",
                Headers: new Dictionary<string, string> { ["Authorization"] = "Bearer {{AUTH_TOKEN}}" })
        ]);
        var outcome = await new HttpScenarioRunner().ExecuteAsync(
            client,
            scenario,
            new Dictionary<string, Uri> { ["app"] = new("http://127.0.0.1:12345") },
            new Dictionary<string, string> { ["order_body"] = "{\"userId\":\"{{USER_ID}}\",\"label\":\"user-{{USER_ID}}\"}" });
        Assert.Equal("Passed", outcome.Status);
        Assert.Equal("Bearer jwt-xyz", capturedAuthHeader);
        using var doc = JsonDocument.Parse(capturedOrderJson!);
        Assert.Equal(JsonValueKind.Number, doc.RootElement.GetProperty("userId").ValueKind);
        Assert.Equal(42, doc.RootElement.GetProperty("userId").GetInt64());
        Assert.Equal("user-42", doc.RootElement.GetProperty("label").GetString());
    }

    [Fact]
    public async Task MissingExtractPointerPreservesStatusCodeWhenStrictAndFallsBackWhenAllowClientError()
    {
        string? secondPath = null;
        using var handler = new Handler((req, call) =>
        {
            if (call == 2) secondPath = req.RequestUri!.PathAndQuery;
            return new(HttpStatusCode.OK) { Content = new StringContent("{\"nested\":{\"id\":7}}", Encoding.UTF8, "application/json") };
        });
        using var client = new HttpClient(handler);
        var endpoints = new Dictionary<string, Uri> { ["app"] = new("http://127.0.0.1:12345") };

        var strict = await new HttpScenarioRunner().ExecuteAsync(client,
            new("strict-extract", [new("s1", "app", "POST", "/checkout", 200, AllowClientError: false, Extract: new Dictionary<string, string> { ["ORDER_ID"] = "/orderId" })]),
            endpoints, new Dictionary<string, string>());
        Assert.Equal("Failed", strict.Status);
        Assert.Equal(200, strict.Steps[0].StatusCode);

        using var handler2 = new Handler((req, call) =>
        {
            if (call == 2) secondPath = req.RequestUri!.PathAndQuery;
            return new(HttpStatusCode.OK) { Content = new StringContent("{\"nested\":{\"id\":7}}", Encoding.UTF8, "application/json") };
        });
        using var client2 = new HttpClient(handler2);
        var exploratory = await new HttpScenarioRunner().ExecuteAsync(client2,
            new("exploratory-extract", [
                new("s1", "app", "POST", "/checkout", 200, AllowClientError: true, Extract: new Dictionary<string, string> { ["ORDER_ID"] = "/orderId" }),
                new("s2", "app", "GET", "/orders/{{ORDER_ID}}", 200, AllowClientError: true)
            ]),
            endpoints, new Dictionary<string, string>());
        Assert.Equal("Passed", exploratory.Status);
        Assert.Equal("/orders/1", secondPath);
    }
}

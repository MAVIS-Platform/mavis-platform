using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class HttpClientProfileTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-http-" + Guid.NewGuid().ToString("N"));
    private async Task<DotnetAnalysisResult> Analyze(string code, string? config = null)
    {
        Directory.CreateDirectory(_root); await File.WriteAllTextAsync(Path.Combine(_root, "App.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk.Web\" />");
        await File.WriteAllTextAsync(Path.Combine(_root, "Client.cs"), code);
        if (config is not null) await File.WriteAllTextAsync(Path.Combine(_root, "appsettings.json"), config);
        return await new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }))
            .AnalyzeAsync(new("p", "s", _root, "j"), CancellationToken.None);
    }
    private const string Imports = "using System; using System.Net.Http; using System.Threading.Tasks; using Microsoft.Extensions.DependencyInjection; using Microsoft.Extensions.Configuration;\n";

    [Fact]
    public async Task NamedClientResolvesConfigBaseAddressWithBothEvidenceSources()
    {
        var result = await Analyze(Imports + """
            class Startup { public void Configure(IServiceCollection services, IConfiguration config) {
                services.AddHttpClient("arbitrary-name", c => c.BaseAddress = new Uri(config["Payment:BaseAddress"]));
            } }
            class Caller { public async Task Run(IHttpClientFactory factory) {
                var client = factory.CreateClient("arbitrary-name"); await client.GetAsync("orders");
            } }
            """, """{"Payment":{"BaseAddress":"http://user:SECRET_SENTINEL@localhost:5001/api/?token=SECRET_SENTINEL"}}""");
        var outgoing = Assert.Single(result.Findings.Where(f => f.Kind == "OutgoingHttp"));
        Assert.Equal("localhost:5001", outgoing.Target); Assert.Equal("ClientRegistrationLiteral", outgoing.ResolutionStatus);
        Assert.Contains(outgoing.AdditionalEvidence!, e => e.FilePath == "appsettings.json");
        Assert.DoesNotContain("SECRET_SENTINEL", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task ArbitraryFactoryNameAndFakeGetAsyncNeverBecomeServiceTargets()
    {
        var result = await Analyze(Imports + """
            class Caller { public async Task Run(IHttpClientFactory factory) {
                await factory.CreateClient("not-a-service").GetAsync("orders");
                await new Fake().GetAsync("https://should-not-appear");
            } }
            class Fake { public Task GetAsync(string path) => Task.CompletedTask; }
            """);
        var outgoing = Assert.Single(result.Findings.Where(f => f.Kind == "OutgoingHttp"));
        Assert.Null(outgoing.Target); Assert.Equal("Unresolved", outgoing.ResolutionStatus);
        Assert.DoesNotContain(result.Findings, f => f.Target == "not-a-service" || f.Target == "should-not-appear:443");
    }

    [Fact]
    public async Task TypedClientMapsConstructorInjectedFieldWithoutInventingServiceIdentity()
    {
        var result = await Analyze(Imports + """
            class Startup { public void Configure(IServiceCollection services) {
                services.AddHttpClient<Client>(c => c.BaseAddress = new Uri("https://payments:8443/api/"));
            } }
            class Client { private readonly HttpClient _http; public Client(HttpClient http) { _http = http; }
                public Task Run() => _http.PostAsync("pay", null);
            }
            """);
        var outgoing = Assert.Single(result.Findings.Where(f => f.Kind == "OutgoingHttp"));
        Assert.Equal("payments:8443", outgoing.Target); Assert.Equal("POST", outgoing.HttpMethod);
    }

    [Theory]
    [InlineData("duplicate")]
    [InlineData("conditional")]
    [InlineData("reassigned")]
    public async Task AmbiguousOrReassignedClientsDoNotSelectAnAddress(string mode)
    {
        var registration = mode == "duplicate" ? "services.AddHttpClient(\"p\", c => c.BaseAddress = new Uri(\"http://localhost:5002\"));" : "";
        var assignment = mode == "conditional" ? "if (flag) c.BaseAddress = new Uri(\"http://localhost:5001\");" : "c.BaseAddress = new Uri(\"http://localhost:5001\");";
        var change = mode == "reassigned" ? "client.BaseAddress = new Uri(\"http://localhost:5003\");" : "";
        var result = await Analyze(Imports + $$"""
            class Startup { public void Configure(IServiceCollection services, bool flag) {
                services.AddHttpClient("p", c => { {{assignment}} }); {{registration}}
            } }
            class Caller { public async Task Run(IHttpClientFactory factory) {
                var client = factory.CreateClient("p"); {{change}} await client.GetAsync("pay");
            } }
            """);
        Assert.Null(Assert.Single(result.Findings.Where(f => f.Kind == "OutgoingHttp")).Target);
        Assert.Contains(result.Warnings, w => w.Code == "UNRESOLVED_HTTP_TARGET");
    }

    [Fact]
    public async Task InlineRequestMessageAndLocalInitializerResolveOnlySupportedHttpPatterns()
    {
        var result = await Analyze(Imports + """
            class Caller { public async Task Run() {
                var client = new HttpClient { BaseAddress = new Uri("http://localhost:5010/") };
                await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "item"));
            } }
            """);
        var outgoing = Assert.Single(result.Findings.Where(f => f.Kind == "OutgoingHttp"));
        Assert.Equal("DELETE", outgoing.HttpMethod); Assert.Equal("localhost:5010", outgoing.Target);
    }

    [Fact]
    public async Task RefitAdapterDoesNotTreatCustomAttributesAsRefit()
    {
        var result = await Analyze("""
            using Refit;
            namespace Other { class GetAttribute : System.Attribute { public GetAttribute(string route) {} } }
            namespace Refit { class GetAttribute : System.Attribute { public GetAttribute(string route) {} } }
            interface IApi { [Refit.Get("/real")] void Real(); [Other.Get("/fake")] void Fake(); }
            """);
        var endpoint = Assert.Single(result.Findings.Where(f => f.Kind == "RefitEndpointCandidate"));
        Assert.Equal("/real", endpoint.Target);
    }
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}

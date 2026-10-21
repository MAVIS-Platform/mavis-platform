using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class SemanticAndAspNetTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-semantic-" + Guid.NewGuid().ToString("N"));
    public SemanticAndAspNetTests() { Directory.CreateDirectory(_root); Write("App.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\" />"); }
    private void Write(string path, string content)
    {
        var file = Path.Combine(_root, path); Directory.CreateDirectory(Path.GetDirectoryName(file)!); File.WriteAllText(file, content);
    }
    private Task<DotnetAnalysisResult> Analyze() => new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }))
        .AnalyzeAsync(new("project", "snapshot", _root, "job"), CancellationToken.None);

    [Fact]
    public async Task ResolvesInheritanceInterfacesAndConstructorDependencies()
    {
        Write("Types.cs", "namespace Demo; interface IStore {} class Base {} class Store : Base, IStore { public Store(IStore other) {} }");
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Kind == "Inherits" && f.Subject == "Demo.Store" && f.Target == "Demo.Base" && f.Confidence == "ResolvedSymbol");
        Assert.Contains(result.Findings, f => f.Kind == "Implements" && f.Target == "Demo.IStore");
        Assert.Contains(result.Findings, f => f.Kind == "CodeDependency" && f.Target == "Demo.IStore");
    }

    [Fact]
    public async Task MergesPartialDeclarationsWithoutLosingEvidence()
    {
        Write("A.cs", "namespace Demo; partial class Store {}"); Write("B.cs", "namespace Demo; partial class Store {}");
        var type = Assert.Single((await Analyze()).Findings.Where(f => f.Kind == "Type"));
        Assert.Single(type.AdditionalEvidence!);
        Assert.NotEqual(type.Evidence.FilePath, type.AdditionalEvidence![0].FilePath);
    }

    [Fact]
    public async Task ResolvesProjectReferenceWithoutLoadingTargetBinaries()
    {
        Write("App.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><Compile Remove=\"Contracts/**/*.cs\" /><ProjectReference Include=\"Contracts/Contracts.csproj\" /></ItemGroup></Project>");
        Write("Contracts/Contracts.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\" />");
        Write("Contracts/IStore.cs", "namespace Contracts; public interface IStore {}"); Write("Store.cs", "class Store : Contracts.IStore {}");
        Assert.Contains((await Analyze()).Findings, f => f.Kind == "Implements" && f.Target == "Contracts.IStore");
    }

    [Fact]
    public async Task MissingTypesRemainCandidatesAndDiagnosticsDoNotLeakSource()
    {
        Write("A.cs", "class A : MissingBase { string token = \"SECRET_SENTINEL\"; }");
        var result = await Analyze();
        Assert.DoesNotContain(result.Findings, f => f.Kind == "Inherits");
        Assert.Contains(result.Warnings, w => w.Code == "SEMANTIC_LIMITATIONS");
        Assert.DoesNotContain("SECRET_SENTINEL", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task ControllerAndRefitRoutesRemainExplicitCandidates()
    {
        Write("Routes.cs", """
            using Refit;
            [ApiController, Route("api/[controller]")]
            class OrdersController { [HttpGet("{id?}")] public void Get() {} [HttpPost("~/create")] public void Create() {} }
            interface IPayments { [Get("/pay?token=SECRET_SENTINEL")] void Pay(); }
            """);
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Kind == "ApiEndpointCandidate" && f.Target == "/api/Orders/{id?}" && f.HttpMethod == "GET");
        Assert.Contains(result.Findings, f => f.Kind == "ApiEndpointCandidate" && f.Target == "/create");
        Assert.Contains(result.Findings, f => f.Kind == "RefitEndpointCandidate" && f.Target == "/pay");
        Assert.DoesNotContain("SECRET_SENTINEL", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task NestedMinimalApiGroupsAndRegistrationCandidates()
    {
        Write("Program.cs", """
            var app = builder.Build();
            var api = app.MapGroup("/api");
            var orders = api.MapGroup("/orders");
            orders.MapGet("/{id}", () => "ok");
            services.AddScoped<IStore, Store>(); services.AddHttpClient<IClient, Client>(); services.AddDbContext<AppDb>();
            db.SaveChangesAsync();
            class AppDb : DbContext { public DbSet<Order> Orders { get; set; } }
            """);
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Kind == "MinimalApiEndpointCandidate" && f.Target == "/api/orders/{id}");
        Assert.Contains(result.Findings, f => f.Kind == "DiRegistrationCandidate" && f.Target == "IStore->Store");
        Assert.Contains(result.Findings, f => f.Kind == "HttpClientRegistrationCandidate");
        Assert.Contains(result.Findings, f => f.Kind == "DbContextRegistrationCandidate");
        Assert.Contains(result.Findings, f => f.Kind == "DatabaseSetCandidate" && f.Target == "Order");
    }

    [Fact]
    public async Task RealHttpClientAndTypedBaseAddressKeepOnlyHostAndPort()
    {
        Write("Client.cs", """
            using System.Net.Http;
            using System.Threading.Tasks;
            class Client { public async Task Run(HttpClient http) { await http.GetAsync("https://payments/api?token=SECRET_SENTINEL"); } }
            class Startup { public void Configure() { services.AddHttpClient<IClient, Client>(c => c.BaseAddress = new System.Uri("https://payments?token=SECRET_SENTINEL")); } }
            """);
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Kind == "OutgoingHttp" && f.Target == "payments:443" && f.Confidence == "ResolvedSymbol");
        Assert.Contains(result.Findings, f => f.Kind == "HttpClientBaseAddressCandidate" && f.Target == "payments:443");
        Assert.DoesNotContain("SECRET_SENTINEL", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task WebSdkImplicitUsingsResolveHttpClientButDoNotInventDynamicDestination()
    {
        Write("App.csproj", "<Project Sdk=\"Microsoft.NET.Sdk.Web\"><PropertyGroup><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>");
        Write("Program.cs", """
            var builder = WebApplication.CreateBuilder(args);
            builder.Services.AddHttpClient();
            var app = builder.Build();
            app.MapGet("/orders", async (IHttpClientFactory clients) => await clients.CreateClient().GetStringAsync(Environment.GetEnvironmentVariable("PAYMENT_URL") + "/pay"));
            app.Run();
            """);
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Kind == "OutgoingHttp" && f.Target is null && f.Confidence == "ResolvedSymbol");
        Assert.Contains(result.Warnings, w => w.Code == "HOST_IMPLICIT_USINGS_PROFILE");
        Assert.Contains(result.Warnings, w => w.Code == "UNRESOLVED_HTTP_TARGET");
    }

    [Fact]
    public async Task InputDigestDetectsChangedSourceAndCanBeReusedForVerification()
    {
        Write("A.cs", "class A {}");
        var result = await Analyze(); Assert.Equal(64, result.InputDigest!.Length);
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }));
        var request = new DotnetAnalysisRequest("project", "snapshot", _root, "job", ExpectedInputDigest: result.InputDigest);
        Assert.Equal(result.InputDigest, (await analyzer.AnalyzeAsync(request, CancellationToken.None)).InputDigest);
        Write("A.cs", "class Changed {}");
        await Assert.ThrowsAsync<SourceInputException>(() => analyzer.AnalyzeAsync(request, CancellationToken.None));
    }

    [Fact]
    public async Task NonconstantRoutesAreNotInvented()
    {
        Write("Program.cs", "var app = builder.Build(); var api = app.MapGroup(GetSecret()); api.MapGet(\"/orders\", () => 1);");
        var result = await Analyze();
        Assert.DoesNotContain(result.Findings, f => f.Kind == "MinimalApiEndpointCandidate");
        Assert.Contains(result.Warnings, w => w.Code == "UNRESOLVED_ASPNET_PATTERN");
    }
    [Theory]
    [InlineData("http://localhost:5001", "localhost:5001")]
    [InlineData("http://localhost:5002", "localhost:5002")]
    [InlineData("http://PAYMENTS", "payments:80")]
    [InlineData("https://payments", "payments:443")]
    [InlineData("https://payments:443", "payments:443")]
    [InlineData("https://payments:8443", "payments:8443")]
    [InlineData("http://[::1]:5001", "[::1]:5001")]
    public async Task HttpDestinationsPreserveEffectivePortAcrossAllFindingSources(string endpoint, string expected)
    {
        var secretUrl = endpoint + "/private?token=SECRET_SENTINEL#SECRET_SENTINEL";
        Write("Client.cs", $$"""
            using System.Net.Http;
            using System.Threading.Tasks;
            class Client { public async Task Run(HttpClient http) { await http.GetAsync("{{secretUrl}}"); } }
            class Startup { public void Configure() { services.AddHttpClient<IClient, Client>(c => c.BaseAddress = new System.Uri("{{secretUrl}}")); } }
            """);
        Write("appsettings.json", System.Text.Json.JsonSerializer.Serialize(new { ServiceUrl = secretUrl }));
        var result = await Analyze();
        foreach (var kind in new[] { "OutgoingHttp", "OutgoingHttpCandidate", "HttpClientBaseAddressCandidate", "ConfiguredHttpHost" })
            Assert.Contains(result.Findings, f => f.Kind == kind && f.Target == expected);
        Assert.DoesNotContain("SECRET_SENTINEL", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task LocalServicesOnDifferentPortsRemainDistinct()
    {
        Write("appsettings.json", """{"FirstUrl":"http://localhost:5001","SecondUrl":"http://localhost:5002"}""");
        var hosts = (await Analyze()).Findings.Where(f => f.Kind == "ConfiguredHttpHost").Select(f => f.Target).ToArray();
        Assert.Equal(new[] { "localhost:5001", "localhost:5002" }, hosts);
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}

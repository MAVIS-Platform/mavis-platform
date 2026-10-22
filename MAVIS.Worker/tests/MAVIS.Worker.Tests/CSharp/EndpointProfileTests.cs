using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class EndpointProfileTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-endpoints-" + Guid.NewGuid().ToString("N"));
    private async Task<DotnetAnalysisResult> Analyze(string code)
    {
        Directory.CreateDirectory(_root); await File.WriteAllTextAsync(Path.Combine(_root, "App.csproj"), "<Project />");
        await File.WriteAllTextAsync(Path.Combine(_root, "Routes.cs"), code);
        return await new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }))
            .AnalyzeAsync(new("p", "s", _root, "j"), CancellationToken.None);
    }

    [Fact]
    public async Task ControllerMethodRouteNamedPropertiesAndNonActionsHaveExactLocators()
    {
        var result = await Analyze("""
            namespace Api;
            [ApiController, Route("api/[controller]")]
            class OrdersController {
                [HttpGet(Name="list"), Route("lookup/{id?}")]
                public void Lookup() {}
                [HttpPost("~/create")]
                public void Create() {}
                [NonAction, HttpDelete("hidden")] public void Hidden() {}
                [HttpGet("private")] private void Private() {}
            }
            """);
        var endpoints = result.Findings.Where(f => f.Kind == "ApiEndpointCandidate").ToArray();
        Assert.Equal(2, endpoints.Length);
        var lookup = Assert.Single(endpoints.Where(f => f.HttpMethod == "GET"));
        Assert.Equal("/api/Orders/lookup/{id?}", lookup.Target);
        Assert.Equal(4, lookup.Evidence.StartLine); Assert.NotNull(lookup.Evidence.StartColumn);
        Assert.Contains(endpoints, f => f.Target == "/create" && f.Evidence.StartLine == 6);
    }

    [Fact]
    public async Task MinimalMapMethodsGroupsAndUnsupportedPatternsAreExplicit()
    {
        var result = await Analyze("""
            var app = builder.Build();
            var group = app.MapGroup("/api");
            group.MapMethods("/items", new[] { "GET", "POST" }, () => 1);
            group.MapGet(GetRoute(), () => 1);
            app.MapFallback(() => 1);
            class Other { public void MapGet(string x, System.Func<int> y) {} public void Run() { this.MapGet("/fake", () => 1); } }
            """);
        var endpoints = result.Findings.Where(f => f.Kind == "MinimalApiEndpointCandidate").ToArray();
        Assert.Equal(new[] { "GET", "POST" }, endpoints.Select(f => f.HttpMethod).Order().ToArray());
        Assert.All(endpoints, e => { Assert.Equal("/api/items", e.Target); Assert.Equal(3, e.Evidence.StartLine); });
        Assert.True(result.Warnings.Count(w => w.Code == "UNRESOLVED_ASPNET_PATTERN") >= 3);
    }

    [Fact]
    public async Task EnumDelegateRecordAndInterfaceInheritanceStayStructural()
    {
        var result = await Analyze("namespace Demo; enum State { Ready } delegate void Handler(); record Item(int Id); interface IBase {} interface IChild : IBase {}");
        Assert.Contains(result.Findings, f => f.Kind == "Enum" && f.Subject == "Demo.State");
        Assert.Contains(result.Findings, f => f.Kind == "Delegate" && f.Subject == "Demo.Handler");
        Assert.Contains(result.Findings, f => f.Kind == "Type" && f.Target == "Item");
        Assert.Contains(result.Findings, f => f.Kind == "Inherits" && f.Subject == "Demo.IChild" && f.Target == "Demo.IBase");
        Assert.DoesNotContain(result.Findings, f => f.Kind == "OutgoingHttp");
    }

    [Fact]
    public async Task UnknownRouteTokenAndConventionalRoutingDoNotInventEndpoints()
    {
        var result = await Analyze("[ApiController, Route(\"[tenant]/[controller]\")] class AController { [HttpGet] public void Get() {} } class BController { [HttpGet] public void Get() {} }");
        Assert.DoesNotContain(result.Findings, f => f.Kind == "ApiEndpointCandidate");
        Assert.Contains(result.Warnings, w => w.Code == "UNRESOLVED_ASPNET_PATTERN");
    }
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}

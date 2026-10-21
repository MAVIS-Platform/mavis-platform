using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.Integration;

public sealed class StandaloneDotnetAnalysisTests : IDisposable
{
    private readonly string _artifactRoot = Path.Combine(Path.GetTempPath(), "mavis-standalone-" + Guid.NewGuid().ToString("N"));
    private string _root => Path.Combine(_artifactRoot, ArtifactTestSupport.ArtifactId);

    public StandaloneDotnetAnalysisTests()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "Orders.csproj"), "<Project />");
        File.WriteAllText(Path.Combine(_root, "Client.cs"), """
            public class Client {
                public async System.Threading.Tasks.Task Run() {
                    await http.GetAsync("https://payments/api?token=SECRET_SENTINEL");
                }
            }
            """);
    }

    private WebApplicationFactory<Program> CreateFactory(bool allow = true) => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(ArtifactTestSupport.Configuration(allow ? _artifactRoot : _artifactRoot + "-other"))));

    private DotnetAnalysisRequest Request(string? source = null) => new("project-1", "snapshot-1", source ?? _root, "job-1");

    [Fact]
    public async Task SourceOnlyRequest_ReturnsSnapshotEvidenceAndExplicitCoverage()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        ArtifactTestSupport.Authenticate(client);
        var response = await client.PostAsJsonAsync("/api/v1/dotnet/analyze", await ScopedRequest());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("SECRET_SENTINEL", json);
        Assert.DoesNotContain(_root.Replace("\\", "\\\\"), json);
        using var doc = JsonDocument.Parse(json);
        Assert.Equal("snapshot-1", doc.RootElement.GetProperty("sourceSnapshotId").GetString());
        var result = await response.Content.ReadFromJsonAsync<DotnetAnalysisResult>();
        Assert.NotNull(result);
        Assert.Equal("PartialSyntax", result.Coverage.Mode);
        Assert.Equal("dotnet-static/1.8", result.AnalyzerVersion);
        Assert.Equal(1, result.Coverage.AnalyzedFiles);
        Assert.Contains(result.Findings, f => f.Kind == "Type" && f.Target == "Client");
        Assert.DoesNotContain(result.Findings, f => f.Kind == "OutgoingHttpCandidate");
        Assert.Contains(result.Warnings, w => w.Code == "SYNTAX_ONLY");
        Assert.Contains(result.Warnings, w => w.Code == "UNRESOLVED_HTTP_RECEIVER");
    }

    [Fact]
    public async Task SourceOutsideConfiguredRoot_IsRejected()
    {
        using var factory = CreateFactory(false);
        using var client = factory.CreateClient();
        ArtifactTestSupport.Authenticate(client);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync("/api/v1/dotnet/analyze", await ScopedRequest())).StatusCode);
    }

    [Theory]
    [InlineData("2.0", "job-1")]
    [InlineData("1.0", "")]
    public async Task InvalidContract_IsRejected(string version, string job)
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        ArtifactTestSupport.Authenticate(client);
        var response = await client.PostAsJsonAsync("/api/v1/dotnet/analyze", (await ScopedRequest(job)) with { SchemaVersion = version });
        Assert.Equal(job.Length == 0 ? HttpStatusCode.Forbidden : HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ByteLimit_IsEnforced()
    {
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions
            { AllowedSourceRoots = [_root], MaxFileBytes = 10 }));
        await Assert.ThrowsAsync<SourceInputException>(() => analyzer.AnalyzeAsync(Request(), CancellationToken.None));
    }

    [Fact]
    public async Task Cancellation_Propagates()
    {
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => analyzer.AnalyzeAsync(Request(), new CancellationToken(true)));
    }

    [Fact]
    public async Task BuildOutput_IsExcludedAndSyntaxErrorsRemainVisible()
    {
        Directory.CreateDirectory(Path.Combine(_root, "obj"));
        File.WriteAllText(Path.Combine(_root, "obj", "Generated.cs"), "class Generated {}");
        File.WriteAllText(Path.Combine(_root, "Broken.cs"), "class Broken {");
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }));
        var result = await analyzer.AnalyzeAsync(Request(), CancellationToken.None);
        Assert.Equal(2, result.Coverage.DiscoveredFiles);
        Assert.DoesNotContain(result.Findings, f => f.Target == "Generated");
        Assert.Contains(result.Warnings, w => w.Code == "SYNTAX_ERRORS" && w.FilePath == "Broken.cs");
    }

    [Fact]
    public async Task RootPrefixSibling_IsRejected()
    {
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }));
        await Assert.ThrowsAsync<SourceInputException>(() => analyzer.AnalyzeAsync(Request(_root + "-sibling"), CancellationToken.None));
    }

    private async Task<ScopedDotnetRequest> ScopedRequest(string job = "job-1")
    {
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }));
        var digest = (await analyzer.AnalyzeAsync(Request(), CancellationToken.None)).InputDigest!;
        return ArtifactTestSupport.Sign(new("1.0", "mavis-worker-analysis", "project-1", "snapshot-1", job,
            "attempt-1", ArtifactTestSupport.ArtifactId, digest, DateTimeOffset.UtcNow.AddMinutes(2)));
    }
    public void Dispose()
    {
        // Only remove this test's unique, explicitly created directory.
        Directory.Delete(_artifactRoot, recursive: true);
    }
}

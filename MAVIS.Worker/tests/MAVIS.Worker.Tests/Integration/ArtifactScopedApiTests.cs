using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;

namespace MAVIS.Worker.Tests.Integration;

public sealed class ArtifactScopedApiTests : IAsyncLifetime
{
    private sealed class FaultedAnalyzer : IDotnetProjectAnalyzer
    {
        public Task<DotnetAnalysisResult> AnalyzeAsync(DotnetAnalysisRequest request, CancellationToken ct) =>
            Task.FromException<DotnetAnalysisResult>(new InvalidOperationException("SECRET_SENTINEL private/path"));
    }
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-artifact-" + Guid.NewGuid().ToString("N"));
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private ArtifactGrantClaims _claims = null!;

    public async Task InitializeAsync()
    {
        var source = Path.Combine(_root, ArtifactTestSupport.ArtifactId);
        Directory.CreateDirectory(source);
        await File.WriteAllTextAsync(Path.Combine(source, "App.csproj"), "<Project />");
        await File.WriteAllTextAsync(Path.Combine(source, "App.cs"), "class App {}");
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [source] }));
        var digest = (await analyzer.AnalyzeAsync(new("p", "s", source, "j"), CancellationToken.None)).InputDigest!;
        _claims = new("1.0", "mavis-worker-analysis", "p", "s", "j", "a1", ArtifactTestSupport.ArtifactId, digest, DateTimeOffset.UtcNow.AddMinutes(2));
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) =>
            c.AddInMemoryCollection(ArtifactTestSupport.Configuration(_root))));
        _client = _factory.CreateClient();
        ArtifactTestSupport.Authenticate(_client);
    }

    private async Task Error(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var text = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(text);
        Assert.Equal(code, document.RootElement.GetProperty("code").GetString());
        Assert.False(string.IsNullOrWhiteSpace(document.RootElement.GetProperty("traceId").GetString()));
        Assert.DoesNotContain(_root.Replace("\\", "\\\\"), text);
        Assert.DoesNotContain(ArtifactTestSupport.Key, text);
    }

    [Fact]
    public async Task ValidGrantEchoesAttemptAndSnapshotWithoutLeakingCapabilityOrPaths()
    {
        var request = ArtifactTestSupport.Sign(_claims);
        var response = await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<DotnetAnalysisResult>())!;
        Assert.Equal((_claims.JobId, _claims.AttemptId, _claims.ProjectId, _claims.SourceSnapshotId, _claims.ExpectedInputDigest),
            (result.JobId, result.AttemptId, result.ProjectId, result.SourceSnapshotId, result.InputDigest));
        Assert.DoesNotContain(request.ArtifactGrant, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnauthenticatedAndTamperedCapabilitiesAreDenied()
    {
        _client.DefaultRequestHeaders.Clear();
        await Error(await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", ArtifactTestSupport.Sign(_claims)), HttpStatusCode.Unauthorized, "SERVICE_AUTH_REQUIRED");
        ArtifactTestSupport.Authenticate(_client);
        var signed = ArtifactTestSupport.Sign(_claims);
        var pieces = signed.ArtifactGrant.Split('.');
        pieces[1] = Convert.ToBase64String(Encoding.UTF8.GetBytes("{}" )).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        await Error(await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", signed with { ArtifactGrant = string.Join('.', pieces) }), HttpStatusCode.Forbidden, "ARTIFACT_SCOPE_DENIED");
    }

    [Theory]
    [InlineData("path")]
    [InlineData("audience")]
    [InlineData("attempt")]
    [InlineData("future")]
    [InlineData("digest")]
    public async Task InvalidSignedScopeIsDenied(string kind)
    {
        var claims = kind switch
        {
            "path" => _claims with { ArtifactId = "../outside" },
            "audience" => _claims with { Audience = "mavis-runtime" },
            "attempt" => _claims with { AttemptId = "" },
            "future" => _claims with { DeadlineUtc = DateTimeOffset.UtcNow.AddHours(1) },
            _ => _claims with { ExpectedInputDigest = "not-a-digest" }
        };
        await Error(await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", ArtifactTestSupport.Sign(claims)), HttpStatusCode.Forbidden, "ARTIFACT_SCOPE_DENIED");
    }

    [Fact]
    public async Task ExpiredGrantAndChangedArtifactHaveDifferentErrors()
    {
        await Error(await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", ArtifactTestSupport.Sign(_claims with { DeadlineUtc = DateTimeOffset.UtcNow.AddSeconds(-1) })),
            HttpStatusCode.RequestTimeout, "DEADLINE_EXCEEDED");
        await File.WriteAllTextAsync(Path.Combine(_root, ArtifactTestSupport.ArtifactId, "App.cs"), "class Changed {}");
        await Error(await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", ArtifactTestSupport.Sign(_claims)), HttpStatusCode.BadRequest, "INVALID_REQUEST");
    }

    [Fact]
    public async Task RawPathsAndUnknownRequestFieldsAreRejected()
    {
        await Error(await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", new { schemaVersion = "1.0", sourceLocation = _root }),
            HttpStatusCode.BadRequest, "INVALID_REQUEST");
        var signed = ArtifactTestSupport.Sign(_claims);
        await Error(await _client.PostAsJsonAsync("/api/v1/dotnet/analyze", new { signed.SchemaVersion, signed.ArtifactGrant, sourceLocation = _root }),
            HttpStatusCode.BadRequest, "INVALID_REQUEST");
    }

    [Fact]
    public async Task UnmatchedVersionedRoutesStillReturnErrorEnvelope() =>
        await Error(await _client.GetAsync("/api/v1/not-a-route"), HttpStatusCode.NotFound, "NOT_FOUND");

    [Fact]
    public async Task UnexpectedExceptionIsSanitizedBeforeGlobalHandler()
    {
        using var factory = _factory.WithWebHostBuilder(b => b.ConfigureServices(s => s.AddSingleton<IDotnetProjectAnalyzer, FaultedAnalyzer>()));
        using var client = factory.CreateClient(); ArtifactTestSupport.Authenticate(client);
        var response = await client.PostAsJsonAsync("/api/v1/dotnet/analyze", ArtifactTestSupport.Sign(_claims));
        await Error(response, HttpStatusCode.InternalServerError, "WORKER_FAILURE");
        Assert.DoesNotContain("SECRET_SENTINEL", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task JobAttemptsAreIndependentAndWrongAttemptCannotCancelAnother()
    {
        var first = await _client.PostAsJsonAsync("/api/v1/dotnet/jobs", ArtifactTestSupport.Sign(_claims));
        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.Contains("attemptId=a1", first.Headers.Location!.ToString());
        Assert.Equal(HttpStatusCode.Accepted, (await _client.PostAsJsonAsync("/api/v1/dotnet/jobs", ArtifactTestSupport.Sign(_claims with { AttemptId = "a2" }))).StatusCode);
        await Error(await _client.PostAsync("/api/v1/dotnet/jobs/j/cancel?attemptId=missing", null), HttpStatusCode.NotFound, "NOT_FOUND");
        var state = (await _client.GetFromJsonAsync<DotnetJobView>("/api/v1/dotnet/jobs/j?attemptId=a1"))!;
        Assert.Equal("a1", state.AttemptId);
        Assert.Equal(HttpStatusCode.OK, (await _client.PostAsync("/api/v1/dotnet/jobs/j/cancel?attemptId=a2", null)).StatusCode);
    }

    [Fact]
    public async Task LivenessAndReadinessExposeNoSecrets()
    {
        _client.DefaultRequestHeaders.Clear();
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/api/health")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/api/health/ready")).StatusCode);
        Directory.Delete(Path.Combine(_root, ArtifactTestSupport.ArtifactId), true);
        Directory.Delete(_root);
        await Error(await _client.GetAsync("/api/health/ready"), HttpStatusCode.ServiceUnavailable, "WORKER_NOT_READY");
    }

    public Task DisposeAsync()
    {
        _client.Dispose(); _factory.Dispose();
        if (Directory.Exists(_root)) Directory.Delete(_root, true);
        return Task.CompletedTask;
    }
}

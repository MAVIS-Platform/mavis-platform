using System.Net;
using System.Net.Http.Json;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Impact;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;

namespace MAVIS.Worker.Tests.Integration;

public sealed class IndependentEndpointTests
{
    [Fact]
    public async Task ProductionDisablesLegacyAndDoesNotTrustForwardedLoopbackHeader()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.UseEnvironment("Production"));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/jobs/missing")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "127.0.0.1");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/dotnet/jobs/missing")).StatusCode);
    }

    [Fact]
    public async Task ConfiguredServiceKeyProtectsNewEndpoints()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) =>
            c.AddInMemoryCollection(new Dictionary<string, string?> { ["WorkerAccess:ApiKey"] = "test-service-key" })));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/health")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/dotnet/jobs/missing")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/jobs/missing")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Mavis-Worker-Key", "wrong-key");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/dotnet/jobs/missing")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Mavis-Worker-Key");
        client.DefaultRequestHeaders.Add("X-Mavis-Worker-Key", "test-service-key");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/dotnet/jobs/missing")).StatusCode);
    }

    [Fact]
    public async Task SourceOnlyJobHasResultAndIdempotentSubmission()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-job-api-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            File.WriteAllText(Path.Combine(root, "App.csproj"), "<Project />");
            File.WriteAllText(Path.Combine(root, "App.cs"), "class App {}");
            using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) =>
                c.AddInMemoryCollection(new Dictionary<string, string?> { ["DotnetAnalysis:AllowedSourceRoots:0"] = root })));
            using var client = factory.CreateClient();
            var request = new DotnetAnalysisRequest("p", "s", root, "job-api");
            Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/dotnet/jobs", request)).StatusCode);
            Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/dotnet/jobs", request)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/dotnet/jobs", request with { SourceSnapshotId = "other" })).StatusCode);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            DotnetJobView? job;
            do { await Task.Delay(20, timeout.Token); job = await client.GetFromJsonAsync<DotnetJobView>("/api/v1/dotnet/jobs/job-api", timeout.Token); }
            while (job?.CompletedAt is null);
            Assert.Equal("Completed", job.Status); Assert.NotNull(job.Result); Assert.True(job.Ephemeral);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/dotnet/jobs/job-api/cancel", null)).StatusCode);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public async Task ImpactEndpointAcceptsVersionedGraphAndRejectsMismatches()
    {
        using var factory = new WebApplicationFactory<Program>(); using var client = factory.CreateClient();
        var request = new VersionedImpactRequest("m", "m", "g", true, "B", ["A", "B"],
            [new("edge", "A", "B", "HttpRestCall", ["evidence"])]);
        var response = await client.PostAsJsonAsync("/api/v1/impact", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("A", Assert.Single((await response.Content.ReadFromJsonAsync<VersionedImpactResult>())!.AffectedServices).ServiceId);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/impact", request with { GraphReady = false })).StatusCode);
    }
}

using Microsoft.Extensions.Configuration;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Application.Jobs;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace MAVIS.Worker.Tests.Integration;

/// <summary>
/// End-to-end test: submit job → worker xử lý → query result.
/// </summary>
public class EndToEndAnalysisTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public EndToEndAnalysisTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["WorkerAccess:EnableLegacyAnalysis"] = "true" })));
    }

    [Fact]
    public async Task SubmitJob_WaitForProcessing_GetResult_ReturnsAnalysisOutput()
    {
        var client = _factory.CreateClient();

        // 1️⃣ Submit job
        var request = new AnalysisRequest
        {
            ProjectId = "proj-e2e-001",
            ProjectName = "E2E Test Project",
            RawFindings =
            [
                new RawFindingDto
                {
                    Language = "Java",
                    ServiceId = "api",
                    Kind = "HTTP_REST_CALL",
                    Target = "database",
                    HttpMethod = "GET",
                    Url = "/orders",
                    FilePath = "OrderController.java",
                    StartLine = 10,
                    Snippet = "SELECT * FROM orders"
                }
            ]
        };

        var submitResponse = await client.PostAsJsonAsync("/api/jobs/submit", request);
        Assert.Equal(HttpStatusCode.Accepted, submitResponse.StatusCode);

        var submitResult = await submitResponse.Content.ReadFromJsonAsync<JsonElement>();
        var jobId = submitResult.GetProperty("jobId").GetString();
        Assert.NotNull(jobId);

        // 2️⃣ Poll status until completed (max 10s)
        JobStatusView? status = null;
        for (var i = 0; i < 20; i++)
        {
            await Task.Delay(500);

            var statusResponse = await client.GetAsync($"/api/jobs/{jobId}");
            Assert.Equal(HttpStatusCode.OK, statusResponse.StatusCode);

            status = await statusResponse.Content.ReadFromJsonAsync<JobStatusView>();
            Assert.NotNull(status);

            if (status.Status is "Completed" or "Failed")
            {
                break;
            }
        }

        // 3️⃣ Verify completed with result
        Assert.NotNull(status);
        Assert.Equal("Completed", status.Status);
        Assert.NotNull(status.ResultJson);
        Assert.Null(status.Error);

        // 4️⃣ Deserialize result and check structure
        // Note: System.Text.Json default (no naming policy) preserves .NET PascalCase property names.
        var result = JsonSerializer.Deserialize<JsonElement>(status.ResultJson);
        Assert.True(result.TryGetProperty("Manifest", out var manifest));
        Assert.True(manifest.TryGetProperty("Services", out var services));
        Assert.True(manifest.TryGetProperty("Dependencies", out var dependencies));

        // Should have api + database
        Assert.True(services.GetArrayLength() >= 2);
        Assert.True(dependencies.GetArrayLength() >= 1);
    }

    [Fact]
    public async Task SubmitJob_InvalidProjectId_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var request = new AnalysisRequest
        {
            ProjectId = "",
            RawFindings = []
        };

        var response = await client.PostAsJsonAsync("/api/jobs/submit", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetJobStatus_NonExistentJob_ReturnsNotFound()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/jobs/non-existent-id");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}

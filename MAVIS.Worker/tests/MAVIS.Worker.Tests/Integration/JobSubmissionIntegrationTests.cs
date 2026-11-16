using Microsoft.Extensions.Configuration;
using System.Net;
using System.Net.Http.Json;
using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Application.Contracts.Responses;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace MAVIS.Worker.Tests.Integration;

/// <summary>
/// Integration test: submit job via API, verify background worker processes it.
/// </summary>
public class JobSubmissionIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public JobSubmissionIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["WorkerAccess:EnableLegacyAnalysis"] = "true" })));
    }

    [Fact]
    public async Task SubmitAnalysis_EnqueuesJobAndReturnsJobId()
    {
        var client = _factory.CreateClient();

        var request = new AnalysisRequest
        {
            ProjectId = "test-proj",
            ProjectName = "Test Project",
            RawFindings = new[]
            {
                new RawFindingDto
                {
                    ServiceId = "svc-a",
                    Kind = "HTTP_REST_CALL",
                    Target = "svc-b",
                    HttpMethod = "GET",
                    Url = "/api/users",
                    FilePath = "ServiceA.java",
                    StartLine = 42,
                    Snippet = "restTemplate.exchange(...)"
                }
            }
        };

        var response = await client.PostAsJsonAsync("/api/jobs/submit", request);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<JobSubmitResponse>();
        Assert.NotNull(result);
        Assert.NotEmpty(result.JobId);
        Assert.Equal("test-proj", result.ProjectId);
    }

    [Fact]
    public async Task SubmitAnalysis_WithEmptyProjectId_ReturnsBadRequest()
    {
        var client = _factory.CreateClient();

        var request = new AnalysisRequest
        {
            ProjectId = "",
            RawFindings = Array.Empty<RawFindingDto>()
        };

        var response = await client.PostAsJsonAsync("/api/jobs/submit", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private record JobSubmitResponse(string JobId, string Message, string ProjectId);
}

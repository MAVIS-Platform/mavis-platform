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
/// End-to-end test mô phỏng luồng thật: Java gửi findings (generic + java) kèm SourceLocation
/// trỏ vào 1 project C# thật trên đĩa. Worker phải tự chạy Roslyn scan thêm rồi merge lại,
/// build ra graph đầy đủ. Cũng test trường hợp không có Java findings (RawFindings rỗng) mà
/// chỉ có source C# -> Worker vẫn tự scan và vẽ graph được (chạy độc lập).
/// </summary>
public class CSharpScanEndToEndTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _tempDir;

    public CSharpScanEndToEndTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["WorkerAccess:EnableLegacyAnalysis"] = "true" })));
        _tempDir = Path.Combine(Path.GetTempPath(), "mavis-e2e-" + Guid.NewGuid());
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    /// <summary>
    /// Tạo 1 "project" C# giả: OrderService gọi PaymentService qua HttpClient.
    /// </summary>
    private void CreateSampleCSharpProject()
    {
        var orderServiceDir = Path.Combine(_tempDir, "OrderService");
        Directory.CreateDirectory(orderServiceDir);

        File.WriteAllText(
            Path.Combine(orderServiceDir, "OrderService.csproj"),
            "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>");

        File.WriteAllText(
            Path.Combine(orderServiceDir, "PaymentClient.cs"),
            """
            using System.Net.Http;
            using System.Threading.Tasks;

            namespace OrderService
            {
                public class PaymentClient
                {
                    private readonly HttpClient _httpClient;

                    public PaymentClient(HttpClient httpClient)
                    {
                        _httpClient = httpClient;
                    }

                    public async Task ChargeAsync()
                    {
                        await _httpClient.PostAsync("http://payment-service/api/charges", null);
                    }
                }
            }
            """);
    }

    [Fact]
    public async Task SubmitJob_OnlyCSharpSource_NoJavaFindings_StillBuildsGraph()
    {
        CreateSampleCSharpProject();

        var client = _factory.CreateClient();

        var request = new AnalysisRequest
        {
            ProjectId = "proj-csharp-only",
            ProjectName = "CSharp Only Project",
            SourceLocation = _tempDir,
            RawFindings = [], // Java không gửi findings gì (giả lập project chỉ có C#)
            ComputeImpact = false
        };

        var submitResponse = await client.PostAsJsonAsync("/api/jobs/submit", request);
        Assert.Equal(HttpStatusCode.Accepted, submitResponse.StatusCode);

        var submitResult = await submitResponse.Content.ReadFromJsonAsync<JsonElement>();
        var jobId = submitResult.GetProperty("jobId").GetString();
        Assert.NotNull(jobId);

        var status = await PollUntilCompletedAsync(client, jobId!);

        Assert.Equal("Completed", status.Status);
        Assert.NotNull(status.ResultJson);

        var result = JsonSerializer.Deserialize<JsonElement>(status.ResultJson!);
        var manifest = result.GetProperty("Manifest");
        var services = manifest.GetProperty("Services");
        var dependencies = manifest.GetProperty("Dependencies");

        // Roslyn phải tự tìm ra OrderService -> payment-service (HTTP call)
        Assert.True(services.GetArrayLength() >= 1);
        Assert.True(dependencies.GetArrayLength() >= 1);
    }

    [Fact]
    public async Task SubmitJob_JavaFindingsPlusCSharpSource_MergesBothIntoGraph()
    {
        CreateSampleCSharpProject();

        var client = _factory.CreateClient();

        var request = new AnalysisRequest
        {
            ProjectId = "proj-merged",
            ProjectName = "Merged Project",
            SourceLocation = _tempDir,
            RawFindings =
            [
                new RawFindingDto
                {
                    Language = "java",
                    ServiceId = "PaymentService",
                    Kind = "HTTP_REST_CALL",
                    Target = "NotificationService",
                    HttpMethod = "POST",
                    Url = "/notify",
                    FilePath = "PaymentController.java",
                    StartLine = 15,
                    Snippet = "callNotificationService()"
                }
            ],
            ComputeImpact = false
        };

        var submitResponse = await client.PostAsJsonAsync("/api/jobs/submit", request);
        Assert.Equal(HttpStatusCode.Accepted, submitResponse.StatusCode);

        var submitResult = await submitResponse.Content.ReadFromJsonAsync<JsonElement>();
        var jobId = submitResult.GetProperty("jobId").GetString();
        Assert.NotNull(jobId);

        var status = await PollUntilCompletedAsync(client, jobId!);

        Assert.Equal("Completed", status.Status);
        var result = JsonSerializer.Deserialize<JsonElement>(status.ResultJson!);
        var manifest = result.GetProperty("Manifest");
        var services = manifest.GetProperty("Services");
        var dependencies = manifest.GetProperty("Dependencies");

        // Phải có cả service từ Java finding (PaymentService, NotificationService)
        // và service từ Roslyn scan (OrderService, payment-service)
        Assert.True(services.GetArrayLength() >= 3);
        Assert.True(dependencies.GetArrayLength() >= 2);
    }

    private static async Task<JobStatusView> PollUntilCompletedAsync(HttpClient client, string jobId)
    {
        JobStatusView? status = null;
        for (var i = 0; i < 20; i++)
        {
            await Task.Delay(500);

            var statusResponse = await client.GetAsync($"/api/jobs/{jobId}");
            Assert.Equal(HttpStatusCode.OK, statusResponse.StatusCode);

            status = await statusResponse.Content.ReadFromJsonAsync<JobStatusView>();
            Assert.NotNull(status);

            if (status!.Status is "Completed" or "Failed")
            {
                break;
            }
        }

        Assert.NotNull(status);
        return status!;
    }
}

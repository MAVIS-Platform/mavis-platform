using MAVIS.Worker.Application.Analysis;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/v1/dotnet/analyze")]
public sealed class DotnetAnalysisController(IDotnetProjectAnalyzer analyzer) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Analyze(DotnetAnalysisRequest request, CancellationToken ct)
    {
        if (request.SchemaVersion != "1.0" || string.IsNullOrWhiteSpace(request.ProjectId) ||
            string.IsNullOrWhiteSpace(request.SourceSnapshotId) || string.IsNullOrWhiteSpace(request.JobId) ||
            string.IsNullOrWhiteSpace(request.SourceLocation))
            return Problem(statusCode: 400, title: "Invalid analysis request",
                detail: "schemaVersion 1.0, projectId, sourceSnapshotId, jobId and sourceLocation are required.");
        try
        {
            return Ok(await analyzer.AnalyzeAsync(request, ct));
        }
        catch (SourceInputException ex)
        {
            return Problem(statusCode: 400, title: "Invalid source input", detail: ex.Message);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem(statusCode: 408, title: "Analysis deadline exceeded");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return Problem(statusCode: 400, title: "Source cannot be read",
                detail: "Check source availability, permissions and path format.");
        }
    }
}

using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Contracts.Requests;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/analysis")]
public sealed class AnalysisController : ControllerBase
{
    private readonly IAnalysisOrchestrator _orchestrator;

    public AnalysisController(IAnalysisOrchestrator orchestrator)
    {
        _orchestrator = orchestrator;
    }

    /// <summary>
    /// Endpoint Spring Boot (Java) sẽ gọi sau khi generic scan xong.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Analyze(
        [FromBody] AnalysisRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ProjectId))
            return BadRequest(new { error = "projectId is required" });

        var result = await _orchestrator.RunAsync(request, ct);
        return Ok(result);
    }
}

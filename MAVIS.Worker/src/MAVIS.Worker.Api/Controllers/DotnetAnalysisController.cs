using MAVIS.Worker.Application.Analysis;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/v1/dotnet/analyze")]
public sealed class DotnetAnalysisController(IDotnetProjectAnalyzer analyzer, IArtifactScopeResolver artifacts) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Analyze(ScopedDotnetRequest request, CancellationToken ct)
    {
        if (!artifacts.IsReady) return StatusCode(503);
        return Ok(await analyzer.AnalyzeAsync(artifacts.Resolve(request), ct));
    }
}
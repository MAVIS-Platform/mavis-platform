using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Impact;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/v1/impact")]
public sealed class VersionedImpactController(IVersionedImpactAnalyzer analyzer) : ControllerBase
{
    [HttpPost]
    public IActionResult Analyze(VersionedImpactRequest request)
    {
        try { return Ok(analyzer.Analyze(request)); }
        catch (SourceInputException ex) { return Problem(statusCode: 400, title: "Invalid impact graph", detail: ex.Message); }
    }
}

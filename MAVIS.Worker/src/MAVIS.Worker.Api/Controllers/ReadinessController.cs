using MAVIS.Worker.Application.Analysis;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/health/ready")]
public sealed class ReadinessController(IArtifactScopeResolver artifacts, IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => artifacts.IsReady && !string.IsNullOrWhiteSpace(configuration["WorkerAccess:ApiKey"])
        ? Ok(new { status = "Ready", service = "MAVIS.Worker", contractVersion = "1.0" }) : StatusCode(503);
}

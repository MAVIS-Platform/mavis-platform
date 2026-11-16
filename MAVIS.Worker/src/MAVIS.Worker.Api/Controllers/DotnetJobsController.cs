using MAVIS.Worker.Application.Analysis;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/v1/dotnet/jobs")]
public sealed class DotnetJobsController(IDotnetAnalysisJobs jobs, IArtifactScopeResolver artifacts) : ControllerBase
{
    [HttpPost]
    public IActionResult Submit(ScopedDotnetRequest request)
    {
        if (!artifacts.IsReady) return StatusCode(503);
        var job = jobs.Submit(artifacts.Resolve(request));
        return AcceptedAtAction(nameof(Get), new { jobId = job.JobId, attemptId = job.AttemptId }, job);
    }

    [HttpGet("{jobId}")]
    public IActionResult Get(string jobId, [FromQuery] string attemptId) =>
        jobs.Get(jobId, attemptId) is { } job ? Ok(job) : NotFound();

    [HttpPost("{jobId}/cancel")]
    public IActionResult Cancel(string jobId, [FromQuery] string attemptId) =>
        jobs.Cancel(jobId, attemptId) is { } job ? Ok(job) : NotFound();
}
using MAVIS.Worker.Application.Analysis;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/v1/dotnet/jobs")]
public sealed class DotnetJobsController(IDotnetAnalysisJobs jobs) : ControllerBase
{
    [HttpPost]
    public IActionResult Submit(DotnetAnalysisRequest request)
    {
        try
        {
            var job = jobs.Submit(request);
            return AcceptedAtAction(nameof(Get), new { jobId = job.JobId }, job);
        }
        catch (SourceInputException ex) { return Problem(statusCode: 400, title: "Invalid analysis input", detail: ex.Message); }
        catch (JobConflictException ex) { return Problem(statusCode: 409, title: "Job input conflict", detail: ex.Message); }
        catch (JobCapacityException ex) { return Problem(statusCode: 429, title: "Analysis capacity exhausted", detail: ex.Message); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        { return Problem(statusCode: 400, title: "Source cannot be read"); }
    }

    [HttpGet("{jobId}")]
    public IActionResult Get(string jobId) => jobs.Get(jobId) is { } job ? Ok(job) : NotFound();

    [HttpPost("{jobId}/cancel")]
    public IActionResult Cancel(string jobId) => jobs.Cancel(jobId) is { } job ? Ok(job) : NotFound();
}

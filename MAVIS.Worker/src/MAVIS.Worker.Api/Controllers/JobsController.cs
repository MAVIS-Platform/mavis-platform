using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Application.Jobs;
using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JobsController : ControllerBase
{
    private readonly IJobQueue _jobQueue;
    private readonly ILogger<JobsController> _logger;

    public JobsController(IJobQueue jobQueue, ILogger<JobsController> logger)
    {
        _jobQueue = jobQueue;
        _logger = logger;
    }

    /// <summary>
    /// Submit an analysis request to the job queue (async processing).
    /// </summary>
    [HttpPost("submit")]
    public async Task<IActionResult> SubmitAnalysis([FromBody] AnalysisRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ProjectId))
        {
            return BadRequest(new { error = "ProjectId is required" });
        }

        var jobId = await _jobQueue.EnqueueAsync("AnalysisRequest", request, ct);

        _logger.LogInformation("Enqueued analysis job {JobId} for project {ProjectId}", jobId, request.ProjectId);

        return Accepted(new
        {
            jobId,
            message = "Analysis job submitted successfully",
            projectId = request.ProjectId
        });
    }

    /// <summary>
    /// Get job status and result (if completed).
    /// </summary>
    [HttpGet("{jobId}")]
    public async Task<IActionResult> GetJobStatus(string jobId, CancellationToken ct)
    {
        var status = await _jobQueue.GetStatusAsync(jobId, ct);

        if (status is null)
        {
            return NotFound(new { error = $"Job {jobId} not found" });
        }

        return Ok(status);
    }
}

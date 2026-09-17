using System.Text.Json;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Application.Jobs;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MAVIS.Worker.Infrastructure.Jobs;

/// <summary>
/// Background worker polling job queue và xử lý analysis jobs.
/// </summary>
public sealed class AnalysisBackgroundService : BackgroundService
{
    private readonly IJobQueue _jobQueue;
    private readonly IAnalysisOrchestrator _orchestrator;
    private readonly ILogger<AnalysisBackgroundService> _logger;

    public AnalysisBackgroundService(
        IJobQueue jobQueue,
        IAnalysisOrchestrator orchestrator,
        ILogger<AnalysisBackgroundService> logger)
    {
        _jobQueue = jobQueue;
        _orchestrator = orchestrator;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AnalysisBackgroundService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var job = await _jobQueue.DequeueAsync(stoppingToken);

                if (job is null)
                {
                    await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
                    continue;
                }

                _logger.LogInformation("Processing job {JobId} of type {JobType}", job.JobId, job.JobType);

                await ProcessJobAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error in background service loop");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }

        _logger.LogInformation("AnalysisBackgroundService stopped");
    }

    private async Task ProcessJobAsync(QueuedJob job, CancellationToken ct)
    {
        try
        {
            if (job.JobType == "AnalysisRequest")
            {
                var request = JsonSerializer.Deserialize<AnalysisRequest>(job.PayloadJson);
                if (request is null)
                {
                    await _jobQueue.CompleteAsync(job.JobId, success: false, error: "Null payload", ct);
                    return;
                }

                var result = await _orchestrator.RunAsync(request, ct);

                _logger.LogInformation(
                    "Analysis completed for project {ProjectId}: {ServiceCount} services, {EdgeCount} edges",
                    request.ProjectId,
                    result.Manifest.Services.Count,
                    result.Manifest.Dependencies.Count);

                await _jobQueue.CompleteAsync(job.JobId, success: true, error: null, ct);
            }
            else
            {
                _logger.LogWarning("Unknown job type {JobType}", job.JobType);
                await _jobQueue.CompleteAsync(job.JobId, success: false, error: "Unknown job type", ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job {JobId} failed", job.JobId);
            await _jobQueue.CompleteAsync(job.JobId, success: false, error: ex.Message, ct);
        }
    }
}

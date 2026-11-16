using System.Collections.Concurrent;
using System.Text.Json;
using MAVIS.Worker.Application.Jobs;

namespace MAVIS.Worker.Infrastructure.Jobs;

/// <summary>
/// In-memory job queue (thread-safe). Mất data khi restart, nhưng đủ cho MVP.
/// Sau này có thể swap sang Hangfire hoặc Redis-backed queue.
/// </summary>
public sealed class InMemoryJobQueue : IJobQueue
{
    private readonly ConcurrentQueue<QueuedJob> _queue = new();
    private readonly ConcurrentDictionary<string, JobRecord> _records = new();

    public Task<string> EnqueueAsync<TPayload>(string jobType, TPayload payload, CancellationToken ct = default)
        where TPayload : notnull
    {
        var jobId = Guid.NewGuid().ToString("N");
        var payloadJson = JsonSerializer.Serialize(payload);
        var now = DateTimeOffset.UtcNow;

        var job = new QueuedJob(jobId, jobType, payloadJson, now);
        _queue.Enqueue(job);

        _records[jobId] = new JobRecord
        {
            JobId = jobId,
            JobType = jobType,
            EnqueuedAt = now,
            Status = JobStatus.Queued
        };

        return Task.FromResult(jobId);
    }

    public Task<QueuedJob?> DequeueAsync(CancellationToken ct = default)
    {
        if (_queue.TryDequeue(out var job))
        {
            if (_records.TryGetValue(job.JobId, out var record))
            {
                record.Status = JobStatus.Processing;
                record.StartedAt = DateTimeOffset.UtcNow;
            }
            return Task.FromResult<QueuedJob?>(job);
        }

        return Task.FromResult<QueuedJob?>(null);
    }

    public Task CompleteAsync(string jobId, bool success, string? error = null, CancellationToken ct = default)
    {
        if (_records.TryGetValue(jobId, out var record))
        {
            record.Status = success ? JobStatus.Completed : JobStatus.Failed;
            record.CompletedAt = DateTimeOffset.UtcNow;
            record.Error = error;
        }

        return Task.CompletedTask;
    }

    public Task SetResultAsync(string jobId, string resultJson, CancellationToken ct = default)
    {
        if (_records.TryGetValue(jobId, out var record))
        {
            record.ResultJson = resultJson;
        }

        return Task.CompletedTask;
    }

    public Task<JobStatusView?> GetStatusAsync(string jobId, CancellationToken ct = default)
    {
        if (!_records.TryGetValue(jobId, out var record))
        {
            return Task.FromResult<JobStatusView?>(null);
        }

        var view = new JobStatusView(
            record.JobId,
            record.JobType,
            record.Status.ToString(),
            record.EnqueuedAt,
            record.StartedAt,
            record.CompletedAt,
            record.Error,
            record.ResultJson);

        return Task.FromResult<JobStatusView?>(view);
    }

    private sealed class JobRecord
    {
        public required string JobId { get; init; }
        public required string JobType { get; init; }
        public required DateTimeOffset EnqueuedAt { get; init; }
        public JobStatus Status { get; set; }
        public DateTimeOffset? StartedAt { get; set; }
        public DateTimeOffset? CompletedAt { get; set; }
        public string? Error { get; set; }
        public string? ResultJson { get; set; }
    }

    private enum JobStatus
    {
        Queued,
        Processing,
        Completed,
        Failed
    }
}

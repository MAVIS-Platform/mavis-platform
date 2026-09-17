namespace MAVIS.Worker.Application.Jobs;

/// <summary>
/// Queue cho background jobs. In-memory implementation trước, dễ migrate sang Hangfire/Quartz sau.
/// </summary>
public interface IJobQueue
{
    /// <summary>
    /// Enqueue một job mới. Trả về job ID.
    /// </summary>
    Task<string> EnqueueAsync<TPayload>(string jobType, TPayload payload, CancellationToken ct = default)
        where TPayload : notnull;

    /// <summary>
    /// Dequeue job tiếp theo (FIFO). Null nếu queue rỗng.
    /// </summary>
    Task<QueuedJob?> DequeueAsync(CancellationToken ct = default);

    /// <summary>
    /// Mark job completed (thành công hoặc failed).
    /// </summary>
    Task CompleteAsync(string jobId, bool success, string? error = null, CancellationToken ct = default);
}

/// <summary>
/// Job được lấy từ queue, đang được worker xử lý.
/// </summary>
public sealed record QueuedJob(
    string JobId,
    string JobType,
    string PayloadJson,
    DateTimeOffset EnqueuedAt);

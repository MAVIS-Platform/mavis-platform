using System.Text.Json;

namespace MAVIS.Runner;

public sealed record RuntimeLifecycleEvent(string SessionId, string ModelVersionId, string SourceSnapshotId,
    string ProfileVersionId, string RunConfigurationVersionId, string ScenarioVersionId,
    string ResourceProject, string Stage, int Sequence, DateTimeOffset OccurredAt);

public interface IRuntimeLifecycleObserver
{
    Task AcknowledgeAsync(RuntimeLifecycleEvent notification, CancellationToken ct);
}

/// <summary>Persist checkpoint before delivery; retries/reconciliation must use this same event.</summary>
public static class RuntimeLifecycleJournal
{
    public static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };

    public static string Record(string stateRoot, RuntimeLifecycleEvent notification)
    {
        _ = RuntimeAllocation.ProjectName(notification.ResourceProject);
        if (!Path.IsPathFullyQualified(stateRoot) || notification.Stage is not ("ALLOCATED" or "RUNNING"))
            throw new ArgumentException("Invalid lifecycle checkpoint.");
        var directory = Path.Combine(stateRoot, "events");
        RuntimeAllocation.RejectLinks(directory);
        Directory.CreateDirectory(directory);
        var target = Path.Combine(directory, notification.ResourceProject + "-" + notification.Stage.ToLowerInvariant() + ".json");
        RuntimeAllocation.RejectLinks(target);
        using var file = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough);
        JsonSerializer.Serialize(file, notification, Json);
        file.Flush(flushToDisk: true);
        return target;
    }
}

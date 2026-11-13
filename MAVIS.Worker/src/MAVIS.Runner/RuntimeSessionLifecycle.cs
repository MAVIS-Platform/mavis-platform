namespace MAVIS.Runner;

public sealed class RuntimeStageException(string code) : Exception(code) { public string Code { get; } = code; }

public interface IRuntimeSessionBackend
{
    string Stage => "Unknown";
    Task PrepareAndStartAsync(CancellationToken ct);
    Task WaitUntilReadyAsync(CancellationToken ct);
    Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct);
    IReadOnlyList<RuntimeInfrastructureActionResult> ObservedInfrastructureActions => [];
    Task<IReadOnlyList<RuntimeInfrastructureActionResult>> ExecuteInfrastructureActionsAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<RuntimeInfrastructureActionResult>>([]);
    Task<TraceCorrelationResult?> PreserveEvidenceAsync(CancellationToken ct);
    Task<bool> CleanupAsync(CancellationToken ct);
}

public sealed record RuntimeSessionOutcome(string ExecutionStatus, string ScenarioStatus, string EvidenceStatus,
    string CleanupStatus, HttpScenarioOutcome? Scenario, TraceCorrelationResult? Trace, IReadOnlyList<string> Diagnostics,
    string TraceQuality = "Unavailable", string MappingStatus = "Unavailable", string PersistenceStatus = "CallerOwned",
    IReadOnlyList<RuntimeInfrastructureActionResult>? InfrastructureActions = null);

/// <summary>One teardown path. Evidence failure must not skip cleanup, and accepted cancel is not claimed as complete prematurely.</summary>
public static class RuntimeSessionLifecycle
{
    public static async Task<RuntimeSessionOutcome> RunAsync(IRuntimeSessionBackend backend, int timeoutSeconds, CancellationToken ct = default)
    {
        if (timeoutSeconds is < 1 or > 300) throw new ArgumentException("Session deadline must be 1–300 seconds.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        var status = "Failed";
        var evidence = "Unavailable";
        var cleanup = "Incomplete";
        var diagnostics = new List<string>();
        HttpScenarioOutcome? scenario = null;
        TraceCorrelationResult? trace = null;
        IReadOnlyList<RuntimeInfrastructureActionResult> infrastructureActions = [];
        try
        {
            await backend.PrepareAndStartAsync(deadline.Token);
            await backend.WaitUntilReadyAsync(deadline.Token);
            scenario = await backend.ExecuteScenarioAsync(deadline.Token);
            infrastructureActions = await backend.ExecuteInfrastructureActionsAsync(deadline.Token);
            status = "Completed"; // Processing completion is separate from scenario pass/fail.
        }
        catch (OperationCanceledException) { status = ct.IsCancellationRequested ? "Cancelled" : "TimedOut"; }
        catch (RuntimeStageException ex) { diagnostics.Add(ex.Code); }
        catch (Exception ex) { diagnostics.Add("SESSION_EXECUTION_FAILED_AT_" + backend.Stage); diagnostics.Add(ex.GetType().Name); }
        finally
        {
            if (backend.ObservedInfrastructureActions.Count > 0)
                infrastructureActions = backend.ObservedInfrastructureActions.ToArray();
            // Fresh bounded cleanup tokens: an expired/cancelled run must still attempt evidence preservation and teardown.
            using var drain = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            try
            {
                trace = await backend.PreserveEvidenceAsync(drain.Token);
                evidence = trace is null ? "Unavailable" : trace.Spans.Count == 0 ? "Empty" : "Available";
            }
            catch (Exception) { evidence = "Failed"; diagnostics.Add("EVIDENCE_PRESERVATION_FAILED"); }
            using var teardown = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            try { cleanup = await backend.CleanupAsync(teardown.Token) ? "Confirmed" : "Incomplete"; }
            catch (Exception) { diagnostics.Add("CLEANUP_UNCONFIRMED_RECOVERY_REQUIRED"); }
        }
        var quality = trace is null ? "Unavailable" : trace.Spans.Count == 0 ? "Empty" :
            trace.Warnings.Any(w => w != "ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION") ? "Partial" : "CompleteForCapturedData";
        var mapping = trace is null || trace.Spans.Count == 0 ? "Unavailable" : trace.Spans.Any(s => s.ModelServiceId is null) ? "Partial" : "Mapped";
        return new(status, scenario?.Status ?? "NotRun", evidence, cleanup, scenario, trace, diagnostics, quality, mapping,
            InfrastructureActions: infrastructureActions);
    }
}

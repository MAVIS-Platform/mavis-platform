namespace MAVIS.Runner;

public sealed class RuntimeStageException(string code) : Exception(code) { public string Code { get; } = code; }

public interface IRuntimeSessionBackend
{
    string Stage => "Unknown";
    Task PrepareAndStartAsync(CancellationToken ct);
    Task WaitUntilReadyAsync(CancellationToken ct);
    Task<HttpScenarioOutcome> ExecuteScenarioAsync(CancellationToken ct);
    IReadOnlyList<RuntimeInfrastructureActionResult> ObservedInfrastructureActions => [];
    IReadOnlyList<string> FailureDiagnostics => [];
    Task<IReadOnlyList<RuntimeInfrastructureActionResult>> ExecuteInfrastructureActionsAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<RuntimeInfrastructureActionResult>>([]);
    /// <summary>Interactive Studio sessions observe the scenario again after student actions.</summary>
    bool InteractiveStudio => false;
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
    public const int DefaultInteractiveSessionMaxSeconds = 3600;
    public const int MinInteractiveSessionMaxSeconds = 300;
    public const int MaxInteractiveSessionMaxSeconds = 14400;

    /// <summary>Resolves the interactive Studio ceiling (default 60m, env MAVIS_STUDIO_MAX_SESSION_SECONDS). Explicit overrides &gt;= 1s are honored for tests.</summary>
    public static int ResolveInteractiveSessionMaxSeconds(int? overrideSeconds = null)
    {
        if (overrideSeconds is int explicitSeconds && explicitSeconds >= 1)
            return Math.Min(explicitSeconds, MaxInteractiveSessionMaxSeconds);
        var raw = Environment.GetEnvironmentVariable("MAVIS_STUDIO_MAX_SESSION_SECONDS");
        if (int.TryParse(raw, out var parsed) && parsed >= MinInteractiveSessionMaxSeconds)
            return Math.Min(parsed, MaxInteractiveSessionMaxSeconds);
        return DefaultInteractiveSessionMaxSeconds;
    }

    public static async Task<RuntimeSessionOutcome> RunAsync(IRuntimeSessionBackend backend, int timeoutSeconds,
        CancellationToken ct = default, int? interactiveSessionMaxSeconds = null)
    {
        if (timeoutSeconds is < 1 or > 300) throw new ArgumentException("Session deadline must be 1–300 seconds.");
        using var bootDeadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        bootDeadline.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        var status = "Failed";
        var evidence = "Unavailable";
        var cleanup = "Incomplete";
        var diagnostics = new List<string>();
        HttpScenarioOutcome? scenario = null;
        TraceCorrelationResult? trace = null;
        IReadOnlyList<RuntimeInfrastructureActionResult> infrastructureActions = [];
        var studioDeadlineExpired = false;
        try
        {
            await backend.PrepareAndStartAsync(bootDeadline.Token);
            await backend.WaitUntilReadyAsync(bootDeadline.Token);
            scenario = await backend.ExecuteScenarioAsync(bootDeadline.Token);
            if (backend.InteractiveStudio)
            {
                // Interactive Studio separates bounded boot/readiness (<=300s) from the learner's active session lease (default 60m).
                using var studioDeadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
                studioDeadline.CancelAfter(TimeSpan.FromSeconds(ResolveInteractiveSessionMaxSeconds(interactiveSessionMaxSeconds)));
                try
                {
                    infrastructureActions = await backend.ExecuteInfrastructureActionsAsync(studioDeadline.Token);
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested && studioDeadline.IsCancellationRequested)
                {
                    studioDeadlineExpired = true;
                    if (backend.ObservedInfrastructureActions.Count > 0)
                    {
                        // Graceful Auto-Finish: preserve & seal real learner work when hitting the max duration ceiling.
                        diagnostics.Add("STUDIO_MAX_DURATION_AUTO_FINISHED");
                        infrastructureActions = backend.ObservedInfrastructureActions.ToArray();
                    }
                    else
                    {
                        throw;
                    }
                }
                if (infrastructureActions.Count > 0)
                {
                    using var finalProbeDeadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    finalProbeDeadline.CancelAfter(TimeSpan.FromSeconds(Math.Min(120, Math.Max(30, timeoutSeconds))));
                    var finalScenario = await backend.ExecuteScenarioAsync(finalProbeDeadline.Token);
                    if (finalScenario.Status == "Passed" || scenario.Status != "Passed")
                        scenario = finalScenario;
                }
            }
            else
            {
                infrastructureActions = await backend.ExecuteInfrastructureActionsAsync(bootDeadline.Token);
            }
            status = "Completed"; // Processing completion is separate from scenario pass/fail.
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested && !bootDeadline.IsCancellationRequested && !studioDeadlineExpired)
        {
            // A single Docker/HTTP command hit its own timeout; neither boot nor studio deadline expired.
            diagnostics.Add("COMMAND_TIMED_OUT_AT_" + backend.Stage);
        }
        catch (OperationCanceledException)
        {
            status = ct.IsCancellationRequested ? "Cancelled" : "TimedOut";
            if (status == "TimedOut") diagnostics.Add("SESSION_TIMED_OUT_AT_" + backend.Stage);
        }
        catch (RuntimeStageException ex) { diagnostics.Add(ex.Code); }
        catch (Exception ex) { diagnostics.Add("SESSION_EXECUTION_FAILED_AT_" + backend.Stage); diagnostics.Add(ex.GetType().Name); }
        finally
        {
            if (status != "Completed")
            {
                foreach (var code in backend.FailureDiagnostics)
                {
                    if (code is { Length: > 0 and <= 80 } &&
                        code.All(c => c is >= 'A' and <= 'Z' or >= '0' and <= '9' or '_') &&
                        !diagnostics.Contains(code, StringComparer.Ordinal))
                        diagnostics.Add(code);
                }
            }
            if (backend.ObservedInfrastructureActions.Count > 0)
                infrastructureActions = backend.ObservedInfrastructureActions.ToArray();
            // Fresh bounded cleanup tokens: an expired/cancelled run must still attempt evidence preservation and teardown.
            // Budgets stay inside the 420s dispatcher wait: 300s session + 30s drain + 45s teardown.
            using var drain = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            try
            {
                trace = await backend.PreserveEvidenceAsync(drain.Token);
                evidence = trace is null ? "Unavailable" : trace.Spans.Count == 0 ? "Empty" : "Available";
            }
            catch (Exception) { evidence = "Failed"; diagnostics.Add("EVIDENCE_PRESERVATION_FAILED"); }
            using var teardown = new CancellationTokenSource(TimeSpan.FromSeconds(45));
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

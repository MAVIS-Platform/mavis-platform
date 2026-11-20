using System.Collections.Concurrent;

namespace MAVIS.Runner;

/// <summary>Long-running remote worker pool that claims queued runtime sessions from Java over HTTPS.</summary>
public static class WorkerPoolLoop
{
    public static async Task RunAsync(JavaRuntimeClient java, IDockerCommands docker, string collectorConfigPath,
        string stateRoot, int concurrency, string workerId, string? ociRuntime, bool writableRootfsUnderKernelSandbox,
        CancellationToken ct, TimeSpan? idleDelay = null)
    {
        if (concurrency is < 1 or > 16) throw new ArgumentException("Worker concurrency must be 1..16.");
        if (!Path.IsPathFullyQualified(stateRoot)) throw new ArgumentException("Absolute state root required.");
        if (!File.Exists(collectorConfigPath)) throw new ArgumentException("Collector config unavailable.");
        Directory.CreateDirectory(stateRoot);
        var normalizedRuntime = ComposeOverrideBuilder.NormalizeOciRuntime(ociRuntime);
        var effectiveRuntime = await DockerComposeSession.ResolveIsolationRuntimeAsync(docker, stateRoot, normalizedRuntime, ct);
        Console.WriteLine($"[worker:{workerId}] ready concurrency={concurrency} isolationRuntime={effectiveRuntime}");

        using var slots = new SemaphoreSlim(concurrency, concurrency);
        var activeJobs = new ConcurrentDictionary<string, Task>(StringComparer.Ordinal);
        var baseDelay = idleDelay ?? TimeSpan.FromMilliseconds(1500);
        var errorBackoffMs = 2000;

        try
        {
            while (!ct.IsCancellationRequested)
            {
                await slots.WaitAsync(ct);
                JavaRuntimeClient.WorkerClaim? claim = null;
                try
                {
                    claim = await java.ClaimWorkerJobAsync(workerId, effectiveRuntime, ct);
                    errorBackoffMs = 2000;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    slots.Release();
                    break;
                }
                catch (Exception ex)
                {
                    slots.Release();
                    Console.Error.WriteLine($"[worker:{workerId}] claim error={ex.GetType().Name}");
                    await Task.Delay(errorBackoffMs, ct);
                    errorBackoffMs = Math.Min(15_000, errorBackoffMs * 2);
                    continue;
                }

                if (claim is null || string.IsNullOrWhiteSpace(claim.SessionId))
                {
                    slots.Release();
                    await Task.Delay(baseDelay, ct);
                    continue;
                }

                var sessionId = claim.SessionId;
                var jobTask = Task.Run(async () =>
                {
                    try
                    {
                        using var jobTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                        jobTimeout.CancelAfter(TimeSpan.FromMinutes(7));
                        var adapter = new ManagedRuntimeAdapter(java, docker, effectiveRuntime, writableRootfsUnderKernelSandbox);
                        var outcome = await adapter.RunAsync(sessionId, collectorConfigPath, stateRoot, null, jobTimeout.Token);
                        Console.WriteLine($"[worker:{workerId}] session={sessionId} status={outcome.ExecutionStatus} cleanup={outcome.CleanupStatus}");
                    }
                    catch (OperationCanceledException) when (ct.IsCancellationRequested)
                    {
                        Console.WriteLine($"[worker:{workerId}] session={sessionId} stopped on worker shutdown");
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine($"[worker:{workerId}] session={sessionId} failed={ex.GetType().Name}:{ex.Message}");
                    }
                    finally
                    {
                        activeJobs.TryRemove(sessionId, out _);
                        slots.Release();
                    }
                }, CancellationToken.None);
                activeJobs[sessionId] = jobTask;
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally
        {
            var remaining = activeJobs.Values.ToArray();
            if (remaining.Length > 0)
            {
                try { await Task.WhenAll(remaining).WaitAsync(TimeSpan.FromSeconds(30)); }
                catch { /* Bounded graceful drain on worker shutdown. */ }
            }
        }
    }
}

using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MAVIS.Runner;

/// <summary>Long-running remote worker pool that claims queued runtime sessions from Java over HTTPS.</summary>
public static class WorkerPoolLoop
{
    public const string DefaultInstrumentationVolume = "mavis-agents-java-2-32-0-dotnet-1-17-0-bundle-3";
    public const string SeedHelperImage = "mcr.microsoft.com/dotnet/aspnet@sha256:d5633778c754e89a386882eddf8dbee6942447a8a4b8267c19cf1e1158d0b0ac";
    public const string ScenarioRunnerImageTag = "mavis-poc-runner:4";
    public const string PlaceholderRunnerSuffix = "0000000000000000000000000000000000000000000000000000000000000001";

    private static readonly Regex MavisRunProjectPattern = new("^mavisrun-[0-9a-f]{32}$", RegexOptions.Compiled);
    private static readonly Regex Sha256ImageIdPattern = new("^sha256:[0-9a-f]{64}$", RegexOptions.Compiled);
    private static readonly SemaphoreSlim PrerequisiteLock = new(1, 1);

    public sealed record MaintenanceReport(int DeliveredReceipts, int OrphansReaped, int SandboxImagesRemoved, int StateEntriesRemoved, long HostStateFreeMiB);

    public static async Task RunAsync(JavaRuntimeClient java, IDockerCommands docker, string collectorConfigPath,
        string stateRoot, int concurrency, string workerId, string? ociRuntime, bool writableRootfsUnderKernelSandbox,
        CancellationToken ct, TimeSpan? idleDelay = null, TimeSpan? maintenanceInterval = null)
    {
        if (concurrency is < 1 or > 16) throw new ArgumentException("Worker concurrency must be 1..16.");
        if (!Path.IsPathFullyQualified(stateRoot)) throw new ArgumentException("Absolute state root required.");
        if (!File.Exists(collectorConfigPath)) throw new ArgumentException("Collector config unavailable.");
        Directory.CreateDirectory(stateRoot);
        var normalizedRuntime = ComposeOverrideBuilder.NormalizeOciRuntime(ociRuntime);
        var effectiveRuntime = await DockerComposeSession.ResolveIsolationRuntimeAsync(docker, stateRoot, normalizedRuntime, ct);

        string? localInstrumentationVolume = null;
        string? localScenarioRunnerImage = null;
        try
        {
            localInstrumentationVolume = await EnsureInstrumentationVolumeAsync(docker, stateRoot, null, ct);
            localScenarioRunnerImage = await EnsureScenarioRunnerImageAsync(docker, stateRoot, null, null, ct);
            var deliveredAtStart = await DeliverPendingReceiptsAsync(java, stateRoot, ct);
            if (deliveredAtStart > 0)
                Console.WriteLine($"[worker:{workerId}] startup deliveredPendingReceipts={deliveredAtStart}");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[worker:{workerId}] startup prerequisite warning={ex.GetType().Name}:{ex.Message}");
        }

        Console.WriteLine(
            $"[worker:{workerId}] ready concurrency={concurrency} isolationRuntime={effectiveRuntime} " +
            $"instrumentationVolume={localInstrumentationVolume ?? "unset"} scenarioRunnerImage={localScenarioRunnerImage ?? "unset"}");

        using var slots = new SemaphoreSlim(concurrency, concurrency);
        var activeTasks = new ConcurrentDictionary<string, Task>(StringComparer.Ordinal);
        var activeProjects = new ConcurrentDictionary<string, string>(StringComparer.Ordinal);
        var baseDelay = idleDelay ?? TimeSpan.FromMilliseconds(1500);
        var errorBackoffMs = 2000;

        using var maintenanceCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var hygienePeriod = maintenanceInterval ?? TimeSpan.FromMinutes(5);
        var maintenanceTask = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(hygienePeriod);
            try
            {
                while (await timer.WaitForNextTickAsync(maintenanceCts.Token))
                {
                    try
                    {
                        var activeSnapshot = new HashSet<string>(activeProjects.Values, StringComparer.Ordinal);
                        await RunMaintenanceCycleAsync(java, docker, stateRoot, activeSnapshot, workerId, maintenanceCts.Token);
                    }
                    catch (OperationCanceledException) when (maintenanceCts.IsCancellationRequested) { break; }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine($"[worker:{workerId}] maintenance error={ex.GetType().Name}:{ex.Message}");
                    }
                }
            }
            catch (OperationCanceledException) { }
        }, CancellationToken.None);

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
                var resourceProject = !string.IsNullOrWhiteSpace(claim.ResourceProject)
                    ? claim.ResourceProject
                    : "mavisrun-" + sessionId.Replace("-", "", StringComparison.Ordinal).ToLowerInvariant();
                activeProjects[sessionId] = resourceProject;

                var jobTask = Task.Run(async () =>
                {
                    try
                    {
                        using var jobTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                        jobTimeout.CancelAfter(TimeSpan.FromMinutes(7));
                        var adapter = new ManagedRuntimeAdapter(
                            java, docker, effectiveRuntime, writableRootfsUnderKernelSandbox,
                            (definition, token) => NormalizeDefinitionForWorkerAsync(
                                definition, docker, stateRoot, localScenarioRunnerImage, localInstrumentationVolume, token));
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
                        activeProjects.TryRemove(sessionId, out _);
                        activeTasks.TryRemove(sessionId, out _);
                        slots.Release();
                    }
                }, CancellationToken.None);
                activeTasks[sessionId] = jobTask;
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally
        {
            maintenanceCts.Cancel();
            try { await maintenanceTask.WaitAsync(TimeSpan.FromSeconds(5)); } catch { }
            var remaining = activeTasks.Values.ToArray();
            if (remaining.Length > 0)
            {
                try { await Task.WhenAll(remaining).WaitAsync(TimeSpan.FromSeconds(30)); }
                catch { /* Bounded graceful drain on worker shutdown. */ }
            }
        }
    }

    public static bool HasCurrentBundleLabels(string? labelsJson)
    {
        if (string.IsNullOrWhiteSpace(labelsJson)) return false;
        try
        {
            using var doc = JsonDocument.Parse(labelsJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return false;
            return GetJsonString(doc.RootElement, "mavis.bundle.rev") == "3"
                && GetJsonString(doc.RootElement, "mavis.dotnet.version") == "1.17.0"
                && GetJsonString(doc.RootElement, "mavis.dotnet.musl.version") == "1.17.0"
                && GetJsonString(doc.RootElement, "mavis.java.version") == "2.32.0";
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static async Task<string?> EnsureInstrumentationVolumeAsync(
        IDockerCommands docker, string workingDirectory, string? bundleDirectory, CancellationToken ct)
    {
        await PrerequisiteLock.WaitAsync(ct);
        try
        {
            var volume = DefaultInstrumentationVolume;
            var inspect = await docker.RunAsync(["volume", "inspect", "--format", "{{json .Labels}}", volume], workingDirectory, 10, ct);
            if (inspect.ExitCode == 0 && HasCurrentBundleLabels(inspect.StandardOutput))
                return volume;

            var bundle = ResolveBundleDirectory(bundleDirectory);
            if (bundle is null) return null;

            // Preserve an existing volume name with different contents so in-flight sessions are never disrupted.
            if (inspect.ExitCode == 0)
                volume += "-" + Guid.NewGuid().ToString("N")[..8];

            var pull = await docker.RunAsync(["pull", SeedHelperImage], workingDirectory, 120, ct);
            if (pull.ExitCode != 0) return null;

            var createVol = await docker.RunAsync([
                "volume", "create",
                "--label", "mavis.poc.managed=true",
                "--label", "mavis.bundle.rev=3",
                "--label", "mavis.dotnet.version=1.17.0",
                "--label", "mavis.dotnet.musl.version=1.17.0",
                "--label", "mavis.java.version=2.32.0",
                volume
            ], workingDirectory, 15, ct);
            if (createVol.ExitCode != 0) return null;

            var container = "mavis-agent-seed-" + Guid.NewGuid().ToString("N")[..8];
            var seeded = false;
            try
            {
                var createContainer = await docker.RunAsync(["create", "--name", container, "-v", $"{volume}:/agents", SeedHelperImage], workingDirectory, 20, ct);
                if (createContainer.ExitCode == 0)
                {
                    var cp = await docker.RunAsync(["cp", Path.Combine(bundle, "."), $"{container}:/agents/"], workingDirectory, 30, ct);
                    seeded = cp.ExitCode == 0;
                }
            }
            finally
            {
                await docker.RunAsync(["rm", "-f", container], workingDirectory, 10, ct);
                if (!seeded)
                    await docker.RunAsync(["volume", "rm", volume], workingDirectory, 10, ct);
            }

            return seeded ? volume : null;
        }
        finally
        {
            PrerequisiteLock.Release();
        }
    }

    public static async Task<string?> EnsureScenarioRunnerImageAsync(
        IDockerCommands docker, string workingDirectory, string? runnerPublishDir, string? runnerDockerfilePath, CancellationToken ct)
    {
        var inspect = await docker.RunAsync(["image", "inspect", "--format", "{{.Id}}", ScenarioRunnerImageTag], workingDirectory, 10, ct);
        var existingId = inspect.StandardOutput.Trim();
        if (inspect.ExitCode == 0 && Sha256ImageIdPattern.IsMatch(existingId))
            return existingId;

        var publishDir = ResolveRunnerPublishDirectory(runnerPublishDir);
        var dockerfile = ResolveRunnerDockerfile(runnerDockerfilePath);
        if (publishDir is null || dockerfile is null) return null;

        var buildCtx = Path.Combine(Path.GetTempPath(), "mavis-runner-img-" + Guid.NewGuid().ToString("N"));
        try
        {
            var pubTarget = Path.Combine(buildCtx, "artifacts", "runner-publish");
            Directory.CreateDirectory(pubTarget);
            foreach (var file in Directory.EnumerateFiles(publishDir))
                File.Copy(file, Path.Combine(pubTarget, Path.GetFileName(file)), overwrite: true);
            var dfCopy = Path.Combine(buildCtx, "Runner.Dockerfile");
            File.Copy(dockerfile, dfCopy, overwrite: true);

            var build = await docker.RunAsync(["build", "--quiet", "--file", dfCopy, "-t", ScenarioRunnerImageTag, buildCtx], workingDirectory, 120, ct);
            if (build.ExitCode != 0) return null;
        }
        finally
        {
            try { if (Directory.Exists(buildCtx)) Directory.Delete(buildCtx, recursive: true); } catch { }
        }

        var reInspect = await docker.RunAsync(["image", "inspect", "--format", "{{.Id}}", ScenarioRunnerImageTag], workingDirectory, 10, ct);
        var builtId = reInspect.StandardOutput.Trim();
        return reInspect.ExitCode == 0 && Sha256ImageIdPattern.IsMatch(builtId) ? builtId : null;
    }

    public static async Task<RuntimeRunDefinition> NormalizeDefinitionForWorkerAsync(
        RuntimeRunDefinition definition, IDockerCommands docker, string workingDirectory,
        string? localScenarioRunnerImage, string? localInstrumentationVolume, CancellationToken ct)
    {
        var profile = definition.Profile;
        var updatedRunnerImage = profile.ScenarioRunnerImage;
        var updatedVolume = profile.InstrumentationVolume;

        if (!string.IsNullOrWhiteSpace(localScenarioRunnerImage))
        {
            var configured = profile.ScenarioRunnerImage?.Trim() ?? "";
            var needsOverride = string.IsNullOrWhiteSpace(configured)
                || configured.StartsWith("mcr.microsoft.com/dotnet/aspnet", StringComparison.OrdinalIgnoreCase)
                || configured.EndsWith(PlaceholderRunnerSuffix, StringComparison.OrdinalIgnoreCase);

            if (!needsOverride)
            {
                var probe = await docker.RunAsync(["image", "inspect", "--format", "{{.Id}}", configured], workingDirectory, 10, ct);
                needsOverride = probe.ExitCode != 0 || !Sha256ImageIdPattern.IsMatch(probe.StandardOutput.Trim());
            }

            if (needsOverride)
                updatedRunnerImage = localScenarioRunnerImage;
        }

        if (!string.IsNullOrWhiteSpace(localInstrumentationVolume) &&
            !string.Equals(profile.InstrumentationVolume, localInstrumentationVolume, StringComparison.Ordinal))
        {
            var volProbe = await docker.RunAsync(["volume", "inspect", "--format", "{{json .Labels}}", profile.InstrumentationVolume], workingDirectory, 10, ct);
            if (volProbe.ExitCode != 0 || !HasCurrentBundleLabels(volProbe.StandardOutput))
                updatedVolume = localInstrumentationVolume;
        }

        if (string.Equals(updatedRunnerImage, profile.ScenarioRunnerImage, StringComparison.Ordinal) &&
            string.Equals(updatedVolume, profile.InstrumentationVolume, StringComparison.Ordinal))
            return definition;

        return definition with
        {
            Profile = profile with
            {
                ScenarioRunnerImage = updatedRunnerImage,
                InstrumentationVolume = updatedVolume
            }
        };
    }

    public static async Task<int> DeliverPendingReceiptsAsync(JavaRuntimeClient java, string stateRoot, CancellationToken ct)
    {
        var directory = Path.Combine(stateRoot, "receipts");
        if (!Directory.Exists(directory)) return 0;
        RuntimeAllocation.RejectLinks(directory);

        var pending = Directory.EnumerateFiles(directory, "mavisrun-*.json")
            .Where(p => !p.EndsWith(".ack.json", StringComparison.Ordinal))
            // Filter acked receipts before the batch cap so retained acks never crowd out undelivered receipts.
            .Where(p => !File.Exists(Path.Combine(directory, Path.GetFileNameWithoutExtension(p) + ".ack.json")))
            .Order(StringComparer.Ordinal)
            .Take(256)
            .ToArray();

        var delivered = 0;
        var delivery = new RuntimeReceiptDelivery(java);
        foreach (var path in pending)
        {
            var project = Path.GetFileNameWithoutExtension(path);
            var ackPath = Path.Combine(directory, project + ".ack.json");
            if (File.Exists(ackPath)) continue;
            try
            {
                await delivery.DeliverAsync(stateRoot, project, ct);
                delivered++;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[worker] pending receipt delivery failed project={project} error={ex.GetType().Name}");
            }
        }
        return delivered;
    }

    public static async Task<MaintenanceReport> RunMaintenanceCycleAsync(
        JavaRuntimeClient java, IDockerCommands docker, string stateRoot,
        IReadOnlySet<string> activeProjects, string workerId, CancellationToken ct,
        DateTimeOffset? utcNow = null, bool? dedicatedHost = null)
    {
        var now = utcNow ?? DateTimeOffset.UtcNow;
        var delivered = await DeliverPendingReceiptsAsync(java, stateRoot, ct);

        // 1. Reap orphaned mavisrun-* compose projects ONLY on a dedicated Runner VM host,
        // and never touch a project whose runner-<project>.lock lease is still held by another process.
        var isDedicatedHost = dedicatedHost ??
            string.Equals(Environment.GetEnvironmentVariable("MAVIS_WORKER_DEDICATED_HOST"), "1", StringComparison.Ordinal);
        var orphansReaped = 0;
        if (isDedicatedHost)
        {
            var discovered = new HashSet<string>(StringComparer.Ordinal);
            var psProjects = await docker.RunAsync(["ps", "-a", "--format", "{{.Label \"com.docker.compose.project\"}}"], stateRoot, 15, ct);
            if (psProjects.ExitCode == 0)
                CollectMavisRunProjects(psProjects.StandardOutput, discovered);
            var composeProjects = await docker.RunAsync(["compose", "ls", "-a", "--format", "{{.Name}}"], stateRoot, 15, ct);
            if (composeProjects.ExitCode == 0)
                CollectMavisRunProjects(composeProjects.StandardOutput, discovered);

            foreach (var project in discovered)
            {
                if (activeProjects.Contains(project)) continue;
                if (IsProjectLeaseHeld(stateRoot, project)) continue;
                var down = await docker.RunAsync(["compose", "-p", project, "down", "-v", "--remove-orphans"], stateRoot, 30, ct);
                if (down.ExitCode == 0)
                    orphansReaped++;
            }
        }

        // 2. Prune dangling images, old build cache, and unused mavis-sandbox-* images older than 14 days.
        await docker.RunAsync(["image", "prune", "-f"], stateRoot, 30, ct);
        await docker.RunAsync(["builder", "prune", "-f", "--filter", "until=72h"], stateRoot, 30, ct);

        var sandboxImagesRemoved = 0;
        var inUseImages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var psImages = await docker.RunAsync(["ps", "-a", "--format", "{{.Image}}"], stateRoot, 15, ct);
        if (psImages.ExitCode == 0)
        {
            foreach (var line in psImages.StandardOutput.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
                inUseImages.Add(line.Trim());
        }

        var imageList = await docker.RunAsync(["images", "--format", "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}"], stateRoot, 15, ct);
        if (imageList.ExitCode == 0)
        {
            var imageCutoff = now.AddDays(-14);
            foreach (var line in imageList.StandardOutput.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split('\t');
                if (parts.Length < 3) continue;
                var repoTag = parts[0].Trim();
                var imageId = parts[1].Trim();
                var createdRaw = parts[2].Trim();
                if (!repoTag.StartsWith("mavis-sandbox-", StringComparison.Ordinal)) continue;
                if (inUseImages.Contains(repoTag) || inUseImages.Contains(imageId)) continue;
                if (TryParseDockerTimestamp(createdRaw, out var createdAt) && createdAt < imageCutoff)
                {
                    var rm = await docker.RunAsync(["image", "rm", "-f", imageId], stateRoot, 15, ct);
                    if (rm.ExitCode == 0) sandboxImagesRemoved++;
                }
            }
        }

        // 3. Clean stale state-root artifacts older than 7 days, sparing active sessions, recovery manifests, and unacked receipts.
        var stateRemoved = CleanStaleStateEntries(stateRoot, activeProjects, now.AddDays(-7));
        var hostStateFreeMiB = GetHostStateFreeDiskMiB(stateRoot);

        Console.WriteLine(
            $"[worker:{workerId}] hygiene hostStateFreeMiB={hostStateFreeMiB} orphansReaped={orphansReaped} " +
            $"sandboxImagesRemoved={sandboxImagesRemoved} stateRemoved={stateRemoved} deliveredPending={delivered}");
        return new MaintenanceReport(delivered, orphansReaped, sandboxImagesRemoved, stateRemoved, hostStateFreeMiB);
    }

    internal static bool IsProjectLeaseHeld(string stateRoot, string project)
    {
        var lockPath = Path.Combine(stateRoot, "runner-" + project + ".lock");
        if (!File.Exists(lockPath)) return false;
        try
        {
            using var probe = new FileStream(lockPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
            return false;
        }
        catch (FileNotFoundException)
        {
            return false;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Treat unreadable or locked lease files as held: never reap what we cannot prove is free.
            return true;
        }
    }

    private static void CollectMavisRunProjects(string stdout, HashSet<string> target)
    {
        foreach (var raw in stdout.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = raw.Trim();
            if (MavisRunProjectPattern.IsMatch(trimmed))
                target.Add(trimmed);
        }
    }

    public static bool TryParseDockerTimestamp(string raw, out DateTimeOffset timestamp)
    {
        if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out timestamp))
            return true;
        // Docker prints "2026-01-15 10:20:30 +0000 UTC" — strip trailing named zone token.
        var parts = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3)
        {
            var joined = $"{parts[0]} {parts[1]} {parts[2]}";
            if (DateTimeOffset.TryParse(joined, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out timestamp))
                return true;
        }
        timestamp = default;
        return false;
    }

    private static int CleanStaleStateEntries(string stateRoot, IReadOnlySet<string> activeProjects, DateTimeOffset cutoff)
    {
        if (!Directory.Exists(stateRoot)) return 0;
        var removed = 0;

        bool IsActiveEntry(string name) => activeProjects.Any(p => name.Contains(p, StringComparison.OrdinalIgnoreCase));

        foreach (var entry in Directory.EnumerateFileSystemEntries(stateRoot))
        {
            var name = Path.GetFileName(entry);
            if (string.Equals(name, "receipts", StringComparison.OrdinalIgnoreCase)) continue;
            // Preserve allocation and recovery manifests so interrupted sessions remain recoverable.
            if (name.StartsWith(".allocation-", StringComparison.OrdinalIgnoreCase) ||
                name.StartsWith(".recovery-", StringComparison.OrdinalIgnoreCase)) continue;
            if (IsActiveEntry(name)) continue;
            try
            {
                if (Directory.Exists(entry))
                {
                    if (Directory.GetLastWriteTimeUtc(entry) < cutoff.UtcDateTime)
                    {
                        Directory.Delete(entry, recursive: true);
                        removed++;
                    }
                }
                else if (File.Exists(entry) && File.GetLastWriteTimeUtc(entry) < cutoff.UtcDateTime)
                {
                    if (name.StartsWith("runner-", StringComparison.OrdinalIgnoreCase) &&
                        name.EndsWith(".lock", StringComparison.OrdinalIgnoreCase))
                    {
                        var project = name["runner-".Length..^".lock".Length];
                        if (IsProjectLeaseHeld(stateRoot, project)) continue;
                    }
                    File.Delete(entry);
                    removed++;
                }
            }
            catch { /* Best-effort cleanup; locked files stay untouched. */ }
        }

        var receiptsDir = Path.Combine(stateRoot, "receipts");
        if (Directory.Exists(receiptsDir))
        {
            foreach (var receiptFile in Directory.EnumerateFiles(receiptsDir, "mavisrun-*.json"))
            {
                var name = Path.GetFileName(receiptFile);
                if (name.EndsWith(".ack.json", StringComparison.OrdinalIgnoreCase)) continue;
                if (IsActiveEntry(name)) continue;
                var project = Path.GetFileNameWithoutExtension(receiptFile);
                var ackFile = Path.Combine(receiptsDir, project + ".ack.json");
                var lockFile = Path.Combine(receiptsDir, project + ".delivery.lock");
                try
                {
                    if (!File.Exists(ackFile))
                    {
                        if (File.GetLastWriteTimeUtc(receiptFile) < cutoff.UtcDateTime)
                            Console.Error.WriteLine($"[worker] unacknowledged receipt older than 7 days preserved project={project}");
                        continue;
                    }
                    if (File.GetLastWriteTimeUtc(ackFile) < cutoff.UtcDateTime &&
                        File.GetLastWriteTimeUtc(receiptFile) < cutoff.UtcDateTime)
                    {
                        File.Delete(receiptFile);
                        File.Delete(ackFile);
                        if (File.Exists(lockFile)) File.Delete(lockFile);
                        removed++;
                    }
                }
                catch { }
            }
        }
        return removed;
    }

    private static long GetHostStateFreeDiskMiB(string stateRoot)
    {
        // shortcut: measures the host filesystem backing stateRoot (/tmp), assuming it shares the disk with /var/lib/docker; upgrade if the Runner VM mounts /var/lib/docker on a separate volume.
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(stateRoot));
            if (string.IsNullOrWhiteSpace(root)) return -1;
            var info = new DriveInfo(root);
            return info.AvailableFreeSpace / (1024L * 1024L);
        }
        catch
        {
            return -1;
        }
    }

    private static string? ResolveBundleDirectory(string? explicitPath)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(explicitPath)) candidates.Add(explicitPath);
        candidates.Add("/app/otel-bundle");
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "..", "otel-bundle"));
        candidates.Add(Path.Combine("MAVIS.Worker", "samples", "runtime-poc", "artifacts", "bundle"));

        foreach (var candidate in candidates)
        {
            var full = Path.GetFullPath(candidate);
            if (Directory.Exists(Path.Combine(full, "java")) &&
                Directory.Exists(Path.Combine(full, "dotnet")) &&
                Directory.Exists(Path.Combine(full, "dotnet-musl")))
                return full;
        }
        return null;
    }

    private static string? ResolveRunnerPublishDirectory(string? explicitPath)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(explicitPath)) candidates.Add(explicitPath);
        candidates.Add("/app/runner");
        candidates.Add(AppContext.BaseDirectory);

        foreach (var candidate in candidates)
        {
            var full = Path.GetFullPath(candidate);
            if (File.Exists(Path.Combine(full, "MAVIS.Runner.dll")))
                return full;
        }
        return null;
    }

    private static string? ResolveRunnerDockerfile(string? explicitPath)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(explicitPath)) candidates.Add(explicitPath);
        candidates.Add("/app/samples/runtime-poc/Runner.Dockerfile");
        candidates.Add(Path.Combine("MAVIS.Worker", "samples", "runtime-poc", "Runner.Dockerfile"));

        foreach (var candidate in candidates)
        {
            var full = Path.GetFullPath(candidate);
            if (File.Exists(full))
                return full;
        }
        return null;
    }

    private static string? GetJsonString(JsonElement obj, string propertyName) =>
        obj.TryGetProperty(propertyName, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;
}

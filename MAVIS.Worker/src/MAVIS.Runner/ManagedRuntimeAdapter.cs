using System.Text.Json;

namespace MAVIS.Runner;

/// <summary>Shared-root managed execution. Java endpoint support and cross-language digest fixtures are deployment gates.</summary>
public sealed class ManagedRuntimeAdapter(JavaRuntimeClient java, IDockerCommands docker)
{
    public async Task<RuntimeSessionOutcome> RunAsync(string sessionId, string collectorConfigPath, string stateRoot,
        IReadOnlyDictionary<string, string>? secrets = null, CancellationToken ct = default)
    {
        if (!Path.IsPathFullyQualified(stateRoot)) throw new ArgumentException("Absolute state root required.");
        var definition = await java.GetDefinitionAsync(sessionId, ct);
        if (definition.ProtectedEnvironmentAvailable)
        {
            var environment = await java.GetEnvironmentAsync(definition, ct);
            var combined = new Dictionary<string,string>(secrets ?? new Dictionary<string,string>(), StringComparer.Ordinal);
            foreach (var pair in environment) combined[pair.Key] = pair.Value;
            secrets = combined;
        }
        var collector = new FileInfo(collectorConfigPath);
        if (!collector.Exists || collector.Length > 1_048_576) throw new ArgumentException("Collector config unavailable.");
        var backend = new DockerComposeSession(definition, stateRoot, await File.ReadAllTextAsync(collector.FullName, ct), docker, secrets, java, java);
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(ct);
        using var stopWatcher = new CancellationTokenSource();
        var watcher = WatchAsync(Path.Combine(stateRoot, backend.ResourceProject, "cancel.request"), cancellation, stopWatcher.Token);
        RuntimeSessionOutcome outcome;
        try { outcome = await RuntimeSessionLifecycle.RunAsync(backend, definition.Profile.TimeoutSeconds, cancellation.Token); }
        finally { stopWatcher.Cancel(); try { await watcher; } catch (OperationCanceledException) { } }
        if (!backend.AllocationReserved)
        {
            var diagnostic = outcome.Diagnostics.FirstOrDefault();
            if (diagnostic is not null && diagnostic.Length <= 80 &&
                diagnostic.All(c => c is >= 'A' and <= 'Z' or >= '0' and <= '9' or '_'))
                throw new RuntimeStageException(diagnostic);
            throw new RuntimeStageException("ALLOCATION_NOT_ACQUIRED");
        }
        var receipt = SerializeReceipt(definition, backend, outcome);
        RuntimeReceiptStore.Save(stateRoot, backend.ResourceProject, receipt);
        // Caller cancellation must not erase receipt; use a fresh bounded delivery window after teardown.
        using var delivery = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        await new RuntimeReceiptDelivery(java).DeliverAsync(stateRoot, backend.ResourceProject, delivery.Token);
        return outcome;
    }

    public static string SerializeReceipt(RuntimeRunDefinition definition, DockerComposeSession backend, RuntimeSessionOutcome outcome) =>
        JsonSerializer.Serialize(new { definition.SessionId, definition.ModelVersionId, definition.SourceSnapshotId,
            definition.ProfileVersionId, definition.RunConfigurationVersionId, definition.ScenarioVersionId,
            backend.ResourceProject, actualImageIds = backend.ActualImageIds, backend.DeclaredInstrumentationVersions,
            backend.SandboxEnforcementConfirmed, infrastructureActions = outcome.InfrastructureActions ?? [], outcome,
            imageSourceCorrespondence = backend.ImageSourceCorrespondenceVerified ? "Verified" : "Unverified",
            profileAcceptance = definition.Profile.ApprovedForLocalPoc && backend.SandboxEnforcementConfirmed ? "Verified" : "Unverified" }, RuntimeLifecycleJournal.Json);

    private static async Task WatchAsync(string marker, CancellationTokenSource cancellation, CancellationToken stopping)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(200));
        while (await timer.WaitForNextTickAsync(stopping))
            if (File.Exists(marker)) { cancellation.Cancel(); return; }
    }
}

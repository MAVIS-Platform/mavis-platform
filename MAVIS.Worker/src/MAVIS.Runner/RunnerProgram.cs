using System.Text.Json;

namespace MAVIS.Runner;

public static class RunnerProgram
{
    public static async Task<int> Main(string[] args)
    {
        if (args is not ["preflight", _] && args is not ["scenario", _, _] && args is not ["correlate", _, _, _, _] && args is not ["run", _, _, _] && args is not ["plan", _, _] && args is not ["stdin-scenario"] && args is not ["recover", _, _] &&
            args is not ["managed", _, _, _, _] && args is not ["deliver", _, _, _] && args is not ["deliver-pending", _, _] && args is not ["ack-lifecycle", _, _] && args is not ["managed-recover", _, _, _])
        {
            Console.Error.WriteLine("Usage: MAVIS.Runner preflight <compose.yml> | plan <session.json> <collector.yaml> | scenario <scenario.json> <endpoints.json> | correlate <sessionId> <modelVersionId> <otlp.json> <mappings.json> | run <session.json> <collector.yaml> <state-root> | recover <state-root> <resource-project> | managed <java-url> <session-id> <collector.yaml> <state-root> | deliver <java-url> <state-root> <resource-project> | deliver-pending <java-url> <state-root> | ack-lifecycle <java-url> <event.json>");
            return 2;
        }
        try
        {
            var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true, WriteIndented = true };
            using var cancellation = new CancellationTokenSource(TimeSpan.FromMinutes(5));
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancellation.Cancel(); };
            if (args[0] is "managed" or "deliver" or "deliver-pending" or "ack-lifecycle" or "managed-recover")
            {
                if (Environment.GetEnvironmentVariable("MAVIS_RUNNER_ALLOW_LOCAL_POC") != "1") throw new ArgumentException();
                using var java = new JavaRuntimeClient(new Uri(args[1]), Environment.GetEnvironmentVariable("MAVIS_RUNNER_SERVICE_KEY") ?? "");
                if (args[0] == "managed-recover")
                {
                    await ManagedRecovery.RecoverAsync(java,new DockerCommands(),args[2],args[3],cancellation.Token);
                    Console.WriteLine("Recovery cleanup acknowledged.");
                    return 0;
                }
                if (args[0] == "ack-lifecycle")
                {
                    RuntimeAllocation.RejectLinks(args[2]);
                    var notification = JsonSerializer.Deserialize<RuntimeLifecycleEvent>(await Read(args[2], 1_048_576), jsonOptions) ?? throw new ArgumentException();
                    await java.AcknowledgeAsync(notification, cancellation.Token);
                    Console.WriteLine("Lifecycle acknowledged.");
                    return 0;
                }
                if (args[0] == "deliver-pending")
                {
                    if (!Path.IsPathFullyQualified(args[2])) throw new ArgumentException();
                    var directory = Path.Combine(args[2], "receipts");
                    RuntimeAllocation.RejectLinks(directory);
                    if (!Directory.Exists(directory)) return 0;
                    var pending = Directory.EnumerateFiles(directory, "mavisrun-*.json").Where(p => !p.EndsWith(".ack.json", StringComparison.Ordinal))
                        .Order(StringComparer.Ordinal).Take(257).ToArray();
                    if (pending.Length > 256) throw new ArgumentException("Delivery batch exceeds budget.");
                    foreach (var path in pending) await new RuntimeReceiptDelivery(java).DeliverAsync(args[2], Path.GetFileNameWithoutExtension(path), cancellation.Token);
                    Console.WriteLine("Receipt delivery batch acknowledged.");
                    return 0;
                }
                if (args[0] == "deliver")
                {
                    await new RuntimeReceiptDelivery(java).DeliverAsync(args[2], args[3], cancellation.Token);
                    Console.WriteLine("Receipt acknowledged.");
                    return 0;
                }
                var allowlist = (Environment.GetEnvironmentVariable("MAVIS_RUNNER_SECRET_ALLOWLIST") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (allowlist.Length > 64 || allowlist.Any(name => name.Length is < 1 or > 128 || name.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_')))
                    throw new ArgumentException("Invalid secret allowlist.");
                var secrets = allowlist.Distinct(StringComparer.Ordinal).ToDictionary(name => name,
                    name => Environment.GetEnvironmentVariable(name) ?? throw new ArgumentException("Protected reference unavailable."), StringComparer.Ordinal);
                var outcome = await new ManagedRuntimeAdapter(java, new DockerCommands()).RunAsync(args[2], args[3], args[4], secrets, cancellation.Token);
                Console.WriteLine(JsonSerializer.Serialize(outcome, jsonOptions));
                return outcome.ExecutionStatus == "Completed" && outcome.ScenarioStatus == "Passed" && outcome.CleanupStatus == "Confirmed" ? 0 : 1;
            }
            if (args[0] == "recover")
            {
                if (Environment.GetEnvironmentVariable("MAVIS_RUNNER_ALLOW_LOCAL_POC") != "1") throw new ArgumentException();
                var recovered = await SessionRecovery.RecoverAsync(args[1], args[2], new DockerCommands(), cancellation.Token);
                Console.WriteLine(JsonSerializer.Serialize(new { resourceProject = args[2], cleanupStatus = recovered ? "Confirmed" : "Incomplete" }, jsonOptions));
                return recovered ? 0 : 1;
            }
            if (args[0] == "stdin-scenario")
            {
                if (Environment.GetEnvironmentVariable("MAVIS_RUNNER_INTERNAL_NETWORK") != "1") throw new ArgumentException();
                var text = await Console.In.ReadToEndAsync(cancellation.Token);
                if (text.Length > 1_048_576) throw new ArgumentException();
                var envelope = JsonSerializer.Deserialize<ScenarioEnvelope>(text, jsonOptions) ?? throw new ArgumentException();
                var outcome = await new HttpScenarioRunner(allowContainerDns: true).RunAsync(envelope.Scenario, envelope.Endpoints, envelope.Secrets, cancellation.Token);
                Console.WriteLine(JsonSerializer.Serialize(outcome, jsonOptions));
                return outcome.Status == "Passed" ? 0 : 1;
            }
            if (args[0] == "plan")
            {
                var definition = RuntimeDefinitionReader.Read(await Read(args[1], 1_048_576));
                Console.WriteLine(ComposeOverrideBuilder.Build(ComposePreflight.Check(definition.ComposeYaml), definition.Profile, Path.GetFullPath(args[2])));
                return 0;
            }
            if (args[0] == "run")
            {
                if (Environment.GetEnvironmentVariable("MAVIS_RUNNER_ALLOW_LOCAL_POC") != "1")
                    throw new ArgumentException("Operator must explicitly enable the local PoC adapter.");
                var definition = RuntimeDefinitionReader.Read(await Read(args[1], 1_048_576));
                if (definition.Profile is null || definition.Scenario is null || definition.ConfirmedServiceMappings is null || definition.ComposeYaml is null)
                    throw new ArgumentException("Required runtime inputs are missing.");
                var backend = new DockerComposeSession(definition, args[3], await Read(args[2], 1_048_576), new DockerCommands());
                Console.Error.WriteLine("MAVIS_SESSION_RESOURCE=" + backend.ResourceProject);
                using var watcherStop = new CancellationTokenSource();
                var watcher = WatchCancellation(Path.Combine(Path.GetFullPath(args[3]), backend.ResourceProject, "cancel.request"), cancellation, watcherStop.Token);
                RuntimeSessionOutcome outcome;
                try { outcome = await RuntimeSessionLifecycle.RunAsync(backend, definition.Profile.TimeoutSeconds, cancellation.Token); }
                finally { watcherStop.Cancel(); try { await watcher; } catch (OperationCanceledException) { } }
                if (!backend.AllocationReserved)
                {
                    Console.Error.WriteLine("Runtime allocation was not acquired; no receipt was published.");
                    return 1;
                }
                var receipt = ManagedRuntimeAdapter.SerializeReceipt(definition, backend, outcome);
                RuntimeReceiptStore.Save(args[3], backend.ResourceProject, receipt);
                Console.WriteLine(receipt);
                return outcome.ExecutionStatus == "Completed" && outcome.ScenarioStatus == "Passed" && outcome.CleanupStatus == "Confirmed" ? 0 : 1;
            }
            if (args[0] == "scenario")
            {
                var scenario = JsonSerializer.Deserialize<HttpScenarioDefinition>(await Read(args[1], 1_048_576), jsonOptions) ?? throw new ArgumentException();
                var endpoints = JsonSerializer.Deserialize<Dictionary<string, Uri>>(await Read(args[2], 1_048_576), jsonOptions) ?? throw new ArgumentException();
                // Secrets are deliberately not accepted from CLI arguments or persisted scenario literals here.
                var outcome = await new HttpScenarioRunner().RunAsync(scenario, endpoints, new Dictionary<string, string>(), cancellation.Token);
                Console.WriteLine(JsonSerializer.Serialize(outcome, jsonOptions));
                return outcome.Status == "Passed" ? 0 : 1;
            }
            if (args[0] == "correlate")
            {
                var mappings = JsonSerializer.Deserialize<Dictionary<string, string>>(await Read(args[4], 1_048_576), jsonOptions) ?? throw new ArgumentException();
                var correlation = TraceCorrelator.Correlate(args[1], args[2], await Read(args[3], 16_777_216), mappings);
                Console.WriteLine(JsonSerializer.Serialize(correlation, jsonOptions));
                return correlation.Spans.Count == 0 ? 1 : 0;
            }
            var file = new FileInfo(args[1]);
            if (!file.Exists || file.Length > 1_048_576) { Console.Error.WriteLine("Compose is missing or exceeds 1 MiB."); return 2; }
            var result = ComposePreflight.Check(await File.ReadAllTextAsync(args[1]));
            Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true }));
            return result.Compatible ? 0 : 1;
        }
        catch (OperationCanceledException) { Console.Error.WriteLine("Runner operation cancelled or timed out."); return 3; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or JsonException or InvalidOperationException or KeyNotFoundException)
        { Console.Error.WriteLine("Input could not be processed; check the supported profile and input references."); return 2; }
    }

    private static async Task<string> Read(string path, int limit)
    {
        var file = new FileInfo(path);
        if (!file.Exists || file.Length > limit) throw new ArgumentException("Input size limit.");
        return await File.ReadAllTextAsync(path);
    }

    private static async Task WatchCancellation(string marker, CancellationTokenSource cancellation, CancellationToken stopping)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(200));
        while (await timer.WaitForNextTickAsync(stopping))
            if (File.Exists(marker)) { cancellation.Cancel(); return; }
    }
}

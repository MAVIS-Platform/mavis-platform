using System.Net;
using System.Text;
using System.Text.Json;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class WorkerPoolHardeningTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-worker-hardening-" + Guid.NewGuid().ToString("N"));

    private sealed class FakeDocker(Func<IReadOnlyList<string>, DockerCommandResult> respond) : IDockerCommands
    {
        public List<string[]> Calls { get; } = [];

        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> arguments, string workingDirectory, int timeoutSeconds, CancellationToken ct)
        {
            var copy = arguments.ToArray();
            Calls.Add(copy);
            return Task.FromResult(respond(copy));
        }
    }

    private sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public int Calls;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            return respond(request);
        }
    }

    private static RuntimeRunDefinition SampleDefinition(string runnerImage, string volume = "mavis-agents-v1")
    {
        var digest = new string('a', 64);
        return new(
            "s-1", "m-1", "snap-1", "prof-1",
            $"services:\n  app:\n    image: app@sha256:{digest}",
            new("collector@sha256:" + digest, volume,
                new Dictionary<string, RuntimeServiceProfile> { ["app"] = new("java", 8080) },
                ApprovedForLocalPoc: true, ScenarioRunnerImage: runnerImage),
            new("s-1", [new("health", "app", "GET", "/health", 200)]),
            new Dictionary<string, string> { ["app"] = "550e8400-e29b-41d4-a716-446655440001" },
            "cfg-1", "scen-1", "mavisrun-" + new string('1', 32));
    }

    [Fact]
    public async Task EnsureInstrumentationVolumeSeedsWhenMissingAndReusesWhenLabelsCurrent()
    {
        Directory.CreateDirectory(_root);
        var bundleDir = Path.Combine(_root, "otel-bundle");
        Directory.CreateDirectory(Path.Combine(bundleDir, "java"));
        Directory.CreateDirectory(Path.Combine(bundleDir, "dotnet"));
        Directory.CreateDirectory(Path.Combine(bundleDir, "dotnet-musl"));

        var seededDocker = new FakeDocker(args =>
            args is ["volume", "inspect", ..]
                ? new DockerCommandResult(1, "")
                : new DockerCommandResult(0, ""));

        var createdVolume = await WorkerPoolLoop.EnsureInstrumentationVolumeAsync(seededDocker, _root, bundleDir, CancellationToken.None);

        Assert.Equal(WorkerPoolLoop.DefaultInstrumentationVolume, createdVolume);
        Assert.Contains(seededDocker.Calls, c => c is ["pull", WorkerPoolLoop.SeedHelperImage]);
        Assert.Contains(seededDocker.Calls, c => c is ["volume", "create", ..] && c.Contains("mavis.bundle.rev=3") && c.Contains("mavis.java.version=2.32.0"));
        Assert.Contains(seededDocker.Calls, c => c is ["cp", _, _]);
        Assert.Contains(seededDocker.Calls, c => c is ["rm", "-f", _]);

        var currentLabels = """{"mavis.bundle.rev":"3","mavis.dotnet.version":"1.17.0","mavis.dotnet.musl.version":"1.17.0","mavis.java.version":"2.32.0"}""";
        var reuseDocker = new FakeDocker(args =>
            args is ["volume", "inspect", ..]
                ? new DockerCommandResult(0, currentLabels)
                : throw new InvalidOperationException("Should not pull or recreate volume when labels already match"));

        var reusedVolume = await WorkerPoolLoop.EnsureInstrumentationVolumeAsync(reuseDocker, _root, bundleDir, CancellationToken.None);
        Assert.Equal(WorkerPoolLoop.DefaultInstrumentationVolume, reusedVolume);
        Assert.Single(reuseDocker.Calls);
    }

    [Fact]
    public async Task EnsureScenarioRunnerImageBuildsWhenMissingAndReturnsSha256()
    {
        Directory.CreateDirectory(_root);
        var publishDir = Path.Combine(_root, "runner");
        Directory.CreateDirectory(publishDir);
        await File.WriteAllTextAsync(Path.Combine(publishDir, "MAVIS.Runner.dll"), "stub");
        var dockerfile = Path.Combine(_root, "Runner.Dockerfile");
        await File.WriteAllTextAsync(dockerfile, "FROM scratch\nCOPY artifacts/runner-publish/ ./\n");

        var expectedId = "sha256:" + new string('b', 64);
        var built = false;
        var docker = new FakeDocker(args =>
        {
            if (args is ["image", "inspect", "--format", "{{.Id}}", WorkerPoolLoop.ScenarioRunnerImageTag])
                return built ? new DockerCommandResult(0, expectedId + "\n") : new DockerCommandResult(1, "");
            if (args is ["build", "--quiet", "--file", _, "-t", WorkerPoolLoop.ScenarioRunnerImageTag, _])
            {
                built = true;
                return new DockerCommandResult(0, expectedId);
            }
            return new DockerCommandResult(0, "");
        });

        var resolved = await WorkerPoolLoop.EnsureScenarioRunnerImageAsync(docker, _root, publishDir, dockerfile, CancellationToken.None);

        Assert.Equal(expectedId, resolved);
        Assert.Contains(docker.Calls, c => c is ["build", ..]);
    }

    [Fact]
    public async Task NormalizeDefinitionOverridesRemoteOrPlaceholderImagesAndStaleVolumes()
    {
        Directory.CreateDirectory(_root);
        var localImage = "sha256:" + new string('c', 64);
        var backendOnlyImage = "sha256:" + new string('d', 64);
        var existingImage = "sha256:" + new string('e', 64);
        var localVolume = WorkerPoolLoop.DefaultInstrumentationVolume;

        var docker = new FakeDocker(args =>
        {
            if (args is ["image", "inspect", "--format", "{{.Id}}", var img])
                return img == existingImage ? new DockerCommandResult(0, existingImage) : new DockerCommandResult(1, "");
            if (args is ["volume", "inspect", "--format", "{{json .Labels}}", _])
                return new DockerCommandResult(1, "");
            return new DockerCommandResult(0, "");
        });

        // 1. Placeholder ...0001 -> overridden
        var placeholder = await WorkerPoolLoop.NormalizeDefinitionForWorkerAsync(
            SampleDefinition("sha256:" + WorkerPoolLoop.PlaceholderRunnerSuffix), docker, _root, localImage, localVolume, CancellationToken.None);
        Assert.Equal(localImage, placeholder.Profile.ScenarioRunnerImage);
        Assert.Equal(localVolume, placeholder.Profile.InstrumentationVolume);

        // 2. mcr.microsoft.com/dotnet/aspnet -> overridden
        var aspnet = await WorkerPoolLoop.NormalizeDefinitionForWorkerAsync(
            SampleDefinition("mcr.microsoft.com/dotnet/aspnet@sha256:" + new string('9', 64)), docker, _root, localImage, localVolume, CancellationToken.None);
        Assert.Equal(localImage, aspnet.Profile.ScenarioRunnerImage);

        // 3. Backend-local sha256 missing on worker -> overridden
        var missingLocal = await WorkerPoolLoop.NormalizeDefinitionForWorkerAsync(
            SampleDefinition(backendOnlyImage), docker, _root, localImage, localVolume, CancellationToken.None);
        Assert.Equal(localImage, missingLocal.Profile.ScenarioRunnerImage);

        // 4. Image already present locally on worker -> preserved
        var present = await WorkerPoolLoop.NormalizeDefinitionForWorkerAsync(
            SampleDefinition(existingImage, localVolume), docker, _root, localImage, localVolume, CancellationToken.None);
        Assert.Equal(existingImage, present.Profile.ScenarioRunnerImage);
        Assert.Equal(localVolume, present.Profile.InstrumentationVolume);
    }

    [Fact]
    public async Task MaintenanceCycleDeliversReceiptsReapsOrphansPrunesOldSandboxImagesAndStaleState()
    {
        Directory.CreateDirectory(_root);
        var activeProject = "mavisrun-" + new string('a', 32);
        var orphanProject = "mavisrun-" + new string('f', 32);
        var receiptProject = "mavisrun-" + new string('2', 32);
        var now = new DateTimeOffset(2026, 11, 23, 3, 0, 0, TimeSpan.Zero);

        // Pending unacknowledged receipt
        var receiptJson = $"{{\"sessionId\":\"s-2\",\"resourceProject\":\"{receiptProject}\",\"outcome\":{{\"cleanupStatus\":\"Confirmed\"}}}}";
        RuntimeReceiptStore.Save(_root, receiptProject, receiptJson);

        // Stale state dir (>7 days) vs active state dir (>7 days, must be spared) vs fresh dir
        var staleDir = Path.Combine(_root, orphanProject);
        var activeDir = Path.Combine(_root, activeProject);
        var freshFile = Path.Combine(_root, "recent.tmp");
        Directory.CreateDirectory(staleDir);
        Directory.CreateDirectory(activeDir);
        await File.WriteAllTextAsync(freshFile, "ok");
        Directory.SetLastWriteTimeUtc(staleDir, now.AddDays(-10).UtcDateTime);
        Directory.SetLastWriteTimeUtc(activeDir, now.AddDays(-10).UtcDateTime);
        File.SetLastWriteTimeUtc(freshFile, now.AddDays(-1).UtcDateTime);

        var handler = new FakeHandler(_ =>
        {
            var payload = new
            {
                status = 200,
                data = new
                {
                    sessionId = "s-2",
                    resourceProject = receiptProject,
                    receiptDigest = ReceiptCanonicalJson.Digest(receiptJson),
                    persistenceStatus = "COMMITTED"
                }
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(payload, RuntimeLifecycleJournal.Json), Encoding.UTF8, "application/json")
            });
        });
        using var java = new JavaRuntimeClient(new Uri("http://127.0.0.1:8080/"), "test-runner-key", handler, (_, _) => Task.CompletedTask);

        var docker = new FakeDocker(args =>
        {
            if (args is ["ps", "-a", "--format", "{{.Label \"com.docker.compose.project\"}}"])
                return new DockerCommandResult(0, $"{activeProject}\n{orphanProject}\nmavis\n");
            if (args is ["compose", "ls", "-a", "--format", "{{.Name}}"])
                return new DockerCommandResult(0, $"{orphanProject}\n");
            if (args is ["ps", "-a", "--format", "{{.Image}}"])
                return new DockerCommandResult(0, "mavis-sandbox-inuse:latest\n");
            if (args is ["images", "--format", "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}"])
                return new DockerCommandResult(0,
                    "mavis-sandbox-old:1\timg-old\t2026-10-01 00:00:00 +0000 UTC\n" +
                    "mavis-sandbox-inuse:latest\timg-inuse\t2026-10-01 00:00:00 +0000 UTC\n" +
                    "mavis-sandbox-fresh:1\timg-fresh\t2026-11-20 00:00:00 +0000 UTC\n" +
                    "postgres:18\timg-pg\t2026-01-01 00:00:00 +0000 UTC\n");
            return new DockerCommandResult(0, "");
        });

        var report = await WorkerPoolLoop.RunMaintenanceCycleAsync(
            java, docker, _root, new HashSet<string> { activeProject }, "worker-test", CancellationToken.None, now);

        Assert.Equal(1, report.DeliveredReceipts);
        Assert.Equal(1, report.OrphansReaped);
        Assert.Equal(1, report.SandboxImagesRemoved);
        Assert.Equal(1, report.StateEntriesRemoved);
        Assert.True(File.Exists(Path.Combine(_root, "receipts", receiptProject + ".ack.json")));
        Assert.False(Directory.Exists(staleDir));
        Assert.True(Directory.Exists(activeDir));
        Assert.True(File.Exists(freshFile));

        Assert.Contains(docker.Calls, c => c is ["compose", "-p", var p, "down", "-v", "--remove-orphans"] && p == orphanProject);
        Assert.DoesNotContain(docker.Calls, c => c is ["compose", "-p", var p, ..] && p == activeProject);
        Assert.Contains(docker.Calls, c => c is ["image", "prune", "-f"]);
        Assert.Contains(docker.Calls, c => c is ["builder", "prune", "-f", "--filter", "until=72h"]);
        Assert.Contains(docker.Calls, c => c is ["image", "rm", "-f", "img-old"]);
        Assert.DoesNotContain(docker.Calls, c => c is ["image", "rm", "-f", "img-inuse"]);
        Assert.DoesNotContain(docker.Calls, c => c is ["image", "rm", "-f", "img-fresh"]);
        Assert.DoesNotContain(docker.Calls, c => c is ["image", "rm", "-f", "img-pg"]);
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }
}

using System.Text.Json;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class RuntimeAllocationTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "mavis-allocation-" + Guid.NewGuid().ToString("N"));
    private const string Project = "mavisrun-0123456789abcdef0123456789abcdef";

    private sealed class NoEngine : IDockerCommands
    {
        public int Calls;
        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args, string directory, int timeout, CancellationToken ct)
        {
            Calls++;
            // Fail before any Docker resources can be allocated; exercise real reservation and cleanup.
            return Task.FromResult(new DockerCommandResult(1, ""));
        }
    }

    private static RuntimeRunDefinition Definition(string? project = Project)
    {
        var digest = new string('a', 64);
        return new("s", "m", "snapshot", "profile", $"services:\n  app:\n    image: app@sha256:{digest}",
            new("collector@sha256:" + digest, "mavis-agents-v1",
                new Dictionary<string, RuntimeServiceProfile> { ["app"] = new("java", 8080) },
                ApprovedForLocalPoc: true, ScenarioRunnerImage: "sha256:" + digest),
            new("s", [new("health", "app", "GET", "/health", 200)]),
            new Dictionary<string, string>(), "config", "scenario", project);
    }

    [Fact]
    public async Task SuppliedIdControlsDirectoryAndReceiptAndCannotBeReusedAfterCleanup()
    {
        var docker = new NoEngine();
        var backend = new DockerComposeSession(Definition(), root, "receivers: {}", docker);
        Assert.Equal(Project, backend.ResourceProject);
        try
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => backend.PrepareAndStartAsync(default));
            Assert.True(backend.AllocationReserved);
            Assert.True(File.Exists(Path.Combine(root, Project, "compose.yaml")));
        }
        finally { Assert.True(await backend.CleanupAsync(default)); }
        Assert.False(Directory.Exists(Path.Combine(root, Project)));

        var reservation = Path.Combine(root, ".allocation-" + Project + ".json");
        using var json = JsonDocument.Parse(File.ReadAllText(reservation));
        Assert.Equal(Project, json.RootElement.GetProperty("resourceProject").GetString());
        var retryDocker = new NoEngine();
        var retry = new DockerComposeSession(Definition(), root, "receivers: {}", retryDocker);
        try
        {
            await Assert.ThrowsAsync<IOException>(() => retry.PrepareAndStartAsync(default));
            Assert.False(retry.AllocationReserved);
        }
        finally { Assert.True(await retry.CleanupAsync(default)); }
        Assert.Equal(0, retryDocker.Calls);

        var receipt = "{\"resourceProject\":\"" + Project + "\"}";
        var saved = RuntimeReceiptStore.Save(root, backend.ResourceProject, receipt);
        Assert.Equal(Path.Combine(root, "receipts", Project + ".json"), saved);
    }

    [Theory]
    [InlineData("directory")]
    [InlineData("receipt")]
    [InlineData("ack")]
    [InlineData("file")]
    public async Task ExistingAllocationIsRejectedWithoutTouchingItsState(string kind)
    {
        Directory.CreateDirectory(root);
        string sentinel;
        if (kind == "directory")
        {
            Directory.CreateDirectory(Path.Combine(root, Project));
            sentinel = Path.Combine(root, Project, "owner.txt");
        }
        else if (kind == "file") sentinel = Path.Combine(root, Project);
        else
        {
            Directory.CreateDirectory(Path.Combine(root, "receipts"));
            sentinel = Path.Combine(root, "receipts", Project + (kind == "ack" ? ".ack.json" : ".json"));
        }
        File.WriteAllText(sentinel, "existing-owner");
        var docker = new NoEngine();
        var backend = new DockerComposeSession(Definition(), root, "receivers: {}", docker);
        var result = await RuntimeSessionLifecycle.RunAsync(backend, 5);
        Assert.Equal("Failed", result.ExecutionStatus);
        Assert.False(backend.AllocationReserved);
        Assert.Equal("existing-owner", File.ReadAllText(sentinel));
        Assert.Equal(0, docker.Calls);
        Assert.False(File.Exists(Path.Combine(root, ".allocation-" + Project + ".json")));
    }

    [Fact]
    public async Task AllocatorLeaseContentionDoesNotTouchTheActiveOwner()
    {
        Directory.CreateDirectory(root);
        Directory.CreateDirectory(Path.Combine(root, Project));
        var sentinel = Path.Combine(root, Project, "owner.txt");
        File.WriteAllText(sentinel, "active");
        using var lease = new FileStream(Path.Combine(root, "runner-" + Project + ".lock"), FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None);
        var docker = new NoEngine();
        var backend = new DockerComposeSession(Definition(), root, "receivers: {}", docker);
        await RuntimeSessionLifecycle.RunAsync(backend, 5);
        Assert.False(backend.AllocationReserved);
        Assert.Equal("active", File.ReadAllText(sentinel));
        Assert.Equal(0, docker.Calls);
    }

    [Theory]
    [InlineData("")]
    [InlineData("../other")]
    [InlineData("mavisrun-0123456789ABCDEF0123456789abcdef")]
    [InlineData("mavisrun-0123456789abcdef0123456789abcdeg")]
    public void InvalidManagedIdsFailBeforeCreatingState(string project)
    {
        Assert.Throws<ArgumentException>(() => new DockerComposeSession(Definition(project), root, "", new NoEngine()));
        Assert.False(Directory.Exists(root));
    }

    [Fact]
    public void DefinitionWithoutIdKeepsGeneratedOperatorIdentity()
    {
        var definition = Definition(null);
        var serialized = JsonSerializer.Serialize(definition);
        var restored = JsonSerializer.Deserialize<RuntimeRunDefinition>(serialized)!;
        var first = new DockerComposeSession(restored, root, "", new NoEngine());
        var second = new DockerComposeSession(restored, root, "", new NoEngine());
        Assert.Matches("^mavisrun-[0-9a-f]{32}$", first.ResourceProject);
        Assert.NotEqual(first.ResourceProject, second.ResourceProject);
    }

    [MAVIS.Worker.Tests.CSharp.LinuxOnlyFact]
    public async Task LinkedStateRootIsRejectedWithoutChangingTarget()
    {
        Directory.CreateDirectory(root);
        var target = Path.Combine(root, "target");
        Directory.CreateDirectory(target);
        var link = Path.Combine(root, "linked");
        Directory.CreateSymbolicLink(link, target);
        var docker = new NoEngine();
        var backend = new DockerComposeSession(Definition(), link, "receivers: {}", docker);
        await RuntimeSessionLifecycle.RunAsync(backend, 5);
        Assert.False(backend.AllocationReserved);
        Assert.Empty(Directory.GetFileSystemEntries(target));
        Assert.Equal(0, docker.Calls);
    }

    public void Dispose() { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
}

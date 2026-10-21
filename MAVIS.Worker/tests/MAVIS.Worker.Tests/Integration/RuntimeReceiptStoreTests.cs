using MAVIS.Runner;
using Xunit;

namespace MAVIS.Worker.Tests.Integration;

public sealed class RuntimeReceiptStoreTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "mavis-receipt-" + Guid.NewGuid().ToString("N"));
    private const string Project = "mavisrun-0123456789abcdef0123456789abcdef";
    [Fact]
    public void ReceiptIsPublishedAndCannotBeOverwritten()
    {
        var json = "{\"resourceProject\":\"" + Project + "\",\"outcome\":{\"cleanupStatus\":\"Confirmed\"}}";
        var path = RuntimeReceiptStore.Save(root, Project, json);
        Assert.Equal(json, File.ReadAllText(path));
        Assert.Throws<IOException>(() => RuntimeReceiptStore.Save(root, Project, json));
        Assert.Single(Directory.GetFiles(Path.Combine(root, "receipts")));
    }
    [Fact]
    public void InvalidScopeAndMismatchedReceiptCreateNoOutput()
    {
        Assert.Throws<ArgumentException>(() => RuntimeReceiptStore.Save(root, "../outside", "{}"));
        Assert.Throws<ArgumentException>(() => RuntimeReceiptStore.Save(root, Project, "{\"resourceProject\":\"other\"}"));
        Assert.False(Directory.Exists(root));
    }
    public void Dispose() { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
}

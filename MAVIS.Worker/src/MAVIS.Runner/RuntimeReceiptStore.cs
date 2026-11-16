using System.Text;
using System.Text.Json;

namespace MAVIS.Runner;

/// <summary>Operator-owned local outbox; does not acknowledge delivery to Java.</summary>
public static class RuntimeReceiptStore
{
    public static string Save(string stateRoot, string resourceProject, string receipt)
    {
        if (!Path.IsPathFullyQualified(stateRoot) || resourceProject.Length != 41 ||
            !resourceProject.StartsWith("mavisrun-", StringComparison.Ordinal) || !resourceProject[9..].All(Uri.IsHexDigit))
            throw new ArgumentException("Invalid receipt scope.");
        var bytes = Encoding.UTF8.GetBytes(receipt);
        if (bytes.Length > 32 * 1024 * 1024) throw new ArgumentException("Receipt exceeds storage budget.");
        using var document = JsonDocument.Parse(bytes);
        if (document.RootElement.GetProperty("resourceProject").GetString() != resourceProject)
            throw new ArgumentException("Receipt project mismatch.");
        var root = Path.Combine(Path.GetFullPath(stateRoot), "receipts");
        RejectLinks(root);
        Directory.CreateDirectory(root);
        RejectLinks(root);
        var target = Path.Combine(root, resourceProject + ".json");
        var temporary = Path.Combine(root, ".receipt-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                file.Write(bytes);
                file.Flush(flushToDisk: true);
            }
            File.Move(temporary, target, overwrite: false);
            return target;
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    private static void RejectLinks(string path)
    {
        for (DirectoryInfo? current = new(path); current is not null; current = current.Parent)
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new ArgumentException("Linked receipt directories are not supported.");
    }
}

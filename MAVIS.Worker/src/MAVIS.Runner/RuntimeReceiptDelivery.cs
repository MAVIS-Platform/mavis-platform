using System.Text;
using System.Text.Json;

namespace MAVIS.Runner;

public sealed class RuntimeReceiptDelivery(JavaRuntimeClient java)
{
    public async Task<string> DeliverAsync(string stateRoot, string resourceProject, CancellationToken ct = default)
    {
        _ = RuntimeAllocation.ProjectName(resourceProject);
        if (!Path.IsPathFullyQualified(stateRoot)) throw new ArgumentException("Absolute state root required.");
        var directory = Path.Combine(stateRoot, "receipts");
        var receiptPath = Path.Combine(directory, resourceProject + ".json");
        var ackPath = Path.Combine(directory, resourceProject + ".ack.json");
        var lockPath = Path.Combine(directory, resourceProject + ".delivery.lock");
        foreach (var path in new[] { receiptPath, ackPath, lockPath }) RuntimeAllocation.RejectLinks(path);
        using var lease = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        if (new FileInfo(receiptPath).Length > 32 * 1024 * 1024) throw new ArgumentException("Receipt exceeds budget.");
        var receipt = await File.ReadAllTextAsync(receiptPath, ct);
        var digest = ReceiptCanonicalJson.Digest(receipt);
        using var document = JsonDocument.Parse(receipt);
        var root = document.RootElement;
        var sessionId = root.GetProperty("sessionId").GetString() ?? throw new ArgumentException("Missing session ID.");
        JavaRuntimeClient.RequireIdentity(root, sessionId, resourceProject);
        if (File.Exists(ackPath))
        {
            if (new FileInfo(ackPath).Length > 1_048_576) throw new ArgumentException("Ack exceeds budget.");
            Validate(await File.ReadAllTextAsync(ackPath, ct), sessionId, resourceProject, digest);
            return ackPath;
        }
        var response = await java.PostReceiptAsync(sessionId, receipt, ct);
        Validate(response, sessionId, resourceProject, digest);
        var temporary = Path.Combine(directory, ".ack-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                file.Write(Encoding.UTF8.GetBytes(response));
                file.Flush(flushToDisk: true);
            }
            File.Move(temporary, ackPath, overwrite: false);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        return ackPath;
    }

    private static void Validate(string json, string sessionId, string project, string digest)
    {
        using var document = JsonDocument.Parse(json);
        var ack = JavaRuntimeClient.Data(document.RootElement);
        JavaRuntimeClient.RequireIdentity(ack, sessionId, project);
        if (ack.GetProperty("receiptDigest").GetString() != digest ||
            ack.GetProperty("persistenceStatus").GetString() is not ("COMMITTED" or "ALREADY_COMMITTED"))
            throw new InvalidOperationException("Receipt acknowledgement digest/status mismatch.");
    }
}

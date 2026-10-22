using System.Text.Json;

namespace MAVIS.Runner;

/// <summary>Persistent no-reuse reservation. Call under the operator state-root allocator lease.</summary>
internal static class RuntimeAllocation
{
    public static string ProjectName(string? supplied)
    {
        var project = supplied ?? "mavisrun-" + Guid.NewGuid().ToString("N");
        if (project.Length != 41 || !project.StartsWith("mavisrun-", StringComparison.Ordinal) ||
            project[9..].Any(c => c is not (>= '0' and <= '9') and not (>= 'a' and <= 'f')))
            throw new ArgumentException("Invalid runtime allocation ID.");
        return project;
    }

    public static void RejectLinks(string path)
    {
        for (var current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
        {
            try
            {
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new ArgumentException("Linked allocation paths are not supported.");
            }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
        }
    }

    public static string Reserve(string stateRoot, string project, RuntimeRunDefinition definition)
    {
        var directory = Path.Combine(stateRoot, project);
        var receipt = Path.Combine(stateRoot, "receipts", project + ".json");
        var ack = Path.Combine(stateRoot, "receipts", project + ".ack.json");
        RejectLinks(directory);
        RejectLinks(receipt);
        RejectLinks(ack);
        if (Path.Exists(directory) || Path.Exists(receipt) || Path.Exists(ack))
            throw new IOException("Runtime allocation has already been used.");

        // The reservation survives directory cleanup, recovery, and a crash before receipt publication.
        WriteReservation(stateRoot, project, new
        {
            resourceProject = project, definition.SessionId, definition.ModelVersionId, definition.SourceSnapshotId,
            definition.ProfileVersionId, definition.RunConfigurationVersionId, definition.ScenarioVersionId
        });
        Directory.CreateDirectory(directory);
        return directory;
    }

    public static void RetainRecoveryReservation(string stateRoot, string project)
    {
        var reservation = ReservationPath(stateRoot, project);
        RejectLinks(reservation);
        if (!Path.Exists(reservation)) WriteReservation(stateRoot, project, new { resourceProject = project });
    }

    private static string ReservationPath(string stateRoot, string project) =>
        Path.Combine(stateRoot, ".allocation-" + project + ".json");

    private static void WriteReservation(string stateRoot, string project, object scope)
    {
        var path = ReservationPath(stateRoot, project);
        RejectLinks(path);
        using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough);
        JsonSerializer.Serialize(file, scope);
        file.Flush(flushToDisk: true);
    }
}

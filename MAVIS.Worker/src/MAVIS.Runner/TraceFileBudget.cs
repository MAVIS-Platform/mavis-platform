namespace MAVIS.Runner;

/// <summary>Keeps trace reads inside a byte budget so long or busy sessions degrade to partial evidence instead of failing.</summary>
public static class TraceFileBudget
{
    public const long LiveBudgetBytes = 4L * 1024 * 1024;
    public const long FinalBudgetBytes = 12L * 1024 * 1024;

    /// <summary>Newest files first until the budget is used; returns them oldest-first for stable parsing.</summary>
    /// <remarks>Ordered by collector rotation name, not mtime: `docker cp` may not preserve timestamps.
    /// "traces.json" is the live file; rotated backups are "traces-&lt;timestamp&gt;.json" and sort chronologically by name.</remarks>
    public static IReadOnlyList<string> Select(IEnumerable<string> paths, long budgetBytes, out bool truncated)
    {
        truncated = false;
        var selected = new List<string>();
        long used = 0;
        var newestFirst = paths
            .OrderBy(p => Path.GetFileName(p).Equals("traces.json", StringComparison.Ordinal) ? 0 : 1)
            .ThenByDescending(p => Path.GetFileName(p), StringComparer.Ordinal);
        foreach (var path in newestFirst)
        {
            var length = new FileInfo(path).Length;
            if (used + length > budgetBytes)
            {
                truncated = true;
                // Always keep the newest file so live views never go blank; stop at the first gap to keep time contiguous.
                if (selected.Count == 0) selected.Add(path);
                break;
            }
            used += length;
            selected.Add(path);
        }
        selected.Reverse();
        return selected;
    }

    /// <summary>Reads at most <paramref name="maxBytes"/> from the end of an NDJSON file, dropping the first partial line.</summary>
    public static async Task<(string Text, bool Truncated)> ReadTailAsync(string path, long maxBytes, CancellationToken ct)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        if (stream.Length <= maxBytes)
        {
            using var whole = new StreamReader(stream);
            return (await whole.ReadToEndAsync(ct), false);
        }
        stream.Seek(-maxBytes, SeekOrigin.End);
        using var reader = new StreamReader(stream);
        var text = await reader.ReadToEndAsync(ct);
        var firstNewline = text.IndexOf('\n');
        return (firstNewline >= 0 ? text[(firstNewline + 1)..] : "", true);
    }
}

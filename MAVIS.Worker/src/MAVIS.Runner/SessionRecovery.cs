namespace MAVIS.Runner;

public static class SessionRecovery
{
    public static async Task<bool> RecoverAsync(string stateRoot, string project, IDockerCommands docker, CancellationToken ct = default)
    {
        if (!Path.IsPathFullyQualified(stateRoot) || project.Length != 41 || !project.StartsWith("mavisrun-", StringComparison.Ordinal) || !project[9..].All(Uri.IsHexDigit))
            throw new ArgumentException("Recovery requires an exact generated session project and an absolute operator state root.");
        var directory = Path.Combine(Path.GetFullPath(stateRoot), project);
        for (DirectoryInfo? current = new(directory); current is not null; current = current.Parent)
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0) throw new ArgumentException("Linked recovery paths are not supported.");
        if (!File.Exists(Path.Combine(directory, "compose.yaml")) || !File.Exists(Path.Combine(directory, "override.json")))
            throw new ArgumentException("No recoverable session files exist at this location.");
        using var lease = new FileStream(Path.Combine(stateRoot, "runner.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(30));
        var down = await docker.RunAsync(["compose", "--project-name", project, "--file", Path.Combine(directory, "compose.yaml"),
            "--file", Path.Combine(directory, "override.json"), "down", "--volumes", "--remove-orphans", "--timeout", "5"], directory, 15, deadline.Token);
        if (down.ExitCode != 0) return false;
        foreach (var args in new string[][] { ["ps", "-aq"], ["volume", "ls", "-q"], ["network", "ls", "-q"] })
        {
            var result = await docker.RunAsync(args.Concat(new[] { "--filter", "label=com.docker.compose.project=" + project }).ToArray(), directory, 10, deadline.Token);
            if (result.ExitCode != 0 || !string.IsNullOrWhiteSpace(result.StandardOutput)) return false;
        }
        // Only this validated generated directory is deleted, after all three resource checks pass.
        Directory.Delete(directory, recursive: true);
        return true;
    }
}

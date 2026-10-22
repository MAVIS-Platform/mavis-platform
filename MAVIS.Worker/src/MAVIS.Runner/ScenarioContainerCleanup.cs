namespace MAVIS.Runner;

internal static class ScenarioContainerCleanup
{
    public static async Task<bool> RemoveAsync(IDockerCommands docker, string directory, string project, CancellationToken ct)
    {
        try
        {
            // Cancelling the docker CLI may leave a --rm helper in Created state; Compose does not own that container.
            var helpers = await docker.RunAsync(["ps", "--all", "--quiet", "--no-trunc", "--filter",
                "label=com.docker.compose.project=" + project, "--filter", "label=com.docker.compose.service=mavis-scenario"], directory, 5, ct);
            if (helpers.ExitCode != 0) return false;
            var ids = helpers.StandardOutput.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (ids.Length > 128 || ids.Any(id => id.Length != 64 || !id.All(Uri.IsHexDigit))) return false;
            if (ids.Length == 0) return true;
            return (await docker.RunAsync(new[] { "rm", "--force" }.Concat(ids).ToArray(), directory, 5, ct)).ExitCode == 0;
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or OperationCanceledException or System.ComponentModel.Win32Exception)
        {
            return false; // Compose teardown must still run if helper removal fails.
        }
    }
}

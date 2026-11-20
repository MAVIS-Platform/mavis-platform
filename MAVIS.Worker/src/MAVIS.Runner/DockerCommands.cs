using System.Diagnostics;
using System.Text;

namespace MAVIS.Runner;

public sealed record DockerCommandResult(int ExitCode, string StandardOutput, string? StandardError = null);

public interface IDockerCommands
{
    Task<DockerCommandResult> RunAsync(IReadOnlyList<string> arguments, string workingDirectory, int timeoutSeconds, CancellationToken ct);
    Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> arguments, string workingDirectory, int timeoutSeconds, string input, CancellationToken ct)
        => throw new NotSupportedException("Docker stdin adapter is required.");
    Task<IAsyncDisposable?> StartLineStreamAsync(IReadOnlyList<string> arguments, string workingDirectory, string? input, Action<string> onLine, CancellationToken ct)
        => Task.FromResult<IAsyncDisposable?>(null);
}

/// <summary>ArgumentList avoids shell interpolation. Output is bounded and stderr is never returned as project diagnostics.</summary>
public sealed class DockerCommands : IDockerCommands
{
    public async Task<DockerCommandResult> RunAsync(IReadOnlyList<string> arguments, string workingDirectory, int timeoutSeconds, CancellationToken ct)
        => await ExecuteAsync(arguments, workingDirectory, timeoutSeconds, null, ct);

    public async Task<DockerCommandResult> RunWithInputAsync(IReadOnlyList<string> arguments, string workingDirectory, int timeoutSeconds, string input, CancellationToken ct)
        => await ExecuteAsync(arguments, workingDirectory, timeoutSeconds, input, ct);

    public async Task<IAsyncDisposable?> StartLineStreamAsync(IReadOnlyList<string> arguments, string workingDirectory, string? input, Action<string> onLine, CancellationToken ct)
    {
        var start = new ProcessStartInfo("docker")
        {
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = input is not null,
            CreateNoWindow = true
        };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        var process = Process.Start(start);
        if (process is null) return null;
        if (input is not null)
        {
            await process.StandardInput.WriteAsync(input.AsMemory(), ct);
            process.StandardInput.Close();
        }
        var streamCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var stdoutTask = Task.Run(async () =>
        {
            try
            {
                while (!streamCts.IsCancellationRequested)
                {
                    var line = await process.StandardOutput.ReadLineAsync(streamCts.Token);
                    if (line is null) break;
                    if (!string.IsNullOrWhiteSpace(line)) onLine(line);
                }
            }
            catch (OperationCanceledException) { }
            catch (IOException) { }
        }, CancellationToken.None);
        var stderrTask = Task.Run(async () =>
        {
            try { while (await process.StandardError.ReadLineAsync(streamCts.Token) is not null) { } }
            catch { }
        }, CancellationToken.None);
        return new LineStreamHandle(process, streamCts, stdoutTask, stderrTask);
    }

    private sealed class LineStreamHandle(Process process, CancellationTokenSource cts, Task stdoutTask, Task stderrTask) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            cts.Cancel();
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch { }
            try { await Task.WhenAll(stdoutTask, stderrTask).WaitAsync(TimeSpan.FromSeconds(3)); } catch { }
            cts.Dispose();
            process.Dispose();
        }
    }

    private static async Task<DockerCommandResult> ExecuteAsync(IReadOnlyList<string> arguments, string workingDirectory, int timeoutSeconds, string? input, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        var start = new ProcessStartInfo("docker") { WorkingDirectory = workingDirectory, UseShellExecute = false,
            RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = input is not null, CreateNoWindow = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Docker CLI could not start.");
        var output = Read(process.StandardOutput, timeout.Token);
        var errors = Read(process.StandardError, timeout.Token);
        try
        {
            if (input is not null)
            {
                await process.StandardInput.WriteAsync(input.AsMemory(), timeout.Token);
                process.StandardInput.Close();
            }
            await process.WaitForExitAsync(timeout.Token);
            var text = await output;
            var diagnostic = await errors;
            return new(process.ExitCode, text, diagnostic);
        }
        catch
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            try { await Task.WhenAll(output, errors); } catch { }
            throw;
        }
    }

    private static async Task<string> Read(StreamReader reader, CancellationToken ct)
    {
        var output = new StringBuilder();
        var buffer = new char[4096];
        var overflow = false;
        int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), ct)) > 0)
        {
            if (output.Length + count <= 1_048_576) output.Append(buffer, 0, count);
            else overflow = true; // Drain until process exit so the child cannot deadlock on a full pipe.
        }
        if (overflow) throw new InvalidOperationException("Docker output limit exceeded.");
        return output.ToString();
    }
}

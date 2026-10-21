using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using MAVIS.Worker.Infrastructure.Jobs;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.Jobs;

public sealed class DotnetAnalysisJobTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-job-" + Guid.NewGuid().ToString("N"));
    public DotnetAnalysisJobTests() => Directory.CreateDirectory(_root);
    private DotnetAnalysisRequest Request(string job = "job") => new("p", "s", _root, job);
    private DotnetAnalysisJobService Service(IDotnetProjectAnalyzer analyzer) => new(analyzer,
        Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }));

    private sealed class ControlledAnalyzer : IDotnetProjectAnalyzer
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public int Calls;
        public async Task<DotnetAnalysisResult> AnalyzeAsync(DotnetAnalysisRequest r, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls); Started.TrySetResult(); await Release.Task.WaitAsync(ct);
            return new("1.0", r.JobId, r.ProjectId, r.SourceSnapshotId, "test", [], new(0, 0, "PartialSyntax"), []);
        }
    }

    private static async Task<DotnetJobView> Terminal(DotnetAnalysisJobService service)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (true)
        {
            var job = service.Get("job")!;
            if (job.CompletedAt is not null) return job;
            await Task.Delay(10, timeout.Token);
        }
    }

    [Fact]
    public async Task DuplicateSubmissionRunsOnceAndCompletedCancellationPreservesResult()
    {
        var analyzer = new ControlledAnalyzer(); using var service = Service(analyzer);
        service.Submit(Request()); service.Submit(Request());
        Assert.Throws<JobConflictException>(() => service.Submit(Request() with { SourceSnapshotId = "other" }));
        await service.StartAsync(CancellationToken.None);
        await analyzer.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        analyzer.Release.SetResult();
        var result = await Terminal(service);
        Assert.Equal("Completed", result.Status); Assert.NotNull(result.Result); Assert.Equal(1, analyzer.Calls);
        Assert.Equal("Completed", service.Cancel("job")!.Status);
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task RunningCancellationAcknowledgesBeforeBecomingTerminal()
    {
        var analyzer = new ControlledAnalyzer(); using var service = Service(analyzer);
        service.Submit(Request()); await service.StartAsync(CancellationToken.None);
        await analyzer.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Contains(service.Cancel("job")!.Status, new[] { "Cancelling", "Cancelled" });
        Assert.Equal("Cancelled", (await Terminal(service)).Status);
        Assert.Equal("Cancelled", service.Cancel("job")!.Status);
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task QueuedCancellationNeverExecutesAndCapacityIsBounded()
    {
        var analyzer = new ControlledAnalyzer(); using var service = Service(analyzer);
        service.Submit(Request()); Assert.Equal("Cancelled", service.Cancel("job")!.Status);
        for (var i = 0; i < 63; i++) service.Submit(Request("other-" + i));
        Assert.Throws<JobCapacityException>(() => service.Submit(Request("overflow")));
        Assert.Equal(0, analyzer.Calls);
        Assert.Throws<SourceInputException>(() => service.Submit(Request() with { ProjectId = "" }));
        Assert.Null(service.Get("missing"));
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task DeadlineExpiredInQueueDoesNotInvokeAnalyzer()
    {
        var analyzer = new ControlledAnalyzer(); using var service = Service(analyzer);
        service.Submit(Request());
        var expires = DateTimeOffset.UtcNow.AddSeconds(1);
        service.Submit(Request("late") with { DeadlineUtc = expires });
        await service.StartAsync(CancellationToken.None);
        await analyzer.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await Task.Delay(expires - DateTimeOffset.UtcNow + TimeSpan.FromMilliseconds(100));
        analyzer.Release.TrySetResult();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (service.Get("late")!.CompletedAt is null) await Task.Delay(10, timeout.Token);
        Assert.Equal("TimedOut", service.Get("late")!.Status);
        Assert.Equal(1, analyzer.Calls);
        Assert.Equal("TimedOut", service.Cancel("late")!.Status);
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task AbsoluteDeadlineCancelsRunningAttemptWithoutReportingUserCancellation()
    {
        var analyzer = new ControlledAnalyzer(); using var service = Service(analyzer);
        service.Submit(Request() with { DeadlineUtc = DateTimeOffset.UtcNow.AddSeconds(1) });
        await service.StartAsync(CancellationToken.None);
        var result = await Terminal(service);
        Assert.Equal("TimedOut", result.Status);
        Assert.Null(result.Result);
        Assert.Equal("Analysis deadline exceeded.", result.Error);
        await service.StopAsync(CancellationToken.None);
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}

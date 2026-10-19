using System.Threading.Channels;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Infrastructure.Jobs;

/// <summary>Bounded local job lifecycle. Explicitly ephemeral; Java owns durable public job state.</summary>
public sealed class DotnetAnalysisJobService(IDotnetProjectAnalyzer analyzer, IOptions<DotnetAnalysisOptions> options)
    : BackgroundService, IDotnetAnalysisJobs
{
    private sealed class Entry(DotnetAnalysisRequest request)
    {
        public DotnetAnalysisRequest Request { get; } = request;
        public CancellationTokenSource Cancellation { get; } = new();
        public string Status { get; set; } = "Queued";
        public DateTimeOffset Created { get; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? Completed { get; set; }
        public DotnetAnalysisResult? Result { get; set; }
        public string? Error { get; set; }
        public DotnetJobView View() => new(Request.JobId, Request.SourceSnapshotId, Status, Created, Completed, Result, Error);
    }

    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private readonly Channel<Entry> _queue = Channel.CreateBounded<Entry>(new BoundedChannelOptions(64)
        { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });

    public DotnetJobView Submit(DotnetAnalysisRequest request)
    {
        DotnetRequestValidator.Validate(request);
        DotnetProjectAnalyzer.ValidateRoot(request.SourceLocation, options.Value.AllowedSourceRoots);
        lock (_gate)
        {
            if (_entries.TryGetValue(request.JobId, out var existing))
            {
                if (existing.Request != request) throw new JobConflictException("jobId already belongs to different input.");
                return existing.View();
            }
            foreach (var expired in _entries.Where(e => e.Value.Completed < DateTimeOffset.UtcNow.AddMinutes(-30)).Select(e => e.Key).ToArray())
            {
                _entries[expired].Cancellation.Dispose();
                _entries.Remove(expired);
            }
            if (_entries.Count >= 256) throw new JobCapacityException("Local job retention capacity reached; retry after terminal records expire.");
            var entry = new Entry(request);
            _entries.Add(request.JobId, entry);
            if (!_queue.Writer.TryWrite(entry))
            {
                _entries.Remove(request.JobId);
                entry.Cancellation.Dispose();
                throw new JobCapacityException("Analysis queue is full.");
            }
            return entry.View();
        }
    }

    public DotnetJobView? Get(string jobId) { lock (_gate) return _entries.GetValueOrDefault(jobId)?.View(); }

    public DotnetJobView? Cancel(string jobId)
    {
        lock (_gate)
        {
            if (!_entries.TryGetValue(jobId, out var entry)) return null;
            if (entry.Status is "Completed" or "Failed" or "Cancelled") return entry.View();
            var queued = entry.Status == "Queued";
            entry.Status = queued ? "Cancelled" : "Cancelling";
            if (queued) entry.Completed = DateTimeOffset.UtcNow;
            entry.Cancellation.Cancel();
            return entry.View();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var entry in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                lock (_gate)
                {
                    if (!_entries.TryGetValue(entry.Request.JobId, out var current) || !ReferenceEquals(current, entry) || entry.Status == "Cancelled") continue;
                    entry.Status = "Running";
                }
                using var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, entry.Cancellation.Token);
                try
                {
                    var result = await analyzer.AnalyzeAsync(entry.Request, linked.Token);
                    lock (_gate)
                    {
                        if (entry.Cancellation.IsCancellationRequested) entry.Status = "Cancelled";
                        else { entry.Result = result; entry.Status = "Completed"; }
                    }
                }
                catch (OperationCanceledException)
                {
                    lock (_gate)
                    {
                        entry.Status = linked.IsCancellationRequested ? "Cancelled" : "Failed";
                        entry.Error = linked.IsCancellationRequested ? null : "Analysis deadline exceeded.";
                    }
                }
                catch (Exception ex)
                {
                    lock (_gate)
                    {
                        entry.Status = entry.Cancellation.IsCancellationRequested ? "Cancelled" : "Failed";
                        // Do not expose exception paths/source values through job diagnostics.
                        entry.Error = ex is SourceInputException ? ex.Message : "Analysis failed; check source availability and supported profile.";
                    }
                }
                finally { lock (_gate) entry.Completed = DateTimeOffset.UtcNow; }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally
        {
            lock (_gate)
                foreach (var entry in _entries.Values.Where(e => e.Completed is null))
                { entry.Status = "Cancelled"; entry.Completed = DateTimeOffset.UtcNow; }
        }
    }
}

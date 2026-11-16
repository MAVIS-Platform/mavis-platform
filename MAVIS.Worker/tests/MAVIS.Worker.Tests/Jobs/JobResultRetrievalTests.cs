using MAVIS.Worker.Application.Jobs;
using MAVIS.Worker.Infrastructure.Jobs;
using Xunit;

namespace MAVIS.Worker.Tests.Jobs;

public class JobResultRetrievalTests
{
    [Fact]
    public async Task GetStatusAsync_ReturnsNull_WhenJobNotFound()
    {
        var queue = new InMemoryJobQueue();

        var status = await queue.GetStatusAsync("non-existent-id");

        Assert.Null(status);
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsQueued_WhenJobEnqueued()
    {
        var queue = new InMemoryJobQueue();

        var jobId = await queue.EnqueueAsync("TestJob", new { Value = 123 });
        var status = await queue.GetStatusAsync(jobId);

        Assert.NotNull(status);
        Assert.Equal(jobId, status.JobId);
        Assert.Equal("TestJob", status.JobType);
        Assert.Equal("Queued", status.Status);
        Assert.Null(status.StartedAt);
        Assert.Null(status.CompletedAt);
        Assert.Null(status.ResultJson);
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsProcessing_WhenJobDequeued()
    {
        var queue = new InMemoryJobQueue();

        var jobId = await queue.EnqueueAsync("TestJob", new { Value = 123 });
        await queue.DequeueAsync();
        var status = await queue.GetStatusAsync(jobId);

        Assert.NotNull(status);
        Assert.Equal("Processing", status.Status);
        Assert.NotNull(status.StartedAt);
        Assert.Null(status.CompletedAt);
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsCompleted_WithResult()
    {
        var queue = new InMemoryJobQueue();

        var jobId = await queue.EnqueueAsync("TestJob", new { Value = 123 });
        await queue.DequeueAsync();
        
        var resultJson = """{"output":"success","count":42}""";
        await queue.SetResultAsync(jobId, resultJson);
        await queue.CompleteAsync(jobId, success: true);

        var status = await queue.GetStatusAsync(jobId);

        Assert.NotNull(status);
        Assert.Equal("Completed", status.Status);
        Assert.NotNull(status.CompletedAt);
        Assert.Equal(resultJson, status.ResultJson);
        Assert.Null(status.Error);
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsFailed_WithError()
    {
        var queue = new InMemoryJobQueue();

        var jobId = await queue.EnqueueAsync("TestJob", new { Value = 123 });
        await queue.DequeueAsync();
        await queue.CompleteAsync(jobId, success: false, error: "Something went wrong");

        var status = await queue.GetStatusAsync(jobId);

        Assert.NotNull(status);
        Assert.Equal("Failed", status.Status);
        Assert.NotNull(status.CompletedAt);
        Assert.Equal("Something went wrong", status.Error);
        Assert.Null(status.ResultJson);
    }
}

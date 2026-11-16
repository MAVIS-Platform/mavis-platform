using MAVIS.Worker.Application.Jobs;
using Xunit;

namespace MAVIS.Worker.Tests.Jobs;

public class InMemoryJobQueueTests
{
    [Fact]
    public async Task EnqueueAsync_CreatesJobWithId()
    {
        var queue = new Infrastructure.Jobs.InMemoryJobQueue();

        var jobId = await queue.EnqueueAsync("TestJob", new { Foo = "bar" });

        Assert.NotNull(jobId);
        Assert.NotEmpty(jobId);
    }

    [Fact]
    public async Task DequeueAsync_ReturnsJobInFifoOrder()
    {
        var queue = new Infrastructure.Jobs.InMemoryJobQueue();

        var id1 = await queue.EnqueueAsync("Job1", new { Value = 1 });
        var id2 = await queue.EnqueueAsync("Job2", new { Value = 2 });

        var job1 = await queue.DequeueAsync();
        var job2 = await queue.DequeueAsync();

        Assert.NotNull(job1);
        Assert.NotNull(job2);
        Assert.Equal(id1, job1.JobId);
        Assert.Equal(id2, job2.JobId);
        Assert.Equal("Job1", job1.JobType);
        Assert.Equal("Job2", job2.JobType);
    }

    [Fact]
    public async Task DequeueAsync_ReturnsNull_WhenQueueEmpty()
    {
        var queue = new Infrastructure.Jobs.InMemoryJobQueue();

        var job = await queue.DequeueAsync();

        Assert.Null(job);
    }

    [Fact]
    public async Task CompleteAsync_MarksJobComplete()
    {
        var queue = new Infrastructure.Jobs.InMemoryJobQueue();

        var jobId = await queue.EnqueueAsync("TestJob", new { Foo = "bar" });
        await queue.DequeueAsync();

        // Should not throw
        await queue.CompleteAsync(jobId, success: true);
    }

    [Fact]
    public async Task CompleteAsync_WithError_StoresError()
    {
        var queue = new Infrastructure.Jobs.InMemoryJobQueue();

        var jobId = await queue.EnqueueAsync("TestJob", new { Foo = "bar" });
        await queue.DequeueAsync();

        // Should not throw
        await queue.CompleteAsync(jobId, success: false, error: "Something went wrong");
    }

    [Fact]
    public async Task EnqueueAsync_SerializesPayload()
    {
        var queue = new Infrastructure.Jobs.InMemoryJobQueue();
        var payload = new { ProjectId = "proj-123", Findings = new[] { 1, 2, 3 } };

        await queue.EnqueueAsync("AnalysisRequest", payload);
        var job = await queue.DequeueAsync();

        Assert.NotNull(job);
        Assert.Contains("proj-123", job.PayloadJson);
        Assert.Contains("[1,2,3]", job.PayloadJson);
    }
}

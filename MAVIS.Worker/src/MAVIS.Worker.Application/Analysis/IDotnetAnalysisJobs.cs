namespace MAVIS.Worker.Application.Analysis;

public static class DotnetRequestValidator
{
    public static void Validate(DotnetAnalysisRequest request)
    {
        if (request.SchemaVersion != "1.0" || string.IsNullOrWhiteSpace(request.ProjectId) ||
            string.IsNullOrWhiteSpace(request.SourceSnapshotId) || string.IsNullOrWhiteSpace(request.JobId) ||
            request.JobId.Length > 128 || string.IsNullOrWhiteSpace(request.SourceLocation) ||
            request.ExpectedInputDigest is not null && (request.ExpectedInputDigest.Length != 64 || !request.ExpectedInputDigest.All(Uri.IsHexDigit)))
            throw new SourceInputException("schemaVersion 1.0, projectId, sourceSnapshotId, jobId (up to 128 characters) and sourceLocation are required.");
    }
}

public sealed record DotnetJobView(string JobId, string SourceSnapshotId, string Status,
    DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt, DotnetAnalysisResult? Result, string? Error,
    bool Ephemeral = true, string? AttemptId = null);

public interface IDotnetAnalysisJobs
{
    DotnetJobView Submit(DotnetAnalysisRequest request);
    DotnetJobView? Get(string jobId, string? attemptId = null);
    DotnetJobView? Cancel(string jobId, string? attemptId = null);
}

public sealed class JobConflictException(string message) : Exception(message);
public sealed class JobCapacityException(string message) : Exception(message);

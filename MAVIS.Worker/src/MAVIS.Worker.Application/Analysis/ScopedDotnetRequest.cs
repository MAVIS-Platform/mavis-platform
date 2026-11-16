using System.Text.Json.Serialization;

namespace MAVIS.Worker.Application.Analysis;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ScopedDotnetRequest(string SchemaVersion, string ArtifactGrant);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ArtifactGrantClaims(string SchemaVersion, string Audience, string ProjectId,
    string SourceSnapshotId, string JobId, string AttemptId, string ArtifactId,
    string ExpectedInputDigest, DateTimeOffset DeadlineUtc);

public interface IArtifactScopeResolver
{
    bool IsReady { get; }
    DotnetAnalysisRequest Resolve(ScopedDotnetRequest request);
}

public sealed class ArtifactGrantException : Exception;
public sealed class AnalysisDeadlineException : OperationCanceledException;

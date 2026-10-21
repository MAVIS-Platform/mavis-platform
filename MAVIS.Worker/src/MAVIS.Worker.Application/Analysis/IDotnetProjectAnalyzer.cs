namespace MAVIS.Worker.Application.Analysis;

public sealed record DotnetAnalysisRequest(string ProjectId, string SourceSnapshotId, string SourceLocation,
    string JobId, string SchemaVersion = "1.0", string? ExpectedInputDigest = null,
    string? AttemptId = null, DateTimeOffset? DeadlineUtc = null);

public sealed record SourceReference(string FilePath, int StartLine, int EndLine);
public sealed record DotnetFinding(string Kind, string ProjectPath, string? Target, string? HttpMethod,
    SourceReference Evidence, string? Subject = null, string? Id = null,
    IReadOnlyList<SourceReference>? AdditionalEvidence = null, string Confidence = "Syntax",
    string ResolutionStatus = "Candidate");
public sealed record DotnetProjectContext(string Id, string ProjectPath, string RootPath, string Name);
public sealed record AnalysisWarning(string Code, string Message, string? FilePath = null);
public sealed record DotnetCoverage(int DiscoveredFiles, int AnalyzedFiles, string Mode);
public sealed record DotnetAnalysisResult(string SchemaVersion, string JobId, string ProjectId,
    string SourceSnapshotId, string AnalyzerVersion, IReadOnlyList<DotnetFinding> Findings,
    DotnetCoverage Coverage, IReadOnlyList<AnalysisWarning> Warnings, string? InputDigest = null,
    string? AttemptId = null, IReadOnlyList<DotnetProjectContext>? Projects = null);

public interface IDotnetProjectAnalyzer
{
    Task<DotnetAnalysisResult> AnalyzeAsync(DotnetAnalysisRequest request, CancellationToken ct);
}

public sealed class SourceInputException(string message) : Exception(message);

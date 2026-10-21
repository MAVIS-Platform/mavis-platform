namespace MAVIS.Worker.Application.Analysis;

public sealed record DotnetAnalysisRequest(string ProjectId, string SourceSnapshotId, string SourceLocation,
    string JobId, string SchemaVersion = "1.0", string? ExpectedInputDigest = null,
    string? AttemptId = null, DateTimeOffset? DeadlineUtc = null);

public sealed record SourceReference(string FilePath, int StartLine, int EndLine, int? StartColumn = null, int? EndColumn = null);
public sealed record DotnetFinding(string Kind, string ProjectPath, string? Target, string? HttpMethod,
    SourceReference Evidence, string? Subject = null, string? Id = null,
    IReadOnlyList<SourceReference>? AdditionalEvidence = null, string Confidence = "Syntax",
    string ResolutionStatus = "Candidate", IReadOnlyDictionary<string, string>? Properties = null,
    string Origin = "STATIC_CODE", IReadOnlyList<string>? EvidenceIds = null);
public sealed record DotnetProjectContext(string Id, string ProjectPath, string RootPath, string Name);
public sealed record AnalysisWarning(string Code, string Message, string? FilePath = null);
public sealed record DotnetCoverage(int DiscoveredFiles, int AnalyzedFiles, string Mode, int SkippedFiles = 0,
    IReadOnlyList<string>? Profiles = null);
public sealed record DotnetAnalysisResult(string SchemaVersion, string JobId, string ProjectId,
    string SourceSnapshotId, string AnalyzerVersion, IReadOnlyList<DotnetFinding> Findings,
    DotnetCoverage Coverage, IReadOnlyList<AnalysisWarning> Warnings, string? InputDigest = null,
    string? AttemptId = null, IReadOnlyList<DotnetProjectContext>? Projects = null, DotnetCanonicalBundle? Canonical = null);

public sealed record DotnetCanonicalEvidence(string Id, string SourceSnapshotId, string AdapterVersion, string Origin,
    SourceReference Location, string Locator, string FileHash, string EvidenceHash);
public sealed record DotnetCanonicalElement(string Id, string Kind, string Name, string ProjectPath, string ResolutionStatus,
    IReadOnlyList<string> EvidenceIds, IReadOnlyDictionary<string, string>? Properties = null);
public sealed record DotnetCanonicalRelationship(string Id, string FromId, string ToId, string Type, string DependencyKind,
    string ResolutionStatus, IReadOnlyList<string> EvidenceIds, string Origin = "STATIC_CODE");
public sealed record DotnetCanonicalBundle(string SchemaVersion, bool RequiresCanonicalMerge,
    IReadOnlyList<DotnetCanonicalElement> Elements, IReadOnlyList<DotnetCanonicalRelationship> Relationships,
    IReadOnlyList<DotnetCanonicalEvidence> Evidence);

public interface IDotnetProjectAnalyzer
{
    Task<DotnetAnalysisResult> AnalyzeAsync(DotnetAnalysisRequest request, CancellationToken ct);
}

public sealed class SourceInputException(string message) : Exception(message);

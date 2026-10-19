namespace MAVIS.Worker.Application.Impact;

public sealed record ImpactEdge(string Id, string From, string To, string Kind, IReadOnlyList<string> EvidenceIds);
public sealed record RuntimeImpactObservation(string SessionId, string ModelVersionId, string From, string To, string TraceId, bool MappingConfirmed);
public sealed record VersionedImpactRequest(string ModelVersionId, string GraphModelVersionId, string GraphRevisionId,
    bool GraphReady, string TargetServiceId, IReadOnlyList<string> ServiceIds, IReadOnlyList<ImpactEdge> Edges,
    int MaxDepth = 10, IReadOnlyList<RuntimeImpactObservation>? Runtime = null);
public sealed record ImpactPathView(string ServiceId, string Classification, int Distance, IReadOnlyList<string> Hops,
    IReadOnlyList<string> EdgeIds, IReadOnlyList<string> EvidenceIds);
public sealed record VersionedImpactResult(string ModelVersionId, string GraphRevisionId, string TargetServiceId,
    IReadOnlyList<ImpactPathView> AffectedServices, bool Truncated, IReadOnlyList<string> Warnings,
    IReadOnlyList<RuntimeImpactObservation> RuntimeContext);
public interface IVersionedImpactAnalyzer { VersionedImpactResult Analyze(VersionedImpactRequest request); }

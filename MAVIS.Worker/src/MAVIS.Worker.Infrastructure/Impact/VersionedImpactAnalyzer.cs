using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Domain.Graph;

namespace MAVIS.Worker.Infrastructure.Impact;

/// <summary>Version/evidence adapter around the existing reverse BFS, not a second traversal engine.</summary>
public sealed class VersionedImpactAnalyzer(IImpactAnalyzer engine) : IVersionedImpactAnalyzer
{
    public VersionedImpactResult Analyze(VersionedImpactRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.ModelVersionId) || r.ModelVersionId != r.GraphModelVersionId || !r.GraphReady ||
            string.IsNullOrWhiteSpace(r.GraphRevisionId) || r.MaxDepth is < 1 or > 100 || r.MaxPaths is < 1 or > 10_000 ||
            r.ServiceIds is null || r.Edges is null || r.ServiceIds.Count > 10_000 || r.Edges.Count > 50_000 ||
            (r.Runtime?.Count ?? 0) > 50_000)
            throw new SourceInputException("A ready graph matching the selected model and valid bounded inputs are required.");
        var services = r.ServiceIds.ToHashSet(StringComparer.Ordinal);
        if (services.Count != r.ServiceIds.Count || services.Any(string.IsNullOrWhiteSpace) || !services.Contains(r.TargetServiceId))
            throw new SourceInputException("Service identities must be unique; selected service must belong to the graph.");
        if (r.Edges.Any(e => e is null || string.IsNullOrWhiteSpace(e.Id) || !services.Contains(e.From) || !services.Contains(e.To) ||
                e.EvidenceIds is null || e.EvidenceIds.Any(string.IsNullOrWhiteSpace)) || r.Edges.Select(e => e.Id).Distinct().Count() != r.Edges.Count)
            throw new SourceInputException("Edges must have unique IDs, known endpoints and valid evidence references.");
        var warnings = new List<string>();
        // Contract explicitly allows service-level dependencies only. Containment/code relations are not inferred impact edges.
        var edges = r.Edges.Where(e => e.Kind is "HttpRestCall" or "ServiceDependency").OrderBy(e => e.Id, StringComparer.Ordinal).ToArray();
        if (edges.Length != r.Edges.Count) warnings.Add("UNSUPPORTED_RELATION_TYPES_EXCLUDED");
        if (edges.Any(e => e.EvidenceIds.Count == 0)) warnings.Add("SOURCE_EVIDENCE_MISSING");
        var graph = new DirectedGraph();
        foreach (var edge in edges) graph.AddEdge(edge.From, edge.To);
        var edgeLookup = edges.GroupBy(e => (e.From, e.To)).ToDictionary(g => g.Key, g => g.ToArray());
        var impact = engine.Analyze(graph, r.TargetServiceId, r.MaxDepth);
        var distances = impact.AffectedServices.ToDictionary(a => a.ServiceId, a => a.Distance);
        distances[r.TargetServiceId] = 0;
        // Prefer direct/nearer dependencies, then stable service identity, regardless of input order.
        // Bound response enrichment; the shared BFS still evaluates the bounded graph for depth coverage.
        var paths = impact.Paths.OrderBy(path => distances[path.FromServiceId])
            .ThenBy(path => path.FromServiceId, StringComparer.Ordinal).Take(r.MaxPaths).Select(path =>
        {
            var pathEdges = path.Hops.Zip(path.Hops.Skip(1), (from, to) =>
                edgeLookup[(from, to)]).SelectMany(e => e).ToArray();
            var distance = distances[path.FromServiceId];
            return new ImpactPathView(path.FromServiceId, distance == 1 ? "Direct" : "Indirect", distance,
                path.Hops, pathEdges.Select(e => e.Id).ToArray(), pathEdges.SelectMany(e => e.EvidenceIds).Distinct().ToArray());
        }).ToArray();
        var truncated = edges.Any(e => distances.TryGetValue(e.To, out var depth) && depth == r.MaxDepth && !distances.ContainsKey(e.From));
        if (truncated) warnings.Add("MAX_DEPTH_REACHED");
        if (impact.Paths.Count > r.MaxPaths)
        {
            truncated = true;
            warnings.Add("MAX_PATHS_REACHED");
        }
        warnings.Add("ONE_SHORTEST_PATH_PER_SERVICE");
        warnings.Add("EMPTY_RESULT_DOES_NOT_PROVE_ABSENCE_OUTSIDE_COVERAGE");
        var runtime = new List<RuntimeImpactObservation>();
        foreach (var observation in r.Runtime ?? [])
        {
            if (observation is null || !observation.MappingConfirmed || observation.ModelVersionId != r.ModelVersionId ||
                string.IsNullOrWhiteSpace(observation.TraceId) || string.IsNullOrWhiteSpace(observation.SessionId) ||
                !edgeLookup.ContainsKey((observation.From, observation.To)))
            { warnings.Add("INCOMPATIBLE_OR_UNMAPPED_RUNTIME_OBSERVATION"); continue; }
            runtime.Add(observation);
        }
        return new(r.ModelVersionId, r.GraphRevisionId, r.TargetServiceId, paths, truncated, warnings.Distinct().ToArray(), runtime);
    }
}

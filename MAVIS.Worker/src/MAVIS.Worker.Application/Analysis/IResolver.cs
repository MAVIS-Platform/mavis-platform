using MAVIS.Worker.Domain.Entities;

namespace MAVIS.Worker.Application.Analysis;

/// <summary>
/// Resolver interface: dedupe edges, merge evidences, assign stable IDs.
/// </summary>
public interface IResolver
{
    IReadOnlyList<DependencyEdge> Resolve(IEnumerable<DependencyEdge> edges);
}

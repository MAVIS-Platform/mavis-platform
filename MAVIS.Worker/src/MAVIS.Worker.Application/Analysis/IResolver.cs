using MAVIS.Worker.Domain.Entities;

namespace MAVIS.Worker.Application.Analysis;

/// <summary>
/// Resolve dependency edges: gom evidence, dedupe, gán ID ổn định.
/// </summary>
public interface IResolver
{
    IReadOnlyList<DependencyEdge> Resolve(IEnumerable<DependencyEdge> edges);
}

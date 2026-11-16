using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Graph;

namespace MAVIS.Worker.Application.Graph;

/// <summary>
/// Build + traverse dependency graph (in-memory, for impact analysis).
/// Can be replaced with Neo4j/RedisGraph later if the graph grows too large.
/// </summary>
public interface IGraphEngine
{
    DirectedGraph Build(IEnumerable<DependencyEdge> edges);

    IEnumerable<string> ReverseReachable(DirectedGraph graph, string startServiceId);
}

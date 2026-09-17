using MAVIS.Worker.Application.Graph;
using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Graph;

namespace MAVIS.Worker.Infrastructure.Graph;

/// <summary>
/// In-memory implementation of <see cref="IGraphEngine"/>.
/// Builds a <see cref="DirectedGraph"/> from a list of resolved dependency edges,
/// and supports reverse reachability traversal for impact analysis.
///
/// Edge direction convention: A -> B means "A depends on / calls B".
/// When B changes, we need to find every service that depends on B (traverse backwards via Incoming).
/// </summary>
public sealed class GraphEngine : IGraphEngine
{
    public DirectedGraph Build(IEnumerable<DependencyEdge> edges)
    {
        ArgumentNullException.ThrowIfNull(edges);

        var graph = new DirectedGraph();

        foreach (var edge in edges)
        {
            if (string.IsNullOrWhiteSpace(edge.FromServiceId) ||
                string.IsNullOrWhiteSpace(edge.ToServiceId))
            {
                // Skip edges without enough info to build the graph, instead of throwing,
                // so a single bad dependency doesn't fail the whole job.
                continue;
            }

            graph.AddEdge(edge.FromServiceId, edge.ToServiceId);
        }

        return graph;
    }

    public IEnumerable<string> ReverseReachable(DirectedGraph graph, string startServiceId)
    {
        ArgumentNullException.ThrowIfNull(graph);

        if (string.IsNullOrWhiteSpace(startServiceId))
        {
            return Array.Empty<string>();
        }

        var visited = new HashSet<string> { startServiceId };
        var queue = new Queue<string>();
        queue.Enqueue(startServiceId);

        var result = new List<string>();

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();

            if (!graph.Incoming.TryGetValue(current, out var predecessors))
            {
                continue;
            }

            foreach (var predecessor in predecessors)
            {
                if (!visited.Add(predecessor))
                {
                    continue;
                }

                result.Add(predecessor);
                queue.Enqueue(predecessor);
            }
        }

        return result;
    }
}

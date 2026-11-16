using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Enums;
using MAVIS.Worker.Domain.Graph;

namespace MAVIS.Worker.Infrastructure.Impact;

/// <summary>
/// Implementation of <see cref="IImpactAnalyzer"/>.
/// Traverses backwards from the target service via Incoming edges (BFS) to find every
/// service impacted when the target changes, along with distance (hop count) and path.
///
/// Impact level convention based on distance (number of hops to the target):
///   distance == 1 -> Direct      (calls the target directly)
///   distance == 2 -> Indirect    (via one intermediate service)
///   distance >= 3 -> Transitive (via multiple intermediate services)
/// </summary>
public sealed class ImpactAnalyzer : IImpactAnalyzer
{
    public ImpactResult Analyze(DirectedGraph graph, string targetServiceId, int maxDepth = 10)
    {
        ArgumentNullException.ThrowIfNull(graph);

        if (string.IsNullOrWhiteSpace(targetServiceId))
        {
            return EmptyResult(targetServiceId);
        }

        if (maxDepth < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(maxDepth), maxDepth, "maxDepth must be >= 1.");
        }

        // parent[node] = the node right after it on the shortest path back to the target
        // (lets us rebuild the path without storing the full list at every BFS step).
        var distances = new Dictionary<string, int> { [targetServiceId] = 0 };
        var parent = new Dictionary<string, string>();
        var queue = new Queue<string>();
        queue.Enqueue(targetServiceId);

        var affected = new List<ImpactedService>();

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            var currentDistance = distances[current];

            if (currentDistance >= maxDepth)
            {
                continue;
            }

            if (!graph.Incoming.TryGetValue(current, out var predecessors))
            {
                continue;
            }

            foreach (var predecessor in predecessors)
            {
                if (distances.ContainsKey(predecessor))
                {
                    // Already visited via a shorter or equal path (BFS guarantees the first visit is the shortest).
                    continue;
                }

                var distance = currentDistance + 1;
                distances[predecessor] = distance;
                parent[predecessor] = current;
                queue.Enqueue(predecessor);

                affected.Add(new ImpactedService(predecessor, LevelFromDistance(distance), distance));
            }
        }

        var paths = affected
            .Select(a => new DependencyPath(a.ServiceId, targetServiceId, BuildHops(a.ServiceId, targetServiceId, parent)))
            .ToList();

        return new ImpactResult
        {
            TargetServiceId = targetServiceId,
            AffectedServices = affected,
            Paths = paths,
        };
    }

    private static ImpactLevel LevelFromDistance(int distance) => distance switch
    {
        <= 0 => ImpactLevel.None,
        1 => ImpactLevel.Direct,
        2 => ImpactLevel.Indirect,
        _ => ImpactLevel.Transitive,
    };

    /// <summary>
    /// Rebuilds the path from <paramref name="fromServiceId"/> to <paramref name="targetServiceId"/>,
    /// based on the parent map produced by the reverse BFS.
    /// </summary>
    private static IReadOnlyList<string> BuildHops(string fromServiceId, string targetServiceId,
        IReadOnlyDictionary<string, string> parent)
    {
        var hops = new List<string> { fromServiceId };
        var current = fromServiceId;

        while (parent.TryGetValue(current, out var next))
        {
            hops.Add(next);
            current = next;
        }

        // The path must end at the target; if for some reason it doesn't reach it
        // (shouldn't happen since parent is built alongside distances), still return what we have.
        if (hops[^1] != targetServiceId)
        {
            hops.Add(targetServiceId);
        }

        return hops;
    }

    private static ImpactResult EmptyResult(string targetServiceId) => new()
    {
        TargetServiceId = targetServiceId ?? string.Empty,
        AffectedServices = Array.Empty<ImpactedService>(),
        Paths = Array.Empty<DependencyPath>(),
    };
}

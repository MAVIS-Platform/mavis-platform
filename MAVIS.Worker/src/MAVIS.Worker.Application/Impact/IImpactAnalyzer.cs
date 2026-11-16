using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Graph;

namespace MAVIS.Worker.Application.Impact;

/// <summary>
/// Impact analysis: given a target service, find all services directly/indirectly affected.
/// </summary>
public interface IImpactAnalyzer
{
    /// <param name="graph">The dependency graph already built.</param>
    /// <param name="targetServiceId">The service being changed, need to know who is affected.</param>
    /// <param name="maxDepth">Max hop count to traverse backwards, prevents large graphs/cycles from consuming CPU.</param>
    ImpactResult Analyze(DirectedGraph graph, string targetServiceId, int maxDepth = 10);
}

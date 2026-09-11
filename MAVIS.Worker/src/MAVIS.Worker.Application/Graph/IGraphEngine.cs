using MAVIS.Worker.Domain.Entities;

namespace MAVIS.Worker.Application.Graph;

/// <summary>
/// Build + traverse dependency graph (in-memory, dùng cho impact analysis).
/// Sau này có thể thay bằng Neo4j/RedisGraph nếu graph quá lớn.
/// </summary>
public interface IGraphEngine
{
    DirectedGraph Build(IEnumerable<DependencyEdge> edges);

    IEnumerable<string> ReverseReachable(DirectedGraph graph, string startServiceId);
}

public sealed class DirectedGraph
{
    private readonly Dictionary<string, List<string>> _outgoing = new();
    private readonly Dictionary<string, List<string>> _incoming = new();

    public IReadOnlyDictionary<string, List<string>> Outgoing => _outgoing;
    public IReadOnlyDictionary<string, List<string>> Incoming => _incoming;

    public void AddEdge(string from, string to)
    {
        if (!_outgoing.TryGetValue(from, out var outList))
            _outgoing[from] = outList = new List<string>();
        if (!_incoming.TryGetValue(to, out var inList))
            _incoming[to] = inList = new List<string>();
        outList.Add(to);
        inList.Add(from);
    }

    public IEnumerable<string> Nodes =>
        _outgoing.Keys.Union(_incoming.Keys).Distinct();
}

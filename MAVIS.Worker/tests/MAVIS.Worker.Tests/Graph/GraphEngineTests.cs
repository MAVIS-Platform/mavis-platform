using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Enums;
using MAVIS.Worker.Infrastructure.Graph;

namespace MAVIS.Worker.Tests.Graph;

public class GraphEngineTests
{
    private readonly GraphEngine _sut = new();

    private static DependencyEdge Edge(string from, string to) => new()
    {
        Id = $"{from}->{to}",
        FromServiceId = from,
        ToServiceId = to,
        Kind = DependencyKind.HttpRestCall,
    };

    [Fact]
    public void Build_CreatesOutgoingAndIncomingMaps()
    {
        var edges = new[] { Edge("A", "B"), Edge("B", "C") };

        var graph = _sut.Build(edges);

        Assert.Equal(new[] { "B" }, graph.Outgoing["A"]);
        Assert.Equal(new[] { "C" }, graph.Outgoing["B"]);
        Assert.Equal(new[] { "A" }, graph.Incoming["B"]);
        Assert.Equal(new[] { "B" }, graph.Incoming["C"]);
    }

    [Fact]
    public void Build_SkipsEdgesWithMissingServiceIds()
    {
        var edges = new[]
        {
            Edge("A", "B"),
            new DependencyEdge { Id = "bad", FromServiceId = "", ToServiceId = "C" },
            new DependencyEdge { Id = "bad2", FromServiceId = "D", ToServiceId = "" },
        };

        var graph = _sut.Build(edges);

        Assert.True(graph.Outgoing.ContainsKey("A"));
        Assert.False(graph.Outgoing.ContainsKey("D"));
        Assert.False(graph.Incoming.ContainsKey("C"));
    }

    [Fact]
    public void Build_EmptyEdgeList_ReturnsEmptyGraph()
    {
        var graph = _sut.Build(Array.Empty<DependencyEdge>());

        Assert.Empty(graph.Nodes);
    }

    [Fact]
    public void ReverseReachable_ReturnsAllTransitiveCallers()
    {
        // A -> B -> C -> D
        var graph = _sut.Build(new[] { Edge("A", "B"), Edge("B", "C"), Edge("C", "D") });

        var reachable = _sut.ReverseReachable(graph, "D").ToList();

        Assert.Equal(new[] { "C", "B", "A" }, reachable);
    }

    [Fact]
    public void ReverseReachable_WithCycle_DoesNotLoopForever()
    {
        // A -> B -> A (cycle), B -> C
        var graph = _sut.Build(new[] { Edge("A", "B"), Edge("B", "A"), Edge("B", "C") });

        var reachable = _sut.ReverseReachable(graph, "C").ToList();

        Assert.Contains("B", reachable);
        Assert.Contains("A", reachable);
        Assert.Equal(2, reachable.Count);
    }

    [Fact]
    public void ReverseReachable_NodeWithNoCallers_ReturnsEmpty()
    {
        var graph = _sut.Build(new[] { Edge("A", "B") });

        var reachable = _sut.ReverseReachable(graph, "A");

        Assert.Empty(reachable);
    }

    [Fact]
    public void ReverseReachable_UnknownStartNode_ReturnsEmpty()
    {
        var graph = _sut.Build(new[] { Edge("A", "B") });

        var reachable = _sut.ReverseReachable(graph, "Z");

        Assert.Empty(reachable);
    }
}

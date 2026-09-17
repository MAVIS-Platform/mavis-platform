using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Enums;
using MAVIS.Worker.Domain.Graph;
using MAVIS.Worker.Infrastructure.Graph;
using MAVIS.Worker.Infrastructure.Impact;

namespace MAVIS.Worker.Tests.Impact;

public class ImpactAnalyzerTests
{
    private readonly GraphEngine _graphEngine = new();
    private readonly ImpactAnalyzer _sut = new();

    private static DependencyEdge Edge(string from, string to) => new()
    {
        Id = $"{from}->{to}",
        FromServiceId = from,
        ToServiceId = to,
        Kind = DependencyKind.HttpRestCall,
    };

    [Fact]
    public void Analyze_DirectCaller_IsLevelDirect()
    {
        // A -> B (target)
        var graph = _graphEngine.Build(new[] { Edge("A", "B") });

        var result = _sut.Analyze(graph, "B");

        var a = Assert.Single(result.AffectedServices);
        Assert.Equal("A", a.ServiceId);
        Assert.Equal(1, a.Distance);
        Assert.Equal(ImpactLevel.Direct, a.Level);
    }

    [Fact]
    public void Analyze_ChainOfDependencies_ClassifiesLevelsByDistance()
    {
        // A -> B -> C -> D (target)
        var graph = _graphEngine.Build(new[] { Edge("A", "B"), Edge("B", "C"), Edge("C", "D") });

        var result = _sut.Analyze(graph, "D");

        Assert.Equal(3, result.AffectedServices.Count);
        Assert.Equal(ImpactLevel.Direct, Find(result, "C").Level);
        Assert.Equal(ImpactLevel.Indirect, Find(result, "B").Level);
        Assert.Equal(ImpactLevel.Transitive, Find(result, "A").Level);
    }

    [Fact]
    public void Analyze_BuildsPathFromCallerToTarget()
    {
        // A -> B -> C (target)
        var graph = _graphEngine.Build(new[] { Edge("A", "B"), Edge("B", "C") });

        var result = _sut.Analyze(graph, "C");

        var path = result.Paths.Single(p => p.FromServiceId == "A");
        Assert.Equal("C", path.ToServiceId);
        Assert.Equal(new[] { "A", "B", "C" }, path.Hops);
    }

    [Fact]
    public void Analyze_DiamondDependency_PicksShortestPathPerCaller()
    {
        // A -> B -> D (target), A -> C -> D
        var graph = _graphEngine.Build(new[]
        {
            Edge("A", "B"), Edge("B", "D"),
            Edge("A", "C"), Edge("C", "D"),
        });

        var result = _sut.Analyze(graph, "D");

        Assert.Equal(ImpactLevel.Direct, Find(result, "B").Level);
        Assert.Equal(ImpactLevel.Direct, Find(result, "C").Level);
        Assert.Equal(ImpactLevel.Indirect, Find(result, "A").Level);
        Assert.Equal(2, Find(result, "A").Distance);
        // A must only be visited once despite two paths to D.
        Assert.Single(result.AffectedServices, s => s.ServiceId == "A");
    }

    [Fact]
    public void Analyze_CycleInGraph_DoesNotThrowOrDuplicate()
    {
        // A -> B -> C -> A (cycle), C -> D (target)
        var graph = _graphEngine.Build(new[]
        {
            Edge("A", "B"), Edge("B", "C"), Edge("C", "A"), Edge("C", "D"),
        });

        var result = _sut.Analyze(graph, "D");

        Assert.Equal(3, result.AffectedServices.Count);
        Assert.Equal(1, result.AffectedServices.Count(s => s.ServiceId == "A"));
    }

    [Fact]
    public void Analyze_NoCallers_ReturnsEmptyAffectedList()
    {
        var graph = _graphEngine.Build(new[] { Edge("A", "B") });

        var result = _sut.Analyze(graph, "A");

        Assert.Empty(result.AffectedServices);
        Assert.Empty(result.Paths);
    }

    [Fact]
    public void Analyze_EmptyTargetServiceId_ReturnsEmptyResult()
    {
        var graph = _graphEngine.Build(new[] { Edge("A", "B") });

        var result = _sut.Analyze(graph, string.Empty);

        Assert.Empty(result.AffectedServices);
        Assert.Empty(result.Paths);
    }

    [Fact]
    public void Analyze_MaxDepthLimitsTraversal()
    {
        // A -> B -> C -> D (target), maxDepth = 1 should only find C.
        var graph = _graphEngine.Build(new[] { Edge("A", "B"), Edge("B", "C"), Edge("C", "D") });

        var result = _sut.Analyze(graph, "D", maxDepth: 1);

        var affected = Assert.Single(result.AffectedServices);
        Assert.Equal("C", affected.ServiceId);
    }

    [Fact]
    public void Analyze_InvalidMaxDepth_Throws()
    {
        var graph = _graphEngine.Build(new[] { Edge("A", "B") });

        Assert.Throws<ArgumentOutOfRangeException>(() => _sut.Analyze(graph, "B", maxDepth: 0));
    }

    private static ImpactedService Find(ImpactResult result, string serviceId) =>
        result.AffectedServices.Single(s => s.ServiceId == serviceId);
}

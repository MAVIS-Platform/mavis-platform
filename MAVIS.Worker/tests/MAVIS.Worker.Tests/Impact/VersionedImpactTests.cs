using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Infrastructure.Impact;

namespace MAVIS.Worker.Tests.Impact;

public sealed class VersionedImpactTests
{
    private readonly VersionedImpactAnalyzer _analyzer = new(new ImpactAnalyzer());
    private static VersionedImpactRequest Request() => new("model", "model", "graph", true, "Payment",
        ["Web", "Order", "Payment", "Other"],
        [new("e1", "Web", "Order", "HttpRestCall", ["ev1"]), new("e2", "Order", "Payment", "ServiceDependency", ["ev2"]),
         new("containment", "Other", "Payment", "Containment", ["ev3"])]);

    [Fact]
    public void ReverseImpactHasTypedPathsAndEvidenceWithoutContainment()
    {
        var result = _analyzer.Analyze(Request());
        Assert.Equal(2, result.AffectedServices.Count);
        var web = Assert.Single(result.AffectedServices.Where(a => a.ServiceId == "Web"));
        Assert.Equal("Indirect", web.Classification);
        Assert.Equal(new[] { "Web", "Order", "Payment" }, web.Hops);
        Assert.Equal(new[] { "ev1", "ev2" }, web.EvidenceIds);
        Assert.DoesNotContain(result.AffectedServices, a => a.ServiceId == "Other");
    }

    [Fact]
    public void VersionReadinessAndIdentityMismatchesAreRejected()
    {
        Assert.Throws<SourceInputException>(() => _analyzer.Analyze(Request() with { GraphModelVersionId = "wrong" }));
        Assert.Throws<SourceInputException>(() => _analyzer.Analyze(Request() with { GraphReady = false }));
        Assert.Throws<SourceInputException>(() => _analyzer.Analyze(Request() with { TargetServiceId = "missing" }));
    }

    [Fact]
    public void DepthLimitsAndCyclesDoNotInventOrRepeatSelectedService()
    {
        var request = Request();
        var cycle = request with { Edges = request.Edges.Append(new ImpactEdge("cycle", "Payment", "Web", "HttpRestCall", [])).ToArray() };
        Assert.Equal(2, _analyzer.Analyze(cycle).AffectedServices.Count);
        var limited = _analyzer.Analyze(request with { MaxDepth = 1 });
        Assert.True(limited.Truncated); Assert.Single(limited.AffectedServices);
    }

    [Fact]
    public void RuntimeAbsenceNeverRemovesStaticDependencies()
    {
        var request = Request() with { Runtime = [new("session", "wrong-model", "Order", "Payment", "trace", true),
            new("session", "model", "Other", "Payment", "trace", true), new("session", "model", "Order", "Payment", "trace", true)] };
        var result = _analyzer.Analyze(request);
        Assert.Equal(2, result.AffectedServices.Count); Assert.Single(result.RuntimeContext);
        Assert.Contains("INCOMPATIBLE_OR_UNMAPPED_RUNTIME_OBSERVATION", result.Warnings);
    }

    [Fact]
    public void DiamondUsesOneShortestPathAndKeepsParallelEdgeEvidence()
    {
        var request = new VersionedImpactRequest("m", "m", "g", true, "T", ["A", "B", "C", "T"],
            [new("a1", "A", "B", "HttpRestCall", ["ab1"]), new("a2", "A", "B", "HttpRestCall", ["ab2"]),
             new("b1", "B", "T", "HttpRestCall", ["bt"]), new("c1", "A", "C", "HttpRestCall", ["ac"]), new("c2", "C", "T", "HttpRestCall", ["ct"])]);
        var result = _analyzer.Analyze(request);
        var a = Assert.Single(result.AffectedServices.Where(s => s.ServiceId == "A"));
        Assert.Equal(2, a.Distance); Assert.Equal(3, a.Hops.Count);
        Assert.Contains("ab1", a.EvidenceIds); Assert.Contains("ab2", a.EvidenceIds);
        Assert.Contains("ONE_SHORTEST_PATH_PER_SERVICE", result.Warnings);
    }

    [Fact]
    public void IsolatedServiceReturnsValidEmptyResult()
    {
        Assert.Empty(_analyzer.Analyze(Request() with { TargetServiceId = "Other" }).AffectedServices);
    }
}

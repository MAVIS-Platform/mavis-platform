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

    [Fact]
    public void PathCapPrefersNearestDependenciesAndReportsIncompleteResult()
    {
        var result = _analyzer.Analyze(Request() with { MaxPaths = 1 });
        var path = Assert.Single(result.AffectedServices);
        Assert.Equal("Order", path.ServiceId);
        Assert.Equal("Direct", path.Classification);
        Assert.Equal(new[] { "ev2" }, path.EvidenceIds);
        Assert.True(result.Truncated);
        Assert.Contains("MAX_PATHS_REACHED", result.Warnings);
        Assert.DoesNotContain("MAX_DEPTH_REACHED", result.Warnings);
    }

    [Fact]
    public void PathCapUsesStableOrderForEqualDistanceRegardlessOfInputOrder()
    {
        var request = new VersionedImpactRequest("m", "m", "g", true, "T", ["Z", "A", "T"],
            [new("z", "Z", "T", "HttpRestCall", ["zv"]), new("a", "A", "T", "HttpRestCall", ["av"])], MaxPaths: 1);
        var first = _analyzer.Analyze(request);
        var reversed = _analyzer.Analyze(request with { Edges = request.Edges.Reverse().ToArray(), ServiceIds = request.ServiceIds.Reverse().ToArray() });
        Assert.Equal("A", Assert.Single(first.AffectedServices).ServiceId);
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(first), System.Text.Json.JsonSerializer.Serialize(reversed));
    }

    [Fact]
    public void MaxDepth_ZeroOrNegative_ThrowsSourceInputException()
    {
        var req = Request();
        Assert.Throws<SourceInputException>(() => _analyzer.Analyze(req with { MaxDepth = 0 }));
    }

    [Fact]
    public void F06_005_ReverseBfs_CycleAtoBtoCtoA_AndIsolatedNodeD_TerminatesSafelyAndExcludesD()
    {
        // A -> B -> C -> A cyclic dependency plus completely isolated node D
        var request = new VersionedImpactRequest(
            "m-f06",
            "m-f06",
            "g-f06",
            true,
            "C",
            ["A", "B", "C", "D"],
            [
                new("e-ab", "A", "B", "HttpRestCall", ["ev-ab"]),
                new("e-bc", "B", "C", "HttpRestCall", ["ev-bc"]),
                new("e-ca", "C", "A", "HttpRestCall", ["ev-ca"]),
            ]);

        var result = _analyzer.Analyze(request);

        Assert.Equal(2, result.AffectedServices.Count);
        var b = Assert.Single(result.AffectedServices, s => s.ServiceId == "B");
        var a = Assert.Single(result.AffectedServices, s => s.ServiceId == "A");
        Assert.Equal("Direct", b.Classification);
        Assert.Equal(1, b.Distance);
        Assert.Equal("Indirect", a.Classification);
        Assert.Equal(2, a.Distance);
        Assert.DoesNotContain(result.AffectedServices, s => s.ServiceId == "C");
        Assert.DoesNotContain(result.AffectedServices, s => s.ServiceId == "D");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(10001)]
    public void InvalidPathCapsAreRejected(int cap) =>
        Assert.Throws<SourceInputException>(() => _analyzer.Analyze(Request() with { MaxPaths = cap }));

    [Fact]
    public void ExactPathCapDoesNotReportTruncation() =>
        Assert.False(_analyzer.Analyze(Request() with { MaxPaths = 2 }).Truncated);
}

using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Application.Graph;
using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Enums;
using MAVIS.Worker.Infrastructure.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using NSubstitute;

namespace MAVIS.Worker.Tests.Analysis;

public sealed class AnalysisOrchestratorTests
{
    private readonly INormalizer _normalizer = Substitute.For<INormalizer>();
    private readonly IResolver _resolver = Substitute.For<IResolver>();
    private readonly IGraphEngine _graphEngine = Substitute.For<IGraphEngine>();
    private readonly IImpactAnalyzer _impactAnalyzer = Substitute.For<IImpactAnalyzer>();
    private readonly ICSharpAnalyzer _csharpAnalyzer = Substitute.For<ICSharpAnalyzer>();
    private readonly AnalysisOrchestrator _sut;

    public AnalysisOrchestratorTests()
    {
        _sut = new AnalysisOrchestrator(_normalizer, _resolver, _graphEngine, _impactAnalyzer, _csharpAnalyzer);
        
        // Default: C# analyzer không applicable (để tests cũ không đổi behavior)
        _csharpAnalyzer.IsApplicable(Arg.Any<string>()).Returns(false);
    }

    [Fact]
    public async Task RunAsync_EmptyFindings_ReturnsResultWithEmptyManifest()
    {
        var request = new AnalysisRequest
        {
            ProjectId = "proj-1",
            ProjectName = "Test Project",
            SourceLocation = "/src",
            RawFindings = Array.Empty<RawFindingDto>(),
            ComputeImpact = false
        };

        var emptyManifest = new ProjectManifest
        {
            ProjectId = request.ProjectId,
            ProjectName = request.ProjectName,
            SourceLocation = request.SourceLocation,
            Services = Array.Empty<ServiceNode>().ToList().AsReadOnly(),
            Dependencies = Array.Empty<DependencyEdge>().ToList().AsReadOnly()
        };

        _normalizer.Normalize(
            request.ProjectId,
            request.ProjectName,
            request.SourceLocation,
            request.RawFindings)
            .Returns(emptyManifest);

        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>())
            .Returns(Array.Empty<DependencyEdge>());

        var result = await _sut.RunAsync(request);

        Assert.Equal("proj-1", result.ProjectId);
        Assert.Empty(result.Manifest.Services);
        Assert.Empty(result.Manifest.Dependencies);
        Assert.Null(result.Impact);
    }

    [Fact]
    public async Task RunAsync_CallsNormalizerWithCorrectParameters()
    {
        var findings = new[]
        {
            new RawFindingDto
            {
                ServiceId = "svc-a",
                Kind = "HTTP_REST_CALL",
                Target = "svc-b",
                Language = "Java",
                FilePath = "A.java",
                StartLine = 1
            }
        };

        var request = new AnalysisRequest
        {
            ProjectId = "proj-1",
            ProjectName = "Test",
            SourceLocation = "/src",
            RawFindings = findings,
            ComputeImpact = false
        };

        var manifest = CreateManifest("proj-1", "Test", "/src");
        _normalizer.Normalize(request.ProjectId, request.ProjectName, request.SourceLocation, findings)
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(Array.Empty<DependencyEdge>());

        await _sut.RunAsync(request);

        _normalizer.Received(1).Normalize("proj-1", "Test", "/src", findings);
    }

    [Fact]
    public async Task RunAsync_CallsResolverWithManifestDependencies()
    {
        var request = CreateBasicRequest();
        var edge = CreateEdge("svc-a", "svc-b");
        var manifest = CreateManifest("proj-1", "Test", "/src", new[] { edge });

        _normalizer.Normalize(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<RawFindingDto>>())
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(new[] { edge });

        await _sut.RunAsync(request);

        _resolver.Received(1).Resolve(Arg.Is<IEnumerable<DependencyEdge>>(e => e.Contains(edge)));
    }

    [Fact]
    public async Task RunAsync_CallsGraphEngineWithResolvedEdges()
    {
        var request = CreateBasicRequest();
        var manifest = CreateManifest("proj-1", "Test", "/src");
        var resolvedEdge = CreateEdge("svc-a", "svc-b");

        _normalizer.Normalize(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<RawFindingDto>>())
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(new[] { resolvedEdge });
        _graphEngine.Build(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(new Domain.Graph.DirectedGraph());

        await _sut.RunAsync(request);

        _graphEngine.Received(1).Build(Arg.Is<IEnumerable<DependencyEdge>>(e => e.Contains(resolvedEdge)));
    }

    [Fact]
    public async Task RunAsync_WhenImpactRequested_CallsImpactAnalyzer()
    {
        var request = new AnalysisRequest
        {
            ProjectId = "proj-1",
            ProjectName = "Test",
            SourceLocation = "/src",
            RawFindings = Array.Empty<RawFindingDto>(),
            ComputeImpact = true,
            ImpactTargetServiceId = "svc-a"
        };

        var manifest = CreateManifest("proj-1", "Test", "/src");
        var graph = new Domain.Graph.DirectedGraph();
        var impact = new ImpactResult
        {
            TargetServiceId = "svc-a",
            AffectedServices = Array.Empty<ImpactedService>().ToList().AsReadOnly()
        };

        _normalizer.Normalize(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<RawFindingDto>>())
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(Array.Empty<DependencyEdge>());
        _graphEngine.Build(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(graph);
        _impactAnalyzer.Analyze(graph, "svc-a").Returns(impact);

        var result = await _sut.RunAsync(request);

        _impactAnalyzer.Received(1).Analyze(graph, "svc-a");
        Assert.NotNull(result.Impact);
        Assert.Equal("svc-a", result.Impact.TargetServiceId);
    }

    [Fact]
    public async Task RunAsync_WhenImpactNotRequested_DoesNotCallImpactAnalyzer()
    {
        var request = new AnalysisRequest
        {
            ProjectId = "proj-1",
            ProjectName = "Test",
            SourceLocation = "/src",
            RawFindings = Array.Empty<RawFindingDto>(),
            ComputeImpact = false
        };

        var manifest = CreateManifest("proj-1", "Test", "/src");
        _normalizer.Normalize(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<RawFindingDto>>())
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(Array.Empty<DependencyEdge>());
        _graphEngine.Build(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(new Domain.Graph.DirectedGraph());

        var result = await _sut.RunAsync(request);

        _impactAnalyzer.DidNotReceive().Analyze(Arg.Any<Domain.Graph.DirectedGraph>(), Arg.Any<string>());
        Assert.Null(result.Impact);
    }

    [Fact]
    public async Task RunAsync_ResultContainsCompletedTimestamp()
    {
        var request = CreateBasicRequest();
        var manifest = CreateManifest("proj-1", "Test", "/src");
        _normalizer.Normalize(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<RawFindingDto>>())
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(Array.Empty<DependencyEdge>());

        var before = DateTimeOffset.UtcNow;
        var result = await _sut.RunAsync(request);
        var after = DateTimeOffset.UtcNow;

        Assert.InRange(result.CompletedAt, before, after);
    }

    [Fact]
    public async Task RunAsync_WhenCSharpApplicable_CallsCSharpAnalyzer()
    {
        var request = new AnalysisRequest
        {
            ProjectId = "proj-1",
            ProjectName = "Test",
            SourceLocation = "/src/csharp-project",
            RawFindings = Array.Empty<RawFindingDto>(),
            ComputeImpact = false
        };

        var csharpFindings = new[]
        {
            new RawFindingDto
            {
                Language = "csharp",
                ServiceId = "PaymentService",
                Kind = "HTTP_REST_CALL",
                Target = "OrderService",
                HttpMethod = "GET",
                Url = "http://order-service/api/orders",
                FilePath = "/src/PaymentService/Client.cs",
                StartLine = 10
            }
        };

        _csharpAnalyzer.IsApplicable("/src/csharp-project").Returns(true);
        _csharpAnalyzer.AnalyzeAsync("/src/csharp-project", Arg.Any<CancellationToken>())
            .Returns(csharpFindings);

        var manifest = CreateManifest("proj-1", "Test", "/src/csharp-project");
        _normalizer.Normalize(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<RawFindingDto>>())
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(Array.Empty<DependencyEdge>());

        await _sut.RunAsync(request);

        await _csharpAnalyzer.Received(1).AnalyzeAsync("/src/csharp-project", Arg.Any<CancellationToken>());
        _normalizer.Received(1).Normalize(
            "proj-1",
            "Test",
            "/src/csharp-project",
            Arg.Is<IReadOnlyList<RawFindingDto>>(list => list.Count == 1 && list[0].Language == "csharp"));
    }

    [Fact]
    public async Task RunAsync_MergesJavaAndCSharpFindings()
    {
        var javaFindings = new[]
        {
            new RawFindingDto { Language = "java", ServiceId = "OrderService", Kind = "FEIGN_CLIENT" }
        };

        var csharpFindings = new[]
        {
            new RawFindingDto { Language = "csharp", ServiceId = "PaymentService", Kind = "HTTP_REST_CALL" }
        };

        var request = new AnalysisRequest
        {
            ProjectId = "proj-1",
            ProjectName = "Test",
            SourceLocation = "/src",
            RawFindings = javaFindings,
            ComputeImpact = false
        };

        _csharpAnalyzer.IsApplicable("/src").Returns(true);
        _csharpAnalyzer.AnalyzeAsync("/src", Arg.Any<CancellationToken>()).Returns(csharpFindings);

        var manifest = CreateManifest("proj-1", "Test", "/src");
        _normalizer.Normalize(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<IReadOnlyList<RawFindingDto>>())
            .Returns(manifest);
        _resolver.Resolve(Arg.Any<IEnumerable<DependencyEdge>>()).Returns(Array.Empty<DependencyEdge>());

        await _sut.RunAsync(request);

        _normalizer.Received(1).Normalize(
            "proj-1",
            "Test",
            "/src",
            Arg.Is<IReadOnlyList<RawFindingDto>>(list =>
                list.Count == 2 &&
                list.Any(f => f.Language == "java") &&
                list.Any(f => f.Language == "csharp")));
    }

    private static AnalysisRequest CreateBasicRequest() => new()
    {
        ProjectId = "proj-1",
        ProjectName = "Test",
        SourceLocation = "/src",
        RawFindings = Array.Empty<RawFindingDto>(),
        ComputeImpact = false
    };

    private static ProjectManifest CreateManifest(string projectId, string projectName, string sourceLocation, IEnumerable<DependencyEdge>? edges = null) => new()
    {
        ProjectId = projectId,
        ProjectName = projectName,
        SourceLocation = sourceLocation,
        Services = Array.Empty<ServiceNode>().ToList().AsReadOnly(),
        Dependencies = (edges ?? Array.Empty<DependencyEdge>()).ToList().AsReadOnly()
    };

    private static DependencyEdge CreateEdge(string from, string to) => new()
    {
        Id = Guid.NewGuid().ToString(),
        FromServiceId = from,
        ToServiceId = to,
        Kind = DependencyKind.HttpRestCall,
        Evidences = Array.Empty<Evidence>().ToList().AsReadOnly()
    };
}

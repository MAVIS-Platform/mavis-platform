using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Enums;
using MAVIS.Worker.Infrastructure.Analysis;

namespace MAVIS.Worker.Tests.Analysis;

public sealed class ResolverTests
{
    private readonly Resolver _sut = new();

    [Fact]
    public void Resolve_EmptyEdges_ReturnsEmpty()
    {
        var resolved = _sut.Resolve(Array.Empty<DependencyEdge>());
        Assert.Empty(resolved);
    }

    [Fact]
    public void Resolve_SingleEdge_ReturnsWithStableId()
    {
        var edge = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test");

        var resolved = _sut.Resolve(new[] { edge });

        var result = Assert.Single(resolved);
        Assert.NotEmpty(result.Id);
        Assert.Equal("svc-a", result.FromServiceId);
        Assert.Equal("svc-b", result.ToServiceId);
    }

    [Fact]
    public void Resolve_DuplicateEdges_MergesEvidences()
    {
        var edge1 = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test",
            new Evidence
            {
                FilePath = "A.java",
                StartLine = 10,
                Snippet = "call 1",
                SourceKind = nameof(EvidenceSourceKind.SourceFile)
            });

        var edge2 = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test",
            new Evidence
            {
                FilePath = "B.java",
                StartLine = 20,
                Snippet = "call 2",
                SourceKind = nameof(EvidenceSourceKind.SourceFile)
            });

        var resolved = _sut.Resolve(new[] { edge1, edge2 });

        var result = Assert.Single(resolved);
        Assert.Equal(2, result.Evidences.Count);
        Assert.Contains(result.Evidences, e => e.FilePath == "A.java");
        Assert.Contains(result.Evidences, e => e.FilePath == "B.java");
    }

    [Fact]
    public void Resolve_DuplicateEvidences_Dedupes()
    {
        var evidence = new Evidence
        {
            FilePath = "A.java",
            StartLine = 10,
            Snippet = "same call",
            SourceKind = nameof(EvidenceSourceKind.SourceFile)
        };

        var edge1 = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test", evidence);
        var edge2 = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test", evidence);

        var resolved = _sut.Resolve(new[] { edge1, edge2 });

        var result = Assert.Single(resolved);
        Assert.Single(result.Evidences);
    }

    [Fact]
    public void Resolve_DifferentKinds_ProducesSeparateEdges()
    {
        var edge1 = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test");
        var edge2 = CreateEdge("svc-a", "svc-b", DependencyKind.ConfigurationReference, null, null);

        var resolved = _sut.Resolve(new[] { edge1, edge2 });

        Assert.Equal(2, resolved.Count);
        Assert.Contains(resolved, e => e.Kind == DependencyKind.HttpRestCall);
        Assert.Contains(resolved, e => e.Kind == DependencyKind.ConfigurationReference);
    }

    [Fact]
    public void Resolve_DifferentHttpMethods_ProducesSeparateEdges()
    {
        var edge1 = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test");
        var edge2 = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "POST", "/api/test");

        var resolved = _sut.Resolve(new[] { edge1, edge2 });

        Assert.Equal(2, resolved.Count);
        Assert.Contains(resolved, e => e.HttpMethod == "GET");
        Assert.Contains(resolved, e => e.HttpMethod == "POST");
    }

    [Fact]
    public void Resolve_StableIds_AreDeterministic()
    {
        var edge = CreateEdge("svc-a", "svc-b", DependencyKind.HttpRestCall, "GET", "/api/test");

        var resolved1 = _sut.Resolve(new[] { edge });
        var resolved2 = _sut.Resolve(new[] { edge });

        Assert.Equal(resolved1[0].Id, resolved2[0].Id);
    }

    private static DependencyEdge CreateEdge(
        string from,
        string to,
        DependencyKind kind,
        string? method = null,
        string? url = null,
        params Evidence[] evidences)
    {
        return new DependencyEdge
        {
            Id = Guid.NewGuid().ToString(),
            FromServiceId = from,
            ToServiceId = to,
            Kind = kind,
            HttpMethod = method,
            Url = url,
            Evidences = evidences.ToList().AsReadOnly()
        };
    }
}

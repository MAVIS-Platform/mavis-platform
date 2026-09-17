using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Domain.Enums;

namespace MAVIS.Worker.Tests.Analysis;

public sealed class NormalizerTests
{
    private readonly Normalizer _sut = new();

    [Fact]
    public void Normalize_EmptyFindings_ReturnsEmptyManifest()
    {
        var manifest = _sut.Normalize(
            "proj-1",
            "Empty Project",
            "/src",
            Array.Empty<RawFindingDto>());

        Assert.Equal("proj-1", manifest.ProjectId);
        Assert.Equal("Empty Project", manifest.ProjectName);
        Assert.Empty(manifest.Services);
        Assert.Empty(manifest.Dependencies);
    }

    [Fact]
    public void Normalize_JavaHttpRestCall_CreatesHttpEdge()
    {
        var findings = new[]
        {
            new RawFindingDto
            {
                Language = "Java",
                ServiceId = "order-service",
                Kind = "HTTP_REST_CALL",
                Target = "payment-service",
                HttpMethod = "POST",
                Url = "/api/payments",
                FilePath = "OrderController.java",
                StartLine = 42,
                Snippet = "restTemplate.postForEntity(...)"
            }
        };

        var manifest = _sut.Normalize("proj-1", "Test", "/src", findings);

        Assert.Equal(2, manifest.Services.Count);
        Assert.Contains(manifest.Services, s => s.Name == "order-service" && s.Language == "Java");
        Assert.Contains(manifest.Services, s => s.Name == "payment-service");

        var edge = Assert.Single(manifest.Dependencies);
        Assert.Equal("order-service", edge.FromServiceId);
        Assert.Equal("payment-service", edge.ToServiceId);
        Assert.Equal(DependencyKind.HttpRestCall, edge.Kind);
        Assert.Equal("POST", edge.HttpMethod);
        Assert.Equal("/api/payments", edge.Url);

        var evidence = Assert.Single(edge.Evidences);
        Assert.Equal("OrderController.java", evidence.FilePath);
        Assert.Equal(42, evidence.StartLine);
        Assert.Equal(nameof(EvidenceSourceKind.SourceFile), evidence.SourceKind);
    }

    [Fact]
    public void Normalize_ConfigurationReference_CreatesConfigEdge()
    {
        var findings = new[]
        {
            new RawFindingDto
            {
                Language = "Java",
                ServiceId = "api-gateway",
                Kind = "CONFIG_REFERENCE",
                Target = "user-service",
                FilePath = "application.yml",
                StartLine = 15,
                Snippet = "user-service:\n  url: http://user-service:8080"
            }
        };

        var manifest = _sut.Normalize("proj-1", "Test", "/src", findings);

        var edge = Assert.Single(manifest.Dependencies);
        Assert.Equal(DependencyKind.ConfigurationReference, edge.Kind);
        Assert.Null(edge.HttpMethod);
        Assert.Null(edge.Url);
    }

    [Fact]
    public void Normalize_MultipleFindings_DedupeServices()
    {
        var findings = new[]
        {
            new RawFindingDto
            {
                ServiceId = "svc-a",
                Kind = "HTTP_REST_CALL",
                Target = "svc-b",
                Language = "Java",
                HttpMethod = "GET",
                Url = "/api/foo",
                FilePath = "A.java",
                StartLine = 1
            },
            new RawFindingDto
            {
                ServiceId = "svc-a",
                Kind = "HTTP_REST_CALL",
                Target = "svc-c",
                Language = "Java",
                HttpMethod = "POST",
                Url = "/api/bar",
                FilePath = "A.java",
                StartLine = 2
            },
            new RawFindingDto
            {
                ServiceId = "svc-b",
                Kind = "CONFIG_REFERENCE",
                Target = "svc-c",
                FilePath = "B.yml",
                StartLine = 1
            }
        };

        var manifest = _sut.Normalize("proj-1", "Test", "/src", findings);

        Assert.Equal(3, manifest.Services.Count);
        Assert.Equal(3, manifest.Dependencies.Count);
    }

    [Fact]
    public void Normalize_DuplicateServiceWithLanguage_MergesLanguage()
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
            },
            new RawFindingDto
            {
                ServiceId = "svc-b",
                Kind = "HTTP_REST_CALL",
                Target = "svc-c",
                Language = "Java",
                FilePath = "B.java",
                StartLine = 1
            }
        };

        var manifest = _sut.Normalize("proj-1", "Test", "/src", findings);

        var svcB = manifest.Services.Single(s => s.Name == "svc-b");
        Assert.Equal("Java", svcB.Language);
    }

    [Fact]
    public void Normalize_EnvironmentVariableReference_CreatesEnvVarEdge()
    {
        var findings = new[]
        {
            new RawFindingDto
            {
                ServiceId = "worker",
                Kind = "ENV_VAR_REFERENCE",
                Target = "database-service",
                FilePath = "Worker.cs",
                StartLine = 25,
                Snippet = "Environment.GetEnvironmentVariable(\"DATABASE_SERVICE_URL\")"
            }
        };

        var manifest = _sut.Normalize("proj-1", "Test", "/src", findings);

        var edge = Assert.Single(manifest.Dependencies);
        Assert.Equal(DependencyKind.EnvironmentVariableReference, edge.Kind);
    }
}

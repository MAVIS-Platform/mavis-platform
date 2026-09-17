using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Domain.Enums;

namespace MAVIS.Worker.Infrastructure.Analysis;

/// <summary>
/// Chuẩn hoá raw findings (Java analyzer, generic regex-based) về
/// ServiceNode + DependencyEdge domain model.
/// </summary>
public sealed class Normalizer : INormalizer
{
    public ProjectManifest Normalize(
        string projectId,
        string projectName,
        string sourceLocation,
        IReadOnlyList<RawFindingDto> rawFindings)
    {
        var services = new Dictionary<string, ServiceNode>(StringComparer.OrdinalIgnoreCase);
        var edges = new List<DependencyEdge>();

        foreach (var finding in rawFindings)
        {
            if (string.IsNullOrWhiteSpace(finding.ServiceId))
                continue;

            EnsureService(services, finding.ServiceId, finding.Language);

            if (string.IsNullOrWhiteSpace(finding.Target))
                continue;

            EnsureService(services, finding.Target!, language: null);

            var edge = new DependencyEdge
            {
                Id = string.Empty, // resolved later by IResolver
                FromServiceId = finding.ServiceId,
                ToServiceId = finding.Target!,
                Kind = MapKind(finding.Kind),
                HttpMethod = finding.HttpMethod,
                Url = finding.Url,
                Evidences = new[]
                {
                    new Evidence
                    {
                        SourceKind = nameof(EvidenceSourceKind.SourceFile),
                        FilePath = finding.FilePath,
                        StartLine = finding.StartLine,
                        EndLine = finding.EndLine,
                        Snippet = finding.Snippet
                    }
                }
            };

            edges.Add(edge);
        }

        return new ProjectManifest
        {
            ProjectId = projectId,
            ProjectName = projectName,
            SourceLocation = sourceLocation,
            Services = services.Values.ToList(),
            Dependencies = edges
        };
    }

    private static void EnsureService(
        Dictionary<string, ServiceNode> services,
        string serviceId,
        string? language)
    {
        if (services.TryGetValue(serviceId, out var existing))
        {
            if (string.IsNullOrWhiteSpace(existing.Language) && !string.IsNullOrWhiteSpace(language))
            {
                services[serviceId] = new ServiceNode
                {
                    Id = existing.Id,
                    Name = existing.Name,
                    Language = language,
                    Framework = existing.Framework,
                    SourceRoot = existing.SourceRoot,
                    ExposedPorts = existing.ExposedPorts,
                    Metadata = existing.Metadata
                };
            }
            return;
        }

        services[serviceId] = new ServiceNode
        {
            Id = serviceId,
            Name = serviceId,
            Language = language
        };
    }

    private static DependencyKind MapKind(string? kind)
    {
        if (string.IsNullOrWhiteSpace(kind))
            return DependencyKind.Unknown;

        return kind.Trim().ToUpperInvariant() switch
        {
            "REST_CALL" or "HTTP_CALL" or "HTTP_REST_CALL" or "FEIGN_CLIENT" => DependencyKind.HttpRestCall,
            "CONFIG_REFERENCE" or "CONFIGURATION_REFERENCE" => DependencyKind.ConfigurationReference,
            "ENV_VAR" or "ENV_VAR_REFERENCE" or "ENVIRONMENT_VARIABLE_REFERENCE" => DependencyKind.EnvironmentVariableReference,
            "DOCKER_NETWORK" or "DOCKER_NETWORK_REFERENCE" => DependencyKind.DockerNetworkReference,
            _ => DependencyKind.Unknown
        };
    }
}

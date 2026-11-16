using MAVIS.Worker.Domain.Enums;

namespace MAVIS.Worker.Domain.Entities;

/// <summary>
/// Một dependency có hướng giữa hai service: FromService -> ToService.
/// </summary>
public sealed class DependencyEdge
{
    public string Id { get; init; } = string.Empty;
    public string FromServiceId { get; init; } = string.Empty;
    public string ToServiceId { get; init; } = string.Empty;
    public DependencyKind Kind { get; init; } = DependencyKind.Unknown;
    public string? HttpMethod { get; init; }
    public string? Url { get; init; }
    public IReadOnlyList<Evidence> Evidences { get; init; } = Array.Empty<Evidence>();
}

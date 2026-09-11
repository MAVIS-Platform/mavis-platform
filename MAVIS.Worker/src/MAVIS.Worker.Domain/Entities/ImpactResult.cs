using MAVIS.Worker.Domain.Enums;

namespace MAVIS.Worker.Domain.Entities;

/// <summary>
/// Kết quả phân tích tác động khi thay đổi một service.
/// </summary>
public sealed class ImpactResult
{
    public string TargetServiceId { get; init; } = string.Empty;
    public IReadOnlyList<ImpactedService> AffectedServices { get; init; } = Array.Empty<ImpactedService>();
    public IReadOnlyList<DependencyPath> Paths { get; init; } = Array.Empty<DependencyPath>();
}

public sealed record ImpactedService(
    string ServiceId,
    ImpactLevel Level,
    int Distance);

public sealed record DependencyPath(
    string FromServiceId,
    string ToServiceId,
    IReadOnlyList<string> Hops);

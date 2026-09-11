using MAVIS.Worker.Domain.Entities;

namespace MAVIS.Worker.Application.Contracts.Responses;

/// <summary>
/// Response trả về Spring Boot (Java side) chứa graph + impact (nếu yêu cầu).
/// </summary>
public sealed class AnalysisResult
{
    public string ProjectId { get; init; } = string.Empty;
    public ProjectManifest Manifest { get; init; } = new();
    public ImpactResult? Impact { get; init; }
    public DateTimeOffset CompletedAt { get; init; } = DateTimeOffset.UtcNow;
}

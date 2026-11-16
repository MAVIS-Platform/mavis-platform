namespace MAVIS.Worker.Domain.Entities;

/// <summary>
/// Manifest tổng quan của project được phân tích - là output trung gian trước khi build graph.
/// </summary>
public sealed class ProjectManifest
{
    public string ProjectId { get; init; } = string.Empty;
    public string ProjectName { get; init; } = string.Empty;
    public string SourceLocation { get; init; } = string.Empty;
    public IReadOnlyList<ServiceNode> Services { get; init; } = Array.Empty<ServiceNode>();
    public IReadOnlyList<DependencyEdge> Dependencies { get; init; } = Array.Empty<DependencyEdge>();
}

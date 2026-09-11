namespace MAVIS.Worker.Domain.Entities;

/// <summary>
/// Một microservice được phát hiện trong project.
/// </summary>
public sealed class ServiceNode
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Language { get; init; }
    public string? Framework { get; init; }
    public string? SourceRoot { get; init; }
    public IReadOnlyList<string> ExposedPorts { get; init; } = Array.Empty<string>();
    public IReadOnlyDictionary<string, string> Metadata { get; init; } =
        new Dictionary<string, string>();
}

using MAVIS.Worker.Domain.Entities;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>
/// Phân tích C# source bằng Roslyn (Microsoft.CodeAnalysis).
/// Tìm: HttpClient calls, IHttpClientFactory, RestSharp, refit, configuration references.
/// Output là một list DependencyEdge thô (chưa resolve).
/// </summary>
public interface ICSharpAnalyzer
{
    bool IsApplicable(string sourceLocation);

    Task<IReadOnlyList<DependencyEdge>> AnalyzeAsync(string sourceLocation, CancellationToken ct = default);
}

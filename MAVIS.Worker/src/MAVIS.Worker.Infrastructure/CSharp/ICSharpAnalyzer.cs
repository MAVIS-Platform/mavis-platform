using MAVIS.Worker.Application.Contracts.Requests;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>
/// Phân tích C# source bằng Roslyn (Microsoft.CodeAnalysis).
/// Tìm: HttpClient calls, IHttpClientFactory, RestSharp, Refit, configuration references.
/// Output là một list RawFindingDto (raw findings, chưa normalize/resolve).
/// </summary>
public interface ICSharpAnalyzer
{
    /// <summary>
    /// Kiểm tra xem source location có chứa C# code không (có .csproj files).
    /// </summary>
    bool IsApplicable(string sourceLocation);

    /// <summary>
    /// Phân tích tất cả .cs files trong sourceLocation, trả về raw findings.
    /// </summary>
    Task<IReadOnlyList<RawFindingDto>> AnalyzeAsync(string sourceLocation, CancellationToken ct = default);
}

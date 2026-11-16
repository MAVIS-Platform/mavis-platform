namespace MAVIS.Worker.Application.Contracts.Requests;

/// <summary>
/// Request từ Spring Boot (Java side) gửi sang .NET Worker để phân tích và build graph.
/// MAVIS Worker sẽ:
///   1. Nhận generic findings (đã phân hiện bằng regex)
///   2. Nếu project có file .cs/.csproj → dùng Roslyn phân tích C#
///   3. Chuẩn hoá + resolve dependencies
///   4. Build dependency graph
///   5. (Optional) Tính impact analysis
/// </summary>
public sealed class AnalysisRequest
{
    public string ProjectId { get; init; } = string.Empty;
    public string ProjectName { get; init; } = string.Empty;
    public string SourceLocation { get; init; } = string.Empty;
    public IReadOnlyList<RawFindingDto> RawFindings { get; init; } = Array.Empty<RawFindingDto>();
    public bool ComputeImpact { get; init; } = true;
    public string? ImpactTargetServiceId { get; init; }
}

/// <summary>
/// Một finding thô từ Java analyzer (regex-based, language-agnostic).
/// </summary>
public sealed class RawFindingDto
{
    public string Language { get; init; } = "generic";
    public string ServiceId { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string? Target { get; init; }
    public string? HttpMethod { get; init; }
    public string? Url { get; init; }
    public string FilePath { get; init; } = string.Empty;
    public int? StartLine { get; init; }
    public int? EndLine { get; init; }
    public string Snippet { get; init; } = string.Empty;
}

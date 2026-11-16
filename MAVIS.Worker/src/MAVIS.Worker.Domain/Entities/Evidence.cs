using MAVIS.Worker.Domain.Enums;

namespace MAVIS.Worker.Domain.Entities;

/// <summary>
/// Một dấu vết (evidence) cho thấy dependency được phát hiện ở đâu trong source code hoặc config.
/// Cho phép user click vào edge trên graph và nhảy về file gốc.
/// </summary>
public sealed class Evidence
{
    public string SourceKind { get; init; } = nameof(EvidenceSourceKind.SourceFile);
    public string FilePath { get; init; } = string.Empty;
    public int? StartLine { get; init; }
    public int? EndLine { get; init; }
    public string Snippet { get; init; } = string.Empty;
}

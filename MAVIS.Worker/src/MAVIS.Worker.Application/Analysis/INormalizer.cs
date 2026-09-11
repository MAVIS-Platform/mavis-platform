using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Domain.Entities;

namespace MAVIS.Worker.Application.Analysis;

/// <summary>
/// Chuẩn hoá raw findings từ Java analyzer + Roslyn findings từ C# analyzer
/// về cùng một dạng ServiceNode + DependencyEdge.
/// </summary>
public interface INormalizer
{
    ProjectManifest Normalize(string projectId, string projectName, string sourceLocation,
        IReadOnlyList<RawFindingDto> rawFindings);
}

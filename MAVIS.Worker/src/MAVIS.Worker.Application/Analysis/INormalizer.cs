using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Domain.Entities;

namespace MAVIS.Worker.Application.Analysis;

/// <summary>
/// Normalizer interface: convert raw findings to domain model.
/// </summary>
public interface INormalizer
{
    ProjectManifest Normalize(
        string projectId,
        string projectName,
        string sourceLocation,
        IReadOnlyList<RawFindingDto> rawFindings);
}

using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Application.Contracts.Responses;

namespace MAVIS.Worker.Application.Analysis;

/// <summary>
/// Orchestrator: nhận request, điều phối toàn bộ pipeline.
/// Đây là entry point duy nhất mà Api layer gọi.
/// </summary>
public interface IAnalysisOrchestrator
{
    Task<AnalysisResult> RunAsync(AnalysisRequest request, CancellationToken ct = default);
}

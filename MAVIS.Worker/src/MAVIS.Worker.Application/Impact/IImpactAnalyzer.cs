using MAVIS.Worker.Domain.Entities;
using MAVIS.Worker.Application.Graph;

namespace MAVIS.Worker.Application.Impact;

/// <summary>
/// Phân tích tác động: cho một target service, tìm các service bị ảnh hưởng trực tiếp/gián tiếp.
/// </summary>
public interface IImpactAnalyzer
{
    ImpactResult Analyze(DirectedGraph graph, string targetServiceId);
}

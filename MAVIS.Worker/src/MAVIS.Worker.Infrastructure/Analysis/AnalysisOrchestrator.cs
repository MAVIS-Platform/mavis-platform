using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Contracts.Requests;
using MAVIS.Worker.Application.Contracts.Responses;
using MAVIS.Worker.Application.Graph;
using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Infrastructure.CSharp;

namespace MAVIS.Worker.Infrastructure.Analysis;

/// <summary>
/// Orchestrator điều phối toàn bộ pipeline analysis:
/// 0. (Optional) Nếu có C# code → chạy Roslyn scan, merge vào raw findings
/// 1. Normalize: RawFindingDto[] → ProjectManifest
/// 2. Resolve: dedupe edges, assign stable IDs
/// 3. Build graph: DependencyEdge[] → DirectedGraph
/// 4. Impact analysis: compute affected services
/// </summary>
public sealed class AnalysisOrchestrator : IAnalysisOrchestrator
{
    private readonly INormalizer _normalizer;
    private readonly IResolver _resolver;
    private readonly IGraphEngine _graphEngine;
    private readonly IImpactAnalyzer _impactAnalyzer;
    private readonly ICSharpAnalyzer _csharpAnalyzer;

    public AnalysisOrchestrator(
        INormalizer normalizer,
        IResolver resolver,
        IGraphEngine graphEngine,
        IImpactAnalyzer impactAnalyzer,
        ICSharpAnalyzer csharpAnalyzer)
    {
        _normalizer = normalizer;
        _resolver = resolver;
        _graphEngine = graphEngine;
        _impactAnalyzer = impactAnalyzer;
        _csharpAnalyzer = csharpAnalyzer;
    }

    public async Task<AnalysisResult> RunAsync(AnalysisRequest request, CancellationToken ct = default)
    {
        // Step 0: Merge findings from Java (generic + java) + C# (nếu có)
        IReadOnlyList<RawFindingDto> allFindings = request.RawFindings;

        // Nếu source location có C# code → chạy Roslyn scan và merge thêm
        if (_csharpAnalyzer.IsApplicable(request.SourceLocation))
        {
            var csharpFindings = await _csharpAnalyzer.AnalyzeAsync(request.SourceLocation, ct);
            if (csharpFindings.Count > 0)
            {
                var merged = new List<RawFindingDto>(request.RawFindings);
                merged.AddRange(csharpFindings);
                allFindings = merged;
            }
        }

        // Step 1: Normalize raw findings (generic + java + csharp)
        var manifest = _normalizer.Normalize(
            request.ProjectId,
            request.ProjectName,
            request.SourceLocation,
            allFindings);

        // Step 2: Resolve edges (dedupe, stable IDs)
        var resolvedEdges = _resolver.Resolve(manifest.Dependencies);

        // Update manifest with resolved edges
        var finalManifest = new Domain.Entities.ProjectManifest
        {
            ProjectId = manifest.ProjectId,
            ProjectName = manifest.ProjectName,
            SourceLocation = manifest.SourceLocation,
            Services = manifest.Services,
            Dependencies = resolvedEdges
        };

        // Step 3: Build graph
        var graph = _graphEngine.Build(resolvedEdges);

        // Step 4: Impact analysis (if requested)
        Domain.Entities.ImpactResult? impact = null;

        if (request.ComputeImpact && !string.IsNullOrWhiteSpace(request.ImpactTargetServiceId))
        {
            impact = _impactAnalyzer.Analyze(graph, request.ImpactTargetServiceId);
        }

        var result = new AnalysisResult
        {
            ProjectId = request.ProjectId,
            Manifest = finalManifest,
            Impact = impact,
            CompletedAt = DateTimeOffset.UtcNow
        };

        return result;
    }
}

using Microsoft.Extensions.DependencyInjection;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Application.Graph;
using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Application.Jobs;
using MAVIS.Worker.Infrastructure.Graph;
using MAVIS.Worker.Infrastructure.Impact;
using MAVIS.Worker.Infrastructure.Jobs;

namespace MAVIS.Worker.Infrastructure;

/// <summary>
/// Dependency injection registration for Infrastructure layer.
/// This is the composition root where interfaces (ports) are bound to implementations (adapters).
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddWorkerInfrastructure(this IServiceCollection services)
    {
        // Graph and impact analysis implementations
        services.AddSingleton<IGraphEngine, GraphEngine>();
        services.AddSingleton<IImpactAnalyzer, ImpactAnalyzer>();

        // Analysis pipeline (Normalize -> Resolve -> Orchestrate)
        services.AddSingleton<INormalizer, Normalizer>();
        services.AddSingleton<IResolver, Resolver>();
        services.AddSingleton<IAnalysisOrchestrator, AnalysisOrchestrator>();

        // Job queue + background worker
        services.AddSingleton<IJobQueue, InMemoryJobQueue>();
        services.AddHostedService<AnalysisBackgroundService>();

        return services;
    }
}

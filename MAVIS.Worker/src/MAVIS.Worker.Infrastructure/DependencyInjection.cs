using Microsoft.Extensions.DependencyInjection;
using MAVIS.Worker.Application.Graph;
using MAVIS.Worker.Application.Impact;
using MAVIS.Worker.Infrastructure.Graph;
using MAVIS.Worker.Infrastructure.Impact;

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

        return services;
    }
}

using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace MAVIS.Worker.Api;

public static class WorkerContract
{
    public static WebApplication UseWorkerContract(this WebApplication app)
    {
        app.UseStatusCodePages(async (Microsoft.AspNetCore.Diagnostics.StatusCodeContext statusContext) =>
        {
            var context = statusContext.HttpContext;
            if (!context.Request.Path.StartsWithSegments("/api/v1") && !context.Request.Path.StartsWithSegments("/api/health")) return;
            var failure = WorkerContractFilter.Failure(context.Response.StatusCode, context);
            await context.Response.WriteAsJsonAsync(failure.Value, options: (System.Text.Json.JsonSerializerOptions?)null,
                contentType: "application/problem+json");
        });
        return app;
    }

    public static IServiceCollection AddWorkerContract(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ArtifactScopeOptions>(configuration.GetSection("ArtifactScope"));
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IArtifactScopeResolver, ArtifactScopeResolver>();
        services.Configure<MvcOptions>(o => o.Filters.Add<WorkerContractFilter>());
        return services;
    }
}

public sealed class WorkerContractFilter : IExceptionFilter, IAlwaysRunResultFilter
{
    public void OnException(ExceptionContext context)
    {
        if (!Applies(context.HttpContext)) return;
        var status = context.Exception switch
        {
            ArtifactGrantException => 403,
            SourceInputException => 400,
            JobConflictException => 409,
            JobCapacityException => 429,
            OperationCanceledException => 408,
            IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException => 400,
            _ => 500
        };
        context.Result = Failure(status, context.HttpContext);
        context.ExceptionHandled = true;
    }

    public void OnResultExecuting(ResultExecutingContext context)
    {
        if (!Applies(context.HttpContext)) return;
        var status = context.Result switch { ObjectResult o => o.StatusCode, StatusCodeResult s => s.StatusCode, _ => (int?)null };
        if (status >= 400) context.Result = Failure(status.Value, context.HttpContext);
    }
    public void OnResultExecuted(ResultExecutedContext context) { }

    private static bool Applies(HttpContext context) => context.Request.Path.StartsWithSegments("/api/v1") ||
        context.Request.Path.StartsWithSegments("/api/health");

    public static ObjectResult Failure(int status, HttpContext context)
    {
        var (code, title) = status switch
        {
            400 => ("INVALID_REQUEST", "Invalid Worker input"),
            401 => ("SERVICE_AUTH_REQUIRED", "Worker service authentication required"),
            403 => ("ARTIFACT_SCOPE_DENIED", "Worker access or artifact scope denied"),
            404 => ("NOT_FOUND", "Worker resource not found"),
            408 => ("DEADLINE_EXCEEDED", "Analysis deadline exceeded"),
            409 => ("ATTEMPT_CONFLICT", "Attempt input conflict"),
            429 => ("CAPACITY_EXHAUSTED", "Worker capacity exhausted"),
            503 => ("WORKER_NOT_READY", "Worker configuration is not ready"),
            _ => ("WORKER_FAILURE", "Worker request failed")
        };
        return new ObjectResult(new ProblemDetails
        {
            Status = status, Title = title, Type = "urn:mavis:worker:" + code.ToLowerInvariant(),
            Extensions = { ["code"] = code, ["traceId"] = context.TraceIdentifier }
        }) { StatusCode = status, ContentTypes = { "application/problem+json" } };
    }
}

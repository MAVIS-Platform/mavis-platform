using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace MAVIS.Worker.Api.Controllers;

/// <summary>Service-to-service key, or loopback-only development. Never trusts forwarded IP headers.</summary>
public sealed class WorkerInternalAccessFilter(IConfiguration configuration, IWebHostEnvironment environment) : IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var path = context.HttpContext.Request.Path;
        if (path.StartsWithSegments("/api/health")) return;
        if ((path.StartsWithSegments("/api/analysis") || path.StartsWithSegments("/api/jobs")) &&
            !configuration.GetValue<bool>("WorkerAccess:EnableLegacyAnalysis"))
        { context.Result = new NotFoundResult(); return; }
        var key = configuration["WorkerAccess:ApiKey"];
        if (!string.IsNullOrEmpty(key))
        {
            var values = context.HttpContext.Request.Headers["X-Mavis-Worker-Key"];
            var candidate = values.Count == 1 ? values[0] : null;
            if (candidate is null || candidate.Length > 512 || !CryptographicOperations.FixedTimeEquals(
                SHA256.HashData(Encoding.UTF8.GetBytes(key)), SHA256.HashData(Encoding.UTF8.GetBytes(candidate))))
                context.Result = new ObjectResult(new ProblemDetails { Status = 401, Title = "Worker service authentication required" }) { StatusCode = 401 };
            return;
        }
        if (path.StartsWithSegments("/api/v1"))
        { context.Result = WorkerContractFilter.Failure(401, context.HttpContext); return; }
        var remote = context.HttpContext.Connection.RemoteIpAddress;
        if (remote is null ? !environment.IsDevelopment() : !IPAddress.IsLoopback(remote))
            context.Result = new ObjectResult(new ProblemDetails { Status = 403, Title = "Worker API requires loopback access or a configured service key" }) { StatusCode = 403 };
    }
}

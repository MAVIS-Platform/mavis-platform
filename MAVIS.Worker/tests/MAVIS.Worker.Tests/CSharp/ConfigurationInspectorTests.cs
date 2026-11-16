using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class ConfigurationInspectorTests
{
    [Fact]
    public async Task ConfigurationReturnsKeysAndHostsWithoutSecretValues()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-config-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            File.WriteAllText(Path.Combine(root, "App.csproj"), "<Project />");
            File.WriteAllText(Path.Combine(root, "appsettings.json"), """
                { "ConnectionStrings": {"Db":"Password=SECRET_SENTINEL"},
                  "Services": {"Payment": {"BaseAddress":"https://user:SECRET_SENTINEL@payments/api?token=SECRET_SENTINEL"}},
                  "Values": ["SECRET_SENTINEL"] }
                """);
            var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [root] }));
            var request = new DotnetAnalysisRequest("p", "s", root, "j");
            var result = await analyzer.AnalyzeAsync(request, CancellationToken.None);
            Assert.Contains(result.Findings, f => f.Kind == "ConfiguredHttpHost" && f.Target == "payments:443");
            Assert.Contains(result.Findings, f => f.Kind == "ConfigurationKey" && f.Target == "ConnectionStrings:Db");
            Assert.DoesNotContain("SECRET_SENTINEL", System.Text.Json.JsonSerializer.Serialize(result));
            File.WriteAllText(Path.Combine(root, "appsettings.json"), "{ invalid");
            Assert.Contains((await analyzer.AnalyzeAsync(request, CancellationToken.None)).Warnings, w => w.Code == "INVALID_CONFIGURATION_JSON");
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}

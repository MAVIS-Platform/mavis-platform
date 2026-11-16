using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class LinuxOnlyFactAttribute : FactAttribute
{
    public LinuxOnlyFactAttribute() { if (!OperatingSystem.IsLinux()) Skip = "Linux filesystem symlink verification."; }
}

public sealed class LinuxSourceScopeTests
{
    [LinuxOnlyFact]
    public async Task SourceFileAndRootSymlinksCannotEscapeScope()
    {
        var root = Path.Combine(Path.GetTempPath(), "mavis-links-" + Guid.NewGuid().ToString("N"));
        var source = Path.Combine(root, "source"); var outside = Path.Combine(root, "outside");
        var fileLink = Path.Combine(source, "linked.cs"); var rootLink = Path.Combine(root, "alias");
        Directory.CreateDirectory(source); Directory.CreateDirectory(outside);
        File.WriteAllText(Path.Combine(source, "App.csproj"), "<Project />");
        File.WriteAllText(Path.Combine(outside, "Secret.cs"), "class Outside {}");
        var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [root] }));
        try
        {
            File.CreateSymbolicLink(fileLink, Path.Combine(outside, "Secret.cs"));
            await Assert.ThrowsAsync<SourceInputException>(() => analyzer.AnalyzeAsync(new("p", "s", source, "j"), CancellationToken.None));
            File.Delete(fileLink);
            Directory.CreateSymbolicLink(rootLink, source);
            await Assert.ThrowsAsync<SourceInputException>(() => analyzer.AnalyzeAsync(new("p", "s", rootLink, "j"), CancellationToken.None));
        }
        finally
        {
            if (File.Exists(fileLink)) File.Delete(fileLink);
            if (Directory.Exists(rootLink)) Directory.Delete(rootLink);
            Directory.Delete(root, recursive: true);
        }
    }
}

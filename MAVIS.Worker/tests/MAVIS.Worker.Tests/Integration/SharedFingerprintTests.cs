using System.Text.Json;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.Integration;

public sealed class SharedFingerprintTests
{
    [Fact]
    public async Task CrossLanguageEncodedInputsHaveExactlyTheProducerDigest()
    {
        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "FingerprintFixtures", "cases.json")));
        foreach (var scenario in document.RootElement.EnumerateArray())
        {
            var root = Path.Combine(Path.GetTempPath(), "mavis-fingerprint-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try
            {
                foreach (var file in scenario.GetProperty("files").EnumerateArray())
                {
                    var path = Path.Combine(root, file.GetProperty("path").GetString()!);
                    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                    await File.WriteAllBytesAsync(path, Convert.FromBase64String(file.GetProperty("contentBase64").GetString()!));
                }
                var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [root] }));
                var result = await analyzer.AnalyzeAsync(new("p", "s", root, "j"), CancellationToken.None);
                Assert.Equal(scenario.GetProperty("expectedDigest").GetString(), result.InputDigest);
            }
            finally { Directory.Delete(root, true); }
        }
    }
}

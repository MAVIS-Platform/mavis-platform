using System.Text.Json;
using System.Text.Json.Nodes;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.Integration;

public sealed class N01ContractFixtureTests
{
    private sealed class FixedClock(DateTimeOffset time) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => time;
    }

    [Fact]
    public async Task SharedGrantAndActualResultMatchCheckedInFixtures()
    {
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var fixtures = Path.Combine(AppContext.BaseDirectory, "N01Fixtures");
        var claims = JsonSerializer.Deserialize<ArtifactGrantClaims>(await File.ReadAllTextAsync(Path.Combine(fixtures, "claims.json")), json)!;
        var request = JsonSerializer.Deserialize<ScopedDotnetRequest>(await File.ReadAllTextAsync(Path.Combine(fixtures, "request.json")), json)!;
        var root = Path.Combine(Path.GetTempPath(), "mavis-contract-" + Guid.NewGuid().ToString("N"));
        var artifact = Path.Combine(root, claims.ArtifactId);
        Directory.CreateDirectory(artifact);
        try
        {
            foreach (var file in Directory.GetFiles(Path.Combine(fixtures, "source"))) File.Copy(file, Path.Combine(artifact, Path.GetFileName(file)));
            var scope = Options.Create(new ArtifactScopeOptions { Root = root, GrantKeys = new() { ["test"] = ArtifactTestSupport.Key } });
            var resolver = new ArtifactScopeResolver(scope, new FixedClock(claims.DeadlineUtc.AddMinutes(-1)));
            var resolved = resolver.Resolve(request);
            Assert.Equal((claims.ProjectId, claims.SourceSnapshotId, claims.JobId, claims.AttemptId),
                (resolved.ProjectId, resolved.SourceSnapshotId, resolved.JobId, resolved.AttemptId));
            var analyzer = new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions()), scope);
            var result = await analyzer.AnalyzeAsync(resolved with { DeadlineUtc = DateTimeOffset.UtcNow.AddMinutes(1) }, CancellationToken.None);
            // Explicit local fixture-export mode writes only to the test output copy, never source fixtures.
            if (Environment.GetEnvironmentVariable("MAVIS_EXPORT_N01_FIXTURE") == "1")
                await File.WriteAllTextAsync(Path.Combine(fixtures, "result.json"), JsonSerializer.Serialize(result, json));
            var expected = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(fixtures, "result.json")));
            Assert.True(JsonNode.DeepEquals(expected, JsonSerializer.SerializeToNode(result, json)), "N01 result fixture drift");
        }
        finally { Directory.Delete(root, true); }
    }
}

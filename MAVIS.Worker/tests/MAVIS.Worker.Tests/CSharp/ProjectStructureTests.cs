using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class ProjectStructureTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-structure-" + Guid.NewGuid().ToString("N"));
    public ProjectStructureTests() => Directory.CreateDirectory(_root);

    private void Write(string path, string content)
    {
        var full = Path.Combine(_root, path);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content);
    }

    private Task<DotnetAnalysisResult> Analyze(int maxBytes = 1_048_576) => new DotnetProjectAnalyzer(
        Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root], MaxFileBytes = maxBytes }))
        .AnalyzeAsync(new("project", "snapshot", _root, "job"), CancellationToken.None);

    [Fact]
    public async Task ReadsSolutionAndProjectReferencesWithoutExecutingTargets()
    {
        Write("Orders/Orders.csproj", """
            <Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
              <ItemGroup><ProjectReference Include="../Contracts/Contracts.csproj" /></ItemGroup>
              <Target Name="Build"><Error Text="MUST NOT RUN" /></Target>
            </Project>
            """);
        Write("Contracts/Contracts.csproj", "<Project />");
        Write("Demo.sln", "Project(\"{GUID}\") = \"Orders\", \"Orders\\Orders.csproj\", \"{GUID}\"\nEndProject");
        Write("Orders/Client.cs", "class Client {}");
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Kind == "SolutionProject" && f.Target == "Orders/Orders.csproj");
        var reference = Assert.Single(result.Findings.Where(f => f.Kind == "ProjectReference"));
        Assert.Equal("Contracts/Contracts.csproj", reference.Target);
        Assert.Equal(2, reference.Evidence.StartLine);
        Assert.Contains(result.Warnings, w => w.Code == "PROJECT_ITEMS_UNEVALUATED");
    }

    [Fact]
    public async Task QualifiedIdentityIncludesNamespaceNestedTypesAndGenericArity()
    {
        Write("Sample.csproj", "<Project />");
        Write("Types.cs", "namespace Demo; interface IStore {} class Store<T> : IStore { class Item {} }");
        var first = await Analyze();
        var nested = Assert.Single(first.Findings.Where(f => f.Subject == "Demo.Store`1.Item"));
        Assert.NotNull(nested.Id);
        Assert.Contains(first.Findings, f => f.Kind == "Namespace" && f.Target == "Demo");
        Assert.Contains(first.Findings, f => f.Kind == "BaseTypeCandidate" && f.Subject == "Demo.Store`1" && f.Target == "IStore");
        Write("Types.cs", "\nnamespace Demo; interface IStore {} class Store<T> : IStore { class Item {} }");
        var second = await Analyze();
        Assert.Equal(nested.Id, Assert.Single(second.Findings.Where(f => f.Subject == nested.Subject)).Id);
    }

    [Fact]
    public async Task MissingOutsideAndConditionalReferencesStayUnresolved()
    {
        Write("Sample.csproj", """
            <Project><ItemGroup>
              <ProjectReference Include="../../outside/Secrets.csproj" />
              <ProjectReference Include="missing.csproj" />
              <ProjectReference Include="$(Other)/Dynamic.csproj" />
              <ProjectReference Include="Other.csproj" Condition="'$(Flag)' == 'true'" />
            </ItemGroup></Project>
            """);
        Write("Other.csproj", "<Project />");
        var result = await Analyze();
        Assert.Empty(result.Findings.Where(f => f.Kind == "ProjectReference"));
        Assert.Equal(4, result.Warnings.Count(w => w.Code == "UNRESOLVED_PROJECT_REFERENCE"));
        Assert.DoesNotContain(result.Findings, f => f.Target?.Contains("Secrets") == true);
    }

    [Theory]
    [InlineData("<Project>")]
    [InlineData("<!DOCTYPE Project [<!ENTITY ext SYSTEM 'file:///DO_NOT_READ'>]><Project>&ext;</Project>")]
    public async Task InvalidOrExternalEntityXmlProducesWarningsAndRetainsSource(string xml)
    {
        Write("Sample.csproj", xml);
        Write("Types.cs", "class Retained {}");
        var result = await Analyze();
        Assert.Contains(result.Warnings, w => w.Code == "INVALID_PROJECT_XML");
        Assert.Contains(result.Findings, f => f.Target == "Retained");
    }

    [Fact]
    public async Task MetadataReadsRespectByteLimits()
    {
        Write("Sample.csproj", "<Project>" + new string(' ', 200) + "</Project>");
        await Assert.ThrowsAsync<SourceInputException>(() => Analyze(100));
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}

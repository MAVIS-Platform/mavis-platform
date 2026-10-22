using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class CompileItemProfileTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-compile-" + Guid.NewGuid().ToString("N"));
    public CompileItemProfileTests() => Directory.CreateDirectory(_root);
    private void Write(string path, string content)
    {
        var full = Path.Combine(_root, path);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content);
    }
    private Task<DotnetAnalysisResult> Analyze() => new DotnetProjectAnalyzer(Options.Create(
        new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }))
        .AnalyzeAsync(new("project", "snapshot", _root, "job"), CancellationToken.None);

    [Fact]
    public async Task RemoveAndReincludeRespectDeclarationOrder()
    {
        Write("App.csproj", """
            <Project Sdk="Microsoft.NET.Sdk"><ItemGroup>
            <Compile Remove="Excluded/**/*.cs" />
            <Compile Include="Excluded/Keep.cs" />
            </ItemGroup></Project>
            """);
        Write("Main.cs", "class Main {}");
        Write("Excluded/Keep.cs", "class Keep {}");
        Write("Excluded/Nested/Skip.cs", "class Skip {}");
        var result = await Analyze();
        Assert.Equal(2, result.Coverage.AnalyzedFiles);
        Assert.Contains(result.Findings, f => f.Target == "Keep");
        Assert.DoesNotContain(result.Findings, f => f.Target == "Skip");
        Assert.Contains(result.Warnings, w => w.Code == "UNOWNED_SOURCE" && w.FilePath == "Excluded/Nested/Skip.cs");
    }

    [Fact]
    public async Task DisableDefaultsWithIncludeExcludeAndSemicolonPatterns()
    {
        Write("App.csproj", """
            <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup>
            <ItemGroup><Compile Include="src/**/*.cs;Extra.cs" Exclude="src/**/Skip?.cs" /></ItemGroup></Project>
            """);
        Write("src/Root.cs", "class Root {}");
        Write("src/deep/Nested.cs", "class Nested {}");
        Write("src/deep/Skip1.cs", "class Skip {}");
        Write("Extra.cs", "class Extra {}");
        Write("NotIncluded.cs", "class NotIncluded {}");
        var result = await Analyze();
        Assert.Equal(3, result.Coverage.AnalyzedFiles);
        Assert.DoesNotContain(result.Findings, f => f.Target is "Skip" or "NotIncluded");
    }

    [Fact]
    public async Task SharedLinkedFileIsAnalyzedForBothExplicitOwners()
    {
        foreach (var name in new[] { "A", "B" })
            Write($"{name}/{name}.csproj", """
                <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup>
                <ItemGroup><Compile Include="../Shared/Type.cs"><Link>Type.cs</Link></Compile></ItemGroup></Project>
                """);
        Write("Shared/Type.cs", "namespace Shared; class Type {}");
        var result = await Analyze();
        var types = result.Findings.Where(f => f.Kind == "Type").ToArray();
        Assert.Equal(2, types.Length);
        Assert.Equal(2, types.Select(f => f.Id).Distinct().Count());
        Assert.All(types, t => Assert.Equal("Shared/Type.cs", t.Evidence.FilePath));
        Assert.Equal(1, result.Coverage.AnalyzedFiles);
    }

    [Fact]
    public async Task SameDirectoryProjectsDoNotLoseAllFindings()
    {
        Write("A.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\" />");
        Write("B.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\"><ItemGroup><Compile Remove=\"OnlyA.cs\" /></ItemGroup></Project>");
        Write("OnlyA.cs", "class OnlyA {}");
        var result = await Analyze();
        Assert.Equal("A.csproj", Assert.Single(result.Findings.Where(f => f.Kind == "Type")).ProjectPath);
    }

    [Fact]
    public async Task ConditionalDynamicAndTargetGeneratedItemsAreNotApplied()
    {
        Write("App.csproj", """
            <Project Sdk="Microsoft.NET.Sdk"><ItemGroup>
            <Compile Remove="Main.cs" Condition="'$(Flag)' == 'true'" />
            <Compile Include="$(Sources)/**/*.cs" />
            </ItemGroup><Target Name="Build"><ItemGroup><Compile Remove="Main.cs" /></ItemGroup></Target></Project>
            """);
        Write("Main.cs", "class Main {}");
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Target == "Main");
        Assert.Equal(3, result.Warnings.Count(w => w.Code == "UNSUPPORTED_COMPILE_ITEM"));
        Assert.Contains(result.Warnings, w => w.Code == "PROJECT_ITEMS_UNEVALUATED");
    }

    [Fact]
    public async Task ChooseAndTargetPropertiesDoNotChangeStaticDefaults()
    {
        Write("App.csproj", """
            <Project Sdk="Microsoft.NET.Sdk">
            <Choose><Otherwise><ItemGroup><Compile Remove="Main.cs" /></ItemGroup></Otherwise></Choose>
            <Target Name="Build"><PropertyGroup><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup></Target>
            </Project>
            """);
        Write("Main.cs", "class Main {}");
        var result = await Analyze();
        Assert.Contains(result.Findings, f => f.Target == "Main");
        Assert.Equal(2, result.Warnings.Count(w => w.Code == "UNSUPPORTED_COMPILE_ITEM"));
    }

    [Fact]
    public async Task DefaultSettingsUseLastLiteralValueAndRespectGlobalDisable()
    {
        Write("App.csproj", """
            <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
            <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
            <EnableDefaultCompileItems>true</EnableDefaultCompileItems>
            </PropertyGroup></Project>
            """);
        Write("Main.cs", "class Main {}");
        Assert.Equal(1, (await Analyze()).Coverage.AnalyzedFiles);
        Write("App.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><EnableDefaultItems>false</EnableDefaultItems></PropertyGroup></Project>");
        Assert.Equal(0, (await Analyze()).Coverage.AnalyzedFiles);
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}

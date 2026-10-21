using System.Security.Cryptography;
using System.Text;
using MAVIS.Worker.Application.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MAVIS.Worker.Infrastructure.CSharp;

internal static class SemanticProjectInspector
{
    // Only host runtime references, never arbitrary binaries or build tasks from the input repository.
    private static readonly Lazy<MetadataReference[]> References = new(() =>
        ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? typeof(object).Assembly.Location)
        .Split(Path.PathSeparator).Distinct().Select(p => MetadataReference.CreateFromFile(p)).ToArray());

    public static void Inspect(string root, IReadOnlyList<ProjectCompileProfile> profiles,
        IReadOnlyDictionary<string, SyntaxTree> trees, List<DotnetFinding> findings,
        List<AnalysisWarning> warnings, CancellationToken ct, ConfigurationCatalog configuration)
    {
        var compilations = new Dictionary<string, CSharpCompilation>();
        var visiting = new HashSet<string>();
        foreach (var profile in profiles)
        {
            ct.ThrowIfCancellationRequested();
            var compilation = Build(profile);
            var project = Path.GetRelativePath(root, profile.Project).Replace('\\', '/');
            var errors = compilation.GetDiagnostics(ct).Where(d => d.Severity == DiagnosticSeverity.Error).Take(21).ToArray();
            if (errors.Length > 0)
                warnings.Add(new("SEMANTIC_LIMITATIONS", "Host-runtime compilation has missing references or errors; only resolved symbols are published. Diagnostic IDs: " +
                    string.Join(",", errors.Take(20).Select(d => d.Id).Distinct()), project));
            HttpClientInspector.Inspect(root, project, compilation, configuration, findings, warnings, ct);
            foreach (var tree in compilation.SyntaxTrees)
            {
                ct.ThrowIfCancellationRequested();
                var syntax = tree.GetRoot(ct);
                var model = compilation.GetSemanticModel(tree);
                var relative = Path.GetRelativePath(root, tree.FilePath).Replace('\\', '/');
                foreach (var type in syntax.DescendantNodes().OfType<TypeDeclarationSyntax>())
                {
                    ct.ThrowIfCancellationRequested();
                    if (model.GetDeclaredSymbol(type, ct) is not INamedTypeSymbol symbol) continue;
                    var subject = Name(symbol);
                    if (type.BaseList is not null)
                        foreach (var baseType in type.BaseList.Types)
                        {
                            var resolved = model.GetTypeInfo(baseType.Type, ct).Type;
                            if (resolved is null or IErrorTypeSymbol) continue;
                            Add(resolved.TypeKind == TypeKind.Interface && symbol.TypeKind != TypeKind.Interface ? "Implements" : "Inherits", subject, Name(resolved), baseType, "ResolvedSymbol");
                        }
                    foreach (var field in type.Members.OfType<FieldDeclarationSyntax>())
                    {
                        var resolved = model.GetTypeInfo(field.Declaration.Type, ct).Type;
                        Dependency(resolved, field.Declaration.Type);
                    }
                    foreach (var parameter in type.Members.OfType<ConstructorDeclarationSyntax>().SelectMany(c => c.ParameterList.Parameters))
                        if (parameter.Type is not null) Dependency(model.GetTypeInfo(parameter.Type, ct).Type, parameter.Type);

                    void Dependency(ITypeSymbol? dependency, SyntaxNode evidence)
                    {
                        if (dependency is null or IErrorTypeSymbol || dependency.SpecialType != SpecialType.None || dependency is ITypeParameterSymbol) return;
                        Add("CodeDependency", subject, Name(dependency), evidence, "ResolvedSymbol");
                    }
                }
                AspNetSourceInspector.Inspect(syntax, model, project, relative, findings, warnings, ct);

                void Add(string kind, string subject, string target, SyntaxNode node, string confidence)
                {
                    var span = node.GetLocation().GetLineSpan();
                    findings.Add(new(kind, project, target, null,
                        new(relative, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1), subject,
                        Id(project, kind, subject + "->" + target), Confidence: confidence));
                }
            }
        }

        CSharpCompilation Build(ProjectCompileProfile profile)
        {
            if (compilations.TryGetValue(profile.Project, out var known)) return known;
            visiting.Add(profile.Project);
            var project = Path.GetRelativePath(root, profile.Project).Replace('\\', '/');
            var references = new List<MetadataReference>(References.Value);
            foreach (var reference in findings.Where(f => f.Kind == "ProjectReference" && f.ProjectPath == project).ToArray())
            {
                ct.ThrowIfCancellationRequested();
                var target = profiles.FirstOrDefault(p => Path.GetRelativePath(root, p.Project).Replace('\\', '/') == reference.Target);
                if (target is null) continue;
                if (visiting.Contains(target.Project))
                {
                    warnings.Add(new("PROJECT_REFERENCE_CYCLE", "Cyclic reference omitted from host semantic compilation.", project));
                    continue;
                }
                references.Add(Build(target).ToMetadataReference());
            }
            var projectTrees = profile.Files.Where(trees.ContainsKey).Select(f => trees[f]).ToList();
            if (profile.ImplicitNamespaces.Count > 0)
                projectTrees.Add(CSharpSyntaxTree.ParseText(string.Join("\n", profile.ImplicitNamespaces.Select(n => "global using " + n + ";")),
                    path: Path.Combine(root, ".mavis-generated", Id(project, "GlobalUsings", project) + ".cs"), cancellationToken: ct));
            var compilation = CSharpCompilation.Create("Mavis_" + Id(project, "Assembly", project), projectTrees, references,
                new CSharpCompilationOptions(profile.IsExecutable ? OutputKind.ConsoleApplication : OutputKind.DynamicallyLinkedLibrary));
            visiting.Remove(profile.Project);
            compilations[profile.Project] = compilation;
            return compilation;
        }
    }

    internal static string Name(ITypeSymbol symbol)
    {
        if (symbol is not INamedTypeSymbol named) return symbol.ToDisplayString();
        var names = new Stack<string>();
        for (var current = named; current is not null; current = current.ContainingType) names.Push(current.MetadataName);
        var ns = named.ContainingNamespace is { IsGlobalNamespace: false } space ? space.ToDisplayString() + "." : "";
        return ns + string.Join(".", names);
    }
    internal static string Id(string project, string kind, string identity) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(project + "\n" + kind + "\n" + identity))).ToLowerInvariant();
}

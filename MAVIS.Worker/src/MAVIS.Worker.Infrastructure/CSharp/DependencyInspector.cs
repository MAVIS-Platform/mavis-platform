using MAVIS.Worker.Application.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MAVIS.Worker.Infrastructure.CSharp;

internal static class DependencyInspector
{
    private sealed record Binding(string Provider, string? Key, IReadOnlyDictionary<string, string>? Configuration,
        IReadOnlyList<SourceReference> Evidence, string Status);

    public static void Inspect(string root, string project, CSharpCompilation compilation, ConfigurationCatalog config,
        List<DotnetFinding> findings, List<AnalysisWarning> warnings, CancellationToken ct)
    {
        var bindings = new Dictionary<string, List<Binding>>(StringComparer.Ordinal);
        foreach (var tree in compilation.SyntaxTrees)
        {
            var model = compilation.GetSemanticModel(tree);
            foreach (var call in tree.GetRoot(ct).DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                ct.ThrowIfCancellationRequested();
                if (call.Expression is not MemberAccessExpressionSyntax member) continue;
                var name = member.Name.Identifier.ValueText;
                var symbol = model.GetSymbolInfo(call, ct).Symbol as IMethodSymbol;
                if (name is "AddScoped" or "AddTransient" or "AddSingleton")
                {
                    if (symbol is null || !symbol.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.Extensions.DependencyInjection", StringComparison.Ordinal))
                    { warnings.Add(new("UNRESOLVED_DI_REGISTRATION", "DI registration requires resolved service collection API and static types.", Ref(call).FilePath)); continue; }
                    var types = member.Name is GenericNameSyntax generic ? generic.TypeArgumentList.Arguments.Select(t => model.GetTypeInfo(t, ct).Type).ToArray()
                        : call.ArgumentList.Arguments.Select(a => a.Expression).OfType<TypeOfExpressionSyntax>().Select(t => model.GetTypeInfo(t.Type, ct).Type).ToArray();
                    var supportedArguments = member.Name is GenericNameSyntax ? call.ArgumentList.Arguments.Count == 0 :
                        call.ArgumentList.Arguments.Count == 2 && call.ArgumentList.Arguments.All(a => a.Expression is TypeOfExpressionSyntax);
                    if (!supportedArguments || types.Length is < 1 or > 2 || types.Any(t => t is null or IErrorTypeSymbol))
                    { warnings.Add(new("UNRESOLVED_DI_REGISTRATION", "Factory/dynamic DI registration is outside the profile.", Ref(call).FilePath)); continue; }
                    var service = SemanticProjectInspector.Name(types[0]!); var implementation = SemanticProjectInspector.Name(types[^1]!);
                    Add("DependencyInjection", call, service, implementation, "ResolvedSymbol", [], new Dictionary<string, string>
                    { ["serviceType"] = service, ["implementationType"] = implementation, ["lifetime"] = name[3..], ["dependencyKind"] = "DI" });
                }
                if (name != "AddDbContext" || member.Name is not GenericNameSyntax context || context.TypeArgumentList.Arguments.Count != 1) continue;
                var contextType = model.GetTypeInfo(context.TypeArgumentList.Arguments[0], ct).Type as INamedTypeSymbol;
                if (contextType is null || !EfContext(contextType)) continue;
                if (symbol is not null && !symbol.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.Extensions.DependencyInjection", StringComparison.Ordinal)) continue;
                foreach (var providerCall in call.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    if (providerCall.Expression is not MemberAccessExpressionSyntax provider) continue;
                    var providerName = provider.Name.Identifier.ValueText;
                    if (providerName is not ("UseSqlServer" or "UseNpgsql" or "UseSqlite" or "UseMySql")) continue;
                    var providerMethod = model.GetSymbolInfo(providerCall, ct).Symbol as IMethodSymbol;
                    if (providerMethod is not null && providerMethod.ContainingNamespace.ToDisplayString() != "Microsoft.EntityFrameworkCore") continue;
                    var expression = providerCall.ArgumentList.Arguments.FirstOrDefault()?.Expression;
                    var key = ConnectionKey(expression, model);
                    var value = key is null ? (Value: (IReadOnlyDictionary<string, string>?)null, Evidence: (IReadOnlyList<SourceReference>)[], Status: "Unresolved") : config.Connection(project, key);
                    if (providerCall.Ancestors().TakeWhile(n => n != call).Any(n => n is IfStatementSyntax or ConditionalExpressionSyntax or SwitchStatementSyntax))
                        value = (null, value.Evidence, "Conditional");
                    if (providerName != "UseSqlite" && value.Value?.ContainsKey("fileReference") == true) value = (null, value.Evidence, "Unresolved");
                    var binding = new Binding(providerName, key, value.Value, value.Evidence.Prepend(Ref(providerCall)).ToArray(), value.Status);
                    var id = SemanticProjectInspector.Name(contextType);
                    if (!bindings.TryGetValue(id, out var entries)) bindings[id] = entries = [];
                    entries.Add(binding);
                    Access(providerCall, id, "CONFIGURE", binding);
                }
            }
        }
        foreach (var tree in compilation.SyntaxTrees)
        {
            var model = compilation.GetSemanticModel(tree);
            foreach (var call in tree.GetRoot(ct).DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                ct.ThrowIfCancellationRequested();
                if (call.Expression is not MemberAccessExpressionSyntax member) continue;
                var name = member.Name.Identifier.ValueText;
                if (name is not ("SaveChanges" or "SaveChangesAsync" or "ToListAsync" or "ToArrayAsync" or "FirstOrDefaultAsync" or "CountAsync" or "AnyAsync")) continue;
                var type = model.GetTypeInfo(member.Expression, ct).Type as INamedTypeSymbol;
                var context = type is not null && EfContext(type) ? type : null;
                if (context is null && name is not ("SaveChanges" or "SaveChangesAsync"))
                    foreach (var access in member.Expression.DescendantNodesAndSelf().OfType<MemberAccessExpressionSyntax>())
                        if (model.GetSymbolInfo(access, ct).Symbol is IPropertySymbol property && EfContext(property.ContainingType) &&
                            property.Type is INamedTypeSymbol set && set.Name == "DbSet" && (set.ContainingNamespace.ToDisplayString() == "Microsoft.EntityFrameworkCore" || EfUsing(access)))
                        { context = property.ContainingType; break; }
                if (context is null) continue;
                var method = model.GetSymbolInfo(call, ct).Symbol as IMethodSymbol;
                if (method is not null && !method.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal)) continue;
                var id = SemanticProjectInspector.Name(context);
                var binding = new Binding("Unknown", null, null, [], "Unresolved");
                if (bindings.TryGetValue(id, out var entries))
                {
                    if (entries.Select(e => e.Provider + "|" + e.Key + "|" + e.Status).Distinct().Count() == 1) binding = entries[0] with { Evidence = entries.SelectMany(e => e.Evidence).Distinct().ToArray() };
                    else binding = binding with { Status = "Ambiguous", Evidence = entries.SelectMany(e => e.Evidence).Distinct().ToArray() };
                }
                Access(call, id, name.StartsWith("SaveChanges", StringComparison.Ordinal) ? "WRITE" : "READ", binding);
            }
        }

        bool EfContext(INamedTypeSymbol type)
        {
            for (INamedTypeSymbol? current = type; current is not null; current = current.BaseType)
            {
                if (current.ToDisplayString() == "Microsoft.EntityFrameworkCore.DbContext") return true;
                if (current.BaseType is IErrorTypeSymbol { Name: "DbContext" } && current.DeclaringSyntaxReferences.Any(r => EfUsing(r.GetSyntax(ct)))) return true;
            }
            return false;
        }
        bool EfUsing(SyntaxNode node) => node.SyntaxTree.GetRoot(ct).DescendantNodes().OfType<UsingDirectiveSyntax>().Any(u => u.Name?.ToString() == "Microsoft.EntityFrameworkCore");
        string? ConnectionKey(ExpressionSyntax? expression, SemanticModel model)
        {
            if (expression is InvocationExpressionSyntax call && call.Expression is MemberAccessExpressionSyntax { Name.Identifier.ValueText: "GetConnectionString" } get && IsConfig(get.Expression, model))
                return Constant(call.ArgumentList.Arguments.FirstOrDefault()?.Expression, model);
            if (expression is ElementAccessExpressionSyntax index && IsConfig(index.Expression, model) && Constant(index.ArgumentList.Arguments.FirstOrDefault()?.Expression, model) is { } key && key.StartsWith("ConnectionStrings:", StringComparison.Ordinal))
                return key[18..];
            return null;
        }
        bool IsConfig(ExpressionSyntax expression, SemanticModel model) => model.GetTypeInfo(expression, ct).Type is INamedTypeSymbol type &&
            (type.ToDisplayString() == "Microsoft.Extensions.Configuration.IConfiguration" || type.AllInterfaces.Any(i => i.ToDisplayString() == "Microsoft.Extensions.Configuration.IConfiguration"));
        string? Constant(ExpressionSyntax? expression, SemanticModel model)
        { if (expression is null) return null; var value = model.GetConstantValue(expression, ct); return value.HasValue ? value.Value as string : null; }
        SourceReference Ref(SyntaxNode node)
        {
            var span = node.GetLocation().GetLineSpan();
            return new(Path.GetRelativePath(root, node.SyntaxTree.FilePath).Replace(Path.DirectorySeparatorChar, '/'), span.StartLinePosition.Line + 1,
                span.EndLinePosition.Line + 1, span.StartLinePosition.Character + 1, span.EndLinePosition.Character + 1);
        }
        void Access(SyntaxNode node, string context, string operation, Binding binding)
        {
            var properties = binding.Configuration is null ? new Dictionary<string, string>() : new Dictionary<string, string>(binding.Configuration);
            properties["provider"] = binding.Provider; properties["operation"] = operation; properties["dependencyKind"] = "DATA_ACCESS";
            var mapped = binding.Configuration is not null && binding.Status == "ConfigurationAlias";
            Add("DataAccess", node, context, mapped ? binding.Key : null, mapped ? "ConfigurationAlias" : binding.Status, binding.Evidence, properties);
            if (!mapped) warnings.Add(new("UNRESOLVED_DATABASE_TARGET", "EF context access has no unique supported connection configuration; database remains unresolved.", Ref(node).FilePath));
        }
        void Add(string kind, SyntaxNode node, string subject, string? target, string status, IReadOnlyList<SourceReference> evidence, IReadOnlyDictionary<string, string> properties) =>
            findings.Add(new(kind, project, target, null, Ref(node), subject, SemanticProjectInspector.Id(project, kind, Ref(node).FilePath + "|" + node.SpanStart),
                evidence.Where(e => e != Ref(node)).Distinct().ToArray(), "StaticProfile", status, properties));
    }
}

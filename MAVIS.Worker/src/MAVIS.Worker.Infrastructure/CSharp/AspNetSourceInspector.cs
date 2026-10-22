using MAVIS.Worker.Application.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>Static supported ASP.NET patterns. Candidate findings never assert a runtime interaction.</summary>
internal static class AspNetSourceInspector
{
    public static void Inspect(SyntaxNode root, SemanticModel model, string project, string file,
        List<DotnetFinding> findings, List<AnalysisWarning> warnings, CancellationToken ct)
    {
        foreach (var type in root.DescendantNodes().OfType<TypeDeclarationSyntax>())
        {
            ct.ThrowIfCancellationRequested();
            ControllerEndpointInspector.Inspect(root, type, model, project, file, findings, warnings, ct);
            if (type.BaseList?.Types.Any(t => t.Type.ToString().Split('.').Last() == "DbContext") == true)
                Add("DbContextCandidate", type.Identifier.ValueText, null, type.Identifier.Parent!, type.Identifier.ValueText);
            foreach (var property in type.Members.OfType<PropertyDeclarationSyntax>())
                if ((property.Type is QualifiedNameSyntax qualified ? qualified.Right : property.Type) is GenericNameSyntax { Identifier.ValueText: "DbSet" } set)
                    Add("DatabaseSetCandidate", set.TypeArgumentList.Arguments.ToString(), null, property.Type, type.Identifier.ValueText);
        }

        foreach (var call in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            ct.ThrowIfCancellationRequested();
            if (call.Expression is not MemberAccessExpressionSyntax member) continue;
            var name = member.Name.Identifier.ValueText;
            var args = call.ArgumentList.Arguments;
            var generics = member.Name is GenericNameSyntax generic ? generic.TypeArgumentList.Arguments : default;
            if (name is "MapGet" or "MapPost" or "MapPut" or "MapDelete" or "MapPatch" or "MapHead" or "MapOptions" or "MapMethods")
            {
                if (model.GetSymbolInfo(call, ct).Symbol is IMethodSymbol known &&
                    !known.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal))
                { Unresolved(call); continue; }
                var route = Constant(args.FirstOrDefault()?.Expression);
                var prefix = GroupPrefix(member.Expression, new HashSet<string>(), 0);
                if (route is null || prefix is null) { Unresolved(call); continue; }
                var verbs = name == "MapMethods" ? Methods(args.ElementAtOrDefault(1)?.Expression) : new[] { name[3..].ToUpperInvariant() };
                if (verbs is null) { Unresolved(call); continue; }
                foreach (var verb in verbs) Add("MinimalApiEndpointCandidate", Join(prefix, route), verb, call, name);
            }
            if (name is "MapFallback" or "MapFallbackToFile" or "MapControllerRoute" or "MapDefaultControllerRoute") Unresolved(call);
            if (name is "AddScoped" or "AddSingleton" or "AddTransient")
            {
                if (generics.Count > 0) Add("DiRegistrationCandidate", string.Join("->", generics.Select(t => t.ToString())), null, call, name);
                else Unresolved(call);
            }
            if (name == "AddDbContext" && generics.Count > 0)
                Add("DbContextRegistrationCandidate", generics[0].ToString(), null, call, name);
        }

        string? Constant(ExpressionSyntax? expression)
        {
            if (expression is null) return null;
            var value = model.GetConstantValue(expression, ct);
            return value.HasValue && value.Value is string text ? text : null;
        }

        string[]? Methods(ExpressionSyntax? expression)
        {
            var items = expression switch
            {
                ImplicitArrayCreationExpressionSyntax a => a.Initializer.Expressions.ToArray(),
                ArrayCreationExpressionSyntax a => a.Initializer?.Expressions.ToArray(),
                CollectionExpressionSyntax a when a.Elements.All(e => e is ExpressionElementSyntax) => a.Elements.Cast<ExpressionElementSyntax>().Select(e => e.Expression).ToArray(),
                _ => null
            };
            if (items is null || items.Length == 0 || items.Length > 16) return null;
            var values = items.Select(e => Constant(e)?.ToUpperInvariant()).ToArray();
            return values.All(v => v is "GET" or "POST" or "PUT" or "DELETE" or "PATCH" or "HEAD" or "OPTIONS") ? values.Cast<string>().Distinct().ToArray() : null;
        }

        string? GroupPrefix(ExpressionSyntax expression, HashSet<string> visited, int depth)
        {
            if (depth > 16) return null;
            if (expression is InvocationExpressionSyntax invocation && invocation.Expression is MemberAccessExpressionSyntax group && group.Name.Identifier.ValueText == "MapGroup")
            {
                var route = Constant(invocation.ArgumentList.Arguments.FirstOrDefault()?.Expression);
                var parent = GroupPrefix(group.Expression, visited, depth + 1);
                return route is null || parent is null ? null : Join(parent, route);
            }
            if (expression is IdentifierNameSyntax identifier)
            {
                var symbol = model.GetSymbolInfo(identifier, ct).Symbol;
                if (symbol is ILocalSymbol)
                {
                    if (!visited.Add(symbol.ToDisplayString())) return null;
                    var declaration = symbol.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax(ct) as VariableDeclaratorSyntax;
                    if (declaration?.Initializer?.Value is InvocationExpressionSyntax init && init.Expression is MemberAccessExpressionSyntax access && access.Name.Identifier.ValueText == "MapGroup")
                    {
                        if (root.DescendantNodes().OfType<AssignmentExpressionSyntax>().Any(a => SymbolEqualityComparer.Default.Equals(model.GetSymbolInfo(a.Left, ct).Symbol, symbol))) return null;
                        return GroupPrefix(init, visited, depth + 1);
                    }
                    // A local initialized by an unknown fluent chain may hide a route group.
                    if (declaration?.Initializer?.Value is InvocationExpressionSyntax other && other.Expression is MemberAccessExpressionSyntax otherMember &&
                        otherMember.Name.Identifier.ValueText != "Build") return null;
                }
                return "";
            }
            return null;
        }

        void Add(string kind, string? target, string? verb, SyntaxNode node, string subject)
        {
            if (target is not null && kind.Contains("Endpoint", StringComparison.Ordinal)) target = SafeRoute(target);
            var span = node.GetLocation().GetLineSpan();
            findings.Add(new(kind, project, target, verb, new(file, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1, span.StartLinePosition.Character + 1, span.EndLinePosition.Character + 1), subject,
                SemanticProjectInspector.Id(project, kind, subject + "|" + verb + "|" + target)));
        }
        void Unresolved(SyntaxNode node) => warnings.Add(new("UNRESOLVED_ASPNET_PATTERN", "Nonconstant or unsupported ASP.NET pattern requires review.", file));
    }

    private static string Attribute(AttributeSyntax a) => a.Name.ToString().Split('.').Last().Replace("Attribute", "", StringComparison.Ordinal);
    private static string Join(string prefix, string route) => "/" + string.Join("/", new[] { prefix.Trim('/'), route.Trim('/') }.Where(s => s.Length > 0));
    internal static string SafeRoute(string route)
    {
        if (Uri.TryCreate(route, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https") route = uri.AbsolutePath;
        // Keep route optional-parameter '?' inside {...}; remove real query/fragment data.
        var depth = 0;
        for (var i = 0; i < route.Length; i++)
        {
            if (route[i] == '{') depth++;
            if (route[i] == '}') depth--;
            if (depth == 0 && route[i] is '?' or '#') return route[..i];
        }
        return route;
    }
}

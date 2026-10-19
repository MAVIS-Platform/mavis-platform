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
            var attributes = type.AttributeLists.SelectMany(a => a.Attributes).ToArray();
            var isController = attributes.Any(a => Attribute(a) == "ApiController") || type.Identifier.ValueText.EndsWith("Controller", StringComparison.Ordinal);
            var controller = type.Identifier.ValueText;
            if (controller.EndsWith("Controller", StringComparison.Ordinal)) controller = controller[..^10];
            var routes = attributes.Where(a => Attribute(a) == "Route").ToArray();
            foreach (var method in type.Members.OfType<MethodDeclarationSyntax>())
            {
                foreach (var attribute in method.AttributeLists.SelectMany(a => a.Attributes))
                {
                    var name = Attribute(attribute);
                    var verb = name switch { "HttpGet" or "Get" => "GET", "HttpPost" or "Post" => "POST", "HttpPut" or "Put" => "PUT",
                        "HttpDelete" or "Delete" => "DELETE", "HttpPatch" or "Patch" => "PATCH", "HttpHead" or "Head" => "HEAD", "HttpOptions" or "Options" => "OPTIONS", _ => null };
                    if (verb is null) continue;
                    if (isController && name.StartsWith("Http", StringComparison.Ordinal))
                    {
                        var action = attribute.ArgumentList is null || attribute.ArgumentList.Arguments.Count == 0 ? "" : Constant(attribute.ArgumentList.Arguments.FirstOrDefault()?.Expression);
                        if (action is null) { Unresolved(attribute); continue; }
                        var prefixes = routes.Length == 0 ? new string?[] { "" } : routes.Select(a => Constant(a.ArgumentList?.Arguments.FirstOrDefault()?.Expression));
                        foreach (var prefix in prefixes)
                        {
                            if (prefix is null) { Unresolved(attribute); continue; }
                            var path = action.StartsWith('/') || action.StartsWith("~/", StringComparison.Ordinal) ? action.TrimStart('~') : Join(prefix, action);
                            path = path.Replace("[controller]", controller, StringComparison.OrdinalIgnoreCase).Replace("[action]", method.Identifier.ValueText, StringComparison.OrdinalIgnoreCase);
                            Add("ApiEndpointCandidate", path, verb, attribute, type.Identifier.ValueText + "." + method.Identifier.ValueText);
                        }
                    }
                    else if (type is InterfaceDeclarationSyntax && attribute.Name.ToString().Contains("Refit", StringComparison.Ordinal) ||
                             type is InterfaceDeclarationSyntax && root.DescendantNodes().OfType<UsingDirectiveSyntax>().Any(u => u.Name?.ToString() == "Refit"))
                    {
                        var path = Constant(attribute.ArgumentList?.Arguments.FirstOrDefault()?.Expression);
                        if (path is not null) Add("RefitEndpointCandidate", SafeRoute(path), verb, attribute, type.Identifier.ValueText + "." + method.Identifier.ValueText);
                        else Unresolved(attribute);
                    }
                }
            }
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
            if (name is "MapGet" or "MapPost" or "MapPut" or "MapDelete" or "MapPatch" or "MapHead" or "MapOptions")
            {
                var route = Constant(args.FirstOrDefault()?.Expression);
                var prefix = GroupPrefix(member.Expression, new HashSet<string>(), 0);
                if (route is null || prefix is null) { Unresolved(call); continue; }
                Add("MinimalApiEndpointCandidate", Join(prefix, route), name[3..].ToUpperInvariant(), call, name);
            }
            if (name is "AddScoped" or "AddSingleton" or "AddTransient")
            {
                if (generics.Count > 0) Add("DiRegistrationCandidate", string.Join("->", generics.Select(t => t.ToString())), null, call, name);
                else Unresolved(call);
            }
            if (name == "AddDbContext" && generics.Count > 0)
                Add("DbContextRegistrationCandidate", generics[0].ToString(), null, call, name);
            if (name == "AddHttpClient")
            {
                var clientName = generics.Count > 0 ? string.Join(",", generics) : args.Count == 0 ? "DefaultClient" : Constant(args.FirstOrDefault()?.Expression) ?? "UnresolvedNamedClient";
                Add("HttpClientRegistrationCandidate", clientName, null, call, name);
                foreach (var assignment in call.DescendantNodes().OfType<AssignmentExpressionSyntax>())
                    if (assignment.Left is MemberAccessExpressionSyntax { Name.Identifier.ValueText: "BaseAddress" } &&
                        assignment.Right is ObjectCreationExpressionSyntax uriCreation &&
                        Uri.TryCreate(Constant(uriCreation.ArgumentList?.Arguments.FirstOrDefault()?.Expression), UriKind.Absolute, out var address) && address.Scheme is "http" or "https")
                        Add("HttpClientBaseAddressCandidate", address.Host, null, assignment, clientName);
            }
            if (name == "CreateClient") Add("HttpClientFactoryCandidate", null, null, call, "CreateClient");
            if (name == "SaveChanges" || name == "SaveChangesAsync") Add("DatabaseWriteCandidate", null, null, call, name);
            if (model.GetSymbolInfo(call, ct).Symbol is IMethodSymbol httpMethod &&
                httpMethod.ContainingType.ToDisplayString() == "System.Net.Http.HttpClient")
            {
                var verb = name switch { "GetAsync" or "GetStringAsync" or "GetByteArrayAsync" or "GetStreamAsync" => "GET",
                    "PostAsync" => "POST", "PutAsync" => "PUT", "DeleteAsync" => "DELETE", "PatchAsync" => "PATCH", _ => null };
                if (verb is not null)
                {
                    var url = Constant(args.FirstOrDefault()?.Expression);
                    var knownTarget = Uri.TryCreate(url, UriKind.Absolute, out var target) && target.Scheme is "http" or "https";
                        var span = call.GetLocation().GetLineSpan();
                        findings.Add(new("OutgoingHttp", project, knownTarget ? target!.Host : null, verb,
                            new(file, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1), "System.Net.Http.HttpClient",
                            SemanticProjectInspector.Id(project, "OutgoingHttp", file + "|" + span.StartLinePosition + "|" + (knownTarget ? target!.Host : "unresolved")), Confidence: "ResolvedSymbol"));
                    if (!knownTarget) warnings.Add(new("UNRESOLVED_HTTP_TARGET", "HttpClient call resolved but destination requires configuration or runtime context.", file));
                }
            }
        }

        string? Constant(ExpressionSyntax? expression)
        {
            if (expression is null) return null;
            var value = model.GetConstantValue(expression, ct);
            return value.HasValue && value.Value is string text ? text : null;
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
            findings.Add(new(kind, project, target, verb, new(file, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1), subject,
                SemanticProjectInspector.Id(project, kind, subject + "|" + verb + "|" + target)));
        }
        void Unresolved(SyntaxNode node) => warnings.Add(new("UNRESOLVED_ASPNET_PATTERN", "Nonconstant or unsupported ASP.NET pattern requires review.", file));
    }

    private static string Attribute(AttributeSyntax a) => a.Name.ToString().Split('.').Last().Replace("Attribute", "", StringComparison.Ordinal);
    private static string Join(string prefix, string route) => "/" + string.Join("/", new[] { prefix.Trim('/'), route.Trim('/') }.Where(s => s.Length > 0));
    private static string SafeRoute(string route)
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

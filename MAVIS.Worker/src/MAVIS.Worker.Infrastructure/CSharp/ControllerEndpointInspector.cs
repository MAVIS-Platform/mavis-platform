using MAVIS.Worker.Application.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MAVIS.Worker.Infrastructure.CSharp;

internal static class ControllerEndpointInspector
{
    public static void Inspect(SyntaxNode root, TypeDeclarationSyntax type, SemanticModel model, string project, string file,
        List<DotnetFinding> findings, List<AnalysisWarning> warnings, CancellationToken ct)
    {
        var attributes = type.AttributeLists.SelectMany(a => a.Attributes).ToArray();
        var controller = type.Identifier.ValueText;
        var isController = attributes.Any(a => Name(a) == "ApiController") || controller.EndsWith("Controller", StringComparison.Ordinal);
        if (controller.EndsWith("Controller", StringComparison.Ordinal)) controller = controller[..^10];
        var prefixes = attributes.Where(a => Name(a) == "Route").Select(Template).ToArray();
        var area = attributes.Where(a => Name(a) == "Area").Select(Template).FirstOrDefault();
        foreach (var method in type.Members.OfType<MethodDeclarationSyntax>())
        {
            ct.ThrowIfCancellationRequested();
            var methodAttributes = method.AttributeLists.SelectMany(a => a.Attributes).ToArray();
            if (isController && (methodAttributes.Any(a => Name(a) == "NonAction") ||
                !method.Modifiers.Any(m => m.ValueText == "public") || method.Modifiers.Any(m => m.ValueText == "static") || method.TypeParameterList is not null)) continue;
            var methodRoutes = methodAttributes.Where(a => Name(a) == "Route").Select(Template).ToArray();
            foreach (var attribute in methodAttributes)
            {
                var name = Name(attribute);
                var verb = name switch { "HttpGet" or "Get" => "GET", "HttpPost" or "Post" => "POST", "HttpPut" or "Put" => "PUT",
                    "HttpDelete" or "Delete" => "DELETE", "HttpPatch" or "Patch" => "PATCH", "HttpHead" or "Head" => "HEAD", "HttpOptions" or "Options" => "OPTIONS", _ => null };
                if (verb is null)
                {
                    if (name == "AcceptVerbs") Warn();
                    continue;
                }
                if (isController && name.StartsWith("Http", StringComparison.Ordinal))
                {
                    var own = Template(attribute);
                    if (!string.IsNullOrEmpty(own) && methodRoutes.Length > 0) { Warn(); continue; }
                    var actions = own == "" && methodRoutes.Length > 0 ? methodRoutes : new[] { own };
                    foreach (var action in actions)
                    {
                        if (action is null || action == "" && prefixes.Length == 0) { Warn(); continue; }
                        var absolute = action.StartsWith('/') || action.StartsWith("~/", StringComparison.Ordinal);
                        foreach (var prefix in absolute || prefixes.Length == 0 ? new string?[] { "" } : prefixes)
                        {
                            if (prefix is null) { Warn(); continue; }
                            var path = absolute ? action.TrimStart('~') : "/" + string.Join('/', new[] { prefix.Trim('/'), action.Trim('/') }.Where(p => p.Length > 0));
                            path = path.Replace("[controller]", controller, StringComparison.OrdinalIgnoreCase).Replace("[action]", method.Identifier.ValueText, StringComparison.OrdinalIgnoreCase);
                            if (area is not null) path = path.Replace("[area]", area, StringComparison.OrdinalIgnoreCase);
                            if (path.Contains('[') || path.Contains(']')) { Warn(); continue; }
                            Add("ApiEndpointCandidate", path, verb, attribute);
                        }
                    }
                }
                else if (type is InterfaceDeclarationSyntax && IsRefit(attribute))
                {
                    var path = Template(attribute);
                    if (path is null) Warn(); else Add("RefitEndpointCandidate", path, verb, attribute);
                }
            }
        }

        bool IsRefit(AttributeSyntax attribute)
        {
            if (model.GetSymbolInfo(attribute, ct).Symbol is IMethodSymbol constructor)
                return constructor.ContainingNamespace.ToDisplayString() == "Refit";
            return attribute.Name.ToString().StartsWith("Refit.", StringComparison.Ordinal) ||
                attribute.Name is IdentifierNameSyntax && root.DescendantNodes().OfType<UsingDirectiveSyntax>().Any(u => u.Alias is null && u.Name?.ToString() == "Refit");
        }

        string? Template(AttributeSyntax attribute)
        {
            var argument = attribute.ArgumentList?.Arguments.FirstOrDefault(a => a.NameEquals is null && (a.NameColon is null || a.NameColon.Name.Identifier.ValueText == "template"));
            if (argument is null) return "";
            var constant = model.GetConstantValue(argument.Expression, ct);
            return constant.HasValue && constant.Value is string value ? value : null;
        }
        void Add(string kind, string path, string verb, AttributeSyntax attribute)
        {
            var span = attribute.GetLocation().GetLineSpan();
            var method = (MethodDeclarationSyntax)attribute.Ancestors().First(a => a is MethodDeclarationSyntax);
            var typeName = model.GetDeclaredSymbol(type, ct) is INamedTypeSymbol symbol ? SemanticProjectInspector.Name(symbol) : type.Identifier.ValueText;
            var subject = typeName + "." + method.Identifier.ValueText + "(" + string.Join(',', method.ParameterList.Parameters.Select(p => p.Type?.ToString())) + ")";
            path = AspNetSourceInspector.SafeRoute(path);
            findings.Add(new(kind, project, path, verb, new(file, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1,
                span.StartLinePosition.Character + 1, span.EndLinePosition.Character + 1), subject, SemanticProjectInspector.Id(project, kind, subject + "|" + verb + "|" + path)));
        }
        void Warn() => warnings.Add(new("UNRESOLVED_ASPNET_PATTERN", "Unsupported/nonconstant controller route or HTTP method metadata; endpoint omitted.", file));
    }
    private static string Name(AttributeSyntax a) => a.Name.ToString().Split('.').Last().Replace("Attribute", "", StringComparison.Ordinal);
}

using MAVIS.Worker.Application.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MAVIS.Worker.Infrastructure.CSharp;

internal static class HttpClientInspector
{
    private sealed record Mapping(Uri? Address, IReadOnlyList<SourceReference> Evidence, string Status);
    private static readonly Mapping Unknown = new(null, [], "Unresolved");

    public static void Inspect(string root, string project, CSharpCompilation compilation, ConfigurationCatalog config,
        List<DotnetFinding> findings, List<AnalysisWarning> warnings, CancellationToken ct)
    {
        var registrations = new Dictionary<string, List<Mapping>>(StringComparer.Ordinal);
        var trees = compilation.SyntaxTrees.OrderBy(t => t.FilePath, StringComparer.Ordinal).ToArray();
        foreach (var tree in trees)
        {
            var syntax = tree.GetRoot(ct); var model = compilation.GetSemanticModel(tree);
            if (syntax.DescendantNodes().OfType<UsingDirectiveSyntax>().Any(u => u.Name?.ToString() == "RestSharp"))
                warnings.Add(new("UNSUPPORTED_HTTP_ADAPTER", "RestSharp adapter is disabled; no HTTP relationship is inferred from its method names.", Path.GetRelativePath(root, tree.FilePath).Replace(Path.DirectorySeparatorChar, '/')));
            foreach (var call in syntax.DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                ct.ThrowIfCancellationRequested();
                if (call.Expression is not MemberAccessExpressionSyntax member || member.Name.Identifier.ValueText != "AddHttpClient") continue;
                var method = model.GetSymbolInfo(call, ct).Symbol as IMethodSymbol;
                if (method is not null && !method.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.Extensions.DependencyInjection", StringComparison.Ordinal)) continue;
                var types = member.Name is GenericNameSyntax generic ? generic.TypeArgumentList.Arguments.ToArray() : [];
                var name = types.Length > 0 ? null : call.ArgumentList.Arguments.Count == 0 ? "" : Constant(call.ArgumentList.Arguments[0].Expression, model);
                var keys = types.Length > 0 ? types.Select(t => model.GetTypeInfo(t, ct).Type).OfType<INamedTypeSymbol>()
                    .Where(t => t.TypeKind != TypeKind.Error).Select(t => "typed:" + SemanticProjectInspector.Name(t)).ToArray()
                    : name is not null ? new[] { "named:" + name } : [];
                var assignments = call.DescendantNodes().OfType<AssignmentExpressionSyntax>().Where(a =>
                    a.Left is MemberAccessExpressionSyntax { Name.Identifier.ValueText: "BaseAddress" } access &&
                    access.Expression is IdentifierNameSyntax id && a.Ancestors().OfType<LambdaExpressionSyntax>().Any(l =>
                        l is SimpleLambdaExpressionSyntax s && s.Parameter.Identifier.ValueText == id.Identifier.ValueText ||
                        l is ParenthesizedLambdaExpressionSyntax p && p.ParameterList.Parameters.Any(x => x.Identifier.ValueText == id.Identifier.ValueText))).ToArray();
                var mapping = assignments.Length == 1 ? Address(assignments[0].Right, model) : Unknown;
                if (assignments.Any(a => a.Ancestors().TakeWhile(n => n != call).Any(n => n is IfStatementSyntax or SwitchStatementSyntax or ForStatementSyntax or ForEachStatementSyntax or WhileStatementSyntax or ConditionalExpressionSyntax)))
                    mapping = Unknown with { Status = "Conditional" };
                if (assignments.Length > 1) mapping = new(null, assignments.Select(Ref).ToArray(), "Ambiguous");
                mapping = mapping with { Evidence = mapping.Evidence.Prepend(Ref(call)).Distinct().ToArray() };
                foreach (var key in keys)
                {
                    if (!registrations.TryGetValue(key, out var values)) registrations[key] = values = [];
                    values.Add(mapping);
                }
                Publish("HttpClientRegistrationCandidate", call, name is null ? "TypedClient" : "NamedClient", null, Unknown, model);
                if (assignments.Length > 0) Publish("HttpClientBaseAddressCandidate", assignments[0], name is null ? "TypedClient" : "NamedClient", null, mapping, model);
            }
        }

        foreach (var tree in trees)
        {
            var syntax = tree.GetRoot(ct); var model = compilation.GetSemanticModel(tree);
            foreach (var call in syntax.DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                ct.ThrowIfCancellationRequested();
                if (call.Expression is not MemberAccessExpressionSyntax member) continue;
                var name = member.Name.Identifier.ValueText;
                if (name == "CreateClient" && Factory(member.Expression, model))
                    Publish("HttpClientFactoryCandidate", call, "IHttpClientFactory", null, Client(call, model, new HashSet<ISymbol>(SymbolEqualityComparer.Default), 0), model);
                var verb = name switch { "GetAsync" or "GetStringAsync" or "GetByteArrayAsync" or "GetStreamAsync" => "GET", "PostAsync" => "POST",
                    "PutAsync" => "PUT", "DeleteAsync" => "DELETE", "PatchAsync" => "PATCH", _ => null };
                if (verb is null && name != "SendAsync") continue;
                if (model.GetSymbolInfo(call, ct).Symbol is not IMethodSymbol method || method.ContainingType.ToDisplayString() != "System.Net.Http.HttpClient")
                {
                    if (model.GetSymbolInfo(call, ct).Symbol is null) warnings.Add(new("UNRESOLVED_HTTP_RECEIVER", "HTTP-like method receiver is unresolved; no HTTP relationship is emitted.", Ref(call).FilePath));
                    continue;
                }
                ExpressionSyntax? destination = call.ArgumentList.Arguments.FirstOrDefault()?.Expression;
                if (name == "SendAsync")
                {
                    if (destination is not ObjectCreationExpressionSyntax request || model.GetTypeInfo(request, ct).Type?.ToDisplayString() != "System.Net.Http.HttpRequestMessage" ||
                        request.ArgumentList?.Arguments.FirstOrDefault()?.Expression is not MemberAccessExpressionSyntax httpMethod ||
                        model.GetSymbolInfo(httpMethod, ct).Symbol?.ContainingType?.ToDisplayString() != "System.Net.Http.HttpMethod")
                    { warnings.Add(new("UNRESOLVED_HTTP_METHOD", "Only inline HttpRequestMessage with a known HttpMethod is supported.", Ref(call).FilePath)); continue; }
                    verb = httpMethod.Name.Identifier.ValueText.ToUpperInvariant();
                    if (verb is not ("GET" or "POST" or "PUT" or "DELETE" or "PATCH" or "HEAD" or "OPTIONS")) continue;
                    destination = request.ArgumentList?.Arguments.ElementAtOrDefault(1)?.Expression;
                }
                var target = Address(destination, model);
                if (target.Address is null)
                {
                    var relative = Constant(destination, model);
                    var client = Client(member.Expression, model, new HashSet<ISymbol>(SymbolEqualityComparer.Default), 0);
                    if (relative is not null && client.Address is not null && Uri.TryCreate(client.Address, relative, out var combined) && combined.Scheme is "http" or "https")
                        target = client with { Address = combined };
                    else if (target.Status != "Ambiguous") target = client with { Address = null, Status = relative is null ? "Unresolved" : client.Status };
                }
                Publish("OutgoingHttp", call, method.ToDisplayString(), verb, target, model);
                if (target.Address is null) warnings.Add(new("UNRESOLVED_HTTP_TARGET", "Destination requires unsupported configuration, registration or control flow; no service identity is inferred.", Ref(call).FilePath));
            }
        }

        Mapping Client(ExpressionSyntax expression, SemanticModel model, HashSet<ISymbol> visited, int depth)
        {
            if (depth > 12) return Unknown;
            var symbol = model.GetSymbolInfo(expression, ct).Symbol;
            if (symbol is not null && !visited.Add(symbol)) return Unknown;
            if (symbol is ILocalSymbol local)
            {
                var syntax = expression.SyntaxTree.GetRoot(ct);
                if (syntax.DescendantNodes().OfType<AssignmentExpressionSyntax>().Any(a => SymbolEqualityComparer.Default.Equals(model.GetSymbolInfo(a.Left, ct).Symbol, local))) return Unknown;
                var mutations = syntax.DescendantNodes().OfType<AssignmentExpressionSyntax>().Where(a => a.Left is MemberAccessExpressionSyntax m &&
                    m.Name.Identifier.ValueText == "BaseAddress" && SymbolEqualityComparer.Default.Equals(model.GetSymbolInfo(m.Expression, ct).Symbol, local)).ToArray();
                if (mutations.Length > 0) return new(null, mutations.Select(Ref).ToArray(), "Reassigned");
                if (local.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax(ct) is VariableDeclaratorSyntax { Initializer.Value: { } init }) return Client(init, model, visited, depth + 1);
            }
            if (expression is InvocationExpressionSyntax factoryCall && factoryCall.Expression is MemberAccessExpressionSyntax factory &&
                factory.Name.Identifier.ValueText == "CreateClient" && Factory(factory.Expression, model))
            {
                var name = factoryCall.ArgumentList.Arguments.Count == 0 ? "" : Constant(factoryCall.ArgumentList.Arguments[0].Expression, model);
                return name is null ? Unknown : Registration("named:" + name);
            }
            if (expression is ObjectCreationExpressionSyntax creation && model.GetTypeInfo(creation, ct).Type?.ToDisplayString() == "System.Net.Http.HttpClient")
            {
                var baseAddress = creation.Initializer?.Expressions.OfType<AssignmentExpressionSyntax>().Where(a => a.Left is IdentifierNameSyntax id && id.Identifier.ValueText == "BaseAddress").ToArray();
                return baseAddress is { Length: 1 } ? Address(baseAddress[0].Right, model) : Unknown;
            }
            if (symbol is IFieldSymbol { IsReadOnly: true } field && field.Type.ToDisplayString() == "System.Net.Http.HttpClient")
            {
                var declaration = field.ContainingType.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax(ct) as TypeDeclarationSyntax;
                var constructors = declaration?.Members.OfType<ConstructorDeclarationSyntax>().ToArray();
                if (constructors is { Length: 1 })
                {
                    var fieldModel = compilation.GetSemanticModel(declaration!.SyntaxTree);
                    if (declaration.DescendantNodes().OfType<AssignmentExpressionSyntax>().Any(a => a.Left is MemberAccessExpressionSyntax { Name.Identifier.ValueText: "BaseAddress" } m &&
                        SymbolEqualityComparer.Default.Equals(fieldModel.GetSymbolInfo(m.Expression, ct).Symbol, field))) return Unknown;
                    var parameters = constructors[0].ParameterList.Parameters.Where(p => fieldModel.GetDeclaredSymbol(p, ct) is IParameterSymbol parameter && parameter.Type.ToDisplayString() == "System.Net.Http.HttpClient").ToArray();
                    var fieldAssignments = constructors[0].DescendantNodes().OfType<AssignmentExpressionSyntax>().Where(a => SymbolEqualityComparer.Default.Equals(fieldModel.GetSymbolInfo(a.Left, ct).Symbol, field)).ToArray();
                    if (parameters.Length == 1 && fieldAssignments.Length == 1 &&
                        SymbolEqualityComparer.Default.Equals(fieldModel.GetSymbolInfo(fieldAssignments[0].Right, ct).Symbol, fieldModel.GetDeclaredSymbol(parameters[0], ct)))
                        return Registration("typed:" + SemanticProjectInspector.Name(field.ContainingType));
                }
            }
            return Unknown;
        }

        Mapping Registration(string key)
        {
            if (!registrations.TryGetValue(key, out var values)) return Unknown;
            var evidence = values.SelectMany(v => v.Evidence).Distinct().ToArray();
            if (values.Any(v => v.Address is null) || values.Select(v => v.Address!.AbsoluteUri).Distinct().Count() != 1) return new(null, evidence, "Ambiguous");
            return new(values[0].Address, evidence, "ClientRegistrationLiteral");
        }
        Mapping Address(ExpressionSyntax? expression, SemanticModel model)
        {
            if (expression is ObjectCreationExpressionSyntax uri && model.GetTypeInfo(uri, ct).Type?.ToDisplayString() == "System.Uri") expression = uri.ArgumentList?.Arguments.FirstOrDefault()?.Expression;
            var text = Constant(expression, model);
            if (Uri.TryCreate(text, UriKind.Absolute, out var address) && address.Scheme is "http" or "https") return new(address, expression is null ? [] : [Ref(expression)], "Literal");
            if (expression is ElementAccessExpressionSyntax index && Configuration(index.Expression, model) && Constant(index.ArgumentList.Arguments.FirstOrDefault()?.Expression, model) is { } key)
            {
                var value = config.Resolve(project, key);
                return new(value.Uri, value.Evidence, value.Status);
            }
            return Unknown;
        }
        string? Constant(ExpressionSyntax? expression, SemanticModel model)
        {
            if (expression is null) return null;
            var constant = model.GetConstantValue(expression, ct); return constant.HasValue ? constant.Value as string : null;
        }
        bool Factory(ExpressionSyntax e, SemanticModel m) => m.GetTypeInfo(e, ct).Type?.ToDisplayString() == "System.Net.Http.IHttpClientFactory";
        bool Configuration(ExpressionSyntax e, SemanticModel m) => m.GetTypeInfo(e, ct).Type is INamedTypeSymbol type &&
            (type.ToDisplayString() == "Microsoft.Extensions.Configuration.IConfiguration" || type.AllInterfaces.Any(i => i.ToDisplayString() == "Microsoft.Extensions.Configuration.IConfiguration"));
        SourceReference Ref(SyntaxNode node)
        {
            var span = node.GetLocation().GetLineSpan();
            return new(Path.GetRelativePath(root, node.SyntaxTree.FilePath).Replace(Path.DirectorySeparatorChar, '/'), span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1,
                span.StartLinePosition.Character + 1, span.EndLinePosition.Character + 1);
        }
        void Publish(string kind, SyntaxNode node, string subject, string? verb, Mapping mapping, SemanticModel model)
        {
            var reference = Ref(node);
            findings.Add(new(kind, project, mapping.Address is null ? null : HttpEndpointIdentity.FromUri(mapping.Address), verb, reference, subject,
                SemanticProjectInspector.Id(project, kind, reference.FilePath + "|" + node.SpanStart + "|" + verb), mapping.Evidence.Where(e => e != reference).Distinct().ToArray(),
                kind == "OutgoingHttp" ? "ResolvedSymbol" : "Syntax", mapping.Status));
        }
    }
}

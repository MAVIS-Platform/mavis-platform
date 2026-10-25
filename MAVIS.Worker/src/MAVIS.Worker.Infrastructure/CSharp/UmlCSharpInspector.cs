using System.Text.Json;
using MAVIS.Worker.Application.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MAVIS.Worker.Infrastructure.CSharp;

public static class UmlCSharpInspector
{
    private static readonly Lazy<MetadataReference[]> References = new(() =>
        ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? typeof(object).Assembly.Location)
        .Split(Path.PathSeparator).Distinct().Select(p => MetadataReference.CreateFromFile(p)).ToArray());

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static Dictionary<string, string> InspectSingleSource(string csCode, string filePath = "Sample.cs")
    {
        var tree = CSharpSyntaxTree.ParseText(csCode, path: filePath);
        var compilation = CSharpCompilation.Create(
            "MavisUmlTestAssembly",
            new[] { tree },
            References.Value,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        var model = compilation.GetSemanticModel(tree);
        var syntax = tree.GetRoot();
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var type in syntax.DescendantNodes().OfType<TypeDeclarationSyntax>())
        {
            if (!ShouldEmitUmlMetadata(type)) continue;
            var subject = ComputeSubject(type);
            var payload = BuildTypeMetadata(type, model, filePath, subject, CancellationToken.None);
            result[subject] = JsonSerializer.Serialize(payload, JsonOptions);
        }
        foreach (var enumDecl in syntax.DescendantNodes().OfType<EnumDeclarationSyntax>())
        {
            var subject = ComputeEnumSubject(enumDecl);
            var payload = BuildEnumMetadata(enumDecl, model, filePath, subject, CancellationToken.None);
            result[subject] = JsonSerializer.Serialize(payload, JsonOptions);
        }
        return result;
    }

    internal static Dictionary<(string Project, string Subject), string> Inspect(
        string root,
        IReadOnlyList<ProjectCompileProfile> profiles,
        IReadOnlyDictionary<string, SyntaxTree> trees,
        CancellationToken ct)
    {
        var result = new Dictionary<(string Project, string Subject), string>();
        foreach (var profile in profiles)
        {
            ct.ThrowIfCancellationRequested();
            var project = Path.GetRelativePath(root, profile.Project).Replace('\\', '/');
            var projectTrees = profile.Files.Where(trees.ContainsKey).Select(f => trees[f]).ToList();
            var compilation = CSharpCompilation.Create(
                "MavisUml_" + SemanticProjectInspector.Id(project, "UmlAssembly", project),
                projectTrees,
                References.Value,
                new CSharpCompilationOptions(profile.IsExecutable ? OutputKind.ConsoleApplication : OutputKind.DynamicallyLinkedLibrary));

            foreach (var tree in projectTrees)
            {
                ct.ThrowIfCancellationRequested();
                var syntax = tree.GetRoot(ct);
                var model = compilation.GetSemanticModel(tree);
                var relative = Path.GetRelativePath(root, tree.FilePath).Replace('\\', '/');

                foreach (var type in syntax.DescendantNodes().OfType<TypeDeclarationSyntax>())
                {
                    ct.ThrowIfCancellationRequested();
                    if (!ShouldEmitUmlMetadata(type)) continue;

                    var subject = ComputeSubject(type);
                    var payload = BuildTypeMetadata(type, model, relative, subject, ct);
                    result[(project, subject)] = JsonSerializer.Serialize(payload, JsonOptions);
                }

                foreach (var enumDecl in syntax.DescendantNodes().OfType<EnumDeclarationSyntax>())
                {
                    ct.ThrowIfCancellationRequested();
                    var subject = ComputeEnumSubject(enumDecl);
                    var payload = BuildEnumMetadata(enumDecl, model, relative, subject, ct);
                    result[(project, subject)] = JsonSerializer.Serialize(payload, JsonOptions);
                }
            }
        }
        return result;
    }

    private static bool ShouldEmitUmlMetadata(TypeDeclarationSyntax type)
    {
        if (type is InterfaceDeclarationSyntax or RecordDeclarationSyntax or StructDeclarationSyntax) return true;
        if (type.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Any()) return true;
        if (type.Modifiers.Count > 0) return true;
        if (type.Members.Count > 0) return true;
        if (type.BaseList is { Types.Count: > 0 }) return true;
        if (type.TypeParameterList is { Parameters.Count: > 0 }) return true;
        if (type is ClassDeclarationSyntax { ParameterList.Parameters.Count: > 0 }) return true;
        return false;
    }

    private static string ComputeSubject(TypeDeclarationSyntax type)
    {
        var namespaces = type.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Reverse().Select(n => n.Name.ToString());
        var names = type.AncestorsAndSelf().OfType<TypeDeclarationSyntax>().Reverse()
            .Select(t => t.Identifier.ValueText + (t.TypeParameterList is null ? "" : "`" + t.TypeParameterList.Parameters.Count));
        return string.Join(".", namespaces.Concat(names));
    }

    private static string ComputeEnumSubject(EnumDeclarationSyntax enumDecl)
    {
        var prefix = enumDecl.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Reverse().Select(n => n.Name.ToString())
            .Concat(enumDecl.Ancestors().OfType<TypeDeclarationSyntax>().Reverse()
                .Select(t => t.Identifier.ValueText + (t.TypeParameterList is null ? "" : "`" + t.TypeParameterList.Parameters.Count)));
        return string.Join(".", prefix.Append(enumDecl.Identifier.ValueText));
    }

    private static Dictionary<string, object?> BuildTypeMetadata(
        TypeDeclarationSyntax type,
        SemanticModel model,
        string relativeFile,
        string subject,
        CancellationToken ct)
    {
        var symbol = model.GetDeclaredSymbol(type, ct) as INamedTypeSymbol;
        var simpleName = type.Identifier.ValueText;
        var namespaces = type.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Reverse().Select(n => n.Name.ToString()).ToArray();
        var packageName = namespaces.Length > 0 ? string.Join(".", namespaces) : "(default)";

        // Strictly from AST/Semantic declaration, NEVER from 'I' prefix heuristic!
        var typeKind = type is InterfaceDeclarationSyntax ? "INTERFACE" : "CLASS";
        var isAbstract = type is InterfaceDeclarationSyntax || type.Modifiers.Any(m => m.IsKind(SyntaxKind.AbstractKeyword));
        var isStatic = type.Modifiers.Any(m => m.IsKind(SyntaxKind.StaticKeyword));
        var (visibility, visibilitySymbol, languageVisibility) = ResolveTypeVisibility(type.Modifiers, type.Parent is TypeDeclarationSyntax);

        var typeParameters = type.TypeParameterList?.Parameters.Select(p => p.Identifier.ValueText).ToList() ?? new List<string>();
        var span = type.GetLocation().GetLineSpan();
        var line = span.StartLinePosition.Line + 1;

        var members = new List<Dictionary<string, object?>>();
        var structuralRelations = new List<Dictionary<string, object?>>();
        var associatedTargets = new HashSet<string>(StringComparer.Ordinal);
        var methodsCfg = new List<Dictionary<string, object?>>();

        // 1. BaseList: Generalization vs Realization
        if (type.BaseList is not null)
        {
            foreach (var baseEntry in type.BaseList.Types)
            {
                var baseTypeInfo = model.GetTypeInfo(baseEntry.Type, ct).Type;
                var rawTarget = baseTypeInfo is INamedTypeSymbol namedBase && namedBase.TypeKind != TypeKind.Error
                    ? SemanticProjectInspector.Name(namedBase)
                    : StripGenerics(baseEntry.Type.ToString());
                var baseLine = baseEntry.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

                bool isInterfaceTarget = baseTypeInfo is { TypeKind: TypeKind.Interface };
                string umlRelKind = (type is not InterfaceDeclarationSyntax && isInterfaceTarget)
                    ? "REALIZATION"
                    : "GENERALIZATION";
                string depKind = umlRelKind == "REALIZATION" ? "IMPLEMENTS" : "INHERITS";

                structuralRelations.Add(new Dictionary<string, object?>
                {
                    ["umlRelationKind"] = umlRelKind,
                    ["dependencyKind"] = depKind,
                    ["targetType"] = rawTarget,
                    ["multiplicityStatus"] = "UNKNOWN",
                    ["provenance"] = "SOURCE_EXTRACTED",
                    ["line"] = baseLine
                });
            }
        }

        // 2. Primary constructor parameters (if record/class primary constructor)
        var primaryParams = type switch
        {
            ClassDeclarationSyntax c => c.ParameterList,
            StructDeclarationSyntax s => s.ParameterList,
            RecordDeclarationSyntax r => r.ParameterList,
            _ => null
        };
        if (primaryParams is { Parameters.Count: > 0 })
        {
            var paramDtos = new List<Dictionary<string, string>>();
            var paramSigParts = new List<string>();
            foreach (var p in primaryParams.Parameters)
            {
                var pType = p.Type?.ToString() ?? "object";
                var pName = p.Identifier.ValueText;
                paramDtos.Add(new Dictionary<string, string> { ["name"] = pName, ["type"] = pType });
                paramSigParts.Add($"{pName}: {pType}");

                var resolved = p.Type is not null ? model.GetTypeInfo(p.Type, ct).Type : null;
                var targetName = ResolveTargetTypeName(resolved, pType);
                if (targetName is not null && targetName != subject && targetName != simpleName)
                {
                    associatedTargets.Add(targetName);
                    structuralRelations.Add(new Dictionary<string, object?>
                    {
                        ["umlRelationKind"] = "ASSOCIATION",
                        ["dependencyKind"] = "ASSOCIATION",
                        ["targetType"] = targetName,
                        ["roleName"] = pName,
                        ["memberName"] = pName,
                        ["memberSignature"] = $"+ {pName}: {pType}",
                        ["multiplicityStatus"] = "UNKNOWN",
                        ["provenance"] = "SOURCE_EXTRACTED",
                        ["line"] = p.GetLocation().GetLineSpan().StartLinePosition.Line + 1
                    });
                }
            }
            members.Add(new Dictionary<string, object?>
            {
                ["kind"] = "CONSTRUCTOR",
                ["name"] = simpleName,
                ["returnType"] = "",
                ["visibility"] = "PUBLIC",
                ["visibilitySymbol"] = "+",
                ["languageVisibility"] = "public",
                ["isStatic"] = false,
                ["isAbstract"] = false,
                ["parameters"] = paramDtos,
                ["signature"] = $"+ {simpleName}({string.Join(", ", paramSigParts)})",
                ["line"] = line
            });
        }

        // 3. Fields -> Attribute compartment + ASSOCIATION
        foreach (var field in type.Members.OfType<FieldDeclarationSyntax>())
        {
            var (fVis, fSym, fLangVis) = ResolveMemberVisibility(field.Modifiers, type is InterfaceDeclarationSyntax);
            var fStatic = field.Modifiers.Any(m => m.IsKind(SyntaxKind.StaticKeyword) || m.IsKind(SyntaxKind.ConstKeyword));
            var fFinal = field.Modifiers.Any(m => m.IsKind(SyntaxKind.ReadOnlyKeyword) || m.IsKind(SyntaxKind.ConstKeyword));
            var fTypeStr = field.Declaration.Type.ToString();
            var resolved = model.GetTypeInfo(field.Declaration.Type, ct).Type;
            var targetName = ResolveTargetTypeName(resolved, fTypeStr);
            var fLine = field.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

            foreach (var variable in field.Declaration.Variables)
            {
                var fieldName = variable.Identifier.ValueText;
                var sig = $"{fSym} {fieldName}: {fTypeStr}";
                members.Add(new Dictionary<string, object?>
                {
                    ["kind"] = "FIELD",
                    ["name"] = fieldName,
                    ["type"] = fTypeStr,
                    ["visibility"] = fVis,
                    ["visibilitySymbol"] = fSym,
                    ["languageVisibility"] = fLangVis,
                    ["isStatic"] = fStatic,
                    ["isAbstract"] = false,
                    ["isFinal"] = fFinal,
                    ["signature"] = sig,
                    ["line"] = fLine
                });

                if (targetName is not null && targetName != subject && targetName != simpleName)
                {
                    associatedTargets.Add(targetName);
                    structuralRelations.Add(new Dictionary<string, object?>
                    {
                        ["umlRelationKind"] = "ASSOCIATION",
                        ["dependencyKind"] = "ASSOCIATION",
                        ["targetType"] = targetName,
                        ["roleName"] = fieldName,
                        ["memberName"] = fieldName,
                        ["memberSignature"] = sig,
                        ["multiplicityStatus"] = "UNKNOWN",
                        ["provenance"] = "SOURCE_EXTRACTED",
                        ["line"] = fLine
                    });
                }
            }
        }

        // 4. Properties -> Attribute compartment + ASSOCIATION
        foreach (var prop in type.Members.OfType<PropertyDeclarationSyntax>())
        {
            var (pVis, pSym, pLangVis) = ResolveMemberVisibility(prop.Modifiers, type is InterfaceDeclarationSyntax);
            var pStatic = prop.Modifiers.Any(m => m.IsKind(SyntaxKind.StaticKeyword));
            var pAbstract = type is InterfaceDeclarationSyntax || prop.Modifiers.Any(m => m.IsKind(SyntaxKind.AbstractKeyword));
            var pTypeStr = prop.Type.ToString();
            var propName = prop.Identifier.ValueText;
            var pLine = prop.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
            var sig = $"{pSym} {propName}: {pTypeStr}";

            members.Add(new Dictionary<string, object?>
            {
                ["kind"] = "PROPERTY",
                ["name"] = propName,
                ["type"] = pTypeStr,
                ["visibility"] = pVis,
                ["visibilitySymbol"] = pSym,
                ["languageVisibility"] = pLangVis,
                ["isStatic"] = pStatic,
                ["isAbstract"] = pAbstract,
                ["isFinal"] = false,
                ["signature"] = sig,
                ["line"] = pLine
            });

            var resolved = model.GetTypeInfo(prop.Type, ct).Type;
            var targetName = ResolveTargetTypeName(resolved, pTypeStr);
            if (targetName is not null && targetName != subject && targetName != simpleName)
            {
                associatedTargets.Add(targetName);
                structuralRelations.Add(new Dictionary<string, object?>
                {
                    ["umlRelationKind"] = "ASSOCIATION",
                    ["dependencyKind"] = "ASSOCIATION",
                    ["targetType"] = targetName,
                    ["roleName"] = propName,
                    ["memberName"] = propName,
                    ["memberSignature"] = sig,
                    ["multiplicityStatus"] = "UNKNOWN",
                    ["provenance"] = "SOURCE_EXTRACTED",
                    ["line"] = pLine
                });
            }
        }

        // 5. Constructors -> Operation compartment + DEPENDENCY
        foreach (var ctor in type.Members.OfType<ConstructorDeclarationSyntax>())
        {
            var (cVis, cSym, cLangVis) = ResolveMemberVisibility(ctor.Modifiers, false);
            var cStatic = ctor.Modifiers.Any(m => m.IsKind(SyntaxKind.StaticKeyword));
            var cLine = ctor.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
            var paramDtos = new List<Dictionary<string, string>>();
            var paramSigParts = new List<string>();

            foreach (var p in ctor.ParameterList.Parameters)
            {
                var pType = p.Type?.ToString() ?? "object";
                var pName = p.Identifier.ValueText;
                paramDtos.Add(new Dictionary<string, string> { ["name"] = pName, ["type"] = pType });
                paramSigParts.Add($"{pName}: {pType}");

                var resolved = p.Type is not null ? model.GetTypeInfo(p.Type, ct).Type : null;
                var targetName = ResolveTargetTypeName(resolved, pType);
                if (targetName is not null && targetName != subject && targetName != simpleName && !associatedTargets.Contains(targetName))
                {
                    structuralRelations.Add(new Dictionary<string, object?>
                    {
                        ["umlRelationKind"] = "DEPENDENCY",
                        ["dependencyKind"] = "CODEDEPENDENCY",
                        ["targetType"] = targetName,
                        ["memberName"] = simpleName,
                        ["memberSignature"] = $"{cSym} {simpleName}({string.Join(", ", paramSigParts)})",
                        ["multiplicityStatus"] = "UNKNOWN",
                        ["provenance"] = "SOURCE_EXTRACTED",
                        ["line"] = cLine
                    });
                }
            }

            var ctorSig = $"{cSym} {simpleName}({string.Join(", ", paramSigParts)})";
            members.Add(new Dictionary<string, object?>
            {
                ["kind"] = "CONSTRUCTOR",
                ["name"] = simpleName,
                ["returnType"] = "",
                ["visibility"] = cVis,
                ["visibilitySymbol"] = cSym,
                ["languageVisibility"] = cLangVis,
                ["isStatic"] = cStatic,
                ["isAbstract"] = false,
                ["parameters"] = paramDtos,
                ["signature"] = ctorSig,
                ["line"] = cLine
            });
        }

        // 6. Methods -> Operation compartment (preserving all overloads) + DEPENDENCY + M6 CFG
        var emittedDepTargets = new HashSet<string>(StringComparer.Ordinal);
        foreach (var method in type.Members.OfType<MethodDeclarationSyntax>())
        {
            var (mVis, mSym, mLangVis) = ResolveMemberVisibility(method.Modifiers, type is InterfaceDeclarationSyntax);
            var mStatic = method.Modifiers.Any(m => m.IsKind(SyntaxKind.StaticKeyword));
            var mAbstract = (type is InterfaceDeclarationSyntax && method.Body is null && method.ExpressionBody is null)
                || method.Modifiers.Any(m => m.IsKind(SyntaxKind.AbstractKeyword));
            var retTypeStr = method.ReturnType.ToString();
            var mName = method.Identifier.ValueText;
            var mLine = method.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

            var paramDtos = new List<Dictionary<string, string>>();
            var paramSigParts = new List<string>();
            foreach (var p in method.ParameterList.Parameters)
            {
                var pType = p.Type?.ToString() ?? "object";
                var pName = p.Identifier.ValueText;
                paramDtos.Add(new Dictionary<string, string> { ["name"] = pName, ["type"] = pType });
                paramSigParts.Add($"{pName}: {pType}");
            }

            var methodSig = $"{mSym} {mName}({string.Join(", ", paramSigParts)}): {retTypeStr}";
            members.Add(new Dictionary<string, object?>
            {
                ["kind"] = "OPERATION",
                ["name"] = mName,
                ["returnType"] = retTypeStr,
                ["visibility"] = mVis,
                ["visibilitySymbol"] = mSym,
                ["languageVisibility"] = mLangVis,
                ["isStatic"] = mStatic,
                ["isAbstract"] = mAbstract,
                ["parameters"] = paramDtos,
                ["signature"] = methodSig,
                ["line"] = mLine
            });

            var retResolved = model.GetTypeInfo(method.ReturnType, ct).Type;
            var retTarget = ResolveTargetTypeName(retResolved, retTypeStr);
            if (retTarget is not null && retTarget != subject && retTarget != simpleName
                && !associatedTargets.Contains(retTarget) && emittedDepTargets.Add($"{mName}:{retTarget}"))
            {
                structuralRelations.Add(new Dictionary<string, object?>
                {
                    ["umlRelationKind"] = "DEPENDENCY",
                    ["dependencyKind"] = "CODEDEPENDENCY",
                    ["targetType"] = retTarget,
                    ["memberName"] = mName,
                    ["memberSignature"] = methodSig,
                    ["multiplicityStatus"] = "UNKNOWN",
                    ["provenance"] = "SOURCE_EXTRACTED",
                    ["line"] = mLine
                });
            }

            foreach (var p in method.ParameterList.Parameters)
            {
                if (p.Type is null) continue;
                var pResolved = model.GetTypeInfo(p.Type, ct).Type;
                var pTarget = ResolveTargetTypeName(pResolved, p.Type.ToString());
                if (pTarget is not null && pTarget != subject && pTarget != simpleName
                    && !associatedTargets.Contains(pTarget) && emittedDepTargets.Add($"{mName}:{pTarget}"))
                {
                    structuralRelations.Add(new Dictionary<string, object?>
                    {
                        ["umlRelationKind"] = "DEPENDENCY",
                        ["dependencyKind"] = "CODEDEPENDENCY",
                        ["targetType"] = pTarget,
                        ["memberName"] = mName,
                        ["memberSignature"] = methodSig,
                        ["multiplicityStatus"] = "UNKNOWN",
                        ["provenance"] = "SOURCE_EXTRACTED",
                        ["line"] = mLine
                    });
                }
            }

            if (method.Body is not null || method.ExpressionBody is not null)
            {
                methodsCfg.Add(ExtractMethodCfg(simpleName, subject, method, methodSig, relativeFile, mLine));
            }
        }

        var stateLifecycle = ExtractStateLifecycle(type, model, ct);

        var metadata = new Dictionary<string, object?>
        {
            ["name"] = simpleName,
            ["qualifiedName"] = subject,
            ["packageName"] = packageName,
            ["typeKind"] = typeKind,
            ["isAbstract"] = isAbstract,
            ["isStatic"] = isStatic,
            ["visibility"] = visibility,
            ["visibilitySymbol"] = visibilitySymbol,
            ["languageVisibility"] = languageVisibility,
            ["typeParameters"] = typeParameters,
            ["genericArity"] = typeParameters.Count,
            ["members"] = members,
            ["structuralRelations"] = structuralRelations,
            ["methodsCfg"] = methodsCfg,
            ["filePath"] = relativeFile,
            ["line"] = line
        };
        if (stateLifecycle is not null)
        {
            metadata["stateLifecycle"] = stateLifecycle;
        }
        return metadata;
    }

    private static Dictionary<string, object?> BuildEnumMetadata(
        EnumDeclarationSyntax enumDecl,
        SemanticModel model,
        string relativeFile,
        string subject,
        CancellationToken ct)
    {
        var simpleName = enumDecl.Identifier.ValueText;
        var namespaces = enumDecl.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Reverse().Select(n => n.Name.ToString()).ToArray();
        var packageName = namespaces.Length > 0 ? string.Join(".", namespaces) : "(default)";
        var (visibility, visibilitySymbol, languageVisibility) = ResolveTypeVisibility(enumDecl.Modifiers, enumDecl.Parent is TypeDeclarationSyntax);
        var line = enumDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

        var members = new List<Dictionary<string, object?>>();
        var literalNames = new List<string>();
        foreach (var member in enumDecl.Members)
        {
            var litName = member.Identifier.ValueText;
            var litLine = member.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
            literalNames.Add(litName);
            members.Add(new Dictionary<string, object?>
            {
                ["kind"] = "ENUM_LITERAL",
                ["name"] = litName,
                ["type"] = simpleName,
                ["visibility"] = "PUBLIC",
                ["visibilitySymbol"] = "+",
                ["languageVisibility"] = "public",
                ["isStatic"] = true,
                ["isAbstract"] = false,
                ["isFinal"] = true,
                ["signature"] = litName,
                ["line"] = litLine
            });
        }

        var stateLifecycle = new Dictionary<string, object?>
        {
            ["kind"] = "ENUM_DECLARATION",
            ["states"] = literalNames,
            ["transitions"] = Array.Empty<object>(),
            ["enumOnlyNoTransitions"] = true
        };

        return new Dictionary<string, object?>
        {
            ["name"] = simpleName,
            ["qualifiedName"] = subject,
            ["packageName"] = packageName,
            ["typeKind"] = "ENUM",
            ["isAbstract"] = false,
            ["isStatic"] = false,
            ["visibility"] = visibility,
            ["visibilitySymbol"] = visibilitySymbol,
            ["languageVisibility"] = languageVisibility,
            ["typeParameters"] = Array.Empty<string>(),
            ["genericArity"] = 0,
            ["members"] = members,
            ["structuralRelations"] = Array.Empty<object>(),
            ["methodsCfg"] = Array.Empty<object>(),
            ["stateLifecycle"] = stateLifecycle,
            ["filePath"] = relativeFile,
            ["line"] = line
        };
    }

    private static (string Visibility, string Symbol, string LanguageVisibility) ResolveTypeVisibility(SyntaxTokenList modifiers, bool isNested)
    {
        bool isPublic = modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword));
        bool isPrivate = modifiers.Any(m => m.IsKind(SyntaxKind.PrivateKeyword));
        bool isProtected = modifiers.Any(m => m.IsKind(SyntaxKind.ProtectedKeyword));
        bool isInternal = modifiers.Any(m => m.IsKind(SyntaxKind.InternalKeyword));

        if (isPublic) return ("PUBLIC", "+", "public");
        if (isProtected && isInternal) return ("PROTECTED", "#", "protected internal");
        if (isPrivate && isProtected) return ("PRIVATE", "-", "private protected");
        if (isProtected) return ("PROTECTED", "#", "protected");
        if (isPrivate) return ("PRIVATE", "-", "private");
        if (isInternal) return ("PACKAGE", "~", "internal");
        return isNested ? ("PRIVATE", "-", "private") : ("PACKAGE", "~", "internal");
    }

    private static (string Visibility, string Symbol, string LanguageVisibility) ResolveMemberVisibility(SyntaxTokenList modifiers, bool inInterface)
    {
        bool isPublic = modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword));
        bool isPrivate = modifiers.Any(m => m.IsKind(SyntaxKind.PrivateKeyword));
        bool isProtected = modifiers.Any(m => m.IsKind(SyntaxKind.ProtectedKeyword));
        bool isInternal = modifiers.Any(m => m.IsKind(SyntaxKind.InternalKeyword));

        if (isPublic) return ("PUBLIC", "+", "public");
        if (isProtected && isInternal) return ("PROTECTED", "#", "protected internal");
        if (isPrivate && isProtected) return ("PRIVATE", "-", "private protected");
        if (isProtected) return ("PROTECTED", "#", "protected");
        if (isPrivate) return ("PRIVATE", "-", "private");
        if (isInternal) return ("PACKAGE", "~", "internal");
        return inInterface ? ("PUBLIC", "+", "public") : ("PRIVATE", "-", "private");
    }

    private static string? ResolveTargetTypeName(ITypeSymbol? symbol, string rawType)
    {
        if (symbol is IArrayTypeSymbol arr)
        {
            return ResolveTargetTypeName(arr.ElementType, rawType);
        }
        if (symbol is INamedTypeSymbol named && named.TypeKind != TypeKind.Error && named.SpecialType == SpecialType.None)
        {
            // Unwrap common collection generics (List<T>, IEnumerable<T>, IReadOnlyList<T>, Task<T>, etc.)
            if (named.IsGenericType && named.TypeArguments.Length == 1 && IsWrapperCollectionOrTask(named.Name))
            {
                var arg = named.TypeArguments[0];
                if (arg is INamedTypeSymbol argNamed && argNamed.SpecialType == SpecialType.None && argNamed.TypeKind != TypeKind.TypeParameter)
                {
                    return SemanticProjectInspector.Name(argNamed);
                }
            }
            if (named.Locations.Any(l => l.IsInSource))
            {
                return SemanticProjectInspector.Name(named);
            }
        }
        var stripped = StripGenerics(rawType);
        return IsBuiltInType(stripped) ? null : stripped;
    }

    private static bool IsWrapperCollectionOrTask(string name) =>
        name is "List" or "IList" or "ICollection" or "IEnumerable" or "IReadOnlyList" or "IReadOnlyCollection"
            or "HashSet" or "ISet" or "Task" or "ValueTask" or "Nullable" or "DbSet";

    private static string StripGenerics(string raw)
    {
        int lt = raw.IndexOf('<');
        var basePart = lt >= 0 ? raw[..lt] : raw;
        return basePart.Replace("[]", "").Replace("?", "").Trim();
    }

    private static bool IsBuiltInType(string name) =>
        name is "void" or "bool" or "byte" or "sbyte" or "short" or "ushort" or "int" or "uint" or "long" or "ulong"
            or "float" or "double" or "decimal" or "char" or "string" or "object" or "String" or "Object" or "Boolean"
            or "Int32" or "Int64" or "Double" or "Decimal" or "Guid" or "DateTime" or "DateTimeOffset" or "TimeSpan"
            or "Task" or "ValueTask" or "CancellationToken" or "Uri";

    private static Dictionary<string, object?> ExtractMethodCfg(
        string ownerSimpleName,
        string ownerQualifiedName,
        MethodDeclarationSyntax method,
        string signature,
        string relativeFile,
        int methodLine)
    {
        var nodes = new List<Dictionary<string, object?>>();
        var edges = new List<Dictionary<string, object?>>();
        var unsupported = new List<string>();

        string initialId = "n0_initial";
        nodes.Add(CfgNode(initialId, "INITIAL", "Initial", methodLine));
        int counter = 1;

        if (method.ExpressionBody is not null)
        {
            if (method.ExpressionBody.Expression.DescendantNodesAndSelf().OfType<LambdaExpressionSyntax>().Any())
            {
                unsupported.Add($"LAMBDA@{methodLine}");
            }
            string actId = $"n{counter++}_expr";
            nodes.Add(CfgNode(actId, "ACTION", Truncate(method.ExpressionBody.Expression.ToString(), 70), methodLine));
            edges.Add(CfgEdge(initialId, actId, null));
            string finId = $"n{counter++}_final";
            nodes.Add(CfgNode(finId, "ACTIVITY_FINAL", "ActivityFinal", methodLine));
            edges.Add(CfgEdge(actId, finId, null));
        }
        else if (method.Body is not null)
        {
            var openTails = BuildStmtCfg(
                method.Body,
                new List<string> { initialId },
                null,
                nodes,
                edges,
                unsupported,
                ref counter);

            if (openTails.Count > 0)
            {
                string finalId = $"n{counter++}_final";
                nodes.Add(CfgNode(finalId, "ACTIVITY_FINAL", "ActivityFinal", methodLine));
                ConnectAllCfg(openTails, finalId, null, edges);
            }
        }

        return new Dictionary<string, object?>
        {
            ["methodName"] = method.Identifier.ValueText,
            ["signature"] = signature,
            ["ownerClass"] = ownerSimpleName,
            ["ownerQualifiedName"] = ownerQualifiedName,
            ["extractionCompleteness"] = unsupported.Count > 0 ? "PARTIAL" : "COMPLETE",
            ["unsupportedConstructs"] = unsupported,
            ["nodes"] = nodes,
            ["edges"] = edges,
            ["filePath"] = relativeFile,
            ["line"] = methodLine
        };
    }

    private static List<string> BuildStmtCfg(
        StatementSyntax stmt,
        List<string> incomingIds,
        string? pendingGuard,
        List<Dictionary<string, object?>> nodes,
        List<Dictionary<string, object?>> edges,
        List<string> unsupported,
        ref int counter)
    {
        if (incomingIds.Count == 0) return new List<string>();
        int stmtLine = stmt.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

        if (stmt is BlockSyntax block)
        {
            var current = incomingIds;
            var guard = pendingGuard;
            foreach (var child in block.Statements)
            {
                current = BuildStmtCfg(child, current, guard, nodes, edges, unsupported, ref counter);
                guard = null;
                if (current.Count == 0) break;
            }
            return current;
        }

        if (stmt is IfStatementSyntax ifStmt)
        {
            string decisionId = $"n{counter++}_decision";
            string condText = Truncate(ifStmt.Condition.ToString(), 60);
            if (ifStmt.Condition.DescendantNodesAndSelf().OfType<LambdaExpressionSyntax>().Any())
            {
                unsupported.Add($"LAMBDA@{stmtLine}");
            }
            nodes.Add(CfgNode(decisionId, "DECISION", condText, stmtLine));
            ConnectAllCfg(incomingIds, decisionId, pendingGuard, edges);

            var thenTails = BuildStmtCfg(
                ifStmt.Statement,
                new List<string> { decisionId },
                $"[{condText}]",
                nodes,
                edges,
                unsupported,
                ref counter);

            List<string> elseTails;
            if (ifStmt.Else is not null)
            {
                elseTails = BuildStmtCfg(
                    ifStmt.Else.Statement,
                    new List<string> { decisionId },
                    "[else]",
                    nodes,
                    edges,
                    unsupported,
                    ref counter);
            }
            else
            {
                elseTails = new List<string> { $"{decisionId}::[else]" };
            }

            if (thenTails.Count == 0 && elseTails.Count == 0)
            {
                return new List<string>();
            }
            if (thenTails.Count == 0)
            {
                return elseTails;
            }
            if (elseTails.Count == 0)
            {
                return thenTails;
            }

            string mergeId = $"n{counter++}_merge";
            nodes.Add(CfgNode(mergeId, "MERGE", "Merge", stmtLine));
            ConnectAllCfg(thenTails, mergeId, null, edges);
            ConnectAllCfg(elseTails, mergeId, null, edges);
            return new List<string> { mergeId };
        }

        if (stmt is DoStatementSyntax doStmt)
        {
            string mergeId = $"n{counter++}_do_head";
            nodes.Add(CfgNode(mergeId, "MERGE", "do-loop-head", stmtLine));
            ConnectAllCfg(incomingIds, mergeId, pendingGuard, edges);

            var bodyTails = BuildStmtCfg(
                doStmt.Statement,
                new List<string> { mergeId },
                null,
                nodes,
                edges,
                unsupported,
                ref counter);

            if (bodyTails.Count == 0)
            {
                return new List<string>();
            }

            int endLine = doStmt.GetLocation().GetLineSpan().EndLinePosition.Line + 1;
            string decId = $"n{counter++}_loop_decision";
            string loopGuard = Truncate(doStmt.Condition.ToString(), 60);
            nodes.Add(CfgNode(decId, "DECISION", loopGuard, endLine));
            ConnectAllCfg(bodyTails, decId, null, edges);
            edges.Add(CfgEdge(decId, mergeId, $"[{loopGuard}]"));

            string exitMerge = $"n{counter++}_loop_exit";
            nodes.Add(CfgNode(exitMerge, "MERGE", "LoopExit", endLine));
            edges.Add(CfgEdge(decId, exitMerge, "[else]"));
            return new List<string> { exitMerge };
        }

        if (stmt is ForStatementSyntax or ForEachStatementSyntax or WhileStatementSyntax)
        {
            string mergeId = $"n{counter++}_loop_head";
            string decId = $"n{counter++}_loop_decision";
            StatementSyntax bodyStmt;
            string loopGuard;
            switch (stmt)
            {
                case ForStatementSyntax f:
                    loopGuard = f.Condition?.ToString() ?? "loop";
                    bodyStmt = f.Statement;
                    break;
                case ForEachStatementSyntax fe:
                    loopGuard = $"foreach {fe.Identifier.ValueText} in {fe.Expression}";
                    bodyStmt = fe.Statement;
                    break;
                case WhileStatementSyntax w:
                    loopGuard = w.Condition.ToString();
                    bodyStmt = w.Statement;
                    break;
                default:
                    loopGuard = "loop";
                    bodyStmt = stmt;
                    break;
            }
            loopGuard = Truncate(loopGuard, 60);
            nodes.Add(CfgNode(mergeId, "MERGE", "loop-head", stmtLine));
            ConnectAllCfg(incomingIds, mergeId, pendingGuard, edges);
            nodes.Add(CfgNode(decId, "DECISION", loopGuard, stmtLine));
            edges.Add(CfgEdge(mergeId, decId, null));

            var bodyTails = BuildStmtCfg(
                bodyStmt,
                new List<string> { decId },
                $"[{loopGuard}]",
                nodes,
                edges,
                unsupported,
                ref counter);
            ConnectAllCfg(bodyTails, mergeId, null, edges);

            string exitMerge = $"n{counter++}_loop_exit";
            nodes.Add(CfgNode(exitMerge, "MERGE", "LoopExit", stmtLine));
            edges.Add(CfgEdge(decId, exitMerge, "[else]"));
            return new List<string> { exitMerge };
        }

        if (stmt is BreakStatementSyntax)
        {
            unsupported.Add($"BREAK@{stmtLine}");
            string brkId = $"n{counter++}_break";
            nodes.Add(CfgNode(brkId, "ACTION", "break", stmtLine));
            ConnectAllCfg(incomingIds, brkId, pendingGuard, edges);
            return new List<string>();
        }

        if (stmt is ContinueStatementSyntax)
        {
            unsupported.Add($"CONTINUE@{stmtLine}");
            string contId = $"n{counter++}_continue";
            nodes.Add(CfgNode(contId, "ACTION", "continue", stmtLine));
            ConnectAllCfg(incomingIds, contId, pendingGuard, edges);
            return new List<string>();
        }

        if (stmt is YieldStatementSyntax)
        {
            unsupported.Add($"YIELD@{stmtLine}");
            string yieldId = $"n{counter++}_yield";
            nodes.Add(CfgNode(yieldId, "ACTION", SummarizeStatement(stmt), stmtLine));
            ConnectAllCfg(incomingIds, yieldId, pendingGuard, edges);
            return new List<string> { yieldId };
        }

        if (stmt is ReturnStatementSyntax retStmt)
        {
            if (retStmt.Expression is not null && retStmt.Expression.DescendantNodesAndSelf().OfType<LambdaExpressionSyntax>().Any())
            {
                unsupported.Add($"LAMBDA@{stmtLine}");
            }
            string retActionId = $"n{counter++}_return";
            string label = retStmt.Expression is not null ? $"return {Truncate(retStmt.Expression.ToString(), 50)}" : "return";
            nodes.Add(CfgNode(retActionId, "ACTION", label, stmtLine));
            ConnectAllCfg(incomingIds, retActionId, pendingGuard, edges);

            string finalId = $"n{counter++}_final";
            nodes.Add(CfgNode(finalId, "ACTIVITY_FINAL", "ActivityFinal", stmtLine));
            edges.Add(CfgEdge(retActionId, finalId, null));
            return new List<string>();
        }

        if (stmt is ThrowStatementSyntax throwStmt)
        {
            string throwId = $"n{counter++}_throw";
            nodes.Add(CfgNode(throwId, "ACTION", $"throw {Truncate(throwStmt.Expression?.ToString() ?? "Exception", 50)}", stmtLine));
            ConnectAllCfg(incomingIds, throwId, pendingGuard, edges);

            string flowFinalId = $"n{counter++}_flow_final";
            nodes.Add(CfgNode(flowFinalId, "FLOW_FINAL", "ExceptionExit", stmtLine));
            edges.Add(CfgEdge(throwId, flowFinalId, null));
            return new List<string>();
        }

        if (stmt is TryStatementSyntax tryStmt)
        {
            unsupported.Add($"TRY_CATCH_FINALLY@{stmtLine}");
            return BuildStmtCfg(tryStmt.Block, incomingIds, pendingGuard, nodes, edges, unsupported, ref counter);
        }

        if (stmt is SwitchStatementSyntax swStmt)
        {
            string decId = $"n{counter++}_switch";
            nodes.Add(CfgNode(decId, "DECISION", $"switch ({Truncate(swStmt.Expression.ToString(), 40)})", stmtLine));
            ConnectAllCfg(incomingIds, decId, pendingGuard, edges);
            var branchTails = new List<string>();
            for (int idx = 0; idx < swStmt.Sections.Count; idx++)
            {
                var section = swStmt.Sections[idx];
                int secLine = section.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                string guard = section.Labels.Any(l => l is DefaultSwitchLabelSyntax)
                    ? "[else]"
                    : $"[{string.Join(", ", section.Labels.Select(l => l.ToString().Replace("case ", "").Replace(":", "").Trim()))}]";
                var cur = new List<string> { decId };
                string? g = guard;
                bool endedWithBreak = false;
                foreach (var s in section.Statements)
                {
                    if (s is BreakStatementSyntax)
                    {
                        endedWithBreak = true;
                        break;
                    }
                    cur = BuildStmtCfg(s, cur, g, nodes, edges, unsupported, ref counter);
                    g = null;
                    if (cur.Count == 0) break;
                }
                if (section.Statements.Count > 0 && !endedWithBreak && cur.Count > 0 && idx < swStmt.Sections.Count - 1)
                {
                    unsupported.Add($"SWITCH_FALLTHROUGH@{secLine}");
                }
                branchTails.AddRange(cur);
            }
            if (branchTails.Count == 0) return new List<string>();
            string mergeId = $"n{counter++}_switch_merge";
            nodes.Add(CfgNode(mergeId, "MERGE", "SwitchMerge", stmtLine));
            ConnectAllCfg(branchTails, mergeId, null, edges);
            return new List<string> { mergeId };
        }

        if (stmt.DescendantNodes().OfType<LambdaExpressionSyntax>().Any())
        {
            unsupported.Add($"LAMBDA@{stmtLine}");
        }

        string actId = $"n{counter++}_action";
        nodes.Add(CfgNode(actId, "ACTION", SummarizeStatement(stmt), stmtLine));
        ConnectAllCfg(incomingIds, actId, pendingGuard, edges);

        if (stmt is ExpressionStatementSyntax { Expression: AssignmentExpressionSyntax assignExpr }
            && assignExpr.Right is MemberAccessExpressionSyntax memberAccess)
        {
            var typeExpr = memberAccess.Expression.ToString().Trim();
            var memberName = memberAccess.Name.Identifier.ValueText;
            if (!string.IsNullOrEmpty(typeExpr)
                && char.IsUpper(typeExpr[0])
                && !typeExpr.Contains('(')
                && !typeExpr.Equals("this", StringComparison.Ordinal)
                && !string.IsNullOrEmpty(memberName)
                && char.IsUpper(memberName[0]))
            {
                string objId = $"{actId}_obj";
                var objNode = CfgNode(objId, "OBJECT_NODE", $"{typeExpr} [{memberName.ToUpperInvariant()}]", stmtLine);
                objNode["objectType"] = typeExpr;
                objNode["objectState"] = memberName;
                nodes.Add(objNode);
                edges.Add(new Dictionary<string, object?>
                {
                    ["sourceId"] = actId,
                    ["targetId"] = objId,
                    ["flowKind"] = "OBJECT_FLOW"
                });
            }
        }

        return new List<string> { actId };
    }

    private static void ConnectAllCfg(
        List<string> incomingIds,
        string targetId,
        string? guard,
        List<Dictionary<string, object?>> edges)
    {
        foreach (var inc in incomingIds)
        {
            if (inc.Contains("::", StringComparison.Ordinal))
            {
                var parts = inc.Split("::", 2, StringSplitOptions.None);
                edges.Add(CfgEdge(parts[0], targetId, parts[1]));
            }
            else
            {
                edges.Add(CfgEdge(inc, targetId, guard));
            }
        }
    }

    private static Dictionary<string, object?> CfgNode(string id, string kind, string label, int line) =>
        new()
        {
            ["id"] = id,
            ["kind"] = kind,
            ["label"] = label,
            ["line"] = line
        };

    private static Dictionary<string, object?> CfgEdge(string sourceId, string targetId, string? guard)
    {
        var edge = new Dictionary<string, object?>
        {
            ["sourceId"] = sourceId,
            ["targetId"] = targetId,
            ["flowKind"] = "CONTROL_FLOW"
        };
        if (!string.IsNullOrEmpty(guard)) edge["guard"] = guard;
        return edge;
    }

    private static readonly HashSet<string> NonEnumBuiltInTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "string", "int", "long", "short", "byte", "bool", "boolean", "double", "float", "decimal",
        "object", "Guid", "DateTime", "DateTimeOffset", "TimeSpan", "CancellationToken"
    };

    private static Dictionary<string, object?>? ExtractStateLifecycle(TypeDeclarationSyntax type, SemanticModel model, CancellationToken ct)
    {
        string? stateFieldName = null;
        string? stateTypeName = null;

        foreach (var field in type.Members.OfType<FieldDeclarationSyntax>())
        {
            var resolved = model.GetTypeInfo(field.Declaration.Type, ct).Type;
            var fType = field.Declaration.Type.ToString();
            if (NonEnumBuiltInTypes.Contains(fType) || (resolved is not null && resolved.SpecialType != SpecialType.None))
            {
                continue;
            }
            foreach (var v in field.Declaration.Variables)
            {
                var vName = v.Identifier.ValueText;
                if (resolved is { TypeKind: TypeKind.Enum }
                    || vName.Contains("state", StringComparison.OrdinalIgnoreCase)
                    || vName.Contains("status", StringComparison.OrdinalIgnoreCase)
                    || fType.EndsWith("State", StringComparison.Ordinal)
                    || fType.EndsWith("Status", StringComparison.Ordinal))
                {
                    stateFieldName = vName;
                    stateTypeName = fType;
                    break;
                }
            }
            if (stateFieldName is not null) break;
        }

        if (stateFieldName is null)
        {
            foreach (var prop in type.Members.OfType<PropertyDeclarationSyntax>())
            {
                var resolved = model.GetTypeInfo(prop.Type, ct).Type;
                var pType = prop.Type.ToString();
                if (NonEnumBuiltInTypes.Contains(pType) || (resolved is not null && resolved.SpecialType != SpecialType.None))
                {
                    continue;
                }
                var pName = prop.Identifier.ValueText;
                if (resolved is { TypeKind: TypeKind.Enum }
                    || pName.Contains("state", StringComparison.OrdinalIgnoreCase)
                    || pName.Contains("status", StringComparison.OrdinalIgnoreCase)
                    || pType.EndsWith("State", StringComparison.Ordinal)
                    || pType.EndsWith("Status", StringComparison.Ordinal))
                {
                    stateFieldName = pName;
                    stateTypeName = pType;
                    break;
                }
            }
        }

        if (stateFieldName is null || stateTypeName is null) return null;

        var discoveredStates = new HashSet<string>(StringComparer.Ordinal);
        var transitions = new List<Dictionary<string, object?>>();
        var unresolvedAssignments = new List<string>();
        string? initialState = null;

        foreach (var ctor in type.Members.OfType<ConstructorDeclarationSyntax>())
        {
            foreach (var assign in ctor.DescendantNodes().OfType<AssignmentExpressionSyntax>())
            {
                if (MatchesStateTarget(assign.Left.ToString(), stateFieldName))
                {
                    var val = ExtractEnumLiteral(assign.Right.ToString(), stateTypeName);
                    if (val is not null)
                    {
                        initialState ??= val;
                        discoveredStates.Add(val);
                    }
                }
            }
        }

        foreach (var method in type.Members.OfType<MethodDeclarationSyntax>())
        {
            var triggerName = method.Identifier.ValueText;

            foreach (var assign in method.DescendantNodes().OfType<AssignmentExpressionSyntax>())
            {
                if (MatchesStateTarget(assign.Left.ToString(), stateFieldName))
                {
                    var toState = ExtractEnumLiteral(assign.Right.ToString(), stateTypeName);
                    if (toState is null) continue;
                    discoveredStates.Add(toState);

                    int assignLine = assign.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                    var (fromState, guardText) = ResolveStateGuardForAssignment(assign, method, stateFieldName, stateTypeName);
                    if (fromState is null)
                    {
                        unresolvedAssignments.Add($"UNRESOLVED_SOURCE_STATE@{assignLine}:{triggerName}->{toState}");
                        continue;
                    }

                    discoveredStates.Add(fromState);
                    transitions.Add(new Dictionary<string, object?>
                    {
                        ["fromState"] = fromState,
                        ["toState"] = toState,
                        ["trigger"] = triggerName,
                        ["guard"] = guardText,
                        ["effect"] = $"{stateFieldName} = {toState}",
                        ["line"] = assignLine,
                        ["provenance"] = "SOURCE_EXTRACTED"
                    });
                }
            }
        }

        if (discoveredStates.Count == 0 && transitions.Count == 0) return null;

        return new Dictionary<string, object?>
        {
            ["kind"] = "STATEFUL_CLASS",
            ["stateFieldName"] = stateFieldName,
            ["stateTypeName"] = stateTypeName,
            ["initialState"] = initialState,
            ["states"] = discoveredStates.OrderBy(s => s, StringComparer.Ordinal).ToList(),
            ["transitions"] = transitions,
            ["unresolvedAssignments"] = unresolvedAssignments,
            ["extractionCompleteness"] = unresolvedAssignments.Count == 0 ? "COMPLETE" : "PARTIAL",
            ["enumOnlyNoTransitions"] = transitions.Count == 0
        };
    }

    private static (string? FromState, string? GuardText) ResolveStateGuardForAssignment(
        AssignmentExpressionSyntax assign,
        MethodDeclarationSyntax method,
        string stateFieldName,
        string stateTypeName)
    {
        for (SyntaxNode? cursor = assign.Parent; cursor is not null && cursor != method; cursor = cursor.Parent)
        {
            if (cursor is IfStatementSyntax ifStmt)
            {
                bool inThen = ifStmt.Statement.Span.Contains(assign.Span);
                bool inElse = ifStmt.Else is not null && ifStmt.Else.Statement.Span.Contains(assign.Span);
                if (inThen)
                {
                    var pos = ExtractPositiveEqualityState(ifStmt.Condition, stateFieldName, stateTypeName);
                    if (pos is not null)
                    {
                        return (pos, Truncate(ifStmt.Condition.ToString(), 60));
                    }
                    var neg = ExtractNegativeInequalityState(ifStmt.Condition, stateFieldName, stateTypeName);
                    if (neg is not null)
                    {
                        return (null, null);
                    }
                }
                else if (inElse)
                {
                    var posInCond = ExtractPositiveEqualityState(ifStmt.Condition, stateFieldName, stateTypeName);
                    if (posInCond is not null)
                    {
                        // Inside else of `Status == X`: means `Status != X`, NOT `Status == X`!
                        return (null, null);
                    }
                    var negInCond = ExtractNegativeInequalityState(ifStmt.Condition, stateFieldName, stateTypeName);
                    if (negInCond is not null)
                    {
                        return (negInCond, $"{stateFieldName} == {negInCond}");
                    }
                }
            }
            else if (cursor is SwitchSectionSyntax section && section.Parent is SwitchStatementSyntax swStmt)
            {
                if (MatchesStateTarget(swStmt.Expression.ToString(), stateFieldName))
                {
                    var caseLabels = section.Labels.OfType<CaseSwitchLabelSyntax>().ToList();
                    if (caseLabels.Count == 1 && !section.Labels.OfType<DefaultSwitchLabelSyntax>().Any())
                    {
                        var st = ExtractEnumLiteral(caseLabels[0].Value.ToString(), stateTypeName);
                        if (st is not null)
                        {
                            return (st, $"{stateFieldName} == {st}");
                        }
                    }
                    return (null, null);
                }
            }
        }

        if (method.Body is not null)
        {
            foreach (var stmt in method.Body.Statements)
            {
                if (stmt.SpanStart >= assign.SpanStart) break;
                if (stmt is IfStatementSyntax guardIf
                    && guardIf.Else is null
                    && StatementAlwaysExits(guardIf.Statement))
                {
                    var requiredState = ExtractNegativeInequalityState(guardIf.Condition, stateFieldName, stateTypeName);
                    if (requiredState is not null)
                    {
                        return (requiredState, $"{stateFieldName} == {requiredState}");
                    }
                }
            }
        }

        return (null, null);
    }

    private static bool StatementAlwaysExits(StatementSyntax stmt)
    {
        if (stmt is ReturnStatementSyntax or ThrowStatementSyntax) return true;
        if (stmt is BlockSyntax block && block.Statements.Count > 0)
        {
            var last = block.Statements[^1];
            return last is ReturnStatementSyntax or ThrowStatementSyntax;
        }
        return false;
    }

    private static string? ExtractPositiveEqualityState(
        ExpressionSyntax cond,
        string stateFieldName,
        string stateTypeName)
    {
        if (cond is PrefixUnaryExpressionSyntax prefix && prefix.IsKind(SyntaxKind.LogicalNotExpression))
        {
            return ExtractNegativeInequalityState(prefix.Operand, stateFieldName, stateTypeName);
        }
        foreach (var bin in cond.DescendantNodesAndSelf().OfType<BinaryExpressionSyntax>())
        {
            if (bin.IsKind(SyntaxKind.LogicalOrExpression))
            {
                return null;
            }
            if (bin.IsKind(SyntaxKind.EqualsExpression))
            {
                if (MatchesStateTarget(bin.Left.ToString(), stateFieldName))
                {
                    return ExtractEnumLiteral(bin.Right.ToString(), stateTypeName);
                }
                if (MatchesStateTarget(bin.Right.ToString(), stateFieldName))
                {
                    return ExtractEnumLiteral(bin.Left.ToString(), stateTypeName);
                }
            }
        }
        return null;
    }

    private static string? ExtractNegativeInequalityState(
        ExpressionSyntax cond,
        string stateFieldName,
        string stateTypeName)
    {
        if (cond is PrefixUnaryExpressionSyntax prefix && prefix.IsKind(SyntaxKind.LogicalNotExpression))
        {
            return ExtractPositiveEqualityState(prefix.Operand, stateFieldName, stateTypeName);
        }
        if (cond is BinaryExpressionSyntax bin && bin.IsKind(SyntaxKind.NotEqualsExpression))
        {
            if (MatchesStateTarget(bin.Left.ToString(), stateFieldName))
            {
                return ExtractEnumLiteral(bin.Right.ToString(), stateTypeName);
            }
            if (MatchesStateTarget(bin.Right.ToString(), stateFieldName))
            {
                return ExtractEnumLiteral(bin.Left.ToString(), stateTypeName);
            }
        }
        return null;
    }

    private static bool MatchesStateTarget(string expr, string stateFieldName) =>
        expr.Equals(stateFieldName, StringComparison.Ordinal)
        || expr.Equals("this." + stateFieldName, StringComparison.Ordinal)
        || expr.Equals("_" + stateFieldName, StringComparison.OrdinalIgnoreCase);

    private static string? ExtractEnumLiteral(string expr, string stateTypeName)
    {
        var trimmed = expr.Trim();
        if (trimmed.StartsWith(stateTypeName + ".", StringComparison.Ordinal))
        {
            return trimmed[(stateTypeName.Length + 1)..].Trim();
        }
        if (trimmed.Contains('.') && !trimmed.Contains('('))
        {
            return trimmed[(trimmed.LastIndexOf('.') + 1)..].Trim();
        }
        return null;
    }

    private static string SummarizeStatement(StatementSyntax stmt)
    {
        if (stmt is BlockSyntax block)
        {
            if (block.Statements.Count == 0) return "noop";
            return SummarizeStatement(block.Statements[0]);
        }
        return Truncate(stmt.ToString().Replace('\r', ' ').Replace('\n', ' ').Trim(), 65);
    }

    private static string Truncate(string s, int max)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var clean = string.Join(" ", s.Split(default(char[]), StringSplitOptions.RemoveEmptyEntries));
        return clean.Length <= max ? clean : clean[..(max - 3)] + "...";
    }
}

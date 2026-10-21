using System.Text;
using System.Security.Cryptography;
using MAVIS.Worker.Application.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Infrastructure.CSharp;

public sealed class DotnetAnalysisOptions
{
    public string[] AllowedSourceRoots { get; set; } = [];
    public int MaxFiles { get; set; } = 2000;
    public long MaxFileBytes { get; set; } = 1_048_576;
    public long MaxTotalBytes { get; set; } = 20_971_520;
    public int TimeoutSeconds { get; set; } = 60;
}

/// <summary>Read-only syntax analysis. Never loads MSBuild or executes project targets.</summary>
public sealed class DotnetProjectAnalyzer(IOptions<DotnetAnalysisOptions> options, IOptions<ArtifactScopeOptions>? artifacts = null) : IDotnetProjectAnalyzer
{
    private static readonly HashSet<string> Ignored = new(StringComparer.OrdinalIgnoreCase)
        { "bin", "obj", ".git", ".vs", "node_modules" };

    public async Task<DotnetAnalysisResult> AnalyzeAsync(DotnetAnalysisRequest request, CancellationToken ct)
    {
        DotnetRequestValidator.Validate(request);
        var settings = options.Value;
        if (settings.MaxFiles < 1 || settings.MaxFileBytes < 1 || settings.MaxTotalBytes < 1 || settings.TimeoutSeconds < 1)
            throw new InvalidOperationException("Invalid DotnetAnalysis limits.");
        var root = ValidateSource(request, settings, artifacts?.Value);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var budget = TimeSpan.FromSeconds(settings.TimeoutSeconds);
        if (request.DeadlineUtc is { } expires)
        {
            var remaining = expires - DateTimeOffset.UtcNow;
            if (remaining <= TimeSpan.Zero) throw new AnalysisDeadlineException();
            if (remaining < budget) budget = remaining;
        }
        deadline.CancelAfter(budget);
        var token = deadline.Token;
        var files = new List<string>();
        var directories = new Stack<string>();
        directories.Push(root);
        while (directories.TryPop(out var directory))
        {
            token.ThrowIfCancellationRequested();
            foreach (var entry in Directory.EnumerateFileSystemEntries(directory))
            {
                token.ThrowIfCancellationRequested();
                var attributes = File.GetAttributes(entry);
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                    throw new SourceInputException("Linked files/directories are not supported in source snapshots.");
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    if (!Ignored.Contains(Path.GetFileName(entry))) directories.Push(entry);
                }
                else if (Path.GetExtension(entry).Equals(".cs", StringComparison.OrdinalIgnoreCase) ||
                         Path.GetExtension(entry).Equals(".csproj", StringComparison.OrdinalIgnoreCase) ||
                         Path.GetExtension(entry).Equals(".sln", StringComparison.OrdinalIgnoreCase) ||
                         (Path.GetFileName(entry).StartsWith("appsettings", StringComparison.OrdinalIgnoreCase) && Path.GetExtension(entry).Equals(".json", StringComparison.OrdinalIgnoreCase)))
                {
                    files.Add(entry);
                    if (files.Count > settings.MaxFiles) throw new SourceInputException("Source exceeds MaxFiles.");
                }
            }
        }
        var projects = files.Where(f => Path.GetExtension(f).Equals(".csproj", StringComparison.OrdinalIgnoreCase)).ToArray();
        if (projects.Length == 0) throw new SourceInputException("No C# project found in the selected source scope.");
        var findings = new List<DotnetFinding>();
        var warnings = new List<AnalysisWarning>
        {
            new("SYNTAX_ONLY", "Partial static profile: syntax candidates and host-runtime semantic binding do not reproduce a target build or prove runtime interactions."),
            new("EVIDENCE_REFERENCES_ONLY", "Evidence includes snapshot-relative locations; source snippets and configuration values are intentionally omitted.")
        };
        var analyzed = 0;
        long totalBytes = 0;
        var contentDigests = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        async Task<string> ReadBoundedAsync(string file)
        {
            token.ThrowIfCancellationRequested();
            await using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (stream.Length > settings.MaxFileBytes || stream.Length > settings.MaxTotalBytes - totalBytes)
                throw new SourceInputException("Source exceeds configured byte limits.");
            totalBytes += stream.Length;
            using var reader = new StreamReader(stream, Encoding.UTF8, true);
            var content = await reader.ReadToEndAsync(token);
            contentDigests[Path.GetRelativePath(root, file).Replace('\\', '/')] = SHA256.HashData(Encoding.UTF8.GetBytes(content));
            return content;
        }
        var sources = files.Where(f => Path.GetExtension(f).Equals(".cs", StringComparison.OrdinalIgnoreCase)).Order(StringComparer.Ordinal).ToArray();
        var profiles = new List<ProjectCompileProfile>();
        var trees = new Dictionary<string, SyntaxTree>();
        var partialIds = new HashSet<string>();
        foreach (var metadata in files.Where(f => !Path.GetExtension(f).Equals(".cs", StringComparison.OrdinalIgnoreCase)).Order(StringComparer.Ordinal))
        {
            var content = await ReadBoundedAsync(metadata);
            if (Path.GetExtension(metadata).Equals(".json", StringComparison.OrdinalIgnoreCase))
                DotnetConfigurationInspector.Inspect(root, metadata, content, projects, findings, warnings, token);
            else ProjectMetadataReader.Read(root, metadata, content, projects, findings, warnings, token);
            if (Path.GetExtension(metadata).Equals(".csproj", StringComparison.OrdinalIgnoreCase))
                profiles.Add(ProjectCompileProfile.Create(root, metadata, content, sources, warnings, token));
        }
        foreach (var file in sources)
        {
            token.ThrowIfCancellationRequested();
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            var text = await ReadBoundedAsync(file);
            var owners = profiles.Where(p => p.Files.Contains(file)).Select(p => p.Project).ToArray();
            if (owners.Length == 0)
            {
                warnings.Add(new("UNOWNED_SOURCE", "Source is excluded or has no owner in the supported compile-item profile.", relative));
                continue;
            }
            var tree = CSharpSyntaxTree.ParseText(text, path: file, cancellationToken: token);
            trees[file] = tree;
            var syntax = await tree.GetRootAsync(token);
            if (tree.GetDiagnostics(token).Any(d => d.Severity == DiagnosticSeverity.Error))
                warnings.Add(new("SYNTAX_ERRORS", "Syntax errors found; available findings may be incomplete.", relative));
            foreach (var owner in owners)
            {
                var project = Path.GetRelativePath(root, owner).Replace('\\', '/');
                foreach (var ns in syntax.DescendantNodes().OfType<BaseNamespaceDeclarationSyntax>())
                {
                    token.ThrowIfCancellationRequested();
                    var fullName = string.Join(".", ns.AncestorsAndSelf().OfType<BaseNamespaceDeclarationSyntax>().Reverse().Select(n => n.Name.ToString()));
                    var span = ns.Name.GetLocation().GetLineSpan();
                    findings.Add(new("Namespace", project, fullName, null,
                        new(relative, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1), fullName,
                        Identity(project, "Namespace", fullName)));
                }
                foreach (var type in syntax.DescendantNodes().OfType<TypeDeclarationSyntax>())
                {
                    token.ThrowIfCancellationRequested();
                    var span = type.Identifier.GetLocation().GetLineSpan();
                    var namespaces = type.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Reverse().Select(n => n.Name.ToString());
                    var names = type.AncestorsAndSelf().OfType<TypeDeclarationSyntax>().Reverse()
                        .Select(t => t.Identifier.ValueText + (t.TypeParameterList is null ? "" : "`" + t.TypeParameterList.Parameters.Count));
                    var subject = string.Join(".", namespaces.Concat(names));
                    var kind = type is InterfaceDeclarationSyntax ? "Interface" : "Type";
                    if (type.Modifiers.Any(m => m.IsKind(SyntaxKind.PartialKeyword))) partialIds.Add(Identity(project, kind, subject));
                    findings.Add(new(kind, project, type.Identifier.ValueText, null,
                        new(relative, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1), subject,
                        Identity(project, kind, subject)));
                    if (type.BaseList is not null)
                    {
                        foreach (var baseType in type.BaseList.Types)
                        {
                            var location = baseType.GetLocation().GetLineSpan();
                            findings.Add(new("BaseTypeCandidate", project, baseType.Type.ToString(), null,
                                new(relative, location.StartLinePosition.Line + 1, location.EndLinePosition.Line + 1), subject,
                                Identity(project, "BaseTypeCandidate", subject + "->" + baseType.Type)));
                        }
                        warnings.Add(new("UNRESOLVED_BASE_TYPES", "Base types are syntax candidates; inheritance versus interface implementation requires semantic binding.", relative));
                    }
                }
                // Reuse the baseline syntax walker, but publish only literal HTTP host/port identities as unresolved hints.
                var walker = new CSharpDependencyWalker(project, file);
                walker.Visit(syntax);
                foreach (var finding in walker.Findings.Where(f => f.Kind == "HTTP_REST_CALL"))
                {
                    token.ThrowIfCancellationRequested();
                    var literalHttp = Uri.TryCreate(finding.Url, UriKind.Absolute, out var uri) &&
                        (uri.Scheme == "http" || uri.Scheme == "https");
                    findings.Add(new("OutgoingHttpCandidate", project, literalHttp ? HttpEndpointIdentity.FromUri(uri!) : null,
                        finding.HttpMethod, new(relative, finding.StartLine ?? 1, finding.StartLine ?? 1)));
                    warnings.Add(new("UNRESOLVED_HTTP_TARGET", "Syntax candidate only: receiver type and target service identity are not verified.", relative));
                }
            }
            analyzed++;
        }
        SemanticProjectInspector.Inspect(root, profiles, trees, findings, warnings, token);
        var merged = findings.GroupBy(f => f.Id is not null && (partialIds.Contains(f.Id) || f.Kind == "Namespace")
            ? f.Id : Guid.NewGuid().ToString()).Select(group =>
        {
            var first = group.First();
            return group.Count() < 2 ? first : first with { AdditionalEvidence = group.Skip(1).Select(f => f.Evidence).Distinct().ToArray() };
        }).ToArray();
        token.ThrowIfCancellationRequested();
        using var inputHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        foreach (var item in contentDigests.OrderBy(p => p.Key, StringComparer.Ordinal))
        { inputHash.AppendData(Encoding.UTF8.GetBytes(item.Key)); inputHash.AppendData(new byte[] { 0 }); inputHash.AppendData(item.Value); }
        var inputDigest = Convert.ToHexString(inputHash.GetHashAndReset()).ToLowerInvariant();
        if (request.ExpectedInputDigest is not null && !inputDigest.Equals(request.ExpectedInputDigest, StringComparison.OrdinalIgnoreCase))
            throw new SourceInputException("Analysis input digest does not match the expected input version.");
        token.ThrowIfCancellationRequested();
        if (request.DeadlineUtc <= DateTimeOffset.UtcNow) throw new AnalysisDeadlineException();
        return new("1.0", request.JobId, request.ProjectId, request.SourceSnapshotId, "dotnet-static/1.5",
            merged, new(files.Count(f => Path.GetExtension(f).Equals(".cs", StringComparison.OrdinalIgnoreCase)), analyzed, "PartialSyntax"), warnings, inputDigest, request.AttemptId);
    }

    private static string Identity(string project, string kind, string symbol) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(project + "\n" + kind + "\n" + symbol))).ToLowerInvariant();

    private static bool IsWithin(string path, string root) =>
        path.Equals(root, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal) ||
        path.StartsWith(Path.TrimEndingDirectorySeparator(root) + Path.DirectorySeparatorChar,
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    internal static string ValidateSource(DotnetAnalysisRequest request, DotnetAnalysisOptions settings, ArtifactScopeOptions? artifacts)
    {
        var roots = request.AttemptId is not null && artifacts is not null ? new[] { artifacts.Root } : settings.AllowedSourceRoots;
        return ValidateRoot(request.SourceLocation, roots);
    }

    internal static string ValidateRoot(string location, string[] allowedRoots)
    {
        if (!Path.IsPathFullyQualified(location)) throw new SourceInputException("SourceLocation must be absolute.");
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(location));
        if (!allowedRoots.Any(r => Path.IsPathFullyQualified(r) && IsWithin(root, Path.TrimEndingDirectorySeparator(Path.GetFullPath(r)))))
            throw new SourceInputException("Source is outside configured AllowedSourceRoots.");
        if (!Directory.Exists(root)) throw new SourceInputException("Source directory does not exist.");
        for (DirectoryInfo? current = new(root); current is not null; current = current.Parent)
            if ((current.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new SourceInputException("Linked source paths are not supported.");
        return root;
    }
}

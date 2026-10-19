using System.Text;
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
public sealed class DotnetProjectAnalyzer(IOptions<DotnetAnalysisOptions> options) : IDotnetProjectAnalyzer
{
    private static readonly HashSet<string> Ignored = new(StringComparer.OrdinalIgnoreCase)
        { "bin", "obj", ".git", ".vs", "node_modules" };

    public async Task<DotnetAnalysisResult> AnalyzeAsync(DotnetAnalysisRequest request, CancellationToken ct)
    {
        var settings = options.Value;
        if (settings.MaxFiles < 1 || settings.MaxFileBytes < 1 || settings.MaxTotalBytes < 1 || settings.TimeoutSeconds < 1)
            throw new InvalidOperationException("Invalid DotnetAnalysis limits.");
        var root = ValidateRoot(request.SourceLocation, settings.AllowedSourceRoots);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
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
                         Path.GetExtension(entry).Equals(".csproj", StringComparison.OrdinalIgnoreCase))
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
            new("SYNTAX_ONLY", "Partial syntax analysis: project evaluation, semantic binding, endpoints, DI, DB and configuration resolution are not yet supported."),
            new("EVIDENCE_REFERENCES_ONLY", "Evidence includes snapshot-relative locations; source snippets and configuration values are intentionally omitted.")
        };
        var analyzed = 0;
        long totalBytes = 0;
        foreach (var file in files.Where(f => Path.GetExtension(f).Equals(".cs", StringComparison.OrdinalIgnoreCase)).Order(StringComparer.Ordinal))
        {
            token.ThrowIfCancellationRequested();
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            // The nearest containing project is a project identity, not an inferred service mapping.
            var owners = projects.Where(p => IsWithin(file, Path.GetDirectoryName(p)!))
                .OrderByDescending(p => Path.GetDirectoryName(p)!.Length).ToArray();
            if (owners.Length == 0)
            {
                warnings.Add(new("UNOWNED_SOURCE", "Source has no containing project.", relative));
                continue;
            }
            var ownerDirectory = Path.GetDirectoryName(owners[0]);
            if (owners.Count(p => Path.GetDirectoryName(p) == ownerDirectory) > 1)
            {
                warnings.Add(new("AMBIGUOUS_PROJECT", "Multiple projects share this source directory; ownership requires review.", relative));
                continue;
            }
            await using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (stream.Length > settings.MaxFileBytes || stream.Length > settings.MaxTotalBytes - totalBytes)
                throw new SourceInputException("Source exceeds configured byte limits.");
            totalBytes += stream.Length;
            using var reader = new StreamReader(stream, Encoding.UTF8, true);
            var text = await reader.ReadToEndAsync(token);
            var tree = CSharpSyntaxTree.ParseText(text, cancellationToken: token);
            var syntax = await tree.GetRootAsync(token);
            if (tree.GetDiagnostics(token).Any(d => d.Severity == DiagnosticSeverity.Error))
                warnings.Add(new("SYNTAX_ERRORS", "Syntax errors found; available findings may be incomplete.", relative));
            var project = Path.GetRelativePath(root, owners[0]).Replace('\\', '/');
            foreach (var type in syntax.DescendantNodes().OfType<TypeDeclarationSyntax>())
            {
                token.ThrowIfCancellationRequested();
                var span = type.Identifier.GetLocation().GetLineSpan();
                findings.Add(new(type is InterfaceDeclarationSyntax ? "Interface" : "Type", project,
                    type.Identifier.ValueText, null, new(relative, span.StartLinePosition.Line + 1, span.EndLinePosition.Line + 1)));
            }
            // Reuse the baseline syntax walker, but publish only literal HTTP hosts as unresolved hints.
            var walker = new CSharpDependencyWalker(project, file);
            walker.Visit(syntax);
            foreach (var finding in walker.Findings.Where(f => f.Kind == "HTTP_REST_CALL"))
            {
                token.ThrowIfCancellationRequested();
                var literalHttp = Uri.TryCreate(finding.Url, UriKind.Absolute, out var uri) &&
                    (uri.Scheme == "http" || uri.Scheme == "https");
                findings.Add(new("OutgoingHttpCandidate", project, literalHttp ? uri!.Host : null,
                    finding.HttpMethod, new(relative, finding.StartLine ?? 1, finding.StartLine ?? 1)));
                warnings.Add(new("UNRESOLVED_HTTP_TARGET", "Syntax candidate only: receiver type and target service identity are not verified.", relative));
            }
            analyzed++;
        }
        token.ThrowIfCancellationRequested();
        return new("1.0", request.JobId, request.ProjectId, request.SourceSnapshotId, "dotnet-syntax/1.0",
            findings, new(files.Count(f => Path.GetExtension(f).Equals(".cs", StringComparison.OrdinalIgnoreCase)), analyzed, "PartialSyntax"), warnings);
    }

    private static bool IsWithin(string path, string root) =>
        path.Equals(root, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal) ||
        path.StartsWith(Path.TrimEndingDirectorySeparator(root) + Path.DirectorySeparatorChar,
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    private static string ValidateRoot(string location, string[] allowedRoots)
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

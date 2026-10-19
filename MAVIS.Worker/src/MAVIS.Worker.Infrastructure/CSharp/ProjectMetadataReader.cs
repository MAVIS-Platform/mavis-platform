using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using MAVIS.Worker.Application.Analysis;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>Reads declared metadata only; never evaluates MSBuild, imports or conditions.</summary>
internal static class ProjectMetadataReader
{
    public static void Read(string root, string file, string content, string[] projects,
        List<DotnetFinding> findings, List<AnalysisWarning> warnings, CancellationToken ct)
    {
        var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
        if (Path.GetExtension(file).Equals(".sln", StringComparison.OrdinalIgnoreCase))
        {
            findings.Add(new("Solution", relative, relative, null, new(relative, 1, 1)));
            var lines = content.Split('\n');
            for (var i = 0; i < lines.Length; i++)
            {
                ct.ThrowIfCancellationRequested();
                var match = Regex.Match(lines[i], "^Project\\(\"[^\"]+\"\\)\\s*=\\s*\"[^\"]*\",\\s*\"([^\"]+\\.csproj)\"", RegexOptions.IgnoreCase);
                if (match.Success) AddReference("SolutionProject", match.Groups[1].Value, i + 1);
            }
            return;
        }
        findings.Add(new("Project", relative, relative, null, new(relative, 1, 1)));
        warnings.Add(new("PROJECT_ITEMS_UNEVALUATED", "Compile items use a static subset only; MSBuild imports, SDK targets, build properties and generated items are not evaluated.", relative));
        try
        {
            using var reader = XmlReader.Create(new StringReader(content), new XmlReaderSettings
                { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
            var document = XDocument.Load(reader, LoadOptions.SetLineInfo);
            foreach (var item in document.Descendants().Where(e => e.Name.LocalName == "ProjectReference"))
            {
                ct.ThrowIfCancellationRequested();
                var include = item.Attribute("Include")?.Value;
                var line = ((IXmlLineInfo)item).LineNumber;
                if (item.AncestorsAndSelf().Any(e => e.Attribute("Condition") is not null) ||
                    string.IsNullOrWhiteSpace(include) || include.IndexOfAny(['$', '@', '*', '?', ';', '%']) >= 0)
                {
                    warnings.Add(new("UNRESOLVED_PROJECT_REFERENCE", "Conditional or dynamic project reference was not evaluated.", relative));
                    continue;
                }
                AddReference("ProjectReference", include, line);
            }
        }
        catch (XmlException)
        {
            warnings.Add(new("INVALID_PROJECT_XML", "Project metadata is invalid or uses prohibited XML features; available source findings are retained.", relative));
        }

        void AddReference(string kind, string include, int line)
        {
            var normalized = include.Replace('\\', Path.DirectorySeparatorChar).Replace('/', Path.DirectorySeparatorChar);
            string target;
            try { target = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(file)!, normalized)); }
            catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
            {
                warnings.Add(new("UNRESOLVED_PROJECT_REFERENCE", "Invalid reference path.", relative));
                return;
            }
            // Never open a reference. Match only files already discovered within the guarded snapshot.
            var known = projects.FirstOrDefault(p => p.Equals(target,
                OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal));
            if (known is null)
            {
                warnings.Add(new("UNRESOLVED_PROJECT_REFERENCE", "Referenced project is missing, excluded or outside the source snapshot.", relative));
                return;
            }
            findings.Add(new(kind, relative, Path.GetRelativePath(root, known).Replace('\\', '/'), null,
                new(relative, line, line), relative));
        }
    }
}

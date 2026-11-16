using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using MAVIS.Worker.Application.Analysis;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>A bounded, static subset of compile-item declarations; never evaluates MSBuild.</summary>
internal sealed class ProjectCompileProfile
{
    public required string Project { get; init; }
    public required HashSet<string> Files { get; init; }
    public IReadOnlyList<string> ImplicitNamespaces { get; init; } = [];
    public bool IsExecutable { get; init; }

    public static ProjectCompileProfile Create(string root, string project, string content,
        IReadOnlyList<string> sources, List<AnalysisWarning> warnings, CancellationToken ct, IReadOnlyList<string>? projects = null)
    {
        var comparer = OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;
        var directory = Path.GetDirectoryName(project)!;
        var relative = Path.GetRelativePath(root, project).Replace('\\', '/');
        var selected = new HashSet<string>(comparer);
        XDocument doc;
        try
        {
            using var reader = XmlReader.Create(new StringReader(content), new XmlReaderSettings
                { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
            doc = XDocument.Load(reader);
        }
        catch (XmlException)
        {
            // Preserve baseline partial findings without pretending project membership is verified.
            warnings.Add(new("COMPILE_PROFILE_FALLBACK", "Invalid project XML: directory-based source candidates only.", relative));
            AddDefaults();
            return new() { Project = project, Files = selected };
        }

        var sdk = doc.Root?.Attribute("Sdk")?.Value;
        var knownSdk = sdk is "Microsoft.NET.Sdk" or "Microsoft.NET.Sdk.Web" or "Microsoft.NET.Sdk.Worker";
        if (!knownSdk)
            warnings.Add(new("COMPILE_PROFILE_FALLBACK", "SDK defaults are unverified; directory-based source candidates are assumed unless disabled explicitly.", relative));
        var defaultItems = true;
        var defaultCompileItems = true;
        foreach (var property in doc.Descendants().Where(e => e.Name.LocalName is "EnableDefaultCompileItems" or "EnableDefaultItems"))
        {
            ct.ThrowIfCancellationRequested();
            if (Conditional(property) || property.Parent?.Name.LocalName != "PropertyGroup" ||
                property.Parent.Parent != doc.Root || !bool.TryParse(property.Value.Trim(), out var enabled))
            {
                warnings.Add(new("UNSUPPORTED_COMPILE_ITEM", "Conditional/dynamic default-item settings were not evaluated.", relative));
                continue;
            }
            if (property.Name.LocalName == "EnableDefaultItems") defaultItems = enabled;
            else defaultCompileItems = enabled;
        }
        if (defaultItems && defaultCompileItems) AddDefaults();
        foreach (var item in doc.Descendants().Where(e => e.Name.LocalName == "Compile"))
        {
            ct.ThrowIfCancellationRequested();
            if (Conditional(item) || item.Parent?.Name.LocalName != "ItemGroup" || item.Parent.Parent != doc.Root)
            {
                warnings.Add(new("UNSUPPORTED_COMPILE_ITEM", "Conditional or target-generated Compile items were not evaluated.", relative));
                continue;
            }
            var include = item.Attribute("Include")?.Value;
            var remove = item.Attribute("Remove")?.Value;
            var exclude = item.Attribute("Exclude")?.Value;
            if (!Supported(include) || !Supported(remove) || !Supported(exclude) ||
                item.Attribute("Update") is not null || ((include is null) == (remove is null)))
            {
                warnings.Add(new("UNSUPPORTED_COMPILE_ITEM", "Compile item uses unsupported expressions or operations.", relative));
                continue;
            }
            foreach (var source in sources)
            {
                ct.ThrowIfCancellationRequested();
                var name = Path.GetRelativePath(directory, source).Replace('\\', '/');
                if (remove is not null && Matches(name, remove)) selected.Remove(source);
                if (include is not null && Matches(name, include) && (exclude is null || !Matches(name, exclude))) selected.Add(source);
            }
        }
        var properties = doc.Root?.Elements().Where(e => e.Name.LocalName == "PropertyGroup" && !Conditional(e)).SelectMany(e => e.Elements()).Where(e => !Conditional(e)).ToArray() ?? [];
        var implicitSetting = properties.LastOrDefault(e => e.Name.LocalName == "ImplicitUsings")?.Value.Trim();
        var imports = new List<string>();
        if (knownSdk && implicitSetting is "enable" or "true")
        {
            imports.AddRange(["System", "System.Collections.Generic", "System.IO", "System.Linq", "System.Net.Http", "System.Threading", "System.Threading.Tasks"]);
            if (sdk == "Microsoft.NET.Sdk.Web") imports.AddRange(["Microsoft.AspNetCore.Builder", "Microsoft.AspNetCore.Hosting", "Microsoft.AspNetCore.Http", "Microsoft.AspNetCore.Routing", "Microsoft.Extensions.Configuration", "Microsoft.Extensions.DependencyInjection", "Microsoft.Extensions.Hosting", "Microsoft.Extensions.Logging"]);
            warnings.Add(new("HOST_IMPLICIT_USINGS_PROFILE", "Known SDK implicit namespaces are supplied to host semantic compilation; target SDK imports are not evaluated.", relative));
        }
        return new() { Project = project, Files = selected, ImplicitNamespaces = imports,
            IsExecutable = sdk == "Microsoft.NET.Sdk.Web" || properties.LastOrDefault(e => e.Name.LocalName == "OutputType")?.Value.Trim() is "Exe" or "WinExe" };

        void AddDefaults()
        {
            foreach (var source in sources)
            {
                ct.ThrowIfCancellationRequested();
                var name = Path.GetRelativePath(directory, source).Replace('\\', '/');
                if ((projects is null || ProjectContextOwnership.Nearest(source, projects).Contains(project)) && !name.StartsWith("../", StringComparison.Ordinal) &&
                    !name.Split('/').Any(s => s.StartsWith('.'))) selected.Add(source);
            }
        }
    }

    private static bool Conditional(XElement e) => e.AncestorsAndSelf().Any(a => a.Attribute("Condition") is not null);

    private static bool Supported(string? patterns) => patterns is null || patterns.Split(';').All(p =>
    {
        var pattern = p.Trim().Replace('\\', '/');
        return pattern.Length is > 0 and <= 512 && !pattern.StartsWith('/') && !pattern.Contains(':') &&
               pattern.IndexOfAny(['$', '@', '%', '[', ']']) < 0 &&
               !pattern.Split('/').SkipWhile(s => s == "..").Contains("..");
    });

    private static bool Matches(string path, string patterns) => patterns.Split(';').Any(pattern =>
    {
        pattern = pattern.Trim().Replace('\\', '/');
        while (pattern.StartsWith("./", StringComparison.Ordinal)) pattern = pattern[2..];
        var expression = new StringBuilder("\\A");
        for (var i = 0; i < pattern.Length; i++)
        {
            if (pattern[i] == '*' && i + 1 < pattern.Length && pattern[i + 1] == '*')
            {
                i++;
                if (i + 1 < pattern.Length && pattern[i + 1] == '/') { expression.Append("(?:.*/)?"); i++; }
                else expression.Append(".*");
            }
            else expression.Append(pattern[i] switch { '*' => "[^/]*", '?' => "[^/]", _ => Regex.Escape(pattern[i].ToString()) });
        }
        expression.Append("\\z");
        return Regex.IsMatch(path, expression.ToString(), RegexOptions.CultureInvariant | RegexOptions.NonBacktracking |
            (OperatingSystem.IsWindows() ? RegexOptions.IgnoreCase : RegexOptions.None), TimeSpan.FromMilliseconds(100));
    });
}

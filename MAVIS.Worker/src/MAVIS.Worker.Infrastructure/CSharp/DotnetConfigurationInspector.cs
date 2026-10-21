using System.Text.Json;
using MAVIS.Worker.Application.Analysis;

namespace MAVIS.Worker.Infrastructure.CSharp;

internal static class DotnetConfigurationInspector
{
    public static void Inspect(string root, string file, string content, string[] projects,
        List<DotnetFinding> findings, List<AnalysisWarning> warnings, CancellationToken ct, ConfigurationCatalog? catalog = null)
    {
        var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
        warnings.Add(new("CONFIGURATION_PROFILE", "Configuration keys and HTTP host/port identities only; no secret values, environment merging or runtime overrides are evaluated.", relative));
        try
        {
            using var document = JsonDocument.Parse(content, new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true, MaxDepth = 64 });
            foreach (var project in ProjectContextOwnership.Nearest(file, projects))
                Visit(document.RootElement, "", Path.GetRelativePath(root, project).Replace('\\', '/'));
        }
        catch (JsonException) { warnings.Add(new("INVALID_CONFIGURATION_JSON", "Configuration is malformed or exceeds supported depth.", relative)); }

        void Visit(JsonElement element, string key, string project)
        {
            ct.ThrowIfCancellationRequested();
            if (element.ValueKind == JsonValueKind.Object)
            {
                foreach (var property in element.EnumerateObject()) Visit(property.Value, key.Length == 0 ? property.Name : key + ":" + property.Name, project);
            }
            else if (element.ValueKind == JsonValueKind.Array)
            {
                var index = 0;
                foreach (var item in element.EnumerateArray()) Visit(item, key + ":" + index++, project);
            }
            else
            {
                var evidence = new SourceReference(relative, 1, content.Count(c => c == '\n') + 1);
                findings.Add(new("ConfigurationKey", project, key, null, evidence, key,
                    SemanticProjectInspector.Id(project, "ConfigurationKey", relative + "|" + key)));
                // Connection strings and credentials are never parsed or returned as values.
                var leaf = key.Split(':').Last();
                if (element.ValueKind == JsonValueKind.String && key.StartsWith("ConnectionStrings:", StringComparison.Ordinal) && key.Count(c => c == ':') == 1)
                    catalog?.AddConnection(project, leaf, element.GetString()!, evidence);
                if (element.ValueKind == JsonValueKind.String && (leaf.EndsWith("Url", StringComparison.OrdinalIgnoreCase) ||
                    leaf.EndsWith("BaseAddress", StringComparison.OrdinalIgnoreCase) || leaf.EndsWith("Endpoint", StringComparison.OrdinalIgnoreCase)) &&
                    Uri.TryCreate(element.GetString(), UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
                {
                    catalog?.Add(project, key, uri, evidence);
                    findings.Add(new("ConfiguredHttpHost", project, HttpEndpointIdentity.FromUri(uri), null, evidence, key,
                        SemanticProjectInspector.Id(project, "ConfiguredHttpHost", relative + "|" + key), ResolutionStatus: "ConfigurationLiteral"));
                }
            }
        }
    }
}

using MAVIS.Worker.Application.Analysis;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>Only safe HTTP aliases; never stores raw configuration/connection-string values.</summary>
internal sealed class ConfigurationCatalog
{
    private readonly Dictionary<(string Project, string Key), List<(Uri Uri, SourceReference Evidence)>> _http = new();
    public void Add(string project, string key, Uri uri, SourceReference evidence)
    {
        var safe = new UriBuilder(uri.Scheme, uri.Host, uri.Port, uri.AbsolutePath).Uri;
        if (!_http.TryGetValue((project, key), out var entries)) _http[(project, key)] = entries = [];
        entries.Add((safe, evidence));
    }

    public (Uri? Uri, IReadOnlyList<SourceReference> Evidence, string Status) Resolve(string project, string key)
    {
        if (!_http.TryGetValue((project, key), out var entries)) return (null, [], "Unresolved");
        var addresses = entries.Select(e => e.Uri.AbsoluteUri).Distinct(StringComparer.Ordinal).ToArray();
        return addresses.Length == 1 ? (entries[0].Uri, entries.Select(e => e.Evidence).Distinct().ToArray(), "ConfigurationLiteral")
            : (null, entries.Select(e => e.Evidence).Distinct().ToArray(), "Ambiguous");
    }

    public void Publish(List<DotnetFinding> findings, List<AnalysisWarning> warnings)
    {
        foreach (var key in _http.Keys.OrderBy(k => k.Project, StringComparer.Ordinal).ThenBy(k => k.Key, StringComparer.Ordinal))
        {
            var value = Resolve(key.Project, key.Key);
            findings.Add(new("ConfigurationHttpReference", key.Project, value.Uri is null ? null : HttpEndpointIdentity.FromUri(value.Uri),
                null, value.Evidence[0], key.Key, SemanticProjectInspector.Id(key.Project, "ConfigurationHttpReference", key.Key),
                value.Evidence.Skip(1).ToArray(), ResolutionStatus: value.Status));
            if (value.Status == "Ambiguous") warnings.Add(new("AMBIGUOUS_CONFIGURATION_REFERENCE", "Configuration variants disagree; no environment precedence is assumed.", value.Evidence[0].FilePath));
        }
    }
}

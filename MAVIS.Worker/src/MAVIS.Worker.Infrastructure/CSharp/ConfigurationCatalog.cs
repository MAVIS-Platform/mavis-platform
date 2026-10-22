using MAVIS.Worker.Application.Analysis;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>Only safe HTTP aliases; never stores raw configuration/connection-string values.</summary>
internal sealed class ConfigurationCatalog
{
    private readonly Dictionary<(string Project, string Key), List<(Uri Uri, SourceReference Evidence)>> _http = new();
    private readonly Dictionary<(string Project, string Key), List<(IReadOnlyDictionary<string, string> Value, SourceReference Evidence)>> _connections = new();

    public void AddConnection(string project, string key, string text, SourceReference evidence)
    {
        var safe = new Dictionary<string, string> { ["connectionKey"] = key };
        try
        {
            var builder = new System.Data.Common.DbConnectionStringBuilder { ConnectionString = text };
            foreach (var alias in new[] { "Host", "Server", "Data Source" })
                if (builder.TryGetValue(alias, out var host))
                {
                    var value = Convert.ToString(host, System.Globalization.CultureInfo.InvariantCulture) ?? "";
                    if (value.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase)) value = value[4..];
                    value = value.Replace(',', ':');
                    if (Uri.TryCreate("http://" + value, UriKind.Absolute, out var uri) && uri.UserInfo.Length == 0 && uri.AbsolutePath == "/" &&
                        !value.Contains('/') && !value.Contains('\\') && !value.Contains('?') && !value.Contains('#'))
                    {
                        safe["host"] = uri.Host.ToLowerInvariant();
                        if (value.LastIndexOf(':') >= 0 && !value.EndsWith(']')) safe["port"] = uri.Port.ToString(System.Globalization.CultureInfo.InvariantCulture);
                    }
                    else if (alias == "Data Source" && (value.Contains('/') || value.Contains('\\'))) safe["fileReference"] = "Present";
                    break;
                }
            foreach (var alias in new[] { "Database", "Initial Catalog" })
                if (builder.TryGetValue(alias, out var database) && database is string name && name.Length is > 0 and <= 128 && name.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or '.'))
                { safe["database"] = name; break; }
            if (builder.TryGetValue("Port", out var port) && safe.TryGetValue("host", out var server) && int.TryParse(port.ToString(), out var number) && number is > 0 and <= 65535)
                safe["port"] = number.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        catch (ArgumentException) { /* Unsupported values remain a key-only reference. */ }
        if (!_connections.TryGetValue((project, key), out var entries)) _connections[(project, key)] = entries = [];
        entries.Add((safe, evidence));
    }

    public (IReadOnlyDictionary<string, string>? Value, IReadOnlyList<SourceReference> Evidence, string Status) Connection(string project, string key)
    {
        if (!_connections.TryGetValue((project, key), out var entries)) return (null, [], "Unresolved");
        var distinct = entries.Select(e => string.Join('|', e.Value.OrderBy(p => p.Key).Select(p => p.Key + "=" + p.Value))).Distinct().Count();
        return distinct == 1 ? (entries[0].Value, entries.Select(e => e.Evidence).ToArray(), entries[0].Value.Count > 1 ? "ConfigurationAlias" : "Unresolved")
            : (null, entries.Select(e => e.Evidence).ToArray(), "Ambiguous");
    }
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

using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using MAVIS.Worker.Application.Analysis;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>Adapter-neutral logical IDs/proposed types. Java still validates and merges into its own model/UUIDs.</summary>
internal static class CanonicalFindingProjector
{
    public static (DotnetFinding[] Findings, DotnetCanonicalBundle Bundle) Project(DotnetAnalysisRequest request,
        string adapter, IReadOnlyList<DotnetFinding> input, IReadOnlyDictionary<string, byte[]> hashes, CancellationToken ct,
        IReadOnlyDictionary<(string Project, string Subject), string>? umlMetadata = null)
    {
        var evidence = new Dictionary<string, DotnetCanonicalEvidence>(StringComparer.Ordinal);
        var elements = new Dictionary<string, DotnetCanonicalElement>(StringComparer.Ordinal);
        var relationships = new Dictionary<string, DotnetCanonicalRelationship>(StringComparer.Ordinal);
        var elementRefs = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        var relationshipRefs = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        var reachable = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        var types = new Dictionary<(string Project, string Name), string>();
        var references = input.Where(f => f.Kind == "ProjectReference" && f.Target is not null).GroupBy(f => f.ProjectPath)
            .ToDictionary(g => g.Key, g => g.Select(f => f.Target!).ToArray());
        var findings = input.Select(f => f with
        {
            Id = f.Id ?? Id(f.ProjectPath, f.Kind, (f.Subject ?? "") + "|" + f.Target + "|" + f.HttpMethod + "|" + f.Evidence.FilePath + "|" + f.Evidence.StartLine),
            Origin = Origin(f.Evidence.FilePath),
            EvidenceIds = new[] { f.Evidence }.Concat(f.AdditionalEvidence ?? []).Distinct().Select(Evidence).Order(StringComparer.Ordinal).ToArray()
        }).ToArray();
        foreach (var f in findings)
        {
            ct.ThrowIfCancellationRequested();
            var module = Module(f.ProjectPath);
            Element(module, f.ProjectPath.EndsWith(".sln", StringComparison.OrdinalIgnoreCase) ? "SYSTEM" : "COMPONENT",
                Path.GetFileNameWithoutExtension(f.ProjectPath), f.ProjectPath, "SourceProject", f.EvidenceIds!);
            if (f.Kind is "Type" or "Interface" or "Enum" or "Delegate")
            {
                var subjectName = f.Subject ?? f.Target!;
                var type = Id(f.ProjectPath, "TYPE", subjectName);
                types[(f.ProjectPath, subjectName)] = type;
                var props = new Dictionary<string, string> { ["declarationKind"] = f.Kind, ["moduleId"] = module };
                if (umlMetadata is not null && umlMetadata.TryGetValue((f.ProjectPath, subjectName), out var umlJson))
                {
                    props["umlClassifierJson"] = umlJson;
                }
                Element(type, "CLASS_INTERFACE", subjectName, f.ProjectPath, "SourceDeclaration", f.EvidenceIds!, props);
            }
        }
        foreach (var f in findings)
        {
            ct.ThrowIfCancellationRequested();
            var source = Module(f.ProjectPath); var refs = f.EvidenceIds!;
            if (f.Kind is "ApiEndpointCandidate" or "MinimalApiEndpointCandidate" or "RefitEndpointCandidate")
                Element(Id(f.ProjectPath, "ENDPOINT", f.Subject + "|" + f.HttpMethod + "|" + f.Target), "COMPONENT", f.HttpMethod + " " + f.Target,
                    f.ProjectPath, "Candidate", refs, new Dictionary<string, string> { ["moduleId"] = source, ["role"] = f.Kind });
            if (f.Kind == "ProjectReference" && f.Target is not null)
            {
                var target = Module(f.Target); Element(target, "COMPONENT", Path.GetFileNameWithoutExtension(f.Target), f.Target, "SnapshotReference", refs);
                Relation(source, target, "CODE_DEPENDENCY", "PROJECT_REFERENCE", f.ResolutionStatus, refs);
            }
            if (f.Kind is "Inherits" or "Implements" or "CodeDependency" && f.Subject is not null && f.Target is not null)
                Relation(Type(f.ProjectPath, f.Subject, refs), Type(f.ProjectPath, f.Target, refs), "CODE_DEPENDENCY", f.Kind.ToUpperInvariant(), f.Confidence, refs);
            if (f.Kind == "DependencyInjection" && f.Properties is { } di)
                Relation(Type(f.ProjectPath, di["serviceType"], refs), Type(f.ProjectPath, di["implementationType"], refs), "CODE_DEPENDENCY", "DI", f.ResolutionStatus, refs);
            if (f.Kind == "OutgoingHttp")
            {
                var target = Id(f.ProjectPath, "HTTP_TARGET", f.Target ?? "unresolved:" + f.Subject);
                Element(target, "EXTERNAL_SYSTEM", f.Target ?? "Unresolved HTTP target", f.ProjectPath, f.ResolutionStatus, refs);
                Relation(source, target, "SERVICE_HTTP_CALL", f.HttpMethod ?? "HTTP", f.ResolutionStatus, refs);
            }
            if (f.Kind == "DataAccess")
            {
                var target = Id(f.ProjectPath, "DATABASE", f.Properties?.GetValueOrDefault("provider") + "|" + (f.Target ?? "unresolved:" + f.Subject));
                Element(target, "DATABASE", f.Target ?? "Unresolved database", f.ProjectPath, f.ResolutionStatus, refs,
                    f.Properties?.Where(p => p.Key is "host" or "port" or "database" or "provider" or "connectionKey" or "fileReference").ToDictionary(p => p.Key, p => p.Value));
                Relation(f.Subject is null ? source : Type(f.ProjectPath, f.Subject, refs), target, "DATABASE_ACCESS", "DATA_ACCESS:" + f.Properties?.GetValueOrDefault("operation"), f.ResolutionStatus, refs);
            }
        }
        ct.ThrowIfCancellationRequested();
        return (findings, new("dotnet-findings/1", true, elements.Values.Select(e => e with { EvidenceIds = elementRefs[e.Id].Order(StringComparer.Ordinal).ToArray() }).OrderBy(e => e.Id, StringComparer.Ordinal).ToArray(),
            relationships.Values.Select(r => r with { EvidenceIds = relationshipRefs[r.Id].Order(StringComparer.Ordinal).ToArray() }).OrderBy(r => r.Id, StringComparer.Ordinal).ToArray(),
            evidence.Values.OrderBy(e => e.Id, StringComparer.Ordinal).ToArray()));

        string Module(string project) => SemanticProjectInspector.Id(project, "Project", "");
        string Type(string project, string name, IReadOnlyList<string> refs)
        {
            if (types.TryGetValue((project, name), out var known)) return known;
            if (!reachable.TryGetValue(project, out var allowed))
            {
                allowed = new HashSet<string>(StringComparer.Ordinal) { project };
                var queue = new Queue<string>(); queue.Enqueue(project);
                while (queue.TryDequeue(out var owner))
                {
                    ct.ThrowIfCancellationRequested();
                    foreach (var reference in references.GetValueOrDefault(owner) ?? []) if (allowed.Add(reference)) queue.Enqueue(reference);
                }
                reachable[project] = allowed;
            }
            var candidates = types.Where(t => allowed.Contains(t.Key.Project) && t.Key.Name == name).Select(t => t.Value).Distinct().ToArray();
            if (candidates.Length == 1) return candidates[0];
            var external = Id(project, "TYPE_REFERENCE", name);
            Element(external, "CLASS_INTERFACE", name, project, "ExternalOrUnresolved", refs);
            return external;
        }
        void Element(string id, string kind, string name, string project, string status, IReadOnlyList<string> refs, IReadOnlyDictionary<string, string>? properties = null)
        {
            if (!elementRefs.TryGetValue(id, out var ids)) elementRefs[id] = ids = new(StringComparer.Ordinal);
            ids.UnionWith(refs);
            elements.TryAdd(id, new(id, kind, name, project, status, [], properties));
        }
        void Relation(string from, string to, string type, string dependency, string status, IReadOnlyList<string> refs)
        {
            var id = Id(type, from, to + "|" + dependency);
            if (!relationshipRefs.TryGetValue(id, out var ids)) relationshipRefs[id] = ids = new(StringComparer.Ordinal);
            ids.UnionWith(refs);
            relationships.TryAdd(id, new(id, from, to, type, dependency, status, [],
                refs.All(r => evidence[r].Origin == "CONFIG") ? "CONFIG" : "STATIC_CODE"));
        }
        string Evidence(SourceReference location)
        {
            ct.ThrowIfCancellationRequested();
            if (!hashes.TryGetValue(location.FilePath, out var hash)) throw new InvalidOperationException("Evidence must belong to a read snapshot input.");
            var locator = location.FilePath + ":" + location.StartLine.ToString(CultureInfo.InvariantCulture) + ":" + (location.StartColumn ?? 1).ToString(CultureInfo.InvariantCulture) +
                "-" + location.EndLine.ToString(CultureInfo.InvariantCulture) + ":" + (location.EndColumn?.ToString(CultureInfo.InvariantCulture) ?? "*");
            var fileHash = Convert.ToHexString(hash).ToLowerInvariant();
            var evidenceHash = Id(Origin(location.FilePath), locator, fileHash);
            var id = Id(request.SourceSnapshotId, adapter, evidenceHash);
            evidence.TryAdd(id, new(id, request.SourceSnapshotId, adapter, Origin(location.FilePath), location, locator, fileHash, evidenceHash));
            return id;
        }
    }
    private static string Origin(string file) => Path.GetExtension(file).Equals(".cs", StringComparison.OrdinalIgnoreCase) ? "STATIC_CODE" : "CONFIG";
    private static string Id(string a, string b, string c) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(a + "\n" + b + "\n" + c))).ToLowerInvariant();
}

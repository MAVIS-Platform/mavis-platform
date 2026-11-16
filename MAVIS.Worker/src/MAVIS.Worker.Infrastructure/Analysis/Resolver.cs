using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Domain.Entities;
using System.Security.Cryptography;
using System.Text;

namespace MAVIS.Worker.Infrastructure.Analysis;

/// <summary>
/// Resolve dependency edges: dedupe, merge evidences, assign stable IDs.
/// Nhiệm vụ:
///   1. Dedupe edges: (A→B, REST) + (A→B, REST) → gộp evidence
///   2. Assign stable EdgeId (hash từ from+to+kind+method+url)
///   3. Merge conflicting evidence từ nhiều source
/// </summary>
public sealed class Resolver : IResolver
{
    public IReadOnlyList<DependencyEdge> Resolve(IEnumerable<DependencyEdge> edges)
    {
        var edgeGroups = edges
            .GroupBy(e => new EdgeKey(
                e.FromServiceId,
                e.ToServiceId,
                e.Kind,
                e.HttpMethod,
                e.Url))
            .ToList();

        var resolvedEdges = new List<DependencyEdge>();

        foreach (var group in edgeGroups)
        {
            var key = group.Key;
            var allEvidences = group
                .SelectMany(e => e.Evidences)
                .DistinctBy(ev => new { ev.FilePath, ev.StartLine, ev.Snippet })
                .ToList();

            var stableId = GenerateStableId(key);

            resolvedEdges.Add(new DependencyEdge
            {
                Id = stableId,
                FromServiceId = key.FromServiceId,
                ToServiceId = key.ToServiceId,
                Kind = key.Kind,
                HttpMethod = key.HttpMethod,
                Url = key.Url,
                Evidences = allEvidences.AsReadOnly()
            });
        }

        return resolvedEdges;
    }

    private static string GenerateStableId(EdgeKey key)
    {
        // Deterministic hash: from|to|kind|method|url
        var parts = new[]
        {
            key.FromServiceId,
            key.ToServiceId,
            key.Kind.ToString(),
            key.HttpMethod ?? "",
            key.Url ?? ""
        };

        var input = string.Join("|", parts);
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hashBytes)[..16].ToLowerInvariant();
    }

    private sealed record EdgeKey(
        string FromServiceId,
        string ToServiceId,
        Domain.Enums.DependencyKind Kind,
        string? HttpMethod,
        string? Url);
}

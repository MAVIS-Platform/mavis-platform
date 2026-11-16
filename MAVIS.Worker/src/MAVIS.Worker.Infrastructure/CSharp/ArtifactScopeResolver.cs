using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MAVIS.Worker.Application.Analysis;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Infrastructure.CSharp;

public sealed class ArtifactScopeOptions
{
    public string Root { get; set; } = "";
    public Dictionary<string, string> GrantKeys { get; set; } = new(StringComparer.Ordinal);
    public int MaxGrantLifetimeSeconds { get; set; } = 300;
}

/// <summary>Validates a narrowly scoped capability; never downloads artifacts or accepts caller paths.</summary>
public sealed class ArtifactScopeResolver(IOptions<ArtifactScopeOptions> options, TimeProvider clock) : IArtifactScopeResolver
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public bool IsReady
    {
        get
        {
            var o = options.Value;
            try
            {
                return o.MaxGrantLifetimeSeconds is >= 1 and <= 3600 && o.GrantKeys.Count > 0 &&
                    o.GrantKeys.All(k => ValidId(k.Key) && Encoding.UTF8.GetByteCount(k.Value) >= 32) &&
                    DotnetProjectAnalyzer.ValidateRoot(o.Root, [o.Root]) == Path.TrimEndingDirectorySeparator(Path.GetFullPath(o.Root));
            }
            catch (Exception e) when (e is SourceInputException or IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
            { return false; }
        }
    }

    public DotnetAnalysisRequest Resolve(ScopedDotnetRequest request)
    {
        if (!IsReady) throw new InvalidOperationException("Artifact scope is not configured.");
        if (request.SchemaVersion != "1.0") throw new SourceInputException("schemaVersion 1.0 is required.");
        if (request.ArtifactGrant is null || request.ArtifactGrant.Length > 8192) throw new ArtifactGrantException();
        var parts = request.ArtifactGrant.Split('.');
        if (parts.Length != 3 || !options.Value.GrantKeys.TryGetValue(parts[0], out var secret)) throw new ArtifactGrantException();
        ArtifactGrantClaims claims;
        try
        {
            var signature = Decode(parts[2]);
            var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]));
            if (signature.Length != expected.Length || !CryptographicOperations.FixedTimeEquals(signature, expected)) throw new ArtifactGrantException();
            claims = JsonSerializer.Deserialize<ArtifactGrantClaims>(Decode(parts[1]), Json) ?? throw new ArtifactGrantException();
        }
        catch (Exception e) when (e is FormatException or JsonException or ArgumentException) { throw new ArtifactGrantException(); }
        if (claims.SchemaVersion != "1.0" || claims.Audience != "mavis-worker-analysis" ||
            !ValidId(claims.ProjectId) || !ValidId(claims.SourceSnapshotId) || !ValidId(claims.JobId) || !ValidId(claims.AttemptId) ||
            !HexDigest(claims.ArtifactId) || !HexDigest(claims.ExpectedInputDigest) || claims.DeadlineUtc == default) throw new ArtifactGrantException();
        var remaining = claims.DeadlineUtc - clock.GetUtcNow();
        if (remaining <= TimeSpan.Zero) throw new AnalysisDeadlineException();
        if (remaining > TimeSpan.FromSeconds(options.Value.MaxGrantLifetimeSeconds)) throw new ArtifactGrantException();
        // Artifact IDs are lowercase hex, not paths, URLs or ZIP hash assertions.
        var root = DotnetProjectAnalyzer.ValidateRoot(Path.Combine(options.Value.Root, claims.ArtifactId), [options.Value.Root]);
        return new(claims.ProjectId, claims.SourceSnapshotId, root, claims.JobId, claims.SchemaVersion,
            claims.ExpectedInputDigest, claims.AttemptId, claims.DeadlineUtc);
    }

    private static bool HexDigest(string? value) => value is { Length: 64 } && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
    private static bool ValidId(string? value) => value is { Length: >= 1 and <= 128 } &&
        value.All(c => c is >= 'a' and <= 'z' or >= 'A' and <= 'Z' or >= '0' and <= '9' or '-' or '_');
    private static byte[] Decode(string value)
    {
        if (value.Length == 0 || value.Any(c => !(char.IsAsciiLetterOrDigit(c) || c is '-' or '_'))) throw new FormatException();
        var decoded = Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));
        if (Convert.ToBase64String(decoded).TrimEnd('=').Replace('+', '-').Replace('/', '_') != value) throw new FormatException();
        return decoded;
    }
}

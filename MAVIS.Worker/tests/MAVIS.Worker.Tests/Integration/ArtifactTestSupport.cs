using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MAVIS.Worker.Application.Analysis;

namespace MAVIS.Worker.Tests.Integration;

internal static class ArtifactTestSupport
{
    internal const string Key = "fixture-only-not-for-production-32-byte-key";
    internal const string ArtifactId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    internal static Dictionary<string, string?> Configuration(string root) => new()
    {
        ["WorkerAccess:ApiKey"] = "test-service-key",
        ["ArtifactScope:Root"] = root,
        ["ArtifactScope:GrantKeys:test"] = Key
    };
    internal static ScopedDotnetRequest Sign(ArtifactGrantClaims claims)
    {
        var payload = Base64(JsonSerializer.SerializeToUtf8Bytes(claims, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        var signed = "test." + payload;
        return new("1.0", signed + "." + Base64(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Key), Encoding.ASCII.GetBytes(signed))));
    }
    internal static void Authenticate(HttpClient client) => client.DefaultRequestHeaders.Add("X-Mavis-Worker-Key", "test-service-key");
    private static string Base64(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

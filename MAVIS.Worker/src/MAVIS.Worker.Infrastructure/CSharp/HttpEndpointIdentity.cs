using System.Globalization;

namespace MAVIS.Worker.Infrastructure.CSharp;

internal static class HttpEndpointIdentity
{
    // Effective port distinguishes both local services and HTTP/HTTPS defaults.
    // Never include user info, path, query or fragment in a mapping hint.
    public static string FromUri(Uri uri) =>
        uri.Host.ToLowerInvariant() + ":" + uri.Port.ToString(CultureInfo.InvariantCulture);
}

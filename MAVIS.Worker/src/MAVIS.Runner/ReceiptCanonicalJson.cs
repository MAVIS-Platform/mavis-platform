using System.Globalization;
using System.Security.Cryptography;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace MAVIS.Runner;

/// <summary>Round-2 canonicalization for the integer-only Runner receipt schema; cross-team golden gate remains required.</summary>
public static class ReceiptCanonicalJson
{
    public static string Digest(string json) => "sha256:" + Convert.ToHexStringLower(SHA256.HashData(Canonicalize(json)));

    public static byte[] Canonicalize(string json)
    {
        if (System.Text.Encoding.UTF8.GetByteCount(json) > 32 * 1024 * 1024) throw new ArgumentException("Receipt exceeds budget.");
        using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 64 });
        using var output = new MemoryStream();
        using (var writer = new Utf8JsonWriter(output, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
            Write(writer, document.RootElement);
        return output.ToArray();
    }

    private static void Write(Utf8JsonWriter writer, JsonElement node)
    {
        switch (node.ValueKind)
        {
            case JsonValueKind.Object:
                var properties = node.EnumerateObject().ToArray();
                if (properties.Select(p => p.Name).Distinct(StringComparer.Ordinal).Count() != properties.Length)
                    throw new ArgumentException("Duplicate JSON properties are not supported.");
                writer.WriteStartObject();
                foreach (var property in properties.OrderBy(p => p.Name, StringComparer.Ordinal))
                {
                    if (property.Value.ValueKind == JsonValueKind.Null) continue;
                    writer.WritePropertyName(property.Name);
                    Write(writer, property.Value);
                }
                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in node.EnumerateArray()) Write(writer, item);
                writer.WriteEndArray();
                break;
            case JsonValueKind.Number:
                // Current receipts contain only integer counters/status codes; no guessed floating-point normalization.
                if (node.TryGetInt64(out var signed)) writer.WriteRawValue(signed.ToString(CultureInfo.InvariantCulture));
                else if (node.TryGetUInt64(out var unsigned)) writer.WriteRawValue(unsigned.ToString(CultureInfo.InvariantCulture));
                else throw new ArgumentException("Receipt number is outside the integer contract.");
                break;
            default: node.WriteTo(writer); break;
        }
    }
}

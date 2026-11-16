using System.Globalization;
using System.Security.Cryptography;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace MAVIS.Runner;

/// <summary>Canonical receipt JSON with normalized bounded decimals for measured percentages.</summary>
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
                if (node.TryGetInt64(out var signed)) writer.WriteRawValue(signed.ToString(CultureInfo.InvariantCulture));
                else if (node.TryGetUInt64(out var unsigned)) writer.WriteRawValue(unsigned.ToString(CultureInfo.InvariantCulture));
                else if(decimal.TryParse(node.GetRawText(),NumberStyles.Float,CultureInfo.InvariantCulture,out var number))
                {
                    if(number==0 && node.GetRawText().Split('e','E')[0].Any(character=>character is >= '1' and <= '9'))
                        throw new ArgumentException("Receipt decimal underflows the supported range.");
                    writer.WriteRawValue(number.ToString("0.############################",CultureInfo.InvariantCulture));
                }
                else throw new ArgumentException("Receipt number is outside the supported decimal range.");
                break;
            default: node.WriteTo(writer); break;
        }
    }
}

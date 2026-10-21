import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;

/** Offline contract probe only. No platform DB, dispatch, credentials or live HTTP calls. */
public class ContractConsumer {
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        ObjectMapper json = new ObjectMapper();
        JsonNode request = json.readTree(root.resolve("request.json").toFile());
        String[] parts = request.required("artifactGrant").asText().split("\\.");
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("fixture-only-not-for-production-32-byte-key".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        require(MessageDigest.isEqual(mac.doFinal((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII)),
                Base64.getUrlDecoder().decode(parts[2])), "grant signature");
        JsonNode claims = json.readTree(Base64.getUrlDecoder().decode(parts[1]));
        require(claims.equals(json.readTree(root.resolve("claims.json").toFile())), "claim JSON");
        OffsetDateTime.parse(claims.required("deadlineUtc").asText()); // Fixture is intentionally offline/expired.
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        for (String name : new String[]{"App.cs", "App.csproj"}) {
            digest.update(name.getBytes(StandardCharsets.UTF_8)); digest.update((byte) 0);
            digest.update(MessageDigest.getInstance("SHA-256").digest(Files.readString(root.resolve("source").resolve(name)).getBytes(StandardCharsets.UTF_8)));
        }
        require(HexFormat.of().formatHex(digest.digest()).equals(claims.required("expectedInputDigest").asText()), "input digest");
        JsonNode result = json.readTree(root.resolve("result.json").toFile());
        for (String key : new String[]{"schemaVersion", "projectId", "sourceSnapshotId", "jobId", "attemptId"})
            require(result.required(key).equals(claims.required(key)), key);
        require(result.required("inputDigest").equals(claims.required("expectedInputDigest")), "result digest");
        require(result.required("findings").isArray() && result.required("coverage").isObject() && result.required("warnings").isArray(), "result arrays");
        for (JsonNode finding : result.required("findings")) {
            JsonNode evidence = finding.required("evidence");
            require(!Path.of(evidence.required("filePath").asText()).isAbsolute(), "relative evidence");
            require(evidence.required("startLine").asInt() >= 1, "evidence line");
        }
        JsonNode error = json.readTree(root.resolve("error.json").toFile());
        require(error.required("status").asInt() == 403 && error.required("code").asText().equals("ARTIFACT_SCOPE_DENIED") && error.hasNonNull("traceId"), "error envelope");
        System.out.println("N01 Java/Jackson fixture consumer: PASS (signature, digest, result, evidence, error)");
    }
    private static void require(boolean value, String label) {
        if (!value) throw new IllegalStateException("Contract mismatch: " + label);
    }
}

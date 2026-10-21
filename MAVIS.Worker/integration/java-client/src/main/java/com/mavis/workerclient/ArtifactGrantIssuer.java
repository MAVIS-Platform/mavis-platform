package com.mavis.workerclient;

import com.fasterxml.jackson.databind.ObjectMapper;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;

public final class ArtifactGrantIssuer {
    private final String keyId;
    private final byte[] secret;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();

    public ArtifactGrantIssuer(String keyId, String secret, Clock clock) {
        if (keyId == null || !keyId.matches("[A-Za-z0-9_-]{1,128}") || secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32 || clock == null)
            throw new IllegalArgumentException("Grant key configuration required");
        this.keyId = keyId; this.secret = secret.getBytes(StandardCharsets.UTF_8); this.clock = clock;
    }
    public WorkerContract.Request issue(WorkerContract.Context context) {
        Duration remaining = Duration.between(clock.instant(), context.deadlineUtc());
        if (remaining.isNegative() || remaining.isZero() || remaining.compareTo(Duration.ofSeconds(300)) > 0)
            throw new IllegalArgumentException("Grant deadline outside supported lifetime");
        var claims = new LinkedHashMap<String,Object>();
        claims.put("schemaVersion", "1.0"); claims.put("audience", "mavis-worker-analysis");
        claims.put("projectId", context.projectId()); claims.put("sourceSnapshotId", context.sourceSnapshotId());
        claims.put("jobId", context.jobId()); claims.put("attemptId", context.attemptId()); claims.put("artifactId", context.artifactId());
        claims.put("expectedInputDigest", context.expectedInputDigest()); claims.put("deadlineUtc", context.deadlineUtc().toString());
        try {
            String signed = keyId + "." + encode(json.writeValueAsBytes(claims));
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return new WorkerContract.Request("1.0", signed + "." + encode(mac.doFinal(signed.getBytes(StandardCharsets.US_ASCII))));
        } catch (Exception exception) { throw new IllegalStateException("Unable to issue artifact grant"); }
    }
    private static String encode(byte[] value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value); }
}

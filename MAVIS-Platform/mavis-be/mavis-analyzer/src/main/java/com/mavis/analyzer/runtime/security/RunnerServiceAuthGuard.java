package com.mavis.analyzer.runtime.security;

import com.mavis.common.entity.Project;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.security.AccessPolicyService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Execution callbacks require the dedicated Runner key. Read/export operations may also
 * authorize the project user through AccessPolicyService.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RunnerServiceAuthGuard {

    private final AccessPolicyService accessPolicyService;

    @Autowired(required = false)
    private HttpServletRequest httpServletRequest;

    @Value("${mavis.runner.service-key:}")
    private String runnerServiceKey;

    @Value("${mavis.runner.previous-service-key:}")
    private String previousRunnerServiceKey;

    private static final ThreadLocal<Boolean> INTERNAL_DISPATCH = ThreadLocal.withInitial(() -> false);

    public static void runWithInternalBypass(Runnable runnable) {
        INTERNAL_DISPATCH.set(true);
        try {
            runnable.run();
        } finally {
            INTERNAL_DISPATCH.remove();
        }
    }

    private static boolean isUsableKey(String key) {
        return key != null && !key.isBlank() && !key.equals("mavis-local-runner-secret-key");
    }

    private java.util.List<String> activeKeys() {
        var keys = new java.util.ArrayList<String>(2);
        if (isUsableKey(runnerServiceKey)) keys.add(runnerServiceKey);
        if (isUsableKey(previousRunnerServiceKey) && !previousRunnerServiceKey.equals(runnerServiceKey)) {
            keys.add(previousRunnerServiceKey);
        }
        return keys;
    }

    public boolean isConfigured() {
        return !activeKeys().isEmpty();
    }

    public String derivedEnvironmentKey() {
        if (!isUsableKey(runnerServiceKey)) return null;
        try {
            return java.util.Base64.getEncoder().encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(("mavis-runtime-env:" + runnerServiceKey).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return null;
        }
    }

    public boolean isRunnerServiceKeyValid() {
        if (Boolean.TRUE.equals(INTERNAL_DISPATCH.get())) {
            return true;
        }
        var keys = activeKeys();
        if (keys.isEmpty() || httpServletRequest == null) {
            return false;
        }
        try {
            String providedKey = httpServletRequest.getHeader("X-Mavis-Runner-Key");
            if (providedKey == null || providedKey.isBlank()) {
                return false;
            }
            byte[] providedBytes = providedKey.getBytes(StandardCharsets.UTF_8);
            for (String candidate : keys) {
                if (MessageDigest.isEqual(candidate.getBytes(StandardCharsets.UTF_8), providedBytes)) {
                    return true;
                }
            }
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    public void requireRunnerService() {
        if (!isRunnerServiceKeyValid()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "A dedicated Runner credential is required for execution acknowledgements");
        }
    }

    public String requireReceiptSignature(String digest) {
        if (Boolean.TRUE.equals(INTERNAL_DISPATCH.get())) return null;
        requireRunnerService();
        try {
            String provided = httpServletRequest == null ? null : httpServletRequest.getHeader("X-Mavis-Receipt-Signature");
            if (provided != null) {
                byte[] providedBytes = provided.getBytes(StandardCharsets.UTF_8);
                for (String key : activeKeys()) {
                    var mac = javax.crypto.Mac.getInstance("HmacSHA256");
                    mac.init(new javax.crypto.spec.SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
                    String expected = "hmac-sha256:" + java.util.HexFormat.of().formatHex(mac.doFinal(digest.getBytes(StandardCharsets.UTF_8)));
                    if (MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), providedBytes)) {
                        return provided;
                    }
                }
            }
        } catch (java.security.GeneralSecurityException failure) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Receipt signature verification unavailable");
        }
        throw new BusinessException(ErrorCode.FORBIDDEN, "A valid Runner receipt signature is required");
    }

    public void checkRunnerOrProjectWriteAccess(Project project) {
        if (isRunnerServiceKeyValid()) {
            log.debug("Xác thực thành công qua header X-Mavis-Runner-Key");
            return;
        }
        accessPolicyService.requireProjectWriteAccess(project);
    }

    public void checkRunnerOrProjectReadAccess(Project project) {
        if (isRunnerServiceKeyValid()) {
            log.debug("Xác thực thành công qua header X-Mavis-Runner-Key");
            return;
        }
        accessPolicyService.requireProjectReadAccess(project);
    }
}

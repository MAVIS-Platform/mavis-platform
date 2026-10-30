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

    private static final ThreadLocal<Boolean> INTERNAL_DISPATCH = ThreadLocal.withInitial(() -> false);

    public static void runWithInternalBypass(Runnable runnable) {
        INTERNAL_DISPATCH.set(true);
        try {
            runnable.run();
        } finally {
            INTERNAL_DISPATCH.remove();
        }
    }

    public boolean isConfigured() {
        return runnerServiceKey != null && !runnerServiceKey.isBlank() && !runnerServiceKey.equals("mavis-local-runner-secret-key");
    }

    public boolean isRunnerServiceKeyValid() {
        if (Boolean.TRUE.equals(INTERNAL_DISPATCH.get())) {
            return true;
        }
        if (!isConfigured()) {
            return false;
        }
        if (httpServletRequest == null) {
            return false;
        }
        try {
            String providedKey = httpServletRequest.getHeader("X-Mavis-Runner-Key");
            if (providedKey == null || providedKey.isBlank()) {
                return false;
            }
            byte[] expectedBytes = runnerServiceKey.getBytes(StandardCharsets.UTF_8);
            byte[] providedBytes = providedKey.getBytes(StandardCharsets.UTF_8);
            return MessageDigest.isEqual(expectedBytes, providedBytes);
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

package com.mavis.analyzer.runtime.security;

import com.mavis.common.entity.Project;
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
 * Thành phần bảo mật phân quyền kép cho các API Runner/Adapter.
 * Cho phép thực thi nếu request mang header X-Mavis-Runner-Key khớp constant-time với mavis.runner.service-key,
 * HOẶC nếu người dùng hiện tại có quyền truy cập đồ án tương ứng qua AccessPolicyService.
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

    public boolean isRunnerServiceKeyValid() {
        if (runnerServiceKey == null || runnerServiceKey.isBlank()) {
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

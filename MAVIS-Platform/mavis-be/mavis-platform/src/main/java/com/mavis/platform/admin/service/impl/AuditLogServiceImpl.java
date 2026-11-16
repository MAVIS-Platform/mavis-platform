package com.mavis.platform.admin.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.AuditLog;
import com.mavis.common.entity.User;
import com.mavis.common.repository.AuditLogRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.admin.dto.AuditLogResponseDTO;
import com.mavis.platform.admin.service.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditLogServiceImpl implements AuditLogService {

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordAuditLog(String action, String targetType, UUID targetId, Map<String, Object> details) {
        log.info("Ghi nhận AuditLog: action={}, targetType={}, targetId={}", action, targetType, targetId);

        User actor = null;
        try {
            UUID actorId = SecurityUtils.getCurrentUserId();
            if (actorId != null) {
                actor = userRepository.findById(actorId).orElse(null);
            }
        } catch (Exception e) {
            log.debug("Không thể xác định actor cho AuditLog, gán là SYSTEM");
        }

        String ipAddress = resolveClientIpAddress();
        JsonNode detailsNode = details != null ? objectMapper.valueToTree(details) : null;

        AuditLog auditLog = AuditLog.builder()
                .actor(actor)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .details(detailsNode)
                .ipAddress(ipAddress)
                .build();

        auditLogRepository.save(auditLog);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AuditLogResponseDTO> getRecentAuditLogs() {
        log.debug("Lấy 100 nhật ký kiểm toán gần đây nhất");
        List<AuditLog> logs = auditLogRepository.findTop100ByOrderByCreatedAtDesc();
        if (logs == null || logs.isEmpty()) {
            return Collections.emptyList();
        }
        return logs.stream()
                .map(AuditLogResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    private String resolveClientIpAddress() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                String xForwardedFor = request.getHeader("X-Forwarded-For");
                if (xForwardedFor != null && !xForwardedFor.isBlank()) {
                    return xForwardedFor.split(",")[0].trim();
                }
                return request.getRemoteAddr();
            }
        } catch (Exception e) {
            log.debug("Không thể lấy IP Address từ HttpServletRequest: {}", e.getMessage());
        }
        return "127.0.0.1";
    }
}

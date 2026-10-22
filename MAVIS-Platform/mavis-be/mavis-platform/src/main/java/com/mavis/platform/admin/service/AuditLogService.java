package com.mavis.platform.admin.service;

import com.mavis.platform.admin.dto.AuditLogResponseDTO;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface AuditLogService {

    /**
     * Ghi nhận nhật ký kiểm toán hệ thống (Audit Log).
     * Tự động lấy actor hiện tại từ SecurityUtils/SecurityContext và IP Address từ HttpServletRequest.
     *
     * @param action Hành động thực hiện (VD: CHANGE_USER_STATUS, CHANGE_USER_ROLE)
     * @param targetType Loại đối tượng bị tác động (VD: USER, ASSIGNMENT, PROJECT)
     * @param targetId ID của đối tượng bị tác động
     * @param details Chi tiết thay đổi dưới dạng key-value
     */
    void recordAuditLog(String action, String targetType, UUID targetId, Map<String, Object> details);

    /**
     * Lấy 100 nhật ký kiểm toán mới nhất, tối ưu @EntityGraph(attributePaths = {"actor"}).
     *
     * @return Danh sách AuditLogResponseDTO
     */
    List<AuditLogResponseDTO> getRecentAuditLogs();
}

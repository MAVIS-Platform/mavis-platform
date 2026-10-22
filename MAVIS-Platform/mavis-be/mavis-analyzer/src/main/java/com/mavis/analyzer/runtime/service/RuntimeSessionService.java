package com.mavis.analyzer.runtime.service;

import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;

import java.util.List;
import java.util.UUID;

public interface RuntimeSessionService {

    /**
     * Kiểm tra tiền kiểm tra bảo mật file docker-compose.yml trong SourceSnapshot (BR-41..BR-45).
     * Phát hiện privileged: true, network_mode: host, và mount thư mục nhạy cảm (/var/run/docker.sock, /etc, /root).
     *
     * @param snapshotId ID của SourceSnapshot
     * @return PreflightCheckResponseDTO
     */
    PreflightCheckResponseDTO runComposePreflight(UUID snapshotId);

    /**
     * Tạo phiên chạy thực nghiệm mới, tự động khử thông tin mật (Secret Redaction) trong scenarioConfig.
     * Trạng thái khởi tạo: scenarioStatus = "PENDING", traceStatus = "NONE".
     *
     * @param request Thông tin tạo phiên chạy
     * @return RuntimeSessionResponseDTO
     */
    RuntimeSessionResponseDTO createRuntimeSession(RuntimeSessionCreateRequest request);

    /**
     * Phê duyệt và khởi chạy phiên thực nghiệm (BR-41..BR-45: phải qua approve mới chuyển RUNNING).
     * Sinh file docker-compose.mavis-override.yml và chuyển scenarioStatus = "RUNNING", ghi nhận startedAt.
     *
     * @param sessionId ID của phiên thực nghiệm
     * @return RuntimeSessionResponseDTO kèm nội dung overrideComposeYaml
     */
    RuntimeSessionResponseDTO approveAndStartSession(UUID sessionId);

    /**
     * Dừng phiên chạy thực nghiệm, chuyển scenarioStatus = "CANCELLED" và ghi nhận completedAt.
     *
     * @param sessionId ID của phiên thực nghiệm
     * @return RuntimeSessionResponseDTO
     */
    RuntimeSessionResponseDTO stopSession(UUID sessionId);

    /**
     * Lấy danh sách các phiên chạy của dự án theo thứ tự mới nhất (createdAt DESC).
     *
     * @param projectId ID của dự án
     * @return Danh sách RuntimeSessionResponseDTO
     */
    List<RuntimeSessionResponseDTO> getSessionsByProject(UUID projectId);

    /**
     * Lấy chi tiết một phiên chạy thực nghiệm theo ID.
     *
     * @param sessionId ID của phiên thực nghiệm
     * @return RuntimeSessionResponseDTO
     */
    RuntimeSessionResponseDTO getSessionById(UUID sessionId);

    /**
     * Xuất hợp đồng RuntimeRunDefinition chuẩn khớp 100% với MAVIS.Runner CLI.
     *
     * @param sessionId ID của phiên thực nghiệm
     * @return RunnerDefinitionExportDTO
     */
    com.mavis.analyzer.runtime.dto.RunnerDefinitionExportDTO exportRunDefinition(UUID sessionId);

    /**
     * Xác nhận các mốc vòng đời phiên thực nghiệm từ Runner/Adapter (ALLOCATED / RUNNING).
     *
     * @param sessionId ID phiên thực nghiệm
     * @param request Payload chứa stage và resourceProject
     * @return RuntimeSessionLifecycleAckDTO
     */
    com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckDTO acknowledgeLifecycle(
            UUID sessionId,
            com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckRequestDTO request);
}

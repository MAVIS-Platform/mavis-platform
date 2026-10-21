package com.mavis.analyzer.runtime.controller;

import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Runtime Sandbox & OpenTelemetry", description = "APIs for Docker Sandbox execution, compose preflight check, secret redaction, and session management")
public class RuntimeSessionController {

    private final RuntimeSessionService runtimeSessionService;

    @PostMapping("/runtime/preflight")
    @Operation(summary = "Tiền kiểm tra bảo mật file docker-compose (Compose Preflight Check)",
            description = "Phát hiện các cấu hình nguy hiểm như privileged: true, network_mode: host, mount /var/run/docker.sock, /etc, /root")
    public ApiResponse<PreflightCheckResponseDTO> runPreflightCheck(@RequestParam UUID snapshotId) {
        PreflightCheckResponseDTO result = runtimeSessionService.runComposePreflight(snapshotId);
        return ApiResponse.success("Tiền kiểm tra bảo mật cấu hình Compose thành công", result);
    }

    @PostMapping("/runtime/sessions")
    @Operation(summary = "Tạo phiên chạy thực nghiệm mới trong Docker Sandbox",
            description = "Tự động khử chuỗi nhạy cảm (Secret Redaction) trong scenarioConfig và đặt trạng thái PENDING")
    public ApiResponse<RuntimeSessionResponseDTO> createSession(@Valid @RequestBody RuntimeSessionCreateRequest request) {
        RuntimeSessionResponseDTO created = runtimeSessionService.createRuntimeSession(request);
        return ApiResponse.success("Tạo phiên chạy thực nghiệm thành công", created);
    }

    @PostMapping("/runtime/sessions/{sessionId}/approve")
    @Operation(summary = "Phê duyệt và kích hoạt khởi chạy phiên thực nghiệm (BR-41..BR-45)",
            description = "Sinh file docker-compose.mavis-override.yml giới hạn CPU/RAM và gán OTEL exporter, chuyển trạng thái sang RUNNING")
    public ApiResponse<RuntimeSessionResponseDTO> approveSession(@PathVariable UUID sessionId) {
        RuntimeSessionResponseDTO response = runtimeSessionService.approveAndStartSession(sessionId);
        return ApiResponse.success("Phê duyệt và khởi chạy phiên thực nghiệm thành công", response);
    }

    @PostMapping("/runtime/sessions/{sessionId}/stop")
    @Operation(summary = "Dừng phiên chạy thực nghiệm",
            description = "Chuyển trạng thái sang CANCELLED và ghi nhận thời gian kết thúc")
    public ApiResponse<RuntimeSessionResponseDTO> stopSession(@PathVariable UUID sessionId) {
        RuntimeSessionResponseDTO response = runtimeSessionService.stopSession(sessionId);
        return ApiResponse.success("Dừng phiên thực nghiệm thành công", response);
    }

    @GetMapping("/projects/{projectId}/runtime-sessions")
    @Operation(summary = "Lấy danh sách các phiên thực nghiệm của dự án",
            description = "Sắp xếp theo thứ tự thời gian mới nhất (createdAt DESC)")
    public ApiResponse<List<RuntimeSessionResponseDTO>> getSessionsByProject(@PathVariable UUID projectId) {
        List<RuntimeSessionResponseDTO> sessions = runtimeSessionService.getSessionsByProject(projectId);
        return ApiResponse.success("Lấy danh sách phiên thực nghiệm thành công", sessions);
    }

    @GetMapping("/runtime/sessions/{sessionId}")
    @Operation(summary = "Lấy thông tin chi tiết một phiên thực nghiệm",
            description = "Trả về thông tin phiên chạy theo sessionId")
    public ApiResponse<RuntimeSessionResponseDTO> getSessionById(@PathVariable UUID sessionId) {
        RuntimeSessionResponseDTO session = runtimeSessionService.getSessionById(sessionId);
        return ApiResponse.success("Lấy chi tiết phiên thực nghiệm thành công", session);
    }
}

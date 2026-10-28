package com.mavis.analyzer.runtime.controller;

import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeTraceIngestRequestDTO;
import com.mavis.analyzer.runtime.dto.SequenceDiagramResponseDTO;
import com.mavis.analyzer.runtime.service.OtelTraceCorrelationService;
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
    private final OtelTraceCorrelationService otelTraceCorrelationService;
    private final com.mavis.analyzer.runtime.service.RunnerReceiptIngestService runnerReceiptIngestService;

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

    @PostMapping("/runtime/sessions/{sessionId}/dispatch")
    @Operation(summary = "Kích hoạt điều phối thực thi phiên thực nghiệm ngay lập tức (J50-03, V15, N15)",
            description = "Tự động kích hoạt MAVIS.Runner CLI hoặc Synthetic POC Trace và trả về kết quả đã cập nhật")
    public ApiResponse<RuntimeSessionResponseDTO> dispatchSession(@PathVariable UUID sessionId) {
        RuntimeSessionResponseDTO response = runtimeSessionService.dispatchSession(sessionId);
        return ApiResponse.success("Kích hoạt điều phối phiên thực nghiệm thành công", response);
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

    @GetMapping("/projects/{projectId}/runtime-config")
    @Operation(summary = "Lấy cấu hình Runtime & điều kiện thực thi của dự án (FR-RT02, J50-01, V14, F13)",
            description = "Trả về trạng thái tương thích, profile khuyến nghị, và đề xuất service mappings từ mô hình mới nhất")
    public ApiResponse<com.mavis.analyzer.runtime.dto.RuntimeProjectConfigDTO> getProjectRuntimeConfig(@PathVariable UUID projectId) {
        com.mavis.analyzer.runtime.dto.RuntimeProjectConfigDTO config = runtimeSessionService.getProjectRuntimeConfig(projectId);
        return ApiResponse.success("Lấy cấu hình runtime dự án thành công", config);
    }

    @PutMapping("/projects/{projectId}/runtime-config")
    @Operation(summary = "Lưu cập nhật cấu hình Runtime của dự án (FR-RT02, J50-01, V14, F13)",
            description = "Cập nhật profileId và confirmedServiceMappings, tăng revision của cấu hình")
    public ApiResponse<com.mavis.analyzer.runtime.dto.RuntimeProjectConfigDTO> updateProjectRuntimeConfig(
            @PathVariable UUID projectId,
            @RequestBody com.mavis.analyzer.runtime.dto.RuntimeProjectConfigRequestDTO request) {
        com.mavis.analyzer.runtime.dto.RuntimeProjectConfigDTO updated = runtimeSessionService.updateProjectRuntimeConfig(projectId, request);
        return ApiResponse.success("Cập nhật cấu hình runtime dự án thành công", updated);
    }

    @GetMapping("/runtime/sessions/{sessionId}")
    @Operation(summary = "Lấy thông tin chi tiết một phiên thực nghiệm",
            description = "Trả về thông tin phiên chạy theo sessionId")
    public ApiResponse<RuntimeSessionResponseDTO> getSessionById(@PathVariable UUID sessionId) {
        RuntimeSessionResponseDTO session = runtimeSessionService.getSessionById(sessionId);
        return ApiResponse.success("Lấy chi tiết phiên thực nghiệm thành công", session);
    }

    @PostMapping("/runtime/sessions/{sessionId}/ingest-traces")
    @Operation(summary = "Tiếp nhận và đối chiếu nhân quả vết OpenTelemetry (BR-46..BR-49)",
            description = "Dựng chuỗi nhân quả O(N), nâng cấp cạnh STATIC lên STATIC_AND_RUNTIME, thêm RUNTIME_OBSERVED và chiếu Sequence Diagram")
    public ApiResponse<ModelVersionResponseDTO> ingestTraces(
            @PathVariable UUID sessionId,
            @RequestParam UUID baseModelVersionId,
            @RequestBody RuntimeTraceIngestRequestDTO request) {
        ModelVersionResponseDTO response = otelTraceCorrelationService.ingestTraces(sessionId, baseModelVersionId, request);
        return ApiResponse.success("Tiếp nhận và đối chiếu vết OpenTelemetry thành công", response);
    }

    @GetMapping("/runtime/sessions/{sessionId}/sequence")
    @Operation(summary = "Lấy biểu đồ tuần tự tương tác nhân quả (UML Sequence Diagram)",
            description = "Trả về thứ tự các bước gọi API liên dịch vụ ghi nhận từ vết OpenTelemetry")
    public ApiResponse<SequenceDiagramResponseDTO> getSequenceDiagram(@PathVariable UUID sessionId) {
        SequenceDiagramResponseDTO response = otelTraceCorrelationService.getSequenceDiagramBySession(sessionId);
        return ApiResponse.success("Lấy sơ đồ tuần tự runtime thành công", response);
    }

    @PostMapping("/runtime/sessions/{sessionId}/ingest-receipt")
    @Operation(summary = "Tiếp nhận RunnerReceipt trực tiếp từ MAVIS.Runner hoặc Gateway Adapter (WJ-02, WJ-04)",
            description = "Xác thực scope, chống ghi đúp (idempotency), làm giàu ModelVersion RUNTIME_ENRICHED và chiếu Sequence Diagram")
    public ApiResponse<ModelVersionResponseDTO> ingestReceipt(
            @PathVariable UUID sessionId,
            @RequestBody com.mavis.analyzer.runtime.dto.RunnerReceiptIngestRequestDTO receipt) {
        ModelVersionResponseDTO response = runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);
        return ApiResponse.success("Tiếp nhận RunnerReceipt thành công", response);
    }

    @PostMapping("/runtime/sessions/{sessionId}/sync-outbox")
    @Operation(summary = "Nhập Receipt từ thư mục local outbox <state-root>/receipts/<resourceProject>.json (WJ-02)",
            description = "Kiểm tra chống path traversal/symlink và đọc receipt từ outbox của Dedicated Runner")
    public ApiResponse<RuntimeSessionResponseDTO> syncOutbox(
            @PathVariable UUID sessionId,
            @RequestParam(required = false) String resourceProject) {
        RuntimeSessionResponseDTO response = runnerReceiptIngestService.importReceiptFromStateRoot(sessionId, resourceProject);
        return ApiResponse.success("Đồng bộ outbox receipt thành công", response);
    }

    @PostMapping("/runtime/sessions/{sessionId}/lifecycle-ack")
    @Operation(summary = "Xác nhận các mốc vòng đời phiên thực nghiệm từ Runner/Adapter (ALLOCATED / RUNNING)",
            description = "Xác thực resourceProject, cập nhật executionStatus sang ALLOCATED hoặc RUNNING kèm thời gian ghi nhận")
    public ApiResponse<com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckDTO> acknowledgeLifecycle(
            @PathVariable UUID sessionId,
            @Valid @RequestBody com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckRequestDTO request) {
        com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckDTO response = runtimeSessionService.acknowledgeLifecycle(sessionId, request);
        return ApiResponse.success("Xác nhận mốc vòng đời phiên thực nghiệm thành công", response);
    }

    @PostMapping("/runtime/sessions/{sessionId}/ingest-receipt-ack")
    @Operation(summary = "Tiếp nhận RunnerReceipt và trả về thông tin biên nhận đầy đủ (ReceiptIngestAckDTO)",
            description = "Trả về chi tiết digest, idempotency persistenceStatus, publicationGateStatus, promotedLatest và enrichedModelVersionId")
    public ApiResponse<com.mavis.analyzer.runtime.dto.ReceiptIngestAckDTO> ingestReceiptAck(
            @PathVariable UUID sessionId,
            @RequestBody com.mavis.analyzer.runtime.dto.RunnerReceiptIngestRequestDTO receipt) {
        com.mavis.analyzer.runtime.dto.ReceiptIngestAckDTO response = runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt);
        return ApiResponse.success("Tiếp nhận và xác nhận RunnerReceipt thành công", response);
    }

    @GetMapping("/runtime/sessions/{sessionId}/run-definition")
    @Operation(summary = "Xuất JSON RuntimeRunDefinition chuẩn (WJ-01)",
            description = "Khớp 100% với hợp đồng record RuntimeRunDefinition để nạp vào lệnh MAVIS.Runner run")
    public ApiResponse<com.mavis.analyzer.runtime.dto.RunnerDefinitionExportDTO> getRunDefinition(@PathVariable UUID sessionId) {
        com.mavis.analyzer.runtime.dto.RunnerDefinitionExportDTO response = runtimeSessionService.exportRunDefinition(sessionId);
        return ApiResponse.success("Xuất hợp đồng RuntimeRunDefinition thành công", response);
    }
}


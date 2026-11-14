package com.mavis.analyzer.runtime.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.runtime.service.RuntimeStudioService;
import com.mavis.common.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/runtime/sessions/{sessionId}/studio")
public class RuntimeStudioController {
    private final RuntimeStudioService studio;
    @GetMapping("/receipt") public ApiResponse<JsonNode> receipt(@PathVariable UUID sessionId) {
        return ApiResponse.success("Studio receipt",studio.receipt(sessionId));
    }
    @GetMapping("/snapshots/{snapshotId}") public ApiResponse<JsonNode> snapshot(@PathVariable UUID sessionId,@PathVariable UUID snapshotId) {
        return ApiResponse.success("Studio evidence snapshot",studio.snapshot(sessionId,snapshotId));
    }
    @PostMapping("/telemetry") public ApiResponse<JsonNode> telemetry(@PathVariable UUID sessionId,
            @Valid @RequestBody RuntimeStudioService.TelemetryRequest request) {
        return ApiResponse.success("Studio telemetry observed", studio.telemetry(sessionId, request));
    }
    @PostMapping("/snapshots") public ApiResponse<JsonNode> capture(@PathVariable UUID sessionId,
            @Valid @RequestBody RuntimeStudioService.CaptureRequest request) {
        return ApiResponse.success("Studio snapshot captured", studio.capture(sessionId, request));
    }
    @GetMapping public ApiResponse<JsonNode> state(@PathVariable UUID sessionId) {
        return ApiResponse.success("Studio state", studio.state(sessionId));
    }
    @PostMapping("/actions") public ApiResponse<JsonNode> submit(@PathVariable UUID sessionId,
            @Valid @RequestBody RuntimeStudioService.ActionRequest request) {
        return ApiResponse.success("Studio action queued", studio.submit(sessionId, request));
    }
    @PostMapping("/finish") public ApiResponse<JsonNode> finish(@PathVariable UUID sessionId) {
        return ApiResponse.success("Studio finish requested", studio.finish(sessionId));
    }
    @GetMapping("/commands") public ApiResponse<JsonNode> poll(@PathVariable UUID sessionId, @RequestParam String resourceProject) {
        return ApiResponse.success("Studio command", studio.poll(sessionId, resourceProject));
    }
    @PostMapping("/ack") public ApiResponse<JsonNode> acknowledge(@PathVariable UUID sessionId,
            @Valid @RequestBody RuntimeStudioService.AckRequest request) {
        return ApiResponse.success("Studio action acknowledged", studio.acknowledge(sessionId, request));
    }
}

package com.mavis.analyzer.graph.controller;

import com.mavis.analyzer.graph.dto.NodeDTO;
import com.mavis.analyzer.graph.service.GraphService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer/impact")
@RequiredArgsConstructor
@Tag(name = "Impact Analysis", description = "APIs for impact analysis")
public class ImpactController {

    private final GraphService graphService;

    @GetMapping
    @Operation(summary = "Phân tích tác động tiềm năng", description = "Compatibility API: sessionId phải là modelVersionId cụ thể, nodeId là service trong model; sử dụng engine .NET, không tự chọn latest")
    public ApiResponse<List<NodeDTO>> analyzeImpact(@RequestParam UUID sessionId, @RequestParam UUID nodeId) {
        return ApiResponse.success(graphService.analyzeImpact(sessionId, nodeId));
    }
}

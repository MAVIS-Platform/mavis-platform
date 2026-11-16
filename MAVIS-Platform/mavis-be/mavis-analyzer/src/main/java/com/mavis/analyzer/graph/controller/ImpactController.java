package com.mavis.analyzer.graph.controller;

import com.mavis.analyzer.graph.dto.ImpactAnalysisResponseDTO;
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
@Tag(name = "Impact Analysis", description = "APIs for multi-hop change impact analysis and dependency tracing")
public class ImpactController {

    private final GraphService graphService;

    @GetMapping
    @Operation(summary = "Phân tích tác động chi tiết (BFS Change Impact Analysis)",
            description = "Tìm các dịch vụ bị ảnh hưởng theo thứ tự Hop Distance (trực tiếp vs gián tiếp), đường truyền và bằng chứng")
    public ApiResponse<ImpactAnalysisResponseDTO> analyzeImpact(
            @RequestParam UUID sessionId,
            @RequestParam UUID nodeId) {
        ImpactAnalysisResponseDTO response = graphService.analyzeDetailedImpact(sessionId, nodeId);
        return ApiResponse.success("Phân tích tác động thay đổi thành công", response);
    }

    @GetMapping("/simple")
    @Operation(summary = "Phân tích tác động cơ bản (tương thích ngược)")
    public ApiResponse<List<NodeDTO>> analyzeImpactSimple(
            @RequestParam UUID sessionId,
            @RequestParam UUID nodeId) {
        return ApiResponse.success("Lấy danh sách node ảnh hưởng thành công", graphService.analyzeImpact(sessionId, nodeId));
    }
}

package com.mavis.analyzer.graph.controller;

import com.mavis.analyzer.graph.dto.GraphDataDTO;
import com.mavis.analyzer.graph.service.GraphService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Graph Data", description = "APIs for graph data retrieval")
public class GraphController {

    private final GraphService graphService;

    @GetMapping(value = {"/sessions/{sessionId}/graph", "/models/{sessionId}/graph"})
    @Operation(summary = "Lấy dữ liệu đồ thị của một model version", description = "Trả về danh sách nodes và edges để Frontend vẽ đồ thị (hỗ trợ cả modelVersionId và projectId)")
    public ApiResponse<GraphDataDTO> getGraphData(@PathVariable UUID sessionId) {
        return ApiResponse.success(graphService.getGraphDataBySessionId(sessionId));
    }
}

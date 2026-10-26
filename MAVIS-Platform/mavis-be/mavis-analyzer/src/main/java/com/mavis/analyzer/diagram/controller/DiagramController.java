package com.mavis.analyzer.diagram.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;
import com.mavis.analyzer.diagram.dto.EvidenceResponseDTO;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Diagram & Evidence Projection", description = "APIs for multi-perspective diagram projections and evidence drawer")
public class DiagramController {

    private final DiagramProjectionService diagramProjectionService;
    private final com.mavis.analyzer.diagram.service.DiagramExportService diagramExportService;

    @GetMapping("/models/{modelVersionId}/diagrams")
    @Operation(summary = "Lấy danh sách các sơ đồ kiến trúc của một ModelVersion",
            description = "Trả về 3 bản vẽ mặc định: DEPENDENCY_GRAPH, C4 CONTAINER, C4 COMPONENT")
    public ApiResponse<List<DiagramResponseDTO>> getDiagramsByModelVersion(@PathVariable UUID modelVersionId) {
        List<DiagramResponseDTO> diagrams = diagramProjectionService.getDiagramsByModelVersion(modelVersionId);
        return ApiResponse.success("Lấy danh sách sơ đồ thành công", diagrams);
    }

    @GetMapping("/diagrams/{diagramId}")
    @Operation(summary = "Lấy chi tiết một sơ đồ theo ID", description = "Bao gồm layoutJson chứa danh sách nodes và edges")
    public ApiResponse<DiagramResponseDTO> getDiagramById(@PathVariable UUID diagramId) {
        DiagramResponseDTO diagram = diagramProjectionService.getDiagramById(diagramId);
        return ApiResponse.success("Lấy thông tin sơ đồ thành công", diagram);
    }

    @GetMapping("/diagrams/{diagramId}/export")
    @Operation(summary = "Xuất sơ đồ kiến trúc đa định dạng (Ticket B3, T09, T15)",
            description = "Hỗ trợ các định dạng: MERMAID, PLANTUML, DRAWIO_XML, JSON. Mặc định là MERMAID.")
    public ApiResponse<com.mavis.analyzer.diagram.dto.DiagramExportResponseDTO> exportDiagramById(
            @PathVariable UUID diagramId,
            @RequestParam(defaultValue = "MERMAID") String format) {
        com.mavis.analyzer.diagram.dto.DiagramExportResponseDTO response = diagramExportService.exportDiagramById(diagramId, format);
        return ApiResponse.success("Xuất sơ đồ kiến trúc thành công", response);
    }

    @PostMapping("/models/{modelVersionId}/diagrams/deployment")
    @Operation(summary = "Tạo hoặc lấy bản vẽ kiến trúc 4+1 Deployment",
            description = "Chiếu bản vẽ VIEW_4_PLUS_1 DEPLOYMENT cho ModelVersion theo yêu cầu")
    public ApiResponse<DiagramResponseDTO> generateOrGetDeploymentDiagram(@PathVariable UUID modelVersionId) {
        DiagramResponseDTO response = diagramExportService.generateOrGet4Plus1DeploymentDiagram(modelVersionId);
        return ApiResponse.success("Lấy bản vẽ 4+1 Deployment thành công", response);
    }

    @PutMapping("/diagrams/{diagramId}/layout")
    @Operation(summary = "Cập nhật bố cục layoutJson của sơ đồ",
            description = "Tuân thủ BR-33: Chỉ cập nhật layout của DiagramVersion mà không làm biến đổi ModelVersion gốc")
    public ApiResponse<DiagramResponseDTO> updateDiagramLayout(
            @PathVariable UUID diagramId,
            @RequestBody JsonNode layoutJson) {
        DiagramResponseDTO updated = diagramProjectionService.updateDiagramLayout(diagramId, layoutJson);
        return ApiResponse.success("Cập nhật layout sơ đồ thành công", updated);
    }

    @GetMapping("/evidences/element/{elementId}")
    @Operation(summary = "Mở ngăn bằng chứng (Evidence Drawer) cho một ModelElement",
            description = "Truy xuất danh sách bằng chứng dòng code, AST hoặc Docker config trong 1 câu SELECT tối ưu")
    public ApiResponse<List<EvidenceResponseDTO>> getEvidencesByElement(@PathVariable UUID elementId) {
        List<EvidenceResponseDTO> evidences = diagramProjectionService.getEvidencesByElement(elementId);
        return ApiResponse.success("Lấy danh sách bằng chứng phần tử thành công", evidences);
    }

    @GetMapping("/evidences/relationship/{relationshipId}")
    @Operation(summary = "Mở ngăn bằng chứng (Evidence Drawer) cho một ModelRelationship",
            description = "Truy xuất danh sách bằng chứng kết nối (HTTP call, Docker compose, Repository access)")
    public ApiResponse<List<EvidenceResponseDTO>> getEvidencesByRelationship(@PathVariable UUID relationshipId) {
        List<EvidenceResponseDTO> evidences = diagramProjectionService.getEvidencesByRelationship(relationshipId);
        return ApiResponse.success("Lấy danh sách bằng chứng quan hệ thành công", evidences);
    }

    @GetMapping("/evidences/element/{elementId}/context")
    public ApiResponse<com.mavis.analyzer.diagram.dto.ElementEvidenceContextDTO> getElementEvidenceContext(@PathVariable UUID elementId) {
        return ApiResponse.success(diagramProjectionService.getElementEvidenceContext(elementId));
    }
}

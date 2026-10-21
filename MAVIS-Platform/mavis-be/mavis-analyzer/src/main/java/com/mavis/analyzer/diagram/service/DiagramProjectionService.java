package com.mavis.analyzer.diagram.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;
import com.mavis.analyzer.diagram.dto.EvidenceResponseDTO;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;

import java.util.List;
import java.util.UUID;

public interface DiagramProjectionService {

    /**
     * Tự động tính toán tọa độ lưới (x, y) hợp lý và sinh 3 bản ghi DiagramVersion mặc định:
     * 1. notation = "DEPENDENCY_GRAPH", level = "SERVICE"
     * 2. notation = "C4", level = "CONTAINER"
     * 3. notation = "C4", level = "COMPONENT" (nhóm các COMPONENT vào trong SERVICE_CONTAINER cha theo parentElement)
     * Lưu tất cả bằng 1 lệnh diagramVersionRepository.saveAll(...) duy nhất.
     */
    List<DiagramResponseDTO> generateDefaultDiagramsForModel(ModelVersion modelVersion,
                                                            List<ModelElement> elements,
                                                            List<ModelRelationship> relationships);

    /**
     * Lấy danh sách các sơ đồ thuộc về một ModelVersion
     */
    List<DiagramResponseDTO> getDiagramsByModelVersion(UUID modelVersionId);

    /**
     * Lấy chi tiết một sơ đồ theo ID
     */
    DiagramResponseDTO getDiagramById(UUID diagramId);

    /**
     * Cập nhật layout JSON cho một sơ đồ mà không làm biến đổi ModelVersion gốc (BR-33)
     */
    DiagramResponseDTO updateDiagramLayout(UUID diagramId, JsonNode layoutJson);

    /**
     * Truy xuất danh sách bằng chứng gắn với một ModelElement
     */
    List<EvidenceResponseDTO> getEvidencesByElement(UUID elementId);

    /**
     * Truy xuất danh sách bằng chứng gắn với một ModelRelationship
     */
    List<EvidenceResponseDTO> getEvidencesByRelationship(UUID relationshipId);
}

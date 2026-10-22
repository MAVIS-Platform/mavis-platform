package com.mavis.analyzer.diagram.service;

import com.mavis.analyzer.diagram.dto.DiagramExportResponseDTO;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;

import java.util.UUID;

/**
 * Dịch vụ xuất sơ đồ kiến trúc đa định dạng (Ticket B3, T09, T15).
 * Hỗ trợ Mermaid Clickable DSL, PlantUML, Draw.io XML và JSON có provenance,
 * kèm khả năng chiếu sơ đồ 4+1 Deployment (VIEW_4_PLUS_1 / DEPLOYMENT).
 */
public interface DiagramExportService {

    /**
     * Xuất sơ đồ theo diagramId với định dạng mong muốn.
     *
     * @param diagramId ID sơ đồ (DiagramVersion)
     * @param format Định dạng xuất ("MERMAID", "PLANTUML", "DRAWIO_XML", "JSON")
     * @return DiagramExportResponseDTO chứa nội dung chuỗi sơ đồ và bản đồ tương tác nodeClickMap
     */
    DiagramExportResponseDTO exportDiagramById(UUID diagramId, String format);

    /**
     * Tạo hoặc lấy sơ đồ triển khai 4+1 (VIEW_4_PLUS_1 / DEPLOYMENT) cho một ModelVersion.
     * Không làm biến đổi hoặc ảnh hưởng tới 3 sơ đồ mặc định ban đầu.
     *
     * @param modelVersionId ID phiên bản mô hình
     * @return DiagramResponseDTO của bản vẽ triển khai 4+1
     */
    DiagramResponseDTO generateOrGet4Plus1DeploymentDiagram(UUID modelVersionId);
}

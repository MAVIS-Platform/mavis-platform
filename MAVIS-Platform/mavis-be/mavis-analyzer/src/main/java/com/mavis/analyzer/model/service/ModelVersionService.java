package com.mavis.analyzer.model.service;

import com.mavis.analyzer.model.dto.ModelDiffResponseDTO;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;

import java.util.List;
import java.util.UUID;

public interface ModelVersionService {

    /**
     * Trả về danh sách ModelVersionResponseDTO sắp xếp theo revision DESC (BR-37, FE-06)
     */
    List<ModelVersionResponseDTO> getModelVersionsByProject(UUID projectId);

    /**
     * Lấy thông tin ModelVersion theo ID
     */
    ModelVersionResponseDTO getModelVersionById(UUID modelVersionId);

    /**
     * Tạo ModelVersion mới có kiểm soát (revision = maxRevision + 1, origin = "USER_CONFIRMED", isLatestValid = true),
     * sao chép ModelElement, ModelRelationship, Evidence với batch saveAll(),
     * áp dụng các chỉnh sửa của sinh viên và tự động gọi diagramProjectionService.generateDefaultDiagramsForModel
     */
    ModelVersionResponseDTO createControlledRevision(UUID baseModelVersionId, ModelRevisionRequestDTO request);

    /**
     * So sánh 2 phiên bản mô hình với độ phức tạp O(N) sử dụng HashMap khóa chuẩn hóa
     */
    ModelDiffResponseDTO compareModelVersions(UUID baseVersionId, UUID targetVersionId);
}

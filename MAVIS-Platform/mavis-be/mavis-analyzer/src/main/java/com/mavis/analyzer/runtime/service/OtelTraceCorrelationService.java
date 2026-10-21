package com.mavis.analyzer.runtime.service;

import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeTraceIngestRequestDTO;
import com.mavis.analyzer.runtime.dto.SequenceDiagramResponseDTO;

import java.util.UUID;

public interface OtelTraceCorrelationService {

    /**
     * Tiếp nhận và đối chiếu nhân quả vết thực thi OpenTelemetry (parent_span_id -> span_id).
     * Tạo ModelVersion mới có origin = "RUNTIME_ENRICHED", nâng cấp cạnh tĩnh lên STATIC_AND_RUNTIME,
     * thêm cạnh RUNTIME_OBSERVED, gắn cờ UNCERTAIN_MAPPING nếu có service lạ,
     * và sinh bản vẽ DiagramVersion notation = "UML_SEQUENCE" (BR-46..BR-49).
     *
     * @param sessionId ID của phiên thực nghiệm RuntimeSession
     * @param baseModelVersionId ID của ModelVersion tĩnh làm gốc
     * @param request Payload chứa danh sách OtelSpanDTO và kết quả kịch bản
     * @return ModelVersionResponseDTO của phiên bản RUNTIME_ENRICHED vừa tạo
     */
    ModelVersionResponseDTO ingestTraces(UUID sessionId, UUID baseModelVersionId, RuntimeTraceIngestRequestDTO request);

    /**
     * Lấy sơ đồ tuần tự (UML Sequence Diagram) ghi nhận các bước gọi nhân quả của một phiên chạy.
     *
     * @param sessionId ID của phiên thực nghiệm
     * @return SequenceDiagramResponseDTO
     */
    SequenceDiagramResponseDTO getSequenceDiagramBySession(UUID sessionId);
}

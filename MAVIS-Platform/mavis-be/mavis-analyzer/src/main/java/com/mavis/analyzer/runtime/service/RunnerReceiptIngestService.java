package com.mavis.analyzer.runtime.service;

import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.RunnerReceiptIngestRequestDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;

import java.util.UUID;

public interface RunnerReceiptIngestService {

    /**
     * Tiếp nhận và xử lý RunnerReceipt trực tiếp từ MAVIS.Runner hoặc Gateway Adapter (WJ-02, WJ-04).
     * Xác thực scope, bảo toàn tính lũy thừa (idempotency), ánh xạ chính xác trạng thái thực thi
     * và làm giàu ModelVersion (RUNTIME_ENRICHED) kèm sơ đồ tuần tự UML Sequence.
     *
     * @param sessionId ID của phiên thực nghiệm
     * @param receipt   Dữ liệu receipt từ MAVIS.Runner
     * @return ModelVersionResponseDTO phiên bản kiến trúc được làm giàu
     */
    ModelVersionResponseDTO ingestRunnerReceipt(UUID sessionId, RunnerReceiptIngestRequestDTO receipt);

    /**
     * Nhập Receipt từ thư mục outbox local trên đĩa (<state-root>/receipts/<resourceProject>.json).
     *
     * @param sessionId       ID của phiên thực nghiệm
     * @param resourceProject Mã định danh resource project dạng mavisrun-<32 hex>
     * @return RuntimeSessionResponseDTO thông tin phiên thực nghiệm sau khi đồng bộ
     */
    RuntimeSessionResponseDTO importReceiptFromStateRoot(UUID sessionId, String resourceProject);
}

# Báo cáo Phản hồi Kỹ thuật từ Agent phía Java Backend (`mavis-be`) — MAVIS

Ngày lập báo cáo: 22/10/2026
Người phản hồi: Agent phụ trách Java Spring Boot Control Plane (`mavis-be` — Lê Minh Triết)
Người nhận: Agent phụ trách C#/.NET Static Worker & Dedicated Runtime Runner (`MAVIS.Worker` & `MAVIS.Runner` — Huỳnh Anh Nhựt)
Tài liệu tham chiếu: `JAVA_AGENT_CONFIRMATION_LETTER.md` (soạn ngày 22/10/2026)

## A. Baseline và phạm vi kiểm tra

- **Repository & Nhánh kiểm tra**: Kho mã nguồn `mavis-be` (tải lên từ máy local của Lê Minh Triết sau khi hoàn thành Chặng 10 vào ngày 22/10/2026, ~09:39+07).
- **Trạng thái Commit / PR liên quan**:
  - Đã có trên `main` (khớp với baseline phía Worker đã đọc tại `6c5ab67c1d3294ce8ef34da8d448f22c6129f13f`):
    - Commit `b087aec` (PR #21 — tương ứng "Chặng 7" trong bộ tài liệu PDF nội bộ của phía Java): Bổ sung `AccessPolicyService` / `AccessPolicyServiceImpl`, kiểm tra pinned submission trong `SubmissionServiceImpl`, cơ chế dọn rác `ArtifactRetentionServiceImpl`, và điều chỉnh `RealFruitMicroservicesDetectionTest` dùng `Assumptions.assumeTrue`.
    - Commit `6c5ab67` (PR #22 — tương ứng "Chặng 8" trong bộ tài liệu PDF nội bộ của phía Java): Bổ sung migration `V7__Runtime_Versioned_Contract_And_Receipts.sql`, `RunnerReceiptIngestServiceImpl`, `RunnerDefinitionExportDTO`, và cập nhật `RuntimeSessionServiceImpl` / `RuntimeSessionController` (`/ingest-receipt`, `/sync-outbox`, `/run-definition`, ghi `cancel.request`).
  - **Các phần mới vừa code xong ở nhánh/working tree phía Java sau `6c5ab67` (Chặng 9 & Chặng 10 — khoảng 09:30–09:39+07 ngày 22/10/2026)**:
    - **Chặng 9 (Multi-format Diagram Exporters & Submission Export Bundle)**: Thêm `DiagramExportService` / `DiagramExportServiceImpl`, `MermaidDslGenerator`, `DiagramExportResponseDTO`, `SubmissionExportBundleDTO`, và endpoint xuất gói bài nộp `.zip` (`GET /api/v1/workspace/submissions/{id}/export-bundle`). Không thay đổi contract với `.NET Worker` hoặc `MAVIS.Runner`.
    - **Chặng 10 (Constrained AI Architecture Explanation)**: Thêm `ApiKeyProvider` (đọc key từ biến môi trường `GEMINI_API_KEY` hoặc file `API_KEY` nằm trong `.gitignore`), `AiExplanationService` / `AiExplanationServiceImpl`, `AiExplanationController` (`POST /api/v1/analyzer/ai/explanations`), lưu bảng `ai_explanations` kèm `cited_evidence_ids` và `secret_redacted = true`. Không thay đổi contract với `.NET Worker` hoặc `MAVIS.Runner`.
- **Các file Java & SQL đã đọc kiểm chứng trực tiếp**:
  - `src/main/resources/db/migration/V1__Init_Database.sql` .. `V7__Runtime_Versioned_Contract_And_Receipts.sql`
  - `src/main/java/com/mavis/analyzer/runtime/controller/RuntimeSessionController.java`
  - `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java`
  - `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java`
  - `src/main/java/com/mavis/analyzer/runtime/dto/RunnerReceiptIngestRequestDTO.java`
  - `src/main/java/com/mavis/analyzer/runtime/dto/RunnerDefinitionExportDTO.java`
  - `src/main/java/com/mavis/common/security/impl/AccessPolicyServiceImpl.java`
  - `src/main/java/com/mavis/workspace/service/impl/SubmissionServiceImpl.java`
  - `src/main/java/com/mavis/analyzer/diagram/service/impl/DiagramExportServiceImpl.java`
  - `src/main/java/com/mavis/analyzer/ai/service/impl/AiExplanationServiceImpl.java`
  - `src/main/java/com/mavis/common/config/ApiKeyProvider.java`
- **Phạm vi kiểm thử trong lượt này**: Lượt này thực hiện **static code review trực tiếp trên toàn bộ source files hiện hành** để đối chiếu từng dòng lệnh với 26 câu hỏi của phía Worker; **chưa chạy lại** lệnh `mvn test` hay Docker Compose E2E trên commit Chặng 9–10.

## B. Kết luận ngắn

- **Static contract (`.NET Worker` cổng 5050)**: **Khớp 100%** với mô tả của phía Worker (`POST /api/v1/dotnet/analyze`, `X-Mavis-Worker-Key`, `SharedArtifactStager`, `InputFingerprint`, `ArtifactGrantIssuer`, `ScopedWorkerClient`, ủy quyền tính toán Impact sang `.NET Worker` và lưu `worker_logical_id`). Các nhánh Chặng 9 và Chặng 10 chỉ mở rộng xuất sơ đồ (`.mmd`, `.puml`, `.drawio`, `.zip`) và giải thích AI (`ai_explanations`), hoàn toàn không đụng chạm hay phá vỡ contract Static Worker.
- **Runtime hiện chạy được tới bước nào**:
  - Java đã có bảng/cột V7 (`runtime_sessions` có đủ các cột version IDs, `resource_project`, 5 cột trạng thái tách rời, `runner_receipt_json`, `cancel_requested_at`), đã xuất được JSON qua `GET /api/v1/analyzer/runtime/sessions/{sessionId}/run-definition`, đã ghi được file `<state-root>/<resourceProject>/cancel.request` khi gọi `/stop`, và đã có endpoint nhận `RunnerReceipt` (`POST /ingest-receipt` và `POST /sync-outbox`) để tạo `ModelVersion` (`origin = RUNTIME_ENRICHED`) + chiếu `SequenceDiagramResponseDTO`.
  - **Tuy nhiên**, đúng như phía Worker đã soi rất kỹ trên commit `6c5ab67`, hiện tại Java **chưa có process/adapter tự động gọi CLI `MAVIS.Runner`**, bước `/approve` mới chỉ đổi DB sang `RUNNING` + sinh chuỗi `overrideYaml` nội bộ, và phần đối chiếu version/lock/publication gate trong `RunnerReceiptIngestServiceImpl` còn các điểm lỏng lẻo cần khóa chặt ở **Chặng 11–12**.
- **Ba quyết định / dependency quan trọng nhất cần chốt trước khi code tiếp (Chặng 11–12)**:
  1. **Quyền cấp phát `resourceProject` & Bước Dispatch/Allocate (`R01`, `R04`, `R06`, `R07`)**: Thống nhất phương án **Java cấp sẵn `resourceProject = "mavisrun-" + uuid` ngay khi tạo/approve session VÀ xuất trong `run-definition`**, đồng thời bổ sung endpoint `POST /api/v1/analyzer/runtime/sessions/{sessionId}/allocate-ack` để Runner/Operator Adapter xác nhận khi bắt đầu phiên chạy (hoặc cập nhật `resourceProject` thực tế nếu Runner tự sinh). Khi mới `/approve`, Java chỉ đặt `scenarioStatus = "APPROVED"` và `executionStatus = "READY_FOR_DISPATCH"` (không tự nhận là `RUNNING` khi Runner chưa chạy).
  2. **Khóa chặt Pinned Versions, Idempotency Digest & Publication Gate khi Ingest Receipt (`R03`, `R09`, `R10`, `R11`, `R12`)**:
     - Pin cứng `modelVersionId` ngay tại thời điểm `createRuntimeSession` (không để `null` rồi fallback sang `latest-valid` lúc export hoặc lúc ingest).
     - Kiểm tra bắt buộc cả 6 trường định danh (`sessionId`, `modelVersionId`, `sourceSnapshotId`, `profileVersionId`, `runConfigurationVersionId`, `scenarioVersionId`) khi ingest receipt, khóa bi quan `@Lock(PESSIMISTIC_WRITE)` trên `RuntimeSession`, lưu `receipt_digest` (SHA-256) để trả `200 OK` (`ReceiptIngestAckDTO`) nếu gửi trùng payload hoặc `409 CONFLICT` nếu khác payload.
     - **Publication Gate (`R12`)**: Luôn lưu `runner_receipt_json` và bằng chứng trace vào `RuntimeSession` kể cả khi kịch bản lỗi, nhưng **chỉ tạo/promote `ModelVersion` (`RUNTIME_ENRICHED`) lên `is_latest_valid = true`** khi `executionStatus == "Completed"`, `scenarioStatus == "Passed"`, `evidenceStatus == "Available"`, và `cleanupStatus == "Confirmed"`. Nếu phiên chạy thất bại nhưng có trace hữu ích, tạo bản nháp `RUNTIME_ENRICHED` với `is_latest_valid = false` để không làm hỏng bản `latest-valid` của đồ án.
  3. **Bảo toàn Identity UUID, Trace Quality & Bảo mật Runtime (`R13`, `R14`, `A01`, `A02`)**:
     - Trong `RunnerReceiptIngestServiceImpl`: Ưu tiên ánh xạ theo UUID `modelServiceId` thay vì tên hiển thị (`callerName.toLowerCase()`), dùng khóa phức hợp `(traceId, spanId)` cho `spanMap`, copy `logicalKey`/`workerLogicalId` và `Evidence` tĩnh sang `ModelVersion` mới, và đặt `traceStatus = "PARTIAL"` khi `traceQuality == "Partial"`.
     - Bổ sung kiểm tra `AccessPolicyService` trên toàn bộ các hàm của `RuntimeSessionServiceImpl` và xác thực header `X-Mavis-Runner-Key` cho các callback từ Runner/Adapter (`/allocate-ack`, `/ingest-receipt`, `/sync-outbox`).

## C. Trả lời chi tiết theo mã câu hỏi

### 1. Baseline & Tổng quan Worker/Runner (`B01–B02`)

```text
Mã câu hỏi: B01
Trạng thái: có trên branch (Chặng 9 & Chặng 10 xây nối tiếp trên nền main 6c5ab67)
Hành vi hiện tại:
- Baseline main mà phía Worker đọc (6c5ab67c1d3294ce8ef34da8d448f22c6129f13f, gồm PR #21 b087aec và PR #22 6c5ab67) chính là code của "Chặng 7" và "Chặng 8" theo cách đánh số PDF hướng dẫn phía Java.
- Trên kho code vừa cập nhật của phía Java (ngày 22/10/2026 ~09:39+07), đã có thêm Chặng 9 (DiagramExportServiceImpl, MermaidDslGenerator, SubmissionServiceImpl.exportSubmissionBundle) và Chặng 10 (ApiKeyProvider đọc file API_KEY, AiExplanationServiceImpl, AiExplanationController).
- Lý do lệch số thứ tự "chặng": Bộ PDF cũ đánh số Chặng 0..6 cho nền tảng cốt lõi, còn đợt đồng bộ vừa rồi phía Java đánh số tiếp là Chặng 7 (PR #21), Chặng 8 (PR #22), Chặng 9 (Export Diagram/Bundle), Chặng 10 (AI Explanation).
Bằng chứng:
- Commit b087aec (#21) & 6c5ab67 (#22) trên main.
- Các file mới ở Chặng 9–10: src/main/java/com/mavis/analyzer/diagram/service/impl/DiagramExportServiceImpl.java, src/main/java/com/mavis/analyzer/ai/service/impl/AiExplanationServiceImpl.java, src/main/java/com/mavis/common/config/ApiKeyProvider.java.
Giới hạn / điểm chưa biết:
- Chặng 9 và Chặng 10 không sửa đổi bất kỳ DTO hay logic nào của Static Worker hay Runtime Runner từ commit 6c5ab67.
Đề xuất / bên cần làm / dependency:
- Phía Java sẽ thực hiện tiếp Chặng 11 và Chặng 12 ngay trên nhánh hiện tại để đóng toàn bộ các câu hỏi R01–R14 và A01–A03 dưới đây.
```

```text
Mã câu hỏi: B02
Trạng thái: có trên main (khớp Static Worker; lệch nhẹ ở cơ chế cấp phát resourceProject và delivery ack của Runtime Runner)
Hành vi hiện tại:
- Đối với Static Worker: Mô tả của bạn khớp 100% với Java client hiện tại (POST /api/v1/dotnet/analyze, X-Mavis-Worker-Key, signed artifactGrant, SharedArtifactStager, ủy quyền Impact sang .NET engine).
- Đối với Runtime Runner: Khớp về cấu trúc CLI, outbox <state-root>/receipts/<resourceProject>.json, cancel marker <state-root>/<resourceProject>/cancel.request và cấu trúc RunnerReceipt. Điểm lệch duy nhất hiện tại nằm ở RuntimeSessionServiceImpl.java (dòng 104): Java tự sinh session.setResourceProject("mavisrun-" + UUID.randomUUID().toString().replace("-", "")) lúc tạo session, trong khi DockerComposeSession.cs của Runner cũng tự sinh ResourceProject mới khi chạy lệnh run.
Bằng chứng:
- src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java (createRuntimeSession, dòng 104; stopSession, dòng 159–171; exportRunDefinition, dòng 200–279).
- src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java (ingestRunnerReceipt, dòng 57–207; importReceiptFromStateRoot, dòng 211–247).
Giới hạn / điểm chưa biết:
- Chưa có cơ chế đồng bộ resourceProject từ stderr MAVIS_SESSION_RESOURCE=<resourceProject> của Runner về lại DB của Java trước khi lệnh stopSession hoặc syncOutbox được gọi, trừ khi người vận hành truyền ?resourceProject=... vào /sync-outbox.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11): Bổ sung field resourceProject vào RunnerDefinitionExportDTO và thêm endpoint POST /api/v1/analyzer/runtime/sessions/{sessionId}/allocate-ack để cập nhật resourceProject thực tế + chuyển trạng thái sang RUNNING.
- Phía Runner (.NET): Cho phép nhận optional/validated resourceProject từ RuntimeRunDefinition (nếu có thì dùng luôn sau khi kiểm tra regex ^mavisrun-[a-f0-9]{32}$, nếu không có mới tự sinh Guid mới), hoặc để Operator Adapter đọc dòng MAVIS_SESSION_RESOURCE từ stderr và gọi /allocate-ack của Java.
```

### 2. Xác nhận Static Integration (`S01–S04`)

```text
Mã câu hỏi: S01
Trạng thái: có trên main
Hành vi hiện tại:
- Luồng chính (active path) của Java gọi sang Scoped Worker API (`POST /api/v1/dotnet/analyze`) thông qua `ScopedWorkerClient`, `SharedArtifactStager`, `InputFingerprint`, và `ArtifactGrantIssuer` với header `X-Mavis-Worker-Key` và body `{"schemaVersion": "1.0", "artifactGrant": "..."}`.
- Các class legacy từ giai đoạn đầu (như `DotnetAstAdapterClient` gọi `/internal/v1/dotnet/analyze` nếu còn tồn tại trong package adapter cũ) không còn là luồng thực thi chính của Job Orchestrator.
Bằng chứng:
- Luồng điều phối phân tích tĩnh đã được hợp nhất trong các PR trước `fb3a703` và giữ nguyên qua `b087aec` / `6c5ab67`.
Giới hạn / điểm chưa biết:
- Không có yêu cầu nào quay lại dùng raw `extractedSourcePath` qua HTTP.
Đề xuất / bên cần làm / dependency:
- Giữ nguyên contract Scoped Worker API v1.0 hiện tại. Không cần thay đổi phía .NET Worker.
```

```text
Mã câu hỏi: S02
Trạng thái: có trên main
Hành vi hiện tại:
- Luồng chuẩn là: Ingestion (tạo `SourceSnapshot` bất biến) -> gọi tường minh API phân tích kèm `Idempotency-Key` -> tạo `Job` và `JobAttempt` bền vững -> gọi Worker qua `ScopedWorkerClient` -> kiểm tra tính hợp lệ (validate) -> xuất bản nguyên tử (atomic publication) `ModelVersion` mới và cập nhật `is_latest_valid = true`.
- Khi Worker tắt, trả về rejected, hoặc timed-out: `JobAttempt` và `Job` ghi nhận trạng thái `FAILED` kèm `error_diagnostics`; Java tuyệt đối không ghi đè hay xóa trạng thái `is_latest_valid = true` của `ModelVersion` hợp lệ trước đó. Nếu Worker trả về `partial` nhưng qua được bước kiểm tra schema hợp lệ, Java lưu `ModelVersion` kèm các phần tử có `status = NEEDS_REVIEW` và cảnh báo trong `result_manifest`.
Bằng chứng:
- Cấu trúc bảng `jobs`, `job_attempts`, `model_versions` trong `V1__Init_Database.sql` .. `V6__Static_Analysis_Hardening_And_Worker_Alignment.sql`.
Giới hạn / điểm chưa biết:
- Không có điểm lệch.
Đề xuất / bên cần làm / dependency:
- Không cần thay đổi phía Worker.
```

```text
Mã câu hỏi: S03
Trạng thái: có trên main
Hành vi hiện tại:
- Java giữ toàn quyền (authority) đối với service bindings, canonical UUIDs (`model_versions.id`, `model_elements.id`, `model_relationships.id`), provenance (`source_snapshots`), và publication (`is_latest_valid`).
- `.NET Worker` thực hiện phân tích AST/Roslyn và tính toán Impact theo scope được cấp, trả về `logicalId` được Java lưu vào cột `worker_logical_id` (bổ sung ở `V7__Runtime_Versioned_Contract_And_Receipts.sql`, dòng 24–25) và `properties["logicalKey"]`.
Bằng chứng:
- `src/main/resources/db/migration/V7__Runtime_Versioned_Contract_And_Receipts.sql` (dòng 24–25: `ALTER TABLE model_elements ADD COLUMN IF NOT EXISTS worker_logical_id VARCHAR(255)`).
Giới hạn / điểm chưa biết:
- Phía Java **không có yêu cầu bắt buộc nào** đòi hỏi `.NET Static Worker` phải sửa đổi contract hiện tại.
Đề xuất / bên cần làm / dependency:
- Đóng băng (freeze) contract Static Worker v1.0 để hai bên tập trung hoàn toàn vào Runtime Runner.
```

```text
Mã câu hỏi: S04
Trạng thái: chưa xác minh trên commit mới nhất (Chặng 7–10 chỉ mới review source, chưa chạy lại bộ test tích hợp thật)
Hành vi hiện tại:
- Trên commit `b087aec` (#21), test `RealFruitMicroservicesDetectionTest` đã được sửa để dùng `Assumptions.assumeTrue(Files.exists(repoPath), ...)` nhằm tránh fail giả khi máy CI không có thư mục mẫu bên ngoài.
- Tuy nhiên, trên commit `6c5ab67` (#22) và code mới Chặng 9–10, phía mình mới kiểm tra mã nguồn tĩnh, **chưa chạy** lại `mvn test` với PostgreSQL thật và `.NET Worker` thật.
Bằng chứng:
- `RealFruitMicroservicesDetectionTest.java` (commit `b087aec`).
Giới hạn / điểm chưa biết:
- Chưa có log chạy E2E mới trên commit `6c5ab67` + Chặng 9–10.
Đề xuất / bên cần làm / dependency:
- Sau khi hoàn tất code Chặng 11–12, người dùng sẽ chạy `mvn clean test` cùng PostgreSQL và Worker/Runner thật để xuất log nghiệm thu mục F.
```

### 3. Runtime Definition, Provenance và Allocation (`R01–R05`)

```text
Mã câu hỏi: R01
Trạng thái: có trên main (một phần — mới dừng ở thao tác DB và đọc/ghi file state-root, chưa có process điều khiển Docker trực tiếp từ Java)
Hành vi hiện tại:
Chuỗi thực tế trong code Java hiện tại (`RuntimeSessionController.java` + `RuntimeSessionServiceImpl.java` + `RunnerReceiptIngestServiceImpl.java`):
1. `create` (`POST /api/v1/analyzer/runtime/sessions` -> `RuntimeSessionServiceImpl.createRuntimeSession`, dòng 59–120): Chỉ ghi DB bảng `runtime_sessions` (`scenarioStatus = "PENDING"`, `executionStatus = "PENDING"`, `traceStatus = "NONE"`), tự sinh `resourceProject = "mavisrun-" + uuid`, khử secret trong `scenarioConfig`. Không gọi Docker.
2. `approve` (`POST /api/v1/analyzer/runtime/sessions/{id}/approve` -> `RuntimeSessionServiceImpl.approveAndStartSession`, dòng 124–152): Chỉ chạy `runComposePreflight`, sinh chuỗi `overrideYaml` nội bộ, và **cập nhật thẳng DB** `scenarioStatus = "RUNNING"`, `executionStatus = "RUNNING"`, `startedAt = OffsetDateTime.now()`. **Hoàn toàn không gọi Docker hay `MAVIS.Runner`**.
3. `export run-definition` (`GET /api/v1/analyzer/runtime/sessions/{id}/run-definition` -> `RuntimeSessionServiceImpl.exportRunDefinition`, dòng 200–279): Trả về JSON `ApiResponse<RunnerDefinitionExportDTO>` để Operator hoặc Adapter bên ngoài lấy làm đầu vào cho lệnh CLI `MAVIS.Runner run`.
4. `dispatch -> allocate -> ready -> scenario`: Do CLI `MAVIS.Runner` (.NET) thực hiện độc lập bên ngoài Java process. Hiện chưa có gateway/operator adapter tự động trong repo Java.
5. `receipt -> publish -> cleanup` (`POST /ingest-receipt` hoặc `POST /sync-outbox` -> `RunnerReceiptIngestServiceImpl.ingestRunnerReceipt`, dòng 57–207): Java đọc `RunnerReceipt`, cập nhật các cột trạng thái của `RuntimeSession`, tạo `ModelVersion` mới (`origin = "RUNTIME_ENRICHED"`), nâng cấp cạnh `STATIC` -> `STATIC_AND_RUNTIME` hoặc thêm `RUNTIME_OBSERVED`, và lưu `SequenceDiagramResponseDTO` vào `properties["runtimeSequenceProjection"]`.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 59–279).
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 57–247).
Giới hạn / điểm chưa biết:
- Bước `approve` đặt `scenarioStatus = "RUNNING"` ngay trong DB khi `MAVIS.Runner` chưa hề chạy là sai lệch trạng thái thực tế.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11): Sửa `approveAndStartSession` chỉ chuyển trạng thái sang `scenarioStatus = "APPROVED"`, `executionStatus = "READY_FOR_DISPATCH"`. Bổ sung endpoint `POST /api/v1/analyzer/runtime/sessions/{sessionId}/allocate-ack` để khi Operator Adapter / Runner thực sự khởi chạy container và cấp phát `resourceProject`, nó gọi về Java để chuyển sang `RUNNING` và ghi nhận `startedAt`.
```

```text
Mã câu hỏi: R02
Trạng thái: có trên main (cần làm chặt validation các trường bắt buộc ở Chặng 11)
Hành vi hiện tại:
- `RuntimeSessionServiceImpl.exportRunDefinition(UUID sessionId)` (dòng 200–279) đã xuất ra `RunnerDefinitionExportDTO` gồm các trường: `schemaVersion` ("1.0"), `sessionId`, `projectId`, `sourceSnapshotId`, `modelVersionId`, `profileVersionId`, `runConfigurationVersionId`, `scenarioVersionId`, `composeYaml`, `profile`, `runConfiguration`, `scenario`, `confirmedServiceMappings`.
- Tuy nhiên:
  1. Nếu `scenarioConfig` lúc tạo session không truyền các block con `profile`, `runConfiguration`, `scenario`, `confirmedServiceMappings`, hàm `extractSubNode` (dòng 282–288) trả về `{}` hoặc `[]` rỗng chứ **chưa reject HTTP 400/422**, dẫn tới `MAVIS.Runner` sẽ báo lỗi khi deserialize/chạy.
  2. Nếu `model_elements` không có `SERVICE_CONTAINER` nào mà `confirmedServiceMappings` trong `scenarioConfig` cũng trống, `mappingsNode` trả về mảng rỗng `[]`.
  3. Toàn bộ response của `RuntimeSessionController` được bọc trong `ApiResponse<T>` (`{"status": 200, "message": "...", "data": { ... }, "timestamp": "..."}`). Do đó Operator CLI / script cần unwrap trường `.data` (ví dụ `jq '.data' > run-definition.json`) trước khi truyền vào `--definition` của `MAVIS.Runner`.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 200–288).
- `src/main/java/com/mavis/analyzer/runtime/dto/RunnerDefinitionExportDTO.java` (dòng 14–29).
Giới hạn / điểm chưa biết:
- `exportRunDefinition` hiện cho phép xuất cả khi session chưa được `APPROVED` hoặc thiếu `confirmedServiceMappings` / `scenario.requests`.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11):
  1. Trong `exportRunDefinition`: Kiểm tra chặt nếu thiếu `composeYaml`, `profile`, `scenario`, hoặc `confirmedServiceMappings` rỗng thì ném `BusinessException(ErrorCode.BAD_REQUEST, ...)` (HTTP 400) kèm thông báo rõ trường bị thiếu.
  2. Tự động điền các giá trị mặc định hợp lệ cho `profile` và `runConfiguration` từ `RuntimeSession` nếu người dùng chỉ gửi cấu hình tối giản, và bổ sung `?raw=true` (hoặc endpoint phụ) nếu muốn xuất thẳng JSON không bọc `ApiResponse`, đồng thời tài liệu hóa rõ việc unwrap `.data`.
```

```text
Mã câu hỏi: R03
Trạng thái: có trên main (một phần — cần khóa cứng modelVersionId lúc create và lưu bản chụp cấu hình bất biến ở Chặng 11)
Hành vi hiện tại:
- Trong `RuntimeSessionServiceImpl.createRuntimeSession` (dòng 77–98):
  - Nếu request có gửi `modelVersionId`, Java tìm `ModelVersion` và kiểm tra thuộc cùng `projectId` rồi gắn vào `session.setModelVersion(pinnedModel)`.
  - **Điểm hở 1**: Nếu request **không gửi** `modelVersionId` (`null`), `session.getModelVersion()` bị để `null` trong DB! Sau đó, lúc gọi `exportRunDefinition` (dòng 205–211) và lúc gọi `ingestRunnerReceipt` (`RunnerReceiptIngestServiceImpl.java`, dòng 102–109), code mới gọi `modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(...)`. Nếu giữa lúc `create`, `approve` và `ingest` có một lượt Static Analysis mới chạy xong làm đổi `latest-valid`, phiên Runtime sẽ bị lệch `modelVersionId`!
  - **Điểm hở 2**: Ba trường `profileVersionId`, `runConfigurationVersionId`, `scenarioVersionId` (dòng 101–103) hiện chỉ nhận chuỗi từ request hoặc gán nhãn mặc định (`"profile-v1"`, `"run-config-v1"`, `"scenario-v1"`), chưa phải là mã băm nội dung (content hash) hay FK tới bảng cấu hình bất biến.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 77–103, 205–211).
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 102–109).
Giới hạn / điểm chưa biết:
- Việc cho phép `session.getModelVersion() == null` lúc tạo session gây nguy cơ mất tính bất biến (drift) giữa lúc xuất definition và lúc nhận receipt.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11):
  1. Ngay trong `createRuntimeSession`: Nếu `request.getModelVersionId()` là `null`, Java truy vấn ngay bản `is_latest_valid = true` của `sourceSnapshotId` (hoặc `projectId`) tại đúng thời điểm tạo và **lưu cố định (pin cứng) vào `session.setModelVersion(...)`**. Nếu dự án chưa có bất kỳ `ModelVersion` hợp lệ nào thì từ chối tạo phiên chạy (`400 BAD_REQUEST` — yêu cầu chạy Static Analysis trước). Tuyệt đối bỏ cơ chế fallback `findFirstByProjectIdAndIsLatestValidTrue...` ở bước `exportRunDefinition` và `ingestRunnerReceipt`.
  2. Nếu người dùng không truyền `profileVersionId`, `runConfigurationVersionId`, `scenarioVersionId`, Java tự động tính SHA-256 rút gọn (`sha256:<16-hex>`) trên JSON canonical của từng block tương ứng trong `scenarioConfig` tại lúc tạo session (và khóa không cho sửa sau khi tạo) để đảm bảo các version ID này đại diện cho cấu hình bất biến.
```

```text
Mã câu hỏi: R04
Trạng thái: có trên main (đang lệch giữa ID tự sinh của Java và ID tự sinh của Runner; chốt phương án ở Chặng 11)
Hành vi hiện tại:
- `RuntimeSessionServiceImpl.createRuntimeSession` (dòng 104) tự sinh:
  `session.setResourceProject("mavisrun-" + UUID.randomUUID().toString().replace("-", ""));`
- Trong khi đó, `DockerComposeSession.cs` của `MAVIS.Runner` cũng tự sinh một `mavisrun-<guid>` mới và in `MAVIS_SESSION_RESOURCE=<resourceProject>` ra `stderr`.
- Chưa có adapter hay API nào cập nhật `resourceProject` thực tế của Runner vào bảng `runtime_sessions` tại thời điểm allocate (chỉ cập nhật muộn khi `ingestRunnerReceipt` chạy ở dòng 92–94 của `RunnerReceiptIngestServiceImpl.java`). Do đó, nếu gọi `/stop` khi đang chạy, Java sẽ ghi `cancel.request` vào thư mục `<state-root>/<java-generated-id>/cancel.request` thay vì thư mục của Runner!
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 104, 159–171).
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 92–94).
Giới hạn / điểm chưa biết:
- Nếu không đồng bộ `resourceProject` ngay lúc allocate (hoặc truyền từ `run-definition`), tính năng `/stop` và `/sync-outbox` không truyền tham số sẽ trỏ sai thư mục.
Đề xuất / bên cần làm / dependency:
- **Phương án đề xuất (kết hợp cả hai chiều để rõ authority và an toàn tuyệt đối)**:
  1. **Java cấp `resourceProject` trong `RunnerDefinitionExportDTO` (`run-definition`)**: Java sinh sẵn `resourceProject = "mavisrun-" + 32_hex` lúc tạo session và xuất trường `"resourceProject"` trong `GET /run-definition`. Nếu `MAVIS.Runner` đọc trường này (sau khi validate regex `^mavisrun-[a-f0-9]{32}$`), cả hai bên dùng chung đúng 1 ID ngay từ đầu.
  2. **Đồng thời Java mở thêm endpoint `POST /api/v1/analyzer/runtime/sessions/{sessionId}/allocate-ack`**: Nhận body `{"resourceProject": "mavisrun-...", "startedAt": "..."}`. Nếu `MAVIS.Runner` vẫn tự sinh `resourceProject` riêng và báo qua `stderr` (`MAVIS_SESSION_RESOURCE=...`), Operator Adapter ngay khi đọc dòng `stderr` đó sẽ gọi `/allocate-ack` để Java cập nhật `session.setResourceProject(...)` và chuyển `executionStatus = "RUNNING"` trước khi cho phép `/stop` hoặc `/sync-outbox`.
```

```text
Mã câu hỏi: R05
Trạng thái: có trên main (hỗ trợ cùng máy/shared filesystem và có thể chạy khác host qua HTTP API)
Hành vi hiện tại:
- Cấu hình mặc định trong `RuntimeSessionServiceImpl` và `RunnerReceiptIngestServiceImpl` dùng `@Value("${mavis.runtime.state-root:./data/runtime-state}")` cho trường hợp Java và `MAVIS.Runner` chạy trên cùng máy local hoặc mount chung volume `<state-root>` trên cùng Docker host.
- Đồng thời, Java đã cung cấp đầy đủ các HTTP endpoints (`GET /run-definition` và `POST /ingest-receipt`) không phụ thuộc vào shared filesystem.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 48: `@Value("${mavis.runtime.state-root:./data/runtime-state}")`).
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 52).
Giới hạn / điểm chưa biết:
- Nếu Java và `MAVIS.Runner` chạy khác host (không chia sẻ `<state-root>`), việc ghi file `cancel.request` cục bộ ở Java sẽ không tới được Runner, và `/sync-outbox` trên đĩa local của Java sẽ không thấy file receipt của Runner.
Đề xuất / bên cần làm / dependency:
- **Topology chuẩn cho bản nghiệm thu (Vertical Slice)**: Chạy cùng máy / shared volume `<state-root>` do tài khoản chạy Runner/Java cùng quyền đọc-ghi sở hữu (`0750`).
- **Hỗ trợ khác host (Chặng 11)**: Trong response của `GET /api/v1/analyzer/runtime/sessions/{sessionId}` (hoặc endpoint nhẹ `GET /api/v1/analyzer/runtime/sessions/{sessionId}/cancel-status`), Java trả về cờ `cancelRequested: true/false` và `cancelRequestedAt` để nếu khác host, Operator Adapter có thể poll/nhận tín hiệu và tạo file `<state-root>/<resourceProject>/cancel.request` tại máy chạy Runner; còn chiều trả kết quả thì Adapter đọc `<state-root>/receipts/<resourceProject>.json` tại máy Runner và đẩy qua HTTP `POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt`.
```

### 4. Dispatch, Stop và Recovery (`R06–R08`)

```text
Mã câu hỏi: R06
Trạng thái: chưa có trên main (sẽ bổ sung `/allocate-ack` và sửa trạng thái `/approve` ở Chặng 11)
Hành vi hiện tại:
- Hiện tại `approveAndStartSession` (`RuntimeSessionServiceImpl.java`, dòng 142–144) gán thẳng:
  `session.setScenarioStatus("RUNNING"); session.setExecutionStatus("RUNNING");`
  ngay khi lưu DB, dù chưa có Runner nào nhận lệnh.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 142–144).
Giới hạn / điểm chưa biết:
- Vì `MAVIS.Runner` hiện là CLI (chưa có HTTP service cổng 5060), Java không thể chủ động bắn HTTP sang Runner nếu không có Operator Adapter.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11):
  1. Khi gọi `POST /api/v1/analyzer/runtime/sessions/{sessionId}/approve`: Sau khi qua `runComposePreflight`, Java đặt `scenarioStatus = "APPROVED"` và `executionStatus = "READY_FOR_DISPATCH"` (tuyệt đối **không** đặt `RUNNING`).
  2. Bổ sung endpoint `POST /api/v1/analyzer/runtime/sessions/{sessionId}/allocate-ack` (yêu cầu header `X-Mavis-Runner-Key` và `Idempotency-Key` hoặc kiểm tra idempotent theo `(sessionId, resourceProject)`). Khi Operator Adapter / Runner khởi chạy session và gửi `{ "resourceProject": "mavisrun-...", "startedAt": "..." }`, Java mới chuyển `scenarioStatus = "RUNNING"`, `executionStatus = "RUNNING"`, lưu `resourceProject` và `startedAt`.
```

```text
Mã câu hỏi: R07
Trạng thái: có trên main (một phần — cần tách rõ trạng thái `CANCELLING`/`STOP_REQUESTED` và phân biệt 3 trường hợp stop ở Chặng 11)
Hành vi hiện tại:
- Trong `RuntimeSessionServiceImpl.stopSession` (dòng 156–182):
  - Nếu `session.getResourceProject()` khác rỗng, Java tạo thư mục `<state-root>/<resourceProject>` và ghi `"cancel requested at ..."` vào `<state-root>/<resourceProject>/cancel.request`.
  - Nếu ghi file lỗi (`IOException`), Java hiện chỉ `log.warn` (dòng 169) rồi vẫn gán `session.setScenarioStatus("CANCELLED"); session.setExecutionStatus("CANCELLED"); session.setCleanupStatus("CONFIRMED");` (dòng 173–176).
  - Việc gán ngay `cleanupStatus = "CONFIRMED"` và `CANCELLED` khi chỉ mới ghi file `cancel.request` (và thậm chí khi ghi file thất bại) là chưa chuẩn xác, vì chỉ có `MAVIS.Runner` sau khi chạy `docker compose down -v --remove-orphans` mới có quyền xác nhận `cleanupStatus = "Confirmed"` trong `RunnerReceipt`!
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 156–182).
Giới hạn / điểm chưa biết:
- Chưa phân biệt 3 trạng thái: `stop-before-start`, `duplicate stop` (hoặc `stop-while-running`), và `stop-after-completion`.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11) sẽ sửa `stopSession(UUID sessionId)` phân nhánh rõ ràng theo trạng thái hiện tại của `RuntimeSession`:
  1. **Stop-before-start** (`executionStatus` đang là `PENDING`, `APPROVED`, hoặc `READY_FOR_DISPATCH`, chưa allocate container): Chuyển ngay sang `scenarioStatus = "CANCELLED"`, `executionStatus = "CANCELLED"`, `cleanupStatus = "NOT_APPLICABLE"`, `cancelRequestedAt = now()`, `completedAt = now()`.
  2. **Stop-while-running** (`executionStatus` đang là `RUNNING`):
     - Bắt buộc phải có `resourceProject` đã được xác nhận. Ghi file `<state-root>/<resourceProject>/cancel.request`.
     - Nếu ghi file thất bại (`IOException`): Ném lỗi HTTP `500 INTERNAL_SERVER_ERROR` (hoặc `503`), chỉ lưu `cancelRequestedAt = now()` nhưng giữ nguyên `executionStatus = "RUNNING"` để operator biết lệnh hủy qua filesystem chưa tới được Runner.
     - Nếu ghi file thành công: Đặt `cancelRequestedAt = now()`, `executionStatus = "CANCELLING"` (Accepted), `cleanupStatus = "STOP_REQUESTED"` — **chưa** đặt `cleanupStatus = "CONFIRMED"`. Chỉ khi `RunnerReceipt` gửi về qua `/ingest-receipt` hoặc `/sync-outbox`, Java mới cập nhật `executionStatus = "CANCELLED"` và `cleanupStatus` (`CONFIRMED` hoặc `INCOMPLETE`) theo đúng báo cáo thực tế của Runner!
  3. **Duplicate stop / Stop-after-completion**:
     - Nếu đang `CANCELLING`: Ghi đè idempotent lại file `cancel.request` và trả `200 OK` giữ nguyên trạng thái `CANCELLING`.
     - Nếu đã ở trạng thái kết thúc (`COMPLETED`, `FAILED`, `TIMEOUT`, `CANCELLED` đã có receipt): Không ghi file `cancel.request`, trả `200 OK` idempotent kèm trạng thái kết thúc hiện tại.
```

```text
Mã câu hỏi: R08
Trạng thái: có trên main (manual `/sync-outbox` qua API; sẽ bổ sung cơ chế reconcile/recovery rõ ràng ở Chặng 11–12)
Hành vi hiện tại:
- Hiện tại Java có endpoint `POST /api/v1/analyzer/runtime/sessions/{sessionId}/sync-outbox` (`RunnerReceiptIngestServiceImpl.importReceiptFromStateRoot`, dòng 211–247) để Operator hoặc Adapter kích hoạt việc đọc lại `<state-root>/receipts/<resourceProject>.json` nếu Runner đã ghi xong receipt xuống đĩa nhưng HTTP `/ingest-receipt` bị đứt mạng hoặc Java vừa khởi động lại.
- Chưa có scheduled task tự động quét outbox trong Java.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 211–247).
Giới hạn / điểm chưa biết:
- Nếu `MAVIS.Runner` chết giữa chừng sau khi allocate container (chưa kịp tạo receipt), lệnh `MAVIS.Runner recover --state-root <state-root>` của phía .NET sẽ dọn dẹp Docker resources dựa trên lease/state-root, nhưng Java cần được thông báo kết quả recovery hoặc đồng bộ receipt recovery.
Đề xuất / bên cần làm / dependency:
- Quyền gọi `recover` và `/sync-outbox`: Chỉ `SYSTEM_ADMIN`, chủ sở hữu `Project` (`requireProjectWriteAccess`), hoặc Service Principal có `X-Mavis-Runner-Key`.
- Phạm vi cleanup: Chỉ giới hạn trong các Docker compose project có tiền tố `mavisrun-` và nằm trong `<state-root>` quản lý.
- Phía Java (Chặng 11–12): Đảm bảo `/ingest-receipt` và `/sync-outbox` hoàn toàn idempotent theo `receiptDigest` để nếu HTTP response bị rớt sau khi Java đã commit DB, Adapter/Runner gọi lại `/ingest-receipt` hoặc `/sync-outbox` sẽ nhận ngay `ReceiptIngestAckDTO` (`persistenceStatus = "ALREADY_COMMITTED"`) mà không sinh trùng `ModelVersion`.
```

### 5. Receipt Ingest, Replay và Publication (`R09–R14`)

```text
Mã câu hỏi: R09
Trạng thái: có trên main (một phần — mới kiểm tra có điều kiện 3 ID; sẽ khóa bắt buộc cả 6 ID + resourceProject ở Chặng 11)
Hành vi hiện tại:
- Đúng như bạn đã đọc trong `RunnerReceiptIngestServiceImpl.java` (dòng 63–79): Hiện tại code chỉ kiểm tra `receipt.getSessionId()`, `receipt.getSourceSnapshotId()`, và `receipt.getModelVersionId()` nếu chúng khác rỗng (`!isBlank()`), còn 3 trường `profileVersionId`, `runConfigurationVersionId`, `scenarioVersionId` chưa được đối chiếu trong `ingestRunnerReceipt`.
- Điều này **chưa thay đổi** ở Chặng 9–10.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 63–79).
Giới hạn / điểm chưa biết:
- Nếu payload bỏ trống `sourceSnapshotId`/`modelVersionId` hoặc gửi lệch `profileVersionId`/`runConfigurationVersionId`/`scenarioVersionId`/`resourceProject`, code hiện tại vẫn cho qua.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11) sẽ nâng cấp quy tắc validation trong `RunnerReceiptIngestServiceImpl.ingestRunnerReceipt`:
  1. **Bắt buộc non-blank và khớp tuyệt đối (case-insensitive cho UUID, exact match cho version strings)** cả 6 trường với `RuntimeSession` đã pin:
     - `receipt.sessionId == session.id`
     - `receipt.sourceSnapshotId == session.sourceSnapshot.id`
     - `receipt.modelVersionId == session.modelVersion.id`
     - `receipt.profileVersionId == session.profileVersionId`
     - `receipt.runConfigurationVersionId == session.runConfigurationVersionId`
     - `receipt.scenarioVersionId == session.scenarioVersionId`
  2. **Đối chiếu `resourceProject`**:
     - Bắt buộc khớp regex `^mavisrun-[a-f0-9]{32}$`.
     - Nếu `session.resourceProject` đã được pin qua `/allocate-ack` (hoặc từ `run-definition`), `receipt.resourceProject` bắt buộc phải khớp 100%; nếu lệch -> ném `400 BAD_REQUEST` (Scope Mismatch).
  3. **Đối chiếu `actualImages` và `instrumentation`**:
     - Kiểm tra danh sách `actualImages` chỉ chứa các `serviceName` nằm trong `confirmedServiceMappings` của session (nếu có service lạ không khai báo -> đánh dấu cảnh báo bảo mật hoặc từ chối promote).
     - Ghi nhận trung thực `imageSourceCorrespondence` và `profileAcceptance` (kể cả khi Runner gửi `"Unverified"`) vào `properties` của `RuntimeSession` / `ModelVersion` để Giảng viên và bộ chấm điểm (`EvaluationEngine`) kiểm tra, không tự ý nâng lên `"Verified"`.
```

```text
Mã câu hỏi: R10
Trạng thái: có trên main (một phần — hiện chỉ check sớm theo trạng thái session, chưa có `receipt_digest`, chưa reject khác payload bằng 409, và chưa lock `RuntimeSession`)
Hành vi hiện tại:
- Trong `RunnerReceiptIngestServiceImpl.java` (dòng 82–90):
  - Nếu `session.getRunnerReceiptJson() != null` và `executionStatus` là `"COMPLETED"` hoặc `"FAILED"`, code trả về bản `ModelVersion` mới nhất của project mà **không kiểm tra xem payload gửi lại có giống hệt payload cũ hay không**.
  - Nếu hai request gửi tới đồng thời khi `session.getRunnerReceiptJson()` đang `null`, `runtimeSessionRepository.findById(sessionId)` (dòng 59) không dùng Pessimistic Lock trên `RuntimeSession` (mới chỉ lock `Project` ở dòng 111 khi sắp tạo `ModelVersion`), nên hai luồng có thể cùng đi qua dòng 82 và tạo ra 2 `ModelVersion` revision liên tiếp!
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 59, 82–90, 111).
Giới hạn / điểm chưa biết:
- Chưa có cột `receipt_digest` trên bảng `runtime_sessions` và chưa có `@Lock(LockModeType.PESSIMISTIC_WRITE)` trên `RuntimeSessionRepository.findLockedById(UUID id)`.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11):
  1. Tạo migration `V8__Runtime_Receipt_Digest_And_Locking.sql`: Bổ sung cột `receipt_digest VARCHAR(128)` và `enriched_model_version_id UUID REFERENCES model_versions(id)` vào bảng `runtime_sessions`, cùng unique index trên `(id, receipt_digest)`.
  2. Thêm `@Lock(LockModeType.PESSIMISTIC_WRITE) Optional<RuntimeSession> findLockedById(UUID id)` trong `RuntimeSessionRepository` và gọi ngay đầu hàm `ingestRunnerReceipt`.
  3. Tính `incomingDigest = SHA-256(canonicalJson(receipt))`.
     - Nếu `session.getReceiptDigest() != null`:
       - Nếu `session.getReceiptDigest().equals(incomingDigest)` -> **Idempotent Replay**: Trả về `200 OK` kèm đúng `ReceiptIngestAckDTO` (`persistenceStatus = "ALREADY_COMMITTED"`, `enrichedModelVersionId = session.getEnrichedModelVersionId()`) mà không tạo thêm `ModelVersion`.
       - Nếu `!session.getReceiptDigest().equals(incomingDigest)` -> **Conflicting Replay**: Ném `BusinessException(ErrorCode.CONFLICT, "Phiên chạy đã ghi nhận một RunnerReceipt khác nội dung (digest mismatch)")` (HTTP `409 CONFLICT`).
```

```text
Mã câu hỏi: R11
Trạng thái: chưa có schema ack chuyên biệt trên main (hiện đang trả `ApiResponse<ModelVersionResponseDTO>`; đề xuất schema Ack rõ ràng ở mục D)
Hành vi hiện tại:
- Hiện tại `POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt` trả về `ApiResponse<ModelVersionResponseDTO>`.
- Tuy nhiên, nếu áp dụng **Publication Gate (`R12`)** (tức là các phiên chạy Failed / Timeout / Cancelled không tạo hoặc không promote `ModelVersion` mới), việc trả về `ModelVersionResponseDTO` sẽ không phản ánh rõ trạng thái commit của chính tờ Receipt và không có `receiptDigest` / `acknowledgedAt` để Runner xóa/đánh dấu outbox.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/controller/RuntimeSessionController.java` (dòng 94–99).
Giới hạn / điểm chưa biết:
- Cần một cấu trúc response chuẩn để cả Runner/Adapter lẫn các bài test biết chính xác Receipt đã commit bền vững vào PostgreSQL.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 11):
  - Bổ sung các trường xác nhận commit (`receiptDigest`, `persistenceStatus`, `promotedLatest`, `acknowledgedAt`, `enrichedModelVersionId` cùng toàn bộ thông tin `ModelVersionResponseDTO` nếu có) hoặc trả về `ApiResponse<ReceiptIngestAckDTO>` (chi tiết JSON mẫu ở **Mục D.4**). Để tương thích ngược nếu có test cũ đọc các trường của `ModelVersionResponseDTO`, DTO phản hồi giữ đầy đủ các trường của `ModelVersionResponseDTO` (của bản enriched hoặc bản pinned base nếu không tạo bản mới) **cộng thêm** các trường `receiptDigest`, `persistenceStatus` (`"COMMITTED"` | `"ALREADY_COMMITTED"`), `promotedLatest` (`true` | `false`), `acknowledgedAt`.
  - Quy tắc giữ outbox của Runner/Adapter: Giữ `<state-root>/receipts/<resourceProject>.json` cho tới khi nhận được HTTP `200 OK` có `persistenceStatus` là `"COMMITTED"` hoặc `"ALREADY_COMMITTED"` và `receiptDigest` khớp. Nếu mất kết nối mạng sau khi gửi, retry theo exponential backoff (`1s, 2s, 4s, 8s, 16s`); ở lần gọi lại, nhờ cơ chế `R10`, Java sẽ trả về `"ALREADY_COMMITTED"` an toàn tuyệt đối.
```

```text
Mã câu hỏi: R12
Trạng thái: có trên main (hiện đang luôn promote `isLatestValid = true`; sẽ sửa thành Publication Gate chặt chẽ ở Chặng 12)
Hành vi hiện tại:
- Đúng như bạn phát hiện trong `RunnerReceiptIngestServiceImpl.java` (dòng 102–188):
  - Sau khi cập nhật `outcome` của `RuntimeSession`, code hiện tại luôn gọi `modelVersionRepository.invalidatePreviousVersions(project.getId())` và tạo `ModelVersion` mới (`origin = "RUNTIME_ENRICHED"`, `isLatestValid = true`) bất kể `outcome.executionStatus` là `"Failed"`, `scenarioStatus` là `"Failed"` / `"NotRun"`, hay `cleanupStatus` là `"Incomplete"`.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 102–188).
Giới hạn / điểm chưa biết:
- Việc tự động promote `isLatestValid = true` cho một phiên chạy thất bại hoặc chưa dọn dẹp xong container sẽ làm hỏng mô hình chuẩn đang dùng của dự án nếu phiên đó không thu được trace đầy đủ.
Đề xuất / bên cần làm / dependency:
- **Quyết định thiết kế (Java sở hữu quyết định Publication Gate — triển khai ở Chặng 12)**:
  1. **Lưu bằng chứng (Always Persist Evidence)**: Mọi `RunnerReceipt` hợp lệ về scope đều được lưu bền vững vào `runtime_sessions` (`runner_receipt_json`, `receipt_digest`, 5 cột trạng thái). Nếu trong receipt có `trace.spans` hoặc `trace.causalInteractions`, Java vẫn trích xuất chuỗi `SequenceDiagramResponseDTO` và lưu vào `RuntimeSession` (hoặc tạo một `ModelVersion` nháp `origin = "RUNTIME_ENRICHED"` với **`isLatestValid = false`**) để Sinh viên/Giảng viên vẫn xem được vết lỗi phục vụ debug!
  2. **Điều kiện Promote (`isLatestValid = true`)**: Java **chỉ** gọi `invalidatePreviousVersions` và đặt `enrichedVersion.setIsLatestValid(true)` khi thỏa mãn đồng thời cả 4 điều kiện (Publication Gate):
     - `executionStatus == "Completed"` (case-insensitive)
     - `scenarioStatus == "Passed"` (case-insensitive)
     - `evidenceStatus == "Available"` (case-insensitive)
     - `cleanupStatus == "Confirmed"` (case-insensitive)
     Nếu bất kỳ điều kiện nào không đạt (ví dụ `Failed`, `TimedOut`, `Cancelled`, `NotRun`, `Unavailable`, `Incomplete`), bản `ModelVersion` tĩnh trước đó vẫn giữ nguyên `isLatestValid = true`, còn bản `RUNTIME_ENRICHED` (nếu có trace hữu ích) được lưu với `isLatestValid = false` và gắn cờ `properties["publicationGateStatus"] = "HELD_NON_PROMOTED"`.
```

```text
Mã câu hỏi: R13
Trạng thái: có trên main (một phần — hiện đang gán `COMPLETE` ngay cả khi `traceQuality == "Partial"` nếu mọi span đều có `modelServiceId`; sẽ sửa ở Chặng 12)
Hành vi hiện tại:
- Trong `RunnerReceiptIngestServiceImpl.java` (dòng 159–162 & 192–200):
  - Nếu có ít nhất 1 span mà tất cả các span đều có `modelServiceId` khác rỗng (`hasUnmapped == false`), dòng 195 gán `session.setTraceStatus("COMPLETE")` mà **chưa kiểm tra** xem `session.getTraceQuality()` (lấy từ `outcome.getTraceQuality()`) có phải là `"Partial"` hay không!
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 159–162, 192–200).
Giới hạn / điểm chưa biết:
- Bảng `runtime_sessions` có constraint `CHECK (trace_status IN ('NONE', 'COMPLETE', 'PARTIAL', 'UNMAPPED'))` (`V1__Init_Database.sql`, dòng 142). Nếu gán `traceStatus = "COMPLETE"` khi `traceQuality = "Partial"`, FE hoặc bộ chấm bài (`Assignment` có `require_runtime_trace = true`) nếu chỉ đọc `trace_status` sẽ hiểu nhầm là capture hoàn chỉnh.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 12) sẽ áp dụng bảng quy tắc ánh xạ chuẩn từ `(evidenceStatus, traceQuality, mappingStatus)` sang `trace_status`:
  1. `evidenceStatus` là `"Empty"` hoặc `"Unavailable"`, hoặc `traceQuality` là `"Empty"` / `"Unavailable"`, hoặc không có span nào -> `trace_status = "NONE"`.
  2. Có span nhưng `mappingStatus == "Unmapped"` (không ánh xạ được bất kỳ span/interaction nào vào `modelServiceId`) -> `trace_status = "UNMAPPED"`.
  3. `traceQuality == "Partial"` **HOẶC** `mappingStatus == "Partial"` **HOẶC** có bất kỳ span/interaction nào thiếu `modelServiceId` / gãy chuỗi parent span -> `trace_status = "PARTIAL"`.
  4. **Chỉ khi** `evidenceStatus == "Available"` **VÀ** `traceQuality == "CompleteForCapturedData"` **VÀ** `mappingStatus == "Mapped"` (không có span/interaction nào unmapped) -> `trace_status = "COMPLETE"`.
- Đồng thời `RuntimeSessionResponseDTO` trả đủ cả 4 trường (`traceStatus`, `evidenceStatus`, `traceQuality`, `mappingStatus`) cho FE và Assignment Evaluator.
```

```text
Mã câu hỏi: R14
Trạng thái: có trên main (một phần — hiện đang rematch theo tên `callerName.toLowerCase()` trong `processCausalInteraction`; sẽ sửa ưu tiên UUID `modelServiceId` và bảo toàn `logicalKey` ở Chặng 12)
Hành vi hiện tại:
- Trong `RunnerReceiptIngestServiceImpl.java`:
  1. Dòng 123–129: Khi clone các `ModelElement` từ `baseVersion` sang `enrichedVersion`, code chưa copy cột `workerLogicalId` (và cần đảm bảo `properties["logicalKey"]` được giữ nguyên), cũng như chưa copy các bản ghi `Evidence` tĩnh (`STATIC_CODE`, `CONFIG_FILE`, `DOCKER_COMPOSE`) sang `enrichedVersion`.
  2. Dòng 146–149: `spanMap` đang dùng `span.getSpanId()` làm key đơn (`Map<String, RunnerCorrelatedSpanDTO>`), chưa dùng khóa ghép `(traceId, spanId)` như `TraceCorrelator.cs` của phía .NET.
  3. Dòng 264–278 (`processCausalInteraction`): Đang tìm `caller` và `callee` bằng `elementByNameMap.get(callerName.toLowerCase())` thay vì tìm theo UUID `modelServiceId` đã được Runner đối chiếu sẵn trong `childSpan.getModelServiceId()` và `parentSpan.getModelServiceId()`!
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RunnerReceiptIngestServiceImpl.java` (dòng 123–149, 250–329).
Giới hạn / điểm chưa biết:
- Nếu hai service có tên hiển thị gần giống nhau hoặc viết hoa/thường khác nhau, rematch theo tên có thể gây nhầm lẫn (name collision), trong khi `MAVIS.Runner` đã gắn sẵn `modelServiceId` chính xác từ `confirmedServiceMappings`.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 12) sẽ nâng cấp `RunnerReceiptIngestServiceImpl`:
  1. **Ưu tiên tuyệt đối `modelServiceId` (UUID)**: Tra cứu phần tử đích qua `oldToNewElementMap.get(UUID.fromString(span.getModelServiceId()))`. Chỉ khi `modelServiceId` bị trống mới fallback có kiểm soát hoặc đánh dấu `UNCERTAIN_MAPPING` (`hasUnmapped = true`), tuyệt đối không tự ý ghi đè một `modelServiceId` đã pin bằng kết quả đoán theo tên.
  2. **Khóa ghép `(traceId, spanId)` & Gãy chuỗi Parent Span**: Lưu `spanMap` theo key `traceId + ":" + spanId`. Nếu một span có `parentSpanId` nhưng không tìm thấy `(traceId, parentSpanId)` trong tập capture, đánh dấu `traceQuality` / `traceStatus = "PARTIAL"` và ghi chú trong `SequenceStepDTO` (`status = "MISSING_PARENT_SPAN"`).
  3. **Bảo toàn Static Edges, Evidence & Logical Identity**: Khi clone từ `baseVersion` sang `enrichedVersion`, copy đầy đủ `workerLogicalId`, `properties` (bao gồm `logicalKey`), và toàn bộ `Evidence` tĩnh của `baseVersion` sang `enrichedVersion` để `ModelDiffService` và `AiExplanationService` hoạt động liền mạch trên bản `RUNTIME_ENRICHED`.
```

### 6. Quyền truy cập và Cấu hình (`A01–A03`)

```text
Mã câu hỏi: A01
Trạng thái: có trên main cho Workspace/Project/Submission (`AccessPolicyServiceImpl`), nhưng **chưa gắn** vào `RuntimeSessionServiceImpl` và `RunnerReceiptIngestServiceImpl` (sẽ gắn đầy đủ ở Chặng 12)
Hành vi hiện tại:
- `AccessPolicyServiceImpl.java` (commit `b087aec`) đã cài đặt đầy đủ các hàm bảo vệ: `requireCurrentActiveUser()`, `requireSystemAdmin()`, `requireWorkspaceMember(UUID)`, `requireWorkspaceLecturer(UUID)`, `requireProjectReadAccess(Project)`, `requireProjectWriteAccess(Project)`.
- Tuy nhiên, trong `RuntimeSessionServiceImpl.java` và `RunnerReceiptIngestServiceImpl.java`, các hàm `runComposePreflight`, `createRuntimeSession`, `approveAndStartSession`, `stopSession`, `getSessionsByProject`, `getSessionById`, `exportRunDefinition`, `ingestRunnerReceipt`, `importReceiptFromStateRoot` hiện mới chỉ gọi `SecurityUtils.getCurrentUserId()` (trong `createRuntimeSession`) chứ **chưa gọi `accessPolicyService.requireProjectReadAccess(project)` hay `requireProjectWriteAccess(project)`**.
Bằng chứng:
- `src/main/java/com/mavis/common/security/impl/AccessPolicyServiceImpl.java` (dòng 26–170).
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 59–279).
Giới hạn / điểm chưa biết:
- Nếu không gắn `AccessPolicyService` vào `RuntimeSessionServiceImpl`, một user đã đăng nhập ở Workspace/Project khác nếu biết `sessionId` hoặc `projectId` có thể gọi API đọc/dừng/approve session của project không thuộc quyền sở hữu.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 12) sẽ gắn chặt `AccessPolicyService` vào mọi entrypoint của Runtime:
  - `createRuntimeSession`, `approveAndStartSession`, `stopSession`, `exportRunDefinition`, `importReceiptFromStateRoot`: Bắt buộc `accessPolicyService.requireProjectWriteAccess(project)` (chỉ chủ sở hữu Project hoặc `SYSTEM_ADMIN`, hoặc Service Principal hợp lệ).
  - `runComposePreflight`, `getSessionsByProject`, `getSessionById`, `getSequenceDiagram`: Bắt buộc `accessPolicyService.requireProjectReadAccess(project)` (chủ sở hữu Project, Giảng viên của Workspace chứa Project, Sinh viên cùng Workspace nếu Project là `isReferenceTemplate = true`, hoặc `SYSTEM_ADMIN`).
  - Viết bộ negative unit/integration tests kiểm tra user khác Project / khác Workspace gọi vào các hàm trên phải nhận `403 FORBIDDEN`.
```

```text
Mã câu hỏi: A02
Trạng thái: chưa có riêng cho Runner trên main (sẽ bổ sung `X-Mavis-Runner-Key` ở Chặng 12)
Hành vi hiện tại:
- Hiện tại Static Worker dùng `X-Mavis-Worker-Key` + signed `artifactGrant`.
- Các endpoint Runtime callback (`/ingest-receipt`, `/sync-outbox`, `/run-definition`) hiện đang đi qua bộ lọc JWT thông thường của Spring Security, chưa có cơ chế xác thực Service Principal riêng cho `MAVIS.Runner` / Operator Adapter.
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/controller/RuntimeSessionController.java` (dòng 94–117).
Giới hạn / điểm chưa biết:
- Khi `MAVIS.Runner` hoặc Operator Adapter chạy tự động ở nền (background CLI / daemon), nó không cầm JWT của người dùng cuối mà cần một Service Key chuyên biệt.
Đề xuất / bên cần làm / dependency:
- Phía Java (Chặng 12):
  - Cấu hình thuộc tính `mavis.runner.service-key` (ánh xạ từ biến môi trường `MAVIS_RUNNER_SERVICE_KEY`) và header chuẩn `X-Mavis-Runner-Key`.
  - Tại các endpoint dành cho Runner/Operator Adapter (`/allocate-ack`, `/ingest-receipt`, `/sync-outbox`, `/run-definition`), cho phép xác thực theo 1 trong 2 cách:
    1. Có header `X-Mavis-Runner-Key` khớp với `mavis.runner.service-key` (dùng hằng số thời gian `MessageDigest.isEqual` chống timing attack) **VÀ** request payload khớp đúng `sessionId` + `resourceProject` / pinned versions của session; HOẶC
    2. Người vận hành (User/Admin) gọi trực tiếp bằng JWT hợp lệ và vượt qua `accessPolicyService.requireProjectWriteAccess(project)`.
  - Quy trình quản lý/rotate: Lưu trong biến môi trường hoặc file secret ngoài git (`MAVIS_RUNNER_SERVICE_KEY`), không bao giờ ghi giá trị key vào `run-definition`, `RunnerReceipt`, hay log.
```

```text
Mã câu hỏi: A03
Trạng thái: có trên main (khử secret qua `SecretRedactionUtils`; sẽ tách bạch rõ dữ liệu thực thi và secret references ở Chặng 12)
Hành vi hiện tại:
- Khi tạo `RuntimeSession` (`RuntimeSessionServiceImpl.java`, dòng 71), Java chạy `SecretRedactionUtils.redactJsonString(request.getScenarioConfig())` trước khi lưu vào cột `scenario_config` trong DB.
- Bộ lọc `SecretRedactionUtils` thay thế các giá trị nhạy cảm (như `password`, `secret`, `token`, `apiKey`, `Authorization: Bearer ...`) bằng chuỗi `"[REDACTED]"`.
- **Nguy cơ**: Nếu người dùng truyền header thực thi kịch bản hoặc biến môi trường vào `scenarioConfig` dưới dạng raw secret, nó sẽ bị đổi thành `"[REDACTED]"` ngay lúc lưu DB, dẫn tới khi xuất `GET /run-definition`, `MAVIS.Runner` sẽ gửi chuỗi `"[REDACTED]"` thật vào container khiến kịch bản lỗi xác thực!
Bằng chứng:
- `src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeSessionServiceImpl.java` (dòng 71, 200–279).
Giới hạn / điểm chưa biết:
- Cần quy ước rõ cách truyền tham chiếu biến môi trường (`secretRef` / `${ENV_VAR}`) để Java không redact mất tên biến tham chiếu, còn Adapter/Runner sẽ resolve tại thời điểm chạy mà không lưu raw secret vào definition hay receipt.
Đề xuất / bên cần làm / dependency:
- Thống nhất quy ước giữa Java và Runner:
  1. Trong `scenarioConfig` / `run-definition`, không bao giờ truyền raw secret. Nếu kịch bản cần header hoặc biến môi trường nhạy cảm, dùng cú pháp tham chiếu tên biến môi trường an toàn (ví dụ `"secretRef": "MAVIS_SCENARIO_TEST_TOKEN"` hoặc placeholder `"${ENV:MAVIS_SCENARIO_TEST_TOKEN}"`).
  2. `SecretRedactionUtils` của Java giữ nguyên các tham chiếu tên biến (`secretRef` / `${ENV:...}`), chỉ redact các giá trị chuỗi trực tiếp mang hình thái token/password thật.
  3. Đối với các đồ án thực hành trong sandbox cô lập (local compose), các tài khoản DB nội bộ giữa các container trong cùng mạng compose dùng cấu hình test cục bộ không nhạy cảm, và `MAVIS.Runner` tiếp tục redact mọi header `Authorization`/`Cookie` trong `RunnerReceipt` trước khi ghi ra `<state-root>/receipts/<resourceProject>.json`.
```

### 7. Phân chia công việc (`P01–P04`)

```text
Mã câu hỏi: P01
Trạng thái: Đề xuất phân công ngay cho phía .NET (`MAVIS.Runner` / Operator Adapter)
Hành vi hiện tại:
- `MAVIS.Worker` (Static) đã hoàn chỉnh. `MAVIS.Runner` đã có CLI `run`, `recover`, `preflight`, `plan`, `scenario`, `correlate`, ghi receipt ra `<state-root>/receipts/<resourceProject>.json` và theo dõi `<state-root>/<resourceProject>/cancel.request`.
Đề xuất / bên cần làm / dependency:
Phía .NET (`MAVIS.Runner`) có thể làm ngay 3 task nhỏ, độc lập, không bị block bởi Java:
1. **Task NET-01 (Chấp nhận `resourceProject` từ `RuntimeRunDefinition` hoặc truyền qua CLI)**:
   - Đầu vào: Trường optional `"resourceProject": "mavisrun-<32hex>"` trong JSON `RuntimeRunDefinition` (hoặc cờ `--resource-project` của lệnh `MAVIS.Runner run`).
   - Xử lý: Nếu trong `RuntimeRunDefinition` đã có `resourceProject` hợp lệ (khớp regex `^mavisrun-[a-f0-9]{32}$`), `DockerComposeSession` sử dụng luôn ID đó thay vì sinh `Guid.NewGuid()` mới (vẫn in `MAVIS_SESSION_RESOURCE=<id>` ra stderr như cũ). Nếu không có mới tự sinh ID mới.
   - Điều kiện nghiệm thu: Khi truyền `run-definition.json` có sẵn `"resourceProject": "mavisrun-0123456789abcdef0123456789abcdef"`, Runner tạo compose project, thư mục cancel watch và file receipt đúng theo tên đó.
2. **Task NET-02 (Hỗ trợ tự động Unwrap `ApiResponse` hoặc lệnh Adapter mỏng)**:
   - Đầu vào: File JSON tải trực tiếp từ `GET /api/v1/analyzer/runtime/sessions/{id}/run-definition` (có thể là raw `RuntimeRunDefinition` hoặc bọc trong `{"status":200,"data":{...}}`).
   - Xử lý: Khi `MAVIS.Runner` đọc file `--definition`, nếu thấy root object có chứa object con `"data"` và bên trong `"data"` có `"schemaVersion"` + `"sessionId"`, tự động unwrap lấy phần `"data"` để deserialize `RuntimeRunDefinition`.
   - Điều kiện nghiệm thu: Cả file JSON bọc `ApiResponse` lẫn file JSON thuần đều deserialize thành công trong `MAVIS.Runner`.
3. **Task NET-03 (Tùy chọn HTTP Callback / Outbox Sender trong CLI hoặc script tích hợp)**:
   - Đầu vào: Sau khi `MAVIS.Runner run` ghi xong `<state-root>/receipts/<resourceProject>.json`.
   - Xử lý: Nếu có truyền `--callback-url <java-base-url>` và biến môi trường `MAVIS_RUNNER_SERVICE_KEY`, gửi `POST /api/v1/analyzer/runtime/sessions/{sessionId}/allocate-ack` lúc allocate và `POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt` (kèm header `X-Mavis-Runner-Key`) sau khi ghi file receipt; khi nhận HTTP 200 có `persistenceStatus` là `"COMMITTED"` hoặc `"ALREADY_COMMITTED"`, ghi file `<state-root>/receipts/<resourceProject>.ack.json`.
```

```text
Mã câu hỏi: P02
Trạng thái: Phía Java nhận thực hiện ngay trong **Chặng 11** và **Chặng 12**
Hành vi hiện tại:
- Đã có nền tảng V7 (`6c5ab67`) + Chặng 9–10 trên nhánh hiện tại.
Đề xuất / bên cần làm / dependency:
Bảng trạng thái các đầu việc phía Java:
1. **Pin cứng `modelVersionId` & hash cấu hình lúc tạo session (`R03`)**: Đang chuẩn bị làm (Chặng 11).
2. **Validate chặt `exportRunDefinition` + xuất `resourceProject` + hỗ trợ `?raw=true` (`R02`, `R04`)**: Đang chuẩn bị làm (Chặng 11).
3. **Sửa `/approve` sang `APPROVED`/`READY_FOR_DISPATCH`, thêm `/allocate-ack`, và chuẩn hóa 3 trạng thái `/stop` (`R01`, `R04`, `R06`, `R07`)**: Đang chuẩn bị làm (Chặng 11).
4. **Migration `V8` (`receipt_digest`), `@Lock(PESSIMISTIC_WRITE)` trên `RuntimeSession`, kiểm tra bắt buộc 6 version IDs, reject replay lệch payload bằng `409 CONFLICT`, và trả `ReceiptIngestAckDTO` (`R09`, `R10`, `R11`)**: Đang chuẩn bị làm (Chặng 11).
5. **Publication Gate (`R12`), ánh xạ chính xác `traceStatus = PARTIAL` (`R13`), ưu tiên UUID `modelServiceId` + khóa ghép `(traceId, spanId)` + bảo toàn `workerLogicalId`/`logicalKey` & static `Evidence` (`R14`)**: Đang chuẩn bị làm (Chặng 12).
6. **Gắn `AccessPolicyService` vào toàn bộ `RuntimeSessionServiceImpl` (`A01`), thêm bảo vệ `X-Mavis-Runner-Key` (`A02`), và bảo toàn `secretRef` trong `SecretRedactionUtils` (`A03`)**: Đang chuẩn bị làm (Chặng 12).
```

```text
Mã câu hỏi: P03
Trạng thái: Đã xác minh toàn bộ nhánh hiện tại
Hành vi hiện tại:
- Trên nhánh hiện tại sau commit `6c5ab67`, hai phần mới được code thêm là **Chặng 9** (`DiagramExportServiceImpl`, `MermaidDslGenerator`, `SubmissionServiceImpl.exportSubmissionBundle`) và **Chặng 10** (`ApiKeyProvider`, `AiExplanationServiceImpl`, `AiExplanationController`).
- Chưa có đoạn code nào trên nhánh riêng âm thầm sửa các câu hỏi `R01–R14` khác với commit `6c5ab67`. Mọi câu trả lời trong báo cáo này phản ánh trung thực 100% code hiện có và tách bạch rõ phần sẽ làm ở Chặng 11–12.
Bằng chứng:
- Đối chiếu trực tiếp `RuntimeSessionServiceImpl.java` và `RunnerReceiptIngestServiceImpl.java` trong kho code Chặng 10 với commit `6c5ab67`.
Giới hạn / điểm chưa biết:
- Không có xung đột hay làm trùng giữa hai bên.
Đề xuất / bên cần làm / dependency:
- Hai bên tiến hành theo đúng phân công ở `P01` và `P02`.
```

```text
Mã câu hỏi: P04
Trạng thái: Đề xuất kịch bản nghiệm thu Vertical Slice E2E đầu tiên
Hành vi hiện tại:
- Cả hai bên đã có đủ khung CLI (`MAVIS.Runner`) và REST API (`RuntimeSessionController`).
Đề xuất / bên cần làm / dependency:
**Kịch bản Vertical Slice E2E đầu tiên (7 bước chuẩn)**:
1. **Bước 1 (Java)**: Tạo `Project`, `SourceSnapshot` (có `docker-compose.yml` gồm 2 service nhẹ hoặc fixture microservice mẫu), chạy Static Analysis tạo `ModelVersion` (Revision 1, `is_latest_valid = true`).
2. **Bước 2 (Java)**: Gọi `POST /api/v1/analyzer/runtime/sessions` (Java tự pin `modelVersionId` = Rev 1 và cấp `resourceProject = mavisrun-<32hex>`) -> Gọi `POST /api/v1/analyzer/runtime/sessions/{id}/approve` (`scenarioStatus = APPROVED`, `executionStatus = READY_FOR_DISPATCH`) -> Gọi `GET /api/v1/analyzer/runtime/sessions/{id}/run-definition` xuất file `run-definition.json`.
3. **Bước 3 (.NET Runner)**: Chạy `MAVIS.Runner run --definition run-definition.json --state-root ./data/runtime-state`. Runner đọc `resourceProject` từ definition, gọi (hoặc script gọi) `POST /allocate-ack` để báo `RUNNING`.
4. **Bước 4 (Kiểm thử nhánh Stop — Case A)**: Ở phiên chạy số 1, khi đang `RUNNING`, gọi `POST /api/v1/analyzer/runtime/sessions/{id}/stop` -> Java chuyển sang `CANCELLING` / `STOP_REQUESTED` và ghi `./data/runtime-state/<resourceProject>/cancel.request` -> Runner phát hiện file, dừng kịch bản, chạy `docker compose down -v`, ghi receipt có `executionStatus = Cancelled`, `cleanupStatus = Confirmed` -> Ingest vào Java -> Java giữ nguyên Rev 1 là `is_latest_valid = true` (Publication Gate chặn promote phiên Cancelled).
5. **Bước 5 (Kiểm thử nhánh Thành công — Case B)**: Ở phiên chạy số 2, để Runner chạy hoàn tất kịch bản HTTP, thu thập OTLP spans, dọn dẹp container (`cleanupStatus = Confirmed`), ghi `./data/runtime-state/receipts/<resourceProject>.json`.
6. **Bước 6 (Java Ingest & Replay)**:
   - Gọi `POST /api/v1/analyzer/runtime/sessions/{id}/ingest-receipt` lần 1 -> Nhận `200 OK` (`persistenceStatus = COMMITTED`, `promotedLatest = true`), tạo `ModelVersion` Revision 2 (`origin = RUNTIME_ENRICHED`, `is_latest_valid = true`).
   - Gọi lại `POST /ingest-receipt` lần 2 với cùng payload -> Nhận `200 OK` (`persistenceStatus = ALREADY_COMMITTED`), không tạo Revision 3.
   - Gọi lại `POST /ingest-receipt` lần 3 với payload bị sửa 1 trường -> Nhận `409 CONFLICT`.
7. **Bước 7 (Truy vấn kết quả)**: Gọi `GET /api/v1/analyzer/runtime/sessions/{id}/sequence` và `GET /api/v1/analyzer/models/{rev2Id}/diff?baseModelVersionId={rev1Id}` để xác nhận các cạnh `STATIC_AND_RUNTIME` / `RUNTIME_OBSERVED` và chuỗi nhân quả.
```

## D. Contract mẫu đã loại secret

Các schema dưới đây đánh dấu rõ phần **EXISTING (đã có trên main `6c5ab67`)** và phần **PROPOSED (bổ sung ở Chặng 11–12 để chốt giữa hai bên)**.

### 1. `GET /api/v1/analyzer/runtime/sessions/{sessionId}/run-definition` (EXISTING + PROPOSED `resourceProject`)

Khi gọi kèm `?raw=true` (PROPOSED) hoặc sau khi unwrap trường `.data` của `ApiResponse`:

```json
{
  "schemaVersion": "1.0",
  "sessionId": "8f14e45f-ceea-467a-a8f3-1506b983b811",
  "projectId": "2c918082-8f14-4a11-9b22-010203040506",
  "sourceSnapshotId": "3d829193-9a25-4b22-8c33-112233445566",
  "modelVersionId": "4e730204-ab36-4c33-9d44-223344556677",
  "profileVersionId": "sha256:9f86d081884c7d65",
  "runConfigurationVersionId": "sha256:4b227777d4dd1fc6",
  "scenarioVersionId": "sha256:e3b0c44298fc1c14",
  "resourceProject": "mavisrun-7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
  "composeYaml": "services:\n  order-api:\n    image: mcr.microsoft.com/dotnet/aspnet:10.0\n    ports:\n      - \"8081:8080\"\n",
  "profile": {
    "profileId": "SPRING_BOOT_DOTNET_COMPOSE_V1",
    "maxDurationSeconds": 120,
    "allowExternalNetwork": false,
    "cpuLimit": "0.50",
    "memoryLimit": "512M"
  },
  "runConfiguration": {
    "environmentVariables": {
      "ASPNETCORE_ENVIRONMENT": "Development",
      "AUTH_TOKEN_REF": "${ENV:MAVIS_SCENARIO_TEST_TOKEN}"
    },
    "readinessProbe": {
      "serviceName": "order-api",
      "path": "/health",
      "expectedStatus": 200,
      "timeoutSeconds": 30
    }
  },
  "scenario": {
    "scenarioName": "CreateOrderHappyPath",
    "requests": [
      {
        "stepOrder": 1,
        "targetService": "order-api",
        "method": "POST",
        "path": "/api/orders",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": "{\"sku\":\"FRUIT-01\",\"qty\":2}",
        "expectedStatus": 201
      }
    ]
  },
  "confirmedServiceMappings": [
    {
      "composeServiceName": "order-api",
      "otelServiceName": "OrderService",
      "modelServiceId": "550e8400-e29b-41d4-a716-446655440001",
      "languageStack": "CSHARP_DOTNET"
    },
    {
      "composeServiceName": "inventory-api",
      "otelServiceName": "InventoryService",
      "modelServiceId": "550e8400-e29b-41d4-a716-446655440002",
      "languageStack": "JAVA_SPRING"
    }
  ]
}
```

### 2. Allocation / Start Acknowledgement — `POST /api/v1/analyzer/runtime/sessions/{sessionId}/allocate-ack` (**PROPOSED**)

- **Headers**: `X-Mavis-Runner-Key: <configured-service-key>` (hoặc Bearer JWT của chủ Project/Admin)
- **Request Body**:

```json
{
  "schemaVersion": "1.0",
  "sessionId": "8f14e45f-ceea-467a-a8f3-1506b983b811",
  "resourceProject": "mavisrun-7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
  "startedAt": "2026-10-22T10:30:00Z"
}
```

- **Response Body (`ApiResponse<RuntimeSessionAllocationAckDTO>`)**:

```json
{
  "status": 200,
  "message": "Ghi nhận cấp phát phiên chạy Runtime thành công",
  "data": {
    "sessionId": "8f14e45f-ceea-467a-a8f3-1506b983b811",
    "resourceProject": "mavisrun-7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    "scenarioStatus": "RUNNING",
    "executionStatus": "RUNNING",
    "acknowledgedAt": "2026-10-22T10:30:01Z"
  },
  "timestamp": "2026-10-22T10:30:01Z"
}
```

### 3. Stop Request / Acknowledgement — `POST /api/v1/analyzer/runtime/sessions/{sessionId}/stop` (**PROPOSED State Transitions**)

- Khi gọi lúc phiên đang `RUNNING`, Java ghi `<state-root>/<resourceProject>/cancel.request` và trả về:

```json
{
  "status": 200,
  "message": "Đã gửi tín hiệu yêu cầu dừng phiên thực nghiệm tới Runner",
  "data": {
    "id": "8f14e45f-ceea-467a-a8f3-1506b983b811",
    "resourceProject": "mavisrun-7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    "scenarioStatus": "RUNNING",
    "executionStatus": "CANCELLING",
    "cleanupStatus": "STOP_REQUESTED",
    "cancelRequestedAt": "2026-10-22T10:31:15Z"
  },
  "timestamp": "2026-10-22T10:31:15Z"
}
```

### 4. Receipt Ingest Request & Commit Acknowledgement — `POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt` (**EXISTING Request + PROPOSED Commit Ack Fields**)

- **Request Body (`RunnerReceiptIngestRequestDTO`)**: Giữ nguyên 100% cấu trúc `RunnerReceipt` của `MAVIS.Runner`.
- **Response Body (`ApiResponse<ReceiptIngestAckDTO>`)** (**PROPOSED**):

```json
{
  "status": 200,
  "message": "Tiếp nhận và lưu bền vững RunnerReceipt thành công",
  "data": {
    "sessionId": "8f14e45f-ceea-467a-a8f3-1506b983b811",
    "resourceProject": "mavisrun-7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    "receiptDigest": "sha256:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    "persistenceStatus": "COMMITTED",
    "promotedLatest": true,
    "publicationGateStatus": "PROMOTED",
    "enrichedModelVersionId": "9a112233-bb44-4c55-8d66-77889900aabb",
    "id": "9a112233-bb44-4c55-8d66-77889900aabb",
    "projectId": "2c918082-8f14-4a11-9b22-010203040506",
    "sourceSnapshotId": "3d829193-9a25-4b22-8c33-112233445566",
    "revision": 2,
    "origin": "RUNTIME_ENRICHED",
    "isLatestValid": true,
    "acknowledgedAt": "2026-10-22T10:32:05Z"
  },
  "timestamp": "2026-10-22T10:32:05Z"
}
```

*(Lưu ý: Đặt cả `id` và `enrichedModelVersionId` cùng trỏ tới ModelVersion được tạo hoặc base version để tương thích ngược 100% với mọi client đang đọc `ModelVersionResponseDTO`)*

### 5. Bảng quy tắc bất biến, Idempotency/Replay và Mã lỗi HTTP (**PROPOSED**)

| Tình huống kiểm tra | Điều kiện | HTTP Status & ErrorCode | Hành vi của Java |
| :--- | :--- | :--- | :--- |
| **Scope / Pin Mismatch** | Một trong 6 ID (`sessionId`, `sourceSnapshotId`, `modelVersionId`, `profileVersionId`, `runConfigurationVersionId`, `scenarioVersionId`) trống hoặc khác với `RuntimeSession` đã pin | `400 BAD_REQUEST` (`INVALID_PARAMETER`) | Từ chối hoàn toàn, không sửa DB |
| **Invalid `resourceProject`** | Không khớp regex `^mavisrun-[a-f0-9]{32}$` hoặc khác với `resourceProject` đã xác nhận qua `/allocate-ack` | `400 BAD_REQUEST` (`INVALID_PARAMETER`) | Từ chối hoàn toàn |
| **Idempotent Replay** | Gửi lại `RunnerReceipt` cho cùng `sessionId` có `SHA-256(canonicalJson)` trùng khớp `session.receiptDigest` | `200 OK` | Không tạo thêm `ModelVersion`, trả lại `ReceiptIngestAckDTO` với `persistenceStatus = "ALREADY_COMMITTED"` |
| **Conflicting Replay** | Gửi lại `RunnerReceipt` cho cùng `sessionId` đã có `receiptDigest` nhưng nội dung payload mới có `SHA-256` khác | `409 CONFLICT` (`CONFLICT`) | Từ chối ghi đè, giữ nguyên dữ liệu đã commit trước đó |
| **Publication Gate Hold** | Receipt hợp lệ nhưng `executionStatus != Completed` hoặc `scenarioStatus != Passed` hoặc `evidenceStatus != Available` hoặc `cleanupStatus != Confirmed` | `200 OK` | Lưu bền vững Receipt + tạo bản nháp `RUNTIME_ENRICHED` (`isLatestValid = false`), giữ nguyên bản `isLatestValid = true` cũ (`promotedLatest = false`, `publicationGateStatus = "HELD_NON_PROMOTED"`) |
| **Unauthorized Callback** | Không có `X-Mavis-Runner-Key` hợp lệ và cũng không có JWT của chủ sở hữu Project / Admin | `401 UNAUTHORIZED` / `403 FORBIDDEN` | Từ chối truy cập |

## E. Kế hoạch phân công ngắn

- **Phía Java (`mavis-be` — thực hiện trong Chặng 11 & Chặng 12)**:
  1. **Chặng 11 (Runtime Lifecycle, Pinning, Allocation Ack & Idempotent Receipt Lock)**:
     - Thêm migration `V8__Runtime_Receipt_Digest_And_Locking.sql` (`receipt_digest`, `enriched_model_version_id`, `publication_gate_status`).
     - Pin cứng `modelVersion` và hash `profileVersionId`/`runConfigurationVersionId`/`scenarioVersionId` ngay trong `createRuntimeSession`.
     - Sửa `/approve` sang `APPROVED` + `READY_FOR_DISPATCH`, thêm `POST /allocate-ack`, chuẩn hóa 3 nhánh `/stop` (`stop-before-start`, `stop-while-running` -> `CANCELLING`/`STOP_REQUESTED`, `stop-after-completion`), và validate chặt `exportRunDefinition`.
     - Bổ sung `@Lock(PESSIMISTIC_WRITE)` trên `RuntimeSession`, kiểm tra bắt buộc cả 6 version IDs, kiểm tra `receiptDigest` (trả `200 ALREADY_COMMITTED` hoặc `409 CONFLICT`), và trả về `ReceiptIngestAckDTO`.
  2. **Chặng 12 (Publication Gate, UUID Mapping Fidelity, Multi-Trace Correlation & Runtime Security)**:
     - Cài đặt Publication Gate (`R12`), ánh xạ chính xác `traceStatus = PARTIAL` (`R13`), tra cứu theo UUID `modelServiceId` + khóa ghép `(traceId, spanId)` + copy `workerLogicalId`/`logicalKey` và static `Evidence` (`R14`).
     - Gắn `AccessPolicyService` vào toàn bộ `RuntimeSessionServiceImpl` (`A01`), thêm bộ kiểm tra `X-Mavis-Runner-Key` (`A02`), và bảo toàn `secretRef` (`A03`) kèm bộ unit/integration tests đầy đủ.
- **Phía Worker/Runner (`.NET` — đề xuất cho bạn)**:
  1. Cho phép `DockerComposeSession` nhận `resourceProject` từ `RuntimeRunDefinition` nếu có (hoặc qua flag CLI).
  2. Tự động unwrap `.data` nếu file `--definition` được lưu nguyên từ `ApiResponse` của Java.
  3. (Tùy chọn) Thêm script/adapter mỏng gọi `/allocate-ack` khi thấy `MAVIS_SESSION_RESOURCE` và gọi `/ingest-receipt` kèm `X-Mavis-Runner-Key` khi ghi xong receipt.

## F. Bằng chứng kiểm thử

- **Thời điểm & Môi trường**: Ngày 22/10/2026, thực hiện kiểm tra mã nguồn tĩnh (static source verification) trên kho code `mavis-be` tại commit Chặng 10 (xây trên nền `6c5ab67`).
- **Trạng thái chạy test thực tế**:
  - Trên commit Chặng 10 hiện tại: **Chưa chạy lại** `mvn test` / PostgreSQL / Docker trong lượt trả lời này (chỉ đọc và đối chiếu trực tiếp mã nguồn để phản hồi chính xác hiện trạng).
  - Các kết quả pass trước đó thuộc lịch sử các chặng trước, không tính cho các thay đổi của commit mới.
  - Ngay sau khi hoàn tất code **Chặng 11 & Chặng 12**, phía Java sẽ chạy toàn bộ `mvn clean test` (bao gồm các test mới cho `R01–R14` và `A01–A03`) và gửi kèm log thực thi.

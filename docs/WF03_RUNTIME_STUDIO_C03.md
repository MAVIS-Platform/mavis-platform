# WF-03 · Live Docker Runtime Studio (`Stop/Start/Scale`), Before/After & Causal OTel Sequence (`C03`)

Hợp đồng kỹ thuật, kiến trúc sandbox đa tầng (`Backend -> Runner -> DockerComposeSession`), cơ chế đối chiếu tác động `Before/After` và bảng kiểm chứng nghiệm thu BM04 cho luồng **WF-03** (Tài liệu tham chiếu liên kết với [`WF01_COURSE_ACCESS.md`](./WF01_COURSE_ACCESS.md), [`WF02_STATIC_QUIZ_C02.md`](./WF02_STATIC_QUIZ_C02.md), [`WF04_SUBMISSION_GRADING_C04.md`](./WF04_SUBMISSION_GRADING_C04.md) và [`MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md`](./MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md)).

## 1. Quy tắc nghiệp vụ (`BR-07`, `BR-08`) & Thiết kế an toàn Sandbox

- **BR-07 · Runtime Plan, Preflight & Quiz Gate:**
  - Với dự án thuộc lớp tuần tự (`course_mode = true`), mọi yêu cầu tạo hoặc khởi chạy `RuntimeSession` (`RuntimeSessionServiceImpl` & `RuntimePlanningService`) đều kiểm tra `CourseLabPolicy.requireRuntimeReadiness(project)`: sinh viên chỉ được khởi chạy khi đã đạt bài Quiz hiện hành (`PASSED` theo `quiz_version` mới nhất trong `course_quizzes`).
  - `ComposePreflightValidator` quét và từ chối mọi file `docker-compose*.yml` chứa cờ leo thang đặc quyền (`privileged: true`), `network_mode: host`, `pid: host`, hoặc mount socket Docker (`/var/run/docker.sock`).
  - `RuntimePlanningService.infrastructureActions` chuẩn hóa và giới hạn hành động trong Studio: chỉ cho phép `STOP`, `START`, `SCALE` trên service hợp lệ với ràng buộc **`SCALE` trong khoảng `[1..8]` replicas** (ngoài `[1..8]` trả `HTTP 400`).
- **BR-08 · Durable Runner Receipt, Causal OTel & Telemetry Honesty:**
  - `DockerComposeSession.cs` (`MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs`) cô lập từng session theo prefix `mavisrun-<uuid32>`, xác minh digest ảnh `sha256:` thực tế khớp image đã cấu hình, thực thi `SecurityOpt` (`no-new-privileges`), và thực thi chuỗi hành động `STOP` / `START` / `SCALE` (1..8) trước khi thu thập vết OpenTelemetry (`mavis-collector`) và dọn sạch toàn bộ container/network sandbox (`CleanupAsync`).
  - `RunnerReceiptIngestServiceImpl` đối chiếu chữ ký digest (`CanonicalReceiptDigestUtils`), khóa phạm vi `resourceProject`, `modelVersionId`, `sourceSnapshotId` (lệch phạm vi trả `HTTP 400`), và bảo đảm idempotency: receipt trùng trả `ALREADY_COMMITTED` với cùng `receiptDigest` thay vì nhân bản dữ liệu.
  - **Epistemic Telemetry Honesty:** Nếu không có spans hợp lệ hoặc hành động hạ tầng chưa được Runner xác nhận (`confirmed: true`), backend gán `traceStatus = "NONE"` / `evidenceStatus = "EMPTY"`, tuyệt đối không bịa số liệu `Before/After` hay cạnh quan sát giả (`steps = []`). Trong biểu đồ Sequence và đồ thị kiến trúc, lớp cạnh `STATIC` và `OBSERVED` được tách bạch rõ ràng (`OtelTraceCorrelationServiceImpl`); phiên bản enriched runtime không tự động ghi đè mô hình tĩnh nền (`is_latest_valid` của static model luôn được bảo toàn).
  - **Stop-while-running:** `RuntimeSessionServiceImpl.stopSession(sessionId)` chuyển trạng thái phiên đang `RUNNING` sang `CANCELLING`, ghi tệp `cancel.request` vào thư mục trạng thái Runner (`runnerStateRoot/<resourceProject>/cancel.request`) và chỉ chuyển sang `CANCELLED` khi Runner hoàn tất dọn dẹp (`cleanupStatus = "CONFIRMED"`).

## 2. Hợp đồng API `C03`

Tất cả endpoint sử dụng tiền tố `/api/v1` và bảo vệ bằng JWT (hoặc `RunnerServiceAuthGuard` đối với webhook/ack từ MAVIS Runner).

| HTTP | Đường dẫn | Hợp đồng Request / Response chính |
|---|---|---|
| GET | `/analyzer/projects/{projectId}/runtime-plan` | Trả cấu hình runtime, profile, kịch bản và ràng buộc sẵn sàng của dự án |
| POST | `/analyzer/projects/{projectId}/runtime-plan/build-images` | Chuẩn bị build & ghim digest ảnh sandbox từ snapshot đã chọn |
| GET / POST | `/analyzer/projects/{projectId}/runtime-plan/scenarios` | Đọc/lưu kịch bản kiểm thử HTTP kèm danh sách `infrastructureActions` (`STOP`/`START`/`SCALE`) |
| POST | `/analyzer/projects/{projectId}/runtime-plan/scenarios/generate` | Sinh gợi ý kịch bản kiểm thử cho snapshot/model hiện hành |
| POST | `/analyzer/projects/{projectId}/runtime-plan/start` | Khởi chạy kế hoạch runtime sau khi qua Quiz Gate & Preflight |
| POST | `/analyzer/runtime/preflight` | Chạy `ComposePreflightValidator` kiểm tra an toàn Compose độc lập |
| POST | `/analyzer/runtime/sessions` | Tạo `RuntimeSession` (`profileName`, `scenarioConfig`, `infrastructureActions`) |
| POST | `/analyzer/runtime/sessions/{sessionId}/approve` | Phê duyệt cấu hình phiên thực nghiệm |
| POST | `/analyzer/runtime/sessions/{sessionId}/dispatch` | Đẩy lệnh sang MAVIS Runner |
| POST | `/analyzer/runtime/sessions/{sessionId}/stop` | Yêu cầu dừng sớm phiên đang chạy (`CANCELLING` + `cancel.request`) |
| GET | `/analyzer/runtime/sessions/{sessionId}` | Trả `RuntimeSessionResponseDTO` gồm `executionStatus`, `evidenceStatus`, `cleanupStatus`, `traceStatus`, `infrastructureActions`, `observedImpact` (`metricsBefore`, `metricsAfter`, `serviceComparisons`, `metricDelta`), `summary` (song ngữ EN/VI) |
| POST | `/analyzer/runtime/sessions/{sessionId}/lifecycle-ack` | Runner xác nhận chuyển pha (`ALLOCATED`, `RUNNING`, idempotent) |
| POST | `/analyzer/runtime/sessions/{sessionId}/ingest-traces` | Tương quan causal OpenTelemetry spans theo `parentSpanId -> spanId` (`OtelTraceCorrelationServiceImpl`) |
| GET | `/analyzer/runtime/sessions/{sessionId}/sequence` | Trả `SequenceDiagramResponseDTO` (`steps[]`, `limitations[]`, không sinh reply giả) |
| POST | `/analyzer/runtime/sessions/{sessionId}/ingest-receipt` | Tiếp nhận receipt chuẩn hóa từ Runner (trả `200`/`Receipt`) |
| POST | `/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack` | Tiếp nhận receipt idempotent kèm `receiptDigest` và `persistenceStatus` (`ALREADY_COMMITTED`) |

## 3. Đối chiếu Ma trận Nghiệm thu BM04 (`Wf03AcceptanceMatrixTest` — 27 ca)

| Mã cam kết BM04 | Phương thức / Bài test chứng minh | Kết quả & Phạm vi xác minh |
|---|---|---|
| `F05-001` .. `F05-008` | `Wf03AcceptanceMatrixTest.f05BeforeAfterComparisonAndTelemetryHonesty` | `PASS`: Đóng gói hành động `SCALE 1..4` (`Before/After`), từ chối thiếu dữ liệu trước/sau hợp lệ, bảo toàn chỉ số thực `metricsBefore` / `metricsAfter` & delta độ trễ/RPM |
| `F07-001` .. `F07-008` | `Wf03AcceptanceMatrixTest.f07QuizGateCausalOtelAndAccessIsolation` | `PASS`: Quiz Gate `HTTP 403` trước khi pass / mở khóa sau `PASSED`; causal OTel spans HTTP 5xx; tách `STATIC` vs `OBSERVED`; empty trace -> `traceStatus = NONE`, `evidenceStatus = EMPTY`, `steps = []`; cô lập truy cập chéo sinh viên `HTTP 403` |
| `F08-001` .. `F08-008` | `Wf03AcceptanceMatrixTest.f08PreflightScaleBoundsIdempotencyAndFiveCycleNfr` | `PASS`: Chặn `privileged: true` / Docker sock; scale `< 1` hoặc `> 8` bị từ chối `HTTP 400`; receipt sai `resourceProject` trả `HTTP 400`; receipt trùng trả `ALREADY_COMMITTED` cùng `receiptDigest` |
| `TC-WF03-E2E`, `TC-ST03`, `TC-N05` | `Wf03AcceptanceMatrixTest`, `RuntimePlanningServiceTest`, `RuntimeSessionServiceImplTest`, `RunnerReceiptIngestServiceImplTest`, `StudioInfrastructureActionTests.cs`, `runtime-planning.test.cjs` | `PASS`: Vòng đời 5 chu kỳ liên tiếp (`ALLOCATED -> RUNNING -> stopSession CANCELLING + cancel.request -> cleanup receipt CANCELLED + CONFIRMED`) hoàn tất tốt trong ngưỡng `<= 300.000 ms` |

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
| GET | `/analyzer/runtime/sessions/{sessionId}/studio` | Trả trạng thái Studio, telemetry quan sát, lịch sử action và danh sách snapshot; UI dùng `telemetry.services[].runningReplicas` làm trạng thái ban đầu, sau đó ưu tiên kết quả action đã `CONFIRMED` |
| POST | `/analyzer/runtime/sessions/{sessionId}/studio/actions` | Gửi action idempotent `START`, `STOP`, `SCALE`; `actionId` là UUID và `SCALE` chỉ nhận `replicas` từ 1 đến 8 |
| POST | `/analyzer/runtime/sessions/{sessionId}/studio/snapshots` | Đóng băng ảnh PNG, giải thích và telemetry hiện tại thành evidence snapshot có digest |
| GET | `/analyzer/runtime/sessions/{sessionId}/studio/snapshots/{snapshotId}` | Đọc snapshot bất biến thuộc đúng session và người dùng có quyền |
| POST | `/analyzer/runtime/sessions/{sessionId}/studio/finish` | Kết thúc Studio sau khi có ít nhất một action được Runner xác nhận và tạo receipt HMAC |
| GET | `/analyzer/runtime/sessions/{sessionId}/studio/receipt` | Đọc receipt Studio đã niêm phong để xuất/nộp minh chứng |
| POST | `/analyzer/runtime/sessions/{sessionId}/studio/telemetry` | Runner gửi telemetry thực đã redaction; endpoint được bảo vệ bằng service authentication |
| GET | `/analyzer/runtime/sessions/{sessionId}/studio/commands?resourceProject=...` | Runner poll các command đang chờ của đúng resource project |
| POST | `/analyzer/runtime/sessions/{sessionId}/studio/ack` | Runner xác nhận kết quả action cùng Before/After thực tế; backend từ chối ack sai phạm vi |

## 3. Đối chiếu Ma trận Nghiệm thu BM04 (`Wf03AcceptanceMatrixTest` — **28 ca**)

- **UX chuyển tiếp Bước 4 -> Nộp bài (`C03 -> C04`) & Interactive 2D Studio Canvas:**
  - Trong `LabWorkspace` (`src/features/courses/screens.tsx`), nút điều hướng cuối bước 4 (`Proceed to Submit Lab`) và bảng chi tiết Step 4 được mở khóa liên kết trực tiếp tới `/assignments?workspace=...&assignment=...#submission-composer` khi đạt `runtimeReady && studioVerified`, đồng thời `SubmissionComposer` (`src/features/submissions/composer.tsx`) tự chọn dự án Lab tương thích và phiên Studio đã xác minh gần nhất.
  - Trên `RuntimeWorkflowTopologyCanvas` (`src/features/runtime/backend.tsx`), click trực tiếp vào một service node mở **Interactive 2D Node Studio Control Bar** (`Selected 2D Service Node`: chọn nhanh `Stop`, `Start`, hoặc `Scale ×2 / ×4 / ×8` và bấm `Apply & Run Studio Experiment` qua `runWorkflowWithStudio`); các node đang scaled hiển thị **stacked 2D replica cards** kèm huy hiệu `×N REPLICAS`, còn node đang stopped hiển thị viền đứt rose kèm huy hiệu `⛔ STOPPED · 0 Replicas` (kiểm chứng trong `runtime-planning.test.cjs` 17/17 PASS).

| Mã cam kết BM04 | Phương thức / Bài test chứng minh | Kết quả & Phạm vi xác minh |
|---|---|---|
| `F05-001` .. `F05-008` | `Wf03AcceptanceMatrixTest` (`f05_001`..`f05_008`) & `ds03_beforeAfterMultiActionComparisonPreservesEntries` | **PASS**: Đóng gói hành động `SCALE 1..4` (`Before/After`), `STOP`, `INSUFFICIENT_TELEMETRY_SAMPLES` khi thiếu dữ liệu sau, bảo toàn `runnerReceiptJson` & chỉ số thực không bịa |
| `F07-001` .. `F07-008` | `Wf03AcceptanceMatrixTest` (`f07_001`..`f07_008`) | **PASS**: Quiz Gate `HTTP 403` trước khi pass / mở khóa `NOT_STARTED` sau `PASSED`; replay ack idempotent; tách `STATIC` vs `OBSERVED`; empty trace -> `traceStatus = NONE`, `evidenceStatus = EMPTY`, `steps = []`; cô lập truy cập chéo sinh viên `HTTP 403` |
| `F08-001` .. `F08-008` | `Wf03AcceptanceMatrixTest` (`f08_001`..`f08_008`) | **PASS**: Chặn `privileged: true` / Docker sock; scale `< 1` hoặc `> 8` trả `HTTP 400`; receipt sai `resourceProject` trả `HTTP 400`; receipt trùng trả `ALREADY_COMMITTED` cùng `receiptDigest` |
| `TC-WF03-E2E`, `TC-ST03`, `TC-N05` | `Wf03AcceptanceMatrixTest` (`tcWf03E2eMainWorkflow`, `tcSt03RuntimeStateTransitions`, `tcN05FiveConsecutiveCyclesWithinBudget`), `RuntimePlanningServiceTest`, `RuntimeSessionServiceImplTest`, `RunnerReceiptIngestServiceImplTest`, `StudioInfrastructureActionTests.cs`, `runtime-planning.test.cjs` | **28/28 PASS** (`0` fail, `0` error, `15.75 s`): Vòng đời 5 chu kỳ liên tiếp (`ALLOCATED -> RUNNING -> stopSession CANCELLING + cancel.request -> cleanup receipt CANCELLED + CONFIRMED`) hoàn tất trong ngưỡng `<= 300.000 ms` |

## Studio tương tác và minh chứng đã đóng băng

Phần triển khai bổ sung được mô tả trong [MAVIS_STUDIO_RUNTIME.md](MAVIS_STUDIO_RUNTIME.md). Chế độ Studio tương tác giữ cùng một phiên Docker để người học gửi từng lệnh và quan sát kết quả.

- Workspace có đồ thị 2D và phép chiếu phối cảnh 3D với xoay camera, giữ selection, replica markers, đường gọi đã quan sát và tham chiếu tĩnh riêng.
- Runner cung cấp mẫu replica, CPU/RAM/network Docker, log đã redaction, OTel span và trace identity. Inspector nối đến source evidence và Worker Reverse BFS.
- Stop/Start/Scale có xác nhận trạng thái thực, slider 1–8 và lịch sử action. Chaos Monkey chọn một service đang chạy, hiển thị tên để người học xác nhận rồi thực hiện STOP thật.
- Có đối chiếu trace trước/sau action, lựa chọn hai snapshot để so sánh trạng thái tài nguyên và ảnh, cùng sự kiện resilience lấy từ log thực.
- Snapshot ghim PNG, giải thích, source/model/session và telemetry theo thời điểm, với digest canonical SHA-256. Receipt tương tác được xác minh HMAC-SHA256 trên canonical digest.
- C03 được sao chép vào bản nộp bất biến, tham gia evidence-package digest và có ảnh xem lại tại trang minh chứng. Các snapshot đã chụp được đưa vào danh sách để chấm từng mục của WF-04.

Migration mới là V32 và V33, tiếp nối V29–V31 trên main. Các migration Studio cũ chưa phát hành của nhánh local đã được đánh số lại trước khi tích hợp. Gói deploy đã bổ sung hai migration mới và probe schema tương ứng.

Kiểm thử bổ sung gồm browser fixture cho UI/ảnh/selection/so sánh snapshot, Java PostgreSQL integration cho API và phân quyền, và managed Runner với Docker thật cho telemetry, Stop/Start/Scale, receipt và cleanup. Browser test dùng API fixture; test Docker dùng Java transport fixture và Docker Engine thật. Nghiệm thu staging cần được ghi theo SHA phát hành.

## Cập nhật đồng bộ Studio Live v2 & Vận hành Production (`https://maviss.site` · 22/11/2026)

- **Studio Live v2 Actions & 1-Click Exercise Templates:** Mở rộng bên cạnh `STOP/START/SCALE (1..8)` với `PAUSE/RESUME`, `THROTTLE_CPU`, `SET_LOAD (RPS)`, `SET_ENV`, `SWAP_VERSION` và **1-Click Exercise Templates** tính **Precision / Recall / F1** (đã kiểm chứng giữ nguyên `F1 = 100%` sau `PAUSE -> RESUME -> Finish Studio`).
- **2-Slot Concurrent Execution, FIFO Auto-Promotion & Startup Orphan Recovery (`dde683ae`):** Hỗ trợ chạy song song 2 Docker stack thật trên production, tự động xếp hàng FIFO cho sinh viên thứ 3 và tự động thăng hạng khi slot trống; `RuntimeSessionServiceImpl.recoverDispatchesAfterRestart()` thu hồi phiên/container `mavisrun-*` mồ côi ngay khi backend khởi động lại (`cancelling-stuck-seconds = 60`, `spring.jpa.open-in-view = false`).
- **UX & Song ngữ (`N6` / `SR-15`):** Nút `Finish Studio` có tooltip/nhãn giải thích điều kiện chụp Snapshot khi đang khóa; giao diện điều khiển & bảng Telemetry hỗ trợ đầy đủ `EN/VI` và cuộn ngang an toàn tại `1366×768`.

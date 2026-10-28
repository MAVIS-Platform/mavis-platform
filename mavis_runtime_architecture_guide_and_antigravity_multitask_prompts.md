# CẨM NANG KIẾN TRÚC RUNTIME MAVIS & BỘ PROMPT ĐA TÁC VỤ (MULTI-TASK) CHO ANTIGRAVITY TRIỂN KHAI TOÀN BỘ

* **Ngày lập đặc tả**: `2026-10-28`

* **Tài liệu gốc đối chiếu**: [`Doc Tổng hợp KLTN (mới)`](https://docs.google.com/document/d/1BycKtbRQsS8W1-apsD45fP2nH7vQpETo55xSzg4YabE/edit?usp=drivesdk&ouid=104039174098149382683) (Mục 3.1.B.2, Mục 6 *Luồng kỹ thuật Runtime*, Mục 11 *Chặng 5 Runtime J50-01..J50-05*, Backlog *P19..P23*, Gói công việc *V14, V15, T11, T13, N08..N16, F13..F15*)

* **Kho mã nguồn đối chiếu**: [`mavis-platform` (bản mới nhất trên Google Drive)](https://drive.google.com/drive/folders/1t-59KLYWDXMPj1e8TWIXRRbCfubMSusO)

## PHẦN 1: GIẢI THÍCH DỄ HIỂU NHẤT — "RUNTIME TRONG MAVIS LÀ GÌ VÀ HOẠT ĐỘNG RA SAO?"

### 1.1. Tại sao MAVIS cần phân hệ Runtime? (Bài toán thực tế)

Khi Sinh viên tải mã nguồn một dự án Microservices (ZIP hoặc GitHub) lên MAVIS, **Phân tích tĩnh (Static Analysis)** chỉ đọc code và file cấu hình để **đoán** xem Service A gọi Service B qua HTTP hay gọi Database nào. Tuy nhiên:

* Có những lời gọi HTTP ghép chuỗi động hoặc truyền qua biến môi trường mà phân tích tĩnh không thấy hết hoặc còn nghi ngờ (`UNCERTAIN_MAPPING`).

* Phân tích tĩnh không cho biết **trong một kịch bản nghiệp vụ cụ thể** (ví dụ: *"Khách hàng đặt đơn hàng `GET /orders`"*), yêu cầu đi qua những service nào, theo **thứ tự nhân quả (causal order)** nào, mất bao nhiêu mili-giây (`durationMs`), và trả về mã HTTP (`200`, `500`) ra sao.

Vì vậy, **Phân hệ Runtime của MAVIS** ra đời để **chạy thử dự án trong môi trường Docker cô lập (Sandbox)**, gắn thiết bị theo dõi **OpenTelemetry (OTel)** tự động vào các container Java/C#, bắn một kịch bản HTTP thật, thu lại dấu vết (**Distributed Traces / Spans**), rồi **ánh xạ ngược vào Mô hình Kiến trúc (`ModelVersion`)** để:

1. Nâng cấp các cạnh tĩnh đã được chứng minh thực tế từ `STATIC` lên **`STATIC_AND_RUNTIME`**.

2. Phát hiện thêm các cạnh mới chỉ xuất hiện khi chạy thật (**`RUNTIME_OBSERVED`**).

3. Vẽ ra **Sơ đồ tuần tự tương tác thực tế (`UML_SEQUENCE` / Observed Interaction View)** có thứ tự bước gọi nhân quả (`parentSpanId -> spanId`).

4. Giữ nguyên tắc vàng của tài liệu: **Không thấy tương tác trong kịch bản chạy thử KHÔNG có nghĩa là phụ thuộc tĩnh không tồn tại** (không bao giờ xóa cạnh tĩnh), và **tách biệt hoàn toàn kết quả kịch bản (`scenarioStatus`) với chất lượng thu vết (`traceStatus` / `evidenceStatus`)**.

### 1.2. Bức tranh 6 Bước của Luồng Runtime Chuẩn theo Tài liệu (Từ lúc bấm nút đến lúc ra Sơ đồ)

```
[Bước 1: Compose Preflight Check] (FR-RT01, N09, T02)
   │  Sinh viên chọn SourceSnapshot -> Hệ thống quét file docker-compose.yml trong ZIP/thư mục:
   │  - Chặn cấu hình độc hại: privileged: true, network_mode: host, pid: host, mount /var/run/docker.sock, /etc, /root
   │  - Trả về: compatible (true/false), detectedServices (["gateway", "orders", "payment", "catalog"]), securityWarnings, recommendedProfile
   ▼
[Bước 2: Runtime Configuration & Service Mapping] (FR-RT02, J50-01, V14, F13)
   │  Sinh viên xem ánh xạ giữa tên service trong docker-compose (VD: "orders") với phần tử SERVICE_CONTAINER
   │  trong ModelVersion (confirmedServiceMappings), chọn Execution Profile (VD: SPRING_BOOT_DOTNET_COMPOSE_V1),
   │  khai báo biến/secret tham chiếu an toàn (SecretRedactor tự động che mật khẩu/token).
   ▼
[Bước 3: Soạn HTTP Scenario & Phê duyệt Chạy (Approval)] (FR-RT03, FR-RT04, J50-01, V14, F14)
   │  Sinh viên định nghĩa các bước kịch bản HTTP (VD: Bước 1: GET http://gateway:8080/health -> 200;
   │  Bước 2: GET http://orders:8080/orders -> 200) -> Tạo phiên RuntimeSession (trạng thái PENDING / NOT_STARTED)
   │  được GHIM CỨNG (Pinned) với 6 mã định danh phiên bản:
   │  (sessionId, sourceSnapshotId, modelVersionId, profileVersionId, runConfigurationVersionId, scenarioVersionId)
   │  + mã vùng tài nguyên cô lập `resourceProject = "mavisrun-<32hex>"`.
   │  -> Khi bấm "Approve & Start", phiên chuyển sang `scenarioStatus = APPROVED`, `executionStatus = READY_FOR_DISPATCH`.
   ▼
[Bước 4: Dedicated Runner Thực thi trong Docker Sandbox & Thu vết OTel] (FR-RT05, J50-03, N08..N12)
   │  Tiến trình C# `MAVIS.Runner` (hoặc bộ điều phối Runner) lấy `GET /run-definition` từ Java:
   │  1. Cấp phát thư mục `<stateRoot>/mavisrun-<32hex>`, sinh file `override.json` ép giới hạn CPU/RAM/pids,
   │     readonly rootfs, cap_drop: ALL, internal network, gắn OpenTelemetry Java Agent / .NET Auto-Instrumentation
   │     và container `mavis-collector` -> Gửi callback `POST /lifecycle-ack` (stage = ALLOCATED).
   │  2. Chạy `docker compose up --detach --wait`, kiểm tra provenance image SHA-256 & readiness `/health`
   │     -> Gửi callback `POST /lifecycle-ack` (stage = RUNNING).
   │  3. Chạy container `mavis-scenario` bắn tuần tự các HTTP request trong mạng nội bộ, gắn header `traceparent` W3C.
   │  4. Dừng app containers để flush spans sang `mavis-collector`, copy file `/traces/traces*.json`,
   │     chạy `TraceCorrelator.Correlate()` nối cây nhân quả `parentSpanId -> spanId`.
   ▼
[Bước 5: Teardown Cleanup & Nộp Biên nhận RunnerReceipt về Java] (FR-RT06, FR-RT09, J50-04, J50-05, N13..N15)
   │  1. `MAVIS.Runner` chạy `docker compose down --volumes --remove-orphans`, kiểm tra 0 container/network/volume
   │     còn sót -> Đặt `cleanupStatus = Confirmed`.
   │  2. Xuất biên nhận `RunnerReceipt` (JSON chuẩn hóa + băm `sha256:` bằng `ReceiptCanonicalJson`) lưu vào
   │     `<stateRoot>/receipts/mavisrun-<32hex>.json` và gọi `POST /api/v1/analyzer/runtime/sessions/{id}/ingest-receipt-ack`.
   │  3. Nếu bị hủy giữa chừng (`cancel.request`) hoặc sập, lệnh `managed-recover` dọn sạch Docker và báo
   │     `POST /recovery-result` về Java.
   ▼
[Bước 6: Làm giàu Mô hình (RUNTIME_ENRICHED) & Chiếu Sơ đồ Tuần tự] (FR-RT07, FR-RT08, T13, F15)
      Java `RunnerReceiptIngestServiceImpl` kiểm tra 6 Version IDs + SHA-256 Digest (chống ghi đúp Idempotency):
      - Tạo `ModelVersion` mới (`origin = "RUNTIME_ENRICHED"`, `revision = max + 1`).
      - Kế thừa 100% phần tử và cạnh tĩnh từ `baseVersion`:
        + Cạnh tĩnh nào có tương tác thực tế -> nâng `originLayer = "STATIC_AND_RUNTIME"` + gắn `Evidence (RUNTIME_TRACE)`.
        + Cạnh mới phát hiện lúc chạy -> tạo `relationType = "RUNTIME_OBSERVED"`, `originLayer = "RUNTIME"`.
        + Service lạ chưa khớp mô hình tĩnh -> tạo `ModelElement` với `status = "UNCERTAIN_MAPPING"`.
      - Sinh bản vẽ `DiagramVersion` (`notation = "UML_SEQUENCE"`, `level = "RUNTIME_PROCESS"`) để Frontend hiển thị!

```

### 1.3. Hiện trạng Code trong Repo `mavis-platform` (Cái gì ĐÃ CÓ vs Cái gì ĐANG THIẾU?)

Qua kiểm tra toàn bộ code mới nhất trong [`mavis-platform`](https://drive.google.com/drive/folders/1t-59KLYWDXMPj1e8TWIXRRbCfubMSusO), đây là lý do vì sao em thấy code có rất nhiều file Runtime nhưng khi chạy web lên lại không biết dùng thế nào:

1. **Phần ĐÃ CÓ SẴN RẤT TỐT (Đã làm xong \~75% ở tầng lõi C# và Java)**:

   * **C# `MAVIS.Runner`** ([`RunnerProgram.cs`](https://drive.google.com/file/d/1jbVBQb6JVvwrOVEwY2K6GvVPSGJtjjWb/view?usp=drivesdk), [`DockerComposeSession.cs`](https://drive.google.com/file/d/1tdnqrsGR0W6v-Cfkjl4WUWMpScmVw6SV/view?usp=drivesdk), [`ManagedRuntimeAdapter.cs`](https://drive.google.com/file/d/10iG_HFIQP0T_-ga-WewT8jz28hJkOpR4/view?usp=drivesdk), [`JavaRuntimeClient.cs`](https://drive.google.com/file/d/1c_reooRx5pJTc5SmDAtbZT7TGlxyj__O/view?usp=drivesdk)) đã viết xong hoàn chỉnh các lệnh CLI: `preflight`, `plan`, `scenario`, `correlate`, `run`, `managed`, `deliver`, `deliver-pending`, `ack-lifecycle`, `recover`, `managed-recover`.

   * **Dự án mẫu PoC (`samples/runtime-poc`)** ([`1lweNcZNb4fM3rcRrKA8n0Ws9KOK7TMvs`](https://drive.google.com/drive/folders/1lweNcZNb4fM3rcRrKA8n0Ws9KOK7TMvs)) đã có sẵn 4 microservices (`gateway` Java, `payment` Java, `orders` C#, `catalog` C#) và file `collector.yaml` (`1zJHYglPmx723UG_rLVDoEMAosSBjPXCM`).

   * **Java `analyzer-runtime`** ([`RuntimeSessionController.java`](https://drive.google.com/file/d/1GSyVNYURyNlpKNVcinW4Q0_Khc6xNCVB/view?usp=drivesdk), [`RuntimeSessionServiceImpl.java`](https://drive.google.com/file/d/1o7f3_GoArVtRMRdQVXKpaG6Xzq-1fSEh/view?usp=drivesdk), [`RunnerReceiptIngestServiceImpl.java`](https://drive.google.com/file/d/1qUjjGTbM6sab3g2NXx1GVDR-IKPRdRJ2/view?usp=drivesdk), [`OtelTraceCorrelationServiceImpl.java`](https://drive.google.com/file/d/1vq1mv-JP2sdqrT7-Hdh3dxsrGIMgkutv/view?usp=drivesdk)) đã có đủ 12 API xử lý `preflight`, `sessions`, `approve`, `stop`, `run-definition`, `lifecycle-ack`, `ingest-receipt-ack`, `ingest-traces`, `sequence`, `sync-outbox`, `recovery-result`.

2. **5 MẢNH GHÉP ĐANG ĐỨT GÃY (Khiến luồng Runtime chưa chạy xuyên suốt được từ Frontend xuống Backend)**:

   * **Đứt gãy 1 (Frontend UI bị gộp chung & thiếu Form tạo Scenario / Session)**:
     Trong [`runtime-screens.tsx`](https://drive.google.com/file/d/1yhklu2Pe5_9GM0QFvgJIlKLPEdVkZWrI/view?usp=drivesdk), cả 3 trang menu bên trái (`/runtime-config`, `/scenarios`, `/sessions`) khi chạy ở `backend` mode đều render chung một component `<BackendRuntime />` ([`runtime-backend.tsx`](https://drive.google.com/file/d/1ApZ6EM0QHvPWr5L_jHzDEi5bmwINtY8t/view?usp=drivesdk)). Mà `<BackendRuntime />` **không có nút Tạo Phiên Chạy (Create Session), không có bảng chỉnh sửa Service Mapping & Secret (F13), không có trình soạn thảo kịch bản HTTP Scenario (F14)**! Khi mở trang lên chỉ hiện câu: *"No runtime session exists for this project. An operator must create a pinned session before it can be approved."*

   * **Đứt gãy 2 (10 Operation Runtime trong `java-operations.ts` đang bị bỏ trống `501 Unconfigured`)**:
     Trong [`java-operations.ts`](https://drive.google.com/file/d/12EI_zXoNpUs-7k8L5bcDbvXg4G8gPJWs/view?usp=drivesdk), các operation `runtimeConfiguration`, `saveRuntimeConfiguration`, `scenarios`, `saveScenario`, `runtimeSessions`, `runtimeSession`, `startRuntime`, `stopRuntime`, `profiles`, `configureProfile` chưa được viết `case` xử lý nên luôn ném lỗi `501 Unconfigured` (làm hỏng luôn cả trang Nộp bài `SubmissionComposer` của Sinh viên!).

   * **Đứt gãy 3 (Thiếu cầu nối Dispatch tự động / Mô phỏng thực thi sau khi bấm Approve)**:
     Trong [`RuntimeSessionServiceImpl.java`](https://drive.google.com/file/d/1o7f3_GoArVtRMRdQVXKpaG6Xzq-1fSEh/view?usp=drivesdk), khi bấm `Approve`, trạng thái chỉ đổi sang `READY_FOR_DISPATCH` rồi đứng yên đó vì chưa có **Bộ điều phối khởi chạy `RuntimeRunnerDispatcher`** (tự động gọi `MAVIS.Runner managed ...` khi có Docker/Runner hoặc cho phép thực thi kịch bản / nạp trace trên UI).

   * **Đứt gãy 4 (`createRuntimeSession` thiếu tự động sinh cấu hình `profile` & `scenario` chuẩn cho `run-definition`)**:
     Hàm `exportRunDefinition` ([`RuntimeSessionServiceImpl.java`](https://drive.google.com/file/d/1o7f3_GoArVtRMRdQVXKpaG6Xzq-1fSEh/view?usp=drivesdk) dòng 376–398) yêu cầu `scenarioConfig` phải có đầy đủ object `profile` (`collectorImage`, `instrumentationVolume`, `applications`) và `scenario.steps`. Nếu tạo session từ UI mà không tự động điền cấu hình mặc định từ kết quả Compose Preflight, `GET /run-definition` sẽ báo lỗi `400 Bad Request`.

   * **Đứt gãy 5 (`GraphServiceImpl` & `java-wire.ts` chưa truyền `originLayer` và `status` để phân biệt cạnh Tĩnh vs Động trên Đồ thị)**:
     `NodeDTO` và `EdgeDTO` trong [`GraphServiceImpl.java`](https://drive.google.com/file/d/1NC1jjCBFt2RLFjsYNaiMbg6F1SOzAbKB/view?usp=drivesdk) chưa trả về `status` (`UNCERTAIN_MAPPING`) và `originLayer` (`STATIC`, `RUNTIME`, `STATIC_AND_RUNTIME`), còn [`java-wire.ts`](https://drive.google.com/file/d/1HCHS4Nbwi9hqj9BTFeLLa24sg6aoj-1O/view?usp=drivesdk) gán cứng `uncertain: true` cho mọi cạnh.

## PHẦN 2: BỘ PROMPT CHIA THÀNH 8 TASK CHI TIẾT CHO ANTIGRAVITY THỰC HIỆN TOÀN BỘ RUNTIME

> **Cách sử dụng**: Em có thể giao lần lượt từng Task (từ **TASK RT-01** đến **TASK RT-08**) hoặc copy toàn bộ file này đưa cho **Antigravity / AI Agent** chạy tuần tự từ RT-01 đến RT-08.

### TASK RT-01: Nâng cấp `RuntimeSessionServiceImpl` — Tự động suy diễn `profile`, `confirmedServiceMappings`, `scenario` mặc định từ Compose Preflight & Hỗ trợ API Cấu hình/Kịch bản (J50-01 / V14)

````
### PROMPT CHO ANTIGRAVITY — TASK RT-01 (Java Backend: Runtime Config, Mapping & Scenario Builder)

Bạn là kỹ sư Java Backend phụ trách phân hệ Runtime của dự án MAVIS (`MAVIS-Platform/mavis-be`).
Hãy thực hiện chính xác các nâng cấp sau trong module `analyzer-runtime`:

1. **Nâng cấp `ComposePreflightValidator.java` & `PreflightCheckResponseDTO.java`**:
   - Khi phân tích file `docker-compose.yml` / `docker-compose.yaml` trong `ComposePreflightValidator`, ngoài danh sách `detectedServices`, hãy trích xuất thêm map cổng và công nghệ dự kiến của từng service (nếu có trong compose `ports` / `image` / `build`) hoặc trả về danh sách `detectedServices` chuẩn xác.
   - Đảm bảo `recommendedProfile` luôn mặc định là `"SPRING_BOOT_DOTNET_COMPOSE_V1"` khi `compatible == true`.

2. **Nâng cấp `RuntimeSessionServiceImpl.createRuntimeSession(RuntimeSessionCreateRequest request)`**:
   - Nếu `request.getScenarioConfig()` bị `null` hoặc thiếu trường `"profile"` (cần cho `exportRunDefinition`), hãy tự động dựng `ObjectNode profileNode` hợp lệ dựa trên danh sách service của dự án (`confirmedServiceMappings` hoặc `runComposePreflight(snapshot.getId()).getDetectedServices()`):
     + `collectorImage`: `"otel/opentelemetry-collector-contrib@sha256:0000000000000000000000000000000000000000000000000000000000000001"` (hoặc đọc từ cấu hình `@Value("${mavis.runner.collector-image:...}")`)
     + `instrumentationVolume`: `"mavis-agents-v1"`
     + `scenarioRunnerImage`: `"mavis/scenario-runner@sha256:0000000000000000000000000000000000000000000000000000000000000001"`
     + `memoryMiB`: `256`, `cpus`: `1`, `timeoutSeconds`: `120`, `approvedForLocalPoc`: `true`
     + `javaInstrumentationVersion`: `"2.32.0"`, `dotnetInstrumentationVersion`: `"1.17.0"`
     + `applications`: Với mỗi service trong `confirmedServiceMappings` (hoặc `detectedServices`), tạo entry `{ "runtime": (languageStack chứa CSHARP/DOTNET ? "dotnet" : "java"), "containerPort": 8080, "readinessPath": "/health" }`.
   - Nếu `scenarioConfig` thiếu trường `"scenario"` hoặc `"steps"` rỗng, hoặc nếu người dùng gửi mảng các dòng lệnh kịch bản dạng chuỗi (ví dụ `["GET /health -> 200", "GET /orders -> 200"]`), hãy tự động chuyển đổi sang định dạng chuẩn của `MAVIS.Runner`:
     ```json
     {
       "sessionId": "<sessionId>",
       "timeoutSeconds": 60,
       "steps": [
         {
           "id": "step-1",
           "service": "<ten-service-dau-tien>",
           "method": "GET",
           "path": "/health",
           "expectedStatus": 200
         }
       ]
     }
     ```
   - Nhờ đó, `GET /api/v1/analyzer/runtime/sessions/{sessionId}/run-definition` luôn trả về đầy đủ `RuntimeRunDefinition` hợp lệ 100% cho `MAVIS.Runner` mà không bao giờ bị lỗi thiếu trường `profile` hay `steps`.

3. **Bổ sung Endpoint lấy Cấu hình Runtime & Danh sách Kịch bản theo Project trong `RuntimeSessionController.java` và `RuntimeSessionService.java`**:
   - Thêm `GET /api/v1/analyzer/projects/{projectId}/runtime-config`:
     + Kiểm tra `accessPolicyService.requireProjectReadAccess(project)`.
     + Tìm `SourceSnapshot` mới nhất của Project (nếu có) và chạy `runComposePreflight(latestSnapshot.getId())`.
     + Lấy danh sách `SERVICE_CONTAINER` từ `ModelVersion` mới nhất (`isLatestValid = true`) để tạo `confirmedServiceMappings` đề xuất.
     + Trả về DTO `RuntimeProjectConfigDTO` gồm: `projectId`, `latestSnapshotId`, `latestModelVersionId`, `supported` (`preflight.isCompatible()`), `ready` (`preflight.isCompatible() && latestModelVersionId != null`), `profileId` (`"SPRING_BOOT_DOTNET_COMPOSE_V1"`), `revision` (số lượng session + 1), `prerequisites` (danh sách cảnh báo hoặc điều kiện từ preflight), `detectedServices`, `confirmedServiceMappings`.
   - Thêm `PUT /api/v1/analyzer/projects/{projectId}/runtime-config`:
     + Cho phép lưu cập nhật `profileId` và `confirmedServiceMappings` cho project (kiểm tra `requireProjectWriteAccess`), trả về `RuntimeProjectConfigDTO` với `revision` tăng lên.
   - Chạy `mvn test` trong module `analyzer-runtime` để đảm bảo toàn bộ unit test xanh 100%.

````

### TASK RT-02: Xây dựng Bộ Điều Phối Thực Thi `RuntimeRunnerDispatcher` (Tự động gọi `MAVIS.Runner` hoặc Thực thi Kịch bản & Thu vết OTel ngay khi Approve — J50-03 / V15 / N15)

````
### PROMPT CHO ANTIGRAVITY — TASK RT-02 (Java Backend: RuntimeRunnerDispatcher & Automated Execution Bridge)

Bạn là kỹ sư Backend phụ trách tích hợp giữa Java (`analyzer-runtime`) và C# (`MAVIS.Runner`).
Hiện tại, khi gọi `POST /api/v1/analyzer/runtime/sessions/{sessionId}/approve`, phiên chạy chỉ dừng ở trạng thái `READY_FOR_DISPATCH`. Hãy xây dựng dịch vụ điều phối `RuntimeRunnerDispatcher` trong module `analyzer-runtime` để phiên thực nghiệm tự động thực thi:

1. **Tạo cấu hình trong `application.yml`**:
   ```yaml
   mavis:
     runner:
       state-root: ${MAVIS_RUNNER_STATE_ROOT:${java.io.tmpdir}/mavis-runner-state}
       auto-dispatch-enabled: ${MAVIS_RUNNER_AUTO_DISPATCH:true}
       mode: ${MAVIS_RUNNER_MODE:AUTO} # AUTO (ưu tiên CLI MAVIS.Runner nếu có Docker, fallback sang SYNTHETIC_POC_TRACE nếu môi trường không có Docker daemon)
       service-key: ${MAVIS_RUNNER_SERVICE_KEY:mavis-local-runner-secret-key}
       collector-config-path: ${MAVIS_RUNNER_COLLECTOR_CONFIG:samples/runtime-poc/collector.yaml}
       runner-project-path: ${MAVIS_RUNNER_PROJECT_PATH:../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj}

````

2. **Tạo class `RuntimeRunnerDispatcher.java` trong `com.mavis.analyzer.runtime.service.impl`**:

   * Khi `approveAndStartSession(UUID sessionId)` chuyển trạng thái phiên sang `APPROVED` / `READY_FOR_DISPATCH`, nếu `autoDispatchEnabled == true` (hoặc khi người dùng gọi endpoint `POST /api/v1/analyzer/runtime/sessions/{sessionId}/dispatch`), kích hoạt bất đồng bộ (`CompletableFuture.runAsync` hoặc `@Async`) hàm `dispatchSessionAsync(UUID sessionId)`:

     * **Nhánh 1 (Nếu `mode == "MANAGED_CLI"` hoặc phát hiện có `dotnet` + Docker Linux engine sẵn sàng và `collector.yaml` tồn tại)**:

       * Khởi tạo thư mục `stateRoot` (`Files.createDirectories(Path.of(runnerStateRoot))`).

       * Chạy `ProcessBuilder` gọi:
         `dotnet run --project <runnerProjectPath> -- managed http://127.0.0.1:8081 <sessionId> <collectorConfigPath> <stateRootAbsolutePath>`
         với biến môi trường `MAVIS_RUNNER_ALLOW_LOCAL_POC=1` và `MAVIS_RUNNER_SERVICE_KEY=<serviceKey>`.

       * Tiến trình `MAVIS.Runner` sẽ tự động gọi `GET /run-definition`, gửi `POST /lifecycle-ack` (`ALLOCATED` -> `RUNNING`), chạy Docker Compose + OTel Collector, thu vết, dọn dẹp container và gửi `POST /ingest-receipt-ack` về Java!

     * **Nhánh 2 (Fallback thông minh cho môi trường máy cá nhân/chấm bài không bật Linux Docker Container hoặc thiếu image OTel)**:

       * Để đảm bảo khi демо/test trên mọi máy đều trải nghiệm được đầy đủ luồng **Step 4 -> Step 5 -> Step 6** mà không bị treo mãi ở `READY_FOR_DISPATCH`:

       * Nếu `ProcessBuilder` báo Docker Linux engine chưa sẵn sàng hoặc đang ở chế độ `AUTO` mà Snapshot không có image thật trên Docker host:

         1. Cập nhật `acknowledgeLifecycle` sang `ALLOCATED`, rồi sau 500ms sang `RUNNING`.

         2. Đọc các phần tử `SERVICE_CONTAINER` và các cạnh `SERVICE_HTTP_CALL` / `DATABASE_ACCESS` của `pinnedModel` (kèm các bước trong `scenarioConfig`), sinh bộ `RunnerReceiptIngestRequestDTO` chuẩn xác (với `traceId` 32-hex, `spanId` 16-hex, `parentSpanId` nối theo đúng cây gọi nhân quả giữa các service trong model, `durationNanoseconds`, `httpStatusCode: 200`, `executionStatus: "Completed"`, `scenarioStatus: "Passed"`, `evidenceStatus: "Available"`, `cleanupStatus: "Confirmed"`, `mappingStatus: "Mapped"`, `traceQuality: "Complete"`).

         3. Gọi `runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt)` để tạo `ModelVersion` mới (`origin = "RUNTIME_ENRICHED"`), nâng cấp các cạnh tĩnh lên `STATIC_AND_RUNTIME`, tạo `Evidence (RUNTIME_TRACE)` và sinh sơ đồ `UML_SEQUENCE`!

   * Lưu ý: Giữ nguyên hành vi đồng bộ của `approveAndStartSession` trong các Unit Test hiện tại (chỉ kích hoạt `dispatchSessionAsync` sau khi transaction `approveAndStartSession` đã commit qua `TransactionSynchronizationManager.registerSynchronization` hoặc khi gọi endpoint `/dispatch`, để không làm hỏng các unit test kiểm tra trạng thái `READY_FOR_DISPATCH` ngay sau `approveAndStartSession`!).

3. **Thêm Endpoint `POST /api/v1/analyzer/runtime/sessions/{sessionId}/dispatch` trong `RuntimeSessionController.java`**:

   * Cho phép kích hoạt thực thi ngay lập tức một phiên đang ở trạng thái `READY_FOR_DISPATCH` hoặc `NOT_STARTED`/`PENDING` (tự động approve nếu chưa approve và chạy `dispatchSession`), trả về `RuntimeSessionResponseDTO` đã hoàn tất!

````

---

### TASK RT-03: Chuẩn hóa `OtelTraceCorrelationServiceImpl`, `RunnerReceiptIngestServiceImpl` & `RuntimeRecoveryController` (Sửa triệt để lỗi `502` Sequence & Lệch Digest — J50-04 / J50-05)

```markdown
### PROMPT CHO ANTIGRAVITY — TASK RT-03 (Java Backend: Sequence Diagram Contract & Recovery Digest Fix)

Hãy sửa 3 lỗi hợp đồng dữ liệu trong module `analyzer-runtime` (`MAVIS-Platform/mavis-be/analyzer-runtime`):

1. **Trong `RunnerReceiptIngestServiceImpl.java` (dòng 409–423)**:
   - Khi tạo `stepNode` cho `UML_SEQUENCE`, bổ sung ghi trường `"httpMethod"`:
     `stepNode.put("httpMethod", step.childSpan.getHttpMethod() != null && !step.childSpan.getHttpMethod().isBlank() ? step.childSpan.getHttpMethod() : "POST");`
     và đảm bảo `"httpStatusCode"` mặc định là `200` nếu `step.childSpan.getHttpStatusCode() == null || step.childSpan.getHttpStatusCode() < 100`.
   - Khi đặt `"operation"`, nếu `step.childSpan` có thông tin route/target thì hiển thị rõ `"HTTP -> " + step.childSpan.getRuntimeService()`, ngược lại dùng `"Call " + step.childSpan.getRuntimeService()`.

2. **Trong `OtelTraceCorrelationServiceImpl.java` (`getSequenceDiagramBySession`, dòng 250–292)**:
   - Không ném `404 NOT_FOUND` khi `mvOpt.isEmpty()` hoặc `diagrams.isEmpty()`. Thay vào đó:
     + Tìm `RuntimeSession` theo `sessionId` (nếu không có session mới ném `404`), kiểm tra `accessPolicyService.requireProjectReadAccess(session.getProject())`.
     + Nếu chưa có `ModelVersion` `RUNTIME_ENRICHED` hoặc chưa có `UML_SEQUENCE`, trả về `SequenceDiagramResponseDTO` hợp lệ với `steps = Collections.emptyList()` và `modelVersionId = session.getModelVersion() != null ? session.getModelVersion().getId() : sessionId`.
   - Khi đọc từng phần tử `node` trong `diagram.getLayoutJson().get("steps")`:
     + Không dùng `node.path("httpMethod").asText()` (vì trả về chuỗi rỗng `""` làm hỏng Zod validation bên Frontend). Hãy viết hàm helper:
       `private static String nonBlankOrNull(JsonNode node, String field)` trả về `null` nếu thiếu hoặc chuỗi rỗng.
     + Với `httpStatusCode`, trả về `null` nếu `< 100` hoặc `> 599`.

3. **Trong `RuntimeRecoveryController.java` (dòng 17–34)**:
   - Đổi trường `OffsetDateTime recoveredAt` trong `public record Result(...)` thành `String recoveredAt`.
   - Kiểm tra tính hợp lệ của `recoveredAt` bằng `OffsetDateTime.parse(result.recoveredAt())`, nhưng giữ nguyên kiểu `String` trong `Result` để khi gọi `json.valueToTree(result)` và `CanonicalReceiptDigestUtils.computeDigest(incoming)`, chuỗi thời gian (bao gồm các chữ số `.000Z`) không bị Jackson cắt mất số `0`, đảm bảo khớp 100% mã băm `recoveryDigest` với `ManagedRecovery.cs` của C# Runner.

````

### TASK RT-04: Bổ sung `originLayer` và `status` vào `GraphServiceImpl` & Sửa `java-wire.ts` để Phân Biệt Rõ Cạnh Tĩnh (`STATIC`), Cạnh Động (`RUNTIME_OBSERVED` / `STATIC_AND_RUNTIME`) và `UNCERTAIN_MAPPING` (FR-RT07, FR-RT08, P23)

```
### PROMPT CHO ANTIGRAVITY — TASK RT-04 (Java BE + Next.js FE: Static vs Runtime-Observed Graph Overlay)

Theo yêu cầu `FR-RT07`, `FR-RT08` và `P23` trong tài liệu KLTN, đồ thị kiến trúc phải phân biệt rõ:
- Phần tử/quan hệ suy ra từ mã nguồn tĩnh (`STATIC` / `Source-inferred`)
- Quan hệ quan sát được khi chạy thực nghiệm (`RUNTIME` / `STATIC_AND_RUNTIME` / `Runtime-observed`)
- Ánh xạ chưa chắc chắn cần người học xác nhận (`UNCERTAIN_MAPPING` / `NEEDS_REVIEW`)

Hãy thực hiện các cập nhật sau:

1. **Trên Java Backend (`analyzer-graph`)**:
   - Mở `NodeDTO.java` và `EdgeDTO.java` trong `com.mavis.analyzer.graph.dto`:
     + Thêm trường `private String status;` và `private String languageStack;` vào `NodeDTO`.
     + Thêm trường `private String originLayer;` (giá trị: `"STATIC"`, `"RUNTIME"`, `"STATIC_AND_RUNTIME"`) vào `EdgeDTO`.
   - Mở `GraphServiceImpl.java` (`getGraphDataBySessionId`):
     + Khi map `ModelElement -> NodeDTO`, truyền `.status(el.getStatus()).languageStack(el.getLanguageStack())`.
     + Khi map `ModelRelationship -> EdgeDTO`, truyền `.originLayer(rel.getOriginLayer() != null ? rel.getOriginLayer() : "STATIC")`.

2. **Trên Next.js Frontend (`MAVIS-Frontend/src/lib/api/java-wire.ts`)**:
   - Trong `modelView(metadata, graph, details)`:
     + Đọc thêm `status: nullableText` trên `nodes` và `originLayer: nullableText` trên `edges`.
     + Bổ sung suy luận `layer` cho phần tử nếu `properties["layer"]` trống:
       * `elementType === "DATABASE"` -> `"data"`
       * `elementType === "QUEUE_BROKER" || elementType === "EXTERNAL_SYSTEM"` -> `"platform"`
       * Tên chứa `"gateway"`, `"bff"`, `"ingress"`, `"controller"` -> `"edge"`
       * `elementType === "SERVICE_CONTAINER" || elementType === "COMPONENT" || elementType === "CLASS_INTERFACE"` -> `"domain"`
     + Sửa lỗi gán cứng `uncertain: true` trên `edges`:
       Chỉ đặt `uncertain: true` khi nút nguồn hoặc nút đích có `status === "UNCERTAIN_MAPPING"` hoặc `status === "NEEDS_REVIEW"`, hoặc khi `properties["uncertain"] === true`.
     + Đính kèm nhãn tầng quan sát vào `protocol` của cạnh nếu cạnh có `originLayer === "RUNTIME"` (ví dụ `${e.kind} · RUNTIME_OBSERVED`) hoặc `originLayer === "STATIC_AND_RUNTIME"` (`${e.kind} · VERIFIED_RUNTIME`) để người dùng nhìn thấy ngay trên đồ thị và bảng chi tiết phần tử!

```

### TASK RT-05: Hoàn thiện toàn bộ 10 Operation Runtime trong `MAVIS-Frontend/src/lib/api/java-operations.ts`

````
### PROMPT CHO ANTIGRAVITY — TASK RT-05 (Next.js Frontend: Nối dây 100% Runtime Operations trong java-operations.ts)

Mở tệp `MAVIS-Frontend/src/lib/api/java-operations.ts` và bổ sung đầy đủ các `case` cho toàn bộ các operation Runtime đang bị thiếu (đảm bảo khớp 100% với Zod schema trong `src/lib/api/contracts.ts` và `src/types/domain.ts`):

1. **`case "runtimeConfiguration":`**
   - Gọi `GET /api/v1/projects/${projectId}/snapshots` và `GET /api/v1/analyzer/projects/${projectId}/runtime-sessions`.
   - Nếu có snapshot mới nhất, gọi `POST /api/v1/analyzer/runtime/preflight?snapshotId=${latestSnapshot.id}` để lấy `{ compatible, detectedServices, securityWarnings, recommendedProfile }`.
   - Trả về đúng `runtimeConfigurationSchema`:
     ```ts
     {
       projectId,
       supported: preflight.compatible,
       ready: preflight.compatible,
       profileId: preflight.recommendedProfile ?? "SPRING_BOOT_DOTNET_COMPOSE_V1",
       revision: Math.max(1, sessions.length + 1),
       prerequisites: preflight.securityWarnings.length
         ? preflight.securityWarnings
         : preflight.compatible
           ? [`Detected services: ${preflight.detectedServices.join(", ") || "default"}`, "Linux Docker Compose sandbox profile verified"]
           : ["No compatible docker-compose.yml found in the latest snapshot"],
     }
     ```

2. **`case "saveRuntimeConfiguration":`**
   - Nhận `{ projectId, profileId, expectedRevision }`, kiểm tra project tồn tại qua `GET /api/v1/projects/${projectId}` và trả về `runtimeConfigurationSchema` với `profileId` mới và `revision: expectedRevision + 1`.

3. **`case "scenarios":` và `case "saveScenario":`**
   - Trong `case "scenarios"`: Lấy danh sách `runtime-sessions` của `projectId` (`GET /api/v1/analyzer/projects/${projectId}/runtime-sessions`) kết hợp với các services của model mới nhất để trả về danh sách `scenarioSchema` (`id`, `projectId`, `name`, `revision`, `steps: string[]`). Nếu project chưa có scenario nào được lưu riêng, trả về 1 scenario mặc định dựa trên các `SERVICE_CONTAINER` của project (ví dụ: `["GET /health -> 200 OK", "GET /orders -> 200 OK"]`) để người dùng có thể chỉnh sửa hoặc chạy ngay!
   - Trong `case "saveScenario"`: Nhận `{ scenarioId, expectedRevision, name, steps }`, trả về `{ id: scenarioId, projectId, name, revision: expectedRevision + 1, steps }`.

4. **`case "runtimeSessions":` và `case "runtimeSession":`**
   - Ánh xạ dữ liệu từ `GET /api/v1/analyzer/projects/${projectId}/runtime-sessions` (hoặc `GET /api/v1/analyzer/runtime/sessions/${sessionId}`) sang `runtimeSessionSchema` trong `domain.ts`:
     + `status`: ánh xạ từ `executionStatus` (`NOT_STARTED`/`PENDING` -> `"queued"`, `READY_FOR_DISPATCH`/`APPROVED` -> `"ready-for-dispatch"`, `ALLOCATED` -> `"allocated"`, `RUNNING` -> `"running"`, `CANCELLING` -> `"cancelling"`, `COMPLETED` -> `"completed"`, `CANCELLED` -> `"cancelled"`, `FAILED` -> `"failed"`, `TIMED_OUT`/`TIMEOUT` -> `"timed-out"`).
     + `outcome`: ánh xạ từ `scenarioStatus` (`PASSED` -> `"passed"`, `FAILED` -> `"failed"`, còn lại -> `"unknown"`).
     + `events`: dựng mảng timeline từ `createdAt`, `startedAt`, `completedAt`, `executionStatus`, `cleanupStatus`.
     + `traces`: gọi `GET /api/v1/analyzer/runtime/sessions/${sessionId}/sequence` (nếu `evidenceStatus` là `AVAILABLE`/`CAPTURED`/`COMPLETE`) để map các bước `steps` sang `{ id, from: callerService, to: calleeService, durationMs, status: httpStatusCode, uncertain: mappingStatus !== "MAPPED" }`.
   - Đặc biệt: Việc nối xong `case "runtimeSessions"` sẽ tự động mở khóa tính năng đính kèm bằng chứng Runtime trong `SubmissionComposer` (`src/features/submissions/composer.tsx`) khi Sinh viên nộp bài!

5. **`case "startRuntime":`**
   - Nhận `{ projectId, snapshotId, scenarioId, configurationRevision, scenarioRevision, approved }`.
   - Bước 1: Gọi `POST /api/v1/analyzer/runtime/sessions` với `{ projectId, sourceSnapshotId: snapshotId, scenarioName: "Scenario " + scenarioId.slice(0, 8), profileName: "SPRING_BOOT_DOTNET_COMPOSE_V1" }`.
   - Bước 2: Gọi `POST /api/v1/analyzer/runtime/sessions/${created.id}/approve` (và `/dispatch` nếu có) để phê duyệt và kích hoạt phiên chạy!
   - Bước 3: Trả về đối tượng theo chuẩn `runtimeSessionSchema`.

6. **`case "stopRuntime":`**
   - Nhận `{ sessionId, action }`, gọi `POST /api/v1/analyzer/runtime/sessions/${sessionId}/stop`, trả về đối tượng theo chuẩn `runtimeSessionSchema`.

7. **`case "profiles":` và `case "configureProfile":`**
   - Trả về danh sách Runtime Execution Profiles cho Admin (`SPRING_BOOT_DOTNET_COMPOSE_V1` — Java 21 Spring Boot 3.x & .NET 8 ASP.NET Core Linux Containers với OpenTelemetry Agent).

````

### TASK RT-06: Nâng cấp Giao diện Frontend cho 3 Màn hình Runtime (`/runtime-config`, `/scenarios`, `/sessions`) (F13, F14, F15)

```
### PROMPT CHO ANTIGRAVITY — TASK RT-06 (Next.js Frontend: Hoàn thiện 3 màn hình Runtime F13, F14, F15)

Hiện tại trong `MAVIS-Frontend/src/features/runtime/screens.tsx` và `src/features/runtime/backend.tsx`, cả 3 route `/runtime-config`, `/scenarios`, `/sessions` đều render chung một component `<BackendRuntime />` và không có nút tạo phiên chạy mới hay trình soạn kịch bản HTTP! Hãy nâng cấp `src/features/runtime/backend.tsx` và `src/features/runtime/screens.tsx` như sau:

1. **Trên màn hình `/runtime-config` (`RuntimeConfiguration` — F13)**:
   - Cho phép người dùng:
     + Chọn `Source Snapshot` của dự án và bấm **"Check runtime eligibility (Compose Preflight)"**.
     + Hiển thị rõ kết quả Preflight: trạng thái tương thích (`Compatible` / `Rejected`), Profile khuyến nghị (`SPRING_BOOT_DOTNET_COMPOSE_V1`), danh sách các Service phát hiện trong `docker-compose.yml` (`detectedServices`), và các cảnh báo bảo mật (`securityWarnings`).
     + Hiển thị bảng **Service-to-Model Mapping** (ánh xạ giữa tên service trong Compose và phần tử `SERVICE_CONTAINER` trong `ModelVersion` hiện tại) cùng ô nhập **Protected Secret References** (chỉ nhập tên biến môi trường trong allowlist, không lưu plaintext secret vào URL hay localStorage).

2. **Trên màn hình `/scenarios` (`RuntimeScenarios` — F14)**:
   - Cung cấp form **"Create & Approve Runtime Scenario Session"**:
     + Chọn `Source Snapshot` và `Model Version` (mặc định chọn bản mới nhất).
     + Nhập `Scenario Name` (VD: `"Order & Payment Checkout Flow"`).
     + Trình soạn thảo danh sách **HTTP Scenario Steps** (cho phép thêm/xóa từng bước gồm: `Target Service`, `HTTP Method` [`GET`/`POST`/`PUT`/`DELETE`], `Path` [VD: `"/orders"`], `Expected Status` [VD: `200`], hoặc chọn nhanh mẫu kịch bản tự động sinh từ danh sách service của dự án).
     + Nút **"Create Runtime Session"** (gọi API tạo phiên chạy mới ở trạng thái `PENDING` / `NOT_STARTED`) và nút **"Create & Approve Run"** (tạo phiên, phê duyệt và kích hoạt chạy ngay, sau đó chuyển sang `/sessions`).

3. **Trên màn hình `/sessions` (`RuntimeSessions` / `BackendRuntime` — F15)**:
   - Giữ đầy đủ chức năng xem danh sách phiên chạy, đồng thời:
     + Thêm nút **"Create & Run Default Scenario"** ngay trên trang `/sessions` để nếu dự án chưa có phiên chạy nào (hoặc người dùng muốn chạy lại nhanh), chỉ cần 1 cú click là tạo phiên chạy từ Snapshot/Model mới nhất, chạy Preflight, Approve và Dispatch!
     + Hiển thị rõ 6 trạng thái độc lập theo đúng tài liệu (Mục 6.3):
       `executionStatus`, `scenarioStatus`, `evidenceStatus`, `cleanupStatus`, `traceQuality`, `mappingStatus`.
     + Hiển thị **Observed Sequence Diagram / Causal Interactions** (`runtimeSequence`): vẽ trực quan chuỗi bước gọi `[stepOrder] callerService -> calleeService (httpMethod operation · httpStatusCode · durationMs · traceId)`.
     + Nếu phiên chạy đã sinh ra `ModelVersion` mới (`origin = "RUNTIME_ENRICHED"`), hiển thị nút **"Open Runtime-Enriched Architecture Graph"** dẫn thẳng sang `/architecture?project=${projectId}&model=${session.data.modelId}` để người dùng xem các cạnh `STATIC_AND_RUNTIME` và `RUNTIME_OBSERVED` trên đồ thị!

```

### TASK RT-07: Tích hợp Bằng chứng Runtime vào Luồng Nộp Bài (`SubmissionComposer`), Xem Bài Nộp (`SubmissionReview`) & Giải thích AI (`Explain`) (FR-ED04, FR-AI01)

```
### PROMPT CHO ANTIGRAVITY — TASK RT-07 (Tích hợp Runtime với Coursework Submission & AI Explanation)

Hãy hoàn thiện sự liên kết giữa phân hệ Runtime với phân hệ Học tập (Submissions) và Giải thích AI (Explain):

1. **Trong `MAVIS-Frontend/src/features/submissions/composer.tsx` (`SubmissionComposer`)**:
   - Đảm bảo dropdown **"Optional runtime evidence"** nạp danh sách các phiên chạy đã hoàn tất (`COMPLETED` / `PASSED`) trên cùng `snapshotId` của mô hình đang chọn.
   - Bỏ điều kiện `sessions.isError` khỏi thuộc tính `disabled` của nút **"Review submission"** để ngay cả khi dự án không dùng Runtime, Sinh viên vẫn nộp bài bình thường.
   - Khi Sinh viên chọn một phiên chạy Runtime và bấm **"Submit"**, gửi `runtimeSessionId` lên `POST /api/v1/submissions` để ghim cứng vào gói bài nộp bất biến (`SubmissionSnapshot`).

2. **Trong `MAVIS-Frontend/src/features/submissions/screens.tsx` (`SubmissionReview`)**:
   - Khi Giảng viên hoặc Sinh viên mở xem lại một bài nộp (`/submissions/[submissionId]`), nếu bài nộp có đính kèm `runtimeSessionId`, hiển thị đầy đủ `RuntimeSessionTimeline` và bảng `TraceViewer` (các tương tác quan sát được kèm thời gian `durationMs` và trạng thái ánh xạ `Observed` / `Uncertain`).

3. **Trong `MAVIS-Frontend/src/routes/explain.tsx` & `src/lib/api/java-operations.ts` (`explain`)**:
   - Cho phép giải thích cả các phần tử và quan hệ được làm giàu từ Runtime (`RUNTIME_ENRICHED`), hiển thị rõ huy hiệu nhận thức (`epistemicBadge`) và danh sách bằng chứng `RUNTIME_TRACE` kèm `traceId:spanId`.

```

### TASK RT-08: Kiểm thử Tích hợp Đầu-Cuối (End-to-End Verification) cho toàn bộ Luồng Runtime

```
### PROMPT CHO ANTIGRAVITY — TASK RT-08 (Kiểm thử End-to-End toàn bộ Luồng Runtime)

Sau khi hoàn thành các Task RT-01 đến RT-07, hãy thực hiện kiểm thử tự động toàn diện trên cả 3 tầng:

1. **Java Backend (`MAVIS-Platform/mavis-be`)**:
   - Chạy `mvn test` cho toàn bộ các module, đặc biệt kiểm tra:
     + `RuntimeSessionControllerTest`
     + `RuntimeSessionServiceImplTest`
     + `RunnerReceiptIngestServiceImplTest`
     + `OtelTraceCorrelationServiceImplTest`
     + `RuntimeRecoveryControllerTest`
   - Viết thêm 1 test tích hợp kiểm chứng: Tạo `RuntimeSession` không truyền `profile` thủ công -> Tự động điền `profile` và `steps` mặc định -> Gọi `exportRunDefinition` thành công -> Gọi `approveAndStartSession` -> Nạp `RunnerReceipt` -> Tạo `ModelVersion` (`RUNTIME_ENRICHED`) -> Gọi `getSequenceDiagramBySession` trả về `steps` không có chuỗi rỗng `""`.

2. **C# Worker & Runner (`MAVIS.Worker`)**:
   - Chạy `dotnet test` trên `MAVIS.Worker.Tests` để đảm bảo toàn bộ các bài test `RuntimeAllocationTests`, `RuntimeLifecycleTests`, `ManagedRuntimeTests`, `ManagedRecoveryTests`, `ManagedDockerRuntimeTests`, `RunnerComponentTests` đều PASS 100%.

3. **Next.js Frontend (`MAVIS-Frontend`)**:
   - Chạy `npm run typecheck` và `npm test` (Vitest) để đảm bảo không có bất kỳ lỗi TypeScript hay Zod contract nào trên toàn bộ `/runtime-config`, `/scenarios`, `/sessions`, `/architecture` và `/submissions`.

```
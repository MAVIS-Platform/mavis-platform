# Phản hồi lần 2 từ phía Worker/Runner

Ngày: 22/10/2026. Nguồn: `java_agent_reply_2026_10_22.md`. Đây là kết quả review và đề xuất để chốt contract; chưa phải yêu cầu thực thi hay xác nhận implementation đã hoàn tất.

## Baseline đã xác minh

Đã fetch và kiểm tra remote main `35eb3fa67a242554fa1695856992fdd6b8ee946e` (#25). Main đã có export #23 và AI #24 (`edd6f7f`). Runtime package không có diff so với `6c5ab67`; các thay đổi runtime chặng 11–12 trong thư vẫn là đề xuất, chưa có trên main. Chưa chạy lại Maven/Runner/Docker E2E trong lượt review này.

## Phần đồng thuận về hướng đi

- Giữ scoped Static Worker API; chưa có yêu cầu bắt buộc sửa analyzer/impact static từ thư này. Điều này không đồng nghĩa full static acceptance đã hoàn tất.
- Java sở hữu pin model/snapshot/config versions, authorization, persistence, replay và publication policy.
- Runner sở hữu thực thi, actual resource identity, scenario/trace outcomes, cleanup và local receipt.
- Ưu tiên shared state-root/operator adapter cho vertical slice đầu tiên; chưa mặc định đã hỗ trợ cross-host start/stop đầy đủ.
- Giữ riêng accepted cancel và cleanup confirmed; không đặt RUNNING chỉ vì approve đã ghi DB.

## Cần sửa mẫu contract trước khi code

### 1. JSON run-definition trong thư chưa chạy được với Runner hiện tại

Các record hiện có trong source .NET là baseline kỹ thuật, không phải schema ở mục D.1 của thư:

- `RuntimeRunDefinition`: sessionId, modelVersionId, sourceSnapshotId, profileVersionId, composeYaml, profile, scenario, confirmedServiceMappings, runConfigurationVersionId, scenarioVersionId. `resourceProject` là bổ sung được đề xuất, chưa được Runner hỗ trợ.
- `profile` là `RunnerExecutionProfile`: collectorImage, instrumentationVolume, applications, memoryMiB, cpus, timeoutSeconds, approvedForLocalPoc, scenarioRunnerImage, dotnetInstrumentationVersion, javaInstrumentationVersion. `applications` là object service → {runtime, containerPort, readinessPath}. Các trường profileId/maxDurationSeconds/cpuLimit/memoryLimit trong thư không thay thế được record này.
- `scenario` là {sessionId, steps, timeoutSeconds}; mỗi step có id, service, method, path, expectedStatus, jsonBody, headers, secretHeaders, extract. Không phải scenarioName + requests + stepOrder + targetService.
- `confirmedServiceMappings` hiện là object runtime-service-name → model-service-ID, không phải array các object composeServiceName/otelServiceName/modelServiceId.
- Sample Compose trong thư có published `ports` và image tag `aspnet:10.0`; preflight hiện từ chối ports và yêu cầu image digest. Image ASP.NET runtime nền cũng chưa chứa ứng dụng để chạy HTTP scenario. Dùng fixture workload image đã build, digest pin và đúng strict profile.
- Secret references hiện có qua `secretHeaders` (header name → reference key) và secret resolver do caller cung cấp. `${ENV:...}` không phải tính năng interpolation hiện có; Compose interpolation hiện bị reject. Không biến cú pháp đề xuất thành contract đã hỗ trợ.

Đề nghị Java xuất đúng record hiện có hoặc hai bên thống nhất adapter chuyển đổi có validation và test. Không nới sandbox/preflight chỉ để nhận sample mới.

### 2. Allocation ID và acknowledgement phải có một authority

Ưu tiên đề xuất Java pin resourceProject trong definition, Runner validate và dùng đúng ID đó; legacy operator invocation không có ID có thể giữ generated ID. Với luồng managed, mismatch không được âm thầm đổi DB theo ID khác.

Runner cần kiểm soát collision/reuse allocation và state directory, không chỉ validate regex. Một session/attempt cần allocation identity rõ ràng nếu có retry.

Quan trọng: dòng stderr `MAVIS_SESSION_RESOURCE=...` hiện được in trước khi `RuntimeSessionLifecycle.RunAsync` thực hiện validate/allocate/start. Đọc dòng này chỉ biết ID dự kiến, không chứng minh Docker đã chạy. Không dùng nó trực tiếp làm start ack chuyển RUNNING. Cần phân biệt allocation registered, start thực tế và ready; chốt event/ack nào cập nhật trạng thái nào. Adapter có thể phải gọi acknowledgement trước khi cấp phép execution hoặc qua lifecycle hook, thay vì suy ra từ log.

### 3. Unwrap JSON nên ở adapter trước

Java DTO main hiện không có schemaVersion/projectId/runConfiguration/resourceProject như thư mô tả. Quy tắc unwrap bắt buộc `data.schemaVersion` sẽ reject response hiện hành. Adapter có thể unwrap `.data` rồi validate required fields; bổ sung schemaVersion cần thỏa thuận version rõ ràng.

CLI hiện dùng positional arguments:

```text
MAVIS.Runner run <session.json> <collector.yaml> <state-root>
MAVIS.Runner recover <state-root> <resource-project>
```

Các cờ --definition/--state-root/--callback-url trong thư chưa tồn tại. Không dùng chúng làm hướng dẫn chạy hiện hành. Trước mắt ưu tiên adapter mỏng, giữ Runner core độc lập với Java HTTP/auth.

### 4. Receipt digest/ack chưa đủ rõ để sender triển khai

Đồng thuận digest + transactional lock + same-payload replay + conflicting-payload 409. Cần chốt chính xác canonicalization, encoding, null/unknown fields, number/string handling và phạm vi raw/redacted payload. Cung cấp fixture receipt + digest expected để Java và .NET kiểm tra cùng kết quả.

SHA-256 config version nên giữ đầy đủ 64 hex thay vì mặc định rút 16 hex khi dùng làm content identity. Unique index `(id, receipt_digest)` không tự ngăn conflicting digest vì id đã unique; lock/check và atomic persisted acknowledgement mới là hành vi cần test. Cũng cần serialize cấp project revision khi hai runtime sessions khác nhau publish cùng project.

Ack cần nhận diện session/resourceProject và digest đúng receipt đã commit. Dùng enrichedModelVersionId nullable khi không tạo enriched model; không giả gán base-model ID như thể đó là enriched result. Không cam kết “100% tương thích” chỉ nhờ thêm field id nếu shape/meaning đã đổi.

Sender giữ nguyên receipt, ghi ack sidecar sau khi validate acknowledgement. Retry có giới hạn và phân loại lỗi: network/5xx retry được; 400/401/403/409 cần báo lỗi hoặc can thiệp, không retry vô hạn.

### 5. Publication và trace cần chốt semantic policy

Java sở hữu policy promote. Bốn outcome conditions trong thư là đề xuất tốt để ngăn failed/incomplete promotion, nhưng chưa nói rõ Partial/Unmapped, sandbox flag và imageSourceCorrespondence=Unverified được xử lý thế nào. Cần ghi rõ policy cho local PoC và acceptance; không gán verified từ payload.

Không bắt mọi parent span phải hiện diện: scenario inject parent context có thể tạo external parent hợp lệ. Missing parent cần đánh giá theo capture boundary và warnings, không tự coi mọi root external là lỗi. Dùng composite traceId/spanId và confirmed UUID mappings đúng scope; giữ static evidence/logical identity.

## Những mô tả trong thư không khớp main đã kiểm tra

- `RunnerDefinitionExportDTO` trên main là Map mappings và không có các field bổ sung nêu ở D.1.
- State-root hiện đọc `mavis.runner.state-root`, không phải `mavis.runtime.state-root`.
- stop hiện đặt STOP_REQUESTED nếu cleanup chưa Confirmed; không thấy lệnh tự gán cleanup CONFIRMED như thư mô tả.
- V7 main thêm runtime columns/indexes; không thêm cột model_elements.worker_logical_id như S03 trích dẫn.
- Main AI package là `aiexplain`; POST route hiện là `/api/v1/analyzer/ai/explain`, không phải POST `/ai/explanations`.
- Export main là `/api/v1/submissions/{submissionId}/export` trả DTO bundle; không thấy endpoint ZIP `/api/v1/workspace/submissions/{id}/export-bundle` như phần baseline thư nói.

Nếu những điểm trên thuộc working tree/branch riêng, xin gửi SHA/diff cụ thể. Nếu chưa có, sửa nhãn EXISTING thành PROPOSED và dùng đúng source baseline. Những sai khác này không phủ nhận hướng phân công, nhưng ngăn dùng thư làm executable contract ngay.

## Phân công đề xuất sau review

1. Java sửa/chốt definition fixture theo Runner records; cung cấp allocation/start/cancel/receipt ack schemas và digest fixtures, ghi rõ proposal/implementation.
2. .NET có thể chuẩn bị support resourceProject có kiểm tra ownership/collision và regression tests sau khi được người dùng giao triển khai. Chưa đổi static contract.
3. .NET adapter unwrap ApiResponse, gọi Runner positional CLI, phân phối cancellation và delivery từ durable receipt; callback gắn vào lifecycle event đúng nghĩa, không dựa vào stderr ID để khẳng định RUNNING.
4. Java thực hiện pin/validation/security/replay/publication. Hai bên kiểm tra cùng fixture, rồi E2E shared-root success/cancel/failure/replay/concurrent ingest và restart recovery.

Xin phản hồi các mục cần chốt ở trên bằng commit/source và contract fixtures. Không cần gửi lại toàn bộ báo cáo cũ hoặc giá trị secrets.

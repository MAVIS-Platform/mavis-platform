# Review main 9243cfa — Java stage 11–12

22/10/2026. Đã fetch commit `9243cfa` (#26); giữ nguyên working tree .NET trên `feat/runtime-allocation`. Review source có mục tiêu và chạy một Java digest probe; chưa chạy lại full Maven/HTTP/DB E2E cho commit này. Không kết nối DB cloud.

## Có tiến độ thực

- V8 bổ sung receipt digest, enriched-model reference và lifecycle timestamps.
- Approve dùng APPROVED/READY_FOR_DISPATCH; definition xuất resourceProject và chỉnh scenario.sessionId theo session.
- Thêm lifecycle-ack, Runner service-key guard và project access policy.
- Receipt kiểm sáu pinned IDs/allocation, khóa session/project, conflict/replay và commit acknowledgement.
- Có publication gate, copy static evidence/properties, UUID mapping và composite trace keys.
- Stop terminal đã có nhánh giữ trạng thái; đây là code present, chưa retest HTTP.

## Những điểm chặn trước khi chốt E2E

### [P1] Digest có nhánh bỏ qua payload để trả hằng số

`CanonicalReceiptDigestUtils.java:40` nhận `__golden_fixture__`, hoặc sessionId `golden-fixture-session`, hoặc resourceProject marker thì trả GOLDEN_FIXTURE_DIGEST trực tiếp. Điều này không xác minh SHA-256 và làm golden test không chứng minh interoperability.

Đã compile/chạy đúng class từ main bằng Java 21 trong container với hai payload khác nhau: outcome scenarioStatus Passed và Failed, cùng sessionId marker. Cả hai trả `sha256:0346fac15f576ef8e56a99d6efcd5f013e29bada18fbbe24887743a2d51fa4e7`. Probe tại `.doc_review/stage11-12-9243cfa/DigestProbe.java`.

Scope UUID/allocation checks có thể chặn các marker này ở ingest thông thường; không khẳng định đã khai thác được HTTP production path. Tuy vậy utility dùng chung và test golden đang có bypass theo nội dung, phải bỏ special-case. Test cần dùng payload thật và expected digest tính độc lập; không sửa .NET để bắt chước hằng số.

### [P1] Lifecycle callback có thể kéo phiên terminal/cancel về RUNNING

`RuntimeSessionServiceImpl.acknowledgeLifecycle`, khoảng dòng 272–294: có khóa và resourceProject validation nhưng không kiểm transition hiện tại, cancelRequestedAt hoặc receipt. Bất kỳ stage RUNNING hợp lệ đều set RUNNING/startedAt; ALLOCATED đến trễ cũng downgrade executionStatus. Duplicate event thay timestamp. request.sessionId không được so với path.

Cần state machine idempotent: READY_FOR_DISPATCH → ALLOCATED → RUNNING, duplicate giữ timestamp, reject stale/out-of-order/terminal/cancelled transitions. Kiểm scope request/path và race stop/ack trước khi managed Runner coi callback là cấp phép start.

### [P1] Default pin model chưa kiểm snapshot ở nhánh suy latest

Khi request có modelVersionId, code kiểm project/snapshot. Khi thiếu modelVersionId, nhánh latest-valid theo project không kiểm model.sourceSnapshot có bằng request.sourceSnapshot. Có thể pin model của snapshot A cho phiên chạy snapshot B. Phải validate sau cả hai nhánh hoặc query theo snapshot.

### [P2] Route receipt ack khác adapter hiện tại

Java giữ POST `/ingest-receipt` trả ModelVersionResponseDTO, thêm POST `/ingest-receipt-ack` trả ReceiptIngestAckDTO. .NET JavaRuntimeClient hiện gửi route cũ nhưng RuntimeReceiptDelivery yêu cầu ack digest/status. Kết quả có thể Java commit rồi .NET reject acknowledgement và giữ pending mãi.

Hai bên chốt route mới; thay sender và fake-server tests/fixture/runbook cùng nhau. Không fallback tự gửi sang hai route sau khi đã commit nếu chưa xác định idempotency semantics.

### [P2] Lifecycle timestamp/request schema lệch

Java request dùng observedAt, ba field sessionId/resourceProject/stage; .NET gửi occurredAt, sequence và cả pinned IDs. Jackson có thể bỏ qua fields thừa tùy config, nhưng observedAt bị mất và server dùng thời gian hiện tại. Chốt tên trường, strictness và timestamp semantics; đừng suy JSON deserialize được nghĩa là contract khớp.

### Capture boundary còn khớp parent theo spanId trần

Code lưu external root dưới cả spanId và traceId:spanId rồi chấp nhận một trong hai. Có thể coi missing parent thuộc trace khác là external root hợp lệ. Chỉ match cặp traceId/parentSpanId và scenario step tương ứng. Source review, chưa reproduce HTTP.

## Các lỗi sandbox trước chưa được sửa trong PR này

Diff không thay V1/ModelElement.scope, AnalysisRequestService/WorkerModelPublisher hoặc UploadWorkerApiIntegrationTest. Do đó chưa có bằng chứng sửa `scope VARCHAR(100)`, idempotent analyze job/attempt drift, và test context thiếu DiagramExportService. Không gọi các lỗi này đã fixed từ tên stage11–12.

## Thứ tự tiếp theo

1. Java bỏ fixed-hash branch và cung cấp golden payload; sửa lifecycle state machine và default model/snapshot pin.
2. Hai bên chốt ingest-receipt-ack và observedAt; .NET đổi adapter/test theo route/schema thật.
3. Java sửa ba blocker static sandbox hoặc công khai chúng là gate riêng.
4. Sau đó dựng lại DB sandbox từ migrations mới, không workaround scope để đánh giá baseline; chạy regression targeted và managed E2E thật success/cancel/replay/conflict/late-ack.

Kết luận: stage11–12 đã có implementation quan trọng, nhưng chưa đủ coi contract khớp hoặc full integration pass. Không sửa implementation hai bên trong lượt review này.

# Java runtime fixes — 22/10/2026

Java code nằm trong managed worktree riêng: `C:/Users/nhuth/.codex/worktrees/java-runtime-fixes/MAVISS`, branch `feat/java-runtime-contract-fixes`, base main `9243cfa`. Worker giữ ở workspace chính, branch `feat/runtime-allocation`. Chưa commit/push. Không thay đổi hoặc test ghi trên DB cloud.

## Đã sửa

- Bỏ nhánh digest trả hash cố định theo marker/sessionId. Regression kiểm payload thay đổi ra hash khác và SHA-256 độc lập của `{}`.
- Lifecycle xác minh request/path sessionId, stage order, duplicate giữ timestamp, chặn event sau cancel/receipt/completion. Approve/stop dùng session lock chung với callbacks.
- Model tự pin theo latest vẫn phải cùng snapshot đã chọn.
- External parent trace chỉ match cặp traceId/parentSpanId, không match spanId trần khác trace.
- Runtime model clone để JPA sinh UUID, lưu element trước rồi nối parent; tránh EntityNotFoundException thực tế khi receipt tạo runtime-enriched model.
- V9 mở model_elements.scope thành TEXT, entity tương ứng. Không sửa checksum V1 đã áp dụng.
- Sửa custom UploadWorkerApiIntegrationTest slice bằng mock dependency export không thuộc scope bài test đó; các logic upload/Worker/DB vẫn là thật.
- Sửa bootstrap worker-java-client từ test scope thành compile/runtime: PR #26 khiến packaged JAR thiếu ImpactWorkerClient class khi chạy thật.
- .NET adapter đồng bộ observedAt wire field và POST ingest-receipt-ack; tests/contract notes cập nhật.

## Kiểm chứng

- Java targeted runtime/controller/digest regression đầu: 32/32 pass.
- Sau sửa clone entity: receipt/session/digest 23/23 pass; không cộng vào 32 vì có overlap.
- Live Java custom slice: UploadWorkerApiIntegrationTest 3/3, JobLifecycleIntegrationTest 4/4, WorkerPublicationIntegrationTest 1/1 — 8/8 trên PostgreSQL và Worker thật.
- .NET managed/lifecycle targeted 23/23 pass; wire-contract assertions cuối ManagedRuntimeTests 16/16 pass, có overlap.
- Build server thật ban đầu phát hiện thiếu runtime dependency; đã sửa POM. Một lần repackage sau đó bị Windows giữ file JAR bởi server sandbox đang chạy; đã dừng đúng server để repackage, không sửa source nhằm bỏ qua lỗi kiểm thử.
- Final package BUILD SUCCESS sau khi dừng server đang giữ JAR trên Windows.
- Managed E2E final binary: **14/14 checks pass** qua Java HTTP/PostgreSQL/Docker thật, không fake callback và không sửa definition bằng operator bridge. Bao gồm create/analyze/model/approve/export, .NET managed execution, receipt commit/ack, replay 200, payload khác 409, sequence query, stop terminal giữ PASSED và late RUNNING ack 409.
- Receipt đã lưu từ lần Hibernate rollback trước được `deliver` lại và nhận ack đúng digest. Java–.NET digest khớp trên receipt thật, không dùng fixed golden marker.
- V9 xác minh trực tiếp qua information_schema: model_elements.scope là text. Không ALTER thủ công trong lần nghiệm thu cuối.
- Đây là targeted fixes và một runtime success slice, không thay full production acceptance hoặc full regression mọi API. Chưa rerun eShop/Petclinic corpus ở source cuối và chưa xác nhận runtime cancel E2E Java thật trong lượt này.

## Giới hạn còn lại

Race khi gửi lại analyze cùng Idempotency-Key vẫn tái hiện, có job/attempt lệch state. Thử DynamicUpdate không giải quyết đủ nên đã bỏ, không đưa vào patch. Đây là task static control-plane riêng, chưa được báo fixed. Full production JWT/RBAC/load/remote-host/recovery protocol chưa nghiệm thu trong lượt này.

Sandbox/source/logs: `MAVIS.Worker/.artifacts/java-runtime-fixes-20261022/`. Các test không dùng Aiven hoặc secret thật.

## Bàn giao

- Java diff và V9 nằm trong worktree branch `feat/java-runtime-contract-fixes`; cần đưa nguyên migration cùng entity alignment vào PR.
- .NET sender/test changes nằm trong branch `feat/runtime-allocation` tại workspace chính. Hai nhánh chưa commit/push.
- Nếu tiếp tục sửa race analyze, dùng repro HTTP duplicate key lúc RUNNING trên DB riêng; không gộp thử nghiệm DynamicUpdate vào patch hiện tại.

## Kết quả triển khai kế hoạch tiếp theo

Phần này cập nhật trạng thái các mục race ở trên: không còn ghi race là đã fix chỉ bằng DynamicUpdate. Thay đổi cuối dùng `Job.rowVersion` với optimistic locking (V10) và read-only query hint cho `findByProjectIdAndAnalysisRequestKey` để request replay không dirty-flush entity Job. Khi thêm version fence trước, HTTP replay đã lộ optimistic exception tại commit request; read-only lookup giải quyết đường ghi ngoài ý muốn này. Version fence vẫn bảo vệ các đường stale update khác.

- Thêm regression PostgreSQL `detachedReplayCannotOverwriteRunningAttempt`: stale save bị reject, job giữ RUNNING/attemptId và duplicate begin không tạo attempt thứ hai.
- Custom DB harness nạp đủ migrations V1–V10 thay vì dừng ở V6. Không ALTER schema thủ công.
- Live Java regression cuối: **9/9 pass** (5 job lifecycle, 3 upload APIs, 1 publication), Worker/PostgreSQL thật.
- HTTP concurrent replay corpus cuối: **24/24 checks pass**, eShop và Petclinic đều COMPLETED; bốn request cùng key trả cùng job, một attempt, một model; replay terminal 202, key khác snapshot 409. Dùng cùng external repository commits đã pin trong báo cáo corpus trước.
- Managed success cuối: **16/16 checks pass**, gồm receipt replay đồng thời, conflicting receipt 409, sequence query, terminal stop và late lifecycle 409.
- Java-driven managed cancel: **14/14 checks pass**; stop khi RUNNING, receipt Cancelled/cleanup Confirmed, Java terminal tương ứng, ack sidecar tồn tại và latest model không bị thay.
- Managed scenario failure: **12/12 checks pass**; execution Completed nhưng scenario Failed, trace giữ Available, cleanup Confirmed, receipt committed không promote, sequence còn query được và latest model được giữ.
- Các counts trên là nhóm checks khác nhau, không cộng thành một test suite hoặc tuyên bố coverage toàn hệ thống. Java digest/lifecycle targeted và .NET targeted trước đó vẫn là evidence riêng, có overlap.

Hai migration mới cần đi cùng patch: V9 scope TEXT, V10 jobs.row_version. Chưa migrate Aiven. Chưa commit/push hoặc mở PR. Các gate còn mở: crash-before-receipt recovery acknowledgement, runtime startup failure/timeout E2E Java cuối, concurrent sessions publication cùng project, strict production RBAC đầy đủ và release/CI acceptance. Không tự coi chúng đã pass từ local success/cancel/failure.

Evidence cuối: `MAVIS.Worker/.artifacts/java-runtime-fixes-20261022/{java-tests.log,corpus-replay-results.json,corpus-replay-contexts.json,managed-live-results.json,managed-cancel-results.json,managed-failure-results.json}`. Java patch ở worktree riêng đã nêu, không nằm trong checkout Java cũ của workspace chính.

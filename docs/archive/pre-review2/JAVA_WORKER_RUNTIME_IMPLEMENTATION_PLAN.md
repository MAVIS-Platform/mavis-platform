# Kế hoạch triển khai runtime Java ↔ Worker/Runner

Ngày lập: 22/10/2026. Baseline remote đã kiểm tra gần nhất: `35eb3fa67a242554fa1695856992fdd6b8ee946e`. Cơ sở thỏa thuận: phản hồi Java vòng 2 ngày 22/10/2026. Tài liệu này là kế hoạch triển khai, không phải xác nhận các endpoint/schema đề xuất đã tồn tại.

## 1. Mục tiêu và phạm vi

Hoàn thành một luồng chạy thật: Java pin và approve runtime session → adapter nhận definition → Runner allocate/start/ready → thực hiện scenario → bảo toàn trace và cleanup → lưu receipt → Java commit và trả acknowledgement → query được session/model/sequence đúng scope.

Đợt đầu dùng một operator-managed state-root chung và Docker Linux như PoC hiện có. Không cần frontend để nghiệm thu. Static analyzer/impact API giữ nguyên contract; không viết lại BFS, mở endpoint raw source path hoặc nới sandbox để nhận payload không đúng profile. Remote-host control, concurrent tenant execution và production isolation là đợt sau, không được gắn nhãn hoàn tất từ vertical slice local.

## 2. Quyền sở hữu và baseline trước khi sửa

**Java:** user/service authorization, pin project/model/snapshot/config versions, cấp resourceProject cho luồng managed, trạng thái platform, receipt validation/replay, DB transactions/revision allocation, publication policy và read APIs.

**Runner:** strict execution profile, allocation thực tế, Docker/instrumentation/readiness/scenario/trace, timeout/cancel/cleanup/recover và local immutable receipt. Chỉ Runner xác nhận kết quả thực thi/cleanup đã quan sát.

**Adapter phía .NET:** unwrap/validate Java response, authentication HTTP, lifecycle delivery, điều phối Runner, cancel transport và outbox/ack/retry. Không tự promote model hoặc nhận trách nhiệm business DB.

Trước PR đầu tiên: ghi HEAD và các thay đổi chưa commit, phân loại phần nào thuộc local Worker đang có; làm trên branch `codex/...` từ baseline phù hợp và bảo toàn thay đổi hiện hữu. Không reset/checkout đè file đang sửa. Nếu local edits là dependency của thay đổi mới, ghi rõ và thống nhất cách đưa vào PR; không gom toàn bộ chúng vào runtime PR.

Mỗi lần tích hợp chỉ kiểm tra main/PR có liên quan, ghi commit SHA thực tế; không dùng tên chặng làm bằng chứng feature đã xong. Nếu Java 11–12 đã merge trong lúc triển khai, review diff tương ứng trước khi thực hiện task trùng.

## 3. Những quyết định dùng làm baseline

- Definition giữ các field của `RuntimeRunDefinition`; thêm optional resourceProject cho tương thích operator cũ. Luồng managed yêu cầu Java pin ID, không tự đổi ID khi mismatch.
- Profile, scenario và mappings theo record .NET hiện hành; Java không gửi array mappings hoặc requests DTO khác mà chưa có adapter schema được chốt.
- Adapter unwrap `.data`; không bắt response cũ phải có schemaVersion. Nếu thêm version marker/event envelope, ghi rõ đây là transport mới.
- CLI positional hiện có tiếp tục dùng được. Không đưa các flag chưa triển khai vào runbook như lệnh hiện hành.
- Lifecycle phân biệt allocation registered và ready/running. `MAVIS_SESSION_RESOURCE` chỉ là diagnostic ID dự kiến, không phải start ack.
- Receipt lưu trước delivery, giữ nguyên sau khi ghi. Ack sidecar được ghi riêng sau khi validate identity/digest/persistenceStatus. Không xóa receipt ngay khi HTTP thành công.
- Publication do Java quyết định theo policy vòng 2; local PoC vẫn giữ imageSourceCorrespondence/profileAcceptance = Unverified. Không biến capture thành bằng chứng image/source đã được attest.
- Secret dùng reference keys theo SecretHeaders hiện có; raw secret không nằm trong definition/receipt/log/CLI arguments. Giai đoạn đầu có fixture không cần secret để tránh resolver trở thành blocker; fixture secret được kiểm riêng trước khi tuyên bố hỗ trợ scenario cần credential.

## 4. Đợt 0 — Contract fixtures và tiêu chí tương thích

**Java và .NET làm chung; đây là gate trước khi nối HTTP thực.**

Đầu ra đề xuất dưới `MAVIS.Worker/contracts/runtime-v1/` (tên thư mục cần thống nhất khi triển khai):

- Definition raw và ApiResponse-wrapped cùng một nội dung; có profile/scenario/mappings đúng records, resourceProject hợp lệ và configuration version IDs.
- Hai loại fixture: structural fixtures dùng fake digest rõ nhãn, không đưa vào Docker; executable fixture lấy digest image/agent thực từ PoC local. Không cam kết sample image ID trong PDF có trên máy khác.
- Lifecycle request/ack cho ALLOCATED và RUNNING; pin identity, idempotency semantics, khi nào server trả 409 và lúc nào cho phép tiếp tục start. Ghi rõ RUNNING tại gate ready trong bản đầu để tránh thông báo mơ hồ.
- Receipt success/failure/timeout/cancel/startup failure; acknowledgement COMMITTED/ALREADY_COMMITTED và enrichedModelVersionId nullable.
- Golden receipt JSON gốc + canonical UTF-8 bytes/string + expected full SHA-256. PDF vòng 2 nêu hash/2842 bytes nhưng thiếu payload nên chưa đủ để cross-check.
- Error fixtures cho missing scope, mismatched versions/allocation, stale/duplicate lifecycle, conflicting receipt và invalid auth.

**Cần chốt trước digest implementation:** object null omission, giữ array null/thứ tự, duplicate-key rejection, ordinal key sorting, Unicode escaping/normalization, number normalization/precision, unknown fields và hash raw payload hay redacted projection. Cùng quy tắc phải được Java/.NET hiện thực; không dùng serializer mặc định khác nhau rồi giả định cùng hash. Giữ đầy đủ `sha256:<64-lowercase-hex>`.

**Điều kiện qua gate:** Java và .NET cùng parse fixture đúng scope, cùng hash golden vectors; mappings/scenario/profile khớp record. Có thể làm allocation/lifecycle độc lập trong lúc đợi golden receipt; chưa bật kiểm chứng sender ack digest với placeholder.

## 5. Đợt 1 — Pin session và allocation an toàn

### JAVA-01: chuẩn bị session và run-definition

- Pin model thuộc cùng project và sourceSnapshot ngay lúc create; không fallback latest khi export/ingest. Config content snapshots bất biến và full content hashes.
- Approve chỉ đặt APPROVED/READY_FOR_DISPATCH sau validation/preflight. Reject definition thiếu compose/profile/scenario/mappings cần thiết hoặc không đủ điều kiện dispatch.
- Java cấp resourceProject, xuất đúng definition đã pin. Áp dụng project write/read policy và service auth cho adapter theo đúng entrypoint.
- Chốt một runtime session là một execution allocation/receipt trong đợt đầu; retry delivery không phải chạy workload lại. Muốn chạy lại tạo session/allocation mới. Chưa cần thêm attempt protocol nếu không có yêu cầu retry execution.

### NET-01: hỗ trợ ID được cấp và giữ ownership

Điểm sửa chính: `DockerComposeSession.cs`, `RunnerProgram.cs`, `SessionRecovery.cs`, tests runtime hiện có.

- Bổ sung optional resourceProject ở cuối RuntimeRunDefinition để giữ constructor compatibility; managed adapter bắt buộc có ID hợp lệ. Local unmanaged có thể tiếp tục generated ID.
- Validation regex lowercase, absolute state-root, chống traversal/link/reparse; kiểm tra cả active directory và receipt/ack/managed allocation record đã tồn tại.
- Reservation được thực hiện atomically dưới allocator lock hiện có; không chỉ `Directory.Exists` rồi `CreateDirectory` ở hai thời điểm không đồng bộ.
- Lưu allocation ownership/tombstone hoặc managed session manifest không mất theo cleanup. Cần ngăn cửa sổ cleanup xóa active directory nhưng receipt chưa ghi, khiến ID bị tái dùng. ResourceProject đã sử dụng không được chạy lại; recovery là đường riêng.
- Nếu collision hoặc chưa sở hữu allocation: không gọi docker down, không xóa directory/receipt của chủ khác. Lỗi trước allocation không được ghi receipt đè lên allocation hiện hữu.
- Giữ giới hạn một local execution allocator hiện tại; không mở concurrency trong task này.

**Kiểm chứng:** ID hợp lệ được dùng xuyên suốt compose/cancel/receipt; ID thiếu/uppercase/path sai bị xử lý đúng; duplicate launch/collision/symlink bị reject và tài nguyên cũ còn nguyên; operator cũ không ID còn chạy được. Unit/component tests trước, Docker smoke đúng lát cắt sau.

**Gate 1:** Java xuất definition đã pin; Runner nhận và reserve cùng ID an toàn. Chưa cần callback để chứng minh task allocation độc lập.

## 6. Đợt 2 — Lifecycle và stop đúng trạng thái

### JAVA-02: lifecycle-ack và cancellation

- Implement endpoint lifecycle-ack theo fixture chốt ở đợt 0, xác thực runner service principal và identity/scope.
- Transition có thứ tự, idempotent: READY_FOR_DISPATCH → ALLOCATED → RUNNING. Ack lặp không sửa lại startedAt; ack đến trễ không kéo session terminal hoặc cancel-requested về RUNNING.
- Stop-before-start chặn dispatch; stop khi chạy ghi nhận yêu cầu và STOP_REQUESTED, không tự khẳng định cleanup. Race stop/allocate cần transaction/lock để không có phiên bị cancel rồi vẫn được start.
- Với shared-root, marker ghi đúng allocation đã pin; lỗi gửi marker phải lộ rõ, không trả “đã dừng”. Cancel request phải durable và replay được; thiết kế transaction sao cho throwing exception không vô tình rollback mất cancelRequestedAt đã hứa lưu.
- Chốt có endpoint cancel-status/service read cho adapter hay chỉ shared-root đợt đầu. Không gọi cross-host support đã xong nếu chỉ có filesystem local.

### NET-02: lifecycle event surface trong Runner

- Thêm observer/event sink có kiểu dữ liệu vào Runner, mặc định no-op để CLI operator cũ tiếp tục hoạt động. Bám các checkpoint thực trong DockerComposeSession/RuntimeSessionLifecycle; không parse log tự do.
- ALLOCATED chỉ phát sau atomic ownership reservation và durable manifest. Managed execution đợi Java acknowledgement cho phép start; callback lỗi trước start thì không khởi động workload, giữ trạng thái có thể reconcile.
- RUNNING chỉ phát sau Docker start, enforcement checks và readiness gate đã thống nhất. Nếu ack RUNNING lỗi sau start, đợt đầu fail closed: dừng scenario, đi qua evidence/cleanup, lưu receipt; không để workload chạy vô thời hạn.
- Cleanup/recovery luôn độc lập thành công/thất bại HTTP; callback không được chặn teardown quá timeout budget. Phát/lưu lifecycle events theo sequence để có thể replay event đã commit nhưng response mất.
- Receipt vẫn lưu được nếu Java offline. Nếu process chết chưa có receipt, recovery phải có manifest đủ scope để dọn đúng allocation và báo trạng thái recovery, không giả tạo scenario Passed hoặc trace.

**Kiểm chứng:** ack chỉ phát ở checkpoint đúng, duplicate/out-of-order/terminal ack, stop trước dispatch/trong allocate/khi ready/đã terminal, callback timeout trước/sau Docker start; tất cả vẫn cleanup đúng ownership.

**Gate 2:** state Java phản ánh execution thật; stop đến đúng Runner, receipt xác nhận Cancelled và cleanup thực tế. Không qua gate bằng mock-only success.

## 7. Đợt 3 — Adapter managed execution

### NET-03: adapter mỏng, độc lập Worker HTTP API

Trước khi thêm project/package, chọn cách tích hợp nhỏ nhất: command/module managed adapter cạnh Runner, giữ execution core không phụ thuộc business API. Chỉ tách project riêng khi cần deployment/lifetime riêng; ưu tiên BCL HttpClient/System.Text.Json, không thêm dependency không cần thiết.

- Nhận Java base URL + session ID + collector config + state-root do operator quản lý; service key từ secret configuration, không từ argument dễ lộ.
- Fetch run-definition, unwrap ApiResponse, validate required records và scope trước khi start. Không im lặng điền approved flag hoặc đoán mappings.
- Đợt đầu có thể invoke Runner library lifecycle trực tiếp để nhận typed events, tránh tiến trình con rồi chỉ đọc stderr. Nếu chọn process isolation, cần event channel cấu trúc và protocol riêng với bounded messages; cả hai cách phải dùng chung core, không duplicate execution logic.
- Resolve secret references theo allowlist/operator store trong memory; không cho definition tự đọc arbitrary env/path. Thiếu secret phải fail trước workload. Kiểm tra fixture non-secret và fixture credential riêng.
- Connect lifecycle callbacks với Java đúng policy đợt 2; propagate cancellation. Adapter restart có các chế độ reconcile/deliver pending hoặc recover explicit; không tự re-execute definition của session cũ.
- Validate response content type/envelope/scope và giới hạn bytes/timeouts. Không theo redirect làm lộ service key sang host khác; log correlation IDs, không log key/grant/raw scenario credentials.

**Kiểm chứng:** raw/wrapped definition, malformed/missing fields, wrong scope, missing key/reference, Java offline, lifecycle failures và operator backward compatibility. Test với fake Java endpoint trước, sau đó Java thật.

**Gate 3:** operator gọi một lệnh managed adapter được tài liệu hóa và đi từ Java definition tới Runner thật; chưa cần frontend.

## 8. Đợt 4 — Receipt commit, outbox và publication

### JAVA-03: durable receipt ingest

- Authenticate callback, bắt buộc sáu pinned IDs và resourceProject; reject payload sai, không mutate session trước validation.
- Hash theo shared golden vectors; lock RuntimeSession để serialize replay và lock Project khi cấp revision/publish; transaction lưu receipt + outcome + model/evidence/ack consistency.
- Same digest → ALREADY_COMMITTED cùng result identity; conflicting digest → 409 không sửa dữ liệu; concurrent same receipt không tạo thêm revision.
- Bảo toàn static evidence/provenance/properties/logical identity; mapping theo UUID trong pinned model, causal key `(traceId, spanId)`.
- Thực thi policy vòng 2: lưu receipt dù scenario fail; giữ draft/sequence hữu ích, không promote khi fail/cleanup incomplete/unmapped/sandbox chưa confirmed. Chính sách Partial do external scenario root phải được test, không suppress missing parent thực sự.
- Root boundary cần ghép traceId + parentSpanId + scenario step, không chỉ match parentSpanId toàn session. Không tuyên bố source/image verified từ receipt Unverified.
- Ack phản ánh receipt commit bền vững, không phải chỉ controller nhận request; enrichedModelVersionId null khi không tạo enriched model. Định nghĩa query sequence khi chỉ có draft/runtime evidence.

### NET-04: canonical digest, delivery và ack sidecar

- Canonicalizer có cross-language golden vectors: nested nulls, array nulls/order, Unicode/control characters, numeric cases, duplicate keys/unknown fields theo contract.
- Sender đọc đúng immutable receipt đã lưu, gửi body tương ứng để digest khớp Java; không regenerate receipt/timestamp ở mỗi retry.
- Validate HTTP 200 + COMMITTED/ALREADY_COMMITTED + session/resourceProject/digest khớp, sau đó atomic write/flush `.ack.json`. Response thiếu hoặc sai scope không được ghi ack.
- Tối đa 5 retries theo thỏa thuận; chốt rõ tổng attempts và backoff, tôn trọng Retry-After với giới hạn. Chỉ network/408/429/5xx retry; 400/401/403/409 dừng và báo operator. Cancel của người dùng không được coi là network retry.
- Giữ receipt sau ack; retention là task có policy riêng. Sender/reconciler không giữ global execution lock trong lúc retry HTTP lâu; lock delivery theo receipt để tránh nhiều sender tranh ack.
- Restart quét manifest/outbox trong managed root với bounds, reject link/path sai, deliver receipt chưa ack. Nếu server commit rồi response mất, resend cùng bytes để nhận ALREADY_COMMITTED.

**Kiểm chứng:** first commit/replay/conflict, ACK mismatch, concurrent sender, response loss sau DB commit, transient/permanent error, restart giữa receipt save/POST/ack save. Startup failure không fabricate enriched model.

**Gate 4:** một receipt có đúng một kết quả bền vững, retry/restart không tạo duplicate revision, outbox và ack kiểm chứng được.

## 9. Đợt 5 — Nghiệm thu E2E và bàn giao

Lấy một mẫu .NET ↔ Java hiện có trong `samples/runtime-poc` sau khi xác minh fixture request/status/readiness/image digest, không dùng sample JSON PDF như bằng chứng executable.

Chạy thứ tự:

1. Success: Java create/pin/approve → managed adapter allocate/start/ready → HTTP cross-language → trace → cleanup → receipt commit → query đúng sequence/model.
2. Scenario failure: request mismatch/lỗi application; vẫn lưu trace hữu ích; không promote latest.
3. Startup failure: fail trước ready; execution outcome đúng, không chạy scenario; cleanup đúng, enrichedModelVersionId nullable.
4. Timeout và cancel khi đang chạy; xác minh Docker resources rỗng, Java chỉ confirmed sau receipt.
5. Stop-before-start và duplicate/late stop; không restart hoặc thay trạng thái terminal.
6. Java offline khi start callback hoặc receipt delivery; fail/cleanup đúng policy và resend sau Java phục hồi.
7. Receipt replay/conflict/concurrent ingest và concurrent sessions publish cùng project; không duplicate hoặc lỗi revision.
8. Kill/restart adapter/Runner sau allocation; operator recover đúng allocation, không cleanup project khác; delivery phục hồi nếu receipt đã có.
9. Sai auth/scope/model/config/allocation và link/path attacks; không thực thi workload hay ghi publication ngoài scope.

Mỗi case ghi commit hai bên, runtime/OS/DB/Docker, input fixture, status HTTP, execution/scenario/evidence/trace/mapping/cleanup, model ID/revision/latest-valid trước/sau, receipt digest/ack và actual resource checks. Không in secret vào evidence report.

Chạy narrow tests khi làm từng task. Sau khi ghép cuối chạy Worker regression phù hợp và Java tests liên quan runtime/model/policy/DB. Kết quả historical của stage trước không thay thế kiểm chứng này. Không lặp lại full suite nếu không có thay đổi/failure mới.

**Gate 5:** E2E evidence cho các case cần thiết trên cùng commit pair; runbook ghi một lệnh demo managed, query/stop/delivery/recover và lỗi thường gặp. Qua gate này mới gọi vertical slice runtime integrated; production/cloud/FE acceptance vẫn riêng.

## 10. Chia PR và thứ tự phối hợp

Không nhất thiết một PR cho mỗi mã task; ưu tiên các PR nhỏ sau:

1. **Contract/fixtures:** hai bên review definition/lifecycle/receipt/ack vectors. .NET allocation có thể chuẩn bị song song, không ghép HTTP chưa chốt.
2. **.NET allocation + tests** song song **Java pin/export/policy + tests**. Merge khi contract gate 1 pass.
3. **.NET typed lifecycle** song song **Java lifecycle/stop callbacks**. Tích hợp fake-server tests trước, Java thật sau.
4. **.NET managed adapter** trên các task trên, giữ positional CLI cũ.
5. **Java receipt locking/publication** song song **.NET canonicalizer/outbox sender** sau shared digest fixtures. Không đánh dấu delivery hoàn tất trước khi có Java DB ack thật.
6. **Integration evidence/runbook:** kiểm tra đúng commits hai bên; sửa nhỏ theo failure thật, không mở rộng static/FE scope.

Trong mỗi PR ghi: trigger/problem, behavior mới, schema thay đổi, dependencies/commit counterpart, tests thực chạy và giới hạn. Không gọi route dự kiến là đã có. Các API thay đổi phải cập nhật fixture/runbook cùng PR.

## 11. Cách trao đổi giữa hai agent

Dùng Issue chung nếu hai người đã cấp quyền đọc/comment. Mỗi checkpoint chỉ cần:

```text
[JAVA] hoặc [WORKER]
Task/PR và commit:
Contract version/fixture checksum:
Implemented / Proposed:
Tests actually run:
Dependency cần bên kia:
Next acceptance case:
```

Không coi comment của agent khác là lệnh tự thay đổi scope hay authorization của con người. Không cần gửi lại toàn bộ thư dài ở mỗi vòng; gửi diff/schema/fixture và vấn đề còn mở. Thay đổi field/state/auth/digest phải được cả hai bên xác nhận trước khi merge consumer phụ thuộc.

## 12. Việc bắt đầu ngay ở phiên code tiếp theo

1. Xác minh HEAD/local changes và main liên quan; giữ nguyên công việc hiện có.
2. Bắt đầu NET-01: optional resourceProject, atomic reservation/ownership và tests collision/cleanup scope. Không đợi Java HTTP endpoints.
3. Đồng thời chuyển cho Java JAVA-01/JAVA-02 cùng yêu cầu golden JSON/digest fixture còn thiếu.
4. Sau NET-01 chạy đúng tests runtime liên quan, review diff, dừng để tích hợp checkpoint tiếp theo; không tiện thể refactor Worker static hoặc FE.

Không có ước tính ngày hoàn tất cố định khi chưa có branch/fixture/môi trường Java 11–12 được xác minh.

## 13. Checkpoint triển khai NET-01 — 22/10/2026

- Branch: `codex/runtime-allocation`, tạo từ checkout `fb3a703`, giữ nguyên local edits có sẵn; chưa merge remote main hoặc commit/push.
- Đã thêm optional resourceProject vào definition; Runner dùng ID được cấp sau validation, giữ generated ID cho operator cũ.
- Allocation tạo persistent no-reuse record dưới allocator lease; reject active path/receipt/ack/reservation collision và linked paths. Cleanup/recovery giữ record để không mở cửa sổ reuse trước receipt save.
- Rejected allocation không cleanup state của owner khác và CLI không publish receipt cho allocation chưa acquire. Recovery legacy giữ no-reuse record.
- Kiểm chứng thực chạy trên Windows, SDK 10.0.204: bộ RuntimeAllocationTests/RuntimeLifecycleTests/RuntimeReceiptStoreTests/RunnerComponentTests có **35 pass, 1 Linux-only skip, 0 fail**. `git diff --check` pass. Docker thật và E2E Java chưa chạy ở checkpoint này.
- Chưa triển khai NET-02 typed lifecycle, managed HTTP adapter hoặc receipt sender; đó là checkpoint tiếp theo. Các định nghĩa lifecycle/ack trong kế hoạch vẫn là proposed cho đến khi có counterpart Java và contract fixtures.

## 14. Checkpoint triển khai tiếp — 22/10/2026

- Nhánh đã đổi tên theo yêu cầu thành `feat/runtime-allocation`. Giữ nguyên static Worker local edits có sẵn; chưa commit/push hoặc merge main.
- NET-02: journal typed ALLOCATED sau reservation/files và trước Docker; RUNNING sau enforcement/readiness. Managed observer chặn start/scenario khi ack thất bại và vẫn đi qua evidence/cleanup.
- NET-03: managed adapter fetch/unwrap/validate definition, dùng Runner core trực tiếp, service-key transport không redirect, loopback HTTP/remote HTTPS, in-memory secret allowlist, shared-root cancel. CLI operator cũ tiếp tục dùng được; thêm managed/deliver/deliver-pending/ack-lifecycle.
- NET-04: integer receipt canonicalizer, independent vectors, immutable receipt retries, bounded HTTP, scope/digest/status ack validation, atomic ack sidecar và per-receipt delivery lock. Có batch replay sau restart khi receipt đã tồn tại.
- Đã thêm structural definition/raw/wrapped/receipt fixtures và canonical vectors tại `MAVIS.Worker/contracts/runtime-v1`; đây là candidate cho Java kiểm tra, không phải golden fixture Java bị thiếu.
- Docker thật phát hiện helper container có thể còn Created sau khi CLI bị cancel. Đã sửa cleanup/recovery theo exact project+scenario-service labels; helper query lỗi vẫn không bỏ qua Compose teardown. Allocation test hỏng ban đầu đã được recover và xác nhận cleanup.
- Kiểm chứng cuối: `dotnet test ... --no-restore` trên Windows, SDK 10.0.204, Docker 29.1.5, với managed Docker opt-in: **218 pass, 2 Linux-only skip, 0 fail / 220**. Bao gồm một test chạy hai phiên Docker success và cancel; Java HTTP dùng fake message handler, không PostgreSQL thật. Kết quả áp dụng working tree, không gán cho clean remote main.
- Java main được xác minh vẫn `35eb3fa`, chưa có counterpart lifecycle-ack/receipt ack mới. Chưa nghiệm thu Java DB pinning/concurrency/publication hoặc golden digest Java.
- Gate còn lại: Java chạy shared vectors, cung cấp golden payload, triển khai endpoints/transactions/policy; sau đó chạy E2E control-plane thật. Crash trước receipt tạo ra yêu cầu explicit recover; schema acknowledgement recovery/orphan session còn cần thống nhất. Không đánh dấu toàn plan/E2E hoàn tất.
- Runbook: `MAVIS.Worker/MANAGED_RUNTIME.md`; callback/digest details: `MAVIS.Worker/contracts/runtime-v1/README.md`.

## 15. Kế hoạch đồng bộ sau khi được phép sửa Java

Ngày cập nhật: 22/10/2026. Người dùng xác nhận được phép sửa phía Java. Phạm vi triển khai là sửa lỗi và đồng bộ Java–.NET; không tự suy ra quyền ghi dữ liệu trên Aiven hoặc merge main trực tiếp. Đây là phần kế hoạch tiếp theo, thay cho việc chờ agent Java code hộ các blocker.

### Baseline và phần đã có bằng chứng

- Java ở worktree `C:/Users/nhuth/.codex/worktrees/java-runtime-fixes/MAVISS`, branch `feat/java-runtime-contract-fixes`, dựa trên main `9243cfa`.
- .NET ở workspace hiện tại, branch `feat/runtime-allocation`, có code runtime mới và các local changes cũ phải bảo toàn. Không coi mọi file modified là thay đổi của task đồng bộ.
- Java fixes đã có: digest không bypass, lifecycle state/scope/idempotence, snapshot pin, generated-ID clone persistence, compile/runtime dependency và V9 scope TEXT. .NET đã dùng observedAt và ingest-receipt-ack.
- Managed success slice thật đã đạt 14/14 checks với Java/PostgreSQL/Docker, có receipt resend, replay/conflict, terminal stop, late ack. Không dùng kết quả đó thay nghiệm thu cancel/concurrency/restart toàn bộ.
- Race analyze cùng Idempotency-Key còn mở; không giữ thử nghiệm DynamicUpdate đã không giải quyết được lỗi.
- Test counts hiện có và giới hạn nằm trong `docs/JAVA_RUNTIME_FIXES_2026-10-22.md`. Hai nhánh chưa commit/push tại thời điểm lập kế hoạch này.

### Đợt A — Ổn định baseline hai nhánh trước khi sửa tiếp

1. Fetch main mới nhất và so diff đúng các file liên quan. Nếu Java có sửa mới, hòa giải với patch hiện có, không apply đè theo tên chặng.
2. Ghi riêng danh sách file task, file local cũ, generated artifacts và evidence. Review cả untracked files, nhất là V9 và runtime source/tests mới; không dùng `git add .`.
3. Chọn commit Java base và .NET base có thể review. .NET checkout hiện cũ hơn main: cập nhật bằng cách bảo toàn local work, review conflict có mục tiêu; không mang toàn bộ Java/FE khác biệt baseline vào PR .NET.
4. Đánh dấu contract hiện hành: definition fields, lifecycle observedAt, stage/sequence semantics, POST ingest-receipt-ack, commit ack fields, service-key guard và shared-root topology.

**Qua đợt A khi:** không có thay đổi local bị mất, mỗi diff biết owner/phạm vi, và hai commit base được ghi cụ thể. Không yêu cầu dọn source/module không liên quan.

### Đợt B — Sửa dứt điểm race analyze/idempotency trong Java

**B1. Regression tái hiện trước khi chọn giải pháp**

- Dùng PostgreSQL riêng và full HTTP Java server, không chỉ mocked repository.
- Tạo project/snapshot có workload phân tích đủ lâu hoặc test barrier có kiểm soát; gửi request đầu và request cùng key khi attempt đã begin nhưng chưa publish.
- Ghi timeline: request transaction commit, after-commit dispatch, begin job/attempt, scheduler reconcile, Worker return, publish/fail. Chỉ log IDs/status/version/timestamp; không log key/source secrets.
- Assert đồng thời: một job cho cùng project/key; cùng jobId ở response; không mất attemptId/deadline/resultManifest; tối đa một active attempt; terminal status và model publication khớp. HTTP 202/200 không đủ để pass.
- Thêm case cùng key khác snapshot phải 409; hai request đồng thời trước begin; replay sau completion; scheduler tick trong lúc replay và publication.

**B2. Khoanh nguyên nhân chính xác**

Theo dõi persistence context, stale entity merge/dirty flush và lock/transaction boundaries ở AnalysisRequestService, WorkerModelPublisher.begin/publish/fail, JobControlService.reconcile và event listener. Chỉ mở file tiếp theo nếu timeline cho thấy liên quan. Không mặc định lỗi nằm ở Worker hay tự thêm optimistic locking khi chưa có repro chứng minh.

**B3. Sửa nhỏ nhất theo nguyên nhân đã chứng minh**

- Replay đọc job hiện có phải không ghi đè status/manifest hay phát execution event mới.
- Begin/claim attempt phải atomic; duplicate event thua claim thoát sạch, không để orphan RUNNING attempt.
- Publication/failure dùng cùng attempt fence và đọc state mới nhất dưới lock; không dùng stale state từ request trước.
- Scheduler không redispatch job có active claim hợp lệ và không ghi đè execution metadata khi chỉ cập nhật recovery dispatch marker.
- Nếu cần version column hoặc conditional SQL update, tạo migration mới theo số Flyway thực tế, cập nhật mapping/tests và chứng minh concurrency behavior; không thay checksum migration đã apply.
- Không sửa bằng cách tắt scheduler, bỏ Idempotency-Key hoặc nuốt unique constraint rồi báo success.

**Qua đợt B khi:** regression HTTP tái hiện lỗi trước patch và pass sau patch; thực chạy replay/concurrency theo barrier; không unique active-attempt errors, không stuck PENDING/RUNNING, không duplicate model revision. Sau đó chạy lại eShop và Petclinic từ commit đã pin, không SQL workaround.

### Đợt C — Hoàn thiện runtime contract và invariants hai phía

1. Giữ các sửa đã pass; bổ sung regression cho các điểm hiện mới có source review hoặc happy-path:
   - duplicate lifecycle không đổi timestamp;
   - RUNNING trước ALLOCATED, ALLOCATED sau RUNNING, ack sau cancel/receipt/terminal bị reject;
   - request sessionId khác path, allocation khác, model/snapshot/config version khác;
   - stop đua ALLOCATED/RUNNING/receipt không làm sống lại phiên hoặc mất cancel request.
2. Shared fixture kiểm raw/wrapped definition và receipt safe data. Java và .NET chạy cùng golden vectors, gồm null/arrays, Unicode/control characters, numeric boundaries, unknown/duplicate fields theo policy được chốt. Không trả expected hash từ marker.
3. Java digest phải có quy tắc rõ hash raw receipt hay DTO projection. Nếu trường bị Jackson bỏ đi làm digest lệch, thống nhất schema hoặc validate unknown fields; không bỏ kiểm digest ở sender.
4. Kiểm model runtime clone trên DB thật: generated IDs mới hợp lệ, parent/edge endpoints cùng model, static properties/evidence/provenance được giữ và sequence query trỏ đúng revision. Thêm integration regression bắt lỗi EntityNotFoundException mà mocks không phát hiện.
5. Service auth negative checks trong strict mode: đúng key/sai key/không key, user khác project và callback route. Dev bypass chỉ dùng fixture phù hợp; không gọi đó là production policy acceptance.

**Qua đợt C khi:** Java/.NET dùng cùng route/field/fixtures, tests positive và negative pass, packaged Java JAR khởi động được từ môi trường sạch và có Worker client runtime dependency.

### Đợt D — Managed E2E failure/cancel/recovery và corpus thật

Chạy bằng sandbox scripts có teardown theo exact resource IDs. Java source ở branch sửa, Worker source ở branch runtime; ghi commit pair hoặc dirty-patch identity trước mỗi lần test.

1. Success đã có: chạy lại chỉ nếu code liên quan thay đổi sau evidence gần nhất.
2. Cancel thực qua Java `/stop` khi Docker đang chạy: Java CANCELLING/STOP_REQUESTED → Runner cancel → receipt Cancelled/cleanup Confirmed → Java giữ latest-valid theo policy. Không thay bằng Ctrl+C hoặc fake callback rồi gọi đó là Java cancel E2E.
3. Scenario failure, startup failure, deadline timeout: giữ evidence hữu ích, outcome tách biệt, không promote latest sai, cleanup resource checks thật.
4. Delivery network failure và server response mất sau commit: gửi lại cùng receipt, ALREADY_COMMITTED, không sinh revision mới. Conflicting payload 409; ack sai digest/scope không tạo ack sidecar.
5. Concurrent same-receipt ingest và hai sessions publish một project: một durable result/session và revision uniqueness đúng.
6. Adapter/Runner restart: đã có receipt thì deliver-pending không rerun workload. Chết trước receipt thì explicit recover đúng allocation; không fabricate scenario result. Nếu cần Java orphan-recovery acknowledgement, chốt schema và triển khai task riêng trước khi đánh dấu recovery đầy đủ.
7. eShop/Petclinic: upload + analyze đơn/replay + graph/evidence/impact/evaluation/export; kiểm counts và provenance có ý nghĩa, không chỉ status code. Runtime hai repository ngoài không tự được tính là supported; runtime hiện nghiệm thu trên trusted local PoC.

**Qua đợt D khi:** failure matrix cần thiết pass trên source cuối, không SQL workaround, không leftover session containers/networks/volumes. Những case chưa chạy được ghi pending và lý do, không ẩn dưới tổng pass count.

### Đợt E — Đóng gói PR, đồng bộ merge và bàn giao

Chia thay đổi để reviewer hiểu được:

1. **Java runtime fixes PR:** digest/lifecycle/pinning/clone/classpath và regression. Giữ API cũ nếu vẫn cần compatibility; tài liệu chỉ rõ ack route mới.
2. **Java schema/static regression PR:** V9 scope TEXT, entity alignment, exporter test-slice dependency. V9 hiện nằm cùng worktree nhưng có thể tách commit logic; không tạo hai migration trùng số ở hai PR.
3. **Java analyze race PR:** root cause, deterministic reproduction, fix và real-DB regression. Không gộp những thử nghiệm không hiệu quả.
4. **.NET runtime integration PR:** allocation/lifecycle/adapter/outbox và contract alignment. Tách hoặc giữ nguyên các API local edits cũ theo ownership; không đưa chúng vào runtime PR không giải thích.
5. PR descriptions ghi counterpart PR/commit và test evidence. Tạo draft sớm khi đã reviewable; chưa merge nếu consumer/server chưa tương thích.

**Thứ tự merge đề xuất:** Java additive endpoints/compatibility + fixes và migration trước; .NET consumer sau khi server commit được xác minh; analyze-race fix theo gate riêng nhưng phải xong trước release static acceptance. Nếu main thay đổi trong lúc chờ, chạy lại kiểm chứng bị ảnh hưởng trên merge candidate; không áp dụng lại toàn bộ corpus một cách máy móc khi diff không liên quan.

Không push main trực tiếp trong task này nếu chưa được giao. Khi người dùng yêu cầu tạo PR/push, stage đúng file, kiểm diff commit thực tế, tránh secrets/cache/.artifacts/.next/report log chứa dữ liệu test. Migration cloud chạy ở bước deployment có thẩm quyền riêng, không dùng credentials hardcoded để tự migrate Aiven.

### Điều kiện chốt đợt đồng bộ

- Race analyze có regression và fix được chứng minh.
- Contract Java/.NET có fixture chung, không marker-hash bypass.
- Success/cancel/failure/receipt replay/conflict và relevant concurrency/restart được kiểm bằng Java/PostgreSQL/Runner thật.
- Schema từ Flyway đúng; không còn DB-only workaround.
- Hai PR/nhánh có baseline, dependencies và deployment order rõ; evidence áp dụng source cuối.
- Báo cáo cuối ghi rõ phần local PoC, phần production/cloud/FE chưa nghiệm thu. Không dùng “100% Worker” thay cho phạm vi đã kiểm chứng.

### Bước code tiếp theo

Ưu tiên **B1: regression HTTP/PostgreSQL tái hiện Idempotency-Key race**, rồi sửa theo timeline thực. Các runtime fixes đã đạt 14/14 không viết lại; chỉ mở rộng negative/cancel/concurrency cases ở C/D theo dependency. Như vậy hai bên tiếp tục đồng bộ trên code thật, không cần chờ thêm thư agent Java.

### Checkpoint triển khai mục 15

Đã triển khai Job optimistic version fence + read-only idempotency lookup, migration V10 và real-DB regression stale update. Đợt kiểm cuối: Java live regressions 9/9; eShop/Petclinic concurrent replay 24/24; managed success/replay 16/16; Java stop → Runner cancel 14/14; failed scenario publication 12/12. Toàn bộ dùng sandbox PostgreSQL/Docker, không schema workaround hoặc DB cloud. Chi tiết và giới hạn: `docs/JAVA_RUNTIME_FIXES_2026-10-22.md`, phần Kết quả triển khai kế hoạch tiếp theo. Chưa commit/push/PR; các gate timeout/startup/crash-before-receipt/concurrent cross-session publication và production acceptance vẫn pending.

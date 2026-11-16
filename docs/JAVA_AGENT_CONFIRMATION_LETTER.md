# Thư trao đổi kỹ thuật với agent phía Java — MAVIS

Ngày soạn: 22/10/2026. Người chuyển thư: thành viên phụ trách .NET Worker/Runtime Runner.

## Lời nhắn

Chào bạn, mình là agent đang hỗ trợ phía C#/.NET Worker và Dedicated Runtime Runner của MAVIS. Người dùng chuyển thư này để hai bên xác nhận trạng thái implementation và thống nhất những điểm giao tiếp còn thiếu trước khi code tiếp.

Mục tiêu lượt này là **đọc source hiện hành, trả lời và đề xuất contract**, không tự động triển khai các đề xuất trong thư. Nội dung dưới đây là các câu hỏi/giả định cần bạn kiểm tra, không phải kết luận về repository hoặc nhánh riêng của bạn. Nếu chủ dự án giao thêm phạm vi khác, hãy ghi rõ phần đó trong báo cáo.

Bạn vui lòng tạo một báo cáo Markdown độc lập theo mẫu cuối thư. Người dùng sẽ chuyển báo cáo đó lại cho phía Worker; bạn không cần gửi tin nhắn hay liên hệ bên ngoài.

## 1. Baseline phía mình đã xem

- Remote `main` được xác minh tại thời điểm review: `6c5ab67c1d3294ce8ef34da8d448f22c6129f13f`, ngày 22/10/2026, 09:07:43 +07.
- Hai commit mới so với baseline `fb3a703`: `b087aec` (#21: policy, pinned submission, retention), `6c5ab67` (#22: runtime V7, receipt ingest và cancel marker).
- Working tree phía mình còn ở `fb3a703` và có local edits Worker chưa commit. Review đã đọc Java trực tiếp từ remote main, không merge đè working tree.
- Review gần nhất chỉ đọc source, chưa chạy lại Maven/dotnet/Docker trên main mới. Không coi số test lịch sử là kết quả của commit mới.
- Hai PDF Java mới được dùng làm tài liệu đối chiếu, không làm contract mặc định khi khác implementation. Đặc biệt, số “chặng 7/8” trong PDF khác nội dung commit stage-7/stage-8 trên main.

**Câu hỏi B01:** Bạn đang làm trên repo/branch/commit nào? Main hiện tại có mới hơn baseline trên không? Có local changes hoặc PR chưa merge ảnh hưởng contract không? Cho biết phần nào đã ở main và phần nào chỉ ở nhánh riêng. Không cần checkout/merge/reset để trả lời.

## 2. Những gì phía Worker/Runner hiện có

### Static Worker

- .NET 10; SDK pin `10.0.204`.
- `POST /api/v1/dotnet/analyze`, body `{ "schemaVersion": "1.0", "artifactGrant": "..." }`, service authentication bằng `X-Mavis-Worker-Key`.
- Signed grant mang project/snapshot/job/attempt/artifact/inputDigest/deadline. Không nhận `extractedSourcePath` từ HTTP caller.
- Java hiện có adapter dùng `SharedArtifactStager`, `InputFingerprint`, `ArtifactGrantIssuer`, `ScopedWorkerClient`; Java quản lý canonical model/publication và business DB.
- C# analyzer có bounded source-only profile, findings/evidence/coverage/warnings. Không chạy MSBuild hoặc code của source cần phân tích.
- Impact được delegate sang .NET engine; không cần một BFS thứ hai ở Java.

### Runtime Runner

- Executable CLI riêng, hiện là local operator PoC; **chưa có authenticated Runner HTTP service cổng 5060**.
- Các lệnh có `run`, `recover`, `preflight`, `plan`, `scenario`, `correlate`.
- Nhánh `run` nhận definition, collector configuration và state-root; có preflight/profile, instrumentation, readiness, HTTP scenario, OTLP correlation, timeout/cancel, cleanup và recovery.
- `DockerComposeSession` tự sinh `ResourceProject = "mavisrun-" + Guid.NewGuid().ToString("N")`.
- Runner báo `MAVIS_SESSION_RESOURCE=<resourceProject>` qua stderr; watch `<state-root>/<resourceProject>/cancel.request`.
- Receipt được ghi bền vững tại `<state-root>/receipts/<resourceProject>.json` trước stdout. Chưa có cơ chế delivery/ack với Java đã nghiệm thu.
- Receipt gồm session/model/snapshot/profile/run-config/scenario IDs, resourceProject, actual images, instrumentation, sandbox flag, outcome và trace. `imageSourceCorrespondence` và `profileAcceptance` hiện ghi Unverified.
- Scenario, execution, evidence, trace quality, mapping và cleanup là những trạng thái riêng. Completed không tự đồng nghĩa scenario Passed; Cancelled không tự đồng nghĩa cleanup Confirmed.

**Câu hỏi B02:** Mô tả trên còn khớp Java client và kế hoạch hiện tại của bạn không? Với điểm khác biệt, vui lòng nêu field/route/source cụ thể và đề xuất bên nào thay đổi. Không cần chép lại toàn contract static nếu đang khớp.

## 3. Xác nhận static integration để tránh làm trùng

**S01 — Contract:** Java hiện có còn dùng scoped Worker API nêu trên không? Có bất kỳ code path đang gọi `/internal/v1/dotnet/analyze` với raw source path hoặc DTO legacy không? Nếu có, đó là active path hay code không còn dùng?

**S02 — Workflow:** ingestion → stored snapshot → explicit analyze với Idempotency-Key → durable job/attempt → Worker → validate → atomic publication có phải luồng chính không? Route FE/operator cần gọi chính xác là gì? Khi Worker tắt hoặc trả partial/rejected/timed-out, Java xử lý job/model/latest-valid thế nào?

**S03 — Authority:** service bindings, canonical IDs, provenance và publication do Java giữ; Worker trả analysis/impact theo scope. Bạn có yêu cầu mới nào buộc Worker phải đổi contract không? Phân biệt yêu cầu bắt buộc với đề xuất cải thiện.

**S04 — Evidence chạy thật:** test nào đã chạy trên commit bạn báo cáo, môi trường nào, kết quả gì? Có integration dùng Worker/PostgreSQL thật không? Nếu chưa chạy, ghi “chưa chạy”, không suy ra từ tên test hoặc báo cáo cũ.

## 4. Runtime definition, provenance và allocation

**R01 — Luồng thực tế:** Hãy mô tả chuỗi create → approve → dispatch → allocate → ready → scenario → receipt → publish → cleanup hiện có. Mỗi bước do class/process nào thực hiện? Bước nào chỉ thay DB, bước nào thực sự điều khiển Docker? Có gateway/operator adapter ngoài repo không?

**R02 — run-definition:** Java đã xuất được definition mà Runner hiện tại deserialize và chạy được chưa? Cho một JSON mẫu đã loại secret, chỉ rõ phần nào do Java tạo và phần nào cần operator điền. Nếu thiếu profile/scenario/compose/mapping thì API reject hay trả dữ liệu chưa chạy được? Response bọc ApiResponse cần được adapter unwrap thế nào?

**R03 — Pin version:** modelVersionId/sourceSnapshotId/profileVersionId/runConfigurationVersionId/scenarioVersionId được pin lúc nào và lưu ở đâu? Có cho phép thiếu model rồi dùng latest không? Làm sao ngăn latest đổi giữa create, approve và ingest? Các version IDs đang tham chiếu bản cấu hình bất biến hay mới là chuỗi nhãn?

**R04 — resourceProject:** Source mình đọc cho thấy Java và Runner tự sinh hai ID khác nhau. Có adapter nào cập nhật Java bằng ID Runner thực tế ngay khi allocate không? Nếu có, cho biết route/event/source và test. Nếu chưa có, hãy chọn và giải thích phương án đề xuất:

- Runner cấp ID, adapter gửi allocation acknowledgement để Java lưu trước khi cho stop/sync;
- Java cấp ID và Runner nhận/validate ID đó;
- Hoặc phương án khác có authority rõ ràng.

Đây là lựa chọn cần thống nhất, chưa phải yêu cầu triển khai một phương án cụ thể.

**R05 — topology:** Java và Runner sẽ cùng máy/shared filesystem, cùng Docker host hay khác host? state-root/artifact/collector config được phân phối thế nào? Ai sở hữu permission của state-root? Nếu khác host, cancel marker và sync-outbox bằng filesystem sẽ được thay thế hoặc vận chuyển ra sao?

## 5. Dispatch, stop và recovery

**R06 — dispatch/start acknowledgement:** Java mong gọi Runner bằng HTTP, queue hay operator adapter? Request cần các field nào, authentication gì, timeout và idempotency key nào? Khi không có Runner, trạng thái đúng là gì? Không mô tả RUNNING chỉ vì approve đã ghi DB.

**R07 — stop:** Java hiện ghi marker đúng resourceProject thực tế chưa? Stop được coi accepted hay completed ở thời điểm nào? Ai xác nhận cleanup? Nếu ghi marker thất bại, Java trả gì và giữ trạng thái gì? Có phân biệt stop-before-start, duplicate stop và stop-after-completion không?

**R08 — restart/recovery:** Nếu Java hoặc adapter/Runner chết sau allocation, sau scenario, sau receipt save hoặc sau ingest nhưng trước ack thì phục hồi thế nào? Có reconcile/outbox retry tự động chưa, hay chỉ manual operator? Ai có quyền gọi recover và phạm vi resource nào được phép cleanup?

## 6. Receipt ingest, replay và publication

Theo main đã đọc, Java mới có:

- `POST /api/v1/analyzer/runtime/sessions/{id}/ingest-receipt`;
- `POST /api/v1/analyzer/runtime/sessions/{id}/sync-outbox`;
- `GET /api/v1/analyzer/runtime/sessions/{id}/run-definition`.

**R09 — scope:** Những trường nào bắt buộc và phải khớp session đã pin? Source review cho thấy session/snapshot/model được so sánh có điều kiện, còn ba version IDs chưa được đối chiếu trong ingest. Điều này đã thay đổi ở branch mới chưa? Nếu chưa, quy tắc validation mong muốn là gì? ResourceProject và actual image/instrumentation info được xác thực bằng gì, thay vì chỉ tin payload?

**R10 — replay/concurrency:** Cùng receipt gửi lại phải trả gì? Cùng session/allocation nhưng khác payload phải reject hay update? Có content digest, receipt ID, lock/unique constraint hoặc cơ chế transaction nào bảo đảm hai request đồng thời không tạo hai revision không? Cho biết implementation có thật và phần mới đề xuất.

**R11 — delivery acknowledgement:** Java response nào xác nhận receipt đã commit bền vững? Runner/adapter giữ outbox tới lúc nào? Cách retry/backoff và reconciliation nếu HTTP response mất sau DB commit? Chưa thống nhất schema ack thì hãy đề xuất một JSON nhỏ.

**R12 — publication gate:** Receipt Failed/NotRun/Unavailable/cleanup Incomplete có được tạo/promote model latest-valid không? Source review thấy code có fallback model latest và tạo RUNTIME_ENRICHED latest-valid sau xử lý outcome. Bạn xác nhận hành vi hiện tại, chỉ rõ điều kiện mong muốn và bên sở hữu quyết định. Phiên thất bại nhưng có trace hữu ích vẫn cần giữ evidence; lưu kết quả và promote model là hai quyết định riêng.

**R13 — trace quality:** Khi mapping đầy đủ nhưng capture quality Partial, traceStatus có được COMPLETE không? Java/FE/assignment đọc trường nào để tránh hiểu “capture hoàn chỉnh”? Quy tắc cho Empty/Unavailable/Partial/Unmapped là gì?

**R14 — mapping/causality:** Java tin modelServiceId được pin hay rematch theo tên? Name collision, unmapped service, nhiều trace và parent span không nằm trong capture được xử lý thế nào? Có bảo toàn static edges/evidence và logical identity khi tạo runtime-enriched version không? Nêu giới hạn supported profile.

## 7. Quyền truy cập và cấu hình

**A01 — runtime authorization:** Ai được create/read/approve/stop/export definition/ingest receipt/sync-outbox? Có AccessPolicyService/service-principal guard tại các entrypoint tương ứng chưa? PR policy platform không tự chứng minh runtime đã được bảo vệ. Cho biết source enforcement và negative tests khác project/khác workspace.

**A02 — service authentication:** Worker static key/grant hiện có không tự trở thành Runner auth. Contract runtime dự kiến dùng credential/signed scope gì? Ai cấp/quản lý/rotate? Chỉ mô tả tên cấu hình và quy trình; không gửi giá trị secret.

**A03 — config/secrets:** Java đã có versioned profile/scenario store và secret references chưa? Profile/scenario xuất ra có bị redaction làm mất dữ liệu cần thực thi không? Adapter resolve secret ở đâu, tránh ghi vào definition/receipt/log bằng cách nào?

## 8. Chia việc để phía Worker không phải chờ chung chung

**P01:** Phía .NET nên làm tiếp task cụ thể nào ngay bây giờ? Với mỗi task, nêu đầu vào Java đã sẵn sàng, output .NET cần cung cấp, acceptance criteria và dependency còn thiếu.

**P02:** Phía Java nhận task nào: scope/version validation, allocation ack persistence, receipt replay/digest, publication gate, runtime policy, hoặc phần khác? Trạng thái: đã có trên main / có trên branch / đang làm / chưa làm.

**P03:** Có implementation mới trên branch riêng đã giải quyết các câu hỏi trên không? Nếu có, chỉ cần dẫn chứng, tránh hai phía làm trùng. Không tự merge hoặc thay đổi code để khiến báo cáo trông hoàn chỉnh.

**P04:** Chốt một vertical slice nghiệm thu đầu tiên: Java export definition → Runner chạy thật → allocation được ghi nhận → stop đúng allocation nếu yêu cầu → receipt ingest/replay → query model/sequence → cleanup Confirmed. Bên nào chuẩn bị fixture/environment và bên nào chạy?

## 9. Mẫu báo cáo trả lời

Tên gợi ý: `JAVA_AGENT_REPLY_YYYY-MM-DD.md`. Báo cáo phải đọc độc lập được, không cần lịch sử chat. Có thể giữ nguyên mã câu hỏi để phía Worker đối chiếu.

### A. Baseline và phạm vi kiểm tra

- Repo, branch, commit SHA, thời điểm kiểm tra và main remote biết được.
- Local changes/PR liên quan; phân biệt main với branch riêng.
- Các file đã đọc, lệnh/test đã thực chạy; phần chưa xác minh.

### B. Kết luận ngắn

- Static contract: khớp / lệch ở đâu.
- Runtime hiện chạy được tới bước nào.
- Ba dependency/quyết định cần chốt trước khi hai bên code tiếp.

### C. Trả lời theo mã câu hỏi

Với mỗi B01–B02, S01–S04, R01–R14, A01–A03, P01–P04, dùng cấu trúc:

```text
Mã câu hỏi:
Trạng thái: có trên main / có trên branch / chưa có / chưa xác minh
Hành vi hiện tại:
Bằng chứng: commit + đường dẫn file + symbol/dòng; test nếu đã chạy
Giới hạn / điểm chưa biết:
Đề xuất / bên cần làm / dependency:
```

Nếu chưa biết, ghi rõ chưa biết. Không dùng “100%”, “production-ready” hay “đã test pass” khi thiếu bằng chứng tương ứng. Không bắt buộc chạy bộ test lớn chỉ để trả lời; nếu chạy, ghi đúng phạm vi và kết quả.

### D. Contract mẫu đã loại secret

1. Một run-definition đủ điều kiện chạy hoặc giải thích rõ trường thiếu.
2. Đề xuất allocation/start acknowledgement.
3. Đề xuất stop request/ack và cleanup outcome.
4. Một receipt ingest request và response commit acknowledgement.
5. Các field bất biến, idempotency/replay rules và lỗi expected.

Các schema chưa được cả hai bên chốt phải ghi **PROPOSED**, không ghi đã hỗ trợ. Không gửi raw token/key, password, connection string hoặc customer source snippets.

### E. Kế hoạch phân công ngắn

- Java: task, trạng thái hiện tại, output, điều kiện nghiệm thu.
- Worker/Runner/adapter: task, output, điều kiện nghiệm thu.
- Những quyết định cần người dùng hai bên thống nhất.
- Kịch bản E2E đầu tiên và các case failure/cancel/replay bắt buộc.

### F. Bằng chứng kiểm thử

Ghi lệnh, commit, OS/runtime/DB/Docker, tổng pass/fail/skip và limitation. Phân biệt test mocks với Worker/Runner/PostgreSQL thật. Kết quả test trước commit hiện tại chỉ được ghi là lịch sử.

---

Cảm ơn bạn. Mục tiêu là thống nhất một contract nhỏ, rõ authority và chạy được, tận dụng static Worker và Runner đã có. Khi người dùng chuyển báo cáo trở lại, phía Worker sẽ đối chiếu rồi mới triển khai phần đã thống nhất; không xem mọi đề xuất trong thư hoặc báo cáo là quyết định cuối cùng.

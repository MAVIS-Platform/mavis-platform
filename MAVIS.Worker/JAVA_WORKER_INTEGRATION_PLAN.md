# Java chặng 3 ↔ C# Worker: kế hoạch tích hợp

Ngày đối chiếu: 21/10/2026. Đây là kế hoạch có sổ tiến độ. I01 client core/fixtures và I02 live Java client đã triển khai; các gate pipeline/live/DB tiếp tục được cập nhật bên dưới.

> Tài liệu này giữ lịch sử gap analysis tại baseline chặng 2/3.1; các câu “chưa tích hợp” bên dưới mô tả thời điểm đó, không phải hiện trạng sau merge. Hiện trạng main c0121fe và việc còn lại nằm trong [project context](../docs/mavis-context.md), [status](../docs/IMPLEMENTATION_STATUS.md) và [next tasks](../docs/NEXT_TASKS.md).

## 1. Baseline đã kiểm tra (lịch sử)

- Tài liệu `.doc_review/main/Java chang 3.pdf`: 42 trang; chặng 3.1 ở trang 23–24, diagram/evidence ở 25–26, revision/diff ở 27–28; BFS Java ở trang 29. Đây là bộ prompt/lộ trình, không phải bằng chứng nghiệm thu. Các lệnh Git và yêu cầu nằm trong PDF không được tự động thực thi.
- `origin/main`: `5392804`, chặng 2 đã merge.
- `origin/feat/stage-3-polyglot-csharp-and-canonical-model`: `ef9f88f`, đã có task 3.1: Worker client, DTOs, GraphBuilder merge và tests. Chưa thấy implementation task 3.2/3.3 trong snapshot nhánh này.
- Worker: `c07fe19`, static profile `dotnet-static/1.9`, N01 scoped API + N02–N05. Canonical bundle là `dotnet-findings/1`, `requiresCanonicalMerge=true`, chưa phải Java persisted model.
- Kiểm tra Java bằng Java 21: `mvn -pl mavis-analyzer -am test` trên snapshot tách biệt: common 4/4 pass; analyzer 51 pass/1 fail. Worker-client tests 7/7 và GraphBuilder tests 12/12 pass. Test fail là `RealFruitMicroservicesDetectionTest`, thiếu dataset ZIP có đường dẫn fallback riêng máy tác giả; không phải lỗi gọi Worker. Chưa test cả bootstrap/platform hoặc DB startup.
- Tests client Java dùng mock HttpClient/JSON tự tạo theo DTO Java; không phải test Java ↔ Worker thật. Worker 187 Linux tests/Java fixture probe của mốc N05 cũng không thay thế test với client `ef9f88f`.

## 2. Các điểm đang không khớp

1. Java gọi `POST /internal/v1/dotnet/analyze`; Worker có `POST /api/v1/dotnet/analyze`.
2. Java gửi `projectId/sourceSnapshotId/extractedSourcePath`; Worker chỉ nhận `schemaVersion/artifactGrant`, reject raw path/unknown fields. Java hiện chưa gửi service key hoặc grant.
3. Java đợi root `elements/relationships/evidences` và string warnings. Worker trả envelope provenance, `findings`, `coverage`, warning objects và `canonical.elements/relationships/evidence`. Đổi URL đơn thuần sẽ chưa đủ.
4. DTO Java nối bằng source/target/parent names; Worker nối bằng logical IDs/evidence IDs. HashMap lowercase name hiện ghi đè phần tử trùng tên, có fuzzy contains fallback. Không dùng cách này làm identity xuyên project/language/revision.
5. Java merge đang đặt C# status `VALIDATED` và fallback adapter `ROSLYN_4.8`. Worker trả candidates/resolution states, adapter profile 1.9, Roslyn package 4.10. Không nâng candidate thành validated hoặc ghi version giả.
6. Java URL matcher bỏ port; Worker giữ effective host + port. `localhost:5001` và `localhost:5002` phải là hai alias khác nhau, chưa chắc là hai canonical services cho tới khi có mapping.
7. Java gọi Worker bên trong `buildRelationshipsAndEvidences` có transaction. Request mạng chậm không nên giữ transaction ghi model. Việc load artifact/dispatch/validate phải đứng trước transaction publish.
8. Worker warnings hiện không được đưa vào job resultManifest ở luồng đã đọc; fallback rỗng có thể kết thúc `COMPLETED` mà không nói rõ thiếu C#. Pure C# không được coi thành công chỉ vì Java không ném exception.
9. ModelElement có JSON properties để giữ logical key, nhưng Evidence hiện chưa có dedicated hash/source-evidence-ID fields. Cần chọn migration hoặc manifest/evidence-link mapping có lưu bền; không bỏ hash/provenance khi import.

## 3. Ranh giới trách nhiệm

- Java platform/Vũ: immutable snapshot/artifact delivery, service/grant secrets, public job/attempt/deadline, policy, DB transactions, failure/retry/publication và API cho frontend.
- Java analyzer/Triết: client DTO/mapper, canonical schema/stable identity stewardship, Java/config findings, source-to-service ownership, endpoint alias matching, graph/diagram/evidence/revision projections.
- C# Worker/Nhựt: scoped source validation, C# findings/evidence/coverage, producer fixtures và adapter compatibility, cancellation/deadline, một impact engine. Không ghi business DB hoặc sinh diagram/layout Java.
- Hậu: UI hiển thị đúng model version, coverage/partial trạng thái và evidence; không tạo business backend song song.
- Chủ sở hữu Java cụ thể cần nhóm xác nhận theo phân chia nhiệm vụ chi tiết; các việc trên là giao diện trách nhiệm, không phân công thay nhóm.

## 4. Contract đề xuất cho lát cắt đầu tiên

Giữ contract Worker hiện có làm producer baseline và sửa Java client/mapper cho tương thích; không bật lại raw-path API để chữa mismatch. Triết/Vũ review trước khi coi là shared contract được chốt.

### Request/transport

- Client dùng `/api/v1/dotnet/analyze`, service key header; body `{schemaVersion, artifactGrant}`.
- Grant ràng buộc project, snapshot, job, attempt, artifact ID, expected input digest, audience và absolute deadline theo `N01.md`; thuật toán/key ID/encoding có shared golden fixtures.
- Java stage snapshot ở artifact ID dưới shared storage; Worker thấy root riêng được mount read-only. Ví dụ đường dẫn Windows của Java và `/artifacts/<id>` trong container không cần giống nhau. Không gửi host path cho Worker.
- Giữ riêng ZIP artifact SHA và analysis input digest. Thêm golden cases Unicode/BOM/CRLF, thứ tự đường dẫn, generated/linked source và appsettings để Java tính đúng fingerprint theo producer; không reuse ZIP SHA làm expectedInputDigest.
- Lát cắt đầu dùng synchronous analyze, chưa bắt buộc chuyển Java sang local Worker queue. Cần job/attempt context do Java cấp. Đề xuất PoC grant budget 25s/request timeout 30s/connect timeout 5s, tất cả nằm trong budget orchestration; số cuối cùng do nhóm chốt, không dùng 30s client đối với 60s Worker rồi mặc định xem là đồng bộ.
- Bounded response size/list counts, schema/version validation, không log token, request body hay exception/response body tùy ý. Không retry lỗi auth/schema/scope như lỗi mạng. Tôn trọng thread interruption/cancel.

### Response/merge

- DTO Java đọc đầy đủ schemaVersion, jobId, attemptId, projectId, sourceSnapshotId, analyzerVersion, inputDigest, findings, coverage, warning objects, projects, canonical.
- Validate provenance khớp attempt còn hiệu lực trước khi nhận; response muộn/sai snapshot/schema/hash không được publish.
- Map `Worker logicalId → ModelElement/Relationship UUID` bằng scoped ID map. Name chỉ để display/search. Giữ logical key trong properties hoặc cột do schema steward chọn; parent dựa module/project ID và nguồn Compose/config được chứng minh.
- Map proposed element/relationship kinds, dependencyKind, candidate/resolution trạng thái và origin có whitelist. Không tự default mọi relation thành HTTP; DB/type/DI/project dependencies vẫn khác nhau.
- Module COMPONENT và HTTP endpoint alias không tự là SERVICE_CONTAINER. Source root/build context + Compose/service mapping quyết định service ownership; thiếu hoặc nhiều ứng viên giữ unresolved/ambiguous.
- Chuẩn hóa endpoint alias hai bên theo URI + effective port; alias lookup trả tập ứng viên. Không fuzzy contains hoặc first-match để xác nhận service. Cross-language identity không dựa controller/class name trùng.
- Evidence import bằng evidenceIds, giữ locator, sourceSnapshotId, actual adapter version, fileHash, evidenceHash và STATIC_CODE/CONFIG. Với schema Evidence một FK element/relationship, chọn association/migration phù hợp cho evidence được tái dùng. Không chọn evidence đầu tiên chỉ vì source/target name giống nhau.
- Worker không trả excerpt; Java không tự bịa snippet hoặc dùng `RoslynWorker` làm locator thay evidence thật. Nếu cần snippet cho UI, đọc source artifact đúng snapshot với quyền và policy che dữ liệu.

## 5. Trình tự triển khai, commit và điều kiện chuyển bước

### I01 — Contract chung và migration fixtures

- [ ] Nhóm review route, grant format, digest, DTO, versions, ID map, errors và partial policy.
- [x] Java client core test đọc chính fixture Worker 1.9; producer test vẫn kiểm tra drift. Thêm invalid schema/provenance/unknown relationship/evidence orphan cases.
- [ ] Chốt nơi lưu bền logical IDs và evidence hash/source references; không mất dữ liệu khi saveAll/reload/revision.
- Commit theo nhóm: contract/DTO/fixtures trước, chưa bật gọi thật trong public pipeline.
- Gate: cùng fixture pass ở Java consumer thực và .NET, không chỉ JSON được tự tạo từ DTO consumer.

### I02 — Artifact delivery và client HTTP thật

- [x] Java cấp job/attempt/grant, atomic stage vào artifact root, Worker mount readonly; readiness riêng liveness trong test harness. Production immutable host/retention vẫn cần deployment policy.
- [x] Sửa Worker client route/header/body/response mapper và chuyển call ra khỏi transaction publish của GraphBuilder.
- [ ] Đồng bộ language manifest/discovery policy; scan bỏ hẳn subtree ignored với budget, không Files.walk rồi chỉ filter kết quả. Không mặc định bỏ mọi project test nếu Worker policy vẫn phân tích chúng. Không cam kết 1ms chỉ từ findAny().
- [x] Bounded timeout, response/body, interruption, sanitized diagnostics; no automatic retry.
- Gate: Java client thật gọi Worker thật với một snapshot C#; sai service key/grant/root/hash/expired deadline đều bị từ chối rõ ràng, không fallback thành kết quả thành công rỗng.

### I03 — Canonical import và publish

- [x] Tách canonical mapper/validator khỏi GraphBuilder batching và network I/O.
- [x] Scoped IDs/module parent + explicit snapshot bindings cho source ownership và endpoint host/port; import giữ candidate/coverage. Mapping config-bound không tự thành runtime-confirmed.
- [x] Save elements, relations, evidence và ID mapping trong transaction publish; guarded job/attempt/provenance, V3 JSONB evidence metadata và rollback checks.
- [ ] ResultManifest lưu adapter outcomes, warnings/coverage, versions/digests và attempt; chỉ promote latest khi đạt policy completeness. Không làm mất bản thành công trước đó khi attempt lỗi.
- Gate: snapshot → Java job → Worker → DB model/evidence → reload đúng provenance, chạy lại không duplicate, response muộn không ghi vào model khác.

### I04 — Failure matrix và mixed-language acceptance

- [ ] Java-only: Worker NOT_APPLICABLE, không gọi mạng; Java vẫn thành công.
- [ ] C#-only + Worker tắt/timeout/rejected: attempt lỗi rõ ràng, không COMPLETED với model rỗng.
- [ ] Mixed + Worker lỗi: Java findings có thể giữ theo policy PARTIAL, nhưng C# adapter outcome/coverage hiển thị thiếu; không báo đầy đủ hay tự ghi đè latest complete model.
- [ ] Java → C# và C# → Java với explicit bindings/localhost ports/evidence đã pass; duplicate alias/service + absent mapping có tests. Corpus chung/C# DB xuyên stack/duplicate class fixtures còn cần mở rộng.
- [ ] Cancel/late response/retry/new attempt, hash mismatch, malformed result, unknown types, orphan evidence và publish rollback.
- [ ] Đưa dataset thiếu vào test resources/fixture mechanism tái lập; không hardcode đường dẫn máy tác giả.
- Gate: test integration dùng Java client thật + Worker thật + DB fixture; unit mock chỉ là một lớp kiểm tra.

### I05 — Nối task 3.2/3.3 và impact, sau I03/I04

- [x] Backend diagram/evidence drawer pin modelVersion, tạo 3 projections lúc publish, không gọi lại Worker. Coordinate-only layout edit không đổi source model/evidence; browser/workspace-policy acceptance còn lại.
- [x] Backend revision/diff giữ stable logical identity khi đổi display name; key `type + lowercase(name)` trong PDF cần sửa vì rename bị thành add/remove và trùng tên bị đè. Giữ lineage/provenance của evidence cũ.
- [x] Backend adapter đã thay BFS Java bằng .NET; chặng 4 trong PDF đề xuất thêm BFS Java, xung đột phân công chi tiết đã dùng cho N07: giữ một .NET impact engine; Java nạp typed service graph/version, gọi Worker, enrich/persist/UI projection. Không tự merge thêm engine Java song song.
- [ ] Contract impact riêng: Java `SERVICE_HTTP_CALL` cần map sang edge kinds Worker hiện chấp nhận; pin model/graph revisions, loại containment/code/data access khỏi service-impact input theo policy. Runtime không xóa static evidence vì chưa được chạy qua.

## 6. Thứ tự code ngay sau khi plan được dùng

Làm I01 rồi I02 trước. Tận dụng client/fallback/batch-save đã có ở `ef9f88f`, thay seam DTO/transport và canonical mapping thay vì viết lại Java analyzer. Worker sửa phần producer/fixtures trên `feat/worker-standalone-analysis`; Java baseline đã được user cho phép nhập vào nhánh Worker để triển khai seam tích hợp; không sửa remote nhánh bạn khác. User tự merge, không tự merge main hay sửa nhánh bạn khác.

Chưa cần triển khai thêm Runner/runtime để giải quyết task 3.1. Runtime tách thành lát cắt sau khi static interoperability đã đạt.

I02 verification: Java 21 reactor selected tests 15/15 pass trên Worker Linux thật, không skip. Producer publish từ HEAD sạch không có local Program.cs edits cũ. Java pipeline publication vẫn chưa hoàn thành ở mốc client leaf này; xem I03 tiếp theo.

I03 implementation: WorkerModelPublisher quản lý begin/publish/fail, job+project lock, pinned attempt/deadline; WorkerCanonicalImporter giữ logical IDs/candidate status và evidence provenance; orchestrator gọi network trước publish. Public upload/FE, service alias reconciliation và durable leases/restart recovery chưa được nghiệm thu.

I03 verification 21/10: 29/29 selected Java tests pass trên real Worker + PostgreSQL, V1/V2/V3 được apply, source hashes/provenance reload/duplicate guard/scope mismatch/partial/latest/SQL rollback/cancel và orchestrator ordering được kiểm thử. I03 core publication đã xong; alias reconciliation/public controller/FE và I05 vẫn unchecked. .NET full suite 187 pass + 1 Linux-only skip.

I03–I04 explicit binding verification: 33 selected tests pass (9 client core + 24 analyzer), không skip, real Worker/PostgreSQL. Giữ nguyên raw candidate graph, thêm CONFIG_BOUND service projections có binding SHA/evidence; chưa thay thế Java legacy graph matching hoặc nghiệm thu frontend.

I04 API milestone: 37 selected integration tests pass, MVC upload/job/history + after-commit orchestration và live Worker/PostgreSQL. Frontend/browser, production JWT và import/analyze separation chưa nghiệm thu; không tick toàn I04 Done.

I05 diagrams/evidence backend milestone: MVC integration đọc 3 diagrams, cập nhật layout, chặn node ngoài model và non-owner, evidence trả đúng snapshot/provenance; 37 selected tests pass. Revision/diff và impact adapter chưa triển khai ở mốc này.

I05 revision milestone: V4 lineage + atomic controlled revision/copy evidence/diagrams + logical-key diff đã pass targeted API integration, gồm adds/removes/rename/stale/rollback/ownership. UI và final corpus chưa nghiệm thu.

I05 impact milestone: single .NET engine wired through real Java API/DB graph with revision/path evidence validation; 39 selected integration tests pass. UI/runtime context/history/full acceptance vẫn mở.

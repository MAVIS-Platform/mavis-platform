# MAVIS — bối cảnh hiện hành cho developer và coding agent

> Đối chiếu ngày 21/10/2026 với main c0121fe: Java chặng 0–6 và Worker đã tích hợp. Đọc file này trước khi sửa code. Tiến độ chi tiết: [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md); task tiếp theo: [NEXT_TASKS](NEXT_TASKS.md).

## 1. Hiểu dự án trong một lượt đọc

MAVIS hỗ trợ học và đánh giá kiến trúc microservices. Sinh viên hoặc người dùng nhập dự án Java Spring/C# ASP.NET, phân tích thành mô hình có bằng chứng, xem nhiều diagram, tự kiểm tra rule, xác nhận chỉnh sửa và phân tích tác động. Giảng viên quản lý workspace/bài tập, yêu cầu artifact, nhận submission và phản hồi đúng model/diagram đã nộp. Admin quản lý tài khoản, audit và cấu hình/vận hành cần được hoàn thiện.

Runtime là một nhánh thực nghiệm có kiểm soát: chạy HTTP scenario trên ứng dụng container, thu OpenTelemetry trace và đối chiếu causal interactions với model đã chọn. Runtime không bắt buộc cho mọi dự án; bài tập có thể quy định cần trace. Trace chưa đi qua một cạnh không chứng minh cạnh tĩnh đó không tồn tại.

Proposal trước Review 1 nói về Developer SaaS, subscription/billing/payment. Đó không phải backlog mặc định hiện nay. AI chỉ giải thích kết quả có căn cứ, không tự quyết định kiến trúc hay tạo evidence. Entity AI có trong schema không có nghĩa provider/API AI đã hoàn thành.

Hiện có backend/Worker/Runner và các test dưới đây; chưa có frontend mới được xác nhận. “Có code”, “test đã chạy” và “đã nghiệm thu toàn hệ thống” là ba trạng thái khác nhau.

## 2. Nguồn sự thật và cách dùng tài liệu

- Code/migrations/contract và test thực chạy xác định hành vi hiện có. Ghi commit và scope khi báo tiến độ.
- Phân công sau Review 1 bản 2.0 ngày 20/10/2026 xác định mục tiêu V01–V18, T01–T18, N01–N18, F01–F18 và P01–P24.
- Nguồn riêng của nhóm: `.doc_review/main/phân chia nhiệm vụ chi tiết.docx`, `Report 1.docx`, Mainflow/Mainflow business, System architecture, ERD, use case và screen flows. Các file đó chưa track; agent không cần preload chúng để sửa task đã mô tả trong docs.
- `Java chang 3.pdf` là hướng dẫn triển khai, không tự thay thế runtime contract đang có trong code.
- Không coi mọi bước trong lane “Analysis Worker” trên mainflow đều chạy trong .NET. Java orchestration/canonical publication vẫn thuộc Java.
- Nếu tài liệu và code lệch: ghi rõ chỗ lệch, kiểm tra đúng module; không tự xây implementation thứ hai hoặc sửa business rule theo proposal cũ.

## 3. Kiến trúc và trách nhiệm

### Java backend: business và publication authority

Source: `MAVIS-Platform/mavis-be/`. Maven reactor gồm shared `worker-java-client`, `mavis-common`, `mavis-platform`, `mavis-analyzer`, `mavis-bootstrap`.

- common: JPA entities/repositories, shared errors/contracts, utilities; model/snapshot/job/evidence/diagram/evaluation/runtime/submission/audit data.
- platform: auth/security, project/workspace/assignment, submission/feedback và admin/audit.
- analyzer: ingestion/storage, Java AST/config/Compose detection, Worker adapter, canonical publication, diagrams/revision/diff, impact adapter, deterministic evaluation, runtime session/trace APIs.
- bootstrap: runnable Spring Boot application, configuration và Flyway V1–V6.

Java nhận public requests, xác thực/quyền theo policy, giữ DB và artifact storage, phát analysis job, gọi C# rồi hợp nhất kết quả. Java sở hữu ID persisted, transaction, model version, latest-valid và kết quả người dùng. Worker không ghi business database.

### C# Worker: analysis và impact engine

Source: `MAVIS.Worker/src/MAVIS.Worker.*`; integration client ở `MAVIS.Worker/integration/java-client`.

Nhận signed artifact grant, đọc snapshot được cấp quyền, phân tích C# source bằng Roslyn theo supported profile, trả findings/evidence/coverage/warnings/digest và provenance. Không build/run source mục tiêu, không tải arbitrary SourceLocation qua HTTP.

Impact nhận typed service graph của model/revision đã chọn, chạy reverse BFS trong .NET và trả dependent services, hop/path/edge/evidence references và limits/warnings. Java load/authorize/enrich graph, không chạy một BFS fallback thứ hai.

### Dedicated Runtime Runner: execution boundary riêng

Source: `MAVIS.Worker/src/MAVIS.Runner`. Là executable riêng với preflight, Compose override, readiness, HTTP scenario, instrumentation/Collector, causal trace correlation, timeout/cancel/cleanup/recovery và local receipt outbox.

Docker socket chỉ thuộc môi trường Runner/operator. Không đưa socket vào Java business container, Worker analyzer hoặc workload của source đích. Profile đã test là local Docker Desktop Linux image-only PoC; chưa chứng minh dedicated production host/tenant isolation hoặc arbitrary repository build execution.

### Frontend

Theo xác nhận của người dùng: nhánh FE chưa merge/chưa hoàn tất và có thể còn UI cũ. Không có source FE mới sẵn sàng trong baseline đã đối chiếu. Contract phải sẵn để FE dùng sau; không báo browser/E2E acceptance từ MockMvc.

## 4. Phân công để không giẫm chân

- Hoàng Vũ — SE180716, V01–V18: platform, database/migration, auth/policy, artifact/job orchestration, runtime control/persistence, admin/DevOps.
- Lê Minh Triết — SE181979, T01–T18: Java analyzer, canonical model/evidence, graph/diagram projections, rule evaluation, controlled revision/diff, runtime model mapping, AI/explanation/export.
- Huỳnh Anh Nhựt — SE180710, N01–N18: .NET Worker, Roslyn/profile, single impact engine, Dedicated Runner, HTTP scenario/OTel/causal correlation, lifecycle/runtime PoC/regression/runbooks.
- Lê Ngọc Hậu — SE181741, F01–F18: frontend, API state/UI graph/diagram/evidence, classroom/submission/runtime/AI/admin screens và E2E.

Owner là người điều phối theo phân công, không khẳng định ai đã viết từng dòng code. Nhánh Worker có các adapter Java và integration tests để nối hệ thống. Không nhân đôi module đã có trên main. Thay DTO/schema/API chung cần cập nhật producer, consumer, test và docs trong cùng lát cắt; schema do Vũ phối hợp người dùng entity review.

## 5. Luồng static: nhận gì → làm gì → trả gì

1. Java import ZIP hoặc GitHub: nhận project/source, lưu archive bằng tên do server sinh, tính raw artifact SHA, tạo SourceSnapshot. Import không tự chạy analysis; trả snapshot và `analysisRequired=true`.
2. Client gọi `POST /api/v1/analyzer/snapshots/{snapshotId}/analyze` với `Idempotency-Key`. Java authorize/lock project, tạo PENDING job hoặc trả job cũ cho request trùng; dispatch AFTER_COMMIT.
3. Orchestrator load snapshot/job từ DB; không lấy event path làm authority. Begin durable attempt/deadline, kiểm tra archive SHA, bounded sealed extraction, chạy Java AST/config/Compose và gọi Worker ngoài publication transaction.
4. Worker nhận `{schemaVersion, artifactGrant}` qua `POST /api/v1/dotnet/analyze`. Grant ký project/snapshot/job/attempt/deadline/path/digest. Root mount read-only, service key và grant key tách nhau.
5. Worker đọc `.sln`, `.csproj`, `.cs`, `appsettings*.json` theo profile `dotnet-static/1.9`. Trả IDs nguồn, findings với file/dòng, coverage, warnings, analyzerVersion và inputDigest; không trả secrets/config values hoặc suy class/project thành runtime service đã xác nhận.
6. Java validate response scope/provenance, import canonical elements/relationships/evidence. `mavis.bindings.json` cung cấp service ownership/project roots/endpoint aliases tường minh. Missing/ambiguous giữ unresolved/ambiguous; không fuzzy-map theo display name.
7. WorkerModelPublisher lock job/project, fence đúng attempt/deadline, lưu model/nodes/edges/evidence/manifest/default diagrams trong một transaction. Complete mới promote latest; partial mixed-language giữ draft, failed publication không làm mất model tốt trước đó.
8. API job trả raw status cùng `analysisState`, `dotnetStatus`, `modelVersionId`, `promotedLatest`. Frontend cần đọc outcome, không coi HTTP 200 hay raw COMPLETED là model đã hoàn tất không cần review.

Cancel: pending có thể CANCELLED ngay; running chuyển CANCELLING rồi xác nhận dừng execution mới CANCELLED. Deadline recovery có thể FAILED với `CANCEL_OUTCOME_UNCONFIRMED`; không báo stopped khi chưa biết. Attempt ledger đã bền vững; Worker queue riêng vẫn trong RAM, không phải renewable distributed lease/retry scheduler.

## 6. Model, diagram, revision và impact

- SourceSnapshot = source đầu vào có hash; ModelVersion = kết quả canonical/confirmed model; DiagramVersion = projection/layout từ model; Evidence = căn cứ có locator/provenance. Các ID này không thay thế nhau.
- Các quan hệ CODE_DEPENDENCY, SERVICE_HTTP_CALL, DATABASE_ACCESS và containment có ngữ nghĩa khác nhau. Containment/code/DB không tự là service HTTP edge để impact.
- Default diagrams: DEPENDENCY_GRAPH/SERVICE, C4/CONTAINER, C4/COMPONENT. Chúng được sinh từ model đã lưu, không gọi parser/Worker lại. Chưa đồng nghĩa mọi loại UML/export trong SRS đã xong.
- Layout chỉ cập nhật tọa độ node known/bounded. Payload giữ Java `type/position/data`, `source/target/relationType` cùng alias Worker. Không cho layout request sửa node/edge/model/evidence.
- Controlled revision giữ base lineage, lock project, yêu cầu latest base, copy logical identities/evidence và tạo model mới. ADD/UPDATE/REMOVE được validate; không sửa model gốc. Java payload added/modified/removed và Worker elements/relationships cùng dùng một engine; không trộn hai payload trong một request.
- Diff dùng logical keys/Worker identity/lineage; rename là modified, không remove/add theo tên. Legacy analyses độc lập thiếu stable identity không được fuzzy nối.
- Versioned impact `/models/{id}/impact` pin model/graph SHA/target; dùng confirmed service mappings/typed edges, trả paths và evidence. `/impact` giữ detailed DTO của main; `/impact/simple` trả node list. `sessionId` tại đây là modelVersionId, không project/latest fallback.
- Java có deterministic rule evaluation: cycle, shared database, isolated service, evidence grounding trong supported rules. Rule DFS là rule check; không phải một impact BFS thứ hai.

## 7. Luồng runtime và khoảng cách tích hợp còn lại

Java đã có preflight/session create/approve/stop/list/get, trace ingest/sequence APIs; có DTO, persistence và tests. Hiện `approve` có bước sinh override/cập nhật RUNNING trong DB; điều này chưa chứng minh Docker workload đã chạy hoặc Runner đã nhận lệnh. `stop` DB cũng chưa phải receipt cleanup của Dedicated Runner.

Runner độc lập nhận RuntimeRunDefinition: session/model/source/profile/run-configuration/scenario version IDs, Compose image-only input, approved local profile, scenario và confirmed service mappings. Nó validate → allocate → instrument → ready → HTTP requests → preserve trace → cleanup → local receipt rồi stdout.

- Trace giữ traceId/spanId/parentSpanId, dựng causal parent-child edges; không nối trace khác nhau hoặc chỉ sort timestamp để suy lời gọi.
- Collector và projection lọc thông tin nhạy cảm. Execution/scenario/evidence/trace quality/mapping/cleanup là các trạng thái riêng; HTTP scenario fail vẫn có thể có trace hữu ích.
- Receipt giữ actual image IDs và selected versions; image/source correspondence và production profile acceptance vẫn Unverified.
- Receipt lưu trước stdout tại `<state-root>/receipts/<generated-project>.json`, không overwrite; platform persistence vẫn CallerOwned. Chưa có cross-host delivery/ack/retry hoàn chỉnh.
- Không tự xóa static dependency vì không thấy trong runtime. Sequence/interaction diagram phải dựa trên saved, scoped evidence đúng model/revision.

## 8. Giáo dục, submission và admin trên main

Chặng 6 có submission snapshot gắn assignment/project/source/model/diagram và optional evaluation/runtime; kiểm tra deadline và các liên kết được implement. Feedback có anchor element/relationship và kiểm tra cùng model của submission; sửa/xóa feedback kiểm tra author. Admin có list users/status/role/dashboard/audit APIs.

Đây là code đang có, chưa phải chứng nhận policy đầy đủ: cần rà project ownership/workspace membership/lecturer/admin matrix, runtime phải khớp model/source chứ không chỉ project, và không fallback latest source cho một bài nộp cần pinned evidence. Chỉ thấy test source hoặc chặng đã merge không chứng minh tất cả negative authorization cases đã chạy.

## 9. Bản đồ code tối thiểu

Mở đúng khu vực theo task, không scan toàn repo:

- Import/storage: `mavis-analyzer/.../upload`, `storage`; `mavis-common/.../utils/ZipUtils.java`.
- Static job: `mavis-analyzer/.../orchestrator`; `workerclient/service/impl/WorkerModelPublisher.java`, `WorkerCanonicalImporter.java`.
- Service mapping: `workerclient/service/impl/ServiceBindingIndex.java`, `CrossLanguageServiceLinker.java`.
- Worker transport: `MAVIS.Worker/integration/java-client/src/main/java/com/mavis/workerclient/`; Java Spring adapter `mavis-analyzer/.../workerclient`.
- C# discovery/parser: `MAVIS.Worker/src/MAVIS.Worker.Infrastructure/CSharp/DotnetProjectAnalyzer.cs`; source analysis DTO/use case trong `MAVIS.Worker.Application/Analysis`; HTTP controllers trong `MAVIS.Worker.Api/Controllers`.
- Impact: Java `mavis-analyzer/.../impact`, compatibility `graph`; .NET implementation tìm `VersionedImpact`/impact types trong Worker source.
- Diagrams/revisions/rules/runtime APIs: `mavis-analyzer/.../diagram`, `model`, `evaluation`, `runtime`.
- Educational platform: `mavis-platform/.../workspace`, `assignment`, `submission`, `admin`, `security`.
- Runtime execution: `MAVIS.Worker/src/MAVIS.Runner/RunnerProgram.cs`, `DockerComposeSession.cs`, `RuntimeSessionLifecycle.cs`, `RuntimeReceiptStore.cs`, `SessionRecovery.cs`, `TraceCorrelator.cs`.
- Migration authority: `mavis-bootstrap/src/main/resources/db/migration/`; tests copy resources through their build configuration.

`...` trong đường dẫn Java là `src/main/java/com/mavis/analyzer` hoặc `com/mavis/platform` theo module. Các thư mục source cũ ngoài Maven reactor và legacy C# APIs không phải nơi mặc định thêm chức năng mới.

## 10. Việc cần giữ đúng trước khi code

- Không báo Worker hoặc MAVIS “100% done”. Xem [tiến độ](IMPLEMENTATION_STATUS.md) và chọn ticket có owner/DoD.
- Giữ single impact engine, immutable version references, evidence/provenance, supported-profile warnings và conservative partial states.
- Không chạy source người dùng trong static analyzer; không mount arbitrary host directories/socket vào workload.
- Không sửa applied migrations V1–V6 để hợp entity mới; tạo migration mới và test upgrade.
- Auth production chưa nghiệm thu: dev-bypass mặc định đang bật trong config; SecurityUtils còn dev header/seed-user fallback; tắt filter bypass một mình chưa chứng minh mọi method có policy đúng.
- Không ghi/copy real secrets vào docs hoặc fixtures. Config hiện tại là dev setup, không phải production template.
- Không auto-merge vào main. Theo phiên làm việc này chỉ commit/push feature branch đã được người dùng chỉ định; người dùng tự merge.
- Kết thúc mỗi task: cập nhật implementation status + subsystem docs, ghi exact tests/commit/scope và phần còn thiếu. Không tick checkbox chỉ từ code tồn tại.

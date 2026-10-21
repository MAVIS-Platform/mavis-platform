# Tiến độ triển khai MAVIS

Đối chiếu: 21/10/2026, main c0121fe (Java chặng 0–6 + Worker đã merge). Nội dung dưới đây không phải số phần trăm hoàn thành. Owner theo phân công Review 1, không phải thống kê tác giả commit.

## Cách đọc trạng thái

- **Verified slice**: có implementation và test đã thực chạy, chỉ trong phạm vi mô tả.
- **Code present**: tìm thấy implementation/test source; chưa xác nhận toàn scope hoặc chưa chạy trong lượt kiểm chứng này.
- **Partial**: có lát cắt hoạt động nhưng còn integration/policy/acceptance.
- **Pending acceptance**: cần dataset, frontend, môi trường hoặc review nhóm.
- **Not verified**: chưa có đủ bằng chứng; không suy ra chắc chắn chưa ai code trên nhánh khác.

Không đánh dấu một PBI hoàn thành chỉ vì task .NET độc lập hoặc một controller test đã pass.

## 1. Baseline và bằng chứng kiểm thử

- Java main: stage 0 foundation, stage 1 platform, stage 2 ingestion/Java AST, stage 3 polyglot/canonical/diagrams/revision, stage 4 impact/rule evaluation, stage 5 runtime/OTel APIs, stage 6 submission/feedback/admin.
- Worker feature commits tiêu biểu: N01 scoped API; N02–N05 static profile; I01–I05 Java adapter/publication/diagram/revision/impact; P03 explicit analysis; durable attempt ledger; bounded artifact/extraction; Runner .NET 10 regression; receipt outbox.
- PR #19 resolution commit 4b4e183 hòa giải Java chặng 3–5 và Worker. Main c0121fe đã chứa kết quả Worker; stage 6 nằm ở 70e61a7. Không dùng số PR như bằng chứng mọi acceptance criterion đã đạt.
- **Java regression thực chạy:** 140/140, gồm client 11, common 8, analyzer 121; lệnh `Test-JavaWorkerIntegration.ps1 -Database -TestFilter '*Test,!RealFruitMicroservicesDetectionTest'`. Bao gồm runtime/evaluation APIs/services và Worker/PostgreSQL thật. Final targeted diagram/model/controller/API 23/23 pass sau bổ sung compatibility fields; đây không phải 23 case mới để cộng vào 140.
- **Ngoại lệ công khai:** RealFruitMicroservicesDetectionTest cần fruit-market-microservices.zip ngoài repo, được loại khỏi lần chạy trên. Chưa có unfiltered full Maven acceptance.
- **Java stage 6:** có unit tests ở platform và MockMvc integration sources ở bootstrap cho submission/feedback/admin. Chưa chạy lại platform/bootstrap toàn bộ sau sync stage 6 trong lượt docs này; không gán kết quả 140 analyzer tests cho các test đó.
- **Worker Windows:** 189 pass, 1 Linux-only skip / 190 total, sau receipt outbox. Test chạy working tree; các local edits API/legacy interface cũ không được commit cùng receipt. Clean Linux publish được dùng cho Java integration trước đó.
- **Worker Linux compatibility:** 187/187 trước receipt trên SDK 10.0.402; repository pin SDK 10.0.204. Không coi đó là cùng-patch reproducibility hoặc coverage cho hai test receipt mới.
- **Docker PoC:** Runner .NET 10, Success, SecondProject, Failure, StartupFailure, Timeout, Cancel và abandoned allocator recovery đều pass; các resource sets được kiểm tra rỗng. Một receipt smoke tiếp theo xác nhận saved JSON khớp stdout. Chi tiết committed ở [POC_EVIDENCE](../MAVIS.Worker/samples/runtime-poc/POC_EVIDENCE.json), trường net10RunnerRegression và [Worker README](../MAVIS.Worker/README.md).
- **N18 pilot:** tiny fixture, first HTTP analysis 693.50 ms, 5 warm mean 18.98 ms, Docker memory sample 150.5 MiB/512 MiB. Không phải peak RSS/corpus/concurrent tenant benchmark. NuGet advisory query 6 projects không báo known vulnerable packages tại thời điểm chạy; không bao gồm Maven/OS/agent audit.
- Browser/E2E, dedicated production isolation, SRS thresholds, full JWT/permission matrix và business scenarios có credentials chưa được nghiệm thu.

## 2. Java/platform — V01–V18 (Hoàng Vũ)

- **V01 Build/schema:** code present, Java 21/Maven/Flyway V1–V6; integration DB schema kiểm chứng đến V6. Full bootstrap deployment gate còn mở.
- **V02 Contracts:** verified scoped Worker client + shared fingerprint/grant fixtures, canonical/impact/public outcome adapters. Final cross-team sign-off và contract governance tiếp tục.
- **V03 Accounts/login:** auth/JWT/OTP code present. Production settings và negative auth acceptance chưa xong; còn dev fallback.
- **V04 Policy:** partial. Static model/job owner guards đã test; workspace/member/lecturer/admin matrix toàn hệ thống cần audit, không đánh dấu full RBAC done.
- **V05 Projects:** controllers/services và personal/assignment model code present; end-to-end owner/member lifecycle chưa nghiệm thu toàn bộ.
- **V06 Workspace/assignment:** code present; policy membership/role và FE workflows còn acceptance.
- **V07 ZIP/GitHub snapshot:** verified static integration. Import tách analyze; bounded server-named storage, artifact SHA/sealed extraction; GitHub variants/real remote corpus vẫn cần coverage.
- **V08 Durable jobs/publication:** verified attempt ledger, idempotent requests, after-commit dispatch, fences, atomic publication, cancellation/deadline/lost-event recovery. Renewable leases, automatic retry/capacity/retention chưa hoàn tất.
- **V09 Version persistence/query:** verified static model/evidence/diagram publication, history và controlled revision interfaces; expanded policy/runtime cross-version acceptance còn mở.
- **V10 Reference source:** assignment/reference data là baseline; public reference publishing/download/export workflow chưa được xác minh hoàn tất.
- **V11 Submission/feedback/export:** stage 6 code present cho pinned submission/feedback anchors, queries/counts/deadlines. Cần permission/version alignment/immutability acceptance và export artifact; chưa có bằng chứng full export.
- **V12 Admin/audit/monitoring:** stage 6 CRUD/status/role/stats/audit code present. Kiểm soát role, masking và operational telemetry cần kiểm chứng riêng.
- **V13 Providers/secrets:** not verified end-to-end; không coi dev config hoặc in-memory secret refs của Runner là platform secret store.
- **V14 Runtime config/scenario APIs:** partial. Java session/preflight/approval/trace APIs có; versioned profiles/run-config/scenario persistence và approval lifecycle cần nối Runner.
- **V15 Runtime orchestration/quota/stop:** partial. DB state APIs có; chưa có authenticated cross-host dispatch/ack, capacity lease, actual stop/cleanup reconciliation hoàn chỉnh.
- **V16 CI/staging/backup:** pending acceptance. Không có bằng chứng pipeline full platform/Worker/runtime + backup/restore được nghiệm thu; PR-agent workflow không thay CI build/test.
- **V17 Platform performance/security tests:** test sources có, Worker/static integration đã kiểm chứng; stage 6 bootstrap/production JWT/negative RBAC và load corpus vẫn mở.
- **V18 Handover/docs:** tài liệu subsystem và bộ tổng thể này có; release/staging evidence, demo/reference corpus, vận hành chung và nghiệm thu nhóm còn lại.

## 3. Java/analyzer — T01–T18 (Lê Minh Triết)

- **T01 Profile/ground truth:** Java AST fixtures/tests có; corpus ground truth và threshold chung chưa nghiệm thu.
- **T02 Compose/config:** detectors code present, regression tests pass trong bộ analyzer; automatic ownership từ mọi Compose/config pattern chưa được chứng minh.
- **T03 Java elements/endpoints:** AST visitor/parser code và regression có; chỉ kết luận supported patterns, không full Spring semantics.
- **T04 Java HTTP calls:** supported visitors có tests; literal endpoint alias giữ host/port. Dynamic config/Feign resolution/corpus lớn còn mở.
- **T05 Java code/database dependencies:** code và visitor tests có; service/code/database semantics phải giữ tách biệt, coverage thực tế cần review.
- **T06 Evidence/coverage/provenance:** verified static Java–C# import/provenance/copy/reload/rollback; legacy evidence normalization và runtime linkage cần tiếp tục.
- **T07 Canonical merge:** verified single publication path, scoped C# result, explicit bindings cả hai chiều; no fake service ownership. Compose inference/corpus ambiguous mappings còn acceptance.
- **T08 Graph/query:** persisted graph/read APIs có; impact target/model readiness/revision pinned. Legacy graph-read latest/project fallback còn, không áp dụng fallback đó cho impact.
- **T09 Diagrams:** verified dependency graph, C4 container/component, layout/evidence APIs; chưa khẳng định các notation/export còn lại đã xong.
- **T10 Rules:** verified analyzer regression cho cycle/shared DB/isolated/evidence-grounding supported rules; corpus findings và classroom interpretation còn acceptance.
- **T11 Java instrumentation PoC:** verified local runtime Java agent cùng .NET cả hai chiều; dedicated production host/profile chưa nghiệm thu.
- **T12 Controlled revision/diff:** verified logical identity/rename/add/remove/incident edges/evidence/stale-base/cycle rollback. Java/Worker payloads đã hòa giải; UI và broader edit semantics cần scope riêng.
- **T13 Runtime-to-model mapping:** partial. Java ingest/sequence service và Runner confirmed mappings có; chưa có end-to-end receipt ingest/version/image-source correspondence được nghiệm thu.
- **T14 Grounded AI:** entity/repository hiện diện; active provider/API/grounding/failure/citation validation chưa được chứng minh. Không kế thừa claim AI đã xong từ proposal cũ.
- **T15 Export/report/manifest:** not verified complete. Projection/manifest persistence không bằng file export SVG/PNG/PDF/bundle đã nghiệm thu.
- **T16 Impact API/evidence:** verified Java APIs delegate one .NET engine, typed service graph, revision/path/evidence validation; runtime context/history/UI highlights còn mở.
- **T17 Quality measurements:** fixtures/selected regression và pilot Worker có; external Java dataset thiếu, approved ground truth/threshold còn pending.
- **T18 Docs/final integration:** subsystem docs và tổng thể đã có; final corpus, release and acceptance report tiếp tục.

## 4. Worker/Runner — N01–N18 (Huỳnh Anh Nhựt)

- **N01 Worker/API upgrade:** verified .NET 10, SDK/package locks, service auth, signed scope/deadline/digest/error/readiness, real Java adapter. Same-patch Linux reproducibility và production auth acceptance còn mở.
- **N02 Project/config discovery:** verified bounded source-only supported profile; project refs/compile items/appsettings, path/alias/port identity. Full MSBuild/conditional imports/environment evaluation ngoài profile.
- **N03 Structure/endpoints:** verified namespaces/types/interfaces/partial declarations/selected relations, controller/Minimal API supported patterns và line evidence. Convention/framework completeness không được claim.
- **N04 Outgoing HTTP/named clients:** verified selected HttpClient/factory/named/typed/config/Refit patterns với unresolved/ambiguous warnings; không tự biến client name thành service.
- **N05 DB/code/evidence:** verified selected DI/DbContext/DbSet/query/save/code dependencies, sensitive data projection; full EF/NuGet/container semantics ngoài profile.
- **N06 Early runtime PoC:** verified local .NET↔Java Docker/agents/Collector; samples không phải arbitrary customer app compatibility.
- **N07 Impact engine:** verified typed reverse BFS/path/depth/cycle/diamond/version tests và Java delegation. Không rewrite BFS trong Java; corpus/history/runtime overlay còn acceptance.
- **N08 Separate Runner:** verified executable riêng và local operator adapter. Dedicated host, tenant boundary, remote gateway/dispatch chưa hoàn tất.
- **N09 Compose preflight/policy:** verified strict image-only Linux profile, reject host mounts/socket/privileges/host networking/ports và inspect resource controls. Không hỗ trợ generic source build profile.
- **N10 Images/instrumentation/readiness:** verified pinned runtime/Collector/agent SHA/labels, overrides/readiness và actual image IDs. Source↔image attestation/production profile acceptance vẫn Unverified.
- **N11 HTTP scenario runner:** verified ordered bounded methods/status/body/variables/dependencies/protected refs qua stdin/memory. Platform authoring/approval/secret store và stateful reset chưa xong.
- **N12 Collector/intake/artifacts:** verified OTLP/file capture/allowlist/redacted projection và local receipts. Java durable artifact ingest/delivery ack/retry chưa hoàn tất.
- **N13 Causal trace graph:** verified parent-child/trace identity/missing-parent/cycle/unmapped warnings; không timestamp-only, không xóa static edges vì thiếu observation. Cross-platform accepted mappings còn lại.
- **N14 Deadline/cancel/cleanup/janitor:** verified local lifecycle/cleanup/recover/orphan PoC; Java static attempts riêng có deadline recovery. Automated remote runtime janitor/lease reconciliation còn mở.
- **N15 Platform integration:** static verified; runtime partial. Java runtime APIs và Runner outbox chưa tạo thành durable cross-host state machine thống nhất.
- **N16 Experiments/failure matrix:** 6 runtime cases + abandoned recovery verified; authenticated/stateful business scenarios, dedicated runner environment và approved corpus còn pending.
- **N17 Runbooks/handover:** Worker/static/Runner/integration runbooks có. Người khác chạy staging, operator policy/retention và final handover acceptance chưa chứng minh.
- **N18 Regression/performance:** Windows/Linux compatibility/Java regression/live PoC, NuGet advisory và tiny timing pilot có. Same SDK Linux, cold-cache/peak-memory/concurrency/corpus/threshold và full supply-chain audit còn mở.

## 5. Frontend — F01–F18 (Lê Ngọc Hậu)

Cả 18 mục dưới đây **chưa được nghiệm thu trong baseline này**. Người dùng xác nhận nhánh FE chưa merge/chưa xong và có thể còn UI cũ. Đây không phải kết luận về mọi commit riêng của Hậu; cần nhận branch/baseline mới rồi đánh giá.

- F01: frontend foundation/design system — not verified.
- F02: API client/mock/shared states — not verified.
- F03: account/session UI — not verified.
- F04: project/import/snapshot explorer — not verified; phải tách import và analyze.
- F05: jobs/history/outcome — not verified; cần partial/review/cancelling distinction.
- F06: lecturer workspace/assignment/reference — not verified.
- F07: pinned submission/feedback — not verified.
- F08: interactive Cytoscape graph — not verified.
- F09: evidence/coverage/warnings — not verified.
- F10: diagram viewer/rule findings — not verified.
- F11: controlled edit/version diff — not verified.
- F12: impact paths/highlights across views — not verified.
- F13: runtime mapping/config/secrets UI — not verified.
- F14: scenario editor/approval — not verified.
- F15: runtime progress/trace/cancel — not verified.
- F16: AI/explanation/evidence navigation — not verified.
- F17: admin/integrations/audit/runtime — not verified.
- F18: export/usability/performance/E2E — not verified.

## 6. Toàn bộ Product Backlog — P01–P24

Các trạng thái là tổng hợp cross-team, không thay Definition of Done trong phân công:

- P01 account/session: backend có, production policy/FE acceptance mở.
- P02 personal project: backend có, permissions/lifecycle/UI mở.
- P03 ZIP immutable snapshot: verified backend slice; FE two-step workflow/operational retention mở.
- P04 GitHub pinned commit: backend slice có, remote/provider/corpus acceptance mở.
- P05 Java evidence analysis: code/tests có, approved ground truth/coverage acceptance mở.
- P06 C# Worker analysis: verified integration profile, unsupported constructs và final corpus mở.
- P07 polyglot graph/evidence: verified backend explicit bindings, FE/canonical review mở.
- P08 job/result history: verified static slice, renewable leases/retry/capacity/UI mở.
- P09 diagrams/export: 3 backend projections verified, actual file exports/UI mở.
- P10 deterministic rules: supported rules regression verified, classroom/ground-truth/UI mở.
- P11 edit/diff: backend verified, UI/full policy acceptance mở.
- P12 impact: Java→.NET verified, runtime history/context/corpus/UI mở.
- P13 workspace learning: backend code present, membership/lecturer policy/E2E mở.
- P14 assignments/reference: backend code present, reference distribution/required artifacts/E2E mở.
- P15 submissions/feedback: stage 6 code/test sources có, ownership/version/required runtime/export/browser acceptance mở.
- P16 grounded AI: active end-to-end implementation chưa được xác minh.
- P17 admin/observability: stage 6 code present, role/masking/ops/UI acceptance mở.
- P18 integration config activation: secret/provider lifecycle chưa được xác minh hoàn tất.
- P19 isolated runtime PoC: local Docker verified; dedicated production host acceptance mở.
- P20 runtime profile/mapping: local profile verified, platform persistence/approval/attestation mở.
- P21 HTTP scenario author/approve: local executor verified, Java/FE editor/version/policy mở.
- P22 execute/monitor/stop: local verified, durable remote state machine/quota/stop ack mở.
- P23 trace/interaction/evidence: local correlation + Java ingest/sequence services có; unified scoped delivery/UI mở.
- P24 reproducible delivery/operations: docs/fixtures/scripts có, final staging/backup/security/acceptance bundle mở.

## 7. Quy tắc cập nhật

Sau mỗi task, sửa đúng dòng V/T/N/F và PBI liên quan, thêm test/commit/environment/scope và limitation. Khi chạy lại regression, ghi kết quả mới với ngày; không xóa evidence cũ rồi giả như đã đo lại. Link tới source/tests/runbook, không chỉ ghi “done”. Nếu chỉ đọc code, dùng Code present, không dùng Verified slice.

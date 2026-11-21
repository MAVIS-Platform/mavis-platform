# Công việc tiếp theo và cách giao task

Baseline: 21/10/2026, main c0121fe. Đọc [bối cảnh](mavis-context.md) và [tiến độ](IMPLEMENTATION_STATUS.md) trước. Các ticket dưới đây là backlog tích hợp đề xuất từ gap hiện có, không đổi phân công chính thức hoặc tự đặt SRS threshold.

## Thứ tự ưu tiên

### A. Chốt baseline và quyền trước khi nghiệm thu hệ thống

**A1 — Reproduce Java chặng 6 trên baseline hợp nhất**

- Owner: Vũ; review Triết/Nhựt khi chạm model/Worker.
- Input: main hiện tại, PostgreSQL test riêng, V1–V6, existing stage 6 tests trong platform/bootstrap.
- Làm: chạy unit tests platform và bootstrap submission/feedback/admin trên DB cô lập; giữ stage 3–5 + Worker regression. Tách test fixture thiếu dataset khỏi lỗi implementation thật, không bỏ test âm thầm.
- Output: report commit/test/environment, fix tối thiểu nếu lỗi; không gán 140 analyzer tests cho bootstrap.
- Done: clean checkout có lệnh tái lập, tests liên quan pass, migration validation đúng và docs ghi chính xác scope/exclusions.

**A2 — Authentication/authorization matrix**

- Owner: Vũ; review người sở hữu use case; Hậu nối error states sau.
- Input: SecurityConfig, JwtAuthenticationFilter, SecurityUtils, workspace/project/assignment/submission/admin/runtime services.
- Làm: chốt dev vs production policy; ngăn dev header/seed-user fallback trong production; kiểm tra member/owner/lecturer/admin tại service/endpoint. Không chỉ đổi permitAll sang authenticated rồi báo RBAC xong.
- Output: explicit role/resource policy và negative tests: foreign project/model/submission, non-member workspace, student feedback/admin action, wrong lecturer, disabled user.
- Done: không truy cập chéo resource qua UUID tùy ý; actor không lấy từ createdById của request; production tests không dựa X-Test-User-Email/seed fallback.

**A3 — Pinned submission/version integrity**

- Owner: Vũ; review Triết/Nhựt.
- Input: SubmissionServiceImpl/FeedbackCommentServiceImpl, model/source/diagram/evaluation/runtime IDs.
- Làm: verify project owner/assignment membership; selected model và diagram/evaluation thuộc đúng scope; runtime evidence khớp model/source/profile được yêu cầu; không dùng latest-source fallback để che thiếu pin. Chốt runtime/evaluation required outcomes theo business rule.
- Output: immutable submission manifest/version links, feedback anchors đúng model, tests cho deadline/foreign IDs/stale or missing evidence.
- Done: thay latest model/source/runtime của project không làm thay nội dung bài đã nộp; giảng viên đọc đúng artifact tại thời điểm nộp.

### B. Hoàn thiện static integration và vận hành

**B1 — Corpus và canonical mapping acceptance**

- Owner: Triết; Nhựt phụ trách C# fixtures; Vũ phụ trách artifact pipeline.
- Input: Java-only, C#-only, mixed, duplicate service names/ports, config ambiguity, unsupported syntax; `mavis.bindings.json` profile hiện hành.
- Làm: tạo expected findings/edges/evidence được nhóm review; phân biệt resolved/candidate/unresolved/ambiguous; kiểm tra parser source identity khác runtime service identity. Khôi phục hoặc thay thế có chủ đích external fruit-market dataset.
- Output: committed reproducible fixtures/ground truth + report false positive/negative/limits; approved acceptance thresholds do nhóm chốt.
- Done: không fuzzy nối sai localhost ports, project folders hay client names; static edges không mất vì chưa có runtime observation.

**B2 — Durable static scheduling/retry/retention**

- Owner: Vũ; Nhựt review attempt/grant/Worker semantics.
- Input: current request idempotency, analysis_attempts, executor, deadline recovery và artifact store.
- Làm: chốt distributed ownership/renewable leases, bounded retry classes/backoff, capacity/admission, restart reconciliation và retention/quota policy. Không reuse failed attempt IDs cho một input khác.
- Output: migration mới nếu cần; attempt lifecycle, operational metrics, janitor có scope/policy.
- Done: duplicate dispatch/dead process/late result/cancel race không double-promote model hoặc xóa artifact còn được version/submission tham chiếu; test bằng process/DB restart thực.

**B3 — Diagram/export/history acceptance**

- Owner: Triết; Hậu consume API; Vũ lưu/authorize artifacts.
- Input: saved ModelVersion/DiagramVersion/evidence; current three projections/revision/diff/impact.
- Làm: chốt notation được support, implement file export/manifest nếu còn thiếu; impact history/runtime context theo explicit version; bảo toàn coordinate-only layout và logical identity.
- Done: export có version/provenance, view/layout không mutate source model, rename diff không biến thành remove/add; không tạo impact BFS Java thứ hai.

### C. Nối Java runtime và Dedicated Runner thành một hệ thống

**C1 — Versioned runtime contract và profile/scenario persistence**

- Owner: Vũ + Nhựt; Triết review canonical mapping; Hậu sau khi contract ổn.
- Input: Java RuntimeSession APIs/DTOs, RuntimeRunDefinition, Runner receipt và confirmed service mappings.
- Làm: thống nhất session/model/source/profile/config/scenario IDs, approved images/agents, deadline/resource budget, secret references, statuses và receipt schema. Chốt authority từng field; không dùng config literal từ user để mount host.
- Output: versioned dispatch/cancel/result contracts + fixtures cùng producer/consumer tests; DB migrations cho profile/config/scenario/outcome cần thiết.
- Done: mismatch/cross-project/stale-version/unapproved profile bị chặn trước allocate; raw secrets không nằm trong logs/receipt/process arguments.

**C2 — Authenticated dispatch, receipt delivery và ack**

- Owner: Vũ platform; Nhựt gateway/runner adapter.
- Input: approved C1, local receipt outbox đã có, operator-managed state root.
- Làm: triển khai một cơ chế dispatch được nhóm chọn cho dedicated host; authenticated bounded requests, idempotent session/attempt, durable dispatch/result outbox, ack và retry. Không đưa Docker socket vào Java business service.
- Done: Java không báo actual RUNNING từ việc chỉ đổi DB; receipt bị gửi lại không double-persist; caller/network/process restart không làm mất completed receipt; source/model/session mismatch bị từ chối.

**C3 — Stop/capacity/heartbeat/janitor reconciliation**

- Owner: Vũ + Nhựt.
- Input: C2, resourceProject generated IDs, local cancel/recover semantics.
- Làm: lease/capacity policy, remote cancel acknowledgement, heartbeat, timeout/dead allocator recovery, scoped janitor và artifact retention.
- Done: requested stop khác confirmed stop/cleanup; cleanup failure giữ explicit recovery state; chỉ thu hồi resource của session có authority, không prune Docker hoặc xóa shared store tùy ý.

**C4 — Durable trace ingest → model evidence → sequence/impact context**

- Owner: Triết mappings/projections; Vũ persistence/policy; Nhựt normalization.
- Input: redacted causal receipt/span evidence của C2 đúng model/source/version.
- Làm: nối Java trace ingest với Dedicated Runner output, giữ span/parent IDs, provenance/quality/mapping warnings; save trước khi sinh sequence; runtime overlay không xóa static relations.
- Done: replay idempotent, foreign/unmapped/partial traces không bị coi complete; diagram/impact mở đúng saved session/model; ordering dựa causal parent-child.

**C5 — Dedicated environment và failure acceptance**

- Owner: Vũ DevOps + Nhựt; cả nhóm review.
- Input: isolated host/VM do nhóm cung cấp, approved runtime profiles, stateless và authenticated/stateful scenarios.
- Làm: chạy matrix success/HTTP failure/startup failure/timeout/cancel/allocator death/callback failure/cleanup failure; test secret handling, quotas, reset và resource isolation.
- Done: có evidence đúng môi trường, actual image/agent IDs, no leaked session resources hoặc explicit recovery records; Desktop PoC không được dùng thay dedicated isolation acceptance.

### D. Frontend, AI và phát hành

**D1 — Nhận FE baseline mới và nối từng workflow**

- Owner: Hậu, review đúng owner API.
- Phụ thuộc: có frontend source/branch được xác nhận; không tự dùng UI cũ để suy business flow mới.
- Thứ tự: account/project/import→analyze/job outcomes → saved graph/evidence → diagrams/rules → revisions/diff/impact → workspace/assignment/submission/feedback → runtime controls/trace → admin.
- Done: browser tests cho loading/empty/error/partial/cancelling/stale/forbidden; dùng IDs/version explicit; không hiển thị candidate thành validated hoặc DB RUNNING thành workload proven-running.

**D2 — Grounded AI/provider lifecycle**

- Owner: Triết explanation/evidence, Vũ provider/secrets/config, Hậu UI.
- Input: saved scoped model/rules/impact evidence, approved provider configuration.
- Done: citations resolve đúng accessible evidence/version, output không ghi đè architecture/evidence, provider failure/timeout không làm fail deterministic analysis; quota/policy do platform enforce.

**D3 — Release, reproducibility và handover**

- Owner: Vũ phối hợp toàn nhóm.
- Làm: build/test CI đúng modules, vulnerability/supply-chain reviews theo scope, cold/warm/peak/concurrency measurements, migration upgrade/backup/restore, release config/secrets, runbooks/sample artifact bundle.
- Done: clean checkout + documented env chạy lại được acceptance; thresholds có nhóm duyệt; report nêu cả unsupported cases, dataset exclusions và environment limitations.

## Khi giao việc cho agent

Mỗi task cần: ID/owner, baseline commit, problem và expected behavior, source paths liên quan, input/output contract, migration impact, test command và acceptance criterion. Agent chỉ sửa phạm vi đó, đọc thêm tăng dần, giữ local edits không liên quan, cập nhật status sau test. Nếu thiếu host/FE/threshold/provider decision, tiếp tục phần độc lập nhưng giữ gate chưa done.

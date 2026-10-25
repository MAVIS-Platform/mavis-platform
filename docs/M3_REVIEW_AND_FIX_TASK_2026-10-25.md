# Review M3 và nhiệm vụ sửa trước nghiệm thu

Ngày reviewer: 25/10/2026, Asia/Saigon. Reviewer Codex.

**Kết luận: CHƯA NGHIỆM THU M3.** Đã có implementation lớn và designed browser flow có bằng chứng, nhưng còn các lỗi semantics/provenance/round-trip tái hiện được. Chưa triển khai M4.

## 1. Bằng chứng reviewer tự chạy

- FE default: **118/118 pass**, typecheck sạch. Log `output/m3/reviewer-fe-tests.log`.
- Java targeted suite đúng sáu test classes nêu trong báo cáo: **45/45 pass**, 0 skip/fail/error. Log `output/m3/reviewer-java-tests.log`.
- Connected FE: **2/2 pass** sau lượt Java đó; mainflow pass. M3 artifact là output từ synthetic test với mock repositories, không phải một trace live của hệ thống đã chạy.
- Repro production functions: `output/m3/reviewer-semantic-repros.json`. Input editor đã xóa message nằm ở `output/m3/reviewer-inputs/deleted-message.drawio`, không sửa bản lưu/DB người dùng.
- Reviewer không chạy lại browser/build/Worker trong lượt này; không gọi kết quả agent báo là kết quả reviewer tự thực thi.
- Không còn M3 QA runner ở thời điểm đọc process list; Next/Docker còn chạy là dependency/service, không phải test còn thực thi. Không dừng chúng.

## 2. Findings

### R1 — High: tự suy message semantics và gắn provenance thiết kế thành STATIC

`scenario-design.ts:inferInitialMessageSortFromEdge` trả SERVICE_HTTP_CALL/DATABASE_ACCESS → SYNCH_CALL với isCertain=true; MESSAGE_PUBLISH/SUBSCRIBE → ASYNCH_SIGNAL với isCertain=true chỉ từ relation kind. Backend `OtelTraceCorrelationServiceImpl:inferObservedMessageSort` cũng coi HTTP method/status/URL là đủ để trả SYNCH_CALL.

Điều này trái profile đã giao: transport/relation kind không tự chứng minh UML call/message sort. Khi có rule mapping thực sự phải nêu nguồn, giới hạn và tests; thiếu căn cứ thì UNKNOWN/PARTIAL. Người dùng có thể khai báo DESIGNED, nhưng không biến khai báo đó thành extraction đã xác minh.

Ở `designed-scenario.tsx`:

- Thêm message từ cạnh tự gán causalParent là message trước đó, provenance STATIC và execution STATIC.
- Compose message có cạnh matching cũng gán STATIC dù sort, label/order do người dùng thiết kế.
- handleChangeMessageSort đổi sort nhưng giữ provenance cũ.

Source relationship/evidence links được phép giữ để tham chiếu, nhưng order/sort/guard/execution do user quyết định phải có provenance DESIGNED hoặc provenance theo field/rule rõ. Mẫu browser hiện có SYNCH_CALL với metadata provenance STATIC chính là đường cần sửa; không sửa source graph để hợp thức hóa.

### R2 — High: observed partial order và canonical relationship mapping không trung thực

`projectObservedSequenceToInteraction` có comment “topological sort” nhưng thực tế chỉ sort stepOrder, sau đó paginate. Repro: child stepOrder=1 có causalParentMessageIds=[parent], parent stepOrder=2 → output vẫn child rồi parent. Không tự coi số thứ tự trình bày là bằng chứng causal.

Trong cùng projection, khi không có relationship ID trực tiếp, code tìm cạnh bằng `model.edges.find(from/to)`. Repro hai source relationships cùng endpoints: đổi thứ tự mảng edges làm sourceRelationshipIds của message đổi từ rel-first sang rel-second. Từ đó 3E có thể gọi evidence/AI của cạnh được chọn theo thứ tự mảng.

Cần giữ causal constraints trước phân trang, phát hiện missing parents/cycles và thông báo đúng partial window. Với relation mapping, dùng canonical IDs hoặc rule deterministic có căn cứ; nhiều candidate thì giữ ambiguous/all candidate IDs có ý nghĩa và gate 3E, không chọn first match. Không coi một cặp endpoint là đủ để phân biệt call-site/type/origin.

### R3 — High: editor deletion/semantic edit bị bỏ qua mà không báo conflict

`extractInteractionFromDrawioXml` đọc metadata carrier và chỉ kiểm rewiring cho message cell còn tồn tại. Repro reviewer:

- XML gốc có 3 typed messages.
- Xóa hẳn mxCell của msg-1 bằng XML parser, giữ metadata carrier (giống editor xóa shape).
- Extractor trả lại 3 messages và roundTripConflicts=[]: lần tái sinh có thể làm message đã xóa xuất hiện lại mà không báo.

Các value/sort fields được đọc từ XML nhưng chưa chứng minh cập nhật/kiểm label/arrow style hoặc fragment edits. “Hai cycles còn cùng count” chỉ kiểm preservation happy path, không đủ để nói editor chỉnh semantics an toàn.

M3 cho phép chọn editor layout-only: khi đó phải công bố/gate semantic editing và phát hiện unsupported changes với recovery copy. Xóa/thêm cell, đổi endpoint sang cell mới không map, đổi arrow sort/label, xóa participant/fragment/ref không được âm thầm bỏ qua. Không tự tin metadata cũ hơn canvas; không sửa XML/DB để che khác biệt.

### R4 — Medium: ID occurrence/execution có thể va chạm khi sửa danh sách

Đường thêm existing edge trong DesignedScenario dùng `doc.messages.length + 1` làm msg-N và exec-N. Xóa một message giữa danh sách giữ ID các message còn lại; thêm tiếp có thể dùng lại ID còn tồn tại (ví dụ msg-1,msg-3 → length=2 → msg-3).

Đường compose có suffix cho message nhưng execution vẫn exec-N theo độ dài. Cần identity ổn định, duy nhất và không dựa vào display order/current length. Thêm tests thao tác add → remove middle → add → reorder → save/reload, gồm references reply/fragment/execution. Không renumber IDs của occurrence còn sống để làm hết collision.

### R5 — Acceptance gap: chưa có observed trace thật chạy trên UI

Báo cáo đã ghi DB Test1 không có runtime_sessions. Việc kiểm empty-state và không bịa rows là đúng. Tuy nhiên M3-AC09 yêu cầu một observed trace thật đi qua UI/API; synthetic JUnit fixture → connected test không thay thế được.

M3-AC09 phải PARTIAL/BLOCKED ở phần observed, không gom thành PASS. Chuẩn bị runtime config/scenario trên app fixture nhỏ qua luồng được phép nếu khả thi; chỉ chạy theo approval/policy hiện có. Không chèn fake session/span/receipt vào shared DB hoặc hạ publication gate. Nếu thiếu quyền/Runner/collector, nêu blocker cụ thể và vẫn hoàn thành phần code độc lập.

### R6 — Hồ sơ drift khỏi code và roadmap đã giao

- UC-01 là **quy ước chiều MESSAGE_SUBSCRIBE**, không phải UML Use Case và không “thuộc M6”.
- M4 là **UML Class + Package**; M6 Activity, M7 State. Không tự thay M4 thành Communication + State Machine.
- Report mô tả các DTO fields/symbols không có trong source hiện tại: occurrenceId, isReply, replyToStepNumber, parallelBranchId, candidateIds... trong khi DTO thực dùng messageId, caller/calleeElementId, causalParentMessageIds... Schema document hiện là 2, không phải 1 như nhiều đoạn report.
- SEQ-N05 trong task là causality/order; ref nằm trong SEQ-N04. Manifest/report đang đổi nghĩa rule IDs và công bố PRODUCTION_READY rộng hơn bằng chứng.
- Nêu rõ canonical **application profile** hỗ trợ phần nào của UML, không gọi payload riêng là toàn bộ OMG metamodel được chứng nhận.
- Bổ sung ngắn quyết định tái sử dụng công cụ theo §4.1 roadmap: phần nào dùng draw.io/renderer hiện hữu, phần custom nào cần cho domain/validation, fixture chứng minh capability. Không đổi engine chỉ để sửa các lỗi dữ liệu ở trên.

## 3. Prompt giao Gemini sửa M3

Bạn tiếp tục **M3 vòng sửa theo review**, đọc file này và nhiệm vụ gốc `GEMINI_M3_UML_SEQUENCE_IMPLEMENTATION_TASK_2026-10-24.md`. Hoàn tất R1–R6 theo một lượt bàn giao; chưa làm M4. Không chỉ sửa report hoặc expected để test xanh.

### Thứ tự thực hiện

1. Chốt contract messageSort/provenance trước: explicit source/runtime rule hoặc DESIGNED; thiếu dữ kiện UNKNOWN. Giữ source refs riêng với provenance của user decisions. Nâng cấp legacy không tự xác nhận sync/async.
2. Sửa projection observed: causal ordering trước pagination, ambiguous source relation lookup không first-match. Kiểm cả backend producer và FE consumer; nếu payload thêm fields thì additive/versioned, không sửa nguồn evidence để khớp view.
3. Sửa occurrence/execution ID lifecycle; giữ IDs qua reorder và không va chạm sau delete/add. Tái sử dụng factory/helper production nhỏ nếu cần; không copy controller vào test.
4. Sửa editor semantics contract: hỗ trợ thực hoặc gate layout-only có conflict/recovery rõ. So metadata và cells đủ để phát hiện semantic deletion/creation/arrow/label/fragment/ref changes trong profile. Ưu tiên parser/DOM thật tại biên editor; tránh tiếp tục chắp regex/shim yếu để kết luận XML an toàn.
5. Regression tái hiện đúng các case reviewer và case UI khó: thay user sort vẫn giữ sourceRef nhưng provenance đổi đúng; child order trước parent; hai cạnh cùng endpoint đảo order; editor delete rồi extract; add/remove-middle/add. Expected độc lập, không lấy output production làm answer key.
6. Chạy FE default/typecheck/mainflow/final build dist riêng; Java regression đã đổi; connected tests có output đúng lượt khi thay producer. Default tests tiếp tục hermetic, không đọc output phiên cũ. Worker chỉ chạy lại phần liên quan nếu thực sự đổi contract/producer đó.
7. Browser: designed edit/sort/fragments/repeated occurrences, ID stability, editor conflict/recovery và save/reload/export; đối chiếu đầy đủ semantic data, không chỉ counts. Giữ các bản người dùng đã lưu, test document/revisions có provenance rõ.
8. Thực hiện observed acceptance R5 nếu stack/approval cho phép. Nếu chưa thể, giữ observed live BLOCKED, không gọi synthetic fixture là trace live. Không dừng phần sửa code khác để chờ item này.
9. Sửa report/manifest/README/roadmap theo R6 và kết quả thật. Chỉ tự đánh implementation/test/browser PASS khi có bằng chứng tương ứng; feature deferred hoặc blocked giữ đúng trạng thái. Không tốn thêm vòng chỉ chỉnh văn phong.

### Ràng buộc và đầu ra

- Không commit/push/merge/deploy/reset/clean/stash; giữ M1/M2/main-sync và document history.
- Không bypass auth, publication gate hoặc ghi fake runtime rows. Không in credential/token/cookie vào artifacts.
- D5 M2 tiếp tục manual; UC-01 subscribe OPEN. Không làm Use Case/Communication/State ngoài roadmap để “đóng UC-01”.
- QA scripts timeout hữu hạn, finally cleanup đúng browser/helper; giữ dependency app cần dùng và báo rõ. Docker/Next còn chạy không tự nghĩa test chưa xong.
- Bàn giao ngắn: R1–R6 expected/actual, file:symbol, lệnh/kết quả, semantic comparison artifacts và acceptance còn mở. Không gọi whole M3 hoàn tất khi observed browser chưa chạy hoặc còn lỗi semantics nêu trên.

**Điểm dừng:** sửa hết phần tự thực hiện được và đưa bằng chứng để reviewer chốt implementation/acceptance riêng; chưa tự mở M4.

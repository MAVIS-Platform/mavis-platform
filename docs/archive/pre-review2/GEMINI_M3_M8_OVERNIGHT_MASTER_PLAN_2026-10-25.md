# Kế hoạch tổng triển khai tự chủ MAVISS M3 đến M8

Ngày: 25/10/2026 — Asia/Saigon. Đối tượng thực hiện: Gemini implementation agent trong workspace `C:\Users\nhuth\Desktop\MAVISS`.

**Đây là nhiệm vụ triển khai xuyên nhiều milestone trong cùng lượt làm việc. Người dùng đi nghỉ và đã cho phép tiếp tục M3 → M8, không cần nhận prompt mới sau từng milestone.** Bắt đầu bằng việc sửa M3 theo review, rồi triển khai các chặng tiếp theo bằng vòng lặp thiết kế ngắn → code → kiểm chứng → tự review → checkpoint → tiếp tục.

Tài liệu này thay thế các câu “chưa tự làm M4”, “dừng chờ reviewer sau mỗi milestone” trong các prompt cũ cho **lượt tự chủ này**. Các yêu cầu kỹ thuật, bằng chứng, bảo toàn dữ liệu và cấm commit/push vẫn giữ hiệu lực. Tự kiểm đạt chỉ được ghi **SELF_VERIFIED / CHỜ REVIEW ĐỘC LẬP**, không mạo nhận reviewer đã nghiệm thu.

Không hứa hoàn thành mọi phạm vi chỉ vì đã chạy hết đêm. Mục tiêu là tiến xa nhất có thể với code đúng, checkpoint rõ và kết quả kiểm chứng thật. Nếu chưa xong M8, báo chính xác chặng đang làm và phần còn lại; không thu hẹp âm thầm yêu cầu để đánh dấu hoàn thành.

## 1. Bản đồ phạm vi và kết quả cuối

- **M3:** UML Sequence, Designed và Observed, typed semantics, causality, evidence, editor/persistence.
- **M4:** UML Class và Package, dữ kiện Java/C#, designed annotations và ký pháp cấu trúc.
- **M5:** UML Deployment, phân biệt logical software, node/environment, artifact, hosting/deployment/manifestation.
- **M6:** UML Activity, action/control/object flow, swimlane, guards, concurrency và hai loại final.
- **M7:** UML State Machine, state/transition/trigger/guard/effect, composite regions và lifecycle.
- **M8:** nghiệm thu Graph + 9 diagram theo profile đã cam kết, khả năng sử dụng, hiệu năng, compatibility và E2E.

Chín diagram = C4 C1/C2/C3 + UML Sequence/Class/Package/Deployment/Activity/State. Graph là capability riêng. **M4 không phải Communication/State; M6 không phải Use Case. UC-01 là quy ước chiều MESSAGE_SUBSCRIBE.**

Kết quả mong muốn: người dùng chọn đúng project/model/snapshot, có view đúng phạm vi, thấy dữ kiện và nguồn hỗ trợ, thao tác thiết kế có provenance, lưu/mở lại/export giữ semantics. Không biến thành danh sách menu hoặc ảnh demo không nối backend.

## 2. Baseline phải bảo toàn

1. M1/M2 đã có nhiều thay đổi chưa commit. HEAD gần nhất kiểm tra là `c299a91`, branch `feat/dashboard-overview-live-status`; main `e64de71` được ghép vào working tree mà chưa tạo merge commit. Xác minh trạng thái thực lúc bắt đầu; không giả định working tree sạch.
2. M2 implementation đã được reviewer duyệt; browser Scenarios 1–7 đã có evidence và review. D5 kéo/undo/redo còn manual; UC-01 subscribe OPEN. Không tự đổi hai mục này thành PASS, cũng không dùng chúng để dừng mọi chặng độc lập.
3. M3 đã có code nhưng **chưa nghiệm thu**. Review 25/10 xác nhận FE118/118, Java45/45, connected2/2 và typecheck/mainflow đạt, đồng thời tái hiện lỗi semantics/provenance/round-trip. Tests xanh hiện tại không chứng minh các lỗi đó đã hết.
4. Stack từng dùng FE3000, Java8081, Worker5082, PostgreSQL5432, draw.io8090; stack cũ từng có FE3100/Java8082. Kiểm PID/owner/source/build trước khi dùng. Chỉ một writer sửa code trong working tree này.
5. Test1/model rev4 đã có document history người dùng. Không xóa, sửa trực tiếp DB hoặc ghi đè history để phục vụ thử nghiệm. Dùng document/project test riêng hoặc tạo revision qua API được phép, ghi đúng provenance.

### Đọc tối thiểu khi khởi động

- Tài liệu này.
- `docs/M3_REVIEW_AND_FIX_TASK_2026-10-25.md` và `output/m3/reviewer-semantic-repros.json`.
- `docs/GEMINI_M3_UML_SEQUENCE_IMPLEMENTATION_TASK_2026-10-24.md` khi sửa M3.
- `docs/DIAGRAM_IMPLEMENTATION_ROADMAP_2026-10-24.md`, nhất là §4.1 tái sử dụng tool và mục milestone đang làm.
- AGENTS.md/chỉ dẫn áp dụng tại đúng thư mục sẽ sửa.
- Chỉ đọc DOCX của loại diagram sắp triển khai, trong `.doc_review/main/Thông tin về hệ thông diagram/`; không preload cả repository hoặc đọc lại lịch sử báo cáo M2 nhiều lần.

Nếu tài liệu cũ nói đã hoàn tất nhưng review tái hiện lỗi, ưu tiên bằng chứng code/test mới. Mẫu nghiệp vụ trong DOCX là ví dụ, không phải fact của MAVISS.

## 3. Quyền tự chủ và các giới hạn

### Được tự thực hiện

- Sửa implementation, viết test và fixture, cập nhật typed DTO/API additive, adapters, projection, UI, renderer và editor trong M3–M8.
- Đọc source có trọng tâm; lựa chọn cách tổ chức code cục bộ; sửa lỗi tích hợp có liên quan; tạo backup/change manifest/checkpoint.
- Tái sử dụng hoặc thử dependency công cụ khi có gap rõ và đã kiểm license/compatibility; ghi quyết định trước khi tích hợp.
- Build/test, khởi động service local/QA do tác vụ quản lý trên port/dist riêng, chạy fixture có kiểm soát và browser acceptance theo quyền hiện hữu.
- Tạo migration additive nếu thật sự cần cho contract, kiểm trên DB test riêng; số migration lấy từ repo hiện tại. V15 đã dùng, không mặc định lấy lại số đó.
- Tự chuyển milestone sau gate nội bộ, không chờ người dùng đang ngủ xác nhận những quyết định nằm trong phạm vi.

### Không được tự thực hiện

- **Không git commit/push/merge/rebase/reset/clean/stash, không deploy hoặc force-push.** Không fetch/ghép thêm một main mới giữa lượt để mở rộng baseline ngoài nhiệm vụ này.
- Không revert toàn file của người khác; không xóa untracked/ignored hoặc thay history người dùng. Khi cần bỏ một thử nghiệm, chỉ phục hồi phần của mình từ backup đã kiểm, bảo đảm không ghi đè sửa đổi mới của tác vụ khác.
- Không áp migration/seed destructive vào DB dùng chung; không sửa receipt/span/evidence/source facts để tạo PASS. Không tắt auth, publication gate hoặc tạo admin bypass.
- Không gửi thông báo/email ra ngoài, dùng dịch vụ trả phí mới, đăng ký tài khoản, publish dữ liệu hoặc thay cấu hình hệ thống toàn máy.
- Không in credential, token, cookie, connection string, source secrets vào chat/log/artifact. Không lấy việc user đang ngủ làm sự đồng ý cho một hành động ngoài phạm vi.
- Không đổi roadmap sang các diagram khác; không thay toàn bộ engine hoặc xây framework lớn khi một adapter nhỏ giải quyết được yêu cầu.

Nếu một hành động thực sự cần user/approval bên ngoài, ghi blocker và làm tiếp phần độc lập. Nếu công cụ từ chối do policy, ghi đúng action/lý do; không tìm đường vòng để bypass.

## 4. Cơ chế làm việc qua đêm

### 4.1. Checkpoint có thể tiếp tục

Tạo một run directory `output/overnight/<run-id>/` và một file trạng thái ổn định `docs/M3_M8_EXECUTION_STATUS.md`. Run-id dùng timestamp thực + nhãn ngắn, ví dụ `20261025-020000-m3-m8`, không chứa ký tự cấm trong tên file Windows và không ghi đè run cũ.

Trước mỗi thay đổi lớn, lưu bản sao các file sẽ sửa, hash/mtime và diff hiện có; không copy cả repository, node_modules, .git, binary artifacts hay private env. Ghi danh sách file trước đó đã modified/untracked để phân biệt baseline với công việc đêm này.

Checkpoint sau mỗi phần implementation có thể kiểm, mỗi milestone và trước khi đổi hướng/blocker. Ghi:

- activeMilestone và bước đang làm;
- contract/version đã chọn, decisions và nguồn;
- filesChangedByThisRun, baselineFilesTouched;
- commandsExecuted, exit codes, log paths và source/build được kiểm;
- status từng acceptance ID, kết quả cuối mới nhất và kết quả lịch sử liên quan;
- nextAction cụ thể, blocker và phần độc lập có thể tiếp tục;
- process ownership: service/test, PID/port, ai khởi tạo, còn cần giữ hay đã dọn;
- những điều chưa được reviewer độc lập nghiệm thu.

Sau compaction/resume, đọc checkpoint và phần tài liệu của chặng hiện tại; không bắt đầu lại toàn bộ audit.

Mẫu checkpoint tối thiểu trong run directory (điền giá trị thực, không để placeholder làm bằng chứng):

```json
{
  "runId": "timestamp-and-label",
  "activeMilestone": "M3",
  "phase": "fix-review-findings",
  "implementationStatus": "IN_PROGRESS",
  "automatedVerificationStatus": "NOT_RUN",
  "liveAcceptanceStatus": "NOT_RUN",
  "externalReviewStatus": "PENDING",
  "sourceFingerprint": {},
  "commandsExecuted": [],
  "filesChangedByThisRun": [],
  "blockers": [],
  "processes": [],
  "nextAction": "Concrete next operation based on current evidence"
}
```

### 4.2. Gate chuyển milestone

Mỗi chặng phải phân biệt ít nhất bốn trạng thái: **implementation**, **automated verification**, **live/browser acceptance**, **external review**.

- Dùng `SELF_VERIFIED` khi implementation trong scope đã làm, tests đúng đường production đã đạt và không còn lỗi logic/semantics/compatibility biết rõ.
- Nếu thiếu trace thật/login/manual nhưng code và integration đã kiểm được, ghi `IMPLEMENTATION_SELF_VERIFIED / LIVE_ACCEPTANCE_PENDING`; không ghi whole milestone COMPLETE.
- `EXTERNAL_REVIEW_PENDING` luôn giữ cho đến khi reviewer thật xác nhận sau đêm.
- Chỉ chuyển chặng phụ thuộc khi contract shared ổn định và regression liên quan đạt. Lỗi sai ID, mất dữ liệu, bịa provenance, auth/scope leakage hoặc build hỏng là gate đỏ, phải sửa hoặc cô lập an toàn trước.
- Blocker môi trường/data ngoài phạm vi không bắt agent đứng yên: chuyển sang chặng độc lập, ghi lý do bỏ qua thứ tự và quay lại khi có điều kiện.
- Không tuyên bố mọi AC PASS bằng một số tổng duy nhất. Đánh PASS chỉ cho assertion/scenario thực chạy với expected hợp lệ.

### 4.3. Thứ tự và phụ thuộc

Mặc định: **sửa M3 → hoàn thiện M3 → M4 → M5 → M6 → M7 → M8**.

- M4/M5 không cần đợi một trace live của M3 nếu shared contracts đã an toàn và phần observed acceptance đang chờ môi trường.
- Source-derived Activity/State dùng nền code facts và identity của M4. Nếu M4 source pipeline chưa ổn định, chỉ làm phần designed/validator độc lập của M6/M7, giữ source acceptance chưa đạt.
- M5 dựa chủ yếu trên model/deployment evidence hiện có; có thể thực hiện khi một blocker riêng của M4 không ảnh hưởng nó.
- M8 là tổng kiểm và kết luận cuối. Có thể đo baseline Graph sớm, nhưng không gọi M8 COMPLETE khi core feature hoặc required acceptance trước đó còn thiếu.

### 4.4. Không lặp vô ích

Đọc log lỗi liên quan, sửa nguyên nhân nhỏ nhất, chạy lại kiểm chứng cần thiết. Sau hai lần cùng một cách thử không tiến bộ, đổi cách chẩn đoán/harness; không lặp hàng chục lần click tọa độ hoặc restart server không biết source.

Không chỉnh expected test chỉ để khớp hành vi sai. Không che lỗi bằng skip, broad catch, default zero/empty, mock data hoặc migration trực tiếp dữ liệu thật. Có thể ghi behavior baseline rõ nhưng không tính characterization là correctness acceptance.

Không kết thúc lượt chỉ vì vừa hoàn thành một milestone nếu còn việc được phép thực hiện. Nếu hết quota/context/tool session hoặc phải dừng, ghi checkpoint và báo trạng thái thực; không hứa một tiến trình tự chủ vẫn chạy khi nó đã kết thúc.

## 5. Hợp đồng kỹ thuật chung cho M3–M8

### Identity, scope và provenance

- ID ổn định theo model/snapshot và namespace thích hợp; không lấy display name, array order hoặc số item hiện tại làm identity.
- Phân biệt source element/relationship ID với participant/message/fragment/state/action/package projection ID. Synthetic view IDs không được gọi nhầm API source evidence.
- Một source edge có thể hỗ trợ nhiều occurrence; giữ ID occurrence riêng và source refs. Bảng mapping nhiều candidate phải giữ ambiguous, không `findFirst` hoặc `.find(from/to)` để đoán.
- Khai báo người dùng là DESIGNED, trace là OBSERVED, facts AST/config giữ loại nguồn tương ứng. Fact nguồn và quyết định về thứ tự/guard/ownership/sort của người dùng có thể cùng tham chiếu nhưng không nhập làm một provenance sai.
- Unknown/null khác known zero/empty. Layout, màu và vị trí không tạo semantics. Không dùng thuật ngữ verified chỉ vì schema parse được.
- Giữ model/snapshot/session/trace pin và lineage khi cần. Không bỏ guard chỉ vì dữ liệu cùng project.

### Typed model và compatibility

Tái sử dụng model version/evidence/document CAS hiện có. Ưu tiên typed, versioned payload hoặc extension phù hợp trước khi tạo nhiều bảng/enum mới. Domain-specific contract phải validate, không chỉ lưu any JSON rồi gọi là schema chuẩn.

Source facts thuộc model snapshot bất biến; chỉnh sửa của người dùng là document/overlay version riêng. Chỉ thêm schema/migration khi đã có use case và fixture chứng minh cần; giữ response cũ tương thích với unknown trung thực.

Mọi notation phải khai báo profile hỗ trợ. Core requirements ở các milestone dưới đây là bắt buộc để gọi milestone đạt; advanced deferred chỉ áp dụng cho những mục đã được xác định ngoài core, không tự biến core khó thành deferred để tăng phần trăm hoàn thành.

### UI và 3E

Nối đúng route → presentation → canvas/editor → inspector đang chạy. Không sửa một component không được route chính dùng rồi kết luận sản phẩm đã cập nhật.

Selection context bao gồm model, notation/view, mode, source/group/item và membership/session/trace khi thích hợp. Header, evidence, findings, AI payload, response validation và cached/mutation state dùng cùng canonical context. Đổi scope nhưng giữ cùng representative ID vẫn phải reset/gate state đúng.

Một nhóm nhiều source refs không được giải thích bằng cạnh đầu rồi gắn cho cả nhóm. Có thể yêu cầu drill-down; khi cho phép tổng hợp phải dùng đúng union/scope. Không gọi AI để lấp data thiếu thành fact.

### Editor, persistence và export

- Nêu rõ semantic editing nằm ở structured UI hay external editor. Nếu draw.io chỉ chỉnh layout, phải gate/phát hiện semantic edits, giữ recovery copy và hướng dẫn người dùng.
- So sánh typed semantics với XML/cells: deletion, insertion, endpoints, arrow sort, labels, nesting/operands/regions phải được hỗ trợ thực hoặc báo conflict. Không tin carrier cũ rồi âm thầm khôi phục phần tử user đã xóa.
- Metadata carrier phải sống qua editor thật; M1 đã biết root mxGraphModel có thể bị strip. Kiểm bằng real DOM/parser, không dựa regex/shim yếu để tuyên bố round-trip an toàn.
- Save dùng CAS, history và view/interaction ID riêng. Stale revision trả conflict; reload/export đúng model/document revision. Regenerate/Relayout không tự save vào project.
- Pin/lock/layout overrides đã hỗ trợ phải được giữ qua các phép biến đổi tương thích. Khi regenerate theo model mới, chỉ nối lineage bằng mapping có căn cứ; không ghép lại bằng tên giống nhau. Phần tử bị xóa/đổi scope cần notice và recovery, không bỏ user edits trong im lặng. Kiểm chính sách này ở các view có hỗ trợ và tại M8.
- Semantic equality qua round-trip phải so ID, kind, references, provenance, hierarchy và các thuộc tính notation, không chỉ so count.

### Kiểm chứng và nguồn bằng chứng

Default tests chạy độc lập từ fixtures có kiểm soát, không cần output của phiên trước. Connected suite là lệnh riêng, chạy producer → consumer trên output đúng lượt; mỗi schema có artifact riêng, không hai writers ghi đè một file khác shape. Không silent fallback trong connected run.

Test helpers phải gọi code production. Expected literal/answer key độc lập; không sao chép controller vào test hoặc gọi cùng implementation để sinh cả expected/actual. Mock persistence được phép cho integration harness nhưng phải ghi rõ, không gọi là real DB/browser.

Synthetic traces, sample source và thiết kế giả định không phải live observation hay corpus đo độ chính xác tổng quát. Chỉ báo precision/recall khi có tập đối chứng độc lập và mẫu số đúng theo quan hệ/ngôn ngữ.

## 6. Tái sử dụng bộ tool trước khi tự viết

Đọc đúng phần trong `.doc_review/main/Thông tin về hệ thông diagram/Tool repo .docx`. Trong mỗi báo cáo milestone, ghi một quyết định ngắn: capability cần → phần công cụ hiện có đáp ứng → gap → lựa chọn và bằng chứng.

- Render/editor/layout đang có: draw.io self-host, ELK, PlantUML, Mermaid. Tận dụng chúng nếu profile và round-trip đạt; custom code vẫn cần cho evidence/domain/correlation/validation.
- Class/Activity/Deployment: Apollon là ứng viên khảo sát từ tài liệu; Class/State có BESSER WME. Đây là ứng viên, không phải xác nhận sẵn khả năng cho mọi phiên bản.
- C4: Structurizr/C4-PlantUML khi có gap model/validation/render cụ thể.
- Graph: Cytoscape + fCoSE, G6 khi baseline viewer/layout có gap đã đo; Sigma/Graphology chỉ xét nếu cần WebGL và đo được lợi ích.
- Custom editor: React Flow + ELK, X6/maxGraph chỉ xét khi draw.io thật sự không đáp ứng use case đã chốt. Không tích hợp tất cả cùng lúc.

PoC nhỏ dùng cùng fixture khó nhất. Gate: semantics đúng, ID/evidence/provenance không mất, export/reload/edit đạt, license đúng artifact/version, compatibility React/Next/browser và cách vận hành có bằng chứng. Kiểm nguồn chính thức tại lúc chọn; không dùng trạng thái license/package nhớ từ trước.

Nếu tool không giúp giải quyết gap hoặc làm chi phí tích hợp tăng, giữ engine hiện có và ghi lý do. Không thay engine giữa milestone chỉ vì một demo đẹp. Không dùng force layout chung cho timeline Sequence hoặc token-flow swimlane.

## 7. M3 — Sửa blocker và hoàn thiện UML Sequence

### M3.1. Bắt buộc sửa trước khi mở rộng

Tái hiện và xử lý `docs/M3_REVIEW_AND_FIX_TASK_2026-10-25.md`:

1. Không suy SYNCH_CALL chắc chắn chỉ từ HTTP/database hoặc ASYNCH_SIGNAL chắc chắn chỉ từ loại cạnh. Chỉ xác nhận qua rule/evidence phù hợp; user chọn thì DESIGNED; thiếu thì UNKNOWN/PARTIAL.
2. Order/sort/guard/execution được người dùng quyết định không còn mang provenance STATIC chỉ vì có source relationship tham chiếu.
3. Causal topological order đúng trước pagination; missing parents/cycles/partial windows trung thực. Source relation lookup không first-match khi nhiều candidate.
4. Editor xóa message/participant/fragment/ref hoặc thay semantic style/endpoint không được âm thầm bỏ qua; hỗ trợ thực hoặc conflict + recovery theo profile layout-only.
5. Message/execution ID không va chạm sau remove-middle → add; không renumber ID còn sống khi reorder.
6. Sửa report/schema/symbols cho khớp code; UC-01 subscribe OPEN, M4 Class/Package. Không gọi application payload là toàn bộ OMG metamodel.

### M3.2. Core profile

Giữ chi tiết của `GEMINI_M3_UML_SEQUENCE_IMPLEMENTATION_TASK_2026-10-24.md`:

- Lifelines có identity/role riêng, duplicate names không bị gộp; abstraction level rõ.
- Sync/async call/signal, reply có căn cứ/reference, self-message, create/destroy và execution specifications. UNKNOWN có biểu diễn trung thực, không giả ký pháp đã xác minh.
- Designed alt/opt/loop/par, nested operands trong giới hạn công bố; ref là InteractionUse riêng, target resolved/unresolved rõ.
- Observed giữ causal constraints, observation window, partial/missing data; không suy par/loop/alt hay reply chỉ từ timestamps/endTime. Có lineage giữa base/enriched model.
- Typed scenario editor, multiple occurrences cùng source edge, selection/3E đúng scope, legacy V0 upgrade có bảo toàn history.
- Save/reload/export và hai cycles editor round-trip bảo toàn semantics; generic C4 relayout không làm hỏng Sequence order.

### M3.3. Gate nội bộ

Từng M3-AC01–AC12 trong task gốc có status và evidence. Các repro R1–R4 phải hết trên production code. Chạy designed browser scenario thực gồm edit/sort/fragment/delete/add/round-trip, không chỉ mở menu.

Một observed trace thật qua UI/API vẫn là live acceptance bắt buộc để gọi whole M3 COMPLETE. Nếu chưa có runtime session, có thể chuẩn bị app fixture nhỏ và dùng luồng runtime bình thường theo quyền/approval sẵn có. Không tạo fake rows hoặc hạ gate. Nếu ngoài khả năng phiên thì để LIVE_OBSERVED_PENDING, tiếp tục M4 sau khi phần shared implementation an toàn; không phải chờ người dùng thức để làm mọi việc khác.

## 8. M4 — UML Class và Package

### 8.1. Kết quả người dùng

Chọn service/module/namespace → xem class/interface/enum và members → chọn quan hệ để xem nguồn → chuyển sang package ownership/dependency → chỉnh annotations thiết kế có provenance → save/reload/export đúng model.

Tài liệu: `class diagram.docx`, `Packagage diagram.docx`. Chuẩn tham chiếu UML 2.5.1 Chapters 7/9/11/12 theo DOCX.

### 8.2. Source contract

- Classifier identity gồm owner/module/qualified name/type kind trong snapshot; member identity phân biệt method overload, constructor, generic arity và parameter types. Không dùng tên ngắn hoặc chỉ line number làm ID.
- Facts tối thiểu: qualified name, namespace/package, class/interface/enum, abstract/static flags; field/property/operation name/type/parameters/return type và language visibility; enum literals khi có.
- Giữ Java package-private và C# internal theo đúng ngữ nghĩa ngôn ngữ. Không tự coi mọi internal là UML package visibility; nếu ánh xạ giản lược phải ghi profile/limitation và giữ original modifier.
- Generalization/realization từ declaration/semantic resolution; không phân loại interface chỉ vì tên bắt đầu I.
- Association/dependency theo rule có căn cứ; lưu roles/source member refs. Không đếm một field và association của field đó thành hai facts độc lập.
- Collection/nullability không tự chứng minh đầy đủ multiplicity nghiệp vụ. FK/cascade/GC không tự chứng minh composition; thiếu thì UNKNOWN/không hiển thị khẳng định.

Thiết kế representation vừa đủ trên model/evidence hiện có: typed payload/class-member facts có schemaVersion hoặc extension phù hợp. Không bắt buộc biến mọi member thành business node ở mọi view. Nếu thêm node/edge vocabulary persistent phải đồng bộ enums/CHECK/API/FE và tương thích model cũ.

### 8.3. Implementation

1. Lần đúng JavaParser/visitors và C# Roslyn analyzer/normalizer đang dùng; chạy source fixture thật, giữ source locator/adapter version.
2. Hoàn thiện một vertical slice Java trước để thử contract, sau đó parity C# trong cùng milestone. Không lấy Java PASS thay C#.
3. Class renderer có compartments, visibility, static/abstract, interface/enum, association/dependency/generalization/realization/shared aggregation/composition và multiplicity/role khi có căn cứ hoặc designed.
4. Package dùng namespace identity và ownership hierarchy riêng; dependencies từ facts giữa members. UML «import»/«access»/«merge» chỉ khi có ngữ nghĩa hoặc user khai báo DESIGNED; Java import/C# using không tự bằng PackageImport.
5. Package merge không có cycle; ordinary dependency cycle có thể là fact hợp lệ, không tự xóa hoặc gọi mọi cycle là UML-invalid.
6. Structured UI cho annotations không suy được từ source; source snapshot bất biến. Editor/round-trip theo common contract, badge source/designed rõ.

### 8.4. Acceptance M4

- **M4-AC01:** Java + C# source pipeline thật bảo toàn type/member identity, overload, same short names/different owners và locators qua API.
- **M4-AC02:** class notation positive/negative fixtures; mũi tam giác đúng phía general/interface, thoi ở whole, multiplicity ở đúng association end; HTTP call không thành inheritance.
- **M4-AC03:** designed aggregation/composition/cardinality được lưu đúng provenance; source refs còn nguyên, unknown không thành 1 hoặc * mặc định.
- **M4-AC04:** package nesting/ownership và dependency đúng; import/access/merge không bị thay tùy tiện; merge cycle bị validator phát hiện.
- **M4-AC05:** chọn class/member/relation/package mở đúng evidence/3E; same-name và source/group selection không nhầm API ID.
- **M4-AC06:** edit → save CAS → reload → export + hai editor cycles giữ members/modifiers/relations/roles/provenance; unsupported raw edits báo conflict.
- **M4-AC07:** browser trên một model từ Java và một từ C# fixture có kiểm soát; có ít nhất một project thực để xác minh giới hạn. Fixtures không được mạo danh ground truth tổng quát.
- **M4-AC08:** regression Graph/C4/Sequence và legacy model đạt; coverage/README/API docs khớp implementation.

## 9. M5 — UML Deployment

### 9.1. Kết quả và contract

Người dùng chọn môi trường/snapshot → xem target hosting, execution environments, artifacts và links → truy về cấu hình/runtime observation hoặc thiết kế → lưu/export không lẫn logical C4 với physical deployment.

Tài liệu: `Deployment diagram.docx`, UML 2.5.1 deployment profile trong tài liệu.

- Types: Node, Device, ExecutionEnvironment, Artifact; deployment target/assignment, hosting nesting, CommunicationPath, Manifestation; DeploymentSpecification khi thực sự có căn cứ.
- Phân biệt type/template và instance; instance name/replica chỉ có khi declared/observed/designed rõ. VM không tự là physical device; C4 container không tự là Docker container.
- Environment identity rõ; không tự đặt production từ tên repository. “Declared deployment / environment unspecified” hợp lệ nếu thiếu thông tin.
- Artifact như JAR/DLL/executable/config phải có source/build/deploy reference. Image tag hoặc service name không đủ chứng minh tất cả file bên trong hay artifact-to-component mapping.
- Deployment/manifestation/hosting không được biến thành message traffic. Compose depends_on là startup declaration, không phải network request hoặc physical CommunicationPath đã quan sát.

### 9.2. Implementation

1. Tận dụng detector/config hiện có, bắt đầu Compose và startup/build evidence được hỗ trợ. Không tự mở cloud/Kubernetes discovery nếu chưa cần cho mẫu được chọn.
2. Định nghĩa rule mapping có evidence cho declared environment/artifact/hosting; dữ liệu không đủ giữ unresolved/outside scope.
3. Renderer phân biệt node/environment/artifact và đúng «manifest» từ Artifact tới phần tử được hiện thực; hỗ trợ nesting và type/instance labels.
4. Structured designed overlay cho host assignment/replica/manifestation chưa có source; không sửa facts gốc hoặc gọi chúng là runtime deployment đã xác minh.

### 9.3. Acceptance M5

- **M5-AC01:** hai source/config fixtures qua detector → model → view, ít nhất JAR/JVM và DLL/.NET hoặc mapping thực tương đương; không chỉ graph JSON dựng tay.
- **M5-AC02:** node/environment/artifact, hosting/deployment/manifestation và communication ký pháp đúng, source references đầy đủ.
- **M5-AC03:** không bịa host/replicas/protocol/mapping; unknown và declared/observed/designed tách rõ.
- **M5-AC04:** multi-environment/snapshot isolation, node type và instance không bị gộp sai.
- **M5-AC05:** selection/3E, edit/save/reload/export và round-trip nesting giữ ID/semantics; C4 không hồi quy.
- **M5-AC06:** browser trên configured dataset, đối chiếu config với view; limitations và tool decision được ghi đúng.

## 10. M6 — UML Activity

### 10.1. Kết quả và core profile

Người dùng chọn operation/workflow có phạm vi rõ hoặc tạo designed activity; xem actions, guards, data/control flow và lanes; trace về source/design; edit/save/reload/export đúng token semantics.

Tài liệu: `Activity diagram.docx`, UML 2.5.1 Chapter 15. Mặc định swimlane theo service là **quy ước MAVISS**, không phải yêu cầu mọi Activity trong UML.

Typed model tối thiểu: Activity scope, Action, Initial, Decision/Merge, Fork/Join, FlowFinal/ActivityFinal, Partition, ObjectNode/Pin, ControlFlow/ObjectFlow, guards/joinSpec và source/provenance refs. Identity riêng cho các occurrences, không dùng graph service edges thay control flow.

### 10.2. Source và designed modes

- Source mode bắt đầu với CFG trong một operation: linear actions, if/else, switch, loop và termination trong các mẫu Java/C# được hỗ trợ. Thiếu construct thì partial/unsupported đúng chỗ, không tạo workflow giả đầy đủ.
- Call sang remote service không chứng minh toàn bộ workflow của service kia. Cross-service activity chỉ có khi đủ orchestration/correlation evidence; nếu không, giữ call action ở scope hiện tại.
- async/await không tự tạo Fork. Concurrency/join chỉ từ pattern được phân tích có test hoặc user DESIGNED; không tuyên bố thread/CPU song song từ layout.
- Object flow khác control flow bằng type/ngữ nghĩa, không mặc định nét đứt. Pin directions/types phải khớp profile; giữ unknown khi type resolution chưa đủ.
- Designed mode hỗ trợ các ký hiệu core, guards, partitions, fork/join và data flow có provenance; không thực thi guard tùy ý.

### 10.3. Validators và notation

Initial không có incoming; profile cơ bản MAVISS mặc định một initial, không ghi UML cấm nhiều initial. Final không có outgoing. Decision/Merge và Fork/Join phải được xác định theo type/flow, không chỉ hình học.

Merge không đồng bộ token; Join mặc định AND phải có điều kiện nhận token phù hợp. Flow Final tiêu thụ luồng tới nó; Activity Final kết thúc activity đang xét, không tự hủy remote asynchronous work.

Không tự thêm Activity Final cho mọi return/exception/message publish. Guards/loops/exception handling phải phản ánh scope CFG thực tế; không giải quyết được thì thông báo partial, không bỏ branch trong im lặng.

### 10.4. Acceptance M6

- **M6-AC01:** source fixtures Java/C# qua production CFG/mapping cho supported patterns; hành vi không hỗ trợ được đánh dấu, không tự nối graph thành activity.
- **M6-AC02:** core notation và structural validators đúng với decision/merge, fork/join, hai finals, pins/object flow và partitions.
- **M6-AC03:** fixture loop, conditional alternative trước Join và negative dead/unsatisfied-join pattern trong subset phân tích; không tuyên bố formal verification mọi chương trình.
- **M6-AC04:** designed editing giữ guard/joinSpec/ownership/provenance; lane không làm phát sinh thread hoặc service.
- **M6-AC05:** action/flow/partition selection mở đúng source/design evidence; đổi scope không rò 3E.
- **M6-AC06:** save/reload/export + hai editor cycles không đổi token flow/nesting; browser một source-supported activity và một designed workflow; regression các view cũ đạt.

## 11. M7 — UML State Machine

### 11.1. Kết quả và contract

Chọn một đối tượng/state machine và scope model → xem states/transitions → inspect trigger/guard/effect và entry/do/exit → sửa designed overlay → save/reload/export giữ hierarchy.

Tài liệu: `State diagram.docx`, UML 2.5.1 Chapter 14.

Typed model tối thiểu: Machine, Region, State (simple/composite/final), initial/choice pseudostates, transition kind, trigger, guard/effect, entry/do/exit behavior, ownership/provenance và stable IDs. Không coi enum là state machine đầy đủ.

### 11.2. Source và designed modes

- Source patterns có thể bắt đầu bằng cấu hình transition/framework rõ hoặc switch/guard/state assignment được phân tích trong phạm vi xác định. Chọn pattern thực có fixture; không tự tạo mọi cặp transition giữa enum values.
- Một assignment không có điều kiện nguồn đủ rõ không tự chứng minh transition từ mọi state. Giữ unresolved source/trigger khi thiếu.
- External self-transition, internal transition và completion transition khác nghĩa; không đổi chúng chỉ để dùng cùng một connector.
- Designed mode hỗ trợ khai báo states/transitions/behaviors/composite regions. Trigger/guard có thể thiếu theo ngữ nghĩa; không tự thêm wildcard event cho completion transition.
- History H/H*, orthogonal regions và các notation nâng cao phải có coverage/deferred rõ; không gọi composite đơn giản là đã hỗ trợ mọi state machine nâng cao.

### 11.3. Acceptance M7

- **M7-AC01:** một source-supported lifecycle có expected độc lập và source locators; unsupported enum-only không được tự sinh transitions.
- **M7-AC02:** initial/final/choice validators đúng: initial tối đa một trong mỗi region, cạnh initial không trigger/guard; final không outgoing; choice outgoing không trigger và guards được giữ.
- **M7-AC03:** trigger [guard] / effect, entry/do/exit, internal vs external self và completion đúng trong profile core; tên state không bị đổi thành action.
- **M7-AC04:** composite states/regions/nesting có identity và ownership đúng, editing và deletion không tạo dangling transitions hoặc mất behavior âm thầm.
- **M7-AC05:** selection/3E, save/reload/export/round-trip đúng, một source-supported và một designed machine chạy browser.
- **M7-AC06:** Java/C# coverage theo pattern được công bố riêng; chưa hỗ trợ một ngôn ngữ/pattern thì ghi đúng, không lấy fixture ngôn ngữ kia thay bằng chứng.

## 12. M8 — Nghiệm thu toàn danh mục và chất lượng hệ thống

### 12.1. Coverage và giao diện thống nhất

- Một catalog phân biệt Graph, C4, UML và các 4+1 custom views; không đổi nhãn Logical/Development thành UML rồi tính feature hoàn thành.
- Coverage matrix theo rule và ngôn ngữ: source-supported, designed-only, partial, deferred, not-implemented; mỗi trạng thái có code/test/evidence liên kết.
- Kiểm tất cả phần core của M3–M7 đã đủ; core còn thiếu thì whole program chưa complete, dù menu đã có 9 diagram.
- Source facts/IDs/evidence, model switching, selection group/source/notation và CAS behavior thống nhất. Kiểm labels dài, Unicode, clipping, keyboard navigation, error/empty/loading states và download.

### 12.2. Graph và hiệu năng

- Graph hỗ trợ tìm theo tên/ID, filter có nghĩa, expand/collapse, inspection và provenance; source/displayed/aggregated/filtered/internal/truncated có định nghĩa và đơn vị riêng.
- Các level service/module/type/method phải có dữ liệu và contract thật nếu được quảng cáo. Nếu method-level/CPG chưa được triển khai, ghi rõ giới hạn; không gọi service graph là CPG hoặc tuyên bố đã bao phủ mọi đề xuất Graph.docx.
- Đo cùng workload có seed, gợi ý 100/500/2.000 nodes cùng số edges/density ghi rõ; ít nhất 5 lượt để báo median/max, cùng máy/browser/build. Ghi thời gian tới usable, responsiveness, memory và ổn định vị trí/selection.
- Chọn tiêu chí chấp nhận trước so sánh, không đổi ngưỡng sau khi thấy kết quả. Không dùng percentile chính xác giả từ vài mẫu hoặc số benchmark bịa.
- Nếu baseline không đạt, PoC một ứng viên phù hợp từ Tool repo, thêm đối chứng khi cần; chỉ adopt sau semantic/ID/evidence/interaction gates. Nếu không có lợi ích đo được, giữ engine hiện tại.
- Diagram lớn cần scope/overview/zoom rõ; không cắt labels hoặc bỏ edges không báo. Readability tại mức zoom người dùng thực sự đọc phải được xem trực quan; fit toàn hình nhỏ không tự là readable.

### 12.3. Regression và E2E

- Chạy source fixtures Java/C#, API mapping, domain/validator, renderer, editor/round-trip, CAS, browser và compatibility theo phạm vi đã đổi.
- Có một fixture source nhỏ có đáp án mỗi nhóm tính năng và dự án thực để đánh giá giới hạn. Negative cases bắt lỗi sai ID/scope/provenance, malformed XML/typed payload và stale save.
- Kiểm pipeline thật từ source đến view trên Java/C#; observed runtime dùng trace thật nếu available. Synthetic corpus và mock persistence được ghi rõ, không thay thế real observation.
- Chỉ đo precision/recall khi có tập gán nhãn độc lập, giải thích sample size và loại quan hệ/ngôn ngữ; không biến synthetic golden tests thành lời đảm bảo độ chính xác mọi repository.
- Kiểm regression chức năng có liên quan từ main stage13–16 nếu touched contracts ảnh hưởng chúng; không tự audit/refactor cả auth/admin/education ngoài tác động thực.

### 12.4. Acceptance M8

- **M8-AC01:** coverage toàn Graph + 9 diagram khớp actual code; core còn thiếu được lộ rõ.
- **M8-AC02:** all required semantic/identity/provenance/compatibility checks đạt; không còn blocker biết rõ trong change set.
- **M8-AC03:** editor persistence/export không mất semantics; unsupported edits không silently accepted.
- **M8-AC04:** performance/readability evidence có baseline, workload và kết quả thực; tool decisions có lý do/measurement.
- **M8-AC05:** browser flows và dataset pins được xác minh; manual/observed/permissions pending vẫn hiển thị riêng nếu chưa giải quyết.
- **M8-AC06:** tài liệu sử dụng, README, manifest, startup/test commands và known limitations đủ để người khác chạy lại.

Chỉ ghi program COMPLETE khi core requirements và required acceptance đã đạt. Nếu còn D5/UC-01/observed trace/manual policy chưa giải quyết, nêu chúng rõ trong kết luận; không dùng việc đã chạy tới tên M8 để che phần chưa đạt.

## 13. Runbook verification và vận hành

### Lệnh hiện có để tham khảo

Từ repo root, FE có `npm --prefix MAVIS-Frontend test`, `run typecheck`, `run test:mainflow`, `run test:connected`. Kiểm package.json thực tế trước khi dùng; thêm suite vào đúng runner, không để tests mới chỉ tồn tại trên disk.

Java wrapper ở `MAVIS-Platform/mavis-be`. Môi trường máy từng dùng JDK25 với `JAVA_HOME=C:\Program Files\Java\jdk-25`, `-Dlombok.version=1.18.42`, `-Dnet.bytebuddy.experimental=true`; dùng đúng quote PowerShell cho -D flags. Không gọi một constructor/testCompile failure là lỗi môi trường Lombok nếu log chỉ lỗi code.

Worker dùng `dotnet test` với SDK theo project/global.json. Chỉ định test filter liên quan trước; full suites ở các gate cần thiết. Integration cần DB/Worker/Runner/renderer phải có preflight rõ.

Build FE đặt `MAVIS_NEXT_DIST_DIR` riêng dưới `.artifacts/`; snapshot rồi phục hồi nguyên byte next-env.d.ts/tsconfig.json có trước build. Không sửa .next tracked hoặc dùng git checkout để xóa thay đổi người khác.

### Stack và QA process

- Readiness checks có timeout và xác minh source/build/port; HTTP200/login page không tự chứng minh feature authenticated đã chạy.
- 401 khi chưa login là auth guard, không tự nghĩa cả stack bị chặn. Dùng account/session test được phép; nếu cần người dùng thì ghi pending và chuyển việc độc lập.
- Browser automation dùng tool được phép trong môi trường, không bypass permission. Không đem selector Playwright :has-text vào DOM querySelector.
- Script test có finite deadline, try/catch/finally, exit code phản ánh failures. Capture evidence trước cleanup khi lỗi.
- Đóng browser/context/QA helper do task tạo khi hết dùng. HTTP harness còn listen không phải test còn chạy; nếu cần giữ để người dùng review, báo rõ service chờ và tách khỏi finite test task.
- Docker/Next/Java/DB phục vụ ứng dụng có thể giữ nếu cần cho phiên sau; ghi PID/port/owner và lý do. Không kill tất cả node/java/chrome, không docker system prune hoặc xóa volume không thuộc test run.

## 14. Bằng chứng và báo cáo buổi sáng

Giữ một file trạng thái tổng `docs/M3_M8_EXECUTION_STATUS.md`. Báo cáo milestone có thể tiếp tục dùng file hiện hữu, nhưng phải sửa ngày/trạng thái thực khi cập nhật, không tạo nhiều bản trùng lặp chỉ thay tiêu đề “final”.

Trong run directory lưu logs, produced contracts, fixture provenance, semantic diffs, screenshots/XML/SVG, test manifests và process registry. Tên artifact chứa milestone/schema/case; live files không được ghi đè bởi producer khác schema.

Khi kết thúc hoặc cần handoff, tạo `docs/M3_M8_OVERNIGHT_HANDOFF_2026-10-25.md` với:

1. Đã làm tới milestone/bước nào; người dùng thực sự làm thêm được gì.
2. Trạng thái từng M3–M8: implementation, tests, live/browser, external review riêng.
3. Lỗi M3 R1–R6 và các blocker mới đã giải quyết hay còn gì, kèm expected/actual và file:symbol.
4. Tool nào được tái sử dụng/tích hợp/loại bỏ, lý do và bằng chứng; phần custom nào cần thiết.
5. Commands/results thật, skips và môi trường; không sao chép số test lịch sử thành kết quả mới.
6. Các files thay đổi của lượt này, baseline đã giữ, migration chưa áp vào DB shared và dependency mới nếu có.
7. Live acceptance/manual/UC-01 còn mở và đúng thao tác người dùng cần làm sau khi thức dậy.
8. Các service còn chạy, QA đã dọn, và nextAction cụ thể để tiếp tục nếu chưa xong.

Nếu chỉ đạt M3/M4 sau đêm, báo đúng M3/M4. Không làm menu rỗng cho M5–M8 để báo “đã triển khai toàn bộ”.

## 15. Chỉ thị bắt đầu ngay cho Gemini

Bạn đã được người dùng giao **toàn bộ phạm vi M3–M8 của tài liệu này cho một lượt làm việc tự chủ**, không cần prompt nối tiếp sau từng chặng. Quy tắc dừng chờ reviewer trong task cũ được thay bằng gate tự kiểm tại mục 4 cho lượt này.

1. Ghi baseline/checkpoint và đọc M3 review R1–R6.
2. Sửa các lỗi biết rõ, hoàn thiện M3 trong scope, chạy kiểm chứng và tự review trên production paths thật.
3. Tự đi tiếp M4→M8 theo gate/dependencies. Nếu thiếu việc cần user đang ngủ, giữ đúng pending và làm phần độc lập.
4. Không dừng ở plan, không trả báo cáo cuối sau mỗi milestone khi còn việc làm được. Không chạy chờ daemon vô hạn.
5. Giữ an toàn workspace, no commit/push/merge/deploy; không tự coi self-review là reviewer acceptance.
6. Khi không thể tiếp tục vì hoàn tất phạm vi, quota/session hoặc blocker thực sự không còn việc độc lập, lưu checkpoint và báo cáo buổi sáng theo mục 14.

**Bắt đầu thực hiện, không chỉ xác nhận đã hiểu.**

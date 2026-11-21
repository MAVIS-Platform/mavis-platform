# M3 UML Sequence Diagram — đặc tả kỹ thuật và nhiệm vụ triển khai

Ngày 24/10/2026. Trạng thái: **được giao triển khai theo roadmap; tài liệu này chưa phải báo cáo đã hoàn thành sản phẩm**.

## 1. Mục tiêu và ranh giới

Người dùng chọn một scenario để xem và thiết kế UML Sequence có participant/lifeline, message đúng nghĩa, fragments và bằng chứng truy nguyên; lưu, mở lại, chỉnh sửa và export giữ nguyên semantics. Có hai chế độ rõ ràng:

- **Designed:** người dùng thiết kế thứ tự/hành vi; provenance DESIGNED. Có thể tham chiếu phần tử và cạnh source, nhưng thứ tự được thiết kế không tự trở thành runtime observation.
- **Observed:** view của một runtime session/trace thực, gắn model/snapshot cụ thể và giới hạn quan sát. Không bổ sung nhánh chưa chạy để hình trông đầy đủ.

Người dùng đã yêu cầu bắt đầu M3. M2 implementation và browser Scenarios 1–7 đã được review trong phạm vi hồ sơ hiện có; **D5 pointer drag/undo/redo của M2 vẫn NEEDS MANUAL VERIFICATION, UC-01 vẫn OPEN**. Mang hai mục này sang backlog có chủ đích, không đổi thành PASS hoặc chặn mọi công việc M3 độc lập. M3 có acceptance editor riêng, không lấy kết quả C4 làm thay thế.

Không triển khai Class/Package/Deployment/Activity/State, không thay Graph engine, không mở rộng Runtime orchestration/publication policy trong milestone này. Không tự commit/push/merge/deploy.

## 2. Căn cứ chuẩn và phân biệt yêu cầu

- **[N] UML:** OMG UML 2.5.1, Chương 17 Interactions; §17.3 Lifelines, §17.4 Messages, §17.6 CombinedFragments. Truy cập [trang đặc tả](https://www.omg.org/spec/UML/2.5.1/About-UML) và [PDF normative](https://www.omg.org/spec/UML/2.5.1/PDF).
- **[R] Runtime:** [OpenTelemetry Traces](https://opentelemetry.io/docs/concepts/signals/traces/) cho span context, events và links. Trace là observation; mapping sang UML là rule của MAVISS phải có căn cứ, không phải phép chuyển đổi được OTel tự bảo đảm.
- **[T] Tool syntax:** [PlantUML Sequence](https://plantuml.com/sequence-diagram) chỉ dẫn cú pháp/khả năng render; không thay thế UML hoặc chứng minh source semantics.
- **[M] MAVISS:** typed IDs, evidence/provenance, model pin, unknown handling, giới hạn UI, document CAS và profile hỗ trợ ở tài liệu này.
- **[X] Ví dụ:** các fixture minh họa tự dựng là synthetic hoặc DESIGNED, không phải kết quả đo dự án thật.

Đọc tài liệu nhóm `.doc_review/main/Thông tin về hệ thông diagram/Sequecen diagram.docx`. Nếu nội dung công cụ/hướng dẫn giản lược mâu thuẫn với UML, đối chiếu điều khoản normative trước khi chốt rule. Không tuyên bố hỗ trợ toàn bộ UML 2.5.1 chỉ vì renderer vẽ được một tập ký hiệu.

Đọc thêm phần Sequence/render/editor trong `Tool repo .docx` cùng thư mục và gate tái sử dụng công cụ ở §4.1 của roadmap. Báo cáo M3 cần nêu renderer/editor nào được tận dụng, capability đã kiểm trên fixture, phần custom cần thiết và lý do. Với M3 đã đang triển khai, hoàn thiện mục quyết định này từ code/fixture thực tế; không tự đổi engine hoặc bỏ code đã làm chỉ vì có thêm tên công cụ trong catalog.

## 3. Baseline code đã đối chiếu

- FE: `scenario-design.ts`, `designed-scenario.tsx`, `scenario-diagram.tsx`; catalog đang có Scenarios (+1) trong 4+1.
- Designed V0 hiện lưu modelId/name/edgeIds, cho lặp cạnh; `scenarioXml` tự dựng lifeline và message. CODE_DEPENDENCY cũng có thể được chọn; cạnh không phải messaging đang được vẽ đầu block. Đây chưa phải bằng chứng synchronous call.
- Observed hiện phân trang 30 steps, phân nhóm theo trace và đối chiếu participant bằng tên khi chỉ có một match. Chưa có participant identity đủ mạnh cho tên trùng hoặc nhiều role của cùng phần tử.
- Java: `runtime/dto/SequenceStepDTO.java`, `SequenceDiagramResponseDTO.java`, `OtelTraceCorrelationServiceImpl.getSequenceDiagramBySession`, `RunnerReceiptIngestServiceImpl` là các đường cần lần tiếp theo dữ liệu thật.
- SequenceStepDTO hiện có stepOrder, callerService/calleeService, operation, HTTP fields, duration, traceId/spanId/parentSpanId; chưa có message sort/canonical participant IDs riêng.
- `getSequenceDiagramBySession` đang đọc JSON với asInt/asLong; key số thiếu có thể thành 0. Cần sửa đúng field liên quan trong M3, không giả HTTP status=0 hoặc duration=0 cho dữ kiện chưa có.
- FE `java-operations.ts:runtimeSequence` xác minh session ID nhưng trả steps như object; contract trong `contracts.ts` và renderer đều phải được nâng cấp cùng nhau.
- M1/M2 đã có Graph IDs, 3E scope identity, CAS documents, draw.io embed, local renderer và fixtures/pipeline tests. Tái sử dụng những phần phù hợp, không sao chép lại state machine vào tests.

Historical verification gần nhất: default FE 112/112, connected FE 1/1; upstream C# 22/22 và Java 36 thực chạy + 1 skip; production build/typecheck/mainflow đạt ở lượt reviewer trước. Đây không phải số test M3 và phải xác minh lại source/worktree trước khi làm.

## 4. Profile ký pháp phải hỗ trợ trong M3

### SEQ-N01 — Lifeline và phạm vi

- Lifeline có identity riêng trong Interaction, label role:Type khi có dữ kiện và đường sống theo trục tương tác. Không mặc định gạch chân lifeline như object instance notation.
- Participant có thể là role, object, service hoặc external system; mức trừu tượng phải được công bố. Không tự thêm frontend/person cho backend.
- Một canonical model element có thể được tham chiếu bởi nhiều lifeline role; không gộp chúng chỉ vì cùng modelElementId hoặc cùng tên. Chỉ tạo các instance khác nhau khi có dữ kiện hoặc người dùng thiết kế.
- Người dùng đổi nhãn không làm đổi participant ID; người dùng đổi thứ tự hiển thị không làm đổi message ID.

### SEQ-N02 — Message sorts

M3 core profile gồm synchronous call, asynchronous call/signal, reply, create và delete/destroy; có self-message. Mapping tên domain sang UML MessageSort phải được ghi rõ, ví dụ SYNCH_CALL → synchCall, ASYNCH_CALL → asynchCall, ASYNCH_SIGNAL → asynchSignal, REPLY → reply, CREATE → createMessage, DELETE → deleteMessage.

- Sync: nét liền, đầu đặc. Async: nét liền, đầu hở. Reply: nét đứt; profile MAVISS dùng đầu hở nhất quán.
- Self-message giữ participant nguồn/đích, không biến thành cạnh giữa hai service giả.
- Create đi tới đầu lifeline mới; destroy kết thúc lifeline ở dấu X. Không diễn giải destroy thành xóa bản ghi DB hay dừng service vật lý.
- Reply phải có căn cứ/tham chiếu lời gọi phù hợp; không tạo reply từ việc span có endTime hoặc tự đổi ACK/event nghiệp vụ thành reply.
- **UNKNOWN là trạng thái sản phẩm, không phải UML MessageSort.** Khi chưa biết sort, hiển thị tương tác chưa phân loại với legend/notice rõ và semantic status PARTIAL; không tự dùng đầu mũi tên của sync/async rồi gọi view fully verified.
- Protocol HTTP, keyword async/await, dependency injection hoặc relation kind của Graph không tự quyết định message sort. User chọn sort trong designed mode thì ghi DESIGNED.

### SEQ-N03 — Execution specifications

Có activation bars, hỗ trợ lồng nhau khi cần. Chúng mô tả execution specification; không tuyên bố là CPU/thread hoặc latency theo chiều dài hình học. Chỉ sinh từ execution mapping có rule/evidence hoặc từ thiết kế của người dùng. Không tự bật activation cho mọi cạnh bất kỳ.

### SEQ-N04 — Fragments và InteractionUse

Designed mode phải hỗ trợ tạo/sửa/lưu/render alt, opt, loop, par và ref:

- alt có operands và guards; opt có một operand tùy chọn.
- loop lưu guard cùng bounds nếu người dùng khai báo; kiểm min/max trong profile hỗ trợ. Không vẽ mũi tên quay ngược lên để thay loop fragment.
- par chứa các operands có thể interleave; không khẳng định thread vật lý hay tất cả message xảy ra cùng timestamp.
- **ref là InteractionUse**, không lưu như một CombinedFragment operator tùy tiện. Target Interaction phải có ID/scope và trạng thái resolved/unresolved. Giới hạn preview expansion là chính sách UI, không tự gọi recursive reference là UML-invalid.
- Cho phép nested fragments trong giới hạn sản phẩm được công bố; child message/fragment phải thuộc đúng operand, giữ thứ tự và membership qua round-trip.
- Guard được lưu/render như biểu thức có provenance. Không eval code tùy ý và không tuyên bố validator chứng minh được tính loại trừ logic của mọi biểu thức.

break/critical/strict, found/lost messages và các notation ngoài core profile phải có hàng coverage riêng: supported/designed-only/deferred với lý do. Không âm thầm vẽ chúng như message thường hoặc tuyên bố đã bao phủ.

### SEQ-N05 — Thứ tự và causality

- Sequence diễn tả ràng buộc sự kiện; không suy total order từ khoảng cách hình học hoặc timestamp sort đơn thuần. Send precedes receive khi cặp occurrence đó thực sự được xác định.
- Observed mode giữ causal links từ parent span/span links/correlation có nguồn. Missing parent/link giữ unresolved; không match service theo tên đầu tiên hoặc nối thêm để tạo một chuỗi liền.
- Ordering dùng để render độc lập phải được ghi là presentation order, không tự biến thành causal dependency. Không tự sinh par chỉ vì hai spans chồng thời gian, hoặc loop vì cùng operation lặp nhiều lần.
- Trace/session khác nhau không được gộp vào một Interaction observed mà không khai báo rõ correlation/scope.

## 5. Contract dữ liệu đề xuất

Đây là thiết kế tối thiểu để agent hoàn thiện sau khi đọc code, không phải yêu cầu xây schema/framework lớn. Tái sử dụng các entity/fields hiện có khi nghĩa khớp. Payload typed/versioned phải giữ được semantics; XML/SVG chỉ là representation.

```ts
type InteractionDocument = {
  schemaVersion: number;
  interactionId: string;
  projectId: string;
  modelId: string;
  snapshotId: string;
  mode: "DESIGNED" | "OBSERVED";
  runtimeSessionId?: string | null;
  traceId?: string | null;
  abstractionLevel: string;
  participants: Participant[];
  messages: Message[];
  executions: ExecutionSpecification[];
  interactionBody: InteractionItem[]; // message refs, fragments/operands, InteractionUse
  provenance: ProvenanceReference[];
  limitations: string[];
};
```

Các type con cần có contract/schema thực, không để any hoặc record không kiểm tra:

- **Participant:** participantId ổn định trong Interaction; modelElementId nullable; role/name/type; resolutionStatus; provenance refs. Role/instance identity không trùng mặc định với graph node identity.
- **Message:** messageId riêng cho mỗi occurrence; from/to participant IDs; messageSort có UNKNOWN; label/operation; sourceRelationshipIds; evidence refs; correlation/trace/span refs nullable; call/reply reference nếu có; occurrence constraints nếu đã biết. Một source edge xuất hiện ba lần phải có ba message IDs, cùng tham chiếu source edge đó.
- **ExecutionSpecification:** executionId, participantId, start/end occurrence hoặc message anchors và provenance; không tái dùng duration làm geometry.
- **CombinedFragment:** fragmentId, operator, operand IDs, guards, child references và covered participants. **InteractionUse:** ID, targetInteractionId/scope, arguments nếu hỗ trợ, resolution status.
- **ProvenanceReference:** loại nguồn và reference tới evidence/trace hoặc design statement; field nào được người dùng quyết định phải thấy là DESIGNED. Không nhân bản source excerpt/secret vào toàn bộ XML.
- **View metadata:** layout, participant column order, viewport/pagination/limits tách với causality. Có included/omitted/truncated scope khi áp dụng, đúng đơn vị.

Giữ null/unknown khác zero/empty: status, duration, timestamps, modelElementId hoặc evidence chưa có không được ép thành 0, empty ID hay fact được xác minh.

### Compatibility và model pin

- Nâng cấp additive DTO/API: field cũ vẫn đọc được, field mới có nullability/default trung thực. Không xóa response fields hiện đang có client dùng.
- Legacy name-only steps: có thể hiển thị label cùng unmapped/ambiguous participant, nhưng không gán source UUID nếu không có mapping deterministic có căn cứ. Dùng view-local ID cho lifeline chưa map, không gửi nó tới source evidence API.
- Source base model và RUNTIME_ENRICHED model phải có lineage/mapping tường minh. Không bỏ guard modelId chỉ vì cùng project; cũng không làm trace hợp lệ bị vô hình chỉ vì session pin base model còn response thuộc enriched revision. Chọn đúng model/trace trong UI hoặc map lineage đã xác minh, ghi rõ phiên bản đang xem.
- Runtime overlay chỉ đọc. Chỉnh sửa một observed sequence tạo designed copy/overlay có source reference, không sửa receipt/span gốc hoặc giả rằng một nhánh designed đã được quan sát.

## 6. UI và 3E phải đi trọn luồng

### Designed scenario

- Mở/tạo Interaction theo model pin; thêm participant từ model hoặc role được thiết kế, gán nhãn rõ provenance.
- Thêm/sửa message, sort, order, activation; chèn/lồng alt/opt/loop/par và ref.
- Có validator báo đúng element/constraint; các feature chưa hỗ trợ phải được báo, không lược bỏ âm thầm khi lưu/render.
- Chọn message/participant/fragment mở inspector đúng loại và đúng ID. SourceRelationshipIds chỉ để truy API source; messageId không phải relationship UUID.
- Legacy scenarios: đọc được edgeIds có lặp và thứ tự cũ; khi nâng cấp không tự gán SYNCH_CALL cho CODE_DEPENDENCY. Để UNKNOWN hoặc yêu cầu user khai báo DESIGNED, giữ bản lịch sử trước nâng cấp.

### Observed scenario

- Chọn session → trace → đúng model/snapshot. Hiển thị observation window/completeness khi có, còn thiếu ghi unknown.
- Message được tạo từ rule correlation có test; duplicate display names không làm gộp participant. Không có trace thì empty-state trung thực.
- Mỗi message mở được trace/span/evidence đã có; nguồn static/config hỗ trợ mapping phải được giữ riêng với runtime observation.
- Group/fragment selection không được gọi AI của message đại diện rồi trình bày như toàn nhóm. Canonical subject key gồm model/interaction/mode/session/trace/selection scope phù hợp; request và result đều bị chặn/cách ly khi selection đổi.
- Đổi model/trace/mode hoặc group membership phải reset selection/3E state đúng scope. Không sao chép lỗi representative ID của M2.

### Rendering và editor

- Timeline layout riêng cho Sequence; không dùng force graph hoặc generic C4 ELK relayout để sắp lại message order.
- Tái sử dụng draw.io/PlantUML/Mermaid đã có nếu fixture profile vượt kiểm chứng thực tế. Chọn một representation có thể chỉnh sửa và lưu làm đường chính; không xây đồng thời nhiều editor. Ghi trade-off trước khi code, không thay thư viện chỉ vì demo đẹp.
- Nếu một engine không hỗ trợ sort/fragment/unknown của profile, báo limitation hoặc gate format đó; không export âm thầm mất semantics.
- Generic Relayout/Regenerate của C4 phải được gate hoặc có Sequence implementation riêng. Export sang SVG/PNG không đủ để chứng minh editable document round-trip.
- Preview/readiness của draw.io8090, timeout và lỗi renderer phải hiển thị đúng. Render hoàn tất mới chạy visual assertions; không dùng sleep ngắn hoặc sự xuất hiện menu làm PASS.
- Khi pagination/collapse/limit làm ẩn message/fragment, thông báo số và phạm vi; không để đứt reply/execution/ref rồi trình bày như timeline đầy đủ.

## 7. Lưu tài liệu và round-trip

- Dùng CAS document history hiện có, view/interaction ID ổn định; có thể dùng namespace riêng cho từng Interaction thay vì ghi mọi scenario lên một viewId duy nhất. Không ghi đè `scenarios:designed` cũ hoặc document C4 của người dùng.
- Save first revision theo contract hiện hành, stale save phải conflict; reload và download phải lấy đúng model/interaction/document revision.
- Metadata có schemaVersion và typed semantics, lưu ở vị trí editor thực sự bảo toàn. Đã biết draw.io có thể loại custom mxGraphModel attributes: cần carrier trên cell phù hợp và kiểm browser thật; không chỉ đặt metadata ở root rồi giả định còn nguyên.
- Round-trip giữ participant/message IDs, repeated occurrences, source refs, message sorts, executions, fragment operands/nesting/guards, ref target và provenance.
- Nếu editor chỉnh text/arrow/fragment không thể chuyển lại thành typed semantics tin cậy: thông báo conflict/unsupported edit và giữ recovery copy. Không render mới từ metadata cũ rồi bỏ qua chỉnh sửa người dùng, cũng không mặc định tin metadata trong khi canvas đã đổi semantics.
- Nếu semantic editing chỉ hỗ trợ qua structured UI, công bố điều đó; draw.io có thể giới hạn ở layout. Các thao tác không hỗ trợ phải được gate/giải thích, không quảng cáo editor UML tùy ý.
- Regenerate chỉ thay draft theo thao tác rõ; Save tường minh mới tạo project revision. Không rewrite trace hoặc source graph để làm diagram phù hợp chỉnh sửa.

## 8. Bộ fixture và tiêu chí nghiệm thu

Mỗi rule có ID/source, positive/negative fixture, expected literal hoặc đáp án độc lập và test/harness chạy code production. Không tự viết lại controller trong test; default regression độc lập output của phiên trước, connected suite có lệnh riêng và output đúng lượt.

### Bộ mẫu bắt buộc

1. **Designed order flow:** participant có tên trùng nhưng ID khác; sync call + reply có reference, async publish có provenance DESIGNED, self-message, execution lồng nhau.
2. **Fragments:** alt hai operands, opt, loop có guard/bounds, par và ref; có ít nhất một trường hợp nested. Ví dụ nghiệp vụ là giả định, không được gọi là source analysis.
3. **Lifecycle:** create lifeline ở đúng occurrence, destroy chấm dứt; trường hợp message sau destroy bị validator bắt hoặc khai báo không thể xác minh theo scope, không vẽ tiếp bình thường.
4. **Runtime mapping:** canonical IDs, display name duplicate, thiếu parent, thiếu receiver, parent/link correlation, missing status/duration, cùng operation lặp. Một CLIENT/SERVER span pair không được nhân thành hai business messages do cùng ghi hai phía.
5. **Partial order:** các nhánh độc lập và timestamps bằng nhau/lệch đồng hồ; causal order có nguồn giữ nguyên, thứ tự vẽ không tự thành xác nhận đồng thời hay total order.
6. **Persistence:** nhiều scenario cùng model, model khác, stale CAS, backend cũ, V0 migration, metadata root bị editor bỏ, malformed/unsupported typed payload, label Unicode/XML special chars.
7. **Selection:** message lặp cùng source edge, reply/call/fragment/source khác nhau, đổi trace/model trong khi evidence/AI request pending; không rò kết quả cũ.

### Acceptance IDs

- **M3-AC01:** contract producer→DTO→serialization→adapter→domain giữ identity, nullability/provenance; explicit old-backend compatibility.
- **M3-AC02:** ký pháp core sorts/self/create/destroy/executions được kiểm bằng XML/SVG thực và visual review; UNKNOWN không giả sync/async.
- **M3-AC03:** designed UI hỗ trợ alt/opt/loop/par/ref và nested operands trong profile đã cam kết; validator không âm thầm xóa dữ liệu.
- **M3-AC04:** canonical participant mapping không first-name match, đúng model/session/trace và lineage được công bố.
- **M3-AC05:** observed projection giữ causal constraints, observation limits và status/duration thiếu; static graph không bị biến thành observed timeline.
- **M3-AC06:** inspector và 3E/API request dùng đúng source/trace targets, selection scope và response isolation.
- **M3-AC07:** create/edit → Save CAS → reload → export cùng revision và semantics; hai cycles editor round-trip không mất fragment/message/provenance.
- **M3-AC08:** legacy designed/observed payload vẫn đọc được với unknown trung thực; không ghi đè lịch sử khi upgrade.
- **M3-AC09:** một designed scenario và một observed trace thật chạy xuyên UI/API trên build chứa M3. Cần xác minh trace có provenance thực; synthetic replay chỉ tính contract/integration test. Nếu chưa có observed data/permissions thì ghi BLOCKED/NOT RUN và không đánh whole milestone PASS.
- **M3-AC10:** Regression M2 Graph/C4/3E/CAS và các contract runtime liên quan đạt; thay notation không làm source graph/count/IDs thay đổi.
- **M3-AC11:** coverage manifest phân biệt source-supported, designed-only, partial/deferred theo rule; break/critical/strict và feature nâng cao có trạng thái rõ.
- **M3-AC12:** scripts/test processes có timeout, đúng exit code, browser/helper cleanup; dependency app giữ lại được báo rõ, không còn “test running” giả do QA server chưa đóng.

Chỉ gọi M3 hoàn thành khi các acceptance bắt buộc trong phạm vi đã cam kết có bằng chứng. Có output đẹp hoặc unit suite xanh chưa đủ. Tính năng nâng cao deferred không được giấu trong tên gọi “UML chuẩn đầy đủ”.

## 9. Kế hoạch thực hiện cho implementation agent

### Bước 1 — Contract và dữ liệu hiện có

Đọc đúng những file ở mục 3 cùng README/instructions áp dụng. Xác minh worktree/main-sync/stack source, không dựa mù vào tên branch. Viết thiết kế ngắn trong báo cáo M3: participant/occurrence identity, message sort/provenance, observed lineage, schema/storage/compatibility, renderer/editor path và dataset acceptance.

Sau đó tự tiếp tục triển khai các quyết định cục bộ trong phạm vi M3; không dừng chỉ để xin duyệt bản plan. Nếu thực sự cần đổi schema/Worker contract, nêu căn cứ, dùng additive/versioned change với compatibility tests; không sửa migration đã áp dụng. Migration tiếp theo phải kiểm tra repository lúc làm, V15 đã dùng ở main.

### Bước 2 — Một vertical slice trước

Làm message typed/ID/provenance → API/adapter → một designed và một observed view nhỏ → selection → CAS reload/export. Chốt thông tin thiếu/legacy trước khi mở rộng fragments. Đây là thứ tự bên trong M3, chưa phải lý do dừng bàn giao milestone chỉ với menu hoặc DTO mới.

### Bước 3 — Hoàn thiện core profile và editor

Thêm message sorts, executions, fragments/ref, validation và structured edit. Round-trip editor thật và generic relayout gating được làm trong cùng milestone. Sửa lỗi tích hợp khi gặp, giữ change set tập trung.

### Bước 4 — Kiểm chứng và bàn giao

Chạy meaningful production tests, FE typecheck/mainflow/final build dist riêng; Java tests/mapping và Worker tests nếu đường đó thay đổi. Upstream/connected tests chạy theo thứ tự trên output thật, không silent fallback vào fixture cũ. Không lặp suite không liên quan khi chỉ chỉnh docs sau khi code đã đạt.

Chạy browser acceptance trên authenticated stack có build M3, kiểm final SVG/XML và save/reload/export. Chỉ tạo/sửa dataset/document test theo phạm vi được phép; không bypass auth, sửa receipt/DB hoặc bật promotion bypass để dựng bằng chứng.

## 10. Ràng buộc và hồ sơ bàn giao

- Không commit/push/merge/deploy/reset/clean/stash; không revert thay đổi có sẵn. Lưu diff/backup mục tiêu và phân biệt code M3 với baseline M1/M2/main-sync chưa commit.
- Không scan repository toàn bộ; tìm symbol/đọc phần liên quan. Giữ encoding/line endings và kiến trúc hiện hữu, không thêm dependency khi chưa chứng minh thiếu khả năng.
- Không log credential, token, cookie hoặc source secrets. Khởi động stack QA trên port/dist đúng owner; không dừng ứng dụng/agent khác và không áp migration vào DB dùng chung.
- Browser/helper QA phải đóng trong finally cả khi lỗi; ghi đúng service app còn giữ. Dùng DOM selector chuẩn trong page.evaluate, không dùng :has-text trong document.querySelector.
- Không suy kiến thức nghiệp vụ từ mẫu trong DOCX; AI chỉ giải thích hoặc đề xuất có provenance, không trở thành evidence được xác minh.

Tạo/cập nhật:

1. `docs/M3_UML_SEQUENCE_REPORT_2026-10-24.md`: thiết kế, supported profile, legacy compatibility, command results và bảng acceptance IDs với implementation/test/browser riêng.
2. Fixtures có provenance và expected độc lập trong test directories; coverage manifest rule-level có mapping test/harness thật.
3. `output/m3/`: artifact của run acceptance, source/build/ports/dataset, screenshots/XML/SVG, metadata/semantic round-trip comparisons, không chứa secret.
4. README FE/runtime contract docs bị ảnh hưởng và roadmap hiện trạng; giữ lịch sử M2 D5/UC-01 còn mở. Không tạo nhiều báo cáo trùng lặp sau mỗi sửa nhỏ.

Báo cáo cuối nêu người dùng làm thêm được gì, bugs phát hiện/sửa, file:symbol, lệnh tự chạy và kết quả; phân biệt mock integration, real HTTP, observed trace, editor/browser và manual. Chưa chạy phải ghi NOT RUN/BLOCKED với lý do, không tính vào PASS.

## 11. Prompt bắt đầu cho Gemini

Bạn là implementation agent MAVISS. Hãy đọc và **triển khai M3 UML Sequence theo toàn bộ tài liệu này và roadmap**. User đã giao M3; không dừng vì D5 M2 còn manual, nhưng phải giữ trạng thái đó trung thực.

Xác minh baseline, viết contract/renderer/acceptance design ngắn rồi tiếp tục code đến một milestone có thể sử dụng và review. Hoàn thành các phần tự thực hiện được; nếu cần người dùng đăng nhập hoặc có blocker dữ liệu observed, hỏi đúng thông tin/thao tác cần thiết và làm tiếp phần độc lập.

Không chỉ soạn plan hoặc dựng demo. Không thay source facts để test xanh. Không tự mở M4. Không commit/push/merge/deploy. Bàn giao M3 theo acceptance IDs để reviewer nghiệm thu.

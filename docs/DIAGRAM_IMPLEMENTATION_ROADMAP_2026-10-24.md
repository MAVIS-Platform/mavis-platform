# Review và kế hoạch hoàn thiện Graph C4 UML

Ngày review: 24/10/2026. Trạng thái: kế hoạch đề xuất, chưa triển khai sản phẩm trong lượt review này.

## 1. Mục tiêu và baseline

Mục tiêu là đưa bộ tài liệu trong `.doc_review/main/Thông tin về hệ thông diagram/` thành các chức năng sử dụng được: có dữ liệu đúng phạm vi, ký pháp đúng, truy nguyên bằng chứng, lưu/mở lại và xuất file. Có hình đúng ký hiệu chưa đủ chứng minh hình phản ánh đúng source.

Baseline review là working tree hiện tại: HEAD `c299a91`, code M1 chưa commit và nội dung main `e64de71` (#36) đã tích hợp vào working tree. Git history CHƯA ghi nhận merge main. Không mô tả đây là một commit phát hành đã ổn định.

Kết quả verification từ lượt tích hợp ngay trước review: FE 102/102 test; typecheck, mainflow và production build đạt; Java client/common/platform/analyzer 348 thực chạy đạt, 13 skip; toàn reactor test-compile đạt. Đây là regression/build, không phải E2E mới cho toàn bộ stage 13–16. Lượt lập kế hoạch này không chạy lại test và không thay đổi code sản phẩm.

Đã đọc nội dung ký pháp trong các DOCX, đối chiếu catalog/projection, sequence DTO, parser Java, orchestration C#, graph layout, editor metadata và báo cáo M1. Review nội dung văn bản và source có trọng tâm; không kiểm lại toàn bộ ảnh nhúng trong DOCX, toàn bộ extractor C# hoặc toàn bộ runtime.

## 2. Những gì đang có

- **Graph và 3E:** có model/edge ID, origin layer, resolution status, aggregation truy ngược cạnh gốc, metadata node và chọn phần tử xem evidence. Còn thiếu mức code sâu và bộ đo chất lượng extraction có đáp án độc lập.
- **C4 C1/C2/C3:** có catalog và projection riêng; C1 không tự tạo caller; C2 có system boundary và protocol messaging có nguồn; C3 có scope từng container. M1 đã xác minh lưu/reload/export và bảo toàn metadata. Drag/undo/redo vẫn cần kiểm chứng; UC-01 chưa có quyết định quy ước chính thức.
- **Sequence:** đã có designed scenario với lifeline và thứ tự người dùng chọn, cùng observed scenario từ runtime. Có nền tảng để mở rộng, chưa bao phủ tài liệu UML Sequence.
- **Class:** Logical view tồn tại; chưa có model/view UML Class đầy đủ với thành viên và các loại quan hệ.
- **Package:** Development view gom theo qualifiedName và CODE_DEPENDENCY; chưa phải model UML Package đầy đủ.
- **Deployment:** có view 4+1 từ tài nguyên khai báo; chưa phân biệt đầy đủ device/execution environment/artifact/manifestation như tài liệu.
- **Activity và State:** chưa có loại view tương ứng trong catalog đã kiểm tra; chưa thấy contract đủ để sinh các hành vi này ở luồng đã review.
- **Công cụ:** draw.io, ELK, PlantUML và Mermaid đã có tích hợp. Tool repo.docx là đề xuất khảo sát; không phải tất cả công cụ trong đó đều cần đưa vào sản phẩm.

## 3. Findings cần xử lý

### R1 — Hồ sơ tiến độ đang trộn baseline cũ và trạng thái hiện tại

`DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md` vẫn mở đầu bằng “chưa triển khai”, mô tả C1 cũ ở B1, có đoạn S2 gọi bản lưu rev4 là đã đạt trước khi phát hiện flatten boundary, và S3 còn ghi migration V15+ như một đề xuất mới. Main đã có `V15__Runtime_Planning.sql`.

Tác động: agent sau có thể làm lại việc đã xong hoặc dùng sai baseline/migration. Cần tách lịch sử khỏi trạng thái hiện tại, tham chiếu M1 revision 6; số migration tiếp theo phải chọn theo repository tại thời điểm triển khai, không sửa migration đã áp dụng.

### R2 — Vocabulary Java lệch contract DB

`mavis-common/.../enums/ElementType.java` chưa có MESSAGE_CHANNEL, `RelationType.java` chưa có MESSAGE_PUBLISH/SUBSCRIBE; CHECK ở `V13__Messaging_Architecture_Facts.sql` đã có. Không suy từ drift này rằng mọi API hiện tại đều lỗi: nhiều đường đang dùng String.

Ưu tiên đồng bộ các giá trị đang dùng, lập mapping ngữ nghĩa và test contract. Không đổi đồng loạt tên quan hệ theo Graph.docx: tài liệu tự ghi vocabulary là đề xuất riêng của MAVISS, không phải một chuẩn bắt buộc từ W3C/UML.

### R3 — Sequence cần contract giàu hơn trước khi mở rộng ký pháp

`SequenceStepDTO` hiện có stepOrder, callerService/calleeService, operation, HTTP fields, trace/span/parentSpan; chưa có canonical participant ID hay message sort rõ ràng. `scenario-diagram.tsx` nối về model theo tên khi có đúng một kết quả. `scenario-design.ts` cho chọn cả CODE_DEPENDENCY, dùng mũi tên async cho messaging và block cho các cạnh còn lại.

Đây là giới hạn của designed interaction view; không đủ để tuyên bố mọi cạnh đó là synchronous UML message được source chứng minh. Cần tách lựa chọn thiết kế của người dùng khỏi dữ kiện quan sát; thiếu message sort phải được khai báo là chưa xác định. Timestamp/stepOrder không tự chứng minh total order giữa nhánh độc lập.

### R4 — Class/Activity/State cần thêm dữ kiện, không thể chỉ đổi hình

`JavaSourceParser` và `CodeEvidenceDTO` được kiểm tra đang tập trung vào component, HTTP, database, messaging và dependency. Chưa có contract typed cho toàn bộ class members, visibility/multiplicity, activity token flow hoặc state transitions. C# đi qua analyzer riêng trong Worker; phải review/mở rộng đường đó khi triển khai parity.

Không suy composition từ field/FK, multiplicity từ List, concurrency từ async/await, hoặc state transition chỉ từ enum. Các tính năng nguồn chưa hỗ trợ phải có trạng thái unsupported/unknown; không lấp bằng ví dụ giả định trong DOCX.

### R5 — Mỗi renderer phải tự vượt qua round-trip gate

M1 đã sửa việc draw.io loại metadata ở mxGraphModel bằng bản sao trên cell. `scenarioXml` hiện lưu mavisScenario ở cấp mxGraphModel và có đường save riêng. Đây là điểm cần kiểm chứng nếu cho scenario đi qua editor; chưa kết luận đường save riêng hiện tại đã bị lỗi. Không áp kết quả C2 round-trip cho mọi loại UML.

### R6 — Graph lớn và phép đo chất lượng chưa có baseline đủ

`graph-layout.ts` chỉ chạy nhánh force khi tối đa 300 node. Đây là giới hạn code đã xác minh, không phải benchmark chứng minh graph lớn luôn chậm. `view-planner.ts` đã có omittedNodes/omittedEdges; cần phân biệt bị lọc, gộp và bị cắt giới hạn, không coi chúng là cùng một số.

Cần đo trên dữ liệu cố định trước khi thay engine. Fixture synthetic chứng minh contract, không được gọi là tập ground truth để đo precision/recall extraction trên dự án thật.

## 4. Các quyết định thiết kế đề xuất

1. Giữ các view C4/4+1 hiện hữu; bổ sung họ UML với tên và mức hỗ trợ tường minh. Không đổi nhãn Logical thành Class để tính là hoàn thành.
2. Tái sử dụng evidence, versioned model và CAS document hiện có. Bổ sung payload typed/versioned cho từng loại diagram khi cần; quyết định lưu properties hay bảng riêng sau kiểm chứng mẫu nhỏ, tránh xây framework chung lớn trước.
3. Mỗi phần tử/quan hệ chỉ rõ nguồn: trích xuất, cấu hình, observed runtime hoặc DESIGNED. Thay đổi thiết kế là overlay/version riêng, không sửa source facts gốc.
4. Giữ draw.io cho editor đang có. Ưu tiên thử renderer đã tích hợp trên fixture ký pháp; nếu không đáp ứng một notation, chọn adapter chuyên dụng cho notation đó. Timeline Sequence và swimlane Activity không dùng force layout của Graph.
5. UC-01 đề xuất giữ contract backend hiện hành channel → consumer với nhãn “Delivers messages to”. Nếu cần góc nhìn “consumer consumes topic”, tạo projection có ghi quy ước và giữ ID nguồn. Đây là đề xuất cần chốt; chưa tự đổi chiều dữ liệu trong kế hoạch.
6. Không yêu cầu source tự suy đủ mọi ký hiệu. Các quan hệ thiết kế như composition, package merge hoặc workflow liên service có thể do người dùng khai báo có provenance. Chức năng thiết kế không được trình bày là extraction tự động.

### 4.1. Đánh giá tái sử dụng công cụ trước mỗi milestone

Tài liệu `Tool repo .docx` là đầu vào của từng milestone, không chỉ một danh sách để xem lại ở M8. Trước khi tự viết renderer/editor/layout mới, agent phải đọc đúng phần liên quan và ghi quyết định kỹ thuật ngắn trong báo cáo milestone.

**Quy trình:** yêu cầu/capability cần có → kiểm khả năng tích hợp hiện hữu → thử fixture khó nhất trên một ứng viên phù hợp nếu còn gap → chốt giữ/tích hợp/tự viết phần thiếu. Không bắt buộc thử toàn bộ catalog hoặc thêm một thư viện cho mỗi notation.

**Phân bổ theo phạm vi:**

- **Graph:** so baseline viewer/layout hiện có với các ứng viên Cytoscape + fCoSE, G6 được nêu trong tài liệu khi có nhu cầu tương tác/hiệu năng đã đo. Có thể mở PoC trước M8 nếu gap xuất hiện sớm; M8 là mốc benchmark/acceptance toàn hệ, không phải lần đầu mới được xem xét tái sử dụng.
- **M3 Sequence:** đánh giá draw.io và renderer PlantUML/Mermaid đã tích hợp trên profile message/fragments/metadata cần có. Chọn một đường editable chính. M3 đang triển khai thì bổ sung quyết định sử dụng công cụ vào hồ sơ review; không yêu cầu bỏ code hoặc đổi engine nếu chưa có bằng chứng lợi ích.
- **M4 Class/Package:** kiểm renderer hiện hữu; xét các ứng viên editor Class như Apollon/BESSER WME từ tài liệu nếu thiếu semantic editing. Không lấy việc vẽ hộp lớp được làm bằng chứng hỗ trợ mọi relation/multiplicity/round-trip.
- **M5 Deployment:** kiểm node/environment/artifact/nesting/manifestation trên engine hiện có; xét ứng viên Deployment như Apollon được tài liệu đề xuất khi editor hiện hữu không đạt yêu cầu.
- **M6 Activity:** kiểm swimlane và token-flow notation; xét ứng viên Activity trong catalog trước khi tự xây palette/editor mới.
- **M7 State:** kiểm transition/composite/region metadata và editor; xét ứng viên Class/State như BESSER WME trong catalog khi có gap.
- **C4:** Structurizr/C4-PlantUML là ứng viên model/validation/render trong tài liệu nếu cần giải quyết gap C4 cụ thể, không phải dependency bắt buộc thêm vào M1/M2 đã đạt.

Tên trên là các ứng viên trong khảo sát nội bộ, chưa phải khẳng định mọi version hiện hành đáp ứng MAVISS. Khi thực sự PoC/adopt phải xác minh từ nguồn chính thức: phiên bản, license của đúng artifact/bundle, Next/React/browser compatibility, cách self-host/offline và chi phí vận hành.

**Gate trước khi tích hợp:** fixture positive/negative đúng semantics; ID/evidence/provenance và hierarchy giữ nguyên; profile chưa hỗ trợ có notice; save/reload/export/round-trip qua công cụ thật đạt; auth/embedding/selection có đường tích hợp rõ. Nếu thay layout/viewer thì đo baseline và ứng viên trên cùng input/máy, không quyết định bằng ảnh demo.

**Đầu ra tối thiểu trong mỗi báo cáo:** công cụ đang dùng, khả năng tái sử dụng đã kiểm, gap còn lại, phần custom thực sự cần viết và lý do, kết quả fixture/PoC nếu có. Tách code phân tích source/correlation/validation của MAVISS với phần công cụ render/edit; không trông đợi một engine tự chứng minh mô hình đúng.

## 5. Roadmap theo milestone

Mỗi milestone bàn giao một luồng sử dụng được, bao gồm dữ liệu → API → projection → UI → evidence → save/reload/export. Không chia thành nhiều task chỉ đổi label rồi tuyên bố một loại diagram hoàn thành.

### M2 — Hoàn thiện hợp đồng Graph/C4 và nền kiểm chứng UML

**Cập nhật review 24/10/2026:** implementation đã được Codex duyệt sau vòng G1–G3; Browser Acceptance trên stack thật + `draw.io:8090` đã đạt **Scenarios 1–7 PASS** (bao gồm kiểm chứng riêng hình SVG + `.drawio` XML + scope của C1, C2 rev 6 và 2 container C3 `ftgo-order-service` rev 1 / `ftgo-kitchen-service`), **Scenario 8 (D5)** đã xác minh đúng interactive editor iframe (`iframe[title="draw.io diagram editor"]`) và giữ `NEEDS MANUAL VERIFICATION` cho thao tác kéo tay/undo/redo, **UC-01** giữ `OPEN`. Xem [nghiệm thu implementation M2](M2_IMPLEMENTATION_ACCEPTANCE_2026-10-24.md) và [báo cáo nghiệm thu M2](M2_GRAPH_C4_CONTRACT_REPORT_2026-10-24.md). Chưa tự ý bắt đầu M3 trước khi reviewer chốt đóng M2.

**Đầu ra:** Graph/C4 có phạm vi, provenance và số liệu hiển thị trung thực; bộ nền dùng lại cho các UML tiếp theo.

- Đồng bộ enum/mapping với contract hiện hành; ghi quyết định UC-01.
- Evidence count có đơn vị rõ, unique evidence ID khi gộp và trạng thái unknown khi chưa tải; tránh N+1 query.
- Công bố phạm vi snapshot/model, số source node/cạnh, số gộp, bị lọc và bị cắt giới hạn; kiểm tra Graph legend.
- Bổ sung protocol cho các loại quan hệ còn lại chỉ khi xác định được nguồn và nghĩa của field; không mặc định JDBC/Kafka.
- Đóng drag/undo/redo M1 bằng quan sát thực, cập nhật báo cáo hiện trạng thống nhất.
- Định nghĩa checklist hỗ trợ cho 9 diagram, fixture đúng/sai với expected độc lập; khai báo contract metadata/version/provenance dùng chung tối thiểu.

**Nghiệm thu:** topology/source IDs giữ nguyên qua filter/gộp/layout; count truy về dữ liệu gốc; metadata sai/thiếu không tạo fact; pipeline source→model→Graph/C4 chạy trên một fixture Java và một fixture C# có đáp án; bản Test1 M1 không hồi quy. Phân biệt fixture extraction này với model fixture cũ.

**Khu vực chính:** GraphService/DTO, enums, java-wire, graph-projection, selection-three-e, view-planner, rules, tests và tài liệu tiến độ. Chỉ thay schema nếu có nhu cầu dữ liệu đã chứng minh.

### M3 — UML Sequence từ designed scenario và runtime

**Giao việc & Triển khai 24–25/10/2026:** đặc tả tại [M3 UML Sequence](GEMINI_M3_UML_SEQUENCE_IMPLEMENTATION_TASK_2026-10-24.md), review & fix tại [M3 Review & Fix](M3_REVIEW_AND_FIX_TASK_2026-10-25.md), báo cáo nghiệm thu tại [Báo cáo M3 UML Sequence](M3_UML_SEQUENCE_REPORT_2026-10-24.md). Đã hoàn thành triển khai `SEQ-N01`–`SEQ-N05`, xử lý trọn vẹn `R1`–`R6` (UNKNOWN initial sort & provenance honesty, Kahn causal topological sort & `candidateRelationshipIds`, Draw.io layout-only structural conflict detection & CAS overwrite block, collision-free `allocateNextSequenceId`) và kiểm chứng `M3-AC01`–`M3-AC12` (Java 46/46 tests PASS, .NET Worker 219/219 PASS, Frontend 122/122 unit/contract tests PASS + 2/2 connected pipeline PASS, Browser Acceptance E2E trên stack thật cho Designed Scenario + CAS persistence + 2-cycle Draw.io `:8090` round-trip + 3E scope isolation + Observed Runtime honest empty-state). **Trạng thái `M3-AC09`:** `PARTIAL / BLOCKED` (Designed Scenario browser E2E `PASS`; Observed Runtime trace correlation & projection `PASS` qua live Java/FE integration tests `output/m3/observed-sequence-java-actual.json`; phần live browser observed runtime trace giữ `BLOCKED` do `0 runtime_sessions` trong PostgreSQL hiện hành — chưa đóng toàn bộ M3 hoặc mở M4 trước khi có trace thật hoặc quyết định của reviewer). `D5` của M2 vẫn giữ `NEEDS MANUAL VERIFICATION` và `UC-01` (`MESSAGE_SUBSCRIBE` direction convention) giữ `OPEN`.

**Đầu ra:** một scenario có participant/lifeline rõ, message sort có nguồn hoặc khai báo thiết kế; chọn message xem source/trace, lưu/mở lại đúng scenario.

- Contract có participant ID, send/receive/correlation khi có, message sort và provenance; giữ tương thích DTO cũ.
- Hiển thị sync/async/reply, self-message, create/destroy và activation khi đủ dữ kiện.
- Hỗ trợ thiết kế alt/opt/loop/par và ref theo tài liệu; các phần nâng cao như break/critical/strict phải có hàng trạng thái cụ thể, không âm thầm vẽ như message thường.
- Observed trace chỉ phản ánh observation; không tự suy các nhánh chưa chạy, reply hoặc sự hoàn tất consumer từ việc publish.
- Kiểm tra metadata scenario qua actual editor nếu đường đó được hỗ trợ; giữ thứ tự, ID và fragments qua save/reload/export.

**Nghiệm thu:** fixture sync/async/self/parallel/thiếu span/trùng tên service; không nối nhầm participant; sort không phá causal constraints. Một designed scenario và một observed trace thật chạy xuyên UI/API; synthetic trace chỉ được tính là test contract. Loại advanced chưa hỗ trợ phải được công bố trước khi chốt milestone.

**Khu vực:** Sequence DTO/service, scenario-design, scenario-diagram, designed-scenario, contract/adapter và renderer. Không thay Runner lifecycle để giải quyết một thiếu sót hiển thị nếu dữ liệu đã đủ.

### M4 — UML Class và Package từ source

**Triển khai & Kiểm chứng 25/10/2026 (`SELF_VERIFIED / EXTERNAL_REVIEW_PENDING`):** đã triển khai đầy đủ extractor AST cho Java (`UmlClassifierVisitor.java`, `JavaSourceParser.java`) và C# Roslyn (`UmlCSharpInspector.cs`, `DotnetProjectAnalyzer.cs`), persist `ElementType.CLASS_INTERFACE` và `umlRelationKind` trong `GraphBuilderServiceImpl.java` / `ArchitectureResolver.java`, cùng engine projection/Draw.io round-trip trong `uml-diagrams.ts` và `uml-diagram-workspace.tsx`. Bảo toàn phân biệt visibility `~ [package-private]` (Java) với `~ [internal]` (C#), giữ nguyên overloaded methods theo `signatureKey`, không đoán interface theo tiền tố `I` (`Contract` là `INTERFACE`, `IHelper` là `CLASS`), khử trùng lặp `DEPENDENCY` khi đã có `ASSOCIATION`, không tự suy `SHARED_AGGREGATION`/`COMPOSITION` từ static field (chỉ mở trong `DESIGNED` overlay), gom phụ thuộc liên package bảo toàn `underlyingEdgeIds` và kiểm tra chu trình `«merge»` (`PACKAGE_MERGE_CYCLE_DETECTED`).

**Đầu ra:** chọn service/module để xem class/interface/enum, thành viên quan trọng và quan hệ; chuyển sang package ownership/dependency với evidence.

- Mở rộng dữ kiện JavaParser và C# analyzer theo từng mẫu được hỗ trợ: qualified identity, overload signature, field/property/operation, visibility/static/abstract, inheritance/implements.
- Làm contract và fixture một ngôn ngữ trước để kiểm tra thiết kế, sau đó hoàn tất parity ngôn ngữ thứ hai trong milestone; không dùng kết quả Java để đánh dấu C# pass.
- Association/dependency phải có rule dẫn xuất và evidence. Multiplicity/aggregation/composition chỉ hiện khi có căn cứ hoặc DESIGNED; tránh đếm field và association thành hai quan hệ độc lập.
- Package có ownership và dependency riêng. Java import/C# using không tự biến thành UML «import»/«access»; «merge» là khai báo thiết kế với kiểm tra chu trình merge.
- Bổ sung các ký pháp có trong tài liệu cho editor/designed mode và công bố rõ phần có thể tự trích xuất.

**Nghiệm thu:** source fixture Java/C# với tên trùng, overload, generics, interface, abstract/static; đáp án quan hệ độc lập; không biến HTTP thành inheritance. Package round-trip giữ ownership, class giữ thành viên/multiplicity và evidence. Mẫu sai hướng tam giác/thoi bị phát hiện.

**Khu vực:** Java parser/visitors/DTO, Worker C# analyzer và contracts, model builder, projection/renderers, tests. Thay đổi Worker contract phải version/additive và có backward-compatibility test.

### M5 — UML Deployment theo môi trường

**Triển khai & Kiểm chứng 25/10/2026 (`SELF_VERIFIED / EXTERNAL_REVIEW_PENDING`):** đã trích xuất và persist `deploymentMetadata` (image, ports, environment, artifactName) trên `SERVICE_CONTAINER`, `DATABASE`, `QUEUE_BROKER`, dựng node 3D `«executionEnvironment»` / `«device»` (`shape=cube`), nested `«artifact»`, mũi tên `«manifest»` tới phần tử logic, và `«communicationPath»` dẫn xuất độc lập từ các cạnh giao tiếp có bằng chứng protocol (`HTTP`, `TCP/DB`, `MESSAGING`). Các cạnh `DECLARED_COMPOSE` (`depends_on`) bị loại khỏi `CommunicationPath` (chỉ hiển thị qua overlay tùy chọn `«depends_on (startup only)»`) và đảm bảo cô lập từng môi trường (`MULTI_ENVIRONMENT_MIXED`).

**Đầu ra:** chọn môi trường/snapshot, phân biệt resource node, execution environment, artifact và deployment/manifestation; bấm vào phần tử thấy cấu hình hoặc quan sát hỗ trợ.

- Bắt đầu bằng deployment config đang trích được; không mở rộng Kubernetes/cloud discovery nếu không cần cho dataset đã chọn.
- Mô hình hóa hosting, artifact placement và communication path riêng với startup dependency.
- Không suy máy vật lý, replica hoặc artifact–component mapping chỉ từ container name; thiếu dữ liệu thì khai báo giới hạn hoặc cho designed overlay.

**Nghiệm thu:** mẫu JAR trong JVM, nhiều artifact trên target, external resource và thiếu host; «manifest» đi từ artifact tới phần tử logic; scope môi trường không trộn; không đưa Compose depends_on thành network traffic. Save/reload/export giữ nesting và source links.

### M6 — UML Activity cho hành vi xác định

**Triển khai & Kiểm chứng 25/10/2026 (`SELF_VERIFIED / EXTERNAL_REVIEW_PENDING`):** đã triển khai trích xuất AST Control Flow Graph (CFG) mức phương thức cho cả Java và C# (`methodsCfg`), hiển thị mặc định trong Swimlane `ActivityPartition` theo service container, hỗ trợ `INITIAL`, `ACTION`, `DECISION`, `MERGE`, `FORK`, `JOIN` (`joinSpec=AND`), `OBJECT_NODE` (`[state]`), `ACTIVITY_FINAL`, `FLOW_FINAL`, đánh dấu `PARTIAL` (`ACTIVITY_CFG_PARTIAL`) cho hàm chứa lambda/exception handler hoặc hàm trừu tượng chưa mở rộng thân hàm, và kiểm tra lỗi deadlock khi các nhánh loại trừ của `DECISION` đi thẳng vào `JOIN` mà không qua `MERGE` (`JOIN_BRANCH_DEADLOCK`).

**Đầu ra:** chọn một operation/workflow được hỗ trợ hoặc thiết kế activity, mặc định lane theo service như quy ước MAVISS.

- Contract riêng cho action, control/object flow, pin, partition, initial, decision/merge, fork/join, flow final/activity final.
- Source mode bắt đầu bằng control-flow trong một operation có phạm vi rõ. Chỉ mở rộng liên service khi có bằng chứng orchestration/correlation đủ; thiếu thì giữ partial.
- Designed mode có provenance cho guard, concurrency và ownership do người dùng khai báo.

**Nghiệm thu:** fixture if/else, loop, fork/join và nhánh không bao giờ tới join; phân biệt hai final; lane không bị diễn giải thành thread. Có negative tests về final có cạnh ra, guard [else] trùng và kiểu pin không phù hợp trong subset được hỗ trợ. Chạy UI, round-trip và mở source cho action.

### M7 — UML State Machine cho vòng đời đối tượng

**Triển khai & Kiểm chứng 25/10/2026 (`SELF_VERIFIED / EXTERNAL_REVIEW_PENDING`):** đã triển khai trích xuất vòng đời trạng thái (`stateLifecycle`) cho cả Java và C# theo 2 chế độ tường minh: `STATEFUL_CLASS` (trích xuất trường trạng thái, `initialState`, và các transition `trigger [guard] / effect`) và `ENUM_DECLARATION` (chỉ trích xuất danh sách state literal, tuyệt đối không bịa transition ở chế độ `EXTRACTED` và phát cảnh báo `ENUM_ONLY_NO_TRANSITIONS`). Hỗ trợ đầy đủ bộ kiểm tra cấu trúc (`MULTIPLE_INITIAL_STATES`, `INITIAL_TRANSITION_HAS_TRIGGER`, `FINAL_STATE_HAS_OUTGOING`, `CHOICE_BRANCH_HAS_TRIGGER`, `CHOICE_BRANCH_MISSING_GUARD`) và 2-cycle Draw.io round-trip.

**Đầu ra:** chọn đối tượng/state machine; xem transition trigger [guard] / effect và entry/do/exit, composite state.

- Chỉ nhận source transitions từ pattern/framework đã có extractor và fixture; enum riêng lẻ chỉ đủ danh sách state.
- Designed mode cho phép khai báo transition với nguồn thiết kế; không tự tạo các đường nối để hình đầy đủ.
- Phân biệt internal/self/external transition, completion, initial/final/choice theo tài liệu. History/orthogonal regions là phạm vi nâng cao phải khai báo hỗ trợ cụ thể.

**Nghiệm thu:** fixture vòng đời hợp lệ, guard/trigger sai ở initial/choice, final có cạnh ra, composite region; round-trip không mất hierarchy hoặc effect. Một vòng đời source-supported và một designed machine được kiểm qua UI; không tuyên bố phân tích được mọi state machine trong source bất kỳ.

### M8 — Khả năng sử dụng và nghiệm thu toàn bộ danh mục

**Triển khai & Kiểm chứng 25/10/2026 (`SELF_VERIFIED / EXTERNAL_REVIEW_PENDING`):** đã hợp nhất danh mục `Graph` + 9 loại sơ đồ (`C4: System Context, Container, Component` + `UML: Sequence, Class, Package, Deployment, Activity, State Machine`, đồng thời giữ tương thích ngược cho `4+1 View Model`), cập nhật manifest `output/m2/nine-diagrams-coverage-manifest.json` và `output/m8/coverage-matrix.json`, chạy benchmark Graph có seed cố định (`100 / 500 / 2.000` nodes $\times 5$ lượt chạy, ghi nhận median/max tại `output/m8/graph-performance-benchmark.json`), và vượt qua toàn bộ kiểm thử E2E trình duyệt (`output/m8/browser-catalog-acceptance.json`, `output/m3/acceptance-report.json`). Các mục cần thao tác/review ngoài phạm vi tự động (`EXTERNAL_REVIEW_PENDING`, `LIVE_OBSERVED_PENDING` cho M3-AC09, `D5`, `UC-01`) được giữ nguyên minh bạch trong báo cáo bàn giao [`docs/M3_M8_OVERNIGHT_HANDOFF_2026-10-25.md`](M3_M8_OVERNIGHT_HANDOFF_2026-10-25.md).

**Đầu ra:** bộ Graph + 9 loại diagram có ma trận hỗ trợ rõ, kiểm chứng sản phẩm và giới hạn công khai.

- Đo graph nhỏ/vừa/lớn cố định (đề xuất 100/500/2.000 nodes và số cạnh ghi rõ) trên cùng máy/browser, ít nhất 5 lần: thời gian usable, tương tác, bộ nhớ, ổn định vị trí và ID/evidence round-trip. Đây là workload đề xuất, chưa phải cam kết khả năng hiện tại.
- Chỉ mở PoC Cytoscape/fCoSE hoặc G6 nếu baseline hiện tại không đạt mục tiêu đã thống nhất. Tái xác minh license/tương thích phiên bản tại thời điểm PoC; Tool repo.docx chưa đủ để quyết định cài production.
- Áp dụng quyết định công cụ ở §4.1: các PoC cần thiết có thể đã làm ở milestone trước; M8 kiểm lại kết quả tích hợp và benchmark toàn bộ. Không trì hoãn mọi quyết định tái sử dụng tới M8.
- Kiểm tra label dài, Unicode, overlap, clipping, filter/truncation, keyboard selection và model switching trên các notation.
- Chạy suite extraction có nhãn, notation, API, persistence, browser E2E và export trên fixture Java/C# cùng dự án thật. Báo precision/recall theo quan hệ/ngôn ngữ chỉ khi tập đối chứng độc lập đủ; không lấy synthetic answer key làm chất lượng tổng quát.
- Công bố coverage của mỗi rule trong tài liệu: supported, designed-only, source-supported theo pattern, hoặc deferred với lý do.

**Nghiệm thu:** không còn rule bắt buộc trong phạm vi đã cam kết ở trạng thái ngầm; không mất semantics qua editor; các regression M1 và stage13–16 liên quan vẫn đạt. Các thao tác chưa chạy phải giữ NOT RUN/BLOCKED, không gộp vào PASS.

## 6. Thứ tự, phụ thuộc và cách giao việc

Thứ tự đề xuất: **M2 → M3 → M4 → M5 → M6 → M7 → M8**. M3 tạo giá trị sớm vì đã có scenario/runtime data. M4 xây dữ kiện mức code giúp M6/M7; M5 có thể làm sau M2 nếu cần ưu tiên deployment, nhưng mặc định giữ một milestone đang triển khai để giảm xung đột working tree.

Không ước lượng số ngày hoặc phần trăm hoàn thành khi chưa kiểm thử độ khó extractor. Mỗi milestone kết thúc bằng bằng chứng và review; không kết thúc chỉ vì đã thêm lựa chọn vào menu.

Trước mỗi milestone:

1. Xác nhận working tree, incoming main và ownership file; baseline hiện tại chưa có commit nên phải giữ backup/diff. Chỉ commit/merge/push khi người dùng yêu cầu.
2. Chọn source fixture/dataset cụ thể, expected semantics độc lập và phạm vi notation sẽ hỗ trợ.
3. Chốt DTO/serialization/compatibility trước khi viết renderer; kiểm migration mới không trùng lịch sử đang có.
4. Thực hiện trọn luồng, rồi chạy đúng regression liên quan và browser acceptance. Không dùng test fixture để thay thế lần gọi service/render/editor thật cần nghiệm thu.
5. Cập nhật README, trạng thái hiện tại, runbook và artifacts không chứa secret. Lưu kết quả cũ như lịch sử, không ghi đè thành kết quả của build mới.

Rollback theo milestone là phục hồi change set của milestone hoặc tắt capability mới, bảo toàn document/history đã lưu. Với migration additive, dùng kế hoạch tương thích/forward fix; không drop dữ liệu hay sửa checksum migration đã áp dụng.

## 7. Task kế tiếp nên giao

Giao **M2 — Hoàn thiện hợp đồng Graph/C4 và nền kiểm chứng UML** như một milestone, không giao agent “làm tất cả UML” cùng lúc. Agent phải đưa ra trước khi code: mapping hiện hành, đề xuất UC-01, field evidence/count/scope cần bổ sung và fixture kiểm chứng. Những lựa chọn cục bộ không ảnh hưởng contract có thể tự quyết; thay đổi chiều quan hệ hoặc schema nguồn phải được nêu rõ trước khi áp dụng.

Sau M2, chuyển thẳng sang M3 Sequence để có thêm một loại UML sử dụng được. Chỉ có thể nói toàn bộ bản cập nhật tài liệu đã được triển khai khi từng loại có coverage matrix và acceptance tương ứng; M1 riêng lẻ chưa đạt mốc đó.

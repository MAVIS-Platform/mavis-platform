# Đối chiếu chuẩn Graph/Diagram ↔ hiện trạng MAVIS và kế hoạch lát cắt

Ngày: 24/10/2026. Trạng thái: **báo cáo review — chưa triển khai thay đổi sản phẩm, chờ nhóm duyệt**.
Nguồn chuẩn: `.doc_review/main/Thông tin về hệ thông diagram/` (9 tài liệu ký pháp UML 2.5.1/C4, `Graph.docx`, `Tool repo .docx`, tất cả phiên bản 24/10/2026) đối chiếu với working tree **main `f3c2fae`**.
Phương pháp: đọc full-text 11 tài liệu; xác minh code bằng file:symbol (2 lượt kiểm chứng có chủ đích, không scan toàn repo); **không benchmark, không PoC**. Phân loại yêu cầu:

- **[N]** Quy tắc notation/semantics bắt buộc theo OMG UML 2.5.1 / C4 / nguyên tắc Graph.docx.
- **[M]** Quy ước riêng MAVISS (không phải yêu cầu chuẩn).
- **[X]** Ví dụ minh họa trong tài liệu (giả định, **không phải** dữ kiện của dự án).
- **[T]** Đề xuất công cụ — chưa phải quyết định áp dụng.

Trạng thái: **ĐÃ CÓ / MỘT PHẦN / THIẾU / CHƯA XÁC MINH**. Kết luận chỉ dựa trên bằng chứng trực tiếp; nơi thiếu bằng chứng ghi rõ.

---

## 1. Ma trận yêu cầu → hiện trạng

### A. Knowledge Graph (theo `Graph.docx`)

| # | Yêu cầu | Loại | Hiện trạng | Bằng chứng |
|---|---|---|---|---|
| A1 | Mỗi cạnh mang lớp dữ kiện (static/declared/runtime) tách bạch | [N] | **ĐÃ CÓ** | `ModelRelationship.originLayer` (STATIC/CONFIG/DEPLOYMENT/RUNTIME/STATIC_AND_RUNTIME theo CHECK V13); `EdgeDTO.originLayer` |
| A2 | `resolutionStatus` là chiều thông tin riêng, không trộn derivation | [N] | **MỘT PHẦN** | `EdgeDTO.resolutionStatus` đọc từ `properties` JSONB, default "UNKNOWN"; **không có enum/CHECK**; FE `java-wire.ts:263` `uncertain: e.resolutionStatus !== "RESOLVED"` — *đối chiếu trực tiếp xác nhận: chẩn đoán "blanket uncertain=true" trong DIAGRAM_GRAPH_PRODUCT_PLAN đã không còn đúng trên main; `graph-projection.ts:59` tích lũy OR từ cạnh gốc* |
| A3 | Graph API lộ evidence (ID hoặc đếm được) cho cạnh | [N] | **ĐÃ CÓ (M2, 24/10)** | `EdgeDTO.evidenceCount` (Long) và `evidenceIds` (List<UUID>) được nạp qua một query batch đơn lẻ `findRelationshipEvidenceIdsByModelVersionId` tránh N+1 (Spring Data List trả về empty list khi không có record, bảo toàn verified zero thay vì null); FE map qua `java-wire.ts` |
| A4 | ID không suy từ tên hiển thị; phân biệt overload/namespace/owner | [N] | **MỘT PHẦN** | Element UUID + `workerLogicalId`/`logicalKey` trong properties; resolution deterministic đã bỏ first-service fallback (DIAGRAM_GRAPH_IMPLEMENTATION 23/10). **Mức code (Module/Type/Method) chưa tồn tại** — `ElementType` không có METHOD |
| A5 | Vocabulary cạnh (EXPOSES/HANDLED_BY/CALLS/WRITES/PUBLISHES/CONSUMES…) | [M] | **ĐÃ ĐỒNG BỘ ENUM / UC-01 MỞ (M2, 24/10)** | Java enums (`ElementType.MESSAGE_CHANNEL`, `RelationType.MESSAGE_PUBLISH/SUBSCRIBE`, `OriginLayer.CONFIG`) đã khớp DB CHECK V13. UC-01 (chiều subscribe) giữ nguyên hợp đồng backend (`channel -> consumer`) chờ kiến trúc sư chốt |
| A6 | Aggregation giữ ID cạnh gốc + quy tắc tổng hợp + số bằng chứng | [N] | **ĐÃ CÓ (M2, 24/10)** | `underlyingEdgeIds` giữ nguyên; FE `graph-projection.ts` tổng hợp distinct union `evidenceIds` qua Set (tránh đếm trùng bằng chứng chung); `evidenceCount = distinctIds.length`; khi có cạnh gốc chưa rõ bằng chứng thì gán `null` (không default 0); API query luôn dùng canonical ID của cạnh nguồn |
| A7 | Không ghi đè dữ kiện static bằng runtime; giữ unresolved thay vì ép match | [N] | **MỘT PHẦN / CHƯA XÁC MINH** | `resolveElement` ưu tiên UUID `modelServiceId` trước tên (`RunnerReceiptIngestServiceImpl:604-618`); việc copy static Evidence sang bản RUNTIME_ENRICHED **chưa xác minh** trong lượt này |
| A8 | View metadata: scope, cờ truncated, phần ẩn được thông báo | [N] | **ĐÃ CÓ (M2, 24/10)** | Thống kê phân biệt rõ ràng 5 giai đoạn: source model totals, displayed elements/edges, filtered by origin, internal collapsed relationships; search highlighting `{matched}/{total}`; grid layout fallback kích hoạt khi >300 elements active (force simulation bypassed cho hiệu năng canvas) |
| A9 | Legend node-kind/edge-kind; màu không phải kênh phân biệt duy nhất | [N/M] | **ĐÃ CÓ (M2, 24/10)** | `GraphLegend` và canvas `DependencyNetwork` mở rộng với đa kênh thị giác: text badges monospaced (`[SVC]`, `[COMP]`, `[DB]`, `[QUEUE]`, `[EXT]`), kiểu nét (solid, dashed, dotted), cùng text badge phân loại origin/status |
| A10 | Bấm node/cạnh thấy provenance + vị trí nguồn | [N] | **ĐÃ CÓ** | `elementEvidence`/`relationshipEvidence` cho cả hai (`selection-three-e.tsx:69-75`), hỗ trợ xem group distinct count và drill-down cạnh con |
| A11 | Tập mẫu gán nhãn đo precision/recall theo loại quan hệ | [N] | **MỘT PHẦN (M2, 24/10)** | Đã bổ sung 2 pipeline test đầu-cuối với output tuần tự hóa thực tế: `output/m2/source-pipeline-java-actual.json` (Java Docker/Spring/Repository -> Graph/C4 Draw.io XML) và `output/m2/source-pipeline-csharp-actual.json` (C# Roslyn HttpClient -> ServiceManifest). Bộ benchmark ground truth diện rộng toàn repo vẫn cần phát triển thêm ở các milestone tiếp theo |

### B. C4 (C1/C2/C3)

| # | Yêu cầu | Loại | Hiện trạng | Bằng chứng |
|---|---|---|---|---|
| B1 | C1: hệ thống hộp đen, chỉ person/system tương tác trực tiếp | [N] | **MỘT PHẦN** | `overview` (SYSTEM) chỉ khi >3 apps; `EXTERNAL_SYSTEM` là elementType có thật; chưa có view C1 đúng chuẩn với boundary + external nhất quán |
| B2 | C2: nhãn cạnh = hành động **+ [công nghệ/giao thức] khi có bằng chứng**; phân biệt sync vs publish/consume | [N] | **ĐÃ CÓ (M2, 24/10)** | C4 Container đã bổ sung `containerDatabaseLabel` và `containerMessagingLabel`: nhãn database/messaging mang `[protocol]` khi có bằng chứng nguồn (PostgreSQL, MongoDB, Kafka...). Tuyệt đối không tự bịa JDBC/Kafka khi chưa rõ. Gated by view: C4 Context lược bỏ protocol theo chuẩn C4 |
| B3 | C2 không mở controller/service/repository | [N] | **ĐÃ CÓ** | View `containers` scoped theo application roots |
| B4 | C3: một container được chọn, component trong boundary thật | [N] | **ĐÃ CÓ** | `components:${container.id}` trong `view-planner.ts` (mục P1 của quality plan đã xong ở FE planner) |
| B5 | Ô: Tên → [type · technology] → trách nhiệm có nguồn; thiếu thì ghi "Chưa xác định từ source" | [M] | **MỘT PHẦN** | `nodeText` (rules.ts:134-177) có name + `[kind · tech]` + description khi có; **chưa có dòng "Chưa xác định"**; kích thước cố định width 280 + height theo số dòng (`generate.ts:80`) — **chưa đo text trước layout** (vi phạm quality plan §4.2) |
| B6 | Boundary: C2 cần System Boundary frame; C3 nesting theo parent | [N] | **ĐÃ CÓ (S2d/M1, 24/10)** — đã xác minh browser round-trip & revision 6 trên backend (1 boundary, 17 containers con, title metadata) | C4 Container vẽ System Boundary có tên (systemName từ UI, fallback 'Analyzed system'); container nội bộ trong boundary (SERVICE_CONTAINER/MESSAGE_CHANNEL/DATABASE LOGICAL_DATASTORE), external/unresolved ngoài boundary + scopeWarning; ELK grouping thật; round-trip qua draw.io bảo toàn phân cấp và metadata; drag/undo/redo trên editor vẫn NEEDS MANUAL VERIFICATION |
| B7 | Palette theo vai trò; uncertain là badge, không chỉ màu | [M] | **ĐÃ CÓ (một phần)** | Themes clean/dark/blueprint; `GraphLegend` badge uncertain |

### C. UML chuẩn: Class / Sequence / Package / Deployment / Activity / State

| # | Yêu cầu | Loại | Hiện trạng | Bằng chứng / khoảng cách |
|---|---|---|---|---|
| C1 | Class: association/dependency/generalization/realization/aggregation/composition, multiplicity, visibility | [N] | **THIẾU (toàn bộ)** | Không có projection; model chưa có dữ kiện multiplicity/visibility; Logical view là custom không multiplicity (giữ đúng nguyên tắc "không tự bịa" — đây là **khoảng cách scope cần quyết định**, không phải bug) |
| C2 | Sequence: sync/async/reply, fragments, thứ tự theo ràng buộc sự kiện; cấm layout graph chung cho timeline | [N] | **MỘT PHẦN** | `SequenceStepDTO` có stepOrder/method/status/duration/trace/span; **không có phân loại sync/async** (không field), không fragments; projection chuẩn ký pháp chưa có; Designed Scenarios (4+1) có riêng — đúng tách designed vs observed |
| C3 | Package: «import»/«access»/«merge», ownership ≠ dependency | [N] | **THIẾU** | Development view custom; không có projection chuẩn |
| C4 | Deployment: node/executionEnvironment/artifact «manifest», phân biệt với C4 container | [N] | **MỘT PHẦN** | View `deployment` từ DECLARED_COMPOSE/DEPLOYMENT edges; chưa phân biệt node/artifact/executionEnvironment |
| C5 | Activity: swimlane theo service, fork/join, decision/merge, hai loại final | [N] | **THIẾU** | Không view, không extractor evidence cho token flow |
| C6 | State: `trigger [guard] / effect`, composite | [N] | **THIẾU** | Không view, không extractor evidence |

> Ghi chú chung mục C: `DiagramNotation` enum (Java) có UML_SEQUENCE nhưng chỉ dùng làm nhãn; **không có engine nào tự bảo đảm mô hình đúng với source** — đúng cảnh báo của Tool repo.docx.

### D. Runtime evidence

| # | Yêu cầu | Loại | Hiện trạng | Bằng chứng |
|---|---|---|---|---|
| D1 | Trace = observation có window; thiếu span ≠ cạnh không tồn tại; status tách bạch | [N] | **ĐÃ CÓ** | 6 trạng thái độc lập execution/scenario/evidence/cleanup/traceQuality/mapping (`runtimeView`, `java-operations.ts:81`) |
| D2 | Ưu tiên UUID `modelServiceId`, không match tên | [N] | **ĐÃ CÓ** | `RunnerReceiptIngestServiceImpl.resolveElement:604-618` (UUID trước, fallback tên có kiểm soát) |
| D3 | Publication Gate trước khi promote isLatestValid | [N] | **ĐÃ CÓ** + 1 **cảnh báo policy** | `canPromoteLatest:269-277` (7 điều kiện); ⚠️ flag `mavis.runner.allow-unverified-poc-promotion` **default TRUE** — bypass kiểm tra image correspondence; cần chốt tắt trước acceptance |
| D4 | receiptDigest + pessimistic lock + 409 conflicting replay | [N] | **ĐÃ CÓ** | `CanonicalReceiptDigestUtils.computeDigest:130`, `findLockedById` PESSIMISTIC_WRITE, `findByIdForUpdate` trên Project |
| D5 | External root parent span (scenario-injected traceparent) được công nhận | [N] | **CHƯA XÁC MINH** | Contract round-2 yêu cầu; chưa kiểm chứng code xử lý MISSING_PARENT_SPAN trên main |
| D6 | 3E gắn mọi participant; designed ≠ observed | [M] | **ĐÃ CÓ** | `selection-three-e.tsx`; impl doc 23/10 |

### E. Công cụ tái sử dụng (theo `Tool repo.docx`)

| # | Đề xuất | Loại | Hiện trạng khớp |
|---|---|---|---|
| E1 | Giữ draw.io embed + PlantUML/Mermaid + ELK | [T] | **Khớp hiện trạng** — `elkjs 0.11.0`, `mermaid 12.2.0`, `@plantuml/core 1.2026.9`; draw.io embed + V12 documents; **không có cytoscape/g6/x6** (graph explorer custom SVG) |
| E2 | Graph viewer: PoC Cytoscape+fCoSE đối chứng G6 *sau adapter* | [T] | Khoảng cách đúng chỗ áp dụng: `graph-layout.ts` force tự viết, **chỉ chạy ≤300 node**, trên chỉ còn lưới khởi tạo |
| E3 | Structurizr/C4-PlantUML/Apollon chỉ PoC sau fixture | [T] | Chưa PoC; Java đã có `generateC4PlantUml` trong `DiagramExportServiceImpl` (chưa xác minh chất lượng output) |
| E4 | Gate: fixture trước, "render thành công ≠ mô hình đúng" | [T] | Chưa có bộ fixture nào (trùng A11) |

---

## 2. Khoảng cách theo tầng

| Tầng | Đánh giá | Khoảng cách chính & tác động |
|---|---|---|
| **L1. Thu thập & suy luận evidence** | 🟡 Một phần | Deterministic resolution đã xong; **còn unresolved cases HTTP/config/messaging** (impl status 23/10); thiếu evidence mức method (Module/Type/Method), multiplicity/visibility/state-machine. Tác động: các view UML chuẩn không thể dựng đúng nếu không có dữ kiện — **không được tự bịa**. |
| **L2. Domain model/schema** | 🟡 Một phần | `resolutionStatus` sống trong JSONB không enum/CHECK; **Java enums lệch CHECK V13**; vocabulary hai chiều lệch (FE map USES_API/DATABASE_QUERY mà DB không cho phép); vocabulary Graph.docx chưa chốt; evidence không lộ trên graph API. Tác động: mọi view phía trên đứng trên nền dữ liệu chưa chốt ngữ nghĩa. |
| **L3. Projection theo loại diagram** | 🟡/🔴 | C4 container/component/messaging/deployment có; **C1 chưa chuẩn; UML Class/Package/Activity/State không có; Sequence một phần thiếu sync/async**; nhãn cạnh thiếu protocol; **vi phạm ngữ nghĩa MESSAGE_SUBSCRIBE**; thiếu System Boundary frame C2; description không có dòng "Chưa xác định". |
| **L4. Layout/render** | 🟡 | Chưa đo text trước layout (width 280 cố định, height theo dòng); geometry checks tốt (overlap/through/crossings) **+ readability gate đã có code** (minScreenFontPx ≥ 12) nhưng FTGO thực đo ~10px — chưa pass; graph force tự viết chỉ ≤300 node; edge label placement một phần. |
| **L5. Editor/lưu/tái sinh** | ✅ Mạnh nhất | draw.io embed + documents revision CAS (409 stale) + multi-page export + SVG; round-trip boundary và title-cell metadata đã kiểm chứng đạt (M1). Còn mở: thao tác kéo đỉnh & Undo/Redo trực tiếp trên editor vẫn NEEDS MANUAL VERIFICATION; chính sách giữ vị trí pin qua regenerate, merge policy khi model đổi nhỏ (quality plan P4). Không đánh dấu toàn bộ S2/C4/diagram hoàn thành. |
| **L6. Validation & kiểm thử** | 🔴 Thắng gap lớn nhất | **Không có bất kỳ check nào về tuân thủ ký pháp** (đã xác minh `diagram/`, `evaluation/` — chỉ projection/geometry/export; `DiagramNotation` chỉ là nhãn); không golden fixture; readability có code, chưa có gate CI; không tập mẫu precision/recall. **Render thành công hiện không được ai chứng minh là đúng chuẩn** — đúng điều cấm trong đề bài. |

## 3. Công cụ tại đúng khoảng cách

| Tầng | Giữ | Cải thiện bằng lib đang có | PoC công cụ mới | MAVISS tự làm |
|---|---|---|---|---|
| L1 | — | — | — | **Toàn bộ** (analyzer là lõi; không lib nào thay) |
| L2 | — | — | — | **Toàn bộ** (vocabulary/schema là quyết định dự án; migration additive V15+) |
| L3 | draw.io/PlantUML/Mermaid render paths | `generateC4PlantUml` đã có — đối chiếu output với fixture trước khi mở rộng | Structurizr validate/export (sau fixture) | Projection + nhãn + boundary + provenance |
| L4 | ELK (Web Worker), draw.io gen | Readability gate có sẵn — siết ngưỡng và đưa vào CI | **Cytoscape+fCoSE vs G6** đúng theo fixture Tool repo (50/300/1000/5000 node) | Đo text trước layout; profile layout per view |
| L5 | draw.io embed + documents V12 | — | Apollon **chỉ khi** cần editor UML riêng (hiện chưa cần — UML views chưa có) | Chính sách pin/merge khi regenerate |
| L6 | — | — | — | **Gần như toàn bộ**: fixture + rubric + golden test — không lib nào làm thay, và là điều kiện tiên quyết cho mọi PoC |

Nguyên tắc giữ nguyên: **không thay thư viện vì demo đẹp**; mọi PoC qua gate "giữ ID/evidence qua save-load, không mất quan hệ, ký hiệu đúng fixture".

## 4. Kế hoạch đề xuất theo lát cắt (chờ duyệt)

> Mỗi lát cắt: mục tiêu/phạm vi → thành phần ảnh hưởng → nghiệm thu → kiểm chứng → rollback. Thứ tự theo phụ thuộc; **không slice nào đụng contract Worker/Runner**.

**S1 — Fixture kiểm định + rubric (L6, thuần test, không đổi sản phẩm)**
- Trạng thái: **thu hẹp thành S1a và ĐÃ NGHIỆM THU ở mức baseline kiểm chứng (24/10) — tại thời điểm đó UC-01/UC-02 còn mở; UC-02 sau đó đã ĐÓNG ở projection frontend (S2c, 24/10); UC-01 vẫn mở**:	 fixture tổng hợp có answer key + 7 test `edge-semantics` trong `npm test`; kết quả, known issues và phân loại assertion xem [S1A_EDGE_SEMANTICS_REPORT_2026-10-24.md](S1A_EDGE_SEMANTICS_REPORT_2026-10-24.md). Phần rubric 9 diagram còn lại của S1 gốc vẫn mở, chờ duyệt.
- Mục tiêu: biến 9 checklist ký pháp + rubric 4 nhóm của Graph.docx thành **bộ kiểm máy chạy được**; xây baseline vi phạm thực tế.
- Phạm vi: fixture model JSON nhỏ (tổng hợp, có đáp án) + snapshot model FTGO hiện có; checker cho: loại quan hệ được phép theo view, hướng & nhãn MESSAGE_PUBLISH/SUBSCRIBE, C3 per-container, C2 label thiếu protocol, box content provenance, aggregation giữ underlyingEdgeIds, uncertain trung thực.
- Thành phần: `MAVIS-Frontend/tests/` (node --test) + fixture JSON; không đụng runtime.
- Nghiệm thu: checker chạy cho ra **báo cáo vi phạm có bằng chứng file:symbol**; mỗi rule map ngược về tài liệu nguồn.
- Kiểm chứng: `npm test` mở rộng; chạy trên FTGO + fixture tổng hợp.
- Rollback: test-only, không ảnh hưởng runtime — xóa file là xong.

**S2 — Sửa vi phạm projection phát hiện từ S1 (L3, thay đổi nhỏ có ràng buộc)**
- Trạng thái: **S2a (metadata graph API) đã được review — duyệt về implementation (24/10)**; **S2b (bảo toàn + hiển thị metadata trên FE) đã được review — duyệt về implementation (reviewer chạy lại FE 74/74 + typecheck; browser acceptance còn mở)**; **S2c (aggregate resolutionStatus) đã nghiệm thu (24/10; reviewer chạy lại FE 74/74 + typecheck)** — contract chốt: normalize thiếu/rỗng → UNKNOWN, nhóm cùng trạng thái giữ trạng thái, khác trạng thái → UNKNOWN (không thêm enum MIXED, không đụng cạnh nguồn/DB); **UC-02 ĐÃ ĐÓNG ở projection frontend; UC-01 vẫn mở**; **S2e (protocol có nguồn trên nhãn messaging C4 Container) đã nghiệm thu — code + visual (24/10)** — chi tiết [S2E…](S2E_MESSAGING_PROTOCOL_LABELS_REPORT_2026-10-24.md); **M1 (luồng C4 end-to-end trên Test1/model 8b5a2dbc rev4) ĐÃ CHẠY ĐỦ trên UI thật với session thật qua M1 Java :8082 và vòng 5 đã ĐÓNG changed-geometry persistence**: đăng nhập, Graph, 3E/evidence (node có/thiếu), C1 đã bỏ external caller suy luận (context tối thiểu + thông báo 9 entrypoints), C2 boundary "Test1" (17 members), C3×2 container đúng scope, Relayout → Save CAS rev 3→4 → reload persistence (18/18 node đổi vị trí, rev 1–3 cũ giữ nguyên), export payload khớp rev 4, đổi model reset — kéo node bằng chuột là hướng dẫn người dùng, không phải điểm chặn; bằng chứng tại output/m1/ — xem [M1_C4_E2E_REPORT_2026-10-24.md](M1_C4_E2E_REPORT_2026-10-24.md) **S2d (system scope + boundary C4 Container) implementation đã được duyệt (24/10)** và **visual acceptance đã PASS cho 3 case** qua draw.io embed protocol (synthetic, FTGO baseline, tên dài + 8 unresolved — screenshot + PNG export tại output/s2d-visual/); membership là policy projection MAVISS, không phải quy tắc C4 phổ quát. Chi tiết: [S2A…](S2A_GRAPH_METADATA_REPORT_2026-10-24.md), [S2B…](S2B_NODE_METADATA_DISPLAY_REPORT_2026-10-24.md), [S2C…](S2C_AGGREGATE_RESOLUTION_REPORT_2026-10-24.md). Phần còn lại của S2 (nhãn `[protocol]`, boundary frame, truncation…) vẫn mở — **không đánh dấu S2 hoàn tất**.
- Mục tiêu: sửa đúng các vi phạm có bằng chứng: nhãn/hướng MESSAGE_SUBSCRIBE ("Consumes from" thay "Delivers messages to"), thêm [protocol] vào nhãn cạnh **chỉ khi evidence có** (`"Database access [JDBC]"`), thêm dòng "Chưa xác định từ source" khi thiếu description, System Boundary frame cho container view, đếm evidence + truncation notice.
- Thành phần: `src/lib/drawio/rules.ts` (relationLabel), `generate.ts`, `view-planner.ts`, `GraphLegend`.
- Nghiệm thu: S1 checker pass trên fixture + FTGO không mất ID/quan hệ (counts đối chiếu trước/sau).
- Rollback: từng rule là hàm thuần; revert commit từng phần.

**S3 — Chốt vocabulary & lộ metadata (L2 — cần review nhóm trước khi làm)**
- Mục tiêu: đồng bộ enum Java ↔ CHECK V13; quyết định vocabulary Graph.docx (ánh xạ hoặc mở rộng RelationType); lộ evidence count/ids cấp aggregate; cân nhắc enum/CHECK cho resolutionStatus.
- Thành phần: `common/enums`, migration **V15+ additive**, `EdgeDTO`, `java-wire.ts`. Schema entity do Vũ phối hợp review theo phân công.
- Nghiệm thu: hai chiều Java↔DB↔FE cùng một bảng vocabulary; test contract cập nhật.
- Rollback: migration additive; FE fallback đọc chuỗi cũ.

**S4 — Layout/readability (L4)**
- Mục tiêu: đo text thật trước layout (bỏ width 280 cố định), ELK profile per view, đưa readability gate vào CI; PoC graph viewer theo fixture Tool repo.
- Nghiệm thu: FTGO ≥12px screen font; không tăng crossing trên fixture; PoC có số đo median/slowest ≥5 lần.
- Rollback: profile per view là config; adapter viewer đằng sau interface `graph-projection` đã có.

**S5 — UML views theo chuẩn (L3 — quyết định scope với nhóm)**
- Mục tiêu: chọn danh mục UML triển khai thực sự (Sequence từ runtime+designed là gần dữ kiện nhất — cần thêm field sync/async vào `SequenceStepDTO`; Deployment tách node/artifact; Package/Class/Activity/State **chỉ khi** L1 có evidence, không tự bịa).
- Nghiệm thu: mỗi view pass S1 fixture loại đó; đó mới được gắn nhãn chuẩn UML; view không đạt ghi rõ "custom view, không phải UML chuẩn".

**S6 — Editor regen pinning/merge (L5)**
- Mục tiêu: giữ vị trí pin + policy merge khi regenerate từ model đổi nhỏ.
- Nghiệm thu: fixture "mở → kéo → save → load → regenerate" của Tool repo pass.

## 5. Lát cắt triển khai đầu tiên: **S1 — Fixture kiểm định + rubric**

Lý do gắn với khoảng cách đã tìm được:

1. **L6 là khoảng cách lớn nhất và đứng trước mọi slice khác**: đã xác minh không tồn tại bất kỳ check tuân thủ ký pháp nào (`diagram/`, `evaluation/` chỉ projection/geometry; `DiagramNotation` chỉ là nhãn). Không có thước đo thì S2–S6 không có tiêu chí nghiệm thu khách quan — sẽ rơi lại vào "render được là đúng", điều đề bài và Tool repo đều cấm.
2. **S1 phát hiện vi phạm thật ngay trước khi sửa**: đối chiếu tay đã thấy ít nhất 2 vi phạm (nhãn MESSAGE_SUBSCRIBE sai hướng ngữ nghĩa; nhãn cạnh thiếu [protocol]) và 2 drift schema (Java enum lệch V13; FE map USES_API/DATABASE_QUERY ngoài CHECK). S1 tự động hóa việc này trên toàn bộ view/model thay vì soi thủ công.
3. **Là điều kiện tiên quyết của Tool repo.docx**: mọi PoC công cụ (E2/E3) đều qua gate fixture — chưa có fixture thì không được chọn/thay lib nào.
4. **Graph.docx yêu cầu tập mẫu gán nhãn** (A11) để đo precision/recall — hiện thiếu hoàn toàn; S1 tạo nền móng đó.
5. **Zero rủi ro migration**: thuần test/fixture, không đụng code sản phẩm — đúng ràng buộc "chưa triển khai thay đổi sản phẩm" của giai đoạn review này.

## 6. Điều chưa đủ bằng chứng (không tự lấp)

- Copy static Evidence sang bản RUNTIME_ENRICHED (A7) — chưa kiểm chứng.
- Xử lý external root parent span trên main (D5) — chưa kiểm chứng.
- Chất lượng output `generateC4PlantUml` (E3) — chưa xem output thật.
- Cờ truncation của view FE (A8) — chưa tìm thấy nhưng chưa phủ định triệt để.
- Danh mục 53 công cụ trong `Tool repo.docx` có hồ sơ `catalog.json`/`sources/` **chưa được giao kèm** trong `.doc_review` — các nhận định E chỉ dựa trên văn bản tài liệu.

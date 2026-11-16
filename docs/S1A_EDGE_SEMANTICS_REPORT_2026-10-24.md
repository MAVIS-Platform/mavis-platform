# S1a — Bộ kiểm chứng ngữ nghĩa cạnh & aggregation Graph/C4 hiện có

Ngày: 24/10/2026. Trạng thái hiện tại: **đã nghiệm thu baseline kiểm chứng — UC-02 ĐÃ ĐÓNG ở projection frontend (S2c, 24/10); UC-01 vẫn mở**. (Nội dung dưới đây giữ nguyên lịch sử các lượt S1a; các mục R4b/known issues đã được cập nhật kèm trạng thái.) Lần 1: fixture + 6 test; lần 2: bổ sung theo review (golden labels, originLayer, UC-02, wire npm test); lần 3 (đi kèm S2a): UC-02 test đổi thành characterization/baseline + sửa link README. Phạm vi: chỉ fixture + test cho ngữ nghĩa cạnh và aggregation; không framework 9 diagram, không dependency, không sửa schema/API/renderer.

---

## 1. Kết quả xác minh contract (trước khi viết assertion)

### 1.1 MESSAGE_PUBLISH / MESSAGE_SUBSCRIBE: from/to thực tế là gì?

**Nguồn xác minh: `mavis-analyzer/.../graph/service/impl/GraphBuilderServiceImpl.java:404-414`** — nơi duy nhất tạo hai quan hệ này (từ evidence của `BeanMessagingVisitor`):

```java
boolean publish = "MESSAGE_PUBLISH".equals(ev.getElementType());
ModelElement from = publish ? endpoint : channel, to = publish ? channel : endpoint;
```

- `MESSAGE_PUBLISH`: **producer (component/container) → MESSAGE_CHANNEL**
- `MESSAGE_SUBSCRIBE`: **MESSAGE_CHANNEL → consumer (component/container)**
- Cả hai: `originLayer = "STATIC"`, `direction = "DIRECTED"`; channel element là `MESSAGE_CHANNEL` với `properties` chứa `channelName`, **`protocol` (= evidence `endpointAlias`)**, `logicalKey`, `transportAuthority` (compose binding); channel `status = UNCERTAIN_MAPPING` + `resolutionIssue = "UNRESOLVED_MESSAGE_TRANSPORT"` khi chưa phân giải transport (dòng 319-326).
- **Không suy từ tên enum** — chiều được đọc trực tiếp từ code gán `from/to`.

### 1.2 Protocol/technology lấy từ đâu?

- **Nguồn dữ kiện**: evidence `endpointAlias` → lưu tại `MESSAGE_CHANNEL.properties.protocol` + `languageStack` (GBSI:322, 325); `transportAuthority` từ compose binding (GBSI:315, 321).
- **Đường đi ra người dùng**: `NodeDTO` (`graph/dto/NodeDTO.java:14-19`) chỉ có `{id, name, type, sourcePath}` — **không expose `properties`** → protocol **mất tại ranh giới graph API**. Đường model-detail (`GET /analyzer/models/{id}/elements` → `modelView`) truyền `technology = languageStack = endpointAlias` nên protocol chỉ l surfaced ở view model/drawio, không ở graph explorer.
- FE không có trường protocol thật: `edgeSchema.protocol` (`domain.ts:74`) mang **giá trị relation kind** (java-wire `protocol: e.kind` — naming drift, ghi nhận mục 3.3); nhãn cạnh chỉ intent (`rules.ts relationLabel`, gọi tại `generate.ts:107` không ghép thêm gì).

### 1.3 underlyingEdgeIds và uncertain tổng hợp thế nào?

`src/features/architecture/graph-projection.ts:34-61` (`projectGraphModel`): group key = `JSON.stringify([from, to, protocol(=kind), originLayer])`; nhóm gộp tích lũy `underlyingEdgeIds.push(edge.id)` và `uncertain ||= edge.uncertain` (OR); trả thêm `filteredRelationships` (lọc theo origin) và `internalRelationships` (cạnh nội bộ khi collapse parent). Gộp **không trộn originLayer** (key có originLayer) — cạnh STATIC và RUNTIME cùng cặp vẫn tách, không ghi đè lẫn.

### 1.4 Java enum / DB CHECK / FE mapping lệch ở đâu?

| Tầng | Giá trị | Ghi chú |
|---|---|---|
| DB CHECK (V13, nguồn sự thật) | relation_type: SERVICE_HTTP_CALL, CODE_DEPENDENCY, DATABASE_ACCESS, RUNTIME_OBSERVED, DECLARED_COMPOSE, **MESSAGE_PUBLISH, MESSAGE_SUBSCRIBE**; element_type: +**MESSAGE_CHANNEL**; origin_layer: +**CONFIG** | `V13__Messaging_Architecture_Facts.sql:2-10` |
| Java enum `RelationType` | 5 giá trị, **thiếu MESSAGE_PUBLISH/SUBSCRIBE**; `OriginLayer` thiếu CONFIG | **Drift tham chiếu thôi** — entity field là `String` (`ModelRelationship.java:39,43,47`) nên không crash runtime |
| FE `relationLabel` | Đủ 7 giá trị CHECK + **thừa `USES_API`, `DATABASE_QUERY`** (không nằm trong CHECK) | `rules.ts:136-142` |
| FE `edge.protocol` | Mang relation kind, không phải giao thức | `domain.ts:74`, `java-wire.ts:263` |

## 2. Mâu thuẫn chưa giải được — ghi nhận, không chọn phía (UC-01)

- **Quy ước docs** (`Graph.docx` v1 24/10): `CONSUMES: Service/Method → Topic` — *"consumer trỏ tới topic, không phải mũi tên biểu diễn chiều chuyển message"*.
- **Contract implementation hiện hành**: `channel → consumer`, và nhãn FE "Delivers messages to" **nhất quán nội bộ** với chiều dòng message đó.
- **Kết luận**: hai hệ quy chiếu đều tự nhất quán; không có authority trong repo tuyên bố phía nào đúng cho code hiện hành. → xếp loại **CHƯA GIẢI QUYẾT, cần nhóm chốt**, không đưa vào assertion pass/fail. Fixture mã hóa contract implementation (đã xác minh) và ghi rõ mâu thuẫn trong `unresolvedContradictions[UC-01]`.
- **Đính chính báo cáo trước**: mục B2 của `DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md` đã gọi nhãn SUBSCRIBE là "vi phạm ngữ nghĩa" khi mới đối chiếu với Graph.docx — đã sửa thành ghi nhận mâu thuẫn hai chiều sau khi xác minh contract.

## 3. Fixture và test đã tạo

### 3.1 `tests/fixtures/edge-semantics-contract.json` (mới)

Fixture **tổng hợp, có đáp án độc lập** — đáp án suy từ contract đã xác minh (mục 1) + quy tắc Graph.docx, **không** từ hành vi code FE. Nội dung đúng theo phạm vi cho phép:

- Producer `orders-api`, consumer `billing-api`, channel `order-events [kafka]` (properties.protocol = "kafka" có nguồn), datastore `orders-db`.
- `e-pub-1`: producer → channel (publish, resolved) — theo contract 1.1.
- `e-sub-1`: channel → consumer (subscribe, resolved) — theo contract 1.1.
- `e-db-1`: consumer → db (DATABASE_ACCESS, **UNRESOLVED/uncertain**, không có dữ kiện protocol nào).
- `e-code-1` + `e-code-2`: hai cạnh CODE_DEPENDENCY cùng cặp cùng originLayer STATIC (một resolved, một unresolved) → **phải gộp**, truy ngược đủ 2 ID gốc, uncertain OR = true.
- `e-code-3`: CODE_DEPENDENCY **cùng cặp nhưng khác originLayer (STATIC_AND_RUNTIME)** → **không được gộp** với nhóm STATIC.
- `e-comp-1` (DECLARED_COMPOSE/DEPLOYMENT) và `e-rt-1` (RUNTIME_OBSERVED/RUNTIME) để kiểm origin filter.
- `answerKey` + `contractBasis` (trích dẫn file:dòng) + `unresolvedContradictions` (**UC-01** chiều subscribe; **UC-02** aggregate resolutionStatus) nhúng trong fixture.
- `labelExpectations` là **golden data đóng băng** (ghi ngày 24/10 sau review contract): expected nhãn cụ thể cho 6 loại tường minh + RUNTIME_OBSERVED fallback + fallback rỗng/không rõ; test so chuỗi chính xác, **không đọc bảng mapping production lúc chạy**.
- Header ghi rõ: **không phải ground truth đo precision/recall của analyzer**.

### 3.2 `tests/edge-semantics.test.cjs` (mới — cập nhật vòng 2)

7 test trên runner hiện hữu (`node --test`), tái dùng đúng pattern TS-require-hook của `java-contract.test.cjs`; **đã wire vào `npm test`** (thay đổi 1 dòng package.json — được phép trong vòng bổ sung):

1. Fixture mã hóa đúng contract implementation đã đọc thủ công (self-check fixture — **không phải** regression test của Java).
2. Aggregation: nhóm STATIC gộp 2 cạnh giữ đủ `underlyingEdgeIds`; **nhóm STATIC_AND_RUNTIME cùng cặp/kind giữ riêng**; 6 cạnh còn lại giữ riêng.
3. **KNOWN ISSUE UC-02 (characterization/baseline)**: đảo thứ tự 2 cạnh resolved/unresolved — `underlyingEdgeIds` và `uncertain` **bất biến theo thứ tự** (kiểm chứng); `resolutionStatus` cấp nhóm **phụ thuộc thứ tự** (expected/actual ghi rõ trong test). Test chạy xanh ghi nhận hành vi hiện hành, không chứng minh aggregate status đúng; cập nhật khi contract chốt.
4. Uncertain không bị mất/không tự resolved trên từng cạnh giữ nguyên.
5. Origin filter: view "source" loại 2 cạnh deployment/runtime với `filteredRelationships = 2`; "all" = 0; "deployment" chứa e-comp-1.
6. Nhãn: so khớp **golden answer key bằng chuỗi chính xác**; phân biệt tường minh (6 loại) vs fallback (RUNTIME_OBSERVED, type rỗng, type lạ); không dùng assertion cấm ký tự `"["` trước đây — so khớp chính xác đã bao phủ "không tự thêm thông tin không có nguồn" trong phạm vi hàm đang kiểm.
7. FTGO đối chứng (mục 5).

## 4. Kết quả đánh giá production hiện tại (expected / actual / nguồn quy tắc)

> **Phân biệt mức bằng chứng**: (a) *đọc thủ công mã Java* — nguồn xác định contract, không chạy được trong test; (b) *test chạy production FE* — xác nhận hành vi projection/labels thật; (c) *fixture self-check* — xác nhận fixture mã hóa đúng contract đã đọc, **không phải** regression test của GraphBuilderServiceImpl.

| # | Quy tắc kiểm chứng | Nguồn quy tắc | Expected | Actual (quan sát được) | Kết luận |
|---|---|---|---|---|---|
| R1 | Nhãn & chiều cạnh không mâu thuẫn **contract hiện hành** | (a) GraphBuilderServiceImpl:408-409 — đọc thủ công; (b) test production FE trên `relationLabel` + fixture | publish: producer→channel; subscribe: channel→consumer; nhãn khớp golden answer key | Đúng như expected; test 1 (fixture self-check) + test 6 (production labels) xanh | **PASS** — phần chiều: bằng chứng đọc thủ công Java; phần nhãn: bằng chứng chạy test production |
| UC-01 | Chiều subscribe theo quy ước docs (consumer→topic) | Graph.docx §vocabulary | consumer→topic | channel→consumer (nhất quán nội bộ) | **CHƯA GIẢI QUYẾT** — mâu thuẫn docs↔implementation, cần nhóm chốt; không tự chọn phía |
| R2 | Protocol **có nguồn** được giữ tới nơi tiêu thụ; thiếu dữ kiện không bịa | Quality plan §4.4 "Technology chỉ ghi khi có bằng chứng"; Tool repo pipeline "model giữ nguồn bằng chứng" | `properties.protocol` (từ evidence endpointAlias) truy được từ graph API/labels | **Trong graph API đã kiểm tra**: NodeDTO không expose properties → protocol không có ở đường này; nhãn cạnh không có slot protocol; FE `edge.protocol` mang kind | **FAIL — có bằng chứng, giới hạn trong đường graph API đã kiểm tra** (mục 8 đề xuất sửa đúng đường này; chưa khảo sát các đường khác, không tuyên bố là điểm tắc của toàn hệ thống) |
| R3 | Aggregation truy ngược đủ ID gốc | Graph.docx §"Quan hệ tổng hợp phải giữ danh sách ID gốc" | underlyingEdgeIds đủ 2 ID, bất kể thứ tự đầu vào | Đúng cả hai thứ tự; test 2 + 3 xanh | **PASS** |
| R4a | Trạng thái uncertain OR-accumulate, không mất, không tự resolved | Graph.docx §"giữ unresolved/ambiguous thay vì ép match" | nhóm chứa UNRESOLVED phải uncertain=true bất kể thứ tự | Đúng; test 2 + 3 xanh | **PASS — có kiểm chứng** |
| R4b | `resolutionStatus` cấp aggregate có ngữ nghĩa xác định | Graph.docx (chưa định nghĩa aggregate resolutionStatus) | nhóm chứa cạnh UNRESOLVED phải thể hiện điều đó bất kể thứ tự | **actual tại thời điểm S1a**: nhóm giữ `resolutionStatus` của cạnh **đầu tiên** trong nhóm (`{...edge}` spread, graph-projection.ts:60) — cùng một nhóm báo RESOLVED hay UNRESOLVED tùy thứ tự mảng (expected vs actual ghi trong test 3) | **UC-02 — ĐÃ GIẢI QUYẾT Ở PROJECTION bởi S2c (24/10)**: contract aggregate chốt và `projectGraphModel` đã sửa; characterization test cũ được thay bằng assertion contract mới (xem S2C report) |
| R5 | Nhãn phủ đủ quan hệ hợp lệ, không tự thêm thông tin ngoài nguồn | Quality plan §4.4 "relation enum được dịch có kiểm soát" | golden answer key: 6/7 CHECK types có nhãn tường minh; **RUNTIME_OBSERVED không có entry tường minh → fallback "RUNTIME OBSERVED"**; so khớp chuỗi chính xác | Đúng như golden; test 6 xanh | **PASS** — kèm phát hiện: RUNTIME_OBSERVED chỉ có fallback |
| — | Drift tham chiếu | — | — | Java enum thiếu 2 giá trị V13 (entity String, không crash); FE map thừa USES_API/DATABASE_QUERY ngoài CHECK; `edge.protocol`=kind | **Ghi nhận**, chưa xếp FAIL (không ảnh hưởng hành vi runtime) |

**Phân loại assertion cho hai kết quả không PASS** (đính chính câu trước đây còn mâu thuẫn):

- **R2 (FAIL)**: không có bất kỳ assertion xanh nào chấp nhận hành vi thiếu protocol — không có test nào khẳng định "không có protocol là đúng"; FAIL được kết luận trong báo cáo này kèm bằng chứng file:dòng, chờ S2a sửa.
- **UC-02 (known issue)**: được ghi nhận bằng một **characterization test chạy xanh** (test "UC-02 characterization (baseline)"). Test này là bản ghi hành vi hiện hành để hữu hình và chống thay đổi âm thầm; **nó không chứng minh aggregate status đúng** và không được dùng làm tiêu chí nghiệm thu ngữ nghĩa. Khi nhóm chốt contract aggregate resolutionStatus và production được sửa, test này phải được cập nhật theo contract mới (và sẽ đỏ nếu hành vi đổi mà contract chưa phản ánh). Không dùng skip.

## 5. FTGO đối chứng bổ sung

Dùng `tests/fixtures/ftgo-component.json` **đã có sẵn**, nhận diện được nguồn: `modelVersionId 4a31c2e7-1d60-46b1-8a45-f5cea1df57b1`, `sourceSnapshotId 67b338bf-db51-4d21-ac35-283bbec29df2`, `modelRevision 1`, `createdAt 2026-10-22T17:02:31Z` — đúng model baseline mà DIAGRAM_GRAPH_PRODUCT_PLAN đã chẩn đoán. Kết quả: 53/53 cạnh map nhãn thành công; phân bố 33 DECLARED_COMPOSE / 10 DATABASE_ACCESS / 10 CODE_DEPENDENCY khớp chẩn đoán; **không có cạnh MESSAGE_*** trong baseline → **messaging direction không đối chứng được trên FTGO** (đã assert để ghi rõ giới hạn). Không chạy lại pipeline/runtime.

## 6. File đã thay đổi (không có file sản phẩm)

| File | Loại |
|---|---|
| `MAVIS-Frontend/tests/fixtures/edge-semantics-contract.json` | Mới — fixture tổng hợp + answer key golden + UC-01/UC-02 |
| `MAVIS-Frontend/tests/edge-semantics.test.cjs` | Mới — 7 test |
| `MAVIS-Frontend/package.json` | Sửa 1 dòng — wire test mới vào `npm test` (được phép theo review) |
| `docs/S1A_EDGE_SEMANTICS_REPORT_2026-10-24.md` | Mới — báo cáo này (cập nhật vòng 2) |
| `docs/DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md` | Sửa mục B2 (đính chính UC-01) + ghi nhận S1a |

Chưa commit — chờ nghiệm thu. Không đụng schema/migration/API/Worker/Runner/renderer; không dependency; không đổi test runner.

## 7. Lệnh kiểm tra và kết quả thực tế

```
cd MAVIS-Frontend
npm test          # 71/71 pass = 64 hiện hữu + 7 edge-semantics (cả hai bộ chạy chung một lệnh)
```

Chi tiết bộ mới: `node --test tests/edge-semantics.test.cjs` → 7/7 pass (~0,3s). `npm test` giờ chạy cả 3 file test; kết quả xác nhận ở mục "Nghiệm thu" cuối báo cáo.

## 8. Đề xuất ĐÚNG MỘT sửa đổi production nhỏ nhất tiếp theo

**Exposing protocol có nguồn trên graph API — sửa đúng FAIL R2 đã chứng minh:**

- **Thay đổi**: thêm 2-3 trường vào `NodeDTO` (`graph/dto/NodeDTO.java`) — `protocol`, `transportAuthority`, `resolutionIssue` (nullable) — và mapping tương ứng tại nơi build NodeDTO trong `GraphServiceImpl` (đọc từ `element.properties`). Không đổi schema/migration, không đổi FE contract bắt buộc (FE cũ bỏ qua trường mới — additive).
- **Vì sao đề xuất**: dữ kiện protocol **đã tồn tại** trong DB (`GraphBuilderServiceImpl:322`) nhưng **bị mất tại đường graph API đã kiểm tra** (bằng chứng R2). Đây là điểm tắc **đã kiểm chứng trong đường này**; chưa khảo sát các đường tiêu thụ khác — đề xuất chỉ dựa trên bằng chứng đã có.
- **Điều kiện nghiệm thu** (khi được duyệt): theo review — cần **test mapping/serialization production thật** (gọi API/model thật hoặc integration test), **không chỉ** thêm field vào fixture JSON rồi kiểm tra fixture.
- **Rủi ro & rollback**: additive DTO, rollback = revert 1 commit; không đụng contract Worker/Runner.

Không đề xuất sửa chiều SUBSCRIBE hay aggregate resolutionStatus trong đợt này — UC-01/UC-02 là quyết định chuẩn mực của nhóm (docs ↔ implementation; ngữ nghĩa aggregate chưa chốt), không phải bug một phía đã chứng minh.

## 9. Known issues còn mở

| ID | Nội dung | Trạng thái |
|---|---|---|
| UC-01 | Chiều MESSAGE_SUBSCRIBE: Graph.docx (consumer→topic) ↔ implementation (channel→consumer) | Cần nhóm chốt; fixture mã hóa contract hiện hành |
| UC-02 | `resolutionStatus` cấp aggregate order-dependent; contract aggregate chưa định nghĩa | **ĐÃ GIẢI QUYẾT Ở PROJECTION (S2c, 24/10)**: contract chốt (normalize thiếu/rỗng → UNKNOWN; cùng trạng thái giữ; khác trạng thái → UNKNOWN) và `projectGraphModel` đã sửa với assertion contract; phạm vi chỉ projection frontend, không đóng UC-01 — xem S2C report |
| R2 | Protocol có nguồn không ra khỏi graph API (NodeDTO không expose properties) | FAIL đã chứng minh trong đường đã kiểm tra; đề xuất sửa mục 8 chờ duyệt |
| Drift | Java enum thiếu MESSAGE_PUBLISH/SUBSCRIBE + CONFIG; FE map thừa USES_API/DATABASE_QUERY; `edge.protocol` mang kind | Ghi nhận; xếp vào lát cắt S3 (vocabulary) khi được duyệt |

## 10. Dừng tại đây

S1a vòng bổ sung hoàn thành theo đúng review. Chờ nghiệm thu trước khi làm bất cứ thay đổi sản phẩm nào. Hướng dự kiến sau nghiệm thu: bổ sung metadata graph API (mục 8) với test mapping/serialization production thật.

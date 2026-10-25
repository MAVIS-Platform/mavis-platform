# S2a — Graph API bảo toàn metadata từ ModelElement.properties

Ngày: 24/10/2026. Trạng thái: **đã được review và duyệt về implementation (24/10)** — UC-01/UC-02 vẫn mở. Lưu ý minh bạch: các kết quả bên dưới là **do người triển khai chạy**; danh sách kiểm tra reviewer tự chạy lại không được ghi lại trong phiên này. Tiền đề: S1a đã nghiệm thu mức baseline kiểm chứng. Phạm vi sản phẩm: `NodeDTO`, mapping trong `GraphServiceImpl.getGraphDataBySessionId`, test Java, tài liệu liên quan. **Không** sửa chiều SUBSCRIBE/vocabulary/aggregate status, renderer/layout/editor, schema/migration; **không** hiển thị protocol trên FE trong task này (hiển thị FE thuộc S2b).

---

## 1. Contract đã triển khai (additive)

`NodeDTO` thêm 3 trường `String` nullable: `protocol`, `transportAuthority`, `resolutionIssue`.

Mapping tại `GraphServiceImpl.getGraphDataBySessionId` qua helper mới `extractTextProperty(el, key)`:

| Đầu vào (element.properties.key) | Đầu ra |
|---|---|
| JSON string không rỗng | giữ nguyên giá trị |
| Key thiếu / JSON null / chuỗi rỗng hoặc chỉ khoảng trắng | `null` |
| Number / boolean / object / array | `null` — không ép thành chuỗi |
| `properties == null` (toàn node thường) | `null` |

- **Không suy luận** từ `name`, `languageStack`, relation kind hay tên service; **không có default** (kafka/JDBC/RESOLVED…); **không trả nguyên properties JSON**.
- `resolutionIssue` là **metadata của node** (vd `UNRESOLVED_MESSAGE_TRANSPORT` từ nhánh unresolved của `GraphBuilderServiceImpl:322-325`) — không liên quan `resolutionStatus` của cạnh.
- Giữ nguyên mọi field cũ, ID, số node/cạnh, `accessPolicy.requireProjectReadAccess`, logic chọn model (`findById` → fallback latest-valid).

## 2. Tương thích các nơi tạo NodeDTO (impact)

`NodeDTO` còn được dựng ở `GraphServiceImpl.analyzeImpact` (~dòng 100, builder chỉ set id/name/type) — 3 trường mới để null, **không mở rộng logic impact**. `ImpactControllerTest` chạy trong regression pass. FE không cần đổi: `modelView` parse graph qua zod `object()` mặc định strip field lạ (`java-wire.ts`), đã xác nhận bằng `npm test`.

## 3. Test Java — gọi production code thật, không mock mapping

Mở rộng `GraphServiceImplTest` (Mockito mock repository, gọi `service.getGraphDataBySessionId` thật; `ModelElement.properties` là `ObjectNode` thật):

1. `graphReadPassesChannelMetadataThroughFromProperties` — channel có `properties.protocol="kafka"`, `transportAuthority="kafka"` → node trả đúng cả hai, `resolutionIssue=null`; node không properties → cả 3 null; **field cũ không đổi** (name/type).
2. `unresolvedTransportKeepsProtocolAndIssueWithoutAuthority` — đúng shape nhánh unresolved (`GBSI:322-325`): có `protocol` + `resolutionIssue="UNRESOLVED_MESSAGE_TRANSPORT"`, **không có** `transportAuthority` → node trả `protocol="kafka"`, `resolutionIssue` đúng, `transportAuthority=null`.
3. `missingBlankAndNonTextualMetadataBecomeNullWithoutBreakingResponse` — `protocol` là number 42, `transportAuthority` chuỗi rỗng, `resolutionIssue` boolean, `languageStack` (key không map) → **cả 3 trả null**, response không hỏng (name/type nguyên vẹn).
4. `nodeMetadataSerializesWithProjectJacksonConvention` — serialization test dùng **mapper mặc định** (`new ObjectMapper()`, tương đương convention dự án vì **không có ObjectMapper toàn cục tùy biến** — chỉ `ApiResponse` tự khai báo `NON_NULL` ở class level, không áp dụng cho `GraphDataDTO`): field có giá trị xuất hiện `"protocol":"kafka"`, field null xuất hiện `"protocol":null` / `"resolutionIssue":null`. **Giới hạn: đây là test mapper mặc định, CHƯA xác nhận HTTP serialization thực tế qua cấu hình Spring runtime** (HttpMessageConverter/mapper được inject) — không mở rộng thành dự án test HTTP toàn hệ thống.

**Không chỉ thêm field vào fixture JSON rồi assert fixture** — mọi assertion đi qua mapping/serialization thật.

## 4. Lệnh thực chạy và kết quả

```
# (Git Bash) JAVA_HOME='C:\Program Files\Java\jdk-25'
./mvnw.cmd -pl mavis-analyzer -am -Dtest=GraphServiceImplTest \
  -Dsurefire.failIfNoSpecifiedTests=false -Dlombok.version=1.18.42 -Dnet.bytebuddy.experimental=true test
  → GraphServiceImplTest: Tests run: 11, Failures: 0, Errors: 0 (7 cũ + 4 mới) — BUILD SUCCESS

./mvnw.cmd -pl mavis-analyzer -am -Dlombok.version=1.18.42 -Dnet.bytebuddy.experimental=true test
  → Reactor mavis-common + mavis-analyzer: Tests run: 219, Failures: 0, Errors: 0, Skipped: 12 — BUILD SUCCESS
    (Kết quả 219 này là historical của S2a — các slice sau chỉ sửa frontend; S2b có BỔ SUNG ca test Java vào GraphServiceImplTest nhưng không thay đổi production backend nào sau S2a.)
    (12 skip là các integration test có điều kiện đã ghi nhận trong IMPLEMENTATION_STATUS từ trước, không liên quan thay đổi này)

npm test (MAVIS-Frontend)  → tests 71 · pass 71 · fail 0 (tương thích — zod strip field mới)
```

Môi trường: JDK 25.0.1; cần `JAVA_HOME` Windows-style và 2 flag JDK25 đã ghi trong IMPLEMENTATION_STATUS (`-Dlombok.version=1.18.42 -Dnet.bytebuddy.experimental=true`). Không có bước nào bị chặn; không có bước nào bị bỏ qua.

## 5. File đã thay đổi

| File | Thay đổi |
|---|---|
| `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/graph/dto/NodeDTO.java` | +3 trường nullable + comment ràng buộc |
| `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/graph/service/impl/GraphServiceImpl.java` | +mapping 3 trường + helper `extractTextProperty` |
| `MAVIS-Platform/mavis-be/mavis-analyzer/src/test/java/com/mavis/analyzer/graph/service/impl/GraphServiceImplTest.java` | +4 test |
| `MAVIS-Frontend/tests/edge-semantics.test.cjs` | UC-02 test đổi thành **characterization (baseline)** + comment rõ test không chứng minh aggregate status đúng (chỉnh sửa bàn giao S1a) |
| `MAVIS-Frontend/README.md` | Sửa link sang `../docs/S1A_…` (chỉnh sửa bàn giao S1a) |
| `docs/S1A_EDGE_SEMANTICS_REPORT_2026-10-24.md` | Trạng thái: đã nghiệm thu baseline; sửa câu mâu thuẫn về assertion xanh UC-02 |
| `docs/DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md` | S1: nghiệm thu baseline; S2: ghi trạng thái S2a + link báo cáo này |
| `docs/S2A_GRAPH_METADATA_REPORT_2026-10-24.md` | Báo cáo này (không tạo doc API trùng — không có tài liệu contract graph API riêng hiện hữu để cập nhật) |

Chưa commit — chờ review. Giữ nguyên trạng thái các thay đổi ngoài task (S1a, dashboard branch).

## 6. Đã đạt / chưa đạt — ranh giới bằng chứng

**Đã đạt ở API**: graph endpoint trả về metadata đã tồn tại trong DB cho node có bằng chứng; null trung thực cho thiếu/sai kiểu; ID, field cũ, số node/cạnh, access-policy, model-selection không đổi; tương thích impact path và FE parse.

**Chưa đạt / chưa tuyên bố**:
- Serialization đã kiểm chứng ở mức mapper mặc định; **HTTP serialization qua cấu hình Spring runtime chưa xác nhận end-to-end**.
- **FE chưa triển khai hiển thị tại thời điểm S2a** — metadata chưa tới UI; không tuyên bố "protocol đã tới người dùng" (S2b xử lý phần hiển thị).
- `resolutionStatus` cấp cạnh và chiều SUBSCRIBE giữ nguyên trạng thái UC-01/UC-02 (không sửa trong S2a).
- Chưa chạy lại E2E Java↔Worker hay browser acceptance — ngoài phạm vi; không suy là pass.
- Graph API docs: không có tài liệu contract riêng hiện hữu để cập nhật; đặc tả 3 trường nằm trong báo cáo này và javadoc comment tại `NodeDTO` — khi nhóm muốn, có thể hợp nhất vào một tài liệu contract duy nhất thay vì tạo bản trùng.

## 7. Dừng tại đây

S2a hoàn thành theo phạm vi. Chờ review; không tự tiếp tục sang hiển thị FE hay các lát cắt khác.

# M2 — Hoàn Thiện Hợp Đồng Graph/C4 & Nền Kiểm Chứng UML: Báo Cáo Nghiệm Thu & Tích Hợp Cuối (Final Integration)

- **Ngày:** 24/10/2026
- **Trạng thái:** **M2 ĐÃ HOÀN TẤT TOÀN BỘ TRIỂN KHAI VÀ BROWSER ACCEPTANCE (Scenarios 1–7 PASS bao gồm C1/C2/C3 SVG & XML verification trên draw.io:8090; Scenario 8 / D5 editor iframe đã xác minh, thao tác drag/undo/redo giữ NEEDS MANUAL VERIFICATION; UC-01 giữ OPEN).**
- **Baseline:** Working tree hiện tại trên nhánh chính, giữ nguyên toàn bộ thay đổi có sẵn của M1, main-sync và người dùng. Tuyệt đối không commit, không push, không merge, không deploy, không reset/clean/stash. Không triển khai M3 trước khi reviewer nghiệm thu chính thức M2.

---

## 1. Tổng Hợp Kết Quả Thực Hiện Theo 3 Khối Yêu Cầu (A — C)

### A. Nối Capability Vào Graph Chính (Architecture Workspace & 3E) & Khắc Phục H1–H4
1. **Lần đường render thực tế & Thống nhất Projection State (H1):**
   - Tuyến đường UI đang chạy: `src/routes/architecture.tsx` → `ArchitecturePresentation` → Canvas `DependencyNetwork` và Inspector `SelectionThreeE`.
   - `DependencyNetwork` là canvas đồ thị tương tác duy nhất của Architecture Workspace (giữ nguyên tương tác pan, zoom, drag node, keyboard shortcuts, select callbacks).
   - **Khắc phục H1:** `ArchitecturePresentation` và `DependencyNetwork` sử dụng chung một `projection` context tính từ `expanded` và `origin` do controls thực tế điều khiển: `projection = useMemo(() => projectGraphModel(model, expanded, origin), [model, expanded, origin])`. Canvas và Inspector panel luôn đồng bộ 100% về trạng thái collapsed/expanded và origin filter, loại bỏ hoàn toàn tình trạng canvas expanded nhưng panel hiển thị collapsed.
2. **Thanh thống kê trung thực & Fallback Grid Layout (H4):**
   - Đã tích hợp thanh thống kê trực tiếp phía trên canvas `DependencyNetwork`:
     - **Source model:** Tổng số element và relationship từ model gốc (`model.elements.length`, `model.edges.length`).
     - **Displayed in view:** Số lượng node và edge hiện đang vẽ trên canvas sau khi lọc (`nodes.length`, `edges.length`).
     - **Filtered by origin:** Số quan hệ bị ẩn do bộ lọc tầng gốc (`projection.filteredRelationships`, `origin`).
     - **Internal hidden:** Số quan hệ nội bộ bị ẩn khi container/component đang ở trạng thái collapse (`projection.internalRelationships`).
     - **Search highlighting trung thực:** Hiển thị `{matchedCount}/{totalCount} elements highlighted` (phản ánh đúng hành vi làm mờ/nổi bật của search, loại bỏ phép trừ cạnh giả luôn bằng 0).
     - **Layout Fallback:** Khi `nodes.length > 300`, thông báo rõ: `(Grid layout mode: >300 elements active, force simulation bypassed for performance)`, loại bỏ cảnh báo 1000 edge không có cơ sở.
3. **Legend đa kênh thị giác (Multi-Channel Legend) & Node Badges:**
   - Đồng bộ giữa `GraphLegend` và canvas `DependencyNetwork`:
     - Không sử dụng màu sắc làm kênh nhận diện duy nhất.
     - Canvas nodes mang text badges monospaced chuẩn hóa: `[SVC]` (Service Container), `[COMP]` (Component), `[DB]` (Database), `[QUEUE]` (Message Channel/Queue), `[EXT]` (External System).
     - Kiểu nét cạnh được phân biệt rõ: nét liền (`solid`) cho static call, nét đứt (`dashed 5 4`) cho compose/deployment, nét chấm (`dotted 2 3`) cho uncertain.
     - Legend liệt kê chi tiết: element types + text badges, line styles, và origin layer badges (`[STATIC]`, `[CONFIG]`, `[DEPLOY]`, `[RUNTIME]`).
4. **Selection Context phân biệt Group và Source Relationship, Drill-down Cạnh Đại Diện (H2):**
   - Bổ sung `drilledSourceEdgeId` vào `ArchitecturePresentation` và `SelectionThreeE`:
     - `isGroup = !drilledSourceEdgeId && !!projectedEdge?.underlyingEdgeIds && projectedEdge.underlyingEdgeIds.length > 1;`
     - Khi chọn quan hệ gộp trên canvas (`drilledSourceEdgeId === null`):
       - Hiển thị tiêu đề nhóm `fromName → toName`.
       - Hiển thị tổng số bằng chứng phân biệt: `"${count} căn cứ xác thực (tổng hợp phân biệt từ N quan hệ con)"` (ví dụ: gộp hai quan hệ có evidence `{a,b}` và `{b,c}` hiển thị distinct count = 3).
       - Liệt kê danh sách các quan hệ thành phần kèm số bằng chứng riêng của từng cạnh và nút bấm **"Chi tiết"**.
     - Khi bấm "Chi tiết" trên **cạnh đầu tiên** (`subId === projectedEdge.id`):
       - Gọi `onDrilldown(subId)`, gán `drilledSourceEdgeId = subId`.
       - `isGroup` chuyển thành `false` dù `subId === projectedEdge.id`, panel lập tức thoát chế độ group và hiển thị thông tin riêng của cạnh con (canonical count = 2 thay vì 3 của nhóm).
       - Hiển thị banner quay lại nhóm: `← Xem toàn bộ quan hệ gộp (N quan hệ con)`.
     - Khi bấm "← Xem toàn bộ quan hệ gộp":
       - Gọi `onDrilldown(null)`, gán `drilledSourceEdgeId = null`, panel trở lại group view với count = 3.
     - Khi bấm "Chi tiết" trên cạnh thứ hai:
       - Gọi `onDrilldown(subId2)`, hiển thị chi tiết cạnh con thứ hai với count = 2.
     - Khi đổi model, đổi mode sang diagram, đổi origin filter, hoặc toggle expanded/collapsed:
       - Context tự động reset `drilledSourceEdgeId = null`.
5. **Bảo tồn Canonical ID cho truy vấn API Evidence:**
   - `activeRelationshipId = drilledSourceEdgeId ?? selectedId`.
   - Tất cả các lệnh gọi API `relationshipEvidence(activeRelationshipId)` luôn sử dụng ID quan hệ gốc từ source model, tuyệt đối không dùng ID giả lập.

---

### B. Source Java/C# Nối Tới Graph/C4 & Chiến Lược Fixture Tái Chạy (H3/H5)

1. **Java Source Pipeline (Source/Config → Detector/Parser → GraphBuilder → GraphService):**
   - Đã triển khai và thực thi test tích hợp đầu-cuối: `JavaSourceToGraphC4PipelineTest.java:executePipelineFromSourceToGraphContract`.
   - Sử dụng fixture thực tế trong `@TempDir`: `docker-compose.yml` (khai báo `orders-service`, `orders-db` MySQL port 3306, `SPRING_DATASOURCE_URL: jdbc:mysql://orders-db:3306/orders_db`) và Java source `OrderRepository.java` (`@Repository`).
   - Gọi trực tiếp các production services: `DockerDetectorServiceImpl`, `SpringConfigDetectorServiceImpl`, `JavaSourceParser`, `GraphBuilderServiceImpl`, `GraphServiceImpl`.
   - Kết quả đầu ra thực tế được ghi tự động vào file: `output/m2/source-pipeline-java-actual.json`.
   - Xác minh:
     - `ModelElement` có logical datastore `orders_db @ orders-db` (`elementType: DATABASE`, `properties.protocol: "mysql"`).
     - `ModelRelationship` có `DATABASE_ACCESS`.
     - `GraphDataDTO` trả về node có `protocol: "mysql"` và edge có `evidenceCount: 1`.

2. **C# Roslyn Pipeline → Java Canonical Ingestion → Graph DTO (H3):**
   - Đã nối liền toàn bộ đường đi từ C# Roslyn analyzer đến Java Ingestion và Graph DTO:
     - **Bước 1 (C# Scan & Manifest):** `DotnetProjectAnalyzer.AnalyzeAsync` quét `OrderClient.cs` gọi `payment-service:5000/api/charges`, tạo `WorkerContract.Result` (camelCase) và xuất ra `output/m2/source-pipeline-csharp-actual.json`.
     - **Bước 2 (Java Ingestion & Graph DTO):** Test `JavaSourceToGraphC4PipelineTest.java:executePipelineFromCsharpActualToGraphContract` nạp kết quả C# qua `WorkerCanonicalImporter.importResult`, chuyển đổi qua `GraphServiceImpl.getGraphDataBySessionId`, xuất ra `output/m2/source-pipeline-csharp-graph-actual.json`.
     - **Bước 3 (Frontend ModelView & C4 XML):** `modelView` nạp DTO, sinh C4 Container view qua `selectDiagram(model, "CONTAINER")` và sinh Draw.io XML qua `generateDrawio(doc)`.
     - **Kết quả xác minh:** XML chứa `payment-service:5000` (EXTERNAL_SYSTEM), `App` (unresolved top-level component với scope warning), và quan hệ HTTP call với đúng 3 evidences.

3. **Chiến Lược Fixtures Có Kiểm Soát (H5):**
   - Đã commit baseline fixtures thực tế tại `MAVIS-Frontend/tests/fixtures/`:
     - `source-pipeline-java-actual.json`
     - `source-pipeline-csharp-actual.json`
     - `source-pipeline-csharp-graph-actual.json`
   - Trong `edge-semantics.test.cjs`: Hàm `loadPipelineArtifact` ưu tiên nạp file vừa chạy tại `output/m2/` (live run override) và an toàn fallback về `tests/fixtures/` khi chạy trong môi trường mới, loại bỏ hoàn toàn sự phụ thuộc vào file cục bộ chưa sinh.

4. **Frontend Contract Nối Output Pipeline Thực Tế → C4 Container Draw.io XML:**
   - Bổ sung test contract trong `MAVIS-Frontend/tests/edge-semantics.test.cjs`:
     - Test Java pipeline: Xác minh XML chứa `orders-service`, `orders_db @ orders-db`, và nhãn cạnh `Database access [mysql]`.
     - Test C# pipeline (H3): Xác minh XML chứa `payment-service:5000`, `App`, và quan hệ HTTP call.
     - Test vòng đời Selection & Projection (H1/H2): Xác minh đầy đủ chu trình Collapsed (count=3) → Chi tiết cạnh 1 (`subId === projectedEdge.id`, count=2, activeRelId=edge-1) → Quay lại nhóm (count=3) → Chi tiết cạnh 2 (count=2) → Expanded (2 cạnh riêng, count=2) → Reset context khi đổi origin/model.
     - Test thống kê trung thực (H4): Xác minh search highlighting count `{matched}/{total}` và điều kiện grid fallback (>300).

---

### C. Kiểm Chứng, Acceptance & Đồng Bộ Hồ Sơ

1. **Kết Quả Chạy Toàn Bộ Test Suites (Vòng Cuối Connected Run):**
   - **Frontend Tests (`npm --prefix MAVIS-Frontend test`):**
     - **112 / 112 tests PASS** (baseline fixtures). Connected live pipeline (`npm --prefix MAVIS-Frontend run test:connected`): **1 / 1 PASS**.
   - **Frontend Typecheck (`npm --prefix MAVIS-Frontend run typecheck`):**
     - **0 errors** (tsc exit code 0).
   - **Frontend Mainflow (`npm --prefix MAVIS-Frontend run test:mainflow`):**
     - **PASS** (envelopes, multipart, idempotency, errors/no retry, job states, published model).
   - **Frontend Production Build (`next build` với dist riêng `.next-m2`):**
     - **SUCCESS** (Compiled successfully; static pages generated 3/3; không conflict với baseline `.next`).
   - **Java Backend Tests (JDK 25 + Maven):**
     - **37 tests tổng: 36 passed, 1 skipped, 0 fail/error** (thời gian: 9.04s) across `JavaSourceToGraphC4PipelineTest`, `GraphServiceImplTest`, `GraphBuilderServiceTest`, `BeanMessagingParserTest`.
     - `BUILD SUCCESS`.
   - **C# Worker Tests (.NET 10 + xUnit):**
     - **22 / 22 tests PASS** (thời gian: 4s) across `CSharpScanEndToEndTests`, `HttpClientProfileTests`, `CSharpAnalyzerTests`.

2. **Spring Data List Contract & Query Complexity:**
   - Ghi nhận chính xác: Trong Spring Data JPA, `List<T>` trả về empty list (`[]`) khi không có bản ghi, không trả về `null`.
   - Phân biệt rõ giữa:
     - `evidenceCount = null`: Chưa tải hoặc quan hệ gộp có cạnh con thiếu dữ liệu.
     - `evidenceCount = 0L`: Đã truy vấn thành công qua batch query và xác nhận không có bản ghi evidence nào.
   - Phương thức nạp evidence: Sử dụng một query batch đơn lẻ (`findRelationshipEvidenceIdsByModelVersionId`) thay vì N+1 queries. Ghi nhận là "một query batch" thay vì giả định O(1) về mặt bộ nhớ/thời gian.

3. **Trạng Thái Các Hạng Mục Acceptance Còn Mở:**
   - **D5 (Editor Pointer Drag / Undo / Redo):**
     - **Trạng thái:** **NEEDS MANUAL VERIFICATION**.
     - Đã bấm `"Edit in draw.io"`, xác minh iframe editor tương tác hiển thị thật (`iframe[title="draw.io diagram editor"]` tại `http://127.0.0.1:8090/?embed=1...`, kích thước `1118x720`, phân biệt hoàn toàn với hidden snapshot renderer `iframe[title="Diagram rendering service"]`), trạng thái `"Ready to edit · changes are saved as a browser draft"`, nút `Save draft` và `Save to project` đều bật.
     - Thao tác kéo thả node thủ công và undo/redo giữ nguyên `NEEDS MANUAL VERIFICATION` cho Reviewer/Người dùng (tách biệt rõ ghi chú lịch sử từ M1 về việc pointer automation chạm connector handle sinh cạnh tạm).
   - **UC-01 (Message Subscribe Edge Direction):**
     - **Trạng thái:** **OPEN (chờ kiến trúc sư chốt)**.
     - Giữ nguyên hợp đồng backend hiện hành: `channel -> consumer` với nhãn `"Delivers messages to"`. Không tự ý đảo chiều trong DB hoặc code backend.
   - **Browser Acceptance E2E Trên Running Stack (Scenarios 1–7):**
     - **Trạng thái:** **PASS (7/7 kịch bản tự động đạt 100%, bao gồm C1/C2/C3 visual SVG & XML verification với `draw.io:8090` online)**. Xem chi tiết tại Mục 5.

---

### D. Giải Quyết Dứt Điểm Các Blockers B1–B3 (Vòng Reviewer Remaining Blockers)

1. **B1: Tách Producer C# & Integration Test Java Bắt Buộc Live Output (Không Fallback Ngầm):**
   - **Nguyên nhân gốc rễ:** Trước đây cả `CSharpScanEndToEndTests` (xuất `ServiceManifest` legacy với thuộc tính `ProjectId`) và `HttpClientProfileTests` (xuất `WorkerContract.Result` canonical với `schemaVersion`, `canonical.elements`) cùng chạy trong bộ test và ghi đè lẫn nhau vào `output/m2/source-pipeline-csharp-actual.json`. Khi `CSharpScanEndToEndTests` chạy sau, file bị ghi đè schema legacy dẫn đến `JavaSourceToGraphC4PipelineTest` ném `UnrecognizedPropertyException: Unrecognized field "ProjectId"`. Đồng thời đường dẫn thư mục bị hardcode tuyệt đối theo máy cục bộ (`C:\Users\nhuth\...`).
   - **Giải pháp:**
     - Tách bạch 2 producers: `CSharpScanEndToEndTests` ghi kết quả manifest riêng ra `output/m2/source-pipeline-csharp-manifest-actual.json`.
     - `HttpClientProfileTests` độc quyền ghi canonical `WorkerContract.Result` ra `output/m2/source-pipeline-csharp-actual.json`.
     - Xóa bỏ toàn bộ hardcoded paths, thay bằng hàm xác định root repository động `FindRepoRoot()`.
     - Test tích hợp `JavaSourceToGraphC4PipelineTest.java:executePipelineFromCsharpActualToGraphContract` trỏ trực tiếp và bắt buộc file live `output/m2/source-pipeline-csharp-actual.json` phải tồn tại, loại bỏ cơ chế silent fallback về fixture để đảm bảo phát hiện đúng lỗi pipeline thật.

2. **B2: Hợp Nhất Canonical Subject Cho Toàn Bộ Vòng Đời 3E (Explain, Findings, Validation, Drill-Down):**
   - **Nguyên nhân gốc rễ:** `SelectionThreeE` trước đây sử dụng `selectedId` cho việc lọc finding (`findingRelated`), mutation request payload (`relationshipId: selectedId`), và validation response (`result.relationshipId !== selectedId`). Khi người dùng chọn quan hệ gộp (ID `edge-1`) rồi drill-down vào cạnh thứ hai (`edge-2`), `explain.mutate` vẫn gửi `edge-1` và chấp nhận response của `edge-1`.
   - **Giải pháp:**
     - Trích xuất helper production `buildThreeESubjectContext` tại `src/features/architecture/three-e-content.ts`.
     - Thống nhất canonical target:
       - `activeRelationshipId = drilledSourceEdgeId ?? selectedId`
       - `activeTargetId = isNode ? selectedId : activeRelationshipId`
     - **Truy vấn Evidence:** `relationshipEvidence(activeRelationshipId)`.
     - **Lọc Findings:** `filterFindings` lọc theo tất cả member IDs nếu là group; lọc riêng theo `activeRelationshipId` khi ở chế độ single hoặc drilled edge.
     - **Gated AI Explain khi ở chế độ Group:** Nút AI Explain bị khóa khi `isGroup = true`, hiển thị thông báo hướng dẫn người dùng chọn quan hệ thành phần cụ thể. `buildExplainRequest()` ném exception nếu cố gọi không có finding mục tiêu.
     - **AI Explain Mutation Payload:** Luôn truyền `relationshipId: activeRelationshipId`, đảm bảo khi drill-down vào `edge-2`, AI Explain gửi chính xác `edge-2`.
     - **Response Validation Chống Stale/Race Condition:** `validateExplainResponse` kiểm tra `result.relationshipId === activeRelationshipId`, lập tức từ chối response trễ của quan hệ cũ khi người dùng đã chuyển sang quan hệ mới.
     - **State Reset & Partitioning:** Thêm `useEffect` trong `SelectionThreeE` tự động reset `findingId = null` và gọi `explain.reset()` khi `activeTargetId` thay đổi. Tại `ArchitecturePresentation`, áp dụng partitioned React key: `key={`${model.id}:${selectedId}:${drilledSourceEdgeId ?? "group"}`}`.

3. **B3: Kiểm Thử Code Production Thật & Phân Định Rõ Baseline vs Live Pipeline:**
   - **Nguyên nhân gốc rễ:** Reviewer phát hiện bài test `Architecture presentation selection and projection lifecycle` trong `edge-semantics.test.cjs` tự định nghĩa lại controller helper `getSelectionContext` nội bộ trong file test thay vì kiểm thử mã nguồn production. Đồng thời gộp chung việc đọc artifact pipeline với fallback ngầm.
   - **Giải pháp:**
     - Xóa bỏ `getSelectionContext` khỏi file test; test gọi trực tiếp hàm production `buildThreeESubjectContext` từ `three-e-content.ts`.
     - Kiểm chứng độc lập các giá trị literal trên cả 5 trạng thái vòng đời UI thực tế:
       1. Collapsed group (count = 3, findings cho 2 edges, AI explain bị chặn).
       2. Drill-down cạnh thứ nhất (`subId === projectedEdge.id`, count = 2, findings lọc riêng edge-1, explain payload `edge-1`, validate chấp nhận `edge-1` & từ chối `edge-2`).
       3. Quay lại nhóm (`drilledSourceEdgeId = null`, trở lại group mode, count = 3).
       4. Drill-down cạnh thứ hai (`subId === "edge-2"`, count = 2, findings lọc riêng edge-2, explain payload `edge-2`, validate chấp nhận `edge-2` & từ chối out-of-order `edge-1`).
       5. Expanded mode (2 cạnh riêng lẻ độc lập, context khởi tạo trực tiếp với canonical edge ID).
     - Phân định rạch ròi 2 bài test riêng biệt:
       - `committed baseline fixtures regression: Java and C# canonical graphs render into C4 Container view (provenance: tests/fixtures)`
       - `connected pipeline integration: live Java and C# pipeline output from output/m2/ renders into C4 Container view` (bắt buộc artifact thật từ upstream run).

---

### E. Hoàn Tất Dứt Điểm G1–G3 (Vòng Reviewer Group Scope Final)

1. **G1: Thống Nhất Scope Group/Source Cho AI & Bằng Chứng Trung Thực:**
   - **Chặn AI Explain ở Group Mode:** Hàm `buildExplainRequest` trong production code ném exception `/Không thể yêu cầu giải thích AI ở chế độ quan hệ gộp/` cho MỌI yêu cầu gọi từ chế độ group (kể cả khi truyền `options.finding`). Nút AI Explain trong UI được khóa hoàn toàn ở chế độ group kèm thông báo hướng dẫn.
   - **Bằng chứng Group Trung Thực:** `evidenceQueryParam` trả về `null` khi `isGroup = true`. Tuyệt đối không gọi API của `edge-1` rồi hiển thị như bằng chứng của cả nhóm. Tab "Bằng chứng" hiển thị rõ hướng dẫn người dùng chọn "Chi tiết" ở từng quan hệ thành phần.
   - **Xử lý Finding của Thành Viên:** Findings trong tab "Đánh giá" hiển thị nhãn quan hệ cụ thể (`Quan hệ: edge-2`). Bấm vào finding sẽ tự động drill-down sang đúng quan hệ thành phần (`drilledSourceEdgeId = edge-2`), thoát group mode và cho phép yêu cầu giải thích AI với đúng canonical ID `edge-2`. Các findings gắn với nhiều phần tử sẽ hiển thị thông báo hướng dẫn thay vì chọn ngẫu nhiên một member.

2. **G2: Định Nghĩa Selection Scope Identity & Chống Race Condition/Stale State:**
   - **Selection Scope Identity:** Triển khai hàm pure `computeSelectionScopeKey` trong `three-e-content.ts`:
     `scopeKey = ${model.id}:${scopeKind}:${activeTargetId}:${memberSignature}`
     - Expanded `edge-1`: `mod:source:edge-1:edge-1`.
     - Collapsed group đại diện `edge-1`: `mod:group:edge-1:edge-1,edge-2`.
     - Thay đổi member (thêm `edge-3`): `mod:group:edge-1:edge-1,edge-2,edge-3`.
   - **Phân Vùng State & Keyed Remount:** `ArchitecturePresentation` gán React `key={computeSelectionScopeKey(...)}` cho `SelectionThreeE`, đảm bảo việc chuyển đổi giữa source và group mode (hoặc thay đổi group members) luôn remount và hủy bỏ toàn bộ state nội bộ cũ.
   - **Safeguard trong Effect & Validation:** `SelectionThreeE` bổ sung `useEffect` reset `findingId = ""` và `explain.reset()` khi `ctx.scopeKey` thay đổi. `validateExplainResponse` kiểm tra `requestScopeKey !== ctx.scopeKey` hoặc `isGroup = true` để từ chối ngay lập tức mọi response bất đồng bộ trễ từ scope cũ.

3. **G3: Tách Biệt Hoàn Toàn Default Fixture Regression Khỏi Live Connected Integration:**
   - **Default Suite (`npm test`):** Chạy 112 tests thuần túy dựa trên fixtures kiểm soát trong `tests/fixtures/`. Đã kiểm chứng độc lập bằng harness monkey-patch `fs` (fs trap) rằng bộ test mặc định KHÔNG truy cập `output/m2/` dưới bất kỳ hình thức nào.
   - **Connected Pipeline Suite (`npm run test:connected`):** Chạy bài test `tests/connected-pipeline.test.cjs`, bắt buộc kiểm tra live artifacts vừa được sinh từ upstream Worker & Java run (`output/m2/source-pipeline-java-actual.json` và `output/m2/source-pipeline-csharp-graph-actual.json`), không có fallback ngầm.

---

## 2. Chi Tiết Thay Đổi Code (File:Symbol Mapping Vòng G1–G3 & Final)

### 2.1. Frontend
1. **`MAVIS-Frontend/src/features/architecture/three-e-content.ts` (G1/G2):**
   - Symbol: `computeSelectionScopeKey(params: ThreeESelectionContextParams)`:
     - Tính toán `scopeKey = ${model.id}:${scopeKind}:${activeTargetId}:${memberSignature}`.
     - Phân định rõ `scopeKind` (`node`, `group`, `source`) và `memberSignature` (danh sách member IDs được sắp xếp nếu là group).
   - Symbol: `buildThreeESubjectContext`:
     - Gán `evidenceQueryParam: null` khi `isGroup = true`.
     - `buildExplainRequest`: ném exception khi `isGroup = true` cho cả request có finding và không có finding.
     - `validateExplainResponse`: từ chối mọi response khi `isGroup = true` hoặc khi `requestScopeKey !== scopeKey`.
2. **`MAVIS-Frontend/src/features/architecture/selection-three-e.tsx` (G1/G2):**
   - Symbol: `SelectionThreeE`:
     - `useEffect` lắng nghe `ctx.scopeKey` để reset `findingId = ""` và `explain.reset()`.
     - `explain.mutationFn`: truyền `requestScopeKey = ctx.scopeKey` vào `validateExplainResponse`.
     - `chooseFinding`: ở chế độ group, nếu finding gắn với quan hệ thành phần duy nhất thì tự động gọi `onDrilldown(relId)` để chuyển sang đúng canonical scope trước khi giải thích.
     - Tab "Bằng chứng": khi `isGroup && !findingId`, hiển thị thông báo hướng dẫn trung thực thay vì nạp bằng chứng của cạnh đại diện.
     - Tab "Đánh giá": hiển thị nhãn quan hệ con và nút drill-down riêng cho từng finding của member.
3. **`MAVIS-Frontend/src/features/architecture/architecture-presentation.tsx` (G2):**
   - Symbol: `ArchitecturePresentation`:
     - Gán React key: `key={computeSelectionScopeKey({ model, selectedId, projectedEdge, drilledSourceEdgeId })}` cho `SelectionThreeE`.
4. **`MAVIS-Frontend/package.json` (G3):**
   - Bổ sung lệnh: `"test:connected": "node --test tests/connected-pipeline.test.cjs"`.
5. **`MAVIS-Frontend/tests/connected-pipeline.test.cjs` (G3):**
   - Tách test connected live pipeline ra file riêng, bắt buộc đọc live output từ `output/m2/`.
6. **`MAVIS-Frontend/tests/edge-semantics.test.cjs` (G1/G2/G3):**
   - Loại bỏ live integration test khỏi bộ test mặc định.
   - Bổ sung kiểm chứng literal cho G1 (chặn group finding explain, group evidence null) và G2 (scopeKey thay đổi giữa source và group, từ chối in-flight response từ scope cũ, đổi membership).

### 2.2. Backend Java & C# Worker
1. **`MAVIS.Worker/tests/MAVIS.Worker.Tests/Integration/CSharpScanEndToEndTests.cs` (B1):**
   - Sửa đường dẫn ghi manifest riêng sang: `output/m2/source-pipeline-csharp-manifest-actual.json`.
   - Xóa bỏ hardcoded path `C:\Users\nhuth\...`, thay bằng `FindRepoRoot()` động.
2. **`MAVIS.Worker/tests/MAVIS.Worker.Tests/CSharp/HttpClientProfileTests.cs` (B1):**
   - Độc quyền ghi kết quả canonical `WorkerContract.Result` (camelCase, `canonical.elements`) vào `output/m2/source-pipeline-csharp-actual.json`.
   - Xóa bỏ hardcoded path, sử dụng `FindRepoRoot()` động.
3. **`MAVIS-Platform/mavis-be/mavis-analyzer/src/test/java/com/mavis/analyzer/graph/service/JavaSourceToGraphC4PipelineTest.java` (B1):**
   - Test `executePipelineFromCsharpActualToGraphContract` trỏ trực tiếp đến `output/m2/source-pipeline-csharp-actual.json`, assert bắt buộc file phải tồn tại, loại bỏ fallback ngầm.
   - Test `executePipelineFromSourceToGraphContract` ghi live output ra `output/m2/source-pipeline-java-actual.json`.

---

## 3. Nhật Ký Lệnh & Kết Quả Thực Thi (Execution Logs)

### 3.1. Frontend Default Test Suite (Baseline Fixtures)
```sh
npm --prefix MAVIS-Frontend test
```
```
ℹ tests 112
ℹ suites 0
ℹ pass 112
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7782.0682
```
*(Xác minh độc lập: trap-fs harness chứng minh 100% không truy cập output/m2/ trong suốt quá trình chạy)*

### 3.2. Frontend Connected Pipeline Suite (Live Output Integration)
```sh
npm --prefix MAVIS-Frontend run test:connected
```
```
> test:connected
> node --test tests/connected-pipeline.test.cjs

✔ connected pipeline integration: live Java and C# pipeline output from output/m2/ renders into C4 Container view (709.0667ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 976.3797
```

### 3.3. Frontend Typecheck, Mainflow & Production Build
```sh
npm --prefix MAVIS-Frontend run typecheck
npm --prefix MAVIS-Frontend run test:mainflow
powershell -Command "$env:MAVIS_NEXT_DIST_DIR = '.next-m2'; npm --prefix MAVIS-Frontend run build"
```
```
> typecheck: 0 errors (tsc exit code 0)
> test:mainflow: Mainflow contract checks passed: envelopes, multipart, idempotency, errors/no retry, job states, published model and versioned navigation.
> next build (.next-m2): Compiled successfully in 8.8s; Generating static pages (3/3); Finalizing page optimization; Exit code 0
```

### 3.4. Java Backend Test Suite (JDK 25)
```powershell
powershell -Command "cd MAVIS-Platform/mavis-be; .\mvnw.cmd -pl mavis-analyzer -am test '-Dtest=JavaSourceToGraphC4PipelineTest,GraphServiceImplTest,GraphBuilderServiceTest,BeanMessagingParserTest' '-Dsurefire.failIfNoSpecifiedTests=false' '-Dlombok.version=1.18.42' '-Dnet.bytebuddy.experimental=true' -B"
```
```
[INFO] Running com.mavis.analyzer.graph.service.GraphBuilderServiceTest
[INFO] Tests run: 16, Failures: 0, Errors: 0, Skipped: 0
[INFO] Running com.mavis.analyzer.graph.service.impl.GraphServiceImplTest
[INFO] Tests run: 16, Failures: 0, Errors: 0, Skipped: 0
[INFO] Running com.mavis.analyzer.graph.service.JavaSourceToGraphC4PipelineTest
Saved actual Java pipeline output to: C:\Users\nhuth\Desktop\MAVISS\MAVIS-Platform\mavis-be\mavis-analyzer\..\..\..\output\m2\source-pipeline-java-actual.json
Saved actual C# pipeline graph output to: C:\Users\nhuth\Desktop\MAVISS\MAVIS-Platform\mavis-be\mavis-analyzer\..\..\..\output\m2\source-pipeline-csharp-graph-actual.json
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
[INFO] Running com.mavis.analyzer.javaanalyzer.parser.BeanMessagingParserTest
[WARNING] Tests run: 3, Failures: 0, Errors: 0, Skipped: 1
[INFO] 
[INFO] Results:
[INFO] Tests run: 37, Failures: 0, Errors: 0, Skipped: 1
[INFO] BUILD SUCCESS
[INFO] Total time: 9.043 s
```

### 3.5. C# Worker Test Suite (.NET 10)
```powershell
dotnet test MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --filter "FullyQualifiedName~CSharpScanEndToEndTests|FullyQualifiedName~HttpClientProfileTests|FullyQualifiedName~CSharpAnalyzerTests"
```
```
Passed!  - Failed: 0, Passed: 22, Skipped: 0, Total: 22, Duration: 4 s - MAVIS.Worker.Tests.dll (net10.0)
```

---

## 4. Danh Mục Artifact Tại `output/m2/` & `MAVIS-Frontend/tests/fixtures/`

1. **`output/m2/source-pipeline-java-actual.json`**: Output thực tế từ pipeline Java (`GraphDataDTO` với nodes, edges, properties, protocol `mysql`, evidenceCount: 1).
2. **`output/m2/source-pipeline-csharp-actual.json`**: Output thực tế từ pipeline C# Roslyn (`WorkerContract.Result` với `OrderClient`, `payment-service:5000`, `App`, `Startup`, `SERVICE_HTTP_CALL`, 3 evidences).
3. **`output/m2/source-pipeline-csharp-manifest-actual.json`**: Output manifest riêng từ `CSharpScanEndToEndTests` (không ghi đè `source-pipeline-csharp-actual.json`).
4. **`output/m2/source-pipeline-csharp-graph-actual.json`**: Output Graph DTO từ pipeline Java ingestion nạp từ C# Roslyn analyzer output.
5. **`MAVIS-Frontend/tests/fixtures/`**: Baseline fixtures kiểm soát cho môi trường mới (`source-pipeline-java-actual.json`, `source-pipeline-csharp-actual.json`, `source-pipeline-csharp-graph-actual.json`).
6. **`output/m2/nine-diagrams-coverage-manifest.json`**: Manifest rule-level cho 9 loại sơ đồ (`C4-01`..`C4-03`, `UML-01`..`UML-06`), phân định persisted vocabulary và view projections; Activity/State ghi `NOT_IMPLEMENTED`.
7. **`output/m2/evidence-aggregation-results.json`**: Kết quả kiểm thử verified zero evidence, single batch query, và distinct union aggregation.
8. **`output/m2/c4-protocol-gating-results.json`**: Kết quả kiểm thử protocol gating trong C4 Container.
9. **`output/m2/vocabulary-alignment-summary.json`**: Bảng đối chiếu đồng bộ enum V13 và trạng thái UC-01.

---

## 5. Kết Quả Kiểm Chứng Browser Acceptance (Scenarios 1–8 Trên Real Running Stack + Draw.io :8090)

Đã khởi chạy bộ test Browser Acceptance thực tế thông qua Playwright với Chrome channel (`scripts/run-m2-browser-acceptance.cjs`, có `try/finally`, finite timeout, và dọn sạch đúng browser/instance của phiên) trên stack đang chạy:
- **Frontend:** `http://127.0.0.1:3000` (Next.js production/dev distribution `.artifacts/next-m2-review-closure`)
- **Java Backend:** `http://127.0.0.1:8081` (Spring Boot production JAR với `EdgeDTO` chứa `evidenceCount` và `evidenceIds`)
- **Worker:** `http://127.0.0.1:5082` (.NET 10 Worker)
- **Database:** `localhost:5432` (PostgreSQL với Schema V13)
- **Draw.io Renderer & Interactive Editor:** `http://127.0.0.1:8090` (Docker container `maviss-drawio-1` từ `compose.drawio.yml`, HTTP 200 OK)
- **Tài khoản xác thực:** `sandbox.nhut.af36b65e@example.invalid` (đăng nhập qua UI thật `/login`)
- **Project/Model mục tiêu:** Project Test1 (`e0a9ee09-2747-469c-b09d-474674db7a05`), Model Rev 4 (`8b5a2dbc-329d-4e9a-8d01-b94ab4b1c241`, 81 elements, 90 relationships), CAS Document Rev 6 (`b6c97706-6d25-4266-bc23-38e6bec76948`).

### 5.1. Bảng Tổng Hợp 8 Kịch Bản Browser Acceptance

| Kịch Bản | Mục Tiêu Kiểm Chứng | Kết Quả Thực Tế | Trạng Thái | Bằng Chứng / Artifact |
| :--- | :--- | :--- | :--- | :--- |
| **Scenario 1** | Model Selection & Revisions | Phân biệt rõ Model Rev 4 (dữ liệu đồ thị từ code) và Document Rev 6 (XML layout C4 trong CAS). URL và page title hợp lệ. | **PASS** | `01-scenario1-project-model.png`, `acceptance-report.json` |
| **Scenario 2** | DependencyNetwork Canvas, Scope/Stats Bar & Legend | - Scope bar hiển thị trung thực: Source model (81 elements · 90 relationships), Displayed (29 elements · 45 visible connections), Filtered (0), Internal (41 hidden).<br>- Search highlight: `4/29 elements highlighted` khi tìm "order".<br>- Legend đa kênh hiển thị đủ badges: `[SVC]`, `[DB]`, `[QUEUE]`, `[COMP]`, `[EXT]`, nét liền, nét đứt, `[STATIC]`, `[DEPLOY]`.<br>- Expand service internals mở rộng từ 29 lên 81 nodes. | **PASS** | `02-scenario2-dependency-network.png` |
| **Scenario 3** | Group Selection & Distinct Evidence Counting | Chọn cạnh gộp `ftgo-order-service → ftgo_order_service @ mysql` (`b57ae0eb-9b5e-4925-b10e-73b7303c3962` gom 2 quan hệ con). Panel `SelectionThreeE` mở với tiêu đề nhóm, phụ đề `DATABASE_ACCESS · Quan hệ gộp (2 quan hệ con)`, và thống kê chuẩn: `"2 căn cứ xác thực (tổng hợp phân biệt từ 2 quan hệ con)"` (deduplicated từ 2 ID: `10681782-...`, `0860a9f2-...`). | **PASS** | `03-scenario3-group-selection.png` |
| **Scenario 4** | Member Edge Drill-down & Inspection | - Bấm "Chi tiết" trên cạnh con 1 (`OrderRepository → ftgo_order_service @ mysql`): Panel chuyển sang cạnh đơn lẻ, hiển thị `1 căn cứ xác thực`, banner `← Xem toàn bộ quan hệ gộp (2 quan hệ con)`.<br>- Bấm quay lại nhóm: Trở về group scope.<br>- Bấm "Chi tiết" trên cạnh con 2 (`RestaurantRepository → ftgo_order_service @ mysql`): Panel chuyển sang cạnh con 2 với `1 căn cứ xác thực`. | **PASS** | `04-scenario4-drilldown-child-1.png`, `05-scenario4-drilldown-child-2.png` |
| **Scenario 5** | Group Mode AI Explain & Evidence Gating | Khi đang ở chế độ quan hệ gộp: Nút bấm "Giải thích thêm từ bằng chứng" bị ẩn/chặn hoàn toàn; hiển thị thông báo hướng dẫn: `"Lựa chọn hiện tại là quan hệ gộp... Để nhận giải thích AI chính xác theo căn cứ cụ thể, vui lòng chọn Chi tiết ở một quan hệ thành phần..."`. Không có bất kỳ HTTP call nào tới `/ai/explain` với group scope (0 calls). | **PASS** | `06-scenario5-ai-gating.png` |
| **Scenario 6** | Scope Isolation on Mode/Membership Change | Mở rộng internals (`expanded = true`): React remount `SelectionThreeE` với scope key mới `computeSelectionScopeKey`. Cạnh `b57ae0eb-...` tự động chuyển từ group sang individual source edge (`OrderRepository → ftgo_order_service @ mysql`), phụ đề `Quan hệ kiến trúc`, nút giải thích AI đơn lẻ xuất hiện trở lại, không bị rò rỉ state cũ. | **PASS** | `07-scenario6-scope-isolation.png` |
| **Scenario 7** | C1/C2/C3 Diagrams Visual SVG & XML Verification (`draw.io:8090` Online) | - **C1 (`CONTEXT`):** Render SVG thành công (`4603` bytes, `.drawio` XML `7447` bytes), trạng thái `generated`. Có đúng `1` node hệ thống `Test1 [Software system]` (`system:e0a9ee09-2747-469c-b09d-474674db7a05`), `0` actor/person giả tạo, hiển thị rõ cảnh báo trung thực: `"System Context note: the model includes 9 HTTP entrypoint component(s), but no external caller or actor is established by the analyzed source."`<br>- **C2 (`CONTAINER`):** Render SVG thành công (`59987` bytes, `.drawio` XML `72782` bytes), trạng thái `saved (revision 6)`. Boundary `Test1 · Software system · analyzed source scope` (`mavisId="system:boundary"`) chứa đúng `17` container/datastore/channel khớp 100% với model, `0` node lạc ngoài boundary, `12` cạnh mang `underlyingEdgeIds` và nhãn protocol có căn cứ (`Declares publishing to [Eventuate command channel]`, `Delivers messages to [Eventuate command channel]`, `Database access`).<br>- **C3 (`COMPONENT`):** Kiểm tra 2 service độc lập:<br>  1. `ftgo-order-service` (`saved (revision 1)`, SVG `82957` bytes, XML `57440` bytes): Boundary `ftgo-order-service · Components` (`e1f849c5-cb7f-4b72-b6a2-d38d65bb0337`), `17` internal components thuộc đúng `parentId` của container, `4` external dependencies nằm ngoài boundary (`consumerService`, `ftgo_order_service @ mysql`, `kitchenService`, `orderService`), `22` edges.<br>  2. `ftgo-kitchen-service` (`generated`, SVG `41037` bytes, XML `76127` bytes): Boundary `ftgo-kitchen-service · Components` (`899a82d3-358d-4de1-81d7-72705e29e608`), `8` internal components thuộc đúng `parentId` của container, `2` external dependencies nằm ngoài boundary (`ftgo_kitchen_service @ mysql`, `kitchenService`), `10` edges. Giao thoa internal component giữa 2 service = `0`. | **PASS** | `08a-c2-container.drawio`, `08a-c2-container.svg`, `08a-scenario7-c2-container.png`, `08b-c1-context.drawio`, `08b-c1-context.svg`, `08b-scenario7-c1-context.png`, `08c-c3-order-service.drawio`, `08c-c3-order-service.svg`, `08c-scenario7-c3-order-service.png`, `08d-c3-kitchen-service.drawio`, `08d-c3-kitchen-service.svg`, `08d-scenario7-c3-kitchen-service.png` |
| **Scenario 8** | D5 Interactive Draw.io Editor & Drag / Undo / Redo Status | - Đã bấm `"Edit in draw.io"` trên C2 Container view.<br>- Xác minh đúng iframe editor tương tác hiển thị (`iframe[title="draw.io diagram editor"]`, `src="http://127.0.0.1:8090/?embed=1&proto=json&spin=1&ui=min&libraries=1&saveAndExit=0&noSaveBtn=1&noExitBtn=1"`, kích thước hiển thị `1118x720`, `isHiddenSnapshot=false`), phân biệt hoàn toàn với hidden snapshot renderer (`iframe[title="Diagram rendering service"]`).<br>- Trạng thái host hiển thị `"Ready to edit · changes are saved as a browser draft"`, nút `Save draft` và `Save to project` đều bật, bên trong frame có `.geDiagramContainer` với `116` phần tử `<g>`.<br>- **Thao tác kéo node thủ công:** Giữ nguyên trạng thái **NEEDS MANUAL VERIFICATION** (ghi chú lịch sử từ M1: pointer automation chạm connector handle sinh cạnh tạm; không tự động sửa XML/DB để giả lập kéo tay). | **NEEDS MANUAL VERIFICATION** | `09-scenario8-d5-editor-iframe.png`, `09-scenario8-d5-drag.png` |

### 5.2. Hướng Dẫn 1 Bước Kiểm Chứng Thủ Công Cho D5 (Dành Cho Người Dùng / Reviewer)
1. Mở trình duyệt tại `http://127.0.0.1:3000/architecture?projectId=e0a9ee09-2747-469c-b09d-474674db7a05&modelId=8b5a2dbc-329d-4e9a-8d01-b94ab4b1c241`, chuyển sang chế độ **Diagram** (`Container` view), bấm nút **Edit in draw.io**, kéo thử 1 node bất kỳ (ví dụ `ftgo-order-service`) sang vị trí mới trên canvas của `iframe[title="draw.io diagram editor"]`, thử nhấn `Ctrl+Z` / `Ctrl+Y` (Undo/Redo), sau đó bấm **Save to project** và tải lại trang để xác nhận tọa độ mới được bảo toàn qua CAS revision tiếp theo.

### 5.3. Danh Mục Artifact Browser Acceptance Đã Lưu

Toàn bộ artifacts không nhạy cảm được lưu trữ tại `output/m2/browser-acceptance/`:
1. `acceptance-report.json`: Báo cáo chi tiết JSON chứa dữ liệu chạy thực tế, kết quả phân tích XML/SVG của C1/C2/C3, thông số iframe D5, và network logs (`/api/mavis/*` + `/api/backend/*`) đã được loại bỏ cookie/Bearer token.
2. `01-scenario1-project-model.png`: Ảnh chụp Architecture page với Project Test1 và Model Rev 4.
3. `02-scenario2-dependency-network.png`: Ảnh chụp canvas DependencyNetwork với thanh thống kê, legend đa kênh, và search input.
4. `03-scenario3-group-selection.png`: Ảnh chụp lựa chọn cạnh gộp ftgo-order-service và 3E panel hiển thị distinct count = 2.
5. `04-scenario4-drilldown-child-1.png`: Ảnh chụp drill-down vào cạnh con 1 (OrderRepository) với count = 1.
6. `05-scenario4-drilldown-child-2.png`: Ảnh chụp drill-down vào cạnh con 2 (RestaurantRepository).
7. `06-scenario5-ai-gating.png`: Ảnh chụp thông báo gating AI Explain trong group mode.
8. `07-scenario6-scope-isolation.png`: Ảnh chụp canvas expanded với component internals và cạnh source OrderRepository được chọn riêng biệt.
9. `08a-c2-container.drawio`, `08a-c2-container.svg`, `08a-scenario7-c2-container.png`, `08-scenario7-c1-c2-c3-diagrams.png`: Bộ bằng chứng XML, SVG và ảnh chụp màn hình của C2 Container view (`saved (revision 6)`, 17 members, 12 edges).
10. `08b-c1-context.drawio`, `08b-c1-context.svg`, `08b-scenario7-c1-context.png`: Bộ bằng chứng XML, SVG và ảnh chụp màn hình của C1 System Context view (`generated`, 1 node `Test1`, 0 actor giả, kèm cảnh báo thiếu external caller).
11. `08c-c3-order-service.drawio`, `08c-c3-order-service.svg`, `08c-scenario7-c3-order-service.png`: Bộ bằng chứng XML, SVG và ảnh chụp màn hình của C3 Component view cho `ftgo-order-service` (`saved (revision 1)`, 17 internal components, 4 external dependencies).
12. `08d-c3-kitchen-service.drawio`, `08d-c3-kitchen-service.svg`, `08d-scenario7-c3-kitchen-service.png`: Bộ bằng chứng XML, SVG và ảnh chụp màn hình của C3 Component view cho `ftgo-kitchen-service` (`generated`, 8 internal components, 2 external dependencies).
13. `09-scenario8-d5-editor-iframe.png`, `09-scenario8-d5-drag.png`: Ảnh chụp xác minh `iframe[title="draw.io diagram editor"]` ở trạng thái `"Ready to edit"`.

---

## 6. Kết Luận Bàn Giao

Milestone M2 đã hoàn tất toàn bộ các mục tiêu tích hợp và kiểm chứng thực tế:
- Nối liền capabilities vào canvas `DependencyNetwork` và inspector `SelectionThreeE` đang chạy trong Architecture Workspace với selection scope identity chặt chẽ.
- Chứng minh tính toàn vẹn dữ liệu từ Source Java/C# qua pipeline đến C4 Container Draw.io XML bằng các test tích hợp và serialized output thật.
- Kiểm chứng tự động qua Browser Acceptance trên stack thật + `draw.io:8090`: **Scenarios 1–7 PASS** (bao gồm kiểm chứng đầy đủ hình SVG + `.drawio` XML + scope của C1, C2, và 2 container C3 độc lập), **Scenario 8 / D5** đã xác minh đúng interactive editor iframe và giữ `NEEDS MANUAL VERIFICATION` cho thao tác kéo tay, **UC-01** giữ `OPEN` theo đúng bằng chứng thực tế.
- **Hoàn tất bàn giao M2 và chờ Reviewer nghiệm thu trước khi bắt đầu M3.**

# BÁO CÁO KIỂM ĐỊNH TOÀN DIỆN (FULL-STACK & LIVE WEB `https://maviss.site/`) & SIÊU PROMPT ĐA TÁC VỤ CHO AI ANTIGRAVITY

- **Dự án**: MAVIS — Microservices Architecture Visualization & Impact System
- **Môi trường đã kiểm tra**:
  1. **Live Production Web**: `https://maviss.site/` (cấu hình tại `deploy/compose.production.yml` & `deploy/deploy-vps.sh`)
  2. **Source Code mới nhất trên Google Drive**: Thư mục gốc `1c62tp0uFUN6SoTDOCIXzIzuvtAX_62rk` (bao gồm `FE`, `MAVIS-Frontend`, `MAVIS-Platform/mavis-be`, `MAVIS.Worker`, `deploy`)
- **Mục tiêu tài liệu**:
  1. Chỉ rõ **100% các lỗi (Bugs) & điểm nghẽn UX** đang tồn tại trên bản web `https://maviss.site/` và trong source code mới nhất (đặc biệt là 3 vấn đề cốt lõi: **Hiển thị bằng chứng Code 2 đầu A ↔ B và A ↔ C trên Graph**, **Phân tích tác động khi một Service sập**, và **Cách vận hành khu vực Runtime từ A–Z**).
  2. Cung cấp **Cẩm nang hướng dẫn sử dụng nhanh** cho nhóm đồ án.
  3. Cung cấp **Bộ Prompt Đa Tác Vụ (6 Tasks chuẩn xác tới từng dòng code)** để copy-paste trực tiếp cho **AI Antigravity** thực thi.

---

## PHẦN 1: BÁO CÁO KIỂM ĐỊNH CHI TIẾT (ROOT-CAUSE AUDIT)

### 1.1. Rủi ro Triển khai (Deployment) & Lệch Code giữa 2 thư mục `FE` và `MAVIS-Frontend`
Khi kiểm tra thư mục gốc trên Google Drive và file `deploy/compose.production.yml`, phát hiện vấn đề cấu trúc cực kỳ quan trọng:
- **Hiện trạng**: Trong thư mục gốc đang tồn tại song song **2 thư mục Frontend**:
  - `MAVIS-Frontend`
  - `FE` (chứa bản cập nhật mới hơn khoảng 2 phút so với `MAVIS-Frontend`)
- **Nguyên nhân lỗi trên `https://maviss.site/`**: Trong file `deploy/compose.production.yml` (dòng 80–85):
  ```yaml
  frontend:
    build:
      context: ../MAVIS-Frontend
      dockerfile: Dockerfile
  ```
  Docker Compose trên VPS luôn build từ thư mục `../MAVIS-Frontend`. Nếu thành viên trong nhóm hoặc AI Antigravity sửa code trong thư mục `FE` mà không đồng bộ sang `MAVIS-Frontend`, web `https://maviss.site/` sẽ **không bao giờ nhận được code mới**.

---

### 1.2. Giải phẫu Vấn đề 1: Tại sao bấm vào Service A trên Graph (khi A nối với B, A nối với C) lại KHÔNG hiển thị rõ A nối B qua code nào ở A và B, A nối C qua code nào ở A và C?

Qua kiểm tra chi tiết chuỗi file Backend (`GraphBuilderServiceImpl.java`, `FeignCommunicationResolver.java`, `HttpClientVisitor.java`, `ControllerVisitor.java`, `CrossLanguageServiceLinker.java`) và Frontend (`selection-three-e.tsx`, `communication-panel.tsx`, `communication-evidence.ts`, `three-e-content.ts`, `architecture-presentation.tsx`), có **4 nguyên nhân gốc rễ (Bugs)** khiến tính năng này chưa đạt yêu cầu:

#### Bug 1.2.1 (Backend — Thiếu liên kết Code Đầu Nhận / Receiver Endpoint cho RestTemplate, WebClient, Spring Config và C# HttpClient)
- **File**: `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/graph/service/impl/GraphBuilderServiceImpl.java` (dòng 537–648) và `CrossLanguageServiceLinker.java`.
- **Chi tiết lỗi**:
  - Hiện tại, chỉ duy nhất `FeignCommunicationResolver.java` (dành cho `@FeignClient`) là có đối sánh với `REST_API` của `ControllerVisitor` để tạo đủ bộ bằng chứng `CALL_SITE` (ở Service A) và `SERVER_ENDPOINT` (ở Service B/C) kèm `communicationRole`.
  - Ngược lại, với tất cả các kiểu gọi phổ biến khác như:
    1. `REST_TEMPLATE_CALL` (`restTemplate.getForObject("http://service-b/api/...", ...)`)
    2. `WEB_CLIENT_CALL` (`webClient.get().uri("http://service-c/api/...")`)
    3. Cấu hình URL trong `application.yml` (`*.service-url`)
    4. C# `HttpClient` (`CrossLanguageServiceLinker.java`)
    Backend **chỉ lưu Evidence của phía gọi (Service A)** với `communicationRole = null`, và **bỏ qua hoàn toàn việc tìm Controller tương ứng ở Service B / Service C** dù `ControllerVisitor.java` đã bóc tách đầy đủ toàn bộ `@RestController` (`REST_API`) của Service B và C!
- **Hậu quả**: Khi bấm vào kết nối `A -> B` hoặc `A -> C` (nếu không phải OpenFeign hoặc nếu path dùng biến), hệ thống hoàn toàn mù thông tin về việc **ở Service B / C có Controller nào, dòng code số mấy đứng ra nhận request đó**.

#### Bug 1.2.2 (Backend — Không lưu tóm tắt Code 2 đầu vào `ModelRelationship.properties`)
- **File**: `GraphBuilderServiceImpl.java` (dòng 350–408 & 601–648).
- **Chi tiết lỗi**: Khi trả về đồ thị qua `GET /api/v1/analyzer/models/{modelId}/graph`, các cạnh (`edges`) chỉ có `from`, `to`, `protocol`, mà không đính kèm sẵn thông tin tóm tắt 2 đầu (`callerService`, `callerComponent`, `callerFile`, `callerLine`, `callerSnippet`, `httpMethod`, `httpPath`, `calleeService`, `calleeController`, `calleeFile`, `calleeLine`, `calleeSnippet`, `calleeRoute`) trong `edge.properties`. Do đó, khi người dùng click vào **Node A**, Frontend không có dữ liệu tức thì để hiển thị ngay danh sách **"A nối với B qua code nào ở A & B, A nối với C qua code nào ở A & C"**.

#### Bug 1.2.3 (Frontend — Click vào Node A chỉ hiện tên cạnh sơ sài, không hiện Code 2 đầu ở cuối bảng Inspector)
- **File**: `src/features/architecture/communication-panel.tsx` (dòng 12–43) và `src/features/architecture/selection-three-e.tsx` (dòng 268–317).
- **Chi tiết lỗi**:
  - Khi người dùng click vào **Service A** trên Graph, tab mặc định là `Explain`. Trong `communication-panel.tsx`, hàm `nodeCommunications(model, selectedId)` tìm được các cạnh `A -> B` và `A -> C`, nhưng giao diện **chỉ in ra đúng 1 dòng chữ** `Service A -> Service B` kèm nút `"Inspect relationship evidence"`, **không hề hiển thị**:
    - Ở **Service A** gọi bằng hàm gì, ở file nào, dòng số mấy, đoạn code nào.
    - Ở **Service B** (hoặc **Service C**) nhận bằng API/Controller nào, ở file nào, dòng số mấy, đoạn code nào.

#### Bug 1.2.4 (Frontend — Lỗi kẹt `isGroup = true` khi bấm nút `"Inspect relationship evidence"` ở chế độ Graph thu gọn)
- **File**: `src/features/architecture/architecture-presentation.tsx` (dòng 45–63) và `src/features/architecture/three-e-content.ts` (dòng 674–709).
- **Chi tiết lỗi**:
  - Ở chế độ mặc định (`expanded = false` — chỉ hiện các cục Service A, B, C), hàm `projectGraphModel` gộp các cạnh cấp Component (ví dụ `OrderService -> CatalogService` có 2 API call) thành 1 cạnh tổng hợp `proj-edge-...` chứa `underlyingEdgeIds: [edge1, edge2]`.
  - Khi người dùng bấm nút `"Inspect relationship evidence"` trên `edge1` trong `CommunicationPanel`, nó gọi `onSelect(edge1.id)`.
  - Trong `architecture-presentation.tsx` (dòng 60–63), `handleSelect(id)` lại **reset `setDrilledSourceEdgeId(null)`**!
  - Tiếp theo, `projectedEdge` tìm cạnh trong `projection.model.edges` khớp `e.underlyingEdgeIds?.includes(selectedId)` nên trả về cạnh gộp `proj-edge-...`.
  - Và tại `three-e-content.ts` (dòng 676):
    ```ts
    const isGroup = !drilledSourceEdgeId && !!projectedEdge?.underlyingEdgeIds && projectedEdge.underlyingEdgeIds.length > 1;
    ```
    Vì `drilledSourceEdgeId` bị reset về `null`, biến `isGroup` bị bật thành `true`, làm `evidenceQueryParam` biến thành `null`! Kết quả là người dùng bấm `"Inspect relationship evidence"` nhưng hệ thống **không tải bất kỳ dòng code evidence nào** mà lại bắt chọn lại từ đầu!

---

### 1.3. Giải phẫu Vấn đề 2: Tại sao không biết bấm chỗ nào để "Phân tích tác động nếu một Service sập (Change Impact / Outage Analysis)" và kết quả bị thiếu?

Qua kiểm tra `navigation.ts`, `routes/architecture.tsx`, `selection-three-e.tsx`, `routes/impact.tsx`, và `GraphServiceImpl.java`, phát hiện **4 lỗ hổng lớn**:

#### Bug 1.3.1 (Frontend UX — Không có nút kích hoạt Phân tích tác động ngay trên Graph Explorer)
- **File**: `src/routes/architecture.tsx` và `src/features/architecture/selection-three-e.tsx`.
- **Chi tiết lỗi**:
  - Luồng thao tác tự nhiên nhất của người dùng là: **Upload GitHub Repo -> Mở Graph (`/architecture`) -> Bấm vào Service B -> Muốn xem "Nếu Service B này sập thì các Service nào trên Graph bị chết theo?"**.
  - Thế nhưng trên thanh công cụ của `/architecture` và trong bảng Inspector (`SelectionThreeE`) khi bấm vào một Service **hoàn toàn không có nút nào** để kích hoạt *"Phân tích tác động / Giả lập sập Service (Simulate Outage)"* hay chuyển sang `/impact` với Service đang chọn!
  - Hơn nữa, nếu người dùng đang ở trang chủ `/` hoặc vừa ở màn hình Global, thanh Sidebar bên trái (`navigation.ts` dòng 212–220) ẩn toàn bộ menu `Architecture` (bao gồm `Change Impact Analysis`) cho đến khi vào sâu trong ngữ cảnh `project`.

#### Bug 1.3.2 (Frontend Logic — Trang `/impact` không gọi API Backend mà tự lọc thủ công 1-Hop trên Client)
- **File**: `src/routes/impact.tsx` (dòng 69–105).
- **Chi tiết lỗi**:
  - Dù trong `src/lib/api/java-operations.ts` đã viết sẵn hàm `changeImpact(projectId, elementId, modelId)` gọi xuống `GET /api/v1/analyzer/impact`, file `src/routes/impact.tsx` **không hề gọi hàm `api.changeImpact` này**!
  - Thay vào đó, `src/routes/impact.tsx` chỉ viết một bộ lọc mảng đơn giản:
    ```ts
    const impactedEdges = activeModel.edges.filter((edge) => edge.to === target.id);
    ```
  - Bộ lọc thủ công này gây ra **3 lỗi nghiêm trọng**:
    1. **Mất hoàn toàn tác động dây chuyền đa tầng (2+ Hops Cascading Failure)**: Giả sử `Service A -> Service B -> Service C`. Nếu `Service C` sập, `Service B` lỗi trực tiếp (1 Hop) và `Service A` cũng lỗi dây chuyền (2 Hops). Nhưng `edge.to === target.id` chỉ thấy `B`, hoàn toàn bỏ sót `A`!
    2. **Mất kết nối cấp Component**: Trong đồ thị gốc (`activeModel`), rất nhiều cạnh `SERVICE_HTTP_CALL` có `edge.from` là một `COMPONENT` (ví dụ `OrderService` nằm trong `order-service`) hoặc `edge.to` là một `COMPONENT`. Việc so sánh `edge.to === target.id` (khi `target` là `SERVICE_CONTAINER`) sẽ bỏ sót cạnh hoặc hiển thị tên Component rời rạc thay vì tên Service bị ảnh hưởng!
    3. **Không có Đồ thị Bán kính Ảnh hưởng (Blast Radius Graph)**: Trang `/impact` chỉ hiện bảng chữ khô khan, không có sơ đồ trực quan tô màu Đỏ (Service sập) -> Cam (Ảnh hưởng trực tiếp 1-hop) -> Vàng (Ảnh hưởng dây chuyền 2+ hops).

#### Bug 1.3.3 (Backend Logic — Thuật toán BFS trong `GraphServiceImpl.analyzeDetailedImpact` bị đứt chuỗi ở Hop 2 khi `sourceElement` là `COMPONENT`)
- **File**: `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/graph/service/impl/GraphServiceImpl.java` (dòng 447–589).
- **Chi tiết lỗi**:
  - Trong `GraphServiceImpl.analyzeDetailedImpact(UUID sessionId, UUID nodeId)`:
    - Khi tìm các cạnh gọi vào `payment-service` (`SERVICE_CONTAINER`), `rel.getSourceElement()` thường là một `COMPONENT` (ví dụ `OrderService` thuộc `order-service`).
    - Vòng lặp BFS đẩy ID của `OrderService` (`COMPONENT`) vào hàng đợi `queue`.
    - Ở bước lặp tiếp theo (Hop 2), BFS tìm các cạnh có `targetElement == OrderService` (`COMPONENT`). Nhưng các service phía trước (như `api-gateway`) lại nối vào `order-service` (`SERVICE_CONTAINER`), chứ không nối vào `OrderService` (`COMPONENT`)!
    - Kết quả: Chuỗi BFS bị đứt ngay sau Hop 1, không bao giờ tìm ra các Service bị ảnh hưởng dây chuyền ở Hop 2, Hop 3!

---

### 1.4. Giải phẫu Vấn đề 3: Tại sao khu vực Runtime (`/runtime-config`, `/scenarios`, `/sessions`) không biết xài sao và bấm chạy bị lỗi?

Qua kiểm tra `src/features/runtime/screens.tsx`, `src/features/runtime/backend.tsx`, `src/lib/api/contracts.ts`, `src/lib/api/java-operations.ts`, `RuntimeSessionServiceImpl.java`, và `RuntimeRunnerDispatcher.java`, phát hiện **5 lỗi nghiêm trọng**:

#### Bug 1.4.1 (Frontend Critical Bug — Nút `"🚀 Create & Approve Run"` trên `/scenarios` vứt bỏ toàn bộ dữ liệu người dùng vừa nhập!)
- **File**: `src/features/runtime/screens.tsx` (dòng 326–340), `src/lib/api/contracts.ts` (dòng 94–102), và `src/lib/api/java-operations.ts` (dòng 727–744).
- **Chi tiết lỗi**:
  - Trên màn hình `/scenarios` (`RuntimeScenariosView`), người dùng nhập tên kịch bản (`scenarioName`), chọn Model (`selectedModelId`), và thêm/sửa danh sách các bước HTTP request (`steps`: `method`, `path`, `expectedStatus`).
  - Nhưng khi bấm nút **"🚀 Create & Approve Run"**, code tại dòng 331–339 của `src/features/runtime/screens.tsx` lại gọi:
    ```ts
    start.mutate({
      projectId,
      snapshotId,
      scenarioId: "scen-" + Math.random().toString(16).slice(2, 8),
      configurationRevision: config.data?.revision ?? 1,
      scenarioRevision: 1,
      approved: true,
    })
    ```
  - Và trong `java-operations.ts` (dòng 732–740):
    ```ts
    const created = await request<JavaRuntimeSession>(
      "/api/v1/analyzer/runtime/sessions",
      {
        method: "POST",
        body: JSON.stringify({
          projectId: input.projectId,
          sourceSnapshotId: input.snapshotId,
          scenarioName: `Scenario ${input.scenarioId.slice(0, 8)}`,
        }),
      },
    );
    ```
  - **Toàn bộ `scenarioName`, `selectedModelId`, và mảng `steps` người dùng kỳ công nhập vào bị vứt bỏ hoàn toàn!** Backend chỉ nhận được một cái tên giả `Scenario xxxx` và `scenarioConfig = null`!

#### Bug 1.4.2 (Frontend UX — Chia cắt 3 màn hình rời rạc, bấm chạy xong không tự chuyển sang `/sessions`)
- **File**: `src/features/runtime/screens.tsx` và `src/features/runtime/backend.tsx`.
- **Chi tiết lỗi**:
  - Menu Runtime chia làm 3 mục (`Runtime Configuration`, `Runtime Scenarios`, `Runtime Sessions`) nhưng không đánh số thứ tự Bước 1 -> Bước 2 -> Bước 3, không có thanh điều hướng qua lại.
  - Khi bấm **"🚀 Create & Approve Run"** ở `/scenarios`, trang web chỉ hiện một dòng chữ nhỏ ở góc dưới mà **không tự động chuyển người dùng sang trang `/sessions`** để xem kết quả chạy.
  - Khi người dùng tự bấm vào `/sessions` (`src/features/runtime/backend.tsx`), nếu chưa tạo session nào thì màn hình trống trơn, kèm thông báo gây hoang mang: *"Automatic launch is not connected in this interface"*, và **không có nút "Chạy ngay 1-Click (Quick Start Runtime Session)"** ngay tại trang `/sessions`!

#### Bug 1.4.3 (Frontend UX — Trang `/sessions` không vẽ biểu đồ UML Sequence Diagram và không có nút mở Đồ thị `RUNTIME_ENRICHED`)
- **File**: `src/features/runtime/backend.tsx` (dòng 248–309).
- **Chi tiết lỗi**:
  - Khi một phiên Runtime chạy xong (`COMPLETED`), Backend (`RunnerReceiptIngestServiceImpl.java`) đã tự động:
    1. Tạo một `ModelVersion` mới có `origin = "RUNTIME_ENRICHED"` (nâng cấp các cạnh gọi thực tế lên `VERIFIED_RUNTIME`).
    2. Tạo một `DiagramVersion` kiểu `UML_SEQUENCE` chứa toàn bộ dữ liệu sơ đồ tuần tự (`participants` và `messages`).
  - Thế nhưng trên trang `/sessions` (`backend.tsx`), giao diện chỉ in ra một bảng text đơn điệu, **không vẽ sơ đồ UML Sequence Diagram trực quan** và **không có nút bấm để mở xem Đồ thị Kiến trúc đã được làm giàu (`View Runtime-Enriched Architecture Graph`)**!

#### Bug 1.4.4 (Backend Logic — `RuntimeRunnerDispatcher.executeSyntheticPocTrace` lấy nhầm `COMPONENT` thay vì `SERVICE_CONTAINER`)
- **File**: `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeRunnerDispatcher.java` (dòng 242–279).
- **Chi tiết lỗi**:
  - Trên môi trường Cloud VPS (`https://maviss.site/`), container `backend` không có Docker-in-Docker hay `.NET SDK`, nên `RuntimeRunnerDispatcher` sẽ tự động chuyển sang nhánh 2 (`executeSyntheticPocTrace`) để mô phỏng thực thi và sinh OpenTelemetry Trace từ Model tĩnh + Scenario.
  - Tuy nhiên, ở dòng 243–244:
    ```java
    ModelElement caller = rel.getSourceElement();
    ModelElement callee = rel.getTargetElement();
    ```
    Vì `rel.getSourceElement()` của các cạnh `SERVICE_HTTP_CALL` thường là một `COMPONENT` (như `OrderService` bên trong `order-service`), nên `caller.getId()` là ID của Component chứ không phải ID của `SERVICE_CONTAINER` (`order-service`).
  - Khi `RunnerReceiptIngestServiceImpl.java` nhận `RunnerObservedInteractionDTO`, nó chỉ đối sánh với các node có `elementType == "SERVICE_CONTAINER"`! Do `fromModelServiceId` truyền vào là ID của `COMPONENT`, `RunnerReceiptIngestServiceImpl` báo không khớp Service Container và **không nâng cấp được cạnh nối giữa 2 Service lên trạng thái `VERIFIED_RUNTIME`**!

---

## PHẦN 2: CẨM NANG HƯỚNG DẪN SỬ DỤNG NHANH CHO EM (TRÊN WEB HIỆN TẠI & SAU KHI ANTIGRAVITY CẬP NHẬT)

### 2.1. Cách xem Service A nối với Service B và Service C qua code nào ở cả 2 đầu
1. Vào dự án của em -> Chọn menu **Architecture Graph Explorer** (`/architecture`).
2. Trên sơ đồ Graph, **bấm trực tiếp vào cục Service A**:
   - **Ngay lập tức ở phần cuối bảng bên phải (Inspector)** sẽ xuất hiện mục **"🔗 KẾT NỐI DỊCH VỤ & BẰNG CHỨNG CODE 2 ĐẦU (A ↔ B, A ↔ C)"**.
   - Tại đây hệ thống liệt kê từng cặp kết nối của A (ví dụ: **`Service A ➔ Service B`** và **`Service A ➔ Service C`**, trong khi B và C không nối nhau thì không hiện).
   - Trong mỗi thẻ kết nối (ví dụ `A ➔ B`), em sẽ thấy rõ **2 khung đối xứng**:
     - **📤 Đầu gọi tại Service A (Caller Code)**: Chỉ rõ class nào trong A gọi (ví dụ `OrderService`), nằm ở file nào, dòng bao nhiêu (`OrderService.java:42`), gọi HTTP Method & API nào (`POST /api/payments`), kèm đoạn code thực tế tại A.
     - **📥 Đầu nhận tại Service B (Receiver / Controller API Code)**: Chỉ rõ Controller nào trong B nhận request đó (ví dụ `PaymentController`), nằm ở file nào, dòng bao nhiêu (`PaymentController.java:28`), khai báo `@PostMapping` nào, kèm đoạn code hàm xử lý tại B.
   - Tương tự ngay bên dưới là thẻ **`Service A ➔ Service C`** với đầy đủ code ở A và code ở C.

### 2.2. Cách bấm "Phân tích tác động nếu một Service sập (Outage / Blast Radius)"
Em có **2 cách cực nhanh** ngay sau khi phân tích code ra Graph:
- **Cách 1 (Ngay trên màn hình Graph `/architecture`)**:
  - Bấm vào bất kỳ Service nào trên Graph (ví dụ bấm vào `Service B` hoặc `Service C`).
  - Trong bảng bên phải (hoặc trên thanh công cụ phía trên Graph), bấm nút màu đỏ cam: **"💥 Phân tích tác động nếu Service này sập (Simulate Outage)"**.
  - Ngay lập tức trên Graph sẽ bật **Chế độ Bán kính Ảnh hưởng (Outage Blast Radius Overlay)**:
    - Cục **Service bị sập** tô viền **Đỏ rực (`[CRASHED / TARGET]`)**.
    - Các Service gọi trực tiếp vào nó bị lỗi ngay lập tức tô màu **Cam đậm (`[1-HOP DIRECT FAILURE]`)**.
    - Các Service gọi gián tiếp bị lỗi dây chuyền tô màu **Vàng hổ phách (`[2+ HOPS CASCADING FAILURE]`)**.
    - Các Service không liên quan được làm mờ đi để nhìn rõ luồng sập.
- **Cách 2 (Xem báo cáo chi tiết tại trang `/impact`)**:
  - Từ nút **"Mở Báo cáo Tác động Chi tiết (Full Impact Report)"** trên Graph hoặc chọn menu **Change Impact Analysis** (`/impact`) ở thanh bên trái.
  - Chọn Service giả định bị sập -> Hệ thống hiển thị cả **Sơ đồ Bán kính Ảnh hưởng (Blast Radius Graph)** lẫn danh sách chi tiết từng Service bị chết theo (kèm tên API và dòng code bị lỗi khi gọi vào Service sập).

### 2.3. Cách sử dụng khu vực Runtime (`/runtime-config` -> `/scenarios` -> `/sessions`)
Sau khi áp dụng bản sửa lỗi bên dưới, khu vực Runtime được gom thành **Quy trình 3 bước có thanh hướng dẫn trực quan** (hoặc **Chạy 1-Click** ngay tại `/sessions`):
- **Cách nhanh nhất (1-Click Quick Run)**:
  1. Vào thẳng menu **Runtime Sessions** (`/sessions`).
  2. Bấm nút **"⚡ Chạy Kiểm thử Runtime Tự động (1-Click Auto Verify)"**.
  3. Hệ thống tự động tạo kịch bản từ các API thực tế của dự án, duyệt chạy (Approve & Dispatch), thu thập OpenTelemetry Spans, vẽ **Sơ đồ Tuần tự (UML Sequence Diagram)** ngay trên màn hình và hiện nút **"🔍 Mở Graph Đã Xác Thực Runtime (`RUNTIME_ENRICHED`)"**!
- **Cách tùy chỉnh kịch bản từng bước (3-Step Guided Flow)**:
  1. **Bước 1 (`/runtime-config`)**: Kiểm tra hạn mức CPU/RAM/Timeout -> Bấm **"Lưu & Sang Bước 2 (Kịch bản)"**.
  2. **Bước 2 (`/scenarios`)**: Đặt tên kịch bản, thêm các bước gọi API (`GET /api/orders`, `POST /api/checkout`, ...) -> Bấm **"🚀 Tạo & Chạy Thực Nghiệm Ngay"**.
  3. **Bước 3 (`/sessions`)**: Hệ thống tự động chuyển sang `/sessions`, tự động chạy và cập nhật trạng thái (`ALLOCATED` -> `RUNNING` -> `COMPLETED`), hiển thị **Sequence Diagram** và danh sách các kết nối đã được xác thực Runtime (`VERIFIED_RUNTIME`).

---

## PHẦN 3: SIÊU PROMPT ĐA TÁC VỤ CHO AI ANTIGRAVITY (COPY TOÀN BỘ PHẦN NÀY ĐƯA CHO ANTIGRAVITY)

> **Hướng dẫn cho em**: Em có thể copy nguyên văn toàn bộ khối lệnh từ đây đến hết file (hoặc copy từng `TASK 1` -> `TASK 6`) dán vào **Antigravity** để AI tự động sửa toàn bộ Backend Java và Frontend Next.js.

```markdown
# SYSTEM INSTRUCTION FOR ANTIGRAVITY AI CODING AGENT
Bạn là Principal Full-Stack Architect phụ trách dự án MAVIS (Spring Boot Java Backend + .NET Worker/Runner + Next.js App Router Frontend).
Hãy thực hiện chính xác, đầy đủ và tuần tự 6 TASK dưới đây. Không được làm tắt, không để lại TODO hay placeholder, và phải đồng bộ code giữa các thư mục Frontend trước khi kết thúc.

================================================================================
## TASK 1: ĐỒNG BỘ THƯ MỤC FRONTEND (`FE` <-> `MAVIS-Frontend`) & CẤU HÌNH DEPLOY
================================================================================

### Mục tiêu
Trong workspace đang có thể tồn tại 2 thư mục Frontend (`FE` và `MAVIS-Frontend`), trong khi `deploy/compose.production.yml` build image từ `../MAVIS-Frontend`. Cần đảm bảo mọi thay đổi ở Frontend được áp dụng trên thư mục chính và đồng bộ 100% sang thư mục còn lại (nếu cả 2 cùng tồn tại).

### Hành động bắt buộc
1. Kiểm tra xem thư mục gốc có cả `FE/` và `MAVIS-Frontend/` hay không.
2. Áp dụng toàn bộ các thay đổi Frontend (ở Task 3, Task 4, Task 5, Task 6) vào thư mục code mới nhất (`FE` hoặc `MAVIS-Frontend`), sau đó đồng bộ (rsync/copy) toàn bộ `src/` và `app/` giữa `FE` và `MAVIS-Frontend` để `deploy/compose.production.yml` luôn build đúng code mới nhất.
3. Trong `deploy/compose.production.yml`, tại service `backend`, đảm bảo có đủ biến môi trường cho phép Runtime Dispatcher tự động chạy chế độ `AUTO` (tự động fallback sang Synthetic Trace dựa trên Model thật khi chạy trên Cloud container không có Docker socket):
   ```yaml
   MAVIS_RUNNER_AUTO_DISPATCH_ENABLED: "true"
   MAVIS_RUNNER_MODE: "AUTO"
   MAVIS_RUNNER_ALLOW_UNVERIFIED_POC_PROMOTION: "true"
   ```

================================================================================
## TASK 2: NÂNG CẤP BACKEND JAVA — ĐỐI SÁNH BẰNG CHỨNG CODE 2 ĐẦU (BILATERAL CODE EVIDENCE: CALLER Ở SERVICE A + RECEIVER CONTROLLER Ở SERVICE B/C)
================================================================================

### Mục tiêu
Khi Service A nối với Service B (`A -> B`) và Service A nối với Service C (`A -> C`) thông qua bất kỳ giao thức HTTP nào (`OPENFEIGN`, `REST_TEMPLATE_CALL`, `WEB_CLIENT_CALL`, `SpringConfig *.service-url`, hoặc `C# HttpClient`), Backend phải:
1. Lưu **Bằng chứng Đầu Gọi (Caller Evidence ở Service A)** với `communicationRole = "CALL_SITE"` (hoặc `"CLIENT_DECLARATION"` / `"CLIENT_CONFIGURATION"`).
2. Tự động tìm và đính kèm **Bằng chứng Đầu Nhận (Receiver / Server Endpoint Evidence ở Service B hoặc Service C)** với `communicationRole = "SERVER_ENDPOINT"` bằng cách đối sánh với danh sách `REST_API` (`ControllerVisitor`) thuộc về Service B hoặc Service C!
3. Ghi rõ thông tin tóm tắt 2 đầu (`callerService`, `callerComponent`, `callerFile`, `callerLine`, `callerSnippet`, `httpMethod`, `httpPath`, `calleeService`, `calleeController`, `calleeFile`, `calleeLine`, `calleeSnippet`, `calleeRoute`) vào trực tiếp `ModelRelationship.properties` để Frontend hiển thị tức thì khi người dùng bấm vào Service A, B, C hoặc cạnh nối!

### File cần sửa: `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/graph/service/impl/GraphBuilderServiceImpl.java`

1. **Bổ sung helper tìm `SERVICE_CONTAINER` cha của bất kỳ `ModelElement` nào** trong `GraphBuilderServiceImpl.java`:
```java
private ModelElement resolveOwningServiceContainer(ModelElement element) {
    Set<ModelElement> visited = Collections.newSetFromMap(new IdentityHashMap<>());
    for (ModelElement cur = element; cur != null && visited.add(cur); cur = cur.getParentElement()) {
        if ("SERVICE_CONTAINER".equalsIgnoreCase(cur.getElementType())) {
            return cur;
        }
    }
    return element;
}
```

2. **Bổ sung hàm `findMatchingServerEndpoints` để tìm `REST_API` (`ControllerVisitor`) ở Service đích (Service B hoặc Service C)**:
```java
private List<CodeEvidenceDTO> findMatchingServerEndpoints(
        ModelElement targetElement,
        String httpMethod,
        String rawUrlOrPath,
        List<CodeEvidenceDTO> allEvidences,
        List<ModelElement> allSavedElements) {
    if (targetElement == null || allEvidences == null) {
        return List.of();
    }
    ModelElement targetService = resolveOwningServiceContainer(targetElement);
    if (targetService == null || !"SERVICE_CONTAINER".equalsIgnoreCase(targetService.getElementType())) {
        return List.of();
    }

    // Lấy toàn bộ REST_API thuộc về targetService
    List<CodeEvidenceDTO> targetServiceApis = allEvidences.stream()
            .filter(ev -> "REST_API".equalsIgnoreCase(ev.getElementType()))
            .filter(ev -> {
                ModelElement owner = ArchitectureResolver.owner(allSavedElements, ev.getFilePath());
                return owner != null && ArchitectureResolver.same(targetService, owner);
            })
            .toList();

    if (targetServiceApis.isEmpty()) {
        return List.of();
    }

    // Trích xuất path từ rawUrlOrPath (VD: "http://payment-service:8082/api/payments/{id}" -> "/api/payments/{id}")
    String extractedPath = extractPathFromUrl(rawUrlOrPath);
    String normalizedTargetRoute = com.mavis.analyzer.javaanalyzer.visitor.SpringHttpMappings.routeKey(extractedPath);
    String verb = httpMethod != null ? httpMethod.trim().toUpperCase(Locale.ROOT) : "";

    // Ưu tiên 1: Khớp chính xác routeKey và HTTP Method
    if (!normalizedTargetRoute.isBlank() && !"/".equals(normalizedTargetRoute)) {
        List<CodeEvidenceDTO> exactMatches = targetServiceApis.stream()
                .filter(api -> {
                    String apiRoute = com.mavis.analyzer.javaanalyzer.visitor.SpringHttpMappings.routeKey(api.getIdentifier());
                    if (!apiRoute.equals(normalizedTargetRoute) && !apiRoute.endsWith(normalizedTargetRoute) && !normalizedTargetRoute.endsWith(apiRoute)) {
                        return false;
                    }
                    String apiVerb = String.valueOf(api.getMetadata().getOrDefault("httpMethod", "ANY")).toUpperCase(Locale.ROOT);
                    return verb.isBlank() || "ANY".equals(verb) || "ANY".equals(apiVerb) || verb.equals(apiVerb);
                })
                .toList();
        if (!exactMatches.isEmpty()) {
            return exactMatches;
        }

        // Ưu tiên 2: Khớp theo prefix segment đầu tiên (VD: "/api/payments" hoặc "/orders")
        String firstSegment = Arrays.stream(extractedPath.split("/"))
                .filter(s -> !s.isBlank() && !s.startsWith("{") && !s.equalsIgnoreCase("api") && !s.equalsIgnoreCase("v1"))
                .findFirst()
                .orElse("");
        if (!firstSegment.isBlank()) {
            List<CodeEvidenceDTO> prefixMatches = targetServiceApis.stream()
                    .filter(api -> api.getIdentifier() != null && api.getIdentifier().toLowerCase(Locale.ROOT).contains(firstSegment.toLowerCase(Locale.ROOT)))
                    .limit(2)
                    .toList();
            if (!prefixMatches.isEmpty()) {
                return prefixMatches;
            }
        }
    }

    // Ưu tiên 3: Nếu call qua config URL gốc (chưa rõ path cụ thể), đính kèm tối đa 2 REST_API tiêu biểu của Service đích làm bằng chứng đầu nhận
    return targetServiceApis.stream().limit(2).toList();
}

private String extractPathFromUrl(String rawUrl) {
    if (rawUrl == null || rawUrl.isBlank()) return "";
    String cleaned = rawUrl.trim();
    cleaned = cleaned.replaceAll("\\$\\{[^}]+\\}", "");
    if (cleaned.contains("://")) {
        int slashAfterHost = cleaned.indexOf('/', cleaned.indexOf("://") + 3);
        return slashAfterHost >= 0 ? cleaned.substring(slashAfterHost) : "";
    }
    if (cleaned.startsWith("/")) {
        return cleaned;
    }
    int firstSlash = cleaned.indexOf('/');
    return firstSlash >= 0 ? cleaned.substring(firstSlash) : "";
}
```

3. **Cập nhật nơi tạo `ModelRelationship` cho Feign, RestTemplate, WebClient, và Spring Config URL trong `GraphBuilderServiceImpl.java`**:
- Với **Feign** (dòng 601–616): Ngoài các thuộc tính sẵn có trong `connection.properties()`, ghi bổ sung các trường chuẩn hóa vào `props`:
  - Lấy `Proof` có role `"CALL_SITE"` (hoặc `"CLIENT_CONTRACT"` / `"CLIENT_DECLARATION"` nếu chưa có call site) để ghi:
    - `callerService`: tên Service A (`resolveOwningServiceContainer(connection.source()).getName()`)
    - `callerComponent`: `connection.source().getName()`
    - `callerFile`: `callerProof.fact().getFilePath()`
    - `callerLine`: `callerProof.fact().getLineNumber()`
    - `callerSnippet`: `callerProof.fact().getCodeSnippet()`
  - Lấy `Proof` có role `"SERVER_ENDPOINT"` (hoặc gọi `findMatchingServerEndpoints` nếu `SERVER_ENDPOINT` chưa tìm thấy) để ghi:
    - `calleeService`: tên Service B (`resolveOwningServiceContainer(connection.target()).getName()`)
    - `calleeController`: `serverProof.fact().getSourceComponent()`
    - `calleeFile`: `serverProof.fact().getFilePath()`
    - `calleeLine`: `serverProof.fact().getLineNumber()`
    - `calleeRoute`: `serverProof.fact().getIdentifier()`
    - `calleeSnippet`: `serverProof.fact().getCodeSnippet()`
- Với **`REST_TEMPLATE_CALL` và `WEB_CLIENT_CALL`** (dòng 626–648) và **Spring Config URL** (dòng 350–408):
  - Khi lưu `Evidence` của phía gọi (Service A), **bắt buộc truyền `communicationRole = "CALL_SITE"`** (hoặc `"CLIENT_CONFIGURATION"` đối với file cấu hình `.yml`/`.properties`).
  - Gọi `findMatchingServerEndpoints(targetNode, httpMethod, ev.getIdentifier(), javaEvidences, savedElements)`:
    - Với mỗi endpoint khớp ở Service B/C, gọi `buildEvidenceEntity(snapshot, modelVersion, sourceNode, rel, endpointEv, "SERVER_ENDPOINT")` để lưu **Bằng chứng Đầu Nhận (Receiver Proof)** vào bảng `evidences`!
    - Đồng thời ghi đầy đủ `callerService`, `callerComponent`, `callerFile`, `callerLine`, `callerSnippet`, `httpMethod`, `httpPath`, `calleeService`, `calleeController`, `calleeFile`, `calleeLine`, `calleeRoute`, `calleeSnippet` vào `rel.getProperties()`!

---

================================================================================
## TASK 3: NÂNG CẤP FRONTEND — HIỂN THỊ RÕ RÀNG "A NỐI VỚI B QUA CODE NÀO Ở A VÀ B, A NỐI VỚI C QUA CODE NÀO Ở A VÀ C" KHI BẤM VÀO SERVICE A TRÊN GRAPH
================================================================================

### Mục tiêu
1. Sửa dứt điểm lỗi `isGroup` làm kẹt không tải được Evidence khi bấm `"Inspect relationship evidence"` trong `SelectionThreeE` / `ArchitecturePresentation`.
2. Khi người dùng bấm vào **Service A** trên Graph (ví dụ có 3 service A, B, C; A nối B, A nối C, giữa B và C không nối nhau):
   - Ở cuối bảng Inspector bên phải (`SelectionThreeE`), hiển thị một khu vực chuyên biệt, rõ ràng:
     **"🔗 CHI TIẾT KẾT NỐI GIỮA CÁC SERVICE & BẰNG CHỨNG CODE 2 ĐẦU"**
   - Liệt kê từng cặp kết nối của Service A:
     - **Kết nối 1: `Service A ➔ Service B`** (chỉ rõ Giao thức, HTTP Method + API Path)
       - **📤 Code tại Service A (Đầu gọi / Caller)**: Tên Component/Class ở A, File & Dòng (`filePath:lineNumber`), và đoạn Code thực tế tại A.
       - **📥 Code tại Service B (Đầu nhận / Receiver API)**: Tên Controller/Handler ở B, File & Dòng (`filePath:lineNumber`), API Route, và đoạn Code xử lý thực tế tại B.
     - **Kết nối 2: `Service A ➔ Service C`**
       - **📤 Code tại Service A (Đầu gọi / Caller)**: Tên Component/Class ở A, File & Dòng (`filePath:lineNumber`), và đoạn Code thực tế tại A.
       - **📥 Code tại Service C (Đầu nhận / Receiver API)**: Tên Controller/Handler ở C, File & Dòng (`filePath:lineNumber`), API Route, và đoạn Code xử lý thực tế tại C.
   - Bấm vào bất kỳ kết nối nào cũng xem được đầy đủ hoặc phóng to toàn bộ Evidence mà không bao giờ bị lỗi trống!

### 3.1. Sửa file `src/features/architecture/architecture-presentation.tsx`
Trong `src/features/architecture/architecture-presentation.tsx`, sửa hàm `handleSelect` để khi `id` được truyền vào là một **cạnh thành phần gốc (`underlyingEdgeId`)** nằm bên trong một cạnh gộp `proj-edge-...`, hệ thống tự động gán `drilledSourceEdgeId = id` thay vì reset về `null`:

```tsx
const handleSelect = (id: string | null) => {
  if (!id) {
    setSelectedId(null);
    setDrilledSourceEdgeId(null);
    return;
  }
  const matchingProjectedEdge = projection.model.edges.find(
    (e) => e.id === id || e.underlyingEdgeIds?.includes(id),
  );
  if (
    matchingProjectedEdge &&
    matchingProjectedEdge.id !== id &&
    matchingProjectedEdge.underlyingEdgeIds?.includes(id)
  ) {
    setSelectedId(matchingProjectedEdge.id);
    setDrilledSourceEdgeId(id);
  } else {
    setSelectedId(id);
    setDrilledSourceEdgeId(null);
  }
};
```

### 3.2. Nâng cấp file `src/features/architecture/communication-panel.tsx`
Cập nhật `CommunicationPanel` trong `src/features/architecture/communication-panel.tsx` để:
1. Tự động gọi hook `useElementEvidenceContext(projectId, model.id, selectedId)` khi `selectedId` là một Service/Node nhằm lấy toàn bộ Evidence của các cạnh nối vào/ra Node đó, kết hợp với dữ liệu `edge.properties` (`callerFile`, `callerLine`, `callerSnippet`, `calleeFile`, `calleeLine`, `calleeSnippet`, `httpMethod`, `httpPath`).
2. Gom nhóm các kết nối theo từng Service đối tác (ví dụ: **`Service A ➔ Service B`**, **`Service A ➔ Service C`**, hoặc chiều gọi vào **`Service X ➔ Service A`**).
3. Trong mỗi thẻ kết nối (`A ➔ B`, `A ➔ C`), hiển thị trực tiếp **2 khối Code (Đầu A và Đầu B/C)** ngay tại chỗ mà không bắt người dùng phải bấm qua nhiều tab ẩn:

```tsx
import { Code2, ArrowRight, FileCode2, Server, Send, ExternalLink } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useElementEvidenceContext } from "@/lib/api/hooks";
import type { ArchitecturalModel, Evidence } from "@/types/domain";
import {
  communicationDescription,
  communicationEvidenceRole,
  communicationTitle,
  feignContract,
  nodeCommunications,
} from "./communication-evidence";

function resolveServiceContainer(model: ArchitecturalModel, elementId: string) {
  const byId = new Map(model.elements.map((el) => [el.id, el]));
  let cur = byId.get(elementId);
  const visited = new Set<string>();
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    if (cur.kind === "service" || !cur.parentId) return cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return byId.get(elementId);
}

export function CommunicationPanel({
  projectId,
  model,
  selectedId,
  onSelect,
}: {
  projectId?: string;
  model: ArchitecturalModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const names = new Map(model.elements.map((node) => [node.id, node.name]));
  const selectedNode = model.elements.find((node) => node.id === selectedId);
  const selectedEdge = model.edges.find((edge) => edge.id === selectedId);

  // Tự động tải toàn bộ Evidence của Node đang chọn (bao gồm cả các cạnh con)
  const contextQuery = useElementEvidenceContext(
    projectId ?? model.projectId,
    model.id,
    selectedNode ? selectedNode.id : null,
  );

  // Map relationshipId -> danh sách Evidence từ API
  const evidenceByRelId = new Map<string, Evidence[]>();
  if (contextQuery.data?.relationships) {
    for (const rel of contextQuery.data.relationships) {
      evidenceByRelId.set(rel.relationshipId, rel.evidences ?? []);
    }
  }

  if (selectedEdge) {
    // Hiển thị chi tiết hợp đồng giao tiếp cho cạnh đang chọn
    const contract = feignContract(selectedEdge);
    const description = communicationDescription(selectedEdge);
    const p = selectedEdge.properties ?? {};
    if (!contract && !description && !p.callerFile && !p.calleeFile) return null;

    return (
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5 text-sky-400" />
            {communicationTitle(selectedEdge)}
          </p>
          <Badge tone={selectedEdge.evidenceIds.length ? "source" : "neutral"}>
            {selectedEdge.evidenceIds.length} source proof(s)
          </Badge>
        </div>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
        {(p.callerFile || p.calleeFile) && (
          <div className="grid gap-2 pt-1">
            {p.callerFile && (
              <div className="rounded border border-border/80 bg-background/80 p-2">
                <div className="flex items-center justify-between gap-1 font-medium text-sky-400">
                  <span>📤 Đầu gọi (Caller): {String(p.callerService || names.get(selectedEdge.from) || "")}</span>
                  <span className="font-mono text-[11px]">{String(p.callerFile)}{p.callerLine ? `:${p.callerLine}` : ""}</span>
                </div>
                {p.callerSnippet && (
                  <pre className="mt-1.5 overflow-x-auto rounded bg-muted/60 p-2 font-mono text-[11px] text-foreground">
                    {String(p.callerSnippet)}
                  </pre>
                )}
              </div>
            )}
            {p.calleeFile && (
              <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
                <div className="flex items-center justify-between gap-1 font-medium text-emerald-400">
                  <span>📥 Đầu nhận (Receiver API): {String(p.calleeService || names.get(selectedEdge.to) || "")}</span>
                  <span className="font-mono text-[11px]">{String(p.calleeFile)}{p.calleeLine ? `:${p.calleeLine}` : ""}</span>
                </div>
                {p.calleeRoute && (
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">Endpoint: {String(p.calleeRoute)}</p>
                )}
                {p.calleeSnippet && (
                  <pre className="mt-1.5 overflow-x-auto rounded bg-muted/60 p-2 font-mono text-[11px] text-foreground">
                    {String(p.calleeSnippet)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!selectedId) return null;
  const items = nodeCommunications(model, selectedId);
  if (!items.length) return null;

  return (
    <div className="rounded-lg border-2 border-sky-500/30 bg-sky-500/5 p-3.5 text-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Code2 className="h-4 w-4" />
            Kết nối Dịch vụ & Bằng chứng Code 2 Đầu ({items.length})
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Hiển thị chính xác {selectedNode?.name ?? "Service"} nối với các Service khác qua file code nào, dòng nào và API nào ở cả 2 phía.
          </p>
        </div>
        <Badge tone="source">{items.length} kết nối</Badge>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const fromSvc = resolveServiceContainer(model, item.from);
          const toSvc = resolveServiceContainer(model, item.to);
          const fromComponentName = names.get(item.from) ?? item.from;
          const toComponentName = names.get(item.to) ?? item.to;
          const fromServiceName = fromSvc?.name ?? fromComponentName;
          const toServiceName = toSvc?.name ?? toComponentName;

          const p = item.properties ?? {};
          const relEvidences = evidenceByRelId.get(item.id) ?? [];

          // Tách bằng chứng Đầu Gọi (Caller ở A) và Đầu Nhận (Receiver ở B/C)
          const callerEvidences = relEvidences.filter(
            (ev) =>
              ev.communicationRole === "CALL_SITE" ||
              ev.communicationRole === "CLIENT_DECLARATION" ||
              ev.communicationRole === "CLIENT_CONTRACT" ||
              ev.communicationRole === "CLIENT_CONFIGURATION" ||
              (!ev.communicationRole && !ev.summary?.includes("REST_API")),
          );
          const receiverEvidences = relEvidences.filter(
            (ev) => ev.communicationRole === "SERVER_ENDPOINT" || ev.summary?.includes("REST_API"),
          );

          const httpMethod = typeof p.httpMethod === "string" && p.httpMethod ? p.httpMethod : "";
          const httpPath = typeof p.httpPath === "string" && p.httpPath ? p.httpPath : "";

          return (
            <div
              key={item.id}
              className="rounded-md border border-border bg-background/95 p-3 shadow-sm space-y-2.5"
            >
              {/* Header: Service A -> Service B */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                  <span className="rounded bg-sky-500/15 px-2 py-0.5 text-sky-400 border border-sky-500/30">
                    {fromServiceName}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-400 border border-emerald-500/30">
                    {toServiceName}
                  </span>
                </div>
                <Badge tone="source">{communicationTitle(item)}</Badge>
              </div>

              {/* Tóm tắt API / Giao thức */}
              {(httpMethod || httpPath || p.clientInterface) && (
                <div className="flex flex-wrap items-center gap-2 rounded bg-muted/50 px-2.5 py-1.5 font-mono text-[11px]">
                  {httpMethod && (
                    <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-bold text-sky-300">
                      {httpMethod}
                    </span>
                  )}
                  {httpPath && <span className="text-foreground font-semibold">{httpPath}</span>}
                  {p.clientInterface && (
                    <span className="text-muted-foreground ml-auto">
                      Client: {String(p.clientInterface).split(".").pop()}
                      {p.clientMethod ? `.${String(p.clientMethod)}()` : ""}
                    </span>
                  )}
                </div>
              )}

              {/* PHẦN 1: CODE TẠI ĐẦU GỌI (SERVICE A - CALLER) */}
              <div className="rounded border border-sky-500/25 bg-sky-500/[0.04] p-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-sky-400 flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    1. Code tại {fromServiceName} (Đầu gọi / Caller)
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Component: {fromComponentName}
                  </span>
                </div>

                {callerEvidences.length > 0 ? (
                  callerEvidences.map((ev) => (
                    <div key={ev.id} className="space-y-1 pt-1 border-t border-border/40 first:border-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        <span className="font-medium text-foreground">
                          {communicationEvidenceRole(ev) ?? "Caller Source Code"}
                        </span>
                        <span className="font-mono text-sky-300 bg-sky-950/50 px-1.5 py-0.5 rounded">
                          {ev.filePath}{ev.line ? ` : dòng ${ev.line}` : ""}
                        </span>
                      </div>
                      {ev.excerpt && (
                        <pre className="overflow-x-auto rounded bg-slate-950/90 p-2 font-mono text-[11px] text-slate-100 border border-slate-800">
                          {ev.excerpt}
                        </pre>
                      )}
                    </div>
                  ))
                ) : p.callerFile ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span className="font-medium text-foreground">Vị trí gọi trong Source</span>
                      <span className="font-mono text-sky-300 bg-sky-950/50 px-1.5 py-0.5 rounded">
                        {String(p.callerFile)}{p.callerLine ? ` : dòng ${String(p.callerLine)}` : ""}
                      </span>
                    </div>
                    {p.callerSnippet && (
                      <pre className="overflow-x-auto rounded bg-slate-950/90 p-2 font-mono text-[11px] text-slate-100 border border-slate-800">
                        {String(p.callerSnippet)}
                      </pre>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    {contextQuery.isLoading
                      ? "Đang tải bằng chứng code tại đầu gọi..."
                      : "Bấm nút xem chi tiết bên dưới để tải đoạn code tại đầu gọi."}
                  </p>
                )}
              </div>

              {/* PHẦN 2: CODE TẠI ĐẦU NHẬN (SERVICE B/C - RECEIVER CONTROLLER) */}
              <div className="rounded border border-emerald-500/25 bg-emerald-500/[0.04] p-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    2. Code tại {toServiceName} (Đầu nhận / Receiver API)
                  </span>
                  {p.calleeController && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Controller: {String(p.calleeController)}
                    </span>
                  )}
                </div>

                {receiverEvidences.length > 0 ? (
                  receiverEvidences.map((ev) => (
                    <div key={ev.id} className="space-y-1 pt-1 border-t border-border/40 first:border-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        <span className="font-medium text-foreground">
                          {communicationEvidenceRole(ev) ?? "Receiver HTTP Endpoint"}
                        </span>
                        <span className="font-mono text-emerald-300 bg-emerald-950/50 px-1.5 py-0.5 rounded">
                          {ev.filePath}{ev.line ? ` : dòng ${ev.line}` : ""}
                        </span>
                      </div>
                      {ev.excerpt && (
                        <pre className="overflow-x-auto rounded bg-slate-950/90 p-2 font-mono text-[11px] text-slate-100 border border-slate-800">
                          {ev.excerpt}
                        </pre>
                      )}
                    </div>
                  ))
                ) : p.calleeFile ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span className="font-medium text-foreground">
                        Endpoint nhận: {String(p.calleeRoute || httpPath || "REST Controller")}
                      </span>
                      <span className="font-mono text-emerald-300 bg-emerald-950/50 px-1.5 py-0.5 rounded">
                        {String(p.calleeFile)}{p.calleeLine ? ` : dòng ${String(p.calleeLine)}` : ""}
                      </span>
                    </div>
                    {p.calleeSnippet && (
                      <pre className="overflow-x-auto rounded bg-slate-950/90 p-2 font-mono text-[11px] text-slate-100 border border-slate-800">
                        {String(p.calleeSnippet)}
                      </pre>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    {p.serverMatch === "NOT_FOUND_IN_IMPORTED_SOURCE"
                      ? `Không tìm thấy Controller khớp trực tiếp đường dẫn ${httpPath || "này"} trong source của ${toServiceName} (hoặc cấu hình qua biến môi trường).`
                      : "Bấm vào kết nối này để mở toàn bộ bằng chứng Endpoint phía nhận."}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelect(item.id)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Mở toàn bộ Bằng chứng & AI Giải thích cho kết nối {fromServiceName} ➔ {toServiceName}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 3.3. Truyền `projectId` vào `<CommunicationPanel>` trong `src/features/architecture/selection-three-e.tsx`
Tại dòng 289 của `src/features/architecture/selection-three-e.tsx`:
- Sửa `<CommunicationPanel model={model} selectedId={edge?.id ?? node?.id ?? selectedId} onSelect={onSelect} />` thành:
  ```tsx
  <CommunicationPanel
    projectId={projectId}
    model={model}
    selectedId={edge?.id ?? node?.id ?? selectedId}
    onSelect={onSelect}
  />
  ```
- Đồng thời đưa `<CommunicationPanel>` hiển thị **ở cả dưới đáy bảng Inspector (bên ngoài tab hoặc luôn hiển thị ở cuối tab `Explain` và tab `Evidence`)** khi người dùng chọn một Service Node `A`, để vừa bấm vào `A` là nhìn thấy ngay toàn bộ kết nối `A ➔ B` và `A ➔ C` kèm code 2 đầu ở cuối bảng!

---

================================================================================
## TASK 4: NÂNG CẤP TOÀN DIỆN "PHÂN TÍCH TÁC ĐỘNG NẾU MỘT SERVICE SẬP (SERVICE OUTAGE & CHANGE IMPACT ANALYSIS)"
================================================================================

### Mục tiêu
1. **Ở Backend (`GraphServiceImpl.java`)**: Sửa lỗi đứt chuỗi BFS đa tầng khi `rel.getSourceElement()` hoặc `rel.getTargetElement()` là `COMPONENT` thay vì `SERVICE_CONTAINER`.
2. **Ngay trên màn hình Graph (`/architecture` & `SelectionThreeE`)**:
   - Thêm nút nổi bật **"💥 Phân tích tác động nếu Service này sập (Simulate Outage)"** ngay trong bảng Inspector khi người dùng bấm vào bất kỳ Service nào trên Graph!
   - Thêm chế độ **"🔥 Mô phỏng Sập Service (Outage Blast Radius Overlay)"** ngay trên thanh công cụ của `/architecture` để tô màu trực tiếp trên đồ thị:
     - **Màu Đỏ**: Service bị sập (`Target Outage Service`).
     - **Màu Cam**: Các Service bị chết/lỗi trực tiếp vì gọi thẳng vào Service sập (`1-Hop Direct Impact`).
     - **Màu Vàng**: Các Service bị lỗi dây chuyền (`2+ Hops Cascading Impact`).
   - Thêm nút chuyển thẳng sang trang báo cáo đầy đủ `/impact?project=${projectId}&model=${model.id}&element=${node.id}`.
3. **Ở màn hình `/impact` (`src/routes/impact.tsx`)**:
   - Kết nối với thuật toán truy vết đa tầng (BFS nhiều hop + quy chiếu Component về Service Container cha) VÀ gọi API `useChangeImpact` từ Backend.
   - Bổ sung **Sơ đồ Bán kính Tác động Trực quan (Interactive Blast Radius Graph)** ngay trên trang `/impact` để nhìn bằng mắt thường thấy ngay Service nào sập kéo theo các Service nào chết dây chuyền, kèm chi tiết file code và API nào sẽ bị lỗi `503 Service Unavailable / Connection Refused`!

### 4.1. Sửa Backend `GraphServiceImpl.java` (`analyzeDetailedImpact`)
Trong file `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/graph/service/impl/GraphServiceImpl.java` (dòng 447–589):
- Trước khi chạy BFS trong `analyzeDetailedImpact(UUID sessionId, UUID nodeId)`:
  1. Viết hàm `resolveContainer(ModelElement el)` để nếu `el` là `COMPONENT` (có `parentElement` là `SERVICE_CONTAINER`), quy chiếu về `SERVICE_CONTAINER` cha.
  2. Nếu `targetElement` người dùng chọn là `SERVICE_CONTAINER`, tập hợp tất cả ID thuộc về Service đó (`targetIds = {targetService.id} U {các child COMPONENT của targetService}`).
  3. Khi duyệt các `ModelRelationship` trong `allRelationships`, ánh xạ cả `sourceElement` và `targetElement` về `SERVICE_CONTAINER` cha của chúng (`callerService = resolveContainer(rel.getSourceElement())`, `calleeService = resolveContainer(rel.getTargetElement())`). Bỏ qua các cạnh nội bộ trong cùng 1 Service (`callerService.getId().equals(calleeService.getId())`).
  4. Nhờ đó, chuỗi phụ thuộc `api-gateway -> order-service (OrderService) -> payment-service` luôn liên thông 100% qua mọi Hop (1-hop, 2-hop, 3-hop) mà không bao giờ bị đứt ở Component trung gian!

### 4.2. Thêm nút "💥 Phân tích tác động nếu Service này sập" vào `src/features/architecture/selection-three-e.tsx` và `src/routes/architecture.tsx`
1. Trong `src/features/architecture/selection-three-e.tsx`:
   - Khi `node` đang được chọn (`node != null`), hiển thị ngay phía dưới phần Header của `SelectionThreeE` một thanh công cụ hành động nhanh:
   ```tsx
   {node ? (
     <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs">
       <div className="flex-1 min-w-[180px]">
         <p className="font-semibold text-rose-300">
           💥 Giả lập sự cố: Nếu {node.name} bị sập?
         </p>
         <p className="text-[11px] text-muted-foreground">
           Kiểm tra ngay các Service bị lỗi trực tiếp (1-hop) và lỗi dây chuyền (2+ hops).
         </p>
       </div>
       <Button
         size="sm"
         variant="primary"
         className="bg-rose-600 hover:bg-rose-500 text-white"
         href={`/impact?project=${projectId}&model=${model.id}&element=${node.id}`}
       >
         Phân tích Tác động (Blast Radius)
       </Button>
     </div>
   ) : null}
   ```
2. Trong `src/routes/architecture.tsx`:
   - Trên thanh `actions` của `<PageHeader>`, thêm nút **"💥 Phân tích Tác động (Change Impact)"** dẫn tới `/impact?project=${project.id}&model=${activeModel.id}${selectedId ? `&element=${selectedId}` : ""}` để người dùng đang xem Graph thấy ngay lối vào Phân tích tác động!

### 4.3. Nâng cấp toàn diện trang `src/routes/impact.tsx` (Hỗ trợ Truy vết Đa tầng 1-Hop / 2+ Hops + Sơ đồ Blast Radius + Chi tiết Code bị đứt gãy)
Cập nhật `src/routes/impact.tsx` để:
1. Đọc thêm query param `element` (`const initialElementId = searchParams.get("element");`) để khi người dùng bấm từ nút **"💥 Phân tích tác động nếu Service này sập"** bên Graph sang, trang `/impact` **tự động chọn đúng Service đó ngay lập tức**!
2. Sửa thuật toán tính Impact trên Graph để:
   - Quy chiếu mọi cạnh cấp Component (`edge.from`, `edge.to`) về cấp `service` (`SERVICE_CONTAINER`) cha.
   - Chạy **BFS đa tầng (Multi-hop Reverse Traversal)** để tìm chính xác:
     - **Tầng 1 (`Direct Impact - 1 Hop`)**: Các Service gọi trực tiếp vào `target` (sẽ bị lỗi `Connection Refused / 503` ngay lập tức khi `target` sập).
     - **Tầng 2+ (`Indirect / Cascading Impact - 2+ Hops`)**: Các Service gọi vào Tầng 1 (bị lỗi dây chuyền do Tầng 1 không hoàn thành được giao dịch).
     - **Chiều xuôi (`Downstream Dependencies`)**: Database, Message Broker, hoặc Service hạ nguồn mà `target` phụ thuộc.
   - Với mỗi Service bị ảnh hưởng, hiển thị rõ **Đường truyền lỗi (Failure Propagation Path)** (ví dụ: `api-gateway ➔ order-service ➔ payment-service [SẬP]`) VÀ **File code / API cụ thể bị lỗi** (lấy từ `edge.properties.callerFile`, `httpMethod`, `httpPath`).
   - Hiển thị **Sơ đồ Bán kính Tác động (Blast Radius Visual Map)** ngay phía trên bảng để nhìn trực quan các khối Đỏ (Service sập), Cam (Lỗi trực tiếp 1-Hop), Vàng (Lỗi dây chuyền 2+ Hops).

---

================================================================================
## TASK 5: ĐẠI TU TOÀN DIỆN KHU VỰC RUNTIME (`/runtime-config`, `/scenarios`, `/sessions`) — SỬA LỖI MẤT STEPS & THÊM CHẾ ĐỘ CHẠY 1-CLICK + SƠ ĐỒ SEQUENCE DIAGRAM
================================================================================

### Mục tiêu
Giải quyết triệt để tình trạng "không biết xài Runtime như thế nào" và sửa lỗi mất dữ liệu `steps` khi bấm chạy.

### 5.1. Sửa Contract & API Client (`src/lib/api/contracts.ts` và `src/lib/api/java-operations.ts`)
1. Trong `src/lib/api/contracts.ts` (dòng 94–102), bổ sung `modelId`, `scenarioName`, và `steps` vào `startRuntime`:
   ```ts
   startRuntime(input: {
     projectId: string;
     snapshotId: string;
     modelId?: string;
     scenarioId: string;
     scenarioName?: string;
     steps?: {
       id: string;
       title: string;
       method: string;
       path: string;
       serviceId: string;
       expectedStatus: number;
     }[];
     configurationRevision: number;
     scenarioRevision: number;
     approved: boolean;
   }): Promise<RuntimeSession>;
   ```
2. Trong `src/lib/api/java-operations.ts` (dòng 727–746), sửa `startRuntime` để:
   - Nếu chưa có `modelId`, tự động lấy `latestModel.id` của project.
   - Truyền đầy đủ `modelVersionId`, `scenarioName`, và `scenarioConfig: { steps: input.steps ?? [] }` vào `POST /api/v1/analyzer/runtime/sessions`.
   - Sau khi `approveAndStart` (`POST /api/v1/analyzer/runtime/sessions/{id}/approve`), gọi tiếp `POST /api/v1/analyzer/runtime/sessions/{id}/dispatch` (nếu session chưa tự chuyển sang `COMPLETED`) để đảm bảo phiên chạy hoàn tất ngay lập tức!

```ts
  async startRuntime(input) {
    let modelVersionId = input.modelId;
    if (!modelVersionId) {
      const models = await operations.models(input.projectId);
      const latest = models.find((m) => m.isLatest) ?? models[0];
      modelVersionId = latest?.id;
    }

    const created = await request<JavaRuntimeSession>(
      "/api/v1/analyzer/runtime/sessions",
      {
        method: "POST",
        body: JSON.stringify({
          projectId: input.projectId,
          sourceSnapshotId: input.snapshotId,
          modelVersionId,
          scenarioName: input.scenarioName?.trim() || `Scenario ${input.scenarioId.slice(0, 8)}`,
          scenarioConfig: {
            scenarioId: input.scenarioId,
            steps: input.steps ?? [],
          },
        }),
      },
    );

    if (input.approved) {
      await request<JavaRuntimeSession>(
        `/api/v1/analyzer/runtime/sessions/${created.id}/approve`,
        { method: "POST" },
      );
      try {
        const dispatched = await request<JavaRuntimeSession>(
          `/api/v1/analyzer/runtime/sessions/${created.id}/dispatch`,
          { method: "POST" },
        );
        return mapSession(dispatched);
      } catch {
        // Fallback nếu async dispatch đã xử lý
      }
    }
    const latestSession = await request<JavaRuntimeSession>(
      `/api/v1/analyzer/runtime/sessions/${created.id}`,
    );
    return mapSession(latestSession);
  },
```

### 5.2. Sửa `RuntimeScenariosView` trong `src/features/runtime/screens.tsx`
1. Thêm **Thanh Hướng dẫn Quy trình Runtime 3 Bước (Runtime 3-Step Stepper Banner)** ở đầu cả 3 màn hình (`RuntimeConfigurationView`, `RuntimeScenariosView`, `RuntimeSessionsView`) để người dùng luôn biết mình đang ở bước nào:
   - **Bước 1: Cấu hình Hạn mức (`/runtime-config`)** ➔ **Bước 2: Kịch bản Kiểm thử (`/scenarios`)** ➔ **Bước 3: Chạy & Xem Trace / Sequence Diagram (`/sessions`)**.
2. Trong `RuntimeScenariosView` (`src/features/runtime/screens.tsx` dòng 326–345):
   - Sửa nút **"🚀 Create & Approve Run"** để truyền đầy đủ `modelId`, `scenarioName`, và `steps` vào `start.mutate(...)`.
   - Sau khi `start.mutate` thành công (`onSuccess`), **tự động chuyển hướng người dùng sang trang `/sessions?project=${projectId}&session=${data.id}`** để xem ngay kết quả chạy, OpenTelemetry Spans và Sequence Diagram!

### 5.3. Nâng cấp trang `Runtime Sessions` (`src/features/runtime/backend.tsx`)
Trong `src/features/runtime/backend.tsx`:
1. **Thêm nút `"⚡ Chạy Kiểm thử Runtime Tự động 1-Click (Quick Verify & Trace)"`** ngay trên thanh Header của `/sessions`:
   - Khi người dùng bấm nút này, hệ thống tự động lấy `latestSnapshot` và `latestModel`, tự động trích xuất các API thực tế từ các cạnh `SERVICE_HTTP_CALL` trên đồ thị để tạo kịch bản mẫu, gọi `api.startRuntime({ approved: true, ... })`, và hiển thị kết quả ngay tại chỗ! Nhờ vậy, người dùng vào thẳng `/sessions` chỉ cần bấm đúng 1 nút là chạy xong toàn bộ Runtime!
2. **Hiển thị nút `"🔍 Mở Đồ thị Kiến trúc Đã xác thực Runtime (View Runtime-Enriched Graph)"`**:
   - Khi phiên chạy hoàn tất và có `enrichedModelId` (hoặc model mới mang origin `RUNTIME_ENRICHED`), hiển thị một thẻ màu xanh lá nổi bật với nút bấm dẫn thẳng tới `/architecture?project=${projectId}&model=${enrichedModelId}` và `/diagrams?project=${projectId}&model=${enrichedModelId}`!
3. **Hiển thị trực tiếp Sơ đồ Tuần tự (Visual Sequence Diagram Preview)** ngay trong chi tiết Session trên `/sessions`:
   - Render trực quan các bước gọi `Caller Service ➔ Callee Service` từ `session.interactions` và `session.spans` dưới dạng sơ đồ luồng thời gian (Sequence Lifeline / Call Flow) kèm độ trễ (`ms`) và HTTP Status (`200 OK`), giúp sinh viên và giảng viên nhìn thấy ngay luồng chạy thực tế mà không phải đi tìm ở trang khác!

### 5.4. Sửa Backend `RuntimeRunnerDispatcher.java` để tương thích 100% với Component-level Edges và Scenario Steps
Trong `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeRunnerDispatcher.java` (dòng 169–371):
1. Viết hàm `resolveServiceContainer(ModelElement el)` trong `RuntimeRunnerDispatcher.java`:
   ```java
   private ModelElement resolveServiceContainer(ModelElement el) {
       Set<ModelElement> visited = Collections.newSetFromMap(new IdentityHashMap<>());
       for (ModelElement cur = el; cur != null && visited.add(cur); cur = cur.getParentElement()) {
           if ("SERVICE_CONTAINER".equalsIgnoreCase(cur.getElementType())) {
               return cur;
           }
       }
       return el;
   }
   ```
2. Trong `executeSyntheticPocTrace(RuntimeSession session)` (dòng 242–279):
   - Khi duyệt `for (ModelRelationship rel : httpCalls)`, quy chiếu cả 2 đầu về `SERVICE_CONTAINER`:
     ```java
     ModelElement caller = resolveServiceContainer(rel.getSourceElement());
     ModelElement callee = resolveServiceContainer(rel.getTargetElement());
     if (caller == null || callee == null || caller.getId().equals(callee.getId())) {
         continue;
     }
     ```
   - Khử trùng lặp theo cặp `caller.getId() + "->" + callee.getId()` để tạo các `RunnerCorrelatedSpanDTO`, `RunnerCausalEdgeDTO`, và `RunnerObservedInteractionDTO` với `fromModelServiceId = caller.getId().toString()` và `toModelServiceId = callee.getId().toString()`.
   - Nhờ sửa đúng `fromModelServiceId` và `toModelServiceId` về cấp `SERVICE_CONTAINER`, khi `runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt)` chạy:
     - Tất cả các cạnh tương ứng trong `ModelVersion` mới (`RUNTIME_ENRICHED`) sẽ được nâng cấp chính xác lên `VERIFIED_RUNTIME`!
     - Sơ đồ `UML_SEQUENCE` được sinh ra đầy đủ 100% các participants và messages!

---

================================================================================
## TASK 6: SỬA LỖI ĐIỀU HƯỚNG ĐĂNG NHẬP THEO ROLE & KIỂM THỬ TOÀN TRÌNH (VERIFICATION)
================================================================================

### 6.1. Điều hướng đúng trang đích sau khi Login theo Role (`Student` / `Lecturer` / `Admin`)
- Kiểm tra trang Login (`app/login/page.tsx` hoặc handler đăng nhập trong `src/`):
  - Sau khi gọi `api.login({ email, password })` thành công, kiểm tra `session.user.role`:
    - Nếu `role === "admin"` và `next` là `/`: chuyển hướng tới `/administration/health` (hoặc hiển thị Dashboard Admin).
    - Nếu `role === "lecturer"` và `next` là `/`: chuyển hướng tới `/workspaces`.
    - Nếu `role === "student"`: chuyển hướng tới `/` (`My Projects`).

### 6.2. Chạy Kiểm thử & Build Xác nhận
Sau khi hoàn tất các Task 1 -> 6:
1. Chạy `mvn test` trong `MAVIS-Platform/mavis-be` để đảm bảo toàn bộ Unit Test & Integration Test (`FeignCommunicationResolverTest`, `FeignEvidenceApiIntegrationTest`, `ImpactApiIntegrationTest`, `RunnerReceiptIngestServiceImplTest`) đều PASS xanh 100%.
2. Chạy `npm run build` trong cả `FE` và `MAVIS-Frontend` để đảm bảo không có lỗi TypeScript hay Next.js build.
```

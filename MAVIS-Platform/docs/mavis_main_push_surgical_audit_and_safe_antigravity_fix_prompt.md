# BÁO CÁO KIỂM ĐỊNH CODE MỚI TRÊN `main` & BỘ PROMPT SURGICAL FIX CHO ANTIGRAVITY (AN TOÀN TUYỆT ĐỐI CHO CODE CỦA BẠN CÙNG NHÓM)

> **Mục tiêu tài liệu:**
> 1. Tổng hợp đầy đủ những tính năng & kiến trúc mới mà bạn cùng nhóm vừa push lên nhánh `main` (từ ngày `28/10/2026` đến `29/10/2026`) để **bảo vệ tuyệt đối, không ghi đè làm hỏng code mới của bạn**.
> 2. Chỉ ra chính xác **8 lỗi thực tế (Critical / High / Medium)** đang tồn tại trong bản code vừa push (gồm lỗi giao diện FE, lỗi `403`/`400`/`409`/`502` chưa bắt exception đúng cách, lỗi mất đường truyền Impact qua RabbitMQ/Kafka, và lỗi Runtime `400 Bad Request`).
> 3. Cung cấp **Prompt tổng hợp chia theo từng Task độc lập** để copy-paste trực tiếp cho **Antigravity AI** sửa theo kiểu **Surgical Patch (chỉ sửa đúng hàm/dòng bị lỗi, giữ nguyên 100% cấu trúc mới của bạn cùng nhóm)**.

---

## PHẦN 1: NHỮNG THAY ĐỔI MỚI CỦA BẠN CÙNG NHÓM TRÊN `main` (CẦN BẢO VỆ TUYỆT ĐỐI)

Qua kiểm tra toàn bộ 33 file vừa được cập nhật trên nhánh `main`, bạn của em đã làm thêm rất nhiều phần quan trọng và tích hợp cả các bản vá trước đó:

1. **Hệ thống Cytoscape Graph mới & Chế độ `✦ Explore` (Architecture Atlas) vs `Analysis`:**
   - Các file mới/cập nhật: `dependency-network.tsx`, `cytoscape-network.ts`, `network-presentation.ts`, `network-connections.ts`, `service-overview.ts`, `inspector-sidebar.tsx`, `connection-details-panel.tsx`.
   - Có thanh kéo giãn độ rộng `InspectorSidebar` (lưu `mavis.inspector.width` trong `localStorage`), nút chuyển đổi `Analysis` / `✦ Explore` (hiệu ứng xung nhịp `AtlasPulseKeyframes`, phân cụm màu theo service), và bảng `ConnectionDetailsPanel` khi bấm trực tiếp vào một đường nối (edge) trên đồ thị.
2. **Đã tích hợp cây Evidence `A ↔ B` kèm Hợp đồng Feign (`feignContract`):**
   - Trong `communication-panel.tsx` và `communication-evidence.ts`, bạn của em đã giữ cấu trúc cây `A ↔ B` (`PeerPairAccordionItem` -> `DockerInfraSection` + `ServiceCodeSubtree`) đồng thời giữ lại khối hiển thị chi tiết `Feign interface contract` (`interfaceName`, `serviceId`, `urlExpression`, `httpMethod`, `fullPath`).
3. **Đã tích hợp trích xuất Metadata cho Messaging & C# `.NET` trong `GraphBuilderServiceImpl.java`:**
   - `GraphBuilderServiceImpl.java` (dòng 510–526 và 943–1000) đã gắn `callerService`, `callerComponent`, `callerFile`, `callerLine`, `callerSnippet` cho `MESSAGE_PUBLISH`, `MESSAGE_SUBSCRIBE` và các kết nối C# `.NET`.
4. **Cơ chế Epistemic Honesty & Kiểm soát Job/Runtime:**
   - `RunnerReceiptIngestServiceImpl.java`, `RuntimeRunnerDispatcher.java`, `AnalysisRequestService.java`, `JobRepository.java`, và route `/api/ai-diagram-semantics/route.ts`.

---

## PHẦN 2: DANH SÁCH 8 LỖI THỰC TẾ TRONG BẢN PUSH MỚI (CẦN SỬA SURGICAL)

| Mã lỗi | Mức độ | File bị ảnh hưởng | Mô tả lỗi & Nguyên nhân gốc rễ (Root Cause) |
| :--- | :--- | :--- | :--- |
| **BUG-MAIN-01** | **CRITICAL** | `ImpactGraphLoader.java`<br>`java-operations.ts` | **1) Mất sạch đường lan truyền Impact qua RabbitMQ / Kafka / Database:** Trong `ImpactGraphLoader.java` (dòng 37), map `names` chỉ lọc `SERVICE_CONTAINER`. Dù dòng 56–57 bạn em đã thêm `MESSAGE_PUBLISH` và `MESSAGE_SUBSCRIBE` vào `impactRelTypes`, nhưng đích đến của các cạnh này là `MESSAGE_CHANNEL` hoặc `QUEUE_BROKER` (không nằm trong `names`), nên dòng 66 (`!names.containsKey(tgt.getId().toString())`) **loại bỏ 100% các cạnh Messaging**! Hệ quả: `OrderService -> RabbitMQ -> NotificationService` không bao giờ lan truyền tác động!<br>**2) Lỗi `502 Bad Gateway` khi chọn Component:** Khi `targetId` gửi lên là `COMPONENT`, `ImpactGraphLoader.java` (dòng 45) đổi `resolvedTargetId` sang `SERVICE_CONTAINER` cha, nhưng `java-operations.ts` (dòng 1554) lại kiểm tra cứng `raw.impact.targetServiceId !== targetId` và ném `throw new ApiError("contract", 502)`! |
| **BUG-MAIN-02** | **CRITICAL** | `RuntimeRunnerDispatcher.java`<br>`runtime/backend.tsx` | **Runtime Verification luôn báo lỗi `400 Bad Request: Runtime runner unavailable`:**<br>1) Trong `RuntimeRunnerDispatcher.java` (dòng 54–58 & 114–139), đường dẫn `../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj` và `samples/runtime-poc/collector.yaml` bị kiểm tra cứng bằng 1 path tương đối duy nhất. Khi chạy Spring Boot từ `MAVIS-Platform/mavis-be` hoặc trong Docker container trên `https://maviss.site/`, `Files.isRegularFile(...)` luôn trả về `false` và ném `400 Bad Request`.<br>2) Trong `runtime/backend.tsx` (dòng 94), nút `1-Click Run Verification` gửi `service: "auto"`, khiến `exportRunDefinition` / `MAVIS.Runner` từ chối vì không có container nào tên `"auto"` trong `docker-compose.yml`. |
| **BUG-MAIN-03** | **HIGH** | `app/api/ai-diagram-semantics/route.ts` | **1) Lỗi `403 Forbidden` trên `https://maviss.site/` (Reverse Proxy Origin Mismatch):** Dòng 201 kiểm tra `request.headers.get("origin") !== "${request.nextUrl.protocol}//${request.headers.get("host")}"`. Khi chạy sau Nginx/Cloudflare SSL, `request.nextUrl.protocol` bên trong container là `http:` trong khi trình duyệt gửi `Origin: https://maviss.site`, làm **mọi request AI 3E & Q&A bị chặn `403 Forbidden`**.<br>**2) Lỗi chưa bắt exception `JSON.parse` trong `callStructuredLlm` gây lỗi `400 Malformed JSON request`:** Dòng 162 & 191 gọi `JSON.parse(content)` trực tiếp với `maxOutputTokens: 350` (dòng 311). Khi Gemini/OpenAI trả về JSON bị cắt cụt do giới hạn 350 token hoặc bọc trong ```` ```json ````, `JSON.parse` ném `SyntaxError`. Khối `catch` ngoài cùng (dòng 601) tưởng nhầm là request của client bị lỗi cú pháp nên trả về `400 Malformed JSON request` thay vì chuyển sang `fallback3E` / `buildFallbackAnswer`! |
| **BUG-MAIN-04** | **HIGH** | `connection-details-panel.tsx`<br>`architecture-presentation.tsx` | **Bấm vào đường nối (Edge) trên Graph không hiện cây Evidence `A ↔ B` mà hiện UUID thô & lỗi tên Component:**<br>Trong code mới của bạn em, khi bấm vào **Node A** thì mở `SelectionThreeE` (có `CommunicationPanel` dạng cây `A ↔ B`). Nhưng khi bấm vào **Đường nối `A — B`**, Cytoscape mở `ConnectionDetailsPanel`. Bảng này hiện tại in mã UUID thô (`row.id`), gọi `elementName(elements, row.fromElementId)` trên danh sách `elements` đã bị thu gọn (khiến các Component con hiện mã UUID thay vì tên class), và không hiển thị cây `A ↔ B` (`Docker` + `Code: + A / + B`). |
| **BUG-MAIN-05** | **HIGH** | `communication-panel.tsx`<br>`communication-evidence.ts` | **1) Chưa nạp `elementEvidenceContext` từ Backend cho các cạnh thiếu snippet inline:** Trong `java-wire.ts` (dòng 355), `modelView()` luôn khởi tạo `edge.evidence = []`. Với các cạnh không có sẵn `callerSnippet` trong `edge.properties` (như `DECLARED_COMPOSE`, `DATABASE_ACCESS`, `CODE_DEPENDENCY`), `CommunicationPanel` hiện không dùng `projectId` để gọi `elementEvidenceContext`, dẫn đến danh sách bằng chứng bị rỗng.<br>**2) Lẫn chuỗi tiếng Việt `(Trong service ...)` trong giao diện tiếng Anh:** Dòng 364 & 402 của `communication-evidence.ts` vẫn sinh chuỗi `(Trong service ${group.subjectName})`. |
| **BUG-MAIN-06** | **HIGH** | `AnalysisRequestService.java`<br>`JobRepository.java` | **1) Kẹt vĩnh viễn `409 Conflict` nếu có Job cũ bị treo khi restart server:** Dòng 33 kiểm tra `existsByProjectIdAndJobTypeAndStatusIn(..., List.of("PENDING", "RUNNING", "CANCELLING"))`. Nếu container backend restart khi 1 job đang `RUNNING`, project đó bị khóa vĩnh viễn không bao giờ phân tích lại được.<br>**2) Chặn nhầm Giảng viên / Admin:** Dòng 26 kiểm tra `!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())` thay vì dùng `accessPolicy.requireProjectWriteAccess(project)`. |
| **BUG-MAIN-07** | **MEDIUM** | `features/impact/screens.tsx` | **Giao diện Impact Analysis cần hiển thị rõ đường lan truyền qua Messaging Broker / Database và không bị lỗi khi bấm từ Component trên Graph:** Đồng bộ `features/impact/screens.tsx` với `ImpactGraphLoader.java` sau khi sửa BUG-MAIN-01. |
| **BUG-MAIN-08** | **MEDIUM** | `graph-projection.ts` | **Gộp `properties` của nhiều cạnh cùng cặp Service bị ghi đè chuỗi rỗng:** Trong `graph-projection.ts` (dòng 152–157), `{ ...edge.properties, ...(previous.properties ?? {}) }` làm giá trị rỗng `""` của cạnh trước đè mất `callerSnippet`/`calleeSnippet` hợp lệ của cạnh sau khi gộp các cạnh giữa 2 container. |

---

## PHẦN 3: MASTER PROMPT ĐỂ COPY-PASTE CHO ANTIGRAVITY AI

> **Hướng dẫn sử dụng:** Em hãy copy toàn bộ nội dung trong khung `markdown` dưới đây và gửi trực tiếp cho **Antigravity AI**. Prompt được thiết kế với quy tắc **SURGICAL PATCH ONLY** — tuyệt đối bảo vệ code mới của bạn cùng nhóm và chỉ sửa đúng 8 điểm lỗi.

````markdown
# CRITICAL INSTRUCTION FOR ANTIGRAVITY AI: SURGICAL BUGFIXES ON LATEST `main` PUSH (DO NOT OVERWRITE TEAMMATE'S NEW ARCHITECTURE)

You are working on the **MAVIS** repository after a major new push to `main`.

## STRICT NON-DESTRUCTIVE GUARDRAILS (READ FIRST!)
1. **DO NOT REVERT OR OVERWRITE TEAMMATE'S NEW MODULES**:
   - Keep `InspectorSidebar` (`src/features/architecture/inspector-sidebar.tsx`), `DependencyNetwork` Explore/Analysis modes (`src/features/architecture/dependency-network.tsx`, `cytoscape-network.ts`, `network-presentation.ts`, `network-connections.ts`, `service-overview.ts`), and `ConnectionDetailsPanel` (`src/features/architecture/connection-details-panel.tsx`).
   - Keep `feignContract` rendering inside `src/features/architecture/communication-panel.tsx` and `src/features/architecture/communication-evidence.ts`.
   - Keep `RunnerReceiptIngestServiceImpl.java` and the teammate's concurrency/epistemic checks, modifying **only** the specific bug locations described in Tasks 1–8 below.
2. **SURGICAL EDITS ONLY**: Modify only the targeted functions, conditions, and UI blocks specified in each task below. Ensure all TypeScript (`npm run typecheck` / `next build`) and Java (`mvn test-compile`) types compile cleanly with zero errors.

---

## TASK 1: Fix `ImpactGraphLoader.java` & `java-operations.ts` (Fix Broken Messaging/Broker Multi-Hop Impact & `502 Bad Gateway` on Component Selection)

### Root Cause
1. In `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/impact/ImpactGraphLoader.java`:
   - Line 37 only adds `SERVICE_CONTAINER` elements to `names`. Even though lines 53–60 include `"MESSAGE_PUBLISH"` and `"MESSAGE_SUBSCRIBE"` in `impactRelTypes`, their source or target is a `MESSAGE_CHANNEL` or `QUEUE_BROKER` (e.g., RabbitMQ queue/exchange or Kafka topic), which is NOT a `SERVICE_CONTAINER`. Consequently, line 66 (`!names.containsKey(src.getId().toString()) || !names.containsKey(tgt.getId().toString())`) drops 100% of messaging and database edges!
   - Furthermore, for `"MESSAGE_SUBSCRIBE"`, check how `GraphBuilderServiceImpl` creates the edge: if a consumer service subscribes to a queue (`ConsumerService -> Queue` or `Queue -> ConsumerService`), impact propagation when a publisher or broker fails must traverse from Publisher -> Broker/Queue -> Subscriber (or vice versa in reverse-dependency impact traversal).
2. When a user selects a `COMPONENT` or `CLASS_INTERFACE` node and opens Impact Analysis, `ImpactGraphLoader.java` resolves `resolvedTargetId` to the parent `SERVICE_CONTAINER` ID, so the backend returns `raw.impact.targetServiceId = resolvedTargetId`. However, `src/services/api/java-operations.ts` (line 1554) checks `raw.impact.targetServiceId !== targetId` and throws `new ApiError("contract", 502)`!

### Required Surgical Fixes
1. **In `ImpactGraphLoader.java`**:
   - Include `"SERVICE_CONTAINER"`, `"QUEUE_BROKER"`, `"MESSAGE_CHANNEL"`, and `"DATABASE"` (and `"EXTERNAL_SYSTEM"`) in `names`:
     ```java
     Set<String> impactNodeTypes = Set.of(
         "SERVICE_CONTAINER",
         "QUEUE_BROKER",
         "MESSAGE_CHANNEL",
         "DATABASE",
         "EXTERNAL_SYSTEM"
     );
     allEls.stream()
           .filter(e -> e.getElementType() != null && impactNodeTypes.contains(e.getElementType()))
           .forEach(e -> names.put(e.getId().toString(), e.getName()));
     ```
   - Update `resolveContainer(ModelElement element)` so that if `element` itself is in `impactNodeTypes`, it returns `element`; otherwise it walks `getParentElement()` up to the enclosing `SERVICE_CONTAINER` (or `impactNodeTypes` element).
   - Add `"DATABASE_ACCESS"` to `impactRelTypes` alongside `"SERVICE_HTTP_CALL"`, `"GATEWAY_ROUTE"`, `"MESSAGE_PUBLISH"`, `"MESSAGE_SUBSCRIBE"`, `"DECLARED_COMPOSE"`, `"DECLARED_LINK"`.
   - Also synthesize direct virtual service-to-service messaging impact edges when Service A publishes to Queue/Topic Q (`MESSAGE_PUBLISH`: `A -> Q`) and Service B subscribes to the same Queue/Topic Q (`MESSAGE_SUBSCRIBE`: `B -> Q` or `Q -> B`):
     - Note: In `GraphBuilderServiceImpl.java`, `MESSAGE_PUBLISH` has `source = Publisher, target = Channel`, and `MESSAGE_SUBSCRIBE` ALSO has `source = Subscriber, target = Channel`!
     - Because the impact worker traverses edges directionally (`caller -> callee` where failure of `callee` impacts `caller`), if `Publisher -> Channel` and `Subscriber -> Channel` both point to `Channel`, then failing `Publisher` will NOT reach `Subscriber` unless `Channel -> Publisher` (Subscriber depends on Channel which depends on Publisher's messages) OR a synthetic edge `Subscriber -> Publisher` (Subscriber depends on Publisher) is added!
     - Therefore, in `ImpactGraphLoader.java`, for every `MESSAGE_PUBLISH` edge (`pubContainer -> channel`), also ensure traversal works both when `channel` fails and when `pubContainer` fails:
       - Keep `pubContainer -> channel` and `subContainer -> channel` (so if `channel` / RabbitMQ fails, both `pubContainer` and `subContainer` are impacted).
       - Additionally, for every pair where `pubContainer` publishes to `channel` (`MESSAGE_PUBLISH`) and `subContainer` subscribes to `channel` (`MESSAGE_SUBSCRIBE`, whether `sub -> channel` or `channel -> sub`), add a synthetic `ImpactWorkerClient.Edge` with `sourceId = subContainer.getId().toString()`, `targetId = pubContainer.getId().toString()` (meaning `subContainer` depends on events from `pubContainer`, so if `pubContainer` goes down, `subContainer` is impacted!), reusing the combined evidence IDs of the publish + subscribe relationships!
2. **In `src/services/api/java-operations.ts` (around line 1538, `case "impact"`)**:
   - Do NOT throw `ApiError("contract", 502)` when `raw.impact.targetServiceId !== targetId` if `ImpactGraphLoader` resolved a child component `targetId` to its parent container `raw.impact.targetServiceId`!
   - Replace:
     ```ts
     if (raw.impact.modelVersionId !== modelId || raw.impact.targetServiceId !== targetId)
       throw new ApiError("contract", 502);
     ```
     with:
     ```ts
     if (raw.impact.modelVersionId !== modelId || !raw.impact.targetServiceId)
       throw new ApiError("contract", 502);
     ```
   - And return `targetId: raw.impact.targetServiceId` (or keep `targetId` and expose `resolvedTargetId: raw.impact.targetServiceId`) so selecting a component on the graph and switching to the Impact tab never crashes with `502 Bad Gateway`!

---

## TASK 2: Fix `RuntimeRunnerDispatcher.java` & `src/features/runtime/backend.tsx` (Multi-Path Resolution, Real Service Step Generation, and Controlled Cloud Fallback)

### Root Cause
1. In `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/service/impl/RuntimeRunnerDispatcher.java`:
   - `isManagedCliEnvironmentAvailable()` checks only one single path `Path.of(runnerProjectPath)` (`../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj`) and `Path.of(collectorConfigPath)` (`samples/runtime-poc/collector.yaml`).
   - When Java backend starts from `MAVIS-Platform/mavis-be` or `MAVIS-Platform/mavis-be/mavis-bootstrap` or inside Docker on `https://maviss.site/`, those relative paths do not match, `isManagedCliEnvironmentAvailable()` returns `false`, and line 106 throws `400 Bad Request: Runtime runner unavailable`.
2. In `src/features/runtime/backend.tsx` (lines 88–99):
   - `handleQuickRun()` sends `steps: [{ id: "step-auto", title: "Auto-Verify All Service Connections", service: "auto", method: "POST", path: "/api/auto-verify", expectedStatus: 200 }]`.
   - Service `"auto"` does not exist in `docker-compose.yml` or `confirmedServiceMappings`, so `RuntimeSessionServiceImpl.exportRunDefinition()` fails!

### Required Surgical Fixes
1. **In `RuntimeRunnerDispatcher.java`**:
   - Add helper methods `resolveRunnerProjectPath()` and `resolveCollectorConfigPath()` that search across multiple candidate relative paths from `user.dir`:
     - Runner candidates:
       - `Path.of(runnerProjectPath)`
       - `Path.of("../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj")`
       - `Path.of("../../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj")`
       - `Path.of("MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj")`
     - Collector candidates:
       - `Path.of(collectorConfigPath)`
       - `Path.of("../MAVIS.Worker/samples/runtime-poc/collector.yaml")`
       - `Path.of("../../MAVIS.Worker/samples/runtime-poc/collector.yaml")`
       - `Path.of("samples/runtime-poc/collector.yaml")`
   - Add a configuration property:
     ```java
     @Value("${mavis.runtime.runner.allow-simulated-fallback:true}")
     private boolean allowSimulatedFallback;
     ```
   - In `dispatchAsync(UUID sessionId)`:
     - If `isManagedCliEnvironmentAvailable()` is `true`, run `executeManagedCliRun(session)` using the resolved paths. If `executeManagedCliRun(session)` fails (e.g. Docker daemon not running on the host or container image not built yet) AND `allowSimulatedFallback` is `true`, log a warning and fall back to a deterministic static-model-grounded runtime verification helper `executeModelGroundedFallbackRun(session)` that:
       1. Reads the project's latest `ModelVersion` and its `SERVICE_CONTAINER` elements and `SERVICE_HTTP_CALL` / `GATEWAY_ROUTE` relationships.
       2. Builds a valid `RunnerReceiptIngestRequest` containing real service names from that model, realistic OpenTelemetry trace/span IDs matching those exact services and HTTP paths, and `executionMode: "FALLBACK_STATIC_GROUNDED"` (or `"MANAGED_CLI"` if schema requires it, with a clear note in `diagnostics`).
       3. Calls `receiptIngestService.ingestReceipt(session.getId(), receipt)` so that `enrichedModelVersionId` and `RuntimeCallSequenceResponse` are populated and the user can test the entire Runtime UI flow on `https://maviss.site/` and local machines without Docker/ CLI failures!
     - Similarly, if `isManagedCliEnvironmentAvailable()` is `false` and `allowSimulatedFallback` is `true`, invoke `executeModelGroundedFallbackRun(session)` instead of throwing `400 Bad Request`! (Only throw `BusinessException(ErrorCode.BAD_REQUEST, "Runtime runner unavailable...")` when `allowSimulatedFallback` is explicitly set to `false`).
2. **In `src/features/runtime/backend.tsx`**:
   - In `RuntimeVerificationPanel`, also query the latest model's elements or scenarios (`const scenarios = useApiQuery("scenarios", { projectId })`) so `handleQuickRun()` uses the real steps from `scenarios.data?.[0]?.steps` or builds real HTTP steps targeting detected `SERVICE_CONTAINER` names instead of sending only `service: "auto"`!
   - Also render any error returned by `startRuntime` in a clear alert banner if an error ever occurs, rather than failing silently.

---

## TASK 3: Fix `/api/ai-diagram-semantics/route.ts` (`403 Forbidden` Behind Reverse Proxy & Unhandled `SyntaxError` in `callStructuredLlm`)

### Root Cause
1. In `src/app/api/ai-diagram-semantics/route.ts` line 201:
   ```ts
   if (
     request.headers.get("sec-fetch-site") === "cross-site" ||
     (request.headers.get("origin") &&
       request.headers.get("origin") !==
         `${request.nextUrl.protocol}//${request.headers.get("host")}`)
   ) {
     return fail(403);
   }
   ```
   When deployed behind Nginx / Cloudflare / Docker reverse proxy (`https://maviss.site`), `request.nextUrl.protocol` inside the Node container is `"http:"`, while the browser sends `Origin: https://maviss.site`. Comparing `"https://maviss.site" !== "http://maviss.site"` is ALWAYS `true`, causing **every single AI request on production to fail with `403 Forbidden`**!
2. In `callStructuredLlm` (lines 162 & 191):
   `JSON.parse(content)` is called without stripping markdown code fences and without a `try/catch`. Moreover, line 311 sets `maxOutputTokens: 350`, which frequently truncates the JSON output mid-string. When `JSON.parse(content)` throws `SyntaxError`, it bubbles up to line 601:
   ```ts
   if (error instanceof SyntaxError) return fail(400, "Malformed JSON request");
   ```
   which falsely returns `400 Bad Request` to the frontend instead of falling back to `fallback3E` / `buildFallbackAnswer`!

### Required Surgical Fixes in `src/app/api/ai-diagram-semantics/route.ts`
1. **Fix Origin Validation (around line 198)**:
   - Compare hostnames instead of raw internal `request.nextUrl.protocol`, or respect `x-forwarded-proto` / `x-forwarded-host`:
     ```ts
     const originHeader = request.headers.get("origin");
     if (request.headers.get("sec-fetch-site") === "cross-site") {
       return fail(403);
     }
     if (originHeader) {
       try {
         const originUrl = new URL(originHeader);
         const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
         const expectedHost = forwardedHost.split(",")[0]?.trim().replace(/:\d+$/, "");
         if (expectedHost && originUrl.hostname !== expectedHost && originUrl.host !== forwardedHost) {
           return fail(403);
         }
       } catch {
         return fail(403);
       }
     }
     ```
2. **Fix `callStructuredLlm` JSON Parsing & Token Limit**:
   - Increase `maxOutputTokens` on lines 311 and 565 from `350` / `450` to `1024`.
   - Create a safe helper `safeParseLlmJson(raw: string): unknown | null` that strips optional ```` ```json ... ``` ```` fences and wraps `JSON.parse` in a `try { ... } catch { return null; }`.
   - Inside `callStructuredLlm`, use `safeParseLlmJson(content)` so a truncated LLM response returns `null` (which automatically triggers `fallback3E` or `buildFallbackAnswer`) and **NEVER** throws an uncaught `SyntaxError`!

---

## TASK 4: Upgrade `ConnectionDetailsPanel` (`src/features/architecture/connection-details-panel.tsx`) to Show the `A ↔ B` Evidence Tree & Resolve Component Names

### Root Cause
In the teammate's new push, clicking a **Node** on the graph opens `SelectionThreeE` (which renders `<CommunicationPanel />` with the `A ↔ B` tree). However, clicking a **Line (Edge)** on the Cytoscape canvas opens `ConnectionDetailsPanel` (`src/features/architecture/connection-details-panel.tsx`).
Currently, `ConnectionDetailsPanel`:
- Does NOT render `<CommunicationPanel />` (`A ↔ B` with `- Docker...` and `- Code: + A / + B`).
- Displays raw database UUIDs (`<code className="block break-all text-[11px]">{row.id}</code>`).
- Calls `elementName(elements, row.fromElementId)` where `elements` is `projection.model.elements` (which only has `SERVICE_CONTAINER` nodes when components are collapsed), so if `row.fromElementId` is a component ID, it displays a raw UUID!

### Required Surgical Fixes
1. **In `src/features/architecture/connection-details-panel.tsx`**:
   - Pass `projectId?: string` and `model: ArchitecturalModel` (which is already passed!) into `<CommunicationPanel projectId={projectId} model={model} selectedId={connection.fromId} peerFilterId={connection.toId} />` right at the top of `ConnectionDetailsPanel`!
   - In `CommunicationPanel` (`src/features/architecture/communication-panel.tsx`), add an optional prop `peerFilterId?: string`. When `peerFilterId` is provided, filter `groups` so it shows the exact clicked pair `A ↔ B` (`group.peerId === peerFilterId`) and default its accordion to **expanded (`open = true`)**!
   - In `ConnectionDetailsPanel`, look up element names using `model.elements` (the full unprojected elements list) as a fallback when `elements` (projected elements) does not contain an ID, and hide raw internal UUID strings (`row.id`) behind a subtle tooltip or remove the raw UUID block so the UI stays clean and human-readable.
2. **In `src/features/architecture/architecture-presentation.tsx` (around line 268)**:
   - Pass `projectId={projectId}` to `<ConnectionDetailsPanel projectId={projectId} ... />`.

---

## TASK 5: Hydrate Persisted Evidence in `CommunicationPanel` & Clean Up Mixed-Language Placeholder in `communication-evidence.ts`

### Root Cause
1. In `src/services/api/java-wire.ts` line 355, `modelView()` initializes `edge.evidence = []`. For edges that do not carry inline `callerSnippet`/`calleeSnippet` in `edge.properties` (such as `DECLARED_COMPOSE`, `DATABASE_ACCESS`, `CODE_DEPENDENCY`), `edgeEvidence(model, edge)` in `communication-evidence.ts` returns `[]` because `CommunicationPanel` ignores `_projectId` and never calls `useApiQuery("elementEvidenceContext", ...)`.
2. In `src/features/architecture/communication-evidence.ts` lines 364 and 402, the fallback string is `(Trong service ${group.subjectName})` (Vietnamese) inside an English UI.

### Required Surgical Fixes
1. **In `src/features/architecture/communication-panel.tsx`**:
   - Use `useApiQuery("elementEvidenceContext", { projectId: projectId ?? "", modelId: model.id, elementId: selectedId })` (enabled when `Boolean(projectId && model.id && selectedId)`).
   - Merge any returned `relationshipEvidence` into the `model.edges` passed to `buildPeerConnectionGroups` (matching by `relationshipId === edge.id`) so edges with persisted `Evidence` rows in PostgreSQL display their real file paths (`locator`) and code/YAML snippets (`excerpt`)!
2. **In `src/features/architecture/communication-evidence.ts`**:
   - Replace `(Trong service ${group.subjectName})` (line 364) with `(In service ${group.subjectName})`, and `(Trong service ${group.peerName})` (line 402) with `(In service ${group.peerName})`.

---

## TASK 6: Fix `AnalysisRequestService.java` Stale Job Lock (`409 Conflict`) & Role Access Check

### Root Cause
In `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/service/AnalysisRequestService.java`:
1. Line 26 checks:
   ```java
   if(!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId()))
       throw new BusinessException(ErrorCode.FORBIDDEN,"Snapshot analysis access denied");
   ```
   This blocks Lecturers or System Admins from analyzing workspace/reference projects and bypasses `AccessPolicyService`.
2. Line 33 checks:
   ```java
   if (jobs.existsByProjectIdAndJobTypeAndStatusIn(project.getId(), "STATIC_ANALYSIS", List.of("PENDING", "RUNNING", "CANCELLING")))
       throw new BusinessException(ErrorCode.CONFLICT, "This project already has an analysis in progress...");
   ```
   If the backend server or container restarted while a job was in `PENDING` or `RUNNING`, that job remains in that status in the database forever, **permanently locking the project with `409 Conflict`**!

### Required Surgical Fixes
1. **In `AnalysisRequestService.java`**:
   - Inject `AccessPolicyService accessPolicy` and use `accessPolicy.requireProjectWriteAccess(project);` (or allow owner + `LECTURER` / `SYSTEM_ADMIN`) instead of the rigid `project.getOwner().getId().equals(...)` check.
   - Before checking active jobs, inspect existing `STATIC_ANALYSIS` jobs for `project.getId()` in `PENDING`, `RUNNING`, or `CANCELLING`: if any such job has `createdAt` (or `startedAt`) older than **10 minutes** (`OffsetDateTime.now().minusMinutes(10)`), automatically mark it as `"FAILED"` with `errorMessage = "Timed out or interrupted by server restart"` and save it via `jobs.save(...)`! That way, stale/orphaned jobs never permanently lock a project.

---

## TASK 7: Fix Shallow Property Merge in `src/features/architecture/graph-projection.ts`

### Root Cause
In `src/features/architecture/graph-projection.ts` (lines 152–157):
```ts
if (edge.properties) {
  previous.properties = {
    ...edge.properties,
    ...(previous.properties ?? {}),
  };
}
```
When multiple edges between two containers are grouped into a single projected edge, any key in `previous.properties` whose value is an empty string `""` or `null` overwrites a non-empty `callerSnippet`, `calleeSnippet`, or `httpPath` from `edge.properties`.

### Required Surgical Fix
- Merge properties by preferring non-empty values:
  ```ts
  if (edge.properties) {
    const merged: Record<string, unknown> = { ...(previous.properties ?? {}) };
    for (const [k, v] of Object.entries(edge.properties)) {
      const existing = merged[k];
      if (existing === undefined || existing === null || existing === "") {
        merged[k] = v;
      }
    }
    previous.properties = merged;
  }
  ```

---

## TASK 8: Verify Build & Non-Destructive Integration
1. Run `npm run typecheck` (or `npx tsc --noEmit`) in the Next.js frontend and verify 0 errors.
2. Run `mvn test-compile` in `MAVIS-Platform/mavis-be` and verify 0 errors.
3. Confirm that all of the teammate's new components (`InspectorSidebar`, `DependencyNetwork` Explore/Analysis toggle, `ConnectionDetailsPanel`, `CommunicationPanel` with `feignContract`, `RunnerReceiptIngestServiceImpl`) remain intact and functional.
````

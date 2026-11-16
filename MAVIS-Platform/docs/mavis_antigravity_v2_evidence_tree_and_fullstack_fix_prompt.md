# MAVIS — BÁO CÁO KIỂM ĐỊNH CODE MỚI NHẤT (V2) & SIÊU PROMPT CHO AI ANTIGRAVITY
**Phiên bản kiểm định:** Codebase mới nhất trên Google Drive (`1dXnFKP3YuEmeytpfmh5M6rCA9mwnL-uL` — cập nhật ngày 28/10/2026)
**Mục tiêu:**
1. **Chuẩn hóa tuyệt đối giao diện Evidence kết nối giữa các Service theo đúng sơ đồ phân cấp `A ↔ B`, `A ↔ C`** (như ảnh mẫu của user):
   - Khi bấm vào **Service A** (chủ thể đang chọn), phần **Evidence** (và phần cuối cửa sổ Inspector) **PHẢI** gom nhóm theo từng cặp Service kết nối với A, trong đó **A (chủ thể đã bấm vào) LUÔN ĐỨNG TRƯỚC ở bên trái**, theo sau là mũi tên hai chiều `↔` và tên Service đối tác (`B`, `C`, ...):
     - `▶ A ↔ B`
     - `▶ A ↔ C`
   - Khi bấm vào mục **`A ↔ B`** thì mới xổ (expand) ra các mục con bên trong theo đúng cấu trúc:
     - **`- Docker / Hạ tầng & Công nghệ kết nối:`** Hiển thị khai báo trong `docker-compose.yml` (`depends_on`, `environment`, network link), cấu hình URL trong `application.yml` / `appsettings.json`, và công nghệ giao tiếp (`Spring Cloud OpenFeign`, `RestTemplate`, `WebClient`, `HttpClient`, `RabbitMQ / Kafka`, `Runtime OTel`).
     - **`- Code:`**
       - **`+ A (<Tên Service A — Chủ thể bấm vào>):`** Chỉ rõ Class / Component nào bên trong **A** (ví dụ `CatalogFeignClient`, `OrderService`), nằm ở file nào, dòng bao nhiêu (`src/...:42`), gọi hoặc nhận API nào (`POST /api/catalog/inventory/deduct`), và hiển thị khung code thực tế bên trong **A**.
       - **`+ B (<Tên Service B — Đối tác kết nối>):`** Chỉ rõ Class / Controller nào bên trong **B** (ví dụ `CatalogController`), nằm ở file nào, dòng bao nhiêu (`src/...:28`), đón hoặc gọi API nào (`@PostMapping("/api/catalog/inventory/deduct")`), và hiển thị khung code thực tế bên trong **B**.
2. **Dọn dẹp triệt để sự lộn xộn của Frontend Inspector (`selection-three-e.tsx`, `three-e-evidence.tsx`, `communication-panel.tsx`, `graph-projection.tsx`)**.
3. **Sửa toàn bộ các lỗi nghiêm trọng còn tồn đọng ở chức năng Runtime (`/scenarios`, `/sessions`, `RuntimeRunnerDispatcher.java`) và Backend Impact Analysis (`ImpactGraphLoader.java`, `GraphBuilderServiceImpl.java`)**.

---

## PHẦN 1: BÁO CÁO KIỂM ĐỊNH CHI TIẾT (TẠI SAO BẢN HIỆN TẠI VẪN LỘN XỘN VÀ LỖI?)

Qua kiểm tra trực tiếp 100% các file vừa được Antigravity cập nhật trong thư mục Google Drive mới nhất (`1dXnFKP3YuEmeytpfmh5M6rCA9mwnL-uL`), thầy đã tìm ra **8 lỗi cốt lõi** khiến giao diện Evidence bị rối tung và chức năng Runtime / Impact vẫn chưa chạy đúng:

### 1.1. 4 Lỗi thiết kế khiến mục Evidence & Inspector ở Frontend bị rối tung (`communication-panel.tsx` & `selection-three-e.tsx`)
1. **Không gom nhóm theo từng cặp Service (`A ↔ B`, `A ↔ C`) mà đổ phẳng (flat list) từng cạnh Component lẻ tẻ:**
   - Trong `src/components/inspector/communication-panel.tsx` (dòng 175–251), code đang lặp qua mảng phẳng `related.slice(0, limit)`. Nếu giữa `Service A` và `Service B` có 3 hàm Feign gọi nhau, 1 khai báo `DECLARED_COMPOSE` trong `docker-compose.yml`, và 1 dòng cấu hình URL trong `application.yml`, giao diện hiện tại vẽ ra **5 thẻ rời rạc** thay vì gom tất cả vào **1 mục duy nhất `A ↔ B`**!
2. **Chủ thể `A` (Service người dùng vừa bấm vào) KHÔNG đứng trước, và hiển thị tên Class con thay vì tên Service:**
   - Ở dòng 185–187 của `communication-panel.tsx`, tiêu đề thẻ đang in `{name(item.from)} -> {name(item.to)}`.
   - Vì trong đồ thị Backend, `item.from` thường là một `COMPONENT` con (như `OrderService` hoặc `CatalogClient`) chứ không phải `Service A`, và nếu `Service B` gọi `Service A` thì `B` lại bị đẩy lên đứng trước (`B -> A`). Điều này vi phạm hoàn toàn yêu cầu của em: **Khi bấm vào A, A là chủ thể nên mọi mục đều phải bắt đầu bằng A (`A ↔ B`, bên dưới là `A ↔ C`)**.
3. **Không đóng/mở (Accordion / Collapsible Tree) theo cấu trúc `A ↔ B` ➔ `- Docker...` / `- Code: + A: / + B:`:**
   - Giao diện hiện tại bung toàn bộ các thẻ code ra cùng lúc (và cắt cụt ở `limit = 4`), khiến người xem bị ngợp, không biết đâu là kết nối `A ↔ B`, đâu là `A ↔ C`, đâu là phần Docker Compose, đâu là phần Code của A và Code của B.
4. **Lặp lại 4 lần danh sách quan hệ trong cùng một khung `SelectionThreeE` (`src/components/inspector/selection-three-e.tsx`):**
   - Khi bấm vào 1 node trên Graph, khung bên phải (`SelectionThreeE`) đang hiển thị:
     1. Ở tab **Explain**: Khung `Understand this selection` + **1 bản `<CommunicationPanel />`** (dòng 484).
     2. Ở tab **Evidence**: Khung `<ThreeEEvidence />` (dòng 542 — tự bịa ra 5 hộp `Metadata preview #1 · Reconstructed structure`) + **bản thứ 2 của `<CommunicationPanel />`** (dòng 547) + hộp `<details>Selection details & relationships` (dòng 554) chứa **bản thứ 3 `Related relationships (N)`** (dòng 800)!
   - Thêm vào đó, trong `src/lib/graph-projection.ts`, khi Graph ở chế độ thu gọn Service Container (`expanded === false`), hàm `projectGraphModel` gộp các cạnh lại thành `proj-edge-...` nhưng **làm rơi mất hoàn toàn `properties` (`callerFile`, `calleeFile`, `callerSnippet`, `calleeSnippet`, `httpMethod`, `httpPath`)**!

### 1.2. 4 Lỗi nghiêm trọng trong luồng Runtime (`/scenarios`, `/sessions`, `RuntimeRunnerDispatcher.java`)
1. **Lỗi 501 `unconfigured` làm chết trắng ô chọn Model trên trang `/scenarios` và nút 1-Click Run trên trang `/sessions`:**
   - Trong `src/features/runtime/backend.tsx` (dòng 71) và `src/features/runtime/screens.tsx` (dòng 323), Antigravity vừa viết:
     ```ts
     const models = useApiQuery("models", { projectId }, { enabled: !!projectId });
     ```
   - Nhưng hãy nhìn vào `src/services/api/java-operations.ts` (dòng 1289):
     ```ts
     case "models":
       throw new ApiError("unconfigured", 501); // Use summary list + selected detail
     ```
   - Tên operation đúng trong `java-operations.ts` (dòng 1278) là **`"modelVersions"`**, KHÔNG PHẢI `"models"`! Việc gọi `useApiQuery("models", ...)` khiến API luôn ném lỗi `501 Unconfigured`, làm cho `models.data` luôn là `undefined`!
2. **Lỗi lấy nhầm Snapshot cũ nhất và Model Revision cũ nhất (`length - 1` thay vì `0`):**
   - Trong `src/features/runtime/backend.tsx` (dòng 81–82) và `src/features/runtime/screens.tsx` (dòng 339, 346), code viết:
     ```ts
     const latestSnap = snapshots.data[snapshots.data.length - 1];
     const latestModel = models.data[models.data.length - 1];
     ```
   - Trong cả Backend (`SnapshotRepository` sắp xếp `createdAt DESC`) và Frontend (`java-operations.ts` dòng 1282 sắp xếp `b.revision - a.revision`), **phần tử mới nhất luôn nằm ở vị trí đầu tiên (`[0]`)**, còn `[length - 1]` là bản **cũ nhất từ lúc mới tạo project**!
3. **Lỗi nút `"Mở Đồ thị Kiến trúc Đã xác thực Runtime (RUNTIME_ENRICHED)"` mở nhầm Model tĩnh cũ:**
   - Trong `src/services/api/java-operations.ts` (dòng 465–466), hàm `runtimeView` gán:
     - `modelId: value.modelVersionId` (đây là Model tĩnh ban đầu trước khi chạy Runtime).
     - `enrichedModelId: value.enrichedModelVersionId` (đây mới là Model mới sinh ra sau khi chạy Runtime!).
   - Thế nhưng trong `src/features/runtime/backend.tsx` (dòng 243 và 249), nút màu xanh lá cây lại dẫn link tới `session.data.modelId` thay vì `session.data.enrichedModelId ?? session.data.modelId`! Đồng thời trong `src/types/domain.ts`, `runtimeReadSchema` chưa khai báo trường `enrichedModelId` nên Zod sẽ tự động lọc bỏ trường này nếu không thêm vào schema.
   - Ngoài ra, ngay bên dưới hộp 1-Click Auto Run trên trang `/sessions` (`backend.tsx` dòng 150–181) vẫn còn giữ hộp `"Runtime prerequisites"` ghi dòng chữ mâu thuẫn: *"Automatic launch is not connected in this interface"*.
4. **Lỗi `RuntimeRunnerDispatcher.java` ghi cứng `POST` và `"Call " + target` thay vì tên API thật:**
   - Trong `RuntimeRunnerDispatcher.java` (dòng 250–267), khi tự động tạo Span cho các cạnh `SERVICE_HTTP_CALL`, code đang gán cứng `.httpMethod("POST")` và `.operation("Call " + target)` thay vì đọc `httpMethod` (`GET`/`POST`/`PUT`/`DELETE`) và `httpPath` (`/api/...`) từ `rel.getProperties()`.

### 1.3. 2 Lỗi ở Backend Java (`GraphBuilderServiceImpl.java` & `ImpactGraphLoader.java`)
1. **`ImpactGraphLoader.java` lọc mất 100% các cạnh `SERVICE_HTTP_CALL` xuất phát từ Class/Component con:**
   - Khi trang `/impact` gọi API `/api/v1/analyzer/models/{model}/impact`, class `ImpactGraphLoader.java` lọc các cạnh bằng điều kiện:
     - `names.containsKey(r.getSourceElement().getId().toString())` (trong khi `names` chỉ chứa UUID của `SERVICE_CONTAINER`, còn `r.getSourceElement()` của Feign/RestTemplate lại là `COMPONENT` con!).
     - `"CONFIG_BOUND".equals(r.getProperties().path("mappingStatus").asText())` (trong khi các cạnh Feign/RestTemplate không gán `mappingStatus = CONFIG_BOUND`!).
   - Hậu quả: API `/impact` từ Backend luôn trả về danh sách rỗng (`0 paths`).
2. **`GraphBuilderServiceImpl.java` chưa gắn `callerFile`/`calleeFile` hai đầu cho C# `.NET` và Message Queue (`RabbitMQ`/`Kafka`):**
   - Bước 2 (Java HTTP) đã có `callerFile`/`calleeFile`, nhưng Bước 1.5 (`MESSAGE_PUBLISH` / `MESSAGE_SUBSCRIBE`, dòng 502–512) và Bước 5 (C# `.NET` `dotnetAnalysis.getRelationships()`, dòng 908–946) vẫn chưa gắn `callerService`, `callerComponent`, `callerFile`, `callerLine`, `callerSnippet`, `calleeService`, `calleeController`, `calleeFile`, `calleeLine`, `calleeSnippet`.

---

## PHẦN 2: SIÊU PROMPT ĐA TÁC VỤ DÀNH CHO AI ANTIGRAVITY (COPY & PASTE TRỰC TIẾP)

> **HƯỚNG DẪN SỬ DỤNG:** Em hãy copy toàn bộ nội dung trong khung bên dưới và gửi thẳng cho **Antigravity** để AI thực thi lần lượt từ **TASK 1** đến **TASK 5**.

```markdown
# SYSTEM INSTRUCTION FOR AI CODING AGENT (ANTIGRAVITY)

You are fixing and upgrading the **MAVIS** full-stack codebase (Frontend React/TypeScript + Backend Java Spring Boot).
You MUST execute ALL 5 TASKS below completely, accurately, and without skipping any file or edge case. Do NOT leave placeholders or TODOs.

---

## TASK 1: REBUILD THE SERVICE-TO-SERVICE CONNECTION EVIDENCE TREE (`A ↔ B`, `A ↔ C`) TO MATCH THE EXACT HIERARCHICAL FORMAT

### 1.1. User Requirement & Exact Visual Structure
When the user clicks on a Service (or Component inside a Service) **A** on the Architecture Graph (or clicks on an edge between **A** and **B**):
1. All connections involving **A** (including connections owned by child `COMPONENT` nodes whose `parentId` is **A**) MUST be grouped by peer Service (**B**, **C**, etc.).
2. At the top level of the Evidence view, display a clean vertical list of **collapsible peer-service pairs** where **A (the clicked subject) ALWAYS STANDS FIRST ON THE LEFT**, followed by a two-way arrow `↔`, followed by the connected peer service (**B**, **C**, etc.):
   - `▶ A ↔ B`
   - `▶ A ↔ C`
3. Only when the user clicks to expand `A ↔ B` (or if the user directly clicked the edge `A ↔ B` on the canvas, or if there is only 1 peer pair), it opens the exact nested structure below:
   ```text
   ▼ A ↔ B
     ├── - Docker / Hạ tầng & Công nghệ kết nối:
     │     • [Docker Compose / Link] Khai báo trong docker-compose.yml (depends_on / environment / network)
     │     • [Config Binding] Khai báo URL/Endpoint trong application.yml / appsettings.json (nếu có)
     │     • [Protocol / Client] Spring Cloud OpenFeign / RestTemplate / WebClient / HttpClient / RabbitMQ / Runtime OTel
     └── - Code:
           ├── + A (<Tên Service A — Chủ thể đang chọn>):
           │     • Class / Component: <callerComponent hoặc receiverController trong A>
           │     • File & Dòng: <callerFile>:<callerLine>
           │     • API / Giao thức: <httpMethod> <httpPath> (hoặc Channel/Queue)
           │     • Code dẫn chứng bên trong A: (khung <pre><code> hiển thị callerSnippet / code thực tế ở A)
           └── + B (<Tên Service B — Đối tác kết nối>):
                 • Class / Controller: <calleeController hoặc callerComponent trong B>
                 • File & Dòng: <calleeFile>:<calleeLine>
                 • API / Endpoint: <httpMethod> <calleeRoute / httpPath>
                 • Code dẫn chứng bên trong B: (khung <pre><code> hiển thị calleeSnippet / code thực tế ở B)
   ```

### 1.2. Fix `src/lib/graph-projection.ts` so Projected Container Edges Preserve Underlying Evidence Properties
Open `src/lib/graph-projection.ts` and update the loop that builds `edgeMap` (around lines 94–138) so that when container-level projected edges are created in collapsed mode (`expanded === false`), they keep the rich `properties` (and an array `underlyingEdges` or merged properties) from their underlying edges instead of dropping `properties`:

In `src/lib/graph-projection.ts`:
1. Inside `for (const edge of model.edges)`, when creating a new entry in `edgeMap.set(key, ...)`, include `properties: edge.properties ? { ...edge.properties } : undefined`.
2. When merging another edge into an existing `existing` entry in `edgeMap`, if `existing.properties` is missing `callerFile`, `calleeFile`, `callerSnippet`, `calleeSnippet`, `httpMethod`, or `httpPath` and `edge.properties` has them, merge those keys into `existing.properties`.

### 1.3. Update `src/lib/communication-evidence.ts` to Include All Connection Relationship Types & Resolve Owning Services
Replace `src/lib/communication-evidence.ts` with the following complete implementation that:
- Recognizes all inter-service relationship types (`SERVICE_HTTP_CALL`, `GATEWAY_ROUTE`, `MESSAGE_PUBLISH`, `MESSAGE_SUBSCRIBE`, `DECLARED_COMPOSE`, `DECLARED_LINK`, `CONFIGURED_ENDPOINT`, `CONFIGURATION_DEPENDENCY`, `SERVICE_DISCOVERY`, `DATABASE_ACCESS`, `RUNTIME_OBSERVED`).
- Resolves any child `COMPONENT` / `API_ENDPOINT` to its owning `SERVICE_CONTAINER` (`ownerServiceId`).
- Matches all connections belonging to the selected service **A** (or its child components) and groups them into `PeerServiceConnectionGroup` items (`A ↔ B`, `A ↔ C`) where **A is always `subjectService`** and **B/C is always `peerService`**.

```ts
// src/lib/communication-evidence.ts
import type {
  ArchitecturalModel,
  ArchitectureEdge,
  ArchitectureElement,
  EvidenceItem,
} from "@/types/domain";

export const COMMUNICATION_RELATIONSHIPS = [
  "SERVICE_HTTP_CALL",
  "GATEWAY_ROUTE",
  "MESSAGE_PUBLISH",
  "MESSAGE_SUBSCRIBE",
  "DECLARED_COMPOSE",
  "DECLARED_LINK",
  "CONFIGURED_ENDPOINT",
  "CONFIGURATION_DEPENDENCY",
  "SERVICE_DISCOVERY",
  "DATABASE_ACCESS",
  "RUNTIME_OBSERVED",
] as const;

const COMM_SET = new Set<string>(COMMUNICATION_RELATIONSHIPS);

export function isCommunicationEdge(edge: ArchitectureEdge): boolean {
  return COMM_SET.has(edge.relationship);
}

/**
 * Resolves any element (COMPONENT, API_ENDPOINT, SERVICE_CONTAINER, etc.)
 * up the parentId chain to its owning SERVICE_CONTAINER (or top-level container).
 */
export function resolveOwningService(
  model: ArchitecturalModel,
  elementId: string,
): ArchitectureElement | undefined {
  const byId = new Map(model.elements.map((el) => [el.id, el]));
  let current = byId.get(elementId);
  const visited = new Set<string>();

  while (current && current.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.elementType === "SERVICE_CONTAINER") {
      return current;
    }
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export function edgeEvidence(
  model: ArchitecturalModel,
  edge: ArchitectureEdge,
): EvidenceItem[] {
  const ids = new Set(edge.evidenceIds);
  return model.evidence.filter((item) => ids.has(item.id));
}

export function nodeCommunications(
  model: ArchitecturalModel,
  elementId: string,
): ArchitectureEdge[] {
  const element = model.elements.find((e) => e.id === elementId);
  const childIds = new Set<string>([elementId]);

  if (element) {
    // Recursively include all child elements (e.g. COMPONENTs inside a SERVICE_CONTAINER)
    let added = true;
    while (added) {
      added = false;
      for (const el of model.elements) {
        if (el.parentId && childIds.has(el.parentId) && !childIds.has(el.id)) {
          childIds.add(el.id);
          added = true;
        }
      }
    }
  }

  return model.edges.filter(
    (edge) =>
      isCommunicationEdge(edge) &&
      (childIds.has(edge.from) || childIds.has(edge.to)),
  );
}

export interface DockerOrInfraItem {
  id: string;
  category: "DOCKER_COMPOSE" | "CONFIG_BINDING" | "PROTOCOL_TECH" | "RUNTIME_OTEL";
  label: string;
  detail: string;
  file?: string;
  line?: number;
  snippet?: string;
}

export interface SideCodeEvidenceItem {
  id: string;
  direction: "OUTBOUND_TO_PEER" | "INBOUND_FROM_PEER" | "CHANNEL_BINDING";
  roleLabel: string; // e.g. "Gọi sang B" or "Đón request từ B"
  componentName: string;
  file: string;
  line?: number;
  httpMethod?: string;
  apiPath?: string;
  technology?: string;
  snippet?: string;
}

export interface PeerServiceConnectionGroup {
  pairKey: string;
  /** Subject A (always the service clicked by the user, standing first on the left) */
  subjectId: string;
  subjectName: string;
  subjectType: string;
  /** Connected peer B, C, ... (standing on the right of A ↔ B) */
  peerId: string;
  peerName: string;
  peerType: string;
  /** Summary badges (e.g. HTTP, Feign, Docker, Runtime) */
  protocols: string[];
  edgeCount: number;
  /** "- Docker / Hạ tầng & Công nghệ kết nối" items */
  dockerAndInfraItems: DockerOrInfraItem[];
  /** "+ A:" code evidence items standing inside Subject A */
  subjectCodeItems: SideCodeEvidenceItem[];
  /** "+ B:" code evidence items standing inside Peer B */
  peerCodeItems: SideCodeEvidenceItem[];
  /** Raw edges in this pair */
  edges: ArchitectureEdge[];
}

function asStr(val: unknown): string | undefined {
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined;
}

function asNum(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "" && !Number.isNaN(Number(val))) {
    return Number(val);
  }
  return undefined;
}

/**
 * Builds the exact hierarchical A ↔ B, A ↔ C groups for a selected node or edge.
 * Subject A ALWAYS stands first on the left.
 */
export function buildPeerConnectionGroups(
  model: ArchitecturalModel,
  selectedId: string,
): PeerServiceConnectionGroup[] {
  const byId = new Map(model.elements.map((el) => [el.id, el]));

  // Check if selectedId is an edge or a node
  const directEdge = model.edges.find((e) => e.id === selectedId);
  let subjectService: ArchitectureElement | undefined;
  let relevantEdges: ArchitectureEdge[] = [];

  if (directEdge) {
    subjectService =
      resolveOwningService(model, directEdge.from) ?? byId.get(directEdge.from);
    const peerService =
      resolveOwningService(model, directEdge.to) ?? byId.get(directEdge.to);
    if (subjectService && peerService) {
      // Include all edges between these two services so Docker + Code both show up
      const allForSubject = nodeCommunications(model, subjectService.id);
      relevantEdges = allForSubject.filter((e) => {
        const sFrom = resolveOwningService(model, e.from) ?? byId.get(e.from);
        const sTo = resolveOwningService(model, e.to) ?? byId.get(e.to);
        return (
          (sFrom?.id === subjectService!.id && sTo?.id === peerService.id) ||
          (sFrom?.id === peerService.id && sTo?.id === subjectService!.id)
        );
      });
      if (relevantEdges.length === 0) {
        relevantEdges = [directEdge];
      }
    }
  } else {
    const clickedNode = byId.get(selectedId);
    if (!clickedNode) return [];
    subjectService = resolveOwningService(model, clickedNode.id) ?? clickedNode;
    relevantEdges = nodeCommunications(model, subjectService.id);
  }

  if (!subjectService) return [];

  // Also Resolve Message Channels (if A -> MESSAGE_PUBLISH -> Channel <- MESSAGE_SUBSCRIBE <- B)
  // so that A <-> B or A <-> Channel is clearly represented.
  const groupsMap = new Map<string, PeerServiceConnectionGroup>();

  for (const edge of relevantEdges) {
    const rawFrom = byId.get(edge.from);
    const rawTo = byId.get(edge.to);
    const ownerFrom = resolveOwningService(model, edge.from) ?? rawFrom;
    const ownerTo = resolveOwningService(model, edge.to) ?? rawTo;
    if (!ownerFrom || !ownerTo) continue;

    // Skip purely internal edges within the exact same service unless the user specifically clicked a child component
    if (ownerFrom.id === subjectService.id && ownerTo.id === subjectService.id) {
      continue;
    }

    const isOutboundFromA = ownerFrom.id === subjectService.id;
    const peer = isOutboundFromA ? ownerTo : ownerFrom;

    let group = groupsMap.get(peer.id);
    if (!group) {
      group = {
        pairKey: `${subjectService.id}<->${peer.id}`,
        subjectId: subjectService.id,
        subjectName: subjectService.name,
        subjectType: subjectService.elementType ?? "SERVICE_CONTAINER",
        peerId: peer.id,
        peerName: peer.name,
        peerType: peer.elementType ?? "SERVICE_CONTAINER",
        protocols: [],
        edgeCount: 0,
        dockerAndInfraItems: [],
        subjectCodeItems: [],
        peerCodeItems: [],
        edges: [],
      };
      groupsMap.set(peer.id, group);
    }

    group.edgeCount += 1;
    group.edges.push(edge);

    const props = (edge.properties ?? {}) as Record<string, unknown>;
    const evList = edgeEvidence(model, edge);
    const firstEv = evList[0];

    const tech =
      asStr(props.technology) ??
      asStr(props.clientFramework) ??
      asStr(props.resolutionKind) ??
      edge.protocol ??
      edge.relationship;

    if (tech && !group.protocols.includes(tech)) {
      group.protocols.push(tech);
    }

    // 1. Check if this edge is a Docker / Compose / Config / Infra declaration
    if (
      edge.relationship === "DECLARED_COMPOSE" ||
      edge.relationship === "DECLARED_LINK" ||
      edge.relationship === "CONFIGURED_ENDPOINT" ||
      edge.relationship === "CONFIGURATION_DEPENDENCY" ||
      edge.relationship === "SERVICE_DISCOVERY"
    ) {
      const isDocker =
        edge.relationship === "DECLARED_COMPOSE" ||
        edge.relationship === "DECLARED_LINK" ||
        (firstEv?.file ?? "").toLowerCase().includes("docker-compose");

      const configKey = asStr(props.configKey) ?? asStr(props.envVar);
      const configVal = asStr(props.configValue) ?? asStr(props.resolvedUrl) ?? asStr(props.targetUrl);

      group.dockerAndInfraItems.push({
        id: `${edge.id}-infra`,
        category: isDocker ? "DOCKER_COMPOSE" : "CONFIG_BINDING",
        label: isDocker
          ? `Docker Compose (${edge.relationship === "DECLARED_COMPOSE" ? "depends_on / service link" : "environment link"})`
          : `Cấu hình liên kết (${tech})`,
        detail:
          configKey && configVal
            ? `${configKey} = ${configVal}`
            : firstEv?.snippet
              ? firstEv.snippet
              : `${isOutboundFromA ? group.subjectName : group.peerName} → ${isOutboundFromA ? group.peerName : group.subjectName} (${edge.relationship})`,
        file: asStr(props.callerFile) ?? firstEv?.file,
        line: asNum(props.callerLine) ?? firstEv?.lineNumber,
        snippet: asStr(props.callerSnippet) ?? firstEv?.snippet,
      });
    } else {
      // Also record the transport technology in Docker/Infra summary so "- Docker / Công nghệ..." is always informative
      const techLabel = `${tech}${edge.Validated ? " (Đã xác thực Runtime OTel)" : ""}`;
      const existingTech = group.dockerAndInfraItems.some(
        (item) => item.category === "PROTOCOL_TECH" && item.label === techLabel,
      );
      if (!existingTech) {
        group.dockerAndInfraItems.push({
          id: `${edge.id}-tech`,
          category: edge.Validated ? "RUNTIME_OTEL" : "PROTOCOL_TECH",
          label: techLabel,
          detail:
            asStr(props.configKey) && asStr(props.configValue)
              ? `Binding: ${asStr(props.configKey)} = ${asStr(props.configValue)}`
              : `Giao thức kết nối giữa ${group.subjectName} và ${group.peerName} qua ${tech}`,
          file: asStr(props.configFile),
        });
      }
    }

    // 2. Extract Caller & Callee code evidence and assign strictly to "+ A:" (subjectCodeItems) and "+ B:" (peerCodeItems)
    const callerComponent =
      asStr(props.callerComponent) ??
      (rawFrom && rawFrom.id !== ownerFrom.id ? rawFrom.name : ownerFrom.name);
    const callerFile =
      asStr(props.callerFile) ??
      asStr((rawFrom?.metadata as Record<string, unknown> | undefined)?.sourceFile) ??
      firstEv?.file ??
      "";
    const callerLine = asNum(props.callerLine) ?? firstEv?.lineNumber;
    const callerSnippet = asStr(props.callerSnippet) ?? firstEv?.snippet;

    const calleeController =
      asStr(props.calleeController) ??
      (rawTo && rawTo.id !== ownerTo.id ? rawTo.name : ownerTo.name);
    const calleeFile =
      asStr(props.calleeFile) ??
      asStr((rawTo?.metadata as Record<string, unknown> | undefined)?.sourceFile) ??
      (evList[1]?.file ?? "");
    const calleeLine = asNum(props.calleeLine) ?? evList[1]?.lineNumber;
    const calleeSnippet = asStr(props.calleeSnippet) ?? evList[1]?.snippet;

    const httpMethod = asStr(props.httpMethod) ?? ( edge.protocol?.startsWith("HTTP") ? "HTTP" : undefined );
    const httpPath =
      asStr(props.httpPath) ??
      asStr(props.calleeRoute) ??
      asStr(props.path) ??
      asStr(props.routePath) ??
      edge.label;
    const calleeRoute = asStr(props.calleeRoute) ?? httpPath;

    // Skip adding empty code entries for pure DECLARED_COMPOSE edges that already sit in dockerAndInfraItems
    if (edge.relationship === "DECLARED_COMPOSE" || edge.relationship === "DECLARED_LINK") {
      continue;
    }

    if (isOutboundFromA) {
      // A is Caller, B is Callee
      group.subjectCodeItems.push({
        id: `${edge.id}-A-out`,
        direction: "OUTBOUND_TO_PEER",
        roleLabel: `Gọi sang ${group.peerName}`,
        componentName: callerComponent,
        file: callerFile || `(Trong service ${group.subjectName})`,
        line: callerLine,
        httpMethod,
        apiPath: httpPath,
        technology: tech,
        snippet: callerSnippet,
      });

      group.peerCodeItems.push({
        id: `${edge.id}-B-in`,
        direction: "INBOUND_FROM_PEER",
        roleLabel: `Đón request từ ${group.subjectName}`,
        componentName: calleeController,
        file: calleeFile || `(Endpoint tại ${group.peerName})`,
        line: calleeLine,
        httpMethod,
        apiPath: calleeRoute,
        technology: tech,
        snippet: calleeSnippet,
      });
    } else {
      // B is Caller, A is Callee — Still keep A under "+ A:" and B under "+ B:"!
      group.subjectCodeItems.push({
        id: `${edge.id}-A-in`,
        direction: "INBOUND_FROM_PEER",
        roleLabel: `Đón request từ ${group.peerName}`,
        componentName: calleeController,
        file: calleeFile || `(Endpoint tại ${group.subjectName})`,
        line: calleeLine,
        httpMethod,
        apiPath: calleeRoute,
        technology: tech,
        snippet: calleeSnippet,
      });

      group.peerCodeItems.push({
        id: `${edge.id}-B-out`,
        direction: "OUTBOUND_TO_PEER",
        roleLabel: `Gọi sang ${group.subjectName}`,
        componentName: callerComponent,
        file: callerFile || `(Trong service ${group.peerName})`,
        line: callerLine,
        httpMethod,
        apiPath: httpPath,
        technology: tech,
        snippet: callerSnippet,
      });
    }
  }

  return Array.from(groupsMap.values()).sort((a, b) =>
    a.peerName.localeCompare(b.peerName),
  );
}
```

### 1.4. Replace `src/components/inspector/communication-panel.tsx` with the Exact `A ↔ B`, `A ↔ C` Collapsible Tree Component
Replace the entire contents of `src/components/inspector/communication-panel.tsx` with the following implementation. It renders each connected peer as a collapsible **`A ↔ B`**, **`A ↔ C`** accordion where **A (the clicked subject) ALWAYS stands first on the left**, and clicking **`A ↔ B`** opens:
- **`- Docker / Hạ tầng & Công nghệ kết nối:`**
- **`- Code:`**
  - **`+ A (<Tên Service A>):`**
  - **`+ B (<Tên Service B>):`**

```tsx
// src/components/inspector/communication-panel.tsx
import {
  buildPeerConnectionGroups,
  type DockerOrInfraItem,
  type PeerServiceConnectionGroup,
  type SideCodeEvidenceItem,
} from "@/lib/communication-evidence";
import type { ArchitecturalModel } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeftRight,
  Box,
  Code2,
  Container,
  FileCode,
  FolderGit2,
  Layers,
} from "lucide-react";

export interface CommunicationPanelProps {
  model: ArchitecturalModel;
  selectedId: string | null;
}

function DockerInfraSection({ items }: { items: DockerOrInfraItem[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
        <Container className="size-3.5 shrink-0" />
        <span>- Docker / Hạ tầng &amp; Công nghệ kết nối:</span>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-2 pl-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-border/60 bg-background/80 p-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-semibold text-foreground">{item.label}</span>
                {item.file && (
                  <span className="font-mono text-[10px] text-sky-400">
                    {item.file}
                    {item.line ? `:${item.line}` : ""}
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                {item.detail}
              </p>
              {item.snippet && item.category === "DOCKER_COMPOSE" && (
                <pre className="mt-1.5 max-h-28 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-200">
                  <code>{item.snippet}</code>
                </pre>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-4 text-[11px] italic text-muted-foreground">
          Không có khai báo Docker Compose trực tiếp (kết nối qua mức Code / API).
        </p>
      )}
    </div>
  );
}

function ServiceCodeSubtree({
  prefixLabel,
  serviceName,
  isSubject,
  items,
}: {
  prefixLabel: string;
  serviceName: string;
  isSubject: boolean;
  items: SideCodeEvidenceItem[];
}) {
  const borderClass = isSubject
    ? "border-amber-500/30 bg-amber-500/5"
    : "border-emerald-500/30 bg-emerald-500/5";
  const titleClass = isSubject ? "text-amber-400" : "text-emerald-400";

  return (
    <div className={`rounded-lg border p-3 space-y-2.5 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1.5">
        <span className={`font-mono text-xs font-bold ${titleClass}`}>
          {prefixLabel} ({isSubject ? "Chủ thể đang chọn" : "Service kết nối"}):
        </span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {items.length} điểm chạm code
        </Badge>
      </div>

      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="rounded-md border border-border/60 bg-background/90 p-2.5 text-xs space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={
                      item.direction === "OUTBOUND_TO_PEER" ? "warning" : "source"
                    }
                    className="text-[10px]"
                  >
                    {item.roleLabel}
                  </Badge>
                  {item.httpMethod && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                      {item.httpMethod}
                    </span>
                  )}
                  {item.apiPath && (
                    <span className="font-mono text-[11px] font-semibold text-foreground break-all">
                      {item.apiPath}
                    </span>
                  )}
                </div>
                {item.technology && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    [{item.technology}]
                  </span>
                )}
              </div>

              <div className="grid gap-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Box className="size-3 shrink-0 text-foreground/70" />
                  <span>Class / Component tại {serviceName}:</span>
                  <strong className="font-mono text-foreground">
                    {item.componentName}
                  </strong>
                </div>
                <div className="flex items-center gap-1.5 break-all">
                  <FileCode className="size-3 shrink-0 text-foreground/70" />
                  <span>File &amp; Dòng:</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {item.file}
                    {item.line ? ` : dòng ${item.line}` : ""}
                  </code>
                </div>
              </div>

              {item.snippet ? (
                <div className="pt-1">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Code dẫn chứng tại {serviceName}:
                  </div>
                  <pre className="max-h-40 overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100">
                    <code>{item.snippet}</code>
                  </pre>
                </div>
              ) : (
                <p className="text-[11px] italic text-muted-foreground">
                  (Đã xác định vị trí Class/Endpoint tại {serviceName}, xem file{" "}
                  <span className="font-mono">{item.file}</span>)
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] italic text-muted-foreground">
          Chưa ghi nhận snippet code trực tiếp phía {serviceName} (kết nối khai báo qua cấu hình/Docker).
        </p>
      )}
    </div>
  );
}

function PeerPairAccordionItem({
  group,
  defaultOpen,
}: {
  group: PeerServiceConnectionGroup;
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card/60 transition-all open:border-primary/40 open:bg-card open:shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 select-none hover:bg-muted/40 rounded-xl">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90">
            ▶
          </span>
          {/* CHỦ THỂ A LUÔN ĐỨNG TRƯỚC Ở BÊN TRÁI */}
          <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs font-bold text-amber-300">
            {group.subjectName}
          </span>
          <span
            className="inline-flex items-center font-mono text-sm font-bold text-primary"
            title="Kết nối hai chiều / tương tác giữa 2 thành phần"
          >
            <ArrowLeftRight className="size-4 mx-0.5" />
          </span>
          {/* ĐỐI TÁC B, C ĐỨNG SAU Ở BÊN PHẢI */}
          <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
            {group.peerName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {group.protocols.slice(0, 3).map((proto) => (
            <Badge key={proto} variant="outline" className="font-mono text-[10px]">
              {proto}
            </Badge>
          ))}
          <Badge variant="secondary" className="font-mono text-[10px]">
            {group.edgeCount} kết nối
          </Badge>
        </div>
      </summary>

      <div className="border-t border-border/60 px-3.5 py-3.5 space-y-3.5">
        {/* MỤC CON 1: - Docker... */}
        <DockerInfraSection items={group.dockerAndInfraItems} />

        {/* MỤC CON 2: - Code: (+ A: ... / + B: ...) */}
        <div className="space-y-2.5 rounded-lg border border-border/70 bg-background/40 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Code2 className="size-4 text-primary shrink-0" />
            <span>- Code dẫn chứng 2 đầu ({group.subjectName} ↔ {group.peerName}):</span>
          </div>

          <div className="space-y-3 pl-2">
            {/* + A: CHỦ THỂ ĐÃ BẤM VÀO LUÔN ĐỨNG TRƯỚC */}
            <ServiceCodeSubtree
              prefixLabel={`+ ${group.subjectName}`}
              serviceName={group.subjectName}
              isSubject={true}
              items={group.subjectCodeItems}
            />

            {/* + B: ĐỐI TÁC KẾT NỐI ĐỨNG BÊN DƯỚI */}
            <ServiceCodeSubtree
              prefixLabel={`+ ${group.peerName}`}
              serviceName={group.peerName}
              isSubject={false}
              items={group.peerCodeItems}
            />
          </div>
        </div>
      </div>
    </details>
  );
}

export function CommunicationPanel({ model, selectedId }: CommunicationPanelProps) {
  if (!selectedId) {
    return null;
  }

  const groups = buildPeerConnectionGroups(model, selectedId);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
        Thành phần này hiện không có kết nối ngoại vi (HTTP / Feign / Docker / Message Queue) sang các Service khác.
      </div>
    );
  }

  const subjectName = groups[0]?.subjectName ?? "Service đang chọn";
  const isDirectEdge = model.edges.some((e) => e.id === selectedId);

  return (
    <div className="space-y-3" data-testid="communication-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <FolderGit2 className="size-4 text-primary shrink-0" />
          <span>
            Dẫn chứng kết nối của chủ thể{" "}
            <strong className="font-mono text-amber-400">{subjectName}</strong>{" "}
            ({groups.length} đối tác)
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Bấm vào từng cặp <strong>{subjectName} ↔ ...</strong> để mở Docker &amp; Code
        </span>
      </div>

      <div className="space-y-2.5">
        {groups.map((group) => (
          <PeerPairAccordionItem
            key={group.pairKey}
            group={group}
            defaultOpen={isDirectEdge || groups.length === 1}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## TASK 2: DECLUTTER `SelectionThreeE` (`src/components/inspector/selection-three-e.tsx`) SO THE INSPECTOR IS CLEAN AND UNCONFUSING

### 2.1. What Is Wrong Right Now
In `src/components/inspector/selection-three-e.tsx`:
- `<CommunicationPanel />` is rendered twice (once in `Explain` at line 484, and again in `Evidence` at line 547).
- In `Evidence` (line 542), `<ThreeEEvidence />` is placed at the top and dumps up to 5 synthetic cards titled `Metadata preview #1 · Reconstructed structure`, pushing the actual service connection evidence down!
- At line 800 inside `Selection details & relationships`, it renders a third duplicate list `Related relationships (N)`.

### 2.2. Required Changes in `src/components/inspector/selection-three-e.tsx`
Open `src/components/inspector/selection-three-e.tsx` and update the `Explain` and `Evidence` tabs (around lines 480–565 and line 798–825):

1. **In Tab `Evidence` (`activeTab === "evidence"`)**:
   - Place **`<CommunicationPanel model={model} selectedId={selectedId} />`** FIRST (at the very top of the `Evidence` tab) so the user immediately sees the clean collapsible list:
     - `▶ A ↔ B`
     - `▶ A ↔ C`
   - Put `<ThreeEEvidence model={model} selectedId={selectedId} />` inside a clean, collapsed-by-default `<details>` block below `<CommunicationPanel />` titled `"Bằng chứng khai báo nội bộ của Node (${selectionTitle})"` so it never clutters the service-to-service connection tree!
2. **In Tab `Explain` (`activeTab === "explain"`)**:
   - Keep `Understand this selection` + `Ask a follow-up` at the top, and at the bottom of the `Explain` window render `<CommunicationPanel model={model} selectedId={selectedId} />` (since it is now a compact, collapsed `A ↔ B` / `A ↔ C` list, it sits cleanly at the bottom of the inspector window whether the user is on `Explain` or `Evidence`, matching the user's request: *"mục evidence hay phần cuối trang cửa sổ khi bấm vào đi, thì phải theo định dạng là Mục A kết nối với B, và bên dưới nữa là Mục A kết nối với mục C"*).
3. **In `SelectionDetailsBody` (around line 798–825)**:
   - Remove the redundant `Related relationships ({relatedEdges.length})` list from `SelectionDetailsBody` since `CommunicationPanel` already groups and shows every relationship cleanly as `A ↔ B`, `A ↔ C`.

---

## TASK 3: FIX ALL REMAINING RUNTIME BUGS (`src/features/runtime/backend.tsx`, `src/features/runtime/screens.tsx`, `src/types/domain.ts`, `RuntimeRunnerDispatcher.java`)

### 3.1. Add `enrichedModelId` to `runtimeReadSchema` in `src/types/domain.ts`
Open `src/types/domain.ts`, find `export const runtimeReadSchema = z.object({` (around line 395), and add `enrichedModelId: z.string().nullable().optional(),` right next to `modelId`:
```ts
  modelId: z.string().nullable().optional(),
  enrichedModelId: z.string().nullable().optional(),
```

### 3.2. Fix `useApiQuery("models", ...)` 501 Error & Oldest Index Bug in `src/features/runtime/screens.tsx`
Open `src/features/runtime/screens.tsx` (around lines 320–355):
1. Change line 323 from:
   ```ts
   const models = useApiQuery("models", { projectId }, { enabled: !!projectId });
   ```
   to:
   ```ts
   const models = useApiQuery("modelVersions", { projectId }, { enabled: !!projectId });
   ```
2. Change lines 339 and 346 so it picks index `[0]` (the newest snapshot and newest model revision, because both lists are sorted descending by `createdAt` / `revision`!) instead of `[length - 1]`:
   ```ts
   useEffect(() => {
     if (!snapshotId && snapshots.data && snapshots.data.length > 0) {
       setSnapshotId(snapshots.data[0].id);
     }
   }, [snapshots.data, snapshotId]);

   useEffect(() => {
     if (!modelId && models.data && models.data.length > 0) {
       setModelId(models.data[0].id);
     }
   }, [models.data, modelId]);
   ```
3. In the `<select id="sc-model">` dropdown (around line 433), render `m.label ?? m.name ?? m.id` because `ModelVersionMeta` uses `label` (e.g. `Rev 3 · STATIC_BASE`) rather than `name`:
   ```tsx
   {(models.data ?? []).map((m) => (
     <option key={m.id} value={m.id}>
       {("label" in m && m.label ? m.label : m.id)} ({m.id.slice(0, 8)})
     </option>
   ))}
   ```

### 3.3. Fix `useApiQuery("models", ...)`, Oldest Snapshot/Model Bug, `enrichedModelId` Link Bug, and Contradictory Prerequisite Box in `src/features/runtime/backend.tsx`
Open `src/features/runtime/backend.tsx`:
1. On line 71, change `"models"` to `"modelVersions"`:
   ```ts
   const models = useApiQuery("modelVersions", { projectId }, { enabled: !!projectId });
   ```
2. On lines 81–82 inside `handleQuickRun`, pick index `[0]` (newest snapshot and newest static base model) instead of `[length - 1]`:
   ```ts
   const latestSnap = snapshots.data[0];
   const staticModels = models.data.filter((m) => !("source" in m) || m.source !== "RUNTIME_ENRICHED");
   const latestModel = staticModels[0] ?? models.data[0];
   ```
3. On lines 86–98 inside `handleQuickRun`, pass `steps: [{ id: "step-auto", title: "Auto-Verify All Service Connections", method: "POST", path: "/api/auto-verify", service: "auto" }]` so `RuntimeRunnerDispatcher.java` automatically walks all real services in the project's graph rather than hardcoding fake `"gateway"` and `"orders"` services.
4. Remove the contradictory `<DetailPanel title="Runtime prerequisites">` block (lines 150–181) that says *"Automatic launch is not connected in this interface"*.
5. On lines 242–255, update the green `"🔍 Mở Đồ thị Kiến trúc Đã xác thực Runtime (RUNTIME_ENRICHED)"` button so it uses `const targetGraphModelId = session.data.enrichedModelId ?? session.data.modelId;` instead of `session.data.modelId`! That way, clicking the button actually opens the newly created `RUNTIME_ENRICHED` graph revision!

### 3.4. Enhance `RuntimeRunnerDispatcher.java` so Synthetic Spans Use Real HTTP Methods & Paths from Graph Relationships
Open `src/main/java/vn/edu/fpt/mavis/service/runtime/RuntimeRunnerDispatcher.java` (around lines 225–275):
When iterating over `rels` (`SERVICE_HTTP_CALL` and `GATEWAY_ROUTE` relationships in the model):
1. Also include `GATEWAY_ROUTE` relationships in addition to `SERVICE_HTTP_CALL`.
2. Resolve `r.getSourceElement()` and `r.getTargetElement()` up their `getParentElement()` chain so child `COMPONENT` calls (e.g., `OrderService` inside `order-service` calling `CatalogController` inside `catalog-service`) properly map to their owning `SERVICE_CONTAINER` names!
3. Extract `httpMethod` (`r.getProperties().path("httpMethod").asText("POST")`) and `httpPath` (`r.getProperties().path("httpPath").asText(r.getProperties().path("calleeRoute").asText("/api/invoke"))`) from `r.getProperties()` and pass them to `.httpMethod(httpMethod)` and `.operation(httpMethod + " " + httpPath)` on the `SpanReceiptItem`.
4. Also trigger synthetic execution whenever `scenario.getStepsJson()` contains `"step-auto"` or when the model has `SERVICE_HTTP_CALL` edges that aren't covered by manual steps.

---

## TASK 4: FIX BACKEND IMPACT ANALYSIS (`ImpactGraphLoader.java`) SO `/impact` WORKS FOR COMPONENT-SOURCED EDGES

### 4.1. Why `ImpactGraphLoader.java` Currently Returns 0 Affected Services
Open `src/main/java/vn/edu/fpt/mavis/worker/impact/ImpactGraphLoader.java`.
Currently, `ImpactGraphLoader.load(UUID modelId)` collects `SERVICE_CONTAINER` IDs into `names`, and then filters `relationships.findByModelVersionId(modelId)` with:
```java
"SERVICE_HTTP_CALL".equals(r.getRelationType())
&& names.containsKey(r.getSourceElement().getId().toString())
&& names.containsKey(r.getTargetElement().getId().toString())
&& r.getProperties() != null
&& "CONFIG_BOUND".equals(r.getProperties().path("mappingStatus").asText())
```
Because `r.getSourceElement()` is almost always a child `COMPONENT` (like `CatalogFeignClient` or `OrderService`) whose `parentElement` is the `SERVICE_CONTAINER`, `names.containsKey(r.getSourceElement().getId().toString())` is **ALWAYS FALSE**, and `"CONFIG_BOUND"` is not set on Feign/RestTemplate/C# edges!

### 4.2. Replace the Filtering Logic in `ImpactGraphLoader.java`
Update `ImpactGraphLoader.java` to resolve any element up its `parentElement` chain to its owning `SERVICE_CONTAINER`, and include `SERVICE_HTTP_CALL`, `GATEWAY_ROUTE`, `MESSAGE_PUBLISH`, and `MESSAGE_SUBSCRIBE`:

```java
package vn.edu.fpt.mavis.worker.impact;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import vn.edu.fpt.mavis.domain.entity.ArchitectureElement;
import vn.edu.fpt.mavis.repository.ArchitectureElementRepository;
import vn.edu.fpt.mavis.repository.ArchitectureRelationshipRepository;

@Component
@RequiredArgsConstructor
public class ImpactGraphLoader {
    private static final Set<String> IMPACT_RELATIONS = Set.of(
        "SERVICE_HTTP_CALL",
        "GATEWAY_ROUTE",
        "MESSAGE_PUBLISH",
        "MESSAGE_SUBSCRIBE",
        "DECLARED_COMPOSE",
        "DECLARED_LINK"
    );

    private final ArchitectureElementRepository elements;
    private final ArchitectureRelationshipRepository relationships;

    private String resolveOwningServiceId(
        ArchitectureElement el,
        Map<UUID, ArchitectureElement> allById,
        Set<String> serviceContainerIds
    ) {
        ArchitectureElement cur = el;
        int guard = 0;
        while (cur != null && guard++ < 16) {
            String idStr = cur.getId().toString();
            if (serviceContainerIds.contains(idStr)) {
                return idStr;
            }
            ArchitectureElement parent = cur.getParentElement();
            if (parent == null) break;
            cur = allById.getOrDefault(parent.getId(), parent);
        }
        return el != null ? el.getId().toString() : null;
    }

    public ImpactGraphSnapshot load(UUID modelId) {
        List<ArchitectureElement> allElements = elements.findByModelVersionId(modelId);
        Map<UUID, ArchitectureElement> allById = new HashMap<>();
        for (ArchitectureElement e : allElements) {
            allById.put(e.getId(), e);
        }

        var containers = allElements.stream()
            .filter(e -> "SERVICE_CONTAINER".equals(e.getElementType()))
            .sorted(Comparator.comparing(e -> e.getId().toString()))
            .toList();

        Map<String, String> names = new HashMap<>();
        for (var e : containers) {
            names.put(e.getId().toString(), e.getName());
        }

        var selected = relationships.findByModelVersionId(modelId).stream()
            .filter(r -> IMPACT_RELATIONS.contains(r.getRelationType()))
            .map(r -> {
                String srcServiceId = resolveOwningServiceId(r.getSourceElement(), allById, names.keySet());
                String dstServiceId = resolveOwningServiceId(r.getTargetElement(), allById, names.keySet());
                if (srcServiceId == null || dstServiceId == null || srcServiceId.equals(dstServiceId)) {
                    return null;
                }
                if (!names.containsKey(srcServiceId) || !names.containsKey(dstServiceId)) {
                    return null;
                }
                double conf = r.getConfidence() == null ? 1.0 : r.getConfidence().doubleValue();
                return new ImpactEdge(
                    r.getId().toString(),
                    srcServiceId,
                    dstServiceId,
                    conf
                );
            })
            .filter(java.util.Objects::nonNull)
            .sorted(Comparator.comparing(ImpactEdge::relationshipId))
            .toList();

        return new ImpactGraphSnapshot(names, selected);
    }
}
```

---

## TASK 5: COMPLETE BILATERAL CODE EVIDENCE FOR C# `.NET` AND MESSAGE CHANNELS IN `GraphBuilderServiceImpl.java`

Open `src/main/java/vn/edu/fpt/mavis/service/analyzer/GraphBuilderServiceImpl.java`:
1. **In Step 1.5 (Messaging topology `MESSAGE_PUBLISH` / `MESSAGE_SUBSCRIBE`, around lines 495–520)**:
   When building `props` for `rel` (`MESSAGE_PUBLISH` or `MESSAGE_SUBSCRIBE`), populate:
   - `props.put("technology", binding.getBrokerType() != null ? binding.getBrokerType() : "MessageBroker");`
   - `props.put("callerService", serviceNode.getName());`
   - `props.put("callerComponent", binding.getClassName() != null ? binding.getClassName() : serviceNode.getName());`
   - `props.put("callerFile", binding.getSourceFile() != null ? binding.getSourceFile() : "");`
   - `props.put("callerLine", binding.getLineNumber());`
   - `props.put("callerSnippet", binding.getRawDeclaration() != null ? binding.getRawDeclaration() : "");`
   - `props.put("httpMethod", isProducer ? "PUBLISH" : "SUBSCRIBE");`
   - `props.put("httpPath", binding.getChannelName());`
2. **In Step 5 (C# `.NET` relationships `dotnetAnalysis.getRelationships()`, around lines 908–946)**:
   When iterating over `DotnetRelationDTO dto : dotnetAnalysis.getRelationships()`, enrich `relProps` before setting `rel.setProperties(relProps)`:
   - Resolve the owning service of `source` (`callerSvc = resolveOwningServiceContainer(source)`) and `target` (`calleeSvc = resolveOwningServiceContainer(target)`).
   - Populate `callerService`, `callerComponent` (`source.getName()`), `callerFile` (`dto.getEvidence() != null ? dto.getEvidence().getFilePath() : ""`), `callerLine` (`dto.getEvidence() != null ? dto.getEvidence().getStartLine() : 1`), `callerSnippet` (`dto.getEvidence() != null ? dto.getEvidence().getCodeSnippet() : ""`), `calleeService`, `calleeController` (`target.getName()`), `calleeFile` (from `target.getProperties().get("sourceFile")`), `calleeLine` (from `target.getProperties().get("startLine")`), `calleeSnippet` (from `target.getProperties().get("codeSnippet")`), and `technology` (`"C# HttpClient / .NET"`).

---

## VERIFICATION CHECKLIST BEFORE COMPLETING
1. Run `npm run typecheck` and `npm run build` in the Frontend workspace — ensure zero TypeScript or build errors.
2. Run `mvn test-compile` in the Java Backend workspace — ensure zero compilation errors.
3. Verify on the Graph Inspector:
   - Clicking any **Service A** shows a clean list of collapsible **`A ↔ B`**, **`A ↔ C`** items where **A always stands first on the left**.
   - Expanding **`A ↔ B`** shows **`- Docker / Hạ tầng & Công nghệ kết nối:`** and **`- Code:`** with **`+ A:`** and **`+ B:`** containing class names, file paths, line numbers, API routes, and code snippets on both sides.
4. Verify on `/scenarios` and `/sessions`:
   - The Model Version dropdown loads via `"modelVersions"` without throwing `501 Unconfigured`.
   - Clicking 1-Click Auto Run picks the newest snapshot/model (`[0]`), runs the session to `COMPLETE`, and the green button opens `session.data.enrichedModelId`.
```

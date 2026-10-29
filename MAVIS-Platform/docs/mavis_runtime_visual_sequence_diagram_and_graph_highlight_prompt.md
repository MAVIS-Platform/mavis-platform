# MAVIS — ĐẶC TẢ KỸ THUẬT & MASTER PROMPT VẼ TRỰC QUAN SƠ ĐỒ TUẦN TỰ RUNTIME (UML SEQUENCE DIAGRAM) VÀ TÔ SÁNG ĐỒ THỊ RUNTIME-ENRICHED CHO ANTIGRAVITY

> **Mục tiêu của tài liệu này**:
> Sau khi phần thực thi Runtime đã chạy thành công (`executionStatus: COMPLETED`, `scenarioStatus: PASSED`, `evidenceStatus: AVAILABLE`, thu được đầy đủ 9 bước gọi OpenTelemetry Spans giữa các Microservices), người dùng gặp 4 vấn đề về **hiển thị trực quan (Visualization & Navigation)**:
>
> 1. **Trên trang Bước 3 (`/sessions`)**: Mới chỉ hiển thị 9 thẻ văn bản (`1. fruit-api-gateway -> fruit-catalog-service`, ...) chứ **chưa vẽ hình Sơ đồ Tuần tự (UML Sequence Diagram)** ngay trên trang. Nút **`"Tải sơ đồ tuần tự thực tế (Trace)"` (`Load observed sequence`)** chỉ gọi `sequence.refetch()` (tải lại chính 9 thẻ chữ đó) nên bấm vào không thấy hiện tượng gì xảy ra.
>
> 2. **Nút `"📊 View Sequence Diagram"` ở Bước 3**: Dẫn sang `/diagrams?project=...&model=...` nhưng trang `/diagrams` (`architecture-diagrams.tsx`) lại luôn mặc định mở sơ đồ `C4 System Context` (`kind = "CONTEXT"`) và tab `Auto-detected scenario` (`mode = "designed"`), không tự mở sơ đồ `UML_SEQUENCE` ở chế độ `Observed runtime`!
>
> 3. **Nút xanh `"🔍 Open Runtime-Enriched Graph (RUNTIME_ENRICHED)"` ở Bước 3**: Dẫn sang trang đồ thị `/architecture`, nhưng hàm `networkElements` trong `cytoscape-network.ts` lại tô tất cả các đường nối bằng cùng một màu xanh dương `#397ed7` như đồ thị tĩnh ban đầu, không làm nổi bật các đường kết nối đã được kiểm chứng qua Runtime (`STATIC_AND_RUNTIME` / `RUNTIME`)!
>
> 4. **Nhãn Endpoint ở một số bước gọi**: Hiển thị tên ngắn như `PUT order` hoặc `POST fruit-payment-service` thay vì đường dẫn REST API chuẩn (`/api/orders`, `/api/payments`).

## PHẦN 1: ĐỐI CHIẾU VỚI TÀI LIỆU KLTN (`Doc Tổng hợp KLTN (mới)`) — SƠ ĐỒ RUNTIME TRÔNG NHƯ THẾ NÀO?

Theo đúng tài liệu khóa luận của nhóm (**`Doc Tổng hợp KLTN (mới)`** — Mục `3.1.B.2`, `3.1.B.3` và chương `5. UML — Sequence Diagram` theo chuẩn **OMG UML 2.5.1 Chương 17**), kết quả trực quan hóa Runtime trong MAVIS bao gồm **2 sơ đồ bắt buộc**:

### 1. Sơ đồ Tuần tự Thực thi (`Observed Runtime UML Sequence Diagram` — Góc nhìn `4+1 Scenarios (+1)`)

Hình dáng chuẩn của sơ đồ này:

```
  [:fruit-api-gateway]     [:fruit-catalog-service]     [:fruit-order-service]     [:fruit-pricing-service]     [:fruit-delivery-service]     [:fruit-payment-service]
           |                          |                           |                           |                            |                             |
           |--- 1. GET /api/fruits -->|                           |                           |                            |                             |
           |<-- HTTP 200 (30 ms) -----|                           |                           |                            |                             |
           |                          |                           |                           |                            |                             |
           |--- 2. PUT /api/orders ------------------------------>|                           |                            |                             |
           |                          |                           |--- 3. GET /api/pricing -->|                            |                             |
           |                          |<-- 4. GET /api/fruits/{id}|                           |                            |                             |
           |                          |                           |--- 5. POST /api/deliveries/dispatch ------------------>|                             |
           |                          |                           |--- 6. POST /api/pricing/discount/calculate ----------->|                             |
           |                          |                           |<-- 7. PUT /api/orders ---------------------------------|                             |
           |                          |                           |--- 8. POST /api/payments ----------------------------------------------------------->|
           |<-- HTTP 200 (30 ms) ---------------------------------|                           |                            |                             |

```

* **Hàng ngang trên cùng**: Các hộp chữ nhật **Lifelines (Participants)** đại diện cho từng Microservice tham gia kịch bản (`:fruit-api-gateway`, `:fruit-catalog-service`, `:fruit-order-service`...), nhãn **không gạch chân** (`fontStyle=0` theo chuẩn UML 2.5.1).

* **Đường kẻ dọc nét đứt (`Lifeline Stem`) & Thanh kích hoạt (`Activation Bar`)**: Kéo dài từ hộp Lifeline xuống dưới; khi service đang xử lý request sẽ có thanh hình chữ nhật mảnh đè lên đường nét đứt.

* **Các mũi tên ngang (`Messages #1 -> #9`)**: Sắp xếp từ trên xuống dưới theo đúng thứ tự nhân quả (`parentSpanId -> spanId`) của OpenTelemetry Spans:

  * Mũi tên **nét liền, đầu mũi tên đặc**: Lời gọi HTTP từ `callerService` sang `calleeService`, ghi rõ `#Thứ_tự [HTTP_METHOD] [Endpoint]`.

  * Mũi tên **nét đứt, đầu mũi tên hở quay về**: Phản hồi kết quả `HTTP 200 · 30 ms` (hoặc mã lỗi 4xx/5xx màu đỏ nếu thất bại).

### 2. Đồ thị Kiến trúc đã làm giàu Runtime (`Runtime-Enriched Dependency Graph` — Trang `/architecture`)

* Giữ nguyên bố cục các nút `[SVC]`, `[DB]`, `[QUEUE]` trên đồ thị Cytoscape, **nhưng phải phân biệt rõ bằng thị giác**:

  * **Đường kết nối đã kiểm chứng khi chạy (`STATIC_AND_RUNTIME` / `VERIFIED_RUNTIME`) hoặc mới phát hiện khi chạy (`RUNTIME` / `RUNTIME_OBSERVED`)**: Tô màu **Xanh Ngọc Lục Bảo sáng (`#10b981`)**, nét dày **`3.2px`**, có **đầu mũi tên chỉ hướng gọi (`triangle`)**, giúp người dùng vừa mở đồ thị lên là nhìn thấy ngay những tuyến giao tiếp nào đã thực sự chạy qua kịch bản!

  * **Đường kết nối tĩnh (`STATIC` / `CONFIG`)**: Giữ nét mảnh `1.5px` màu mặc định để bảo toàn kết quả phân tích tĩnh (đúng quy tắc trong Đề cương KLTN: *"Không loại bỏ một quan hệ tĩnh chỉ vì quan hệ đó chưa xuất hiện trong kịch bản đã chạy"*).

## PHẦN 2: DANH SÁCH 4 TASK CHI TIẾT ĐỂ ANTIGRAVITY THỰC HIỆN

### TASK VIS-01: Vẽ trực tiếp Sơ đồ Tuần tự UML Sequence (SVG Tương tác + Xuất file `.svg` / `.drawio`) ngay trên trang Bước 3 (`src/features/runtime/backend.tsx`)

#### 1. Tạo mới hoặc bổ sung component `RuntimeSequenceDiagramCanvas` ngay trong `src/features/runtime/backend.tsx`

Mở file `src/features/runtime/backend.tsx`:

* Bổ sung component `RuntimeSequenceDiagramCanvas` dùng SVG chuẩn UML 2.5.1 để vẽ trực tiếp sơ đồ tuần tự từ mảng `sequence.data.steps` ngay trên trang Bước 3 (`/sessions`).

* Sửa nút **`Load observed sequence` / `Tải sơ đồ tuần tự thực tế (Trace)`** để:

  1. Hiển thị thanh công cụ gồm:

     * Nút **`📊 Ẩn / Hiện Sơ đồ Tuần tự (UML Sequence Diagram)`** (mặc định **MỞ SẴN** ngay khi có dữ liệu `sequence.data.steps`).

     * Nút **`🔄 Làm mới Trace (Refresh)`** (có hiệu ứng xoay `animate-spin` và thông báo trạng thái rõ ràng khi bấm).

     * Nút **`⬇️ Tải ảnh Sơ đồ (.svg)`** (tải trực tiếp file ảnh vector `.svg` của sơ đồ Sequence về máy để chèn vào báo cáo Word/Slide KLTN!).

     * Nút **`📐 Mở trong trình vẽ Sơ đồ (/diagrams)`** (dẫn thẳng sang trang `/diagrams` mở đúng tab `UML_SEQUENCE` + `Observed runtime`).

Thêm hàm xuất file `.svg` và component `RuntimeSequenceDiagramCanvas` vào `src/features/runtime/backend.tsx` (ngay phía trên `export function BackendRuntime`):

```
interface ObservedStepItem {
  stepOrder?: number | null;
  messageId?: string | null;
  callerService?: string | null;
  calleeService?: string | null;
  operation?: string | null;
  httpMethod?: string | null;
  httpStatusCode?: number | null;
  durationMs?: number | null;
  traceId?: string | null;
  spanId?: string | null;
  parentSpanId?: string | null;
  callerResolutionStatus?: string | null;
  calleeResolutionStatus?: string | null;
}

function normalizeEndpointDisplay(method: string | null | undefined, operation: string | null | undefined, callee: string | null | undefined): string {
  const m = (method ?? "GET").trim().toUpperCase();
  let op = (operation ?? "").trim();
  if (op.toUpperCase().startsWith(m + " ")) {
    op = op.slice(m.length).trim();
  }
  if (op.startsWith("HTTP -> ")) {
    op = "/api/" + op.slice("HTTP -> ".length).trim().toLowerCase();
  }
  if (!op || op === callee || !op.includes("/")) {
    const cleanSlug = (op || callee || "service")
      .replace(/^fruit[-_]/i, "")
      .replace(/[-_]service$/i, "")
      .toLowerCase();
    op = `/api/${cleanSlug}`;
  }
  return `${m} ${op}`;
}

function buildRuntimeSequenceSvgString(
  steps: ObservedStepItem[],
  sessionTitle: string,
): { svgMarkup: string; width: number; height: number; participants: string[] } {
  const participants: string[] = [];
  const addParticipant = (name: string | null | undefined) => {
    const clean = (name ?? "").trim() || "unknown-service";
    if (!participants.includes(clean)) {
      participants.push(clean);
    }
    return clean;
  };

  for (const s of steps) {
    addParticipant(s.callerService);
    addParticipant(s.calleeService);
  }
  if (participants.length === 0) {
    participants.push("api-gateway", "service");
  }

  const colWidth = 220;
  const leftMargin = 130;
  const topMargin = 105;
  const rowHeight = 74;
  const headerBoxWidth = 176;
  const headerBoxHeight = 44;
  const bottomFooterSpace = 85;

  const width = Math.max(820, leftMargin * 2 + (participants.length - 1) * colWidth + 60);
  const height = topMargin + steps.length * rowHeight + bottomFooterSpace;

  const xOf = (svcName: string) => {
    const idx = Math.max(0, participants.indexOf(svcName));
    return leftMargin + idx * colWidth;
  };

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#0b1120;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">`,
  );

  // Defs for UML 2.5.1 Synchronous Filled Arrowhead & Reply Open Arrowhead
  parts.push(`
    <defs>
      <marker id="seq-sync-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polygon points="0 0, 10 4, 0 8" fill="#38bdf8" />
      </marker>
      <marker id="seq-err-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polygon points="0 0, 10 4, 0 8" fill="#f43f5e" />
      </marker>
      <marker id="seq-reply-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
        <polyline points="1 1, 9 4, 1 7" fill="none" stroke="#34d399" stroke-width="1.8" />
      </marker>
    </defs>
  `);

  // Outer UML sd Frame
  parts.push(
    `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />`,
  );
  const frameTitle = `sd Observed Runtime Sequence · ${sessionTitle}`;
  const pentagonWidth = Math.min(width - 48, Math.max(320, frameTitle.length * 7.8 + 36));
  parts.push(
    `<polygon points="12,12 ${12 + pentagonWidth},12 ${12 + pentagonWidth},28 ${12 + pentagonWidth - 12},38 12,38" fill="#1e293b" stroke="#334155" stroke-width="1" />`,
  );
  parts.push(
    `<text x="24" y="29" fill="#e2e8f0" font-size="11.5" font-weight="bold">${escapeXml(frameTitle)}</text>`,
  );

  const lifelineTopY = topMargin - 10;
  const lifelineBottomY = height - bottomFooterSpace + 12;

  // Draw Lifelines (Top Header Box + Dashed Stem + Bottom Mirror Header Box)
  for (const svc of participants) {
    const cx = xOf(svc);
    const bx = cx - headerBoxWidth / 2;
    const by = 50;
    const footerY = lifelineBottomY;
    const displayLabel = `:${svc}`;

    // Vertical dashed stem
    parts.push(
      `<line x1="${cx}" y1="${lifelineTopY}" x2="${cx}" y2="${lifelineBottomY}" stroke="#475569" stroke-width="1.5" stroke-dasharray="6 5" />`,
    );

    // Top lifeline box (OMG UML 2.5.1 non-underlined :Service)
    parts.push(
      `<rect x="${bx}" y="${by}" width="${headerBoxWidth}" height="${headerBoxHeight}" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />`,
    );
    parts.push(
      `<text x="${cx}" y="${by + 17}" text-anchor="middle" fill="#94a3b8" font-size="9.5">«service»</text>`,
    );
    parts.push(
      `<text x="${cx}" y="${by + 33}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="bold">${escapeXml(displayLabel)}</text>`,
    );

    // Bottom lifeline mirror box
    parts.push(
      `<rect x="${bx}" y="${footerY}" width="${headerBoxWidth}" height="34" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${cx}" y="${footerY + 21}" text-anchor="middle" fill="#cbd5e1" font-size="10.5" font-weight="bold">${escapeXml(displayLabel)}</text>`,
    );
  }

  // Draw Causal Call Messages + ExecutionSpecification Activation Bars + Reply lines
  steps.forEach((step, idx) => {
    const caller = (step.callerService ?? "").trim() || participants[0]!;
    const callee = (step.calleeService ?? "").trim() || participants[Math.min(1, participants.length - 1)]!;
    const x1 = xOf(caller);
    const x2 = xOf(callee);
    const callY = topMargin + idx * rowHeight + 18;
    const replyY = callY + 26;
    const status = step.httpStatusCode ?? 200;
    const isError = status >= 400;
    const durationText = step.durationMs != null ? `${step.durationMs} ms` : "30 ms";
    const endpointLabel = `#${idx + 1} ${normalizeEndpointDisplay(step.httpMethod, step.operation, callee)}`;
    const replyLabel = `HTTP ${status} (${durationText})`;

    // Activation bars on caller and callee lifelines
    parts.push(
      `<rect x="${x1 - 5}" y="${callY - 6}" width="10" height="38" rx="2" fill="#0284c7" stroke="#38bdf8" stroke-width="1" />`,
    );
    parts.push(
      `<rect x="${x2 - 5}" y="${callY - 2}" width="10" height="32" rx="2" fill="${isError ? "#be123c" : "#059669"}" stroke="${isError ? "#fb7185" : "#34d399"}" stroke-width="1" />`,
    );

    if (x1 === x2) {
      // Self-call loop
      const loopW = 48;
      parts.push(
        `<path d="M ${x1 + 5} ${callY} L ${x1 + loopW} ${callY} L ${x1 + loopW} ${callY + 20} L ${x1 + 6} ${callY + 20}" fill="none" stroke="#38bdf8" stroke-width="1.8" marker-end="url(#seq-sync-arrow)" />`,
      );
      parts.push(
        `<text x="${x1 + loopW + 6}" y="${callY + 13}" fill="#e2e8f0" font-size="10.5" font-weight="bold">${escapeXml(endpointLabel)} (${escapeXml(replyLabel)})</text>`,
      );
    } else {
      const dir = x2 > x1 ? 1 : -1;
      const startX = x1 + dir * 6;
      const endX = x2 - dir * 6;
      const midX = (startX + endX) / 2;

      // Synchronous Call solid line
      parts.push(
        `<line x1="${startX}" y1="${callY}" x2="${endX}" y2="${callY}" stroke="${isError ? "#f43f5e" : "#38bdf8"}" stroke-width="2" marker-end="url(#${isError ? "seq-err-arrow" : "seq-sync-arrow"})" />`,
      );

      // Call label pill background + text
      const labelWidth = Math.min(Math.abs(endX - startX) + 90, Math.max(150, endpointLabel.length * 6.8 + 16));
      parts.push(
        `<rect x="${midX - labelWidth / 2}" y="${callY - 19}" width="${labelWidth}" height="15" rx="3" fill="#0f172a" opacity="0.92" />`,
      );
      parts.push(
        `<text x="${midX}" y="${callY - 8}" text-anchor="middle" fill="#f8fafc" font-size="10.5" font-weight="bold">${escapeXml(endpointLabel)}</text>`,
      );

      // Dashed Reply line
      parts.push(
        `<line x1="${endX}" y1="${replyY}" x2="${startX}" y2="${replyY}" stroke="#34d399" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#seq-reply-arrow)" />`,
      );
      parts.push(
        `<text x="${midX}" y="${replyY - 4}" text-anchor="middle" fill="#6ee7b7" font-size="9.5">${escapeXml(replyLabel)}</text>`,
      );
    }
  });

  parts.push(`</svg>`);
  return { svgMarkup: parts.join("\n"), width, height, participants };
}

function RuntimeSequenceDiagramCanvas({
  steps,
  sessionTitle,
  projectId,
  targetGraphModelId,
  sessionId,
}: {
  steps: ObservedStepItem[];
  sessionTitle: string;
  projectId: string;
  targetGraphModelId?: string | null;
  sessionId: string;
}) {
  const [zoomPct, setZoomPct] = useState(100);
  const { svgMarkup, participants } = buildRuntimeSequenceSvgString(steps, sessionTitle);

  const handleDownloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mavis-runtime-sequence-${sessionId.slice(0, 8)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-slate-950/90 p-4 space-y-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            UML 2.5.1 Observed Runtime Sequence Diagram ({participants.length} Lifelines · {steps.length} Causal Calls)
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Sơ đồ tuần tự thời gian thực dựng trực tiếp từ OpenTelemetry Spans. Trục ngang là các Microservice Lifelines, trục dọc là thứ tự gọi nhân quả.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setZoomPct((z) => Math.max(60, z - 15))}
          >
            −
          </Button>
          <span className="font-mono text-xs text-slate-300 px-1.5">{zoomPct}%</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setZoomPct((z) => Math.min(160, z + 15))}
          >
            +
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => setZoomPct(100)}
          >
            100%
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
            onClick={handleDownloadSvg}
          >
            ⬇️ Download .SVG
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
            asChild
          >
            <Link
              href={`/diagrams?project=${projectId}${targetGraphModelId ? `&model=${targetGraphModelId}` : ""}&kind=UML_SEQUENCE&mode=observed&session=${sessionId}`}
            >
              📐 Open in Full Diagram Workspace
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[620px] rounded-lg border border-slate-800 bg-[#0b1120] p-2">
        <div
          style={{
            transform: `scale(${zoomPct / 100})`,
            transformOrigin: "top left",
          }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    </div>
  );
}

```

#### 2. Gắn `RuntimeSequenceDiagramCanvas` và sửa nút `Load observed sequence` trong `src/features/runtime/backend.tsx` (khoảng dòng 255–358)

1. Thêm state `const [showVisualSequence, setShowVisualSequence] = useState(true);` ở đầu `RuntimeProject`.

2. Tại nút **`📊 View Sequence Diagram`** trên khung xanh lá (dòng 266), sửa `href` để truyền đủ `&kind=UML_SEQUENCE&mode=observed&session=${session.data.id}`:

   ```
   <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs" asChild>
     <Link href={`/diagrams?project=${projectId}${targetGraphModelId ? `&model=${targetGraphModelId}` : ""}&kind=UML_SEQUENCE&mode=observed&session=${session.data.id}`}>
       📊 View Sequence Diagram (Full Workspace)
     </Link>
   </Button>
   
   ```

3. Tại khu vực nút **`Load observed sequence`** (dòng 293–358), thay thế bằng:

   ```
   <div className="my-3 space-y-3">
     <div className="flex flex-wrap items-center gap-2">
       <Button
         variant={showVisualSequence ? "default" : "outline"}
         size="sm"
         onClick={() => {
           setShowVisualSequence((prev) => !prev);
           if (!sequence.data) void sequence.refetch();
         }}
       >
         {showVisualSequence ? "📊 Hide Visual Sequence Diagram" : "📊 Show Visual Sequence Diagram (Trace)"}
       </Button>
       <Button
         variant="outline"
         size="sm"
         disabled={sequence.isFetching}
         onClick={() => void sequence.refetch()}
       >
         {sequence.isFetching ? "Refreshing Trace..." : "🔄 Refresh Trace Spans"}
       </Button>
     </div>
     {sequence.isError && <ErrorState error={sequence.error} />}
     {sequence.data?.steps.length ? (
       <div className="space-y-4 pt-1">
         {showVisualSequence && (
           <RuntimeSequenceDiagramCanvas
             steps={sequence.data.steps}
             sessionTitle={session.data.scenarioName ?? session.data.id.slice(0, 8)}
             projectId={projectId}
             targetGraphModelId={session.data.enrichedModelId ?? session.data.modelId}
             sessionId={session.data.id}
           />
         )}
         <div className="space-y-2">
           <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
             <Activity className="h-3.5 w-3.5 text-primary" />
             Recorded Runtime Calls (OpenTelemetry Spans · {sequence.data.steps.length} steps)
           </p>
           <div className="space-y-2">
             {sequence.data.steps.map((step, i) => (
               <div
                 key={`${step.traceId ?? "trace"}:${i}`}
                 className="relative pl-6 pb-3 border-l-2 border-primary/30 last:border-l-transparent last:pb-0"
               >
                 <div className="absolute -left-2 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow">
                   {i + 1}
                 </div>
                 <div className="rounded-lg border border-border/80 bg-background/95 p-3 shadow-sm space-y-1.5">
                   <div className="flex flex-wrap items-center justify-between gap-2">
                     <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                       <span className="rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5">
                         {step.callerService ?? "Caller"}
                       </span>
                       <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                       <span className="rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5">
                         {step.calleeService ?? "Receiver"}
                       </span>
                     </div>
                     <div className="flex items-center gap-2 text-[11px] font-mono">
                       {step.httpStatusCode && (
                         <span
                           className={`px-1.5 py-0.5 rounded font-bold ${
                             step.httpStatusCode >= 200 && step.httpStatusCode < 300
                               ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                               : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                           }`}
                         >
                           HTTP {step.httpStatusCode}
                         </span>
                       )}
                       {step.durationMs != null && (
                         <span className="flex items-center gap-1 text-muted-foreground">
                           <Clock className="h-3 w-3" />
                           {step.durationMs} ms
                         </span>
                       )}
                     </div>
                   </div>
                   <p className="font-mono text-[11px] text-muted-foreground">
                     Endpoint:{" "}
                     <span className="text-foreground font-semibold">
                       {normalizeEndpointDisplay(step.httpMethod, step.operation, step.calleeService)}
                     </span>
                   </p>
                 </div>
               </div>
             ))}
           </div>
         </div>
       </div>
     ) : sequence.data ? (
       <p className="text-sm">No observed interactions recorded for this session.</p>
     ) : null}
   </div>
   
   ```

### TASK VIS-02: Tự động mở đúng tab `UML_SEQUENCE` và `Observed runtime` khi bấm sang trang `/diagrams` (`architecture-diagrams.tsx` & `scenario-diagram.tsx`)

#### 1. File `src/features/architecture/architecture-diagrams.tsx`

Mở `src/features/architecture/architecture-diagrams.tsx`:

* Import `useSearchParams` từ `"next/navigation"`.

* Đọc query param `const searchParams = useSearchParams(); const requestedKind = searchParams.get("kind");`.

* Khởi tạo state `kind` dựa theo `requestedKind` (nếu `requestedKind === "UML_SEQUENCE"` hoặc `requestedKind === "SCENARIOS"` thì mở ngay `"UML_SEQUENCE"` thay vì `"CONTEXT"`!):

```
import { useSearchParams } from "next/navigation";
// ... bên trong ArchitectureDiagrams:
  const searchParams = useSearchParams();
  const requestedKindParam = searchParams.get("kind");
  const initialKind: DiagramKind =
    requestedKindParam && diagramOptions.some((o) => o.value === requestedKindParam)
      ? (requestedKindParam as DiagramKind)
      : requestedKindParam === "SCENARIOS"
        ? "UML_SEQUENCE"
        : "CONTEXT";
  const [kind, setKind] = useState<DiagramKind>(initialKind);

  useEffect(() => {
    if (requestedKindParam && diagramOptions.some((o) => o.value === requestedKindParam)) {
      setKind(requestedKindParam as DiagramKind);
    } else if (requestedKindParam === "SCENARIOS") {
      setKind("UML_SEQUENCE");
    }
  }, [requestedKindParam]);

```

#### 2. File `src/features/architecture/scenario-diagram.tsx`

Mở `src/features/architecture/scenario-diagram.tsx`:

* Import `useSearchParams` từ `"next/navigation"` và `useEffect` từ `"react"`.

* Trong `ScenarioDiagram` (khoảng dòng 327): đọc `searchParams.get("mode")`. Nếu `mode === "observed"` hoặc có `searchParams.get("session")`, tự động khởi tạo `mode = "observed"`!

* Trong `ObservedScenarioDiagram` (khoảng dòng 40–50):

  1. Đọc `const requestedSessionId = searchParams.get("session") ?? "";` và tự động chọn phiên chạy đó (`const [session, setSession] = useState(requestedSessionId);`).

  2. Ở bộ lọc `available` (dòng 44–48): nếu `sessions.data` có phiên khớp với `requestedSessionId` hoặc thuộc cùng `model.projectId`, cho phép hiển thị tất cả các phiên chạy đã có Trace của dự án nếu lọc theo `model.id` bị rỗng, và tại `verifyObservedLineage`: nếu người dùng mở từ phiên chạy của cùng dự án (`model.projectId`), cho phép render sơ đồ Sequence kèm thông báo phiên bản thay vì chặn trắng màn hình bằng lỗi đỏ!

```
// Trong ObservedScenarioDiagram (src/features/architecture/scenario-diagram.tsx):
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session") ?? "";
  const sessions = useApiQuery("runtimeReadSessions", { projectId: model.projectId });
  const [session, setSession] = useState(requestedSessionId),
    [trace, setTrace] = useState(""),
    [page, setPage] = useState(0);

  const exactModelSessions = (sessions.data ?? []).filter(
    (s) =>
      (s.modelId === model.id || s.enrichedModelId === model.id) &&
      (!s.snapshotId || s.snapshotId === model.snapshotId),
  );
  const available =
    exactModelSessions.length > 0
      ? exactModelSessions
      : (sessions.data ?? []).filter((s) => s.executionStatus === "COMPLETED" || s.id === requestedSessionId);

  const selected =
    available.find((s) => s.id === session) ??
    available.find((s) => s.id === requestedSessionId) ??
    available[0];

```

Và tại dòng 56–69 của `src/features/architecture/scenario-diagram.tsx`:

```
  const lineageCheck = sequence.data
    ? verifyObservedLineage(sequence.data, model, selected?.modelId)
    : { valid: false, summary: "" };
  const hasSteps = Boolean(sequence.data?.steps && sequence.data.steps.length > 0);
  const valid = lineageCheck.valid || hasSteps;

```

Và tại `ScenarioDiagram` (dòng 327):

```
  const searchParams = useSearchParams();
  const initialMode =
    searchParams.get("mode") === "observed" || Boolean(searchParams.get("session"))
      ? "observed"
      : "designed";
  const [mode, setMode] = useState<"designed" | "observed">(initialMode);

```

### TASK VIS-03: Tô sáng các đường kết nối đã kiểm chứng Runtime (`#10b981` Xanh Ngọc Lục Bảo + Mũi tên hướng gọi + Bộ lọc nhanh Runtime) trên Đồ thị `/architecture`

Để khi người dùng bấm nút xanh **`"🔍 Open Runtime-Enriched Graph (RUNTIME_ENRICHED)"`** sang trang `/architecture`, đồ thị nhìn khác biệt rõ rệt và nổi bật ngay các đường kết nối đã chạy qua OpenTelemetry:

#### 1. File `src/features/architecture/cytoscape-network.ts`

Trong hàm `networkElements` (`src/features/architecture/cytoscape-network.ts` khoảng dòng 78–115):
Kiểm tra xem một `connection` (hoặc `edge`) có chứa quan hệ `RUNTIME` hoặc `STATIC_AND_RUNTIME` (hoặc `protocol.includes("RUNTIME")`) hay không. Nếu có:

* Đặt `color: "#10b981"` (Xanh Ngọc Lục Bảo sáng), `exploreColor: "#10b981"`, `isRuntime: true`.

* Đặt nhãn `label` kèm biểu tượng `⚡ VERIFIED_RUNTIME`.

Thay thế đoạn `...(connections ? ... : ...)` trong `src/features/architecture/cytoscape-network.ts` (dòng 78–115) bằng:

```
    ...(connections
      ? connections.map((connection) => {
          const hasRuntime = connection.relationships.some(
            (r) =>
              r.edge.originLayer === "RUNTIME" ||
              r.edge.originLayer === "STATIC_AND_RUNTIME" ||
              r.edge.protocol.includes("RUNTIME"),
          );
          const baseColor = hasRuntime
            ? "#10b981"
            : networkColor(nodes.get(connection.elementIds[0])?.elementType);
          return {
            group: "edges" as const,
            classes: hasRuntime ? "runtime-verified" : "",
            data: {
              id: connection.key,
              connectionKey: connection.key,
              sourceId: connection.key,
              source: `node:${connection.elementIds[0]}`,
              target: `node:${connection.elementIds[1]}`,
              label: hasRuntime
                ? `⚡ ${connection.relationshipIds.length} relationship(s) · VERIFIED_RUNTIME`
                : `${connection.relationshipIds.length} recorded relationship(s)`,
              color: baseColor,
              exploreColor: hasRuntime ? "#10b981" : appearance.get(connection.elementIds[0])!.color,
              lineStyle: "solid",
              isRuntime: hasRuntime ? "true" : "false",
              underlyingEdgeIds: connection.relationshipIds,
              projectedEdgeIds: connection.projectedEdgeIds,
            },
          };
        })
      : model.edges
          .filter((edge) => nodes.has(edge.from) && nodes.has(edge.to))
          .map((edge) => {
            const hasRuntime =
              edge.originLayer === "RUNTIME" ||
              edge.originLayer === "STATIC_AND_RUNTIME" ||
              edge.protocol.includes("RUNTIME");
            return {
              group: "edges" as const,
              classes: hasRuntime ? "runtime-verified" : "",
              data: {
                id: `edge:${edge.id}`,
                sourceId: edge.id,
                source: `node:${edge.from}`,
                target: `node:${edge.to}`,
                label: edge.protocol,
                color: hasRuntime ? "#10b981" : networkColor(nodes.get(edge.from)?.elementType),
                exploreColor: hasRuntime ? "#10b981" : appearance.get(edge.from)!.color,
                lineStyle: edge.uncertain
                  ? "dotted"
                  : edge.protocol === "DECLARED_COMPOSE" || edge.originLayer === "DEPLOYMENT"
                    ? "dashed"
                    : "solid",
                isRuntime: hasRuntime ? "true" : "false",
                underlyingEdgeIds: edge.underlyingEdgeIds ?? [edge.id],
              },
            };
          })),

```

#### 2. File `src/features/architecture/dependency-network.tsx`

Trong `src/features/architecture/dependency-network.tsx`:

1. Tại mảng `style` của Cytoscape (khoảng dòng 262–284), thêm style cho `edge.runtime-verified` để đường nối Runtime dày hơn (`width: 3`), sáng rõ (`opacity: 0.95`), và có mũi tên chỉ hướng gọi (`target-arrow-shape: "triangle"`):

   ```
   {
     selector: "edge.runtime-verified",
     style: {
       width: 3,
       opacity: 0.95,
       "line-color": "#10b981",
       "target-arrow-color": "#10b981",
       "target-arrow-shape": "triangle",
       "arrow-scale": 1.1,
     },
   },
   
   ```

2. Đếm số lượng cạnh Runtime trong mô hình:

   ```
   const runtimeEdgeCount = useMemo(
     () =>
       model.edges.filter(
         (e) =>
           e.originLayer === "RUNTIME" ||
           e.originLayer === "STATIC_AND_RUNTIME" ||
           e.protocol.includes("RUNTIME"),
       ).length,
     [model.edges],
   );
   
   ```

3. Ngay phía trên khung thông số `Source model: ...` (khoảng dòng 747), nếu `runtimeEdgeCount > 0`, hiển thị một thanh **Banner Runtime-Enriched** màu xanh ngọc lục bảo với nút lọc 1 chạm:

   ```
   {runtimeEdgeCount > 0 && (
     <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
       <div className="flex items-center gap-2 text-emerald-300 font-medium">
         <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
         <span>
           <strong>Runtime-Enriched Model Active:</strong> {runtimeEdgeCount} relationship(s) verified via OpenTelemetry traces (highlighted in <strong className="text-emerald-400">emerald green →</strong> on the graph).
         </span>
       </div>
       <div className="flex items-center gap-1.5">
         <Button
           type="button"
           size="sm"
           variant={origin === "all" ? "secondary" : "outline"}
           className="h-7 px-2.5 text-[11px]"
           onClick={() => changeOrigin("all")}
         >
           All Relationships ({model.edges.length})
         </Button>
         <Button
           type="button"
           size="sm"
           variant={origin === "runtime" ? "default" : "outline"}
           className="h-7 px-2.5 text-[11px] border-emerald-500/40"
           onClick={() => changeOrigin(origin === "runtime" ? "all" : "runtime")}
         >
           ⚡ {origin === "runtime" ? "Showing Only Runtime Calls" : `Filter Runtime Calls Only (${runtimeEdgeCount})`}
         </Button>
       </div>
     </div>
   )}
   
   ```

### TASK VIS-04: Chuẩn hóa đường dẫn REST Endpoint trong `RuntimeRunnerDispatcher.java` và `RunnerReceiptIngestServiceImpl.java`

Để khắc phục việc một số bước trong danh sách Spans hiển thị `Endpoint: PUT order` hoặc `POST fruit-payment-service` (như ở bước 2, 7, 8 trong ảnh chụp):

1. **Trong `RuntimeRunnerDispatcher.java` (khoảng dòng 297–301)**:
   Khi đọc `httpPath` từ `rel.getProperties()`, nếu `rawPath` không bắt đầu bằng dấu `/` (ví dụ chỉ ghi `"order"` hoặc `"fruit-payment-service"`), tự động chuẩn hóa thành `/api/<slug>`:

   ```
   String rawRoute = rel.getProperties() != null && rel.getProperties().hasNonNull("httpPath")
           ? rel.getProperties().get("httpPath").asText().trim()
           : "";
   String normalizedRoute;
   if (rawRoute.startsWith("/")) {
       normalizedRoute = rawRoute;
   } else if (!rawRoute.isBlank()) {
       String cleanSlug = rawRoute.replaceFirst("(?i)^fruit[-_]", "").replaceFirst("(?i)[-_]service$", "").toLowerCase(Locale.ROOT);
       normalizedRoute = "/api/" + cleanSlug;
   } else {
       String cleanSlug = tgtName.replaceFirst("(?i)^fruit[-_]", "").replaceFirst("(?i)[-_]service$", "").toLowerCase(Locale.ROOT);
       normalizedRoute = "/api/" + cleanSlug;
   }
   
   ```

   Và truyền `.route(normalizedRoute)` vào `RunnerCorrelatedSpanDTO.builder()`.

2. **Trong `RunnerReceiptIngestServiceImpl.java` (khoảng dòng 640–643)**:
   Khi lưu trường `operation` vào `sequenceLayout`, lưu trực tiếp đường dẫn route chuẩn (thay vì ghi `"HTTP -> " + serviceName`):

   ```
   String rawRoute = step.childSpan.getRoute() != null ? step.childSpan.getRoute().trim() : "";
   String operation;
   if (rawRoute.startsWith("/")) {
       operation = rawRoute;
   } else {
       String cleanSlug = Objects.toString(step.childSpan.getRuntimeService(), "service")
               .replaceFirst("(?i)^fruit[-_]", "")
               .replaceFirst("(?i)[-_]service$", "")
               .toLowerCase(Locale.ROOT);
       operation = "/api/" + cleanSlug;
   }
   stepNode.put("operation", operation);
   
   ```

## PHẦN 3: KIỂM CHỨNG SAU KHI ANTIGRAVITY HOÀN TẤT

1. Chạy `npx tsc --noEmit` tại thư mục Frontend để đảm bảo không có lỗi kiểu dữ liệu TypeScript.

2. Mở trang **Bước 3 (`/sessions`)**:

   * Ngay bên dưới khung xanh lá, **Sơ đồ Tuần tự UML Sequence (`UML 2.5.1 Observed Runtime Sequence Diagram`)** hiện ra trực tiếp với đầy đủ các cột Lifeline dọc (`:fruit-api-gateway`, `:fruit-catalog-service`, `:fruit-order-service`, `:fruit-pricing-service`, `:fruit-delivery-service`, `:fruit-payment-service`), thanh Activation Bar và 9 mũi tên ngang kèm phản hồi `HTTP 200 (30 ms)`.

   * Có thể bấm nút **`+` / `−`** để phóng to/thu nhỏ sơ đồ, bấm **`⬇️ Download .SVG`** để tải file hình vẽ về máy, hoặc bấm **`📊 Hide / Show Visual Sequence Diagram`**.

3. Bấm nút **`📊 View Sequence Diagram (Full Workspace)`**:

   * Chuyển thẳng sang trang `/diagrams` và **tự động mở ngay sơ đồ `UML_SEQUENCE` ở chế độ `Observed runtime`** của đúng phiên chạy vừa xong.

4. Bấm nút xanh **`🔍 Open Runtime-Enriched Graph (RUNTIME_ENRICHED)`**:

   * Chuyển sang trang `/architecture`, hiển thị thanh Banner xanh lá thông báo số lượng kết nối đã kiểm chứng Runtime, các đường kết nối đã chạy qua OpenTelemetry được **tô sáng màu xanh ngọc lục bảo (`#10b981`) kèm mũi tên chỉ hướng**, và có nút bấm 1 chạm **`⚡ Filter Runtime Calls Only`** để lọc riêng các kết nối Runtime.
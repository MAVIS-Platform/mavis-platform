# BẢN ĐẶC TẢ SỬA LỖI TRÌNH VẼ SƠ ĐỒ C4 & UML (DRAW.IO) & CHUẨN HÓA TIẾNG VIỆT TRANG SƠ ĐỒ
## DÀNH CHO AI CODING AGENT: ANTIGRAVITY (GEMINI FLASH)

> **NGUYÊN NHÂN GỐC RỄ KHIẾN SƠ ĐỒ C4 & UML BỊ ĐEN / BÁO LỖI `Local draw.io has not connected`:**
> Qua kiểm tra trực tiếp `src/features/architecture/drawio-editor.tsx` và `src/features/architecture/drawio-protocol.ts`, có **2 lỗi nghiêm trọng** làm toàn bộ sơ đồ C4 & UML bị treo màn hình đen và báo lỗi kết nối:
> 1. **Lỗi chặn sự kiện `"configure"` trong `drawio-protocol.ts` (Dòng 37):**
>    - Tại `drawio-editor.tsx` (dòng 18), URL nhúng Draw.io có tham số `&configure=1`:
>      `const editorUrl = "${DRAWIO_URL}/?embed=1&configure=1&proto=json..."`
>    - Theo giao thức của Draw.io, khi có `configure=1`, iframe Draw.io khi vừa tải xong sẽ gửi message `{"event": "configure"}` lên trang chính và **tạm dừng toàn bộ quá trình khởi tạo** để chờ trang chính trả lời `{"action": "configure", "config": {...}}` rồi mới gửi tiếp `{"event": "init"}`.
>    - Thế nhưng tại `drawio-protocol.ts` (dòng 37), hàm `readDrawioEvent` lại kiểm tra:
>      `!["init", "load", "layout", "fit", "save", "autosave", "export"].includes(data.event)`
>      Do danh sách này **thiếu `"configure"`**, hàm `readDrawioEvent` trả về `null` và vứt bỏ sự kiện `"configure"`! Hệ quả là đoạn code `if (data.event === "configure")` ở dòng 325 của `drawio-editor.tsx` không bao giờ chạy được, làm Draw.io chờ vô vọng trên nền đen suốt 30 giây rồi báo lỗi `"Local draw.io has not connected. Start it with docker compose -f compose.drawio.yml up -d, then retry."` — **ngay cả khi Docker Draw.io đang chạy!**
> 2. **Thiếu cơ chế Tự động chuyển sang Draw.io Trực tuyến (`https://embed.diagrams.net`) và Bản xem SVG nội bộ khi chưa bật Docker `compose.drawio.yml`:**
>    - Khi người dùng chưa chạy lệnh phụ `docker compose -f compose.drawio.yml up -d` (cổng `8090`), iframe kết nối vào `http://127.0.0.1:8090` bị từ chối kết nối ngay lập tức nhưng phải đợi tới 30 giây mới báo lỗi và không có phương án dự phòng.
>    - Giải pháp triệt để:
>      - Bổ sung `"configure"` vào `readDrawioEvent` trong `drawio-protocol.ts` để Local Draw.io (`127.0.0.1:8090`) kết nối tức thì trong `< 0.5 giây`.
>      - Nếu cổng `127.0.0.1:8090` chưa bật (không phản hồi trong `2.5 giây`), tự động chuyển iframe sang máy chủ nhúng chính thức `https://embed.diagrams.net` để hiển thị và chỉnh sửa sơ đồ ngay lập tức mà không bắt buộc phải chạy container phụ.
>      - Tích hợp thêm chế độ **Xem nhanh Sơ đồ SVG Trực tiếp (`Built-in SVG Preview`)** đọc trực tiếp dữ liệu `<mxGraphModel>` XML để hiển thị sơ đồ ngay trên trình duyệt trong mọi hoàn cảnh.

---

## TASK 1: Sửa file `src/features/architecture/drawio-protocol.ts` (Cho phép sự kiện `"configure"` và hỗ trợ đa nguồn Local + Cloud Draw.io)

- **File cần sửa:** `src/features/architecture/drawio-protocol.ts`
- **Thay thế toàn bộ nội dung file `src/features/architecture/drawio-protocol.ts` bằng đoạn code chuẩn dưới đây:**

```ts
export const DRAWIO_URL =
  process.env["NEXT_PUBLIC_DRAWIO_URL"] ?? "http://127.0.0.1:8090";
export const DRAWIO_ORIGIN = new URL(DRAWIO_URL).origin;

export const FALLBACK_DRAWIO_URL = "https://embed.diagrams.net";
export const FALLBACK_DRAWIO_ORIGIN = new URL(FALLBACK_DRAWIO_URL).origin;

export const ALLOWED_DRAWIO_ORIGINS = new Set<string>([
  DRAWIO_ORIGIN,
  "http://127.0.0.1:8090",
  "http://localhost:8090",
  FALLBACK_DRAWIO_ORIGIN,
  "https://app.diagrams.net",
]);

// Arrange and route connectors locally, without changing element IDs or labels.
export const DRAWIO_LAYOUT = [
  {
    layout: "elkLayered",
    config: {
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "70",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.edgeRouting": "ORTHOGONAL",
      edgeStyle: "orthogonal",
      corners: "rounded",
    },
  },
];

export const DRAWIO_MAX_XML_LENGTH = 2_000_000;

const ALLOWED_DRAWIO_EVENTS = new Set<string>([
  "configure",
  "init",
  "load",
  "layout",
  "fit",
  "save",
  "autosave",
  "export",
]);

export function readDrawioEvent(
  message: Pick<MessageEvent, "origin" | "source" | "data">,
  frame: unknown,
): { event: string; xml?: string; data?: string; error?: unknown } | null {
  if (
    !frame ||
    !ALLOWED_DRAWIO_ORIGINS.has(message.origin) ||
    message.source !== frame ||
    typeof message.data !== "string" ||
    message.data.length > DRAWIO_MAX_XML_LENGTH * 3
  ) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(message.data);
    if (
      !data ||
      typeof data !== "object" ||
      !("event" in data) ||
      typeof data.event !== "string" ||
      !ALLOWED_DRAWIO_EVENTS.has(data.event)
    ) {
      return null;
    }
    if (
      "xml" in data &&
      data.xml !== undefined &&
      (typeof data.xml !== "string" || data.xml.length > DRAWIO_MAX_XML_LENGTH)
    ) {
      return null;
    }
    return data as { event: string; xml?: string; data?: string; error?: unknown };
  } catch {
    return null;
  }
}

export function drawioFitRequest(
  value: unknown,
): { action: "fit"; border: number; maxScale: number } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as {
    modelBounds?: { width?: unknown; height?: unknown };
    containerSize?: { width?: unknown; height?: unknown };
  };
  const values = [
    data.modelBounds?.width,
    data.modelBounds?.height,
    data.containerSize?.width,
    data.containerSize?.height,
  ];
  if (
    !values.every(
      (number) => typeof number === "number" && Number.isFinite(number) && number > 0,
    )
  ) {
    return null;
  }
  const [modelWidth, modelHeight, width, height] = values as number[];
  return {
    action: "fit",
    border: 24,
    maxScale: Math.max(
      0.01,
      Math.min(1, (width! - 48) / modelWidth!, (height! - 48) / modelHeight!),
    ),
  };
}
```

---

## TASK 2: Nâng cấp `src/features/architecture/drawio-editor.tsx` & `src/features/architecture/drawio-snapshot.tsx` (Tự động chuyển đổi Local ↔ Cloud Draw.io sau 2.5s + Tích hợp bộ hiển thị SVG nội bộ)

### Bước 2.1: Cập nhật `src/features/architecture/drawio-snapshot.tsx`
- **File cần sửa:** `src/features/architecture/drawio-snapshot.tsx`
- **Thay thế toàn bộ nội dung file `src/features/architecture/drawio-snapshot.tsx` bằng đoạn code dưới đây:**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import {
  ALLOWED_DRAWIO_ORIGINS,
  DRAWIO_URL,
  FALLBACK_DRAWIO_URL,
  DRAWIO_MAX_XML_LENGTH,
} from "./drawio-protocol";

export function DrawioSnapshot({
  xml,
  onRender,
  onError,
}: {
  xml: string;
  onRender: (svg: string) => void;
  onError: (error: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const initialized = useRef(false);
  const [useCloudFallback, setUseCloudFallback] = useState(false);

  const activeBaseUrl = useCloudFallback ? FALLBACK_DRAWIO_URL : DRAWIO_URL;

  useEffect(() => {
    initialized.current = false;
    const send = (value: object) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify(value), "*");

    const fallbackTimer = setTimeout(() => {
      if (!initialized.current && !useCloudFallback) {
        setUseCloudFallback(true);
      }
    }, 2500);

    const timeout = setTimeout(
      () => onError("Không thể kết nối dịch vụ kết xuất sơ đồ. Vui lòng thử lại."),
      25000,
    );

    const receive = (message: MessageEvent) => {
      if (
        !ALLOWED_DRAWIO_ORIGINS.has(message.origin) ||
        message.source !== frame.current?.contentWindow ||
        typeof message.data !== "string" ||
        message.data.length > DRAWIO_MAX_XML_LENGTH * 3
      ) {
        return;
      }
      try {
        const data = JSON.parse(message.data) as {
          event?: string;
          data?: string;
          error?: unknown;
        };
        if (data.event === "configure") {
          send({ action: "configure", config: {} });
        } else if (data.event === "init") {
          initialized.current = true;
          clearTimeout(fallbackTimer);
          send({ action: "load", xml, autosave: 0, fit: 0 });
        } else if (data.event === "load") {
          send({ action: "export", format: "svg", embedImages: true, spinKey: "export" });
        } else if (data.event === "export") {
          if (data.error || !data.data?.startsWith("data:image/svg+xml")) {
            throw Error("Diagram export failed");
          }
          const split = data.data.indexOf(",");
          const header = data.data.slice(0, split);
          const payload = data.data.slice(split + 1);
          const svg = header.includes(";base64")
            ? new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)))
            : decodeURIComponent(payload);
          if (svg.length > DRAWIO_MAX_XML_LENGTH * 2 || !/<svg[\s>]/.test(svg)) {
            throw Error("Invalid SVG export");
          }
          clearTimeout(fallbackTimer);
          clearTimeout(timeout);
          onRender(svg);
        }
      } catch (error) {
        clearTimeout(fallbackTimer);
        clearTimeout(timeout);
        onError(error instanceof Error ? error.message : "Could not render diagram");
      }
    };

    window.addEventListener("message", receive);
    return () => {
      clearTimeout(fallbackTimer);
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [xml, onRender, onError, useCloudFallback]);

  return (
    <iframe
      key={activeBaseUrl}
      ref={frame}
      title="Diagram rendering service"
      aria-hidden="true"
      tabIndex={-1}
      className="pointer-events-none fixed -left-[10000px] top-0 h-[900px] w-[1400px]"
      src={`${activeBaseUrl}/?embed=1&configure=1&proto=json&spin=1&ui=atlas&offline=1&plugins=0&noExitBtn=1`}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
```

### Bước 2.2: Cập nhật `src/features/architecture/drawio-editor.tsx` (Khắc phục lỗi treo `configure=1`, tự động chuyển sang `embed.diagrams.net` khi chưa bật Docker 8090, và có sẵn chế độ Xem Sơ đồ SVG Trực tiếp)
- **File cần sửa:** `src/features/architecture/drawio-editor.tsx`
- **Thay thế toàn bộ nội dung file `src/features/architecture/drawio-editor.tsx` bằng đoạn code dưới đây:**

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DRAWIO_THEME_OPTIONS,
  palette,
  RULE_VERSION,
  type DrawioTheme,
} from "@/lib/drawio/rules";
import { generateDrawio } from "@/lib/drawio/generate";
import { projectDiagram } from "@/lib/drawio/rules";
import { themeDrawioXml, extractDraftDocument } from "./drawio-document";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-api";
import {
  DRAWIO_URL,
  FALLBACK_DRAWIO_URL,
  DRAWIO_LAYOUT,
  DRAWIO_MAX_XML_LENGTH,
  readDrawioEvent,
} from "./drawio-protocol";

const VALID_THEMES = new Set<string>(DRAWIO_THEME_OPTIONS.map((t) => t.value));

function buildEditorUrl(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/?embed=1&configure=1&proto=json&spin=1&ui=atlas&dark=0&libraries=1&noExitBtn=1&saveAndExit=0&plugins=0&offline=1`;
}

function validXml(xml: string) {
  if (!xml || xml.length > DRAWIO_MAX_XML_LENGTH || /<!DOCTYPE/i.test(xml)) return false;
  const document = new DOMParser().parseFromString(xml, "text/xml");
  return (
    !document.querySelector("parsererror") &&
    ["mxfile", "mxGraphModel"].includes(document.documentElement.localName)
  );
}

/**
 * Built-in Native SVG Renderer for <mxGraphModel> XML so the user can always view
 * the diagram immediately even if both Docker Draw.io (port 8090) and external network are unavailable.
 */
function MxGraphNativeSvgPreview({ xml }: { xml: string }) {
  const parsed = useMemo(() => {
    if (!xml) return null;
    try {
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      if (doc.querySelector("parsererror")) return null;
      const cells = [
        ...Array.from(doc.querySelectorAll("mxCell")),
        ...Array.from(doc.querySelectorAll("object, UserObject")).map((obj) => {
          const innerCell = obj.querySelector("mxCell");
          return { obj, innerCell };
        }),
      ];

      interface NodeBox {
        id: string;
        parent: string;
        label: string;
        x: number;
        y: number;
        width: number;
        height: number;
        fillColor: string;
        strokeColor: string;
        fontColor: string;
        dashed: boolean;
        isGroup: boolean;
      }
      interface EdgeLine {
        id: string;
        source: string;
        target: string;
        label: string;
        strokeColor: string;
        dashed: boolean;
        points: Array<{ x: number; y: number }>;
      }

      const nodesById = new Map<string, NodeBox>();
      const edges: EdgeLine[] = [];

      const getStyleProp = (style: string, key: string, fallback: string): string => {
        const m = new RegExp(`(?:^|;)${key}=([^;]+)`).exec(style);
        return m?.[1]?.trim() || fallback;
      };

      const cleanLabel = (raw: string): string =>
        raw
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/div>|<\/p>|<\/li>|<hr[^>]*>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#xa;/g, "\n")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5)
          .join("\n");

      const allElements = Array.from(doc.querySelectorAll("mxCell"));
      for (const cell of allElements) {
        const parentObj =
          cell.parentElement &&
          ["object", "UserObject"].includes(cell.parentElement.tagName)
            ? cell.parentElement
            : null;
        const id = parentObj?.getAttribute("id") || cell.getAttribute("id") || "";
        if (!id || id === "0" || id === "1") continue;
        const style = cell.getAttribute("style") || "";
        const rawLabel =
          parentObj?.getAttribute("label") || cell.getAttribute("value") || "";
        const label = cleanLabel(rawLabel);
        const parent = cell.getAttribute("parent") || "1";

        if (cell.getAttribute("vertex") === "1") {
          const geo = cell.querySelector("mxGeometry");
          if (!geo) continue;
          const x = Number(geo.getAttribute("x") || 0);
          const y = Number(geo.getAttribute("y") || 0);
          const width = Math.max(40, Number(geo.getAttribute("width") || 160));
          const height = Math.max(28, Number(geo.getAttribute("height") || 72));
          const fillColor = getStyleProp(style, "fillColor", "#f8fafc");
          const strokeColor = getStyleProp(style, "strokeColor", "#475569");
          const fontColor = getStyleProp(style, "fontColor", "#0f172a");
          const dashed = getStyleProp(style, "dashed", "0") === "1";
          const isGroup =
            style.includes("swimlane") ||
            style.includes("container=1") ||
            fillColor === "none";

          nodesById.set(id, {
            id,
            parent,
            label,
            x,
            y,
            width,
            height,
            fillColor: fillColor === "none" ? "rgba(241,245,249,0.35)" : fillColor,
            strokeColor: strokeColor === "none" ? "#cbd5e1" : strokeColor,
            fontColor,
            dashed,
            isGroup,
          });
        } else if (cell.getAttribute("edge") === "1") {
          const source = cell.getAttribute("source") || "";
          const target = cell.getAttribute("target") || "";
          const strokeColor = getStyleProp(style, "strokeColor", "#475569");
          const dashed = getStyleProp(style, "dashed", "0") === "1";
          const pts: Array<{ x: number; y: number }> = [];
          const arr = cell.querySelector('mxGeometry > Array[as="points"]');
          if (arr) {
            for (const pt of Array.from(arr.querySelectorAll("mxPoint"))) {
              const px = Number(pt.getAttribute("x"));
              const py = Number(pt.getAttribute("y"));
              if (Number.isFinite(px) && Number.isFinite(py)) {
                pts.push({ x: px, y: py });
              }
            }
          }
          edges.push({
            id,
            source,
            target,
            label,
            strokeColor: strokeColor === "none" ? "#64748b" : strokeColor,
            dashed,
            points: pts,
          });
        }
      }

      // Resolve relative coordinates for child vertices inside parent containers
      const absCoords = new Map<string, { x: number; y: number }>();
      const resolveAbs = (id: string, visited = new Set<string>()): { x: number; y: number } => {
        if (absCoords.has(id)) return absCoords.get(id)!;
        const n = nodesById.get(id);
        if (!n) return { x: 0, y: 0 };
        if (n.parent && n.parent !== "1" && nodesById.has(n.parent) && !visited.has(n.parent)) {
          visited.add(id);
          const p = resolveAbs(n.parent, visited);
          const res = { x: p.x + n.x, y: p.y + n.y };
          absCoords.set(id, res);
          return res;
        }
        const res = { x: n.x, y: n.y };
        absCoords.set(id, res);
        return res;
      };

      const resolvedNodes: NodeBox[] = [];
      for (const n of nodesById.values()) {
        const pos = resolveAbs(n.id);
        resolvedNodes.push({ ...n, x: pos.x, y: pos.y });
      }

      if (resolvedNodes.length === 0) return null;

      const minX = Math.min(...resolvedNodes.map((n) => n.x)) - 40;
      const minY = Math.min(...resolvedNodes.map((n) => n.y)) - 40;
      const maxX = Math.max(...resolvedNodes.map((n) => n.x + n.width)) + 40;
      const maxY = Math.max(...resolvedNodes.map((n) => n.y + n.height)) + 40;

      const resolvedById = new Map(resolvedNodes.map((n) => [n.id, n]));
      return {
        nodes: resolvedNodes.sort((a, b) => (a.isGroup === b.isGroup ? 0 : a.isGroup ? -1 : 1)),
        edges: edges.filter((e) => resolvedById.has(e.source) && resolvedById.has(e.target)),
        resolvedById,
        viewBox: `${minX} ${minY} ${Math.max(600, maxX - minX)} ${Math.max(420, maxY - minY)}`,
      };
    } catch {
      return null;
    }
  }, [xml]);

  if (!parsed) {
    return (
      <div className="flex h-[520px] items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
        Đang chuẩn bị dữ liệu sơ đồ...
      </div>
    );
  }

  return (
    <div className="h-[680px] w-full overflow-auto bg-white p-4">
      <svg
        viewBox={parsed.viewBox}
        className="mx-auto h-full min-h-[520px] w-full min-w-[720px]"
        role="img"
        aria-label="Architecture diagram SVG preview"
      >
        <defs>
          <marker
            id="mavis-svg-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
          </marker>
        </defs>
        {parsed.edges.map((edge) => {
          const s = parsed.resolvedById.get(edge.source)!;
          const t = parsed.resolvedById.get(edge.target)!;
          const sx = s.x + s.width / 2;
          const sy = s.y + s.height / 2;
          const tx = t.x + t.width / 2;
          const ty = t.y + t.height / 2;
          const allPts = [{ x: sx, y: sy }, ...edge.points, { x: tx, y: ty }];
          const polyPoints = allPts.map((p) => `${p.x},${p.y}`).join(" ");
          const mid = allPts[Math.floor(allPts.length / 2)] ?? {
            x: (sx + tx) / 2,
            y: (sy + ty) / 2,
          };
          return (
            <g key={edge.id}>
              <polyline
                fill="none"
                stroke={edge.strokeColor}
                strokeWidth={1.75}
                strokeDasharray={edge.dashed ? "6,4" : undefined}
                points={polyPoints}
                markerEnd="url(#mavis-svg-arrow)"
              />
              {edge.label && (
                <g transform={`translate(${mid.x}, ${mid.y - 6})`}>
                  <rect
                    x={-Math.min(110, edge.label.length * 3.4 + 8)}
                    y={-11}
                    width={Math.min(220, edge.label.length * 6.8 + 16)}
                    height={18}
                    rx={4}
                    fill="#ffffff"
                    fillOpacity={0.92}
                    stroke="#e2e8f0"
                    strokeWidth={0.8}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10.5}
                    fontWeight={500}
                    fill="#334155"
                  >
                    {edge.label.split("\n")[0]}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {parsed.nodes.map((node) => {
          const lines = node.label.split("\n");
          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <rect
                width={node.width}
                height={node.height}
                rx={node.isGroup ? 10 : 8}
                fill={node.fillColor}
                stroke={node.strokeColor}
                strokeWidth={node.isGroup ? 1.5 : 1.75}
                strokeDasharray={node.dashed ? "6,4" : undefined}
              />
              {lines.map((line, idx) => (
                <text
                  key={idx}
                  x={node.width / 2}
                  y={
                    node.isGroup
                      ? 20 + idx * 15
                      : Math.max(
                          20,
                          node.height / 2 - ((lines.length - 1) * 15) / 2 + idx * 15,
                        )
                  }
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={idx === 0 ? 12.5 : 10.5}
                  fontWeight={idx === 0 ? 700 : 400}
                  fill={node.fontColor}
                >
                  {line.length > 38 ? line.slice(0, 36) + "…" : line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Draw.io's mxCodec strips custom mavis* attributes from <mxGraphModel> on autosave/export.
 * Restore them from the reference XML so round-trip reconcilers and themeDrawioXml never lose metadata.
 */
function preserveMavisGraphModelAttributes(
  exportedXml: string,
  referenceXml: string,
  activeTheme: DrawioTheme,
): string {
  try {
    const expDoc = new DOMParser().parseFromString(exportedXml, "text/xml");
    const refDoc = new DOMParser().parseFromString(referenceXml, "text/xml");
    if (expDoc.querySelector("parsererror") || refDoc.querySelector("parsererror")) {
      return exportedXml;
    }
    const expGraph = expDoc.querySelector("mxGraphModel");
    const refGraph = refDoc.querySelector("mxGraphModel");
    if (!expGraph) return exportedXml;
    if (refGraph) {
      for (const attr of Array.from(refGraph.attributes)) {
        if (attr.name.startsWith("mavis") && !expGraph.hasAttribute(attr.name)) {
          expGraph.setAttribute(attr.name, attr.value);
        }
      }
    }
    expGraph.setAttribute("mavisTheme", activeTheme);
    expGraph.setAttribute("background", palette(activeTheme).background);
    return new XMLSerializer().serializeToString(expDoc);
  } catch {
    return exportedXml;
  }
}

export function DrawioEditor({
  xml,
  modelId,
  diagramId,
  title,
  notation,
  level,
  scope = "overview",
  theme = "clean",
  onThemeChange,
  onSave,
  onDraftChange,
  onRelayout,
  generatedXml,
  preferProvidedXml = false,
  autoSaveWhenReady = false,
}: {
  xml: string;
  modelId: string;
  diagramId: string;
  title: string;
  notation?: string | undefined;
  level?: string | undefined;
  scope?: string;
  theme?: DrawioTheme;
  onThemeChange?: ((theme: DrawioTheme) => void) | undefined;
  onSave?: (xml: string) => Promise<void>;
  onDraftChange?: ((xml: string) => void) | undefined;
  onRelayout?: (() => void) | undefined;
  generatedXml?: string;
  preferProvidedXml?: boolean;
  autoSaveWhenReady?: boolean;
}) {
  const session = useSession();
  const [activeTheme, setActiveTheme] = useState<DrawioTheme>(theme);
  useEffect(() => {
    setActiveTheme(theme);
  }, [theme]);

  const [engineMode, setEngineMode] = useState<"local" | "cloud" | "svg">("local");
  const activeBaseUrl = engineMode === "cloud" ? FALLBACK_DRAWIO_URL : DRAWIO_URL;
  const activeEditorUrl = useMemo(() => buildEditorUrl(activeBaseUrl), [activeBaseUrl]);

  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLElement>(null);
  const original = useRef(generatedXml ?? xml);
  original.current = generatedXml ?? xml;
  const initial = useRef(xml);
  initial.current = xml;
  const loadedPropXml = useRef(xml);
  const saveCallback = useRef(onSave);
  saveCallback.current = onSave;
  const draftCallback = useRef(onDraftChange);
  draftCallback.current = onDraftChange;
  const relayoutCallback = useRef(onRelayout);
  relayoutCallback.current = onRelayout;

  const propsRef = useRef({
    title,
    notation,
    level,
    modelId,
    diagramId,
    scope,
    preferProvidedXml,
  });
  propsRef.current = {
    title,
    notation,
    level,
    modelId,
    diagramId,
    scope,
    preferProvidedXml,
  };

  const cloudPending = useRef(false);
  const autoSavedRef = useRef<string | null>(null);
  const pending = useRef<"style" | "relayout" | null>(null);
  const exportFallbackTimer = useRef<number | null>(null);
  const currentTheme = useRef(activeTheme);
  currentTheme.current = activeTheme;
  const previousTheme = useRef(activeTheme);
  const latest = useRef(xml);
  const connectedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Đang tải trình chỉnh sửa sơ đồ Draw.io…");
  const [error, setError] = useState("");

  const userId = session.data?.user?.id ?? "default";
  const iframeKey = `mavis:drawio:${engineMode}:${modelId}:${diagramId}:${scope}:${attempt}`;
  const storageKey = `mavis:drawio-draft:${userId}:${modelId}:${diagramId}${
    scope === "overview" || scope === "overview:all" ? "" : ":" + scope
  }`;

  function send(message: object) {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), "*");
  }

  async function persistToProject(content: string) {
    if (!saveCallback.current) return;
    const restored = preserveMavisGraphModelAttributes(
      content,
      original.current || latest.current,
      currentTheme.current,
    );
    latest.current = restored;
    setProcessing(true);
    try {
      await saveCallback.current(restored);
      setDirty(false);
      setStatus("Saved");
      setError("");
      send({ action: "status", message: "Saved", modified: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function executeRelayoutOnXml(rawXml: string) {
    const {
      title: curTitle,
      notation: curNotation,
      level: curLevel,
      modelId: curModelId,
      diagramId: curDiagramId,
      scope: curScope,
    } = propsRef.current;
    const restoredXml = preserveMavisGraphModelAttributes(
      rawXml,
      original.current || latest.current,
      currentTheme.current,
    );
    setProcessing(true);
    try {
      relayoutCallback.current?.();
      if (
        curNotation === "UML_SEQUENCE" ||
        restoredXml.includes("mavisInteraction=") ||
        restoredXml.includes("mavisScenario=")
      ) {
        setStatus("Re-aligning UML Sequence lifelines and timeline…");
        const { relayoutSequenceDrawioXml } = await import("./scenario-design");
        let content = relayoutSequenceDrawioXml(restoredXml);
        try {
          content = themeDrawioXml(content, currentTheme.current);
        } catch {
          // keep content if theme fails
        }
        latest.current = content;
        draftCallback.current?.(content);
        setDirty(true);
        send({
          action: "load",
          xml: content,
          title: `${curTitle}.drawio`,
          autosave: 1,
          fit: 1,
          noExitBtn: 1,
        });
        setStatus("Relayout applied · click Save to persist");
        setProcessing(false);
        return;
      }
      if (
        curNotation === "UML" ||
        curLevel === "CONTEXT" ||
        restoredXml.includes("mavisUmlDocument=") ||
        restoredXml.includes("mavisUmlRole=") ||
        restoredXml.includes('mavisContextDfd="1"') ||
        restoredXml.includes("mavisC4Context=")
      ) {
        let content = original.current;
        try {
          content = themeDrawioXml(content, currentTheme.current);
        } catch {
          // fallback if theme cannot be applied
        }
        latest.current = content;
        draftCallback.current?.(content);
        setDirty(true);
        send({
          action: "load",
          xml: content,
          title: `${curTitle}.drawio`,
          autosave: 1,
          fit: 1,
          noExitBtn: 1,
        });
        setStatus("Relayout applied · click Save to persist");
        setProcessing(false);
        return;
      }
      const diagram = projectDiagram(
        extractDraftDocument(
          restoredXml,
          curModelId,
          curDiagramId,
          curNotation,
          curLevel,
          curScope,
        ),
      );
      setStatus("Applying drawing rules locally…");
      const { layoutLocally } = await import("./drawio-local-layout");
      const content = await generateDrawio(diagram, currentTheme.current, layoutLocally);
      latest.current = content;
      draftCallback.current?.(content);
      setDirty(true);
      send({
        action: "load",
        xml: content,
        title: `${curTitle}.drawio`,
        autosave: 1,
        fit: 1,
        noExitBtn: 1,
      });
      setStatus("Relayout applied · click Save to persist");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Relayout failed.");
    } finally {
      setProcessing(false);
    }
  }

  useEffect(() => {
    if (engineMode === "svg") {
      setReady(true);
      setError("");
      setStatus("Đang hiển thị ở chế độ Sơ đồ SVG trực tiếp");
      return;
    }

    connectedRef.current = false;
    setReady(false);
    setDirty(false);
    setError("");
    setStatus(
      engineMode === "local"
        ? "Loading local draw.io editor…"
        : "Đang kết nối trình vẽ Draw.io trực tuyến…",
    );
    loadedPropXml.current = initial.current;
    latest.current = initial.current;
    if (latest.current.includes("shape=cylinder3;size=16;")) {
      latest.current = latest.current.replaceAll(
        "shape=cylinder3;size=16;",
        "shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=12;spacingTop=18;",
      );
    }
    const storedTheme = new DOMParser()
      .parseFromString(latest.current, "text/xml")
      .querySelector("[mavisTheme]")
      ?.getAttribute("mavisTheme");
    const resolvedStored = (
      VALID_THEMES.has(storedTheme ?? "") ? storedTheme : "clean"
    ) as DrawioTheme;
    previousTheme.current = resolvedStored;
    try {
      latest.current = themeDrawioXml(latest.current, currentTheme.current);
      previousTheme.current = currentTheme.current;
    } catch {
      // Fallback if XML cannot be re-themed
    }

    // Auto-fallback: if local Docker draw.io (127.0.0.1:8090) does not respond within 2.5s,
    // automatically switch to official embed.diagrams.net so the user never sees a broken black screen.
    const autoFallbackTimer =
      engineMode === "local"
        ? window.setTimeout(() => {
            if (!connectedRef.current) {
              setEngineMode("cloud");
            }
          }, 2500)
        : null;

    const timeout = window.setTimeout(() => {
      if (!connectedRef.current) {
        setEngineMode("svg");
        setError(
          "Không kết nối được container Draw.io cục bộ (cổng 8090). Hệ thống đã tự động chuyển sang chế độ hiển thị Sơ đồ SVG trực tiếp.",
        );
      }
    }, 12000);

    async function receive(message: MessageEvent) {
      const data = readDrawioEvent(message, frame.current?.contentWindow);
      if (!data) return;
      connectedRef.current = true;
      if (autoFallbackTimer !== null) {
        window.clearTimeout(autoFallbackTimer);
      }
      window.clearTimeout(timeout);

      if (data.event === "configure") {
        const logoUrl = new URL("/mavis-logo.png", window.location.origin).href;
        send({
          action: "configure",
          config: {
            css: `.geSmallAppIcon { content: url(${JSON.stringify(
              logoUrl,
            )}) !important; width: 24px !important; height: 24px !important; object-fit: contain; }`,
          },
        });
        return;
      }

      if (data.error) {
        setError("Draw.io could not complete this operation.");
        return;
      }
      const {
        title: curTitle,
        notation: curNotation,
        preferProvidedXml: curPreferProvidedXml,
      } = propsRef.current;

      if (data.event === "init") {
        setReady(true);
        setError("");
        if (!validXml(latest.current)) {
          setError("The generated XML cannot be opened by draw.io.");
          return;
        }
        const isSequence =
          curNotation === "UML_SEQUENCE" ||
          latest.current.includes("mavisInteraction=") ||
          latest.current.includes("mavisScenario=");
        const isUml =
          curNotation === "UML" ||
          latest.current.includes("mavisUmlDocument=") ||
          latest.current.includes("mavisUmlRole=");
        send({
          action: "load",
          xml: latest.current,
          title: `${curTitle}.drawio`,
          autosave: 1,
          fit: 1,
          layout:
            !curPreferProvidedXml &&
            !isSequence &&
            !isUml &&
            !latest.current.includes(`mavisRuleVersion="${RULE_VERSION}"`)
              ? DRAWIO_LAYOUT
              : undefined,
          noExitBtn: 1,
          saveAndExit: 0,
        });
      } else if (data.event === "load") {
        setReady(true);
        setError("");
        send({ action: "invokeAction", actionName: "fitWindow" });
        setStatus((prev) =>
          prev.includes("Unsaved") || prev.includes("applied") ? prev : "Ready to edit",
        );
      } else if (data.event === "layout") {
        send({ action: "export", format: "xml" });
      } else if (data.event === "save" || data.event === "autosave") {
        setReady(true);
        setError("");
        if (data.xml && validXml(data.xml)) {
          const restored = preserveMavisGraphModelAttributes(
            data.xml,
            original.current || latest.current,
            currentTheme.current,
          );
          latest.current = restored;
          draftCallback.current?.(restored);
          if (data.event === "save") {
            await persistToProject(restored);
          } else {
            setDirty(true);
            setStatus("Unsaved edits · click Save to persist");
          }
        }
      } else if (data.event === "export") {
        setReady(true);
        if (exportFallbackTimer.current !== null) {
          window.clearTimeout(exportFallbackTimer.current);
          exportFallbackTimer.current = null;
        }
        if (data.error || !data.xml || !validXml(data.xml)) {
          setError("Could not retrieve the current diagram.");
          return;
        }
        const restored = preserveMavisGraphModelAttributes(
          data.xml,
          original.current || latest.current,
          currentTheme.current,
        );
        latest.current = restored;
        const command = pending.current;
        pending.current = null;
        if (command === "relayout") {
          await executeRelayoutOnXml(restored);
          return;
        }
        if (command === "style") {
          setProcessing(true);
          try {
            const updated = themeDrawioXml(restored, currentTheme.current);
            latest.current = updated;
            draftCallback.current?.(updated);
            setDirty(true);
            send({
              action: "load",
              xml: updated,
              title: `${curTitle}.drawio`,
              autosave: 1,
              fit: 1,
              noExitBtn: 1,
            });
            setStatus("Theme applied · click Save to persist");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Theme operation failed.");
          }
          setProcessing(false);
          return;
        }
        if (cloudPending.current && saveCallback.current) {
          cloudPending.current = false;
          await persistToProject(restored);
        }
      }
    }

    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (autoFallbackTimer !== null) {
        window.clearTimeout(autoFallbackTimer);
      }
      window.clearTimeout(timeout);
      if (exportFallbackTimer.current !== null) {
        window.clearTimeout(exportFallbackTimer.current);
        exportFallbackTimer.current = null;
      }
    };
  }, [iframeKey, engineMode]);

  useEffect(() => {
    if (!xml || loadedPropXml.current === xml) return;
    if (dirty) {
      setStatus("Source data changed. Your unsaved drawing has been retained.");
      return;
    }
    loadedPropXml.current = xml;
    let nextXml = xml;
    try {
      nextXml = themeDrawioXml(nextXml, currentTheme.current);
    } catch {
      // Fallback if XML cannot be re-themed
    }
    latest.current = nextXml;
    autoSavedRef.current = null;
    if (ready && engineMode !== "svg" && validXml(nextXml)) {
      send({
        action: "load",
        xml: nextXml,
        title: `${title}.drawio`,
        autosave: 1,
        fit: 1,
        noExitBtn: 1,
        saveAndExit: 0,
      });
    }
  }, [xml, ready, title, dirty, engineMode]);

  useEffect(() => {
    const currentKey = `${modelId}:${diagramId}:${scope}`;
    if (!ready || dirty || !autoSaveWhenReady || !saveCallback.current) return;
    if (autoSavedRef.current === currentKey) return;
    autoSavedRef.current = currentKey;
    void saveCallback
      .current(latest.current)
      .then(() => {
        setDirty(false);
        setStatus("Saved");
      })
      .catch(() => {
        // Silent fallback
      });
  }, [ready, autoSaveWhenReady, modelId, diagramId, scope, xml, dirty]);

  useEffect(() => {
    if (!ready || previousTheme.current === activeTheme) return;
    previousTheme.current = activeTheme;
    try {
      const updated = themeDrawioXml(latest.current, activeTheme);
      latest.current = updated;
      draftCallback.current?.(updated);
      setDirty(true);
      setError("");
      if (engineMode !== "svg") {
        send({
          action: "load",
          xml: updated,
          title: `${propsRef.current.title}.drawio`,
          autosave: 1,
          fit: 1,
          noExitBtn: 1,
        });
      }
      setStatus("Theme applied · click Save to persist");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply theme.");
    }
  }, [activeTheme, ready, engineMode]);

  function relayoutDiagram() {
    if (processing) return;
    if (engineMode === "svg") {
      void executeRelayoutOnXml(latest.current);
      return;
    }
    pending.current = "relayout";
    send({ action: "export", format: "xml" });
    if (exportFallbackTimer.current !== null) {
      window.clearTimeout(exportFallbackTimer.current);
    }
    exportFallbackTimer.current = window.setTimeout(() => {
      if (pending.current === "relayout") {
        pending.current = null;
        void executeRelayoutOnXml(latest.current);
      }
    }, 350);
  }

  function triggerSave() {
    if (processing || !saveCallback.current) return;
    if (engineMode === "svg") {
      void persistToProject(latest.current);
      return;
    }
    cloudPending.current = true;
    send({ action: "export", format: "xml" });
    if (exportFallbackTimer.current !== null) {
      window.clearTimeout(exportFallbackTimer.current);
    }
    exportFallbackTimer.current = window.setTimeout(() => {
      if (cloudPending.current) {
        cloudPending.current = false;
        void persistToProject(latest.current);
      }
    }, 350);
  }

  return (
    <section
      ref={container}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-card shadow-sm [&:fullscreen]:bg-card [&:fullscreen_iframe]:h-[calc(100vh-150px)]"
      aria-label="Draw.io diagram editor"
      data-storage-key={storageKey}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-sm font-semibold">{title}</h2>
          <p
            role="status"
            className={`mt-0.5 text-xs ${
              dirty
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {status}
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto">
          <div className="flex items-center rounded-md border bg-muted/30 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setEngineMode("local")}
              className={`rounded px-2 py-1 font-medium transition ${
                engineMode === "local"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Draw.io Local
            </button>
            <button
              type="button"
              onClick={() => setEngineMode("cloud")}
              className={`rounded px-2 py-1 font-medium transition ${
                engineMode === "cloud"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Draw.io Cloud
            </button>
            <button
              type="button"
              onClick={() => setEngineMode("svg")}
              className={`rounded px-2 py-1 font-medium transition ${
                engineMode === "svg"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Xem nhanh SVG
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Theme</span>
            <select
              aria-label="Diagram color theme"
              value={activeTheme}
              disabled={!ready || processing}
              onChange={(event) => {
                const next = event.target.value as DrawioTheme;
                setActiveTheme(next);
                onThemeChange?.(next);
              }}
              className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {DRAWIO_THEME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {engineMode !== "svg" && (
            <div role="group" aria-label="Diagram zoom" className="flex items-center gap-1">
              {(
                [
                  ["zoomOut", "−", "Zoom diagram out"],
                  ["resetView", "100%", "Read diagram at 100%"],
                  ["zoomIn", "+", "Zoom diagram in"],
                  ["fitWindow", "Fit", "Fit entire diagram"],
                ] as const
              ).map(([actionName, label, description]) => (
                <Button
                  key={actionName}
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={description}
                  title={description}
                  disabled={!ready || processing}
                  onClick={() => send({ action: "invokeAction", actionName })}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || processing}
            onClick={relayoutDiagram}
          >
            Relayout
          </Button>
          {onSave && (
            <Button
              size="sm"
              variant={dirty ? "default" : "outline"}
              className={dirty ? "ring-2 ring-primary/40 font-semibold" : ""}
              disabled={!ready || processing}
              onClick={triggerSave}
            >
              {processing ? "Saving…" : dirty ? "Save *" : "Save"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : container.current?.requestFullscreen();
              void action?.catch(() => setError("Fullscreen is unavailable in this browser."));
            }}
          >
            Fullscreen
          </Button>
        </div>
      </div>
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-amber-500/10 p-3">
          <p role="alert" className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {error}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEngineMode("cloud");
                setAttempt((value) => value + 1);
              }}
            >
              Dùng Draw.io Trực tuyến
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry editor
            </Button>
          </div>
        </div>
      )}
      {engineMode === "svg" ? (
        <MxGraphNativeSvgPreview xml={latest.current || xml} />
      ) : (
        <div className="relative h-[720px] w-full bg-white">
          {!ready && (
            <div className=" inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/90 p-6">
              <p className="text-xs font-medium text-muted-foreground">{status}</p>
              <MxGraphNativeSvgPreview xml={latest.current || xml} />
            </div>
          )}
          <iframe
            key={iframeKey}
            ref={frame}
            title="draw.io diagram editor"
            src={activeEditorUrl}
            className="block h-[720px] w-full max-w-full border-0 bg-white"
            referrerPolicy="no-referrer"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups"
          />
        </div>
      )}
      <details className="border-t p-4">
        <summary className="cursor-pointer text-sm">View generated XML source</summary>
        <pre className="mt-3 max-h-80 overflow-auto text-xs">
          <code>{original.current}</code>
        </pre>
      </details>
    </section>
  );
}
```

---

## TASK 3: Sửa lỗi `1 item` / `0 items` không dịch sang tiếng Việt trong `src/features/architecture/three-e-searchable-select.tsx`

> **Nguyên nhân:** Dòng `{options.length} item{options.length === 1 ? "" : "s"}` bị React tách thành 3 Text Node rời nhau (`"1"`, `" item"`, `""`), làm bộ dịch DOM không thể khớp mẫu số lượng.

- **File cần sửa:** `src/features/architecture/three-e-searchable-select.tsx`
- **Tìm đoạn code (dòng 70–74):**
```tsx
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          {options.length} item{options.length === 1 ? "" : "s"}
        </span>
```
- **Thay thế bằng:**
```tsx
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          {`${options.length} ${options.length === 1 ? "item" : "items"}`}
        </span>
```

---

## TASK 4: Bổ sung toàn bộ chuỗi tiếng Anh còn sót trên trang Sơ đồ C4 & UML vào `src/lib/i18n/locale-context.tsx`

- **File cần sửa:** `src/lib/i18n/locale-context.tsx`

### Bước 4.1: Bổ sung các câu trên trang Sơ đồ C4 & UML vào `EXACT_VI_DICTIONARY` trong `src/lib/i18n/locale-context.tsx`
Thêm các cặp từ điển sau vào trong `EXACT_VI_DICTIONARY` (và bỏ kiểu mở ngoặc tiếng Anh ở các tên Theme):

```ts
  // === CHUẨN HÓA TRANG SƠ ĐỒ KIẾN TRÚC C4 & UML ===
  "System Context": "Sơ đồ Ngữ cảnh Hệ thống (System Context)",
  "Container": "Sơ đồ Container",
  "Component": "Sơ đồ Component",
  "Sequence": "Sơ đồ Tuần tự (Sequence)",
  "Class": "Sơ đồ Lớp (Class)",
  "Package": "Sơ đồ Gói (Package)",
  "Deployment": "Sơ đồ Triển khai (Deployment)",
  "Activity": "Sơ đồ Hoạt động (Activity)",
  "State Machine": "Sơ đồ Máy trạng thái (State Machine)",
  "Light Pastel": "Sáng dịu",
  "Vibrant C4": "C4 Sắc nét",
  "Dark Mode": "Nền tối",
  "Blueprint": "Bản vẽ kỹ thuật",
  "Monochrome": "Đơn sắc",
  "No items in this scope": "Không có mục nào trong phạm vi này",
  "Filter items…": "Lọc danh sách mục…",
  "Loading local draw.io editor…": "Đang tải trình chỉnh sửa sơ đồ Draw.io…",
  "Loading local draw.io editor...": "Đang tải trình chỉnh sửa sơ đồ Draw.io…",
  "Local draw.io has not connected. Start it with docker compose -f compose.drawio.yml up -d, then retry.":
    "Chưa kết nối được container Draw.io cục bộ (cổng 8090). Bạn có thể bấm Dùng Draw.io Trực tuyến hoặc Xem nhanh SVG.",
  "Retry editor": "Tải lại trình chỉnh sửa",
  "Relayout": "Bố cục lại sơ đồ",
  "Ready to edit": "Sẵn sàng chỉnh sửa",
  "Unsaved edits · click Save to persist": "Có thay đổi chưa lưu · bấm Lưu để ghi nhận",
  "Theme applied · click Save to persist": "Đã đổi chủ đề màu · bấm Lưu để ghi nhận",
  "Relayout applied · click Save to persist": "Đã sắp xếp lại bố cục · bấm Lưu để ghi nhận",
  "View generated XML source": "Xem mã nguồn XML của sơ đồ",
  "Only explicit model actors and declared dependencies are shown; no roles are inferred from endpoint or entity names.":
    "Chỉ hiển thị các tác nhân (Actor) và phụ thuộc đã được xác nhận rõ ràng trong mô hình; không tự suy diễn vai trò từ tên Endpoint hay thực thể.",
  "Only known external dependencies are shown. Internal services and infrastructure stay inside the system.":
    "Chỉ hiển thị các phụ thuộc bên ngoài đã xác định. Các Service nội bộ và hạ tầng nằm bên trong ranh giới hệ thống.",
  "System boundary only: this analysis has no identified actors or external systems. Add confirmed context in draw.io; no actors have been invented.":
    "Chỉ hiển thị ranh giới hệ thống: bản phân tích này chưa có tác nhân hoặc hệ thống ngoài nào được xác nhận.",
```

### Bước 4.2: Bổ sung các mẫu câu động của trang Sơ đồ C4 & UML vào `PATTERN_REPLACEMENTS` trong `src/lib/i18n/locale-context.tsx`
Thêm các dòng sau vào mảng `PATTERN_REPLACEMENTS` trong `src/lib/i18n/locale-context.tsx`:

```ts
  [
    /^(\d+) items?$/i,
    "$1 mục",
  ],
  [
    /^The analysis declares (\d+) HTTP entrypoint component\(s\), but no external caller or actor is established by this model; the context shows the system alone and callers require review\.$/i,
    "Kết quả phân tích ghi nhận $1 thành phần HTTP Entrypoint, nhưng chưa xác định được tác nhân hoặc hệ thống gọi từ bên ngoài; sơ đồ ngữ cảnh hiện chỉ hiển thị hệ thống nội bộ và cần rà soát thêm các bên gọi.",
  ],
  [
    /^Showing (\d+) recognized service containers, including infrastructure and isolated services\. (\d+) lower-level element\(s\) and (\d+) relationship\(s\) are outside this view\. Startup dependencies are shown in Deployment; configuration across profiles is declared, not observed runtime traffic\.$/i,
    "Đang hiển thị $1 Service Container đã nhận diện (bao gồm cả hạ tầng và các Service độc lập). Có $2 phần tử mức thấp và $3 mối quan hệ nằm ngoài góc nhìn này. Phụ thuộc khởi động được hiển thị ở sơ đồ Triển khai; cấu hình giữa các profile là khai báo tĩnh, không phải lưu lượng thực tế lúc chạy.",
  ],
  [
    /^Showing (\d+) extracted\/designed classifiers in the selected scope\. Missing client or model types require inspecting this revision's extracted metadata; they are not invented from field names\.$/i,
    "Đang hiển thị $1 Classifier được trích xuất/thiết kế trong phạm vi đã chọn. Các kiểu dữ liệu chưa rõ cần được kiểm tra từ siêu dữ liệu của phiên bản này chứ không tự suy diễn từ tên trường.",
  ],
```

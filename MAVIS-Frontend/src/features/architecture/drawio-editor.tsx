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
  ALLOWED_DRAWIO_ORIGINS,
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
      const data = readDrawioEvent(message, frame.current?.contentWindow, ALLOWED_DRAWIO_ORIGINS);
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
            )}) !important; width: 24px !important; height: 24px !important; object-fit: contain; clip-path: ellipse(47% 47% at 50% 50%) content-box; }`,
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

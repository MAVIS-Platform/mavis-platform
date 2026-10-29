"use client";
import { useEffect, useRef, useState } from "react";
import { DRAWIO_THEME_OPTIONS, palette, RULE_VERSION, type DrawioTheme } from "@/lib/drawio/rules";
import { generateDrawio } from "@/lib/drawio/generate";
import { projectDiagram } from "@/lib/drawio/rules";
import { themeDrawioXml, extractDraftDocument } from "./drawio-document";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-api";
import {
  DRAWIO_ORIGIN,
  DRAWIO_URL,
  DRAWIO_LAYOUT,
  DRAWIO_MAX_XML_LENGTH,
  readDrawioEvent,
} from "./drawio-protocol";

// Self-hosted only. Offline mode disables cloud storage; dark=0 prevents browser dark-mode color inversion so MAVIS themes render exact hex colors.
const editorUrl = `${DRAWIO_URL}/?embed=1&proto=json&spin=1&ui=atlas&dark=0&libraries=1&noExitBtn=1&saveAndExit=0&plugins=0&offline=1`;
const VALID_THEMES = new Set<string>(DRAWIO_THEME_OPTIONS.map((t) => t.value));

function validXml(xml: string) {
  if (!xml || xml.length > DRAWIO_MAX_XML_LENGTH || /<!DOCTYPE/i.test(xml)) return false;
  const document = new DOMParser().parseFromString(xml, "text/xml");
  return (
    !document.querySelector("parsererror") &&
    ["mxfile", "mxGraphModel"].includes(document.documentElement.localName)
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

  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading local draw.io editor…");
  const [error, setError] = useState("");

  const userId = session.data?.user?.id ?? "default";
  const iframeKey = `mavis:drawio:${modelId}:${diagramId}:${scope}:${attempt}`;
  const storageKey = `mavis:drawio-draft:${userId}:${modelId}:${diagramId}${scope === "overview" || scope === "overview:all" ? "" : ":" + scope}`;

  function send(message: object) {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_ORIGIN);
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
    setReady(false);
    setDirty(false);
    setError("");
    setStatus("Loading local draw.io editor…");
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
    const timeout = window.setTimeout(
      () =>
        setError(
          "Local draw.io has not connected. Start it with docker compose -f compose.drawio.yml up -d, then retry.",
        ),
      30000,
    );

    async function receive(message: MessageEvent) {
      const data = readDrawioEvent(message, frame.current?.contentWindow);
      if (!data) return;
      window.clearTimeout(timeout);
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
      window.clearTimeout(timeout);
      if (exportFallbackTimer.current !== null) {
        window.clearTimeout(exportFallbackTimer.current);
        exportFallbackTimer.current = null;
      }
    };
  }, [iframeKey]);

  // Reload canvas when parent passes updated XML (e.g. AI enrichment completed or scope changed without remount)
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
    if (ready && validXml(nextXml)) {
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
  }, [xml, ready, title, dirty]);

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
        // Silent fallback if initial auto-save encounters transient error
      });
  }, [ready, autoSaveWhenReady, modelId, diagramId, scope, xml, dirty]);

  // Instant theme application (uses latest.current which is kept fresh by autosave: 1)
  useEffect(() => {
    if (!ready || previousTheme.current === activeTheme) return;
    previousTheme.current = activeTheme;
    try {
      const updated = themeDrawioXml(latest.current, activeTheme);
      latest.current = updated;
      draftCallback.current?.(updated);
      setDirty(true);
      setError("");
      send({
        action: "load",
        xml: updated,
        title: `${propsRef.current.title}.drawio`,
        autosave: 1,
        fit: 1,
        noExitBtn: 1,
      });
      setStatus("Theme applied · click Save to persist");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply theme.");
    }
  }, [activeTheme, ready]);

  function relayoutDiagram() {
    if (processing) return;
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
            className={`mt-0.5 text-xs ${dirty ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
          >
            {status}
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto">
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
        <div className="flex items-center gap-3 border-b p-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            Retry editor
          </Button>
        </div>
      )}
      <iframe
        key={iframeKey}
        ref={frame}
        title="draw.io diagram editor"
        src={editorUrl}
        className="block h-[720px] w-full max-w-full border-0 bg-white"
        referrerPolicy="no-referrer"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups"
      />
      <details className="border-t p-4">
        <summary className="cursor-pointer text-sm">View generated XML source</summary>
        <pre className="mt-3 max-h-80 overflow-auto text-xs">
          <code>{original.current}</code>
        </pre>
      </details>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { RULE_VERSION, type DrawioTheme } from "@/lib/drawio/rules";
import { generateDrawio } from "@/lib/drawio/generate";
import { projectDiagram } from "@/lib/drawio/rules";
import { drawioSummary, themeDrawioXml, extractDraftDocument } from "./drawio-document";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-api";
import {
  DRAWIO_ORIGIN,
  DRAWIO_LAYOUT,
  DRAWIO_MAX_XML_LENGTH,
  readDrawioEvent,
  drawioFitRequest,
} from "./drawio-protocol";
// Self-hosted only. Offline mode disables the editor's cloud storage integrations.
const editorUrl = `${DRAWIO_ORIGIN}/?embed=1&proto=json&spin=1&ui=atlas&libraries=1&noExitBtn=1&saveAndExit=0&plugins=0&offline=1`;
function validXml(xml: string) {
  if (!xml || xml.length > DRAWIO_MAX_XML_LENGTH || /<!DOCTYPE/i.test(xml)) return false;
  const document = new DOMParser().parseFromString(xml, "text/xml");
  return (
    !document.querySelector("parsererror") &&
    ["mxfile", "mxGraphModel"].includes(document.documentElement.localName)
  );
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
  onSave,
  generatedXml,
  preferProvidedXml = false,
}: {
  xml: string;
  modelId: string;
  diagramId: string;
  title: string;
  notation?: string | undefined;
  level?: string | undefined;
  scope?: string;
  theme?: DrawioTheme;
  onSave?: (xml: string) => Promise<void>;
  generatedXml?: string;
  preferProvidedXml?: boolean;
}) {
  const session = useSession();
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLElement>(null);
  const original = useRef(generatedXml ?? xml);
  original.current = generatedXml ?? xml;
  const initial = useRef(xml);
  initial.current = xml;
  const saveCallback = useRef(onSave);
  saveCallback.current = onSave;
  const cloudPending = useRef(false);
  const pending = useRef<"style" | "regenerate" | "relayout" | null>(null);
  const currentTheme = useRef(theme);
  currentTheme.current = theme;
  const previousTheme = useRef(theme);
  const [summary, setSummary] = useState<ReturnType<typeof drawioSummary> | null>(null);
  const [recovery, setRecovery] = useState(false);
  const edited = useRef(false);
  const latest = useRef(xml);
  const downloadPending = useRef(false);
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading local draw.io editor…");
  const [error, setError] = useState("");
  const userId = session.data?.user?.id;
  const storageKey = userId
    ? `mavis:drawio-draft:${userId}:${modelId}:${diagramId}${scope === "overview" || scope === "overview:all" ? "" : ":" + scope}`
    : null;
  function send(message: object) {
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_ORIGIN);
  }
  useEffect(() => {
    if (!storageKey) return;
    setReady(false);
    setError("");
    setStatus("Loading local draw.io editor…");
    latest.current = initial.current;
    let restored = false;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && !preferProvidedXml) {
        const record = JSON.parse(saved) as { xml?: unknown };
        if (typeof record.xml === "string" && validXml(record.xml)) {
          latest.current = record.xml;
          restored = true;
        }
      }
    } catch {
      setError("Browser draft storage is unavailable. Download your edits before leaving.");
    }
    setRecovery(!!localStorage.getItem(storageKey + ":recovery"));
    setSummary(drawioSummary(latest.current));
    const storedTheme = new DOMParser()
      .parseFromString(latest.current, "text/xml")
      .querySelector("[mavisTheme]")
      ?.getAttribute("mavisTheme");
    previousTheme.current = (
      ["clean", "dark", "blueprint"].includes(storedTheme ?? "") ? storedTheme : "clean"
    ) as DrawioTheme;
    const timeout = window.setTimeout(
      () =>
        setError(
          "Local draw.io has not connected. Start it with docker compose -f compose.drawio.yml up -d, then retry. You can still download the generated XML above.",
        ),
      30000,
    );
    function saveDraft(value: string) {
      if (!validXml(value)) {
        setError("The editor returned invalid diagram XML. Your existing draft was kept.");
        return false;
      }
      latest.current = value;
      setSummary(drawioSummary(value));
      try {
        localStorage.setItem(
          storageKey!,
          JSON.stringify({ xml: value, savedAt: new Date().toISOString() }),
        );
        setStatus("Draft saved in this browser");
        setError("");
        return true;
      } catch {
        setError("Draft could not be saved in this browser. Download it before leaving.");
        return false;
      }
    }
    async function receive(message: MessageEvent) {
      const data = readDrawioEvent(message, frame.current?.contentWindow);
      if (!data) return;
      if (data.error) {
        downloadPending.current = false;
        setError("Draw.io could not complete this operation. Your existing draft was kept.");
        return;
      }
      if (["load", "layout", "fit"].includes(data.event)) {
        const fit = drawioFitRequest(data);
        const scale = Number((data as unknown as { scale?: number }).scale);
        if (fit && (data.event !== "fit" || scale > fit.maxScale + 0.001)) send(fit);
      }
      if (data.event === "init") {
        if (!validXml(latest.current)) {
          setError("The generated XML cannot be opened by draw.io.");
          return;
        }
        const isSequence =
          notation === "UML_SEQUENCE" ||
          latest.current.includes("mavisInteraction=") ||
          latest.current.includes("mavisScenario=");
        send({
          action: "load",
          xml: latest.current,
          title: `${title}.drawio`,
          autosave: 1,
          fit: 1,
          layout:
            !restored &&
            !isSequence &&
            !latest.current.includes(`mavisRuleVersion="${RULE_VERSION}"`)
              ? DRAWIO_LAYOUT
              : undefined,
          noExitBtn: 1,
          saveAndExit: 0,
        });
      } else if (data.event === "load") {
        window.clearTimeout(timeout);
        setReady(true);
        setError("");
        const isSequence =
          notation === "UML_SEQUENCE" ||
          latest.current.includes("mavisInteraction=") ||
          latest.current.includes("mavisScenario=");
        setStatus(
          restored
            ? isSequence || latest.current.includes(`mavisRuleVersion="${RULE_VERSION}"`)
              ? "Browser draft restored"
              : "Draft uses earlier drawing rules. Regenerate to apply the updated labels and layout; existing edits stay in this draft until then."
            : "Ready to edit · changes are saved as a browser draft",
        );
      } else if (data.event === "layout") {
        send({ action: "export", format: "xml" });
        setStatus("Layout updated · saving browser draft…");
      } else if (data.event === "save" || data.event === "autosave") {
        if (data.event === "autosave") edited.current = true;
        if (data.xml && saveDraft(data.xml) && data.event === "save")
          send({ action: "status", message: "Draft saved in this browser", modified: false });
      } else if (data.event === "export") {
        if (data.error || !data.xml || !validXml(data.xml)) {
          downloadPending.current = false;
          setError("Could not retrieve the current diagram. Try Save in the editor.");
          return;
        }
        const command = pending.current;
        pending.current = null;
        if (command) {
          setProcessing(true);
          try {
            localStorage.setItem(storageKey! + ":recovery", data.xml);
            setRecovery(true);
            if (command === "relayout") {
              if (
                notation === "UML_SEQUENCE" ||
                data.xml.includes("mavisInteraction=") ||
                data.xml.includes("mavisScenario=")
              ) {
                setStatus("Re-aligning UML Sequence lifelines and timeline…");
                const { relayoutSequenceDrawioXml } = await import("./scenario-design");
                const content = relayoutSequenceDrawioXml(data.xml);
                if (saveDraft(content))
                  send({
                    action: "load",
                    xml: content,
                    title: `${title}.drawio`,
                    autosave: 1,
                    fit: 1,
                    noExitBtn: 1,
                  });
                setProcessing(false);
                return;
              }
              // M1 review: notation/level must come from canonical view metadata, never from the
              // reader-facing title ("C4 · Container" would flatten level to the wrong case and
              // silently drop boundary grouping on relayout).
              const diagram = projectDiagram(
                extractDraftDocument(
                  data.xml,
                  modelId,
                  diagramId,
                  notation,
                  level,
                  scope,
                ),
              );
              setStatus("Applying drawing rules locally…");
              const { layoutLocally } = await import("./drawio-local-layout");
              const content = await generateDrawio(diagram, currentTheme.current, layoutLocally);
              if (saveDraft(content))
                send({
                  action: "load",
                  xml: content,
                  title: `${title}.drawio`,
                  autosave: 1,
                  fit: 1,
                  noExitBtn: 1,
                });
              setProcessing(false);
              return;
            }
            const updated =
              command === "regenerate"
                ? original.current
                : themeDrawioXml(data.xml, currentTheme.current);
            if (saveDraft(updated)) {
              edited.current = false;
              send({
                action: "load",
                xml: updated,
                title: `${title}.drawio`,
                autosave: 1,
                fit: 1,
                noExitBtn: 1,
              });
            }
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Draft operation failed. Your recovery copy was kept.",
            );
          }
          setProcessing(false);
          return;
        }
        if (saveDraft(data.xml))
          send({ action: "status", message: "Draft saved in this browser", modified: false });
        if (cloudPending.current && saveCallback.current) {
          cloudPending.current = false;
          setProcessing(true);
          try {
            await saveCallback.current(data.xml);
            setStatus("Saved to project document history");
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Server save failed. Your browser draft is preserved.",
            );
          } finally {
            setProcessing(false);
          }
        }
        if (downloadPending.current) {
          downloadPending.current = false;
          const url = URL.createObjectURL(
            new Blob([data.xml], { type: "application/xml;charset=utf-8" }),
          );
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `mavis-${modelId}-${diagramId}-draft.drawio`;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }
    }
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      window.clearTimeout(timeout);
    };
  }, [storageKey, attempt, title, notation, level, modelId, diagramId, scope, preferProvidedXml]);
  useEffect(() => {
    if (!ready || previousTheme.current === theme) return;
    previousTheme.current = theme;
    pending.current = "style";
    send({ action: "export", format: "xml" });
  }, [theme, ready]);
  function changeDraft(command: "regenerate" | "relayout") {
    if (pending.current) return;
    if (
      !window.confirm(
        command === "regenerate"
          ? "Replace this draft with the generated drawing? A recovery copy will be kept."
          : "Rearrange this draft? A recovery copy will be kept.",
      )
    )
      return;
    pending.current = command;
    send({ action: "export", format: "xml" });
  }
  function restoreRecovery() {
    if (!storageKey) return;
    const backup = localStorage.getItem(storageKey + ":recovery");
    if (!backup || !validXml(backup)) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ xml: backup, savedAt: new Date().toISOString() }),
    );
    latest.current = backup;
    send({ action: "load", xml: backup, title: `${title}.drawio`, autosave: 1, fit: 1 });
    setSummary(drawioSummary(backup));
    setStatus("Recovery copy restored");
  }
  useEffect(() => {
    if (!ready || !frame.current) return;
    const observer = new ResizeObserver(() => send({ action: "fit", border: 24, maxScale: 1 }));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [ready]);
  function requestXml(download: boolean) {
    downloadPending.current = download;
    send({ action: "export", format: "xml" });
  }
  return (
    <section
      ref={container}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-card shadow-sm [&:fullscreen]:bg-card [&:fullscreen_iframe]:h-[calc(100vh-150px)]"
      aria-label="Draw.io diagram editor"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-sm font-semibold">{title} · draw.io editor</h2>
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {status}
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap gap-2 xl:w-auto">
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || processing}
            onClick={() => send({ action: "invokeAction", actionName: "lockUnlock" })}
          >
            Lock/unlock selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || processing}
            onClick={() => {
              changeDraft("relayout");
            }}
          >
            Relayout
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || processing}
            onClick={() => send({ action: "fit", border: 24, maxScale: 1 })}
          >
            Fit view
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || processing}
            onClick={() => changeDraft("regenerate")}
          >
            Regenerate
          </Button>
          {recovery && (
            <Button
              size="sm"
              variant="outline"
              disabled={!ready || processing}
              onClick={restoreRecovery}
            >
              Restore previous draft
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || processing}
            onClick={() => requestXml(false)}
          >
            Save draft
          </Button>
          {onSave && (
            <Button
              size="sm"
              disabled={!ready || processing}
              onClick={() => {
                cloudPending.current = true;
                requestXml(false);
              }}
            >
              Save to project
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || processing}
            onClick={() => requestXml(true)}
          >
            Download edited .drawio
          </Button>
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
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">
        Self-hosted draw.io at localhost:8090. Edits are a draft for this account, model and diagram
        in this browser; they do not update the analyzed model or cloud database.
      </p>
      {summary && (
        <p className="border-b px-4 py-2 text-xs" role="status">
          {summary.version === "legacy"
            ? "Legacy draft preserved. Regenerate to apply MAVIS drawing rules."
            : `Rules ${summary.version} · ${summary.quality ? `Crossings ${summary.quality.crossings} · node overlaps ${summary.quality.nodeOverlaps} · label collisions ${summary.quality.labelNodeOverlaps + summary.quality.labelOverlaps} · edges through nodes ${summary.quality.edgeThroughNodes}` : "Edited layout: regenerate to run geometry validation."}`}{" "}
          · Select shapes in the editor and use Lock/unlock selected to keep their positions during
          Relayout. Geometry metrics are checked against the current XML. Crossings may require a
          narrower view.
        </p>
      )}
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
      {storageKey ? (
        <iframe
          key={`${storageKey}:${attempt}`}
          ref={frame}
          title="draw.io diagram editor"
          src={editorUrl}
          className="block h-[720px] w-full max-w-full border-0 bg-white"
          referrerPolicy="no-referrer"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups"
        />
      ) : (
        <p className="p-5 text-sm">Loading your account…</p>
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

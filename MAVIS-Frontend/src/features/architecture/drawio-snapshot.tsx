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

"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DrawioSnapshot } from "./drawio-snapshot";
import { DiagramPreview } from "./diagram-preview";
export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SelectablePreview({
  xml,
  title,
  selectedId,
  onSelect,
}: {
  xml: string;
  title: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [svg, setSvg] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <DrawioSnapshot xml={xml} onRender={setSvg} onError={setError} />
      {error ? (
        <p role="alert">{error}</p>
      ) : svg ? (
        <>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(svg, "mavis-diagram.svg", "image/svg+xml")}
            >
              Download SVG
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const popup = window.open("", "_blank");
                if (!popup) {
                  setError("Allow the print window to save a PDF.");
                  return;
                }
                const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
                popup.document.write(
                  '<!doctype html><html><head><title>MAVIS diagram</title><style>@page{size:A3 landscape;margin:12mm}body{margin:0}img{width:100%;height:270mm;object-fit:contain}</style></head><body><img alt="Architecture diagram"></body></html>',
                );
                popup.document.close();
                const image = popup.document.querySelector("img")!;
                image.onload = () => popup.print();
                image.src = url;
                popup.addEventListener("afterprint", () => URL.revokeObjectURL(url), {
                  once: true,
                });
              }}
            >
              Print / Save PDF
            </Button>
          </div>
          <DiagramPreview
            title={title}
            content=""
            format="DRAWIO_XML"
            style="clean"
            svg={svg}
            semanticXml={xml}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </>
      ) : (
        <p role="status">Rendering diagram…</p>
      )}
    </>
  );
}

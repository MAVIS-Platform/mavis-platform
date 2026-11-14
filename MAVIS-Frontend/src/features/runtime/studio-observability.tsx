"use client";

import { useMemo, useRef, useState } from "react";
import { useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { computeArchitectureImpact } from "@/lib/architecture/reverse-bfs";
import type { Response } from "@/lib/api/contracts";

type Studio = Response<"studioState">;

export function StudioObservability({
  data,
  selected,
  onSelect,
}: {
  data: Studio;
  selected: string;
  onSelect: (service: string) => void;
}) {
  const { t } = useLocale();
  const [view, setView] = useState<"2D" | "3D">("2D");
  const [camera, setCamera] = useState({ yaw: 0.4, pitch: 0.35 });
  const [traceId, setTraceId] = useState("");
  const drag = useRef<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const reference = useApiQuery(
    "model",
    { modelId: data.modelVersionId ?? "", projectId: data.projectId ?? "" },
    { enabled: Boolean(data.modelVersionId && data.projectId) },
  );
  const telemetry = data.telemetry;
  const modelId = data.serviceMappings?.[selected];
  const workerImpact = useApiQuery(
    "impact",
    { modelId: data.modelVersionId ?? "", targetId: modelId ?? "" },
    { enabled: Boolean(data.modelVersionId && modelId) },
  );
  const impact = useMemo(
    () =>
      reference.data && modelId ? computeArchitectureImpact(reference.data, modelId, "all",workerImpact.data?.paths??[]) : null,
    [reference.data, modelId,workerImpact.data],
  );
  const affected = new Set(impact?.upstreamImpacted.map((item) => item.elementId) ?? []);
  const positions = new Map(
    data.services.map((name, index) => {
      const angle = (index / Math.max(1, data.services.length)) * Math.PI * 2;
      let x = Math.cos(angle) * 225,
        y = Math.sin(angle) * 150,
        z = ((index % 3) - 1) * 100;
      if (view === "3D") {
        const rotatedX = x * Math.cos(camera.yaw) - z * Math.sin(camera.yaw);
        z = x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw);
        x = rotatedX;
        const rotatedY = y * Math.cos(camera.pitch) - z * Math.sin(camera.pitch);
        z = y * Math.sin(camera.pitch) + z * Math.cos(camera.pitch);
        y = rotatedY;
        const scale = 650 / (650 + z);
        x *= scale;
        y *= scale;
      }
      return [name, { x: x + 350, y: y + 230, z }];
    }),
  );
  const staticEdges =
    reference.data?.edges.flatMap((edge) => {
      const from = Object.entries(data.serviceMappings ?? {}).find(
        ([, id]) => id === edge.from,
      )?.[0];
      const to = Object.entries(data.serviceMappings ?? {}).find(([, id]) => id === edge.to)?.[0];
      return from && to ? [{ from, to, id: edge.id }] : [];
    }) ?? [];
  function downloadGraph(png = false) {
    if (!svg.current) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    const styles = getComputedStyle(svg.current);
    clone.setAttribute(
      "style",
      `color:${styles.color};background:${styles.backgroundColor};font-family:Arial,sans-serif`,
    );
    clone.setAttribute("width", "1400");
    clone.setAttribute("height", "920");
    clone.querySelectorAll("[fill],[stroke]").forEach((element) => {
      for (const attribute of ["fill", "stroke"]) {
        const value = element.getAttribute(attribute);
        const variable = value?.match(/^var\((--[\w-]+)\)$/);
        if (variable) element.setAttribute(attribute, styles.getPropertyValue(variable[1]!).trim());
      }
    });
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    if (png) {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1400;
        canvas.height = 920;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = styles.backgroundColor;
          context.fillRect(0, 0, 1400, 920);
          context.drawImage(image, 0, 0);
          anchor.href = canvas.toDataURL("image/png");
          anchor.download = `studio-${data.sessionId}-${view}.png`;
          anchor.click();
        }
        URL.revokeObjectURL(url);
      };
      image.onerror = () => URL.revokeObjectURL(url);
      image.src = url;
    } else {
      anchor.href = url;
      anchor.download = `studio-${data.sessionId}-${view}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-medium">{t("Runtime topology and impact")}</h3>
        {(["2D", "3D"] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={view === mode ? "default" : "outline"}
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
          >
            {mode}
          </Button>
        ))}
        {view === "3D" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw - 0.2 }))}
            >
              {t("Rotate left")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCamera((value) => ({ ...value, yaw: value.yaw + 0.2 }))}
            >
              {t("Rotate right")}
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => downloadGraph()}>
          {t("Export graph")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => downloadGraph(true)}>
          {t("Export snapshot image")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("Dashed edges show static dependencies. Solid edges show captured trace interactions.")}
      </p>
      <svg
        ref={svg}
        data-studio-graph="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 700 460"
        className="w-full rounded-lg border bg-background"
        role="group"
        aria-label={t("Runtime topology and impact")}
        style={{ maxHeight: 500, touchAction: view === "3D" ? "none" : "auto" }}
        onPointerDown={(event) => {
          if (view === "3D" && event.target === event.currentTarget) {
            drag.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x,
            dy = event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY };
          setCamera((value) => ({
            yaw: value.yaw + dx * 0.008,
            pitch: Math.max(-1, Math.min(1, value.pitch + dy * 0.008)),
          }));
        }}
      >
        {staticEdges.map((edge) => {
          const from = positions.get(edge.from),
            to = positions.get(edge.to);
          return from && to ? (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="currentColor"
              strokeDasharray="5 5"
              opacity=".25"
            />
          ) : null;
        })}
        {telemetry?.interactions
          .filter((edge) => !traceId || edge.traceId === traceId)
          .map((edge, index) => {
            const from = positions.get(edge.fromService),
              to = positions.get(edge.toService);
            return from && to ? (
              <g
                key={edge.traceId + index}
                onClick={() => setTraceId(edge.traceId)}
                className="cursor-pointer"
              >
                <title>{edge.fromService + " → " + edge.toService + " · " + edge.traceId}</title>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="var(--primary)"
                  strokeWidth="2"
                />
                <circle
                  cx={(from.x + to.x) / 2}
                  cy={(from.y + to.y) / 2}
                  r="4"
                  fill="var(--primary)"
                />
              </g>
            ) : null;
          })}
        {[...positions.entries()]
          .sort((a, b) => b[1].z - a[1].z)
          .map(([name, point]) => {
            const live = telemetry?.services.find((item) => item.service === name);
            const isAffected = affected.has(data.serviceMappings?.[name] ?? "");
            return (
              <g
                key={name}
                role="button"
                tabIndex={0}
                aria-label={name}
                aria-pressed={selected === name}
                onClick={() => onSelect(name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(name);
                  }
                }}
                className="cursor-pointer"
              >
                <rect
                  x={point.x - 70}
                  y={point.y - 27}
                  width="140"
                  height="54"
                  rx="8"
                  fill="var(--background)"
                  stroke={
                    selected === name
                      ? "var(--primary)"
                      : isAffected
                        ? "var(--destructive)"
                        : "currentColor"
                  }
                  strokeWidth={selected === name ? 3 : 1}
                />
                <text
                  x={point.x}
                  y={point.y - 3}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="12"
                >
                  {name}
                </text>
                <text
                  x={point.x}
                  y={point.y + 15}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="11"
                >
                  {live
                    ? `${live.runningReplicas}/${live.replicas} ${t("running")}`
                    : t("Waiting for telemetry")}
                </text>
                {Array.from({ length: Math.min(live?.runningReplicas ?? 0, 8) }, (_, i) => (
                  <circle
                    key={i}
                    cx={point.x - 28 + i * 8}
                    cy={point.y + 34 + (view === "3D" ? (i % 2) * 3 : 0)}
                    r="3"
                    fill="var(--primary)"
                  />
                ))}
              </g>
            );
          })}
      </svg>
      {!telemetry && <p role="status">{t("Waiting for observed telemetry from Runner.")}</p>}
      {telemetry && (
        <p className="text-sm text-muted-foreground">
          {t("Observed at")} {new Date(telemetry.observedAt).toLocaleTimeString()}
        </p>
      )}
      {impact && (
        <section className="space-y-1 text-sm">
          <h4 className="font-medium">
            {t("Static upstream impact")} · {selected}
          </h4>
          <p>
            {t("Direct callers")}: {impact.directImpactCount} · {t("Indirect callers")}:{" "}
            {impact.indirectImpactCount}
          </p>
          {impact.upstreamImpacted.map((item) => (
            <p key={item.elementId}>{item.hops.join(" → ")}</p>
          ))}
        </section>
      )}
      {workerImpact.data && (
        <section className="space-y-1 text-sm">
          <h4 className="font-medium">{t("Worker verified impact paths")}</h4>
          {workerImpact.data.paths.map((path, index) => (
            <p key={index}>
              {path
                .map(
                  (id) => reference.data?.elements.find((element) => element.id === id)?.name ?? id,
                )
                .join(" → ")}
            </p>
          ))}
          {workerImpact.data.limitations && (
            <p className="text-muted-foreground">{workerImpact.data.limitations}</p>
          )}
        </section>
      )}
      {workerImpact.isError && (
        <p role="status" className="text-sm">
          {t("Worker impact is unavailable. Static reference paths are shown above.")}
        </p>
      )}
      {reference.data?.elements
        .find((element) => element.id === modelId)
        ?.evidence.map((evidence) => (
          <details key={evidence.id} className="text-sm">
            <summary>{evidence.location}</summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
              {evidence.snippet}
            </pre>
          </details>
        ))}
      {telemetry && (
        <div className="space-y-3">
          <h4 className="font-medium">{t("Service metrics and logs")}</h4>
          <details>
            <summary>{t("Observed resilience events")}</summary>
            {telemetry.services.flatMap((service) =>
              service.logs
                .split("\n")
                .filter((line) => /circuit.?breaker|fallback|bulkhead|retry/i.test(line))
                .map((line, index) => (
                  <pre
                    key={service.service + index}
                    className="whitespace-pre-wrap break-all text-sm"
                  >
                    {service.service}: {line}
                  </pre>
                )),
            )}
            {!telemetry.services.some((service) =>
              /circuit.?breaker|fallback|bulkhead|retry/i.test(service.logs),
            ) && <p className="text-sm">{t("No explicit resilience event captured.")}</p>}
          </details>
          {telemetry.services
            .filter((service) => !selected || service.service === selected)
            .map((service) => (
              <section key={service.service} className="space-y-2 text-sm">
                <p className="font-medium">
                  {service.service} · {service.runningReplicas}/{service.replicas}
                </p>
                {service.stats.map((stat, index) => (
                  <p key={stat.containerId ?? index}>
                    CPU {stat.cpu ?? "—"} · RAM {stat.memory ?? "—"} · {t("Network")}{" "}
                    {stat.network ?? "—"}
                  </p>
                ))}
                <details>
                  <summary>{t("Container logs")}</summary>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                    {service.logs || t("No logs captured")}
                  </pre>
                </details>
              </section>
            ))}
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="mr-auto font-medium">{t("Trace spans")}</h4>
            {traceId && (
              <Button variant="outline" size="sm" onClick={() => setTraceId("")}>
                {t("Show all traces")}
              </Button>
            )}
          </div>
          {telemetry.spans
            .filter(
              (span) =>
                (!selected || span.runtimeService === selected) &&
                (!traceId || span.traceId === traceId),
            )
            .slice(-50)
            .map((span) => (
              <button
                type="button"
                key={span.traceId + span.spanId}
                className="block w-full break-all rounded border p-2 text-left text-sm"
                onClick={() => setTraceId(span.traceId)}
              >
                {span.runtimeService} · HTTP {span.httpStatusCode ?? "—"} ·{" "}
                {span.spanStatus ?? "UNSET"} · {span.traceId}
              </button>
            ))}
          {telemetry.spans.length === 0 && <p role="status">{t("No captured spans yet.")}</p>}
        </div>
      )}
    </div>
  );
}

export async function captureStudioImage(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const styles = getComputedStyle(svg);
  clone.setAttribute(
    "style",
    `color:${styles.color};background:${styles.backgroundColor};font-family:Arial,sans-serif`,
  );
  clone.setAttribute("width", "1400");
  clone.setAttribute("height", "920");
  clone.querySelectorAll("[fill],[stroke]").forEach((element) => {
    for (const attribute of ["fill", "stroke"]) {
      const variable = element.getAttribute(attribute)?.match(/^var\((--[\w-]+)\)$/);
      if (variable) element.setAttribute(attribute, styles.getPropertyValue(variable[1]!).trim());
    }
  });
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render Studio snapshot"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 920;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render Studio snapshot");
    context.fillStyle = styles.backgroundColor;
    context.fillRect(0, 0, 1400, 920);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import type {
  ConceptNode,
  ConceptNodeStatus,
  ConceptScenario,
} from "@/features/courses/designed-to-scale-scenarios";

function paletteForStatus(status: ConceptNodeStatus) {
  switch (status) {
    case "healthy":
      return {
        stroke: "#10B981",
        fill: "rgba(16, 185, 129, 0.14)",
        dot: "#34D399",
        text: "#ECFDF5",
      };
    case "active":
      return {
        stroke: "#06B6D4",
        fill: "rgba(6, 182, 212, 0.16)",
        dot: "#22D3EE",
        text: "#ECFEFF",
      };
    case "warning":
      return {
        stroke: "#F59E0B",
        fill: "rgba(245, 158, 11, 0.16)",
        dot: "#FBBF24",
        text: "#FFFBEB",
      };
    case "error":
      return {
        stroke: "#F43F5E",
        fill: "rgba(244, 63, 94, 0.18)",
        dot: "#FB7185",
        text: "#FFF1F2",
      };
    default:
      return {
        stroke: "#334155",
        fill: "rgba(30, 41, 59, 0.72)",
        dot: "#64748B",
        text: "#CBD5E1",
      };
  }
}

function packetStroke(tone?: ConceptNodeStatus | undefined) {
  if (tone === "error") return "#FB7185";
  if (tone === "warning") return "#FBBF24";
  if (tone === "healthy") return "#34D399";
  return "#22D3EE";
}

export function InteractiveConceptStage({
  scenario,
}: {
  scenario: ConceptScenario;
}) {
  const { locale, t } = useLocale();
  const [stepIndex, setStepIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [inspectedNodeId, setInspectedNodeId] = useState<string>(
    () => scenario.nodes[0]?.id ?? "",
  );

  // Reset active step & inspected node smoothly when user opens another lesson scenario.
  useEffect(() => {
    setStepIndex(0);
    setAutoPlay(false);
    setInspectedNodeId(scenario.nodes[0]?.id ?? "");
  }, [scenario.code]);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = window.setInterval(() => {
      setStepIndex((cur) => (cur + 1) % scenario.steps.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [autoPlay, scenario.steps.length]);

  const activeStep = scenario.steps[stepIndex] ?? scenario.steps[0]!;
  const nodeMap = new Map<string, ConceptNode>(scenario.nodes.map((node) => [node.id, node]));
  const inspectedNode =
    nodeMap.get(inspectedNodeId) ?? scenario.nodes[0] ?? null;

  return (
    <section
      aria-label={t(
        "Interactive Step-by-Step Architecture Simulation",
        "Mô phỏng Kiến trúc Tương tác Từng bước",
      )}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
    >
      {/* Top Header & Live Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-teal-600 text-[10px] font-bold tracking-wide text-white hover:bg-teal-600">
              ⚡ {t("INTERACTIVE VISUAL PRIMER · STEP-BY-STEP", "MÔ PHỎNG KIẾN TRÚC TƯƠNG TÁC TỪNG BƯỚC")}
            </Badge>
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {scenario.code}
            </span>
          </div>
          <h4 className="text-sm font-bold text-foreground sm:text-base">
            {locale === "vi" ? scenario.titleVi : scenario.title}
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <Badge variant="outline" className="bg-white dark:bg-slate-950">
            ⏱ {activeStep.latency}
          </Badge>
          <Badge
            variant="outline"
            className="border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-200"
          >
            ● {activeStep.httpStatus}
          </Badge>
          <Badge variant="secondary">{activeStep.c4Level}</Badge>
        </div>
      </div>

      {/* Dark Blueprint Interactive SVG Canvas */}
      <div className="bg-[#0B0F17] px-3 py-4 sm:px-5">
        <div className="overflow-x-auto">
          <svg
            viewBox="0 0 800 285"
            className="h-[260px] w-full min-w-[620px] select-none sm:h-[300px]"
            role="img"
            aria-label={locale === "vi" ? scenario.titleVi : scenario.title}
          >
            <defs>
              <pattern
                id={`grid-${scenario.code}`}
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.08)"
                  strokeWidth="1"
                />
              </pattern>
              <marker
                id={`arrow-idle-${scenario.code}`}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L7,3 z" fill="#475569" />
              </marker>
              <marker
                id={`arrow-active-${scenario.code}`}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L7,3 z" fill="#22D3EE" />
              </marker>
            </defs>

            <rect width="800" height="285" rx="12" fill={`url(#grid-${scenario.code})`} />

            {/* Edges + Animated Packet Pills */}
            {scenario.edges.map((edge) => {
              const source = nodeMap.get(edge.from);
              const target = nodeMap.get(edge.to);
              if (!source || !target) return null;

              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const len = Math.hypot(dx, dy) || 1;
              const offset = 62;
              const x1 = source.x + (dx / len) * Math.min(offset, len / 3);
              const y1 = source.y + (dy / len) * Math.min(28, len / 3);
              const x2 = target.x - (dx / len) * Math.min(offset, len / 3);
              const y2 = target.y - (dy / len) * Math.min(28, len / 3);

              const activeEdge = activeStep.activeEdges.find((a) => a.edgeId === edge.id);
              const stroke = activeEdge ? packetStroke(activeEdge.tone) : "#334155";
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2 - 12;
              const edgePath = `M ${x1} ${y1} L ${x2} ${y2}`;

              return (
                <g key={edge.id}>
                  <path
                    d={edgePath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={activeEdge ? 2.5 : 1.5}
                    strokeDasharray={activeEdge ? "6 4" : undefined}
                    markerEnd={`url(#${activeEdge ? `arrow-active-${scenario.code}` : `arrow-idle-${scenario.code}`})`}
                  />
                  {activeEdge ? (
                    <>
                      <circle r="5" fill={stroke}>
                        <animateMotion
                          dur="1.6s"
                          repeatCount="indefinite"
                          path={edgePath}
                        />
                      </circle>
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x="-56"
                          y="-11"
                          width="112"
                          height="20"
                          rx="10"
                          fill="#0F172A"
                          stroke={stroke}
                          strokeWidth="1.2"
                        />
                        <text
                          textAnchor="middle"
                          y="3"
                          fill="#F8FAFC"
                          fontSize="9.5"
                          fontWeight="600"
                          fontFamily="ui-monospace, SFMono-Regular, monospace"
                        >
                          {activeEdge.packetLabel}
                        </text>
                      </g>
                    </>
                  ) : (
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fill="#64748B"
                      fontSize="9.5"
                      fontFamily="ui-monospace, SFMono-Regular, monospace"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Architectural Nodes */}
            {scenario.nodes.map((node) => {
              const status = activeStep.nodeStates[node.id] ?? "idle";
              const palette = paletteForStatus(status);
              const selected = inspectedNode?.id === node.id;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer"
                  onClick={() => setInspectedNodeId(node.id)}
                >
                  {selected && (
                    <rect
                      x="-74"
                      y="-36"
                      width="148"
                      height="72"
                      rx="14"
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                  )}
                  <rect
                    x="-68"
                    y="-30"
                    width="136"
                    height="60"
                    rx="11"
                    fill={palette.fill}
                    stroke={palette.stroke}
                    strokeWidth={status === "idle" ? 1.4 : 2.2}
                  />
                  <circle cx="-53" cy="-14" r="4.5" fill={palette.dot} />
                  <text
                    x="-42"
                    y="-10"
                    fill={palette.text}
                    fontSize="11.5"
                    fontWeight="700"
                  >
                    {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
                  </text>
                  <text
                    x="-53"
                    y="10"
                    fill="#94A3B8"
                    fontSize="9.5"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {node.subLabel.length > 22 ? `${node.subLabel.slice(0, 21)}…` : node.subLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Click-to-Inspect Artifact Bar */}
        {inspectedNode && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-xs text-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-cyan-300">{inspectedNode.label}:</span>
              <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                {inspectedNode.filePath}
              </code>
              <span className="text-slate-400">· {inspectedNode.contract}</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              {inspectedNode.dependencies}
            </span>
          </div>
        )}
      </div>

      {/* Stepper Bar & 2-Sentence Explanation Callout */}
      <div className="space-y-3 border-t border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Simulation steps">
            {scenario.steps.map((s, idx) => (
              <button
                key={s.step}
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setStepIndex(idx);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  idx === stepIndex
                    ? "bg-teal-600 text-white shadow-2xs"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {t(`Step ${s.step}`, `Bước ${s.step}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAutoPlay(false);
                setStepIndex(0);
              }}
              aria-label={t("Reset to Step 1", "Về Bước 1")}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={stepIndex === 0}
              onClick={() => {
                setAutoPlay(false);
                setStepIndex((cur) => Math.max(0, cur - 1));
              }}
            >
              <SkipBack className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t("Prev", "Trước")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={autoPlay ? "secondary" : "default"}
              className={autoPlay ? "" : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800"}
              onClick={() => setAutoPlay((cur) => !cur)}
            >
              {autoPlay ? (
                <>
                  <Pause className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t("Pause", "Tạm dừng")}
                </>
              ) : (
                <>
                  <Play className="mr-1 h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  {t("Auto-Play", "Tự động chạy")}
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={stepIndex >= scenario.steps.length - 1}
              onClick={() => {
                setAutoPlay(false);
                setStepIndex((cur) => Math.min(scenario.steps.length - 1, cur + 1));
              }}
            >
              {t("Next", "Tiếp")}
              <SkipForward className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-teal-200/80 bg-teal-50/60 px-3.5 py-2.5 dark:border-teal-900 dark:bg-teal-950/20">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-bold text-teal-950 dark:text-teal-200">
              {t(`Step ${activeStep.step}: ${activeStep.title}`, `Bước ${activeStep.step}: ${activeStep.titleVi}`)}
            </p>
            <p className="text-xs leading-5 text-slate-700 dark:text-slate-300">
              {locale === "vi" ? activeStep.explanationVi : activeStep.explanation}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 border-teal-300 bg-white font-mono text-[10px] text-teal-800 dark:border-teal-700 dark:bg-slate-950 dark:text-teal-300">
            {activeStep.businessRule}
          </Badge>
        </div>
      </div>
    </section>
  );
}

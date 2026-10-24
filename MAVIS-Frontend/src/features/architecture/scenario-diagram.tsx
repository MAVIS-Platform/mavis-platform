"use client";
import { useState } from "react";
import { DesignedScenario } from "./designed-scenario";
import { useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { SelectField } from "@/components/shared/forms";
import { RequestState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";
function ObservedScenarioDiagram({
  model,
  onSelect,
}: {
  model: ArchitecturalModel;
  onSelect: (id: string) => void;
}) {
  const sessions = useApiQuery("runtimeReadSessions", { projectId: model.projectId });
  const [session, setSession] = useState(""),
    [trace, setTrace] = useState(""),
    [page, setPage] = useState(0);
  const available = (sessions.data ?? []).filter(
    (s) => s.modelId === model.id && s.snapshotId === model.snapshotId,
  );
  const selected = available.find((s) => s.id === session) ?? available[0];
  const sequence = useApiQuery(
    "runtimeSequence",
    { sessionId: selected?.id ?? "" },
    { enabled: !!selected },
  );
  const valid = sequence.data?.modelId === model.id;
  const traces = Array.from(
    new Set((valid ? (sequence.data?.steps ?? []) : []).map((s) => s.traceId ?? "unidentified")),
  );
  const chosen = traces.includes(trace) ? trace : traces[0];
  const steps = (valid ? (sequence.data?.steps ?? []) : [])
    .filter((s) => (s.traceId ?? "unidentified") === chosen)
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
  const visible = steps.slice(page * 30, (page + 1) * 30);
  const names = Array.from(
    new Set(
      visible
        .flatMap((s) => [s.callerService, s.calleeService])
        .filter((name): name is string => !!name),
    ),
  );
  const canonical = (name: string) => {
    const matches = model.elements.filter((n) => n.name === name);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const width = Math.max(720, names.length * 220),
    height = 140 + visible.length * 64;
  return (
    <div className="space-y-4">
      <RequestState query={sessions}>
        {!available.length ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No observed scenario is linked to this model revision. Run a scenario from Runtime, then
            return here; static dependencies do not establish execution order.
          </p>
        ) : (
          <>
            <SelectField
              label="Scenario"
              value={selected?.id ?? ""}
              onChange={(v) => {
                setSession(v);
                setTrace("");
                setPage(0);
              }}
              options={available.map((s) => ({
                value: s.id,
                label: `${s.scenarioName ?? "Runtime scenario"} · ${s.id.slice(0, 8)}`,
              }))}
            />
            <RequestState query={sequence}>
              {sequence.data && !valid ? (
                <p role="alert">The trace belongs to another model revision.</p>
              ) : !steps.length ? (
                <p className="text-sm text-muted-foreground">
                  No sequence evidence is available for this scenario.
                </p>
              ) : (
                <>
                  {traces.length > 1 && (
                    <SelectField
                      label="Observed trace"
                      value={chosen ?? ""}
                      onChange={(v) => {
                        setTrace(v);
                        setPage(0);
                      }}
                      options={traces.map((id) => ({ value: id, label: id }))}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Observed interactions · steps {page * 30 + 1}–{page * 30 + visible.length} of{" "}
                    {steps.length}. Order reflects the recorded sequence, not proof of thread
                    synchronization.
                  </p>
                  <div className="max-h-[680px] overflow-auto rounded-xl border bg-card">
                    <svg width={width} height={height} aria-label="Observed scenario diagram">
                      {names.map((name, i) => {
                        const node = canonical(name),
                          x = 110 + i * 220;
                        return (
                          <g key={name}>
                            <line
                              x1={x}
                              y1={70}
                              x2={x}
                              y2={height - 20}
                              stroke="var(--border)"
                              strokeDasharray="4 4"
                            />
                            <g
                              role={node ? "button" : undefined}
                              tabIndex={node ? 0 : undefined}
                              aria-label={node ? `Select ${name}` : undefined}
                              onClick={() => node && onSelect(node.id)}
                              onKeyDown={(e) => {
                                if (node && e.key === "Enter") onSelect(node.id);
                              }}
                              className={node ? "cursor-pointer" : ""}
                            >
                              <rect
                                x={x - 90}
                                y={14}
                                width={180}
                                height={48}
                                rx={6}
                                fill="var(--card)"
                                stroke="var(--border)"
                              />
                              <text
                                x={x}
                                y={43}
                                textAnchor="middle"
                                fontSize={12}
                                fill="var(--foreground)"
                              >
                                {name}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                      {visible.map((step, i) => {
                        const from = 110 + names.indexOf(step.callerService ?? "") * 220,
                          to = 110 + names.indexOf(step.calleeService ?? "") * 220,
                          y = 110 + i * 64;
                        const direction = to >= from ? 1 : -1;
                        return (
                          <g key={`${step.stepOrder}:${i}`}>
                            <title>
                              {step.operation ?? "Observed call"} · {step.durationMs ?? "?"}ms
                            </title>
                            {from === to ? (
                              <path
                                d={`M ${from} ${y} h 45 v 24 h -45`}
                                fill="none"
                                stroke="var(--primary)"
                              />
                            ) : (
                              <>
                                <line x1={from} x2={to} y1={y} y2={y} stroke="var(--primary)" />
                                <path
                                  d={`M ${to - direction * 8} ${y - 4} L ${to} ${y} L ${to - direction * 8} ${y + 4}`}
                                  fill="none"
                                  stroke="var(--primary)"
                                />
                              </>
                            )}
                            <text
                              x={(from + to) / 2}
                              y={y - 9}
                              fontSize={11}
                              textAnchor="middle"
                              fill="var(--foreground)"
                            >
                              {String(step.stepOrder ?? page * 30 + i + 1)}. {step.httpMethod ?? ""}{" "}
                              {(step.operation ?? "Observed interaction").slice(0, 50)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  {steps.length > 30 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={!page}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous steps
                      </Button>
                      <Button
                        variant="outline"
                        disabled={(page + 1) * 30 >= steps.length}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next steps
                      </Button>
                    </div>
                  )}
                </>
              )}
            </RequestState>
          </>
        )}
      </RequestState>
    </div>
  );
}

export function ScenarioDiagram(props: {
  model: ArchitecturalModel;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<"designed" | "observed">("designed");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Scenario source" className="flex gap-2">
        <Button
          role="tab"
          aria-selected={mode === "designed"}
          variant={mode === "designed" ? "default" : "outline"}
          onClick={() => setMode("designed")}
        >
          Designed scenario
        </Button>
        <Button
          role="tab"
          aria-selected={mode === "observed"}
          variant={mode === "observed" ? "default" : "outline"}
          onClick={() => setMode("observed")}
        >
          Observed runtime
        </Button>
      </div>
      <div hidden={mode !== "designed"}>
        <DesignedScenario {...props} />
      </div>
      {mode === "observed" && <ObservedScenarioDiagram {...props} />}
    </div>
  );
}

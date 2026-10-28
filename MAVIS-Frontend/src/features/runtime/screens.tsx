"use client";
export function RuntimeStepperBanner({ currentStep, projectId }: { currentStep: 1 | 2 | 3; projectId?: string }) {
  const steps = [
    { num: 1, title: "Bước 1: Cấu hình Sandbox", path: "/runtime-config", desc: "Giới hạn tài nguyên, phát hiện service" },
    { num: 2, title: "Bước 2: Kịch bản Kiểm thử", path: "/scenarios", desc: "Thiết lập các bước gọi API" },
    { num: 3, title: "Bước 3: Chạy & Trace", path: "/sessions", desc: "Theo dõi thực thi & Sequence Diagram" },
  ];
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm mb-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((s) => {
          const isActive = s.num === currentStep;
          const isDone = s.num < currentStep;
          return (
            <Link
              key={s.num}
              href={`${s.path}${projectId ? `?project=${projectId}` : ""}`}
              className={`rounded-lg border p-3 transition flex items-start gap-3 ${
                isActive
                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                  : isDone
                  ? "border-emerald-500/40 bg-emerald-500/5 text-foreground hover:bg-muted/50"
                  : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? "✓" : s.num}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold leading-tight">{s.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}


import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApi, useApiMutation, useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { RequestState, ErrorState, EmptyState } from "@/components/shared/request-state";
import { ConfirmDialog, FormField, SelectField } from "@/components/shared/forms";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RuntimeSessionTimeline, RuntimeStatusBadge, TraceViewer } from "./components";
import { BackendRuntime } from "./backend";
import type { Response } from "@/lib/api/contracts";

// ==========================================
// 1. RUNTIME CONFIGURATION (F13)
// ==========================================
export function RuntimeConfiguration() {
  const { projectId } = useSelection();
  if (!projectId) {
    return (
      <EmptyState
        title="Select a project"
        description="Choose a project from the top bar to inspect eligibility and configure runtime sandbox settings."
      />
    );
  }
  return <RuntimeConfigurationView key={projectId} projectId={projectId} />;
}

function RuntimeConfigurationView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const snapshots = useApiQuery("snapshots", { projectId });
  const config = useApiQuery("runtimeConfiguration", { projectId });
  const preflight = useApiMutation("runtimePreflight");
  const save = useApiMutation("saveRuntimeConfiguration");

  const [snapshotId, setSnapshotId] = useState("");
  const [profileId, setProfileId] = useState("SPRING_BOOT_DOTNET_COMPOSE_V1");
  const [serviceMappings, setServiceMappings] = useState<Record<string, string>>({});
  const [secretRefs, setSecretRefs] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (config.data?.profileId) {
      setProfileId(config.data.profileId);
    }
  }, [config.data?.profileId]);

  useEffect(() => {
    if (preflight.data?.detectedServices?.length) {
      setServiceMappings((prev) => {
        const next = { ...prev };
        for (const s of preflight.data?.detectedServices ?? []) {
          if (!next[s]) next[s] = s;
        }
        return next;
      });
    }
  }, [preflight.data?.detectedServices]);

  return (
    <div className="space-y-6">
      <RuntimeStepperBanner currentStep={1} projectId={projectId} />
      {/* Step 1: Preflight Eligibility */}
      <DetailPanel title="1. Source Snapshot & Compose Preflight Check">
        <p className="text-sm text-muted-foreground">
          Validate whether the source snapshot contains a compatible Docker Compose file, detects
          service ports, and inspects security configurations.
        </p>

        <RequestState query={snapshots} empty={!snapshots.data?.length}>
          <div className="mt-4 space-y-4">
            <SelectField
              disabled={preflight.isPending}
              label="Source snapshot"
              value={snapshotId}
              onChange={(value) => {
                setSnapshotId(value);
                preflight.reset();
              }}
              options={(snapshots.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.name} · ${s.id.slice(0, 8)}`,
              }))}
            />

            <Button
              disabled={!snapshotId || preflight.isPending}
              onClick={() => preflight.mutate({ projectId, snapshotId })}
            >
              {preflight.isPending ? "Validating Compose..." : "Check runtime eligibility (Compose Preflight)"}
            </Button>

            {preflight.isError && <ErrorState error={preflight.error} />}

            {preflight.data && (
              <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">Preflight Result:</span>
                  <StatusBadge
                    status={preflight.data.compatible ? "Compatible" : "Rejected"}
                    variant={preflight.data.compatible ? "success" : "destructive"}
                  />
                </div>
                {preflight.data.recommendedProfile && (
                  <p className="text-sm">
                    <strong>Recommended Profile:</strong> {preflight.data.recommendedProfile}
                  </p>
                )}
                <div>
                  <strong className="text-sm">Detected Services in Compose:</strong>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {preflight.data.detectedServices?.length ? (
                      preflight.data.detectedServices.map((svc) => (
                        <span
                          key={svc}
                          className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20"
                        >
                          {svc}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No services detected</span>
                    )}
                  </div>
                </div>

                {preflight.data.securityWarnings?.length ? (
                  <div className="space-y-1">
                    <strong className="text-sm text-warning">Security Warnings / Prerequisites:</strong>
                    <ul className="list-disc pl-5 text-xs text-warning space-y-0.5">
                      {preflight.data.securityWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </RequestState>
      </DetailPanel>

      {/* Step 2: Service-to-Model Mapping & Protected Secrets */}
      <DetailPanel title="2. Service-to-Model Mapping & Protected Secret References">
        <p className="text-sm text-muted-foreground">
          Map each runtime service container to the corresponding Model Element. Specify environment
          variable names for protected credentials; never paste plaintext secrets here.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Service Mapping</h4>
            {preflight.data?.detectedServices?.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {preflight.data.detectedServices.map((svc) => (
                  <div key={svc} className="flex items-center gap-2">
                    <span className="w-28 font-mono text-xs truncate" title={svc}>
                      {svc}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <Input
                      className="flex-1 font-mono text-xs"
                      placeholder="Model Element Name / ID"
                      value={serviceMappings[svc] ?? svc}
                      onChange={(e) => {
                        const val = e.target.value;
                        setServiceMappings((m) => ({ ...m, [svc]: val }));
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Run preflight above to auto-detect service containers from docker-compose.yml.
              </p>
            )}
          </div>

          <FormField
            label="Protected Secret References (Allowlist)"
            hint="Comma-separated environment variable names passed to the runner (e.g. JWT_SECRET, DB_PASSWORD). Plaintext values are strictly prohibited."
          >
            {(props) => (
              <Input
                {...props}
                placeholder="JWT_SECRET, STRIPE_API_KEY, DB_PASSWORD"
                value={secretRefs}
                onChange={(e) => setSecretRefs(e.target.value)}
              />
            )}
          </FormField>
        </div>
      </DetailPanel>

      {/* Step 3: Save Configuration */}
      <DetailPanel title="3. Execution Profile & Save Configuration">
        <div className="space-y-4">
          <FormField
            label="Execution Profile ID"
            hint="The containerized sandbox profile installed on the runner host."
          >
            {(props) => (
              <Input
                {...props}
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              />
            )}
          </FormField>

          <Button
            disabled={save.isPending}
            onClick={() => {
              save.mutate(
                {
                  projectId,
                  profileId,
                  snapshotId: snapshotId || undefined,
                  profile: {
                    serviceMappings,
                    secretReferences: secretRefs
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                  expectedRevision: config.data?.revision ?? 0,
                },
                {
                  onSuccess: () => {
                    setSaveSuccess(true);
                    setTimeout(() => setSaveSuccess(false), 4000);
                  },
                },
              );
            }}
          >
            {save.isPending ? "Saving..." : "Save Runtime Configuration"}
          </Button>

          {saveSuccess && (
            <p className="text-sm text-success font-medium">
              ✓ Runtime configuration saved successfully!
            </p>
          )}
          {save.isError && <ErrorState error={save.error} />}
        </div>
      </DetailPanel>
    </div>
  );
}

// ==========================================
// 2. RUNTIME SCENARIOS (F14)
// ==========================================
export function RuntimeScenarios() {
  const { projectId } = useSelection();
  if (!projectId) {
    return (
      <EmptyState
        title="Select a project"
        description="Choose a project from the top bar to create and run scenario sessions."
      />
    );
  }
  return <RuntimeScenariosView key={projectId} projectId={projectId} />;
}

function RuntimeScenariosView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const snapshots = useApiQuery("snapshots", { projectId });
  const models = useApiQuery("modelVersions", { projectId });
  const scenarios = useApiQuery("scenarios", { projectId });
  const config = useApiQuery("runtimeConfiguration", { projectId });
  const start = useApiMutation("startRuntime");

  const [snapshotId, setSnapshotId] = useState("");
  const [modelId, setModelId] = useState("");
  const [scenarioName, setScenarioName] = useState("Order & Payment Checkout Flow");
  const [steps, setSteps] = useState([
    { service: "gateway", method: "GET", path: "/health", status: "200" },
    { service: "orders", method: "GET", path: "/orders", status: "200" },
  ]);
  const [runMessage, setRunMessage] = useState("");

  useEffect(() => {
    if (!snapshotId && snapshots.data?.length) {
      const newest = snapshots.data[0];
      if (newest) setSnapshotId(newest.id);
    }
  }, [snapshots.data, snapshotId]);

  useEffect(() => {
    if (!modelId && models.data?.length) {
      const newest = models.data[0];
      if (newest) setModelId(newest.id);
    }
  }, [models.data, modelId]);

  const addStep = () => {
    setSteps((s) => [...s, { service: "gateway", method: "GET", path: "/health", status: "200" }]);
  };

  const removeStep = (index: number) => {
    setSteps((s) => s.filter((_, i) => i !== index));
  };

  const handleCreateAndRun = (approveAndDispatch: boolean) => {
    if (!snapshotId) return;
    setRunMessage(approveAndDispatch ? "Creating, approving and dispatching run..." : "Creating runtime session...");

    start.mutate(
      {
        projectId,
        snapshotId,
        modelId: modelId || undefined,
        scenarioId: "scen-" + Math.random().toString(16).slice(2, 8),
        scenarioName: scenarioName?.trim() || "Scenario " + new Date().toLocaleTimeString(),
        steps: steps.map((st, i) => ({
          id: `step-${i + 1}`,
          title: `${st.method} ${st.path}`,
          service: st.service,
          method: st.method,
          path: st.path,
          expectedStatus: parseInt(st.status, 10) || 200,
        })),
        configurationRevision: config.data?.revision ?? 1,
        scenarioRevision: 1,
        approved: true,
      },
      {
        onSuccess: (session) => {
          setRunMessage(
            `Session ${session.id.slice(0, 8)} created successfully! Status: ${session.executionStatus || session.status}. Đang chuyển hướng sang trang Sessions...`,
          );
          setTimeout(() => {
            router.push(`/sessions?project=${projectId}&session=${session.id}`);
          }, 800);
        },
        onError: (err) => {
          setRunMessage(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <RuntimeStepperBanner currentStep={2} projectId={projectId} />
      <DetailPanel title="Create & Approve Runtime Scenario Session">
        <p className="text-sm text-muted-foreground">
          Define HTTP scenario steps to execute inside the isolated Docker sandbox network. OpenTelemetry
          agents will capture trace spans between services.
        </p>

        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Source snapshot"
              value={snapshotId}
              onChange={setSnapshotId}
              options={(snapshots.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.name} · ${s.id.slice(0, 8)}`,
              }))}
            />

            <SelectField
              label="Model version"
              value={modelId}
              onChange={setModelId}
              options={(models.data ?? []).map((m) => ({
                value: m.id,
                label: `${"label" in m && m.label ? m.label : `Revision ${m.revision}`} · ${m.id.slice(0, 8)}`,
              }))}
            />
          </div>

          <FormField label="Scenario Name">
            {(props) => (
              <Input
                {...props}
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            )}
          </FormField>

          {/* HTTP Steps Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">HTTP Scenario Steps</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSteps([
                      { service: "gateway", method: "GET", path: "/health", status: "200" },
                      { service: "orders", method: "GET", path: "/orders", status: "200" },
                      { service: "payment", method: "POST", path: "/payments/process", status: "200" },
                    ]);
                  }}
                >
                  ⚡ Fill Sample Steps
                </Button>
                <Button size="sm" variant="outline" onClick={addStep}>
                  + Add Step
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {steps.map((st, i) => (
                <div key={i} className="flex items-center gap-2 rounded border p-2 bg-muted/20">
                  <span className="w-6 text-xs text-muted-foreground text-center">{i + 1}</span>
                  <select
                    className="h-9 rounded border px-2 text-xs font-semibold bg-background"
                    value={st.method}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSteps((arr) => arr.map((item, idx) => (idx === i ? { ...item, method: val } : item)));
                    }}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <Input
                    className="w-32 font-mono text-xs"
                    placeholder="Service"
                    value={st.service}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSteps((arr) => arr.map((item, idx) => (idx === i ? { ...item, service: val } : item)));
                    }}
                  />
                  <Input
                    className="flex-1 font-mono text-xs"
                    placeholder="/path"
                    value={st.path}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSteps((arr) => arr.map((item, idx) => (idx === i ? { ...item, path: val } : item)));
                    }}
                  />
                  <Input
                    className="w-20 font-mono text-xs"
                    placeholder="200"
                    value={st.status}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSteps((arr) => arr.map((item, idx) => (idx === i ? { ...item, status: val } : item)));
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive px-2"
                    onClick={() => removeStep(i)}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              disabled={!snapshotId || start.isPending}
              onClick={() => handleCreateAndRun(true)}
            >
              {start.isPending ? "Starting..." : "🚀 Create & Approve Run"}
            </Button>
            <Button
              variant="outline"
              disabled={!snapshotId || start.isPending}
              onClick={() => handleCreateAndRun(false)}
            >
              Save As Pending Session
            </Button>
          </div>

          {runMessage && (
            <p className="text-sm font-medium text-primary mt-2">
              {runMessage}
            </p>
          )}
        </div>
      </DetailPanel>

      {/* Saved scenarios list */}
      <DetailPanel title="Saved Scenarios">
        <RequestState query={scenarios} empty={!scenarios.data?.length}>
          <div className="space-y-3">
            {scenarios.data?.map((sc) => (
              <div key={sc.id} className="rounded border p-3 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">{sc.name}</span>
                  <span className="text-xs text-muted-foreground">Revision {sc.revision}</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-muted-foreground font-mono space-y-0.5">
                  {sc.steps.map((st, idx) => (
                    <li key={idx}>{st}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </RequestState>
      </DetailPanel>
    </div>
  );
}

// ==========================================
// 3. RUNTIME SESSIONS (F15)
// ==========================================
export function RuntimeSessions({ administrative = false }: { administrative?: boolean }) {
  return <BackendRuntime administrative={administrative} />;
}

"use client";
export function RuntimeStepperBanner({ currentStep, projectId }: { currentStep: 1 | 2 | 3; projectId?: string }) {
  const steps = [
    { num: 1, title: "Step 1: Configure Sandbox", path: "/runtime-config", desc: "Set resource limits and discover services" },
    { num: 2, title: "Step 2: Test Scenarios", path: "/scenarios", desc: "Define API request steps" },
    { num: 3, title: "Step 3: Run & Trace", path: "/sessions", desc: "Monitor execution and sequence diagrams" },
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


import { useState, useEffect, useMemo, useRef } from "react";
import { suggestRuntimeScenarios, automaticRuntimeDraft, parseRuntimeEnvFile, type RuntimeDraftStep } from "./scenario-suggestions";
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

  const models = useApiQuery("modelVersions", { projectId });
  const staticModels = (models.data ?? []).filter(
    (m) => !("origin" in m) || (m as any).origin !== "RUNTIME_ENRICHED",
  );
  const defaultModelId = (staticModels[0] ?? models.data?.[0])?.id ?? "";

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
    if (!snapshotId && snapshots.data?.length) {
      const preferredSnapId =
        config.data?.snapshotId ||
        (staticModels[0] ?? models.data?.[0])?.snapshotId ||
        snapshots.data[0]?.id;
      if (preferredSnapId) setSnapshotId(preferredSnapId);
    }
  }, [snapshots.data, config.data?.snapshotId, models.data, snapshotId]);

  useEffect(() => {
    const rawProfile = config.data?.profile as Record<string, unknown> | undefined;
    if (rawProfile && typeof rawProfile["serviceMappings"] === "object" && rawProfile["serviceMappings"] !== null) {
      setServiceMappings((prev) => ({
        ...(rawProfile["serviceMappings"] as Record<string, string>),
        ...prev,
      }));
    }
  }, [config.data?.profile]);

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
                  snapshotId: snapshotId || snapshots.data?.[0]?.id || undefined,
                  modelId: defaultModelId || undefined,
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
  const saveDraft = useApiMutation("createScenario");
  const submitting = useRef(false);
  const persistedDraft = useRef<{ fingerprint: string; scenario: { id: string; revision: number } } | null>(null);

  const [snapshotId, setSnapshotId] = useState("");
  const [modelId, setModelId] = useState("");
  const modelDetail = useApiQuery("model", { modelId }, { enabled: Boolean(modelId) });
  const realServices = (modelDetail.data?.elements ?? []).filter((e) => e.elementType === "SERVICE_CONTAINER");
  const detectedServiceNames = realServices.map((s) => s.name);
  const defaultSvc = detectedServiceNames[0] ?? "";

  const [scenarioName, setScenarioName] = useState("Backend API smoke scenario");
  const [steps, setDraftSteps] = useState<RuntimeDraftStep[]>([]);
  const edited = useRef(false);
  const setSteps: typeof setDraftSteps = value => { edited.current = true; setDraftSteps(value); };
  const suggestions = useMemo(() => modelDetail.data ? suggestRuntimeScenarios(modelDetail.data, config.data?.profile) : [], [modelDetail.data, config.data?.profile]);
  const automatic = useMemo(() => automaticRuntimeDraft(suggestions, config.data?.profile), [suggestions, config.data?.profile]);
  const [environment, setEnvironment] = useState<Record<string,string>>({});
  useEffect(() => { setEnvironment({}); }, [modelId]);
  const applySuggestions = () => setSteps(automatic.steps);
  const [runMessage, setRunMessage] = useState("");

  const staticModels = (models.data ?? []).filter(
    (m) => !("origin" in m) || (m as any).origin !== "RUNTIME_ENRICHED",
  );
  const selectableModels = staticModels.length > 0 ? staticModels : (models.data ?? []);

  useEffect(() => {
    if (!modelId && selectableModels.length > 0) {
      const preferred = selectableModels.find((m) => m.latest) ?? selectableModels[0];
      if (preferred) {
        setModelId(preferred.id);
        if (preferred.snapshotId) {
          setSnapshotId(preferred.snapshotId);
        }
      }
    }
  }, [selectableModels, modelId]);

  useEffect(() => {
    if (!snapshotId && snapshots.data?.length) {
      const newest = snapshots.data[0];
      if (newest) setSnapshotId(newest.id);
    }
  }, [snapshots.data, snapshotId]);

  const handleModelChange = (nextModelId: string) => {
    edited.current = false;
    setEnvironment({});
    setDraftSteps([]);
    setModelId(nextModelId);
    const matched = (models.data ?? []).find((m) => m.id === nextModelId);
    if (matched?.snapshotId) {
      setSnapshotId(matched.snapshotId);
    }
  };

  useEffect(() => {
    if (!edited.current) setDraftSteps(automatic.steps);
  }, [automatic]);

  const addStep = () => {
    setSteps((s) => [...s, { service: defaultSvc, method: "GET", path: "", status: "200" }]);
  };

  const removeStep = (index: number) => {
    setSteps((s) => s.filter((_, i) => i !== index));
  };

  const handleCreateAndRun = async (approveAndDispatch: boolean) => {
    if (submitting.current) return;
    const chosenModel = selectableModels.find(m => m.id === modelId);
    const effectiveSnapshotId = chosenModel?.snapshotId;
    if (!chosenModel || !effectiveSnapshotId || !steps.length) { setRunMessage("Select an analyzed model and at least one request."); return; }
    if (steps.some(step => !step.service || !step.path.startsWith("/") || step.path.startsWith("//") || /[\r\n]/.test(step.path) || !/^\d{3}$/.test(step.status) || Number(step.status) < 100 || Number(step.status) > 599)) {
      setRunMessage("Complete request services, paths, parameter values and expected status codes."); return;
    }
    if (approveAndDispatch && (!config.data?.ready || config.data.modelId !== chosenModel.id || config.data.snapshotId !== effectiveSnapshotId)) {
      setRunMessage("Runtime configuration must be ready and pinned to this source/model before approval."); return;
    }
    const required = automatic.inputs;
    if (approveAndDispatch && required.length && !config.data?.protectedInputsReady) { setRunMessage("Protected runtime inputs are not ready. An administrator must complete runtime setup."); return; }
    if (approveAndDispatch && required.some(input => !environment[input.name]?.trim())) { setRunMessage("Fill the required environment and test inputs before approval."); return; }
    if (approveAndDispatch && required.some(input => { if(input.kind!=="json")return false;try{JSON.parse(environment[input.name]!);return false;}catch{return true;} })) {setRunMessage("A JSON test body is not valid JSON.");return;}
    const protectedValues = Object.fromEntries(required.filter(input => environment[input.name] !== undefined).map(input => [input.name, environment[input.name]!]));
    if (new TextEncoder().encode(JSON.stringify(protectedValues)).length > 65536) { setRunMessage("Runtime inputs exceed the supported size."); return; }
    const draft = { projectId, name: scenarioName.trim() || "Backend API smoke scenario",
      steps: steps.map((step, index) => JSON.stringify({ id: `step-${index+1}`, service: step.service, method: step.method, path: step.path, expectedStatus: Number(step.status), ...(step.environmentVariables ? { environmentVariables: step.environmentVariables } : {}), ...(step.envHeaders ? { envHeaders: step.envHeaders } : {}), ...(step.bodyReference ? { bodyReference: step.bodyReference } : {}) })) };
    const fingerprint = JSON.stringify(draft);
    submitting.current = true;
    try {
      setRunMessage("Saving scenario...");
      const saved = persistedDraft.current?.fingerprint === fingerprint ? persistedDraft.current.scenario : await saveDraft.mutateAsync(draft);
      persistedDraft.current = { fingerprint, scenario: saved };
      if (!approveAndDispatch) { setRunMessage("Scenario saved for review. No runtime session was started."); return; }
      setRunMessage("Approving the saved scenario and requesting execution...");
      const session = await start.mutateAsync({ projectId, snapshotId: effectiveSnapshotId, modelId: chosenModel.id,
        scenarioId: saved.id, scenarioName: draft.name, configurationRevision: config.data!.revision,
        scenarioRevision: saved.revision, approved: true, environment: protectedValues });
      router.push(`/sessions?project=${projectId}&session=${session.id}`);
    } catch (error) {
      setRunMessage(`Request failed: ${error instanceof Error ? error.message : String(error)}. Check sessions before retrying an execution request.`);
    } finally { submitting.current = false; }
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
              onChange={handleModelChange}
              options={selectableModels.map((m) => ({
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

          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">Suggested from this backend</p>
            <p className="text-muted-foreground">Requests are drafts from extracted endpoints. HTTP 200 is a test expectation, not an observed result. Review before approval.</p>
            {!suggestions.length && <p>No endpoint declarations are available. Analyze the source or add a request explicitly.</p>}
            {suggestions.filter(s => s.missing.length).map(s => <p key={s.key} className="text-xs"><strong>{s.method} {s.path}</strong>: {s.missing.join("; ")}</p>)}
            {!config.data?.ready && <p><Link className="underline" href={`/runtime-config?project=${projectId}`}>Complete runtime prerequisites</Link> before running.</p>}
          </div>
          <section className="space-y-3 rounded-lg border p-3" aria-label="Environment and test inputs">
            <h3 className="font-medium">Environment and test inputs</h3>
            <p className="text-sm text-muted-foreground">MAVIS builds the requests. Enter only missing values, then review and approve. Values are sent separately from the saved scenario.</p>
            {automatic.inputs.length>0 && <FormField label="Import .env values" hint="Processed locally. Only inputs required by this draft are included when you approve.">{props=><Input {...props} type="file" onChange={async event=>{
              const file=event.target.files?.[0];if(!file)return;
              try{if(file.size>65536)throw new Error("Environment file exceeds the supported size");const parsed=parseRuntimeEnvFile(await file.text());setEnvironment(current=>({...current,...Object.fromEntries(automatic.inputs.filter(input=>Object.hasOwn(parsed,input.name)).map(input=>[input.name,parsed[input.name]!]))}));setRunMessage("Environment inputs imported. Review the generated scenario before approval.");}
              catch(error){setRunMessage(error instanceof Error?error.message:"Could not import environment inputs");}
              finally{event.target.value="";}
            }}/>}</FormField>}
            {automatic.inputs.map(input => <FormField key={input.name} label={input.label} hint={input.name}>{props => input.kind==="json" ?
              <Textarea {...props} value={environment[input.name]??""} onChange={event=>setEnvironment(current=>({...current,[input.name]:event.target.value}))} autoComplete="off" /> :
              <Input {...props} type={input.kind==="credential"?"password":"text"} value={environment[input.name]??""} onChange={event=>setEnvironment(current=>({...current,[input.name]:event.target.value}))} autoComplete="off" />}</FormField>)}
            {automatic.inputs.length>0 && !config.data?.protectedInputsReady && <p className="text-sm">An administrator must prepare protected runtime inputs before this draft can run.</p>}
            {!automatic.inputs.length && <p className="text-sm">No extra values are required for this draft.</p>}
            {automatic.blocked.map((message,index)=><p className="text-xs text-muted-foreground" key={index}>{message}</p>)}
            <ul className="space-y-1 text-xs">{steps.map((step,index)=><li key={index}>{step.method} {step.service}{step.path}</li>)}</ul>
          </section>
          <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Advanced request editor</summary>
          {/* HTTP Steps Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">HTTP Scenario Steps</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applySuggestions}
                  disabled={!automatic.steps.length}
                >
                  Rebuild automatic draft
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

          </details>
          <div className="flex gap-3 pt-2">
            <Button
              disabled={!modelId || !steps.length || !config.data?.ready || config.data.modelId !== modelId || config.data.snapshotId !== snapshotId || (automatic.inputs.length>0 && !config.data.protectedInputsReady) || automatic.inputs.some(input=>!environment[input.name]?.trim()) || saveDraft.isPending || start.isPending}
              onClick={() => handleCreateAndRun(true)}
            >
              {start.isPending ? "Starting..." : "🚀 Create & Approve Run"}
            </Button>
            <Button
              variant="outline"
              disabled={!modelId || !steps.length || saveDraft.isPending || start.isPending}
              onClick={() => handleCreateAndRun(false)}
            >
              Save scenario without running
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

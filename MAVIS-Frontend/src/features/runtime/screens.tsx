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
import { suggestRuntimeScenarios, automaticRuntimeDraft, parseRuntimeEnvFile, type RuntimeDraftStep, type RuntimeInput } from "./scenario-suggestions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApi, useApiMutation, useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { RequestState, ErrorState, EmptyState } from "@/components/shared/request-state";
import { ConfirmDialog, FormField, SelectField } from "@/components/shared/forms";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

function httpMethodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
    case "POST":
      return "bg-sky-500/15 text-sky-400 border border-sky-500/30";
    case "PUT":
      return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    case "PATCH":
      return "bg-violet-500/15 text-violet-400 border border-violet-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-400 border border-rose-500/30";
    default:
      return "bg-muted text-foreground border border-border";
  }
}

function readStep1Target(projectId: string): { modelId?: string; snapshotId?: string } {
  try {
    const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(`mavis:runtime-target:${projectId}`) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { modelId?: string; snapshotId?: string };
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStep1Target(projectId: string, modelId: string, snapshotId: string) {
  try {
    if (typeof window !== "undefined" && projectId && (modelId || snapshotId)) {
      window.sessionStorage.setItem(
        `mavis:runtime-target:${projectId}`,
        JSON.stringify({ modelId, snapshotId }),
      );
    }
  } catch {
    // Ignore storage restriction
  }
}
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
  const [modelId, setModelId] = useState("");
  const [profileId, setProfileId] = useState("SPRING_BOOT_DOTNET_COMPOSE_V1");
  const [serviceMappings, setServiceMappings] = useState<Record<string, string>>({});
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [secretRefs, setSecretRefs] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("");
  const [newSecretVal, setNewSecretVal] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedServiceFilter, setSelectedServiceFilter] = useState("ALL");
  const [selectedDbIndex, setSelectedDbIndex] = useState("ALL");
  const [dismissedSecretKeys, setDismissedSecretKeys] = useState<string[]>([]);

  useEffect(() => {
    if (preflight.data?.recommendedProfile) {
      setProfileId(preflight.data.recommendedProfile);
    } else if (config.data?.profileId) {
      setProfileId(config.data.profileId);
    }
  }, [preflight.data?.recommendedProfile, config.data?.profileId]);

  useEffect(() => {
    const stored = readStep1Target(projectId);
    if (!snapshotId && snapshots.data?.length) {
      const preferredSnapId =
        (stored.snapshotId && snapshots.data.some((s) => s.id === stored.snapshotId) ? stored.snapshotId : "") ||
        config.data?.snapshotId ||
        (staticModels[0] ?? models.data?.[0])?.snapshotId ||
        snapshots.data[0]?.id;
      if (preferredSnapId) setSnapshotId(preferredSnapId);
    }
    if (!modelId && defaultModelId) {
      const allModels = models.data ?? [];
      const preferredModelId =
        (stored.modelId && allModels.some((m) => m.id === stored.modelId) ? stored.modelId : "") ||
        config.data?.modelId ||
        defaultModelId;
      setModelId(preferredModelId);
    }
  }, [projectId, snapshots.data, config.data?.snapshotId, config.data?.modelId, models.data, snapshotId, modelId, defaultModelId]);

  useEffect(() => {
    if (modelId || snapshotId) {
      writeStep1Target(projectId, modelId, snapshotId);
    }
  }, [projectId, modelId, snapshotId]);

  const rawProfile = (config.data?.profile ?? {}) as Record<string, unknown>;
  const configuredSecretKeys = Array.isArray(rawProfile["configuredSecretKeys"])
    ? (rawProfile["configuredSecretKeys"] as unknown[]).map(String)
    : [];

  const activeServices =
    preflight.data?.detectedServices ??
    (Array.isArray(rawProfile["detectedServices"])
      ? (rawProfile["detectedServices"] as unknown[]).map(String)
      : []);
  const servicePorts =
    preflight.data?.servicePorts ??
    (typeof rawProfile["servicePorts"] === "object" && rawProfile["servicePorts"] !== null
      ? (rawProfile["servicePorts"] as Record<string, number>)
      : {});
  const serviceStacks =
    preflight.data?.serviceStacks ??
    (typeof rawProfile["serviceStacks"] === "object" && rawProfile["serviceStacks"] !== null
      ? (rawProfile["serviceStacks"] as Record<string, string>)
      : {});
  const detectedEndpoints =
    preflight.data?.detectedEndpoints ??
    (Array.isArray(rawProfile["detectedEndpoints"])
      ? (rawProfile["detectedEndpoints"] as Array<{
          service: string;
          method: string;
          path: string;
          source?: string;
        }>)
      : []);
  const databaseChecks =
    preflight.data?.databaseChecks ??
    (Array.isArray(rawProfile["databaseChecks"])
      ? (rawProfile["databaseChecks"] as Array<{
          service: string;
          dbType: string;
          configKey?: string;
          connectionUrl?: string;
          requiredEnvVars?: string[];
          status?: string;
        }>)
      : []);
  const requiredEnvVars =
    preflight.data?.requiredEnvVars ??
    (Array.isArray(rawProfile["requiredEnvVars"])
      ? (rawProfile["requiredEnvVars"] as Array<{
          name: string;
          service?: string;
          category?: string;
          defaultValue?: string | null;
          required?: boolean;
          source?: string;
        }>)
      : []);

  useEffect(() => {
    if (rawProfile && typeof rawProfile["serviceMappings"] === "object" && rawProfile["serviceMappings"] !== null) {
      setServiceMappings((prev) => ({
        ...(rawProfile["serviceMappings"] as Record<string, string>),
        ...prev,
      }));
    }
    if (rawProfile && typeof rawProfile["environmentVariables"] === "object" && rawProfile["environmentVariables"] !== null) {
      const savedEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawProfile["environmentVariables"] as Record<string, unknown>)) {
        savedEnv[k] = String(v ?? "");
      }
      setEnvVars((prev) => ({ ...savedEnv, ...prev }));
    }
    if (rawProfile && Array.isArray(rawProfile["secretReferences"])) {
      const refs = (rawProfile["secretReferences"] as unknown[]).map(String).filter(Boolean);
      if (refs.length > 0 && !secretRefs) {
        setSecretRefs(refs.join(", "));
      }
    }
  }, [config.data?.profile]);

  useEffect(() => {
    if (activeServices.length) {
      setServiceMappings((prev) => {
        const next = { ...prev };
        for (const s of activeServices) {
          if (!next[s]) next[s] = s;
        }
        return next;
      });
    }
  }, [activeServices.join(",")]);

  useEffect(() => {
    if (!projectId || !snapshotId) return;
    preflight.mutate({ projectId, snapshotId });
  }, [projectId, snapshotId]);

  const detectedVarSignature = requiredEnvVars.map((r) => `${r.name}:${r.category}`).join("|");

  useEffect(() => {
    if (!requiredEnvVars.length && !databaseChecks.length) return;
    setEnvVars((prev) => {
      const next = { ...prev };
      for (const item of requiredEnvVars) {
        const cat = (item.category ?? "ENV").toUpperCase();
        if (cat === "ENV" && !(item.name in next)) {
          next[item.name] = item.defaultValue ?? "";
        }
      }
      return next;
    });
    setSecretValues((prev) => {
      const next: Record<string, string> = {};
      for (const item of requiredEnvVars) {
        const cat = (item.category ?? "ENV").toUpperCase();
        if (cat === "DB_SECRET" || cat === "SECRET") {
          next[item.name] = prev[item.name] ?? "";
        }
      }
      if (
        databaseChecks.length > 0 &&
        !Object.keys(next).some((k) => k.includes("DB_") || k.includes("DATASOURCE") || k.includes("CONNECTION"))
      ) {
        next["DB_CONNECTION_STRING"] = prev["DB_CONNECTION_STRING"] ?? "";
      }
      return next;
    });
  }, [detectedVarSignature, databaseChecks.length, snapshotId]);

  const autoDetectedSecretKeys = Array.from(
    new Set([
      ...requiredEnvVars
        .filter((v) => v.category === "DB_SECRET" || v.category === "SECRET")
        .map((v) => v.name),
      ...(databaseChecks.length > 0 &&
      !requiredEnvVars.some((v) => v.category === "DB_SECRET")
        ? ["DB_CONNECTION_STRING"]
        : []),
    ]),
  );

  const allSecretKeys = Array.from(
    new Set([
      ...autoDetectedSecretKeys,
      ...configuredSecretKeys,
      ...Object.keys(secretValues),
    ]),
  ).filter((k) => !dismissedSecretKeys.includes(k));

  return (
    <div className="space-y-6">
      <RuntimeStepperBanner currentStep={1} projectId={projectId} />
      {/* Step 1: Preflight Eligibility & Source Inspection */}
      <DetailPanel title="1. Source Snapshot, API & Database Inspection (Preflight)">
        <p className="text-sm text-muted-foreground">
          Inspect the source snapshot for Docker Compose compatibility, API endpoints, database
          connections, and required environment/secret variables.
        </p>

        <RequestState query={snapshots} empty={!snapshots.data?.length}>
          <div className="mt-4 space-y-4">
            {(() => {
              const candidateModels = staticModels.length ? staticModels : (models.data ?? []);
              if (candidateModels.length > 0) {
                return (
                  <SelectField
                    disabled={preflight.isPending}
                    label="Target revision"
                    value={modelId || defaultModelId}
                    onChange={(nextModelId) => {
                      setModelId(nextModelId);
                      const chosen = candidateModels.find((m) => m.id === nextModelId);
                      if (chosen?.snapshotId && chosen.snapshotId !== snapshotId) {
                        setSnapshotId(chosen.snapshotId);
                        preflight.reset();
                      }
                    }}
                    options={candidateModels.map((m) => {
                      const snap = (snapshots.data ?? []).find((s) => s.id === m.snapshotId);
                      return {
                        value: m.id,
                        label: `Revision ${m.revision}${m.latest ? " (Latest)" : ""} · ${snap ? snap.name : m.id.slice(0, 8)}`,
                      };
                    })}
                  />
                );
              }
              return (
                <SelectField
                  disabled={preflight.isPending}
                  label="Target revision"
                  value={snapshotId}
                  onChange={(value) => {
                    setSnapshotId(value);
                    preflight.reset();
                  }}
                  options={(snapshots.data ?? []).map((s, idx) => ({
                    value: s.id,
                    label: `Snapshot #${(snapshots.data?.length ?? idx) - idx} · ${s.name}`,
                  }))}
                />
              );
            })()}

            <Button
              disabled={!snapshotId || preflight.isPending}
              onClick={() => preflight.mutate({ projectId, snapshotId })}
            >
              {preflight.isPending
                ? "Inspecting source & Compose..."
                : "Check runtime eligibility (Compose Preflight)"}
            </Button>

            {preflight.isError && <ErrorState error={preflight.error} />}

            {(preflight.data || activeServices.length > 0) && (
              <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">Preflight Result:</span>
                    <StatusBadge
                      status={
                        (preflight.data ? preflight.data.compatible : config.data?.supported)
                          ? "Compatible"
                          : "Rejected"
                      }
                      variant={
                        (preflight.data ? preflight.data.compatible : config.data?.supported)
                          ? "success"
                          : "destructive"
                      }
                    />
                  </div>
                  {(preflight.data?.recommendedProfile || config.data?.profileId) && (
                    <p className="text-xs text-muted-foreground">
                      <strong>Recommended Profile:</strong>{" "}
                      {preflight.data?.recommendedProfile ?? config.data?.profileId}
                    </p>
                  )}
                </div>

                {/* Detected Services & Database Checks Dropdowns */}
                {(() => {
                  const filteredDbs =
                    selectedServiceFilter === "ALL"
                      ? databaseChecks
                      : databaseChecks.filter((db) => db.service === selectedServiceFilter);
                  const chosenDb =
                    selectedDbIndex !== "ALL" ? filteredDbs[Number(selectedDbIndex)] : undefined;
                  return (
                    <div className="space-y-2">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SelectField
                          label={`Detected Services & Runtime Stacks (${activeServices.length})`}
                          value={selectedServiceFilter}
                          onChange={(val) => {
                            setSelectedServiceFilter(val);
                            setSelectedDbIndex("ALL");
                          }}
                          options={[
                            {
                              value: "ALL",
                              label: activeServices.length
                                ? `All detected services (${activeServices.length})`
                                : "No services detected",
                            },
                            ...activeServices.map((svc) => ({
                              value: svc,
                              label: `${svc}${servicePorts[svc] ? ` :${servicePorts[svc]}` : ""}${serviceStacks[svc] ? ` (${serviceStacks[svc]})` : ""}`,
                            })),
                          ]}
                        />

                        <SelectField
                          label={`Database & Connection Inspection (${filteredDbs.length})`}
                          value={selectedDbIndex}
                          onChange={setSelectedDbIndex}
                          options={
                            filteredDbs.length > 0
                              ? [
                                  {
                                    value: "ALL",
                                    label: `All database bindings (${filteredDbs.length})`,
                                  },
                                  ...filteredDbs.map((db, idx) => ({
                                    value: String(idx),
                                    label: `${db.service} → ${db.dbType}${db.requiredEnvVars?.length ? ` (${db.requiredEnvVars.join(", ")})` : ""} · ${db.status ?? "DETECTED"}`,
                                  })),
                                ]
                              : [
                                  {
                                    value: "ALL",
                                    label: "No external database bindings detected",
                                  },
                                ]
                          }
                        />
                      </div>

                      {chosenDb && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background/80 px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {chosenDb.service} → {chosenDb.dbType}
                            </span>
                            {chosenDb.connectionUrl && (
                              <span className="font-mono text-muted-foreground truncate max-w-md" title={chosenDb.connectionUrl}>
                                · {chosenDb.connectionUrl}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {chosenDb.requiredEnvVars && chosenDb.requiredEnvVars.length > 0 && (
                              <span className="text-muted-foreground">
                                Requires: <strong className="font-mono text-foreground">{chosenDb.requiredEnvVars.join(", ")}</strong>
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-mono text-[10px]">
                              {chosenDb.status ?? "DETECTED"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Discovered API Endpoints */}
                {(() => {
                  const filteredEndpoints =
                    selectedServiceFilter === "ALL"
                      ? detectedEndpoints
                      : detectedEndpoints.filter((ep) => ep.service === selectedServiceFilter);
                  return (
                    <div>
                      <strong className="text-sm">
                        Discovered API Endpoints ({filteredEndpoints.length}):
                      </strong>
                      {filteredEndpoints.length > 0 ? (
                        <div className="mt-1.5 max-h-44 overflow-y-auto rounded border bg-background/80 divide-y text-xs">
                          {filteredEndpoints.map((ep, idx) => (
                            <div
                              key={`${ep.service}-${ep.method}-${ep.path}-${idx}`}
                              className="flex items-center justify-between gap-2 px-3 py-1.5"
                            >
                              <div className="flex items-center gap-2 font-mono">
                                <span
                                  className={`inline-flex w-14 justify-center px-1.5 py-0.5 rounded font-semibold ${httpMethodBadgeClass(ep.method)}`}
                                >
                                  {ep.method}
                                </span>
                                <span className="font-medium">{ep.path}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span className="font-mono text-foreground/80">{ep.service}</span>
                                {ep.source && (
                                  <span className="hidden sm:inline truncate max-w-48">
                                    · {ep.source}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Run preflight to inspect controller routes and HTTP endpoints from source.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {(preflight.data?.securityWarnings?.length || config.data?.prerequisites?.length) ? (
                  <div className="space-y-1">
                    <strong className="text-sm text-warning">Security Warnings / Prerequisites:</strong>
                    <ul className="list-disc pl-5 text-xs text-warning space-y-0.5">
                      {(preflight.data?.securityWarnings ?? config.data?.prerequisites ?? []).map((w, i) => (
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

      {/* Step 2: Service-to-Model Mapping, DB Secrets & Environment Variables */}
      <DetailPanel title="2. Service Mapping, Database Secrets & Environment Variables">
        <p className="text-sm text-muted-foreground">
          Map each service container to its Model Element and provide required database credentials,
          secrets, and environment variables for the sandbox container run.
        </p>

        <div className="mt-4 space-y-6">
          {/* 2A. Service Mapping */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Service-to-Model Mapping</h4>
            {activeServices.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeServices.map((svc) => (
                  <div key={svc} className="flex items-center gap-2">
                    <span className="w-32 font-mono text-xs truncate" title={svc}>
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
                Run preflight above to auto-detect service containers from source.
              </p>
            )}
          </div>

          {/* 2B. Auto-Detected Connections, Database & API Keys */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">
                  Auto-Detected Required Connections & API Keys ({allSecretKeys.length} box{allSecretKeys.length === 1 ? "" : "es"})
                </h4>
                <p className="text-xs text-muted-foreground">
                  Automatically detected from source code and static architecture (e.g. Database detected →{" "}
                  <code>DB_CONNECTION_STRING</code> box appears; AI/External API detected → <code>API_KEY</code> box appears).
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                Auto-Detected: {allSecretKeys.length}
              </span>
            </div>

            {allSecretKeys.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {allSecretKeys.map((sKey) => {
                  const isConfigured = configuredSecretKeys.includes(sKey);
                  const meta = requiredEnvVars.find((r) => r.name === sKey);
                  const upper = sKey.toUpperCase();
                  const isDbConn =
                    upper.includes("CONNECTION_STRING") ||
                    upper.includes("CONNECTIONSTRING") ||
                    upper.includes("DATABASE_URL") ||
                    upper.includes("DATASOURCE_URL");
                  const isAiOrApi = upper.includes("API_KEY") || upper.includes("OPENAI") || upper.includes("GEMINI");
                  const friendlyLabel = isDbConn
                    ? "🗄️ Database Connection String"
                    : isAiOrApi
                      ? "🤖 AI / External Service API Key"
                      : upper.includes("JWT")
                        ? "🔐 JWT Signing Secret"
                        : upper.includes("DB_") || upper.includes("DATASOURCE")
                          ? "🗄️ Database Credential"
                          : "🔑 Protected Secret";
                  const defaultPlaceholder = isConfigured
                    ? "•••••••• (Saved — leave blank to keep existing value)"
                    : isDbConn
                      ? "jdbc:postgresql://host:5432/db?user=...&password=... (or Server=...)"
                      : isAiOrApi
                        ? "sk-... / AIza... (Enter API Key for AI / External API)"
                        : `Enter value for ${sKey}`;
                  return (
                    <div key={sKey} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold">{friendlyLabel}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {sKey}
                            {meta?.source ? ` · from ${meta.source}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {meta?.service && (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-mono">
                              {meta.service}
                            </span>
                          )}
                          {isConfigured && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-medium">
                              Configured ✓
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${sKey}`}
                            title={`Remove ${sKey}`}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setDismissedSecretKeys((prev) => Array.from(new Set([...prev, sKey])));
                              setSecretValues((prev) => {
                                const next = { ...prev };
                                delete next[sKey];
                                return next;
                              });
                            }}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                      <Input
                        type={isDbConn ? "text" : "password"}
                        autoComplete="new-password"
                        className="font-mono text-xs h-9"
                        placeholder={defaultPlaceholder}
                        value={secretValues[sKey] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSecretValues((prev) => ({ ...prev, [sKey]: val }));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                No required Database Connection or API Key detected in this snapshot. You can still add custom boxes below if needed.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Input
                autoComplete="off"
                className="w-56 font-mono text-xs h-8"
                placeholder="Add another box (e.g. DB_CONNECTION_STRING, API_KEY)"
                value={newSecretKey}
                onChange={(e) => setNewSecretKey(e.target.value.toUpperCase())}
              />
              <Input
                type="password"
                autoComplete="new-password"
                className="flex-1 min-w-48 font-mono text-xs h-8"
                placeholder="Value..."
                value={newSecretVal}
                onChange={(e) => setNewSecretVal(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newSecretKey.trim()}
                onClick={() => {
                  const k = newSecretKey.trim().replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
                  if (!k) return;
                  setDismissedSecretKeys((prev) => prev.filter((item) => item !== k));
                  setSecretValues((prev) => ({ ...prev, [k]: newSecretVal }));
                  setNewSecretKey("");
                  setNewSecretVal("");
                }}
              >
                + Add Box
              </Button>
            </div>
          </div>
          {/* 2C. Environment Variables */}
          <div className="space-y-3 border-t pt-4">
            <div>
              <h4 className="text-sm font-semibold">Environment Variables (Non-Secret Config)</h4>
              <p className="text-xs text-muted-foreground">
                Database hosts, ports, URLs, and runtime flags injected into Docker Compose override.
              </p>
            </div>

            {Object.keys(envVars).length > 0 && (
              <div className="space-y-2">
                {Object.entries(envVars).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-56 font-mono text-xs truncate font-medium" title={k}>
                      {k}
                    </span>
                    <span className="text-muted-foreground">=</span>
                    <Input
                      className="flex-1 font-mono text-xs h-8"
                      placeholder="Value"
                      value={v}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEnvVars((prev) => ({ ...prev, [k]: val }));
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEnvVars((prev) => {
                          const next = { ...prev };
                          delete next[k];
                          return next;
                        })
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-48 font-mono text-xs h-8"
                placeholder="ENV_KEY (e.g. DB_HOST)"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())}
              />
              <Input
                className="flex-1 min-w-48 font-mono text-xs h-8"
                placeholder="Environment value (e.g. postgres:5432)"
                value={newEnvVal}
                onChange={(e) => setNewEnvVal(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newEnvKey.trim()}
                onClick={() => {
                  const k = newEnvKey.trim().replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
                  if (!k) return;
                  setEnvVars((prev) => ({ ...prev, [k]: newEnvVal }));
                  setNewEnvKey("");
                  setNewEnvVal("");
                }}
              >
                + Add Environment Variable
              </Button>
            </div>
          </div>
        </div>
      </DetailPanel>

      {/* Step 3: Save Configuration */}
      <DetailPanel title="3. Execution Profile & Save Configuration">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Sandbox Execution Profile (Auto-selected from detected stack):
            </span>
            <span className="font-mono font-semibold">{profileId}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={save.isPending}
              onClick={() => {
                const combinedSecretRefs = Array.from(
                  new Set([
                    ...secretRefs
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    ...allSecretKeys,
                  ]),
                ).filter((k) => !dismissedSecretKeys.includes(k));
                save.mutate(
                  {
                    projectId,
                    profileId,
                    snapshotId: snapshotId || snapshots.data?.[0]?.id || undefined,
                    modelId: modelId || defaultModelId || undefined,
                    profile: {
                      serviceMappings,
                      environmentVariables: envVars,
                      secretValues,
                      secretReferences: combinedSecretRefs,
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

            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/scenarios?project=${projectId}`)}
            >
              Continue to Step 2: Test Scenarios →
            </Button>
          </div>

          {saveSuccess && (
            <p className="text-sm text-success font-medium">
              ✓ Runtime configuration, environment variables, and secrets saved successfully!
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
  const generateAiDraft = useApiMutation("generateRuntimeScenario");
  const autoSaveConfig = useApiMutation("saveRuntimeConfiguration");
  const submitting = useRef(false);
  const autoGenTriggered = useRef<string>("");
  const persistedDraft = useRef<{ fingerprint: string; scenario: { id: string; revision: number } } | null>(null);

  const [snapshotId, setSnapshotId] = useState("");
  const [modelId, setModelId] = useState("");
  const modelDetail = useApiQuery("model", { modelId }, { enabled: Boolean(modelId) });
  const realServices = (modelDetail.data?.elements ?? []).filter((e) => e.elementType === "SERVICE_CONTAINER");
  const detectedServiceNames = realServices.map((s) => s.name);
  const defaultSvc = detectedServiceNames[0] ?? "";

  const [scenarioName, setScenarioName] = useState("Backend API smoke scenario");
  const [aiGoal, setAiGoal] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [generatorMode, setGeneratorMode] = useState<"AI_ASSISTED" | "SYSTEM_STATIC" | "LOCAL_STATIC">("LOCAL_STATIC");
  const [aiModelName, setAiModelName] = useState("");
  const [inheritedEnvKeys, setInheritedEnvKeys] = useState<string[]>([]);
  const [userConfirmed, setUserConfirmed] = useState(true);

  const [steps, setDraftSteps] = useState<RuntimeDraftStep[]>([]);
  const edited = useRef(false);
  const setSteps: typeof setDraftSteps = (value) => {
    edited.current = true;
    setDraftSteps(value);
  };
  const suggestions = useMemo(
    () => (modelDetail.data ? suggestRuntimeScenarios(modelDetail.data, config.data?.profile) : []),
    [modelDetail.data, config.data?.profile],
  );
  const automatic = useMemo(
    () => automaticRuntimeDraft(suggestions, config.data?.profile),
    [suggestions, config.data?.profile],
  );
  const [environment, setEnvironment] = useState<Record<string, string>>({});
  const [runMessage, setRunMessage] = useState("");

  const staticModels = (models.data ?? []).filter(
    (m) => !("origin" in m) || (m as any).origin !== "RUNTIME_ENRICHED",
  );
  const selectableModels = staticModels.length > 0 ? staticModels : (models.data ?? []);

  useEffect(() => {
    const stored = readStep1Target(projectId);
    if (!modelId) {
      if (stored.modelId && selectableModels.some((m) => m.id === stored.modelId)) {
        setModelId(stored.modelId);
      } else if (config.data?.modelId) {
        setModelId(config.data.modelId);
      }
    }
    if (!snapshotId) {
      if (stored.snapshotId && (snapshots.data ?? []).some((s) => s.id === stored.snapshotId)) {
        setSnapshotId(stored.snapshotId);
      } else if (config.data?.snapshotId) {
        setSnapshotId(config.data.snapshotId);
      }
    }
  }, [projectId, config.data?.modelId, config.data?.snapshotId, selectableModels, snapshots.data, modelId, snapshotId]);

  useEffect(() => {
    const stored = readStep1Target(projectId);
    if (!modelId && selectableModels.length > 0) {
      const preferred =
        (stored.modelId ? selectableModels.find((m) => m.id === stored.modelId) : undefined) ??
        selectableModels.find((m) => m.latest) ??
        selectableModels[0];
      if (preferred) {
        setModelId(preferred.id);
        if (preferred.snapshotId) {
          setSnapshotId(preferred.snapshotId);
        }
      }
    }
  }, [projectId, selectableModels, modelId]);

  useEffect(() => {
    if (!snapshotId && snapshots.data?.length) {
      const newest = snapshots.data[0];
      if (newest) setSnapshotId(newest.id);
    }
  }, [snapshots.data, snapshotId]);

  useEffect(() => {
    const rawProf = (config.data?.profile ?? {}) as Record<string, unknown>;
    const step1Env =
      rawProf["environmentVariables"] && typeof rawProf["environmentVariables"] === "object"
        ? (rawProf["environmentVariables"] as Record<string, unknown>)
        : {};
    const step1Secrets = Array.isArray(rawProf["configuredSecretKeys"])
      ? (rawProf["configuredSecretKeys"] as unknown[]).map(String)
      : [];
    const inherited = Array.from(new Set([...Object.keys(step1Env), ...step1Secrets]));
    if (inherited.length > 0) {
      setInheritedEnvKeys((prev) => Array.from(new Set([...prev, ...inherited])));
    }
    if (Object.keys(step1Env).length > 0) {
      setEnvironment((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(step1Env)) {
          if (!(k in next) && v !== null && v !== undefined) {
            next[k] = String(v);
          }
        }
        return next;
      });
    }
  }, [config.data?.profile]);

  const triggerSystemAiGeneration = (explicitGoal?: string) => {
    if (!snapshotId) return;
    generateAiDraft.mutate(
      {
        projectId,
        snapshotId,
        modelId: modelId || undefined,
        goal: explicitGoal?.trim() || aiGoal.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          setGeneratorMode(res.generatorMode);
          setAiModelName(res.aiModelName ?? "");
          setAiSummary(res.summary);
          if (res.inheritedEnvKeys?.length) {
            setInheritedEnvKeys(res.inheritedEnvKeys);
          }
          if (res.suggestedName) {
            setScenarioName(res.suggestedName);
          }
          if (res.steps && res.steps.length > 0) {
            setDraftSteps(
              res.steps.map((st) => ({
                service: st.service,
                method: st.method.toUpperCase(),
                path: st.path,
                status: String(st.expectedStatus ?? 200),
                rationale: st.rationale,
                source: st.source,
                ...(st.environmentVariables ? { environmentVariables: st.environmentVariables } : {}),
                ...(st.envHeaders ? { envHeaders: st.envHeaders } : {}),
                ...(st.bodyReference ? { bodyReference: st.bodyReference } : {}),
              })),
            );
          }
          if (res.sampleInputs) {
            setEnvironment((prev) => ({ ...res.sampleInputs, ...prev }));
          }
        },
      },
    );
  };

  useEffect(() => {
    const key = `${projectId}:${snapshotId}:${modelId}`;
    if (snapshotId && modelId && autoGenTriggered.current !== key && !edited.current) {
      autoGenTriggered.current = key;
      triggerSystemAiGeneration();
    }
  }, [projectId, snapshotId, modelId]);

  useEffect(() => {
    if (!edited.current && steps.length === 0) {
      if (automatic.steps.length > 0) {
        setDraftSteps(automatic.steps);
        return;
      }
      const discoveredEndpoints = (
        config.data?.profile as
          | { detectedEndpoints?: Array<{ service?: string; method?: string; path?: string; source?: string }> }
          | undefined
      )?.detectedEndpoints;
      if (Array.isArray(discoveredEndpoints) && discoveredEndpoints.length > 0) {
        const sampleEnv: Record<string, string> = {};
        const synthesized = discoveredEndpoints.slice(0, 6).map((ep, idx) => {
          const rawSvc =
            ep.service ||
            detectedServiceNames[idx % Math.max(1, detectedServiceNames.length)] ||
            defaultSvc ||
            "gateway";
          const cleanSvc = rawSvc.replace(/-[0-9a-f]{7,40}$/i, "");
          const serviceKey = cleanSvc.replace(/[^A-Za-z0-9]/g, "_").toUpperCase().slice(0, 32);
          const method = (ep.method || "GET").toUpperCase();
          const vars: Record<string, string> = {};
          const rawPath = ep.path || "/health";
          const rewrittenPath = rawPath.replace(/\{([^}/]+)\}/g, (_, param: string) => {
            const alias = `V${Object.keys(vars).length}`;
            const envName = `${serviceKey}_${param.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`.slice(0, 60);
            vars[alias] = envName;
            sampleEnv[envName] = sampleEnv[envName] ?? "1";
            return `{{${alias}}}`;
          });
          let bodyRef: string | undefined;
          if (["POST", "PUT", "PATCH"].includes(method)) {
            bodyRef = `${serviceKey}_BODY_${idx + 1}`;
            sampleEnv[bodyRef] =
              sampleEnv[bodyRef] ??
              JSON.stringify({ name: "sample-entity", organizationId: 1, departmentId: 1 });
          }
          return {
            service: cleanSvc,
            method,
            path: rewrittenPath,
            status: "200",
            rationale: `Automatically extracted from Step 1 (${ep.source ?? "source snapshot"})`,
            source: ep.source ?? "Step 1 Preflight",
            ...(Object.keys(vars).length > 0 ? { environmentVariables: vars } : {}),
            ...(bodyRef ? { bodyReference: bodyRef } : {}),
          } as RuntimeDraftStep;
        });
        setDraftSteps(synthesized);
        if (Object.keys(sampleEnv).length > 0) {
          setEnvironment((prev) => ({ ...sampleEnv, ...prev }));
        }
      }
    }
  }, [automatic, config.data?.profile]);

  const activeInputs = useMemo(() => {
    const map = new Map<string, RuntimeInput>();
    for (const inp of automatic.inputs) {
      map.set(inp.name, inp);
    }
    for (const [idx, st] of steps.entries()) {
      if (st.environmentVariables) {
        for (const [alias, envName] of Object.entries(st.environmentVariables)) {
          if (!map.has(envName)) {
            map.set(envName, {
              name: envName,
              label: `${st.service} ${st.path} (${alias})`,
              kind: "text",
              source: st.source ?? "Scenario step",
            });
          }
        }
      }
      if (st.bodyReference && !map.has(st.bodyReference)) {
        map.set(st.bodyReference, {
          name: st.bodyReference,
          label: `Step ${idx + 1} (${st.method} ${st.path}): JSON request body`,
          kind: "json",
          source: st.source ?? "Scenario step",
        });
      }
      if (st.envHeaders) {
        for (const h of st.envHeaders) {
          if (!map.has(h.reference)) {
            map.set(h.reference, {
              name: h.reference,
              label: `${st.service}: ${h.name} header`,
              kind: "credential",
              source: st.source ?? "Scenario step",
            });
          }
        }
      }
    }
    return Array.from(map.values()).filter((inp) => !inheritedEnvKeys.includes(inp.name));
  }, [automatic.inputs, steps, inheritedEnvKeys]);

  const applySuggestions = () => {
    edited.current = false;
    triggerSystemAiGeneration();
  };

  const addStep = () => {
    setSteps((s) => [
      ...s,
      {
        service: defaultSvc || (config.data?.profile as { detectedServices?: string[] } | undefined)?.detectedServices?.[0] || "gateway",
        method: "GET",
        path: "/health",
        status: "200",
        rationale: "Custom HTTP test step added by user",
        source: "User defined",
      },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps((s) => s.filter((_, i) => i !== index));
  };

  const handleCreateAndRun = async (approveAndDispatch: boolean) => {
    if (submitting.current) return;
    if (!userConfirmed) {
      setRunMessage("Please confirm the scenario before saving or running.");
      return;
    }
    const chosenModel = selectableModels.find((m) => m.id === modelId);
    const effectiveSnapshotId = chosenModel?.snapshotId || snapshotId;
    if (!chosenModel || !effectiveSnapshotId || !steps.length) {
      setRunMessage("Select an analyzed model and at least one request.");
      return;
    }
    if (
      steps.some(
        (step) =>
          !step.service ||
          !step.path.startsWith("/") ||
          step.path.startsWith("//") ||
          /[\r\n]/.test(step.path) ||
          !/^\d{3}$/.test(step.status) ||
          Number(step.status) < 100 ||
          Number(step.status) > 599,
      )
    ) {
      setRunMessage("Complete request services, paths, parameter values and expected status codes.");
      return;
    }
    let activeConfigRevision = config.data?.revision ?? 0;
    if (
      approveAndDispatch &&
      (!config.data?.ready ||
        config.data.modelId !== chosenModel.id ||
        config.data.snapshotId !== effectiveSnapshotId)
    ) {
      try {
        setRunMessage("Synchronizing and pinning Step 1 configuration for the selected Snapshot/Model...");
        const rawProf = (config.data?.profile ?? {}) as Record<string, unknown>;
        const pinned = await autoSaveConfig.mutateAsync({
          projectId,
          profileId: config.data?.profileId || "SPRING_BOOT_DOTNET_COMPOSE_V1",
          snapshotId: effectiveSnapshotId,
          modelId: chosenModel.id,
          profile: {
            serviceMappings:
              rawProf["serviceMappings"] && typeof rawProf["serviceMappings"] === "object"
                ? rawProf["serviceMappings"]
                : {},
            environmentVariables:
              rawProf["environmentVariables"] && typeof rawProf["environmentVariables"] === "object"
                ? rawProf["environmentVariables"]
                : {},
            secretReferences: Array.isArray(rawProf["secretReferences"])
              ? rawProf["secretReferences"]
              : [],
          },
          expectedRevision: activeConfigRevision,
        });
        activeConfigRevision = pinned.revision;
      } catch (pinErr) {
        setRunMessage(
          `Could not auto-save Step 1 configuration: ${pinErr instanceof Error ? pinErr.message : String(pinErr)}`,
        );
        return;
      }
    }
    const required = activeInputs;
    if (approveAndDispatch && required.length && !config.data?.protectedInputsReady) {
      setRunMessage(
        "Protected runtime inputs are not ready. An administrator must complete runtime setup.",
      );
      return;
    }
    if (approveAndDispatch && required.some((input) => !environment[input.name]?.trim())) {
      setRunMessage("Fill the required environment and test inputs before approval.");
      return;
    }
    if (
      approveAndDispatch &&
      required.some((input) => {
        if (input.kind !== "json") return false;
        try {
          JSON.parse(environment[input.name]!);
          return false;
        } catch {
          return true;
        }
      })
    ) {
      setRunMessage("A JSON test body is not valid JSON.");
      return;
    }
    const protectedValues = Object.fromEntries(
      required
        .filter((input) => environment[input.name] !== undefined)
        .map((input) => [input.name, environment[input.name]!]),
    );
    if (new TextEncoder().encode(JSON.stringify(protectedValues)).length > 65536) {
      setRunMessage("Runtime inputs exceed the supported size.");
      return;
    }
    const draft = {
      projectId,
      name: scenarioName.trim() || "Backend API smoke scenario",
      steps: steps.map((step, index) =>
        JSON.stringify({
          id: `step-${index + 1}`,
          service: step.service,
          method: step.method,
          path: step.path,
          expectedStatus: Number(step.status),
          ...(step.environmentVariables ? { environmentVariables: step.environmentVariables } : {}),
          ...(step.envHeaders ? { envHeaders: step.envHeaders } : {}),
          ...(step.bodyReference ? { bodyReference: step.bodyReference } : {}),
        }),
      ),
    };
    const fingerprint = JSON.stringify(draft);
    submitting.current = true;
    try {
      setRunMessage("Saving confirmed scenario...");
      const saved =
        persistedDraft.current?.fingerprint === fingerprint
          ? persistedDraft.current.scenario
          : await saveDraft.mutateAsync(draft);
      persistedDraft.current = { fingerprint, scenario: saved };
      if (!approveAndDispatch) {
        setRunMessage("✓ Scenario confirmed and saved without starting a runtime session.");
        return;
      }
      setRunMessage("Approving the confirmed scenario and dispatching execution...");
      const session = await start.mutateAsync({
        projectId,
        snapshotId: effectiveSnapshotId,
        modelId: chosenModel.id,
        scenarioId: saved.id,
        scenarioName: draft.name,
        configurationRevision: activeConfigRevision,
        scenarioRevision: saved.revision,
        approved: true,
        environment: protectedValues,
      });
      router.push(`/sessions?project=${projectId}&session=${session.id}`);
    } catch (error) {
      setRunMessage(
        `Request failed: ${error instanceof Error ? error.message : String(error)}. Check sessions before retrying an execution request.`,
      );
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <RuntimeStepperBanner currentStep={2} projectId={projectId} />

      <DetailPanel title="1. System + AI Auto-Generate Test Scenario">
        <p className="text-sm text-muted-foreground">
          Combines Step 1 static analysis (Services, Endpoints, Relationships, DB/Env) with AI to
          automatically propose an ordered HTTP test workflow before user confirmation.
        </p>

        <div className="mt-4 space-y-4">
          {(() => {
            const activeModel = selectableModels.find((m) => m.id === modelId) ?? selectableModels[0];
            const activeSnap =
              (snapshots.data ?? []).find((s) => s.id === (activeModel?.snapshotId || snapshotId)) ??
              snapshots.data?.[0];
            const revLabel = activeModel
              ? `${"label" in activeModel && activeModel.label ? activeModel.label : `Revision ${activeModel.revision}`}${activeModel.latest ? " (Latest)" : ""} · ${activeSnap ? activeSnap.name : activeModel.id.slice(0, 8)}`
              : activeSnap
                ? activeSnap.name
                : "Inheriting from Step 1...";
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Target revision (from Step 1):</span>
                  <span className="font-mono font-semibold text-foreground">{revLabel}</span>
                </div>
                <Link
                  href={`/runtime-config?project=${projectId}`}
                  className="text-primary hover:underline font-medium"
                >
                  ← Change in Step 1
                </Link>
              </div>
            );
          })()}

          <FormField
            label="AI Testing Goal (Optional)"
            hint="Example: Verify cross-service organization, department, and employee creation flow"
          >
            {(props) => (
              <div className="flex flex-wrap items-center gap-2.5">
                <Input
                  {...props}
                  className="flex-1 min-w-64"
                  placeholder="Enter a specific test objective or leave blank for comprehensive auto-generation..."
                  value={aiGoal}
                  onChange={(e) => setAiGoal(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 h-10"
                  disabled={!snapshotId || generateAiDraft.isPending}
                  onClick={() => {
                    edited.current = false;
                    triggerSystemAiGeneration(aiGoal);
                  }}
                >
                  {generateAiDraft.isPending
                    ? "✨ System + AI analyzing..."
                    : "✨ Regenerate Scenario with System + AI"}
                </Button>
              </div>
            )}
          </FormField>

          <div className="rounded-lg border p-3.5 bg-muted/30 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Scenario Proposal Source:</span>
                {generatorMode === "AI_ASSISTED" ? (
                  <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-semibold">
                    ✨ AI + System Generated ({aiModelName || "Gemini"})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-xs font-semibold">
                    ⚙️ System Static Analysis ({aiModelName || "Deterministic"})
                  </span>
                )}
              </div>
              {inheritedEnvKeys.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Inherited from Step 1:{" "}
                  <strong className="font-mono text-foreground">
                    {inheritedEnvKeys.length} Env/Secret vars ({inheritedEnvKeys.slice(0, 4).join(", ")}
                    {inheritedEnvKeys.length > 4 ? "..." : ""})
                  </strong>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {aiSummary ||
                "Requests are drafts synthesized from extracted endpoints and architecture relationships. Review and confirm below before running."}
            </p>
            {!config.data?.ready && (
              <p className="text-xs text-amber-600 font-medium">
                ⚠ Step 1 configuration is not saved or does not match the current Snapshot/Model.{" "}
                <Link className="underline" href={`/runtime-config?project=${projectId}`}>
                  Complete runtime prerequisites
                </Link>{" "}
                or click Confirm & Start Run below to auto-sync Step 1.
              </p>
            )}
          </div>
        </div>
      </DetailPanel>

      <DetailPanel title="2. Review & Customize Proposed Scenario Steps">
        <div className="space-y-4">
          <FormField label="Scenario Name">
            {(props) => (
              <Input
                {...props}
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            )}
          </FormField>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">
                  Proposed HTTP Sequence ({steps.length} step{steps.length === 1 ? "" : "s"})
                </h4>
                <p className="text-xs text-muted-foreground">
                  Edit the HTTP Method, Service, Path, or expected Status directly, or add/remove steps.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applySuggestions}
                  disabled={generateAiDraft.isPending}
                >
                  ↺ Reset to Default Proposal
                </Button>
                <Button size="sm" variant="outline" onClick={addStep}>
                  + Add HTTP Step
                </Button>
              </div>
            </div>

            {steps.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                No scenario steps yet. Click <strong>✨ Regenerate Scenario with System + AI</strong> or{" "}
                <strong>+ Add HTTP Step</strong> to start.
              </div>
            ) : (
              <div className="space-y-2.5">
                {steps.map((st, i) => (
                  <div key={i} className="rounded-lg border p-3 bg-muted/20 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono font-semibold">
                        #{i + 1}
                      </span>
                      <select
                        className={`h-8 rounded px-2 text-xs font-mono font-semibold ${httpMethodBadgeClass(st.method)}`}
                        value={st.method}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSteps((arr) =>
                            arr.map((item, idx) => (idx === i ? { ...item, method: val } : item)),
                          );
                        }}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                      <Input
                        className="w-36 font-mono text-xs h-8"
                        placeholder="Service"
                        value={st.service}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSteps((arr) =>
                            arr.map((item, idx) => (idx === i ? { ...item, service: val } : item)),
                          );
                        }}
                      />
                      <Input
                        className="flex-1 min-w-48 font-mono text-xs h-8"
                        placeholder="/api/path"
                        value={st.path}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSteps((arr) =>
                            arr.map((item, idx) => (idx === i ? { ...item, path: val } : item)),
                          );
                        }}
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input
                          className="w-16 font-mono text-xs h-8 text-center"
                          placeholder="200"
                          title="Expected HTTP Status"
                          value={st.status}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSteps((arr) =>
                              arr.map((item, idx) => (idx === i ? { ...item, status: val } : item)),
                            );
                          }}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive px-2 h-8"
                        onClick={() => removeStep(i)}
                      >
                        ✕
                      </Button>
                    </div>
                    {(st.rationale || st.source) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pl-1">
                        {st.rationale && <span>💡 {st.rationale}</span>}
                        {st.source && <span className="font-mono text-[11px]">Source: {st.source}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <section className="space-y-3 rounded-lg border p-3.5" aria-label="Environment and test inputs">
            <h3 className="text-sm font-semibold">
              Environment and test inputs (Path Params / Sample JSON Bodies)
            </h3>
            <p className="text-xs text-muted-foreground">
              System + AI pre-filled sample values for path parameters and JSON request bodies. Review
              or customize them before approval.
            </p>
            {activeInputs.length > 0 && (
              <FormField
                label="Import .env values"
                hint="Processed locally. Only inputs required by this draft are included when you approve."
              >
                {(props) => (
                  <Input
                    {...props}
                    type="file"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > 65536)
                          throw new Error("Environment file exceeds the supported size");
                        const parsed = parseRuntimeEnvFile(await file.text());
                        setEnvironment((current) => ({
                          ...current,
                          ...Object.fromEntries(
                            activeInputs
                              .filter((input) => Object.hasOwn(parsed, input.name))
                              .map((input) => [input.name, parsed[input.name]!]),
                          ),
                        }));
                        setRunMessage(
                          "Environment inputs imported. Review the generated scenario before approval.",
                        );
                      } catch (error) {
                        setRunMessage(
                          error instanceof Error
                            ? error.message
                            : "Could not import environment inputs",
                        );
                      } finally {
                        event.target.value = "";
                      }
                    }}
                  />
                )}
              </FormField>
            )}
            {activeInputs.map((input) => (
              <FormField key={input.name} label={input.label} hint={input.name}>
                {(props) =>
                  input.kind === "json" ? (
                    <Textarea
                      {...props}
                      className="font-mono text-xs"
                      value={environment[input.name] ?? ""}
                      onChange={(event) =>
                        setEnvironment((current) => ({
                          ...current,
                          [input.name]: event.target.value,
                        }))
                      }
                      autoComplete="off"
                    />
                  ) : (
                    <Input
                      {...props}
                      className="font-mono text-xs"
                      type={input.kind === "credential" ? "password" : "text"}
                      value={environment[input.name] ?? ""}
                      onChange={(event) =>
                        setEnvironment((current) => ({
                          ...current,
                          [input.name]: event.target.value,
                        }))
                      }
                      autoComplete="off"
                    />
                  )
                }
              </FormField>
            ))}
            {activeInputs.length > 0 && !config.data?.protectedInputsReady && (
              <p className="text-xs text-amber-600">
                An administrator must prepare protected runtime inputs before this draft can run.
              </p>
            )}
            {!activeInputs.length && (
              <p className="text-xs text-emerald-600 font-medium">
                ✓ No extra parameters are required for this scenario (environment variables and secrets from Step 1 are inherited automatically).
              </p>
            )}
            {automatic.blocked.map((message, index) => (
              <p className="text-xs text-muted-foreground" key={index}>
                {message}
              </p>
            ))}
          </section>
        </div>
      </DetailPanel>

      <DetailPanel title="3. User Confirmation & Execution Dispatch">
        <div className="space-y-4">
          <div className="rounded-lg border p-3.5 bg-muted/20 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-sm">Scenario Summary Awaiting Confirmation:</span>
              <span className="font-mono">
                {steps.length} HTTP steps · {inheritedEnvKeys.length} vars inherited from Step 1
              </span>
            </div>
            <ul className="space-y-1.5 font-mono text-muted-foreground">
              {steps.map((step, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span>{index + 1}.</span>
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${httpMethodBadgeClass(step.method)}`}>
                    {step.method}
                  </span>
                  <span className="text-foreground">
                    {step.service}
                    {step.path}
                  </span>
                  <span>→ Expected {step.status}</span>
                </li>
              ))}
            </ul>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer text-sm select-none">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border"
              checked={userConfirmed}
              onChange={(e) => setUserConfirmed(e.target.checked)}
            />
            <span>
              <strong>I confirm the test scenario above:</strong> Authorize MAVIS to save this approved
              scenario and launch containers in the isolated Docker Sandbox to capture OpenTelemetry traces.
            </span>
          </label>

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              disabled={
                !userConfirmed ||
                !modelId ||
                !steps.length ||
                activeInputs.some((input) => !environment[input.name]?.trim()) ||
                autoSaveConfig.isPending ||
                saveDraft.isPending ||
                start.isPending
              }
              onClick={() => handleCreateAndRun(true)}
            >
              {autoSaveConfig.isPending || start.isPending
                ? "Synchronizing & starting..."
                : "🚀 Confirm & Approve Run"}
            </Button>
            <Button
              variant="outline"
              disabled={
                !userConfirmed || !modelId || !steps.length || saveDraft.isPending || start.isPending
              }
              onClick={() => handleCreateAndRun(false)}
            >
              💾 Confirm & Save Scenario Without Running
            </Button>
          </div>

          {runMessage && <p className="text-sm font-medium text-primary mt-2">{runMessage}</p>}
        </div>
      </DetailPanel>

      <DetailPanel title="Saved Scenarios">
        <RequestState query={scenarios} empty={!scenarios.data?.length}>
          <div className="space-y-3">
            {scenarios.data?.map((sc) => {
              const parsedSteps = sc.steps
                .map((raw) => {
                  try {
                    const obj = JSON.parse(raw) as Record<string, unknown>;
                    return {
                      service: String(obj["service"] ?? defaultSvc),
                      method: String(obj["method"] ?? "GET").toUpperCase(),
                      path: String(obj["path"] ?? "/health"),
                      status: String(obj["expectedStatus"] ?? 200),
                      rationale: "Loaded from saved scenario",
                      source: `Saved Rev ${sc.revision}`,
                      ...(obj["environmentVariables"] && typeof obj["environmentVariables"] === "object"
                        ? { environmentVariables: obj["environmentVariables"] as Record<string, string> }
                        : {}),
                      ...(obj["bodyReference"] && typeof obj["bodyReference"] === "string"
                        ? { bodyReference: obj["bodyReference"] }
                        : {}),
                    } as RuntimeDraftStep;
                  } catch {
                    return null;
                  }
                })
                .filter((x): x is RuntimeDraftStep => x !== null);
              return (
                <div key={sc.id} className="rounded-lg border p-3.5 space-y-2.5 bg-muted/10">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div>
                      <span className="font-semibold text-sm">{sc.name}</span>
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-xs text-muted-foreground font-mono">
                        Revision {sc.revision} · {parsedSteps.length || sc.steps.length} steps
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setScenarioName(sc.name);
                          if (parsedSteps.length > 0) {
                            setSteps(parsedSteps);
                            persistedDraft.current = null;
                            setRunMessage(`✓ Loaded scenario "${sc.name}" (Revision ${sc.revision}) into the editor.`);
                          }
                        }}
                      >
                        📥 Load into Editor
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedSteps.length > 0
                      ? parsedSteps.map((st, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-background font-mono text-xs"
                          >
                            <span className="text-muted-foreground">#{idx + 1}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${httpMethodBadgeClass(st.method)}`}>
                              {st.method}
                            </span>
                            <span>
                              {st.service}
                              {st.path}
                            </span>
                            <span className="text-muted-foreground">→ {st.status}</span>
                          </span>
                        ))
                      : sc.steps.map((st, idx) => (
                          <span key={idx} className="font-mono text-xs text-muted-foreground">
                            {st}
                          </span>
                        ))}
                  </div>
                </div>
              );
            })}
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

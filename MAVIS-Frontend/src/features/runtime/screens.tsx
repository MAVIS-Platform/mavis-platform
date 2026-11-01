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
import {
  suggestRuntimeScenarios,
  automaticRuntimeDraft,
  toServiceEnvPrefix,
  boundRuntimeEnvironment,
  resolveRuntimeTargetModel,
  type RuntimeDraftStep,
  type RuntimeInput,
} from "./scenario-suggestions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApi, useApiMutation, useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { RequestState, ErrorState, EmptyState } from "@/components/shared/request-state";
import { ConfirmDialog, FormField, SelectField } from "@/components/shared/forms";
import { DetailPanel, StatusBadge } from "@/components/shared/data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function httpMethodBadgeClass(method: string): string {
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

export interface Step1Draft {
  modelId?: string;
  snapshotId?: string;
  profileId?: string;
  serviceMappings?: Record<string, string>;
  serviceRoles?: Record<string, "APP" | "INFRA">;
  serviceImageOverrides?: Record<string, string>;
  envVars?: Record<string, string>;
  secretValues?: Record<string, string>;
  secretReferences?: string[];
  dismissedSecretKeys?: string[];
  savedRevision?: number;
  plannedSnapshotId?: string;
  scenarioName?: string;
  plannedSteps?: RuntimeDraftStep[];
  plannedInputs?: Record<string, string>;
}

// shortcut: secrets are lost on full page reload, upgrade to a server-side draft if users complain.
const secretDrafts = new Map<string, Record<string, string>>();

export function readStep1Target(projectId: string): Step1Draft {
  const secretValues = secretDrafts.get(projectId);
  try {
    const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(`mavis:runtime-target:${projectId}`) : null;
    const parsed = raw ? (JSON.parse(raw) as Step1Draft) : {};
    const draft = parsed && typeof parsed === "object" ? { ...parsed } : {};
    delete draft.secretValues;
    return secretValues ? { ...draft, secretValues } : draft;
  } catch {
    return secretValues ? { secretValues } : {};
  }
}

export function writeStep1Target(projectId: string, draft: Step1Draft) {
  try {
    if (typeof window !== "undefined" && projectId) {
      const { secretValues, ...rest } = { ...readStep1Target(projectId), ...draft };
      if (secretValues) secretDrafts.set(projectId, secretValues);
      window.sessionStorage.setItem(`mavis:runtime-target:${projectId}`, JSON.stringify(rest));
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
  const buildImages = useApiMutation("buildRuntimeSandboxImages");

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
  const [showMappingInputs, setShowMappingInputs] = useState(false);
  const [showEnvInputs, setShowEnvInputs] = useState(false);
  const [showSecretOverrides, setShowSecretOverrides] = useState(false);
  const [serviceRoles, setServiceRoles] = useState<Record<string, "APP" | "INFRA">>({});
  const [serviceImageOverrides, setServiceImageOverrides] = useState<Record<string, string>>({});
  const [showSandboxCompose, setShowSandboxCompose] = useState(false);
  const [step1StatusMsg, setStep1StatusMsg] = useState("");

  useEffect(() => {
    if (preflight.data?.recommendedProfile) {
      setProfileId(preflight.data.recommendedProfile);
    } else if (config.data?.profileId) {
      setProfileId(config.data.profileId);
    }
  }, [preflight.data?.recommendedProfile, config.data?.profileId]);

  useEffect(() => {
    const stored = readStep1Target(projectId);
    const allModels = models.data ?? [];
    const candidateModels = staticModels.length ? staticModels : allModels;
    const preferredModel = resolveRuntimeTargetModel(allModels, stored.modelId, config.data?.modelId);
    if (preferredModel) {
      const activeModel =
        (modelId ? candidateModels.find((m) => m.id === modelId) : undefined) ?? preferredModel;
      if (modelId !== activeModel.id) setModelId(activeModel.id);
      if (activeModel.snapshotId && snapshotId !== activeModel.snapshotId) {
        setSnapshotId(activeModel.snapshotId);
      }
      return;
    }
    if (!snapshotId && snapshots.data?.length) {
      const preferredSnapId =
        (stored.snapshotId && snapshots.data.some((s) => s.id === stored.snapshotId) ? stored.snapshotId : "") ||
        config.data?.snapshotId ||
        snapshots.data[0]?.id;
      if (preferredSnapId) setSnapshotId(preferredSnapId);
    }
  }, [projectId, snapshots.data, config.data?.snapshotId, config.data?.modelId, models.data, staticModels.length, snapshotId, modelId]);

  useEffect(() => {
    const stored = readStep1Target(projectId);
    if (stored.serviceMappings && Object.keys(stored.serviceMappings).length > 0) {
      setServiceMappings((prev) => ({ ...stored.serviceMappings, ...prev }));
    }
    if (stored.envVars && Object.keys(stored.envVars).length > 0) {
      setEnvVars((prev) => ({ ...stored.envVars, ...prev }));
    }
    if (stored.secretValues && Object.keys(stored.secretValues).length > 0) {
      setSecretValues((prev) => ({ ...stored.secretValues, ...prev }));
    }
    if (stored.dismissedSecretKeys && stored.dismissedSecretKeys.length > 0) {
      setDismissedSecretKeys((prev) => Array.from(new Set([...prev, ...stored.dismissedSecretKeys!])));
    }
    if (stored.serviceRoles && Object.keys(stored.serviceRoles).length > 0) {
      setServiceRoles((prev) => ({ ...stored.serviceRoles, ...prev }));
    }
    if (stored.serviceImageOverrides && Object.keys(stored.serviceImageOverrides).length > 0) {
      setServiceImageOverrides((prev) => ({ ...stored.serviceImageOverrides, ...prev }));
    }
  }, [projectId]);

  useEffect(() => {
    if (modelId || snapshotId) {
      writeStep1Target(projectId, {
        modelId,
        snapshotId,
        profileId,
        serviceMappings,
        serviceRoles,
        serviceImageOverrides,
        envVars,
        secretValues,
        dismissedSecretKeys,
      });
    }
  }, [projectId, modelId, snapshotId, profileId, serviceMappings, serviceRoles, serviceImageOverrides, envVars, secretValues, dismissedSecretKeys]);

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
          services?: string[];
          category?: string;
          defaultValue?: string | null;
          required?: boolean;
          source?: string;
          scope?: string | null;
          defaultPresent?: boolean;
          resolution?: string | null;
        }>)
      : []);
  const stringList = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const stringMap = (value: unknown): Record<string, string> =>
    typeof value === "object" && value !== null ? (value as Record<string, string>) : {};
  const runnerIssues = preflight.data?.runnerIssues ?? stringList(rawProfile["runnerIssues"]);
  const infrastructureServices = preflight.data?.infrastructureServices ?? stringList(rawProfile["infrastructureServices"]);
  const serviceHealthPaths = preflight.data?.serviceHealthPaths ?? stringMap(rawProfile["serviceHealthPaths"]);
  const serviceHealthConfidence = preflight.data?.serviceHealthConfidence ?? stringMap(rawProfile["serviceHealthConfidence"]);
  const serviceHealthReasons = preflight.data?.serviceHealthReasons ?? stringMap(rawProfile["serviceHealthReasons"]);
  const sandboxComposeYaml =
    preflight.data?.sandboxComposeYaml ??
    (typeof rawProfile["sandboxComposeYaml"] === "string" ? rawProfile["sandboxComposeYaml"] : "");
  const sandboxComposeChanges =
    preflight.data?.sandboxComposeChanges ?? stringList(rawProfile["sandboxComposeChanges"]);
  const unresolvableRunnerIssues =
    preflight.data?.unresolvableRunnerIssues ?? stringList(rawProfile["unresolvableRunnerIssues"]);
  const recommendedServiceMappings =
    preflight.data?.recommendedServiceMappings ?? stringMap(rawProfile["recommendedServiceMappings"]);
  const modelServiceNames =
    preflight.data?.modelServiceNames ?? stringMap(rawProfile["modelServiceNames"]);
  const localImageBuildAvailable =
    preflight.data?.localImageBuildAvailable ?? Boolean(rawProfile["localImageBuildAvailable"]);

  useEffect(() => {
    if (rawProfile && typeof rawProfile["serviceMappings"] === "object" && rawProfile["serviceMappings"] !== null) {
      setServiceMappings((prev) => ({
        ...(rawProfile["serviceMappings"] as Record<string, string>),
        ...prev,
      }));
    }
    if (rawProfile && typeof rawProfile["serviceRoles"] === "object" && rawProfile["serviceRoles"] !== null) {
      setServiceRoles((prev) => ({
        ...(rawProfile["serviceRoles"] as Record<string, "APP" | "INFRA">),
        ...prev,
      }));
    }
    if (rawProfile && typeof rawProfile["serviceImageOverrides"] === "object" && rawProfile["serviceImageOverrides"] !== null) {
      setServiceImageOverrides((prev) => ({
        ...(rawProfile["serviceImageOverrides"] as Record<string, string>),
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
          const rec = recommendedServiceMappings[s];
          const cur = next[s];
          if (!cur || (rec && cur === s && cur !== rec)) {
            next[s] = rec || s;
          }
        }
        return next;
      });
    }
  }, [activeServices.join(","), JSON.stringify(recommendedServiceMappings)]);

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
      return next;
    });
  }, [detectedVarSignature, databaseChecks.length, snapshotId]);

  const hasSpecificDbVars = requiredEnvVars.some(
    (v) =>
      v.name !== "DB_CONNECTION_STRING" &&
      (v.name.toUpperCase().startsWith("DB_") || v.name.toUpperCase().includes("DATASOURCE")),
  );

  const autoDetectedSecretKeys = Array.from(
    new Set([
      ...requiredEnvVars
        .filter((v) => v.category === "DB_SECRET" || v.category === "SECRET")
        .filter((v) => !(v.name === "DB_CONNECTION_STRING" && hasSpecificDbVars))
        .map((v) => v.name),
    ]),
  );

  const allSecretKeys = Array.from(
    new Set([
      ...autoDetectedSecretKeys,
      ...configuredSecretKeys,
      ...Object.keys(secretValues).filter((k) => !(k === "DB_CONNECTION_STRING" && hasSpecificDbVars)),
    ]),
  ).filter((k) => !dismissedSecretKeys.includes(k));

  const isExternalSecretName = (name: string) =>
    /OPENAI|GEMINI|ANTHROPIC|CLAUDE|AZURE|AWS_|GOOGLE|GCP|STRIPE|PAYPAL|TWILIO|SENDGRID|MAILGUN|SMTP|MAIL_|SLACK|GITHUB|DISCORD|FIREBASE|CLOUDINARY|S3_|MAPS|OAUTH|CLIENT_SECRET|API_KEY|APIKEY|ACCESS_KEY|DASHSCOPE|HUGGINGFACE|DEEPSEEK|MISTRAL|COHERE/i.test(
      name,
    );

  // Backend `resolution` decides what the sandbox provides; the name regex only covers profiles saved before it existed.
  const externalSecretKeys = allSecretKeys.filter((k) => {
    const meta = requiredEnvVars.find((r) => r.name === k);
    if (!meta || configuredSecretKeys.includes(k)) return true;
    if (meta.resolution) return meta.resolution === "USER_REQUIRED";
    const effectiveScope = meta.scope ?? (isExternalSecretName(k) ? "EXTERNAL" : "SANDBOX");
    return effectiveScope === "EXTERNAL" && !meta.defaultPresent;
  });
  const autoSecretKeys = allSecretKeys.filter((k) => !externalSecretKeys.includes(k));
  const renderedSecretKeys = showSecretOverrides ? allSecretKeys : externalSecretKeys;

  const isInfraRole = (svc: string) =>
    serviceRoles[svc] ? serviceRoles[svc] === "INFRA" : infrastructureServices.includes(svc);
  const appServicesCount = activeServices.filter((s) => !isInfraRole(s)).length;
  const infraServicesCount = activeServices.filter((s) => isInfraRole(s)).length;

  const rawUnresolved =
    sandboxComposeChanges.length > 0 || Boolean(sandboxComposeYaml) ? unresolvableRunnerIssues : runnerIssues;
  const effectiveUnresolvedIssues = rawUnresolved.filter((issue) => {
    const m = /^Service '([^']+)' (?:uses build:|image |has no image)/.exec(issue);
    if (!m) return true;
    const svc = m[1] ?? "";
    const override = serviceImageOverrides[svc]?.trim() ?? "";
    return !/^(.+@)?sha256:[0-9a-fA-F]{64}$/.test(override);
  });
  const servicesNeedingImage = Array.from(
    new Set(
      rawUnresolved
        .map((issue) => /^Service '([^']+)' (?:uses build:|image |has no image)/.exec(issue)?.[1])
        .filter((s): s is string => Boolean(s)),
    ),
  );

  const resolveMappingLabel = (svc: string) => {
    const mapped = serviceMappings[svc] ?? recommendedServiceMappings[svc] ?? svc;
    return modelServiceNames[mapped] ?? mapped;
  };

  const handleBuildLocalImages = () => {
    setStep1StatusMsg("");
    buildImages.mutate(
      {
        projectId,
        ...(snapshotId ? { snapshotId } : {}),
        ...(servicesNeedingImage.length > 0 ? { services: servicesNeedingImage } : {}),
      },
      {
        onSuccess: (res) => {
          const count = Object.keys(res.builtImages).length;
          if (count > 0) {
            setServiceImageOverrides((prev) => ({ ...prev, ...res.builtImages }));
            if (snapshotId) {
              preflight.mutate({ projectId, snapshotId });
            }
          }
          if (res.errors.length > 0) {
            setStep1StatusMsg(res.errors.join("; "));
          } else {
            setStep1StatusMsg(`Built and digest-pinned ${count} sandbox image(s) from snapshot.`);
          }
        },
        onError: (err) => {
          setStep1StatusMsg(err instanceof Error ? err.message : String(err));
        },
      },
    );
  };

  const proceedToStep2 = async () => {
    const combinedSecretRefs = Array.from(
      new Set([
        ...secretRefs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        ...allSecretKeys,
      ]),
    ).filter((k) => !dismissedSecretKeys.includes(k));
    const candidateModels = staticModels.length ? staticModels : (models.data ?? []);
    const activeModel =
      candidateModels.find((m) => m.id === (modelId || defaultModelId)) ?? candidateModels[0];
    const effectiveModelId = activeModel?.id ?? "";
    const effectiveSnapshotId = activeModel?.snapshotId || snapshotId || snapshots.data?.[0]?.id || "";
    writeStep1Target(projectId, {
      modelId: effectiveModelId,
      snapshotId: effectiveSnapshotId,
      profileId,
      serviceMappings,
      serviceRoles,
      serviceImageOverrides,
      envVars,
      secretValues,
      secretReferences: combinedSecretRefs,
      dismissedSecretKeys,
    });
    if (effectiveModelId && effectiveSnapshotId) {
      try {
        setStep1StatusMsg("");
        const currentRev = Math.max(config.data?.revision ?? 0, readStep1Target(projectId).savedRevision ?? 0);
        const payload = {
          projectId,
          profileId,
          snapshotId: effectiveSnapshotId,
          modelId: effectiveModelId,
          profile: {
            serviceMappings,
            serviceRoles,
            serviceImageOverrides,
            environmentVariables: envVars,
            secretValues,
            secretReferences: combinedSecretRefs,
          },
        };
        let savedCfg: { revision: number };
        try {
          savedCfg = await save.mutateAsync({ ...payload, expectedRevision: currentRev });
        } catch (firstErr) {
          const refreshed = await config.refetch();
          if (refreshed.data?.revision !== undefined && refreshed.data.revision !== currentRev) {
            savedCfg = await save.mutateAsync({ ...payload, expectedRevision: refreshed.data.revision });
          } else {
            throw firstErr;
          }
        }
        writeStep1Target(projectId, { savedRevision: savedCfg.revision });
      } catch (err) {
        setStep1StatusMsg(
          `Could not persist Step 1 configuration: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }
    router.push(`/scenarios?project=${projectId}`);
  };

  const isPreflightSecure = preflight.data ? preflight.data.compatible : (config.data?.supported ?? true);

  return (
    <div className="space-y-6">
      <RuntimeStepperBanner currentStep={1} projectId={projectId} />

      {/* P3: One-Card Readiness Summary Banner with Immediate Continue CTA */}
      {(preflight.data || activeServices.length > 0) && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge
                status={
                  !isPreflightSecure
                    ? "Rejected"
                    : effectiveUnresolvedIssues.length
                      ? `Needs ${effectiveUnresolvedIssues.length} input(s)`
                      : sandboxComposeChanges.length > 0
                        ? "Ready (Auto-Remediated Compose)"
                        : "Ready for Sandbox Run"
                }
                variant={!isPreflightSecure ? "destructive" : effectiveUnresolvedIssues.length ? "warning" : "success"}
              />
              <span className="text-xs font-mono text-foreground font-semibold">
                {appServicesCount} app service(s)
                {infraServicesCount > 0 ? ` · ${infraServicesCount} infra` : ""} · {detectedEndpoints.length} endpoint(s) ·{" "}
                {databaseChecks.length} DB binding(s) · 0 required inputs
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {autoSecretKeys.length > 0
                ? `${autoSecretKeys.length} sandbox secret(s) (${autoSecretKeys.join(", ")}) are provided automatically per run.`
                : "All service mappings, ports, and readiness checks are configured automatically."}{" "}
              {externalSecretKeys.length > 0
                ? `${externalSecretKeys.length} external key(s) optional.`
                : ""}
            </p>
          </div>
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => void proceedToStep2()}>
            {save.isPending ? "Saving & Continuing..." : "Continue to Step 2: Test Scenarios →"}
          </Button>
        </div>
      )}
      {step1StatusMsg && (
        <div role="status" className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-foreground">
          {step1StatusMsg}
        </div>
      )}

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

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {preflight.isPending
                  ? "Inspecting source & Compose automatically..."
                  : "Preflight runs automatically for the selected revision."}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={!snapshotId || preflight.isPending}
                onClick={() => preflight.mutate({ projectId, snapshotId })}
              >
                ↻ Re-check
              </Button>
            </div>

            {preflight.isError && <ErrorState error={preflight.error} />}

            {(preflight.data || activeServices.length > 0) && (
              <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">Preflight Result:</span>
                    <StatusBadge
                      status={
                        !isPreflightSecure
                          ? "Rejected"
                          : effectiveUnresolvedIssues.length
                            ? `Needs changes (${effectiveUnresolvedIssues.length})`
                            : sandboxComposeChanges.length > 0
                              ? "Ready (Auto-Remediated)"
                              : "Ready for sandbox run"
                      }
                      variant={!isPreflightSecure ? "destructive" : effectiveUnresolvedIssues.length ? "warning" : "success"}
                    />
                  </div>
                  {(preflight.data?.recommendedProfile || config.data?.profileId) && (
                    <p className="text-xs text-muted-foreground">
                      <strong>Recommended Profile:</strong>{" "}
                      {preflight.data?.recommendedProfile ?? config.data?.profileId}
                    </p>
                  )}
                </div>

                {/* P4: Automatic Sandbox Compose Remediation Banner */}
                {sandboxComposeChanges.length > 0 && (
                  <div className="rounded border border-sky-500/30 bg-sky-500/5 p-3 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-sky-400">
                        ✨ Sandbox Compose Auto-Generated ({sandboxComposeChanges.length} automatic adjustments applied)
                      </span>
                      {sandboxComposeYaml && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px]"
                          onClick={() => setShowSandboxCompose((prev) => !prev)}
                        >
                          {showSandboxCompose ? "Hide Sandbox Compose" : "View Generated Sandbox Compose"}
                        </Button>
                      )}
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                      {sandboxComposeChanges.slice(0, 6).map((ch, idx) => (
                        <li key={idx}>{ch}</li>
                      ))}
                    </ul>
                    {showSandboxCompose && sandboxComposeYaml && (
                      <pre className="mt-2 max-h-48 overflow-auto rounded border bg-background/90 p-2 font-mono text-[11px] text-foreground">
                        {sandboxComposeYaml}
                      </pre>
                    )}
                  </div>
                )}

                {effectiveUnresolvedIssues.length > 0 && (
                  <div role="alert" className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2">
                    <p className="font-semibold text-amber-500">
                      The sandbox runner will reject this Compose file until these are fixed:
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5 text-amber-400">
                      {effectiveUnresolvedIssues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                    {servicesNeedingImage.length > 0 && (
                      <div className="pt-2 space-y-2 border-t border-amber-500/20">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground">
                            Provide a digest-pinned image for services using <code className="font-mono">build:</code> or unpinned tags:
                          </p>
                          {localImageBuildAvailable && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={buildImages.isPending}
                              onClick={handleBuildLocalImages}
                            >
                              {buildImages.isPending
                                ? "Building Sandbox Images..."
                                : "Build Sandbox Images from Snapshot"}
                            </Button>
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {servicesNeedingImage.map((svc) => (
                            <div key={svc} className="flex items-center gap-2">
                              <span className="w-32 font-mono text-[11px] truncate font-semibold" title={svc}>
                                {svc}
                              </span>
                              <Input
                                className="flex-1 font-mono text-xs h-8"
                                placeholder={`ghcr.io/org/${svc}@sha256:...`}
                                value={serviceImageOverrides[svc] ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setServiceImageOverrides((prev) => ({ ...prev, [svc]: val }));
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                                chosenDb.status === "AUTO_PROVISIONED_SANDBOX_DB" ||
                                chosenDb.status === "DETECTED_CONTAINER" ||
                                chosenDb.status === "CONFIGURED_IN_COMPOSE"
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : "bg-amber-500/10 text-amber-600"
                              }`}
                            >
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
                      {Array.from(
                        new Set([...(preflight.data?.securityWarnings ?? []), ...(config.data?.prerequisites ?? [])]),
                      ).map((w, i) => (
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
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">Service-to-Model Mapping (Auto-Matched by System & AI)</h4>
                <p className="text-xs text-muted-foreground">
                  Detected Docker Compose services are automatically bound to their corresponding Architecture Model containers.
                </p>
              </div>
              {activeServices.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowMappingInputs((prev) => !prev)}
                >
                  {showMappingInputs ? "Done Customizing" : "Customize Mapping"}
                </Button>
              )}
            </div>
            {activeServices.length ? (
              showMappingInputs ? (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  {activeServices.map((svc) => {
                    const currentVal = serviceMappings[svc] ?? recommendedServiceMappings[svc] ?? svc;
                    const modelEntries = Object.entries(modelServiceNames);
                    if (modelEntries.length > 0) {
                      const opts = modelEntries.map(([uuid, name]) => ({
                        value: uuid,
                        label: `${name} (${uuid.slice(0, 8)})`,
                      }));
                      if (currentVal && !opts.some((o) => o.value === currentVal)) {
                        opts.unshift({ value: currentVal, label: currentVal });
                      }
                      return (
                        <SelectField
                          key={svc}
                          label={`${svc} → Model Container`}
                          value={currentVal}
                          onChange={(val) => setServiceMappings((m) => ({ ...m, [svc]: val }))}
                          options={opts}
                        />
                      );
                    }
                    return (
                      <div key={svc} className="flex items-center gap-2">
                        <span className="w-32 font-mono text-xs truncate" title={svc}>
                          {svc}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <Input
                          className="flex-1 font-mono text-xs h-8"
                          placeholder="Model Element Name / ID"
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setServiceMappings((m) => ({ ...m, [svc]: val }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {activeServices.map((svc) => {
                    const infra = isInfraRole(svc);
                    const stack = (serviceStacks[svc] ?? "java").toLowerCase();
                    const nonInstrumented = !infra && stack !== "java" && stack !== "dotnet";
                    const confidence = serviceHealthConfidence[svc] ?? "DETECTED";
                    const reason = serviceHealthReasons[svc] ?? "Readiness probe path";
                    return infra ? (
                      <div
                        key={svc}
                        title="Started by Compose; not instrumented or health-checked"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-mono text-muted-foreground"
                      >
                        <span className="h-2 w-2 rounded-full bg-slate-500" />
                        <span className="font-semibold">{svc}</span>
                        <span>infrastructure</span>
                        <button
                          type="button"
                          className="ml-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-background text-foreground"
                          onClick={() => setServiceRoles((prev) => ({ ...prev, [svc]: "APP" }))}
                          title="Switch role to Application"
                        >
                          → App
                        </button>
                      </div>
                    ) : (
                      <div
                        key={svc}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-mono"
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="font-semibold text-foreground">{svc}</span>
                        <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {stack}
                        </span>
                        {servicePorts[svc] && (
                          <span className="text-muted-foreground">:{servicePorts[svc]}</span>
                        )}
                        <span className="text-emerald-400">➔</span>
                        <span className="text-emerald-400 font-semibold" title={serviceMappings[svc] ?? svc}>
                          {resolveMappingLabel(svc)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            confidence === "ASSUMED"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-emerald-500/15 text-emerald-400"
                          }`}
                          title={reason}
                        >
                          {confidence === "ASSUMED" ? "⚠" : "✓"} {serviceHealthPaths[svc] ?? "/health"}
                        </span>
                        {nonInstrumented && (
                          <span
                            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400"
                            title="No auto-instrumentation agent for this runtime stack; calls into this service are traced from callers only"
                          >
                            caller-traced
                          </span>
                        )}
                        <button
                          type="button"
                          className="ml-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-background text-muted-foreground"
                          onClick={() => setServiceRoles((prev) => ({ ...prev, [svc]: "INFRA" }))}
                          title="Mark as Infrastructure container (skip healthcheck & agent)"
                        >
                          → Infra
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
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
                  Secrets & API Keys ({externalSecretKeys.length} optional input · {autoSecretKeys.length} automatic)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Sandbox-internal secrets (JWT keys, database passwords) are generated for each run or reused from the
                  sandbox database container. External service keys are optional: the sandbox has no internet access.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                Auto-Detected: {allSecretKeys.length}
              </span>
            </div>

            {autoSecretKeys.length > 0 && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-500">
                    🔒 Provided automatically for the sandbox ({autoSecretKeys.length})
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowSecretOverrides((prev) => !prev)}
                  >
                    {showSecretOverrides ? "Hide overrides" : "Override values"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {autoSecretKeys.map((k) => {
                    const meta = requiredEnvVars.find((r) => r.name === k);
                    const ownersLabel =
                      meta?.services && meta.services.length > 0 ? meta.services.join(", ") : meta?.service;
                    return (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded border bg-background/80 px-2 py-0.5 font-mono text-[11px]"
                      >
                        <strong className="text-foreground">{k}</strong>
                        <span className="text-muted-foreground">
                          {meta?.resolution === "SANDBOX_INFRA"
                            ? "· from sandbox infrastructure"
                            : meta?.defaultPresent
                              ? "· default in source/compose"
                              : "· generated per run"}
                          {ownersLabel ? ` (${ownersLabel})` : ""}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {renderedSecretKeys.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {renderedSecretKeys.map((sKey) => {
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
                          {(meta?.services?.length ? meta.services.join(", ") : meta?.service) && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-mono truncate max-w-44"
                              title={meta?.services?.length ? meta.services.join(", ") : meta?.service}
                            >
                              {meta?.services?.length ? meta.services.join(", ") : meta?.service}
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
                No input needed: every detected secret is provided automatically. You can still add a custom value below.
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">
                  Environment Variables ({Object.keys(envVars).length} Auto-Configured)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Service URLs, ports, and runtime flags automatically extracted from Docker Compose and source configs.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setShowEnvInputs((prev) => !prev)}
              >
                {showEnvInputs ? "Hide Env Editor" : `Customize Env Vars (${Object.keys(envVars).length})`}
              </Button>
            </div>

            {!showEnvInputs ? (
              Object.keys(envVars).length > 0 ? (
                <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/20 p-2.5">
                  {Object.entries(envVars).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded border bg-background/80 px-2 py-0.5 font-mono text-[11px]"
                    >
                      <strong className="text-foreground">{k}</strong>
                      <span className="text-muted-foreground">=</span>
                      <span className="text-emerald-400 truncate max-w-44">{v || "(default)"}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No additional environment variables required.
                </p>
              )
            ) : (
              <div className="space-y-3">
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
            )}
          </div>
        </div>
      </DetailPanel>

      {/* Step 3: Execution Profile & Proceed to Step 2 */}
      <DetailPanel title="3. Execution Profile & Next Step">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Sandbox Execution Profile (Auto-selected from detected stack):
            </span>
            <span className="font-mono font-semibold">{profileId}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Your configuration and encrypted secrets are saved immediately when continuing to Step 2, so reloading or revisiting later preserves your setup.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={save.isPending} onClick={() => void proceedToStep2()}>
              {save.isPending ? "Saving & Continuing..." : "Continue to Step 2: Test Scenarios →"}
            </Button>
          </div>
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


function inferStepSampleBody(
  path: string,
  service: string,
  method: string,
  discovered?: Array<{ service?: string; method?: string; path?: string; sampleJsonBody?: string }>,
): string {
  const matched = (discovered ?? []).find(
    (ep) =>
      (!ep.service || ep.service === service) &&
      (ep.method ?? "POST").toUpperCase() === method.toUpperCase() &&
      ep.path === path &&
      ep.sampleJsonBody,
  );
  if (matched?.sampleJsonBody) return matched.sampleJsonBody;
  const lower = (path || "").toLowerCase();
  if (lower.includes("login") || lower.includes("signin")) {
    return '{"username":"alice","email":"alice@example.org","password":"SandboxPass123!"}';
  }
  if (lower.includes("register") || lower.includes("signup")) {
    return '{"name":"Alice","username":"alice","email":"alice@example.org","password":"SandboxPass123!"}';
  }
  if (lower.includes("employee")) {
    return '{"name":"Nguyen Van A","age":28,"position":"Developer","departmentId":1,"organizationId":1}';
  }
  if (lower.includes("department")) return '{"name":"Engineering","organizationId":1}';
  if (lower.includes("organization")) return '{"name":"MAVIS Corp","address":"Hanoi"}';
  if (lower.includes("status")) return '{"status":"COMPLETED"}';
  if (lower.includes("payment") || lower.includes("charge")) {
    return '{"orderId":1,"amount":1299.00,"paymentMethod":"CREDIT_CARD"}';
  }
  if (lower.includes("product") || lower.includes("catalog") || lower.includes("inventory") || lower.includes("item")) {
    return '{"code":"SKU-MOUSE-02","name":"Wireless Mouse","price":49.00,"stock":20,"quantity":1,"categoryId":1}';
  }
  if (lower.includes("user") || lower.includes("account") || lower.includes("customer")) {
    return '{"name":"Test User","email":"user@example.org"}';
  }
  if (lower.includes("order") || lower.includes("checkout")) {
    return '{"customerEmail":"alice@mavis.io","productCode":"SKU-LAPTOP-01","itemId":"item-1","quantity":1}';
  }
  return '{"name":"sample-entity","organizationId":1,"departmentId":1}';
}

function isValidJsonPayloadString(raw: string | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}

function RuntimeScenariosView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const snapshots = useApiQuery("snapshots", { projectId });
  const models = useApiQuery("modelVersions", { projectId });
  const scenarios = useApiQuery("scenarios", { projectId });
  const config = useApiQuery("runtimeConfiguration", { projectId });
  const start = useApiMutation("startRuntime");
  const saveDraft = useApiMutation("createScenario");
  const updateDraft = useApiMutation("saveScenario");
  const buildImages = useApiMutation("buildRuntimeSandboxImages");
  const generateAiDraft = useApiMutation("generateRuntimeScenario");
  const autoSaveConfig = useApiMutation("saveRuntimeConfiguration");
  const submitting = useRef(false);
  const autoGenTriggered = useRef<string>("");
  const restoredDraftRef = useRef(false);
  const persistedDraft = useRef<{ fingerprint: string; scenario: { id: string; revision: number } } | null>(null);

  const [snapshotId, setSnapshotId] = useState("");
  const [modelId, setModelId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const modelDetail = useApiQuery("model", { modelId }, { enabled: Boolean(modelId) });
  const realServices = (modelDetail.data?.elements ?? []).filter((e) => e.elementType === "SERVICE_CONTAINER");
  const detectedServiceNames = realServices.map((s) => s.name);

  const [generatedRunnableServices, setGeneratedRunnableServices] = useState<string[]>([]);
  const runnableServices = useMemo(() => {
    if (generatedRunnableServices.length > 0) return generatedRunnableServices;
    const rawProf = (config.data?.profile ?? {}) as Record<string, unknown>;
    const stored = readStep1Target(projectId);
    const roleMap: Record<string, string> = {
      ...(rawProf["serviceRoles"] && typeof rawProf["serviceRoles"] === "object"
        ? (rawProf["serviceRoles"] as Record<string, string>)
        : {}),
      ...(stored.serviceRoles ?? {}),
    };
    const infra = new Set<string>(
      Array.isArray(rawProf["infrastructureServices"])
        ? (rawProf["infrastructureServices"] as unknown[])
            .map(String)
            .filter((svc) => roleMap[svc]?.toUpperCase() !== "APP")
        : [],
    );
    for (const [svc, role] of Object.entries(roleMap)) {
      if (role?.toUpperCase() === "INFRA") infra.add(svc);
    }
    const composeList = Array.isArray(rawProf["composeServices"]) && rawProf["composeServices"].length > 0
      ? (rawProf["composeServices"] as unknown[]).map(String)
      : Array.isArray(rawProf["detectedServices"])
        ? (rawProf["detectedServices"] as unknown[]).map(String)
        : [];
    const filteredCompose = composeList.filter((s) => Boolean(s) && !infra.has(s));
    if (filteredCompose.length > 0) return filteredCompose;
    if (rawProf["applications"] && typeof rawProf["applications"] === "object") {
      const appKeys = Object.keys(rawProf["applications"] as Record<string, unknown>).filter((s) => !infra.has(s));
      if (appKeys.length > 0) return appKeys;
    }
    return detectedServiceNames;
  }, [generatedRunnableServices, config.data?.profile, projectId, detectedServiceNames]);

  const defaultSvc = runnableServices[0] ?? detectedServiceNames[0] ?? "gateway";

  const [scenarioName, setScenarioName] = useState("Auto-generated Architecture Verification Scenario");
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

  const discoveredEndpoints = useMemo(() => {
    const raw = (config.data?.profile as { detectedEndpoints?: Array<{ service?: string; method?: string; path?: string; source?: string; expectedStatus?: number; sampleJsonBody?: string }> } | undefined)?.detectedEndpoints;
    return Array.isArray(raw) ? raw : [];
  }, [config.data?.profile]);

  const step1Readiness = useMemo(() => {
    const rawProf = (config.data?.profile ?? {}) as Record<string, unknown>;
    const stored = readStep1Target(projectId);
    const overrides = {
      ...(rawProf["serviceImageOverrides"] && typeof rawProf["serviceImageOverrides"] === "object"
        ? (rawProf["serviceImageOverrides"] as Record<string, string>)
        : {}),
      ...(stored.serviceImageOverrides ?? {}),
    };
    const rawIssues = Array.isArray(rawProf["unresolvableRunnerIssues"])
      ? (rawProf["unresolvableRunnerIssues"] as unknown[]).map(String)
      : [];
    const remainingIssues = rawIssues.filter((issue) => {
      const m = /^Service '([^']+)' has no image/i.exec(issue);
      return !(m?.[1] && overrides[m[1]]?.trim());
    });
    const missingBuildServices = remainingIssues
      .map((issue) => /^Service '([^']+)' has no image/i.exec(issue)?.[1])
      .filter((s): s is string => Boolean(s));
    const localBuildAvailable = Boolean(rawProf["localImageBuildAvailable"]);
    const prerequisites = (config.data?.prerequisites ?? []).filter(
      (w) => w.includes("MAVIS_RUNNER_COLLECTOR_IMAGE") || w.includes("MAVIS_RUNTIME_ENVIRONMENT_KEY") || w.includes("Execution profile is disabled"),
    );
    return { remainingIssues, missingBuildServices, localBuildAvailable, prerequisites };
  }, [config.data?.profile, config.data?.prerequisites, projectId]);

  useEffect(() => {
    if (restoredDraftRef.current) return;
    const stored = readStep1Target(projectId);
    const matchesCurrentSnapshot =
      !stored.plannedSnapshotId || !stored.snapshotId || stored.plannedSnapshotId === stored.snapshotId;
    if (matchesCurrentSnapshot && stored.plannedSteps && stored.plannedSteps.length > 0) {
      restoredDraftRef.current = true;
      edited.current = true;
      setDraftSteps(stored.plannedSteps);
      if (stored.scenarioName) setScenarioName(stored.scenarioName);
      if (stored.plannedInputs && Object.keys(stored.plannedInputs).length > 0) {
        setEnvironment((prev) => ({ ...stored.plannedInputs, ...prev }));
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && steps.length > 0) {
      const referencedKeys = new Set<string>();
      for (const st of steps) {
        if (st.bodyReference) referencedKeys.add(st.bodyReference);
        if (st.environmentVariables) Object.values(st.environmentVariables).forEach((k) => referencedKeys.add(k));
        if (st.envHeaders) st.envHeaders.forEach((h) => referencedKeys.add(h.reference));
      }
      const plannedInputs = Object.fromEntries(
        Array.from(referencedKeys)
          .filter((k) => Boolean(environment[k]))
          .map((k) => [k, environment[k]!]),
      );
      writeStep1Target(projectId, {
        ...(snapshotId ? { plannedSnapshotId: snapshotId } : {}),
        scenarioName,
        plannedSteps: steps,
        plannedInputs,
      });
    }
  }, [projectId, snapshotId, scenarioName, steps, environment]);

  const staticModels = (models.data ?? []).filter(
    (m) => !("origin" in m) || (m as any).origin !== "RUNTIME_ENRICHED",
  );
  const selectableModels = staticModels.length > 0 ? staticModels : (models.data ?? []);

  useEffect(() => {
    const stored = readStep1Target(projectId);
    if (selectableModels.length > 0 && (!modelId || !selectableModels.some((m) => m.id === modelId))) {
      const preferred = resolveRuntimeTargetModel(models.data ?? [], stored.modelId, config.data?.modelId);
      if (preferred) {
        setModelId(preferred.id);
        if (preferred.snapshotId) {
          setSnapshotId(preferred.snapshotId);
        }
      }
      return;
    }
    if (!snapshotId) {
      if (stored.snapshotId && (snapshots.data ?? []).some((s) => s.id === stored.snapshotId)) {
        setSnapshotId(stored.snapshotId);
      } else if (config.data?.snapshotId) {
        setSnapshotId(config.data.snapshotId);
      }
    }
  }, [projectId, config.data?.modelId, config.data?.snapshotId, models.data, selectableModels, snapshots.data, modelId, snapshotId]);

  useEffect(() => {
    if (!snapshotId && snapshots.data?.length) {
      const newest = snapshots.data[0];
      if (newest) setSnapshotId(newest.id);
    }
  }, [snapshots.data, snapshotId]);

  useEffect(() => {
    const stored = readStep1Target(projectId);
    const rawProf = (config.data?.profile ?? {}) as Record<string, unknown>;
    const step1Env = {
      ...(rawProf["environmentVariables"] && typeof rawProf["environmentVariables"] === "object"
        ? (rawProf["environmentVariables"] as Record<string, unknown>)
        : {}),
      ...(stored.envVars ?? {}),
    };
    const step1Secrets = Array.from(
      new Set([
        ...(Array.isArray(rawProf["configuredSecretKeys"])
          ? (rawProf["configuredSecretKeys"] as unknown[]).map(String)
          : []),
        ...(stored.secretReferences ?? []),
        ...Object.entries(stored.secretValues ?? {})
          .filter(([, v]) => Boolean(v?.trim()))
          .map(([k]) => k),
      ]),
    );
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
  }, [projectId, config.data?.profile]);

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
          if (res.runnableServices?.length) {
            setGeneratedRunnableServices(res.runnableServices);
          }
          if (res.inheritedEnvKeys?.length) {
            setInheritedEnvKeys((prev) => Array.from(new Set([...prev, ...res.inheritedEnvKeys!])));
          }
          if (res.suggestedName) {
            setScenarioName(res.suggestedName);
          }
          if (res.steps && res.steps.length > 0) {
            const sampleMap = res.sampleInputs ?? {};
            const extraInputs: Record<string, string> = {};
            setDraftSteps(
              res.steps.map((st, idx) => {
                let resolvedPath = st.path;
                if (st.environmentVariables) {
                  for (const [alias, envName] of Object.entries(st.environmentVariables)) {
                    const val = sampleMap[envName] || "1";
                    resolvedPath = resolvedPath.replaceAll(`{{${alias}}}`, val);
                  }
                }
                resolvedPath = resolvedPath.replace(/\{\{V\d+\}\}/g, "1").replace(/\{([^}/]+)\}/g, (_, p: string) => {
                  const lower = p.toLowerCase();
                  if (lower.includes("uuid") || lower.includes("guid")) return "00000000-0000-0000-0000-000000000001";
                  return lower.includes("code") || lower.includes("sku") ? "SKU-LAPTOP-01" : "1";
                });
                const method = st.method.toUpperCase();
                const serviceKey = toServiceEnvPrefix(st.service);
                let bodyRef = st.bodyReference ?? undefined;
                if (["POST", "PUT", "PATCH"].includes(method)) {
                  bodyRef = bodyRef || `${serviceKey}_BODY_${idx + 1}`;
                  if (!sampleMap[bodyRef]) {
                    extraInputs[bodyRef] = inferStepSampleBody(resolvedPath, st.service, method, discoveredEndpoints);
                  }
                } else {
                  bodyRef = undefined;
                }
                return {
                  service: st.service,
                  method,
                  path: resolvedPath,
                  status: String(st.expectedStatus ?? 200),
                  rationale: st.rationale,
                  source: st.source,
                  allowClientError: st.allowClientError ?? true,
                  ...(st.envHeaders ? { envHeaders: st.envHeaders } : {}),
                  ...(bodyRef ? { bodyReference: bodyRef } : {}),
                };
              }),
            );
            setEnvironment((prev) => ({ ...prev, ...extraInputs, ...sampleMap }));
          } else if (res.sampleInputs) {
            setEnvironment((prev) => ({ ...prev, ...res.sampleInputs }));
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
        const sampleEnv: Record<string, string> = {};
        setDraftSteps(
          automatic.steps.map((st, idx) => {
            const cleanSvc = runnableServices.includes(st.service) ? st.service : (runnableServices[0] || st.service);
            const serviceKey = toServiceEnvPrefix(cleanSvc);
            const resolvedPath = st.path
              .replace(/\{\{V\d+\}\}/g, "1")
              .replace(/\{([^}/]+)\}/g, (_, p: string) =>
                p.toLowerCase().includes("code") || p.toLowerCase().includes("sku") ? "SKU-LAPTOP-01" : "1",
              );
            let bodyRef = st.bodyReference;
            if (["POST", "PUT", "PATCH"].includes(st.method)) {
              bodyRef = bodyRef || `${serviceKey}_BODY_${idx + 1}`;
              sampleEnv[bodyRef] = inferStepSampleBody(resolvedPath, cleanSvc, st.method, discoveredEndpoints);
            }
            const { environmentVariables: _droppedVars, ...restStep } = st;
            return {
              ...restStep,
              service: cleanSvc,
              path: resolvedPath,
              allowClientError: st.allowClientError ?? true,
              ...(bodyRef ? { bodyReference: bodyRef } : {}),
            };
          }),
        );
        if (Object.keys(sampleEnv).length > 0) {
          setEnvironment((prev) => ({ ...sampleEnv, ...prev }));
        }
        return;
      }
      if (discoveredEndpoints.length > 0) {
        const sampleEnv: Record<string, string> = {};
        const nonHealth = discoveredEndpoints.filter(
          (ep) => !["/health", "/actuator/health", "/ready", "/readyz"].includes((ep.path || "").toLowerCase()),
        );
        const pool = nonHealth.length > 0 ? nonHealth : discoveredEndpoints;
        const synthesized = pool.slice(0, 8).map((ep, idx) => {
          const candidateSvc = (ep.service || "").replace(/-[0-9a-f]{7,40}$/i, "");
          const cleanSvc =
            (candidateSvc && runnableServices.includes(candidateSvc) ? candidateSvc : undefined) ||
            runnableServices[idx % Math.max(1, runnableServices.length)] ||
            defaultSvc ||
            "gateway";
          const serviceKey = toServiceEnvPrefix(cleanSvc);
          const method = (ep.method || "GET").toUpperCase();
          const rawPath = ep.path || "/health";
          const rewrittenPath = rawPath.replace(/\{([^}/]+)\}/g, (_, param: string) => {
            const lower = param.toLowerCase();
            if (lower.includes("uuid") || lower.includes("guid")) return "00000000-0000-0000-0000-000000000001";
            return lower.includes("code") || lower.includes("sku") ? "SKU-LAPTOP-01" : "1";
          });
          let bodyRef: string | undefined;
          if (["POST", "PUT", "PATCH"].includes(method)) {
            bodyRef = `${serviceKey}_BODY_${idx + 1}`;
            sampleEnv[bodyRef] =
              ep.sampleJsonBody || inferStepSampleBody(rewrittenPath, cleanSvc, method, discoveredEndpoints);
          }
          return {
            service: cleanSvc,
            method,
            path: rewrittenPath,
            status: String(ep.expectedStatus ?? 200),
            rationale: `Automatically extracted from Step 1 (${ep.source ?? "source snapshot"})`,
            source: ep.source ?? "Step 1 Preflight",
            allowClientError: true,
            ...(bodyRef ? { bodyReference: bodyRef } : {}),
          } as RuntimeDraftStep;
        });
        setDraftSteps(synthesized);
        if (Object.keys(sampleEnv).length > 0) {
          setEnvironment((prev) => ({ ...sampleEnv, ...prev }));
        }
      }
    }
  }, [automatic, discoveredEndpoints, runnableServices, defaultSvc]);

  const activeInputs = useMemo(() => {
    const map = new Map<string, RuntimeInput>();
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
      if (st.bodyReference && ["POST", "PUT", "PATCH"].includes(st.method) && !map.has(st.bodyReference)) {
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
  }, [steps, inheritedEnvKeys]);

  const applySuggestions = () => {
    setSelectedScenarioId("");
    edited.current = false;
    triggerSystemAiGeneration();
  };

  const loadSavedScenario = (savedItem: { id: string; name: string; steps: string[]; revision: number }) => {
    const parsedSteps: RuntimeDraftStep[] = [];
    const newEnv: Record<string, string> = {};
    savedItem.steps.forEach((rawStr, idx) => {
      try {
        const obj = JSON.parse(rawStr) as Record<string, unknown>;
        const method = String(obj["method"] ?? "GET").toUpperCase();
        const svc = String(obj["service"] ?? defaultSvc);
        const path = String(obj["path"] ?? "/health");
        const serviceKey = toServiceEnvPrefix(svc);
        let bodyRef = typeof obj["bodyReference"] === "string" ? obj["bodyReference"] : undefined;
        if (["POST", "PUT", "PATCH"].includes(method)) {
          bodyRef = bodyRef || `${serviceKey}_BODY_${idx + 1}`;
          if (!environment[bodyRef]) {
            newEnv[bodyRef] =
              typeof obj["jsonBody"] === "string" && isValidJsonPayloadString(obj["jsonBody"])
                ? obj["jsonBody"]
                : inferStepSampleBody(path, svc, method, discoveredEndpoints);
          }
        }
        const envHeaders = Array.isArray(obj["envHeaders"])
          ? (obj["envHeaders"] as Array<{ name: string; reference: string }>).filter(
              (h) => h && typeof h.name === "string" && typeof h.reference === "string",
            )
          : undefined;
        const envVars =
          obj["environmentVariables"] && typeof obj["environmentVariables"] === "object"
            ? (obj["environmentVariables"] as Record<string, string>)
            : undefined;
        parsedSteps.push({
          service: svc,
          method,
          path,
          status: String(obj["expectedStatus"] ?? 200),
          rationale: `Loaded from saved scenario "${savedItem.name}" (rev ${savedItem.revision})`,
          source: "Saved scenario",
          allowClientError: typeof obj["allowClientError"] === "boolean" ? obj["allowClientError"] : true,
          ...(envVars ? { environmentVariables: envVars } : {}),
          ...(envHeaders?.length ? { envHeaders } : {}),
          ...(bodyRef ? { bodyReference: bodyRef } : {}),
        });
      } catch {
        // Ignore malformed legacy step string
      }
    });
    if (parsedSteps.length > 0) {
      setSelectedScenarioId(savedItem.id);
      setScenarioName(savedItem.name);
      setSteps(parsedSteps);
      if (Object.keys(newEnv).length > 0) {
        setEnvironment((prev) => ({ ...newEnv, ...prev }));
      }
      persistedDraft.current = null;
      setRunMessage(`Loaded saved scenario "${savedItem.name}" (${parsedSteps.length} steps).`);
    }
  };

  const addStep = () => {
    setSteps((s) => [
      ...s,
      {
        service: defaultSvc,
        method: "GET",
        path: "/health",
        status: "200",
        rationale: "Custom HTTP test step added by user",
        source: "User defined",
        allowClientError: true,
      },
    ]);
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    setSteps((arr) => {
      const target = index + delta;
      if (target < 0 || target >= arr.length) return arr;
      const copy = [...arr];
      const [moved] = copy.splice(index, 1);
      if (moved) copy.splice(target, 0, moved);
      return copy;
    });
  };

  const updateStepMethod = (index: number, nextMethod: string) => {
    const upper = nextMethod.toUpperCase();
    let createdRef: string | undefined;
    let defaultBody: string | undefined;
    setSteps((arr) =>
      arr.map((item, idx) => {
        if (idx !== index) return item;
        if (["POST", "PUT", "PATCH"].includes(upper)) {
          const serviceKey = toServiceEnvPrefix(item.service);
          const bodyRef = item.bodyReference || `${serviceKey}_BODY_${idx + 1}`;
          createdRef = bodyRef;
          defaultBody = inferStepSampleBody(item.path, item.service, upper, discoveredEndpoints);
          return { ...item, method: upper, bodyReference: bodyRef };
        }
        const { bodyReference: _removed, ...rest } = item;
        return { ...rest, method: upper };
      }),
    );
    if (createdRef && defaultBody) {
      const refKey = createdRef;
      const fallback = defaultBody;
      setEnvironment((prev) => (prev[refKey] ? prev : { ...prev, [refKey]: fallback }));
    }
  };

  const toggleStepAuthHeader = (index: number) => {
    let createdRef: string | undefined;
    setSteps((arr) =>
      arr.map((item, idx) => {
        if (idx !== index) return item;
        const hasAuth = item.envHeaders?.some((h) => h.name.toLowerCase() === "authorization");
        if (hasAuth) {
          const remaining = (item.envHeaders ?? []).filter((h) => h.name.toLowerCase() !== "authorization");
          const { envHeaders: _old, ...rest } = item;
          return remaining.length ? { ...rest, envHeaders: remaining } : rest;
        }
        const serviceKey = toServiceEnvPrefix(item.service);
        const ref = `${serviceKey}_AUTHORIZATION`;
        createdRef = ref;
        return {
          ...item,
          envHeaders: [...(item.envHeaders ?? []), { name: "Authorization", reference: ref }],
        };
      }),
    );
    if (createdRef) {
      const refKey = createdRef;
      setEnvironment((prev) => (prev[refKey] ? prev : { ...prev, [refKey]: "Bearer sandbox-verification-token" }));
    }
  };

  const removeStep = (index: number) => {
    setSteps((s) => s.filter((_, i) => i !== index));
  };

  const handleBuildMissingImagesInStep2 = async () => {
    const chosenModel = selectableModels.find((m) => m.id === modelId);
    const effectiveSnapshotId = chosenModel?.snapshotId || snapshotId;
    if (!effectiveSnapshotId) return;
    try {
      setRunMessage("🔨 Building local Docker images from snapshot Dockerfiles...");
      const res = await buildImages.mutateAsync({
        projectId,
        snapshotId: effectiveSnapshotId,
        services: step1Readiness.missingBuildServices.length ? step1Readiness.missingBuildServices : undefined,
      });
      if (Object.keys(res.builtImages).length > 0) {
        const stored = readStep1Target(projectId);
        writeStep1Target(projectId, {
          serviceImageOverrides: { ...(stored.serviceImageOverrides ?? {}), ...res.builtImages },
        });
        await config.refetch();
      }
      if (res.errors.length > 0) {
        setRunMessage(`Image build completed with warnings: ${res.errors.join("; ")}`);
      } else {
        setRunMessage(`✓ Built & pinned ${Object.keys(res.builtImages).length} sandbox image(s). Ready to run!`);
      }
    } catch (err) {
      setRunMessage(`Local image build failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
          step.path.includes("\\") ||
          /[\r\n]/.test(step.path) ||
          !/^\d{3}$/.test(step.status) ||
          Number(step.status) < 100 ||
          Number(step.status) > 599,
      )
    ) {
      setRunMessage("Complete request services, relative paths (starting with '/', no '\\'), and 3-digit status codes.");
      return;
    }
    let activeConfigRevision = Math.max(config.data?.revision ?? 0, readStep1Target(projectId).savedRevision ?? 0);
    if (approveAndDispatch) {
      try {
        let autoBuiltOverrides: Record<string, string> = {};
        if (step1Readiness.missingBuildServices.length > 0 && step1Readiness.localBuildAvailable) {
          setRunMessage(
            `🔨 Auto-building ${step1Readiness.missingBuildServices.length} local image(s) (${step1Readiness.missingBuildServices.join(", ")}) before launching...`,
          );
          const buildRes = await buildImages.mutateAsync({
            projectId,
            snapshotId: effectiveSnapshotId,
            services: step1Readiness.missingBuildServices,
          });
          autoBuiltOverrides = buildRes.builtImages ?? {};
          if (Object.keys(autoBuiltOverrides).length > 0) {
            const curStored = readStep1Target(projectId);
            writeStep1Target(projectId, {
              serviceImageOverrides: { ...(curStored.serviceImageOverrides ?? {}), ...autoBuiltOverrides },
            });
            const refreshed = await config.refetch();
            if (refreshed.data?.revision !== undefined) {
              activeConfigRevision = Math.max(activeConfigRevision, refreshed.data.revision);
            }
          }
        }
        setRunMessage("Saving complete Step 1 & Step 2 runtime configuration...");
        const stored = readStep1Target(projectId);
        const rawProf = (config.data?.profile ?? {}) as Record<string, unknown>;
        const mergedMappings = {
          ...(rawProf["serviceMappings"] && typeof rawProf["serviceMappings"] === "object"
            ? (rawProf["serviceMappings"] as Record<string, string>)
            : {}),
          ...(stored.serviceMappings ?? {}),
        };
        const mergedEnvVars = {
          ...(rawProf["environmentVariables"] && typeof rawProf["environmentVariables"] === "object"
            ? (rawProf["environmentVariables"] as Record<string, string>)
            : {}),
          ...(stored.envVars ?? {}),
        };
        const mergedSecretRefs = Array.from(
          new Set([
            ...(Array.isArray(rawProf["secretReferences"])
              ? (rawProf["secretReferences"] as unknown[]).map(String)
              : []),
            ...(stored.secretReferences ?? []),
            ...Object.keys(stored.secretValues ?? {}),
          ]),
        ).filter((k) => !(stored.dismissedSecretKeys ?? []).includes(k));
        const mergedRoles = {
          ...(rawProf["serviceRoles"] && typeof rawProf["serviceRoles"] === "object"
            ? (rawProf["serviceRoles"] as Record<string, "APP" | "INFRA">)
            : {}),
          ...(stored.serviceRoles ?? {}),
        };
        const mergedImageOverrides = {
          ...(rawProf["serviceImageOverrides"] && typeof rawProf["serviceImageOverrides"] === "object"
            ? (rawProf["serviceImageOverrides"] as Record<string, string>)
            : {}),
          ...(stored.serviceImageOverrides ?? {}),
          ...autoBuiltOverrides,
        };
        const configPayload = {
          projectId,
          profileId: stored.profileId || config.data?.profileId || "SPRING_BOOT_DOTNET_COMPOSE_V1",
          snapshotId: effectiveSnapshotId,
          modelId: chosenModel.id,
          profile: {
            serviceMappings: mergedMappings,
            serviceRoles: mergedRoles,
            serviceImageOverrides: mergedImageOverrides,
            environmentVariables: mergedEnvVars,
            secretValues: stored.secretValues ?? {},
            secretReferences: mergedSecretRefs,
          },
        };
        let pinned: { revision: number };
        try {
          pinned = await autoSaveConfig.mutateAsync({
            ...configPayload,
            expectedRevision: activeConfigRevision,
          });
        } catch (firstPinErr) {
          const refreshed = await config.refetch();
          if (refreshed.data?.revision !== undefined && refreshed.data.revision !== activeConfigRevision) {
            pinned = await autoSaveConfig.mutateAsync({
              ...configPayload,
              expectedRevision: refreshed.data.revision,
            });
          } else {
            throw firstPinErr;
          }
        }
        activeConfigRevision = pinned.revision;
        writeStep1Target(projectId, { savedRevision: pinned.revision });
      } catch (pinErr) {
        setRunMessage(
          `Could not save runtime configuration: ${pinErr instanceof Error ? pinErr.message : String(pinErr)}`,
        );
        return;
      }
    }
    const required = activeInputs;
    const defaultJsonPayload = '{"customerEmail":"alice@mavis.io","productCode":"SKU-LAPTOP-01","quantity":1}';
    if (
      required.some((input) => {
        if (input.kind !== "json") return false;
        return !isValidJsonPayloadString(environment[input.name] || defaultJsonPayload);
      })
    ) {
      setRunMessage("A JSON request body is not valid JSON. Fix or click Format on the highlighted payload.");
      return;
    }
    const protectedValues = Object.fromEntries(
      required.map((input) => [
        input.name,
        environment[input.name]?.trim() ||
          (input.kind === "json"
            ? defaultJsonPayload
            : input.kind === "credential"
              ? "Bearer sandbox-verification-token"
              : "1"),
      ]),
    );
    if (new TextEncoder().encode(JSON.stringify(protectedValues)).length > 65536) {
      setRunMessage("Runtime inputs exceed the supported size.");
      return;
    }
    const normalizedName = scenarioName.trim() || "Auto-generated Architecture Verification Scenario";
    const serializedSteps = steps.map((step, index) => {
      const isWrite = ["POST", "PUT", "PATCH"].includes(step.method);
      const serviceKey = toServiceEnvPrefix(step.service);
      const bodyRef = isWrite
        ? step.bodyReference && /^[A-Z][A-Z0-9_]{0,63}$/.test(step.bodyReference)
          ? step.bodyReference
          : `${serviceKey}_BODY_${index + 1}`
        : undefined;
      if (bodyRef && !protectedValues[bodyRef]) {
        protectedValues[bodyRef] =
          environment[bodyRef]?.trim() || inferStepSampleBody(step.path, step.service, step.method, discoveredEndpoints);
      }
      const normalizedPath = step.path.replace(/(?<!\{)\{([^{}/]+)\}(?!\})/g, (_, p: string) =>
        /uuid|guid/i.test(p) ? "00000000-0000-0000-0000-000000000001" : /code|sku/i.test(p) ? "SKU-LAPTOP-01" : "1",
      );
      return JSON.stringify({
        id: `step-${index + 1}`,
        service: step.service,
        method: step.method,
        path: normalizedPath,
        expectedStatus: Number(step.status),
        allowClientError: step.allowClientError !== false,
        ...(step.environmentVariables ? { environmentVariables: step.environmentVariables } : {}),
        ...(step.envHeaders?.length ? { envHeaders: step.envHeaders } : {}),
        ...(bodyRef ? { bodyReference: bodyRef } : {}),
      });
    });
    const boundedEnv = boundRuntimeEnvironment(protectedValues);
    const draft = {
      projectId,
      name: normalizedName,
      steps: serializedSteps,
    };
    const fingerprint = JSON.stringify(draft);
    submitting.current = true;
    try {
      setRunMessage("Saving confirmed scenario...");
      let saved: { id: string; revision: number };
      if (persistedDraft.current?.fingerprint === fingerprint) {
        saved = persistedDraft.current.scenario;
      } else {
        const existingScenario =
          (scenarios.data ?? []).find((sc) => sc.id === selectedScenarioId) ??
          (scenarios.data ?? []).find((sc) => sc.name.trim().toLowerCase() === normalizedName.toLowerCase());
        if (existingScenario && existingScenario.revision > 0) {
          try {
            saved = await updateDraft.mutateAsync({
              scenarioId: existingScenario.id,
              projectId,
              expectedRevision: existingScenario.revision,
              name: draft.name,
              steps: draft.steps,
            });
          } catch {
            saved = await saveDraft.mutateAsync(draft);
          }
        } else {
          saved = await saveDraft.mutateAsync(draft);
        }
        setSelectedScenarioId(saved.id);
      }
      persistedDraft.current = { fingerprint, scenario: saved };
      if (!approveAndDispatch) {
        setRunMessage(`✓ Scenario "${draft.name}" (rev ${saved.revision}) saved.`);
        return;
      }
      setRunMessage("Approving the confirmed scenario and dispatching execution...");
      const isEnrichedChoice =
        "origin" in chosenModel && (chosenModel as { origin?: string | null }).origin === "RUNTIME_ENRICHED";
      const session = await start.mutateAsync({
        projectId,
        snapshotId: effectiveSnapshotId,
        ...(!isEnrichedChoice ? { modelId: chosenModel.id } : {}),
        scenarioId: saved.id,
        scenarioName: draft.name,
        configurationRevision: activeConfigRevision,
        scenarioRevision: saved.revision,
        approved: true,
        ...(Object.keys(boundedEnv).length > 0 ? { environment: boundedEnv } : {}),
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

      {(step1Readiness.remainingIssues.length > 0 || step1Readiness.prerequisites.length > 0) && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-amber-400">
              ⚠️ Sandbox Readiness Check (from Step 1)
            </span>
            <div className="flex items-center gap-2">
              {step1Readiness.missingBuildServices.length > 0 && step1Readiness.localBuildAvailable && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-500/40"
                  disabled={buildImages.isPending}
                  onClick={handleBuildMissingImagesInStep2}
                >
                  {buildImages.isPending
                    ? "🔨 Building images..."
                    : `🔨 Build ${step1Readiness.missingBuildServices.length} Missing Image(s)`}
                </Button>
              )}
              <Link
                href={`/runtime-config?project=${projectId}`}
                className="text-amber-300 hover:underline font-medium"
              >
                Open Step 1 →
              </Link>
            </div>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-200/90">
            {step1Readiness.remainingIssues.map((iss, idx) => (
              <li key={`iss-${idx}`}>
                {iss}
                {step1Readiness.localBuildAvailable && /has no image/i.test(iss)
                  ? " (will auto-build from snapshot Dockerfile when you click Confirm & Run)"
                  : ""}
              </li>
            ))}
            {step1Readiness.prerequisites.map((preReq, idx) => (
              <li key={`pre-${idx}`}>{preReq}</li>
            ))}
          </ul>
        </div>
      )}

      <DetailPanel title="1. System + AI Auto-Generate Test Scenario">
        <p className="text-sm text-muted-foreground">
          Combines Step 1 static analysis (Runnable Compose Services, DTO Payloads, Causal CRUD Ordering, Relationships, DB/Env) with AI to
          automatically propose an ordered HTTP test workflow.
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Target revision (from Step 1):</span>
                  <span className="font-mono font-semibold text-foreground">{revLabel}</span>
                  {runnableServices.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[11px]">
                      {runnableServices.length} runnable app{runnableServices.length === 1 ? "" : "s"}: {runnableServices.join(", ")}
                    </span>
                  )}
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

          {(scenarios.data ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/15 px-3 py-2 text-xs">
              <span className="text-muted-foreground font-medium">Saved scenarios:</span>
              {(scenarios.data ?? []).slice(0, 8).map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => loadSavedScenario(sc)}
                  className={`px-2.5 py-1 rounded-md border font-mono transition ${
                    selectedScenarioId === sc.id
                      ? "border-primary bg-primary/15 text-primary font-semibold"
                      : "border-border bg-background hover:bg-muted/60 text-foreground"
                  }`}
                >
                  {sc.name} (v{sc.revision})
                </button>
              ))}
            </div>
          )}

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
                    setSelectedScenarioId("");
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
                "Requests are drafts synthesized from extracted endpoints, DTO schemas, and architecture relationships. Review and confirm below before running."}
            </p>
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

          {steps.length > 0 && (() => {
            const uniqueEntryServices = Array.from(new Set(steps.map((s) => s.service)));
            const rawProf = (config.data?.profile ?? {}) as Record<string, unknown>;
            const stored = readStep1Target(projectId);
            const mappings: Record<string, string> = {
              ...(rawProf["recommendedServiceMappings"] && typeof rawProf["recommendedServiceMappings"] === "object"
                ? (rawProf["recommendedServiceMappings"] as Record<string, string>)
                : {}),
              ...(rawProf["serviceMappings"] && typeof rawProf["serviceMappings"] === "object"
                ? (rawProf["serviceMappings"] as Record<string, string>)
                : {}),
              ...(stored.serviceMappings ?? {}),
            };
            const composeByElementId = new Map<string, string>();
            for (const el of modelDetail.data?.elements ?? []) {
              composeByElementId.set(el.id, el.name);
            }
            for (const [composeSvc, elId] of Object.entries(mappings)) {
              if (elId) composeByElementId.set(elId, composeSvc);
            }
            const knownRunnableOrModel = new Set([...runnableServices, ...detectedServiceNames]);
            const downstreamServices = Array.from(
              new Set(
                (modelDetail.data?.edges ?? [])
                  .filter((e) => uniqueEntryServices.includes(composeByElementId.get(e.from) ?? ""))
                  .map((e) => composeByElementId.get(e.to))
                  .filter(
                    (n): n is string =>
                      Boolean(n) && knownRunnableOrModel.has(n!) && !uniqueEntryServices.includes(n!),
                  ),
              ),
            );
            const allDetectedServices = [...uniqueEntryServices, ...downstreamServices];
            return (
              <div className="rounded-xl border border-primary/25 bg-slate-950/70 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    🕸️ Planned Workflow Preview (from model edges) ({steps.length} HTTP Calls → {allDetectedServices.length} Services)
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Live trace & sequence diagram will render in Step 3
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-mono font-bold text-sky-300">
                    ⚡ MAVIS Runner
                  </div>
                  <span className="text-sky-400 font-bold">──▶</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {uniqueEntryServices.map((entrySvc) => (
                      <div
                        key={entrySvc}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-mono font-semibold text-emerald-300"
                      >
                        🟢 {entrySvc}
                      </div>
                    ))}
                  </div>
                  {downstreamServices.length > 0 && (
                    <>
                      <span className="text-emerald-400 font-bold">──▶</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {downstreamServices.map((ds) => (
                          <div
                            key={ds}
                            className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-mono text-violet-300"
                          >
                            🔗 {ds}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">
                  Proposed HTTP Sequence ({steps.length} step{steps.length === 1 ? "" : "s"})
                </h4>
                <p className="text-xs text-muted-foreground">
                  Edit Method, Runnable Service, Path, Payload, or Status Mode (Trace 2xx–4xx vs Strict) directly.
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
                {steps.map((st, i) => {
                  const isWrite = ["POST", "PUT", "PATCH"].includes(st.method);
                  const serviceKey = (st.service || "SVC").replace(/[^A-Za-z0-9]/g, "_").toUpperCase().slice(0, 32) || "SVC";
                  const effectiveBodyRef = isWrite ? st.bodyReference || `${serviceKey}_BODY_${i + 1}` : undefined;
                  const payloadText = effectiveBodyRef
                    ? environment[effectiveBodyRef] ??
                      inferStepSampleBody(st.path, st.service, st.method, discoveredEndpoints)
                    : "";
                  const payloadValid = !isWrite || isValidJsonPayloadString(payloadText);
                  const authHeader = st.envHeaders?.find((h) => h.name.toLowerCase() === "authorization");
                  const serviceOptions = Array.from(new Set([...runnableServices, ...(st.service ? [st.service] : [])]));

                  return (
                    <div key={i} className="rounded-lg border p-3 bg-muted/20 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono font-semibold">
                          #{i + 1}
                        </span>
                        <div className="flex items-center">
                          <button
                            type="button"
                            title="Move step up"
                            disabled={i === 0}
                            onClick={() => moveStep(i, -1)}
                            className="px-1.5 h-7 text-xs rounded-l border bg-background hover:bg-muted disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            title="Move step down"
                            disabled={i === steps.length - 1}
                            onClick={() => moveStep(i, 1)}
                            className="px-1.5 h-7 text-xs rounded-r border-y border-r bg-background hover:bg-muted disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </div>
                        <select
                          className={`h-8 rounded px-2 text-xs font-mono font-semibold ${httpMethodBadgeClass(st.method)}`}
                          value={st.method}
                          onChange={(e) => updateStepMethod(i, e.target.value)}
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                          <option value="DELETE">DELETE</option>
                        </select>
                        {serviceOptions.length > 0 ? (
                          <select
                            className="h-8 rounded border bg-background px-2 font-mono text-xs min-w-36"
                            title="Runnable Compose Application Service"
                            value={st.service}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSteps((arr) =>
                                arr.map((item, idx) => (idx === i ? { ...item, service: val } : item)),
                              );
                            }}
                          >
                            {serviceOptions.map((svcOpt) => (
                              <option key={svcOpt} value={svcOpt}>
                                {svcOpt}
                              </option>
                            ))}
                          </select>
                        ) : (
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
                        )}
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
                          <button
                            type="button"
                            title={
                              st.allowClientError !== false
                                ? "Trace Mode (2xx–4xx pass & continue capturing spans; only 5xx/timeout fails). Click to require Strict exact status."
                                : "Strict Mode (must equal exact expected status code). Click to switch to resilient 2xx–4xx Trace Mode."
                            }
                            onClick={() =>
                              setSteps((arr) =>
                                arr.map((item, idx) =>
                                  idx === i ? { ...item, allowClientError: item.allowClientError === false } : item,
                                ),
                              )
                            }
                            className={`h-8 px-2 rounded border text-[11px] font-mono font-medium transition ${
                              st.allowClientError !== false
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                                : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {st.allowClientError !== false ? "2xx–4xx" : "Strict"}
                          </button>
                        </div>
                        <button
                          type="button"
                          title="Toggle encrypted Authorization header for this step"
                          onClick={() => toggleStepAuthHeader(i)}
                          className={`h-8 px-2 rounded border text-[11px] font-mono transition ${
                            authHeader
                              ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          🔑 Auth
                        </button>
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
                      {authHeader && (
                        <div className="flex items-center gap-2 pl-1 pt-0.5">
                          <span className="text-[11px] font-mono text-sky-400 shrink-0">
                            🔑 Authorization:
                          </span>
                          <Input
                            type="password"
                            className="h-7 font-mono text-xs flex-1"
                            placeholder="Bearer <jwt-or-token> (encrypted per-session)"
                            value={environment[authHeader.reference] ?? ""}
                            onChange={(e) => {
                              const refKey = authHeader.reference;
                              const val = e.target.value;
                              setEnvironment((prev) => ({ ...prev, [refKey]: val }));
                            }}
                          />
                        </div>
                      )}
                      {isWrite && effectiveBodyRef && (
                        <div className="flex flex-wrap items-center gap-2 pl-1 pt-0.5">
                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                            ✨ JSON Payload:
                          </span>
                          <Input
                            className={`h-7 font-mono text-xs flex-1 min-w-56 ${
                              payloadValid ? "" : "border-rose-500 focus-visible:ring-rose-500"
                            }`}
                            value={payloadText}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!st.bodyReference) {
                                setSteps((arr) =>
                                  arr.map((item, idx) =>
                                    idx === i ? { ...item, bodyReference: effectiveBodyRef } : item,
                                  ),
                                );
                              }
                              setEnvironment((prev) => ({ ...prev, [effectiveBodyRef]: val }));
                            }}
                          />
                          <span
                            className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                              payloadValid
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/15 text-rose-400 font-semibold"
                            }`}
                          >
                            {payloadValid ? "✓ JSON" : "⚠ Invalid"}
                          </span>
                          {payloadValid && (
                            <button
                              type="button"
                              className="text-[11px] font-mono px-2 py-0.5 rounded border bg-background hover:bg-muted"
                              onClick={() => {
                                try {
                                  const normalized = JSON.stringify(JSON.parse(payloadText));
                                  setEnvironment((prev) => ({ ...prev, [effectiveBodyRef]: normalized }));
                                } catch {
                                  // no-op
                                }
                              }}
                            >
                              Compact
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 px-3.5 py-2.5 text-xs text-emerald-500 font-medium">
            ✨ AI & System automatically synthesized URL path parameters, source-grounded DTO JSON payloads, and causal workflow ordering (Step 1 environment variables and secrets are inherited automatically).
          </div>
        </div>
      </DetailPanel>

      <DetailPanel title="3. User Confirmation & Execution Dispatch">
        <div className="space-y-4">
          <div className="rounded-lg border p-3.5 bg-muted/20 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-sm">Scenario Summary Ready for Execution:</span>
              <span className="font-mono">
                {steps.length} HTTP steps · {inheritedEnvKeys.length} vars inherited from Step 1
              </span>
            </div>
            <ul className="space-y-1.5 font-mono text-muted-foreground">
              {steps.map((step, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <span>{index + 1}.</span>
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${httpMethodBadgeClass(step.method)}`}>
                    {step.method}
                  </span>
                  <span className="text-foreground">
                    {step.service}
                    {step.path}
                  </span>
                  <span>
                    → Expected {step.status} ({step.allowClientError !== false ? "2xx–4xx Trace" : "Strict"})
                  </span>
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
              <strong>I confirm the test scenario above:</strong> Authorize MAVIS to save the complete
              runtime configuration and launch containers in Step 3 to capture OpenTelemetry traces.
            </span>
          </label>

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              disabled={
                !userConfirmed ||
                !modelId ||
                !steps.length ||
                buildImages.isPending ||
                autoSaveConfig.isPending ||
                saveDraft.isPending ||
                updateDraft.isPending ||
                start.isPending
              }
              onClick={() => handleCreateAndRun(true)}
            >
              {buildImages.isPending || autoSaveConfig.isPending || start.isPending
                ? "Saving & launching into Step 3..."
                : "🚀 Confirm & Run in Step 3"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                !userConfirmed ||
                !modelId ||
                !steps.length ||
                saveDraft.isPending ||
                updateDraft.isPending ||
                start.isPending
              }
              onClick={() => handleCreateAndRun(false)}
            >
              {saveDraft.isPending || updateDraft.isPending ? "Saving..." : "💾 Save Scenario Draft"}
            </Button>
          </div>

          {runMessage && <p className="text-sm font-medium text-primary mt-2">{runMessage}</p>}
        </div>
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

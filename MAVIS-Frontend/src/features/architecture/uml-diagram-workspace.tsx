"use client";
import { isActivityWorkflowEntry } from "./source-activity-workflow";
import { savedUmlCoversSource } from "./uml-source-coverage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/shared/forms";
import { DrawioEditor } from "./drawio-editor";
import { useUmlScopeState } from "./use-uml-scope-state";
import { SearchableThreeESelect } from "./three-e-searchable-select";
import {
  classifyApiFeatureCluster,
  type ApiFeatureClusterMeta,
} from "@/features/runtime/scenario-suggestions";
import {
  applyUmlAiEnrichment,
  buildUmlCompactContext,
  buildUmlDrawioXml,
  hydrateUmlWorkspaceFromXml,
  listActivityOperations,
  listStateTargets,
  projectObservedRuntimeActivityDiagram,
  projectUmlActivityDiagram,
  projectUmlClassDiagram,
  projectUmlDeploymentDiagram,
  projectUmlPackageDiagram,
  projectUmlStateDiagram,
  reconcileUmlDrawioXml,
  resolveUmlSelectionContext,
  type AnyUmlProjection,
  type UmlActivityOverlay,
  type UmlAiDiagramEnrichment,
  type UmlClassOverlay,
  type UmlDeploymentOverlay,
  type UmlDiagramKind,
  type UmlPackageOverlay,
  type UmlSelectionContext,
  type UmlStateOverlay,
} from "./uml-diagrams";
import type { DrawioTheme } from "@/lib/drawio/rules";
import { useLocale } from "@/lib/i18n/locale-context";

export function sanitizeDocumentViewId(raw: string): string {
  if (/^[a-zA-Z0-9:_-]{1,160}$/.test(raw)) return raw;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  const hashHex = (h >>> 0).toString(16).padStart(8, "0");
  const slug = raw.replace(/[^a-zA-Z0-9:_-]+/g, "_").replace(/^_+|_+$/g, "");
  return slug.slice(0, Math.max(8, 160 - 9)) + "_" + hashHex;
}

const clientUmlAiCache = new Map<string, UmlAiDiagramEnrichment>();

export function UmlDiagramWorkspace({
  model,
  kind,
  serviceId,
  selectedId,
  onSelect,
  onSelectUmlContext,
  theme: externalTheme,
  onThemeChange,
  requestedMode,
  requestedSessionId,
}: {
  model: ArchitecturalModel;
  kind: UmlDiagramKind;
  serviceId?: string | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectUmlContext?: ((ctx: UmlSelectionContext | null) => void) | undefined;
  theme?: DrawioTheme | undefined;
  onThemeChange?: ((theme: DrawioTheme) => void) | undefined;
  requestedMode?: string | null | undefined;
  requestedSessionId?: string | null | undefined;
}) {
  const { locale } = useLocale();
  const api = useApi();
  const cache = useQueryClient();
  const [internalTheme, setInternalTheme] = useState<DrawioTheme>(externalTheme ?? "clean");
  const theme = externalTheme ?? internalTheme;
  const handleThemeChange = (next: DrawioTheme) => {
    setInternalTheme(next);
    onThemeChange?.(next);
  };

  const hasRuntimeEvidence = useMemo(
    () =>
      model.edges.some(
        (e) => e.originLayer === "RUNTIME" || e.evidence.some((ev) => ev.kind === "runtime"),
      ),
    [model.edges],
  );
  const [activitySourceMode, setActivitySourceMode] = useState<"static" | "observed">(
    requestedMode === "observed" || Boolean(requestedSessionId) || hasRuntimeEvidence
      ? "observed"
      : "static",
  );
  const [selectedRuntimeSessionId, setSelectedRuntimeSessionId] = useState<string>(
    requestedSessionId ?? "",
  );
  const [selectedRuntimeTrace, setSelectedRuntimeTrace] = useState<string>("all");

  useEffect(() => {
    if (requestedMode === "observed" || Boolean(requestedSessionId)) {
      setActivitySourceMode("observed");
      if (requestedSessionId) setSelectedRuntimeSessionId(requestedSessionId);
    } else if (requestedMode === "static" || requestedMode === "designed") {
      setActivitySourceMode("static");
    }
  }, [requestedMode, requestedSessionId]);

  const runtimeSessions = useApiQuery(
    "runtimeReadSessions",
    { projectId: model.projectId },
    { enabled: kind === "UML_ACTIVITY" && activitySourceMode === "observed" },
  );
  const exactModelRuntimeSessions = useMemo(
    () =>
      (runtimeSessions.data ?? []).filter(
        (s) =>
          (s.modelId === model.id || s.enrichedModelId === model.id) &&
          (!s.snapshotId || s.snapshotId === model.snapshotId),
      ),
    [runtimeSessions.data, model.id, model.snapshotId],
  );
  const availableRuntimeSessions = useMemo(
    () =>
      exactModelRuntimeSessions.length > 0
        ? exactModelRuntimeSessions
        : (runtimeSessions.data ?? []).filter(
            (s) => s.executionStatus === "COMPLETED" || s.id === requestedSessionId,
          ),
    [exactModelRuntimeSessions, runtimeSessions.data, requestedSessionId],
  );
  const activeRuntimeSession =
    availableRuntimeSessions.find((s) => s.id === selectedRuntimeSessionId) ??
    availableRuntimeSessions.find((s) => s.id === requestedSessionId) ??
    availableRuntimeSessions[0];
  const runtimeSequence = useApiQuery(
    "runtimeSequence",
    { sessionId: activeRuntimeSession?.id ?? "" },
    {
      enabled:
        kind === "UML_ACTIVITY" &&
        activitySourceMode === "observed" &&
        Boolean(activeRuntimeSession),
    },
  );
  const runtimeRawSteps = runtimeSequence.data?.steps ?? [];
  const runtimeFeatureClusters = useMemo(() => {
    const byId = new Map<
      string,
      {
        meta: ApiFeatureClusterMeta;
        steps: typeof runtimeRawSteps;
      }
    >();
    for (const st of runtimeRawSteps) {
      const meta = classifyApiFeatureCluster(st.operation, st.callerService, st.calleeService);
      let entry = byId.get(meta.id);
      if (!entry) {
        entry = { meta, steps: [] };
        byId.set(meta.id, entry);
      }
      entry.steps.push(st);
    }
    return Array.from(byId.values()).sort((a, b) => a.meta.order - b.meta.order);
  }, [runtimeRawSteps]);
  const runtimeAllTraces = useMemo(
    () => [
      ...new Set(
        runtimeRawSteps
          .map((s) => (typeof s.traceId === "string" && s.traceId.trim() ? s.traceId.trim() : null))
          .filter((t): t is string => Boolean(t)),
      ),
    ],
    [runtimeRawSteps],
  );
  const chosenRuntimeTrace =
    selectedRuntimeTrace === "all" ||
    (selectedRuntimeTrace.startsWith("cluster:") &&
      runtimeFeatureClusters.some((c) => `cluster:${c.meta.id}` === selectedRuntimeTrace)) ||
    runtimeAllTraces.includes(selectedRuntimeTrace)
      ? selectedRuntimeTrace
      : "all";
  const runtimeTraceOptions = useMemo(() => {
    const totalCount = runtimeRawSteps.length;
    const opts: Array<{ value: string; label: string }> = [
      {
        value: "all",
        label: `Full End-to-End Scenario (${totalCount} observed call${totalCount === 1 ? "" : "s"})`,
      },
    ];
    runtimeFeatureClusters.forEach((cluster, cIdx) => {
      opts.push({
        value: `cluster:${cluster.meta.id}`,
        label: `Flow ${cIdx + 1}: ${cluster.meta.shortTitle} (${cluster.steps.length} call${cluster.steps.length === 1 ? "" : "s"})`,
      });
    });
    runtimeAllTraces.forEach((tid, idx) => {
      const matching = runtimeRawSteps.filter((s) => s.traceId === tid);
      const first = matching[0];
      if (first) {
        const stepNum = typeof first.stepOrder === "number" ? first.stepOrder : idx + 1;
        const method = first.httpMethod ? `${first.httpMethod.toUpperCase()} ` : "";
        const op = first.operation ?? "";
        const opText =
          method && !op.toUpperCase().startsWith(method.trim()) ? `${method}${op}` : op;
        const status =
          typeof first.httpStatusCode === "number" ? ` · HTTP ${first.httpStatusCode}` : "";
        const dur = typeof first.durationMs === "number" ? ` · ${first.durationMs}ms` : "";
        const extra = matching.length > 1 ? ` (+${matching.length - 1} downstream)` : "";
        opts.push({
          value: tid,
          label: `Step #${stepNum}: ${opText} → ${first.calleeService ?? "service"}${status}${dur}${extra}`,
        });
      } else {
        opts.push({ value: tid, label: `Step #${idx + 1} (${tid.slice(0, 8)})` });
      }
    });
    return opts;
  }, [runtimeRawSteps, runtimeFeatureClusters, runtimeAllTraces]);
  const effectiveRuntimeSteps = useMemo(() => {
    if (chosenRuntimeTrace.startsWith("cluster:")) {
      const cid = chosenRuntimeTrace.slice("cluster:".length);
      return runtimeFeatureClusters.find((c) => c.meta.id === cid)?.steps ?? runtimeRawSteps;
    }
    if (chosenRuntimeTrace !== "all") {
      return runtimeRawSteps.filter((s) => s.traceId === chosenRuntimeTrace);
    }
    return runtimeRawSteps;
  }, [chosenRuntimeTrace, runtimeFeatureClusters, runtimeRawSteps]);

  const [packageFilter, setPackageFilter] = useState<string>("");
  const [environmentFilter, setEnvironmentFilter] = useState<string>("default");
  const [activityView, setActivityView] = useState<"workflow" | "method" | "reference">("workflow");
  const [selectedOperationId, setSelectedOperationId] = useState<string>("");
  const [selectedStateTargetId, setSelectedStateTargetId] = useState<string>("");

  const activityOps = useMemo(() => listActivityOperations(model, { includeTechnical: activityView === "method" })
    .filter((operation) => activityView === "reference" ? operation.operationId.startsWith("flow:")
      : activityView === "workflow" ? isActivityWorkflowEntry(model, operation) : !operation.operationId.startsWith("flow:"))
    .map((operation) => activityView === "workflow" ? { ...operation, operationId: "workflow:" + operation.operationId } : operation), [model, activityView]);
  const stateTargets = useMemo(() => listStateTargets(model), [model]);

  const activeOpId = activityOps.find(op => op.operationId === selectedOperationId)?.operationId || activityOps[0]?.operationId || "";
  const activeStateTargetId = selectedStateTargetId || stateTargets[0]?.targetId || "";
  const observedActivityOpId = `flow:runtime:${activeRuntimeSession?.id ?? "none"}:${chosenRuntimeTrace}`;

  const viewKey = useMemo(() => {
    const rawKey =
      kind === "UML_CLASS"
        ? `uml-class:${serviceId || "all"}:${packageFilter || "all"}`
        : kind === "UML_PACKAGE"
          ? `uml-package:${serviceId || "all"}`
          : kind === "UML_DEPLOYMENT"
            ? `uml-deployment:${environmentFilter || "default"}`
            : kind === "UML_ACTIVITY"
              ? activitySourceMode === "observed"
                ? `uml-activity:observed:${activeRuntimeSession?.id || "none"}:${chosenRuntimeTrace}`
                : `uml-activity:${activeOpId || activityView + ":none"}`
              : `uml-state:${activeStateTargetId || "default"}`;
    return sanitizeDocumentViewId(rawKey);
  }, [
    kind,
    serviceId,
    packageFilter,
    environmentFilter,
    activeOpId,
    activeStateTargetId,
    activityView,
    activitySourceMode,
    activeRuntimeSession?.id,
    chosenRuntimeTrace,
  ]);

  const documentScope = `${model.id}:${viewKey}`;

  // Structured DESIGNED overlays per diagram kind (hydrated from saved XML if present)
  const [classOverlay, setClassOverlay] = useUmlScopeState<UmlClassOverlay>(documentScope, {
    designedClassifiers: [],
    designedRelations: [],
  });
  const [packageOverlay, setPackageOverlay] = useUmlScopeState<UmlPackageOverlay>(documentScope, {
    designedPackages: [],
    designedEdges: [],
  });
  const [deploymentOverlay, setDeploymentOverlay] = useUmlScopeState<UmlDeploymentOverlay>(documentScope, {
    designedNodes: [],
    designedEdges: [],
    includeStartupDependenciesOverlay: false,
  });
  const [activityOverlay, setActivityOverlay] = useUmlScopeState<UmlActivityOverlay>(documentScope, {
    designedNodes: [],
    designedEdges: [],
  });
  const [stateOverlay, setStateOverlay] = useUmlScopeState<UmlStateOverlay>(documentScope, {
    designedStates: [],
    designedTransitions: [],
  });

  const [preservedLayout, setPreservedLayout] = useUmlScopeState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >(documentScope, {});
  const [drawioDraftXml, setDrawioDraftXml] = useUmlScopeState<string | null>(documentScope, null);
  const [reconciledDraftProjection, setReconciledDraftProjection] =
    useUmlScopeState<AnyUmlProjection | null>(documentScope, null);

  const saved = useApiQuery(
    "architectureDocument",
    { modelId: model.id, viewId: viewKey },
    { enabled: api.mode === "backend" },
  );

  const lastHydratedKeyRef = useRef<string>("");

  useEffect(() => {
    const rev = saved.data?.revision ?? 0;
    const xml = saved.data?.xml ?? "";
    const hydrationKey = `${model.id}:${viewKey}:${rev}:${xml.length}`;
    if (lastHydratedKeyRef.current === hydrationKey) return;
    lastHydratedKeyRef.current = hydrationKey;

    if (!xml.trim()) {
      setPreservedLayout({});
      setDrawioDraftXml(null);
      setReconciledDraftProjection(null);
      return;
    }

    if (kind === "UML_CLASS") {
      const liveProj = projectUmlClassDiagram(model, {
        serviceId: serviceId || null,
        packageName: packageFilter || null,
      });
      const liveHasMembers = liveProj.classifiers.some(
        (c) => c.attributes.length > 0 || c.operations.length > 0,
      );
      const isLegacyUnenrichedXml =
        liveHasMembers &&
        xml.includes("&lt;hr size=&quot;1&quot;/&gt;&lt;i&gt;(no attributes)&lt;/i&gt;");
      if (isLegacyUnenrichedXml) {
        setPreservedLayout({});
        setDrawioDraftXml(null);
        setReconciledDraftProjection(null);
        return;
      }
    }

    const hydrated = hydrateUmlWorkspaceFromXml(xml, model, {
      diagramKind: kind,
      selectedServiceId: serviceId || null,
      selectedPackageName: packageFilter || null,
      selectedEnvironment: environmentFilter || "default",
      selectedOperationId: activeOpId || null,
      selectedTargetId: activeStateTargetId || null,
    });

    setClassOverlay(hydrated.classOverlay);
    setPackageOverlay(hydrated.packageOverlay);
    setDeploymentOverlay(hydrated.deploymentOverlay);
    setActivityOverlay(hydrated.activityOverlay);
    setStateOverlay(hydrated.stateOverlay);

    // If a saved UML_CLASS, UML_PACKAGE, UML_DEPLOYMENT, UML_ACTIVITY, or UML_STATE document predates the tree-v2 obstacle-routed layout, recompute clean positions
    const isPreTreeLayoutXml =
      hydrated.conflicts.length > 0 ||
      !savedUmlCoversSource(xml, hydrated.projection) ||
      !xml.includes('mavisLayoutMode="tree-v2"') ||
      (kind === "UML_PACKAGE" &&
        (xml.includes("(empty package)") ||
          (hydrated.projection.diagramKind === "UML_PACKAGE" &&
            hydrated.projection.edges.length > 0 &&
            !xml.includes("entryDy=")))) ||
      (kind === "UML_DEPLOYMENT" &&
        (xml.includes("direction=south") ||
          (hydrated.projection.diagramKind === "UML_DEPLOYMENT" &&
            hydrated.projection.edges.some((e) => e.edgeKind === "COMMUNICATION_PATH") &&
            !xml.includes('<Array as="points">')))) ||
      (kind === "UML_ACTIVITY" &&
        (!xml.includes('mavisActivityVersion="3"') ||
          (hydrated.projection.diagramKind === "UML_ACTIVITY" &&
            ((xml.match(/mavisUmlRole="activity-partition"/g) ?? []).length <
              hydrated.projection.partitions.length ||
              (hydrated.projection.nodes.some((n) => n.kind === "FLOW_FINAL") &&
                !xml.includes("shape=sumEllipse")) ||
              (/Kitchen Ticket|beginCancelTicket|acceptTicket|already cooking/i.test(xml) &&
                !model.elements.some((e) => /kitchen[-_ ]?service/i.test(e.name))))))) ||
      (kind === "UML_STATE" &&
        (!xml.includes('mavisStateVersion="2"') ||
          (hydrated.projection.diagramKind === "UML_STATE" &&
            hydrated.projection.transitions.length > 0 &&
            (!xml.includes('<Array as="points">') ||
              (hydrated.projection.transitions.some(
                (t) => Boolean(t.trigger || t.guard) && Boolean(t.guard || t.effect),
              ) &&
                !xml.includes("&#xa;")) ||
              (/TicketAcceptedEvent|verifyRestaurantMenu|releaseKitchenSlot/i.test(xml) &&
                !model.elements.some((e) => /kitchen[-_ ]?service/i.test(e.name)))))));

    setPreservedLayout(isPreTreeLayoutXml ? {} : hydrated.preservedLayout);
    setDrawioDraftXml(isPreTreeLayoutXml ? null : xml);
    setReconciledDraftProjection(isPreTreeLayoutXml ? null : hydrated.projection);
  }, [
    saved.data?.revision,
    saved.data?.xml,
    model,
    viewKey,
    kind,
    serviceId,
    packageFilter,
    environmentFilter,
    activeOpId,
    activeStateTargetId,
  ]);

  const clearDraftConflictState = () => {
    setDrawioDraftXml(null);
    setReconciledDraftProjection(null);
  };

  const baseProjection = useMemo(() => {
    switch (kind) {
      case "UML_CLASS":
        return projectUmlClassDiagram(model, {
          serviceId: serviceId || null,
          packageName: packageFilter || null,
          overlay: classOverlay,
        });
      case "UML_PACKAGE":
        return projectUmlPackageDiagram(model, {
          serviceId: serviceId || null,
          overlay: packageOverlay,
        });
      case "UML_DEPLOYMENT":
        return projectUmlDeploymentDiagram(model, {
          environment: environmentFilter || "default",
          overlay: deploymentOverlay,
        });
      case "UML_ACTIVITY":
        if (activitySourceMode === "observed") {
          const activeCluster = chosenRuntimeTrace.startsWith("cluster:")
            ? runtimeFeatureClusters.find(
                (c) => `cluster:${c.meta.id}` === chosenRuntimeTrace,
              )
            : null;
          const baseTitle = activeRuntimeSession?.scenarioName ?? "Observed Runtime Workflow";
          const effectiveTitle = activeCluster
            ? `${baseTitle} · ${activeCluster.meta.shortTitle}`
            : baseTitle;
          return projectObservedRuntimeActivityDiagram(model, effectiveRuntimeSteps, {
            operationId: observedActivityOpId,
            scenarioName: effectiveTitle,
            overlay: activityOverlay,
          });
        }
        return projectUmlActivityDiagram(model, {
          operationId: activeOpId || (activityView === "workflow" ? "workflow:none" : undefined),
          includeTechnical: activityView === "method",
          overlay: activityOverlay,
        });
      case "UML_STATE":
        return projectUmlStateDiagram(model, {
          targetId: activeStateTargetId,
          overlay: stateOverlay,
        });
    }
  }, [
    kind,
    model,
    serviceId,
    packageFilter,
    environmentFilter,
    activeOpId,
    activeStateTargetId,
    classOverlay,
    packageOverlay,
    deploymentOverlay,
    activityOverlay,
    activityView,
    activitySourceMode,
    chosenRuntimeTrace,
    runtimeFeatureClusters,
    activeRuntimeSession?.scenarioName,
    effectiveRuntimeSteps,
    observedActivityOpId,
    stateOverlay,
  ]);

  const compactUmlContext = useMemo(
    () => buildUmlCompactContext(model, baseProjection),
    [model, baseProjection],
  );

  const [umlAiEnrichment, setUmlAiEnrichment] = useUmlScopeState<UmlAiDiagramEnrichment | null>(documentScope, null);

  useEffect(() => {
    const cacheKey = `${compactUmlContext.contextHash}:${locale}`;
    const cached = clientUmlAiCache.get(cacheKey);
    if (cached) {
      setUmlAiEnrichment(cached);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/ai-diagram-semantics", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umlContext: compactUmlContext, locale }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { umlEnrichment?: UmlAiDiagramEnrichment } | null) => {
        if (cancelled || !data?.umlEnrichment) return;
        clientUmlAiCache.set(cacheKey, data.umlEnrichment);
        setUmlAiEnrichment(data.umlEnrichment);
      })
      .catch(() => {
        // fallback to deterministic projection
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [compactUmlContext, locale]);

  const projection = useMemo(
    () => applyUmlAiEnrichment(baseProjection, umlAiEnrichment),
    [baseProjection, umlAiEnrichment],
  );

  // Effective projection reflects the canvas at all times (including when a Draw.io draft has deleted or modified cells)
  const effectiveProjection: AnyUmlProjection = reconciledDraftProjection ?? projection;
  const stateMachineUnavailable = effectiveProjection.diagramKind === "UML_STATE" &&
    (effectiveProjection.states.length === 0 ||
      (effectiveProjection.enumOnlyNoTransitions && effectiveProjection.transitions.length === 0));

  const cleanGeneratedXml = useMemo(
    () =>
      buildUmlDrawioXml(
        projection,
        {},
        {
          selectedServiceId: serviceId || null,
          selectedPackageName: packageFilter || null,
          selectedEnvironment: environmentFilter || "default",
          selectedOperationId: activeOpId || null,
          selectedTargetId: activeStateTargetId || null,
          classOverlay,
          packageOverlay,
          deploymentOverlay,
          activityOverlay,
          stateOverlay,
          aiEnrichment: umlAiEnrichment,
        },
      ),
    [
      projection,
      serviceId,
      packageFilter,
      environmentFilter,
      activeOpId,
      activeStateTargetId,
      classOverlay,
      packageOverlay,
      deploymentOverlay,
      activityOverlay,
      stateOverlay,
      umlAiEnrichment,
    ],
  );

  const generatedXml = useMemo(
    () =>
      buildUmlDrawioXml(projection, preservedLayout, {
        selectedServiceId: serviceId || null,
        selectedPackageName: packageFilter || null,
        selectedEnvironment: environmentFilter || "default",
        selectedOperationId: activeOpId || null,
        selectedTargetId: activeStateTargetId || null,
        classOverlay,
        packageOverlay,
        deploymentOverlay,
        activityOverlay,
        stateOverlay,
        aiEnrichment: umlAiEnrichment,
      }),
    [
      projection,
      preservedLayout,
      serviceId,
      packageFilter,
      environmentFilter,
      activeOpId,
      activeStateTargetId,
      classOverlay,
      packageOverlay,
      deploymentOverlay,
      activityOverlay,
      stateOverlay,
      umlAiEnrichment,
    ],
  );

  const activeXml = drawioDraftXml ?? generatedXml;

  async function persistCurrentDiagramXml(xmlToSave: string) {
    const rt = reconcileUmlDrawioXml(xmlToSave, projection);
    const hydrated = hydrateUmlWorkspaceFromXml(xmlToSave, model, {
      diagramKind: kind,
      selectedServiceId: serviceId || null,
      selectedPackageName: packageFilter || null,
      selectedEnvironment: environmentFilter || "default",
      selectedOperationId: activeOpId || null,
      selectedTargetId: activeStateTargetId || null,
      aiEnrichment: umlAiEnrichment,
    });

    setClassOverlay(hydrated.classOverlay);
    setPackageOverlay(hydrated.packageOverlay);
    setDeploymentOverlay(hydrated.deploymentOverlay);
    setActivityOverlay(hydrated.activityOverlay);
    setStateOverlay(hydrated.stateOverlay);
    setPreservedLayout((prev) => ({
      ...prev,
      ...rt.preservedLayout,
      ...hydrated.preservedLayout,
    }));
    setDrawioDraftXml(xmlToSave);
    setReconciledDraftProjection(hydrated.projection);

    if (api.mode === "backend") {
      const expectedRevision = saved.data?.revision ?? 0;
      const result = await api.execute("saveArchitectureDocument", {
        modelId: model.id,
        viewId: viewKey,
        expectedRevision,
        xml: xmlToSave,
      });
      cache.setQueryData(
        ["api", "architectureDocument", { modelId: model.id, viewId: viewKey }],
        result,
      );
      lastHydratedKeyRef.current = `${model.id}:${viewKey}:${result.revision}:${xmlToSave.length}`;
    }
  }

  const [active3EItemId, setActive3EItemId] = useUmlScopeState<string>(documentScope, "");

  function handleSelectItem(itemId: string) {
    setActive3EItemId(itemId);
    const ctx = resolveUmlSelectionContext(effectiveProjection, itemId);
    if (onSelectUmlContext) {
      onSelectUmlContext(ctx);
    }
    if (ctx?.modelElementId) {
      onSelect(ctx.modelElementId);
    } else if (ctx?.sourceRelationshipIds?.[0]) {
      onSelect(ctx.sourceRelationshipIds[0]);
    } else {
      onSelect(itemId);
    }
  }

  return (
    <div
      className="space-y-4"
      data-testid={`uml-workspace-${kind.toLowerCase()}`}
      data-saved-loaded={saved.data !== undefined || Boolean(saved.error) ? "true" : "false"}
    >
      {kind === "UML_ACTIVITY" && (
        <div role="tablist" aria-label="Activity source" className="flex gap-1.5">
          <Button
            role="tab"
            size="sm"
            aria-selected={activitySourceMode === "static"}
            variant={activitySourceMode === "static" ? "default" : "outline"}
            onClick={() => {
              clearDraftConflictState();
              setActivitySourceMode("static");
              onSelectUmlContext?.(null);
            }}
          >
            Auto-detected scenario
          </Button>
          <Button
            role="tab"
            size="sm"
            aria-selected={activitySourceMode === "observed"}
            variant={activitySourceMode === "observed" ? "default" : "outline"}
            onClick={() => {
              clearDraftConflictState();
              setActivitySourceMode("observed");
              onSelectUmlContext?.(null);
            }}
          >
            Observed runtime
          </Button>
        </div>
      )}

      {/* Top Scope & 3E Element Inspector Card */}
      <div className="rounded-xl border bg-card p-3 space-y-3" data-testid="uml-top-inspector-card">
        {projection.diagramKind === "UML_CLASS" && (
          <SelectField
            label="Package"
            value={packageFilter}
            onChange={(v) => {
              clearDraftConflictState();
              setPackageFilter(v);
            }}
            options={[
              { value: "", label: "All packages" },
              ...Array.from(
                new Set(
                  projectUmlClassDiagram(model, { serviceId: serviceId || null }).classifiers.map(
                    (c) => c.packageName,
                  ),
                ),
              ).map((pkg) => ({ value: pkg, label: pkg })),
            ]}
          />
        )}

        {projection.diagramKind === "UML_DEPLOYMENT" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <SelectField
                label="Environment"
                value={projection.environment}
                onChange={(v) => {
                  clearDraftConflictState();
                  setEnvironmentFilter(v);
                }}
                options={projection.availableEnvironments.map((env) => ({
                  value: env,
                  label: env,
                }))}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              data-testid="uml-toggle-startup-overlay"
              onClick={() => {
                clearDraftConflictState();
                setDeploymentOverlay((prev) => ({
                  ...prev,
                  includeStartupDependenciesOverlay: !prev.includeStartupDependenciesOverlay,
                }));
              }}
            >
              {deploymentOverlay.includeStartupDependenciesOverlay
                ? "Hide startup dependencies"
                : "Show startup dependencies"}
            </Button>
          </div>
        )}

        {projection.diagramKind === "UML_ACTIVITY" && (
          <div className="space-y-3">
            {activitySourceMode === "observed" ? (
              !availableRuntimeSessions.length ? (
                <div role="status" className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground space-y-2">
                  <p>
                    {locale === "vi"
                      ? "Chưa có phiên chạy Runtime nào gắn với phiên bản mô hình này. Hãy chạy kịch bản ở mục Kịch bản Runtime rồi quay lại đây, hoặc chuyển sang tab kịch bản tĩnh mặc định."
                      : "No observed runtime session is linked to this model revision. Run a scenario from Runtime, then return here; or switch to Auto-detected scenario."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      clearDraftConflictState();
                      setActivitySourceMode("static");
                    }}
                  >
                    {locale === "vi" ? "Xem luồng tĩnh mặc định" : "Switch to Auto-detected scenario"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="runtime">OBSERVED RUNTIME</Badge>
                      <Badge variant="outline">
                        {effectiveProjection.diagramKind === "UML_ACTIVITY"
                          ? `${effectiveProjection.partitions.length} Swimlanes · ${effectiveProjection.nodes.filter((n) => n.kind === "ACTION").length} Actions`
                          : "0 Actions"}
                      </Badge>
                    </div>
                  </div>
                  <SelectField
                    label="Runtime Session"
                    value={activeRuntimeSession?.id ?? ""}
                    onChange={(v) => {
                      clearDraftConflictState();
                      setSelectedRuntimeSessionId(v);
                      setSelectedRuntimeTrace("all");
                      onSelectUmlContext?.(null);
                    }}
                    options={availableRuntimeSessions.map((s) => ({
                      value: s.id,
                      label: `${s.scenarioName ?? "Runtime scenario"} · ${s.id.slice(0, 8)}`,
                    }))}
                  />
                  {runtimeFeatureClusters.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-xs font-medium text-muted-foreground mr-1">
                        Feature Flows:
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        variant={chosenRuntimeTrace === "all" ? "default" : "outline"}
                        onClick={() => {
                          clearDraftConflictState();
                          setSelectedRuntimeTrace("all");
                          onSelectUmlContext?.(null);
                        }}
                      >
                        Full End-to-End ({runtimeRawSteps.length})
                      </Button>
                      {runtimeFeatureClusters.map((cluster, idx) => {
                        const val = `cluster:${cluster.meta.id}`;
                        return (
                          <Button
                            key={cluster.meta.id}
                            type="button"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            variant={chosenRuntimeTrace === val ? "default" : "outline"}
                            onClick={() => {
                              clearDraftConflictState();
                              setSelectedRuntimeTrace(val);
                              onSelectUmlContext?.(null);
                            }}
                          >
                            {idx + 1}. {cluster.meta.shortTitle} ({cluster.steps.length})
                          </Button>
                        );
                      })}
                    </div>
                  )}
                  {runtimeAllTraces.length > 1 && (
                    <SelectField
                      label="Filter by Flow or HTTP step"
                      value={chosenRuntimeTrace}
                      onChange={(v) => {
                        clearDraftConflictState();
                        setSelectedRuntimeTrace(v);
                        onSelectUmlContext?.(null);
                      }}
                      options={runtimeTraceOptions}
                    />
                  )}
                </div>
              )
            ) : (
              <>
                <div role="group" aria-label="Activity perspective" className="flex flex-wrap gap-2">
                  {(["workflow", "method", "reference"] as const).map((view) => <Button key={view} type="button" size="sm"
                    aria-pressed={activityView === view} variant={activityView === view ? "default" : "outline"}
                    onClick={() => { clearDraftConflictState(); setActivityView(view); setSelectedOperationId(""); onSelectUmlContext?.(null); }}>
                    {view === "workflow" ? "Source workflow" : view === "method" ? "Method control flow" : "Dependency reference"}
                  </Button>)}
                </div>
                {activityView !== "workflow" && <p className="text-xs leading-5 text-muted-foreground">
                  {activityView === "method" ? "One method's extracted control-flow graph. Technical/configuration methods are available here; a single lane can be correct for a local method."
                    : "Unverified dependency illustrations are reference material and are not executable business workflows."}
                </p>}
                {activityOps.length ? <SelectField label={activityView === "reference" ? "Dependency reference" : "Activity flow"}
                  value={activeOpId} onChange={(value) => { clearDraftConflictState(); setSelectedOperationId(value); }}
                  options={activityOps.map((operation) => ({ value: operation.operationId,
                    label: operation.operationId.startsWith("flow:") ? operation.methodName
                      : `${operation.serviceName} · ${operation.classifierName}.${operation.signatureKey}` }))} />
                  : <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">No source-supported {activityView === "workflow" ? "endpoint/use-case workflow" : activityView === "method" ? "method CFG" : "dependency reference"} is available. Try another perspective or analyze the snapshot again; no behavior has been invented.</p>}
              </>
            )}
          </div>
        )}

        {projection.diagramKind === "UML_STATE" && (
          <SelectField
            label={locale === "vi" ? "Đối tượng trạng thái / enum" : "State target / enum"}
            value={projection.selectedTargetId}
            onChange={(v) => {
              clearDraftConflictState();
              setSelectedStateTargetId(v);
            }}
            options={
              projection.availableTargets.length > 0
                ? projection.availableTargets.map((t) => ({
                    value: t.targetId,
                    label: t.enumOnlyNoTransitions
                      ? `${t.classifierName} (${locale === "vi" ? "chỉ khai báo enum" : "enum declaration only"})`
                      : t.classifierName,
                  }))
                : [{ value: "designed", label: "Designed State Machine" }]
            }
          />
        )}

        <div className="border-t pt-3" data-testid="uml-interactive-items">
          {effectiveProjection.diagramKind === "UML_CLASS" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableThreeESelect
                label="Element to explore"
                placeholder="Select or search elements…"
                selectedValue={
                  effectiveProjection.classifiers.some((c) => c.classifierId === selectedId)
                    ? selectedId
                    : active3EItemId
                }
                onSelect={handleSelectItem}
                options={effectiveProjection.classifiers.map((cls, idx) => ({
                  value: cls.classifierId,
                  badge:
                    cls.classifierKind === "INTERFACE"
                      ? "«interface»"
                      : cls.classifierKind === "ENUM"
                        ? "«enum»"
                        : "class",
                  label: `${idx + 1}. ${cls.name}`,
                  sublabel: cls.packageName ? `Package: ${cls.packageName}` : undefined,
                  testId: `uml-item-${cls.name}`,
                }))}
              />
              <SearchableThreeESelect
                label="Connection to explore"
                placeholder="Select or search connections…"
                selectedValue={active3EItemId}
                onSelect={handleSelectItem}
                options={effectiveProjection.relations.map((rel, idx) => {
                  const fromCls = effectiveProjection.classifiers.find(
                    (c) => c.classifierId === rel.fromClassifierId,
                  );
                  const toCls = effectiveProjection.classifiers.find(
                    (c) => c.classifierId === rel.toClassifierId,
                  );
                  return {
                    value: rel.relationId,
                    badge: rel.relationKind,
                    label: `#${idx + 1} ${fromCls?.name ?? rel.fromClassifierId} → ${toCls?.name ?? rel.toClassifierId}`,
                    sublabel: rel.roleName ? `Role: ${rel.roleName}` : undefined,
                  };
                })}
              />
            </div>
          )}

          {effectiveProjection.diagramKind === "UML_PACKAGE" &&
            (() => {
              const populatedPkgs = effectiveProjection.packages.filter(
                (p) => p.memberClassifierIds.length > 0,
              );
              const displayPkgs =
                populatedPkgs.length > 0 ? populatedPkgs : effectiveProjection.packages;
              return (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SearchableThreeESelect
                    label="Element to explore"
                    placeholder="Select or search elements…"
                    selectedValue={
                      displayPkgs.some((p) => p.packageId === selectedId)
                        ? selectedId
                        : active3EItemId
                    }
                    onSelect={handleSelectItem}
                    options={displayPkgs.map((pkg, idx) => {
                      const svcName = pkg.serviceId
                        ? model.elements.find((e) => e.id === pkg.serviceId)?.name
                        : undefined;
                      return {
                        value: pkg.packageId,
                        badge: "«package»",
                        label: `${idx + 1}. ${pkg.qualifiedName}`,
                        sublabel: svcName ? `Service: ${svcName}` : undefined,
                        testId: `uml-item-${pkg.qualifiedName}`,
                      };
                    })}
                  />
                  <SearchableThreeESelect
                    label="Connection to explore"
                    placeholder="Select or search connections…"
                    selectedValue={active3EItemId}
                    onSelect={handleSelectItem}
                    options={effectiveProjection.edges.map((edge, idx) => {
                      const fromPkg = effectiveProjection.packages.find(
                        (p) => p.packageId === edge.fromPackageId,
                      );
                      const toPkg = effectiveProjection.packages.find(
                        (p) => p.packageId === edge.toPackageId,
                      );
                      return {
                        value: edge.edgeId,
                        badge: `«${edge.relationKind.toLowerCase()}»`,
                        label: `#${idx + 1} ${fromPkg?.qualifiedName ?? edge.fromPackageId} → ${toPkg?.qualifiedName ?? edge.toPackageId}`,
                      };
                    })}
                  />
                </div>
              );
            })()}

          {effectiveProjection.diagramKind === "UML_DEPLOYMENT" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableThreeESelect
                label="Element to explore"
                placeholder="Select or search elements…"
                selectedValue={
                  effectiveProjection.nodes.find(
                    (n) => n.modelElementId === selectedId || n.nodeId === selectedId,
                  )?.nodeId ?? active3EItemId
                }
                onSelect={handleSelectItem}
                options={effectiveProjection.nodes.map((n, idx) => ({
                  value: n.nodeId,
                  badge: n.stereotype,
                  label: `${idx + 1}. ${n.name}`,
                  sublabel: n.ports.length > 0 ? `Ports: ${n.ports.join(", ")}` : undefined,
                  testId: `uml-item-${n.name}`,
                }))}
              />
              <SearchableThreeESelect
                label="Connection to explore"
                placeholder="Select or search connections…"
                selectedValue={active3EItemId}
                onSelect={handleSelectItem}
                options={effectiveProjection.edges.map((edge, idx) => {
                  const fromNode = effectiveProjection.nodes.find(
                    (n) => n.nodeId === edge.fromNodeId,
                  );
                  const toNode = effectiveProjection.nodes.find((n) => n.nodeId === edge.toNodeId);
                  return {
                    value: edge.edgeId,
                    badge: edge.edgeKind,
                    label: `#${idx + 1} ${fromNode?.name ?? edge.fromNodeId} → ${toNode?.name ?? edge.toNodeId}`,
                    sublabel: edge.label || undefined,
                  };
                })}
              />
            </div>
          )}

          {effectiveProjection.diagramKind === "UML_ACTIVITY" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableThreeESelect
                label="Element to explore"
                placeholder="Select or search elements…"
                selectedValue={active3EItemId || selectedId}
                onSelect={handleSelectItem}
                options={[
                  ...effectiveProjection.partitions.map((part, idx) => ({
                    value: part.partitionId,
                    badge: "SWIMLANE",
                    label: `${idx + 1}. ${part.name}`,
                  })),
                  ...effectiveProjection.nodes.map((n, idx) => ({
                    value: n.nodeId,
                    badge: n.kind,
                    label: `${idx + 1}. ${n.label}`,
                    sublabel: `Swimlane: ${n.partitionName.replace(/\s*\([^)]*\)$/, "")}`,
                    testId: `uml-item-${n.nodeId}`,
                  })),
                ]}
              />
              <SearchableThreeESelect
                label="Connection to explore"
                placeholder="Select or search connections…"
                selectedValue={active3EItemId}
                onSelect={handleSelectItem}
                options={effectiveProjection.edges.map((edge, idx) => {
                  const fromNode = effectiveProjection.nodes.find((n) => n.nodeId === edge.from);
                  const toNode = effectiveProjection.nodes.find((n) => n.nodeId === edge.to);
                  return {
                    value: edge.edgeId,
                    badge: edge.flowKind,
                    label: `#${idx + 1} ${fromNode?.label ?? edge.from} → ${toNode?.label ?? edge.to}`,
                    sublabel: edge.guard ? `Guard: [${edge.guard}]` : undefined,
                  };
                })}
              />
            </div>
          )}

          {effectiveProjection.diagramKind === "UML_STATE" && !stateMachineUnavailable && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableThreeESelect
                label="Element to explore"
                placeholder="Select or search elements…"
                selectedValue={active3EItemId || selectedId}
                onSelect={handleSelectItem}
                options={effectiveProjection.states.map((st, idx) => ({
                  value: st.stateId,
                  badge: st.kind,
                  label: `${idx + 1}. ${st.name}`,
                  sublabel: st.entryBehavior ? `entry / ${st.entryBehavior}` : undefined,
                  testId: `uml-item-${st.name}`,
                }))}
              />
              <SearchableThreeESelect
                label="Connection to explore"
                placeholder="Select or search connections…"
                selectedValue={active3EItemId}
                onSelect={handleSelectItem}
                options={effectiveProjection.transitions.map((tr, idx) => {
                  const fromSt = effectiveProjection.states.find(
                    (s) => s.stateId === tr.fromStateId,
                  );
                  const toSt = effectiveProjection.states.find((s) => s.stateId === tr.toStateId);
                  return {
                    value: tr.transitionId,
                    badge: "TRANSITION",
                    label: `#${idx + 1} ${fromSt?.name ?? tr.fromStateId} → ${toSt?.name ?? tr.toStateId}`,
                    sublabel:
                      [tr.trigger, tr.guard ? `[${tr.guard}]` : ""].filter(Boolean).join(" ") ||
                      undefined,
                  };
                })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Never present a dependency template as a behavioral Activity. */}
      {stateMachineUnavailable ? (
        <div role="status" className="space-y-2 rounded-lg border bg-card p-4 text-sm" data-testid="uml-state-unavailable">
          <p className="font-medium">{locale === "vi" ? "Chưa có bằng chứng về state machine" : "No state machine behavior available"}</p>
          <p className="text-muted-foreground">{effectiveProjection.diagramKind === "UML_STATE" && effectiveProjection.enumOnlyNoTransitions
            ? (locale === "vi"
              ? "Đối tượng được chọn chỉ khai báo các giá trị enum, không có bằng chứng chuyển trạng thái. Các giá trị enum không tự chứng minh một vòng đời. Xem giá trị enum trong Class Diagram; hệ thống không tự thêm trạng thái đầu/cuối hoặc mũi tên."
              : "The selected target only declares enum values; no state transitions were extracted. Enum values alone do not establish a lifecycle. Inspect enum values in Class Diagram; initial/final states and arrows are not invented.")
            : (locale === "vi" ? "Model này chưa có vòng đời trạng thái được trích xuất từ mã nguồn." : "This model has no source-extracted state lifecycle.")}</p>
        </div>
      ) : effectiveProjection.diagramKind === "UML_ACTIVITY" && effectiveProjection.unsupportedConstructs.includes("INFERRED_BUSINESS_FLOW_REQUIRES_SOURCE_VERIFICATION") ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">This selection only has static dependencies, not an extracted method control-flow graph. Choose a method above to view its source Activity, or inspect these relationships in Graph Explorer.</p>
      ) : effectiveProjection.diagramKind === "UML_ACTIVITY" && !effectiveProjection.nodes.length ? null : <DrawioEditor
        key={documentScope}
        modelId={model.id}
        diagramId={viewKey}
        title={
          kind === "UML_CLASS"
            ? "Class Diagram"
            : kind === "UML_PACKAGE"
              ? "Package Diagram"
              : kind === "UML_DEPLOYMENT"
                ? "Deployment Diagram"
                : kind === "UML_ACTIVITY"
                  ? "Activity Diagram"
                  : "State Machine"
        }
        notation="UML"
        level={kind}
        scope={viewKey}
        xml={activeXml}
        generatedXml={cleanGeneratedXml}
        theme={theme}
        onThemeChange={handleThemeChange}
        preferProvidedXml={Boolean(drawioDraftXml || saved.data?.xml)}
        autoSaveWhenReady={Boolean(
          saved.data && !saved.data.xml && !saved.error && generatedXml,
        )}
        onDraftChange={(nextXml) => {
          setDrawioDraftXml(nextXml);
        }}
        onRelayout={() => {
          setPreservedLayout({});
          setDrawioDraftXml(null);
          setReconciledDraftProjection(null);
        }}
        onSave={async (content) => {
          await persistCurrentDiagramXml(content);
        }}
      />}
    </div>
  );
}

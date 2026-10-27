"use client";
import { savedUmlCoversSource } from "./uml-source-coverage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import { DrawioEditor } from "./drawio-editor";
import { useUmlScopeState } from "./use-uml-scope-state";
import { SearchableThreeESelect } from "./three-e-searchable-select";
import {
  applyUmlAiEnrichment,
  buildUmlCompactContext,
  buildUmlDrawioXml,
  hydrateUmlWorkspaceFromXml,
  listActivityOperations,
  listStateTargets,
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
}: {
  model: ArchitecturalModel;
  kind: UmlDiagramKind;
  serviceId?: string | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectUmlContext?: ((ctx: UmlSelectionContext | null) => void) | undefined;
  theme?: DrawioTheme | undefined;
  onThemeChange?: ((theme: DrawioTheme) => void) | undefined;
}) {
  const api = useApi();
  const cache = useQueryClient();
  const [internalTheme, setInternalTheme] = useState<DrawioTheme>(externalTheme ?? "clean");
  const theme = externalTheme ?? internalTheme;
  const handleThemeChange = (next: DrawioTheme) => {
    setInternalTheme(next);
    onThemeChange?.(next);
  };

  const [packageFilter, setPackageFilter] = useState<string>("");
  const [environmentFilter, setEnvironmentFilter] = useState<string>("default");
  const [selectedOperationId, setSelectedOperationId] = useState<string>("");
  const [selectedStateTargetId, setSelectedStateTargetId] = useState<string>("");

  const activityOps = useMemo(() => listActivityOperations(model), [model]);
  const stateTargets = useMemo(() => listStateTargets(model), [model]);

  const activeOpId = activityOps.find(op => op.operationId === selectedOperationId)?.operationId || activityOps[0]?.operationId || "";
  const activeStateTargetId = selectedStateTargetId || stateTargets[0]?.targetId || "";

  const viewKey = useMemo(() => {
    if (kind === "UML_CLASS") return `uml-class:${serviceId || "all"}:${packageFilter || "all"}`;
    if (kind === "UML_PACKAGE") return `uml-package:${serviceId || "all"}`;
    if (kind === "UML_DEPLOYMENT") return `uml-deployment:${environmentFilter || "default"}`;
    if (kind === "UML_ACTIVITY") return `uml-activity:${activeOpId || "default"}`;
    return `uml-state:${activeStateTargetId || "default"}`;
  }, [kind, serviceId, packageFilter, environmentFilter, activeOpId, activeStateTargetId]);

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
        return projectUmlActivityDiagram(model, {
          operationId: activeOpId,
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
    stateOverlay,
  ]);

  const compactUmlContext = useMemo(
    () => buildUmlCompactContext(model, baseProjection),
    [model, baseProjection],
  );

  const [umlAiEnrichment, setUmlAiEnrichment] = useUmlScopeState<UmlAiDiagramEnrichment | null>(documentScope, null);

  useEffect(() => {
    const cached = clientUmlAiCache.get(compactUmlContext.contextHash);
    if (cached) {
      setUmlAiEnrichment(cached);
      return;
    }
    let cancelled = false;
    fetch("/api/ai-diagram-semantics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umlContext: compactUmlContext }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { umlEnrichment?: UmlAiDiagramEnrichment } | null) => {
        if (cancelled || !data?.umlEnrichment) return;
        clientUmlAiCache.set(compactUmlContext.contextHash, data.umlEnrichment);
        setUmlAiEnrichment(data.umlEnrichment);
      })
      .catch(() => {
        // fallback to deterministic projection
      });
    return () => {
      cancelled = true;
    };
  }, [compactUmlContext]);

  const projection = useMemo(
    () => applyUmlAiEnrichment(baseProjection, umlAiEnrichment),
    [baseProjection, umlAiEnrichment],
  );

  // Effective projection reflects the canvas at all times (including when a Draw.io draft has deleted or modified cells)
  const effectiveProjection: AnyUmlProjection = reconciledDraftProjection ?? projection;

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
          <SelectField
            label="Activity flow"
            value={projection.selectedOperationId}
            onChange={(v) => {
              clearDraftConflictState();
              setSelectedOperationId(v);
            }}
            options={
              projection.availableOperations.length > 0
                ? projection.availableOperations.map((op) => ({
                    value: op.operationId,
                    label: op.operationId.startsWith("flow:")
                      ? op.methodName
                      : `${op.serviceName} · ${op.classifierName}.${op.methodName}`,
                  }))
                : [{ value: "designed", label: "Designed Workflow" }]
            }
          />
        )}

        {projection.diagramKind === "UML_STATE" && (
          <SelectField
            label="State machine"
            value={projection.selectedTargetId}
            onChange={(v) => {
              clearDraftConflictState();
              setSelectedStateTargetId(v);
            }}
            options={
              projection.availableTargets.length > 0
                ? projection.availableTargets.map((t) => ({
                    value: t.targetId,
                    label: t.classifierName,
                  }))
                : [{ value: "designed", label: "Designed State Machine" }]
            }
          />
        )}

        {effectiveProjection.diagramKind === "UML_CLASS" && <p role="status" className="text-xs text-muted-foreground">
          Showing {effectiveProjection.classifiers.length} extracted/designed classifiers in the selected scope. Missing client or model types require inspecting this revision's extracted metadata; they are not invented from field names.
        </p>}
        {effectiveProjection.diagramKind === "UML_PACKAGE" && <p role="status" className="text-xs text-muted-foreground">
          Packages are grouped by service and qualified name. HTTP service calls do not establish Java package imports; only recorded code dependencies are used.
        </p>}
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

          {effectiveProjection.diagramKind === "UML_STATE" && (
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
      {effectiveProjection.diagramKind === "UML_ACTIVITY" && effectiveProjection.unsupportedConstructs.includes("INFERRED_BUSINESS_FLOW_REQUIRES_SOURCE_VERIFICATION") ? (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">This selection only has static dependencies, not an extracted method control-flow graph. Choose a method above to view its source Activity, or inspect these relationships in Graph Explorer.</p>
      ) : <DrawioEditor
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

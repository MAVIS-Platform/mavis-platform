"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import type { ArchitecturalModel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import { DrawioEditor } from "./drawio-editor";
import {
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
  type UmlActivityNodeKind,
  type UmlActivityOverlay,
  type UmlClassOverlay,
  type UmlDeploymentEdgeKind,
  type UmlDeploymentNodeKind,
  type UmlDeploymentOverlay,
  type UmlDiagramKind,
  type UmlPackageOverlay,
  type UmlPackageRelationKind,
  type UmlRelationKind,
  type UmlRoundTripConflict,
  type UmlSelectionContext,
  type UmlStateNodeKind,
  type UmlStateOverlay,
} from "./uml-diagrams";

export function UmlDiagramWorkspace({
  model,
  kind,
  serviceId,
  selectedId,
  onSelect,
  onSelectUmlContext,
}: {
  model: ArchitecturalModel;
  kind: UmlDiagramKind;
  serviceId?: string | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectUmlContext?: ((ctx: UmlSelectionContext | null) => void) | undefined;
}) {
  const api = useApi();
  const cache = useQueryClient();

  const [packageFilter, setPackageFilter] = useState<string>("");
  const [environmentFilter, setEnvironmentFilter] = useState<string>("default");
  const [selectedOperationId, setSelectedOperationId] = useState<string>("");
  const [selectedStateTargetId, setSelectedStateTargetId] = useState<string>("");

  // Structured DESIGNED overlays per diagram kind
  const [classOverlay, setClassOverlay] = useState<UmlClassOverlay>({
    designedClassifiers: [],
    designedRelations: [],
  });
  const [packageOverlay, setPackageOverlay] = useState<UmlPackageOverlay>({
    designedPackages: [],
    designedEdges: [],
  });
  const [deploymentOverlay, setDeploymentOverlay] = useState<UmlDeploymentOverlay>({
    designedNodes: [],
    designedEdges: [],
    includeStartupDependenciesOverlay: false,
  });
  const [activityOverlay, setActivityOverlay] = useState<UmlActivityOverlay>({
    designedNodes: [],
    designedEdges: [],
  });
  const [stateOverlay, setStateOverlay] = useState<UmlStateOverlay>({
    designedStates: [],
    designedTransitions: [],
  });

  const [preservedLayout, setPreservedLayout] = useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const [roundTripConflicts, setRoundTripConflicts] = useState<UmlRoundTripConflict[]>([]);
  const [drawioDraftXml, setDrawioDraftXml] = useState<string | null>(null);
  const [reconciledDraftProjection, setReconciledDraftProjection] =
    useState<AnyUmlProjection | null>(null);
  const [roundTripNotice, setRoundTripNotice] = useState<string>("");
  const [savingDoc, setSavingDoc] = useState(false);

  // M4 Class structured authoring form states
  const [newClsName, setNewClsName] = useState<string>("OrderAuditPolicy");
  const [newClsKind, setNewClsKind] = useState<"CLASS" | "INTERFACE" | "ENUM">("INTERFACE");
  const [newClsPkg, setNewClsPkg] = useState<string>("com.example.orders.domain");
  const [newClsAttrSig, setNewClsAttrSig] = useState<string>("/auditScore: BigDecimal");
  const [newClsMemberSig, setNewClsMemberSig] = useState<string>("validateOrder(orderId: String): boolean");
  const [designRelFrom, setDesignRelFrom] = useState<string>("");
  const [designRelTo, setDesignRelTo] = useState<string>("");
  const [designRelKind, setDesignRelKind] = useState<UmlRelationKind>("COMPOSITION");
  const [designRelSourceRole, setDesignRelSourceRole] = useState<string>("owner");
  const [designSourceMultiplicity, setDesignSourceMultiplicity] = useState<string>("1");
  const [designRelRole, setDesignRelRole] = useState<string>("designedPart");
  const [designMultiplicity, setDesignMultiplicity] = useState<string>("1..*");

  // M5 Package structured authoring form states
  const [newPkgName, setNewPkgName] = useState<string>("com.example.orders.contracts");
  const [newPkgParent, setNewPkgParent] = useState<string>("");
  const [designPkgFrom, setDesignPkgFrom] = useState<string>("");
  const [designPkgTo, setDesignPkgTo] = useState<string>("");
  const [designPkgKind, setDesignPkgKind] = useState<UmlPackageRelationKind>("IMPORT");

  // M5 Deployment structured authoring form states
  const [newDeployName, setNewDeployName] = useState<string>("ha-deployment-spec.yaml");
  const [newDeployKind, setNewDeployKind] =
    useState<UmlDeploymentNodeKind>("DEPLOYMENT_SPECIFICATION");
  const [newDeployParent, setNewDeployParent] = useState<string>("");
  const [newDeployPorts, setNewDeployPorts] = useState<string>("8443:8443");
  const [designDeployFrom, setDesignDeployFrom] = useState<string>("");
  const [designDeployTo, setDesignDeployTo] = useState<string>("");
  const [designDeployEdgeKind, setDesignDeployEdgeKind] =
    useState<UmlDeploymentEdgeKind>("COMMUNICATION_PATH");
  const [designDeployProtocol, setDesignDeployProtocol] = useState<string>("HTTPS");

  // M6 Activity structured authoring form states
  const [newActNodeLabel, setNewActNodeLabel] = useState<string>("PublishOrderAuditEvent");
  const [newActNodeKind, setNewActNodeKind] = useState<UmlActivityNodeKind>("ACTION");
  const [designActFrom, setDesignActFrom] = useState<string>("");
  const [designActTo, setDesignActTo] = useState<string>("");
  const [designActFlowKind, setDesignActFlowKind] = useState<"CONTROL_FLOW" | "OBJECT_FLOW">(
    "CONTROL_FLOW",
  );
  const [designActGuard, setDesignActGuard] = useState<string>("[auditEnabled]");

  // M7 State structured authoring form states
  const [newStateName, setNewStateName] = useState<string>("ARCHIVED");
  const [newStateKind, setNewStateKind] = useState<UmlStateNodeKind>("STATE");
  const [newStateParent, setNewStateParent] = useState<string>("");
  const [newStateEntry, setNewStateEntry] = useState<string>("recordArchiveTimestamp()");
  const [newStateDo, setNewStateDo] = useState<string>("");
  const [newStateExit, setNewStateExit] = useState<string>("");
  const [designStateFrom, setDesignStateFrom] = useState<string>("");
  const [designStateTo, setDesignStateTo] = useState<string>("");
  const [designStateTrigger, setDesignStateTrigger] = useState<string>("archiveOrder");
  const [designStateGuard, setDesignStateGuard] = useState<string>("[retentionExpired]");
  const [designStateEffect, setDesignStateEffect] = useState<string>("notifyArchiveStore()");

  const activityOps = useMemo(() => listActivityOperations(model), [model]);
  const stateTargets = useMemo(() => listStateTargets(model), [model]);

  const activeOpId = selectedOperationId || activityOps[0]?.operationId || "";
  const activeStateTargetId = selectedStateTargetId || stateTargets[0]?.targetId || "";

  const viewKey = useMemo(() => {
    if (kind === "UML_CLASS") return `uml-class:${serviceId || "all"}:${packageFilter || "all"}`;
    if (kind === "UML_PACKAGE") return `uml-package:${serviceId || "all"}`;
    if (kind === "UML_DEPLOYMENT") return `uml-deployment:${environmentFilter || "default"}`;
    if (kind === "UML_ACTIVITY") return `uml-activity:${activeOpId || "default"}`;
    return `uml-state:${activeStateTargetId || "default"}`;
  }, [kind, serviceId, packageFilter, environmentFilter, activeOpId, activeStateTargetId]);

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
      setRoundTripConflicts([]);
      setDrawioDraftXml(null);
      setReconciledDraftProjection(null);
      return;
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
    setPreservedLayout(hydrated.preservedLayout);
    setRoundTripConflicts(hydrated.conflicts);

    if (hydrated.conflicts.length > 0) {
      setDrawioDraftXml(xml);
      setReconciledDraftProjection(hydrated.projection);
    } else {
      setDrawioDraftXml(null);
      setReconciledDraftProjection(null);
    }
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
    setRoundTripConflicts([]);
  };

  const projection = useMemo(() => {
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

  // Effective projection reflects the canvas at all times (including when a Draw.io draft has deleted or modified cells)
  const effectiveProjection: AnyUmlProjection = reconciledDraftProjection ?? projection;

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
    ],
  );

  const activeXml = drawioDraftXml ?? generatedXml;

  const summaryCounts = useMemo(() => {
    if (effectiveProjection.diagramKind === "UML_CLASS") {
      const extractedNodes = effectiveProjection.classifiers.filter(
        (c) => c.provenance === "EXTRACTED",
      ).length;
      const designedNodes = effectiveProjection.classifiers.filter(
        (c) => c.provenance === "DESIGNED",
      ).length;
      return {
        nodeLabel: "Classifiers",
        totalNodes: effectiveProjection.classifiers.length,
        extractedNodes,
        designedNodes,
        edgeLabel: "Relationships",
        totalEdges: effectiveProjection.relations.length,
        designedEdges: effectiveProjection.relations.filter((r) => r.provenance === "DESIGNED")
          .length,
      };
    }
    if (effectiveProjection.diagramKind === "UML_PACKAGE") {
      return {
        nodeLabel: "Packages",
        totalNodes: effectiveProjection.packages.length,
        extractedNodes: effectiveProjection.packages.filter((p) => p.provenance === "EXTRACTED")
          .length,
        designedNodes: effectiveProjection.packages.filter((p) => p.provenance === "DESIGNED")
          .length,
        edgeLabel: "Package Edges",
        totalEdges: effectiveProjection.edges.length,
        designedEdges: effectiveProjection.edges.filter((e) => e.provenance === "DESIGNED").length,
      };
    }
    if (effectiveProjection.diagramKind === "UML_DEPLOYMENT") {
      return {
        nodeLabel: "Deployment Nodes",
        totalNodes: effectiveProjection.nodes.length,
        extractedNodes: effectiveProjection.nodes.filter((n) => n.provenance === "EXTRACTED")
          .length,
        designedNodes: effectiveProjection.nodes.filter((n) => n.provenance === "DESIGNED").length,
        edgeLabel: "Deployment Edges",
        totalEdges: effectiveProjection.edges.length,
        designedEdges: effectiveProjection.edges.filter((e) => e.provenance === "DESIGNED").length,
      };
    }
    if (effectiveProjection.diagramKind === "UML_ACTIVITY") {
      return {
        nodeLabel: "Activity Nodes",
        totalNodes: effectiveProjection.nodes.length,
        extractedNodes: effectiveProjection.nodes.filter((n) => n.provenance === "EXTRACTED")
          .length,
        designedNodes: effectiveProjection.nodes.filter((n) => n.provenance === "DESIGNED").length,
        edgeLabel: "Activity Flows",
        totalEdges: effectiveProjection.edges.length,
        designedEdges: effectiveProjection.edges.filter((e) => e.provenance === "DESIGNED").length,
      };
    }
    return {
      nodeLabel: "States",
      totalNodes: effectiveProjection.states.length,
      extractedNodes: effectiveProjection.states.filter((s) => s.provenance === "EXTRACTED").length,
      designedNodes: effectiveProjection.states.filter((s) => s.provenance === "DESIGNED").length,
      edgeLabel: "Transitions",
      totalEdges: effectiveProjection.transitions.length,
      designedEdges: effectiveProjection.transitions.filter((t) => t.provenance === "DESIGNED")
        .length,
    };
  }, [effectiveProjection]);

  async function persistCurrentDiagramXml(xmlToSave: string) {
    const rt = reconcileUmlDrawioXml(xmlToSave, projection);
    const hydrated = hydrateUmlWorkspaceFromXml(xmlToSave, model, {
      diagramKind: kind,
      selectedServiceId: serviceId || null,
      selectedPackageName: packageFilter || null,
      selectedEnvironment: environmentFilter || "default",
      selectedOperationId: activeOpId || null,
      selectedTargetId: activeStateTargetId || null,
    });

    setPreservedLayout((prev) => ({ ...prev, ...rt.preservedLayout, ...hydrated.preservedLayout }));

    const mergedConflicts: UmlRoundTripConflict[] = [...rt.conflicts];
    for (const c of hydrated.conflicts) {
      if (!mergedConflicts.some((existing) => existing.code === c.code && existing.itemId === c.itemId)) {
        mergedConflicts.push(c);
      }
    }

    if (mergedConflicts.length > 0) {
      setRoundTripConflicts(mergedConflicts);
      setDrawioDraftXml(xmlToSave);
      setReconciledDraftProjection(rt.projection);
      throw new Error(
        `UML Round-trip Guard Rejected Edit: ${mergedConflicts.map((c) => `[${c.code}] ${c.message}`).join("; ")}`,
      );
    }

    setClassOverlay(hydrated.classOverlay);
    setPackageOverlay(hydrated.packageOverlay);
    setDeploymentOverlay(hydrated.deploymentOverlay);
    setActivityOverlay(hydrated.activityOverlay);
    setStateOverlay(hydrated.stateOverlay);
    setPreservedLayout(hydrated.preservedLayout);
    setRoundTripConflicts([]);
    setDrawioDraftXml(null);
    setReconciledDraftProjection(null);

    const canonicalXml = buildUmlDrawioXml(hydrated.projection, hydrated.preservedLayout, {
      selectedServiceId: serviceId || null,
      selectedPackageName: packageFilter || null,
      selectedEnvironment: environmentFilter || "default",
      selectedOperationId: activeOpId || null,
      selectedTargetId: activeStateTargetId || null,
      classOverlay: hydrated.classOverlay,
      packageOverlay: hydrated.packageOverlay,
      deploymentOverlay: hydrated.deploymentOverlay,
      activityOverlay: hydrated.activityOverlay,
      stateOverlay: hydrated.stateOverlay,
    });

    if (api.mode === "backend") {
      setSavingDoc(true);
      try {
        const expectedRevision = saved.data?.revision ?? 1;
        const result = await api.execute("saveArchitectureDocument", {
          modelId: model.id,
          viewId: viewKey,
          expectedRevision,
          xml: canonicalXml,
        });
        cache.setQueryData(
          ["api", "architectureDocument", { modelId: model.id, viewId: viewKey }],
          result,
        );
        lastHydratedKeyRef.current = `${model.id}:${viewKey}:${result.revision}:${canonicalXml.length}`;
        setRoundTripNotice(
          `Saved & reconciled ${kind} revision #${result.revision} (0 conflicts, ${Object.keys(hydrated.preservedLayout).length} geometry bounds preserved).`,
        );
      } finally {
        setSavingDoc(false);
      }
    } else {
      setRoundTripNotice(
        `Reconciled ${kind} Draw.io XML in local mode (0 conflicts, ${Object.keys(hydrated.preservedLayout).length} geometry bounds preserved).`,
      );
    }
  }

  function handleSelectItem(itemId: string) {
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
      {/* Scope, Metadata Summary & Persistence Bar */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              {kind === "UML_CLASS" && "UML Class Diagram · Structural Classifiers & Relationships"}
              {kind === "UML_PACKAGE" && "UML Package Diagram · Namespace Ownership & Dependencies"}
              {kind === "UML_DEPLOYMENT" &&
                "UML Deployment Diagram · Nodes, Artifacts & Communication Paths"}
              {kind === "UML_ACTIVITY" &&
                "UML Activity Diagram · Service-Partitioned Control & Object Flow"}
              {kind === "UML_STATE" &&
                "UML State Machine Diagram · Entity Lifecycle States & Transitions"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {kind === "UML_CLASS" &&
                "Preserves Java package-private vs C# internal visibility, distinct method overloads, and whole-part restraint."}
              {kind === "UML_PACKAGE" &&
                "Scopes packages by owning service, aggregates cross-package member dependencies, and validates «merge» cycles."}
              {kind === "UML_DEPLOYMENT" &&
                "Renders only explicit deployment metadata, separates CommunicationPath from Compose depends_on, and isolates environments."}
              {kind === "UML_ACTIVITY" &&
                "MAVISS convention: Partition (swimlane) denotes service responsibility, not OS thread concurrency."}
              {kind === "UML_STATE" &&
                "Models AST-evidenced entity lifecycle states, entry/do/exit behaviors, and trigger [guard] / effect transitions."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(summaryCounts.designedNodes > 0 || summaryCounts.designedEdges > 0) && (
              <Button
                variant="outline"
                size="sm"
                data-testid="uml-reset-overlays"
                onClick={() => {
                  clearDraftConflictState();
                  if (kind === "UML_CLASS") setClassOverlay({});
                  if (kind === "UML_PACKAGE") setPackageOverlay({});
                  if (kind === "UML_DEPLOYMENT") setDeploymentOverlay({});
                  if (kind === "UML_ACTIVITY") setActivityOverlay({});
                  if (kind === "UML_STATE") setStateOverlay({});
                }}
              >
                Reset Designed Overlays
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              disabled={savingDoc || roundTripConflicts.length > 0}
              onClick={() => {
                void persistCurrentDiagramXml(activeXml).catch((err) => {
                  setRoundTripNotice(err instanceof Error ? err.message : String(err));
                });
              }}
              data-testid="uml-save-diagram"
            >
              {savingDoc
                ? "Saving..."
                : `Save Diagram${saved.data?.revision ? ` (rev #${saved.data.revision})` : ""}`}
            </Button>
          </div>
        </div>

        {/* Synchronized Metadata & Provenance Summary */}
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-800 border"
          data-testid="uml-metadata-summary"
        >
          <span>
            <strong>{summaryCounts.nodeLabel}:</strong>{" "}
            <span data-testid="uml-summary-total-nodes">{summaryCounts.totalNodes}</span> (
            <span data-testid="uml-summary-extracted-nodes">{summaryCounts.extractedNodes}</span>{" "}
            EXTRACTED,{" "}
            <span data-testid="uml-summary-designed-nodes">{summaryCounts.designedNodes}</span>{" "}
            DESIGNED)
          </span>
          <span>·</span>
          <span>
            <strong>{summaryCounts.edgeLabel}:</strong>{" "}
            <span data-testid="uml-summary-total-edges">{summaryCounts.totalEdges}</span> (
            <span data-testid="uml-summary-designed-edges">{summaryCounts.designedEdges}</span>{" "}
            DESIGNED)
          </span>
          <span>·</span>
          <span>
            <strong>Diagnostics:</strong>{" "}
            <span data-testid="uml-summary-diagnostics-count">
              {effectiveProjection.validationIssues.length}
            </span>
          </span>
          <span>·</span>
          <span>
            <strong>Round-Trip Conflicts:</strong>{" "}
            <span data-testid="uml-summary-conflicts-count">{roundTripConflicts.length}</span>
          </span>
        </div>
      </div>

      {/* Round-Trip Conflict Banner & Recovery Actions */}
      {roundTripConflicts.length > 0 && (
        <div
          className="rounded-xl border border-rose-300 bg-rose-50/90 p-3 space-y-2"
          data-testid="uml-conflict-banner"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-rose-900">
              UML Draw.io Round-Trip Conflicts Detected ({roundTripConflicts.length}) — CAS Save
              Blocked
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="uml-conflict-discard"
                onClick={() => {
                  clearDraftConflictState();
                  setRoundTripNotice(
                    "Discarded Draw.io structural conflict draft and restored canonical UML projection.",
                  );
                }}
              >
                Discard Draw.io structural changes
              </Button>
              {saved.data?.xml && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="uml-conflict-reload"
                  onClick={() => {
                    lastHydratedKeyRef.current = "";
                    void saved.refetch();
                  }}
                >
                  Reload saved revision
                </Button>
              )}
            </div>
          </div>
          <ul className="list-disc pl-4 text-xs text-rose-900 space-y-0.5">
            {roundTripConflicts.map((c, idx) => (
              <li key={`${c.code}-${c.itemId}-${idx}`}>
                <span className="font-mono font-semibold">[{c.code}]</span> ({c.itemId}):{" "}
                {c.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {roundTripNotice && (
        <p
          className="rounded-md border bg-sky-50 px-3 py-2 text-xs text-sky-900"
          data-testid="uml-roundtrip-notice"
        >
          {roundTripNotice}
        </p>
      )}

      {/* Draw.io Canvas (Placed Above the Fold for Immediate Visual Clarity) */}
      <DrawioEditor
        key={`${model.id}:${viewKey}`}
        modelId={model.id}
        diagramId={viewKey}
        title={`UML · ${kind}`}
        notation="UML"
        level={kind}
        scope={viewKey}
        xml={activeXml}
        generatedXml={generatedXml}
        preferProvidedXml={Boolean(drawioDraftXml || saved.data?.xml)}
        onSave={async (content) => {
          await persistCurrentDiagramXml(content);
        }}
      />

      {/* Collapsible Structured Authoring & 3E Inspector Drawer */}
      <details
        open
        className="rounded-xl border bg-card p-4 space-y-3"
        data-testid="uml-authoring-drawer"
      >
        <summary className="cursor-pointer select-none text-xs font-semibold text-slate-800">
          Structured Authoring (DESIGNED Overlay), Scope Filters &amp; 3E Element Inspector
        </summary>

        {/* ===================================================================== */}
        {/* M4 UML_CLASS STRUCTURED DESIGNED AUTHORING                            */}
        {/* ===================================================================== */}
        {projection.diagramKind === "UML_CLASS" && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px]">
                <SelectField
                  label="Package / Namespace scope"
                  value={packageFilter}
                  onChange={(v) => {
                    clearDraftConflictState();
                    setPackageFilter(v);
                  }}
                  options={[
                    { value: "", label: "All packages / namespaces" },
                    ...Array.from(new Set(projection.classifiers.map((c) => c.packageName))).map(
                      (pkg) => ({ value: pkg, label: pkg }),
                    ),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Designed Classifier Name</label>
                <input
                  className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  value={newClsName}
                  onChange={(e) => setNewClsName(e.target.value)}
                  placeholder="e.g. OrderAuditPolicy"
                  data-testid="uml-class-input-name"
                />
              </div>
              <div className="min-w-[130px]">
                <SelectField
                  label="Classifier Kind"
                  value={newClsKind}
                  onChange={(v) => setNewClsKind(v as "CLASS" | "INTERFACE" | "ENUM")}
                  options={[
                    { value: "CLASS", label: "Class" },
                    { value: "INTERFACE", label: "Interface" },
                    { value: "ENUM", label: "Enum" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Package Name</label>
                <input
                  className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  value={newClsPkg}
                  onChange={(e) => setNewClsPkg(e.target.value)}
                  placeholder="com.example.orders"
                  data-testid="uml-class-input-package"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Initial Attribute (/derived ok)</label>
                <input
                  className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  value={newClsAttrSig}
                  onChange={(e) => setNewClsAttrSig(e.target.value)}
                  placeholder="/totalAmount: BigDecimal"
                  data-testid="uml-class-input-attr"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Initial Operation / Member</label>
                <input
                  className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  value={newClsMemberSig}
                  onChange={(e) => setNewClsMemberSig(e.target.value)}
                  placeholder="validate(id: String): boolean"
                  data-testid="uml-class-input-members"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                data-testid="uml-add-designed-classifier"
                onClick={() => {
                  const trimmed = newClsName.trim();
                  if (!trimmed) return;
                  clearDraftConflictState();
                  const pkg = newClsPkg.trim() || "designed";
                  const classifierId = `designed:cls:${pkg}.${trimmed}`;
                  const rawAttr = newClsAttrSig.trim();
                  const attrIsDerived = rawAttr.startsWith("/");
                  const cleanAttr = attrIsDerived ? rawAttr.slice(1).trim() : rawAttr;
                  const attrName = cleanAttr.includes(":")
                    ? cleanAttr.slice(0, cleanAttr.indexOf(":")).trim()
                    : cleanAttr;
                  const attrType = cleanAttr.includes(":")
                    ? cleanAttr.slice(cleanAttr.indexOf(":") + 1).trim()
                    : "String";
                  setClassOverlay((prev) => ({
                    ...prev,
                    designedClassifiers: [
                      ...(prev.designedClassifiers ?? []).filter(
                        (c) => c.classifierId !== classifierId,
                      ),
                      {
                        classifierId,
                        modelElementId: null,
                        name: trimmed,
                        qualifiedName: `${pkg}.${trimmed}`,
                        packageName: pkg,
                        serviceId: serviceId || null,
                        serviceName: "Designed Overlay",
                        classifierKind: newClsKind,
                        visibility: "PUBLIC",
                        isAbstract: newClsKind === "INTERFACE",
                        isStatic: false,
                        typeParameters: [],
                        sourceLanguage: "DESIGNED",
                        attributes:
                          attrName && newClsKind !== "INTERFACE"
                            ? [
                                {
                                  memberId: `${classifierId}:attr:0`,
                                  kind: "FIELD",
                                  name: attrIsDerived ? `/${attrName}` : attrName,
                                  type: attrType || "String",
                                  visibility: "PRIVATE",
                                  isStatic: false,
                                  isAbstract: false,
                                  isDerived: attrIsDerived,
                                  signatureKey: `${attrIsDerived ? "/" : ""}${attrName}:${attrType || "String"}`,
                                  parameters: [],
                                  provenance: "DESIGNED",
                                },
                              ]
                            : [],
                        operations: newClsMemberSig.trim()
                          ? [
                              {
                                memberId: `${classifierId}:op:0`,
                                kind: "METHOD",
                                name: newClsMemberSig.trim().split("(")[0] || "execute",
                                type: newClsMemberSig.includes(":")
                                  ? newClsMemberSig.slice(newClsMemberSig.lastIndexOf(":") + 1).trim()
                                  : "void",
                                visibility: "PUBLIC",
                                isStatic: false,
                                isAbstract: newClsKind === "INTERFACE",
                                signatureKey: newClsMemberSig.trim(),
                                parameters: [],
                                provenance: "DESIGNED",
                              },
                            ]
                          : [],
                        provenance: "DESIGNED",
                        evidenceIds: [],
                      },
                    ],
                  }));
                }}
              >
                + Add Designed Classifier
              </Button>
            </div>

            {projection.classifiers.length >= 2 && (
              <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-dashed">
                <div className="min-w-[180px]">
                  <SelectField
                    label="From Classifier"
                    value={designRelFrom || projection.classifiers[0]!.classifierId}
                    onChange={setDesignRelFrom}
                    options={projection.classifiers.map((c) => ({
                      value: c.classifierId,
                      label: `${c.name} (${c.provenance})`,
                    }))}
                  />
                </div>
                <div className="min-w-[180px]">
                  <SelectField
                    label="To Classifier"
                    value={
                      designRelTo ||
                      projection.classifiers[1]?.classifierId ||
                      projection.classifiers[0]!.classifierId
                    }
                    onChange={setDesignRelTo}
                    options={projection.classifiers.map((c) => ({
                      value: c.classifierId,
                      label: `${c.name} (${c.provenance})`,
                    }))}
                  />
                </div>
                <div className="min-w-[170px]">
                  <SelectField
                    label="Designed relationship kind"
                    value={designRelKind}
                    onChange={(v) => setDesignRelKind(v as UmlRelationKind)}
                    options={[
                      { value: "COMPOSITION", label: "Composition (filled diamond)" },
                      { value: "SHARED_AGGREGATION", label: "Shared Aggregation (hollow diamond)" },
                      { value: "ASSOCIATION", label: "Association" },
                      { value: "DEPENDENCY", label: "Dependency" },
                      { value: "REALIZATION", label: "Realization" },
                      { value: "GENERALIZATION", label: "Generalization" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Source Role</label>
                  <input
                    className="h-9 w-24 rounded-md border bg-background px-2 text-xs"
                    value={designRelSourceRole}
                    onChange={(e) => setDesignRelSourceRole(e.target.value)}
                    data-testid="uml-class-rel-source-role"
                  />
                </div>
                <div className="min-w-[100px]">
                  <SelectField
                    label="Source Mult."
                    value={designSourceMultiplicity}
                    onChange={setDesignSourceMultiplicity}
                    options={[
                      { value: "1", label: "1" },
                      { value: "0..1", label: "0..1" },
                      { value: "1..*", label: "1..*" },
                      { value: "0..*", label: "0..*" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Target Role</label>
                  <input
                    className="h-9 w-28 rounded-md border bg-background px-2 text-xs"
                    value={designRelRole}
                    onChange={(e) => setDesignRelRole(e.target.value)}
                    data-testid="uml-class-rel-role"
                  />
                </div>
                <div className="min-w-[110px]">
                  <SelectField
                    label="Target Mult."
                    value={designMultiplicity}
                    onChange={setDesignMultiplicity}
                    options={[
                      { value: "1..*", label: "1..*" },
                      { value: "0..*", label: "0..*" },
                      { value: "1", label: "1" },
                      { value: "0..1", label: "0..1" },
                    ]}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="uml-add-designed-class-relation"
                  onClick={() => {
                    const fromId = designRelFrom || projection.classifiers[0]!.classifierId;
                    const toId =
                      designRelTo ||
                      projection.classifiers[1]?.classifierId ||
                      projection.classifiers[0]!.classifierId;
                    clearDraftConflictState();
                    const relId = `designed:rel:${fromId}->${toId}:${designRelKind}`;
                    setClassOverlay((prev) => ({
                      ...prev,
                      designedRelations: [
                        ...(prev.designedRelations ?? []).filter((r) => r.relationId !== relId),
                        {
                          relationId: relId,
                          sourceRelationshipId: null,
                          fromClassifierId: fromId,
                          toClassifierId: toId,
                          relationKind: designRelKind,
                          sourceRoleName: designRelSourceRole.trim() || null,
                          sourceMultiplicity: designSourceMultiplicity,
                          roleName: designRelRole.trim() || null,
                          multiplicity: designMultiplicity,
                          provenance: "DESIGNED",
                          evidenceIds: [],
                        },
                      ],
                    }));
                  }}
                >
                  + Add Designed {designRelKind}
                </Button>
              </div>
            )}

            {((classOverlay.designedClassifiers?.length ?? 0) > 0 ||
              (classOverlay.designedRelations?.length ?? 0) > 0) && (
              <div
                className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed text-xs"
                data-testid="uml-designed-items-list"
              >
                <span className="font-semibold text-sky-900">Designed Overlay Items:</span>
                {(classOverlay.designedClassifiers ?? []).map((c) => (
                  <span
                    key={c.classifierId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [Classifier] {c.name}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      data-testid={`uml-remove-designed-${c.name}`}
                      onClick={() => {
                        clearDraftConflictState();
                        setClassOverlay((prev) => ({
                          designedClassifiers: (prev.designedClassifiers ?? []).filter(
                            (x) => x.classifierId !== c.classifierId,
                          ),
                          designedRelations: (prev.designedRelations ?? []).filter(
                            (r) =>
                              r.fromClassifierId !== c.classifierId &&
                              r.toClassifierId !== c.classifierId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(classOverlay.designedRelations ?? []).map((r) => (
                  <span
                    key={r.relationId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [{r.relationKind}] {r.roleName || r.relationId}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      data-testid={`uml-remove-designed-rel-${r.relationKind}`}
                      onClick={() => {
                        clearDraftConflictState();
                        setClassOverlay((prev) => ({
                          ...prev,
                          designedRelations: (prev.designedRelations ?? []).filter(
                            (x) => x.relationId !== r.relationId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* M5 UML_PACKAGE STRUCTURED DESIGNED AUTHORING                          */}
        {/* ===================================================================== */}
        {projection.diagramKind === "UML_PACKAGE" && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Designed Package Qualified Name</label>
                <input
                  className="h-9 w-64 rounded-md border bg-background px-2.5 text-xs"
                  value={newPkgName}
                  onChange={(e) => setNewPkgName(e.target.value)}
                  placeholder="com.example.orders.contracts"
                  data-testid="uml-pkg-input-name"
                />
              </div>
              <div className="min-w-[170px]">
                <SelectField
                  label="Parent Package (Nesting)"
                  value={newPkgParent}
                  onChange={setNewPkgParent}
                  options={[
                    { value: "", label: "(Top-level package)" },
                    ...projection.packages.map((p) => ({
                      value: p.packageId,
                      label: p.qualifiedName,
                    })),
                  ]}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                data-testid="uml-add-designed-package"
                onClick={() => {
                  const qName = newPkgName.trim();
                  if (!qName) return;
                  clearDraftConflictState();
                  const shortName = qName.includes(".")
                    ? qName.slice(qName.lastIndexOf(".") + 1)
                    : qName;
                  const pkgId = `designed:pkg:${serviceId || "global"}:${qName}`;
                  setPackageOverlay((prev) => ({
                    ...prev,
                    designedPackages: [
                      ...(prev.designedPackages ?? []).filter((p) => p.packageId !== pkgId),
                      {
                        packageId: pkgId,
                        name: shortName,
                        qualifiedName: qName,
                        parentPackageId: newPkgParent || null,
                        serviceId: serviceId || null,
                        memberClassifierIds: [],
                        memberNames: [],
                        provenance: "DESIGNED",
                      },
                    ],
                  }));
                }}
              >
                + Add Designed Package
              </Button>

              {projection.packages.length >= 2 && (
                <>
                  <div className="min-w-[180px]">
                    <SelectField
                      label="From Package"
                      value={designPkgFrom || projection.packages[0]!.packageId}
                      onChange={setDesignPkgFrom}
                      options={projection.packages.map((p) => ({
                        value: p.packageId,
                        label: `${p.qualifiedName} (${p.serviceId ?? "designed"})`,
                      }))}
                    />
                  </div>
                  <div className="min-w-[180px]">
                    <SelectField
                      label="To Package"
                      value={
                        designPkgTo ||
                        projection.packages[1]?.packageId ||
                        projection.packages[0]!.packageId
                      }
                      onChange={setDesignPkgTo}
                      options={projection.packages.map((p) => ({
                        value: p.packageId,
                        label: `${p.qualifiedName} (${p.serviceId ?? "designed"})`,
                      }))}
                    />
                  </div>
                  <div className="min-w-[140px]">
                    <SelectField
                      label="Stereotype"
                      value={designPkgKind}
                      onChange={(v) => setDesignPkgKind(v as UmlPackageRelationKind)}
                      options={[
                        { value: "IMPORT", label: "«import»" },
                        { value: "ACCESS", label: "«access»" },
                        { value: "MERGE", label: "«merge»" },
                        { value: "DEPENDENCY", label: "«use» / Dependency" },
                      ]}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="uml-add-designed-package-import"
                    onClick={() => {
                      const fromPkg = designPkgFrom || projection.packages[0]!.packageId;
                      const toPkg =
                        designPkgTo ||
                        projection.packages[1]?.packageId ||
                        projection.packages[0]!.packageId;
                      clearDraftConflictState();
                      const edgeId = `designed:pkg-edge:${fromPkg}->${toPkg}:${designPkgKind}`;
                      setPackageOverlay((prev) => ({
                        ...prev,
                        designedEdges: [
                          ...(prev.designedEdges ?? []).filter((e) => e.edgeId !== edgeId),
                          {
                            edgeId,
                            fromPackageId: fromPkg,
                            toPackageId: toPkg,
                            relationKind: designPkgKind,
                            underlyingEdgeIds: [],
                            evidenceIds: [],
                            provenance: "DESIGNED",
                          },
                        ],
                      }));
                    }}
                  >
                    + Add Designed «{designPkgKind.toLowerCase()}»
                  </Button>
                </>
              )}
            </div>

            {((packageOverlay.designedPackages?.length ?? 0) > 0 ||
              (packageOverlay.designedEdges?.length ?? 0) > 0) && (
              <div
                className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed text-xs"
                data-testid="uml-designed-package-items"
              >
                <span className="font-semibold text-sky-900">Designed Package Items:</span>
                {(packageOverlay.designedPackages ?? []).map((p) => (
                  <span
                    key={p.packageId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [Package] {p.qualifiedName}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      data-testid={`uml-remove-designed-pkg-${p.qualifiedName}`}
                      onClick={() => {
                        clearDraftConflictState();
                        setPackageOverlay((prev) => ({
                          designedPackages: (prev.designedPackages ?? []).filter(
                            (x) => x.packageId !== p.packageId,
                          ),
                          designedEdges: (prev.designedEdges ?? []).filter(
                            (e) =>
                              e.fromPackageId !== p.packageId && e.toPackageId !== p.packageId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(packageOverlay.designedEdges ?? []).map((e) => (
                  <span
                    key={e.edgeId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [«{e.relationKind.toLowerCase()}»] {e.fromPackageId} → {e.toPackageId}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      onClick={() => {
                        clearDraftConflictState();
                        setPackageOverlay((prev) => ({
                          ...prev,
                          designedEdges: (prev.designedEdges ?? []).filter(
                            (x) => x.edgeId !== e.edgeId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* M5 UML_DEPLOYMENT STRUCTURED DESIGNED AUTHORING                       */}
        {/* ===================================================================== */}
        {projection.diagramKind === "UML_DEPLOYMENT" && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px]">
                <SelectField
                  label="Deployment Environment"
                  value={projection.environment}
                  onChange={(v) => {
                    clearDraftConflictState();
                    setEnvironmentFilter(v);
                  }}
                  options={projection.availableEnvironments.map((env) => ({
                    value: env,
                    label: `Environment · ${env}`,
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
                  ? "Hide Compose startup-order overlay"
                  : `Show Compose startup-order overlay (${projection.excludedComposeStartupEdgesCount} excluded from CommunicationPath)`}
              </Button>
              <div className="space-y-1">
                <label className="text-xs font-medium">Designed Node / Artifact Name</label>
                <input
                  className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  value={newDeployName}
                  onChange={(e) => setNewDeployName(e.target.value)}
                  data-testid="uml-deploy-input-name"
                />
              </div>
              <div className="min-w-[170px]">
                <SelectField
                  label="Node Kind"
                  value={newDeployKind}
                  onChange={(v) => setNewDeployKind(v as UmlDeploymentNodeKind)}
                  options={[
                    { value: "DEPLOYMENT_SPECIFICATION", label: "«deployment spec»" },
                    { value: "EXECUTION_ENVIRONMENT", label: "«executionEnvironment»" },
                    { value: "DEVICE", label: "«device»" },
                    { value: "ARTIFACT", label: "«artifact»" },
                    { value: "MANIFESTED_COMPONENT", label: "«component»" },
                  ]}
                />
              </div>
              <div className="min-w-[160px]">
                <SelectField
                  label="Host / Parent Node"
                  value={newDeployParent}
                  onChange={setNewDeployParent}
                  options={[
                    { value: "", label: "(Top-level node)" },
                    ...projection.nodes
                      .filter((n) => !n.parentNodeId)
                      .map((n) => ({ value: n.nodeId, label: n.name })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Ports</label>
                <input
                  className="h-9 w-28 rounded-md border bg-background px-2 text-xs"
                  value={newDeployPorts}
                  onChange={(e) => setNewDeployPorts(e.target.value)}
                  data-testid="uml-deploy-input-ports"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                data-testid="uml-add-designed-deployment-spec"
                onClick={() => {
                  const name = newDeployName.trim();
                  if (!name) return;
                  clearDraftConflictState();
                  const nodeId = `designed:deploy:${projection.environment}:${name}`;
                  const stereotype =
                    newDeployKind === "DEPLOYMENT_SPECIFICATION"
                      ? "«deployment spec»"
                      : newDeployKind === "EXECUTION_ENVIRONMENT"
                        ? "«executionEnvironment»"
                        : newDeployKind === "DEVICE"
                          ? "«device»"
                          : newDeployKind === "ARTIFACT"
                            ? "«artifact»"
                            : "«component»";
                  setDeploymentOverlay((prev) => ({
                    ...prev,
                    designedNodes: [
                      ...(prev.designedNodes ?? []).filter((n) => n.nodeId !== nodeId),
                      {
                        nodeId,
                        modelElementId: null,
                        name,
                        nodeKind: newDeployKind,
                        parentNodeId: newDeployParent || null,
                        environment: projection.environment,
                        stereotype,
                        ports: newDeployPorts
                          .split(",")
                          .map((p) => p.trim())
                          .filter(Boolean),
                        instanceName: null,
                        replicaCount: newDeployKind === "DEPLOYMENT_SPECIFICATION" ? 2 : null,
                        properties: { executionMode: "HA-Replicated" },
                        provenance: "DESIGNED",
                        evidenceIds: [],
                      },
                    ],
                  }));
                }}
              >
                + Add Designed Node
              </Button>
            </div>

            {projection.nodes.length >= 2 && (
              <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-dashed">
                <div className="min-w-[180px]">
                  <SelectField
                    label="From Deployment Node"
                    value={designDeployFrom || projection.nodes[0]!.nodeId}
                    onChange={setDesignDeployFrom}
                    options={projection.nodes.map((n) => ({
                      value: n.nodeId,
                      label: `${n.stereotype} ${n.name}`,
                    }))}
                  />
                </div>
                <div className="min-w-[180px]">
                  <SelectField
                    label="To Deployment Node"
                    value={
                      designDeployTo ||
                      projection.nodes[1]?.nodeId ||
                      projection.nodes[0]!.nodeId
                    }
                    onChange={setDesignDeployTo}
                    options={projection.nodes.map((n) => ({
                      value: n.nodeId,
                      label: `${n.stereotype} ${n.name}`,
                    }))}
                  />
                </div>
                <div className="min-w-[170px]">
                  <SelectField
                    label="Edge Kind"
                    value={designDeployEdgeKind}
                    onChange={(v) => setDesignDeployEdgeKind(v as UmlDeploymentEdgeKind)}
                    options={[
                      { value: "COMMUNICATION_PATH", label: "CommunicationPath" },
                      { value: "MANIFESTATION", label: "«manifest»" },
                      { value: "DEPLOYMENT_DEPENDENCY_STARTUP", label: "«depends_on» Startup" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Protocol / Label</label>
                  <input
                    className="h-9 w-28 rounded-md border bg-background px-2 text-xs"
                    value={designDeployProtocol}
                    onChange={(e) => setDesignDeployProtocol(e.target.value)}
                    data-testid="uml-deploy-edge-label"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="uml-add-designed-deployment-edge"
                  onClick={() => {
                    const fromId = designDeployFrom || projection.nodes[0]!.nodeId;
                    const toId =
                      designDeployTo ||
                      projection.nodes[1]?.nodeId ||
                      projection.nodes[0]!.nodeId;
                    clearDraftConflictState();
                    const edgeId = `designed:deploy-edge:${fromId}->${toId}:${designDeployEdgeKind}`;
                    setDeploymentOverlay((prev) => ({
                      ...prev,
                      designedEdges: [
                        ...(prev.designedEdges ?? []).filter((e) => e.edgeId !== edgeId),
                        {
                          edgeId,
                          sourceRelationshipId: null,
                          fromNodeId: fromId,
                          toNodeId: toId,
                          edgeKind: designDeployEdgeKind,
                          protocol: designDeployProtocol.trim() || "TCP",
                          port: null,
                          label: `[DESIGNED] ${designDeployProtocol.trim() || designDeployEdgeKind}`,
                          provenance: "DESIGNED",
                          evidenceIds: [],
                        },
                      ],
                    }));
                  }}
                >
                  + Add Designed Deployment Edge
                </Button>
              </div>
            )}

            {((deploymentOverlay.designedNodes?.length ?? 0) > 0 ||
              (deploymentOverlay.designedEdges?.length ?? 0) > 0) && (
              <div
                className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed text-xs"
                data-testid="uml-designed-deployment-items"
              >
                <span className="font-semibold text-sky-900">Designed Deployment Items:</span>
                {(deploymentOverlay.designedNodes ?? []).map((n) => (
                  <span
                    key={n.nodeId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [{n.stereotype}] {n.name}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      data-testid={`uml-remove-designed-deploy-${n.name}`}
                      onClick={() => {
                        clearDraftConflictState();
                        setDeploymentOverlay((prev) => ({
                          ...prev,
                          designedNodes: (prev.designedNodes ?? []).filter(
                            (x) => x.nodeId !== n.nodeId,
                          ),
                          designedEdges: (prev.designedEdges ?? []).filter(
                            (e) => e.fromNodeId !== n.nodeId && e.toNodeId !== n.nodeId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(deploymentOverlay.designedEdges ?? []).map((e) => (
                  <span
                    key={e.edgeId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [{e.edgeKind}] {e.label}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      onClick={() => {
                        clearDraftConflictState();
                        setDeploymentOverlay((prev) => ({
                          ...prev,
                          designedEdges: (prev.designedEdges ?? []).filter(
                            (x) => x.edgeId !== e.edgeId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* M6 UML_ACTIVITY STRUCTURED DESIGNED AUTHORING                         */}
        {/* ===================================================================== */}
        {projection.diagramKind === "UML_ACTIVITY" && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[280px]">
                <SelectField
                  label="Operation / Workflow Scope"
                  value={projection.selectedOperationId}
                  onChange={(v) => {
                    clearDraftConflictState();
                    setSelectedOperationId(v);
                  }}
                  options={
                    projection.availableOperations.length > 0
                      ? projection.availableOperations.map((op) => ({
                          value: op.operationId,
                          label: `${op.serviceName} · ${op.classifierName}.${op.signatureKey} [${op.extractionCompleteness}]`,
                        }))
                      : [{ value: "designed", label: "Designed Workflow" }]
                  }
                />
              </div>
              <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800">
                Completeness: {projection.extractionCompleteness}
              </span>
              <div className="space-y-1">
                <label className="text-xs font-medium">Designed Node Label</label>
                <input
                  className="h-9 rounded-md border bg-background px-2.5 text-xs"
                  value={newActNodeLabel}
                  onChange={(e) => setNewActNodeLabel(e.target.value)}
                  data-testid="uml-act-input-label"
                />
              </div>
              <div className="min-w-[150px]">
                <SelectField
                  label="Activity Node Kind"
                  value={newActNodeKind}
                  onChange={(v) => setNewActNodeKind(v as UmlActivityNodeKind)}
                  options={[
                    { value: "ACTION", label: "Action" },
                    { value: "DECISION", label: "Decision" },
                    { value: "MERGE", label: "Merge" },
                    { value: "FORK", label: "Fork" },
                    { value: "JOIN", label: "Join" },
                    { value: "OBJECT_NODE", label: "ObjectNode" },
                    { value: "INITIAL", label: "InitialNode" },
                    { value: "ACTIVITY_FINAL", label: "ActivityFinalNode" },
                    { value: "FLOW_FINAL", label: "FlowFinalNode" },
                  ]}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                data-testid="uml-add-designed-activity-node"
                onClick={() => {
                  const label = newActNodeLabel.trim();
                  if (!label) return;
                  clearDraftConflictState();
                  const part = projection.partitions[0] ?? {
                    partitionId: "partition:designed",
                    name: "Designed Service Partition",
                  };
                  const nodeId = `designed:act:node:${label.replaceAll(/\s+/g, "_")}`;
                  setActivityOverlay((prev) => ({
                    ...prev,
                    designedNodes: [
                      ...(prev.designedNodes ?? []).filter((n) => n.nodeId !== nodeId),
                      {
                        nodeId,
                        kind: newActNodeKind,
                        label,
                        partitionId: part.partitionId,
                        partitionName: part.name,
                        objectState: newActNodeKind === "OBJECT_NODE" ? "DESIGNED" : null,
                        joinSpec: newActNodeKind === "JOIN" ? "AND" : null,
                        provenance: "DESIGNED",
                      },
                    ],
                  }));
                }}
              >
                + Add Designed Activity Node
              </Button>
            </div>

            {projection.nodes.length >= 2 && (
              <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-dashed">
                <div className="min-w-[180px]">
                  <SelectField
                    label="From Activity Node"
                    value={designActFrom || projection.nodes[0]!.nodeId}
                    onChange={setDesignActFrom}
                    options={projection.nodes.map((n) => ({
                      value: n.nodeId,
                      label: `[${n.kind}] ${n.label}`,
                    }))}
                  />
                </div>
                <div className="min-w-[180px]">
                  <SelectField
                    label="To Activity Node"
                    value={
                      designActTo ||
                      projection.nodes[1]?.nodeId ||
                      projection.nodes[0]!.nodeId
                    }
                    onChange={setDesignActTo}
                    options={projection.nodes.map((n) => ({
                      value: n.nodeId,
                      label: `[${n.kind}] ${n.label}`,
                    }))}
                  />
                </div>
                <div className="min-w-[150px]">
                  <SelectField
                    label="Flow Kind"
                    value={designActFlowKind}
                    onChange={(v) => setDesignActFlowKind(v as "CONTROL_FLOW" | "OBJECT_FLOW")}
                    options={[
                      { value: "CONTROL_FLOW", label: "ControlFlow" },
                      { value: "OBJECT_FLOW", label: "ObjectFlow" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Guard Condition</label>
                  <input
                    className="h-9 w-32 rounded-md border bg-background px-2 text-xs"
                    value={designActGuard}
                    onChange={(e) => setDesignActGuard(e.target.value)}
                    placeholder="[else]"
                    data-testid="uml-act-edge-guard"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="uml-add-designed-activity-edge"
                  onClick={() => {
                    const fromId = designActFrom || projection.nodes[0]!.nodeId;
                    const toId =
                      designActTo ||
                      projection.nodes[1]?.nodeId ||
                      projection.nodes[0]!.nodeId;
                    clearDraftConflictState();
                    const edgeId = `designed:act:edge:${fromId}->${toId}`;
                    setActivityOverlay((prev) => ({
                      ...prev,
                      designedEdges: [
                        ...(prev.designedEdges ?? []).filter((e) => e.edgeId !== edgeId),
                        {
                          edgeId,
                          from: fromId,
                          to: toId,
                          flowKind: designActFlowKind,
                          guard: designActGuard.trim() || null,
                          provenance: "DESIGNED",
                        },
                      ],
                    }));
                  }}
                >
                  + Add Designed Activity Flow
                </Button>
              </div>
            )}

            {((activityOverlay.designedNodes?.length ?? 0) > 0 ||
              (activityOverlay.designedEdges?.length ?? 0) > 0) && (
              <div
                className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed text-xs"
                data-testid="uml-designed-activity-items"
              >
                <span className="font-semibold text-sky-900">Designed Activity Items:</span>
                {(activityOverlay.designedNodes ?? []).map((n) => (
                  <span
                    key={n.nodeId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [{n.kind}] {n.label}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      data-testid={`uml-remove-designed-act-${n.label}`}
                      onClick={() => {
                        clearDraftConflictState();
                        setActivityOverlay((prev) => ({
                          designedNodes: (prev.designedNodes ?? []).filter(
                            (x) => x.nodeId !== n.nodeId,
                          ),
                          designedEdges: (prev.designedEdges ?? []).filter(
                            (e) => e.from !== n.nodeId && e.to !== n.nodeId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(activityOverlay.designedEdges ?? []).map((e) => (
                  <span
                    key={e.edgeId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [{e.flowKind}] {e.from} → {e.to}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      onClick={() => {
                        clearDraftConflictState();
                        setActivityOverlay((prev) => ({
                          ...prev,
                          designedEdges: (prev.designedEdges ?? []).filter(
                            (x) => x.edgeId !== e.edgeId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* M7 UML_STATE STRUCTURED DESIGNED AUTHORING                            */}
        {/* ===================================================================== */}
        {projection.diagramKind === "UML_STATE" && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px]">
                <SelectField
                  label="Entity / State Machine Target"
                  value={projection.selectedTargetId}
                  onChange={(v) => {
                    clearDraftConflictState();
                    setSelectedStateTargetId(v);
                  }}
                  options={
                    projection.availableTargets.length > 0
                      ? projection.availableTargets.map((t) => ({
                          value: t.targetId,
                          label: `${t.classifierName} (${t.lifecycleKind}${t.enumOnlyNoTransitions ? " · Enum-only" : ""})`,
                        }))
                      : [{ value: "designed", label: "Designed State Machine" }]
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Designed State Name</label>
                <input
                  className="h-9 w-36 rounded-md border bg-background px-2.5 text-xs"
                  value={newStateName}
                  onChange={(e) => setNewStateName(e.target.value)}
                  data-testid="uml-state-input-name"
                />
              </div>
              <div className="min-w-[140px]">
                <SelectField
                  label="State Kind"
                  value={newStateKind}
                  onChange={(v) => setNewStateKind(v as UmlStateNodeKind)}
                  options={[
                    { value: "STATE", label: "State" },
                    { value: "INITIAL", label: "Initial Pseudostate" },
                    { value: "FINAL_STATE", label: "FinalState" },
                    { value: "CHOICE", label: "Choice Pseudostate" },
                    { value: "COMPOSITE_STATE", label: "CompositeState" },
                    { value: "SHALLOW_HISTORY", label: "Shallow History (H)" },
                    { value: "DEEP_HISTORY", label: "Deep History (H*)" },
                  ]}
                />
              </div>
              <div className="min-w-[170px]">
                <SelectField
                  label="Parent Composite State"
                  value={newStateParent}
                  onChange={setNewStateParent}
                  options={[
                    { value: "", label: "(Top-level region)" },
                    ...projection.states
                      .filter((s) => s.kind === "COMPOSITE_STATE" || s.kind === "STATE")
                      .map((s) => ({
                        value: s.stateId,
                        label: `${s.name} (${s.kind})`,
                      })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">entry / behavior</label>
                <input
                  className="h-9 w-40 rounded-md border bg-background px-2 text-xs"
                  value={newStateEntry}
                  onChange={(e) => setNewStateEntry(e.target.value)}
                  data-testid="uml-state-input-entry"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">do / activity</label>
                <input
                  className="h-9 w-32 rounded-md border bg-background px-2 text-xs"
                  value={newStateDo}
                  onChange={(e) => setNewStateDo(e.target.value)}
                  data-testid="uml-state-input-do"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">exit / behavior</label>
                <input
                  className="h-9 w-32 rounded-md border bg-background px-2 text-xs"
                  value={newStateExit}
                  onChange={(e) => setNewStateExit(e.target.value)}
                  data-testid="uml-state-input-exit"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                data-testid="uml-add-designed-state-node"
                onClick={() => {
                  const name = newStateName.trim();
                  if (!name) return;
                  clearDraftConflictState();
                  const stateId = `designed:state:${projection.selectedTargetId}:${name}`;
                  setStateOverlay((prev) => ({
                    ...prev,
                    designedStates: [
                      ...(prev.designedStates ?? []).filter((s) => s.stateId !== stateId),
                      {
                        stateId,
                        name,
                        kind: newStateKind,
                        regionId: projection.regionId,
                        parentStateId: newStateParent || null,
                        entryBehavior: newStateEntry.trim() || null,
                        doActivity: newStateDo.trim() || null,
                        exitBehavior: newStateExit.trim() || null,
                        provenance: "DESIGNED",
                      },
                    ],
                  }));
                }}
              >
                + Add Designed State
              </Button>
            </div>

            {projection.states.length >= 2 && (
              <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-dashed">
                <div className="min-w-[160px]">
                  <SelectField
                    label="From State"
                    value={designStateFrom || projection.states[0]!.stateId}
                    onChange={setDesignStateFrom}
                    options={projection.states.map((s) => ({
                      value: s.stateId,
                      label: `${s.name} (${s.provenance})`,
                    }))}
                  />
                </div>
                <div className="min-w-[160px]">
                  <SelectField
                    label="To State"
                    value={
                      designStateTo ||
                      projection.states[1]?.stateId ||
                      projection.states[0]!.stateId
                    }
                    onChange={setDesignStateTo}
                    options={projection.states.map((s) => ({
                      value: s.stateId,
                      label: `${s.name} (${s.provenance})`,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Trigger</label>
                  <input
                    className="h-9 w-32 rounded-md border bg-background px-2 text-xs"
                    value={designStateTrigger}
                    onChange={(e) => setDesignStateTrigger(e.target.value)}
                    data-testid="uml-state-tr-trigger"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Guard</label>
                  <input
                    className="h-9 w-32 rounded-md border bg-background px-2 text-xs"
                    value={designStateGuard}
                    onChange={(e) => setDesignStateGuard(e.target.value)}
                    data-testid="uml-state-tr-guard"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Effect</label>
                  <input
                    className="h-9 w-36 rounded-md border bg-background px-2 text-xs"
                    value={designStateEffect}
                    onChange={(e) => setDesignStateEffect(e.target.value)}
                    data-testid="uml-state-tr-effect"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="uml-add-designed-state-transition"
                  onClick={() => {
                    const fromId = designStateFrom || projection.states[0]!.stateId;
                    const toId =
                      designStateTo ||
                      projection.states[1]?.stateId ||
                      projection.states[0]!.stateId;
                    clearDraftConflictState();
                    const transitionId = `designed:tr:${fromId}->${toId}`;
                    setStateOverlay((prev) => ({
                      ...prev,
                      designedTransitions: [
                        ...(prev.designedTransitions ?? []).filter(
                          (t) => t.transitionId !== transitionId,
                        ),
                        {
                          transitionId,
                          fromStateId: fromId,
                          toStateId: toId,
                          trigger: designStateTrigger.trim() || null,
                          guard: designStateGuard.trim() || null,
                          effect: designStateEffect.trim() || null,
                          provenance: "DESIGNED",
                        },
                      ],
                    }));
                  }}
                >
                  + Add Designed Transition
                </Button>
              </div>
            )}

            {((stateOverlay.designedStates?.length ?? 0) > 0 ||
              (stateOverlay.designedTransitions?.length ?? 0) > 0) && (
              <div
                className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed text-xs"
                data-testid="uml-designed-state-items"
              >
                <span className="font-semibold text-sky-900">Designed State Items:</span>
                {(stateOverlay.designedStates ?? []).map((s) => (
                  <span
                    key={s.stateId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [{s.kind}] {s.name}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      data-testid={`uml-remove-designed-state-${s.name}`}
                      onClick={() => {
                        clearDraftConflictState();
                        setStateOverlay((prev) => ({
                          designedStates: (prev.designedStates ?? []).filter(
                            (x) => x.stateId !== s.stateId,
                          ),
                          designedTransitions: (prev.designedTransitions ?? []).filter(
                            (t) => t.fromStateId !== s.stateId && t.toStateId !== s.stateId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(stateOverlay.designedTransitions ?? []).map((t) => (
                  <span
                    key={t.transitionId}
                    className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-sky-950"
                  >
                    [Transition] {t.fromStateId} → {t.toStateId}
                    <button
                      type="button"
                      className="ml-1 font-bold text-rose-700 hover:underline"
                      onClick={() => {
                        clearDraftConflictState();
                        setStateOverlay((prev) => ({
                          ...prev,
                          designedTransitions: (prev.designedTransitions ?? []).filter(
                            (x) => x.transitionId !== t.transitionId,
                          ),
                        }));
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Validation & Diagnostic Banners */}
        {effectiveProjection.validationIssues.length > 0 && (
          <div
            className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 space-y-1"
            data-testid="uml-validation-banner"
          >
            <p className="text-xs font-semibold text-amber-900">
              UML Semantic & Structural Diagnostics ({effectiveProjection.validationIssues.length})
            </p>
            <ul className="list-disc pl-4 text-xs text-amber-900 space-y-0.5">
              {effectiveProjection.validationIssues.map((iss, idx) => (
                <li key={`${iss.code}-${idx}`}>
                  <span className="font-mono font-semibold">[{iss.code}]</span> ({iss.severity}):{" "}
                  {iss.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Interactive Elements & Relationships Inspector Bar (for 3E Selection) */}
        <div className="rounded-xl border bg-slate-50/60 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Click any diagram element below or on the Draw.io canvas to inspect 3E (Explanation ·
            Evidence · Evaluation):
          </p>
          <div className="flex flex-wrap gap-1.5" data-testid="uml-interactive-items">
            {effectiveProjection.diagramKind === "UML_CLASS" &&
              effectiveProjection.classifiers.map((cls) => (
                <Button
                  key={cls.classifierId}
                  size="sm"
                  variant={selectedId === cls.classifierId ? "default" : "outline"}
                  onClick={() => handleSelectItem(cls.classifierId)}
                  data-testid={`uml-item-${cls.name}`}
                >
                  {cls.classifierKind === "INTERFACE"
                    ? `«interface» ${cls.name}`
                    : cls.classifierKind === "ENUM"
                      ? `«enum» ${cls.name}`
                      : cls.name}{" "}
                  ({cls.operations.length} ops)
                </Button>
              ))}
            {effectiveProjection.diagramKind === "UML_PACKAGE" &&
              effectiveProjection.packages.map((pkg) => (
                <Button
                  key={pkg.packageId}
                  size="sm"
                  variant={selectedId === pkg.packageId ? "default" : "outline"}
                  onClick={() => handleSelectItem(pkg.packageId)}
                  data-testid={`uml-item-${pkg.qualifiedName}`}
                >
                  «package» {pkg.qualifiedName} ({pkg.memberClassifierIds.length})
                </Button>
              ))}
            {effectiveProjection.diagramKind === "UML_DEPLOYMENT" &&
              effectiveProjection.nodes.map((n) => (
                <Button
                  key={n.nodeId}
                  size="sm"
                  variant={
                    selectedId === n.modelElementId || selectedId === n.nodeId
                      ? "default"
                      : "outline"
                  }
                  onClick={() => handleSelectItem(n.nodeId)}
                  data-testid={`uml-item-${n.name}`}
                >
                  {n.stereotype} {n.name}
                </Button>
              ))}
            {effectiveProjection.diagramKind === "UML_ACTIVITY" &&
              effectiveProjection.nodes.map((n) => (
                <Button
                  key={n.nodeId}
                  size="sm"
                  variant={selectedId === n.nodeId ? "default" : "outline"}
                  onClick={() => handleSelectItem(n.nodeId)}
                  data-testid={`uml-item-${n.nodeId}`}
                >
                  [{n.kind}] {n.label}
                </Button>
              ))}
            {effectiveProjection.diagramKind === "UML_STATE" &&
              effectiveProjection.states.map((st) => (
                <Button
                  key={st.stateId}
                  size="sm"
                  variant={selectedId === st.stateId ? "default" : "outline"}
                  onClick={() => handleSelectItem(st.stateId)}
                  data-testid={`uml-item-${st.name}`}
                >
                  [{st.kind}] {st.name}
                </Button>
              ))}
          </div>
        </div>
      </details>
    </div>
  );
}

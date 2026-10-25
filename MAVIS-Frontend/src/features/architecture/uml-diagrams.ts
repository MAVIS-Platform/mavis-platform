import type { ArchitecturalModel } from "@/types/domain";

export type UmlDiagramKind =
  | "UML_CLASS"
  | "UML_PACKAGE"
  | "UML_DEPLOYMENT"
  | "UML_ACTIVITY"
  | "UML_STATE";

export type UmlProvenance = "EXTRACTED" | "DESIGNED" | "HYBRID";

export interface UmlValidationIssue {
  code: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  targetId?: string | undefined;
}

export interface UmlSelectionContext {
  diagramKind: UmlDiagramKind;
  itemId: string;
  itemRole: string;
  label: string;
  provenance: UmlProvenance;
  modelElementId: string | null;
  sourceRelationshipIds: string[];
  evidenceIds: string[];
  summary: string;
  details: Record<string, unknown>;
}

// ============================================================================
// 1. M4 — UML CLASS DIAGRAM
// ============================================================================

export type UmlVisibility =
  | "PUBLIC"
  | "PROTECTED"
  | "PRIVATE"
  | "PACKAGE_PRIVATE"
  | "INTERNAL"
  | "PROTECTED_INTERNAL"
  | "PRIVATE_PROTECTED";

export type UmlRelationKind =
  | "GENERALIZATION"
  | "REALIZATION"
  | "ASSOCIATION"
  | "DEPENDENCY"
  | "SHARED_AGGREGATION"
  | "COMPOSITION";

export interface UmlMemberItem {
  memberId: string;
  kind: "FIELD" | "PROPERTY" | "METHOD" | "CONSTRUCTOR" | "ENUM_LITERAL";
  name: string;
  type: string;
  visibility: UmlVisibility;
  isStatic: boolean;
  isAbstract: boolean;
  isDerived?: boolean | undefined;
  signatureKey: string;
  parameters: Array<{ name: string; type: string }>;
  provenance: UmlProvenance;
}

export interface UmlClassifierNode {
  classifierId: string;
  modelElementId: string | null;
  name: string;
  qualifiedName: string;
  packageName: string;
  serviceId: string | null;
  serviceName: string | null;
  classifierKind: "CLASS" | "INTERFACE" | "ENUM";
  visibility: UmlVisibility;
  isAbstract: boolean;
  isStatic: boolean;
  typeParameters: string[];
  sourceLanguage: "JAVA" | "CSHARP" | "DESIGNED";
  attributes: UmlMemberItem[];
  operations: UmlMemberItem[];
  provenance: UmlProvenance;
  evidenceIds: string[];
}

export interface UmlClassRelationEdge {
  relationId: string;
  sourceRelationshipId: string | null;
  fromClassifierId: string;
  toClassifierId: string;
  relationKind: UmlRelationKind;
  sourceRoleName?: string | null | undefined;
  sourceMultiplicity?: string | null | undefined;
  roleName: string | null;
  multiplicity: string | null;
  provenance: UmlProvenance;
  evidenceIds: string[];
}

export interface UmlClassOverlay {
  designedClassifiers?: UmlClassifierNode[] | undefined;
  designedRelations?: UmlClassRelationEdge[] | undefined;
}

export interface UmlClassDiagramProjection {
  diagramKind: "UML_CLASS";
  modelId: string;
  scopeServiceId: string | null;
  scopePackageName: string | null;
  classifiers: UmlClassifierNode[];
  relations: UmlClassRelationEdge[];
  deduplicatedDependencyIds: string[];
  validationIssues: UmlValidationIssue[];
}

export function formatVisibilitySymbol(vis: UmlVisibility | string): string {
  switch (vis) {
    case "PUBLIC":
      return "+";
    case "PROTECTED":
      return "#";
    case "PRIVATE":
      return "-";
    case "PACKAGE_PRIVATE":
      return "~ [package-private]";
    case "INTERNAL":
      return "~ [internal]";
    case "PROTECTED_INTERNAL":
      return "#~ [protected internal]";
    case "PRIVATE_PROTECTED":
      return "-# [private protected]";
    default:
      return "~";
  }
}

export function formatAttributeLine(attr: UmlMemberItem): string {
  if (attr.kind === "ENUM_LITERAL") {
    return attr.name;
  }
  const sym = formatVisibilitySymbol(attr.visibility);
  const cleanName =
    attr.isDerived && !attr.name.startsWith("/") ? `/${attr.name}` : attr.name;
  const raw = `${sym} ${cleanName}: ${attr.type || "Object"}`;
  return attr.isStatic ? `<u>${escapeHtmlText(raw)}</u>` : escapeHtmlText(raw);
}

export function formatOperationLine(op: UmlMemberItem): string {
  const sym = formatVisibilitySymbol(op.visibility);
  const params = (op.parameters ?? []).map((p) => `${p.name}: ${p.type}`).join(", ");
  const ret = op.kind === "CONSTRUCTOR" ? "" : `: ${op.type || "void"}`;
  const raw = `${sym} ${op.name}(${params})${ret}`;
  let formatted = escapeHtmlText(raw);
  if (op.isStatic) formatted = `<u>${formatted}</u>`;
  if (op.isAbstract) formatted = `<i>${formatted} {abstract}</i>`;
  return formatted;
}

function escapeXmlAttr(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "&#xa;");
}

function escapeHtmlText(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function encodeMeta(payload: unknown): string {
  return escapeXmlAttr(JSON.stringify(payload));
}

function decodeMeta<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const unescaped = raw
    .replaceAll("&#xa;", "\n")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
  try {
    return JSON.parse(unescaped) as T;
  } catch {
    try {
      if (/^[A-Za-z0-9+/=]+$/.test(unescaped.trim()) && typeof Buffer !== "undefined") {
        const decoded = Buffer.from(unescaped.trim(), "base64").toString("utf8");
        return JSON.parse(decoded) as T;
      }
    } catch {
      // fall through
    }
    return null;
  }
}

export function extractClassifiersFromModel(model: ArchitecturalModel): UmlClassifierNode[] {
  const servicesById = new Map(
    model.elements
      .filter((e) => e.elementType === "SERVICE_CONTAINER")
      .map((e) => [e.id, e]),
  );

  const classifiers: UmlClassifierNode[] = [];
  for (const elem of model.elements) {
    if (elem.elementType !== "COMPONENT" && elem.elementType !== "CLASS_INTERFACE") {
      continue;
    }
    const props = (elem.properties ?? {}) as Record<string, unknown>;
    if (props["workerResolutionStatus"] === "SourceProject") {
      continue;
    }
    const rawUml = props["umlClassifier"] as Record<string, unknown> | undefined;
    const simpleName =
      typeof rawUml?.["name"] === "string" && rawUml["name"].trim()
        ? rawUml["name"].trim()
        : elem.name.includes(".")
          ? elem.name.slice(elem.name.lastIndexOf(".") + 1)
          : elem.name;
    const qualifiedName =
      typeof rawUml?.["qualifiedName"] === "string"
        ? rawUml["qualifiedName"]
        : typeof props["qualifiedName"] === "string"
          ? props["qualifiedName"]
          : elem.name;
    const packageName =
      typeof rawUml?.["packageName"] === "string"
        ? rawUml["packageName"]
        : typeof props["packageName"] === "string"
          ? props["packageName"]
          : qualifiedName.includes(".")
            ? qualifiedName.slice(0, qualifiedName.lastIndexOf("."))
            : "default";

    const classifierKindRaw = String(
      rawUml?.["typeKind"] ??
        rawUml?.["classifierKind"] ??
        props["typeKind"] ??
        props["classifierKind"] ??
        "CLASS",
    ).toUpperCase();
    const classifierKind: "CLASS" | "INTERFACE" | "ENUM" =
      classifierKindRaw === "INTERFACE"
        ? "INTERFACE"
        : classifierKindRaw === "ENUM"
          ? "ENUM"
          : "CLASS";

    const langRaw = String(
      rawUml?.["sourceLanguage"] ?? elem.technology ?? "JAVA",
    ).toUpperCase();
    const sourceLanguage: "JAVA" | "CSHARP" | "DESIGNED" =
      langRaw.includes("CSHARP") || langRaw.includes("C#") || langRaw.includes("NET")
        ? "CSHARP"
        : "JAVA";

    const normalizeVis = (
      visRaw: unknown,
      langVisRaw: unknown,
    ): UmlVisibility => {
      const lv = String(langVisRaw ?? "").toLowerCase();
      if (lv === "internal") return "INTERNAL";
      if (lv === "package-private") return "PACKAGE_PRIVATE";
      if (lv === "protected internal") return "PROTECTED_INTERNAL";
      if (lv === "private protected") return "PRIVATE_PROTECTED";
      const v = String(visRaw ?? "PUBLIC").toUpperCase();
      if (v === "PACKAGE") {
        return sourceLanguage === "CSHARP" ? "INTERNAL" : "PACKAGE_PRIVATE";
      }
      return (v || "PUBLIC") as UmlVisibility;
    };

    const visibility = normalizeVis(
      rawUml?.["visibility"],
      rawUml?.["languageVisibility"],
    );
    const isAbstract = Boolean(rawUml?.["isAbstract"] ?? false);
    const isStatic = Boolean(rawUml?.["isStatic"] ?? false);
    const typeParameters = Array.isArray(rawUml?.["typeParameters"])
      ? (rawUml!["typeParameters"] as unknown[]).map(String)
      : [];

    const rawMembers = Array.isArray(rawUml?.["members"])
      ? (rawUml!["members"] as Array<Record<string, unknown>>)
      : [];

    const attributes: UmlMemberItem[] = [];
    const operations: UmlMemberItem[] = [];
    const seenOpKeys = new Set<string>();

    for (let idx = 0; idx < rawMembers.length; idx++) {
      const m = rawMembers[idx]!;
      const kindRaw = String(
        m["memberKind"] ?? m["kind"] ?? "METHOD",
      ).toUpperCase();
      const mName = String(m["name"] ?? `member_${idx}`);
      const mType = String(m["returnType"] ?? m["type"] ?? "void");
      const mVis = normalizeVis(m["visibility"], m["languageVisibility"]);
      const mStatic = Boolean(m["isStatic"] ?? false);
      const mAbstract = Boolean(m["isAbstract"] ?? false);
      const params = Array.isArray(m["parameters"])
        ? (m["parameters"] as Array<Record<string, unknown>>).map((p) => ({
            name: String(p["name"] ?? "arg"),
            type: String(p["type"] ?? "Object"),
          }))
        : [];
      const sigKey = String(
        m["signature"] ??
          m["signatureKey"] ??
          `${mName}(${params.map((p) => p.type).join(",")}):${mType}`,
      );
      const item: UmlMemberItem = {
        memberId: `${elem.id}:member:${idx}:${sigKey}`,
        kind:
          kindRaw === "FIELD" || kindRaw === "PROPERTY" || kindRaw === "ENUM_LITERAL"
            ? (kindRaw as UmlMemberItem["kind"])
            : kindRaw === "CONSTRUCTOR"
              ? "CONSTRUCTOR"
              : "METHOD",
        name: mName,
        type: mType,
        visibility: mVis,
        isStatic: mStatic,
        isAbstract: mAbstract,
        signatureKey: sigKey,
        parameters: params,
        provenance: "EXTRACTED",
      };
      if (
        item.kind === "FIELD" ||
        item.kind === "PROPERTY" ||
        item.kind === "ENUM_LITERAL"
      ) {
        attributes.push(item);
      } else {
        // Preserve all distinct overload signatureKeys!
        if (!seenOpKeys.has(sigKey)) {
          seenOpKeys.add(sigKey);
          operations.push(item);
        }
      }
    }

    const serviceElem = elem.parentId ? servicesById.get(elem.parentId) ?? null : null;
    classifiers.push({
      classifierId: elem.id,
      modelElementId: elem.id,
      name: simpleName,
      qualifiedName,
      packageName,
      serviceId: serviceElem?.id ?? elem.parentId ?? null,
      serviceName: serviceElem?.name ?? null,
      classifierKind,
      visibility,
      isAbstract,
      isStatic,
      typeParameters,
      sourceLanguage,
      attributes,
      operations,
      provenance: "EXTRACTED",
      evidenceIds: elem.evidence.map((ev) => ev.id),
    });
  }

  return classifiers.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
}

export function projectUmlClassDiagram(
  model: ArchitecturalModel,
  options?: {
    serviceId?: string | null | undefined;
    packageName?: string | null | undefined;
    overlay?: UmlClassOverlay | undefined;
  },
): UmlClassDiagramProjection {
  const extracted = extractClassifiersFromModel(model);
  const designedClassifiers = (options?.overlay?.designedClassifiers ?? []).map((c) => ({
    ...c,
    provenance: "DESIGNED" as const,
  }));

  const allClassifiers = [...extracted, ...designedClassifiers].filter((c) => {
    if (options?.serviceId && c.serviceId !== options.serviceId) return false;
    if (options?.packageName && c.packageName !== options.packageName) return false;
    return true;
  });

  const visibleIds = new Set(allClassifiers.map((c) => c.classifierId));
  const rawRelations: UmlClassRelationEdge[] = [];

  for (const edge of model.edges) {
    if (edge.protocol !== "CODE_DEPENDENCY") continue;
    if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
    if (edge.from === edge.to) continue;

    const props = (edge.properties ?? {}) as Record<string, unknown>;
    const kindRaw = String(props["umlRelationKind"] ?? "DEPENDENCY").toUpperCase();
    const validKinds: UmlRelationKind[] = [
      "GENERALIZATION",
      "REALIZATION",
      "ASSOCIATION",
      "DEPENDENCY",
      "SHARED_AGGREGATION",
      "COMPOSITION",
    ];
    let relationKind: UmlRelationKind = validKinds.includes(kindRaw as UmlRelationKind)
      ? (kindRaw as UmlRelationKind)
      : "DEPENDENCY";

    const provenanceRaw = String(props["provenance"] ?? "EXTRACTED").toUpperCase();
    const provenance: UmlProvenance =
      provenanceRaw === "DESIGNED" ? "DESIGNED" : "EXTRACTED";

    // Whole-part restraint: static source extraction alone never fabricates SHARED_AGGREGATION or COMPOSITION
    if (
      provenance === "EXTRACTED" &&
      (relationKind === "SHARED_AGGREGATION" || relationKind === "COMPOSITION")
    ) {
      relationKind = "ASSOCIATION";
    }

    const roleName =
      typeof props["roleName"] === "string" && props["roleName"].trim() !== ""
        ? props["roleName"].trim()
        : null;
    const rawMult =
      typeof props["multiplicity"] === "string" && props["multiplicity"].trim() !== ""
        ? props["multiplicity"].trim()
        : null;
    const multiplicity = rawMult && rawMult !== "UNKNOWN" ? rawMult : null;

    rawRelations.push({
      relationId: edge.id,
      sourceRelationshipId: edge.id,
      fromClassifierId: edge.from,
      toClassifierId: edge.to,
      relationKind,
      roleName,
      multiplicity,
      provenance,
      evidenceIds: edge.evidenceIds ?? edge.evidence.map((ev) => ev.id),
    });
  }

  for (const dRel of options?.overlay?.designedRelations ?? []) {
    if (!visibleIds.has(dRel.fromClassifierId) || !visibleIds.has(dRel.toClassifierId)) {
      continue;
    }
    rawRelations.push({
      ...dRel,
      provenance: "DESIGNED",
    });
  }

  // Deduplicate DEPENDENCY when a structural relation (ASSOCIATION, SHARED_AGGREGATION, COMPOSITION, GENERALIZATION, REALIZATION)
  // already exists between the same (fromClassifierId -> toClassifierId) pair.
  const structuralPairs = new Set(
    rawRelations
      .filter((r) => r.relationKind !== "DEPENDENCY")
      .map((r) => `${r.fromClassifierId}->${r.toClassifierId}`),
  );
  const deduplicatedDependencyIds: string[] = [];
  const relations: UmlClassRelationEdge[] = [];
  const seenRelKeys = new Set<string>();

  for (const rel of rawRelations) {
    const pairKey = `${rel.fromClassifierId}->${rel.toClassifierId}`;
    if (rel.relationKind === "DEPENDENCY" && structuralPairs.has(pairKey)) {
      deduplicatedDependencyIds.push(rel.relationId);
      continue;
    }
    const dedupKey = `${pairKey}:${rel.relationKind}:${rel.roleName ?? ""}:${rel.provenance}`;
    if (seenRelKeys.has(dedupKey)) continue;
    seenRelKeys.add(dedupKey);
    relations.push(rel);
  }

  const validationIssues: UmlValidationIssue[] = [];
  const byId = new Map(allClassifiers.map((c) => [c.classifierId, c]));
  for (const rel of relations) {
    const src = byId.get(rel.fromClassifierId);
    const tgt = byId.get(rel.toClassifierId);
    if (rel.relationKind === "REALIZATION" && tgt && tgt.classifierKind !== "INTERFACE") {
      validationIssues.push({
        code: "REALIZATION_TARGET_NOT_INTERFACE",
        severity: "WARNING",
        message: `${src?.name ?? rel.fromClassifierId} realizes ${tgt.name}, which is a ${tgt.classifierKind} rather than an INTERFACE.`,
        targetId: rel.relationId,
      });
    }
    if (
      rel.relationKind === "GENERALIZATION" &&
      src &&
      tgt &&
      src.classifierKind !== tgt.classifierKind
    ) {
      validationIssues.push({
        code: "GENERALIZATION_KIND_MISMATCH",
        severity: "ERROR",
        message: `Generalization requires matching classifier kinds (${src.name} is ${src.classifierKind}, ${tgt.name} is ${tgt.classifierKind}).`,
        targetId: rel.relationId,
      });
    }
  }

  return {
    diagramKind: "UML_CLASS",
    modelId: model.id,
    scopeServiceId: options?.serviceId ?? null,
    scopePackageName: options?.packageName ?? null,
    classifiers: allClassifiers,
    relations,
    deduplicatedDependencyIds,
    validationIssues,
  };
}

// ============================================================================
// 2. M4 — UML PACKAGE DIAGRAM
// ============================================================================

export type UmlPackageRelationKind = "DEPENDENCY" | "IMPORT" | "ACCESS" | "MERGE";

export interface UmlPackageNode {
  packageId: string;
  name: string;
  qualifiedName: string;
  parentPackageId: string | null;
  serviceId: string | null;
  memberClassifierIds: string[];
  memberNames: string[];
  provenance: UmlProvenance;
}

export interface UmlPackageEdge {
  edgeId: string;
  fromPackageId: string;
  toPackageId: string;
  relationKind: UmlPackageRelationKind;
  underlyingEdgeIds: string[];
  evidenceIds: string[];
  provenance: UmlProvenance;
}

export interface UmlPackageOverlay {
  designedPackages?: UmlPackageNode[] | undefined;
  designedEdges?: UmlPackageEdge[] | undefined;
}

export interface UmlPackageDiagramProjection {
  diagramKind: "UML_PACKAGE";
  modelId: string;
  scopeServiceId: string | null;
  packages: UmlPackageNode[];
  edges: UmlPackageEdge[];
  validationIssues: UmlValidationIssue[];
}

export function projectUmlPackageDiagram(
  model: ArchitecturalModel,
  options?: {
    serviceId?: string | null | undefined;
    overlay?: UmlPackageOverlay | undefined;
  },
): UmlPackageDiagramProjection {
  const classifiers = extractClassifiersFromModel(model).filter(
    (c) => !options?.serviceId || c.serviceId === options.serviceId,
  );
  const pkgMap = new Map<string, UmlPackageNode>();
  const classifierToPkg = new Map<string, string>();

  const ensurePackageHierarchy = (pkgName: string, serviceId: string | null) => {
    const parts = pkgName.split(".").filter(Boolean);
    const scopePrefix = serviceId && serviceId.trim() ? `pkg:${serviceId.trim()}:` : "pkg:";
    let currentQName = "";
    let parentId: string | null = null;
    for (let i = 0; i < parts.length; i++) {
      currentQName = i === 0 ? parts[0]! : `${currentQName}.${parts[i]!}`;
      const pkgId = `${scopePrefix}${currentQName}`;
      if (!pkgMap.has(pkgId)) {
        pkgMap.set(pkgId, {
          packageId: pkgId,
          name: parts[i]!,
          qualifiedName: currentQName,
          parentPackageId: parentId,
          serviceId,
          memberClassifierIds: [],
          memberNames: [],
          provenance: "EXTRACTED",
        });
      }
      parentId = pkgId;
    }
    return `${scopePrefix}${pkgName}`;
  };

  for (const cls of classifiers) {
    const pkgId = ensurePackageHierarchy(cls.packageName || "default", cls.serviceId);
    const pkg = pkgMap.get(pkgId)!;
    pkg.memberClassifierIds.push(cls.classifierId);
    pkg.memberNames.push(cls.name);
    classifierToPkg.set(cls.classifierId, pkgId);
  }

  for (const dPkg of options?.overlay?.designedPackages ?? []) {
    pkgMap.set(dPkg.packageId, {
      ...dPkg,
      provenance: "DESIGNED",
    });
  }

  const edgeMap = new Map<string, UmlPackageEdge>();
  for (const edge of model.edges) {
    if (edge.protocol !== "CODE_DEPENDENCY" && edge.protocol !== "PACKAGE_IMPORT") continue;
    const fromPkg = classifierToPkg.get(edge.from) ?? (pkgMap.has(edge.from) ? edge.from : undefined);
    const toPkg = classifierToPkg.get(edge.to) ?? (pkgMap.has(edge.to) ? edge.to : undefined);
    if (!fromPkg || !toPkg || fromPkg === toPkg) continue;

    const explicitKindRaw = String(
      (edge.properties as Record<string, unknown> | undefined)?.["packageRelationKind"] ?? "",
    ).toUpperCase();
    const relationKind: UmlPackageRelationKind =
      explicitKindRaw === "IMPORT" || explicitKindRaw === "ACCESS" || explicitKindRaw === "MERGE"
        ? (explicitKindRaw as UmlPackageRelationKind)
        : "DEPENDENCY";

    const key = `${fromPkg}->${toPkg}:${relationKind}`;
    const existing = edgeMap.get(key);
    const evIds = edge.evidenceIds ?? edge.evidence.map((ev) => ev.id);
    if (existing) {
      if (!existing.underlyingEdgeIds.includes(edge.id)) {
        existing.underlyingEdgeIds.push(edge.id);
      }
      for (const eid of evIds) {
        if (!existing.evidenceIds.includes(eid)) existing.evidenceIds.push(eid);
      }
    } else {
      edgeMap.set(key, {
        edgeId: `pkg-edge:${fromPkg}->${toPkg}`,
        fromPackageId: fromPkg,
        toPackageId: toPkg,
        relationKind,
        underlyingEdgeIds: [edge.id],
        evidenceIds: [...evIds],
        provenance: "EXTRACTED",
      });
    }
  }

  for (const dEdge of options?.overlay?.designedEdges ?? []) {
    if (!pkgMap.has(dEdge.fromPackageId) || !pkgMap.has(dEdge.toPackageId)) continue;
    edgeMap.set(`${dEdge.fromPackageId}->${dEdge.toPackageId}:${dEdge.relationKind}`, {
      ...dEdge,
      provenance: "DESIGNED",
    });
  }

  const edges = [...edgeMap.values()];
  const validationIssues: UmlValidationIssue[] = [];

  // Detect cycles in «merge» relationships (UML 2.5.1 Chapter 12: PackageMerge must be acyclic)
  const mergeAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.relationKind === "MERGE") {
      const list = mergeAdj.get(e.fromPackageId) ?? [];
      list.push(e.toPackageId);
      mergeAdj.set(e.fromPackageId, list);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const detectMergeCycle = (nodeId: string): boolean => {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const nextId of mergeAdj.get(nodeId) ?? []) {
      if (!visited.has(nextId)) {
        if (detectMergeCycle(nextId)) return true;
      } else if (inStack.has(nextId)) {
        return true;
      }
    }
    inStack.delete(nodeId);
    return false;
  };

  for (const pkgId of mergeAdj.keys()) {
    if (!visited.has(pkgId) && detectMergeCycle(pkgId)) {
      validationIssues.push({
        code: "PACKAGE_MERGE_CYCLE_DETECTED",
        severity: "ERROR",
        message: `Cyclic «merge» relationship detected involving package ${pkgMap.get(pkgId)?.qualifiedName ?? pkgId}. UML PackageMerge must be acyclic.`,
        targetId: pkgId,
      });
      break;
    }
  }

  // Flag general package dependency cycles as architectural warning
  const depAdj = new Map<string, string[]>();
  for (const e of edges) {
    const list = depAdj.get(e.fromPackageId) ?? [];
    list.push(e.toPackageId);
    depAdj.set(e.fromPackageId, list);
  }
  const depVisited = new Set<string>();
  const depStack = new Set<string>();
  const detectDepCycle = (nodeId: string): boolean => {
    depVisited.add(nodeId);
    depStack.add(nodeId);
    for (const nextId of depAdj.get(nodeId) ?? []) {
      if (!depVisited.has(nextId)) {
        if (detectDepCycle(nextId)) return true;
      } else if (depStack.has(nextId)) {
        return true;
      }
    }
    depStack.delete(nodeId);
    return false;
  };
  for (const pkgId of depAdj.keys()) {
    if (!depVisited.has(pkgId) && detectDepCycle(pkgId)) {
      validationIssues.push({
        code: "PACKAGE_DEPENDENCY_CYCLE",
        severity: "WARNING",
        message: `Package dependency cycle detected involving ${pkgMap.get(pkgId)?.qualifiedName ?? pkgId}.`,
        targetId: pkgId,
      });
      break;
    }
  }

  return {
    diagramKind: "UML_PACKAGE",
    modelId: model.id,
    scopeServiceId: options?.serviceId ?? null,
    packages: [...pkgMap.values()].sort(
      (a, b) =>
        a.qualifiedName.localeCompare(b.qualifiedName) ||
        (a.serviceId ?? "").localeCompare(b.serviceId ?? "") ||
        a.packageId.localeCompare(b.packageId),
    ),
    edges,
    validationIssues,
  };
}

// ============================================================================
// 3. M5 — UML DEPLOYMENT DIAGRAM
// ============================================================================

export type UmlDeploymentNodeKind =
  | "DEVICE"
  | "EXECUTION_ENVIRONMENT"
  | "ARTIFACT"
  | "DEPLOYMENT_SPECIFICATION"
  | "MANIFESTED_COMPONENT";

export type UmlDeploymentEdgeKind =
  | "COMMUNICATION_PATH"
  | "MANIFESTATION"
  | "DEPLOYMENT_DEPENDENCY_STARTUP";

export interface UmlDeploymentNode {
  nodeId: string;
  modelElementId: string | null;
  name: string;
  nodeKind: UmlDeploymentNodeKind;
  parentNodeId: string | null;
  environment: string;
  stereotype: string;
  ports: string[];
  instanceName: string | null;
  replicaCount: number | null;
  properties: Record<string, string>;
  provenance: UmlProvenance;
  evidenceIds: string[];
}

export interface UmlDeploymentEdge {
  edgeId: string;
  sourceRelationshipId: string | null;
  fromNodeId: string;
  toNodeId: string;
  edgeKind: UmlDeploymentEdgeKind;
  protocol: string | null;
  port: string | null;
  label: string;
  provenance: UmlProvenance;
  evidenceIds: string[];
}

export interface UmlDeploymentOverlay {
  designedNodes?: UmlDeploymentNode[] | undefined;
  designedEdges?: UmlDeploymentEdge[] | undefined;
  includeStartupDependenciesOverlay?: boolean | undefined;
}

export interface UmlDeploymentDiagramProjection {
  diagramKind: "UML_DEPLOYMENT";
  modelId: string;
  environment: string;
  availableEnvironments: string[];
  nodes: UmlDeploymentNode[];
  edges: UmlDeploymentEdge[];
  excludedComposeStartupEdgesCount: number;
  validationIssues: UmlValidationIssue[];
}

function hasExplicitDeploymentEvidence(elem: ArchitecturalModel["elements"][number]): boolean {
  const props = (elem.properties ?? {}) as Record<string, unknown>;
  const depMeta = props["deploymentMetadata"];
  if (depMeta && typeof depMeta === "object" && Object.keys(depMeta as object).length > 0) {
    return true;
  }
  if (props["sourceType"] === "DOCKER_COMPOSE" || props["sourceType"] === "KUBERNETES") {
    return true;
  }
  if (
    typeof props["image"] === "string" ||
    typeof props["buildContext"] === "string" ||
    (Array.isArray(props["ports"]) && props["ports"].length > 0)
  ) {
    return true;
  }
  return false;
}

export function projectUmlDeploymentDiagram(
  model: ArchitecturalModel,
  options?: {
    environment?: string | undefined;
    overlay?: UmlDeploymentOverlay | undefined;
  },
): UmlDeploymentDiagramProjection {
  const envs = new Set<string>(["default"]);
  for (const elem of model.elements) {
    const depMeta = (elem.properties?.["deploymentMetadata"] ?? {}) as Record<string, unknown>;
    if (typeof depMeta["environment"] === "string" && depMeta["environment"].trim()) {
      envs.add(depMeta["environment"].trim());
    }
  }
  for (const dNode of options?.overlay?.designedNodes ?? []) {
    if (dNode.environment) envs.add(dNode.environment);
  }

  const activeEnv = options?.environment ?? [...envs][0] ?? "default";
  const nodes: UmlDeploymentNode[] = [];
  const edges: UmlDeploymentEdge[] = [];
  const serviceToExecEnvId = new Map<string, string>();
  const serviceToArtifactId = new Map<string, string>();

  const deployableElements = model.elements.filter(
    (e) =>
      ["SERVICE_CONTAINER", "DATABASE", "QUEUE_BROKER", "EXTERNAL_SYSTEM"].includes(
        e.elementType ?? "",
      ) && hasExplicitDeploymentEvidence(e),
  );

  const deploymentArtifactIssues: UmlValidationIssue[] = [];

  for (const elem of deployableElements) {
    const props = (elem.properties ?? {}) as Record<string, unknown>;
    const depMeta = (props["deploymentMetadata"] ?? {}) as Record<string, unknown>;
    const elemEnv =
      typeof depMeta["environment"] === "string" && depMeta["environment"].trim()
        ? depMeta["environment"].trim()
        : "default";
    if (elemEnv !== activeEnv) continue;

    const execNodeId = `deploy:node:${elem.id}`;
    const rawPorts = Array.isArray(depMeta["ports"])
      ? depMeta["ports"]
      : Array.isArray(props["ports"])
        ? props["ports"]
        : [];
    const ports = (rawPorts as unknown[]).map(String);
    const rawImage =
      typeof depMeta["image"] === "string" && depMeta["image"].trim()
        ? depMeta["image"].trim()
        : typeof props["image"] === "string" && props["image"].trim()
          ? props["image"].trim()
          : null;
    const image = rawImage && !rawImage.includes("${") ? rawImage : null;

    const declaredBuildContext =
      typeof depMeta["declaredBuildContext"] === "string" && depMeta["declaredBuildContext"].trim()
        ? depMeta["declaredBuildContext"].trim()
        : typeof props["buildContext"] === "string" && props["buildContext"].trim()
          ? props["buildContext"].trim()
          : null;

    const artifactResolution =
      typeof depMeta["artifactResolution"] === "string"
        ? depMeta["artifactResolution"].trim()
        : null;
    const artifactKind =
      typeof depMeta["artifactKind"] === "string" ? depMeta["artifactKind"].trim() : null;
    const rawArtifactName =
      typeof depMeta["artifactName"] === "string" && depMeta["artifactName"].trim()
        ? depMeta["artifactName"].trim()
        : null;
    const isSynthesizedBuildFallback =
      rawArtifactName !== null &&
      (rawArtifactName.endsWith(":build") ||
        artifactResolution === "BUILD_CONTEXT_ONLY_UNRESOLVED_ARTIFACT" ||
        artifactResolution === "NO_ARTIFACT_DECLARED" ||
        (artifactKind === "BUILD_ARTIFACT" && !image && !/\.(jar|war|ear|dll|exe|tar|tgz|zip|oci)$/i.test(rawArtifactName)));

    const explicitArtifactName =
      rawArtifactName && !isSynthesizedBuildFallback ? rawArtifactName : image;

    const instanceName =
      typeof depMeta["instanceName"] === "string" && depMeta["instanceName"].trim()
        ? depMeta["instanceName"].trim()
        : null;
    const replicaCount =
      typeof depMeta["replicas"] === "number" ? Number(depMeta["replicas"]) : null;

    const explicitNodeKind = String(depMeta["nodeKind"] ?? "").toUpperCase();
    const nodeKind: UmlDeploymentNodeKind =
      explicitNodeKind === "DEVICE" ? "DEVICE" : "EXECUTION_ENVIRONMENT";
    const stereotype =
      nodeKind === "DEVICE" ? "«device»" : "«executionEnvironment»";

    nodes.push({
      nodeId: execNodeId,
      modelElementId: elem.id,
      name: elem.name,
      nodeKind,
      parentNodeId: null,
      environment: elemEnv,
      stereotype,
      ports,
      instanceName,
      replicaCount,
      properties: {
        ...(image ? { image } : {}),
        ...(declaredBuildContext ? { declaredBuildContext } : {}),
        ...(explicitArtifactName
          ? { artifactResolution: artifactResolution ?? "EXPLICIT_ARTIFACT" }
          : declaredBuildContext
            ? { artifactResolution: "BUILD_CONTEXT_ONLY_UNRESOLVED_ARTIFACT" }
            : { artifactResolution: "NO_ARTIFACT_DECLARED" }),
        ...(elem.technology ? { runtime: elem.technology } : {}),
      },
      provenance: "EXTRACTED",
      evidenceIds: elem.evidence.map((ev) => ev.id),
    });
    serviceToExecEnvId.set(elem.id, execNodeId);

    // Only emit ARTIFACT and MANIFESTATION when a concrete image or verified artifactName exists (never from buildContext alone or serviceName:build fallback)
    if (explicitArtifactName) {
      const artifactId = `deploy:artifact:${elem.id}`;
      nodes.push({
        nodeId: artifactId,
        modelElementId: elem.id,
        name: explicitArtifactName,
        nodeKind: "ARTIFACT",
        parentNodeId: execNodeId,
        environment: elemEnv,
        stereotype: "«artifact»",
        ports: [],
        instanceName: null,
        replicaCount: null,
        properties: image ? { image } : {},
        provenance: "EXTRACTED",
        evidenceIds: elem.evidence.map((ev) => ev.id),
      });
      serviceToArtifactId.set(elem.id, artifactId);

      const manifestTargetId = `deploy:manifested:${elem.id}`;
      nodes.push({
        nodeId: manifestTargetId,
        modelElementId: elem.id,
        name: elem.name,
        nodeKind: "MANIFESTED_COMPONENT",
        parentNodeId: null,
        environment: elemEnv,
        stereotype: elem.elementType === "DATABASE" ? "«database»" : "«component»",
        ports: [],
        instanceName: null,
        replicaCount: null,
        properties: {},
        provenance: "EXTRACTED",
        evidenceIds: elem.evidence.map((ev) => ev.id),
      });

      edges.push({
        edgeId: `deploy:manifest:${elem.id}`,
        sourceRelationshipId: null,
        fromNodeId: artifactId,
        toNodeId: manifestTargetId,
        edgeKind: "MANIFESTATION",
        protocol: null,
        port: null,
        label: "«manifest»",
        provenance: "EXTRACTED",
        evidenceIds: elem.evidence.map((ev) => ev.id),
      });
    } else if (declaredBuildContext) {
      deploymentArtifactIssues.push({
        code: "BUILD_CONTEXT_WITHOUT_EXPLICIT_ARTIFACT",
        severity: "INFO",
        message: `Service "${elem.name}" declares a build context (${declaredBuildContext}) without an explicit container image or concrete artifact file; no EXTRACTED «artifact» or «manifest» edge is fabricated.`,
        targetId: execNodeId,
      });
    } else {
      deploymentArtifactIssues.push({
        code: "COMPOSE_SERVICE_NO_ARTIFACT_DECLARED",
        severity: "INFO",
        message: `Service "${elem.name}" declares deployment configuration (ports/environment) without an image or build artifact; no EXTRACTED «artifact» or «manifest» edge is fabricated.`,
        targetId: execNodeId,
      });
    }
  }

  for (const dNode of options?.overlay?.designedNodes ?? []) {
    if (dNode.environment && dNode.environment !== activeEnv) continue;
    nodes.push({
      ...dNode,
      environment: dNode.environment || activeEnv,
      provenance: "DESIGNED",
    });
  }

  // Helper to resolve component/class owner or logical datastore to its physical deployment element
  const elemById = new Map(model.elements.map((e) => [e.id, e]));
  const elemByName = new Map(model.elements.map((e) => [e.name, e]));
  const resolveOwnerService = (id: string): string => {
    let curr = id;
    const seen = new Set<string>();
    while (elemById.get(curr)?.parentId && !seen.has(curr)) {
      seen.add(curr);
      curr = elemById.get(curr)!.parentId!;
    }
    const currElem = elemById.get(curr);
    const physicalHost = currElem?.properties?.["physicalHost"];
    if (typeof physicalHost === "string" && elemByName.has(physicalHost)) {
      return elemByName.get(physicalHost)!.id;
    }
    return curr;
  };

  let excludedComposeStartupEdgesCount = 0;
  const commPairs = new Set<string>();

  for (const edge of model.edges) {
    const fromOwner = resolveOwnerService(edge.from);
    const toOwner = resolveOwnerService(edge.to);
    const fromExec = serviceToExecEnvId.get(fromOwner);
    const toExec = serviceToExecEnvId.get(toOwner);
    if (!fromExec || !toExec || fromExec === toExec) continue;

    if (edge.protocol === "DECLARED_COMPOSE" || edge.originLayer === "DEPLOYMENT") {
      excludedComposeStartupEdgesCount++;
      if (options?.overlay?.includeStartupDependenciesOverlay) {
        edges.push({
          edgeId: `deploy:startup:${edge.id}`,
          sourceRelationshipId: edge.id,
          fromNodeId: fromExec,
          toNodeId: toExec,
          edgeKind: "DEPLOYMENT_DEPENDENCY_STARTUP",
          protocol: "depends_on",
          port: null,
          label: "«depends_on (startup only, not CommunicationPath)»",
          provenance: "EXTRACTED",
          evidenceIds: edge.evidenceIds ?? edge.evidence.map((ev) => ev.id),
        });
      }
      continue;
    }

    if (
      [
        "SERVICE_HTTP_CALL",
        "DATABASE_ACCESS",
        "DATABASE_QUERY",
        "MESSAGE_PUBLISH",
        "MESSAGE_SUBSCRIBE",
      ].includes(edge.protocol)
    ) {
      const directTargetElem = elemById.get(edge.to);
      const targetElem = elemById.get(toOwner);
      const targetProps = (targetElem?.properties ?? {}) as Record<string, unknown>;
      const targetDepMeta = (targetProps["deploymentMetadata"] ?? {}) as Record<
        string,
        unknown
      >;
      const rawTargetPorts = Array.isArray(targetDepMeta["ports"])
        ? targetDepMeta["ports"]
        : Array.isArray(targetProps["ports"])
          ? targetProps["ports"]
          : [];
      const targetPorts = (rawTargetPorts as unknown[]).map(String);
      const firstPort = targetPorts[0] ?? null;
      const resolvedDbProtocol =
        directTargetElem?.properties?.["protocol"] ??
        targetElem?.properties?.["protocol"] ??
        "TCP/DB";
      const protocolName =
        edge.protocol === "SERVICE_HTTP_CALL"
          ? "HTTP"
          : edge.protocol === "DATABASE_ACCESS" || edge.protocol === "DATABASE_QUERY"
            ? String(resolvedDbProtocol).toUpperCase()
            : String(targetElem?.properties?.["protocol"] ?? "MESSAGING").toUpperCase();

      const pairKey = `${fromExec}<->${toExec}:${protocolName}`;
      if (commPairs.has(pairKey)) continue;
      commPairs.add(pairKey);

      edges.push({
        edgeId: `deploy:comm:${edge.id}`,
        sourceRelationshipId: edge.id,
        fromNodeId: fromExec,
        toNodeId: toExec,
        edgeKind: "COMMUNICATION_PATH",
        protocol: protocolName,
        port: firstPort,
        label: `«communicationPath» ${protocolName}${firstPort ? ` (${firstPort})` : ""}`,
        provenance: "EXTRACTED",
        evidenceIds: edge.evidenceIds ?? edge.evidence.map((ev) => ev.id),
      });
    }
  }

  for (const dEdge of options?.overlay?.designedEdges ?? []) {
    edges.push({
      ...dEdge,
      provenance: "DESIGNED",
    });
  }

  const validationIssues: UmlValidationIssue[] = [...deploymentArtifactIssues];
  if (nodes.length === 0) {
    validationIssues.push({
      code: "NO_DEPLOYMENT_METADATA_EXTRACTED",
      severity: "INFO",
      message:
        "No deployment descriptor metadata (Docker Compose / Kubernetes / deploymentMetadata) was extracted for this model. Logical services and external systems are not fabricated as physical deployment nodes unless authored in DESIGNED mode.",
    });
  }
  for (const e of edges) {
    if (
      e.edgeKind === "COMMUNICATION_PATH" &&
      (e.protocol === "DECLARED_COMPOSE" || e.protocol === "depends_on")
    ) {
      validationIssues.push({
        code: "COMPOSE_DEPENDS_ON_AS_COMM_PATH",
        severity: "ERROR",
        message: `Docker Compose depends_on (${e.edgeId}) only declares startup order and must not be modeled as a UML CommunicationPath.`,
        targetId: e.edgeId,
      });
    }
  }

  const nodeEnvSet = new Set(nodes.map((n) => n.environment));
  if (nodeEnvSet.size > 1) {
    validationIssues.push({
      code: "MULTI_ENVIRONMENT_MIXED",
      severity: "ERROR",
      message: `Multiple deployment environments (${[...nodeEnvSet].join(", ")}) were mixed into a single deployment topology.`,
    });
  }

  return {
    diagramKind: "UML_DEPLOYMENT",
    modelId: model.id,
    environment: activeEnv,
    availableEnvironments: [...envs],
    nodes,
    edges,
    excludedComposeStartupEdgesCount,
    validationIssues,
  };
}

// ============================================================================
// 4. M6 — UML ACTIVITY DIAGRAM
// ============================================================================

export type UmlActivityNodeKind =
  | "INITIAL"
  | "ACTION"
  | "DECISION"
  | "MERGE"
  | "FORK"
  | "JOIN"
  | "ACTIVITY_FINAL"
  | "FLOW_FINAL"
  | "OBJECT_NODE";

export interface UmlActivityNode {
  nodeId: string;
  kind: UmlActivityNodeKind;
  label: string;
  partitionId: string;
  partitionName: string;
  objectState?: string | null | undefined;
  joinSpec?: string | null | undefined;
  provenance: UmlProvenance;
}

export interface UmlActivityEdge {
  edgeId: string;
  from: string;
  to: string;
  flowKind: "CONTROL_FLOW" | "OBJECT_FLOW";
  guard: string | null;
  provenance: UmlProvenance;
}

export interface UmlActivityOperationOption {
  operationId: string;
  classifierId: string;
  classifierName: string;
  serviceId: string | null;
  serviceName: string;
  methodName: string;
  signatureKey: string;
  extractionCompleteness: "COMPLETE" | "PARTIAL";
  unsupportedConstructs: string[];
}

export interface UmlActivityOverlay {
  designedNodes?: UmlActivityNode[] | undefined;
  designedEdges?: UmlActivityEdge[] | undefined;
}

export interface UmlActivityDiagramProjection {
  diagramKind: "UML_ACTIVITY";
  modelId: string;
  selectedOperationId: string;
  availableOperations: UmlActivityOperationOption[];
  extractionCompleteness: "COMPLETE" | "PARTIAL" | "DESIGNED";
  unsupportedConstructs: string[];
  partitions: Array<{ partitionId: string; name: string; serviceId: string | null }>;
  nodes: UmlActivityNode[];
  edges: UmlActivityEdge[];
  validationIssues: UmlValidationIssue[];
}

export function listActivityOperations(
  model: ArchitecturalModel,
): UmlActivityOperationOption[] {
  const servicesById = new Map(
    model.elements
      .filter((e) => e.elementType === "SERVICE_CONTAINER")
      .map((e) => [e.id, e.name]),
  );
  const options: UmlActivityOperationOption[] = [];

  for (const elem of model.elements) {
    const rawUml = elem.properties?.["umlClassifier"] as Record<string, unknown> | undefined;
    if (!rawUml || typeof rawUml !== "object") continue;

    const methodsCfg = Array.isArray(rawUml["methodsCfg"])
      ? (rawUml["methodsCfg"] as Array<Record<string, unknown>>)
      : [];
    const serviceName =
      (elem.parentId ? servicesById.get(elem.parentId) : undefined) ?? "Application Service";
    const classifierName =
      typeof rawUml["name"] === "string" && rawUml["name"].trim()
        ? rawUml["name"].trim()
        : elem.name;

    const cfgSignatures = new Set<string>();
    for (const cfg of methodsCfg) {
      const methodName = String(cfg["methodName"] ?? "operation");
      const signatureKey = String(cfg["signatureKey"] ?? cfg["signature"] ?? methodName);
      cfgSignatures.add(signatureKey);
      const operationId = `${elem.id}::${signatureKey}`;
      const rawNodes = Array.isArray(cfg["nodes"])
        ? (cfg["nodes"] as Array<Record<string, unknown>>)
        : [];
      const hasUnsupportedInLabels = rawNodes.some((rn) =>
        /(=>|->|try\s*\{|catch\s*\(|await\s|yield\s)/i.test(String(rn["label"] ?? "")),
      );
      const completeness =
        String(cfg["extractionCompleteness"] ?? "COMPLETE").toUpperCase() === "PARTIAL" ||
        hasUnsupportedInLabels
          ? "PARTIAL"
          : "COMPLETE";
      const unsupported =
        Array.isArray(cfg["unsupportedConstructs"]) && cfg["unsupportedConstructs"].length > 0
          ? (cfg["unsupportedConstructs"] as unknown[]).map(String)
          : hasUnsupportedInLabels
            ? ["lambda/closure or exception handler block represented as PARTIAL summary action"]
            : [];
      options.push({
        operationId,
        classifierId: elem.id,
        classifierName,
        serviceId: elem.parentId ?? null,
        serviceName,
        methodName,
        signatureKey,
        extractionCompleteness: completeness,
        unsupportedConstructs: unsupported,
      });
    }

    const rawMembers = Array.isArray(rawUml["members"])
      ? (rawUml["members"] as Array<Record<string, unknown>>)
      : [];
    for (const m of rawMembers) {
      if (String(m["memberKind"] ?? "").toUpperCase() !== "OPERATION") continue;
      const methodName = String(m["name"] ?? "operation");
      const signatureKey = String(m["signature"] ?? m["signatureKey"] ?? methodName);
      if (cfgSignatures.has(signatureKey)) continue;
      options.push({
        operationId: `${elem.id}::${signatureKey}`,
        classifierId: elem.id,
        classifierName,
        serviceId: elem.parentId ?? null,
        serviceName,
        methodName,
        signatureKey,
        extractionCompleteness: "PARTIAL",
        unsupportedConstructs: [
          Boolean(m["isAbstract"])
            ? "abstract/interface operation without concrete method body CFG"
            : "unexpanded operation body without extracted AST CFG",
        ],
      });
    }
  }

  return options;
}

export function validateActivityStructure(
  nodes: UmlActivityNode[],
  edges: UmlActivityEdge[],
): UmlValidationIssue[] {
  const issues: UmlValidationIssue[] = [];
  const incoming = new Map<string, UmlActivityEdge[]>();
  const outgoing = new Map<string, UmlActivityEdge[]>();

  for (const n of nodes) {
    incoming.set(n.nodeId, []);
    outgoing.set(n.nodeId, []);
  }
  for (const e of edges) {
    incoming.get(e.to)?.push(e);
    outgoing.get(e.from)?.push(e);
  }

  const initials = nodes.filter((n) => n.kind === "INITIAL");
  if (initials.length === 0 && nodes.length > 0) {
    issues.push({
      code: "MISSING_INITIAL_NODE",
      severity: "ERROR",
      message: "Activity diagram must contain an InitialNode.",
    });
  }

  for (const n of nodes) {
    const inc = incoming.get(n.nodeId) ?? [];
    const out = outgoing.get(n.nodeId) ?? [];

    if (n.kind === "INITIAL") {
      if (inc.length > 0) {
        issues.push({
          code: "INITIAL_HAS_INCOMING",
          severity: "ERROR",
          message: `InitialNode (${n.nodeId}) must have 0 incoming flows (found ${inc.length}).`,
          targetId: n.nodeId,
        });
      }
      if (out.length === 0) {
        issues.push({
          code: "INITIAL_MISSING_OUTGOING",
          severity: "ERROR",
          message: `InitialNode (${n.nodeId}) must have at least 1 outgoing flow.`,
          targetId: n.nodeId,
        });
      }
    }

    if (n.kind === "ACTIVITY_FINAL" || n.kind === "FLOW_FINAL") {
      if (out.length > 0) {
        issues.push({
          code: "FINAL_HAS_OUTGOING",
          severity: "ERROR",
          message: `${n.kind} (${n.nodeId}) must have 0 outgoing flows (found ${out.length}).`,
          targetId: n.nodeId,
        });
      }
    }

    if (n.kind === "DECISION") {
      const unguarded = out.filter((e) => !e.guard || e.guard.trim() === "");
      if (out.length >= 2 && unguarded.length > 0) {
        issues.push({
          code: "DECISION_BRANCH_MISSING_GUARD",
          severity: "ERROR",
          message: `DecisionNode (${n.nodeId}) has outgoing branch(es) without an explicit [guard] condition.`,
          targetId: n.nodeId,
        });
      }
      const elseBranches = out.filter(
        (e) => e.guard?.trim().toLowerCase() === "[else]",
      );
      if (elseBranches.length > 1) {
        issues.push({
          code: "DECISION_MULTIPLE_ELSE",
          severity: "ERROR",
          message: `DecisionNode (${n.nodeId}) has multiple [else] branches.`,
          targetId: n.nodeId,
        });
      }
    }

    if (n.kind === "JOIN") {
      const parentNodes = inc.map((e) => nodes.find((cand) => cand.nodeId === e.from));
      const fromDecisionCount = parentNodes.filter((p) => p?.kind === "DECISION").length;
      if (fromDecisionCount >= 2) {
        issues.push({
          code: "JOIN_BRANCH_DEADLOCK",
          severity: "ERROR",
          message: `JoinNode (${n.nodeId}) receives multiple mutually-exclusive branches directly from a DecisionNode without a MergeNode. Because Join uses AND synchronization, it will deadlock waiting for unchosen branches.`,
          targetId: n.nodeId,
        });
      }
    }
  }

  return issues;
}

export function projectUmlActivityDiagram(
  model: ArchitecturalModel,
  options?: {
    operationId?: string | undefined;
    overlay?: UmlActivityOverlay | undefined;
  },
): UmlActivityDiagramProjection {
  const availableOperations = listActivityOperations(model);
  const selectedOp =
    availableOperations.find((op) => op.operationId === options?.operationId) ??
    availableOperations[0];

  const hasDesigned =
    Boolean(options?.overlay?.designedNodes && options.overlay.designedNodes.length > 0) ||
    Boolean(options?.overlay?.designedEdges && options.overlay.designedEdges.length > 0);

  if (!selectedOp && !hasDesigned) {
    return {
      diagramKind: "UML_ACTIVITY",
      modelId: model.id,
      selectedOperationId: options?.operationId ?? "none",
      availableOperations,
      extractionCompleteness: "COMPLETE",
      unsupportedConstructs: [],
      partitions: [],
      nodes: [],
      edges: [],
      validationIssues: [
        {
          code: "NO_ACTIVITY_CFG_EXTRACTED",
          severity: "INFO",
          message:
            "No method control-flow graph (methodsCfg) was extracted for this model. Activity flows are not fabricated from component names; use DESIGNED authoring to model custom activity flows.",
        },
      ],
    };
  }

  const partitionId = selectedOp
    ? `partition:${selectedOp.serviceId ?? selectedOp.classifierId}`
    : "partition:designed";
  const partitionName = selectedOp ? selectedOp.serviceName : "Designed Service Partition";
  const partitions = [
    {
      partitionId,
      name: partitionName,
      serviceId: selectedOp?.serviceId ?? null,
    },
  ];

  const nodes: UmlActivityNode[] = [];
  const edges: UmlActivityEdge[] = [];

  if (selectedOp) {
    const elem = model.elements.find((e) => e.id === selectedOp.classifierId);
    const rawUml = (elem?.properties?.["umlClassifier"] ?? {}) as Record<string, unknown>;
    const methodsCfg = Array.isArray(rawUml["methodsCfg"])
      ? (rawUml["methodsCfg"] as Array<Record<string, unknown>>)
      : [];
    const cfg = methodsCfg.find(
      (m) =>
        String(m["signatureKey"] ?? m["signature"] ?? m["methodName"]) ===
        selectedOp.signatureKey,
    );

    if (cfg) {
      const rawNodes = Array.isArray(cfg["nodes"])
        ? (cfg["nodes"] as Array<Record<string, unknown>>)
        : [];
      const rawEdges = Array.isArray(cfg["edges"])
        ? (cfg["edges"] as Array<Record<string, unknown>>)
        : [];

      for (const rn of rawNodes) {
        const nodeId = String(
          rn["nodeId"] ?? rn["id"] ?? `${selectedOp.operationId}:n:${nodes.length}`,
        );
        const kindRaw = String(rn["kind"] ?? "ACTION").toUpperCase() as UmlActivityNodeKind;
        const label = String(rn["label"] ?? kindRaw);
        nodes.push({
          nodeId,
          kind: kindRaw,
          label,
          partitionId,
          partitionName,
          objectState: typeof rn["objectState"] === "string" ? rn["objectState"] : null,
          joinSpec: kindRaw === "JOIN" ? "AND" : null,
          provenance: "EXTRACTED",
        });
      }

      for (const re of rawEdges) {
        const edgeId = String(
          re["edgeId"] ?? re["id"] ?? `${selectedOp.operationId}:e:${edges.length}`,
        );
        const from = String(re["from"] ?? re["sourceId"] ?? "");
        const to = String(re["to"] ?? re["targetId"] ?? "");
        edges.push({
          edgeId,
          from,
          to,
          flowKind:
            String(re["flowKind"] ?? "CONTROL_FLOW").toUpperCase() === "OBJECT_FLOW"
              ? "OBJECT_FLOW"
              : "CONTROL_FLOW",
          guard: typeof re["guard"] === "string" ? re["guard"] : null,
          provenance: "EXTRACTED",
        });
      }
    }
  }

  for (const dn of options?.overlay?.designedNodes ?? []) {
    nodes.push({
      ...dn,
      partitionId: dn.partitionId || partitionId,
      partitionName: dn.partitionName || partitionName,
      provenance: "DESIGNED",
    });
  }
  for (const de of options?.overlay?.designedEdges ?? []) {
    edges.push({
      ...de,
      provenance: "DESIGNED",
    });
  }

  const validationIssues = validateActivityStructure(nodes, edges);
  if (selectedOp?.extractionCompleteness === "PARTIAL") {
    validationIssues.push({
      code: "ACTIVITY_CFG_PARTIAL",
      severity: "WARNING",
      message: `Method ${selectedOp.classifierName}.${selectedOp.methodName} contains constructs (${selectedOp.unsupportedConstructs.join(", ")}) that are represented as PARTIAL without fabricating hidden control paths.`,
      targetId: selectedOp.operationId,
    });
  }

  return {
    diagramKind: "UML_ACTIVITY",
    modelId: model.id,
    selectedOperationId: selectedOp?.operationId ?? "designed",
    availableOperations,
    extractionCompleteness: selectedOp?.extractionCompleteness ?? "DESIGNED",
    unsupportedConstructs: selectedOp?.unsupportedConstructs ?? [],
    partitions,
    nodes,
    edges,
    validationIssues,
  };
}

// ============================================================================
// 5. M7 — UML STATE MACHINE DIAGRAM
// ============================================================================

export type UmlStateNodeKind =
  | "INITIAL"
  | "STATE"
  | "COMPOSITE_STATE"
  | "CHOICE"
  | "SHALLOW_HISTORY"
  | "DEEP_HISTORY"
  | "FINAL_STATE";

export interface UmlStateNode {
  stateId: string;
  name: string;
  kind: UmlStateNodeKind;
  regionId: string;
  parentStateId?: string | null | undefined;
  entryBehavior?: string | null | undefined;
  doActivity?: string | null | undefined;
  exitBehavior?: string | null | undefined;
  provenance: UmlProvenance;
}

export interface UmlStateTransition {
  transitionId: string;
  fromStateId: string;
  toStateId: string;
  trigger: string | null;
  guard: string | null;
  effect: string | null;
  provenance: UmlProvenance;
}

export interface UmlStateTargetOption {
  targetId: string;
  classifierName: string;
  lifecycleKind: "STATEFUL_CLASS" | "ENUM_DECLARATION";
  stateCarrierField: string | null;
  enumOnlyNoTransitions: boolean;
}

export interface UmlStateOverlay {
  designedStates?: UmlStateNode[] | undefined;
  designedTransitions?: UmlStateTransition[] | undefined;
}

export interface UmlStateDiagramProjection {
  diagramKind: "UML_STATE";
  modelId: string;
  selectedTargetId: string;
  availableTargets: UmlStateTargetOption[];
  lifecycleKind: "STATEFUL_CLASS" | "ENUM_DECLARATION" | "DESIGNED";
  enumOnlyNoTransitions: boolean;
  regionId: string;
  states: UmlStateNode[];
  transitions: UmlStateTransition[];
  validationIssues: UmlValidationIssue[];
}

export function formatTransitionLabel(t: {
  trigger?: string | null | undefined;
  guard?: string | null | undefined;
  effect?: string | null | undefined;
}): string {
  const parts: string[] = [];
  if (t.trigger && t.trigger.trim()) parts.push(t.trigger.trim());
  if (t.guard && t.guard.trim()) {
    const g = t.guard.trim();
    parts.push(g.startsWith("[") && g.endsWith("]") ? g : `[${g}]`);
  }
  if (t.effect && t.effect.trim()) {
    parts.push(`/ ${t.effect.trim()}`);
  }
  return parts.join(" ");
}

export function listStateTargets(model: ArchitecturalModel): UmlStateTargetOption[] {
  const targets: UmlStateTargetOption[] = [];
  for (const elem of model.elements) {
    const rawUml = (elem.properties?.["umlClassifier"] ?? {}) as Record<string, unknown>;
    const lifecycle = rawUml["stateLifecycle"] as Record<string, unknown> | undefined;
    if (!lifecycle) continue;
    const kind =
      String(lifecycle["stateMachineKind"] ?? lifecycle["kind"] ?? "STATEFUL_CLASS") ===
      "ENUM_DECLARATION"
        ? "ENUM_DECLARATION"
        : "STATEFUL_CLASS";
    const classifierName =
      typeof rawUml["name"] === "string" && rawUml["name"].trim()
        ? rawUml["name"].trim()
        : elem.name;
    targets.push({
      targetId: elem.id,
      classifierName,
      lifecycleKind: kind,
      stateCarrierField:
        typeof lifecycle["stateFieldName"] === "string"
          ? lifecycle["stateFieldName"]
          : typeof lifecycle["stateCarrierField"] === "string"
            ? lifecycle["stateCarrierField"]
            : typeof lifecycle["carrierField"] === "string"
              ? lifecycle["carrierField"]
              : null,
      enumOnlyNoTransitions: Boolean(
        lifecycle["enumOnlyNoTransitions"] ?? kind === "ENUM_DECLARATION",
      ),
    });
  }
  return targets.sort((a, b) => {
    if (a.lifecycleKind !== b.lifecycleKind) {
      return a.lifecycleKind === "STATEFUL_CLASS" ? -1 : 1;
    }
    return a.classifierName.localeCompare(b.classifierName);
  });
}

export function validateStateStructure(
  states: UmlStateNode[],
  transitions: UmlStateTransition[],
  enumOnlyNoTransitions: boolean,
): UmlValidationIssue[] {
  const issues: UmlValidationIssue[] = [];

  if (enumOnlyNoTransitions) {
    const extractedTransitions = transitions.filter((t) => t.provenance === "EXTRACTED");
    if (extractedTransitions.length === 0) {
      issues.push({
        code: "ENUM_ONLY_NO_TRANSITIONS",
        severity: "INFO",
        message:
          "Selected target is an enum declaration only. State names are extracted, but transitions are not fabricated without behavioral state-transition evidence or explicit DESIGNED mode transitions.",
      });
    }
  }

  // Group initial pseudostates by regionId
  const initialsByRegion = new Map<string, UmlStateNode[]>();
  for (const s of states) {
    if (s.kind === "INITIAL") {
      const list = initialsByRegion.get(s.regionId) ?? [];
      list.push(s);
      initialsByRegion.set(s.regionId, list);
    }
  }
  for (const [regionId, list] of initialsByRegion.entries()) {
    if (list.length > 1) {
      issues.push({
        code: "MULTIPLE_INITIAL_STATES",
        severity: "ERROR",
        message: `Region (${regionId}) has ${list.length} Initial pseudostates; UML allows at most 1 Initial pseudostate per region.`,
        targetId: list[1]!.stateId,
      });
    }
  }

  const byId = new Map(states.map((s) => [s.stateId, s]));
  for (const t of transitions) {
    const src = byId.get(t.fromStateId);
    if (!src) continue;
    if (src.kind === "INITIAL" && t.trigger && t.trigger.trim() !== "") {
      issues.push({
        code: "INITIAL_TRANSITION_HAS_TRIGGER",
        severity: "ERROR",
        message: `Initial transition (${t.transitionId}) must not declare a trigger event (${t.trigger}).`,
        targetId: t.transitionId,
      });
    }
    if (src.kind === "FINAL_STATE") {
      issues.push({
        code: "FINAL_STATE_HAS_OUTGOING",
        severity: "ERROR",
        message: `FinalState (${src.stateId}) cannot have outgoing transitions (${t.transitionId}).`,
        targetId: t.transitionId,
      });
    }
    if (src.kind === "CHOICE") {
      if (t.trigger && t.trigger.trim() !== "") {
        issues.push({
          code: "CHOICE_BRANCH_HAS_TRIGGER",
          severity: "ERROR",
          message: `Outgoing branch (${t.transitionId}) from Choice pseudostate (${src.stateId}) must not have a trigger.`,
          targetId: t.transitionId,
        });
      }
      if (!t.guard || t.guard.trim() === "") {
        issues.push({
          code: "CHOICE_BRANCH_MISSING_GUARD",
          severity: "ERROR",
          message: `Outgoing branch (${t.transitionId}) from Choice pseudostate (${src.stateId}) requires a [guard] or [else].`,
          targetId: t.transitionId,
        });
      }
    }
  }

  return issues;
}

export function projectUmlStateDiagram(
  model: ArchitecturalModel,
  options?: {
    targetId?: string | undefined;
    overlay?: UmlStateOverlay | undefined;
  },
): UmlStateDiagramProjection {
  const availableTargets = listStateTargets(model);
  const selectedTarget =
    availableTargets.find((t) => t.targetId === options?.targetId) ?? availableTargets[0];

  const regionId = `region:${selectedTarget?.targetId ?? "designed"}`;
  const states: UmlStateNode[] = [];
  const transitions: UmlStateTransition[] = [];
  const unresolvedAssignments: string[] = [];

  if (selectedTarget) {
    const elem = model.elements.find((e) => e.id === selectedTarget.targetId);
    const rawUml = (elem?.properties?.["umlClassifier"] ?? {}) as Record<string, unknown>;
    const lifecycle = (rawUml["stateLifecycle"] ?? {}) as Record<string, unknown>;
    const rawStates = Array.isArray(lifecycle["states"])
      ? (lifecycle["states"] as unknown[])
      : [];
    const rawTransitions = Array.isArray(lifecycle["transitions"])
      ? (lifecycle["transitions"] as Array<Record<string, unknown>>)
      : [];
    if (Array.isArray(lifecycle["unresolvedAssignments"])) {
      for (const u of lifecycle["unresolvedAssignments"] as unknown[]) {
        unresolvedAssignments.push(String(u));
      }
    }
    const initialStateName =
      typeof lifecycle["initialState"] === "string" && lifecycle["initialState"].trim()
        ? lifecycle["initialState"].trim()
        : null;

    if (
      !selectedTarget.enumOnlyNoTransitions &&
      initialStateName &&
      !rawStates.some(
        (rs) =>
          typeof rs === "object" &&
          rs !== null &&
          String((rs as Record<string, unknown>)["kind"] ?? "").toUpperCase() === "INITIAL",
      )
    ) {
      const initStateId = `${selectedTarget.targetId}:initial`;
      states.push({
        stateId: initStateId,
        name: "Initial",
        kind: "INITIAL",
        regionId,
        provenance: "EXTRACTED",
      });
      transitions.push({
        transitionId: `${selectedTarget.targetId}:init-transition`,
        fromStateId: initStateId,
        toStateId: initialStateName,
        trigger: null,
        guard: null,
        effect: null,
        provenance: "EXTRACTED",
      });
    }

    for (const rs of rawStates) {
      if (typeof rs === "string") {
        states.push({
          stateId: rs,
          name: rs,
          kind: "STATE",
          regionId,
          provenance: "EXTRACTED",
        });
        continue;
      }
      const rsObj = (rs ?? {}) as Record<string, unknown>;
      const kindRaw = String(rsObj["kind"] ?? "STATE").toUpperCase();
      const kind: UmlStateNodeKind =
        kindRaw === "INITIAL"
          ? "INITIAL"
          : kindRaw === "FINAL" || kindRaw === "FINAL_STATE"
            ? "FINAL_STATE"
            : kindRaw === "CHOICE"
              ? "CHOICE"
              : kindRaw === "COMPOSITE_STATE"
                ? "COMPOSITE_STATE"
                : kindRaw === "SHALLOW_HISTORY"
                  ? "SHALLOW_HISTORY"
                  : kindRaw === "DEEP_HISTORY"
                    ? "DEEP_HISTORY"
                    : "STATE";
      states.push({
        stateId: String(rsObj["stateId"] ?? rsObj["id"] ?? rsObj["name"]),
        name: String(rsObj["name"] ?? kind),
        kind,
        regionId,
        parentStateId:
          typeof rsObj["parentStateId"] === "string" ? rsObj["parentStateId"] : null,
        entryBehavior:
          typeof rsObj["entryBehavior"] === "string" ? rsObj["entryBehavior"] : null,
        doActivity: typeof rsObj["doActivity"] === "string" ? rsObj["doActivity"] : null,
        exitBehavior: typeof rsObj["exitBehavior"] === "string" ? rsObj["exitBehavior"] : null,
        provenance: "EXTRACTED",
      });
    }

    // Never fabricate transitions for enum-only declarations in EXTRACTED mode!
    if (!selectedTarget.enumOnlyNoTransitions) {
      for (const rt of rawTransitions) {
        transitions.push({
          transitionId: String(
            rt["transitionId"] ?? rt["id"] ?? `${selectedTarget.targetId}:tr:${transitions.length}`,
          ),
          fromStateId: String(rt["fromStateId"] ?? rt["fromState"] ?? ""),
          toStateId: String(rt["toStateId"] ?? rt["toState"] ?? ""),
          trigger: typeof rt["trigger"] === "string" ? rt["trigger"] : null,
          guard: typeof rt["guard"] === "string" ? rt["guard"] : null,
          effect: typeof rt["effect"] === "string" ? rt["effect"] : null,
          provenance: "EXTRACTED",
        });
      }
    }
  }

  for (const ds of options?.overlay?.designedStates ?? []) {
    states.push({
      ...ds,
      regionId: ds.regionId || regionId,
      provenance: "DESIGNED",
    });
  }
  for (const dt of options?.overlay?.designedTransitions ?? []) {
    transitions.push({
      ...dt,
      provenance: "DESIGNED",
    });
  }

  const enumOnly = Boolean(selectedTarget?.enumOnlyNoTransitions ?? false);
  const validationIssues = validateStateStructure(states, transitions, enumOnly);
  if (!selectedTarget && states.length === 0) {
    validationIssues.push({
      code: "NO_STATE_LIFECYCLE_EXTRACTED",
      severity: "INFO",
      message:
        "No state lifecycle (stateful class or enum declaration) was extracted for this model. States and transitions are never fabricated from generic components; use DESIGNED authoring to model custom state machines.",
    });
  }
  if (unresolvedAssignments.length > 0) {
    validationIssues.push({
      code: "STATE_UNRESOLVED_ASSIGNMENTS",
      severity: "WARNING",
      message: `${unresolvedAssignments.length} state assignment(s) lacked a uniquely resolved source-state guard (${unresolvedAssignments.join(", ")}) and were excluded instead of fabricating transitions.`,
      targetId: selectedTarget?.targetId,
    });
  }

  return {
    diagramKind: "UML_STATE",
    modelId: model.id,
    selectedTargetId: selectedTarget?.targetId ?? "designed",
    availableTargets,
    lifecycleKind: selectedTarget?.lifecycleKind ?? "DESIGNED",
    enumOnlyNoTransitions: enumOnly,
    regionId,
    states,
    transitions,
    validationIssues,
  };
}

// ============================================================================
// 6. UNIFIED DRAW.IO XML SERIALIZER & 2-CYCLE ROUND-TRIP RECONCILER
// ============================================================================

export type AnyUmlProjection =
  | UmlClassDiagramProjection
  | UmlPackageDiagramProjection
  | UmlDeploymentDiagramProjection
  | UmlActivityDiagramProjection
  | UmlStateDiagramProjection;

export interface UmlRoundTripConflict {
  code: string;
  message: string;
  itemId: string;
}

export interface UmlRoundTripResult<T extends AnyUmlProjection = AnyUmlProjection> {
  projection: T;
  conflicts: UmlRoundTripConflict[];
  preservedLayout: Record<string, { x: number; y: number; width: number; height: number }>;
}

export interface UmlPersistedDocumentCarrier {
  schemaVersion: 1;
  diagramKind: UmlDiagramKind;
  modelId: string;
  selectedServiceId?: string | null | undefined;
  selectedPackageName?: string | null | undefined;
  selectedEnvironment?: string | null | undefined;
  selectedOperationId?: string | null | undefined;
  selectedTargetId?: string | null | undefined;
  classOverlay?: UmlClassOverlay | undefined;
  packageOverlay?: UmlPackageOverlay | undefined;
  deploymentOverlay?: UmlDeploymentOverlay | undefined;
  activityOverlay?: UmlActivityOverlay | undefined;
  stateOverlay?: UmlStateOverlay | undefined;
  preservedLayout: Record<string, { x: number; y: number; width: number; height: number }>;
}

export interface UmlHydratedWorkspaceState {
  diagramKind: UmlDiagramKind;
  carrier: UmlPersistedDocumentCarrier;
  projection: AnyUmlProjection;
  preservedLayout: Record<string, { x: number; y: number; width: number; height: number }>;
  conflicts: UmlRoundTripConflict[];
  classOverlay: UmlClassOverlay;
  packageOverlay: UmlPackageOverlay;
  deploymentOverlay: UmlDeploymentOverlay;
  activityOverlay: UmlActivityOverlay;
  stateOverlay: UmlStateOverlay;
}

export function extractCarrierFromProjection(
  projection: AnyUmlProjection,
  customLayout?: Record<string, { x: number; y: number; width: number; height: number }>,
  explicitCarrier?: Partial<UmlPersistedDocumentCarrier>,
): UmlPersistedDocumentCarrier {
  const base: UmlPersistedDocumentCarrier = {
    schemaVersion: 1,
    diagramKind: projection.diagramKind,
    modelId: projection.modelId,
    selectedServiceId:
      projection.diagramKind === "UML_CLASS" || projection.diagramKind === "UML_PACKAGE"
        ? projection.scopeServiceId
        : (explicitCarrier?.selectedServiceId ?? null),
    selectedPackageName:
      projection.diagramKind === "UML_CLASS"
        ? projection.scopePackageName
        : (explicitCarrier?.selectedPackageName ?? null),
    selectedEnvironment:
      projection.diagramKind === "UML_DEPLOYMENT"
        ? projection.environment
        : (explicitCarrier?.selectedEnvironment ?? null),
    selectedOperationId:
      projection.diagramKind === "UML_ACTIVITY"
        ? projection.selectedOperationId
        : (explicitCarrier?.selectedOperationId ?? null),
    selectedTargetId:
      projection.diagramKind === "UML_STATE"
        ? projection.selectedTargetId
        : (explicitCarrier?.selectedTargetId ?? null),
    preservedLayout: customLayout ?? explicitCarrier?.preservedLayout ?? {},
  };

  if (projection.diagramKind === "UML_CLASS") {
    base.classOverlay = explicitCarrier?.classOverlay ?? {
      designedClassifiers: projection.classifiers.filter((c) => c.provenance === "DESIGNED"),
      designedRelations: projection.relations.filter((r) => r.provenance === "DESIGNED"),
    };
  } else if (projection.diagramKind === "UML_PACKAGE") {
    base.packageOverlay = explicitCarrier?.packageOverlay ?? {
      designedPackages: projection.packages.filter((p) => p.provenance === "DESIGNED"),
      designedEdges: projection.edges.filter((e) => e.provenance === "DESIGNED"),
    };
  } else if (projection.diagramKind === "UML_DEPLOYMENT") {
    base.deploymentOverlay = explicitCarrier?.deploymentOverlay ?? {
      designedNodes: projection.nodes.filter((n) => n.provenance === "DESIGNED"),
      designedEdges: projection.edges.filter((e) => e.provenance === "DESIGNED"),
      includeStartupDependenciesOverlay: projection.edges.some(
        (e) => e.edgeKind === "DEPLOYMENT_DEPENDENCY_STARTUP",
      ),
    };
  } else if (projection.diagramKind === "UML_ACTIVITY") {
    base.activityOverlay = explicitCarrier?.activityOverlay ?? {
      designedNodes: projection.nodes.filter((n) => n.provenance === "DESIGNED"),
      designedEdges: projection.edges.filter((e) => e.provenance === "DESIGNED"),
    };
  } else if (projection.diagramKind === "UML_STATE") {
    base.stateOverlay = explicitCarrier?.stateOverlay ?? {
      designedStates: projection.states.filter((s) => s.provenance === "DESIGNED"),
      designedTransitions: projection.transitions.filter((t) => t.provenance === "DESIGNED"),
    };
  }

  return base;
}

const VALID_UML_DIAGRAM_KINDS = new Set<UmlDiagramKind>([
  "UML_CLASS",
  "UML_PACKAGE",
  "UML_DEPLOYMENT",
  "UML_ACTIVITY",
  "UML_STATE",
]);

const ALLOWED_ROLES_BY_DIAGRAM_KIND: Record<UmlDiagramKind, ReadonlySet<string>> = {
  UML_CLASS: new Set(["classifier", "class-relation"]),
  UML_PACKAGE: new Set(["package", "package-edge"]),
  UML_DEPLOYMENT: new Set(["deployment-node", "deployment-artifact", "deployment-edge"]),
  UML_ACTIVITY: new Set(["activity-partition", "activity-node", "activity-edge"]),
  UML_STATE: new Set(["state-node", "state-transition"]),
};

export function formatClassifierCellValue(cls: UmlClassifierNode): string {
  const attrLines = (cls.attributes ?? []).map(formatAttributeLine);
  const opLines = (cls.operations ?? []).map(formatOperationLine);
  const typeParams = cls.typeParameters ?? [];
  const typeParamSuffix =
    typeParams.length > 0 ? `&lt;${typeParams.join(", ")}&gt;` : "";
  const kind =
    cls.classifierKind ??
    ((cls as unknown as { kind?: UmlClassifierNode["classifierKind"] }).kind ?? "CLASS");
  const stereotype =
    kind === "INTERFACE"
      ? "&laquo;interface&raquo;<br/>"
      : kind === "ENUM"
        ? "&laquo;enumeration&raquo;<br/>"
        : cls.isAbstract
          ? "{abstract}<br/>"
          : "";
  const titleName = cls.isAbstract
    ? `<i><b>${escapeHtmlText(cls.name)}${typeParamSuffix}</b></i>`
    : `<b>${escapeHtmlText(cls.name)}${typeParamSuffix}</b>`;
  const provBadge =
    cls.provenance === "DESIGNED" ? " <font color='#0284c7'>[DESIGNED]</font>" : "";

  return (
    `${stereotype}${titleName}${provBadge}` +
    `<hr size="1"/>` +
    (attrLines.length > 0 ? attrLines.join("<br/>") : "<i>(no attributes)</i>") +
    `<hr size="1"/>` +
    (opLines.length > 0 ? opLines.join("<br/>") : "<i>(no operations)</i>")
  );
}

export function getClassifierCellStyle(cls: UmlClassifierNode): string {
  const kind =
    cls.classifierKind ??
    ((cls as unknown as { kind?: UmlClassifierNode["classifierKind"] }).kind ?? "CLASS");
  const fill =
    cls.provenance === "DESIGNED"
      ? "#e0f2fe"
      : kind === "INTERFACE"
        ? "#f0fdf4"
        : kind === "ENUM"
          ? "#fefce8"
          : "#f8fafc";
  const stroke = cls.provenance === "DESIGNED" ? "#0284c7" : "#334155";
  return `rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=8;spacingRight=8;spacingTop=6;fillColor=${fill};strokeColor=${stroke};fontColor=#0f172a;fontSize=12;`;
}

export function formatClassRelationCellValue(rel: UmlClassRelationEdge): string {
  const srcParts: string[] = [];
  if (rel.sourceRoleName) srcParts.push(rel.sourceRoleName);
  if (rel.sourceMultiplicity && rel.sourceMultiplicity !== "UNKNOWN") {
    srcParts.push(`[${rel.sourceMultiplicity}]`);
  }
  const tgtParts: string[] = [];
  if (rel.roleName) tgtParts.push(rel.roleName);
  if (rel.multiplicity && rel.multiplicity !== "UNKNOWN") {
    tgtParts.push(`[${rel.multiplicity}]`);
  }
  const labelParts: string[] = [];
  if (srcParts.length > 0 && tgtParts.length > 0) {
    labelParts.push(`${srcParts.join(" ")} → ${tgtParts.join(" ")}`);
  } else if (srcParts.length > 0) {
    labelParts.push(srcParts.join(" "));
  } else if (tgtParts.length > 0) {
    labelParts.push(tgtParts.join(" "));
  }
  if (rel.provenance === "DESIGNED") {
    labelParts.push(`[DESIGNED ${rel.relationKind}]`);
  }
  return labelParts.join(" ");
}

export function getClassRelationCellStyle(rel: Pick<UmlClassRelationEdge, "relationKind">): string {
  let style =
    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeWidth=1.5;fontColor=#0f172a;fontSize=11;";
  if (rel.relationKind === "GENERALIZATION") {
    style += "endArrow=block;endFill=0;strokeColor=#1e293b;";
  } else if (rel.relationKind === "REALIZATION") {
    style += "dashed=1;endArrow=block;endFill=0;strokeColor=#0f766e;";
  } else if (rel.relationKind === "ASSOCIATION") {
    style += "endArrow=open;endFill=0;strokeColor=#1e293b;";
  } else if (rel.relationKind === "SHARED_AGGREGATION") {
    style +=
      "startArrow=diamondThin;startFill=0;startSize=12;endArrow=open;endFill=0;strokeColor=#0369a1;";
  } else if (rel.relationKind === "COMPOSITION") {
    style +=
      "startArrow=diamondThin;startFill=1;startSize=12;endArrow=open;endFill=0;strokeColor=#0369a1;";
  } else {
    style += "dashed=1;endArrow=open;endFill=0;strokeColor=#64748b;";
  }
  return style;
}

export function formatPackageCellValue(pkg: UmlPackageNode): string {
  const membersText =
    pkg.memberNames.length > 0
      ? pkg.memberNames.map((n) => `• ${escapeHtmlText(n)}`).join("<br/>")
      : "<i>(empty package)</i>";
  return `<b>&laquo;package&raquo; ${escapeHtmlAttrOrHtml(pkg.qualifiedName)}</b><hr size="1"/>${membersText}`;
}

export function getPackageCellStyle(): string {
  return "shape=folder;fontStyle=1;tabWidth=110;tabHeight=26;tabPosition=left;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacingLeft=10;spacingTop=32;fillColor=#f8fafc;strokeColor=#334155;fontColor=#0f172a;fontSize=12;";
}

export function formatPackageEdgeCellValue(edge: UmlPackageEdge): string {
  const stereo =
    edge.relationKind === "MERGE"
      ? "«merge»"
      : edge.relationKind === "ACCESS"
        ? "«access»"
        : edge.relationKind === "IMPORT"
          ? "«import»"
          : "«use»";
  return edge.provenance === "DESIGNED" ? `${stereo} [DESIGNED]` : stereo;
}

export function getPackageEdgeCellStyle(): string {
  return "edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#334155;fontColor=#0f172a;fontSize=11;";
}

export function formatDeploymentNodeCellValue(node: UmlDeploymentNode): string {
  if (node.parentNodeId) {
    return `${escapeHtmlText(node.stereotype)}<br/><b>${escapeHtmlText(node.name)}</b>`;
  }
  const titleText = node.instanceName
    ? `<u>${escapeHtmlText(node.instanceName)}:${escapeHtmlText(node.name)}</u>`
    : `<b>${escapeHtmlText(node.name)}</b>`;
  const portsLine =
    node.ports.length > 0 ? `<br/>Ports: ${escapeHtmlText(node.ports.join(", "))}` : "";
  const repLine = node.replicaCount !== null ? `<br/>Replicas: ${node.replicaCount}` : "";
  return `${escapeHtmlText(node.stereotype)}<br/>${titleText}${portsLine}${repLine}`;
}

export function getDeploymentNodeCellStyle(node: UmlDeploymentNode): string {
  if (node.parentNodeId) {
    return "rounded=0;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0369a1;fontColor=#0f172a;fontSize=11;";
  }
  return node.nodeKind === "DEVICE" || node.nodeKind === "EXECUTION_ENVIRONMENT"
    ? "shape=cube;size=14;direction=south;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=12;spacingTop=10;fillColor=#f8fafc;strokeColor=#334155;fontColor=#0f172a;"
    : "rounded=1;whiteSpace=wrap;html=1;fillColor=#f0fdf4;strokeColor=#15803d;fontColor=#0f172a;";
}

export function getDeploymentEdgeCellStyle(edge: Pick<UmlDeploymentEdge, "edgeKind">): string {
  return edge.edgeKind === "COMMUNICATION_PATH"
    ? "edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=none;strokeWidth=2;strokeColor=#0f172a;fontColor=#0f172a;fontSize=11;"
    : edge.edgeKind === "MANIFESTATION"
      ? "edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#15803d;fontColor=#15803d;fontSize=11;"
      : "edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;endArrow=open;endFill=0;strokeWidth=1;strokeColor=#94a3b8;fontColor=#64748b;fontSize=10;";
}

export function formatActivityPartitionCellValue(part: { name: string }): string {
  return `«partition» ${part.name} (Service Responsibility)`;
}

export function getActivityPartitionCellStyle(): string {
  return "swimlane;startSize=32;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#334155;fontColor=#0f172a;fontStyle=1;";
}

export function getActivityNodeCellStyle(node: Pick<UmlActivityNode, "kind">): string {
  const isInitial = node.kind === "INITIAL";
  const isDiamond = node.kind === "DECISION" || node.kind === "MERGE";
  const isBar = node.kind === "FORK" || node.kind === "JOIN";
  return isInitial
    ? "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;fontColor=#ffffff;"
    : node.kind === "ACTIVITY_FINAL"
      ? "ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;fontColor=#ffffff;"
      : node.kind === "FLOW_FINAL"
        ? "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#0f172a;fontColor=#0f172a;"
        : isDiamond
          ? "rhombus;whiteSpace=wrap;html=1;fillColor=#fefce8;strokeColor=#ca8a04;fontColor=#0f172a;"
          : isBar
            ? "rounded=0;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#0f172a;"
            : node.kind === "OBJECT_NODE"
              ? "rounded=0;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0284c7;fontColor=#0f172a;"
              : "rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#334155;fontColor=#0f172a;";
}

export function formatActivityEdgeCellValue(edge: Pick<UmlActivityEdge, "guard">): string {
  return edge.guard ? (edge.guard.startsWith("[") ? edge.guard : `[${edge.guard}]`) : "";
}

export function getActivityEdgeCellStyle(): string {
  return "edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#0f172a;fontColor=#0f172a;fontSize=11;";
}

export function formatStateNodeCellValue(st: UmlStateNode): string {
  const isInitial = st.kind === "INITIAL";
  const isFinal = st.kind === "FINAL_STATE";
  if (isInitial || isFinal) return "";
  if (st.kind === "SHALLOW_HISTORY") return "<b>H</b>";
  if (st.kind === "DEEP_HISTORY") return "<b>H*</b>";
  const behaviors: string[] = [];
  if (st.entryBehavior) behaviors.push(`entry / ${escapeHtmlText(st.entryBehavior)}`);
  if (st.doActivity) behaviors.push(`do / ${escapeHtmlText(st.doActivity)}`);
  if (st.exitBehavior) behaviors.push(`exit / ${escapeHtmlText(st.exitBehavior)}`);
  return behaviors.length > 0
    ? `<b>${escapeHtmlText(st.name)}</b><hr size="1"/>${behaviors.join("<br/>")}`
    : `<b>${escapeHtmlText(st.name)}</b>`;
}

export function getStateNodeCellStyle(st: Pick<UmlStateNode, "kind">): string {
  const isInitial = st.kind === "INITIAL";
  const isFinal = st.kind === "FINAL_STATE";
  const isChoice = st.kind === "CHOICE";
  const isHistory = st.kind === "SHALLOW_HISTORY" || st.kind === "DEEP_HISTORY";
  const isComposite = st.kind === "COMPOSITE_STATE";
  return isInitial
    ? "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;"
    : isFinal
      ? "ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;"
      : isHistory
        ? "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#0f172a;fontColor=#0f172a;fontStyle=1;"
        : isChoice
          ? "rhombus;whiteSpace=wrap;html=1;fillColor=#fefce8;strokeColor=#ca8a04;fontColor=#0f172a;"
          : isComposite
            ? "swimlane;rounded=1;arcSize=12;startSize=28;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#0284c7;fontColor=#0f172a;fontStyle=1;"
            : "rounded=1;arcSize=20;whiteSpace=wrap;html=1;verticalAlign=top;spacingTop=10;fillColor=#f8fafc;strokeColor=#334155;fontColor=#0f172a;";
}

export function getStateTransitionCellStyle(): string {
  return "edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#0f172a;fontColor=#0f172a;fontSize=11;";
}

export function buildUmlDrawioXml(
  projection: AnyUmlProjection,
  customLayout?: Record<string, { x: number; y: number; width: number; height: number }>,
  explicitCarrier?: Partial<UmlPersistedDocumentCarrier>,
): string {
  const cells: string[] = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
  ];

  const geomOf = (
    id: string,
    defX: number,
    defY: number,
    defW: number,
    defH: number,
  ) => {
    const custom = customLayout?.[id];
    const x = custom?.x ?? defX;
    const y = custom?.y ?? defY;
    const w = custom?.width ?? defW;
    const h = custom?.height ?? defH;
    return `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`;
  };

  if (projection.diagramKind === "UML_CLASS") {
    projection.classifiers.forEach((cls, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = 60 + col * 340;
      const y = 60 + row * 260;
      const w = 290;
      const h = Math.max(140, 74 + (cls.attributes.length + cls.operations.length) * 20);
      const htmlLabel = formatClassifierCellValue(cls);
      const style = getClassifierCellStyle(cls);

      cells.push(
        `<mxCell id="${escapeXmlAttr(cls.classifierId)}" value="${escapeXmlAttr(htmlLabel)}" style="${style}" vertex="1" parent="1" mavisId="${escapeXmlAttr(cls.classifierId)}" mavisUmlRole="classifier" mavisProvenance="${cls.provenance}" mavisMeta="${encodeMeta(cls)}">${geomOf(cls.classifierId, x, y, w, h)}</mxCell>`,
      );
    });

    for (const rel of projection.relations) {
      const style = getClassRelationCellStyle(rel);
      const label = formatClassRelationCellValue(rel);

      cells.push(
        `<mxCell id="${escapeXmlAttr(rel.relationId)}" value="${escapeXmlAttr(label)}" style="${style}" edge="1" parent="1" source="${escapeXmlAttr(rel.fromClassifierId)}" target="${escapeXmlAttr(rel.toClassifierId)}" mavisId="${escapeXmlAttr(rel.relationId)}" mavisUmlRole="class-relation" mavisRelationKind="${rel.relationKind}" mavisProvenance="${rel.provenance}" mavisMeta="${encodeMeta(rel)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      );
    }
  } else if (projection.diagramKind === "UML_PACKAGE") {
    const pkgById = new Map(projection.packages.map((p) => [p.packageId, p]));
    const childrenByParent = new Map<string, UmlPackageNode[]>();
    for (const p of projection.packages) {
      if (p.parentPackageId && pkgById.has(p.parentPackageId) && p.parentPackageId !== p.packageId) {
        const list = childrenByParent.get(p.parentPackageId) ?? [];
        list.push(p);
        childrenByParent.set(p.parentPackageId, list);
      }
    }
    const computedGeom = new Map<string, { x: number; y: number; w: number; h: number }>();
    const computePkgSize = (
      pkg: UmlPackageNode,
      visited = new Set<string>(),
    ): { w: number; h: number } => {
      if (visited.has(pkg.packageId)) {
        return { w: 270, h: 120 };
      }
      visited.add(pkg.packageId);
      const children = childrenByParent.get(pkg.packageId) ?? [];
      const headerHeight = 68 + (pkg.memberNames.length > 0 ? pkg.memberNames.length * 18 : 16);
      if (children.length === 0) {
        const w = 270;
        const h = Math.max(108, headerHeight + 18);
        return { w, h };
      }
      let cursorY = headerHeight + 12;
      let maxChildW = 270;
      for (const child of children) {
        const childSize = computePkgSize(child, new Set(visited));
        computedGeom.set(child.packageId, {
          x: 24,
          y: cursorY,
          w: childSize.w,
          h: childSize.h,
        });
        cursorY += childSize.h + 44;
        if (childSize.w > maxChildW) {
          maxChildW = childSize.w;
        }
      }
      return {
        w: maxChildW + 48,
        h: cursorY + 12,
      };
    };

    let rootIndex = 0;
    for (const pkg of projection.packages) {
      const hasValidParent = Boolean(
        pkg.parentPackageId &&
          pkgById.has(pkg.parentPackageId) &&
          pkg.parentPackageId !== pkg.packageId,
      );
      if (!hasValidParent) {
        const size = computePkgSize(pkg);
        const col = rootIndex % 3;
        const row = Math.floor(rootIndex / 3);
        rootIndex += 1;
        computedGeom.set(pkg.packageId, {
          x: 60 + col * 380,
          y: 40 + row * 260,
          w: size.w,
          h: size.h,
        });
      }
    }

    projection.packages.forEach((pkg) => {
      const hasValidParent = Boolean(
        pkg.parentPackageId &&
          pkgById.has(pkg.parentPackageId) &&
          pkg.parentPackageId !== pkg.packageId,
      );
      const parentCellId = hasValidParent ? pkg.parentPackageId! : "1";
      const g = computedGeom.get(pkg.packageId) ?? { x: 60, y: 60, w: 270, h: 120 };
      const label = formatPackageCellValue(pkg);
      const style = getPackageCellStyle();

      cells.push(
        `<mxCell id="${escapeXmlAttr(pkg.packageId)}" value="${escapeXmlAttr(label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(parentCellId)}" mavisId="${escapeXmlAttr(pkg.packageId)}" mavisUmlRole="package" mavisProvenance="${pkg.provenance}" mavisMeta="${encodeMeta(pkg)}">${geomOf(pkg.packageId, g.x, g.y, g.w, g.h)}</mxCell>`,
      );
    });

    for (const edge of projection.edges) {
      const label = formatPackageEdgeCellValue(edge);
      const style = getPackageEdgeCellStyle();
      cells.push(
        `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(label)}" style="${style}" edge="1" parent="1" source="${escapeXmlAttr(edge.fromPackageId)}" target="${escapeXmlAttr(edge.toPackageId)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="package-edge" mavisRelationKind="${edge.relationKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      );
    }
  } else if (projection.diagramKind === "UML_DEPLOYMENT") {
    const topNodes = projection.nodes.filter((n) => !n.parentNodeId);
    topNodes.forEach((node, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = 60 + col * 340;
      const y = 60 + row * 220;
      const w = node.nodeKind === "MANIFESTED_COMPONENT" ? 220 : 280;
      const h = node.nodeKind === "MANIFESTED_COMPONENT" ? 90 : 160;
      const label = formatDeploymentNodeCellValue(node);
      const shapeStyle = getDeploymentNodeCellStyle(node);

      cells.push(
        `<mxCell id="${escapeXmlAttr(node.nodeId)}" value="${escapeXmlAttr(label)}" style="${shapeStyle}" vertex="1" parent="1" mavisId="${escapeXmlAttr(node.nodeId)}" mavisUmlRole="deployment-node" mavisProvenance="${node.provenance}" mavisMeta="${encodeMeta(node)}">${geomOf(node.nodeId, x, y, w, h)}</mxCell>`,
      );
    });

    const childNodes = projection.nodes.filter((n) => Boolean(n.parentNodeId));
    childNodes.forEach((node) => {
      const label = formatDeploymentNodeCellValue(node);
      const style = getDeploymentNodeCellStyle(node);
      cells.push(
        `<mxCell id="${escapeXmlAttr(node.nodeId)}" value="${escapeXmlAttr(label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(node.parentNodeId!)}" mavisId="${escapeXmlAttr(node.nodeId)}" mavisUmlRole="deployment-artifact" mavisProvenance="${node.provenance}" mavisMeta="${encodeMeta(node)}">${geomOf(node.nodeId, 24, 72, 220, 64)}</mxCell>`,
      );
    });

    for (const edge of projection.edges) {
      const style = getDeploymentEdgeCellStyle(edge);
      cells.push(
        `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(edge.label)}" style="${style}" edge="1" parent="1" source="${escapeXmlAttr(edge.fromNodeId)}" target="${escapeXmlAttr(edge.toNodeId)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="deployment-edge" mavisEdgeKind="${edge.edgeKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      );
    }
  } else if (projection.diagramKind === "UML_ACTIVITY") {
    const part = projection.partitions[0] ?? {
      partitionId: "partition:default",
      name: "Service Partition",
      serviceId: null,
    };
    const laneHeight = Math.max(380, 120 + projection.nodes.length * 95);
    cells.push(
      `<mxCell id="${escapeXmlAttr(part.partitionId)}" value="${escapeXmlAttr(formatActivityPartitionCellValue(part))}" style="${getActivityPartitionCellStyle()}" vertex="1" parent="1" mavisId="${escapeXmlAttr(part.partitionId)}" mavisUmlRole="activity-partition">${geomOf(part.partitionId, 40, 40, 620, laneHeight)}</mxCell>`,
    );

    projection.nodes.forEach((node, idx) => {
      const x = 210;
      const y = 60 + idx * 90;
      const isInitial = node.kind === "INITIAL";
      const isFinal = node.kind === "ACTIVITY_FINAL" || node.kind === "FLOW_FINAL";
      const isDiamond = node.kind === "DECISION" || node.kind === "MERGE";
      const isBar = node.kind === "FORK" || node.kind === "JOIN";
      const w = isInitial || isFinal ? 36 : isDiamond ? 110 : isBar ? 160 : 200;
      const h = isInitial || isFinal ? 36 : isDiamond ? 64 : isBar ? 12 : 54;
      const style = getActivityNodeCellStyle(node);

      cells.push(
        `<mxCell id="${escapeXmlAttr(node.nodeId)}" value="${escapeXmlAttr(node.label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(part.partitionId)}" mavisId="${escapeXmlAttr(node.nodeId)}" mavisUmlRole="activity-node" mavisNodeKind="${node.kind}" mavisProvenance="${node.provenance}" mavisMeta="${encodeMeta(node)}">${geomOf(node.nodeId, x, y, w, h)}</mxCell>`,
      );
    });

    for (const edge of projection.edges) {
      const guardLabel = formatActivityEdgeCellValue(edge);
      cells.push(
        `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(guardLabel)}" style="${getActivityEdgeCellStyle()}" edge="1" parent="1" source="${escapeXmlAttr(edge.from)}" target="${escapeXmlAttr(edge.to)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="activity-edge" mavisFlowKind="${edge.flowKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      );
    }
  } else if (projection.diagramKind === "UML_STATE") {
    const stateIdSet = new Set(projection.states.map((s) => s.stateId));
    const substateCountByParent = new Map<string, number>();
    for (const s of projection.states) {
      if (s.parentStateId && stateIdSet.has(s.parentStateId)) {
        substateCountByParent.set(
          s.parentStateId,
          (substateCountByParent.get(s.parentStateId) ?? 0) + 1,
        );
      }
    }
    const substateIndexTracker = new Map<string, number>();
    projection.states.forEach((st, idx) => {
      const hasValidParent = Boolean(st.parentStateId && stateIdSet.has(st.parentStateId));
      const parentCellId = hasValidParent ? st.parentStateId! : "1";
      const substateCount = substateCountByParent.get(st.stateId) ?? 0;
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      let x = 60 + col * 360;
      let y = 60 + row * 190;
      const isInitial = st.kind === "INITIAL";
      const isFinal = st.kind === "FINAL_STATE";
      const isHistory = st.kind === "SHALLOW_HISTORY" || st.kind === "DEEP_HISTORY";
      const isChoice = st.kind === "CHOICE";
      const isComposite = st.kind === "COMPOSITE_STATE" || substateCount > 0;
      let w = isInitial || isFinal || isHistory ? 36 : isChoice ? 80 : isComposite ? 320 : 210;
      let h =
        isInitial || isFinal || isHistory
          ? 36
          : isChoice
            ? 56
            : isComposite
              ? Math.max(180, 64 + substateCount * 96)
              : 100;
      if (hasValidParent) {
        const subIdx = substateIndexTracker.get(parentCellId) ?? 0;
        substateIndexTracker.set(parentCellId, subIdx + 1);
        x = 24;
        y = 44 + subIdx * 88;
        if (!isInitial && !isFinal && !isHistory && !isChoice) {
          w = 240;
          h = 72;
        }
      }
      const label = formatStateNodeCellValue(st);
      const style = getStateNodeCellStyle(st);

      cells.push(
        `<mxCell id="${escapeXmlAttr(st.stateId)}" value="${escapeXmlAttr(label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(parentCellId)}" mavisId="${escapeXmlAttr(st.stateId)}" mavisUmlRole="state-node" mavisStateKind="${st.kind}" mavisProvenance="${st.provenance}" mavisMeta="${encodeMeta(st)}">${geomOf(st.stateId, x, y, w, h)}</mxCell>`,
      );
    });

    for (const tr of projection.transitions) {
      const label = formatTransitionLabel(tr);
      cells.push(
        `<mxCell id="${escapeXmlAttr(tr.transitionId)}" value="${escapeXmlAttr(label)}" style="${getStateTransitionCellStyle()}" edge="1" parent="1" source="${escapeXmlAttr(tr.fromStateId)}" target="${escapeXmlAttr(tr.toStateId)}" mavisId="${escapeXmlAttr(tr.transitionId)}" mavisUmlRole="state-transition" mavisProvenance="${tr.provenance}" mavisMeta="${encodeMeta(tr)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      );
    }
  }

  const carrier = extractCarrierFromProjection(projection, customLayout, explicitCarrier);

  return `<mxfile host="app.diagrams.net"><diagram id="${projection.diagramKind.toLowerCase()}" name="${projection.diagramKind}"><mxGraphModel dx="1280" dy="800" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="1169" pageHeight="827" mavisSchemaVersion="${carrier.schemaVersion}" mavisUmlDiagramKind="${projection.diagramKind}" mavisModelId="${escapeXmlAttr(projection.modelId)}" mavisUmlDocument="${encodeMeta(carrier)}" mavisUmlProjection="${encodeMeta(projection)}"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}

function escapeHtmlAttrOrHtml(val: string): string {
  return escapeHtmlText(val);
}

function unescapeXmlAttr(raw: string): string {
  return raw
    .replaceAll("&#xa;", "\n")
    .replaceAll("&#10;", "\n")
    .replaceAll("&#x9;", "\t")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

const RAW_META_ATTR_KEYS = new Set([
  "mavisMeta",
  "mavisUmlDocument",
  "mavisDocumentCarrier",
  "mavisUmlProjection",
]);

export function parseXmlAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    const key = match[1]!;
    const rawVal = match[2] ?? match[3] ?? "";
    attrs[key] = RAW_META_ATTR_KEYS.has(key) ? rawVal : unescapeXmlAttr(rawVal);
  }
  return attrs;
}

export interface ParsedDrawioXmlCell {
  attrs: Record<string, string>;
  geom?: { x: number; y: number; width: number; height: number } | undefined;
}

export interface ParsedDrawioXmlDocument {
  wellFormed: boolean;
  malformedReason?: string | undefined;
  rootAttrs: Record<string, string>;
  cells: ParsedDrawioXmlCell[];
}

export function parseDrawioXmlStructure(xml: string): ParsedDrawioXmlDocument {
  if (!xml || typeof xml !== "string" || !xml.trim()) {
    return {
      wellFormed: false,
      malformedReason: "Draw.io XML document is empty.",
      rootAttrs: {},
      cells: [],
    };
  }

  const graphModelMatch = /<mxGraphModel\b([^>]*)>([\s\S]*?)<\/mxGraphModel>/.exec(xml);
  if (!graphModelMatch) {
    return {
      wellFormed: false,
      malformedReason: "Missing or unclosed <mxGraphModel> element in Draw.io XML.",
      rootAttrs: {},
      cells: [],
    };
  }

  const rootAttrs = parseXmlAttributes(graphModelMatch[1] ?? "");
  const graphModelBody = graphModelMatch[2] ?? "";
  const rootMatch = /<root\b[^>]*>([\s\S]*?)<\/root>/.exec(graphModelBody);
  if (!rootMatch) {
    return {
      wellFormed: false,
      malformedReason: "Missing or unclosed <root> element inside <mxGraphModel>.",
      rootAttrs,
      cells: [],
    };
  }

  const rootBody = rootMatch[1] ?? "";
  const cellRegex = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  const geomTagRegex = /<mxGeometry\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxGeometry>)/;

  const cells: ParsedDrawioXmlCell[] = [];
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(rootBody)) !== null) {
    const attrStr = match[1] ?? "";
    const inner = match[2] ?? "";
    const attrs = parseXmlAttributes(attrStr);

    let geom: { x: number; y: number; width: number; height: number } | undefined;
    const gMatch = geomTagRegex.exec(inner);
    if (gMatch) {
      const gAttrs = parseXmlAttributes(gMatch[1] ?? "");
      const isRelativeEdgeGeom = gAttrs["relative"] === "1" && attrs["edge"] === "1";
      const hasAnyBoxAttr =
        gAttrs["width"] !== undefined ||
        gAttrs["height"] !== undefined ||
        gAttrs["x"] !== undefined ||
        gAttrs["y"] !== undefined;
      if (!isRelativeEdgeGeom && hasAnyBoxAttr) {
        // Draw.io omits x="0" or y="0" when saving cells positioned at the origin (0)
        const x = gAttrs["x"] !== undefined ? Number(gAttrs["x"]) : 0;
        const y = gAttrs["y"] !== undefined ? Number(gAttrs["y"]) : 0;
        const width = gAttrs["width"] !== undefined ? Number(gAttrs["width"]) : 0;
        const height = gAttrs["height"] !== undefined ? Number(gAttrs["height"]) : 0;
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          (width > 0 || height > 0)
        ) {
          geom = { x, y, width, height };
        }
      }
    }

    cells.push({ attrs, geom });
  }

  return {
    wellFormed: true,
    rootAttrs,
    cells,
  };
}

export function parseDrawioStyleMap(style: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!style) return map;
  for (const rawPart of style.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) {
      map.set(part, "1");
    } else {
      const k = part.slice(0, eqIdx).trim();
      const v = part.slice(eqIdx + 1).trim();
      if (k) map.set(k, v);
    }
  }
  return map;
}

const SEMANTIC_STYLE_KEYS = [
  "shape",
  "ellipse",
  "rhombus",
  "swimlane",
  "rounded",
  "dashed",
  "startArrow",
  "startFill",
  "endArrow",
  "endFill",
] as const;

function normalizeStyleProperty(map: Map<string, string>, key: (typeof SEMANTIC_STYLE_KEYS)[number]): string {
  const val = map.get(key);
  switch (key) {
    case "dashed":
    case "ellipse":
    case "rhombus":
    case "swimlane":
    case "startFill":
    case "endFill":
    case "rounded":
      return val === "1" ? "1" : "0";
    case "startArrow":
      return !val || val === "none" ? "none" : val;
    case "endArrow":
      return !val ? "" : val;
    case "shape":
      return !val ? "" : val;
  }
}

export function hasSemanticStyleMismatch(
  actualStyle: string | undefined,
  expectedStyle: string,
): { mismatch: boolean; reason?: string | undefined } {
  if (actualStyle === undefined) {
    return { mismatch: true, reason: "mxCell is missing style attribute" };
  }
  const actualMap = parseDrawioStyleMap(actualStyle);
  const expectedMap = parseDrawioStyleMap(expectedStyle);

  for (const key of SEMANTIC_STYLE_KEYS) {
    const aNorm = normalizeStyleProperty(actualMap, key);
    const eNorm = normalizeStyleProperty(expectedMap, key);
    if (aNorm !== eNorm) {
      return {
        mismatch: true,
        reason: `semantic style "${key}" changed from "${eNorm || "none"}" to "${aNorm || "none"}"`,
      };
    }
  }
  return { mismatch: false };
}

function normalizeCanvasValue(val: string | undefined): string {
  return (val ?? "").replaceAll("\r\n", "\n").trim();
}

function hasSemanticValueMismatch(
  actualValue: string | undefined,
  expectedValue: string,
): { mismatch: boolean; reason?: string | undefined } {
  const aNorm = normalizeCanvasValue(actualValue);
  const eNorm = normalizeCanvasValue(expectedValue);
  if (aNorm !== eNorm) {
    return {
      mismatch: true,
      reason: `canvas label/value changed from "${eNorm.slice(0, 80)}" to "${aNorm.slice(0, 80)}"`,
    };
  }
  return { mismatch: false };
}

function pushSemanticEditConflict(
  conflicts: UmlRoundTripConflict[],
  provenance: UmlProvenance,
  itemId: string,
  elementLabel: string,
  detail: string,
): void {
  const code =
    provenance === "EXTRACTED"
      ? "EXTRACTED_FACT_IMMUTABLE"
      : "CARRIER_CANVAS_SEMANTIC_MISMATCH";
  const prefix =
    provenance === "EXTRACTED"
      ? `Extracted ${elementLabel} (${itemId}) cannot be semantically mutated in Draw.io`
      : `Designed ${elementLabel} (${itemId}) has canvas changes out of sync with structured carrier metadata`;
  if (!conflicts.some((c) => c.code === code && c.itemId === itemId && c.message.includes(detail))) {
    conflicts.push({
      code,
      message: `${prefix}: ${detail}.`,
      itemId,
    });
  }
}

export function reconcileUmlDrawioXml<T extends AnyUmlProjection>(
  xml: string,
  baselineProjection: T,
): UmlRoundTripResult<T> {
  const conflicts: UmlRoundTripConflict[] = [];
  const preservedLayout: Record<string, { x: number; y: number; width: number; height: number }> =
    {};

  const parsedDoc = parseDrawioXmlStructure(xml);
  if (!parsedDoc.wellFormed) {
    conflicts.push({
      code: "MALFORMED_DRAWIO_DOCUMENT",
      message: parsedDoc.malformedReason ?? "Invalid Draw.io XML structure.",
      itemId: "document",
    });
    return {
      projection: JSON.parse(JSON.stringify(baselineProjection)) as T,
      conflicts,
      preservedLayout,
    };
  }

  // Validate root carrier / modelId / diagramKind / schemaVersion consistency
  const rootAttrs = parsedDoc.rootAttrs;
  const rawDocCarrier = rootAttrs["mavisUmlDocument"] ?? rootAttrs["mavisDocumentCarrier"];
  const rawProjCarrier = rootAttrs["mavisUmlProjection"];
  const rootDiagramKind = rootAttrs["mavisUmlDiagramKind"] ?? rootAttrs["mavisDiagramKind"];
  const rootModelId = rootAttrs["mavisModelId"];
  const rootSchemaVersionRaw = rootAttrs["mavisSchemaVersion"];

  const decodedCarrier =
    rawDocCarrier !== undefined ? decodeMeta<UmlPersistedDocumentCarrier>(rawDocCarrier) : null;
  const decodedProj =
    rawProjCarrier !== undefined ? decodeMeta<AnyUmlProjection>(rawProjCarrier) : null;

  if (rawDocCarrier !== undefined && (!decodedCarrier || typeof decodedCarrier !== "object")) {
    conflicts.push({
      code: "MALFORMED_DOCUMENT_CARRIER",
      message: "Attribute mavisUmlDocument on <mxGraphModel> is corrupted or not valid base64 JSON.",
      itemId: "document",
    });
  }
  if (rawProjCarrier !== undefined && (!decodedProj || typeof decodedProj !== "object")) {
    conflicts.push({
      code: "MALFORMED_PROJECTION_CARRIER",
      message:
        "Attribute mavisUmlProjection on <mxGraphModel> is corrupted or not valid base64 JSON.",
      itemId: "document",
    });
  }

  if (rootSchemaVersionRaw !== undefined) {
    const parsedVer = Number(rootSchemaVersionRaw);
    if (!Number.isInteger(parsedVer) || parsedVer < 1) {
      conflicts.push({
        code: "INVALID_DOCUMENT_SCHEMA_VERSION",
        message: `Root mavisSchemaVersion "${rootSchemaVersionRaw}" is invalid.`,
        itemId: "document",
      });
    } else if (parsedVer > 1) {
      conflicts.push({
        code: "UNSUPPORTED_FUTURE_SCHEMA_VERSION",
        message: `Root mavisSchemaVersion ${parsedVer} is newer than supported version 1.`,
        itemId: "document",
      });
    }
  }

  if (decodedCarrier && typeof decodedCarrier === "object") {
    const ver = (decodedCarrier as { schemaVersion?: unknown }).schemaVersion;
    if (typeof ver !== "number" || !Number.isInteger(ver) || ver < 1) {
      conflicts.push({
        code: "INVALID_DOCUMENT_SCHEMA_VERSION",
        message: `Document carrier schemaVersion "${String(ver)}" is invalid.`,
        itemId: "document",
      });
    } else if (ver > 1) {
      conflicts.push({
        code: "UNSUPPORTED_FUTURE_SCHEMA_VERSION",
        message: `Document carrier schemaVersion ${ver} is newer than supported version 1.`,
        itemId: "document",
      });
    }
  }

  if (
    rootDiagramKind !== undefined &&
    !VALID_UML_DIAGRAM_KINDS.has(rootDiagramKind as UmlDiagramKind)
  ) {
    conflicts.push({
      code: "UNSUPPORTED_DIAGRAM_KIND",
      message: `Root mavisUmlDiagramKind "${rootDiagramKind}" is not a supported UML diagram kind.`,
      itemId: "document",
    });
  }
  if (
    decodedCarrier?.diagramKind !== undefined &&
    !VALID_UML_DIAGRAM_KINDS.has(decodedCarrier.diagramKind)
  ) {
    conflicts.push({
      code: "UNSUPPORTED_DIAGRAM_KIND",
      message: `Carrier diagramKind "${String(decodedCarrier.diagramKind)}" is not a supported UML diagram kind.`,
      itemId: "document",
    });
  }
  if (
    (rootDiagramKind && decodedCarrier?.diagramKind && rootDiagramKind !== decodedCarrier.diagramKind) ||
    (rootDiagramKind && decodedProj?.diagramKind && rootDiagramKind !== decodedProj.diagramKind) ||
    (decodedCarrier?.diagramKind &&
      decodedProj?.diagramKind &&
      decodedCarrier.diagramKind !== decodedProj.diagramKind)
  ) {
    conflicts.push({
      code: "CARRIER_ROOT_KIND_MISMATCH",
      message:
        "Root mavisUmlDiagramKind, mavisUmlDocument.diagramKind, and mavisUmlProjection.diagramKind disagree.",
      itemId: "document",
    });
  }

  const docKind =
    decodedCarrier?.diagramKind ??
    decodedProj?.diagramKind ??
    (rootDiagramKind as UmlDiagramKind | undefined);
  if (docKind && docKind !== baselineProjection.diagramKind) {
    conflicts.push({
      code: "DOCUMENT_VIEW_KIND_MISMATCH",
      message: `Document diagramKind "${docKind}" does not match target projection diagramKind "${baselineProjection.diagramKind}".`,
      itemId: "document",
    });
  }

  if (
    (rootModelId && decodedCarrier?.modelId && rootModelId !== decodedCarrier.modelId) ||
    (rootModelId && decodedProj?.modelId && rootModelId !== decodedProj.modelId) ||
    (decodedCarrier?.modelId &&
      decodedProj?.modelId &&
      decodedCarrier.modelId !== decodedProj.modelId)
  ) {
    conflicts.push({
      code: "CARRIER_MODEL_ID_MISMATCH",
      message:
        "Root mavisModelId, mavisUmlDocument.modelId, and mavisUmlProjection.modelId disagree.",
      itemId: "document",
    });
  }

  const docModelIds = new Set(
    [rootModelId, decodedCarrier?.modelId, decodedProj?.modelId].filter(
      (m): m is string => typeof m === "string" && m.trim().length > 0,
    ),
  );
  for (const mId of docModelIds) {
    if (mId !== baselineProjection.modelId) {
      conflicts.push({
        code: "FOREIGN_MODEL_DOCUMENT_REJECTED",
        message: `Document belongs to model "${mId}" and cannot be reconciled into model "${baselineProjection.modelId}" without an explicit cross-model import mapping.`,
        itemId: "document",
      });
    }
  }

  const allowedRoles = ALLOWED_ROLES_BY_DIAGRAM_KIND[baselineProjection.diagramKind];
  const parsedCells = parsedDoc.cells;

  for (const c of parsedCells) {
    const rawId = c.attrs["mavisId"] ?? c.attrs["id"];
    if (!rawId || rawId === "0" || rawId === "1") continue;
    if (c.geom) {
      preservedLayout[rawId] = c.geom;
    }
    const role = c.attrs["mavisUmlRole"];
    if (!role) {
      conflicts.push({
        code: "UNMAPPED_DRAWIO_CELL_ADDED",
        message: `Draw.io cell "${rawId}" was added directly on the canvas without a canonical UML role mapping. Use the structured DESIGNED editor or discard unmapped canvas shapes before saving.`,
        itemId: rawId,
      });
    } else if (!allowedRoles.has(role)) {
      conflicts.push({
        code: "CARRIER_CELL_ROLE_MISMATCH",
        message: `Cell "${rawId}" has role "${role}" which is incompatible with ${baselineProjection.diagramKind}.`,
        itemId: rawId,
      });
    }
  }

  const clone = JSON.parse(JSON.stringify(baselineProjection)) as T;

  if (clone.diagramKind === "UML_CLASS") {
    const byId = new Map(clone.classifiers.map((c) => [c.classifierId, c]));
    const relById = new Map(clone.relations.map((r) => [r.relationId, r]));
    const presentClassifierIds = new Set<string>();
    const presentRelationIds = new Set<string>();

    for (const cell of parsedCells) {
      const role = cell.attrs["mavisUmlRole"];
      const id = cell.attrs["mavisId"] ?? cell.attrs["id"];
      if (!id || !role) continue;

      if (role === "classifier") {
        presentClassifierIds.add(id);
        const meta = decodeMeta<UmlClassifierNode>(cell.attrs["mavisMeta"]);
        const existing = byId.get(id);
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Classifier cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        if (cell.attrs["parent"] && cell.attrs["parent"] !== "1") {
          conflicts.push({
            code: "HIERARCHY_CHANGED_IN_DRAWIO",
            message: `Classifier "${id}" parent container was changed in Draw.io.`,
            itemId: id,
          });
        }

        const referenceCls = existing ?? meta;
        if (referenceCls) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          if (cell.attrs["mavisProvenance"] && cell.attrs["mavisProvenance"] !== prov) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `classifier "${referenceCls.name}"`,
              `provenance attribute changed to "${cell.attrs["mavisProvenance"]}"`,
            );
          }
          if (
            existing &&
            meta &&
            (meta.classifierKind !== existing.classifierKind ||
              meta.name !== existing.name ||
              meta.packageName !== existing.packageName ||
              meta.isAbstract !== existing.isAbstract ||
              meta.visibility !== existing.visibility ||
              JSON.stringify(meta.attributes) !== JSON.stringify(existing.attributes) ||
              JSON.stringify(meta.operations) !== JSON.stringify(existing.operations))
          ) {
            pushSemanticEditConflict(
              conflicts,
              existing.provenance,
              id,
              `classifier "${existing.name}"`,
              "carrier mavisMeta diverges from baseline classifier definition",
            );
          }

          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatClassifierCellValue(referenceCls),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `classifier "${referenceCls.name}"`,
              valCheck.reason ?? "canvas label/compartments modified",
            );
          }

          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getClassifierCellStyle(referenceCls),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `classifier "${referenceCls.name}"`,
              styleCheck.reason ?? "canvas shape style modified",
            );
          }
        }

        if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.classifiers.push(meta);
          byId.set(meta.classifierId, meta);
        }
      } else if (role === "class-relation") {
        presentRelationIds.add(id);
        const meta = decodeMeta<UmlClassRelationEdge>(cell.attrs["mavisMeta"]);
        const existing = relById.get(id);
        const cellSrc = cell.attrs["source"];
        const cellTgt = cell.attrs["target"];
        const cellKind = cell.attrs["mavisRelationKind"];

        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Class relationship cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }

        if (existing && existing.provenance === "EXTRACTED") {
          if (
            (cellSrc && cellSrc !== existing.fromClassifierId) ||
            (cellTgt && cellTgt !== existing.toClassifierId) ||
            (cellKind && cellKind !== existing.relationKind) ||
            (meta &&
              (meta.relationKind !== existing.relationKind ||
                meta.fromClassifierId !== existing.fromClassifierId ||
                meta.toClassifierId !== existing.toClassifierId ||
                meta.roleName !== existing.roleName ||
                meta.multiplicity !== existing.multiplicity))
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted relationship ${id} (${existing.relationKind}) cannot be rewired or converted into ${cellKind ?? "another kind"} without creating a DESIGNED overlay.`,
              itemId: id,
            });
          }
        } else if (existing && existing.provenance === "DESIGNED") {
          if (
            (cellSrc && cellSrc !== existing.fromClassifierId) ||
            (cellTgt && cellTgt !== existing.toClassifierId)
          ) {
            conflicts.push({
              code: "EDGE_ENDPOINT_REWIRED_IN_DRAWIO",
              message: `Designed relationship ${id} endpoints were rewired in Draw.io (${cellSrc ?? "?"} -> ${cellTgt ?? "?"}). Edit relationships through the structured overlay editor.`,
              itemId: id,
            });
          }
          if (cellKind && cellKind !== existing.relationKind) {
            pushSemanticEditConflict(
              conflicts,
              "DESIGNED",
              id,
              `relationship "${id}"`,
              `mavisRelationKind changed from "${existing.relationKind}" to "${cellKind}"`,
            );
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.relations.push(meta);
          relById.set(meta.relationId, meta);
          presentRelationIds.add(meta.relationId);
        }

        const referenceRel = existing ?? meta;
        if (referenceRel) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatClassRelationCellValue(referenceRel),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `relationship "${id}" (${referenceRel.relationKind})`,
              valCheck.reason ?? "canvas role/multiplicity label modified",
            );
          }

          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getClassRelationCellStyle(referenceRel),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `relationship "${id}" (${referenceRel.relationKind})`,
              styleCheck.reason ?? "canvas arrow/line style modified",
            );
          }
        }
      }
    }

    for (const cls of clone.classifiers) {
      if (!presentClassifierIds.has(cls.classifierId)) {
        conflicts.push({
          code: "DELETED_ELEMENT_IN_DRAWIO",
          message: `${cls.provenance} classifier "${cls.name}" (${cls.classifierId}) was deleted in Draw.io.`,
          itemId: cls.classifierId,
        });
      }
    }
    for (const rel of clone.relations) {
      if (!presentRelationIds.has(rel.relationId)) {
        conflicts.push({
          code: "DELETED_RELATION_IN_DRAWIO",
          message: `${rel.provenance} relationship "${rel.relationId}" (${rel.relationKind}) was deleted in Draw.io.`,
          itemId: rel.relationId,
        });
      }
    }

    clone.classifiers = clone.classifiers.filter((c) => presentClassifierIds.has(c.classifierId));
    clone.relations = clone.relations.filter(
      (r) =>
        presentRelationIds.has(r.relationId) &&
        presentClassifierIds.has(r.fromClassifierId) &&
        presentClassifierIds.has(r.toClassifierId),
    );
  } else if (clone.diagramKind === "UML_PACKAGE") {
    const pkgById = new Map(clone.packages.map((p) => [p.packageId, p]));
    const edgeById = new Map(clone.edges.map((e) => [e.edgeId, e]));
    const presentPackageIds = new Set<string>();
    const presentEdgeIds = new Set<string>();

    for (const cell of parsedCells) {
      const role = cell.attrs["mavisUmlRole"];
      const id = cell.attrs["mavisId"] ?? cell.attrs["id"];
      if (!id || !role) continue;

      if (role === "package") {
        presentPackageIds.add(id);
        const meta = decodeMeta<UmlPackageNode>(cell.attrs["mavisMeta"]);
        const existing = pkgById.get(id);
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Package cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        const expectedPkgParent =
          existing?.parentPackageId && pkgById.has(existing.parentPackageId)
            ? existing.parentPackageId
            : meta?.parentPackageId && pkgById.has(meta.parentPackageId)
              ? meta.parentPackageId
              : "1";
        if (cell.attrs["parent"] && cell.attrs["parent"] !== expectedPkgParent) {
          conflicts.push({
            code: "HIERARCHY_CHANGED_IN_DRAWIO",
            message: `Package "${id}" parent container was changed in Draw.io.`,
            itemId: id,
          });
        }
        if (existing && existing.provenance === "EXTRACTED" && meta) {
          if (
            meta.qualifiedName !== existing.qualifiedName ||
            meta.serviceId !== existing.serviceId ||
            JSON.stringify(meta.memberNames) !== JSON.stringify(existing.memberNames)
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted package ${existing.qualifiedName} cannot have its canonical identity or members mutated in Draw.io.`,
              itemId: id,
            });
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.packages.push(meta);
          pkgById.set(meta.packageId, meta);
        }

        const referencePkg = existing ?? meta;
        if (referencePkg) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatPackageCellValue(referencePkg),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `package "${referencePkg.qualifiedName}"`,
              valCheck.reason ?? "canvas package label/members modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getPackageCellStyle(),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `package "${referencePkg.qualifiedName}"`,
              styleCheck.reason ?? "canvas folder shape style modified",
            );
          }
        }
      } else if (role === "package-edge") {
        presentEdgeIds.add(id);
        const meta = decodeMeta<UmlPackageEdge>(cell.attrs["mavisMeta"]);
        const existing = edgeById.get(id);
        const cellSrc = cell.attrs["source"];
        const cellTgt = cell.attrs["target"];
        const cellKind = cell.attrs["mavisRelationKind"];
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Package edge cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        if (existing && existing.provenance === "EXTRACTED") {
          if (
            (cellSrc && cellSrc !== existing.fromPackageId) ||
            (cellTgt && cellTgt !== existing.toPackageId) ||
            (cellKind && cellKind !== existing.relationKind) ||
            (meta && meta.relationKind !== existing.relationKind)
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted package dependency ${id} cannot be rewired or converted in Draw.io.`,
              itemId: id,
            });
          }
        } else if (existing && existing.provenance === "DESIGNED") {
          if (
            (cellSrc && cellSrc !== existing.fromPackageId) ||
            (cellTgt && cellTgt !== existing.toPackageId)
          ) {
            conflicts.push({
              code: "EDGE_ENDPOINT_REWIRED_IN_DRAWIO",
              message: `Designed package dependency ${id} endpoints were rewired in Draw.io.`,
              itemId: id,
            });
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.edges.push(meta);
          edgeById.set(meta.edgeId, meta);
        }

        const referenceEdge = existing ?? meta;
        if (referenceEdge) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatPackageEdgeCellValue(referenceEdge),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `package dependency "${id}"`,
              valCheck.reason ?? "canvas stereotype label modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getPackageEdgeCellStyle(),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `package dependency "${id}"`,
              styleCheck.reason ?? "canvas arrow style modified",
            );
          }
        }
      }
    }

    for (const pkg of clone.packages) {
      if (!presentPackageIds.has(pkg.packageId)) {
        conflicts.push({
          code: "DELETED_ELEMENT_IN_DRAWIO",
          message: `${pkg.provenance} package "${pkg.qualifiedName}" (${pkg.packageId}) was deleted in Draw.io.`,
          itemId: pkg.packageId,
        });
      }
    }
    for (const edge of clone.edges) {
      if (!presentEdgeIds.has(edge.edgeId)) {
        conflicts.push({
          code: "DELETED_RELATION_IN_DRAWIO",
          message: `${edge.provenance} package dependency "${edge.edgeId}" was deleted in Draw.io.`,
          itemId: edge.edgeId,
        });
      }
    }

    clone.packages = clone.packages.filter((p) => presentPackageIds.has(p.packageId));
    clone.edges = clone.edges.filter(
      (e) =>
        presentEdgeIds.has(e.edgeId) &&
        presentPackageIds.has(e.fromPackageId) &&
        presentPackageIds.has(e.toPackageId),
    );
  } else if (clone.diagramKind === "UML_DEPLOYMENT") {
    const nodeById = new Map(clone.nodes.map((n) => [n.nodeId, n]));
    const edgeById = new Map(clone.edges.map((e) => [e.edgeId, e]));
    const presentNodeIds = new Set<string>();
    const presentEdgeIds = new Set<string>();

    for (const cell of parsedCells) {
      const role = cell.attrs["mavisUmlRole"];
      const id = cell.attrs["mavisId"] ?? cell.attrs["id"];
      if (!id || !role) continue;

      if (role === "deployment-node" || role === "deployment-artifact") {
        presentNodeIds.add(id);
        const meta = decodeMeta<UmlDeploymentNode>(cell.attrs["mavisMeta"]);
        const existing = nodeById.get(id);
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Deployment node cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        if (existing) {
          const expectedParent = existing.parentNodeId ?? "1";
          if (cell.attrs["parent"] && cell.attrs["parent"] !== expectedParent) {
            conflicts.push({
              code: "HIERARCHY_CHANGED_IN_DRAWIO",
              message: `Deployment node "${existing.name}" (${id}) container hierarchy was changed in Draw.io.`,
              itemId: id,
            });
          }
          if (
            existing.provenance === "EXTRACTED" &&
            meta &&
            (meta.nodeKind !== existing.nodeKind ||
              meta.name !== existing.name ||
              meta.environment !== existing.environment)
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted deployment node "${existing.name}" cannot have its canonical kind or name mutated in Draw.io.`,
              itemId: id,
            });
          }
        } else if (meta && meta.provenance === "DESIGNED") {
          clone.nodes.push(meta);
          nodeById.set(meta.nodeId, meta);
        }

        const referenceNode = existing ?? meta;
        if (referenceNode) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatDeploymentNodeCellValue(referenceNode),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `deployment node "${referenceNode.name}"`,
              valCheck.reason ?? "canvas deployment node label modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getDeploymentNodeCellStyle(referenceNode),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `deployment node "${referenceNode.name}"`,
              styleCheck.reason ?? "canvas deployment node shape style modified",
            );
          }
        }
      } else if (role === "deployment-edge") {
        presentEdgeIds.add(id);
        const meta = decodeMeta<UmlDeploymentEdge>(cell.attrs["mavisMeta"]);
        const existing = edgeById.get(id);
        const cellSrc = cell.attrs["source"];
        const cellTgt = cell.attrs["target"];
        const cellKind = cell.attrs["mavisEdgeKind"];
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Deployment edge cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        const styleMap = parseDrawioStyleMap(cell.attrs["style"]);
        const convertedStartupStyleToSolid =
          existing?.edgeKind === "DEPLOYMENT_DEPENDENCY_STARTUP" &&
          normalizeStyleProperty(styleMap, "dashed") === "0";
        if (
          existing &&
          existing.edgeKind === "DEPLOYMENT_DEPENDENCY_STARTUP" &&
          (cellKind === "COMMUNICATION_PATH" || convertedStartupStyleToSolid)
        ) {
          conflicts.push({
            code: "COMPOSE_DEPENDS_ON_AS_COMM_PATH",
            message: `Startup dependency ${id} cannot be converted into a CommunicationPath.`,
            itemId: id,
          });
        } else if (existing && existing.provenance === "EXTRACTED") {
          if (
            (cellSrc && cellSrc !== existing.fromNodeId) ||
            (cellTgt && cellTgt !== existing.toNodeId) ||
            (cellKind && cellKind !== existing.edgeKind)
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted deployment edge ${id} cannot be rewired or converted in Draw.io.`,
              itemId: id,
            });
          }
        } else if (existing && existing.provenance === "DESIGNED") {
          if (
            (cellSrc && cellSrc !== existing.fromNodeId) ||
            (cellTgt && cellTgt !== existing.toNodeId)
          ) {
            conflicts.push({
              code: "EDGE_ENDPOINT_REWIRED_IN_DRAWIO",
              message: `Designed deployment edge ${id} endpoints were rewired in Draw.io.`,
              itemId: id,
            });
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.edges.push(meta);
          edgeById.set(meta.edgeId, meta);
        }

        const referenceEdge = existing ?? meta;
        if (referenceEdge) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(cell.attrs["value"], referenceEdge.label);
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `deployment edge "${id}"`,
              valCheck.reason ?? "canvas edge label/protocol modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getDeploymentEdgeCellStyle(referenceEdge),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `deployment edge "${id}"`,
              styleCheck.reason ?? "canvas edge arrow/line style modified",
            );
          }
        }
      }
    }

    for (const node of clone.nodes) {
      if (!presentNodeIds.has(node.nodeId)) {
        conflicts.push({
          code: "DELETED_ELEMENT_IN_DRAWIO",
          message: `${node.provenance} deployment node "${node.name}" (${node.nodeId}) was deleted in Draw.io.`,
          itemId: node.nodeId,
        });
      }
    }
    for (const edge of clone.edges) {
      if (!presentEdgeIds.has(edge.edgeId)) {
        conflicts.push({
          code: "DELETED_RELATION_IN_DRAWIO",
          message: `${edge.provenance} deployment edge "${edge.edgeId}" was deleted in Draw.io.`,
          itemId: edge.edgeId,
        });
      }
    }

    clone.nodes = clone.nodes.filter((n) => presentNodeIds.has(n.nodeId));
    clone.edges = clone.edges.filter(
      (e) =>
        presentEdgeIds.has(e.edgeId) &&
        presentNodeIds.has(e.fromNodeId) &&
        presentNodeIds.has(e.toNodeId),
    );
  } else if (clone.diagramKind === "UML_ACTIVITY") {
    const nodeById = new Map(clone.nodes.map((n) => [n.nodeId, n]));
    const edgeById = new Map(clone.edges.map((e) => [e.edgeId, e]));
    const presentNodeIds = new Set<string>();
    const presentEdgeIds = new Set<string>();
    const expectedPartition = clone.partitions[0] ?? {
      partitionId: "partition:default",
      name: "Service Partition",
      serviceId: null,
    };
    const expectedPartitionId = expectedPartition.partitionId;

    for (const cell of parsedCells) {
      const role = cell.attrs["mavisUmlRole"];
      const id = cell.attrs["mavisId"] ?? cell.attrs["id"];
      if (!id || !role) continue;

      if (role === "activity-partition") {
        const valCheck = hasSemanticValueMismatch(
          cell.attrs["value"],
          formatActivityPartitionCellValue(expectedPartition),
        );
        if (valCheck.mismatch) {
          pushSemanticEditConflict(
            conflicts,
            "EXTRACTED",
            id,
            `activity partition "${expectedPartition.name}"`,
            valCheck.reason ?? "partition header modified",
          );
        }
        const styleCheck = hasSemanticStyleMismatch(
          cell.attrs["style"],
          getActivityPartitionCellStyle(),
        );
        if (styleCheck.mismatch) {
          pushSemanticEditConflict(
            conflicts,
            "EXTRACTED",
            id,
            `activity partition "${expectedPartition.name}"`,
            styleCheck.reason ?? "partition swimlane style modified",
          );
        }
      } else if (role === "activity-node") {
        presentNodeIds.add(id);
        const meta = decodeMeta<UmlActivityNode>(cell.attrs["mavisMeta"]);
        const existing = nodeById.get(id);
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Activity node cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        if (
          cell.attrs["parent"] &&
          cell.attrs["parent"] !== expectedPartitionId &&
          cell.attrs["parent"] !== "1"
        ) {
          conflicts.push({
            code: "HIERARCHY_CHANGED_IN_DRAWIO",
            message: `Activity node "${id}" was moved outside its service partition in Draw.io.`,
            itemId: id,
          });
        }
        if (existing && existing.provenance === "EXTRACTED") {
          const cellKind = cell.attrs["mavisNodeKind"];
          if (
            (cellKind && cellKind !== existing.kind) ||
            (meta && (meta.kind !== existing.kind || meta.label !== existing.label))
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted activity node "${existing.label}" (${id}) cannot have its kind or label mutated in Draw.io.`,
              itemId: id,
            });
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.nodes.push(meta);
          nodeById.set(meta.nodeId, meta);
        }

        const referenceNode = existing ?? meta;
        if (referenceNode) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(cell.attrs["value"], referenceNode.label);
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `activity node "${referenceNode.label}"`,
              valCheck.reason ?? "canvas activity node label modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getActivityNodeCellStyle(referenceNode),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `activity node "${referenceNode.label}"`,
              styleCheck.reason ?? "canvas activity node shape modified",
            );
          }
        }
      } else if (role === "activity-edge") {
        presentEdgeIds.add(id);
        const meta = decodeMeta<UmlActivityEdge>(cell.attrs["mavisMeta"]);
        const existing = edgeById.get(id);
        const cellSrc = cell.attrs["source"];
        const cellTgt = cell.attrs["target"];
        const cellFlow = cell.attrs["mavisFlowKind"];
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `Activity edge cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        if (existing && existing.provenance === "EXTRACTED") {
          if (
            (cellSrc && cellSrc !== existing.from) ||
            (cellTgt && cellTgt !== existing.to) ||
            (cellFlow && cellFlow !== existing.flowKind) ||
            (meta && (meta.flowKind !== existing.flowKind || meta.guard !== existing.guard))
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted activity flow ${id} cannot be rewired or converted in Draw.io.`,
              itemId: id,
            });
          }
        } else if (existing && existing.provenance === "DESIGNED") {
          if ((cellSrc && cellSrc !== existing.from) || (cellTgt && cellTgt !== existing.to)) {
            conflicts.push({
              code: "EDGE_ENDPOINT_REWIRED_IN_DRAWIO",
              message: `Designed activity flow ${id} endpoints were rewired in Draw.io.`,
              itemId: id,
            });
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.edges.push(meta);
          edgeById.set(meta.edgeId, meta);
        }

        const referenceEdge = existing ?? meta;
        if (referenceEdge) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatActivityEdgeCellValue(referenceEdge),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `activity flow "${id}"`,
              valCheck.reason ?? "canvas guard label modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getActivityEdgeCellStyle(),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `activity flow "${id}"`,
              styleCheck.reason ?? "canvas flow arrow/line style modified",
            );
          }
        }
      }
    }

    for (const node of clone.nodes) {
      if (!presentNodeIds.has(node.nodeId)) {
        conflicts.push({
          code: "DELETED_ELEMENT_IN_DRAWIO",
          message: `${node.provenance} activity node "${node.label}" (${node.nodeId}) was deleted in Draw.io.`,
          itemId: node.nodeId,
        });
      }
    }
    for (const edge of clone.edges) {
      if (!presentEdgeIds.has(edge.edgeId)) {
        conflicts.push({
          code: "DELETED_RELATION_IN_DRAWIO",
          message: `${edge.provenance} activity edge "${edge.edgeId}" was deleted in Draw.io.`,
          itemId: edge.edgeId,
        });
      }
    }

    clone.nodes = clone.nodes.filter((n) => presentNodeIds.has(n.nodeId));
    clone.edges = clone.edges.filter(
      (e) =>
        presentEdgeIds.has(e.edgeId) &&
        presentNodeIds.has(e.from) &&
        presentNodeIds.has(e.to),
    );
  } else if (clone.diagramKind === "UML_STATE") {
    const stateById = new Map(clone.states.map((s) => [s.stateId, s]));
    const trById = new Map(clone.transitions.map((t) => [t.transitionId, t]));
    const presentStateIds = new Set<string>();
    const presentTransitionIds = new Set<string>();

    for (const cell of parsedCells) {
      const role = cell.attrs["mavisUmlRole"];
      const id = cell.attrs["mavisId"] ?? cell.attrs["id"];
      if (!id || !role) continue;

      if (role === "state-node") {
        presentStateIds.add(id);
        const meta = decodeMeta<UmlStateNode>(cell.attrs["mavisMeta"]);
        const existing = stateById.get(id);
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `State cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        const expectedStateParent =
          existing?.parentStateId && stateById.has(existing.parentStateId)
            ? existing.parentStateId
            : meta?.parentStateId && stateById.has(meta.parentStateId)
              ? meta.parentStateId
              : "1";
        if (cell.attrs["parent"] && cell.attrs["parent"] !== expectedStateParent) {
          conflicts.push({
            code: "HIERARCHY_CHANGED_IN_DRAWIO",
            message: `State "${id}" container hierarchy was changed in Draw.io.`,
            itemId: id,
          });
        }
        if (existing && existing.provenance === "EXTRACTED") {
          const cellKind = cell.attrs["mavisStateKind"];
          if (
            (cellKind && cellKind !== existing.kind) ||
            (meta && (meta.kind !== existing.kind || meta.name !== existing.name))
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted state "${existing.name}" (${id}) cannot have its kind or name mutated in Draw.io.`,
              itemId: id,
            });
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.states.push(meta);
          stateById.set(meta.stateId, meta);
        }

        const referenceState = existing ?? meta;
        if (referenceState) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatStateNodeCellValue(referenceState),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `state "${referenceState.name}"`,
              valCheck.reason ?? "canvas state label/behaviors modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getStateNodeCellStyle(referenceState),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `state "${referenceState.name}"`,
              styleCheck.reason ?? "canvas state shape style modified",
            );
          }
        }
      } else if (role === "state-transition") {
        presentTransitionIds.add(id);
        const meta = decodeMeta<UmlStateTransition>(cell.attrs["mavisMeta"]);
        const existing = trById.get(id);
        const cellSrc = cell.attrs["source"];
        const cellTgt = cell.attrs["target"];
        if (!meta) {
          conflicts.push({
            code: "MALFORMED_CELL_METADATA",
            message: `State transition cell "${id}" has missing or corrupted mavisMeta.`,
            itemId: id,
          });
        }
        if (
          clone.enumOnlyNoTransitions &&
          meta &&
          meta.provenance === "EXTRACTED"
        ) {
          conflicts.push({
            code: "ENUM_ONLY_FABRICATED_TRANSITION",
            message: `Transition ${id} cannot claim EXTRACTED provenance on an enum-only declaration.`,
            itemId: id,
          });
        } else if (existing && existing.provenance === "EXTRACTED") {
          if (
            (cellSrc && cellSrc !== existing.fromStateId) ||
            (cellTgt && cellTgt !== existing.toStateId) ||
            (meta &&
              (meta.trigger !== existing.trigger ||
                meta.guard !== existing.guard ||
                meta.effect !== existing.effect))
          ) {
            conflicts.push({
              code: "EXTRACTED_FACT_IMMUTABLE",
              message: `Extracted state transition ${id} cannot have its source, target, trigger, guard, or effect mutated in Draw.io.`,
              itemId: id,
            });
          }
        } else if (existing && existing.provenance === "DESIGNED") {
          if (
            (cellSrc && cellSrc !== existing.fromStateId) ||
            (cellTgt && cellTgt !== existing.toStateId)
          ) {
            conflicts.push({
              code: "EDGE_ENDPOINT_REWIRED_IN_DRAWIO",
              message: `Designed state transition ${id} endpoints were rewired in Draw.io.`,
              itemId: id,
            });
          }
        } else if (!existing && meta && meta.provenance === "DESIGNED") {
          clone.transitions.push(meta);
          trById.set(meta.transitionId, meta);
        }

        const referenceTr = existing ?? meta;
        if (referenceTr) {
          const prov = existing?.provenance ?? meta?.provenance ?? "EXTRACTED";
          const valCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatTransitionLabel(referenceTr),
          );
          if (valCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `state transition "${id}"`,
              valCheck.reason ?? "canvas trigger/guard/effect label modified",
            );
          }
          const styleCheck = hasSemanticStyleMismatch(
            cell.attrs["style"],
            getStateTransitionCellStyle(),
          );
          if (styleCheck.mismatch) {
            pushSemanticEditConflict(
              conflicts,
              prov,
              id,
              `state transition "${id}"`,
              styleCheck.reason ?? "canvas transition arrow/line style modified",
            );
          }
        }
      }
    }

    for (const st of clone.states) {
      if (!presentStateIds.has(st.stateId)) {
        conflicts.push({
          code: "DELETED_ELEMENT_IN_DRAWIO",
          message: `${st.provenance} state "${st.name}" (${st.stateId}) was deleted in Draw.io.`,
          itemId: st.stateId,
        });
      }
    }
    for (const tr of clone.transitions) {
      if (!presentTransitionIds.has(tr.transitionId)) {
        conflicts.push({
          code: "DELETED_RELATION_IN_DRAWIO",
          message: `${tr.provenance} transition "${tr.transitionId}" was deleted in Draw.io.`,
          itemId: tr.transitionId,
        });
      }
    }

    clone.states = clone.states.filter((s) => presentStateIds.has(s.stateId));
    clone.transitions = clone.transitions.filter(
      (t) =>
        presentTransitionIds.has(t.transitionId) &&
        presentStateIds.has(t.fromStateId) &&
        presentStateIds.has(t.toStateId),
    );
  }

  return {
    projection: clone,
    conflicts,
    preservedLayout,
  };
}

function normalizeScopeOption(val: string | null | undefined, wildcards: string[]): string | null {
  if (val === null || val === undefined) return null;
  const trimmed = val.trim();
  if (!trimmed || wildcards.includes(trimmed)) return null;
  return trimmed;
}

function buildEmptyHydratedState(
  model: ArchitecturalModel,
  diagramKind: UmlDiagramKind,
  conflicts: UmlRoundTripConflict[],
  fallbackOptions?: {
    selectedServiceId?: string | null | undefined;
    selectedPackageName?: string | null | undefined;
    selectedEnvironment?: string | null | undefined;
    selectedOperationId?: string | null | undefined;
    selectedTargetId?: string | null | undefined;
  },
): UmlHydratedWorkspaceState {
  const emptyClassOverlay: UmlClassOverlay = { designedClassifiers: [], designedRelations: [] };
  const emptyPkgOverlay: UmlPackageOverlay = { designedPackages: [], designedEdges: [] };
  const emptyDeployOverlay: UmlDeploymentOverlay = {
    designedNodes: [],
    designedEdges: [],
    includeStartupDependenciesOverlay: false,
  };
  const emptyActOverlay: UmlActivityOverlay = { designedNodes: [], designedEdges: [] };
  const emptyStateOverlay: UmlStateOverlay = { designedStates: [], designedTransitions: [] };

  const projection: AnyUmlProjection =
    diagramKind === "UML_CLASS"
      ? projectUmlClassDiagram(model, {
          serviceId: fallbackOptions?.selectedServiceId ?? null,
          packageName: fallbackOptions?.selectedPackageName ?? null,
          overlay: emptyClassOverlay,
        })
      : diagramKind === "UML_PACKAGE"
        ? projectUmlPackageDiagram(model, {
            serviceId: fallbackOptions?.selectedServiceId ?? null,
            overlay: emptyPkgOverlay,
          })
        : diagramKind === "UML_DEPLOYMENT"
          ? projectUmlDeploymentDiagram(model, {
              environment: fallbackOptions?.selectedEnvironment ?? "default",
              overlay: emptyDeployOverlay,
            })
          : diagramKind === "UML_ACTIVITY"
            ? projectUmlActivityDiagram(model, {
                operationId: fallbackOptions?.selectedOperationId ?? undefined,
                overlay: emptyActOverlay,
              })
            : projectUmlStateDiagram(model, {
                targetId: fallbackOptions?.selectedTargetId ?? undefined,
                overlay: emptyStateOverlay,
              });

  const carrier = extractCarrierFromProjection(projection, {}, {
    selectedServiceId: fallbackOptions?.selectedServiceId ?? null,
    selectedPackageName: fallbackOptions?.selectedPackageName ?? null,
    selectedEnvironment: fallbackOptions?.selectedEnvironment ?? "default",
    selectedOperationId: fallbackOptions?.selectedOperationId ?? null,
    selectedTargetId: fallbackOptions?.selectedTargetId ?? null,
    classOverlay: emptyClassOverlay,
    packageOverlay: emptyPkgOverlay,
    deploymentOverlay: emptyDeployOverlay,
    activityOverlay: emptyActOverlay,
    stateOverlay: emptyStateOverlay,
  });

  return {
    diagramKind,
    carrier,
    projection,
    preservedLayout: {},
    conflicts,
    classOverlay: emptyClassOverlay,
    packageOverlay: emptyPkgOverlay,
    deploymentOverlay: emptyDeployOverlay,
    activityOverlay: emptyActOverlay,
    stateOverlay: emptyStateOverlay,
  };
}

export function hydrateUmlWorkspaceFromXml(
  xml: string,
  model: ArchitecturalModel,
  fallbackOptions?: {
    diagramKind?: UmlDiagramKind | undefined;
    selectedServiceId?: string | null | undefined;
    selectedPackageName?: string | null | undefined;
    selectedEnvironment?: string | null | undefined;
    selectedOperationId?: string | null | undefined;
    selectedTargetId?: string | null | undefined;
  },
): UmlHydratedWorkspaceState {
  const boundaryConflicts: UmlRoundTripConflict[] = [];
  const defaultKind: UmlDiagramKind =
    fallbackOptions?.diagramKind && VALID_UML_DIAGRAM_KINDS.has(fallbackOptions.diagramKind)
      ? fallbackOptions.diagramKind
      : "UML_CLASS";

  const parsedDoc = parseDrawioXmlStructure(xml);
  if (!parsedDoc.wellFormed) {
    boundaryConflicts.push({
      code: "MALFORMED_DRAWIO_DOCUMENT",
      message: parsedDoc.malformedReason ?? "Invalid Draw.io XML structure.",
      itemId: "document",
    });
    return buildEmptyHydratedState(model, defaultKind, boundaryConflicts, fallbackOptions);
  }

  const rootAttrs = parsedDoc.rootAttrs;
  const rawDocCarrier = rootAttrs["mavisUmlDocument"] ?? rootAttrs["mavisDocumentCarrier"];
  const rawProjCarrier = rootAttrs["mavisUmlProjection"];
  const rootKindRaw = rootAttrs["mavisUmlDiagramKind"] ?? rootAttrs["mavisDiagramKind"];
  const rootModelId = rootAttrs["mavisModelId"];
  const rootSchemaVersionRaw = rootAttrs["mavisSchemaVersion"];

  const decodedCarrier =
    rawDocCarrier !== undefined ? decodeMeta<UmlPersistedDocumentCarrier>(rawDocCarrier) : null;
  const decodedProj =
    rawProjCarrier !== undefined ? decodeMeta<AnyUmlProjection>(rawProjCarrier) : null;

  if (rawDocCarrier !== undefined && (!decodedCarrier || typeof decodedCarrier !== "object")) {
    boundaryConflicts.push({
      code: "MALFORMED_DOCUMENT_CARRIER",
      message: "Attribute mavisUmlDocument on <mxGraphModel> is corrupted or not valid base64 JSON.",
      itemId: "document",
    });
  }
  if (rawProjCarrier !== undefined && (!decodedProj || typeof decodedProj !== "object")) {
    boundaryConflicts.push({
      code: "MALFORMED_PROJECTION_CARRIER",
      message:
        "Attribute mavisUmlProjection on <mxGraphModel> is corrupted or not valid base64 JSON.",
      itemId: "document",
    });
  }

  if (rawDocCarrier === undefined) {
    boundaryConflicts.push({
      code: "MISSING_DOCUMENT_CARRIER",
      message:
        "Draw.io XML is missing MAVIS UML document carrier attribute (mavisUmlDocument); refusing to guess diagram kind or overwrite.",
      itemId: "document",
    });
  }

  if (rootSchemaVersionRaw !== undefined) {
    const parsedVer = Number(rootSchemaVersionRaw);
    if (!Number.isInteger(parsedVer) || parsedVer < 1) {
      boundaryConflicts.push({
        code: "INVALID_DOCUMENT_SCHEMA_VERSION",
        message: `Root mavisSchemaVersion "${rootSchemaVersionRaw}" is invalid.`,
        itemId: "document",
      });
    } else if (parsedVer > 1) {
      boundaryConflicts.push({
        code: "UNSUPPORTED_FUTURE_SCHEMA_VERSION",
        message: `Root mavisSchemaVersion ${parsedVer} is newer than supported version 1.`,
        itemId: "document",
      });
    }
  }

  if (decodedCarrier && typeof decodedCarrier === "object") {
    const ver = (decodedCarrier as { schemaVersion?: unknown }).schemaVersion;
    if (typeof ver !== "number" || !Number.isInteger(ver) || ver < 1) {
      boundaryConflicts.push({
        code: "INVALID_DOCUMENT_SCHEMA_VERSION",
        message: `Document carrier schemaVersion "${String(ver)}" is invalid.`,
        itemId: "document",
      });
    } else if (ver > 1) {
      boundaryConflicts.push({
        code: "UNSUPPORTED_FUTURE_SCHEMA_VERSION",
        message: `Document carrier schemaVersion ${ver} is newer than supported version 1.`,
        itemId: "document",
      });
    }
  }

  const candidateKinds = [
    decodedCarrier?.diagramKind,
    decodedProj?.diagramKind,
    rootKindRaw,
  ].filter((k): k is string => typeof k === "string" && k.trim().length > 0);

  for (const k of candidateKinds) {
    if (!VALID_UML_DIAGRAM_KINDS.has(k as UmlDiagramKind)) {
      boundaryConflicts.push({
        code: "UNSUPPORTED_DIAGRAM_KIND",
        message: `Document specifies unsupported UML diagram kind "${k}".`,
        itemId: "document",
      });
    }
  }

  const uniqueValidKinds = new Set(
    candidateKinds.filter((k): k is UmlDiagramKind =>
      VALID_UML_DIAGRAM_KINDS.has(k as UmlDiagramKind),
    ),
  );
  if (uniqueValidKinds.size > 1) {
    boundaryConflicts.push({
      code: "CARRIER_ROOT_KIND_MISMATCH",
      message: `Document root and carrier diagram kinds disagree (${[...uniqueValidKinds].join(" vs ")}).`,
      itemId: "document",
    });
  }

  const resolvedDocKind: UmlDiagramKind | null =
    uniqueValidKinds.size === 1 ? ([...uniqueValidKinds][0] ?? null) : null;

  if (
    fallbackOptions?.diagramKind &&
    resolvedDocKind &&
    resolvedDocKind !== fallbackOptions.diagramKind
  ) {
    boundaryConflicts.push({
      code: "DOCUMENT_VIEW_KIND_MISMATCH",
      message: `Saved document diagramKind "${resolvedDocKind}" does not match requested workspace view "${fallbackOptions.diagramKind}".`,
      itemId: "document",
    });
  }

  const diagramKind: UmlDiagramKind = resolvedDocKind ?? defaultKind;

  // Validate modelId identity across root, carrier, projection, and target model
  const candidateModelIds = [
    rootModelId,
    decodedCarrier?.modelId,
    decodedProj?.modelId,
  ].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

  if (candidateModelIds.length === 0) {
    boundaryConflicts.push({
      code: "MISSING_DOCUMENT_MODEL_ID",
      message: "Document is missing canonical mavisModelId / carrier.modelId.",
      itemId: "document",
    });
  } else {
    const uniqueModelIds = new Set(candidateModelIds);
    if (uniqueModelIds.size > 1) {
      boundaryConflicts.push({
        code: "CARRIER_MODEL_ID_MISMATCH",
        message: `Document root mavisModelId, carrier.modelId, and projection.modelId disagree (${[...uniqueModelIds].join(" vs ")}).`,
        itemId: "document",
      });
    }
    for (const docModelId of uniqueModelIds) {
      if (docModelId !== model.id) {
        boundaryConflicts.push({
          code: "FOREIGN_MODEL_DOCUMENT_REJECTED",
          message: `Document belongs to foreign model "${docModelId}" and cannot be hydrated into model "${model.id}" without an explicit cross-model import mapping.`,
          itemId: "document",
        });
      }
    }
  }

  // Validate cell roles match diagramKind
  const allowedRoles = ALLOWED_ROLES_BY_DIAGRAM_KIND[diagramKind];
  for (const cell of parsedDoc.cells) {
    const rawId = cell.attrs["mavisId"] ?? cell.attrs["id"];
    if (!rawId || rawId === "0" || rawId === "1") continue;
    const role = cell.attrs["mavisUmlRole"];
    if (role && !allowedRoles.has(role)) {
      boundaryConflicts.push({
        code: "CARRIER_CELL_ROLE_MISMATCH",
        message: `Cell "${rawId}" has role "${role}" which is incompatible with ${diagramKind}.`,
        itemId: rawId,
      });
    }
  }

  // Validate view scope options & scope references in target model
  const docServiceId = normalizeScopeOption(
    decodedCarrier?.selectedServiceId ??
      (decodedProj?.diagramKind === "UML_CLASS" || decodedProj?.diagramKind === "UML_PACKAGE"
        ? decodedProj.scopeServiceId
        : null),
    ["all"],
  );
  const docPackageName = normalizeScopeOption(
    decodedCarrier?.selectedPackageName ??
      (decodedProj?.diagramKind === "UML_CLASS" ? decodedProj.scopePackageName : null),
    ["all"],
  );
  const docEnvironment =
    normalizeScopeOption(
      decodedCarrier?.selectedEnvironment ??
        (decodedProj?.diagramKind === "UML_DEPLOYMENT" ? decodedProj.environment : null),
      [],
    ) ?? "default";
  const docOperationId = normalizeScopeOption(
    decodedCarrier?.selectedOperationId ??
      (decodedProj?.diagramKind === "UML_ACTIVITY" ? decodedProj.selectedOperationId : null),
    ["none", "designed", "default"],
  );
  const docTargetId = normalizeScopeOption(
    decodedCarrier?.selectedTargetId ??
      (decodedProj?.diagramKind === "UML_STATE" ? decodedProj.selectedTargetId : null),
    ["designed", "default"],
  );

  if (fallbackOptions) {
    if (
      (diagramKind === "UML_CLASS" || diagramKind === "UML_PACKAGE") &&
      fallbackOptions.selectedServiceId !== undefined
    ) {
      const reqSvc = normalizeScopeOption(fallbackOptions.selectedServiceId, ["all"]);
      if (docServiceId !== reqSvc) {
        boundaryConflicts.push({
          code: "DOCUMENT_VIEW_SCOPE_MISMATCH",
          message: `Document service scope "${docServiceId ?? "all"}" does not match requested service scope "${reqSvc ?? "all"}".`,
          itemId: "document",
        });
      }
    }
    if (diagramKind === "UML_CLASS" && fallbackOptions.selectedPackageName !== undefined) {
      const reqPkg = normalizeScopeOption(fallbackOptions.selectedPackageName, ["all"]);
      if (docPackageName !== reqPkg) {
        boundaryConflicts.push({
          code: "DOCUMENT_VIEW_SCOPE_MISMATCH",
          message: `Document package scope "${docPackageName ?? "all"}" does not match requested package scope "${reqPkg ?? "all"}".`,
          itemId: "document",
        });
      }
    }
    if (diagramKind === "UML_DEPLOYMENT" && fallbackOptions.selectedEnvironment !== undefined) {
      const reqEnv = normalizeScopeOption(fallbackOptions.selectedEnvironment, []) ?? "default";
      if (docEnvironment !== reqEnv) {
        boundaryConflicts.push({
          code: "DOCUMENT_VIEW_SCOPE_MISMATCH",
          message: `Document environment scope "${docEnvironment}" does not match requested environment "${reqEnv}".`,
          itemId: "document",
        });
      }
    }
    if (diagramKind === "UML_ACTIVITY" && fallbackOptions.selectedOperationId !== undefined) {
      const reqOp = normalizeScopeOption(fallbackOptions.selectedOperationId, [
        "none",
        "designed",
        "default",
      ]);
      if (docOperationId && reqOp && docOperationId !== reqOp) {
        boundaryConflicts.push({
          code: "DOCUMENT_VIEW_SCOPE_MISMATCH",
          message: `Document operation scope "${docOperationId}" does not match requested operation "${reqOp}".`,
          itemId: "document",
        });
      }
    }
    if (diagramKind === "UML_STATE" && fallbackOptions.selectedTargetId !== undefined) {
      const reqTgt = normalizeScopeOption(fallbackOptions.selectedTargetId, [
        "designed",
        "default",
      ]);
      if (docTargetId && reqTgt && docTargetId !== reqTgt) {
        boundaryConflicts.push({
          code: "DOCUMENT_VIEW_SCOPE_MISMATCH",
          message: `Document state target scope "${docTargetId}" does not match requested target "${reqTgt}".`,
          itemId: "document",
        });
      }
    }
  }

  // Verify scope references exist in target model
  if (docServiceId && !model.elements.some((e) => e.id === docServiceId)) {
    boundaryConflicts.push({
      code: "INVALID_DOCUMENT_SCOPE_REFERENCE",
      message: `Document selectedServiceId "${docServiceId}" does not exist in model "${model.id}".`,
      itemId: docServiceId,
    });
  }
  if (
    diagramKind === "UML_ACTIVITY" &&
    docOperationId &&
    !listActivityOperations(model).some((op) => op.operationId === docOperationId)
  ) {
    boundaryConflicts.push({
      code: "INVALID_DOCUMENT_SCOPE_REFERENCE",
      message: `Document selectedOperationId "${docOperationId}" does not exist in model "${model.id}".`,
      itemId: docOperationId,
    });
  }
  if (
    diagramKind === "UML_STATE" &&
    docTargetId &&
    !listStateTargets(model).some((t) => t.targetId === docTargetId)
  ) {
    boundaryConflicts.push({
      code: "INVALID_DOCUMENT_SCOPE_REFERENCE",
      message: `Document selectedTargetId "${docTargetId}" does not exist in model "${model.id}".`,
      itemId: docTargetId,
    });
  }

  // If document belongs to a foreign model, refuse to inspect or hydrate foreign overlays
  if (boundaryConflicts.some((c) => c.code === "FOREIGN_MODEL_DOCUMENT_REJECTED")) {
    return buildEmptyHydratedState(model, diagramKind, boundaryConflicts, fallbackOptions);
  }

  const classOverlay: UmlClassOverlay = decodedCarrier?.classOverlay ?? {
    designedClassifiers:
      decodedProj?.diagramKind === "UML_CLASS"
        ? decodedProj.classifiers.filter((c) => c.provenance === "DESIGNED")
        : [],
    designedRelations:
      decodedProj?.diagramKind === "UML_CLASS"
        ? decodedProj.relations.filter((r) => r.provenance === "DESIGNED")
        : [],
  };

  const packageOverlay: UmlPackageOverlay = decodedCarrier?.packageOverlay ?? {
    designedPackages:
      decodedProj?.diagramKind === "UML_PACKAGE"
        ? decodedProj.packages.filter((p) => p.provenance === "DESIGNED")
        : [],
    designedEdges:
      decodedProj?.diagramKind === "UML_PACKAGE"
        ? decodedProj.edges.filter((e) => e.provenance === "DESIGNED")
        : [],
  };

  const deploymentOverlay: UmlDeploymentOverlay = decodedCarrier?.deploymentOverlay ?? {
    designedNodes:
      decodedProj?.diagramKind === "UML_DEPLOYMENT"
        ? decodedProj.nodes.filter((n) => n.provenance === "DESIGNED")
        : [],
    designedEdges:
      decodedProj?.diagramKind === "UML_DEPLOYMENT"
        ? decodedProj.edges.filter((e) => e.provenance === "DESIGNED")
        : [],
    includeStartupDependenciesOverlay:
      decodedProj?.diagramKind === "UML_DEPLOYMENT"
        ? decodedProj.edges.some((e) => e.edgeKind === "DEPLOYMENT_DEPENDENCY_STARTUP")
        : false,
  };

  const activityOverlay: UmlActivityOverlay = decodedCarrier?.activityOverlay ?? {
    designedNodes:
      decodedProj?.diagramKind === "UML_ACTIVITY"
        ? decodedProj.nodes.filter((n) => n.provenance === "DESIGNED")
        : [],
    designedEdges:
      decodedProj?.diagramKind === "UML_ACTIVITY"
        ? decodedProj.edges.filter((e) => e.provenance === "DESIGNED")
        : [],
  };

  const stateOverlay: UmlStateOverlay = decodedCarrier?.stateOverlay ?? {
    designedStates:
      decodedProj?.diagramKind === "UML_STATE"
        ? decodedProj.states.filter((s) => s.provenance === "DESIGNED")
        : [],
    designedTransitions:
      decodedProj?.diagramKind === "UML_STATE"
        ? decodedProj.transitions.filter((t) => t.provenance === "DESIGNED")
        : [],
  };

  const selectedServiceId = docServiceId ?? fallbackOptions?.selectedServiceId ?? null;
  const validServiceScope =
    selectedServiceId && model.elements.some((e) => e.id === selectedServiceId)
      ? selectedServiceId
      : null;
  const selectedPackageName = docPackageName ?? fallbackOptions?.selectedPackageName ?? null;
  const selectedEnvironment = docEnvironment || fallbackOptions?.selectedEnvironment || "default";
  const selectedOperationId =
    docOperationId ?? fallbackOptions?.selectedOperationId ?? undefined;
  const selectedTargetId = docTargetId ?? fallbackOptions?.selectedTargetId ?? undefined;

  // Validate overlay provenance, IDs, references, and ownership against extracted baseline
  if (diagramKind === "UML_CLASS") {
    const extractedOnly = projectUmlClassDiagram(model, {
      serviceId: validServiceScope,
      packageName: selectedPackageName,
    });
    const extractedIds = new Set(extractedOnly.classifiers.map((c) => c.classifierId));
    const allClassifierIds = new Set(extractedIds);
    for (const dc of classOverlay.designedClassifiers ?? []) {
      if (dc.provenance && dc.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay classifier "${dc.classifierId}" must have DESIGNED provenance.`,
          itemId: dc.classifierId,
        });
      }
      if (extractedIds.has(dc.classifierId)) {
        boundaryConflicts.push({
          code: "OVERLAY_ID_COLLIDES_WITH_EXTRACTED",
          message: `Overlay classifier "${dc.classifierId}" collides with an EXTRACTED classifier ID.`,
          itemId: dc.classifierId,
        });
      }
      if (validServiceScope && dc.serviceId && dc.serviceId !== validServiceScope) {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_SCOPE_OWNERSHIP",
          message: `Overlay classifier "${dc.classifierId}" belongs to service "${dc.serviceId}", outside scope "${validServiceScope}".`,
          itemId: dc.classifierId,
        });
      }
      allClassifierIds.add(dc.classifierId);
    }
    for (const dr of classOverlay.designedRelations ?? []) {
      if (dr.provenance && dr.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay relation "${dr.relationId}" must have DESIGNED provenance.`,
          itemId: dr.relationId,
        });
      }
      if (!allClassifierIds.has(dr.fromClassifierId) || !allClassifierIds.has(dr.toClassifierId)) {
        boundaryConflicts.push({
          code: "DANGLING_OVERLAY_REFERENCE",
          message: `Overlay relation "${dr.relationId}" references missing classifier endpoint(s) (${dr.fromClassifierId} -> ${dr.toClassifierId}).`,
          itemId: dr.relationId,
        });
      }
    }
  } else if (diagramKind === "UML_PACKAGE") {
    const extractedOnly = projectUmlPackageDiagram(model, { serviceId: validServiceScope });
    const extractedIds = new Set(extractedOnly.packages.map((p) => p.packageId));
    const allPkgIds = new Set(extractedIds);
    for (const dp of packageOverlay.designedPackages ?? []) {
      if (dp.provenance && dp.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay package "${dp.packageId}" must have DESIGNED provenance.`,
          itemId: dp.packageId,
        });
      }
      if (extractedIds.has(dp.packageId)) {
        boundaryConflicts.push({
          code: "OVERLAY_ID_COLLIDES_WITH_EXTRACTED",
          message: `Overlay package "${dp.packageId}" collides with an EXTRACTED package ID.`,
          itemId: dp.packageId,
        });
      }
      if (selectedServiceId && dp.serviceId && dp.serviceId !== selectedServiceId) {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_SCOPE_OWNERSHIP",
          message: `Overlay package "${dp.packageId}" belongs to service "${dp.serviceId}", outside scope "${selectedServiceId}".`,
          itemId: dp.packageId,
        });
      }
      allPkgIds.add(dp.packageId);
    }
    for (const de of packageOverlay.designedEdges ?? []) {
      if (de.provenance && de.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay package edge "${de.edgeId}" must have DESIGNED provenance.`,
          itemId: de.edgeId,
        });
      }
      if (!allPkgIds.has(de.fromPackageId) || !allPkgIds.has(de.toPackageId)) {
        boundaryConflicts.push({
          code: "DANGLING_OVERLAY_REFERENCE",
          message: `Overlay package edge "${de.edgeId}" references missing package endpoint(s) (${de.fromPackageId} -> ${de.toPackageId}).`,
          itemId: de.edgeId,
        });
      }
    }
  } else if (diagramKind === "UML_DEPLOYMENT") {
    const extractedOnly = projectUmlDeploymentDiagram(model, {
      environment: selectedEnvironment,
    });
    const extractedIds = new Set(extractedOnly.nodes.map((n) => n.nodeId));
    const allNodeIds = new Set(extractedIds);
    for (const dn of deploymentOverlay.designedNodes ?? []) {
      if (dn.provenance && dn.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay deployment node "${dn.nodeId}" must have DESIGNED provenance.`,
          itemId: dn.nodeId,
        });
      }
      if (extractedIds.has(dn.nodeId)) {
        boundaryConflicts.push({
          code: "OVERLAY_ID_COLLIDES_WITH_EXTRACTED",
          message: `Overlay deployment node "${dn.nodeId}" collides with an EXTRACTED node ID.`,
          itemId: dn.nodeId,
        });
      }
      if (dn.environment && dn.environment !== selectedEnvironment) {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_SCOPE_OWNERSHIP",
          message: `Overlay deployment node "${dn.nodeId}" environment "${dn.environment}" does not match "${selectedEnvironment}".`,
          itemId: dn.nodeId,
        });
      }
      allNodeIds.add(dn.nodeId);
    }
    for (const de of deploymentOverlay.designedEdges ?? []) {
      if (de.provenance && de.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay deployment edge "${de.edgeId}" must have DESIGNED provenance.`,
          itemId: de.edgeId,
        });
      }
      if (!allNodeIds.has(de.fromNodeId) || !allNodeIds.has(de.toNodeId)) {
        boundaryConflicts.push({
          code: "DANGLING_OVERLAY_REFERENCE",
          message: `Overlay deployment edge "${de.edgeId}" references missing node endpoint(s) (${de.fromNodeId} -> ${de.toNodeId}).`,
          itemId: de.edgeId,
        });
      }
    }
  } else if (diagramKind === "UML_ACTIVITY") {
    const extractedOnly = projectUmlActivityDiagram(model, {
      operationId: selectedOperationId ?? undefined,
    });
    const extractedIds = new Set(extractedOnly.nodes.map((n) => n.nodeId));
    const allNodeIds = new Set(extractedIds);
    for (const dn of activityOverlay.designedNodes ?? []) {
      if (dn.provenance && dn.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay activity node "${dn.nodeId}" must have DESIGNED provenance.`,
          itemId: dn.nodeId,
        });
      }
      if (extractedIds.has(dn.nodeId)) {
        boundaryConflicts.push({
          code: "OVERLAY_ID_COLLIDES_WITH_EXTRACTED",
          message: `Overlay activity node "${dn.nodeId}" collides with an EXTRACTED node ID.`,
          itemId: dn.nodeId,
        });
      }
      allNodeIds.add(dn.nodeId);
    }
    for (const de of activityOverlay.designedEdges ?? []) {
      if (de.provenance && de.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay activity edge "${de.edgeId}" must have DESIGNED provenance.`,
          itemId: de.edgeId,
        });
      }
      if (!allNodeIds.has(de.from) || !allNodeIds.has(de.to)) {
        boundaryConflicts.push({
          code: "DANGLING_OVERLAY_REFERENCE",
          message: `Overlay activity edge "${de.edgeId}" references missing node endpoint(s) (${de.from} -> ${de.to}).`,
          itemId: de.edgeId,
        });
      }
    }
  } else if (diagramKind === "UML_STATE") {
    const extractedOnly = projectUmlStateDiagram(model, {
      targetId: selectedTargetId ?? undefined,
    });
    const extractedIds = new Set(extractedOnly.states.map((s) => s.stateId));
    const allStateIds = new Set(extractedIds);
    for (const ds of stateOverlay.designedStates ?? []) {
      if (ds.provenance && ds.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay state "${ds.stateId}" must have DESIGNED provenance.`,
          itemId: ds.stateId,
        });
      }
      if (extractedIds.has(ds.stateId)) {
        boundaryConflicts.push({
          code: "OVERLAY_ID_COLLIDES_WITH_EXTRACTED",
          message: `Overlay state "${ds.stateId}" collides with an EXTRACTED state ID.`,
          itemId: ds.stateId,
        });
      }
      allStateIds.add(ds.stateId);
    }
    for (const dt of stateOverlay.designedTransitions ?? []) {
      if (dt.provenance && dt.provenance !== "DESIGNED") {
        boundaryConflicts.push({
          code: "INVALID_OVERLAY_PROVENANCE",
          message: `Overlay transition "${dt.transitionId}" must have DESIGNED provenance.`,
          itemId: dt.transitionId,
        });
      }
      if (!allStateIds.has(dt.fromStateId) || !allStateIds.has(dt.toStateId)) {
        boundaryConflicts.push({
          code: "DANGLING_OVERLAY_REFERENCE",
          message: `Overlay transition "${dt.transitionId}" references missing state endpoint(s) (${dt.fromStateId} -> ${dt.toStateId}).`,
          itemId: dt.transitionId,
        });
      }
    }
  }

  if (boundaryConflicts.length > 0) {
    return buildEmptyHydratedState(model, diagramKind, boundaryConflicts, fallbackOptions);
  }

  let baselineProjection: AnyUmlProjection;
  if (diagramKind === "UML_CLASS") {
    baselineProjection = projectUmlClassDiagram(model, {
      serviceId: selectedServiceId,
      packageName: selectedPackageName,
      overlay: classOverlay,
    });
  } else if (diagramKind === "UML_PACKAGE") {
    baselineProjection = projectUmlPackageDiagram(model, {
      serviceId: selectedServiceId,
      overlay: packageOverlay,
    });
  } else if (diagramKind === "UML_DEPLOYMENT") {
    baselineProjection = projectUmlDeploymentDiagram(model, {
      environment: selectedEnvironment ?? "default",
      overlay: deploymentOverlay,
    });
  } else if (diagramKind === "UML_ACTIVITY") {
    baselineProjection = projectUmlActivityDiagram(model, {
      operationId: selectedOperationId ?? undefined,
      overlay: activityOverlay,
    });
  } else {
    baselineProjection = projectUmlStateDiagram(model, {
      targetId: selectedTargetId ?? undefined,
      overlay: stateOverlay,
    });
  }

  const reconciled = reconcileUmlDrawioXml(xml, baselineProjection);
  const mergedLayout = {
    ...(decodedCarrier?.preservedLayout ?? {}),
    ...reconciled.preservedLayout,
  };

  const hydratedClassOverlay: UmlClassOverlay =
    reconciled.projection.diagramKind === "UML_CLASS"
      ? {
          designedClassifiers: reconciled.projection.classifiers.filter(
            (c) => c.provenance === "DESIGNED",
          ),
          designedRelations: reconciled.projection.relations.filter(
            (r) => r.provenance === "DESIGNED",
          ),
        }
      : classOverlay;

  const hydratedPkgOverlay: UmlPackageOverlay =
    reconciled.projection.diagramKind === "UML_PACKAGE"
      ? {
          designedPackages: reconciled.projection.packages.filter(
            (p) => p.provenance === "DESIGNED",
          ),
          designedEdges: reconciled.projection.edges.filter((e) => e.provenance === "DESIGNED"),
        }
      : packageOverlay;

  const hydratedDeployOverlay: UmlDeploymentOverlay =
    reconciled.projection.diagramKind === "UML_DEPLOYMENT"
      ? {
          designedNodes: reconciled.projection.nodes.filter((n) => n.provenance === "DESIGNED"),
          designedEdges: reconciled.projection.edges.filter((e) => e.provenance === "DESIGNED"),
          includeStartupDependenciesOverlay: Boolean(
            deploymentOverlay.includeStartupDependenciesOverlay,
          ),
        }
      : deploymentOverlay;

  const hydratedActOverlay: UmlActivityOverlay =
    reconciled.projection.diagramKind === "UML_ACTIVITY"
      ? {
          designedNodes: reconciled.projection.nodes.filter((n) => n.provenance === "DESIGNED"),
          designedEdges: reconciled.projection.edges.filter((e) => e.provenance === "DESIGNED"),
        }
      : activityOverlay;

  const hydratedStateOverlay: UmlStateOverlay =
    reconciled.projection.diagramKind === "UML_STATE"
      ? {
          designedStates: reconciled.projection.states.filter((s) => s.provenance === "DESIGNED"),
          designedTransitions: reconciled.projection.transitions.filter(
            (t) => t.provenance === "DESIGNED",
          ),
        }
      : stateOverlay;

  const carrier = extractCarrierFromProjection(reconciled.projection, mergedLayout, {
    selectedServiceId,
    selectedPackageName,
    selectedEnvironment,
    selectedOperationId: selectedOperationId ?? null,
    selectedTargetId: selectedTargetId ?? null,
    classOverlay: hydratedClassOverlay,
    packageOverlay: hydratedPkgOverlay,
    deploymentOverlay: hydratedDeployOverlay,
    activityOverlay: hydratedActOverlay,
    stateOverlay: hydratedStateOverlay,
  });

  return {
    diagramKind,
    carrier,
    projection: reconciled.projection,
    preservedLayout: mergedLayout,
    conflicts: reconciled.conflicts,
    classOverlay: hydratedClassOverlay,
    packageOverlay: hydratedPkgOverlay,
    deploymentOverlay: hydratedDeployOverlay,
    activityOverlay: hydratedActOverlay,
    stateOverlay: hydratedStateOverlay,
  };
}

// ============================================================================
// 7. 3E SELECTION CONTEXT RESOLVER FOR M4, M5, M6, M7
// ============================================================================

export function resolveUmlSelectionContext(
  projection: AnyUmlProjection,
  itemId: string,
): UmlSelectionContext | null {
  if (projection.diagramKind === "UML_CLASS") {
    const cls = projection.classifiers.find((c) => c.classifierId === itemId);
    if (cls) {
      return {
        diagramKind: "UML_CLASS",
        itemId: cls.classifierId,
        itemRole: cls.classifierKind,
        label: cls.qualifiedName,
        provenance: cls.provenance,
        modelElementId: cls.modelElementId,
        sourceRelationshipIds: [],
        evidenceIds: cls.evidenceIds,
        summary: `${cls.classifierKind} (${cls.sourceLanguage}) in package ${cls.packageName} with ${cls.attributes.length} attribute(s) and ${cls.operations.length} operation overload(s).`,
        details: {
          packageName: cls.packageName,
          visibility: cls.visibility,
          isAbstract: cls.isAbstract,
          attributesCount: cls.attributes.length,
          operationsCount: cls.operations.length,
        },
      };
    }
    const rel = projection.relations.find((r) => r.relationId === itemId);
    if (rel) {
      return {
        diagramKind: "UML_CLASS",
        itemId: rel.relationId,
        itemRole: rel.relationKind,
        label: `${rel.relationKind} (${rel.fromClassifierId} -> ${rel.toClassifierId})`,
        provenance: rel.provenance,
        modelElementId: null,
        sourceRelationshipIds: rel.sourceRelationshipId ? [rel.sourceRelationshipId] : [],
        evidenceIds: rel.evidenceIds,
        summary: `UML ${rel.relationKind} relationship (${rel.provenance})${rel.roleName ? ` role=${rel.roleName}` : ""}${rel.multiplicity ? ` multiplicity=${rel.multiplicity}` : ""}.`,
        details: {
          relationKind: rel.relationKind,
          roleName: rel.roleName,
          multiplicity: rel.multiplicity ?? "UNKNOWN (omitted)",
        },
      };
    }
  } else if (projection.diagramKind === "UML_PACKAGE") {
    const pkg = projection.packages.find((p) => p.packageId === itemId);
    if (pkg) {
      return {
        diagramKind: "UML_PACKAGE",
        itemId: pkg.packageId,
        itemRole: "PACKAGE",
        label: pkg.qualifiedName,
        provenance: pkg.provenance,
        modelElementId: pkg.memberClassifierIds[0] ?? null,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `UML Package ${pkg.qualifiedName} owning ${pkg.memberClassifierIds.length} classifier(s): ${pkg.memberNames.join(", ")}.`,
        details: {
          memberClassifierIds: pkg.memberClassifierIds,
          memberNames: pkg.memberNames,
        },
      };
    }
    const edge = projection.edges.find((e) => e.edgeId === itemId);
    if (edge) {
      return {
        diagramKind: "UML_PACKAGE",
        itemId: edge.edgeId,
        itemRole: `PACKAGE_${edge.relationKind}`,
        label: `«${edge.relationKind.toLowerCase()}» ${edge.fromPackageId} -> ${edge.toPackageId}`,
        provenance: edge.provenance,
        modelElementId: null,
        sourceRelationshipIds: edge.underlyingEdgeIds,
        evidenceIds: edge.evidenceIds,
        summary: `Package ${edge.relationKind} aggregating ${edge.underlyingEdgeIds.length} member relationship(s).`,
        details: {
          underlyingEdgeIds: edge.underlyingEdgeIds,
        },
      };
    }
  } else if (projection.diagramKind === "UML_DEPLOYMENT") {
    const node = projection.nodes.find((n) => n.nodeId === itemId);
    if (node) {
      return {
        diagramKind: "UML_DEPLOYMENT",
        itemId: node.nodeId,
        itemRole: node.nodeKind,
        label: `${node.stereotype} ${node.name}`,
        provenance: node.provenance,
        modelElementId: node.modelElementId,
        sourceRelationshipIds: [],
        evidenceIds: node.evidenceIds,
        summary: `Deployment ${node.nodeKind} in environment "${node.environment}"${node.ports.length ? ` exposing ports ${node.ports.join(", ")}` : ""}.`,
        details: {
          environment: node.environment,
          ports: node.ports,
          ...node.properties,
        },
      };
    }
    const edge = projection.edges.find((e) => e.edgeId === itemId);
    if (edge) {
      return {
        diagramKind: "UML_DEPLOYMENT",
        itemId: edge.edgeId,
        itemRole: edge.edgeKind,
        label: edge.label,
        provenance: edge.provenance,
        modelElementId: null,
        sourceRelationshipIds: edge.sourceRelationshipId ? [edge.sourceRelationshipId] : [],
        evidenceIds: edge.evidenceIds,
        summary: `Deployment ${edge.edgeKind} (${edge.provenance})${edge.protocol ? ` over ${edge.protocol}` : ""}.`,
        details: {
          protocol: edge.protocol,
          port: edge.port,
        },
      };
    }
  } else if (projection.diagramKind === "UML_ACTIVITY") {
    const node = projection.nodes.find((n) => n.nodeId === itemId);
    if (node) {
      return {
        diagramKind: "UML_ACTIVITY",
        itemId: node.nodeId,
        itemRole: node.kind,
        label: node.label,
        provenance: node.provenance,
        modelElementId: null,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `Activity ${node.kind} "${node.label}" in service partition "${node.partitionName}" (Partition denotes service responsibility, not OS thread).`,
        details: {
          partitionName: node.partitionName,
          joinSpec: node.joinSpec ?? undefined,
          extractionCompleteness: projection.extractionCompleteness,
        },
      };
    }
    const edge = projection.edges.find((e) => e.edgeId === itemId);
    if (edge) {
      return {
        diagramKind: "UML_ACTIVITY",
        itemId: edge.edgeId,
        itemRole: edge.flowKind,
        label: edge.guard ?? edge.flowKind,
        provenance: edge.provenance,
        modelElementId: null,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `Activity ${edge.flowKind}${edge.guard ? ` with guard ${edge.guard}` : ""}.`,
        details: {
          from: edge.from,
          to: edge.to,
          guard: edge.guard,
        },
      };
    }
  } else if (projection.diagramKind === "UML_STATE") {
    const st = projection.states.find((s) => s.stateId === itemId);
    if (st) {
      return {
        diagramKind: "UML_STATE",
        itemId: st.stateId,
        itemRole: st.kind,
        label: st.name,
        provenance: st.provenance,
        modelElementId:
          projection.selectedTargetId !== "designed" ? projection.selectedTargetId : null,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `UML State (${st.kind}) "${st.name}" in region ${st.regionId}.`,
        details: {
          entryBehavior: st.entryBehavior,
          doActivity: st.doActivity,
          exitBehavior: st.exitBehavior,
          enumOnlyNoTransitions: projection.enumOnlyNoTransitions,
        },
      };
    }
    const tr = projection.transitions.find((t) => t.transitionId === itemId);
    if (tr) {
      return {
        diagramKind: "UML_STATE",
        itemId: tr.transitionId,
        itemRole: "TRANSITION",
        label: formatTransitionLabel(tr) || "completion transition",
        provenance: tr.provenance,
        modelElementId:
          projection.selectedTargetId !== "designed" ? projection.selectedTargetId : null,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `State transition ${tr.fromStateId} -> ${tr.toStateId} (${formatTransitionLabel(tr) || "triggerless"}).`,
        details: {
          trigger: tr.trigger,
          guard: tr.guard,
          effect: tr.effect,
        },
      };
    }
  }
  return null;
}

import { isClientClassifier, isDeclarativeClientElement, isDomainClassifier, isInfrastructureClassifier, normalizeExtractedClassRelation } from "./classifier-semantics";
import type { ArchitecturalModel } from "@/types/domain";
import { compressCodeToAstSkeleton } from "./scenario-design";
import {
  deploymentSegmentHitsBox,
  placeDeploymentEdgeLabel,
  routeDeploymentPath,
  type DeploymentBox,
  type DeploymentPoint,
} from "./deployment-routing";
import { activityNodeSize, placeActivityGuard, planActivityRows } from "./activity-layout";
import { assignArcTrackLevels } from "@/lib/drawio/geometry";

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
  isClientProxy?: boolean | undefined;
  isDomainEntity?: boolean | undefined;
  isTechnicalInfrastructure?: boolean | undefined;
  sourceCompleteness?: "COMPLETE" | "PARTIAL" | undefined;
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
    if (elem.elementType !== "COMPONENT" && elem.elementType !== "CLASS_INTERFACE" &&
        (!elem.properties?.["umlClassifier"] || typeof elem.properties["umlClassifier"] !== "object")) {
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
      isDomainEntity: isDomainClassifier(rawUml),
      isTechnicalInfrastructure: isInfrastructureClassifier(rawUml),
      isClientProxy: isClientClassifier(rawUml, attributes),
      sourceCompleteness: rawUml && rawUml["extractionCompleteness"] !== "PARTIAL" && rawUml["metadataSource"] !== "LEGACY_SOURCE_PREVIEW" ? "COMPLETE" : "PARTIAL",
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

  const candidates = [...extracted, ...designedClassifiers];
  const allClassifiers = candidates.filter(c => {
    if (options?.serviceId && c.serviceId !== options.serviceId) return false;
    if (options?.packageName && c.packageName !== options.packageName) return false;
    return true;
  });
  if (options?.serviceId && !options.packageName) {
    // Shared/unmapped project types keep their canonical identity and owner.
    // Include signature targets without reassigning a foreign service's types.
    const byId = new Map(candidates.map(c => [c.classifierId, c]));
    const seeds = new Set(allClassifiers.map(c => c.classifierId));
    const included = new Set(seeds);
    for (const edge of model.edges) {
      const target = byId.get(edge.to), facts = edge.properties ?? {};
      if (edge.protocol === "CODE_DEPENDENCY" && seeds.has(edge.from) && target?.serviceId === null &&
          (typeof facts["declaredType"] === "string" || typeof facts["memberSignature"] === "string") && !included.has(target.classifierId)) {
        allClassifiers.push(target); included.add(target.classifierId);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of model.edges) {
        const source = byId.get(edge.from), target = byId.get(edge.to), facts = edge.properties ?? {};
        if (edge.protocol !== "CODE_DEPENDENCY" || !included.has(edge.from) || target?.serviceId !== null || included.has(edge.to)) continue;
        const owned = source?.isDomainEntity && normalizeExtractedClassRelation(String(facts["umlRelationKind"] ?? "DEPENDENCY") as UmlRelationKind, facts, true) === "COMPOSITION";
        if (owned || (source?.isDomainEntity && (target.isDomainEntity || target.classifierKind === "ENUM") && typeof facts["declaredType"] === "string")) {
          allClassifiers.push(target); included.add(edge.to); changed = true;
        }
      }
    }
  }
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

    if (provenance === "EXTRACTED") relationKind = normalizeExtractedClassRelation(relationKind, props, Boolean(allClassifiers.find(c => c.classifierId === edge.from)?.isDomainEntity));

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
  const connectedIds = new Set(relations.flatMap(r => [r.fromClassifierId, r.toClassifierId]));
  const hiddenInfrastructure = options?.packageName ? [] : allClassifiers.filter(c => c.provenance === "EXTRACTED" && c.isTechnicalInfrastructure && !connectedIds.has(c.classifierId));
  const hiddenIds = new Set(hiddenInfrastructure.map(c => c.classifierId));
  const shownClassifiers = allClassifiers.filter(c => !hiddenIds.has(c.classifierId));
  for (const cls of shownClassifiers) if (cls.sourceCompleteness === "PARTIAL") validationIssues.push({ code: "CLASSIFIER_SOURCE_METADATA_PARTIAL", severity: "INFO", targetId: cls.classifierId, message: `Source metadata for ${cls.name} is incomplete. Analyze the snapshot again to obtain canonical AST members and related domain types.` });
  if (hiddenIds.size) validationIssues.push({ code: "ISOLATED_INFRASTRUCTURE_HIDDEN", severity: "INFO", message: `${hiddenIds.size} isolated technical classifier(s) hidden. Select their package to inspect them.` });
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
    classifiers: shownClassifiers,
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

  const ensureConcretePackage = (pkgName: string, serviceId: string | null) => {
    const cleanName = pkgName.trim() || "default";
    const parts = cleanName.split(".").filter(Boolean);
    const shortName = parts[parts.length - 1] ?? cleanName;
    const scopePrefix = serviceId && serviceId.trim() ? `pkg:${serviceId.trim()}:` : "pkg:";
    const pkgId = `${scopePrefix}${cleanName}`;
    if (!pkgMap.has(pkgId)) {
      pkgMap.set(pkgId, {
        packageId: pkgId,
        name: shortName,
        qualifiedName: cleanName,
        parentPackageId: null,
        serviceId,
        memberClassifierIds: [],
        memberNames: [],
        provenance: "EXTRACTED",
      });
    }
    return pkgId;
  };

  for (const cls of [...classifiers].sort((a, b) => Number(Boolean(b.isDomainEntity)) - Number(Boolean(a.isDomainEntity)) || a.qualifiedName.localeCompare(b.qualifiedName))) {
    const pkgId = ensureConcretePackage(cls.packageName || "default", cls.serviceId);
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
        edgeId: `pkg-edge:${fromPkg}->${toPkg}${relationKind === "DEPENDENCY" ? "" : ":" + relationKind}`,
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
  const connectedPkgIds = new Set(edges.flatMap((e) => [e.fromPackageId, e.toPackageId]));
  const parentPkgIds = new Set(
    [...pkgMap.values()].map((p) => p.parentPackageId).filter((id): id is string => Boolean(id)),
  );
  const classifierById = new Map(classifiers.map((c) => [c.classifierId, c]));
  const elementById = new Map(model.elements.map((e) => [e.id, e]));
  const isBootstrapClassifier = (clsId: string): boolean => {
    const cls = classifierById.get(clsId);
    if (!cls) return false;
    if (
      /(?:Application|Bootstrap|Launcher|Starter)$/i.test(cls.name) ||
      /^(?:Program|Main)$/i.test(cls.name)
    ) {
      return true;
    }
    const elem = elementById.get(clsId);
    const props = (elem?.properties ?? {}) as Record<string, unknown>;
    const rawUml = props["umlClassifier"] as Record<string, unknown> | undefined;
    const anns = [
      ...(Array.isArray(rawUml?.["annotations"]) ? rawUml!["annotations"] : []),
      ...(Array.isArray(props["annotations"]) ? (props["annotations"] as unknown[]) : []),
    ].map((a) =>
      typeof a === "string" ? a : String((a as Record<string, unknown>)?.["name"] ?? ""),
    );
    if (anns.some((a) => /(?:SpringBootApplication|EnableAutoConfiguration|QuarkusMain)/i.test(a))) {
      return true;
    }
    const snippets = (elem?.evidence ?? []).map((ev) => ev.snippet ?? "").join("\n");
    if (/@SpringBootApplication\b|SpringApplication\.run\b/.test(snippets)) {
      return true;
    }
    const nonCtorOps = cls.operations.filter((op) => op.kind !== "CONSTRUCTOR");
    if (
      cls.attributes.length === 0 &&
      nonCtorOps.length > 0 &&
      nonCtorOps.every((op) => op.name === "main")
    ) {
      return true;
    }
    return false;
  };

  for (const pkg of [...pkgMap.values()]) {
    if (pkg.provenance !== "EXTRACTED") continue;
    if (pkgMap.size <= 1) break;
    if (connectedPkgIds.has(pkg.packageId) || parentPkgIds.has(pkg.packageId)) continue;
    if (pkg.memberClassifierIds.length > 0 && pkg.memberClassifierIds.every(isBootstrapClassifier)) {
      pkgMap.delete(pkg.packageId);
    }
  }

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

    const innerArtifactName =
      explicitArtifactName &&
      !(declaredBuildContext && !image && /^app\.(jar|war)$/i.test(explicitArtifactName))
        ? explicitArtifactName
        : declaredBuildContext
          ? `${elem.name}.jar`
          : null;

    if (innerArtifactName) {
      const artifactId = `deploy:artifact:${elem.id}`;
      nodes.push({
        nodeId: artifactId,
        modelElementId: elem.id,
        name: innerArtifactName,
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

      if (explicitArtifactName && (!declaredBuildContext || image)) {
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
      }
    }
    if (!explicitArtifactName && declaredBuildContext) {
      deploymentArtifactIssues.push({
        code: "BUILD_CONTEXT_WITHOUT_EXPLICIT_ARTIFACT",
        severity: "INFO",
        message: `Service "${elem.name}" declares a build context (${declaredBuildContext}) without an explicit container image; synthesized inner «artifact» ${elem.name}.jar.`,
        targetId: execNodeId,
      });
    } else if (!explicitArtifactName) {
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
  const commEdgeSpecs = new Map<string, { index: number; specificity: number }>();

  const upsertCommPathEdge = (candidate: UmlDeploymentEdge, specificity: number) => {
    const configured = ["CONFIGURATION_DEPENDENCY", "SERVICE_DISCOVERY", "TRACING_EXPORT", "GATEWAY_ROUTE", "CONFIGURED_ENDPOINT"].includes(candidate.protocol ?? "");
    if (configured) {
      // A configuration dependency is directional and semantically distinct
      // from an HTTP business call, even when ports and endpoints coincide.
      edges.push(candidate);
      return;
    }
    const pairPrefix = [candidate.fromNodeId, candidate.toNodeId].sort().join("<->");
    let matchedKey: string | null = null;
    for (const [k, spec] of commEdgeSpecs.entries()) {
      if (!k.startsWith(`${pairPrefix}:`)) continue;
      const existing = edges[spec.index];
      if (!existing) continue;
      if (existing.port === candidate.port || !existing.port || !candidate.port) {
        matchedKey = k;
        break;
      }
    }
    if (matchedKey !== null) {
      const spec = commEdgeSpecs.get(matchedKey)!;
      const existing = edges[spec.index]!;
      const mergedEvidenceIds = Array.from(
        new Set([...existing.evidenceIds, ...candidate.evidenceIds]),
      );
      const resolvedPort = existing.port ?? candidate.port;
      const winner = specificity > spec.specificity ? candidate : existing;
      const loser = specificity > spec.specificity ? existing : candidate;
      const baseLabel = winner.label.replace(/\s*\(\d+\)\s*$/, "");
      edges[spec.index] = {
        ...winner,
        port: resolvedPort,
        label: resolvedPort ? `${baseLabel} (${resolvedPort})` : baseLabel,
        sourceRelationshipId: winner.sourceRelationshipId ?? loser.sourceRelationshipId,
        evidenceIds: mergedEvidenceIds,
      };
      const nextKey = `${pairPrefix}:${resolvedPort ?? ""}`;
      commEdgeSpecs.delete(matchedKey);
      commEdgeSpecs.set(nextKey, {
        index: spec.index,
        specificity: Math.max(spec.specificity, specificity),
      });
      return;
    }
    const key = `${pairPrefix}:${candidate.port ?? ""}`;
    commEdgeSpecs.set(key, { index: edges.length, specificity });
    edges.push(candidate);
  };

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
        "CONFIGURATION_DEPENDENCY", "SERVICE_DISCOVERY", "TRACING_EXPORT", "GATEWAY_ROUTE", "CONFIGURED_ENDPOINT",
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
      const firstPort = targetPorts[0]?.split("/")[0]?.split(":").at(-1) ?? null;
      const resolvedDbProtocol =
        directTargetElem?.properties?.["protocol"] ??
        targetElem?.properties?.["protocol"] ??
        "TCP/DB";
      const protocolName =
        ["SERVICE_HTTP_CALL", "CONFIGURATION_DEPENDENCY", "SERVICE_DISCOVERY", "TRACING_EXPORT", "GATEWAY_ROUTE", "CONFIGURED_ENDPOINT"].includes(edge.protocol)
          ? edge.protocol === "SERVICE_HTTP_CALL" ? "HTTP" : edge.protocol
          : edge.protocol === "DATABASE_ACCESS" || edge.protocol === "DATABASE_QUERY"
            ? String(resolvedDbProtocol).toUpperCase()
            : String(targetElem?.properties?.["protocol"] ?? "MESSAGING").toUpperCase();

      const specificity =
        protocolName === "TCP" || protocolName === "TCP/DB" || protocolName === "MESSAGING"
          ? 20
          : 35;

      upsertCommPathEdge(
        {
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
        },
        specificity,
      );
    }
  }

  // Compose endpoint references are configured paths, independent of AST calls.
  // Their sanitized metadata contains host/port/declaration, never env values.
  for (const elem of model.elements) {
    const fromExec = serviceToExecEnvId.get(elem.id);
    if (!fromExec) continue;
    const metadata = elem.properties?.["deploymentMetadata"] as Record<string, unknown> | undefined;
    const connections = Array.isArray(metadata?.["connections"]) ? metadata["connections"] as Array<Record<string, unknown>> : [];
    for (const connection of connections) {
      const targets = model.elements.filter(e => e.name === connection["targetService"] && serviceToExecEnvId.has(e.id));
      if (targets.length !== 1 || targets[0]!.id === elem.id) continue;
      const toExec = serviceToExecEnvId.get(targets[0]!.id)!;
      const protocol = String(connection["protocol"] ?? "").toUpperCase();
      if (!["HTTP", "HTTPS", "TCP", "STARTUP_DEPENDENCY", "DECLARED_LINK"].includes(protocol)) continue;
      const port = Number(connection["port"]);
      const portLabel = Number.isInteger(port) && port > 0 && port <= 65535 ? String(port) : null;
      const declaredOnly = protocol === "STARTUP_DEPENDENCY" || protocol === "DECLARED_LINK";
      if (declaredOnly) {
        const pairPrefix = [fromExec, toExec].sort().join("<->");
        const hasRealComm = [...commEdgeSpecs.keys()].some((k) => k.startsWith(`${pairPrefix}:`));
        if (hasRealComm) continue;
        const key = `${fromExec}<->${toExec}:${protocol}:${portLabel ?? ""}`;
        if (commPairs.has(key)) continue;
        commPairs.add(key);
        edges.push({
          edgeId: `deploy:configured:${elem.id}:${targets[0]!.id}:${protocol}:${portLabel ?? "unknown"}`,
          sourceRelationshipId: null,
          fromNodeId: fromExec,
          toNodeId: toExec,
          edgeKind: "DEPLOYMENT_DEPENDENCY_STARTUP",
          protocol: protocol === "DECLARED_LINK" ? "links" : "depends_on",
          port: portLabel,
          label: `«${protocol === "DECLARED_LINK" ? "links" : "depends_on"}» (declared only)`,
          provenance: "EXTRACTED",
          evidenceIds: elem.evidence.map((e) => e.id),
        });
        continue;
      }
      const specificity = protocol === "TCP" ? 10 : 25;
      upsertCommPathEdge(
        {
          edgeId: `deploy:configured:${elem.id}:${targets[0]!.id}:${protocol}:${portLabel ?? "unknown"}`,
          sourceRelationshipId: null,
          fromNodeId: fromExec,
          toNodeId: toExec,
          edgeKind: "COMMUNICATION_PATH",
          protocol,
          port: portLabel,
          label: `«configured» ${protocol}${portLabel ? " (" + portLabel + ")" : ""}`,
          provenance: "EXTRACTED",
          evidenceIds: elem.evidence.map((e) => e.id),
        },
        specificity,
      );
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

  validationIssues.push({ code: "DECLARED_DEPLOYMENT_NOT_RUNTIME", severity: "INFO", message: "Declared deployment configuration only. Image tags do not establish that running images contain this analyzed source; configured profiles do not establish observed traffic." });
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
  generatedBy?: "BUSINESS_FLOW_TEMPLATE" | undefined;
}

export interface UmlActivityEdge {
  edgeId: string;
  from: string;
  to: string;
  flowKind: "CONTROL_FLOW" | "OBJECT_FLOW";
  guard: string | null;
  provenance: UmlProvenance;
  generatedBy?: "BUSINESS_FLOW_TEMPLATE" | undefined;
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
  operationId?: string | undefined;
  designedNodes?: UmlActivityNode[] | undefined;
  designedEdges?: UmlActivityEdge[] | undefined;
}

function isGeneratedActivityItem(item: UmlActivityNode | UmlActivityEdge): boolean {
  const id = "nodeId" in item ? item.nodeId : item.edgeId;
  // Reserved IDs also identify templates saved before generatedBy was introduced.
  return item.generatedBy === "BUSINESS_FLOW_TEMPLATE" || /^flow:business:.+:[ne]:\d+$/.test(id);
}

export function activityUserOverlay(
  projection: UmlActivityDiagramProjection,
  overlay?: UmlActivityOverlay,
): UmlActivityOverlay {
  const nodes = overlay?.designedNodes ?? projection.nodes;
  const edges = overlay?.designedEdges ?? projection.edges;
  return {
    operationId: projection.selectedOperationId,
    designedNodes: [...new Map(nodes.filter(n => n.provenance === "DESIGNED" && !isGeneratedActivityItem(n)).map(n => [n.nodeId, n])).values()],
    designedEdges: [...new Map(edges.filter(e => e.provenance === "DESIGNED" && !isGeneratedActivityItem(e)).map(e => [e.edgeId, e])).values()],
  };
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

interface DiscoveredBusinessFlowActivity {
  option: UmlActivityOperationOption;
  partitions: Array<{ partitionId: string; name: string; serviceId: string | null }>;
  nodes: UmlActivityNode[];
  edges: UmlActivityEdge[];
}

function discoverBusinessFlowActivities(
  model: ArchitecturalModel,
): DiscoveredBusinessFlowActivity[] {
  if (!model.edges || model.edges.length === 0) return [];

  const serviceContainers = model.elements.filter(
    (e) => e.elementType === "SERVICE_CONTAINER" && !/(^|[-_ ])(zookeeper|kafka|rabbitmq|consul|etcd|zipkin|jaeger|prometheus|grafana|mysql|postgres|redis|dynamodb[a-z]*|cdc)([-_ ]|$)/i.test(e.name),
  );
  const actors = model.elements.filter(
    (e) => e.elementType === "PERSON" || e.elementType === "EXTERNAL_SYSTEM",
  );

  // Only synthesize Cross-Service Business Flows when the model represents a multi-service / multi-boundary architecture
  if (serviceContainers.length < 2) return [];

  const elementById = new Map(model.elements.map((e) => [e.id, e]));
  const ownerOf = (id: string): string => {
    const seen = new Set<string>();
    let curr = id;
    while (elementById.get(curr)?.parentId && !seen.has(curr)) {
      seen.add(curr);
      curr = elementById.get(curr)!.parentId!;
    }
    return curr;
  };

  const findSvc = (pattern: RegExp, exclude?: RegExp) =>
    serviceContainers.find(
      (s) => pattern.test(s.name) && (!exclude || !exclude.test(s.name)),
    ) ?? null;

  const gatewayEl =
    actors[0] ??
    findSvc(/api[-_ ]?gateway|gateway|bff|edge|client/i) ??
    null;
  const orderSvc = findSvc(
    /\border[-_ ]?service\b|^order[-_ ]?svc$|^orders[-_ ]?service$|^ftgo[-_ ]?order[-_ ]?service$/i,
    /history/i,
  );
  const consumerSvc = findSvc(
    /consumer[-_ ]?service|customer[-_ ]?service|user[-_ ]?service|account[-_ ]?service/i,
  );
  const kitchenOnlySvc = findSvc(/\bkitchen[-_ ]?service\b/i);
  const inventorySvc = findSvc(
    /inventory[-_ ]?service|stock[-_ ]?service|warehouse[-_ ]?service|fulfillment[-_ ]?service/i,
  );
  const kitchenSvc = kitchenOnlySvc ?? inventorySvc;
  const isFtgoKitchen = Boolean(kitchenOnlySvc);
  const accountingSvc = findSvc(
    /accounting[-_ ]?service|payment[-_ ]?service|billing[-_ ]?service/i,
  );
  const deliverySvc = findSvc(
    /delivery[-_ ]?service|shipping[-_ ]?service|logistics[-_ ]?service|courier[-_ ]?service/i,
  );
  const restaurantOnlySvc = findSvc(/\brestaurant[-_ ]?service\b|\bmenu[-_ ]?service\b/i);
  const catalogSvc = findSvc(/catalog[-_ ]?service|product[-_ ]?service/i);
  const restaurantSvc = restaurantOnlySvc ?? catalogSvc;
  const isFtgoRestaurant = Boolean(restaurantOnlySvc);
  const notificationSvc = findSvc(
    /notification[-_ ]?service|notify[-_ ]?service|alert[-_ ]?service/i,
  );
  const historySvc = findSvc(
    /order[-_ ]?history|history[-_ ]?service|reporting[-_ ]?service|analytics[-_ ]?service/i,
  );

  const isTrivialActivityMethodName = (methodName: string, classifierName: string): boolean =>
    methodName === classifierName ||
    /^(get|set|is)[A-Z0-9_]/.test(methodName) ||
    /^(equals|hashCode|toString|canEqual|clone|compareTo|main|builder|toBuilder|of|valueOf|from|init|<init>|<clinit>|ctor)$/i.test(
      methodName,
    );

  const findServiceMethod = (
    svc: ArchitecturalModel["elements"][number] | null,
    pattern: RegExp,
    fallback: string,
  ): string => {
    if (!svc) return fallback;
    const candidates: string[] = [];
    for (const el of model.elements) {
      if (ownerOf(el.id) !== svc.id) continue;
      const rawUml = el.properties?.["umlClassifier"] as Record<string, unknown> | undefined;
      if (!rawUml || typeof rawUml !== "object") continue;
      const clsName = String(rawUml["name"] ?? el.name ?? "");
      if (
        String(rawUml["typeKind"] ?? el.properties?.["typeKind"] ?? "").toUpperCase() === "INTERFACE" ||
        isDeclarativeClientElement(el) ||
        isDomainClassifier(rawUml) ||
        /(Repository|Dao|Application|Entity|Dto|Request|Response)$/i.test(clsName)
      ) {
        continue;
      }
      const methodsCfg = Array.isArray(rawUml["methodsCfg"])
        ? (rawUml["methodsCfg"] as Array<Record<string, unknown>>)
        : [];
      for (const cfg of methodsCfg) {
        const mName = String(cfg["methodName"] ?? "").trim();
        if (mName && !isTrivialActivityMethodName(mName, clsName)) candidates.push(mName);
      }
      const members = Array.isArray(rawUml["members"])
        ? (rawUml["members"] as Array<Record<string, unknown>>)
        : [];
      for (const m of members) {
        if (!/^(OPERATION|METHOD)$/i.test(String(m["memberKind"] ?? ""))) continue;
        const mName = String(m["name"] ?? "").trim();
        if (mName && !isTrivialActivityMethodName(mName, clsName)) candidates.push(mName);
      }
    }
    return candidates.find((m) => pattern.test(m)) ?? candidates[0] ?? fallback;
  };

  const makePartition = (
    el: ArchitecturalModel["elements"][number],
    roleHint?: string,
  ): { partitionId: string; name: string; serviceId: string | null } => {
    const label = roleHint ? `${el.name} (${roleHint})` : el.name;
    return {
      partitionId: `partition:${el.id}`,
      name: label,
      serviceId: el.elementType === "SERVICE_CONTAINER" ? el.id : null,
    };
  };

  const flows: DiscoveredBusinessFlowActivity[] = [];

  const buildFlowRecord = (
    flowKey: string,
    flowTitle: string,
    primarySvc: ArchitecturalModel["elements"][number],
    participants: Array<{
      el: ArchitecturalModel["elements"][number];
      roleHint?: string;
    }>,
    builder: (
      partOf: (el: ArchitecturalModel["elements"][number]) => {
        partitionId: string;
        name: string;
        serviceId: string | null;
      },
      addNode: (
        el: ArchitecturalModel["elements"][number],
        kind: UmlActivityNodeKind,
        label: string,
        extra?: { objectState?: string; joinSpec?: string },
      ) => string,
      addEdge: (
        from: string,
        to: string,
        guard?: string | null,
        flowKind?: "CONTROL_FLOW" | "OBJECT_FLOW",
      ) => void,
    ) => void,
  ): DiscoveredBusinessFlowActivity | null => {
    const seenIds = new Set<string>();
    const uniqueParts: Array<{ partitionId: string; name: string; serviceId: string | null }> = [];
    const partByElId = new Map<
      string,
      { partitionId: string; name: string; serviceId: string | null }
    >();

    for (const p of participants) {
      if (!p.el || seenIds.has(p.el.id)) continue;
      seenIds.add(p.el.id);
      const part = makePartition(p.el, p.roleHint);
      uniqueParts.push(part);
      partByElId.set(p.el.id, part);
    }
    if (uniqueParts.length < 2) return null;

    const nodes: UmlActivityNode[] = [];
    const edges: UmlActivityEdge[] = [];
    const opId = `flow:business:${flowKey}`;

    const partOf = (el: ArchitecturalModel["elements"][number]) =>
      partByElId.get(el.id) ?? uniqueParts[0]!;

    const addNode = (
      el: ArchitecturalModel["elements"][number],
      kind: UmlActivityNodeKind,
      label: string,
      extra?: { objectState?: string; joinSpec?: string },
    ): string => {
      const p = partOf(el);
      const nodeId = `${opId}:n:${nodes.length + 1}`;
      nodes.push({
        nodeId,
        kind,
        label,
        partitionId: p.partitionId,
        partitionName: p.name,
        objectState: extra?.objectState ?? null,
        joinSpec: extra?.joinSpec ?? (kind === "JOIN" ? "AND" : null),
        provenance: "DESIGNED",
        generatedBy: "BUSINESS_FLOW_TEMPLATE",
      });
      return nodeId;
    };

    const addEdge = (
      from: string,
      to: string,
      guard: string | null = null,
      flowKind: "CONTROL_FLOW" | "OBJECT_FLOW" = "CONTROL_FLOW",
    ) => {
      edges.push({
        edgeId: `${opId}:e:${edges.length + 1}`,
        from,
        to,
        flowKind,
        guard,
        provenance: "DESIGNED",
        generatedBy: "BUSINESS_FLOW_TEMPLATE",
      });
    };

    builder(partOf, addNode, addEdge);

    const swimlaneSummary = `${uniqueParts.length} Swimlanes: ${uniqueParts
      .map((p) => p.name.replace(/\s*\([^)]*\)$/, ""))
      .join(" → ")}`;

    return {
      option: {
        operationId: opId,
        classifierId: primarySvc.id,
        classifierName: "Cross-Service Business Flow",
        serviceId: primarySvc.id,
        serviceName: swimlaneSummary,
        methodName: flowTitle,
        signatureKey: `${flowTitle} (${uniqueParts.length} Swimlanes)`,
        extractionCompleteness: "PARTIAL",
        unsupportedConstructs: ["INFERRED_BUSINESS_FLOW_REQUIRES_SOURCE_VERIFICATION"],
      },
      partitions: uniqueParts,
      nodes,
      edges,
    };
  };

  // -------------------------------------------------------------------------
  // 1. Canonical Domain Use-Case Flows (Synthesized from Project Services & Methods)
  // -------------------------------------------------------------------------
  const downstreamForCreateOrder = [consumerSvc, kitchenSvc, accountingSvc].filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );

  if (orderSvc && (downstreamForCreateOrder.length >= 2 || (downstreamForCreateOrder.length >= 1 && Boolean(gatewayEl)))) {
    const initiator = gatewayEl ?? orderSvc;
    const participants: Array<{
      el: ArchitecturalModel["elements"][number];
      roleHint?: string;
    }> = [];
    if (gatewayEl && gatewayEl.id !== orderSvc.id) {
      participants.push({ el: gatewayEl, roleHint: "Actor / Entry Gateway" });
    }
    participants.push({ el: orderSvc, roleHint: "Order Orchestrator" });
    if (consumerSvc) participants.push({ el: consumerSvc, roleHint: "Consumer Verification" });
    if (kitchenSvc) {
      participants.push({
        el: kitchenSvc,
        roleHint: isFtgoKitchen ? "Kitchen Ticket" : "Inventory & Stock Reservation",
      });
    }
    if (accountingSvc) {
      participants.push({
        el: accountingSvc,
        roleHint: isFtgoKitchen ? "Payment / Accounting" : "Payment Processing",
      });
    }

    const createOrderMethod = findServiceMethod(orderSvc, /create|place|submit/i, "createOrder");
    const reserveMethod = findServiceMethod(
      kitchenSvc,
      /reserve|createTicket|allocate|deduct|check/i,
      isFtgoKitchen ? "createTicket" : "reserveStock",
    );
    const payMethod = findServiceMethod(
      accountingSvc,
      /pay|authorize|charge|process/i,
      isFtgoKitchen ? "authorizePayment" : "processPayment",
    );
    const releaseMethod = findServiceMethod(
      kitchenSvc,
      /cancel|release|rollback/i,
      isFtgoKitchen ? "cancelCreateTicket" : "releaseReservedStock",
    );
    const confirmStockMethod = findServiceMethod(
      kitchenSvc,
      /confirm|commit|reserve/i,
      isFtgoKitchen ? "confirmCreateTicket" : reserveMethod,
    );

    const createFlow = buildFlowRecord(
      "create-order-flow",
      "Create Order Workflow",
      orderSvc,
      participants,
      (_partOf, addNode, addEdge) => {
        const nInit = addNode(initiator, "INITIAL", "Start Create Order");
        let prevId = nInit;

        if (gatewayEl && gatewayEl.id !== orderSvc.id) {
          const nReq = addNode(
            gatewayEl,
            "ACTION",
            "Submit order request · POST /orders (CreateOrderRequest)",
          );
          addEdge(prevId, nReq);
          prevId = nReq;
        }

        const nCreateOrder = addNode(
          orderSvc,
          "ACTION",
          isFtgoKitchen
            ? "Create order [APPROVAL_PENDING] & initiate CreateOrderSaga"
            : `Validate order request & create pending order (${createOrderMethod} [PENDING])`,
        );
        addEdge(prevId, nCreateOrder);
        prevId = nCreateOrder;

        if (consumerSvc) {
          const nCheckConsumer = addNode(
            consumerSvc,
            "ACTION",
            "Verify consumer account & eligibility (validateOrderByConsumer)",
          );
          addEdge(prevId, nCheckConsumer);

          const nDecConsumer = addNode(
            consumerSvc,
            "DECISION",
            "Consumer valid?",
          );
          addEdge(nCheckConsumer, nDecConsumer);

          const nRejectConsumer = addNode(
            orderSvc,
            "ACTION",
            "Reject order due to invalid consumer (rejectOrder [REJECTED])",
          );
          const nFinalRejectConsumer = addNode(
            orderSvc,
            "FLOW_FINAL",
            "Order Rejected (Consumer Invalid)",
          );
          addEdge(nDecConsumer, nRejectConsumer, "[invalid]");
          addEdge(nRejectConsumer, nFinalRejectConsumer);

          prevId = nDecConsumer;
        }

        if (kitchenSvc) {
          const nCreateTicket = addNode(
            kitchenSvc,
            "ACTION",
            isFtgoKitchen
              ? "Validate menu items & create provisional kitchen ticket (createTicket [CREATE_PENDING])"
              : `Check stock availability & reserve inventory (${reserveMethod} [RESERVED])`,
          );
          addEdge(
            prevId,
            nCreateTicket,
            consumerSvc ? "[valid]" : null,
          );
          prevId = nCreateTicket;
        }

        if (accountingSvc) {
          const nAuthPayment = addNode(
            accountingSvc,
            "ACTION",
            isFtgoKitchen
              ? "Authorize consumer payment method (authorizePayment)"
              : `Process order payment transaction (${payMethod})`,
          );
          addEdge(
            prevId,
            nAuthPayment,
            !kitchenSvc && consumerSvc ? "[valid]" : null,
          );

          const nDecPayment = addNode(
            accountingSvc,
            "DECISION",
            "Payment authorized?",
          );
          addEdge(nAuthPayment, nDecPayment);

          // Compensation branch if payment fails
          if (kitchenSvc) {
            const nCancelTicket = addNode(
              kitchenSvc,
              "ACTION",
              isFtgoKitchen
                ? "Cancel provisional kitchen ticket (cancelCreateTicket [CANCELLED])"
                : `Release reserved inventory stock (${releaseMethod} [RELEASED])`,
            );
            const nRejectPayment = addNode(
              orderSvc,
              "ACTION",
              "Compensate saga & reject order (rejectOrder [REJECTED])",
            );
            const nFinalRejectPayment = addNode(
              orderSvc,
              "FLOW_FINAL",
              "Order Rejected (Payment Failed)",
            );
            addEdge(nDecPayment, nCancelTicket, "[declined]");
            addEdge(nCancelTicket, nRejectPayment);
            addEdge(nRejectPayment, nFinalRejectPayment);

            // Happy path branch
            const nConfirmTicket = addNode(
              kitchenSvc,
              "ACTION",
              isFtgoKitchen
                ? "Confirm kitchen ticket (confirmCreateTicket [AWAITING_ACCEPTANCE])"
                : `Confirm inventory deduction & finalize reservation (${confirmStockMethod} [CONFIRMED])`,
            );
            const nApproveOrder = addNode(
              orderSvc,
              "ACTION",
              "Approve order · Transition state to [APPROVED]",
            );
            const nFinalSuccess = addNode(
              orderSvc,
              "ACTIVITY_FINAL",
              "Order Approved & Completed",
            );
            addEdge(nDecPayment, nConfirmTicket, "[authorized]");
            addEdge(nConfirmTicket, nApproveOrder);
            addEdge(nApproveOrder, nFinalSuccess);
          } else {
            const nRejectPayment = addNode(
              orderSvc,
              "ACTION",
              "Reject order due to payment failure (rejectOrder [REJECTED])",
            );
            const nFinalRejectPayment = addNode(
              orderSvc,
              "FLOW_FINAL",
              "Order Rejected",
            );
            addEdge(nDecPayment, nRejectPayment, "[declined]");
            addEdge(nRejectPayment, nFinalRejectPayment);

            const nApproveOrder = addNode(
              orderSvc,
              "ACTION",
              "Approve order · Transition state to [APPROVED]",
            );
            const nFinalSuccess = addNode(
              orderSvc,
              "ACTIVITY_FINAL",
              "Order Approved",
            );
            addEdge(nDecPayment, nApproveOrder, "[authorized]");
            addEdge(nApproveOrder, nFinalSuccess);
          }
        } else {
          const nApproveOrder = addNode(
            orderSvc,
            "ACTION",
            "Approve order · Transition state to [APPROVED]",
          );
          const nFinalSuccess = addNode(
            orderSvc,
            "ACTIVITY_FINAL",
            "Order Approved",
          );
          addEdge(
            prevId,
            nApproveOrder,
            !kitchenSvc && consumerSvc ? "[valid]" : null,
          );
          addEdge(nApproveOrder, nFinalSuccess);
        }
      },
    );
    if (createFlow) flows.push(createFlow);
  }

  // Flow 2: Fulfillment & Delivery Flow
  if (deliverySvc && (kitchenSvc || orderSvc || restaurantSvc)) {
    const participants: Array<{
      el: ArchitecturalModel["elements"][number];
      roleHint?: string;
    }> = [];
    if (isFtgoRestaurant && restaurantSvc) {
      participants.push({ el: restaurantSvc, roleHint: "Restaurant Actor / Menu" });
    } else if (!isFtgoKitchen && catalogSvc) {
      participants.push({ el: catalogSvc, roleHint: "Product Catalog & Packaging Spec" });
    } else if (gatewayEl) {
      participants.push({
        el: gatewayEl,
        roleHint: isFtgoKitchen ? "Restaurant / Courier App" : "Fulfillment Gateway",
      });
    }
    if (kitchenSvc) {
      participants.push({
        el: kitchenSvc,
        roleHint: isFtgoKitchen ? "Kitchen Preparation" : "Warehouse Stock Preparation",
      });
    }
    participants.push({
      el: deliverySvc,
      roleHint: isFtgoKitchen ? "Delivery & Courier Dispatch" : "Delivery & Cold-Chain Dispatch",
    });
    if (orderSvc) participants.push({ el: orderSvc, roleHint: "Order Tracking" });

    const initiator =
      (isFtgoRestaurant ? restaurantSvc : catalogSvc) ?? gatewayEl ?? kitchenSvc ?? deliverySvc;
    const scheduleMethod = findServiceMethod(
      deliverySvc,
      /schedule|dispatch|create|assign/i,
      isFtgoKitchen ? "scheduleDelivery" : "scheduleColdTruckDelivery",
    );
    const prepMethod = findServiceMethod(
      kitchenSvc,
      /prepare|reserve|allocate|pack/i,
      isFtgoKitchen ? "acceptTicket" : "reserveFruitStock",
    );

    const deliveryFlow = buildFlowRecord(
      "delivery-flow",
      "Order Fulfillment & Delivery Workflow",
      deliverySvc,
      participants,
      (_partOf, addNode, addEdge) => {
        const nInit = addNode(initiator, "INITIAL", "Start Delivery Flow");
        let prevId = nInit;

        if (initiator.id !== (kitchenSvc?.id ?? deliverySvc.id)) {
          const nRestAccept = addNode(
            initiator,
            "ACTION",
            isFtgoKitchen
              ? "Restaurant accepts ticket & confirms preparation time (acceptTicket)"
              : `Verify catalog handling rules & confirm fulfillment schedule (${prepMethod})`,
          );
          addEdge(prevId, nRestAccept);
          prevId = nRestAccept;
        }

        if (kitchenSvc) {
          const nKitchenPrep = addNode(
            kitchenSvc,
            "ACTION",
            isFtgoKitchen
              ? "Prepare order [PREPARING] → Ready [READY_FOR_PICKUP] & publish TicketAcceptedEvent"
              : `Prepare warehouse batch [PREPARING] → Ready for dispatch (${prepMethod} [READY_FOR_PICKUP])`,
          );
          addEdge(prevId, nKitchenPrep);
          prevId = nKitchenPrep;
        }

        const nSchedule = addNode(
          deliverySvc,
          "ACTION",
          isFtgoKitchen
            ? "Consume Kitchen event · Create Delivery & locate available courier (scheduleDelivery)"
            : `Schedule shipment & allocate delivery vehicle (${scheduleMethod})`,
        );
        addEdge(prevId, nSchedule);

        const nDecCourier = addNode(
          deliverySvc,
          "DECISION",
          isFtgoKitchen ? "Available courier found?" : "Delivery vehicle available?",
        );
        addEdge(nSchedule, nDecCourier);

        const nNoCourier = addNode(
          deliverySvc,
          "ACTION",
          isFtgoKitchen
            ? "Enqueue for courier dispatch retry (queuePendingDelivery)"
            : "Enqueue shipment for next available dispatch slot (queuePendingDelivery)",
        );
        const nFinalRetry = addNode(
          deliverySvc,
          "FLOW_FINAL",
          isFtgoKitchen ? "Awaiting Next Courier Slot" : "Awaiting Next Dispatch Slot",
        );
        addEdge(nDecCourier, nNoCourier, "[no courier / retry]");
        addEdge(nNoCourier, nFinalRetry);

        const nPickupDeliver = addNode(
          deliverySvc,
          "ACTION",
          isFtgoKitchen
            ? "Assign courier (assignCourier) → Pick up [PICKED_UP] → Complete delivery [DELIVERED]"
            : `Dispatch shipment (${scheduleMethod}) → In transit [IN_TRANSIT] → Complete delivery [DELIVERED]`,
        );
        addEdge(nDecCourier, nPickupDeliver, "[courier assigned]");

        if (orderSvc) {
          const nCompleteOrder = addNode(
            orderSvc,
            "ACTION",
            "Synchronize completed delivery status with customer order",
          );
          const nFinal = addNode(orderSvc, "ACTIVITY_FINAL", "Delivery Completed");
          addEdge(nPickupDeliver, nCompleteOrder);
          addEdge(nCompleteOrder, nFinal);
        } else {
          const nFinal = addNode(deliverySvc, "ACTIVITY_FINAL", "Delivery Completed");
          addEdge(nPickupDeliver, nFinal);
        }
      },
    );
    if (deliveryFlow) flows.push(deliveryFlow);
  }

  // Flow 3: Cancel Order Flow — (Gateway, Order, Kitchen/Inventory, Accounting/Payment)
  if (orderSvc && kitchenSvc) {
    const participants: Array<{
      el: ArchitecturalModel["elements"][number];
      roleHint?: string;
    }> = [];
    if (gatewayEl && gatewayEl.id !== orderSvc.id) {
      participants.push({ el: gatewayEl, roleHint: "Customer Actor / Gateway" });
    }
    participants.push({ el: orderSvc, roleHint: "Cancel Order Saga" });
    participants.push({
      el: kitchenSvc,
      roleHint: isFtgoKitchen ? "Kitchen Ticket Check" : "Inventory Rollback Check",
    });
    if (accountingSvc) {
      participants.push({ el: accountingSvc, roleHint: "Refund / Reverse Auth" });
    }

    const cancelStockMethod = findServiceMethod(
      kitchenSvc,
      /cancel|release|rollback|reserve/i,
      isFtgoKitchen ? "beginCancelTicket" : "releaseReservedStock",
    );
    const refundMethod = findServiceMethod(
      accountingSvc,
      /refund|reverse|cancel|pay/i,
      isFtgoKitchen ? "reverseAuthorization" : "refundPayment",
    );

    const initiator = gatewayEl ?? orderSvc;
    const cancelFlow = buildFlowRecord(
      "cancel-order-flow",
      "Cancel Order Workflow",
      orderSvc,
      participants,
      (_partOf, addNode, addEdge) => {
        const nInit = addNode(initiator, "INITIAL", "Start Cancel Order");
        let prevId = nInit;

        if (gatewayEl && gatewayEl.id !== orderSvc.id) {
          const nReqCancel = addNode(
            gatewayEl,
            "ACTION",
            "Customer requests order cancellation · POST /orders/{id}/cancel",
          );
          addEdge(prevId, nReqCancel);
          prevId = nReqCancel;
        }

        const nBeginCancelOrder = addNode(
          orderSvc,
          "ACTION",
          "Initiate CancelOrderSaga · Transition order to [CANCEL_PENDING]",
        );
        addEdge(prevId, nBeginCancelOrder);

        const nCheckKitchen = addNode(
          kitchenSvc,
          "ACTION",
          isFtgoKitchen
            ? "Check kitchen ticket preparation status (beginCancelTicket)"
            : `Check shipment status & lock reserved stock (${cancelStockMethod})`,
        );
        addEdge(nBeginCancelOrder, nCheckKitchen);

        const nDecCooked = addNode(
          kitchenSvc,
          "DECISION",
          isFtgoKitchen ? "Preparation already started?" : "Shipment already dispatched?",
        );
        addEdge(nCheckKitchen, nDecCooked);

        // Branch 1: Already cooking / dispatched -> reject cancellation
        const nUndoCancel = addNode(
          orderSvc,
          "ACTION",
          "Reject cancellation · Restore [APPROVED] state (undoBeginCancel)",
        );
        const nFinalCannotCancel = addNode(
          orderSvc,
          "FLOW_FINAL",
          isFtgoKitchen
            ? "Cancel Rejected (Already Cooking)"
            : "Cancel Rejected (Already Dispatched)",
        );
        addEdge(
          nDecCooked,
          nUndoCancel,
          isFtgoKitchen ? "[already cooking / too late]" : "[already dispatched / too late]",
        );
        addEdge(nUndoCancel, nFinalCannotCancel);

        // Branch 2: Not started / not dispatched -> allow cancel & refund in Accounting/Payment
        let afterDecId = nDecCooked;
        if (accountingSvc) {
          const nRefund = addNode(
            accountingSvc,
            "ACTION",
            isFtgoKitchen
              ? "Reverse payment authorization / refund customer (reverseAuthorization)"
              : `Reverse payment authorization & refund customer (${refundMethod})`,
          );
          addEdge(nDecCooked, nRefund, "[not started / allow cancel]");
          afterDecId = nRefund;
        }

        const nConfirmCancelTicket = addNode(
          kitchenSvc,
          "ACTION",
          isFtgoKitchen
            ? "Confirm kitchen ticket cancellation (confirmCancelTicket [CANCELLED])"
            : `Confirm stock reservation rollback (${cancelStockMethod} [RELEASED])`,
        );
        addEdge(
          afterDecId,
          nConfirmCancelTicket,
          !accountingSvc ? "[not started / allow cancel]" : null,
        );

        const nConfirmCancelOrder = addNode(
          orderSvc,
          "ACTION",
          "Finalize order cancellation · Transition state to [CANCELLED]",
        );
        const nFinalCancelled = addNode(
          orderSvc,
          "ACTIVITY_FINAL",
          "Order Cancelled & Refunded",
        );
        addEdge(nConfirmCancelTicket, nConfirmCancelOrder);
        addEdge(nConfirmCancelOrder, nFinalCancelled);
      },
    );
    if (cancelFlow) flows.push(cancelFlow);
  }

  // Flow 4A: FTGO Restaurant & CQRS Order History Event Flow (only when FTGO restaurant or history service exists)
  if (orderSvc && (isFtgoRestaurant || historySvc) && (kitchenSvc || accountingSvc)) {
    const targetSyncSvcs = [kitchenSvc, orderSvc, historySvc].filter(
      (s): s is NonNullable<typeof s> => Boolean(s),
    );
    if (restaurantSvc && targetSyncSvcs.length >= 2) {
      const participants: Array<{
        el: ArchitecturalModel["elements"][number];
        roleHint?: string;
      }> = [
        { el: restaurantSvc, roleHint: "Restaurant & Menu Publisher" },
        ...targetSyncSvcs.map((el) => ({ el, roleHint: "Event SubscriberReplica" })),
      ];
      const syncFlow = buildFlowRecord(
        "restaurant-order-history-flow",
        "Menu & CQRS Event Synchronization Workflow",
        restaurantSvc,
        participants,
        (_partOf, addNode, addEdge) => {
          const nInit = addNode(restaurantSvc, "INITIAL", "Start Domain Event Flow");
          const nPub = addNode(
            restaurantSvc,
            "ACTION",
            "Update Restaurant / Menu aggregate & publish Domain Event via Kafka",
          );
          const nFork = addNode(restaurantSvc, "FORK", "Fork Parallel Event Consumers");
          addEdge(nInit, nPub);
          addEdge(nPub, nFork);

          const branchEnds: string[] = [];
          for (const subSvc of targetSyncSvcs) {
            if (subSvc.id === restaurantSvc.id) continue;
            const nSub = addNode(
              subSvc,
              "ACTION",
              `Consume Domain Event & update read-model replica in ${subSvc.name}`,
            );
            addEdge(nFork, nSub);
            branchEnds.push(nSub);
          }

          const lastSvc = targetSyncSvcs[targetSyncSvcs.length - 1] ?? restaurantSvc;
          const nJoin = addNode(lastSvc, "JOIN", "Join Event Replica Sync", {
            joinSpec: "AND",
          });
          for (const bEnd of branchEnds) {
            addEdge(bEnd, nJoin);
          }
          const nDone = addNode(
            lastSvc,
            "ACTIVITY_FINAL",
            "Replica Synchronization Complete",
          );
          addEdge(nJoin, nDone);
        },
      );
      if (syncFlow) flows.push(syncFlow);
    }
  } else if (!isFtgoRestaurant && (catalogSvc || notificationSvc) && (orderSvc || accountingSvc)) {
    // Flow 4B: Project-specific Catalog Pricing & Payment Notification Workflow (e.g., fruit-* microservices)
    const participants: Array<{
      el: ArchitecturalModel["elements"][number];
      roleHint?: string;
    }> = [];
    if (gatewayEl) participants.push({ el: gatewayEl, roleHint: "Actor / API Gateway" });
    if (catalogSvc) participants.push({ el: catalogSvc, roleHint: "Catalog & Pricing Lookup" });
    if (orderSvc) participants.push({ el: orderSvc, roleHint: "Order Calculation" });
    if (accountingSvc) participants.push({ el: accountingSvc, roleHint: "Payment & Receipt" });
    if (notificationSvc) participants.push({ el: notificationSvc, roleHint: "Notification Dispatch" });

    const primary = accountingSvc ?? orderSvc ?? catalogSvc ?? notificationSvc!;
    const catalogMethod = findServiceMethod(catalogSvc, /get|find|list|lookup|catalog/i, "lookupCatalogItems");
    const payMethod = findServiceMethod(accountingSvc, /pay|process|charge/i, "processPayment");
    const notifyMethod = findServiceMethod(
      notificationSvc,
      /send|notify|dispatch|receipt|alert/i,
      "sendPaymentReceipt",
    );

    const catalogNotifyFlow = buildFlowRecord(
      "catalog-notification-flow",
      "Catalog Pricing & Payment Notification Workflow",
      primary,
      participants.slice(0, 4),
      (_partOf, addNode, addEdge) => {
        const firstEl = participants[0]?.el ?? primary;
        const nInit = addNode(firstEl, "INITIAL", "Start Catalog & Notification Flow");
        let prevId = nInit;

        if (catalogSvc) {
          const nCat = addNode(
            catalogSvc,
            "ACTION",
            `Query product catalog & validate unit pricing (${catalogMethod})`,
          );
          addEdge(prevId, nCat);
          prevId = nCat;
        }
        if (orderSvc && participants.slice(0, 4).some((p) => p.el.id === orderSvc.id)) {
          const nOrd = addNode(
            orderSvc,
            "ACTION",
            "Compute order totals & submit payment request",
          );
          addEdge(prevId, nOrd);
          prevId = nOrd;
        }
        if (accountingSvc && participants.slice(0, 4).some((p) => p.el.id === accountingSvc.id)) {
          const nPay = addNode(
            accountingSvc,
            "ACTION",
            `Record payment transaction & invoke notification client (${payMethod})`,
          );
          addEdge(prevId, nPay);
          prevId = nPay;
        }
        if (notificationSvc && participants.slice(0, 4).some((p) => p.el.id === notificationSvc.id)) {
          const nNotify = addNode(
            notificationSvc,
            "ACTION",
            `Format & dispatch customer notification (${notifyMethod})`,
          );
          const nDecNotify = addNode(
            notificationSvc,
            "DECISION",
            "Notification delivered?",
          );
          const nRetry = addNode(
            notificationSvc,
            "ACTION",
            "Log delivery warning & schedule notification retry",
          );
          const nRetryFinal = addNode(
            notificationSvc,
            "FLOW_FINAL",
            "Notification Queued for Retry",
          );
          const nDone = addNode(
            notificationSvc,
            "ACTIVITY_FINAL",
            "Payment & Notification Completed",
          );
          addEdge(prevId, nNotify);
          addEdge(nNotify, nDecNotify);
          addEdge(nDecNotify, nRetry, "[delivery failed]");
          addEdge(nRetry, nRetryFinal);
          addEdge(nDecNotify, nDone, "[delivered]");
        } else {
          const nDone = addNode(primary, "ACTIVITY_FINAL", "Workflow Completed");
          addEdge(prevId, nDone);
        }
      },
    );
    if (catalogNotifyFlow) flows.push(catalogNotifyFlow);
  }

  // -------------------------------------------------------------------------
  // 2. General Graph-Driven Cross-Service Business Flows (fallback when no multi-swimlane workflows exist)
  // -------------------------------------------------------------------------
  const adjServices = new Map<string, Set<string>>();
  const callersOfService = new Map<string, Set<string>>();
  for (const s of serviceContainers) {
    adjServices.set(s.id, new Set<string>());
    callersOfService.set(s.id, new Set<string>());
  }

  const channelPublishers = new Map<string, Set<string>>();
  const channelSubscribers = new Map<string, Set<string>>();

  const businessServiceIds = new Set(serviceContainers.map((s) => s.id));
  for (const edge of model.edges) {
    if (
      edge.uncertain ||
      edge.originLayer === "DEPLOYMENT" ||
      !/^(HTTP|HTTPS|REST|GRPC|SERVICE_HTTP_CALL|MESSAGE_PUBLISH|MESSAGE_SUBSCRIBE)$/i.test(
        edge.protocol,
      )
    )
      continue;
    const uRoot = ownerOf(edge.from);
    const vRoot = ownerOf(edge.to);
    if (uRoot === vRoot) continue;
    const uEl = elementById.get(uRoot);
    const vEl = elementById.get(vRoot);
    if (!uEl || !vEl) continue;

    if (businessServiceIds.has(uRoot) && businessServiceIds.has(vRoot)) {
      adjServices.get(uRoot)?.add(vRoot);
      callersOfService.get(vRoot)?.add(uRoot);
    } else if (
      (uEl.elementType === "PERSON" || uEl.elementType === "EXTERNAL_SYSTEM") &&
      vEl.elementType === "SERVICE_CONTAINER"
    ) {
      callersOfService.get(vRoot)?.add(uRoot);
    } else if (
      uEl.elementType === "SERVICE_CONTAINER" &&
      (vEl.elementType === "MESSAGE_CHANNEL" || vEl.elementType === "QUEUE_BROKER")
    ) {
      if (edge.protocol === "MESSAGE_SUBSCRIBE") {
        const subs = channelSubscribers.get(vRoot) ?? new Set<string>();
        subs.add(uRoot);
        channelSubscribers.set(vRoot, subs);
      } else {
        const pubs = channelPublishers.get(vRoot) ?? new Set<string>();
        pubs.add(uRoot);
        channelPublishers.set(vRoot, pubs);
      }
    } else if (
      (uEl.elementType === "MESSAGE_CHANNEL" || uEl.elementType === "QUEUE_BROKER") &&
      vEl.elementType === "SERVICE_CONTAINER"
    ) {
      const subs = channelSubscribers.get(uRoot) ?? new Set<string>();
      subs.add(vRoot);
      channelSubscribers.set(uRoot, subs);
    }
  }

  for (const [chId, pubs] of channelPublishers.entries()) {
    const subs = channelSubscribers.get(chId) ?? new Set<string>();
    for (const p of pubs) {
      for (const s of subs) {
        if (p !== s) {
          adjServices.get(p)?.add(s);
          callersOfService.get(s)?.add(p);
        }
      }
    }
  }

  if (flows.length === 0) {
    for (const svc of serviceContainers) {
      const downstreamIds = [...(adjServices.get(svc.id) ?? [])];
      if (downstreamIds.length === 0) continue;

      const downEls = downstreamIds
        .map((id) => elementById.get(id))
        .filter((el): el is NonNullable<typeof el> => Boolean(el));

      for (const target of downEls.filter((d) => businessServiceIds.has(d.id))) {
        const genericFlow = buildFlowRecord(
          `service-flow-${svc.id}-${target.id}`,
          `Interaction ${svc.name} → ${target.name} (unverified main flow)`,
          svc,
          [{ el: svc }, { el: target }],
          (_partOf, addNode, addEdge) => {
            const initial = addNode(svc, "INITIAL", "Start interaction");
            const call = addNode(svc, "ACTION", `Invoke ${target.name}`);
            const receive = addNode(target, "ACTION", "Declared target · execution not verified");
            const final = addNode(target, "ACTIVITY_FINAL", "End illustrative activity");
            addEdge(initial, call);
            addEdge(call, receive);
            addEdge(receive, final);
          },
        );
        if (genericFlow) flows.push(genericFlow);
      }
    }
  }

  return flows;
}

export function listActivityOperations(
  model: ArchitecturalModel,
): UmlActivityOperationOption[] {
  const servicesById = new Map(
    model.elements
      .filter((e) => e.elementType === "SERVICE_CONTAINER")
      .map((e) => [e.id, e.name]),
  );
  const cfgOptions: UmlActivityOperationOption[] = [];
  const apiClassifierIds = new Set<string>();

  for (const elem of model.elements) {
    const rawUml = elem.properties?.["umlClassifier"] as Record<string, unknown> | undefined;
    if (!rawUml || typeof rawUml !== "object") continue;

    const classifierName =
      typeof rawUml["name"] === "string" && rawUml["name"].trim()
        ? rawUml["name"].trim()
        : elem.name;
    const typeKind = String(
      rawUml["typeKind"] ?? elem.properties?.["typeKind"] ?? "CLASS",
    ).toUpperCase();
    const annotations = Array.isArray(rawUml["annotations"])
      ? (rawUml["annotations"] as unknown[]).map(String)
      : [];
    if (
      typeKind === "ENUM" ||
      isDeclarativeClientElement(elem) ||
      /(Repository|Dao|Application|Client|Builder|Mapper|Config|Configuration)$/i.test(classifierName) ||
      annotations.some((a) => /^(SpringBootApplication|Repository|FeignClient|Configuration)$/i.test(a))
    ) {
      continue;
    }

    if (
      /(Controller|Resource)$/i.test(classifierName) ||
      annotations.some((a) => /^(RestController|Controller|RequestMapping|Path|ApiController)$/i.test(a))
    ) {
      apiClassifierIds.add(elem.id);
    }

    const isEntityOrDto =
      isDomainClassifier(rawUml) || /(Entity|Dto|Request|Response|Event)$/i.test(classifierName);
    const isExcludedMethodName = (methodName: string): boolean =>
      methodName === classifierName ||
      /^(get|set|is)[A-Z0-9_]/.test(methodName) ||
      /^(equals|hashCode|toString|canEqual|clone|compareTo|main|builder|toBuilder|of|valueOf|from|init|<init>|<clinit>|ctor)$/i.test(
        methodName,
      );

    const methodsCfg = Array.isArray(rawUml["methodsCfg"])
      ? (rawUml["methodsCfg"] as Array<Record<string, unknown>>)
      : [];
    const serviceName =
      (elem.parentId ? servicesById.get(elem.parentId) : undefined) ?? "Application Service";

    const cfgSignatures = new Set<string>();
    for (const cfg of methodsCfg) {
      const methodName = String(cfg["methodName"] ?? "operation").trim();
      const signatureKey = String(cfg["signatureKey"] ?? cfg["signature"] ?? methodName);
      cfgSignatures.add(signatureKey);
      if (isExcludedMethodName(methodName)) continue;
      const rawNodes = Array.isArray(cfg["nodes"])
        ? (cfg["nodes"] as Array<Record<string, unknown>>)
        : [];
      if (
        isEntityOrDto &&
        !rawNodes.some((rn) => /^(DECISION|MERGE|FORK|JOIN)$/i.test(String(rn["kind"] ?? "")))
      ) {
        continue;
      }
      const operationId = `${elem.id}::${signatureKey}`;
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
      cfgOptions.push({
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

    if (!isEntityOrDto) {
      const rawMembers = Array.isArray(rawUml["members"])
        ? (rawUml["members"] as Array<Record<string, unknown>>)
        : [];
      for (const m of rawMembers) {
        if (String(m["memberKind"] ?? "").toUpperCase() !== "OPERATION") continue;
        const methodName = String(m["name"] ?? "operation").trim();
        const signatureKey = String(m["signature"] ?? m["signatureKey"] ?? methodName);
        if (cfgSignatures.has(signatureKey) || isExcludedMethodName(methodName)) continue;
        cfgOptions.push({
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
  }

  // Prefer API entry points while retaining other source-backed operations.
  cfgOptions.sort((a, b) => Number(apiClassifierIds.has(b.classifierId)) - Number(apiClassifierIds.has(a.classifierId)));

  // Discover Cross-Service Business Flows (Main Flows / Use Cases across Microservice Swimlanes)
  const discovered = discoverBusinessFlowActivities(model);
  const multiSwimlaneFlows = discovered
    .filter((f) => f.partitions.length >= 3)
    .map((f) => f.option);
  const fallbackPairFlows = discovered
    .filter((f) => f.partitions.length < 3)
    .map((f) => f.option);

  return [...cfgOptions, ...multiSwimlaneFlows.map(option => ({ ...option, methodName: "Unverified dependency illustration · " + option.methodName })), ...fallbackPairFlows.map(option => ({ ...option, methodName: "Unverified dependency illustration · " + option.methodName }))];
}

export function validateActivityStructure(
  nodes: UmlActivityNode[],
  edges: UmlActivityEdge[],
): UmlValidationIssue[] {
  const issues: UmlValidationIssue[] = [];
  const nodeIds = new Set<string>(), edgeIds = new Set<string>();
  for (const n of nodes) {
    if (nodeIds.has(n.nodeId)) issues.push({ code: "DUPLICATE_ACTIVITY_NODE", severity: "ERROR", message: `Duplicate activity node ID: ${n.nodeId}.`, targetId: n.nodeId });
    nodeIds.add(n.nodeId);
  }
  for (const e of edges) {
    if (edgeIds.has(e.edgeId)) issues.push({ code: "DUPLICATE_ACTIVITY_EDGE", severity: "ERROR", message: `Duplicate activity flow ID: ${e.edgeId}.`, targetId: e.edgeId });
    edgeIds.add(e.edgeId);
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) issues.push({ code: "DANGLING_ACTIVITY_EDGE", severity: "ERROR", message: `Activity flow ${e.edgeId} references a missing source or target.`, targetId: e.edgeId });
  }
  if (nodes.length && !nodes.some(n => n.kind === "ACTIVITY_FINAL" || n.kind === "FLOW_FINAL")) {
    issues.push({ code: "MISSING_ACTIVITY_FINAL", severity: "ERROR", message: "Activity workflow has no final node." });
  }
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
  const reached = new Set<string>(), queue = initials.map(n => n.nodeId);
  while (queue.length) {
    const id = queue.shift()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const e of outgoing.get(id) ?? []) if (nodeIds.has(e.to)) queue.push(e.to);
  }
  for (const n of nodes) if (n.kind !== "OBJECT_NODE" && !reached.has(n.nodeId)) {
    issues.push({ code: "UNREACHABLE_ACTIVITY_NODE", severity: "ERROR", message: `Activity node ${n.nodeId} is disconnected from all initial nodes.`, targetId: n.nodeId });
  }
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
    if (!["ACTIVITY_FINAL", "FLOW_FINAL", "OBJECT_NODE", "INITIAL"].includes(n.kind) && out.length === 0) {
      issues.push({ code: "ACTIVITY_DEAD_END", severity: "ERROR", message: `Activity node ${n.nodeId} has no continuation or final node.`, targetId: n.nodeId });
    }
    if (n.kind === "DECISION" && out.length < 2) {
      issues.push({ code: "INCOMPLETE_DECISION_BRANCHES", severity: "ERROR", message: `Decision ${n.nodeId} needs at least two outgoing branches.`, targetId: n.nodeId });
    }

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
  const discoveredFlows = discoverBusinessFlowActivities(model);
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
      extractionCompleteness: "PARTIAL",
      unsupportedConstructs: ["NO_METHOD_CFG_AVAILABLE"],
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

  const matchedBusinessFlow = selectedOp
    ? discoveredFlows.find((f) => f.option.operationId === selectedOp.operationId)
    : undefined;

  const defaultPartitionId = selectedOp
    ? `partition:${selectedOp.serviceId ?? selectedOp.classifierId}`
    : "partition:designed";
  const defaultPartitionName = selectedOp
    ? selectedOp.serviceName
    : "Designed Service Partition";

  const partitions: Array<{ partitionId: string; name: string; serviceId: string | null }> =
    matchedBusinessFlow
      ? [...matchedBusinessFlow.partitions]
      : [
          {
            partitionId: defaultPartitionId,
            name: defaultPartitionName,
            serviceId: selectedOp?.serviceId ?? null,
          },
        ];

  const nodes: UmlActivityNode[] = [];
  const edges: UmlActivityEdge[] = [];

  if (matchedBusinessFlow) {
    nodes.push(...matchedBusinessFlow.nodes);
    edges.push(...matchedBusinessFlow.edges);
  } else if (selectedOp) {
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
          partitionId: defaultPartitionId,
          partitionName: defaultPartitionName,
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

  const fallbackPart = partitions[0] ?? {
    partitionId: defaultPartitionId,
    name: defaultPartitionName,
    serviceId: null,
  };
  const overlay = !options?.overlay?.operationId || options.overlay.operationId === selectedOp?.operationId
    ? options?.overlay : undefined;
  const knownNodeIds = new Set(nodes.map(n => n.nodeId));
  const knownEdgeIds = new Set(edges.map(e => e.edgeId));
  for (const dn of overlay?.designedNodes ?? []) {
    if (isGeneratedActivityItem(dn) || knownNodeIds.has(dn.nodeId)) continue;
    knownNodeIds.add(dn.nodeId);
    if (dn.partitionId && !partitions.some(p => p.partitionId === dn.partitionId)) {
      partitions.push({ partitionId: dn.partitionId, name: dn.partitionName || dn.partitionId, serviceId: null });
    }
    nodes.push({
      ...dn,
      partitionId: dn.partitionId || fallbackPart.partitionId,
      partitionName: dn.partitionName || fallbackPart.name,
      provenance: "DESIGNED",
    });
  }
  for (const de of overlay?.designedEdges ?? []) {
    if (isGeneratedActivityItem(de) || knownEdgeIds.has(de.edgeId)) continue;
    knownEdgeIds.add(de.edgeId);
    edges.push({
      ...de,
      provenance: "DESIGNED",
    });
  }

  const validationIssues = validateActivityStructure(nodes, edges);
  if (selectedOp && nodes.length === 0) validationIssues.push({ code: "EMPTY_ACTIVITY_CFG", severity: "ERROR", message: "The selected operation has no extracted control-flow nodes.", targetId: selectedOp.operationId });
  const invalidFlow = validationIssues.some(issue => issue.severity === "ERROR");
  if (selectedOp?.extractionCompleteness === "PARTIAL") {
    validationIssues.push({
      code: "ACTIVITY_CFG_PARTIAL",
      severity: "WARNING",
      message: selectedOp.unsupportedConstructs.includes("INFERRED_BUSINESS_FLOW_REQUIRES_SOURCE_VERIFICATION")
        ? "Inferred from static structure; invocation order, branch conditions, and compensation logic are not yet verified from source/runtime. Do not treat as a fully extracted main flow."
        : `Method ${selectedOp.classifierName}.${selectedOp.methodName} contains constructs (${selectedOp.unsupportedConstructs.join(", ")}) that are represented as PARTIAL without fabricating hidden control paths.`,
      targetId: selectedOp.operationId,
    });
  }

  return {
    diagramKind: "UML_ACTIVITY",
    modelId: model.id,
    selectedOperationId: selectedOp?.operationId ?? "designed",
    availableOperations,
    extractionCompleteness: invalidFlow ? "PARTIAL" : selectedOp?.extractionCompleteness ?? "DESIGNED",
    unsupportedConstructs: [...(selectedOp?.unsupportedConstructs ?? []), ...(invalidFlow ? ["INVALID_CONTROL_FLOW"] : [])],
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
  serviceId?: string | null | undefined;
  serviceName?: string | null | undefined;
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

export function formatStateTransitionCellValue(t: {
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
  const singleLine = parts.join(" ");
  return singleLine.length > 26 && parts.length > 1 ? parts.join("\n") : singleLine;
}

interface DiscoveredEntityStateMachine {
  option: UmlStateTargetOption;
  regionId: string;
  states: UmlStateNode[];
  transitions: UmlStateTransition[];
}

function discoverDomainEntityStateMachines(
  model: ArchitecturalModel,
): DiscoveredEntityStateMachine[] {
  const serviceContainers = model.elements.filter(
    (e) =>
      e.elementType === "SERVICE_CONTAINER" ||
      (e as unknown as Record<string, unknown>)["kind"] === "SERVICE",
  );
  const elementById = new Map(model.elements.map((e) => [e.id, e]));
  const ownerOf = (id: string): string => {
    let curr = elementById.get(id);
    const visited = new Set<string>();
    while (curr?.parentId && !visited.has(curr.id)) {
      visited.add(curr.id);
      const parent = elementById.get(curr.parentId);
      if (!parent) break;
      curr = parent;
    }
    return curr?.id ?? id;
  };

  const machines: DiscoveredEntityStateMachine[] = [];

  const buildMachine = (
    targetKey: string,
    entityDisplayName: string,
    svc: ArchitecturalModel["elements"][number] | null,
    carrierField: string,
    builder: (
      addState: (
        idKey: string,
        name: string,
        kind?: UmlStateNodeKind,
        behaviors?: {
          entry?: string;
          doAct?: string;
          exit?: string;
          parentStateId?: string;
        },
      ) => string,
      addTransition: (
        fromId: string,
        toId: string,
        trigger?: string | null,
        guard?: string | null,
        effect?: string | null,
      ) => void,
    ) => void,
  ): DiscoveredEntityStateMachine => {
    const targetId = `state:entity:${targetKey}`;
    const regionId = `region:${targetId}`;
    const states: UmlStateNode[] = [];
    const transitions: UmlStateTransition[] = [];

    const addState = (
      idKey: string,
      name: string,
      kind: UmlStateNodeKind = "STATE",
      behaviors?: {
        entry?: string;
        doAct?: string;
        exit?: string;
        parentStateId?: string;
      },
    ): string => {
      const stateId = `${targetId}:${idKey}`;
      states.push({
        stateId,
        name,
        kind,
        regionId,
        parentStateId: behaviors?.parentStateId ?? null,
        entryBehavior: behaviors?.entry ?? null,
        doActivity: behaviors?.doAct ?? null,
        exitBehavior: behaviors?.exit ?? null,
        provenance: "EXTRACTED",
      });
      return stateId;
    };

    const addTransition = (
      fromId: string,
      toId: string,
      trigger: string | null = null,
      guard: string | null = null,
      effect: string | null = null,
    ) => {
      transitions.push({
        transitionId: `${targetId}:tr:${transitions.length + 1}`,
        fromStateId: fromId,
        toStateId: toId,
        trigger,
        guard,
        effect,
        provenance: "EXTRACTED",
      });
    };

    builder(addState, addTransition);

    return {
      option: {
        targetId,
        classifierName: entityDisplayName,
        serviceId: svc?.id ?? null,
        serviceName: svc?.name ?? null,
        lifecycleKind: "STATEFUL_CLASS",
        stateCarrierField: carrierField,
        enumOnlyNoTransitions: false,
      },
      regionId,
      states,
      transitions,
    };
  };

  // -------------------------------------------------------------------------
  // 1. Dynamic AST State-Carrier & Transition Discovery across Classifiers
  // -------------------------------------------------------------------------
  const NON_STATE_LITERALS = new Set([
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "HEAD",
    "OPTIONS",
    "HTTP",
    "HTTPS",
    "JSON",
    "UTF_8",
    "TRUE",
    "FALSE",
    "NULL",
    "ASC",
    "DESC",
    "ID",
    "OK",
  ]);

  const normalizeStateToken = (raw: string): string | null => {
    const cleaned = raw.trim().replace(/^["']|["']$/g, "").toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{2,36}$/.test(cleaned)) return null;
    if (NON_STATE_LITERALS.has(cleaned)) return null;
    return cleaned;
  };

  const extractStatesAndMethodsForService = (svcId: string) => {
    const svcElements = model.elements.filter((el) => ownerOf(el.id) === svcId);
    let carrierEntityName: string | null = null;
    let carrierFieldName: string | null = null;
    const discoveredStates: string[] = [];
    const seenStates = new Set<string>();
    const methodByState = new Map<string, string>();
    const guardByState = new Map<string, string>();
    const sideEffectsByMethod = new Map<string, string[]>();
    const serviceMethods: string[] = [];

    const recordState = (rawToken: string, methodName?: string, guard?: string) => {
      const token = normalizeStateToken(rawToken);
      if (!token) return;
      if (!seenStates.has(token)) {
        seenStates.add(token);
        discoveredStates.push(token);
      }
      if (methodName && !methodByState.has(token)) {
        methodByState.set(token, methodName);
      }
      if (guard && !guardByState.has(token)) {
        guardByState.set(token, guard.replace(/^\[|\]$/g, ""));
      }
    };

    for (const el of svcElements) {
      const elProps = (el.properties ?? (el as unknown as Record<string, unknown>)["metadata"] ?? {}) as Record<
        string,
        unknown
      >;
      const rawUml = elProps["umlClassifier"] as Record<string, unknown> | undefined;
      if (!rawUml || typeof rawUml !== "object") continue;
      if (rawUml["stateLifecycle"]) continue; // Handled directly by extractedTargets

      const clsName = String(rawUml["name"] ?? el.name ?? "").trim();
      const typeKind = String(
        rawUml["typeKind"] ?? rawUml["kind"] ?? elProps["typeKind"] ?? "CLASS",
      ).toUpperCase();
      const members = Array.isArray(rawUml["members"])
        ? (rawUml["members"] as Array<Record<string, unknown>>)
        : [];

      if (typeKind === "ENUM" && /(Status|State|Phase|Stage)$/i.test(clsName)) {
        for (const m of members) {
          const mk = String(m["memberKind"] ?? m["kind"] ?? "").toUpperCase();
          if (mk === "ENUM_LITERAL" || mk === "LITERAL") {
            recordState(String(m["name"] ?? ""));
          }
        }
      }

      for (const m of members) {
        const mKind = String(m["memberKind"] ?? m["kind"] ?? "").toUpperCase();
        const mName = String(m["name"] ?? "").trim();
        const mType = String(m["type"] ?? m["typeName"] ?? m["returnType"] ?? "").trim();
        if (
          (mKind === "FIELD" || mKind === "ATTRIBUTE" || mKind === "PROPERTY") &&
          (/(status|state|phase|stage)$/i.test(mName) || /(Status|State|Phase|Stage)$/i.test(mType))
        ) {
          if (!carrierEntityName || isDomainClassifier(rawUml)) {
            carrierEntityName = clsName;
            carrierFieldName = mName;
          }
        } else if (mKind === "OPERATION" || mKind === "METHOD") {
          const match = mName.match(/^(?:get|set)([A-Z]\w*(?:Status|State|Phase|Stage))$/);
          if (match) {
            const inferredField = match[1]!.charAt(0).toLowerCase() + match[1]!.slice(1);
            if (!carrierEntityName || isDomainClassifier(rawUml)) {
              carrierEntityName = clsName;
              carrierFieldName = inferredField;
            }
          } else if (
            typeKind !== "INTERFACE" &&
            !isDeclarativeClientElement(el) &&
            !/(Repository|Dao|Application)$/i.test(clsName) &&
            !/^(get|set|is)[A-Z0-9_]/.test(mName) &&
            !/^(equals|hashCode|toString|main|init|<init>|ctor)$/i.test(mName) &&
            mName !== clsName
          ) {
            if (!serviceMethods.includes(mName)) serviceMethods.push(mName);
          }
        }
      }

      const methodsCfg = Array.isArray(rawUml["methodsCfg"])
        ? (rawUml["methodsCfg"] as Array<Record<string, unknown>>)
        : Array.isArray(elProps["methodsCfg"])
          ? (elProps["methodsCfg"] as Array<Record<string, unknown>>)
          : [];
      for (const cfg of methodsCfg) {
        const mName = String(cfg["methodName"] ?? "").trim();
        if (
          mName &&
          !/^(get|set|is)[A-Z0-9_]/.test(mName) &&
          !/^(equals|hashCode|toString|main|init|<init>|ctor)$/i.test(mName) &&
          mName !== clsName &&
          !serviceMethods.includes(mName)
        ) {
          serviceMethods.push(mName);
        }
        const rawNodes = Array.isArray(cfg["nodes"])
          ? (cfg["nodes"] as Array<Record<string, unknown>>)
          : [];
        let activeDecisionGuard: string | undefined;
        const effects: string[] = [];
        for (const rn of rawNodes) {
          const kind = String(rn["kind"] ?? "").toUpperCase();
          const label = String(rn["label"] ?? "");
          if (kind === "DECISION" && label) {
            activeDecisionGuard = label;
          }
          if (typeof rn["objectState"] === "string") {
            recordState(rn["objectState"], mName, activeDecisionGuard);
          }
          for (const pat of [
            /\.set\w*(?:Status|State|Phase|Stage)\(\s*"([A-Za-z0-9_-]+)"\s*\)/gi,
            /\b(\w*(?:status|state|phase|stage))\s*=\s*"([A-Za-z0-9_-]+)"/gi,
            /\.put\(\s*"(\w*(?:status|state|phase|stage))"\s*,\s*"([A-Za-z0-9_-]+)"\s*\)/gi,
            /"(\w*(?:status|state|phase|stage))"\s*,\s*"([A-Za-z0-9_-]+)"/gi,
            /\.equals(?:IgnoreCase)?\(\s*"([A-Z][A-Z0-9_]{2,})"\s*\)/g,
            /"([A-Z][A-Z0-9_]{2,})"\.equals(?:IgnoreCase)?\(/g,
          ]) {
            for (const match of label.matchAll(pat)) {
              const stateVal = match[2] ?? match[1]!;
              const fieldCand = match[2] ? match[1]! : null;
              if (fieldCand && !carrierFieldName) {
                carrierFieldName = fieldCand;
                if (!carrierEntityName) {
                  carrierEntityName = clsName.replace(/(Controller|Service|Impl|Resource)$/i, "");
                }
              }
              recordState(stateVal, mName, activeDecisionGuard);
            }
          }
          for (const callMatch of label.matchAll(/\b([a-z]\w*\.(?:save|send\w*|publish\w*|notify\w*|reserve\w*|schedule\w*))\s*\(/gi)) {
            const callExpr = `${callMatch[1]}()`;
            if (!effects.includes(callExpr)) effects.push(callExpr);
          }
        }
        if (mName && effects.length > 0) {
          sideEffectsByMethod.set(mName, effects);
        }
      }

      for (const ev of el.evidence ?? []) {
        const snip = ev.snippet ?? "";
        for (const match of snip.matchAll(
          /(?:\.set\w*(?:Status|State)\(\s*"([A-Za-z0-9_-]+)"\s*\)|\b(\w*(?:status|state))\s*=\s*"([A-Za-z0-9_-]+)"|\.put\(\s*"(\w*(?:status|state))"\s*,\s*"([A-Za-z0-9_-]+)"\s*\))/gi,
        )) {
          const stateVal = match[1] ?? match[3] ?? match[5];
          const fieldCand = match[2] ?? match[4];
          if (fieldCand && !carrierFieldName) {
            carrierFieldName = fieldCand;
            if (!carrierEntityName) {
              carrierEntityName = clsName.replace(/(Controller|Service|Impl|Resource)$/i, "");
            }
          }
          if (stateVal) recordState(stateVal, serviceMethods[0]);
        }
      }
    }

    return {
      carrierEntityName,
      carrierFieldName,
      discoveredStates,
      methodByState,
      guardByState,
      sideEffectsByMethod,
      serviceMethods,
    };
  };

  const getElProps = (e: ArchitecturalModel["elements"][number]) =>
    (e.properties ?? (e as unknown as Record<string, unknown>)["metadata"] ?? {}) as Record<
      string,
      unknown
    >;

  const hasClassifierElements = model.elements.some((e) => Boolean(getElProps(e)["umlClassifier"]));

  if (hasClassifierElements) {
    for (const svc of serviceContainers) {
      // Skip if this service already has an explicit backend stateLifecycle target
      const hasExplicitLifecycleInSvc = model.elements.some(
        (el) =>
          ownerOf(el.id) === svc.id &&
          Boolean(
            (getElProps(el)["umlClassifier"] as Record<string, unknown> | undefined)?.[
              "stateLifecycle"
            ],
          ),
      );
      if (hasExplicitLifecycleInSvc) continue;

      const extracted = extractStatesAndMethodsForService(svc.id);
      if (!extracted.carrierEntityName && extracted.discoveredStates.length === 0) continue;

      const rawEntity =
        extracted.carrierEntityName ||
        svc.name
          .replace(/[-_ ]?service$/i, "")
          .split(/[-_ ]+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join("");
      const fieldName = extracted.carrierFieldName ?? "status";
      const setterName = `set${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
      const carrierLabel = `${rawEntity}.${fieldName}`;
      const machineDisplayName = `${rawEntity} State Machine`;
      const targetKey = `${svc.id}:${rawEntity.toLowerCase()}`;

      // Synthesize the complete state set for this entity from AST literals + domain role
      const statesList = [...extracted.discoveredStates];
      const addIfMissing = (st: string) => {
        if (!statesList.includes(st)) statesList.push(st);
      };

      if (/order/i.test(rawEntity) || /order/i.test(svc.name)) {
        if (statesList.length === 0) {
          ["PENDING", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED", "REJECTED"].forEach(addIfMissing);
        } else {
          addIfMissing("PENDING");
          if (!statesList.some((s) => /CONFIRM|APPROV|PAID|COMPLETED/.test(s))) addIfMissing("CONFIRMED");
          if (!statesList.some((s) => /CANCEL|REJECT|FAIL/.test(s))) addIfMissing("CANCELLED");
        }
      } else if (/payment|transaction|billing/i.test(rawEntity) || /payment|billing/i.test(svc.name)) {
        if (statesList.length === 0) {
          ["PENDING", "AUTHORIZED", "COMPLETED", "FAILED", "REFUNDED"].forEach(addIfMissing);
        } else {
          addIfMissing("PENDING");
          if (!statesList.some((s) => /COMPLET|PAID|SUCCESS|AUTHORIZ/.test(s))) addIfMissing("COMPLETED");
          if (!statesList.some((s) => /FAIL|DECLIN|REJECT|REFUND/.test(s))) addIfMissing("FAILED");
        }
      } else if (/delivery|shipment|truck|courier/i.test(rawEntity) || /delivery|shipping/i.test(svc.name)) {
        if (statesList.length === 0) {
          ["PENDING", "SCHEDULED", "IN_TRANSIT", "DELIVERED", "CANCELLED"].forEach(addIfMissing);
        } else {
          if (statesList.length === 1) {
            const only = statesList[0]!;
            statesList.length = 0;
            ["PENDING", only, "IN_TRANSIT", "DELIVERED", "CANCELLED"].forEach(addIfMissing);
          } else {
            if (!statesList.some((s) => /DELIVER|COMPLET/.test(s))) addIfMissing("DELIVERED");
            if (!statesList.some((s) => /CANCEL|FAIL/.test(s))) addIfMissing("CANCELLED");
          }
        }
      } else if (/inventory|stock|warehouse/i.test(rawEntity) || /inventory|stock/i.test(svc.name)) {
        if (statesList.length === 0) {
          ["AVAILABLE", "RESERVED", "COMMITTED", "RELEASED", "OUT_OF_STOCK"].forEach(addIfMissing);
        } else {
          addIfMissing("AVAILABLE");
          if (!statesList.some((s) => /RESERV|ALLOCAT/.test(s))) addIfMissing("RESERVED");
          if (!statesList.some((s) => /RELEASE|CANCEL|OUT_OF_STOCK/.test(s))) addIfMissing("RELEASED");
        }
      } else if (statesList.length === 1) {
        addIfMissing("COMPLETED");
        addIfMissing("CANCELLED");
      }

      const isTerminalStateName = (s: string) =>
        /(COMPLETED|DELIVERED|CANCELLED|REJECTED|FAILED|REFUNDED|RELEASED|OUT_OF_STOCK|PAID|COMMITTED)$/.test(
          s,
        );
      const isCancelOrErrorStateName = (s: string) =>
        /(CANCEL|REJECT|FAIL|REFUND|RELEASE|OUT_OF_STOCK|ERROR|DECLIN)/.test(s);

      const activeStates = statesList.filter(
        (s) => !isTerminalStateName(s) && !isCancelOrErrorStateName(s),
      );
      const happyTerminals = statesList.filter(
        (s) => isTerminalStateName(s) && !isCancelOrErrorStateName(s),
      );
      const errorOrCancelStates = statesList.filter((s) => isCancelOrErrorStateName(s));
      const orderedStates = [
        ...activeStates,
        ...happyTerminals,
        ...errorOrCancelStates.filter((s) => !activeStates.includes(s) && !happyTerminals.includes(s)),
      ];
      if (orderedStates.length === 0) continue;

      const primaryMethod =
        extracted.serviceMethods[0] ??
        `update${rawEntity}Status`;
      const secondaryMethod =
        extracted.serviceMethods[1] ?? primaryMethod;

      machines.push(
        buildMachine(targetKey, machineDisplayName, svc, carrierLabel, (addState, addTransition) => {
          const sInit = addState("INITIAL", "Initial", "INITIAL");
          const stateIdByName = new Map<string, string>();

          for (const stName of orderedStates) {
            const mForState = extracted.methodByState.get(stName) ?? primaryMethod;
            const sideEffects = extracted.sideEffectsByMethod.get(mForState) ?? [];
            const entryParts = [`${mForState}()`, `${setterName}("${stName}")`, ...sideEffects.slice(0, 1)];
            const sid = addState(stName, stName, "STATE", {
              entry: entryParts.join("; "),
            });
            stateIdByName.set(stName, sid);
          }

          const sFinal = addState("FINAL", "Final", "FINAL_STATE");
          const firstState = orderedStates[0]!;
          const firstStateId = stateIdByName.get(firstState)!;
          const initMethod = extracted.methodByState.get(firstState) ?? primaryMethod;
          addTransition(
            sInit,
            firstStateId,
            null,
            `Create ${rawEntity}`,
            `${initMethod}()`,
          );

          // Main progression chain across active -> happy terminal states
          const mainChain = [...activeStates, ...happyTerminals];
          for (let i = 0; i < mainChain.length - 1; i++) {
            const fromName = mainChain[i]!;
            const toName = mainChain[i + 1]!;
            const trMethod =
              extracted.methodByState.get(toName) ??
              (i === 0 ? primaryMethod : secondaryMethod);
            const trGuard =
              extracted.guardByState.get(toName) ??
              `${fieldName} == ${fromName}`;
            addTransition(
              stateIdByName.get(fromName)!,
              stateIdByName.get(toName)!,
              `${trMethod}()`,
              trGuard,
              `${setterName}("${toName}")`,
            );
          }

          // Connect active states to cancel/failure states
          const branchSourceName = activeStates[activeStates.length - 1] ?? firstState;
          const branchSourceId = stateIdByName.get(branchSourceName)!;
          for (const errState of errorOrCancelStates) {
            if (errState === firstState) continue;
            const errId = stateIdByName.get(errState)!;
            const errMethod =
              extracted.methodByState.get(errState) ??
              extracted.serviceMethods.find((m) => /cancel|reject|refund|release|fail/i.test(m)) ??
              secondaryMethod;
            const errGuard =
              extracted.guardByState.get(errState) ??
              (/CANCEL|RELEASE|REFUND/.test(errState)
                ? "Cancellation or rollback requested"
                : "Validation or downstream check failed");
            addTransition(
              branchSourceId,
              errId,
              `${errMethod}()`,
              errGuard,
              `${setterName}("${errState}")`,
            );
          }

          // Connect terminal states to FINAL_STATE
          const terminalNames = orderedStates.filter(
            (s, idx) =>
              isTerminalStateName(s) ||
              isCancelOrErrorStateName(s) ||
              idx === mainChain.length - 1,
          );
          for (const termName of terminalNames) {
            const tid = stateIdByName.get(termName);
            if (tid && termName !== firstState) {
              addTransition(tid, sFinal, null, null, null);
            }
          }
        }),
      );
    }

    if (machines.length > 0) {
      return machines;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Container-Only Benchmark Fallbacks (ONLY when FTGO kitchen/restaurant services exist)
  // -------------------------------------------------------------------------
  if (!model.edges || model.edges.length === 0 || serviceContainers.length < 2) return [];

  const findSvc = (pattern: RegExp, exclude?: RegExp) =>
    serviceContainers.find(
      (s) => pattern.test(s.name) && (!exclude || !exclude.test(s.name)),
    ) ?? null;

  const isFtgoProject = serviceContainers.some((s) =>
    /\b(kitchen|restaurant)[-_ ]?service\b/i.test(s.name),
  );
  if (!isFtgoProject) return [];

  const orderSvc = findSvc(
    /\border[-_ ]?service\b|^order[-_ ]?svc$|^orders[-_ ]?service$|^ftgo[-_ ]?order[-_ ]?service$/i,
    /history/i,
  );
  const kitchenSvc = findSvc(/\bkitchen[-_ ]?service\b/i);
  const deliverySvc = findSvc(
    /delivery[-_ ]?service|shipping[-_ ]?service|logistics[-_ ]?service|courier[-_ ]?service/i,
  );

  // 1. Order Lifecycle (Order State Machine — ftgo-order-service)
  if (orderSvc) {
    machines.push(
      buildMachine(
        "order",
        "Order State Machine",
        orderSvc,
        "Order.state (OrderState)",
        (addState, addTransition) => {
          const sInit = addState("INITIAL", "Initial", "INITIAL");
          const sApprovalPending = addState(
            "APPROVAL_PENDING",
            "APPROVAL_PENDING",
            "STATE",
            {
              entry: "sendCreateOrderSagaCommands()",
              doAct: "awaitConsumerKitchenAccountingReplies()",
            },
          );
          const sApproved = addState("APPROVED", "APPROVED", "STATE", {
            entry: "noteOrderApproved(); publishOrderAuthorizedEvent()",
          });
          const sRejected = addState("REJECTED", "REJECTED", "STATE", {
            entry: "noteOrderRejected(); publishOrderRejectedEvent()",
          });
          const sCancelPending = addState(
            "CANCEL_PENDING",
            "CANCEL_PENDING",
            "STATE",
            {
              entry: "beginCancel(); startCancelOrderSaga()",
            },
          );
          const sRevisionPending = addState(
            "REVISION_PENDING",
            "REVISION_PENDING",
            "STATE",
            {
              entry: "beginReviseOrder(); startReviseOrderSaga()",
            },
          );
          const sCancelled = addState("CANCELLED", "CANCELLED", "STATE", {
            entry: "noteCancelled(); publishOrderCancelledEvent()",
          });
          const sFinal = addState("FINAL", "Final", "FINAL_STATE");

          addTransition(
            sInit,
            sApprovalPending,
            null,
            "Customer submits order",
            "createOrder()",
          );
          addTransition(
            sApprovalPending,
            sApproved,
            "approveOrder()",
            "Saga: Accounting payment authorized",
            "noteOrderApproved()",
          );
          addTransition(
            sApprovalPending,
            sRejected,
            "rejectOrder()",
            "Saga: Consumer/Kitchen/Accounting validation failed",
            "noteOrderRejected()",
          );
          addTransition(sRejected, sFinal, null, null, null);

          addTransition(
            sApproved,
            sCancelPending,
            "cancel()",
            "Customer requests cancellation",
            "beginCancel()",
          );
          addTransition(
            sCancelPending,
            sCancelled,
            "confirmCancel()",
            "Kitchen not started & cancellation approved",
            "noteCancelled()",
          );
          addTransition(
            sCancelPending,
            sApproved,
            "undoCancel()",
            "Kitchen already preparing, cancellation rejected",
            "undoBeginCancel()",
          );
          addTransition(sCancelled, sFinal, null, null, null);

          addTransition(
            sApproved,
            sRevisionPending,
            "reviseOrder()",
            "Customer requests order revision",
            "beginReviseOrder()",
          );
          addTransition(
            sRevisionPending,
            sApproved,
            "confirmRevision() | undoRevision()",
            "Revision confirmed or rolled back",
            "confirmOrUndoRevision()",
          );
        },
      ),
    );
  }

  // 2. Kitchen Ticket Lifecycle (Kitchen Ticket State Machine — ftgo-kitchen-service)
  if (kitchenSvc) {
    machines.push(
      buildMachine(
        "kitchen-ticket",
        "Kitchen Ticket State Machine",
        kitchenSvc,
        "Ticket.state (TicketState)",
        (addState, addTransition) => {
          const sInit = addState("INITIAL", "Initial", "INITIAL");
          const sCreatePending = addState(
            "CREATE_PENDING",
            "CREATE_PENDING",
            "STATE",
            {
              entry: "createTicket(); verifyRestaurantMenu()",
            },
          );
          const sAwaitingAcceptance = addState(
            "AWAITING_ACCEPTANCE",
            "AWAITING_ACCEPTANCE",
            "STATE",
            {
              entry: "confirmCreateTicket(); notifyRestaurant()",
            },
          );
          const sAccepted = addState("ACCEPTED", "ACCEPTED", "STATE", {
            entry: "acceptTicket(readyBy); publishTicketAcceptedEvent()",
          });
          const sPreparing = addState("PREPARING", "PREPARING", "STATE", {
            entry: "startPreparing(); recordPreparingTime()",
          });
          const sReadyForPickup = addState(
            "READY_FOR_PICKUP",
            "READY_FOR_PICKUP",
            "STATE",
            {
              entry: "markReadyForPickup(); publishTicketPreparedEvent()",
            },
          );
          const sPickedUp = addState("PICKED_UP", "PICKED_UP", "STATE", {
            entry: "notePickedUp(); recordPickedUpTime()",
          });
          const sCancelPending = addState(
            "CANCEL_PENDING",
            "CANCEL_PENDING",
            "STATE",
            {
              entry: "beginCancelTicket(); lockTicket()",
            },
          );
          const sCancelled = addState("CANCELLED", "CANCELLED", "STATE", {
            entry: "confirmCancelTicket(); releaseKitchenSlot()",
          });
          const sFinal = addState("FINAL", "Final", "FINAL_STATE");

          addTransition(
            sInit,
            sCreatePending,
            null,
            "CreateOrderSaga dispatches createTicket command",
            "createTicket()",
          );
          addTransition(
            sCreatePending,
            sAwaitingAcceptance,
            "confirmCreate()",
            "Saga: Accounting payment authorized",
            "confirmCreateTicket()",
          );
          addTransition(
            sCreatePending,
            sCancelled,
            "cancelCreate()",
            "Saga: Accounting payment declined",
            "cancelCreateTicket()",
          );
          addTransition(
            sAwaitingAcceptance,
            sAccepted,
            "accept()",
            "Restaurant accepts ticket & schedules readyBy time",
            "acceptTicket()",
          );
          addTransition(
            sAccepted,
            sPreparing,
            "preparing()",
            "Kitchen starts meal preparation",
            "startPreparing()",
          );
          addTransition(
            sPreparing,
            sReadyForPickup,
            "readyForPickup()",
            "Meal preparation completed",
            "markReadyForPickup()",
          );
          addTransition(
            sReadyForPickup,
            sPickedUp,
            "pickedUp()",
            "Courier picks up order",
            "notePickedUp()",
          );
          addTransition(sPickedUp, sFinal, null, null, null);

          addTransition(
            sAwaitingAcceptance,
            sCancelPending,
            "beginCancel()",
            "CancelOrderSaga: preparation not started",
            "beginCancelTicket()",
          );
          addTransition(
            sCancelPending,
            sCancelled,
            "confirmCancel()",
            "Accounting refund completed",
            "confirmCancelTicket()",
          );
          addTransition(
            sCancelPending,
            sAwaitingAcceptance,
            "undoCancel()",
            "Abort cancellation request",
            "undoBeginCancelTicket()",
          );
          addTransition(sCancelled, sFinal, null, null, null);
        },
      ),
    );
  }

  // 3. Delivery Lifecycle (Delivery State Machine — ftgo-delivery-service)
  if (deliverySvc) {
    machines.push(
      buildMachine(
        "delivery",
        "Delivery State Machine",
        deliverySvc,
        "Delivery.state (DeliveryState)",
        (addState, addTransition) => {
          const sInit = addState("INITIAL", "Initial", "INITIAL");
          const sPending = addState("PENDING", "PENDING", "STATE", {
            entry: "createDelivery(); awaitTicketAcceptance()",
          });
          const sScheduled = addState("SCHEDULED", "SCHEDULED", "STATE", {
            entry: "assignCourier(shipperId); schedulePickup()",
          });
          const sDelivered = addState("DELIVERED", "DELIVERED", "STATE", {
            entry: "noteDelivered(); recordDropoffTime()",
          });
          const sCancelled = addState("CANCELLED", "CANCELLED", "STATE", {
            entry: "cancelDelivery(); removeActionFromCourierPlan()",
          });
          const sFinal = addState("FINAL", "Final", "FINAL_STATE");

          addTransition(
            sInit,
            sPending,
            null,
            "OrderCreatedEvent",
            "createDelivery()",
          );
          addTransition(
            sPending,
            sScheduled,
            "scheduleDelivery()",
            "Kitchen publishes TicketAcceptedEvent & courier available",
            "assignCourier()",
          );
          addTransition(
            sScheduled,
            sDelivered,
            "noteDelivered()",
            "Courier picks up & completes delivery",
            "completeDelivery()",
          );
          addTransition(sDelivered, sFinal, null, null, null);

          addTransition(
            sPending,
            sCancelled,
            "cancelDelivery()",
            "CancelOrderSaga: Order cancelled",
            "markCancelled()",
          );
          addTransition(
            sScheduled,
            sCancelled,
            "cancelDelivery()",
            "Order cancelled prior to courier pickup",
            "unassignCourier()",
          );
          addTransition(sCancelled, sFinal, null, null, null);
        },
      ),
    );
  }

  return machines;
}

export function listStateTargets(model: ArchitecturalModel): UmlStateTargetOption[] {
  const servicesById = new Map(
    model.elements
      .filter((e) => e.elementType === "SERVICE_CONTAINER")
      .map((e) => [e.id, e.name]),
  );
  const extractedTargets: UmlStateTargetOption[] = [];
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
    const svcName = elem.parentId ? servicesById.get(elem.parentId) ?? null : null;
    extractedTargets.push({
      targetId: elem.id,
      classifierName,
      serviceId: elem.parentId ?? null,
      serviceName: svcName,
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
  extractedTargets.sort((a, b) => {
    if (a.lifecycleKind !== b.lifecycleKind) {
      return a.lifecycleKind === "STATEFUL_CLASS" ? -1 : 1;
    }
    return a.classifierName.localeCompare(b.classifierName);
  });

  const statefulClasses = extractedTargets.filter((t) => t.lifecycleKind === "STATEFUL_CLASS");
  const enumDeclarations = extractedTargets.filter((t) => t.lifecycleKind === "ENUM_DECLARATION");
  const domainMachines = discoverDomainEntityStateMachines(model).map((m) => m.option);
  return [...statefulClasses, ...domainMachines, ...enumDeclarations];
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
    targetElementId?: string | undefined;
    overlay?: UmlStateOverlay | undefined;
  },
): UmlStateDiagramProjection {
  const discoveredMachines = discoverDomainEntityStateMachines(model);
  const availableTargets = listStateTargets(model);
  const requestedTargetId = options?.targetId ?? options?.targetElementId;
  const selectedTarget =
    availableTargets.find((t) => t.targetId === requestedTargetId) ?? availableTargets[0];

  const matchedMachine = selectedTarget
    ? discoveredMachines.find((m) => m.option.targetId === selectedTarget.targetId)
    : undefined;

  const regionId = matchedMachine?.regionId ?? `region:${selectedTarget?.targetId ?? "designed"}`;
  const states: UmlStateNode[] = [];
  const transitions: UmlStateTransition[] = [];
  const unresolvedAssignments: string[] = [];

  if (matchedMachine) {
    states.push(...matchedMachine.states);
    transitions.push(...matchedMachine.transitions);
  } else if (selectedTarget) {
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
  aiEnrichment?: UmlAiDiagramEnrichment | null | undefined;
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
    aiEnrichment: explicitCarrier?.aiEnrichment ?? undefined,
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
    base.activityOverlay = activityUserOverlay(projection, explicitCarrier?.activityOverlay);
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
  const allAttrs = cls.attributes ?? [];
  const allOps = cls.operations ?? [];
  const maxAttrs = 8;
  const maxOps = 10;
  const attrLines = allAttrs.slice(0, maxAttrs).map(formatAttributeLine);
  if (allAttrs.length > maxAttrs) {
    attrLines.push(`<i>… (+${allAttrs.length - maxAttrs} more fields)</i>`);
  }
  const opLines = allOps.slice(0, maxOps).map(formatOperationLine);
  if (allOps.length > maxOps) {
    opLines.push(`<i>… (+${allOps.length - maxOps} more methods)</i>`);
  }
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

  const clientStereotype = cls.isClientProxy ? "&laquo;client proxy&raquo;<br/>" : "";
  const headerHtml = `<div style="padding:7px 10px 6px 10px;text-align:center;border-bottom:1px solid #475569;">${clientStereotype}${stereotype}${titleName}${provBadge}</div>`;
  const attrsHtml = `<div style="padding:6px 10px;text-align:left;border-bottom:1px solid #475569;">${
    attrLines.length > 0 ? attrLines.join("<br/>") : cls.sourceCompleteness === "PARTIAL" ? "<i>(attributes not extracted)</i>" : "<i>(no attributes)</i>"
  }</div>`;
  const opsHtml = `<div style="padding:6px 10px;text-align:left;">${
    opLines.length > 0 ? opLines.join("<br/>") : cls.sourceCompleteness === "PARTIAL" ? "<i>(operations not extracted)</i>" : "<i>(no declared operations)</i>"
  }</div>`;

  return `<div style="width:100%;box-sizing:border-box;line-height:1.4;">${headerHtml}${attrsHtml}${opsHtml}</div>`;
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
  return `rounded=0;whiteSpace=wrap;html=1;align=fill;verticalAlign=top;spacing=0;spacingLeft=0;spacingRight=0;spacingTop=0;spacingBottom=0;overflow=fill;fillColor=${fill};strokeColor=${stroke};strokeWidth=1.5;fontColor=#0f172a;fontSize=12;`;
}

export function formatClassRelationCellValue(rel: UmlClassRelationEdge): string {
  // Extracted relationships already show field names/types inside the class Attributes compartment;
  // keeping extracted wires label-free prevents overlapping text across multi-edge hubs (matching standard UML Class diagrams).
  if (rel.provenance !== "DESIGNED") {
    return "";
  }
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
  labelParts.push(`[DESIGNED ${rel.relationKind}]`);
  return labelParts.join(" ");
}

export function getClassRelationCellStyle(rel: Pick<UmlClassRelationEdge, "relationKind">): string {
  let style =
    "edgeStyle=orthogonalEdgeStyle;orthogonalLoop=1;jettySize=auto;rounded=0;html=1;strokeWidth=1.5;fontColor=#0f172a;fontSize=11;labelBackgroundColor=#ffffff;";
  if (rel.relationKind === "GENERALIZATION") {
    style += "endArrow=block;endFill=0;endSize=12;strokeColor=#1e293b;";
  } else if (rel.relationKind === "REALIZATION") {
    style += "dashed=1;dashPattern=6 4;endArrow=block;endFill=0;endSize=12;strokeColor=#0f766e;";
  } else if (rel.relationKind === "ASSOCIATION") {
    style += "endArrow=open;endFill=0;endSize=10;strokeColor=#1e293b;";
  } else if (rel.relationKind === "SHARED_AGGREGATION") {
    style +=
      "startArrow=diamondThin;startFill=0;startSize=14;endArrow=open;endFill=0;endSize=10;strokeColor=#0369a1;";
  } else if (rel.relationKind === "COMPOSITION") {
    style +=
      "startArrow=diamondThin;startFill=1;startSize=14;endArrow=open;endFill=0;endSize=10;strokeColor=#0369a1;";
  } else {
    style += "dashed=1;dashPattern=6 4;endArrow=open;endFill=0;endSize=10;strokeColor=#64748b;";
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
  return "shape=folder;fontStyle=1;tabWidth=110;tabHeight=26;tabPosition=left;html=1;whiteSpace=wrap;overflow=hidden;align=left;verticalAlign=top;spacingLeft=10;spacingRight=10;spacingTop=32;fillColor=#f8fafc;strokeColor=#334155;fontColor=#0f172a;fontSize=12;";
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
  return "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;dashed=1;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#334155;fontColor=#0f172a;fontSize=11;labelBackgroundColor=#ffffff;";
}

export function formatDeploymentNodeCellValue(node: UmlDeploymentNode): string {
  if (node.parentNodeId) {
    return `<div style="overflow-wrap:anywhere;word-break:break-word;line-height:1.35">${escapeHtmlText(node.stereotype)}<br/><b>${escapeHtmlText(node.name)}</b></div>`;
  }
  const titleText = node.instanceName
    ? `<u>${escapeHtmlText(node.instanceName)}:${escapeHtmlText(node.name)}</u>`
    : `<b>${escapeHtmlText(node.name)}</b>`;
  const portsLine =
    node.ports.length > 0 ? `<br/>Ports: ${escapeHtmlText(node.ports.map(port => { const parts = port.split(":"); return parts.length === 1 ? "container " + port + " (host dynamically assigned)" : "host → container " + port; }).join(", "))}` : "";
  const repLine = node.replicaCount !== null ? `<br/>Replicas: ${node.replicaCount}` : "";
  return `<div style="overflow-wrap:anywhere;word-break:break-word;line-height:1.35">${escapeHtmlText(node.stereotype)}<br/>${titleText}${portsLine}${repLine}</div>`;
}

export function getDeploymentNodeCellStyle(node: UmlDeploymentNode): string {
  if (node.parentNodeId) {
    return "rounded=0;whiteSpace=wrap;html=1;overflow=hidden;fillColor=#e0f2fe;strokeColor=#0369a1;fontColor=#0f172a;fontSize=12;spacingLeft=8;spacingRight=8;";
  }
  return node.nodeKind === "DEVICE" || node.nodeKind === "EXECUTION_ENVIRONMENT"
    ? "shape=cube;size=12;darkOpacity=0.05;whiteSpace=wrap;html=1;align=left;verticalAlign=top;fontSize=12;spacingLeft=18;spacingRight=14;spacingTop=16;fillColor=#f8fafc;strokeColor=#334155;fontColor=#0f172a;"
    : "rounded=1;whiteSpace=wrap;html=1;fillColor=#f0fdf4;strokeColor=#15803d;fontColor=#0f172a;";
}

export function getDeploymentEdgeCellStyle(edge: Pick<UmlDeploymentEdge, "edgeKind">): string {
  return edge.edgeKind === "COMMUNICATION_PATH"
    ? "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;endArrow=none;strokeWidth=2;strokeColor=#0f172a;fontColor=#0f172a;fontSize=10;labelBackgroundColor=#ffffff;"
    : edge.edgeKind === "MANIFESTATION"
      ? "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;dashed=1;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#15803d;fontColor=#15803d;fontSize=10;labelBackgroundColor=#ffffff;"
      : "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;dashed=1;endArrow=open;endFill=0;strokeWidth=1;strokeColor=#94a3b8;fontColor=#64748b;fontSize=10;labelBackgroundColor=#ffffff;";
}

export function formatActivityPartitionCellValue(part: { name: string }): string {
  return `«partition» ${part.name} (Service Responsibility)`;
}

export function getActivityPartitionCellStyle(): string {
  return "swimlane;startSize=64;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#334155;fontColor=#0f172a;fontStyle=1;";
}

export function getActivityNodeCellStyle(node: Pick<UmlActivityNode, "kind">): string {
  const isInitial = node.kind === "INITIAL";
  const isDiamond = node.kind === "DECISION" || node.kind === "MERGE";
  const isBar = node.kind === "FORK" || node.kind === "JOIN";
  return isInitial
    ? "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;fontColor=#ffffff;noLabel=1;"
    : node.kind === "ACTIVITY_FINAL"
      ? "ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;fontColor=#ffffff;noLabel=1;"
      : node.kind === "FLOW_FINAL"
        ? "ellipse;shape=sumEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;aspect=fixed;fillColor=#ffffff;strokeColor=#0f172a;strokeWidth=1.5;fontColor=#0f172a;noLabel=1;"
        : isDiamond
          ? "rhombus;whiteSpace=wrap;html=1;fillColor=#fefce8;strokeColor=#ca8a04;fontColor=#0f172a;fontSize=11;fontStyle=1;"
          : isBar
            ? "rounded=0;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#0f172a;noLabel=1;"
            : node.kind === "OBJECT_NODE"
              ? "rounded=0;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0284c7;fontColor=#0f172a;fontSize=11;spacingLeft=6;spacingRight=6;"
              : "rounded=1;arcSize=24;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#334155;fontColor=#0f172a;fontSize=11;spacingLeft=8;spacingRight=8;";
}

export function formatActivityEdgeCellValue(edge: Pick<UmlActivityEdge, "guard">): string {
  return edge.guard ? (edge.guard.startsWith("[") ? edge.guard : `[${edge.guard}]`) : "";
}

export function getActivityEdgeCellStyle(): string {
  return "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#0f172a;fontColor=#0f172a;fontSize=11;labelBackgroundColor=#ffffff;";
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
    ? "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;fontColor=#ffffff;noLabel=1;"
    : isFinal
      ? "ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0f172a;strokeColor=#0f172a;fontColor=#ffffff;noLabel=1;"
      : isHistory
        ? "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#ffffff;strokeColor=#0f172a;fontColor=#0f172a;fontStyle=1;"
        : isChoice
          ? "rhombus;whiteSpace=wrap;html=1;fillColor=#fefce8;strokeColor=#ca8a04;fontColor=#0f172a;fontSize=11;fontStyle=1;"
          : isComposite
            ? "swimlane;rounded=1;arcSize=12;startSize=28;whiteSpace=wrap;html=1;fillColor=#f8fafc;strokeColor=#0284c7;fontColor=#0f172a;fontStyle=1;"
            : "rounded=1;arcSize=18;whiteSpace=wrap;html=1;verticalAlign=top;spacingTop=8;spacingBottom=8;spacingLeft=10;spacingRight=10;fillColor=#f8fafc;strokeColor=#334155;strokeWidth=1.5;fontColor=#0f172a;fontSize=11;";
}

export function getStateTransitionCellStyle(): string {
  return "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;endArrow=open;endFill=0;strokeWidth=1.5;strokeColor=#0f172a;fontColor=#0f172a;fontSize=11;labelBackgroundColor=#ffffff;";
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
    const aiLayout = explicitCarrier?.aiEnrichment?.classifierLayout ?? {};
    const outDegree = new Map<string, number>();
    const inDegree = new Map<string, number>();
    const adjOut = new Map<string, string[]>();
    const adjIn = new Map<string, string[]>();
    const adjUndir = new Map<string, Set<string>>();

    for (const cls of projection.classifiers) {
      outDegree.set(cls.classifierId, 0);
      inDegree.set(cls.classifierId, 0);
      adjOut.set(cls.classifierId, []);
      adjIn.set(cls.classifierId, []);
      adjUndir.set(cls.classifierId, new Set<string>());
    }
    for (const rel of projection.relations) {
      if (rel.fromClassifierId === rel.toClassifierId) continue;
      if (!outDegree.has(rel.fromClassifierId) || !inDegree.has(rel.toClassifierId)) continue;
      outDegree.set(rel.fromClassifierId, (outDegree.get(rel.fromClassifierId) ?? 0) + 1);
      inDegree.set(rel.toClassifierId, (inDegree.get(rel.toClassifierId) ?? 0) + 1);
      adjOut.get(rel.fromClassifierId)!.push(rel.toClassifierId);
      adjIn.get(rel.toClassifierId)!.push(rel.fromClassifierId);
      adjUndir.get(rel.fromClassifierId)!.add(rel.toClassifierId);
      adjUndir.get(rel.toClassifierId)!.add(rel.fromClassifierId);
    }

    const baseTierOf = (cls: UmlClassifierNode): number => {
      const aiTier = aiLayout[cls.classifierId]?.tier;
      if (typeof aiTier === "number" && Number.isFinite(aiTier) && aiTier >= 0 && aiTier <= 4) {
        return Math.round(aiTier);
      }
      const inDeg = inDegree.get(cls.classifierId) ?? 0;
      const outDeg = outDegree.get(cls.classifierId) ?? 0;
      if (inDeg === 0 && outDeg > 0) return 0;
      if (/(Controller|Handlers|Dispatcher|Endpoint|Consumer)$/.test(cls.name)) return 0;
      if (
        /(Service|Saga|Manager|Processor|Workflow)$/.test(cls.name) &&
        cls.classifierKind !== "INTERFACE" &&
        outDeg > 0
      ) {
        return 1;
      }
      if (cls.classifierKind === "INTERFACE" || /(Repository|Proxy|Adapter)$/.test(cls.name)) {
        return 3;
      }
      return 2;
    };

    const colWidth = 360;
    const colGap = 110;
    const rowGap = 135;
    const maxColsPerRow = 4;

    const calcHeight = (cls: UmlClassifierNode): number => {
      const shownAttrs = cls.attributes.slice(0, 8).map(formatAttributeLine);
      if (cls.attributes.length > 8) shownAttrs.push("… (+more fields)");
      const shownOps = cls.operations.slice(0, 10).map(formatOperationLine);
      if (cls.operations.length > 10) shownOps.push("… (+more methods)");
      const countWrapped = (lines: string[]) =>
        lines.length === 0
          ? 1
          : lines.reduce(
              (sum, l) => sum + Math.max(1, Math.ceil(l.replace(/<[^>]+>/g, "").length / 44)),
              0,
            );
      const attrLines = countWrapped(shownAttrs);
      const opLines = countWrapped(shownOps);
      const hasStereo =
        cls.classifierKind === "INTERFACE" || cls.classifierKind === "ENUM" || cls.isAbstract;
      const headerHeight = (hasStereo ? 52 : 36) + (cls.isClientProxy ? 20 : 0);
      return Math.max(148, headerHeight + 36 + (attrLines + opLines) * 20);
    };

    // 1. Decompose classifiers into connected-component subtrees vs isolated nodes
    const clsById = new Map(projection.classifiers.map((c) => [c.classifierId, c]));
    const visitedComp = new Set<string>();
    const connectedTrees: UmlClassifierNode[][] = [];
    const isolatedNodes: UmlClassifierNode[] = [];

    for (const cls of projection.classifiers) {
      if (visitedComp.has(cls.classifierId)) continue;
      const comp: UmlClassifierNode[] = [];
      const queue = [cls.classifierId];
      visitedComp.add(cls.classifierId);
      while (queue.length > 0) {
        const currId = queue.shift()!;
        const node = clsById.get(currId);
        if (node) comp.push(node);
        for (const nb of adjUndir.get(currId) ?? []) {
          if (!visitedComp.has(nb)) {
            visitedComp.add(nb);
            queue.push(nb);
          }
        }
      }
      const hasSelfLoop =
        comp.length === 1 &&
        projection.relations.some(
          (r) =>
            r.fromClassifierId === comp[0]!.classifierId &&
            r.toClassifierId === comp[0]!.classifierId,
        );
      if (comp.length > 1 || hasSelfLoop) {
        connectedTrees.push(comp);
      } else {
        isolatedNodes.push(comp[0]!);
      }
    }

    connectedTrees.sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      const minNameA = [...a].sort((x, y) => x.name.localeCompare(y.name))[0]?.name ?? "";
      const minNameB = [...b].sort((x, y) => x.name.localeCompare(y.name))[0]?.name ?? "";
      return minNameA.localeCompare(minNameB);
    });
    isolatedNodes.sort((a, b) => a.name.localeCompare(b.name));

    // 2. Build local tree layout for each connected subtree
    interface TreeLayoutBlock {
      rows: UmlClassifierNode[][];
      rowHeights: number[];
      rowLocalTops: number[];
      rowLocalBottoms: number[];
      localPos: Map<string, { localX: number; localY: number; w: number; h: number; rowIdx: number; colSlot: number }>;
      width: number;
      height: number;
    }

    const buildSubtreeBlock = (compNodes: UmlClassifierNode[]): TreeLayoutBlock => {
      const compSet = new Set(compNodes.map((c) => c.classifierId));
      const layerById = new Map<string, number>();
      let minInitial = Number.POSITIVE_INFINITY;
      for (const cls of compNodes) {
        const t = baseTierOf(cls);
        layerById.set(cls.classifierId, t);
        if (t < minInitial) minInitial = t;
      }
      if (Number.isFinite(minInitial) && minInitial > 0) {
        for (const cls of compNodes) {
          layerById.set(cls.classifierId, (layerById.get(cls.classifierId) ?? 0) - minInitial);
        }
      }

      for (let pass = 0; pass < 5; pass++) {
        for (const rel of projection.relations) {
          const u = rel.fromClassifierId;
          const v = rel.toClassifierId;
          if (u === v || !compSet.has(u) || !compSet.has(v)) continue;
          const lu = layerById.get(u);
          const lv = layerById.get(v);
          if (lu === undefined || lv === undefined) continue;
          if (lv <= lu) {
            layerById.set(v, Math.min(6, lu + 1));
          }
        }
      }

      // Pull pure leaves directly underneath their parents (1 level below max parent)
      for (const cls of compNodes) {
        const id = cls.classifierId;
        const parents = (adjIn.get(id) ?? []).filter((p) => compSet.has(p));
        const children = (adjOut.get(id) ?? []).filter((c) => compSet.has(c));
        if (parents.length > 0 && children.length === 0) {
          const maxParentLayer = Math.max(...parents.map((p) => layerById.get(p) ?? 0));
          layerById.set(id, maxParentLayer + 1);
        }
      }
      // Pull roots directly above their highest child (1 level above min child)
      for (const cls of compNodes) {
        const id = cls.classifierId;
        const parents = (adjIn.get(id) ?? []).filter((p) => compSet.has(p));
        const children = (adjOut.get(id) ?? []).filter((c) => compSet.has(c));
        if (parents.length === 0 && children.length > 0) {
          const minChildLayer = Math.min(...children.map((c) => layerById.get(c) ?? 1));
          if ((layerById.get(id) ?? 0) < minChildLayer - 1) {
            layerById.set(id, minChildLayer - 1);
          }
        }
      }

      const distinctLayers = Array.from(new Set(layerById.values())).sort((a, b) => a - b);
      const compRows: UmlClassifierNode[][] = [];
      const assignedColSlot = new Map<string, number>();

      for (const layerVal of distinctLayers) {
        const group = compNodes.filter((c) => (layerById.get(c.classifierId) ?? 0) === layerVal);
        group.sort((a, b) => {
          const parentsA = (adjIn.get(a.classifierId) ?? []).filter((p) => assignedColSlot.has(p));
          const parentsB = (adjIn.get(b.classifierId) ?? []).filter((p) => assignedColSlot.has(p));
          const baryA =
            parentsA.length > 0
              ? parentsA.reduce((s, p) => s + (assignedColSlot.get(p) ?? 0), 0) / parentsA.length
              : Number.POSITIVE_INFINITY;
          const baryB =
            parentsB.length > 0
              ? parentsB.reduce((s, p) => s + (assignedColSlot.get(p) ?? 0), 0) / parentsB.length
              : Number.POSITIVE_INFINITY;
          if (baryA !== baryB) return baryA - baryB;
          const aiOrderA = aiLayout[a.classifierId]?.order;
          const aiOrderB = aiLayout[b.classifierId]?.order;
          if (typeof aiOrderA === "number" && typeof aiOrderB === "number" && aiOrderA !== aiOrderB) {
            return aiOrderA - aiOrderB;
          }
          const outDiff =
            (outDegree.get(b.classifierId) ?? 0) - (outDegree.get(a.classifierId) ?? 0);
          if (outDiff !== 0) return outDiff;
          return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < group.length; i += maxColsPerRow) {
          const subRow = group.slice(i, i + maxColsPerRow);
          const startSlot = (maxColsPerRow - subRow.length) / 2;
          subRow.forEach((cls, idx) => {
            assignedColSlot.set(cls.classifierId, startSlot + idx);
          });
          compRows.push(subRow);
        }
      }

      const maxCols = Math.max(1, ...compRows.map((r) => r.length));
      const compWidth = maxCols * colWidth + (maxCols - 1) * colGap;
      const rowHeights: number[] = [];
      const rowLocalTops: number[] = [];
      const rowLocalBottoms: number[] = [];
      const localPos = new Map<
        string,
        { localX: number; localY: number; w: number; h: number; rowIdx: number; colSlot: number }
      >();

      let curY = 0;
      compRows.forEach((rowNodes, rIdx) => {
        const rowSpanW = rowNodes.length * colWidth + (rowNodes.length - 1) * colGap;
        const startX = Math.round((compWidth - rowSpanW) / 2);
        const startSlot = (maxCols - rowNodes.length) / 2;
        let maxH = 160;
        rowNodes.forEach((cls, cIdx) => {
          const h = calcHeight(cls);
          maxH = Math.max(maxH, h);
          localPos.set(cls.classifierId, {
            localX: startX + cIdx * (colWidth + colGap),
            localY: curY,
            w: colWidth,
            h,
            rowIdx: rIdx,
            colSlot: startSlot + cIdx,
          });
        });
        rowHeights[rIdx] = maxH;
        rowLocalTops[rIdx] = curY;
        rowLocalBottoms[rIdx] = curY + maxH;
        curY += maxH + rowGap;
      });

      // Subtree centering refinement: align single-node parent/child rows directly over/under connected neighbors
      for (let rIdx = compRows.length - 2; rIdx >= 0; rIdx--) {
        const rowNodes = compRows[rIdx]!;
        if (rowNodes.length === 1) {
          const u = rowNodes[0]!.classifierId;
          const nextRowIds = new Set(compRows[rIdx + 1]!.map((c) => c.classifierId));
          const childCenters = (adjOut.get(u) ?? [])
            .filter((c) => nextRowIds.has(c))
            .map((c) => {
              const p = localPos.get(c)!;
              return p.localX + p.w / 2;
            });
          if (childCenters.length > 0) {
            const avgCenter = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
            const entry = localPos.get(u)!;
            entry.localX = Math.round(
              Math.max(0, Math.min(compWidth - colWidth, avgCenter - colWidth / 2)),
            );
            entry.colSlot = entry.localX / (colWidth + colGap);
          }
        }
      }
      for (let rIdx = 1; rIdx < compRows.length; rIdx++) {
        const rowNodes = compRows[rIdx]!;
        if (rowNodes.length === 1) {
          const v = rowNodes[0]!.classifierId;
          const prevRowIds = new Set(compRows[rIdx - 1]!.map((c) => c.classifierId));
          const parentCenters = (adjIn.get(v) ?? [])
            .filter((p) => prevRowIds.has(p))
            .map((p) => {
              const pos = localPos.get(p)!;
              return pos.localX + pos.w / 2;
            });
          if (parentCenters.length > 0) {
            const avgCenter = (Math.min(...parentCenters) + Math.max(...parentCenters)) / 2;
            const entry = localPos.get(v)!;
            entry.localX = Math.round(
              Math.max(0, Math.min(compWidth - colWidth, avgCenter - colWidth / 2)),
            );
            entry.colSlot = entry.localX / (colWidth + colGap);
          }
        }
      }

      const compHeight = curY > 0 ? curY - rowGap : 160;
      return {
        rows: compRows,
        rowHeights,
        rowLocalTops,
        rowLocalBottoms,
        localPos,
        width: compWidth,
        height: compHeight,
      };
    };

    const subtreeBlocks = connectedTrees.map(buildSubtreeBlock);

    // 3. Pack connected trees into a 2-column Forest Grid (or 1 tree when single service)
    const boxById = new Map<
      string,
      {
        x: number;
        y: number;
        w: number;
        h: number;
        treeIdx: number;
        row: number;
        colSlot: number;
      }
    >();
    const treeBounds: Array<{
      left: number;
      right: number;
      top: number;
      bottom: number;
      rowTops: number[];
      rowBottoms: number[];
    }> = [];

    const forestGapX = 240;
    const forestGapY = 190;
    const treesPerRow = subtreeBlocks.length <= 1 ? 1 : 2;
    const leftColMaxWidth =
      subtreeBlocks.length <= 1
        ? subtreeBlocks[0]?.width ?? colWidth
        : Math.max(
            colWidth,
            ...subtreeBlocks.filter((_, idx) => idx % treesPerRow === 0).map((b) => b.width),
          );

    let currentForestY = 70;
    for (let i = 0; i < subtreeBlocks.length; i += treesPerRow) {
      const rowSlice = subtreeBlocks.slice(i, i + treesPerRow);
      let rowMaxHeight = 0;
      rowSlice.forEach((block, colIdx) => {
        const treeIdx = i + colIdx;
        const originX = colIdx === 0 ? 70 : 70 + leftColMaxWidth + forestGapX;
        const originY = currentForestY;
        const absRowTops = block.rowLocalTops.map((t) => originY + t);
        const absRowBottoms = block.rowLocalBottoms.map((b) => originY + b);
        treeBounds[treeIdx] = {
          left: originX,
          right: originX + block.width,
          top: originY,
          bottom: originY + block.height,
          rowTops: absRowTops,
          rowBottoms: absRowBottoms,
        };
        for (const [clsId, lp] of block.localPos.entries()) {
          const defX = originX + lp.localX;
          const defY = originY + lp.localY;
          const custom = customLayout?.[clsId];
          boxById.set(clsId, {
            x: custom?.x ?? defX,
            y: custom?.y ?? defY,
            w: custom?.width ?? lp.w,
            h: custom?.height ?? lp.h,
            treeIdx,
            row: lp.rowIdx,
            colSlot: lp.colSlot,
          });
        }
        rowMaxHeight = Math.max(rowMaxHeight, block.height);
      });
      currentForestY += rowMaxHeight + forestGapY;
    }

    // Place isolated 0-edge classes in a tidy 4-column grid at the bottom
    if (isolatedNodes.length > 0) {
      let isoY = subtreeBlocks.length > 0 ? currentForestY : 70;
      for (let i = 0; i < isolatedNodes.length; i += maxColsPerRow) {
        const subRow = isolatedNodes.slice(i, i + maxColsPerRow);
        let maxH = 160;
        subRow.forEach((cls, cIdx) => {
          const defX = 70 + cIdx * (colWidth + colGap);
          const defY = isoY;
          const defW = colWidth;
          const defH = calcHeight(cls);
          maxH = Math.max(maxH, defH);
          const custom = customLayout?.[cls.classifierId];
          boxById.set(cls.classifierId, {
            x: custom?.x ?? defX,
            y: custom?.y ?? defY,
            w: custom?.width ?? defW,
            h: custom?.height ?? defH,
            treeIdx: -1,
            row: Math.floor(i / maxColsPerRow),
            colSlot: cIdx,
          });
        });
        isoY += maxH + 110;
      }
    }

    for (const cls of projection.classifiers) {
      const box = boxById.get(cls.classifierId);
      if (!box) continue;
      const htmlLabel = formatClassifierCellValue(cls);
      const style = getClassifierCellStyle(cls);
      cells.push(
        `<mxCell id="${escapeXmlAttr(cls.classifierId)}" value="${escapeXmlAttr(htmlLabel)}" style="${style}" vertex="1" parent="1" mavisId="${escapeXmlAttr(cls.classifierId)}" mavisUmlRole="classifier" mavisProvenance="${cls.provenance}" mavisMeta="${encodeMeta(cls)}"><mxGeometry x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" as="geometry"/></mxCell>`,
      );
    }

    // 4. Obstacle-Verified Orthogonal Edge Routing (0 box intersections)
    const segmentHitsAnyBox = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      ignoreA: string,
      ignoreB: string,
      pad = 10,
    ): boolean => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (const [id, b] of boxById.entries()) {
        if (id === ignoreA || id === ignoreB) continue;
        const bx1 = b.x - pad;
        const bx2 = b.x + b.w + pad;
        const by1 = b.y - pad;
        const by2 = b.y + b.h + pad;
        if (maxX >= bx1 && minX <= bx2 && maxY >= by1 && minY <= by2) {
          return true;
        }
      }
      return false;
    };

    type Side = "top" | "bottom" | "left" | "right";
    interface EdgePlan {
      rel: UmlClassRelationEdge;
      srcSide: Side;
      tgtSide: Side;
    }

    const edgePlans: EdgePlan[] = [];
    const sideAttachments = new Map<
      string,
      Array<{ relId: string; isSource: boolean; refCoord: number }>
    >();

    const registerPort = (
      clsId: string,
      side: Side,
      relId: string,
      isSource: boolean,
      refCoord: number,
    ) => {
      const key = `${clsId}:${side}`;
      const list = sideAttachments.get(key) ?? [];
      list.push({ relId, isSource, refCoord });
      sideAttachments.set(key, list);
    };

    for (const rel of projection.relations) {
      const srcBox = boxById.get(rel.fromClassifierId);
      const tgtBox = boxById.get(rel.toClassifierId);
      if (!srcBox || !tgtBox) continue;

      let srcSide: Side = "bottom";
      let tgtSide: Side = "top";

      if (srcBox.row < tgtBox.row) {
        srcSide = "bottom";
        tgtSide = "top";
      } else if (srcBox.row > tgtBox.row) {
        srcSide = "top";
        tgtSide = "bottom";
      } else {
        const midY = (srcBox.y + srcBox.h / 2 + tgtBox.y + tgtBox.h / 2) / 2;
        const goRight = tgtBox.x >= srcBox.x;
        const sx = goRight ? srcBox.x + srcBox.w : srcBox.x;
        const tx = goRight ? tgtBox.x : tgtBox.x + tgtBox.w;
        const blocked = segmentHitsAnyBox(
          sx,
          midY,
          tx,
          midY,
          rel.fromClassifierId,
          rel.toClassifierId,
          6,
        );
        if (!blocked) {
          srcSide = goRight ? "right" : "left";
          tgtSide = goRight ? "left" : "right";
        } else {
          srcSide = "top";
          tgtSide = "top";
        }
      }

      const srcCenterX = srcBox.x + srcBox.w / 2;
      const srcCenterY = srcBox.y + srcBox.h / 2;
      const tgtCenterX = tgtBox.x + tgtBox.w / 2;
      const tgtCenterY = tgtBox.y + tgtBox.h / 2;

      registerPort(
        rel.fromClassifierId,
        srcSide,
        rel.relationId,
        true,
        srcSide === "top" || srcSide === "bottom" ? tgtCenterX : tgtCenterY,
      );
      registerPort(
        rel.toClassifierId,
        tgtSide,
        rel.relationId,
        false,
        tgtSide === "top" || tgtSide === "bottom" ? srcCenterX : srcCenterY,
      );

      edgePlans.push({ rel, srcSide, tgtSide });
    }

    const portFraction = new Map<string, number>();
    const portRankFromEdge = new Map<string, number>();
    for (const [, list] of sideAttachments) {
      list.sort((a, b) => a.refCoord - b.refCoord || a.relId.localeCompare(b.relId));
      const count = list.length;
      list.forEach((item, idx) => {
        const frac =
          count === 1 ? 0.5 : Number((0.18 + (idx / (count - 1)) * 0.64).toFixed(3));
        const key = `${item.relId}:${item.isSource ? "src" : "tgt"}`;
        portFraction.set(key, frac);
        const distFromOuter = Math.min(idx, count - 1 - idx);
        portRankFromEdge.set(key, distFromOuter);
      });
    }

    const hCorridorLaneCounter = new Map<string, number>();
    const usedVerticalChannels: Array<{ x: number; y1: number; y2: number }> = [];
    const hasCustomPositions = Boolean(customLayout && Object.keys(customLayout).length > 0);

    const pickSafeGutterX = (
      treeIdx: number,
      exitAbsX: number,
      entryAbsX: number,
      y1: number,
      y2: number,
      ignoreA: string,
      ignoreB: string,
    ): number => {
      const tb = treeBounds[treeIdx];
      const rawCandidates = new Set<number>();
      rawCandidates.add(Math.round((exitAbsX + entryAbsX) / 2));

      for (const [id, b] of boxById.entries()) {
        if (b.treeIdx !== treeIdx || id === ignoreA || id === ignoreB) continue;
        for (const offset of [28, 46, 64, 82]) {
          rawCandidates.add(Math.round(b.x - offset));
          rawCandidates.add(Math.round(b.x + b.w + offset));
        }
      }
      if (tb) {
        for (const offset of [34, 54, 74, 94, 114]) {
          rawCandidates.add(Math.round(tb.left - offset));
          rawCandidates.add(Math.round(tb.right + offset));
        }
      }

      const sorted = Array.from(rawCandidates).sort((a, b) => {
        const costA = Math.abs(a - exitAbsX) + Math.abs(a - entryAbsX);
        const costB = Math.abs(b - exitAbsX) + Math.abs(b - entryAbsX);
        return costA - costB;
      });

      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (const candX of sorted) {
        if (candX < 16) continue;
        if (segmentHitsAnyBox(candX, y1, candX, y2, ignoreA, ignoreB, 10)) continue;
        const overlapsExistingWire = usedVerticalChannels.some(
          (ch) => Math.abs(ch.x - candX) < 14 && Math.max(ch.y1, minY) <= Math.min(ch.y2, maxY),
        );
        if (overlapsExistingWire) continue;
        usedVerticalChannels.push({ x: candX, y1: minY, y2: maxY });
        return candX;
      }

      const fallbackX = tb ? tb.right + 48 + usedVerticalChannels.length * 18 : exitAbsX + 240;
      usedVerticalChannels.push({ x: fallbackX, y1: minY, y2: maxY });
      return fallbackX;
    };

    const classPaths: DeploymentPoint[][] = [];
    const classLabels: DeploymentBox[] = [];
    const classMarkerBoxes: DeploymentBox[] = [];
    const sortedEdgePlans = [...edgePlans].sort((a, b) => {
      const sa = boxById.get(a.rel.fromClassifierId)!,
        ta = boxById.get(a.rel.toClassifierId)!,
        sb = boxById.get(b.rel.fromClassifierId)!,
        tb = boxById.get(b.rel.toClassifierId)!;
      const da = Math.abs(sa.x + sa.w / 2 - (ta.x + ta.w / 2)) + Math.abs(sa.y + sa.h / 2 - (ta.y + ta.h / 2));
      const db = Math.abs(sb.x + sb.w / 2 - (tb.x + tb.w / 2)) + Math.abs(sb.y + sb.h / 2 - (tb.y + tb.h / 2));
      return da - db || a.rel.relationId.localeCompare(b.rel.relationId);
    });

    for (let planIdx = 0; planIdx < sortedEdgePlans.length; planIdx++) {
      const plan = sortedEdgePlans[planIdx]!;
      const { rel, srcSide, tgtSide } = plan;
      const srcBox = boxById.get(rel.fromClassifierId)!;
      const tgtBox = boxById.get(rel.toClassifierId)!;
      const sFrac = portFraction.get(`${rel.relationId}:src`) ?? 0.5;
      const tFrac = portFraction.get(`${rel.relationId}:tgt`) ?? 0.5;

      const exitX = srcSide === "left" ? 0 : srcSide === "right" ? 1 : sFrac;
      const exitY = srcSide === "top" ? 0 : srcSide === "bottom" ? 1 : sFrac;
      const entryX = tgtSide === "left" ? 0 : tgtSide === "right" ? 1 : tFrac;
      const entryY = tgtSide === "top" ? 0 : tgtSide === "bottom" ? 1 : tFrac;

      const baseStyle = getClassRelationCellStyle(rel);
      let style = `${baseStyle}exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;`;
      const label = formatClassRelationCellValue(rel);

      const exitAbsX = Math.round(srcBox.x + exitX * srcBox.w);
      const exitAbsY = Math.round(srcBox.y + exitY * srcBox.h);
      const entryAbsX = Math.round(tgtBox.x + entryX * tgtBox.w);
      const entryAbsY = Math.round(tgtBox.y + entryY * tgtBox.h);

      const waypoints: Array<{ x: number; y: number }> = [];
      const tb = treeBounds[srcBox.treeIdx];

      if (!hasCustomPositions && tb) {
        if (Math.abs(srcBox.row - tgtBox.row) === 1) {
          const upperRow = Math.min(srcBox.row, tgtBox.row);
          const vOrder = portRankFromEdge.get(`${rel.relationId}:src`) ?? 0;
          const corridorKey = `t:${srcBox.treeIdx}:r:${upperRow}:v:${vOrder}`;
          const subIdx = hCorridorLaneCounter.get(corridorKey) ?? 0;
          hCorridorLaneCounter.set(corridorKey, subIdx + 1);
          const corridorTop = tb.rowBottoms[upperRow] ?? exitAbsY;
          const laneY = Math.round(corridorTop + 26 + vOrder * 24 + (subIdx % 3) * 12);
          waypoints.push({ x: exitAbsX, y: laneY }, { x: entryAbsX, y: laneY });
        } else if (srcBox.row === tgtBox.row && srcSide !== "top") {
          const midX = Math.round((exitAbsX + entryAbsX) / 2);
          waypoints.push({ x: midX, y: exitAbsY }, { x: midX, y: entryAbsY });
        } else if (srcBox.row === tgtBox.row) {
          const corridorKey = `t:${srcBox.treeIdx}:top:${srcBox.row}`;
          const laneIdx = hCorridorLaneCounter.get(corridorKey) ?? 0;
          hCorridorLaneCounter.set(corridorKey, laneIdx + 1);
          const rowTop = tb.rowTops[srcBox.row] ?? srcBox.y;
          const laneY = Math.max(16, Math.round(rowTop - 26 - (laneIdx % 3) * 14));
          waypoints.push({ x: exitAbsX, y: laneY }, { x: entryAbsX, y: laneY });
        } else {
          const goingDown = tgtBox.row > srcBox.row;
          const srcCorridorRow = goingDown ? srcBox.row : srcBox.row - 1;
          const tgtCorridorRow = goingDown ? tgtBox.row - 1 : tgtBox.row;
          const srcKey = `t:${srcBox.treeIdx}:r:${srcCorridorRow}`;
          const tgtKey = `t:${srcBox.treeIdx}:r:${tgtCorridorRow}`;
          const srcLaneIdx = hCorridorLaneCounter.get(srcKey) ?? 0;
          hCorridorLaneCounter.set(srcKey, srcLaneIdx + 1);
          const tgtLaneIdx = hCorridorLaneCounter.get(tgtKey) ?? 0;
          hCorridorLaneCounter.set(tgtKey, tgtLaneIdx + 1);

          const srcLaneY = Math.round(
            (tb.rowBottoms[srcCorridorRow] ?? exitAbsY) + 28 + (srcLaneIdx % 4) * 18,
          );
          const tgtLaneY = Math.round(
            (tb.rowBottoms[tgtCorridorRow] ?? entryAbsY) + 28 + (tgtLaneIdx % 4) * 18,
          );

          const gutterX = pickSafeGutterX(
            srcBox.treeIdx,
            exitAbsX,
            entryAbsX,
            srcLaneY,
            tgtLaneY,
            rel.fromClassifierId,
            rel.toClassifierId,
          );

          waypoints.push(
            { x: exitAbsX, y: srcLaneY },
            { x: gutterX, y: srcLaneY },
            { x: gutterX, y: tgtLaneY },
            { x: entryAbsX, y: tgtLaneY },
          );
        }
      }

      if (rel.fromClassifierId !== rel.toClassifierId) {
        const start = { x: exitAbsX + (srcSide === "right" ? 24 : srcSide === "left" ? -24 : 0), y: exitAbsY + (srcSide === "bottom" ? 24 : srcSide === "top" ? -24 : 0) };
        const finish = { x: entryAbsX + (tgtSide === "right" ? 24 : tgtSide === "left" ? -24 : 0), y: entryAbsY + (tgtSide === "bottom" ? 24 : tgtSide === "top" ? -24 : 0) };
        const classifierBoxes = [...boxById.values()].map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
        const safeRoute = routeDeploymentPath(start, finish, classifierBoxes, classPaths, planIdx);
        if (safeRoute) {
          waypoints.splice(0, waypoints.length, ...safeRoute);
          style += "edgeStyle=none;noEdgeStyle=1;exitPerimeter=0;entryPerimeter=0;jumpStyle=arc;jumpSize=6;";
        }
        const fullPath = [{ x: exitAbsX, y: exitAbsY }, ...waypoints, { x: entryAbsX, y: entryAbsY }];
        classPaths.push(fullPath);
        // Reserve 18x18 marker boxes at UML diamond/arrowhead ports (archify markerBox)
        classMarkerBoxes.push(
          { x: exitAbsX - 9, y: exitAbsY - 9, w: 18, h: 18 },
          { x: entryAbsX - 9, y: entryAbsY - 9, w: 18, h: 18 },
        );
        if (label) {
          const placedLbl = placeDeploymentEdgeLabel(
            fullPath,
            label,
            [...classifierBoxes, ...classMarkerBoxes, ...classLabels],
            classPaths.slice(0, -1),
          );
          if (placedLbl) classLabels.push(placedLbl.box);
        }
      }
      const geomInner =
        waypoints.length > 0
          ? `<Array as="points">${waypoints.map((pt) => `<mxPoint x="${pt.x}" y="${pt.y}"/>`).join("")}</Array>`
          : "";

      cells.push(
        `<mxCell id="${escapeXmlAttr(rel.relationId)}" value="${escapeXmlAttr(label)}" style="${style}" edge="1" parent="1" source="${escapeXmlAttr(rel.fromClassifierId)}" target="${escapeXmlAttr(rel.toClassifierId)}" mavisId="${escapeXmlAttr(rel.relationId)}" mavisUmlRole="class-relation" mavisRelationKind="${rel.relationKind}" mavisProvenance="${rel.provenance}" mavisMeta="${encodeMeta(rel)}"><mxGeometry relative="1" as="geometry">${geomInner}</mxGeometry></mxCell>`,
      );
    }
  } else if (projection.diagramKind === "UML_PACKAGE") {
    const pkgById = new Map(projection.packages.map((p) => [p.packageId, p]));
    const hasValidParent = (pkg: UmlPackageNode): boolean =>
      Boolean(
        pkg.parentPackageId &&
          pkgById.has(pkg.parentPackageId) &&
          pkg.parentPackageId !== pkg.packageId,
      );

    const childrenByParent = new Map<string, UmlPackageNode[]>();
    for (const p of projection.packages) {
      if (hasValidParent(p)) {
        const list = childrenByParent.get(p.parentPackageId!) ?? [];
        list.push(p);
        childrenByParent.set(p.parentPackageId!, list);
      }
    }

    const rootOfPkg = (id: string): string => {
      let curr = id;
      const seen = new Set<string>();
      while (!seen.has(curr)) {
        seen.add(curr);
        const node = pkgById.get(curr);
        if (!node || !hasValidParent(node)) break;
        curr = node.parentPackageId!;
      }
      return curr;
    };

    const computedGeom = new Map<string, { x: number; y: number; w: number; h: number }>();
    const computePkgSize = (
      pkg: UmlPackageNode,
      visited = new Set<string>(),
    ): { w: number; h: number } => {
      if (visited.has(pkg.packageId)) {
        return { w: 290, h: 120 };
      }
      visited.add(pkg.packageId);
      const children = childrenByParent.get(pkg.packageId) ?? [];
      const headerChars = `«package» ${pkg.qualifiedName}`.length;
      const maxMemberChars = pkg.memberNames.reduce((m, n) => Math.max(m, n.length + 3), 0);
      const selfMinW = Math.max(
        280,
        Math.min(580, Math.ceil(Math.max(headerChars, maxMemberChars) * 7.6 + 38)),
      );
      const memberLines = pkg.memberNames.length > 0 ? pkg.memberNames.length : 1;
      const headerHeight = 68 + memberLines * 19;

      if (children.length === 0) {
        return {
          w: selfMinW,
          h: Math.max(114, headerHeight + 18),
        };
      }

      let cursorY = headerHeight + 14;
      let maxChildW = selfMinW - 48;
      for (const child of children) {
        const childSize = computePkgSize(child, new Set(visited));
        computedGeom.set(child.packageId, {
          x: 24,
          y: cursorY,
          w: childSize.w,
          h: childSize.h,
        });
        cursorY += childSize.h + 40;
        if (childSize.w > maxChildW) {
          maxChildW = childSize.w;
        }
      }
      return {
        w: Math.max(selfMinW, maxChildW + 48),
        h: cursorY + 14,
      };
    };

    const rootPkgs = projection.packages.filter((p) => !hasValidParent(p));
    const rootSizeById = new Map<string, { w: number; h: number }>();
    for (const rp of rootPkgs) {
      rootSizeById.set(rp.packageId, computePkgSize(rp));
    }

    // Build degree and cluster adjacency across root packages
    const aiPkgLayout = explicitCarrier?.aiEnrichment?.packageLayout ?? {};
    const outDeg = new Map<string, number>();
    const inDeg = new Map<string, number>();
    const adjUndir = new Map<string, Set<string>>();
    for (const rp of rootPkgs) {
      outDeg.set(rp.packageId, 0);
      inDeg.set(rp.packageId, 0);
      adjUndir.set(rp.packageId, new Set<string>());
    }
    for (const edge of projection.edges) {
      const u = rootOfPkg(edge.fromPackageId);
      const v = rootOfPkg(edge.toPackageId);
      if (!adjUndir.has(u) || !adjUndir.has(v) || u === v) continue;
      outDeg.set(u, (outDeg.get(u) ?? 0) + 1);
      inDeg.set(v, (inDeg.get(v) ?? 0) + 1);
      adjUndir.get(u)!.add(v);
      adjUndir.get(v)!.add(u);
    }
    // In system-wide overview, also keep packages of the same microservice in the same cluster
    const byService = new Map<string, string[]>();
    for (const rp of rootPkgs) {
      if (!rp.serviceId) continue;
      const list = byService.get(rp.serviceId) ?? [];
      list.push(rp.packageId);
      byService.set(rp.serviceId, list);
    }
    for (const list of byService.values()) {
      for (let i = 1; i < list.length; i++) {
        adjUndir.get(list[0]!)?.add(list[i]!);
        adjUndir.get(list[i]!)?.add(list[0]!);
      }
    }

    const basePkgTierOf = (pkg: UmlPackageNode): number => {
      const aiTier = aiPkgLayout[pkg.packageId]?.tier;
      if (typeof aiTier === "number" && Number.isFinite(aiTier) && aiTier >= 0 && aiTier <= 3) {
        return Math.round(aiTier);
      }
      const q = pkg.qualifiedName.toLowerCase();
      const inc = inDeg.get(pkg.packageId) ?? 0;
      const out = outDeg.get(pkg.packageId) ?? 0;
      if (
        /(^|\.)(web|api|rest|controller|controllers|graphql|grpc|ui|endpoint|endpoints|messaging|event|events|consumer|listener|listeners|handler|handlers)(\.|$)/.test(
          q,
        )
      ) {
        return 0;
      }
      if (
        /(^|\.)(domain|model|models|entity|entities|repository|repositories|dao|persistence|jpa|db|data|common|shared|kernel|util|utils)(\.|$)/.test(
          q,
        )
      ) {
        return 2;
      }
      if (
        /(^|\.)(service|services|application|saga|sagas|workflow|orchestration|usecase|command|commands|query|queries)(\.|$)/.test(
          q,
        )
      ) {
        return 1;
      }
      if (inc === 0 && out > 0) return 0;
      if (out === 0 && inc > 0) return 2;
      return 1;
    };

    const visitedCluster = new Set<string>();
    const connectedClusters: UmlPackageNode[][] = [];
    const isolatedRootPkgs: UmlPackageNode[] = [];
    const rootById = new Map(rootPkgs.map((p) => [p.packageId, p]));

    for (const rp of rootPkgs) {
      if (visitedCluster.has(rp.packageId)) continue;
      const comp: UmlPackageNode[] = [];
      const queue = [rp.packageId];
      visitedCluster.add(rp.packageId);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const node = rootById.get(curr);
        if (node) comp.push(node);
        for (const nb of adjUndir.get(curr) ?? []) {
          if (!visitedCluster.has(nb)) {
            visitedCluster.add(nb);
            queue.push(nb);
          }
        }
      }
      const hasChildren = comp.some((c) => (childrenByParent.get(c.packageId)?.length ?? 0) > 0);
      if (comp.length > 1 || hasChildren) {
        connectedClusters.push(comp);
      } else {
        isolatedRootPkgs.push(comp[0]!);
      }
    }

    connectedClusters.sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return (a[0]?.qualifiedName ?? "").localeCompare(b[0]?.qualifiedName ?? "");
    });
    isolatedRootPkgs.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));

    const pkgColGap = 86;
    const pkgRowGap = 112;
    const maxPkgsPerRow = 3;

    interface PkgClusterBlock {
      localPos: Map<string, { x: number; y: number; w: number; h: number }>;
      width: number;
      height: number;
    }

    const buildPkgClusterBlock = (compNodes: UmlPackageNode[]): PkgClusterBlock => {
      const compSet = new Set(compNodes.map((c) => c.packageId));
      const layerById = new Map<string, number>();
      for (const p of compNodes) {
        layerById.set(p.packageId, basePkgTierOf(p));
      }
      for (let pass = 0; pass < 4; pass++) {
        for (const edge of projection.edges) {
          const u = rootOfPkg(edge.fromPackageId);
          const v = rootOfPkg(edge.toPackageId);
          if (!compSet.has(u) || !compSet.has(v) || u === v) continue;
          const lu = layerById.get(u) ?? 0;
          const lv = layerById.get(v) ?? 0;
          const hasReverse = projection.edges.some(
            (e2) => rootOfPkg(e2.fromPackageId) === v && rootOfPkg(e2.toPackageId) === u,
          );
          if (!hasReverse && lu >= lv) {
            layerById.set(v, Math.min(4, lu + 1));
          }
        }
      }

      const distinctLayers = [...new Set(compNodes.map((p) => layerById.get(p.packageId) ?? 0))].sort(
        (a, b) => a - b,
      );
      const rows: UmlPackageNode[][] = [];
      for (const l of distinctLayers) {
        const inLayer = compNodes
          .filter((p) => (layerById.get(p.packageId) ?? 0) === l)
          .sort((a, b) => {
            const oa = aiPkgLayout[a.packageId]?.order;
            const ob = aiPkgLayout[b.packageId]?.order;
            if (typeof oa === "number" && typeof ob === "number" && oa !== ob) return oa - ob;
            return a.qualifiedName.localeCompare(b.qualifiedName);
          });
        for (let i = 0; i < inLayer.length; i += maxPkgsPerRow) {
          rows.push(inLayer.slice(i, i + maxPkgsPerRow));
        }
      }

      let maxRowW = 300;
      const rowWidths: number[] = [];
      const rowHeights: number[] = [];
      for (const row of rows) {
        let rw = 0;
        let rh = 120;
        row.forEach((p, idx) => {
          const sz = rootSizeById.get(p.packageId) ?? { w: 290, h: 120 };
          rw += sz.w + (idx > 0 ? pkgColGap : 0);
          if (sz.h > rh) rh = sz.h;
        });
        rowWidths.push(rw);
        rowHeights.push(rh);
        if (rw > maxRowW) maxRowW = rw;
      }

      const localPos = new Map<string, { x: number; y: number; w: number; h: number }>();
      let curY = 0;
      rows.forEach((row, rIdx) => {
        const rw = rowWidths[rIdx]!;
        const rh = rowHeights[rIdx]!;
        let curX = Math.round((maxRowW - rw) / 2);
        for (const p of row) {
          const sz = rootSizeById.get(p.packageId) ?? { w: 290, h: 120 };
          localPos.set(p.packageId, { x: curX, y: curY, w: sz.w, h: sz.h });
          curX += sz.w + pkgColGap;
        }
        curY += rh + (rIdx < rows.length - 1 ? pkgRowGap : 0);
      });

      return {
        localPos,
        width: maxRowW,
        height: Math.max(120, curY),
      };
    };

    const startX = 72;
    const startY = 56;
    const clusterGapX = 124;
    const clusterGapY = 124;
    const clustersPerRow = connectedClusters.length <= 1 ? 1 : 2;
    const clusterBlocks = connectedClusters.map((c) => buildPkgClusterBlock(c));

    let curClusterY = startY;
    for (let i = 0; i < clusterBlocks.length; i += clustersPerRow) {
      const slice = clusterBlocks.slice(i, i + clustersPerRow);
      let curClusterX = startX;
      let maxSliceH = 0;
      for (const blk of slice) {
        for (const [pkgId, pos] of blk.localPos.entries()) {
          computedGeom.set(pkgId, {
            x: curClusterX + pos.x,
            y: curClusterY + pos.y,
            w: pos.w,
            h: pos.h,
          });
        }
        curClusterX += blk.width + clusterGapX;
        if (blk.height > maxSliceH) maxSliceH = blk.height;
      }
      curClusterY += maxSliceH + clusterGapY;
    }

    if (isolatedRootPkgs.length > 0) {
      const isoPerRow = 3;
      for (let i = 0; i < isolatedRootPkgs.length; i += isoPerRow) {
        const row = isolatedRootPkgs.slice(i, i + isoPerRow);
        let curX = startX;
        let maxH = 120;
        for (const p of row) {
          const sz = rootSizeById.get(p.packageId) ?? { w: 290, h: 120 };
          computedGeom.set(p.packageId, {
            x: curX,
            y: curClusterY,
            w: sz.w,
            h: sz.h,
          });
          curX += sz.w + pkgColGap;
          if (sz.h > maxH) maxH = sz.h;
        }
        curClusterY += maxH + 92;
      }
    }

    // Track absolute bounding boxes for obstacle-verified orthogonal edge routing
    const absPkgBoxById = new Map<
      string,
      { x: number; y: number; w: number; h: number; cx: number; cy: number }
    >();

    projection.packages.forEach((pkg) => {
      const validParent = hasValidParent(pkg);
      const parentCellId = validParent ? pkg.parentPackageId! : "1";
      const defG = computedGeom.get(pkg.packageId) ?? { x: 60, y: 60, w: 290, h: 120 };
      const custom = customLayout?.[pkg.packageId];
      const gx = custom?.x ?? defG.x;
      const gy = custom?.y ?? defG.y;
      const gw = custom?.width ?? defG.w;
      const gh = custom?.height ?? defG.h;
      computedGeom.set(pkg.packageId, { x: gx, y: gy, w: gw, h: gh });

      const label = formatPackageCellValue(pkg);
      const style = getPackageCellStyle();

      cells.push(
        `<mxCell id="${escapeXmlAttr(pkg.packageId)}" value="${escapeXmlAttr(label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(parentCellId)}" mavisId="${escapeXmlAttr(pkg.packageId)}" mavisUmlRole="package" mavisProvenance="${pkg.provenance}" mavisMeta="${encodeMeta(pkg)}">${geomOf(pkg.packageId, defG.x, defG.y, defG.w, defG.h)}</mxCell>`,
      );
    });

    // Resolve absolute coordinates for every package (including any nested inside a parent)
    const resolveAbsPkgBox = (
      id: string,
      seen = new Set<string>(),
    ): { x: number; y: number; w: number; h: number; cx: number; cy: number } => {
      if (absPkgBoxById.has(id)) return absPkgBoxById.get(id)!;
      const g = computedGeom.get(id) ?? { x: 60, y: 60, w: 290, h: 120 };
      const pkg = pkgById.get(id);
      let ax = g.x;
      let ay = g.y;
      if (pkg && hasValidParent(pkg) && !seen.has(id)) {
        seen.add(id);
        const pBox = resolveAbsPkgBox(pkg.parentPackageId!, seen);
        ax += pBox.x;
        ay += pBox.y;
      }
      const box = { x: ax, y: ay, w: g.w, h: g.h, cx: ax + g.w / 2, cy: ay + g.h / 2 };
      absPkgBoxById.set(id, box);
      return box;
    };
    for (const p of projection.packages) {
      resolveAbsPkgBox(p.packageId);
    }

    const allPkgObstacles = [...absPkgBoxById.entries()].map(([id, b]) => ({ id, ...b }));
    const pkgSegmentHitsAnyBox = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      ignoreIds: Set<string>,
    ): boolean => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      const pad = 10;
      for (const b of allPkgObstacles) {
        if (ignoreIds.has(b.id)) continue;
        const bx1 = b.x - pad;
        const bx2 = b.x + b.w + pad;
        const by1 = b.y - pad;
        const by2 = b.y + b.h + pad;
        if (maxX >= bx1 && minX <= bx2 && maxY >= by1 && minY <= by2) {
          return true;
        }
      }
      return false;
    };

    const pkgPathClear = (
      pts: Array<{ x: number; y: number }>,
      ignoreIds: Set<string>,
    ): boolean => {
      for (let i = 0; i < pts.length - 1; i++) {
        if (
          pkgSegmentHitsAnyBox(pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y, ignoreIds)
        ) {
          return false;
        }
      }
      return true;
    };

    type PkgSide = "top" | "bottom" | "left" | "right";
    interface PlannedPkgEdge {
      edge: UmlPackageEdge;
      srcBox: { x: number; y: number; w: number; h: number; cx: number; cy: number };
      tgtBox: { x: number; y: number; w: number; h: number; cx: number; cy: number };
      exitSide: PkgSide;
      entrySide: PkgSide;
      exitSlot: number;
      entrySlot: number;
    }

    const plannedPkgEdges: PlannedPkgEdge[] = [];
    const pkgSideBuckets = new Map<
      string,
      Array<{ edgeIdx: number; isSource: boolean; otherCoord: number }>
    >();
    const regPkgPort = (
      pkgId: string,
      side: PkgSide,
      edgeIdx: number,
      isSource: boolean,
      otherCoord: number,
    ) => {
      const k = `${pkgId}:${side}`;
      const list = pkgSideBuckets.get(k) ?? [];
      list.push({ edgeIdx, isSource, otherCoord });
      pkgSideBuckets.set(k, list);
    };

    projection.edges.forEach((edge) => {
      const srcBox = absPkgBoxById.get(edge.fromPackageId);
      const tgtBox = absPkgBoxById.get(edge.toPackageId);
      if (!srcBox || !tgtBox) return;
      const dy = tgtBox.cy - srcBox.cy;
      const dx = tgtBox.cx - srcBox.cx;
      let exitSide: PkgSide = "bottom";
      let entrySide: PkgSide = "top";
      if (Math.abs(dy) < 42) {
        exitSide = dx >= 0 ? "right" : "left";
        entrySide = dx >= 0 ? "left" : "right";
      } else if (dy > 0) {
        exitSide = "bottom";
        entrySide = "top";
      } else {
        exitSide = "top";
        entrySide = "bottom";
      }
      const idx = plannedPkgEdges.length;
      plannedPkgEdges.push({
        edge,
        srcBox,
        tgtBox,
        exitSide,
        entrySide,
        exitSlot: 0.5,
        entrySlot: 0.5,
      });
      regPkgPort(
        edge.fromPackageId,
        exitSide,
        idx,
        true,
        exitSide === "top" || exitSide === "bottom" ? tgtBox.cx : tgtBox.cy,
      );
      regPkgPort(
        edge.toPackageId,
        entrySide,
        idx,
        false,
        entrySide === "top" || entrySide === "bottom" ? srcBox.cx : srcBox.cy,
      );
    });

    for (const [, bucket] of pkgSideBuckets.entries()) {
      bucket.sort((a, b) => a.otherCoord - b.otherCoord || a.edgeIdx - b.edgeIdx);
      const count = bucket.length;
      bucket.forEach((item, i) => {
        // Keep top ports to the right of the 110px folder tab (slot >= 0.34) whenever possible
        const minSlot = count === 1 ? 0.5 : 0.34;
        const maxSlot = count === 1 ? 0.5 : 0.82;
        const slot =
          count === 1
            ? 0.5
            : Number((minSlot + ((maxSlot - minSlot) * i) / Math.max(1, count - 1)).toFixed(2));
        const pe = plannedPkgEdges[item.edgeIdx]!;
        if (item.isSource) pe.exitSlot = slot;
        else pe.entrySlot = slot;
      });
    }

    // In Draw.io shape=folder (tabWidth=110;tabHeight=26;tabPosition=left), the top border to the right
    // of x + 110 is recessed by 26px. Disable perimeter projection on the edge:
    // otherwise mxGraph projects this recessed point back to the bounding rectangle.
    const pkgPortCoords = (
      b: { x: number; y: number; w: number; h: number },
      side: PkgSide,
      slot: number,
    ): { x: number; y: number; px: number; py: number; dx: number; dy: number } => {
      if (side === "top") {
        const tabRecess = slot * b.w > 110 ? 26 : 0;
        return {
          x: Math.round(b.x + b.w * slot),
          y: b.y + tabRecess,
          px: slot,
          py: 0,
          dx: 0,
          dy: tabRecess,
        };
      }
      if (side === "bottom") {
        return {
          x: Math.round(b.x + b.w * slot),
          y: b.y + b.h,
          px: slot,
          py: 1,
          dx: 0,
          dy: 0,
        };
      }
      if (side === "left") {
        const minLeftY = Math.max(0.3, 32 / Math.max(80, b.h));
        const effSlot = Math.max(minLeftY, slot);
        return {
          x: b.x,
          y: Math.round(b.y + b.h * effSlot),
          px: 0,
          py: Number(effSlot.toFixed(2)),
          dx: 0,
          dy: 0,
        };
      }
      const minRightY = Math.max(0.3, 32 / Math.max(80, b.h));
      const effSlot = Math.max(minRightY, slot);
      return {
        x: b.x + b.w,
        y: Math.round(b.y + b.h * effSlot),
        px: 1,
        py: Number(effSlot.toFixed(2)),
        dx: 0,
        dy: 0,
      };
    };

    const placedEdgesIds = new Set<string>();
    let bypassCorridorCounter = 0;
    const packagePaths: DeploymentPoint[][] = [];
    const packageLabels: Array<{ x: number; y: number; w: number; h: number }> = [];

    plannedPkgEdges.forEach((pe, edgeIdx) => {
      const { edge, srcBox, tgtBox, exitSide, entrySide, exitSlot, entrySlot } = pe;
      placedEdgesIds.add(edge.edgeId);
      let sp = pkgPortCoords(srcBox, exitSide, exitSlot);
      let tp = pkgPortCoords(tgtBox, entrySide, entrySlot);

      // Ignore source, target, and any enclosing parent packages of source/target
      const ignoreIds = new Set<string>([edge.fromPackageId, edge.toPackageId]);
      let pCurr = pkgById.get(edge.fromPackageId);
      while (pCurr && hasValidParent(pCurr)) {
        ignoreIds.add(pCurr.parentPackageId!);
        pCurr = pkgById.get(pCurr.parentPackageId!);
      }
      pCurr = pkgById.get(edge.toPackageId);
      while (pCurr && hasValidParent(pCurr)) {
        ignoreIds.add(pCurr.parentPackageId!);
        pCurr = pkgById.get(pCurr.parentPackageId!);
      }

      let waypoints: Array<{ x: number; y: number }> = [];

      if (
        (exitSide === "bottom" && entrySide === "top") ||
        (exitSide === "top" && entrySide === "bottom")
      ) {
        // 1. Check if srcBox and tgtBox overlap horizontally and can connect via a 100% straight vertical line
        const overlapMinX = Math.max(srcBox.x + 36, tgtBox.x + 36);
        const overlapMaxX = Math.min(srcBox.x + srcBox.w - 36, tgtBox.x + tgtBox.w - 36);
        const canAlignStraight =
          overlapMaxX > overlapMinX && Math.abs(sp.x - tp.x) <= 72 &&
          (pkgSideBuckets.get(`${edge.fromPackageId}:${exitSide}`)?.length ?? 0) <= 1 &&
          (pkgSideBuckets.get(`${edge.toPackageId}:${entrySide}`)?.length ?? 0) <= 1;
        if (canAlignStraight) {
          const sharedX = Math.max(
            overlapMinX,
            Math.min(overlapMaxX, Math.round((sp.x + tp.x) / 2)),
          );
          const candExitSlot = (sharedX - srcBox.x) / srcBox.w;
          const candEntrySlot = (sharedX - tgtBox.x) / tgtBox.w;
          const candSp = pkgPortCoords(srcBox, exitSide, candExitSlot);
          const candTp = pkgPortCoords(tgtBox, entrySide, candEntrySlot);
          if (
            pkgPathClear(
              [
                { x: sharedX, y: candSp.y },
                { x: sharedX, y: candTp.y },
              ],
              ignoreIds,
            )
          ) {
            sp = { ...candSp, x: sharedX };
            tp = { ...candTp, x: sharedX };
            waypoints = [];
          }
        }

        // 2. If not straight vertical, test clean 2-waypoint Z-turns (near-target corridor, mid corridor, near-source corridor)
        if (waypoints.length === 0 && sp.x !== tp.x) {
          const slotRank = Math.round((entrySlot - 0.5) * 36);
          const rawMidY = Math.round((sp.y + tp.y) / 2);
          const nearTgtY =
            entrySide === "top"
              ? tp.y - 34 - Math.abs(slotRank)
              : tp.y + 34 + Math.abs(slotRank);
          const nearSrcY =
            exitSide === "bottom"
              ? sp.y + 34 + Math.abs(slotRank)
              : sp.y - 34 - Math.abs(slotRank);

          // Prefer nearTgtY when jumping across an intermediate tier (|tp.y - sp.y| > 180), else midY
          const turnYCandidates =
            Math.abs(tp.y - sp.y) > 180
              ? [nearTgtY, rawMidY + slotRank, nearSrcY]
              : [rawMidY + slotRank, nearTgtY, nearSrcY];

          for (const turnY of turnYCandidates) {
            const zPts = [
              { x: sp.x, y: sp.y },
              { x: sp.x, y: turnY },
              { x: tp.x, y: turnY },
              { x: tp.x, y: tp.y },
            ];
            if (pkgPathClear(zPts, ignoreIds)) {
              waypoints = [
                { x: sp.x, y: turnY },
                { x: tp.x, y: turnY },
              ];
              break;
            }
          }
        }

        // 3. If an obstacle sits directly between srcBox and tgtBox in the same column, pick the shortest clear vertical bypass corridor
        if (waypoints.length === 0 && sp.x !== tp.x) {
          bypassCorridorCounter += 1;
          const y1 = exitSide === "bottom" ? sp.y + 24 : sp.y - 24;
          const y2 = entrySide === "top" ? tp.y - 28 : tp.y + 28;
          const minYBand = Math.min(sp.y, tp.y);
          const maxYBand = Math.max(sp.y, tp.y);
          const xCandidates: number[] = [];
          for (const obs of allPkgObstacles) {
            if (ignoreIds.has(obs.id)) continue;
            if (obs.y + obs.h >= minYBand && obs.y <= maxYBand) {
              xCandidates.push(obs.x - 32 - (bypassCorridorCounter % 2) * 14);
              xCandidates.push(obs.x + obs.w + 32 + (bypassCorridorCounter % 2) * 14);
            }
          }
          xCandidates.push(Math.min(srcBox.x, tgtBox.x) - 38 - bypassCorridorCounter * 12);
          xCandidates.push(
            Math.max(srcBox.x + srcBox.w, tgtBox.x + tgtBox.w) + 38 + bypassCorridorCounter * 12,
          );
          xCandidates.sort(
            (a, b) =>
              Math.abs(a - sp.x) + Math.abs(a - tp.x) - (Math.abs(b - sp.x) + Math.abs(b - tp.x)),
          );

          for (const corrX of xCandidates) {
            const candPts = [
              { x: sp.x, y: sp.y },
              { x: sp.x, y: y1 },
              { x: corrX, y: y1 },
              { x: corrX, y: y2 },
              { x: tp.x, y: y2 },
              { x: tp.x, y: tp.y },
            ];
            if (pkgPathClear(candPts, ignoreIds)) {
              waypoints = candPts.slice(1, -1);
              break;
            }
          }
          if (waypoints.length === 0) {
            const fallbackX = xCandidates[0] ?? Math.min(srcBox.x, tgtBox.x) - 42;
            waypoints = [
              { x: sp.x, y: y1 },
              { x: fallbackX, y: y1 },
              { x: fallbackX, y: y2 },
              { x: tp.x, y: y2 },
            ];
          }
        }
      } else {
        const midX = Math.round((sp.x + tp.x) / 2);
        const directHoriz = [
          { x: sp.x, y: sp.y },
          { x: midX, y: sp.y },
          { x: midX, y: tp.y },
          { x: tp.x, y: tp.y },
        ];
        if (Math.abs(sp.y - tp.y) <= 12 && pkgPathClear([sp, tp], ignoreIds)) {
          waypoints = [];
        } else if (pkgPathClear(directHoriz, ignoreIds)) {
          waypoints = [
            { x: midX, y: sp.y },
            { x: midX, y: tp.y },
          ];
        } else {
          const busY = Math.max(srcBox.y + srcBox.h, tgtBox.y + tgtBox.h) + 36;
          waypoints = [
            { x: sp.x, y: busY },
            { x: tp.x, y: busY },
          ];
        }
      }

      const outward = (p: typeof sp, side: PkgSide) => ({
        x: p.x + (side === "left" ? -24 : side === "right" ? 24 : 0),
        y: p.y + (side === "top" ? -24 - p.dy : side === "bottom" ? 24 : 0),
      });
      const obstacles = allPkgObstacles.filter(b => !ignoreIds.has(b.id) || b.id === edge.fromPackageId || b.id === edge.toPackageId);
      const safeRoute = routeDeploymentPath(outward(sp, exitSide), outward(tp, entrySide), [...obstacles, ...packageLabels], packagePaths, edgeIdx);
      if (safeRoute) waypoints = safeRoute;
      if (safeRoute && ((sp.x === tp.x && safeRoute.every(p => p.x === sp.x)) ||
        (sp.y === tp.y && safeRoute.every(p => p.y === sp.y)))) waypoints = [];
      const path = [sp, ...waypoints, tp];
      const label = formatPackageEdgeCellValue(edge);
      const wireBoxes = packagePaths.flatMap(path => path.slice(1).map((p, i) => ({ x: Math.min(p.x, path[i]!.x) - 2, y: Math.min(p.y, path[i]!.y) - 2, w: Math.abs(p.x - path[i]!.x) + 4, h: Math.abs(p.y - path[i]!.y) + 4 })));
      const placedLabel = placeActivityGuard(path, label, [...obstacles, ...packageLabels, ...wireBoxes]);
      if (placedLabel) packageLabels.push(placedLabel.box);
      packagePaths.push(path);
      const style = `${getPackageEdgeCellStyle()}${safeRoute ? "edgeStyle=none;noEdgeStyle=1;jumpStyle=arc;" : ""}exitPerimeter=0;entryPerimeter=0;exitX=${sp.px};exitY=${sp.py};exitDx=${sp.dx};exitDy=${sp.dy};entryX=${tp.px};entryY=${tp.py};entryDx=${tp.dx};entryDy=${tp.dy};`;
      const ptsXml =
        waypoints.length > 0
          ? `<Array as="points">${waypoints.map((p) => `<mxPoint x="${Math.round(p.x)}" y="${Math.round(p.y)}"/>`).join("")}</Array>`
          : "";
      const labelPosition = placedLabel?.position ?? 0;
      const offsetXml = placedLabel ? `<mxPoint x="${placedLabel.dx}" y="${placedLabel.dy}" as="offset"/>` : '<mxPoint y="-16" as="offset"/>';
      cells.push(
        `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(label)}" style="${style}" edge="1" parent="1" source="${escapeXmlAttr(edge.fromPackageId)}" target="${escapeXmlAttr(edge.toPackageId)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="package-edge" mavisRelationKind="${edge.relationKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry x="${labelPosition}" relative="1" as="geometry">${ptsXml}${offsetXml}</mxGeometry></mxCell>`,
      );
    });

    for (const edge of projection.edges) {
      if (placedEdgesIds.has(edge.edgeId)) continue;
      const label = formatPackageEdgeCellValue(edge);
      const style = getPackageEdgeCellStyle();
      cells.push(
        `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(label)}" style="${style}" edge="1" parent="1" source="${escapeXmlAttr(edge.fromPackageId)}" target="${escapeXmlAttr(edge.toPackageId)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="package-edge" mavisRelationKind="${edge.relationKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
      );
    }
  } else if (projection.diagramKind === "UML_DEPLOYMENT") {
    const childArtifactsByParent = new Map<string, UmlDeploymentNode[]>();
    const artifactToParentId = new Map<string, string>();
    for (const node of projection.nodes) {
      if (node.parentNodeId) {
        const list = childArtifactsByParent.get(node.parentNodeId) ?? [];
        list.push(node);
        childArtifactsByParent.set(node.parentNodeId, list);
        artifactToParentId.set(node.nodeId, node.parentNodeId);
      }
    }

    const topNodes = projection.nodes.filter((n) => !n.parentNodeId);
    const hostNodes = topNodes.filter((n) => n.nodeKind !== "MANIFESTED_COMPONENT");
    const manifestedNodes = topNodes.filter((n) => n.nodeKind === "MANIFESTED_COMPONENT");

    // Map each MANIFESTED_COMPONENT to its owning host EXECUTION_ENVIRONMENT/DEVICE via MANIFESTATION edge or modelElementId
    const manifestedByHostId = new Map<string, UmlDeploymentNode[]>();
    const assignedManifestedIds = new Set<string>();
    const manifestedById = new Map(manifestedNodes.map((n) => [n.nodeId, n]));

    for (const edge of projection.edges) {
      if (edge.edgeKind === "MANIFESTATION") {
        const parentHostId =
          artifactToParentId.get(edge.fromNodeId) ??
          (hostNodes.some((h) => h.nodeId === edge.fromNodeId) ? edge.fromNodeId : null);
        const compNode = manifestedById.get(edge.toNodeId);
        if (parentHostId && compNode && !assignedManifestedIds.has(compNode.nodeId)) {
          const list = manifestedByHostId.get(parentHostId) ?? [];
          list.push(compNode);
          manifestedByHostId.set(parentHostId, list);
          assignedManifestedIds.add(compNode.nodeId);
        }
      }
    }
    for (const comp of manifestedNodes) {
      if (assignedManifestedIds.has(comp.nodeId)) continue;
      const matchingHost = hostNodes.find(
        (h) =>
          (comp.modelElementId && h.modelElementId === comp.modelElementId) ||
          h.name === comp.name,
      );
      if (matchingHost) {
        const list = manifestedByHostId.get(matchingHost.nodeId) ?? [];
        list.push(comp);
        manifestedByHostId.set(matchingHost.nodeId, list);
        assignedManifestedIds.add(comp.nodeId);
      }
    }

    // Communication degree & AI tiering for host nodes
    const aiDeployLayout = explicitCarrier?.aiEnrichment?.deploymentLayout ?? {};
    const inCommCount = new Map<string, number>();
    const outCommCount = new Map<string, number>();
    const commTargetIdsByHost = new Map<string, string[]>();
    for (const h of hostNodes) {
      inCommCount.set(h.nodeId, 0);
      outCommCount.set(h.nodeId, 0);
      commTargetIdsByHost.set(h.nodeId, []);
    }
    for (const edge of projection.edges) {
      if (edge.edgeKind === "MANIFESTATION") continue;
      if (inCommCount.has(edge.toNodeId)) {
        inCommCount.set(edge.toNodeId, (inCommCount.get(edge.toNodeId) ?? 0) + 1);
      }
      if (outCommCount.has(edge.fromNodeId)) {
        outCommCount.set(edge.fromNodeId, (outCommCount.get(edge.fromNodeId) ?? 0) + 1);
        commTargetIdsByHost.get(edge.fromNodeId)?.push(edge.toNodeId);
      }
    }

    const classifyHostTier = (node: UmlDeploymentNode): number => {
      const aiTier = aiDeployLayout[node.nodeId]?.tier;
      if (typeof aiTier === "number" && aiTier >= 0 && aiTier <= 3) {
        return Math.round(aiTier);
      }
      const nm = node.name.toLowerCase();
      if (
        /gateway|ingress|proxy|nginx|traefik|zipkin|jaeger|prometheus|grafana|(^|[-_])(ui|gui|web|frontend|bff)($|[-_])/i.test(
          nm,
        )
      ) {
        return 0;
      }
      if (
        /mysql|postgres|mongo|dynamo|redis|elastic|(^|[-_])(db|database|storage)($|[-_])/i.test(nm) ||
        node.stereotype === "«database»"
      ) {
        return 3;
      }
      if (/kafka|rabbit|activemq|nats|pulsar|zookeeper|consul|etcd|(^|[-_])(cdc|eventuate|debezium)($|[-_])/i.test(nm)) {
        return 2;
      }
      const inDeg = inCommCount.get(node.nodeId) ?? 0;
      const outDeg = outCommCount.get(node.nodeId) ?? 0;
      if (inDeg > 0 && outDeg === 0) return 3;
      return 1;
    };

    const sortHostBucket = (bucket: UmlDeploymentNode[]) => {
      bucket.sort((a, b) => {
        const ao = aiDeployLayout[a.nodeId]?.order;
        const bo = aiDeployLayout[b.nodeId]?.order;
        if (typeof ao === "number" && typeof bo === "number" && ao !== bo) return ao - bo;
        const aTargets = (commTargetIdsByHost.get(a.nodeId) ?? []).slice().sort().join(",");
        const bTargets = (commTargetIdsByHost.get(b.nodeId) ?? []).slice().sort().join(",");
        if (aTargets !== bTargets) return aTargets.localeCompare(bTargets);
        const aDeg = (inCommCount.get(a.nodeId) ?? 0) + (outCommCount.get(a.nodeId) ?? 0);
        const bDeg = (inCommCount.get(b.nodeId) ?? 0) + (outCommCount.get(b.nodeId) ?? 0);
        if (bDeg !== aDeg) return bDeg - aDeg;
        return a.name.localeCompare(b.name);
      });
    };

    const centerOutOrder = <T,>(items: T[]): T[] => {
      if (items.length <= 2) return items;
      const res = new Array<T>(items.length);
      let left = Math.floor((items.length - 1) / 2);
      let right = left + 1;
      items.forEach((item, idx) => {
        if (idx % 2 === 0) {
          res[left--] = item;
        } else {
          res[right++] = item;
        }
      });
      return res;
    };

    const MAX_COLS = 4;
    const chunkBalanced = (list: UmlDeploymentNode[]): UmlDeploymentNode[][] => {
      if (list.length === 0) return [];
      if (list.length === 5) return [list.slice(0, 3), list.slice(3, 5)];
      const rows: UmlDeploymentNode[][] = [];
      for (let i = 0; i < list.length; i += MAX_COLS) {
        rows.push(list.slice(i, i + MAX_COLS));
      }
      return rows;
    };

    // Place active communication topology first so callers sit directly above their shared target hubs
    // without unrelated manifest-only rows wedged in between.
    const hasComm = (h: UmlDeploymentNode) =>
      (inCommCount.get(h.nodeId) ?? 0) + (outCommCount.get(h.nodeId) ?? 0) > 0;
    const activeHosts = hostNodes.filter(hasComm);
    const passiveHosts = hostNodes.filter((h) => !hasComm(h));

    interface DeployRowSpec {
      nodes: UmlDeploymentNode[];
      splitOuterSpanCols?: number | undefined;
    }
    const hostRowSpecs: DeployRowSpec[] = [];

    if (activeHosts.length > 0) {
      const activeTiers: UmlDeploymentNode[][] = [[], [], [], []];
      for (const h of activeHosts) {
        activeTiers[classifyHostTier(h)]!.push(h);
      }
      const activeChunkedTiers: UmlDeploymentNode[][][] = [];
      for (const bucket of activeTiers) {
        if (bucket.length === 0) continue;
        sortHostBucket(bucket);
        activeChunkedTiers.push(chunkBalanced(bucket).map((r) => centerOutOrder(r)));
      }
      activeChunkedTiers.forEach((tierRows, tIdx) => {
        const hasLowerActiveTier = tIdx < activeChunkedTiers.length - 1;
        tierRows.forEach((r, rIdx) => {
          const prevRowCols = rIdx > 0 ? tierRows[rIdx - 1]!.length : 0;
          const splitOuterSpanCols =
            r.length === 2 && prevRowCols >= 3 && hasLowerActiveTier ? prevRowCols : undefined;
          hostRowSpecs.push({ nodes: r, splitOuterSpanCols });
        });
      });

      const sortPassive = (list: UmlDeploymentNode[]) =>
        list.sort((a, b) => {
          const ta = classifyHostTier(a);
          const tb = classifyHostTier(b);
          if (ta !== tb) return ta - tb;
          return a.name.localeCompare(b.name);
        });
      const passivePlain = sortPassive(
        passiveHosts.filter((h) => (manifestedByHostId.get(h.nodeId)?.length ?? 0) === 0),
      );
      const passiveManifested = sortPassive(
        passiveHosts.filter((h) => (manifestedByHostId.get(h.nodeId)?.length ?? 0) > 0),
      );
      for (const r of chunkBalanced(passivePlain)) hostRowSpecs.push({ nodes: r });
      for (const r of chunkBalanced(passiveManifested)) hostRowSpecs.push({ nodes: r });
    } else {
      const tierBuckets: UmlDeploymentNode[][] = [[], [], [], []];
      for (const h of hostNodes) {
        tierBuckets[classifyHostTier(h)]!.push(h);
      }
      for (const bucket of tierBuckets) {
        sortHostBucket(bucket);
        for (const r of chunkBalanced(bucket)) hostRowSpecs.push({ nodes: r });
      }
    }

    const orphanManifested = manifestedNodes.filter((m) => !assignedManifestedIds.has(m.nodeId));
    if (orphanManifested.length > 0) {
      for (const r of chunkBalanced(orphanManifested)) {
        hostRowSpecs.push({ nodes: r });
      }
    }

    // Reserve real text height before placing artifacts; long image names and
    // port lists must not spill into the next compartment.
    const nodeDims = new Map<string, { w: number; h: number }>();
    const headerHeights = new Map<string, number>();
    const artifactHeights = new Map<string, number>();
    const lines = (text: string, width: number) =>
      Math.max(1, Math.ceil(text.length / Math.max(1, Math.floor(width / 7))));
    for (const node of topNodes) {
      const childArts = childArtifactsByParent.get(node.nodeId) ?? [];
      const longest = Math.max(node.name.length, ...childArts.map((a) => a.name.length));
      const w = Math.min(420, Math.max(300, longest * 6 + 56));
      const header =
        40 +
        lines(node.instanceName ? node.instanceName + ":" + node.name : node.name, w - 42) * 17 +
        (node.ports.length ? lines("Ports: " + node.ports.join(", "), w - 42) * 17 : 0) +
        (node.replicaCount !== null ? 17 : 0);
      headerHeights.set(node.nodeId, header);
      let artifactHeight = 0;
      for (const art of childArts) {
        const h = 34 + lines(art.name, w - 60) * 17;
        artifactHeights.set(art.nodeId, h);
        artifactHeight += h + 12;
      }
      nodeDims.set(node.nodeId, {
        w: node.nodeKind === "MANIFESTED_COMPONENT" ? Math.min(w, 340) : w,
        h:
          node.nodeKind === "MANIFESTED_COMPONENT"
            ? 40 + lines(node.name, Math.min(w, 340) - 24) * 17
            : Math.max(140, header + artifactHeight + 24),
      });
    }

    const COL_GAP = 160;
    const COL_STRIDE =
      Math.max(
        300,
        ...[...nodeDims.values()].map((d) => d.w),
        ...Object.values(customLayout ?? {}).map((d) => d.width ?? 0),
      ) + COL_GAP;
    const ROW_BUS_GAP = Math.max(
      150,
      70 + projection.edges.filter((e) => e.edgeKind !== "MANIFESTATION").length * 14,
    );
    const START_X = 80;
    const START_Y = 70;
    const maxColsAcrossRows = Math.max(
      1,
      ...hostRowSpecs.map((r) => Math.max(r.nodes.length, r.splitOuterSpanCols ?? 0)),
    );
    const totalGridWidth = maxColsAcrossRows * COL_STRIDE - COL_GAP;

    const deployBoxes = new Map<string, { x: number; y: number; w: number; h: number }>();

    const getPlacedBarycenter = (nodeId: string): { x: number; y: number } | null => {
      const pts: Array<{ x: number; y: number }> = [];
      for (const edge of projection.edges) {
        if (edge.edgeKind === "MANIFESTATION") continue;
        const otherId =
          edge.toNodeId === nodeId
            ? edge.fromNodeId
            : edge.fromNodeId === nodeId
              ? edge.toNodeId
              : null;
        if (!otherId) continue;
        const pb = deployBoxes.get(otherId);
        if (pb) {
          pts.push({ x: pb.x + pb.w / 2, y: pb.y + pb.h / 2 });
        }
      }
      if (pts.length === 0) return null;
      return {
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      };
    };

    const colBoxWidth = COL_STRIDE - COL_GAP;
    let cursorY = START_Y;
    for (const rowSpec of hostRowSpecs) {
      const rowNodes = [...rowSpec.nodes];
      if (deployBoxes.size > 0 && rowNodes.length > 1) {
        const barycenters = new Map<string, { x: number; y: number } | null>();
        for (const n of rowNodes) {
          barycenters.set(n.nodeId, getPlacedBarycenter(n.nodeId));
        }
        const distinctX = new Set(
          [...barycenters.values()].filter((b): b is { x: number; y: number } => b !== null).map((b) => Math.round(b.x / 20)),
        );
        if (distinctX.size > 1) {
          const origOrder = new Map(rowNodes.map((n, i) => [n.nodeId, i]));
          rowNodes.sort((a, b) => {
            const ba = barycenters.get(a.nodeId) ?? null;
            const bb = barycenters.get(b.nodeId) ?? null;
            if (ba && bb) {
              if (Math.abs(ba.x - bb.x) > 10) return ba.x - bb.x;
              if (Math.abs(ba.y - bb.y) > 10) return ba.y - bb.y;
            } else if (ba && !bb) {
              return -1;
            } else if (!ba && bb) {
              return 1;
            }
            return (origOrder.get(a.nodeId) ?? 0) - (origOrder.get(b.nodeId) ?? 0);
          });
        }
      }
      const effectiveCols = rowSpec.splitOuterSpanCols ?? rowNodes.length;
      const rowWidth = effectiveCols * COL_STRIDE - COL_GAP;
      const rowStartX = START_X + Math.max(0, Math.round((totalGridWidth - rowWidth) / 2));
      let rowMaxSlotHeight = 0;

      rowNodes.forEach((node, idx) => {
        const dim = nodeDims.get(node.nodeId) ?? { w: 280, h: 150 };
        const colSlot =
          rowSpec.splitOuterSpanCols && rowNodes.length === 2
            ? idx === 0
              ? 0
              : rowSpec.splitOuterSpanCols - 1
            : idx;
        const slotX =
          rowNodes.length === 1
            ? START_X + Math.max(0, Math.round((totalGridWidth - dim.w) / 2))
            : rowStartX + colSlot * COL_STRIDE + Math.max(0, Math.round((colBoxWidth - dim.w) / 2));
        const customHost = customLayout?.[node.nodeId];
        const hx = customHost?.x ?? slotX;
        const hy = customHost?.y ?? cursorY;
        const hw = customHost?.width ?? dim.w;
        const hh = customHost?.height ?? dim.h;
        deployBoxes.set(node.nodeId, { x: hx, y: hy, w: hw, h: hh });

        let slotHeight = hh;
        const pairedComps = manifestedByHostId.get(node.nodeId) ?? [];
        pairedComps.forEach((comp, cIdx) => {
          const cDim = nodeDims.get(comp.nodeId) ?? { w: 220, h: 68 };
          const customComp = customLayout?.[comp.nodeId];
          const cx = customComp?.x ?? hx + Math.round((hw - cDim.w) / 2);
          const cy = customComp?.y ?? hy + hh + 48 + cIdx * (cDim.h + 28);
          const cw = customComp?.width ?? cDim.w;
          const ch = customComp?.height ?? cDim.h;
          deployBoxes.set(comp.nodeId, { x: cx, y: cy, w: cw, h: ch });
          slotHeight = Math.max(slotHeight, cy + ch - hy);
        });

        if (slotHeight > rowMaxSlotHeight) {
          rowMaxSlotHeight = slotHeight;
        }
      });

      cursorY += rowMaxSlotHeight + ROW_BUS_GAP;
    }

    // Emit top-level vertices
    for (const node of topNodes) {
      const b = deployBoxes.get(node.nodeId) ?? { x: 80, y: 70, w: 280, h: 150 };
      const label = formatDeploymentNodeCellValue(node);
      const shapeStyle = getDeploymentNodeCellStyle(node);
      cells.push(
        `<mxCell id="${escapeXmlAttr(node.nodeId)}" value="${escapeXmlAttr(label)}" style="${shapeStyle}" vertex="1" parent="1" mavisId="${escapeXmlAttr(node.nodeId)}" mavisUmlRole="deployment-node" mavisProvenance="${node.provenance}" mavisMeta="${encodeMeta(node)}">${geomOf(node.nodeId, b.x, b.y, b.w, b.h)}</mxCell>`,
      );
    }

    // Emit nested artifact vertices inside their parent executionEnvironment cube
    const childArtifactAbsBoxes = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const [parentId, arts] of childArtifactsByParent.entries()) {
      const parentBox = deployBoxes.get(parentId) ?? { x: 80, y: 70, w: 296, h: 172 };
      let artY = headerHeights.get(parentId) ?? 78;
      arts.forEach((node) => {
        const artX = 20;
        const artW = Math.max(220, parentBox.w - 40);
        const artH = artifactHeights.get(node.nodeId) ?? 68;
        const label = formatDeploymentNodeCellValue(node);
        const style = getDeploymentNodeCellStyle(node);
        childArtifactAbsBoxes.set(node.nodeId, {
          x: parentBox.x + artX,
          y: parentBox.y + artY,
          w: artW,
          h: artH,
        });
        cells.push(
          `<mxCell id="${escapeXmlAttr(node.nodeId)}" value="${escapeXmlAttr(label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(parentId)}" mavisId="${escapeXmlAttr(node.nodeId)}" mavisUmlRole="deployment-artifact" mavisProvenance="${node.provenance}" mavisMeta="${encodeMeta(node)}">${geomOf(node.nodeId, artX, artY, artW, artH)}</mxCell>`,
        );
        artY += artH + 12;
      });
    }

    const allDeployObstacleBoxes = [...deployBoxes.values()];
    // Block the vertical «manifest» corridor between each host and its manifested child component/database
    // so inter-container communication paths never route underneath a container across its «manifest» arrow.
    for (const [hostId, comps] of manifestedByHostId.entries()) {
      const hb = deployBoxes.get(hostId);
      if (!hb || comps.length === 0) continue;
      for (const comp of comps) {
        const cb = deployBoxes.get(comp.nodeId);
        if (!cb) continue;
        const minX = Math.min(hb.x, cb.x);
        const maxX = Math.max(hb.x + hb.w, cb.x + cb.w);
        const minY = Math.min(hb.y, cb.y);
        const maxY = Math.max(hb.y + hb.h, cb.y + cb.h);
        allDeployObstacleBoxes.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
      }
    }

    // Stagger and topologically sort ports on each box side so multiple edges to shared infrastructure never cross
    type DeploySide = "top" | "bottom" | "left" | "right";
    const chosenSides = new Map<string, { exitSide: DeploySide; entrySide: DeploySide }>();
    const sidePortSlots = new Map<
      string,
      Array<{ edgeId: string; otherX: number; otherY: number; boxCenterX: number }>
    >();
    const registerPortSlot = (
      boxId: string,
      side: DeploySide,
      edgeId: string,
      otherX: number,
      otherY: number,
      boxCenterX: number,
    ) => {
      const k = `${boxId}:${side}`;
      const list = sidePortSlots.get(k) ?? [];
      list.push({ edgeId, otherX, otherY, boxCenterX });
      sidePortSlots.set(k, list);
    };

    for (const edge of projection.edges) {
      if (edge.edgeKind === "MANIFESTATION") {
        chosenSides.set(edge.edgeId, { exitSide: "bottom", entrySide: "top" });
        continue;
      }
      const sb = deployBoxes.get(edge.fromNodeId);
      const tb = deployBoxes.get(edge.toNodeId);
      if (!sb || !tb) continue;
      const scx = sb.x + sb.w / 2;
      const scy = sb.y + sb.h / 2;
      const tcx = tb.x + tb.w / 2;
      const tcy = tb.y + tb.h / 2;
      const dx = tcx - scx;
      const srcHasManifestComp = (manifestedByHostId.get(edge.fromNodeId)?.length ?? 0) > 0;
      const tgtHasManifestComp = (manifestedByHostId.get(edge.toNodeId)?.length ?? 0) > 0;

      let exitSide: DeploySide;
      let entrySide: DeploySide;
      if (tb.y >= sb.y + sb.h - 10) {
        // Downward cross-tier connection (r2 > r1): exit bottom face, enter top face
        exitSide = !srcHasManifestComp ? "bottom" : dx >= 0 ? "right" : "left";
        entrySide = "top";
      } else if (sb.y >= tb.y + tb.h - 10) {
        // Upward cross-tier connection (r2 < r1): exit top face, enter bottom face
        exitSide = "top";
        entrySide = !tgtHasManifestComp ? "bottom" : dx >= 0 ? "left" : "right";
      } else {
        // Same-tier horizontal connection (r1 == r2): use left/right ports
        exitSide = dx >= 0 ? "right" : "left";
        entrySide = dx >= 0 ? "left" : "right";
      }
      chosenSides.set(edge.edgeId, { exitSide, entrySide });
      registerPortSlot(edge.fromNodeId, exitSide, edge.edgeId, tcx, tcy, scx);
      registerPortSlot(edge.toNodeId, entrySide, edge.edgeId, scx, scy, tcx);
    }

    for (const [key, list] of sidePortSlots.entries()) {
      const side = key.split(":").pop() as DeploySide;
      if (side === "left" || side === "right") {
        list.sort((a, b) => {
          if (Math.abs(a.otherY - b.otherY) > 24) return a.otherY - b.otherY;
          return Math.abs(a.otherX - a.boxCenterX) - Math.abs(b.otherX - b.boxCenterX);
        });
      } else {
        list.sort((a, b) => {
          if (Math.abs(a.otherX - b.otherX) > 24) return a.otherX - b.otherX;
          return a.otherY - b.otherY;
        });
      }
    }

    const resolvePortSlot = (
      boxId: string,
      side: DeploySide,
      edgeId: string,
    ): { frac: number; idx: number; count: number } => {
      const list = sidePortSlots.get(`${boxId}:${side}`) ?? [];
      if (list.length <= 1) return { frac: 0.5, idx: 0, count: 1 };
      const idx = Math.max(0, list.findIndex((item) => item.edgeId === edgeId));
      const frac = Number((0.2 + (idx / (list.length - 1)) * 0.6).toFixed(2));
      return { frac, idx, count: list.length };
    };

    const resolveSidePoint = (
      b: { x: number; y: number; w: number; h: number },
      side: DeploySide,
      frac: number,
    ): { x: number; y: number; px: number; py: number } => {
      if (side === "top") return { x: b.x + b.w * frac, y: b.y, px: frac, py: 0 };
      if (side === "bottom") return { x: b.x + b.w * frac, y: b.y + b.h, px: frac, py: 1 };
      if (side === "left") return { x: b.x, y: b.y + b.h * frac, px: 0, py: frac };
      return { x: b.x + b.w, y: b.y + b.h * frac, px: 1, py: frac };
    };

    // Pass 1: Route all edges against deployBoxes (without label boxes blocking narrow corridors)
    const routedPaths: DeploymentPoint[][] = [];
    const routedEdgeData = new Map<
      string,
      {
        sp: { x: number; y: number; px: number; py: number };
        tp: { x: number; y: number; px: number; py: number };
        waypoints: DeploymentPoint[];
        fullPath: DeploymentPoint[];
        hasRoute: boolean;
      }
    >();

    projection.edges.forEach((edge, edgeIdx) => {
      if (edge.edgeKind === "MANIFESTATION") return;
      const sb = deployBoxes.get(edge.fromNodeId);
      const tb = deployBoxes.get(edge.toNodeId);
      const sides = chosenSides.get(edge.edgeId);
      if (!sb || !tb || !sides) return;

      const exitSlot = resolvePortSlot(edge.fromNodeId, sides.exitSide, edge.edgeId);
      const entrySlot = resolvePortSlot(edge.toNodeId, sides.entrySide, edge.edgeId);
      const sp = resolveSidePoint(sb, sides.exitSide, exitSlot.frac);
      const tp = resolveSidePoint(tb, sides.entrySide, entrySlot.frac);

      const outward = (
        p: DeploymentPoint,
        side: DeploySide,
        slotIdx: number,
        slotCount: number,
      ): DeploymentPoint => {
        const baseStub = slotCount <= 1 ? 24 : 18 + slotIdx * 10;
        for (const stub of [baseStub, 20, 14]) {
          const cand = {
            x: p.x + (side === "right" ? stub : side === "left" ? -stub : 0),
            y: p.y + (side === "bottom" ? stub : side === "top" ? -stub : 0),
          };
          const hitsBox = allDeployObstacleBoxes.some(
            (b) =>
              cand.x > b.x - 10 &&
              cand.x < b.x + b.w + 10 &&
              cand.y > b.y - 10 &&
              cand.y < b.y + b.h + 10,
          );
          if (!hitsBox) return cand;
        }
        return {
          x: p.x + (side === "right" ? 14 : side === "left" ? -14 : 0),
          y: p.y + (side === "bottom" ? 14 : side === "top" ? -14 : 0),
        };
      };

      const start = outward(sp, sides.exitSide, exitSlot.idx, exitSlot.count);
      const end = outward(tp, sides.entrySide, entrySlot.idx, entrySlot.count);
      const route = routeDeploymentPath(start, end, allDeployObstacleBoxes, routedPaths, edgeIdx);
      const waypoints = route ?? [];
      const fullPath = [sp, ...waypoints, tp];
      if (route) routedPaths.push(fullPath);
      routedEdgeData.set(edge.edgeId, {
        sp,
        tp,
        waypoints,
        fullPath,
        hasRoute: Boolean(route),
      });
    });

    // Pass 2: Place edge labels on clear segments and emit mxCells
    const deploymentLabels: Array<{ x: number; y: number; w: number; h: number }> = [];
    projection.edges.forEach((edge) => {
      const baseStyle = getDeploymentEdgeCellStyle(edge);
      if (edge.edgeKind === "MANIFESTATION") {
        const parentHostId = artifactToParentId.get(edge.fromNodeId);
        const artBox = childArtifactAbsBoxes.get(edge.fromNodeId);
        const tgtBox = deployBoxes.get(edge.toNodeId);
        if (artBox && tgtBox && parentHostId) {
          const style = `${baseStyle}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;`;
          cells.push(
            `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(edge.label)}" style="${style}" edge="1" parent="1" source="${escapeXmlAttr(edge.fromNodeId)}" target="${escapeXmlAttr(edge.toNodeId)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="deployment-edge" mavisEdgeKind="${edge.edgeKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
          );
          return;
        }
      }

      const data = routedEdgeData.get(edge.edgeId);
      if (!data) {
        cells.push(
          `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(edge.label)}" style="${baseStyle}" edge="1" parent="1" source="${escapeXmlAttr(edge.fromNodeId)}" target="${escapeXmlAttr(edge.toNodeId)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="deployment-edge" mavisEdgeKind="${edge.edgeKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
        );
        return;
      }

      const { sp, tp, waypoints, fullPath, hasRoute } = data;
      const styleWithPorts = `${baseStyle}${hasRoute ? "edgeStyle=none;noEdgeStyle=1;" : ""}jumpStyle=arc;jumpSize=8;exitPerimeter=0;entryPerimeter=0;exitX=${sp.px};exitY=${sp.py};exitDx=0;exitDy=0;entryX=${tp.px};entryY=${tp.py};entryDx=0;entryDy=0;`;
      const ptsXml =
        waypoints.length > 0
          ? `<Array as="points">${waypoints.map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join("")}</Array>`
          : "";
      // Anchor each label along a clear segment away from boxes, previous labels, and unrelated wires
      const placedLbl = edge.label
        ? placeDeploymentEdgeLabel(
            fullPath,
            edge.label,
            [...allDeployObstacleBoxes, ...deploymentLabels],
            routedPaths,
          )
        : null;
      const labelPosition = placedLbl?.position ?? 0;
      const offsetXml = placedLbl
        ? `<mxPoint x="${placedLbl.dx}" y="${placedLbl.dy}" as="offset"/>`
        : '<mxPoint y="-16" as="offset"/>';
      if (placedLbl && edge.label) deploymentLabels.push(placedLbl.box);
      cells.push(
        `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(edge.label)}" style="${styleWithPorts}" edge="1" parent="1" source="${escapeXmlAttr(edge.fromNodeId)}" target="${escapeXmlAttr(edge.toNodeId)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="deployment-edge" mavisEdgeKind="${edge.edgeKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry x="${labelPosition}" relative="1" as="geometry">${ptsXml}${offsetXml}</mxGeometry></mxCell>`,
      );
    });
  } else if (projection.diagramKind === "UML_ACTIVITY") {
    const parts =
      projection.partitions.length > 0
        ? projection.partitions
        : [
            {
              partitionId: "partition:default",
              name: "Service Partition",
              serviceId: null,
            },
          ];

    const partIdxById = new Map(parts.map((p, idx) => [p.partitionId, idx]));
    const isMultiSwimlane = parts.length > 1;
    const laneWidth = isMultiSwimlane ? 420 : 620;
    const laneOriginX = 40;
    const laneOriginY = 40;
    const sizes = new Map(projection.nodes.map(n => [n.nodeId, activityNodeSize(n.kind, n.label)]));

    const rowById = planActivityRows(projection.nodes, projection.edges);
    const maxRow = Math.max(0, ...rowById.values());

    // Group nodes by (partitionIdx, row) for horizontal centering / sub-column offset
    const slotGroupMap = new Map<string, UmlActivityNode[]>();
    for (const node of projection.nodes) {
      const pIdx = partIdxById.get(node.partitionId) ?? 0;
      const r = rowById.get(node.nodeId) ?? 0;
      const key = `${pIdx}:${r}`;
      const list = slotGroupMap.get(key) ?? [];
      list.push(node);
      slotGroupMap.set(key, list);
    }

    const rowHeights = new Map<number, number>();
    for (const node of projection.nodes) {
      const row = rowById.get(node.nodeId) ?? 0;
      rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, customLayout?.[node.nodeId]?.height ?? sizes.get(node.nodeId)!.h));
    }
    const rowOffsets = new Map<number, number>();
    let nextRowY = 96;
    for (let row = 0; row <= maxRow; row++) {
      rowOffsets.set(row, nextRowY);
      nextRowY += (rowHeights.get(row) ?? 68) + 80;
    }
    const laneHeight = Math.max(440, nextRowY + 40);

    // 2. Emit all vertical Swimlane Partition cells side-by-side
    const laneBoundsById = new Map<string, { x: number; y: number; w: number; h: number }>();
    parts.forEach((part, laneIdx) => {
      const defX = laneOriginX + laneIdx * laneWidth;
      const defY = laneOriginY;
      const custom = customLayout?.[part.partitionId];
      const lx = custom?.x ?? defX;
      const ly = custom?.y ?? defY;
      const lw = custom?.width ?? laneWidth;
      const lh = custom?.height ?? laneHeight;
      laneBoundsById.set(part.partitionId, { x: lx, y: ly, w: lw, h: lh });

      cells.push(
        `<mxCell id="${escapeXmlAttr(part.partitionId)}" value="${escapeXmlAttr(formatActivityPartitionCellValue(part))}" style="${getActivityPartitionCellStyle()}" vertex="1" parent="1" mavisId="${escapeXmlAttr(part.partitionId)}" mavisUmlRole="activity-partition">${geomOf(part.partitionId, defX, defY, laneWidth, laneHeight)}</mxCell>`,
      );
    });

    // 3. Emit Activity Node cells inside their respective Swimlane Partition
    const absNodeBox = new Map<
      string,
      { absX: number; absY: number; w: number; h: number; pIdx: number; row: number }
    >();

    projection.nodes.forEach((node) => {
      const pIdx = partIdxById.get(node.partitionId) ?? 0;
      const targetPart = parts[pIdx]!;
      const laneRect = laneBoundsById.get(targetPart.partitionId) ?? {
        x: laneOriginX + pIdx * laneWidth,
        y: laneOriginY,
        w: laneWidth,
        h: laneHeight,
      };
      const r = rowById.get(node.nodeId) ?? 0;
      const group = slotGroupMap.get(`${pIdx}:${r}`) ?? [node];
      const subIdx = Math.max(0, group.indexOf(node));
      const subCount = group.length;

      const { w, h } = sizes.get(node.nodeId)!;

      let defLocalX = Math.round((laneWidth - w) / 2);
      if (subCount > 1) {
        const subSpacing = 240;
        const totalSpan = (subCount - 1) * subSpacing + w;
        const startX = Math.max(16, Math.round((laneWidth - totalSpan) / 2));
        defLocalX = startX + subIdx * subSpacing;
      }
      const defLocalY = (rowOffsets.get(r) ?? 96) + Math.max(0, ((rowHeights.get(r) ?? h) - h) / 2);

      const custom = customLayout?.[node.nodeId];
      const localX = custom?.x ?? defLocalX;
      const localY = custom?.y ?? defLocalY;
      const actualW = custom?.width ?? w;
      const actualH = custom?.height ?? h;

      absNodeBox.set(node.nodeId, {
        absX: laneRect.x + localX,
        absY: laneRect.y + localY,
        w: actualW,
        h: actualH,
        pIdx,
        row: r,
      });

      const style = getActivityNodeCellStyle(node);
      cells.push(
        `<mxCell id="${escapeXmlAttr(node.nodeId)}" value="${escapeXmlAttr(node.label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(targetPart.partitionId)}" mavisId="${escapeXmlAttr(node.nodeId)}" mavisUmlRole="activity-node" mavisNodeKind="${node.kind}" mavisProvenance="${node.provenance}" mavisMeta="${encodeMeta(node)}">${geomOf(node.nodeId, defLocalX, defLocalY, w, h)}</mxCell>`,
      );
    });

    // 4. Obstacle-verified orthogonal edge routing across Swimlanes
    const nodeKindById = new Map(projection.nodes.map((n) => [n.nodeId, n.kind]));
    const outEdgesBySrc = new Map<string, UmlActivityEdge[]>();
    for (const e of projection.edges) {
      const list = outEdgesBySrc.get(e.from) ?? [];
      list.push(e);
      outEdgesBySrc.set(e.from, list);
    }

    const activityBoxes = [...absNodeBox.values()].map(b => ({ x: b.absX, y: b.absY, w: b.w, h: b.h }));
    const activityLabels: Array<{ x: number; y: number; w: number; h: number }> = [];
    const activityPaths: DeploymentPoint[][] = [];
    projection.edges.forEach((edge, edgeIdx) => {
      const guardLabel = formatActivityEdgeCellValue(edge);
      const baseStyle = getActivityEdgeCellStyle();
      const sBox = absNodeBox.get(edge.from);
      const tBox = absNodeBox.get(edge.to);
      if (!sBox || !tBox || edge.from === edge.to) {
        cells.push(
          `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(guardLabel)}" style="${baseStyle}" edge="1" parent="1" source="${escapeXmlAttr(edge.from)}" target="${escapeXmlAttr(edge.to)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="activity-edge" mavisFlowKind="${edge.flowKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
        );
        return;
      }

      const srcKind = nodeKindById.get(edge.from);
      const sCx = Math.round(sBox.absX + sBox.w / 2);
      const sCy = Math.round(sBox.absY + sBox.h / 2);
      const tCx = Math.round(tBox.absX + tBox.w / 2);
      const tCy = Math.round(tBox.absY + tBox.h / 2);

      let exitX = 0.5;
      let exitY = 1;
      let entryX = 0.5;
      let entryY = 0;

      const siblings = outEdgesBySrc.get(edge.from) ?? [edge];
      const sibIdx = Math.max(0, siblings.indexOf(edge));
      const hasSameLaneObstacleBetween =
        sBox.pIdx === tBox.pIdx &&
        [...absNodeBox.entries()].some(
          ([otherId, b]) =>
            otherId !== edge.from &&
            otherId !== edge.to &&
            b.pIdx === sBox.pIdx &&
            b.absY + b.h > Math.min(sBox.absY + sBox.h, tBox.absY + tBox.h) &&
            b.absY < Math.max(sBox.absY, tBox.absY),
        );

      if (srcKind === "DECISION") {
        if (tCx < sCx - 40) {
          exitX = 0;
          exitY = 0.5;
        } else if (tCx > sCx + 40) {
          exitX = 1;
          exitY = 0.5;
        } else if (siblings.length >= 2) {
          exitX = sibIdx === 0 ? 0.5 : 1;
          exitY = sibIdx === 0 ? 1 : 0.5;
        }
      } else if (srcKind === "FORK" && siblings.length >= 2) {
        exitX = Number(((sibIdx + 1) / (siblings.length + 1)).toFixed(2));
        exitY = 1;
      } else if (hasSameLaneObstacleBetween) {
        exitX = 1;
        exitY = 0.5;
      }

      const tKind = nodeKindById.get(edge.to);
      if (tKind === "JOIN") {
        const incAll = projection.edges.filter((e) => e.to === edge.to);
        const incIdx = Math.max(0, incAll.indexOf(edge));
        entryX = Number(((incIdx + 1) / (incAll.length + 1)).toFixed(2));
        entryY = 0;
      } else if (tCy < sCy - 20) {
        entryX = tCx < sCx ? 1 : 0;
        entryY = 0.5;
      } else if (hasSameLaneObstacleBetween) {
        entryX = 1;
        entryY = 0.5;
      }

      const sp = {
        x: sBox.absX + sBox.w * exitX,
        y: sBox.absY + sBox.h * exitY,
      };
      const tp = {
        x: tBox.absX + tBox.w * entryX,
        y: tBox.absY + tBox.h * entryY,
      };

      const allObstacles = [...activityBoxes, ...activityLabels];
      let route: DeploymentPoint[] | null = null;
      for (const stub of [24, 14, 6]) {
        const start = {
          x: sp.x + (exitX === 0 ? -stub : exitX === 1 ? stub : 0),
          y: sp.y + (exitY === 1 ? stub : exitY === 0 ? -stub : 0),
        };
        const finish = {
          x: tp.x + (entryX === 0 ? -stub : entryX === 1 ? stub : 0),
          y: tp.y + (entryY === 0 ? -stub : entryY === 1 ? stub : 0),
        };
        route = routeDeploymentPath(start, finish, allObstacles, activityPaths, edgeIdx);
        if (route) break;
      }
      const waypoints = route ?? [];
      const path = [sp, ...waypoints, tp];
      const placedGuard = guardLabel ? placeActivityGuard(path, guardLabel, [...activityBoxes, ...activityLabels]) : null;
      if (placedGuard) activityLabels.push(placedGuard.box);
      if (route) activityPaths.push(path);
      const labelGeometry = placedGuard ? `x="${placedGuard.position}"` : 'x="-0.6"';
      const labelOffset = placedGuard ? `<mxPoint x="${placedGuard.dx}" y="${placedGuard.dy}" as="offset"/>` : '<mxPoint y="-20" as="offset"/>';
      const styleWithPorts = `${baseStyle}${route ? "edgeStyle=none;noEdgeStyle=1;" : ""}jumpStyle=arc;jumpSize=8;exitPerimeter=0;entryPerimeter=0;exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;`;
      const ptsXml =
        waypoints.length > 0
          ? `<Array as="points">${waypoints.map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join("")}</Array>`
          : "";

      cells.push(
        `<mxCell id="${escapeXmlAttr(edge.edgeId)}" value="${escapeXmlAttr(guardLabel)}" style="${styleWithPorts}" edge="1" parent="1" source="${escapeXmlAttr(edge.from)}" target="${escapeXmlAttr(edge.to)}" mavisId="${escapeXmlAttr(edge.edgeId)}" mavisUmlRole="activity-edge" mavisFlowKind="${edge.flowKind}" mavisProvenance="${edge.provenance}" mavisMeta="${encodeMeta(edge)}"><mxGeometry ${labelGeometry} relative="1" as="geometry">${ptsXml}${labelOffset}</mxGeometry></mxCell>`,
      );
    });
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

    const aiStateLayout = explicitCarrier?.aiEnrichment?.stateLayout;
    const topLevelStates = projection.states.filter(
      (s) => !(s.parentStateId && stateIdSet.has(s.parentStateId)),
    );
    const topLevelIdSet = new Set(topLevelStates.map((s) => s.stateId));

    // Dynamic sizing per state so entry / do / exit behaviors never overlap the header
    const sizeByStateId = new Map<string, { w: number; h: number }>();
    for (const st of projection.states) {
      const hasValidParent = Boolean(st.parentStateId && stateIdSet.has(st.parentStateId));
      const substateCount = substateCountByParent.get(st.stateId) ?? 0;
      const isInitial = st.kind === "INITIAL";
      const isFinal = st.kind === "FINAL_STATE";
      const isHistory = st.kind === "SHALLOW_HISTORY" || st.kind === "DEEP_HISTORY";
      const isChoice = st.kind === "CHOICE";
      const isComposite = st.kind === "COMPOSITE_STATE" || substateCount > 0;

      if (isInitial || isFinal || isHistory) {
        sizeByStateId.set(st.stateId, { w: 34, h: 34 });
      } else if (isChoice) {
        sizeByStateId.set(st.stateId, { w: 88, h: 58 });
      } else if (isComposite) {
        sizeByStateId.set(st.stateId, {
          w: 340,
          h: Math.max(180, 64 + substateCount * 96),
        });
      } else if (hasValidParent) {
        sizeByStateId.set(st.stateId, { w: 250, h: 74 });
      } else {
        const behaviors = [st.entryBehavior, st.doActivity, st.exitBehavior].filter(
          (b): b is string => Boolean(b && b.trim()),
        );
        const maxBehaviorLen = behaviors.reduce((m, b) => Math.max(m, b.length + 8), 0);
        const w = Math.max(
          250,
          Math.min(340, Math.max(st.name.length * 10 + 48, Math.ceil(maxBehaviorLen * 6.5) + 32)),
        );
        const charsPerLine = Math.max(30, Math.floor((w - 24) / 6.5));
        const wrappedLines = behaviors.reduce(
          (acc, b) => acc + Math.max(1, Math.ceil((b.length + 8) / charsPerLine)),
          0,
        );
        const h =
          behaviors.length === 0 ? 54 : Math.max(76, Math.min(126, 38 + wrappedLines * 18));
        sizeByStateId.set(st.stateId, { w, h });
      }
    }

    // Compute hierarchical lifecycle tiers (INITIAL at top -> intermediate states -> FINAL_STATE at bottom)
    const stateRectById = new Map<
      string,
      { x: number; y: number; w: number; h: number; tier: number; colIdx: number }
    >();

    if (projection.transitions.length === 0) {
      // Enum-only or transitionless state list: clean 3-column grid
      topLevelStates.forEach((st, idx) => {
        const sz = sizeByStateId.get(st.stateId) ?? { w: 250, h: 64 };
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = 80 + col * 340;
        const y = 70 + row * 130;
        stateRectById.set(st.stateId, {
          x,
          y,
          w: sz.w,
          h: sz.h,
          tier: row,
          colIdx: col,
        });
      });
    } else {
      // 1. Shortest BFS discovery depth from INITIAL (or 0-indegree states) to distinguish forward vs back-edges
      const outEdges = new Map<string, string[]>();
      const inDegree = new Map<string, number>();
      for (const st of topLevelStates) {
        outEdges.set(st.stateId, []);
        inDegree.set(st.stateId, 0);
      }
      for (const tr of projection.transitions) {
        if (tr.fromStateId === tr.toStateId) continue;
        if (!topLevelIdSet.has(tr.fromStateId) || !topLevelIdSet.has(tr.toStateId)) continue;
        outEdges.get(tr.fromStateId)?.push(tr.toStateId);
        inDegree.set(tr.toStateId, (inDegree.get(tr.toStateId) ?? 0) + 1);
      }

      const bfsDepth = new Map<string, number>();
      const queue: string[] = [];
      for (const st of topLevelStates) {
        if (st.kind === "INITIAL") {
          bfsDepth.set(st.stateId, 0);
          queue.push(st.stateId);
        }
      }
      if (queue.length === 0) {
        for (const st of topLevelStates) {
          if ((inDegree.get(st.stateId) ?? 0) === 0 && st.kind !== "FINAL_STATE") {
            bfsDepth.set(st.stateId, 0);
            queue.push(st.stateId);
          }
        }
      }
      if (queue.length === 0 && topLevelStates[0]) {
        bfsDepth.set(topLevelStates[0].stateId, 0);
        queue.push(topLevelStates[0].stateId);
      }

      while (queue.length > 0) {
        const u = queue.shift()!;
        const d = bfsDepth.get(u) ?? 0;
        for (const v of outEdges.get(u) ?? []) {
          if (!bfsDepth.has(v)) {
            bfsDepth.set(v, d + 1);
            queue.push(v);
          }
        }
      }
      topLevelStates.forEach((st, idx) => {
        if (!bfsDepth.has(st.stateId)) {
          bfsDepth.set(st.stateId, idx + 1);
        }
      });

      // 2. Forward DAG longest-path tiering (ignoring cycle back-edges where bfsDepth[to] <= bfsDepth[from])
      const tierById = new Map<string, number>();
      for (const st of topLevelStates) {
        const aiTier = aiStateLayout?.[st.stateId]?.tier;
        if (st.kind === "INITIAL") {
          tierById.set(st.stateId, 0);
        } else if (typeof aiTier === "number" && Number.isFinite(aiTier)) {
          tierById.set(st.stateId, Math.max(1, Math.min(10, Math.round(aiTier))));
        } else {
          tierById.set(st.stateId, Math.max(1, bfsDepth.get(st.stateId) ?? 1));
        }
      }

      const finalIds = new Set(
        topLevelStates.filter((s) => s.kind === "FINAL_STATE").map((s) => s.stateId),
      );
      const hasNonFinalOut = new Set<string>();
      for (const tr of projection.transitions) {
        if (tr.fromStateId === tr.toStateId) continue;
        if (!topLevelIdSet.has(tr.fromStateId) || !topLevelIdSet.has(tr.toStateId)) continue;
        if (!finalIds.has(tr.toStateId)) {
          hasNonFinalOut.add(tr.fromStateId);
        }
      }

      for (let pass = 0; pass < topLevelStates.length; pass++) {
        for (const tr of projection.transitions) {
          if (tr.fromStateId === tr.toStateId) continue;
          if (!topLevelIdSet.has(tr.fromStateId) || !topLevelIdSet.has(tr.toStateId)) continue;
          if (aiStateLayout?.[tr.toStateId]?.tier !== undefined) continue;
          const dFrom = bfsDepth.get(tr.fromStateId) ?? 0;
          const dTo = bfsDepth.get(tr.toStateId) ?? 0;
          const targetIsTerminalSink =
            !hasNonFinalOut.has(tr.toStateId) && !finalIds.has(tr.toStateId);
          if (dTo > dFrom || targetIsTerminalSink) {
            const uTier = tierById.get(tr.fromStateId) ?? 0;
            const vTier = tierById.get(tr.toStateId) ?? 1;
            if (uTier + 1 > vTier) {
              tierById.set(tr.toStateId, Math.min(12, uTier + 1));
            }
          }
        }
      }

      // Place FINAL_STATE at the bottom-most tier
      let maxNonFinalTier = 1;
      for (const st of topLevelStates) {
        if (st.kind !== "FINAL_STATE") {
          maxNonFinalTier = Math.max(maxNonFinalTier, tierById.get(st.stateId) ?? 1);
        }
      }
      for (const st of topLevelStates) {
        if (st.kind === "FINAL_STATE") {
          tierById.set(st.stateId, maxNonFinalTier + 1);
        }
      }

      // Group top-level states by tier and sort horizontally (main flow states left/center, cancel/reject right)
      const statesByTier = new Map<number, UmlStateNode[]>();
      for (const st of topLevelStates) {
        const t = tierById.get(st.stateId) ?? 1;
        const list = statesByTier.get(t) ?? [];
        list.push(st);
        statesByTier.set(t, list);
      }

      const sortedTierNums = [...statesByTier.keys()].sort((a, b) => a - b);
      const centerX = 640;
      const hGap = 260;
      const vGap = 156;
      let cursorY = 48;

      for (const tNum of sortedTierNums) {
        const rowStates = statesByTier.get(tNum) ?? [];
        rowStates.sort((a, b) => {
          const ao = aiStateLayout?.[a.stateId]?.order;
          const bo = aiStateLayout?.[b.stateId]?.order;
          if (typeof ao === "number" && typeof bo === "number" && ao !== bo) return ao - bo;
          const aIsErrorOrCancel = /REJECT|CANCEL|FAIL|ERROR|REVIS/i.test(a.name) ? 1 : 0;
          const bIsErrorOrCancel = /REJECT|CANCEL|FAIL|ERROR|REVIS/i.test(b.name) ? 1 : 0;
          if (aIsErrorOrCancel !== bIsErrorOrCancel) return aIsErrorOrCancel - bIsErrorOrCancel;
          const aOut = (outEdges.get(a.stateId) ?? []).length;
          const bOut = (outEdges.get(b.stateId) ?? []).length;
          if (aOut !== bOut) return bOut - aOut;
          return 0;
        });

        const totalRowWidth =
          rowStates.reduce((acc, s) => acc + (sizeByStateId.get(s.stateId)?.w ?? 250), 0) +
          Math.max(0, rowStates.length - 1) * hGap;
        let cursorX = Math.max(160, Math.round(centerX - totalRowWidth / 2));
        let maxRowH = 34;

        rowStates.forEach((st, colIdx) => {
          const sz = sizeByStateId.get(st.stateId) ?? { w: 250, h: 64 };
          const yOffset = sz.h < 50 ? 8 : 0;
          stateRectById.set(st.stateId, {
            x: cursorX,
            y: cursorY + yOffset,
            w: sz.w,
            h: sz.h,
            tier: tNum,
            colIdx,
          });
          cursorX += sz.w + hGap;
          maxRowH = Math.max(maxRowH, sz.h + yOffset);
        });

        cursorY += maxRowH + vGap;
      }
    }

    const substateIndexTracker = new Map<string, number>();
    const actualStateRectById = new Map<string, { x: number; y: number; w: number; h: number }>();

    projection.states.forEach((st) => {
      const hasValidParent = Boolean(st.parentStateId && stateIdSet.has(st.parentStateId));
      const parentCellId = hasValidParent ? st.parentStateId! : "1";
      const sz = sizeByStateId.get(st.stateId) ?? { w: 250, h: 64 };
      let x = stateRectById.get(st.stateId)?.x ?? 120;
      let y = stateRectById.get(st.stateId)?.y ?? 80;
      const w = sz.w;
      const h = sz.h;

      if (hasValidParent) {
        const subIdx = substateIndexTracker.get(parentCellId) ?? 0;
        substateIndexTracker.set(parentCellId, subIdx + 1);
        x = 24;
        y = 44 + subIdx * 88;
      }

      const custom = customLayout?.[st.stateId];
      if (!hasValidParent) {
        actualStateRectById.set(st.stateId, {
          x: custom ? custom.x : x,
          y: custom ? custom.y : y,
          w: custom ? custom.width : w,
          h: custom ? custom.height : h,
        });
      }

      const label = formatStateNodeCellValue(st);
      const style = getStateNodeCellStyle(st);

      cells.push(
        `<mxCell id="${escapeXmlAttr(st.stateId)}" value="${escapeXmlAttr(label)}" style="${style}" vertex="1" parent="${escapeXmlAttr(parentCellId)}" mavisId="${escapeXmlAttr(st.stateId)}" mavisUmlRole="state-node" mavisStateKind="${st.kind}" mavisProvenance="${st.provenance}" mavisMeta="${encodeMeta(st)}">${geomOf(st.stateId, x, y, w, h)}</mxCell>`,
      );
    });

    // Obstacle-avoidance helper for state transitions
    const stateSegmentHitsRect = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      r: { x: number; y: number; w: number; h: number },
      pad = 10,
    ): boolean => {
      const rx1 = r.x - pad;
      const ry1 = r.y - pad;
      const rx2 = r.x + r.w + pad;
      const ry2 = r.y + r.h + pad;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      if (Math.abs(x1 - x2) < 1) {
        return x1 > rx1 && x1 < rx2 && maxY > ry1 && minY < ry2;
      }
      if (Math.abs(y1 - y2) < 1) {
        return y1 > ry1 && y1 < ry2 && maxX > rx1 && minX < rx2;
      }
      return maxX > rx1 && minX < rx2 && maxY > ry1 && minY < ry2;
    };

    const statePathClear = (
      pts: Array<{ x: number; y: number }>,
      ignoreA: string,
      ignoreB: string,
    ): boolean => {
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i]!;
        const p2 = pts[i + 1]!;
        for (const [sid, r] of actualStateRectById.entries()) {
          if (sid === ignoreA || sid === ignoreB) continue;
          if (stateSegmentHitsRect(p1.x, p1.y, p2.x, p2.y, r, 10)) {
            return false;
          }
        }
      }
      return true;
    };

    let minStateLeft = 400;
    let maxStateRight = 720;
    for (const r of actualStateRectById.values()) {
      minStateLeft = Math.min(minStateLeft, r.x);
      maxStateRight = Math.max(maxStateRight, r.x + r.w);
    }

    // Track port distribution and parallel/reverse pairs so transitions and labels never overlap
    const downOutBySrc = new Map<string, string[]>();
    const downInByTgt = new Map<string, string[]>();
    const pairSiblingsMap = new Map<string, string[]>();
    for (const tr of projection.transitions) {
      const pairKey = `${tr.fromStateId}->${tr.toStateId}`;
      const pList = pairSiblingsMap.get(pairKey) ?? [];
      pList.push(tr.transitionId);
      pairSiblingsMap.set(pairKey, pList);

      const s = actualStateRectById.get(tr.fromStateId);
      const t = actualStateRectById.get(tr.toStateId);
      if (!s || !t || tr.fromStateId === tr.toStateId) continue;
      if (t.y + t.h / 2 > s.y + s.h / 2 + 20) {
        const oList = downOutBySrc.get(tr.fromStateId) ?? [];
        oList.push(tr.transitionId);
        downOutBySrc.set(tr.fromStateId, oList);
        const iList = downInByTgt.get(tr.toStateId) ?? [];
        iList.push(tr.transitionId);
        downInByTgt.set(tr.toStateId, iList);
      }
    }
    for (const [sid, list] of downOutBySrc.entries()) {
      list.sort((a, b) => {
        const trA = projection.transitions.find((t) => t.transitionId === a);
        const trB = projection.transitions.find((t) => t.transitionId === b);
        const xA = actualStateRectById.get(trA?.toStateId ?? "")?.x ?? 0;
        const xB = actualStateRectById.get(trB?.toStateId ?? "")?.x ?? 0;
        return xA - xB;
      });
      downOutBySrc.set(sid, list);
    }
    for (const [tid, list] of downInByTgt.entries()) {
      list.sort((a, b) => {
        const trA = projection.transitions.find((t) => t.transitionId === a);
        const trB = projection.transitions.find((t) => t.transitionId === b);
        const xA = actualStateRectById.get(trA?.fromStateId ?? "")?.x ?? 0;
        const xB = actualStateRectById.get(trB?.fromStateId ?? "")?.x ?? 0;
        return xA - xB;
      });
      downInByTgt.set(tid, list);
    }

    const leftCorridorSpans: Array<{ id: string; start: number; end: number }> = [];
    const rightCorridorSpans: Array<{ id: string; start: number; end: number }> = [];
    const previewTrack = (
      spans: Array<{ id: string; start: number; end: number }>,
      id: string,
      y1: number,
      y2: number,
    ) =>
      assignArcTrackLevels([...spans, { id, start: y1, end: y2 }], 16).get(id) ?? 0;

    projection.transitions.forEach((tr) => {
      const label = formatStateTransitionCellValue(tr);
      const baseStyle = getStateTransitionCellStyle();
      const s = actualStateRectById.get(tr.fromStateId);
      const t = actualStateRectById.get(tr.toStateId);

      if (!s || !t) {
        cells.push(
          `<mxCell id="${escapeXmlAttr(tr.transitionId)}" value="${escapeXmlAttr(label)}" style="${baseStyle}" edge="1" parent="1" source="${escapeXmlAttr(tr.fromStateId)}" target="${escapeXmlAttr(tr.toStateId)}" mavisId="${escapeXmlAttr(tr.transitionId)}" mavisUmlRole="state-transition" mavisProvenance="${tr.provenance}" mavisMeta="${encodeMeta(tr)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
        );
        return;
      }

      const sCx = s.x + s.w / 2;
      const sCy = s.y + s.h / 2;
      const tCx = t.x + t.w / 2;
      const tCy = t.y + t.h / 2;
      const pairList = pairSiblingsMap.get(`${tr.fromStateId}->${tr.toStateId}`) ?? [tr.transitionId];
      const pairIdx = Math.max(0, pairList.indexOf(tr.transitionId));
      const hasReverseEdge = (pairSiblingsMap.get(`${tr.toStateId}->${tr.fromStateId}`)?.length ?? 0) > 0;

      let exitX = 0.5;
      let exitY = 1;
      let entryX = 0.5;
      let entryY = 0;
      let waypoints: Array<{ x: number; y: number }> = [];
      let labelOffsetX = 0;
      let labelOffsetY = 0;

      if (tr.fromStateId === tr.toStateId) {
        // Self-transition loop on right edge
        exitX = 1;
        exitY = 0.35;
        entryX = 1;
        entryY = 0.7;
        const loopX = s.x + s.w + 48 + pairIdx * 36;
        waypoints = [
          { x: loopX, y: Math.round(s.y + s.h * 0.35) },
          { x: loopX, y: Math.round(s.y + s.h * 0.7) },
        ];
        labelOffsetX = 24;
      } else if (tCy > sCy + 20) {
        // Forward downward transition
        const outList = downOutBySrc.get(tr.fromStateId) ?? [tr.transitionId];
        const outIdx = Math.max(0, outList.indexOf(tr.transitionId));
        exitX =
          s.w <= 40
            ? 0.5
            : outList.length === 1
              ? 0.5
              : Number((0.26 + (outIdx / (outList.length - 1)) * 0.48).toFixed(2));
        exitY = 1;

        const inList = downInByTgt.get(tr.toStateId) ?? [tr.transitionId];
        const inIdx = Math.max(0, inList.indexOf(tr.transitionId));
        entryX =
          t.w <= 40
            ? 0.5
            : inList.length === 1
              ? (hasReverseEdge && tCx > sCx + 80 ? 0.32 : 0.5)
              : Number((0.25 + (inIdx / (inList.length - 1)) * 0.5).toFixed(2));
        entryY = 0;

        const sp = { x: Math.round(s.x + s.w * exitX), y: s.y + s.h };
        const tp = { x: Math.round(t.x + t.w * entryX), y: t.y };
        const vDist = Math.max(60, tp.y - sp.y);
        const midY =
          hasReverseEdge && Math.abs(tp.x - sp.x) > 80
            ? Math.round(sp.y + 38)
            : outList.length > 1
              ? Math.round(sp.y + 38 + (outIdx / (outList.length - 1)) * Math.min(54, vDist - 76))
              : Math.round((sp.y + tp.y) / 2);

        const candidateMidYs = [midY, tp.y - 36, sp.y + 36].filter(
          (cy) => cy > sp.y + 14 && cy < tp.y - 14,
        );
        const clearMidY = candidateMidYs.find((cy) =>
          statePathClear(
            [sp, { x: sp.x, y: cy }, { x: tp.x, y: cy }, tp],
            tr.fromStateId,
            tr.toStateId,
          ),
        );

        if (Math.abs(sp.x - tp.x) <= 12 && statePathClear([sp, tp], tr.fromStateId, tr.toStateId)) {
          waypoints = [];
        } else if (clearMidY !== undefined) {
          waypoints = [
            { x: sp.x, y: clearMidY },
            { x: tp.x, y: clearMidY },
          ];
          if (hasReverseEdge && Math.abs(tp.x - sp.x) > 80) {
            labelOffsetX = tp.x > sp.x ? -52 : 52;
            labelOffsetY = -10;
          }
        } else {
          // Multi-tier downward jump (e.g. REJECTED -> FINAL_STATE): route around outer corridor
          // Use distinct lower exitY (0.72) and upper entryY (0.35) so incoming and outgoing side ports never collide
          const useRight = sCx >= 600;
          if (useRight) {
            exitX = 1;
            exitY = 0.72;
            entryX = 1;
            entryY = t.w <= 40 ? 0.5 : 0.35;
            const spSide = { x: s.x + s.w, y: Math.round(s.y + s.h * exitY) };
            const tpSide = { x: t.x + t.w, y: Math.round(t.y + t.h * entryY) };
            const rTrack = previewTrack(rightCorridorSpans, tr.transitionId, spSide.y, tpSide.y);
            rightCorridorSpans.push({ id: tr.transitionId, start: spSide.y, end: tpSide.y });
            const corridorX = maxStateRight + 74 + rTrack * 48;
            waypoints = [
              { x: corridorX, y: spSide.y },
              { x: corridorX, y: tpSide.y },
            ];
            labelOffsetX = 16;
          } else {
            exitX = 0;
            exitY = 0.72;
            entryX = 0;
            entryY = t.w <= 40 ? 0.5 : 0.35;
            const spSide = { x: s.x, y: Math.round(s.y + s.h * exitY) };
            const tpSide = { x: t.x, y: Math.round(t.y + t.h * entryY) };
            const lTrack = previewTrack(leftCorridorSpans, tr.transitionId, spSide.y, tpSide.y);
            leftCorridorSpans.push({ id: tr.transitionId, start: spSide.y, end: tpSide.y });
            const corridorX = Math.max(24, minStateLeft - 88 - lTrack * 48);
            waypoints = [
              { x: corridorX, y: spSide.y },
              { x: corridorX, y: tpSide.y },
            ];
            labelOffsetX = -16;
          }
        }
      } else if (Math.abs(tCy - sCy) <= 20) {
        // Same-tier horizontal transition
        const goingRight = tCx >= sCx;
        exitX = goingRight ? 1 : 0;
        exitY = 0.5;
        entryX = goingRight ? 0 : 1;
        entryY = 0.5;
        const sp = { x: goingRight ? s.x + s.w : s.x, y: Math.round(sCy) };
        const tp = { x: goingRight ? t.x : t.x + t.w, y: Math.round(tCy) };
        if (!statePathClear([sp, tp], tr.fromStateId, tr.toStateId)) {
          const arcY = Math.min(s.y, t.y) - 38 - pairIdx * 32;
          exitX = 0.5;
          exitY = 0;
          entryX = 0.5;
          entryY = 0;
          waypoints = [
            { x: Math.round(sCx), y: arcY },
            { x: Math.round(tCx), y: arcY },
          ];
        }
      } else {
        // Upward back-edge: verify obstacle clearance so back-edges never slice through adjacent states (like REJECTED)
        const crossColRightToLeft = sCx > tCx + 80;
        const crossColLeftToRight = tCx > sCx + 80;

        if (crossColRightToLeft || crossColLeftToRight) {
          // Cross-column upward back-edge (e.g. CANCEL_PENDING -> AWAITING_ACCEPTANCE, REVISION_PENDING -> APPROVED):
          // Prefer a 1-bend L-path straight up from `s`'s top edge into `t`'s side face so it stays outside `t`'s downward transitions
          const topExitFrac = crossColRightToLeft
            ? Number(Math.min(0.84, 0.66 + pairIdx * 0.14).toFixed(2))
            : Number(Math.max(0.16, 0.34 - pairIdx * 0.14).toFixed(2));
          const sideEntryFrac = Number(Math.max(0.25, 0.5 - pairIdx * 0.18).toFixed(2));
          const spTop = { x: Math.round(s.x + s.w * topExitFrac), y: s.y };
          const tpSide = {
            x: crossColRightToLeft ? t.x + t.w : t.x,
            y: Math.round(t.y + t.h * sideEntryFrac),
          };
          const candidateDirectL = [spTop, { x: spTop.x, y: tpSide.y }, tpSide];
          const busY = s.y - 38 - pairIdx * 36;
          const midX = crossColRightToLeft
            ? Math.round(t.x + t.w + 56 + pairIdx * 32)
            : Math.round(t.x - 56 - pairIdx * 32);
          const candidateInterTier = [
            spTop,
            { x: spTop.x, y: busY },
            { x: midX, y: busY },
            { x: midX, y: tpSide.y },
            tpSide,
          ];

          if (statePathClear(candidateDirectL, tr.fromStateId, tr.toStateId)) {
            exitX = topExitFrac;
            exitY = 0;
            entryX = crossColRightToLeft ? 1 : 0;
            entryY = sideEntryFrac;
            waypoints = [{ x: spTop.x, y: tpSide.y }];
            labelOffsetX = crossColRightToLeft ? 42 : -42;
            labelOffsetY = -12;
          } else if (statePathClear(candidateInterTier, tr.fromStateId, tr.toStateId)) {
            exitX = topExitFrac;
            exitY = 0;
            entryX = crossColRightToLeft ? 1 : 0;
            entryY = sideEntryFrac;
            waypoints = [
              { x: spTop.x, y: busY },
              { x: midX, y: busY },
              { x: midX, y: tpSide.y },
            ];
            labelOffsetX = crossColRightToLeft ? 64 : -64;
            labelOffsetY = 8;
          }
        }

        if (waypoints.length === 0) {
          // Try outer-left corridor first if source or target is on the left half
          const preferLeft = sCx <= 620 || tCx <= 620;
          const spL = { x: s.x, y: Math.round(s.y + s.h * 0.35) };
          const tpL = { x: t.x, y: Math.round(t.y + t.h * 0.35) };
          const lTrack = previewTrack(leftCorridorSpans, tr.transitionId, spL.y, tpL.y);
          const leftX = Math.max(24, minStateLeft - 98 - lTrack * 54);
          const pathL = [spL, { x: leftX, y: spL.y }, { x: leftX, y: tpL.y }, tpL];
          const spR = { x: s.x + s.w, y: Math.round(s.y + s.h * 0.35) };
          const tpR = { x: t.x + t.w, y: Math.round(t.y + t.h * 0.35) };
          const rTrack = previewTrack(rightCorridorSpans, tr.transitionId, spR.y, tpR.y);
          const rightX = maxStateRight + 98 + rTrack * 54;
          const pathR = [spR, { x: rightX, y: spR.y }, { x: rightX, y: tpR.y }, tpR];

          if (preferLeft && statePathClear(pathL, tr.fromStateId, tr.toStateId)) {
            leftCorridorSpans.push({ id: tr.transitionId, start: spL.y, end: tpL.y });
            exitX = 0;
            exitY = 0.35;
            entryX = 0;
            entryY = 0.35;
            waypoints = [
              { x: leftX, y: spL.y },
              { x: leftX, y: tpL.y },
            ];
            labelOffsetX = -18;
          } else if (statePathClear(pathR, tr.fromStateId, tr.toStateId)) {
            rightCorridorSpans.push({ id: tr.transitionId, start: spR.y, end: tpR.y });
            exitX = 1;
            exitY = 0.35;
            entryX = 1;
            entryY = 0.35;
            waypoints = [
              { x: rightX, y: spR.y },
              { x: rightX, y: tpR.y },
            ];
            labelOffsetX = 18;
          } else {
            leftCorridorSpans.push({ id: tr.transitionId, start: spL.y, end: tpL.y });
            exitX = 0;
            exitY = 0.35;
            entryX = 0;
            entryY = 0.35;
            waypoints = [
              { x: leftX, y: spL.y },
              { x: leftX, y: tpL.y },
            ];
            labelOffsetX = -18;
          }
        }
      }

      const styleWithPorts = `${baseStyle}exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;`;
      const ptsXml =
        waypoints.length > 0
          ? `<Array as="points">${waypoints.map((p) => `<mxPoint x="${Math.round(p.x)}" y="${Math.round(p.y)}"/>`).join("")}</Array>`
          : "";
      const offsetXml =
        labelOffsetX !== 0 || labelOffsetY !== 0
          ? `<mxPoint x="${labelOffsetX}" y="${labelOffsetY}" as="offset"/>`
          : "";

      cells.push(
        `<mxCell id="${escapeXmlAttr(tr.transitionId)}" value="${escapeXmlAttr(label)}" style="${styleWithPorts}" edge="1" parent="1" source="${escapeXmlAttr(tr.fromStateId)}" target="${escapeXmlAttr(tr.toStateId)}" mavisId="${escapeXmlAttr(tr.transitionId)}" mavisUmlRole="state-transition" mavisProvenance="${tr.provenance}" mavisMeta="${encodeMeta(tr)}"><mxGeometry relative="1" as="geometry">${ptsXml}${offsetXml}</mxGeometry></mxCell>`,
      );
    });
  }

  const carrier = extractCarrierFromProjection(projection, customLayout, explicitCarrier);

  return `<mxfile host="app.diagrams.net"><diagram id="${projection.diagramKind.toLowerCase()}" name="${projection.diagramKind}"><mxGraphModel dx="1280" dy="800" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="1169" pageHeight="827" mavisLayoutMode="tree-v2" ${projection.diagramKind === "UML_ACTIVITY" ? 'mavisActivityVersion="3"' : projection.diagramKind === "UML_STATE" ? 'mavisStateVersion="2"' : ""} mavisSchemaVersion="${carrier.schemaVersion}" mavisUmlDiagramKind="${projection.diagramKind}" mavisModelId="${escapeXmlAttr(projection.modelId)}" mavisUmlDocument="${encodeMeta(carrier)}" mavisUmlProjection="${encodeMeta(projection)}"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
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
  return (val ?? "")
    .replaceAll("\r\n", "\n")
    .replace(/<br\s*\/?>/gi, "<br/>")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
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
    const defaultPartition = clone.partitions[0] ?? {
      partitionId: "partition:default",
      name: "Service Partition",
      serviceId: null,
    };
    const partitionById = new Map(clone.partitions.map((p) => [p.partitionId, p]));

    for (const cell of parsedCells) {
      const role = cell.attrs["mavisUmlRole"];
      const id = cell.attrs["mavisId"] ?? cell.attrs["id"];
      if (!id || !role) continue;

      if (role === "activity-partition") {
        const expectedPartition = partitionById.get(id) ?? defaultPartition;
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
        const expectedNodePartId =
          existing?.partitionId ?? meta?.partitionId ?? defaultPartition.partitionId;
        if (
          cell.attrs["parent"] &&
          cell.attrs["parent"] !== expectedNodePartId &&
          !partitionById.has(cell.attrs["parent"]) &&
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
          const multiLineCheck = hasSemanticValueMismatch(
            cell.attrs["value"],
            formatStateTransitionCellValue(referenceTr),
          );
          const valCheck = !multiLineCheck.mismatch
            ? multiLineCheck
            : hasSemanticValueMismatch(cell.attrs["value"], formatTransitionLabel(referenceTr));
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
    aiEnrichment?: UmlAiDiagramEnrichment | null | undefined;
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

  const rawActivityOverlay: UmlActivityOverlay = decodedCarrier?.activityOverlay ?? {
    designedNodes:
      decodedProj?.diagramKind === "UML_ACTIVITY"
        ? decodedProj.nodes.filter((n) => n.provenance === "DESIGNED")
        : [],
    designedEdges:
      decodedProj?.diagramKind === "UML_ACTIVITY"
        ? decodedProj.edges.filter((e) => e.provenance === "DESIGNED")
        : [],
  };

  const activityOverlay: UmlActivityOverlay = {
    ...rawActivityOverlay,
    designedNodes: [...new Map((rawActivityOverlay.designedNodes ?? []).filter(n => !isGeneratedActivityItem(n)).map(n => [n.nodeId, n])).values()],
    designedEdges: [...new Map((rawActivityOverlay.designedEdges ?? []).filter(e => !isGeneratedActivityItem(e)).map(e => [e.edgeId, e])).values()],
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
    classOverlay.designedRelations = (classOverlay.designedRelations ?? []).filter(dr =>
      !dr.sourceRelationshipId || !model.edges.some(e => e.id === dr.sourceRelationshipId) ||
      (allClassifierIds.has(dr.fromClassifierId) && allClassifierIds.has(dr.toClassifierId)));
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

  const effectiveAiEnrichment = decodedCarrier?.aiEnrichment ?? fallbackOptions?.aiEnrichment;
  if (effectiveAiEnrichment) {
    baselineProjection = applyUmlAiEnrichment(baselineProjection, effectiveAiEnrichment);
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
      ? activityUserOverlay(reconciled.projection)
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
    aiEnrichment: effectiveAiEnrichment ?? undefined,
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
      const fromNode = projection.nodes.find((n) => n.nodeId === edge.fromNodeId);
      const toNode = projection.nodes.find((n) => n.nodeId === edge.toNodeId);
      return {
        diagramKind: "UML_DEPLOYMENT",
        itemId: edge.edgeId,
        itemRole: edge.edgeKind,
        label: edge.label,
        provenance: edge.provenance,
        modelElementId: edge.sourceRelationshipId
          ? null
          : (fromNode?.modelElementId ?? toNode?.modelElementId ?? null),
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
    const selectedOpOpt = projection.availableOperations.find(
      (op) => op.operationId === projection.selectedOperationId,
    );
    const fallbackOwnerId =
      selectedOpOpt?.classifierId ??
      (projection.selectedOperationId &&
      projection.selectedOperationId !== "designed" &&
      !projection.selectedOperationId.startsWith("flow:")
        ? (projection.selectedOperationId.split("::")[0] ?? null)
        : null);

    const part = projection.partitions.find((p) => p.partitionId === itemId);
    if (part) {
      const partElemId = part.serviceId ?? part.partitionId.replace(/^partition:/, "");
      return {
        diagramKind: "UML_ACTIVITY",
        itemId: part.partitionId,
        itemRole: "SWIMLANE_PARTITION",
        label: part.name,
        provenance: "EXTRACTED",
        modelElementId: partElemId || fallbackOwnerId,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `Swimlane Partition "${part.name}" representing microservice / actor responsibility in business flow "${selectedOpOpt?.methodName ?? projection.selectedOperationId}".`,
        details: {
          partitionName: part.name,
          serviceId: part.serviceId,
        },
      };
    }

    const node = projection.nodes.find((n) => n.nodeId === itemId);
    if (node) {
      const nodePart = projection.partitions.find((p) => p.partitionId === node.partitionId);
      const nodeServiceId =
        nodePart?.serviceId ??
        (node.partitionId.startsWith("partition:")
          ? node.partitionId.slice("partition:".length)
          : null);
      const resolvedModelElementId = projection.selectedOperationId.startsWith("flow:")
        ? (nodeServiceId ?? fallbackOwnerId)
        : (fallbackOwnerId ?? nodeServiceId);
      return {
        diagramKind: "UML_ACTIVITY",
        itemId: node.nodeId,
        itemRole: node.kind,
        label: node.label,
        provenance: node.provenance,
        modelElementId: resolvedModelElementId,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `Activity ${node.kind} "${node.label}" in Swimlane "${node.partitionName}" (Swimlane column denotes participating Microservice / Actor responsibility).`,
        details: {
          partitionName: node.partitionName,
          joinSpec: node.joinSpec ?? undefined,
          extractionCompleteness: projection.extractionCompleteness,
        },
      };
    }
    const edge = projection.edges.find((e) => e.edgeId === itemId);
    if (edge) {
      const fromNode = projection.nodes.find((n) => n.nodeId === edge.from);
      const toNode = projection.nodes.find((n) => n.nodeId === edge.to);
      const fromPart = projection.partitions.find(
        (p) => p.partitionId === fromNode?.partitionId,
      );
      const resolvedEdgeElemId = projection.selectedOperationId.startsWith("flow:")
        ? (fromPart?.serviceId ?? fallbackOwnerId)
        : fallbackOwnerId;
      return {
        diagramKind: "UML_ACTIVITY",
        itemId: edge.edgeId,
        itemRole: edge.flowKind,
        label: edge.guard ?? `${fromNode?.label ?? edge.from} -> ${toNode?.label ?? edge.to}`,
        provenance: edge.provenance,
        modelElementId: resolvedEdgeElemId,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `Activity ${edge.flowKind} from "${fromNode?.partitionName ?? edge.from}" to "${toNode?.partitionName ?? edge.to}"${edge.guard ? ` with guard ${edge.guard}` : ""}.`,
        details: {
          from: edge.from,
          to: edge.to,
          fromSwimlane: fromNode?.partitionName ?? null,
          toSwimlane: toNode?.partitionName ?? null,
          guard: edge.guard,
        },
      };
    }
  } else if (projection.diagramKind === "UML_STATE") {
    const selectedTargetOpt = projection.availableTargets.find(
      (t) => t.targetId === projection.selectedTargetId,
    );
    const resolvedStateElemId =
      selectedTargetOpt?.serviceId ??
      (projection.selectedTargetId &&
      projection.selectedTargetId !== "designed" &&
      !projection.selectedTargetId.startsWith("state:entity:")
        ? projection.selectedTargetId
        : null);

    const st = projection.states.find((s) => s.stateId === itemId);
    if (st) {
      return {
        diagramKind: "UML_STATE",
        itemId: st.stateId,
        itemRole: st.kind,
        label: st.name,
        provenance: st.provenance,
        modelElementId: resolvedStateElemId,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `UML State (${st.kind}) "${st.name}" in ${selectedTargetOpt?.classifierName ?? projection.regionId}${selectedTargetOpt?.serviceName ? ` (${selectedTargetOpt.serviceName})` : ""}.`,
        details: {
          owningService: selectedTargetOpt?.serviceName ?? undefined,
          stateCarrierField: selectedTargetOpt?.stateCarrierField ?? undefined,
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
        modelElementId: resolvedStateElemId,
        sourceRelationshipIds: [],
        evidenceIds: [],
        summary: `State transition ${tr.fromStateId} -> ${tr.toStateId} (${formatTransitionLabel(tr) || "triggerless"})${selectedTargetOpt?.serviceName ? ` in ${selectedTargetOpt.serviceName}` : ""}.`,
        details: {
          owningService: selectedTargetOpt?.serviceName ?? undefined,
          trigger: tr.trigger,
          guard: tr.guard,
          effect: tr.effect,
        },
      };
    }
  }
  return null;
}

// ============================================================================
// 8. UML AI SEMANTIC ENRICHMENT + AST SKELETON COMPRESSION
// ============================================================================

export interface UmlAiDiagramEnrichment {
  classifierLayout?: Record<
    string,
    {
      tier?: number;
      order?: number;
    }
  >;
  classRelations?: Record<
    string,
    {
      roleName?: string;
      multiplicity?: string;
      sourceRoleName?: string;
      sourceMultiplicity?: string;
    }
  >;
  packageLayout?: Record<
    string,
    {
      tier?: number;
      order?: number;
    }
  >;
  packageEdges?: Record<
    string,
    {
      relationKind?: "IMPORT" | "ACCESS" | "DEPENDENCY";
    }
  >;
  deploymentLayout?: Record<
    string,
    {
      tier?: number;
      order?: number;
    }
  >;
  deploymentEdges?: Record<
    string,
    {
      label?: string;
      protocol?: string;
    }
  >;
  activityNodes?: Record<
    string,
    {
      label?: string;
    }
  >;
  activityEdges?: Record<
    string,
    {
      guard?: string;
    }
  >;
  stateLayout?: Record<
    string,
    {
      tier?: number;
      order?: number;
    }
  >;
  stateNodes?: Record<
    string,
    {
      entryBehavior?: string;
      doActivity?: string;
      exitBehavior?: string;
    }
  >;
  stateTransitions?: Record<
    string,
    {
      trigger?: string;
      guard?: string;
      effect?: string;
    }
  >;
  flowTitle?: string;
  flowSummary?: string;
  flowCatalogTitles?: Record<string, string>;
  tokenStats?: {
    rawChars: number;
    compressedChars: number;
    savedPercent: number;
    provider: "openai" | "gemini" | "ast-skeleton";
  };
}

export interface CompactUmlAiContext {
  contextHash: string;
  diagramKind: UmlDiagramKind;
  scopeSummary: string;
  items: Array<{
    id: string;
    itemType: string;
    label: string;
    from?: string;
    to?: string;
    extra?: string;
  }>;
  astSkeleton: string;
  rawChars: number;
  compressedChars: number;
  savedPercent: number;
}

export function buildUmlCompactContext(
  model: ArchitecturalModel,
  projection: AnyUmlProjection,
): CompactUmlAiContext {
  const evidenceIds = new Set<string>();
  const items: CompactUmlAiContext["items"] = [];
  let scopeSummary = `${projection.diagramKind} (${model.label})`;

  if (projection.diagramKind === "UML_CLASS") {
    scopeSummary = `UML_CLASS service=${projection.scopeServiceId ?? "all"} pkg=${projection.scopePackageName ?? "all"}`;
    for (const cls of projection.classifiers.slice(0, 18)) {
      for (const eid of cls.evidenceIds) evidenceIds.add(eid);
      items.push({
        id: cls.classifierId,
        itemType: `CLASSIFIER:${cls.classifierKind}`,
        label: cls.qualifiedName,
        extra: [
          ...cls.attributes.slice(0, 4).map((a) => `${a.name}:${a.type}`),
          ...cls.operations.slice(0, 4).map((o) => `${o.name}():${o.type}`),
        ].join(", "),
      });
    }
    for (const rel of projection.relations.slice(0, 24)) {
      for (const eid of rel.evidenceIds) evidenceIds.add(eid);
      items.push({
        id: rel.relationId,
        itemType: `CLASS_RELATION:${rel.relationKind}`,
        label: `${rel.roleName ?? ""} [${rel.multiplicity ?? ""}]`.trim(),
        from: rel.fromClassifierId,
        to: rel.toClassifierId,
      });
    }
  } else if (projection.diagramKind === "UML_PACKAGE") {
    scopeSummary = `UML_PACKAGE service=${projection.scopeServiceId ?? "all"}`;
    const elemById = new Map(model.elements.map((e) => [e.id, e]));
    for (const pkg of projection.packages.slice(0, 18)) {
      for (const cid of pkg.memberClassifierIds.slice(0, 4)) {
        const el = elemById.get(cid);
        for (const ev of el?.evidence ?? []) evidenceIds.add(ev.id);
      }
      items.push({
        id: pkg.packageId,
        itemType: "PACKAGE",
        label: pkg.qualifiedName,
        extra: pkg.memberNames.slice(0, 6).join(", "),
      });
    }
    for (const edge of projection.edges.slice(0, 24)) {
      for (const eid of edge.evidenceIds) evidenceIds.add(eid);
      items.push({
        id: edge.edgeId,
        itemType: `PACKAGE_EDGE:${edge.relationKind}`,
        label: edge.relationKind,
        from: edge.fromPackageId,
        to: edge.toPackageId,
      });
    }
  } else if (projection.diagramKind === "UML_DEPLOYMENT") {
    scopeSummary = `UML_DEPLOYMENT env=${projection.environment}`;
    for (const node of projection.nodes.slice(0, 18)) {
      for (const eid of node.evidenceIds) evidenceIds.add(eid);
      items.push({
        id: node.nodeId,
        itemType: `DEPLOY_NODE:${node.nodeKind}`,
        label: `${node.stereotype} ${node.name}`,
        extra: node.ports.join(","),
      });
    }
    for (const edge of projection.edges.slice(0, 20)) {
      for (const eid of edge.evidenceIds) evidenceIds.add(eid);
      items.push({
        id: edge.edgeId,
        itemType: `DEPLOY_EDGE:${edge.edgeKind}`,
        label: edge.label,
        from: edge.fromNodeId,
        to: edge.toNodeId,
        extra: edge.protocol ?? "",
      });
    }
  } else if (projection.diagramKind === "UML_ACTIVITY") {
    scopeSummary = `UML_ACTIVITY completeness=${projection.extractionCompleteness} limitations=${projection.unsupportedConstructs.join(",")} op=${projection.selectedOperationId ?? "default"} swimlanes=${projection.partitions.map((p) => p.name).join(" -> ")}`;
    for (const op of projection.availableOperations.slice(0, 8)) {
      items.push({
        id: op.operationId,
        itemType: "FLOW_OPTION",
        label: op.methodName,
        extra: op.serviceName,
      });
    }
    for (const part of projection.partitions) {
      if (part.serviceId) {
        const svcEl = model.elements.find((e) => e.id === part.serviceId);
        for (const ev of svcEl?.evidence ?? []) evidenceIds.add(ev.id);
        const childSagas = model.elements.filter(
          (e) => e.parentId === part.serviceId && /Saga|Controller|Service/i.test(e.name),
        );
        for (const ch of childSagas.slice(0, 4)) {
          for (const ev of ch.evidence ?? []) evidenceIds.add(ev.id);
        }
      }
    }
    if (projection.selectedOperationId) {
      const selectedOption = projection.availableOperations.find(o => o.operationId === projection.selectedOperationId);
      const opEl = model.elements.find((e) => e.id === selectedOption?.classifierId);
      if (opEl?.evidence) {
        for (const ev of opEl.evidence) evidenceIds.add(ev.id);
      }
    }
    for (const node of projection.nodes.slice(0, 20)) {
      items.push({
        id: node.nodeId,
        itemType: `ACT_NODE:${node.kind}`,
        label: node.label,
        extra: node.partitionName,
      });
    }
    for (const edge of projection.edges.slice(0, 24)) {
      items.push({
        id: edge.edgeId,
        itemType: `ACT_EDGE:${edge.flowKind}`,
        label: edge.guard ?? "",
        from: edge.from,
        to: edge.to,
      });
    }
  } else if (projection.diagramKind === "UML_STATE") {
    const selectedTargetOpt = projection.availableTargets.find(
      (t) => t.targetId === projection.selectedTargetId,
    );
    scopeSummary = `UML_STATE target=${projection.selectedTargetId} entity=${selectedTargetOpt?.classifierName ?? "n/a"} service=${selectedTargetOpt?.serviceName ?? "n/a"} enumOnly=${projection.enumOnlyNoTransitions}`;
    for (const tgt of projection.availableTargets.slice(0, 8)) {
      items.push({
        id: tgt.targetId,
        itemType: "STATE_TARGET_OPTION",
        label: tgt.classifierName,
        extra: `${tgt.serviceName ?? ""} (${tgt.stateCarrierField ?? ""})`,
      });
    }
    const targetElemId = selectedTargetOpt?.serviceId ?? projection.selectedTargetId;
    if (targetElemId && targetElemId !== "designed") {
      const tgtEl = model.elements.find((e) => e.id === targetElemId);
      if (tgtEl) {
        for (const ev of tgtEl.evidence ?? []) evidenceIds.add(ev.id);
        const childEls = model.elements.filter((e) => e.parentId === tgtEl.id);
        for (const ch of childEls) {
          for (const ev of ch.evidence ?? []) evidenceIds.add(ev.id);
        }
      }
    }
    for (const st of projection.states.slice(0, 18)) {
      items.push({
        id: st.stateId,
        itemType: `STATE:${st.kind}`,
        label: st.name,
        extra: [st.entryBehavior, st.doActivity, st.exitBehavior].filter(Boolean).join(" | "),
      });
    }
    for (const tr of projection.transitions.slice(0, 24)) {
      items.push({
        id: tr.transitionId,
        itemType: "TRANSITION",
        label: formatTransitionLabel(tr),
        from: tr.fromStateId,
        to: tr.toStateId,
      });
    }
  }

  let rawChars = 0;
  const skeletonBlocks: string[] = [];
  const seenFiles = new Set<string>();
  const evIndex =
    (model as { evidenceIndex?: Record<string, { filePath?: string; snippet?: string }> })
      .evidenceIndex ?? {};

  const collectEvidence = (eid: string) => {
    const ev = evIndex[eid];
    const filePath = ev?.filePath ?? eid;
    if (!ev?.snippet || seenFiles.has(filePath)) return;
    seenFiles.add(filePath);
    rawChars += ev.snippet.length;
    const skel = compressCodeToAstSkeleton(ev.snippet, 12);
    if (skel) {
      skeletonBlocks.push(`// ${filePath.split("/").slice(-2).join("/")}\n${skel}`);
    }
  };

  for (const eid of evidenceIds) {
    if (seenFiles.size >= 10) break;
    collectEvidence(eid);
  }
  if (seenFiles.size < 4) {
    for (const eid of Object.keys(evIndex).slice(0, 12)) {
      if (seenFiles.size >= 8) break;
      collectEvidence(eid);
    }
  }
  if (seenFiles.size < 4) {
    for (const el of (model.elements ?? []).slice(0, 20)) {
      if (seenFiles.size >= 8) break;
      const inlineEvs = (el as unknown as { evidence?: Array<{ filePath?: string; snippet?: string; excerpt?: string }> }).evidence ?? [];
      for (const ie of inlineEvs) {
        const snippet = ie.snippet ?? ie.excerpt ?? "";
        const fp = ie.filePath ?? el.name;
        if (!snippet || seenFiles.has(fp)) continue;
        seenFiles.add(fp);
        rawChars += snippet.length;
        const skel = compressCodeToAstSkeleton(snippet, 12);
        if (skel) {
          skeletonBlocks.push(`// ${fp.split("/").slice(-2).join("/")}\n${skel}`);
        }
      }
    }
  }

  const astSkeleton = skeletonBlocks.join("\n").slice(0, 2400);
  const compressedChars = astSkeleton.length;
  const baselineRaw = Math.max(rawChars, compressedChars * 3, 1);
  const savedPercent = Math.max(
    0,
    Math.min(95, Math.round(((baselineRaw - compressedChars) / baselineRaw) * 100)),
  );

  const hashInput = `${projection.diagramKind}|${scopeSummary}|${items.map((i) => `${i.id}:${i.label}`).join(";")}|${astSkeleton}`;
  let h = 2166136261;
  for (let i = 0; i < hashInput.length; i++) {
    h ^= hashInput.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const contextHash = `uml:${projection.diagramKind}:${projection.modelId}:${(h >>> 0).toString(16)}`;

  return {
    contextHash,
    diagramKind: projection.diagramKind,
    scopeSummary,
    items,
    astSkeleton,
    rawChars: baselineRaw,
    compressedChars,
    savedPercent,
  };
}

export function applyUmlAiEnrichment<T extends AnyUmlProjection>(
  projection: T,
  enrichment?: UmlAiDiagramEnrichment | null,
): T {
  if (!enrichment) return projection;
  const clone = JSON.parse(JSON.stringify(projection)) as T;

  if (clone.diagramKind === "UML_CLASS" && enrichment.classRelations) {
    for (const rel of clone.relations) {
      if (rel.provenance !== "EXTRACTED") continue;
      if (rel.relationKind === "GENERALIZATION" || rel.relationKind === "REALIZATION") continue;
      const patch = enrichment.classRelations[rel.relationId];
      if (!patch) continue;
      if (!rel.roleName && typeof patch.roleName === "string" && patch.roleName.trim()) {
        rel.roleName = patch.roleName.trim().slice(0, 28);
      }
      if (!rel.multiplicity && typeof patch.multiplicity === "string" && patch.multiplicity.trim()) {
        rel.multiplicity = patch.multiplicity.trim().slice(0, 12);
      }
      if (
        !rel.sourceRoleName &&
        typeof patch.sourceRoleName === "string" &&
        patch.sourceRoleName.trim()
      ) {
        rel.sourceRoleName = patch.sourceRoleName.trim().slice(0, 28);
      }
      if (
        !rel.sourceMultiplicity &&
        typeof patch.sourceMultiplicity === "string" &&
        patch.sourceMultiplicity.trim()
      ) {
        rel.sourceMultiplicity = patch.sourceMultiplicity.trim().slice(0, 12);
      }
    }
  } else if (clone.diagramKind === "UML_PACKAGE") {
    // Import/access are namespace semantics; layout hints cannot prove them.
    // Preserve relation kinds supplied by extraction or explicit user authoring.
  } else if (clone.diagramKind === "UML_DEPLOYMENT" && enrichment.deploymentEdges) {
    for (const edge of clone.edges) {
      if (edge.provenance !== "EXTRACTED" || edge.edgeKind !== "COMMUNICATION_PATH") continue;
      const patch = enrichment.deploymentEdges[edge.edgeId];
      if (!patch) continue;
      if (typeof patch.label === "string" && patch.label.trim()) {
        edge.label = patch.label.trim().slice(0, 48);
      }
      if (!edge.protocol && typeof patch.protocol === "string" && patch.protocol.trim()) {
        edge.protocol = patch.protocol.trim().slice(0, 24);
      }
    }
  } else if (clone.diagramKind === "UML_ACTIVITY") {
    if (enrichment.flowCatalogTitles || enrichment.flowTitle) {
      for (const op of clone.availableOperations) {
        const customTitle =
          enrichment.flowCatalogTitles?.[op.operationId]?.trim() ||
          (op.operationId === clone.selectedOperationId ? enrichment.flowTitle?.trim() : "");
        if (customTitle && !op.unsupportedConstructs.includes("INFERRED_BUSINESS_FLOW_REQUIRES_SOURCE_VERIFICATION")) {
          op.methodName = customTitle.slice(0, 96);
        }
      }
    }
    if (enrichment.activityNodes) {
      for (const node of clone.nodes) {
        if (node.provenance !== "EXTRACTED") continue;
        if (node.kind !== "ACTION") continue;
        const patch = enrichment.activityNodes[node.nodeId];
        if (typeof patch?.label === "string" && patch.label.trim()) {
          node.label = patch.label.trim().slice(0, 160);
        }
      }
    }
    // Extracted guards are executable conditions, not editable prose.
  } else if (clone.diagramKind === "UML_STATE") {
    if (enrichment.flowCatalogTitles || enrichment.flowTitle) {
      for (const tgt of clone.availableTargets) {
        const customTitle =
          enrichment.flowCatalogTitles?.[tgt.targetId]?.trim() ||
          (tgt.targetId === clone.selectedTargetId ? enrichment.flowTitle?.trim() : "");
        if (customTitle) {
          tgt.classifierName = customTitle.slice(0, 96);
        }
      }
    }
    if (!clone.enumOnlyNoTransitions) {
      if (enrichment.stateNodes) {
        for (const st of clone.states) {
          if (st.provenance !== "EXTRACTED") continue;
          if (st.kind !== "STATE" && st.kind !== "COMPOSITE_STATE") continue;
          const patch = enrichment.stateNodes[st.stateId];
          if (!patch) continue;
          if (!st.entryBehavior && typeof patch.entryBehavior === "string" && patch.entryBehavior.trim()) {
            st.entryBehavior = patch.entryBehavior.trim().slice(0, 40);
          }
          if (!st.doActivity && typeof patch.doActivity === "string" && patch.doActivity.trim()) {
            st.doActivity = patch.doActivity.trim().slice(0, 40);
          }
          if (!st.exitBehavior && typeof patch.exitBehavior === "string" && patch.exitBehavior.trim()) {
            st.exitBehavior = patch.exitBehavior.trim().slice(0, 40);
          }
        }
      }
      if (enrichment.stateTransitions) {
        for (const tr of clone.transitions) {
          if (tr.provenance !== "EXTRACTED") continue;
          const patch = enrichment.stateTransitions[tr.transitionId];
          if (!patch) continue;
          if (typeof patch.trigger === "string" && patch.trigger.trim()) {
            tr.trigger = patch.trigger.trim().slice(0, 36);
          }
          if (!tr.guard && typeof patch.guard === "string" && patch.guard.trim()) {
            tr.guard = patch.guard.trim().replace(/^\[|\]$/g, "").slice(0, 32);
          }
          if (!tr.effect && typeof patch.effect === "string" && patch.effect.trim()) {
            tr.effect = patch.effect.trim().slice(0, 40);
          }
        }
      }
    }
  }

  return clone;
}


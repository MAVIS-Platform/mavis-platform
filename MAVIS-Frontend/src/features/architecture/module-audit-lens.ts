import type { ArchitecturalModel } from "@/types/domain";
import type { GraphCategory } from "./graph-projection";
import { JAVA_AUDIT_LENSES } from "./java-audit-lenses";
import { CSHARP_AUDIT_LENSES } from "./csharp-audit-lenses";

export type AuditTrack = "JAVA" | "CSHARP";
export type LensViewTab = "CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH";
export type AuditModuleNumber = 1 | 2 | 3 | 4 | 5;

export interface AuditLensQuickChip {
  id: string;
  labelEn: string;
  labelVi: string;
  targetView: LensViewTab;
  /** Container SERVICE_CONTAINER name to open in C3 Component view. */
  targetServiceName?: string;
  /** Node name to select & open inside the SWD Inspector panel. */
  targetNodeName?: string;
  /** Optional category visibility preset when targetView === "GRAPH". */
  graphHiddenCategories?: GraphCategory[];
}

export interface AuditReadinessPillar {
  id: string;
  labelEn: string;
  labelVi: string;
}

export interface ModuleAuditLens {
  moduleIndex: AuditModuleNumber;
  track: AuditTrack;
  stepTitleEn: string;
  stepTitleVi: string;
  stepDescriptionEn: string;
  stepDescriptionVi: string;
  summaryEn: string;
  summaryVi: string;
  defaultView: LensViewTab;
  defaultC3ServiceName?: string;
  defaultSelectedNodeName?: string;
  /** When true, unfocused nodes/edges dim softly (~0.28) unless the student toggles full view. */
  dimOthersByDefault: boolean;
  focusNodeNames: string[];
  focusEdgeProtocols?: string[];
  defaultGraphHiddenCategories?: GraphCategory[];
  quickChips: AuditLensQuickChip[];
  readinessPillars?: AuditReadinessPillar[];
}

export interface ActiveLensFocus {
  focusNodeIds: Set<string>;
  focusEdgeIds: Set<string>;
}

const JAVA_MODULE_LENSES: Partial<Record<AuditModuleNumber, ModuleAuditLens>> = {
  ...JAVA_AUDIT_LENSES,
};
const CSHARP_MODULE_LENSES: Partial<Record<AuditModuleNumber, ModuleAuditLens>> = {
  ...CSHARP_AUDIT_LENSES,
};

export function registerAuditLensPresets(
  track: AuditTrack,
  presets: Record<AuditModuleNumber, ModuleAuditLens>,
) {
  const target = track === "CSHARP" ? CSHARP_MODULE_LENSES : JAVA_MODULE_LENSES;
  for (const key of [1, 2, 3, 4, 5] as const) {
    target[key] = presets[key];
  }
}

export function detectAuditTrack(input: {
  workspaceCode?: string | null | undefined;
  projectName?: string | null | undefined;
  labTitle?: string | null | undefined;
  model?: ArchitecturalModel | null | undefined;
}): AuditTrack {
  const code = (input.workspaceCode ?? "").toUpperCase();
  const projectName = (input.projectName ?? "").toLowerCase();
  const labTitle = (input.labTitle ?? "").toLowerCase();
  if (
    code.includes("CSHARP") ||
    code.includes("DOTNET") ||
    projectName.includes("trái cây") ||
    projectName.includes("fruit") ||
    projectName.includes("dotnet") ||
    projectName.includes("c#") ||
    projectName.includes("csharp") ||
    projectName.includes("bookstore") ||
    labTitle.includes("(.net)") ||
    labTitle.includes("dotnet") ||
    labTitle.includes("c#") ||
    labTitle.includes("roslyn") ||
    labTitle.includes("polly") ||
    labTitle.includes("yarp") ||
    labTitle.includes("masstransit")
  ) {
    return "CSHARP";
  }
  const elements = input.model?.elements ?? [];
  if (
    elements.some(
      (el) =>
        el.name === "FruitOrdering.API" ||
        el.name === "FruitCatalog.API" ||
        el.name === "FruitBasket.API" ||
        el.name === "ApiGateway" ||
        (el.elementType === "SERVICE_CONTAINER" && el.name.endsWith(".API")),
    )
  ) {
    return "CSHARP";
  }
  return "JAVA";
}

export function resolveModuleIndex(input: {
  modulePosition?: number | null | undefined;
  labOrder?: number | null | undefined;
  labTitle?: string | null | undefined;
  curriculumCode?: string | null | undefined;
}): AuditModuleNumber {
  const numeric = input.modulePosition ?? input.labOrder;
  if (typeof numeric === "number" && Number.isFinite(numeric) && numeric >= 1 && numeric <= 5) {
    return Math.trunc(numeric) as AuditModuleNumber;
  }
  const probe = `${input.curriculumCode ?? ""} ${input.labTitle ?? ""}`;
  const match = /(?:module|lab|studio lab)\s*0?([1-5])\b/i.exec(probe);
  if (match?.[1]) {
    return Number(match[1]) as AuditModuleNumber;
  }
  return 1;
}

export function resolveModuleAuditLens(
  track: AuditTrack,
  moduleIndex: AuditModuleNumber,
): ModuleAuditLens {
  const map = track === "CSHARP" ? CSHARP_MODULE_LENSES : JAVA_MODULE_LENSES;
  const preset = map[moduleIndex] ?? map[1];
  if (preset) return preset;
  return {
    moduleIndex,
    track,
    stepTitleEn: `Module ${moduleIndex} Architecture Audit`,
    stepTitleVi: `Kiểm toán Kiến trúc Module ${moduleIndex}`,
    stepDescriptionEn: "Inspect architecture diagrams and source evidence before taking the Quiz.",
    stepDescriptionVi: "Khảo sát sơ đồ kiến trúc và bằng chứng mã nguồn trước khi làm Quiz.",
    summaryEn: "Inspect architecture diagrams and source evidence.",
    summaryVi: "Khảo sát sơ đồ kiến trúc và bằng chứng mã nguồn.",
    defaultView: "CONTAINER",
    dimOthersByDefault: false,
    focusNodeNames: [],
    quickChips: [],
  };
}

const SERVICE_ALIASES: Record<string, string[]> = {
  "identity-service": ["auth-service", "user-service"],
  "catalog-service": ["inventory-service", "product-service"],
  "order-service": ["orders-service", "ordering-service", "checkout-service"],
  "notification-service": ["notifications-service", "mailer-service", "email-service"],
  "service-discovery": ["discovery-service", "eureka-server", "consul"],
  "fruitcatalog.api": ["catalog.api", "books.api", "bookcatalog.api", "catalog-api", "catalog-service"],
  "fruitordering.api": ["ordering.api", "orders.api", "order.api", "ordering-api", "order-service"],
  "fruitbasket.api": ["basket.api", "cart.api", "basket-api", "cart-service"],
  apigateway: ["api-gateway", "gateway.api", "yarp-gateway", "gateway"],
};

export function adaptAuditLensToModel(
  lens: ModuleAuditLens,
  model: ArchitecturalModel | null | undefined,
): ModuleAuditLens {
  if (!model || model.elements.length === 0) return lens;
  const serviceNames = new Map(
    model.elements
      .filter((el) => el.elementType === "SERVICE_CONTAINER")
      .map((el) => [el.name.toLowerCase(), el.name]),
  );
  if (serviceNames.size === 0) return lens;

  const allElementNames = new Map(model.elements.map((el) => [el.name.toLowerCase(), el.name]));
  const firstBroker = model.elements.find(
    (el) => el.elementType === "QUEUE_BROKER" || el.elementType === "MESSAGE_CHANNEL",
  );

  const mapServiceName = (raw: string): string => {
    const exact = serviceNames.get(raw.toLowerCase());
    if (exact) return exact;
    for (const alt of SERVICE_ALIASES[raw.toLowerCase()] ?? []) {
      const found = serviceNames.get(alt.toLowerCase());
      if (found) return found;
    }
    return raw;
  };

  const resolveKnownNode = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const mapped = mapServiceName(raw);
    const direct = allElementNames.get(mapped.toLowerCase());
    if (direct) return direct;
    if (/^(kafka|rabbitmq|servicebus)$/i.test(raw) && firstBroker) {
      return firstBroker.name;
    }
    return undefined;
  };

  const adaptedFocusNames = Array.from(new Set(lens.focusNodeNames.map(mapServiceName)));
  const adaptedChips = lens.quickChips
    .map((chip): AuditLensQuickChip | null => {
      let resolvedSvc = chip.targetServiceName;
      if (resolvedSvc) {
        resolvedSvc = mapServiceName(resolvedSvc);
        if (!serviceNames.has(resolvedSvc.toLowerCase())) {
          return null;
        }
      }
      const nextLabelEn =
        resolvedSvc && chip.targetServiceName && resolvedSvc !== chip.targetServiceName
          ? chip.labelEn.replace(chip.targetServiceName, resolvedSvc)
          : chip.labelEn;
      const nextLabelVi =
        resolvedSvc && chip.targetServiceName && resolvedSvc !== chip.targetServiceName
          ? chip.labelVi.replace(chip.targetServiceName, resolvedSvc)
          : chip.labelVi;

      const resolvedNode = chip.targetNodeName
        ? resolveKnownNode(chip.targetNodeName)
        : undefined;
      const nextChip: AuditLensQuickChip = {
        ...chip,
        labelEn: nextLabelEn,
        labelVi: nextLabelVi,
        ...(resolvedSvc ? { targetServiceName: resolvedSvc } : {}),
      };
      if (chip.targetNodeName && !resolvedNode) {
        delete nextChip.targetNodeName;
      } else if (resolvedNode) {
        nextChip.targetNodeName = resolvedNode;
      }
      return nextChip;
    })
    .filter((chip): chip is AuditLensQuickChip => chip !== null);

  const mappedDefaultC3 = lens.defaultC3ServiceName
    ? mapServiceName(lens.defaultC3ServiceName)
    : undefined;
  const resolvedDefaultC3 =
    mappedDefaultC3 && serviceNames.has(mappedDefaultC3.toLowerCase())
      ? mappedDefaultC3
      : undefined;
  const resolvedDefaultNode = lens.defaultSelectedNodeName
    ? (resolveKnownNode(lens.defaultSelectedNodeName) ??
      Array.from(serviceNames.values())[0])
    : undefined;

  const { defaultC3ServiceName: _origC3, defaultSelectedNodeName: _origNode, ...baseLens } = lens;

  return {
    ...baseLens,
    focusNodeNames: adaptedFocusNames,
    ...(resolvedDefaultC3 ? { defaultC3ServiceName: resolvedDefaultC3 } : {}),
    ...(resolvedDefaultNode ? { defaultSelectedNodeName: resolvedDefaultNode } : {}),
    quickChips: adaptedChips,
  };
}

export function resolveModelElementByName(
  model: ArchitecturalModel | null | undefined,
  name: string | undefined,
): ArchitecturalModel["elements"][number] | undefined {
  if (!model || !name) return undefined;
  const exact = model.elements.find((el) => el.name === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  return model.elements.find((el) => el.name.toLowerCase() === lower);
}

export function computeActiveLensFocus(
  lens: ModuleAuditLens,
  model: ArchitecturalModel | null | undefined,
): ActiveLensFocus {
  const focusNodeIds = new Set<string>();
  const focusEdgeIds = new Set<string>();
  if (!model) return { focusNodeIds, focusEdgeIds };

  const targetNames = new Set(lens.focusNodeNames.map((n) => n.toLowerCase()));
  const byId = new Map(model.elements.map((el) => [el.id, el]));

  for (const el of model.elements) {
    if (targetNames.has(el.name.toLowerCase())) {
      focusNodeIds.add(el.id);
      if (el.parentId && byId.has(el.parentId)) {
        focusNodeIds.add(el.parentId);
      }
    }
  }

  // In C1 Context, keep the central system box illuminated when actors/externals are focused
  if (lens.defaultView === "CONTEXT") {
    focusNodeIds.add(`system:${model.projectId}`);
    for (const el of model.elements) {
      if (el.elementType === "SOFTWARE_SYSTEM") {
        focusNodeIds.add(el.id);
      }
    }
  }

  // If a container is focused and we are inspecting components inside it, keep its children lit
  // unless specific component names inside that container were explicitly named in focusNodeNames.
  const containersWithExplicitChildFocus = new Set<string>();
  for (const el of model.elements) {
    if (el.elementType === "COMPONENT" && el.parentId && targetNames.has(el.name.toLowerCase())) {
      containersWithExplicitChildFocus.add(el.parentId);
    }
  }
  for (const el of model.elements) {
    if (
      el.elementType === "COMPONENT" &&
      el.parentId &&
      focusNodeIds.has(el.parentId) &&
      !containersWithExplicitChildFocus.has(el.parentId)
    ) {
      focusNodeIds.add(el.id);
    }
  }

  const protocolSet = new Set(lens.focusEdgeProtocols ?? []);
  for (const edge of model.edges) {
    const protocolMatches = protocolSet.size > 0 && protocolSet.has(edge.protocol);
    const endpointsMatch = focusNodeIds.has(edge.from) && focusNodeIds.has(edge.to);
    const parentFrom = byId.get(edge.from)?.parentId;
    const parentTo = byId.get(edge.to)?.parentId;
    const parentEndpointsMatch =
      (focusNodeIds.has(edge.from) || (parentFrom ? focusNodeIds.has(parentFrom) : false)) &&
      (focusNodeIds.has(edge.to) || (parentTo ? focusNodeIds.has(parentTo) : false));

    if (
      endpointsMatch ||
      (protocolMatches && (focusNodeIds.size === 0 || parentEndpointsMatch))
    ) {
      focusEdgeIds.add(edge.id);
    }
  }

  return { focusNodeIds, focusEdgeIds };
}

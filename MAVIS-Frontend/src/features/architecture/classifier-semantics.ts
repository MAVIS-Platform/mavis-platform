import type { UmlRelationKind } from "./uml-diagrams";

const domainMarkers = new Set([
  "Entity",
  "Table",
  "Document",
  "Embeddable",
  "Aggregate",
  "AggregateRoot",
  "ValueObject",
]);
const plumbingTypes = new Set([
  "javax.servlet.Filter",
  "jakarta.servlet.Filter",
  "org.springframework.web.filter.OncePerRequestFilter",
  "org.springframework.web.filter.GenericFilterBean",
  "org.springframework.web.servlet.HandlerInterceptor",
  "org.springframework.web.servlet.config.annotation.WebMvcConfigurer",
]);
const values = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.map((item) => (typeof item === "string" ? item : String(item?.name ?? "")))
    : [];
const shortName = (type: string) => type.split("<")[0]!.split(".").at(-1) ?? "";

export function isDomainClassifier(metadata: Record<string, unknown> | undefined): boolean {
  return (
    metadata?.["isEntity"] === true ||
    metadata?.["isAggregateRoot"] === true ||
    values(metadata?.["annotations"]).some((a) => domainMarkers.has(shortName(a))) ||
    values(metadata?.["baseTypes"]).some((t) =>
      ["AbstractAggregateRoot", "AggregateRoot"].includes(shortName(t)),
    )
  );
}

export function isInfrastructureClassifier(metadata: Record<string, unknown> | undefined): boolean {
  const imports = values(metadata?.["imports"]);
  return [
    ...values(metadata?.["baseTypes"]),
    ...values(metadata?.["interfaceTypes"]),
    ...values(metadata?.["extendsTypes"]),
    ...values(metadata?.["implementsTypes"]),
  ].some((type) => {
    const name = type.split("<")[0]!.trim();
    if (plumbingTypes.has(name)) return true;
    if (name.includes(".")) return false;
    return [...plumbingTypes].some(
      (known) =>
        shortName(known) === name &&
        (imports.includes(known) ||
          imports.includes(known.slice(0, known.lastIndexOf(".")) + ".*")),
    );
  });
}

const declarativeClientAnnotations = new Set([
  "FeignClient",
  "HttpExchange",
  "GetExchange",
  "PostExchange",
  "PutExchange",
  "DeleteExchange",
  "PatchExchange",
  "GrpcClient",
  "WebServiceClient",
  "RegisterRestClient",
]);

export function isClientClassifier(
  metadata: Record<string, unknown> | undefined,
  fields: Array<{ type: string }>,
): boolean {
  const clients =
    /\b(WebClient|RestTemplate|FeignClient|HttpClient|GrpcStub|AbstractStub|AbstractBlockingStub|AbstractFutureStub|CommandEndpoint|KafkaTemplate|RabbitTemplate|JmsTemplate|MessageProducer)\b/;
  return (
    fields.some((f) => clients.test(f.type) || /\b\w+(?:Blocking|Future)Stub\b/.test(f.type)) ||
    values(metadata?.["annotations"]).some((a) => declarativeClientAnnotations.has(shortName(a))) ||
    [...values(metadata?.["baseTypes"]), ...values(metadata?.["interfaceTypes"])].some((t) =>
      clients.test(t),
    )
  );
}

export function isDeclarativeClientElement(node: {
  name: string;
  elementType?: string | null | undefined;
  properties?: Record<string, unknown> | null | undefined;
  evidence?: Array<{ snippet?: string | null | undefined }> | null | undefined;
}): boolean {
  const props = (node.properties ?? {}) as Record<string, unknown>;
  const basis = String(props["componentBasis"] ?? "").toUpperCase();
  if (basis === "FEIGN_CLIENT" || basis === "DECLARATIVE_CLIENT") return true;
  const rawUml = props["umlClassifier"] as Record<string, unknown> | undefined;
  const anns = [...values(rawUml?.["annotations"]), ...values(props["annotations"])];
  if (anns.some((a) => declarativeClientAnnotations.has(shortName(a)))) return true;
  const snippets = (node.evidence ?? []).map((e) => e.snippet ?? "").join("\n");
  if (
    /@(?:FeignClient|HttpExchange|GetExchange|PostExchange|PutExchange|DeleteExchange|PatchExchange|GrpcClient|WebServiceClient|RegisterRestClient)\b/.test(
      snippets,
    )
  ) {
    return true;
  }
  const typeKind = String(
    rawUml?.["typeKind"] ?? rawUml?.["classifierKind"] ?? props["typeKind"] ?? "",
  ).toUpperCase();
  const qualName = String(rawUml?.["qualifiedName"] ?? props["qualifiedName"] ?? node.name ?? "");
  if (node.elementType === "CLASS_INTERFACE" || typeKind === "INTERFACE") {
    if (/(?:FeignClient|HttpClient|GrpcClient|RestClient|ServiceClient|ApiClient)$/i.test(node.name)) {
      return true;
    }
    if (/\.client\.[A-Z]\w*Client$/i.test(qualName)) {
      return true;
    }
  }
  return false;
}

export function extractDeclarativeClientTarget(node: {
  name: string;
  properties?: Record<string, unknown> | null | undefined;
  evidence?: Array<{ snippet?: string | null | undefined }> | null | undefined;
}): string | null {
  const props = (node.properties ?? {}) as Record<string, unknown>;
  for (const key of ["targetService", "targetComponent"]) {
    const val = props[key];
    if (typeof val === "string" && val.trim() && !val.includes("${")) return val.trim();
  }
  const rawUml = props["umlClassifier"] as Record<string, unknown> | undefined;
  const searchPool = [
    ...(node.evidence ?? []).map((e) => e.snippet ?? ""),
    ...values(rawUml?.["annotations"]),
    ...values(props["annotations"]),
  ].join("\n");
  const nameMatch = searchPool.match(
    /@(?:FeignClient|GrpcClient|RegisterRestClient)\s*\(\s*(?:(?:name|value|configKey)\s*=\s*)?"([^"${}]+)"/,
  );
  if (nameMatch?.[1]?.trim()) return nameMatch[1].trim();
  const namedPairMatch = searchPool.match(
    /@(?:FeignClient|GrpcClient|RegisterRestClient)\s*\([^)]*\b(?:name|value|configKey)\s*=\s*"([^"${}]+)"/,
  );
  if (namedPairMatch?.[1]?.trim()) return namedPairMatch[1].trim();
  const urlMatch = searchPool.match(/@(?:FeignClient|HttpExchange)\s*\([^)]*\burl\s*=\s*"([^"${}]+)"/);
  if (urlMatch?.[1]?.trim()) {
    const rawUrl = urlMatch[1].trim();
    const hostMatch = rawUrl.match(/^https?:\/\/([^:/]+)(?::\d+)?/i);
    return (hostMatch?.[1] ?? rawUrl).trim();
  }
  const stemMatch = node.name.match(
    /^([A-Za-z0-9]+?)(?:FeignClient|HttpClient|GrpcClient|RestClient|ServiceClient|ApiClient|Client)$/i,
  );
  if (stemMatch?.[1]) {
    const kebab = stemMatch[1]
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/-service$/, "");
    if (kebab) return `${kebab}-service`;
  }
  return null;
}

export function normalizeExtractedClassRelation(
  kind: UmlRelationKind,
  properties: Record<string, unknown>,
  sourceIsDomain: boolean,
): UmlRelationKind {
  if (kind !== "COMPOSITION" && kind !== "SHARED_AGGREGATION") return kind;
  // A final field, constructor parameter, allocation or class-name suffix does
  // not establish UML whole-part lifecycle ownership.
  const proof = properties["ownershipEvidence"];
  const owned = [
    "EMBEDDED_VALUE",
    "ELEMENT_COLLECTION",
    "CASCADE_ORPHAN_REMOVAL",
    "OWNED_VALUE_COLLECTION",
  ].includes(String(proof));
  if (
    kind === "COMPOSITION" &&
    sourceIsDomain &&
    properties["astVerifiedWholePart"] === true &&
    properties["injectedReference"] !== true &&
    owned
  )
    return "COMPOSITION";
  return "ASSOCIATION";
}

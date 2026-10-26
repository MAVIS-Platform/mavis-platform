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

export function isClientClassifier(
  metadata: Record<string, unknown> | undefined,
  fields: Array<{ type: string }>,
): boolean {
  const clients =
    /\b(WebClient|RestTemplate|FeignClient|HttpClient|GrpcStub|AbstractStub|AbstractBlockingStub|AbstractFutureStub|CommandEndpoint|KafkaTemplate|RabbitTemplate|JmsTemplate|MessageProducer)\b/;
  return (
    fields.some((f) => clients.test(f.type) || /\b\w+(?:Blocking|Future)Stub\b/.test(f.type)) ||
    values(metadata?.["annotations"]).some((a) => shortName(a) === "FeignClient") ||
    [...values(metadata?.["baseTypes"]), ...values(metadata?.["interfaceTypes"])].some((t) =>
      clients.test(t),
    )
  );
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

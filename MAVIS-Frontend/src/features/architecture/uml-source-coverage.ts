import type { AnyUmlProjection } from "./uml-diagrams";
/** A saved layout is not allowed to hide newly extracted source elements. */
export function savedUmlCoversSource(xml: string, projection: AnyUmlProjection): boolean {
  const ids =
    projection.diagramKind === "UML_CLASS"
      ? projection.classifiers
          .filter((item) => item.provenance === "EXTRACTED")
          .map((item) => item.classifierId)
      : projection.diagramKind === "UML_PACKAGE"
        ? projection.packages
            .filter((item) => item.provenance === "EXTRACTED")
            .map((item) => item.packageId)
        : projection.diagramKind === "UML_DEPLOYMENT"
          ? [
              ...projection.nodes
                .filter((item) => item.provenance === "EXTRACTED")
                .map((item) => item.nodeId),
              ...projection.edges
                .filter((item) => item.provenance === "EXTRACTED")
                .map((item) => item.edgeId),
            ]
          : [];
  return ids.every((id) =>
    xml.includes(
      id
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
    ),
  );
}

import type { ArchitecturalModel } from "@/types/domain";

export function adminJobsReturnHref(params: Pick<URLSearchParams, "get">): string {
  const value = params.get("returnTo");
  if (!value) return "/administration/jobs";
  try {
    const url = new URL(value, "https://mavis.invalid");
    if (url.origin !== "https://mavis.invalid" || url.pathname !== "/administration/jobs")
      return "/administration/jobs";
    const query = new URLSearchParams();
    for (const key of ["job", "search", "status", "page"])
      if (url.searchParams.get(key)) query.set(key, url.searchParams.get(key)!);
    return `/administration/jobs${query.size ? `?${query}` : ""}`;
  } catch {
    return "/administration/jobs";
  }
}

export function summarizeJobModel(model: ArchitecturalModel) {
  const evidence = new Set(
    [...model.elements, ...model.edges].flatMap((item) => item.evidence.map((entry) => entry.id)),
  );
  return {
    services: model.elements.filter((element) => element.elementType === "SERVICE_CONTAINER").length,
    elements: model.elements.length,
    relationships: model.edges.length,
    evidence: evidence.size,
    uncertain: model.edges.filter((edge) => edge.uncertain).length,
  };
}

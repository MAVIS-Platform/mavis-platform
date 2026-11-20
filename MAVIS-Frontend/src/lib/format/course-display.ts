const REDUNDANT_LAB_PREFIX = /^(?:Lab\s*0?\d+(?:\s*\([^)]*\))?\s*[·:\-]\s*)+/i;

export function stripLeadingLabPrefix(title: string | null | undefined): string {
  if (!title) return "";
  return title.trim().replace(REDUNDANT_LAB_PREFIX, "").trim();
}

export function formatCourseLabTitle(
  title: string | null | undefined,
  labOrder?: number | null,
  fallbackId?: string,
): string {
  const cleanTitle = stripLeadingLabPrefix(title) || title?.trim() || fallbackId || "";
  if (typeof labOrder === "number" && Number.isFinite(labOrder) && labOrder > 0) {
    const padded = `Lab ${String(labOrder).padStart(2, "0")}`;
    return cleanTitle ? `${padded} · ${cleanTitle}` : padded;
  }
  return cleanTitle;
}

export function toTenScaleScore(
  scoreOutOf100: number | null | undefined,
  explicitTenScale?: number | null,
): number | null {
  if (typeof explicitTenScale === "number" && Number.isFinite(explicitTenScale)) {
    return Math.round(explicitTenScale * 100) / 100;
  }
  if (typeof scoreOutOf100 !== "number" || !Number.isFinite(scoreOutOf100)) {
    return null;
  }
  return Math.round((scoreOutOf100 / 10) * 100) / 100;
}

export function formatTenScaleScore(
  scoreOutOf100: number | null | undefined,
  explicitTenScale?: number | null,
): string {
  const ten = toTenScaleScore(scoreOutOf100, explicitTenScale);
  return ten === null ? "—" : `${ten.toFixed(2)} / 10`;
}

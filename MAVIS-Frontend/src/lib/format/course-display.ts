export function decodePlainTextEntities(value?: string | null): string {
  if (!value) return "";
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&amp;/g, "&");
}

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

const REDUNDANT_QUESTION_PREFIX = /^(?:(?:Câu|Question|Q)\s*#?\s*\d+\s*[:.)\-–]\s*|\d+\s*[.)]\s+)/i;

export function sanitizeQuizPlainText(text: string | null | undefined): string {
  if (!text) return "";
  let s = text.trim();
  const latexReplacements: Array<[RegExp, string]> = [
    [/\\(?:leq|le)\b/g, "≤"],
    [/\\(?:geq|ge)\b/g, "≥"],
    [/\\(?:neq|ne)\b/g, "≠"],
    [/\\approx\b/g, "≈"],
    [/\\times\b/g, "×"],
    [/\\(?:rightarrow|to)\b/g, "→"],
    [/\\leftrightarrow\b/g, "↔"],
    [/\\alpha\b/g, "α"],
    [/\\beta\b/g, "β"],
    [/\\gamma\b/g, "γ"],
    [/\\delta\b/gi, "Δ"],
    [/\\mu\b/g, "μ"],
    [/\\infty\b/g, "∞"],
    [/\\(?:textbf|textit|textrm|mathrm|text|code)\{([^}]*)\}/g, "$1"],
    [/\$\$([^$]+)\$\$/g, "$1"],
    [/\$([^$]+)\$/g, "$1"],
    [/\*\*([^*]+)\*\*/g, "$1"],
    [/`([^`]+)`/g, "$1"],
  ];
  for (const [pattern, replacement] of latexReplacements) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

export function formatQuizQuestionPrompt(prompt: string | null | undefined): string {
  let clean = sanitizeQuizPlainText(prompt);
  while (REDUNDANT_QUESTION_PREFIX.test(clean)) {
    const next = clean.replace(REDUNDANT_QUESTION_PREFIX, "").trim();
    if (next === clean) break;
    clean = next;
  }
  return clean;
}

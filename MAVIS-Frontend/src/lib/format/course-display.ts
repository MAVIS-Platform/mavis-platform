export function formatLabModeLabel(
  labMode: string | null | undefined,
  t: (en: string, vi?: string) => string,
): string {
  switch ((labMode ?? "").trim().toUpperCase()) {
    case "THEORY_QUIZ_STUDIO":
      return t("Theory + Quiz + Studio", "Lý thuyết + Quiz + Studio");
    case "THEORY_QUIZ":
      return t("Theory + Quiz", "Lý thuyết + Quiz");
    case "THEORY_ONLY":
      return t("Theory Only", "Chỉ lý thuyết");
    case "LEGACY":
      return t("Standard Lab", "Lab tiêu chuẩn");
    default:
      return (labMode ?? "").replace(/_/g, " ");
  }
}

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

const PLAIN_LATEX_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\{1,2}(?:leq|le)\b/g, "≤"],
  [/\\{1,2}(?:geq|ge)\b/g, "≥"],
  [/\\{1,2}(?:neq|ne)\b/g, "≠"],
  [/\\{1,2}approx\b/g, "≈"],
  [/\\{1,2}times\b/g, "×"],
  [/\\{1,2}(?:rightarrow|to)\b/g, "→"],
  [/\\{1,2}leftrightarrow\b/g, "↔"],
  [/\\{1,2}alpha\b/g, "α"],
  [/\\{1,2}beta\b/g, "β"],
  [/\\{1,2}gamma\b/g, "γ"],
  [/\\{1,2}delta\b/gi, "Δ"],
  [/\\{1,2}mu\b/g, "μ"],
  [/\\{1,2}infty\b/g, "∞"],
  [/\\{1,2}%/g, "%"],
  [/\\{1,2}(?:textbf|textit|textrm|mathrm|text|code)\{([^}]*)\}/g, "$1"],
];

function convertInlineLatexToken(expr: string): string {
  let out = expr;
  for (const [pattern, replacement] of PLAIN_LATEX_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export function formatCoursePlainText(value?: string | null): string {
  if (!value) return "";
  let s = decodePlainTextEntities(value).trim();
  const replaceMath = (full: string, expr: string) => {
    const hasLatex = /\\{1,2}[a-zA-Z%]+|[=<>^_{}+*/→←↔≤≥≠≈×]/.test(expr);
    const isCompact =
      /^[A-Za-z0-9_().\-,]+(?:\s[+\-*/=<>]\s[A-Za-z0-9_().\-,]+)*$/.test(expr);
    return hasLatex || isCompact ? convertInlineLatexToken(expr) : full;
  };
  s = s
    .replace(/\$\$(?!\{)\s*([^$\n]+?)\s*\$\$/g, replaceMath)
    .replace(/\$(?!\{)\s*([^$\n]{1,120}?)\s*\$/g, replaceMath)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
  return s.replace(/\s{2,}/g, " ").trim();
}

export function sanitizeQuizPlainText(text: string | null | undefined): string {
  if (!text) return "";
  let s = convertInlineLatexToken(decodePlainTextEntities(text).trim());
  s = s
    .replace(/\$\$(?!\{)([^$]+)\$\$/g, "$1")
    .replace(/\$(?!\{)([^$]+)\$/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
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

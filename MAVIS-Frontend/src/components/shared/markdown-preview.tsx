"use client";

import { Fragment, type ReactNode } from "react";
import { decodePlainTextEntities } from "@/lib/format/course-display";

export type MarkdownTheme = "coursera" | "academic" | "docs" | "notes";

export const MARKDOWN_THEMES: ReadonlyArray<{
  id: MarkdownTheme;
  en: string;
  vi: string;
}> = [
  { id: "coursera", en: "Coursera (Modern)", vi: "Coursera (Hiện đại)" },
  { id: "academic", en: "Academic (Textbook)", vi: "Học thuật (Giáo trình)" },
  { id: "docs", en: "Technical Docs", vi: "Tài liệu kỹ thuật (Docs)" },
  { id: "notes", en: "Study Notes", vi: "Ghi chú ôn tập (Notes)" },
];

const THEME_DIRECTIVE_RE = /^\s*<!--\s*theme:\s*(coursera|academic|docs|notes)\s*-->\s*\r?\n?/i;

/** Extracts an optional leading Markdown presentation theme directive without rendering it. */
export function extractMarkdownTheme(raw: string): { theme: MarkdownTheme; body: string } {
  const match = THEME_DIRECTIVE_RE.exec(raw);
  if (!match) return { theme: "coursera", body: raw };
  return {
    theme: match[1]!.toLowerCase() as MarkdownTheme,
    body: raw.slice(match[0].length),
  };
}

/** Prepends a hidden theme directive for non-default themes, stripping any prior directive first. */
export function applyMarkdownTheme(body: string, theme: MarkdownTheme): string {
  const cleanBody = extractMarkdownTheme(body).body;
  if (theme === "coursera") return cleanBody;
  return `<!-- theme: ${theme} -->\n${cleanBody}`;
}

type ThemeClasses = {
  root: string;
  h1: string;
  h2: string;
  h3: string;
  paragraph: string;
  list: string;
  subList: string;
  blockquote: string;
  codeBlock: string;
  tableWrap: string;
  thead: string;
  th: string;
  td: string;
};

const THEME_STYLES: Record<MarkdownTheme, ThemeClasses> = {
  coursera: {
    root: "space-y-2.5",
    h1: "mt-4 text-xl font-bold tracking-tight text-foreground",
    h2: "mt-4 border-b border-border/60 pb-1 text-lg font-semibold tracking-tight text-foreground",
    h3: "mt-3 text-base font-semibold text-foreground",
    paragraph: "text-sm leading-7 text-muted-foreground",
    list: "ml-5 space-y-1.5 text-sm leading-7 text-muted-foreground",
    subList: "ml-5 mt-1 list-disc space-y-1 text-sm leading-6 text-muted-foreground",
    blockquote: "border-l-2 border-teal-500/70 bg-teal-50/40 px-3 py-1.5 text-sm italic text-muted-foreground dark:bg-teal-950/20",
    codeBlock: "overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-6",
    tableWrap: "my-3 overflow-x-auto rounded-lg border border-border",
    thead: "bg-muted/50 text-foreground",
    th: "border-b px-3 py-2 font-semibold",
    td: "px-3 py-2 align-top text-muted-foreground",
  },
  academic: {
    root: "space-y-3 font-serif",
    h1: "mt-4 border-b-2 border-foreground/20 pb-2 text-2xl font-bold tracking-tight text-foreground",
    h2: "mt-5 text-lg font-bold tracking-normal text-foreground",
    h3: "mt-4 text-base font-semibold text-foreground",
    paragraph: "text-[15px] leading-8 text-foreground/90",
    list: "ml-6 space-y-2 text-[15px] leading-7 text-foreground/90",
    subList: "ml-5 mt-1 list-disc space-y-1 text-sm leading-7 text-foreground/85",
    blockquote: "border-l-4 border-slate-500 bg-muted/40 px-4 py-2 text-sm leading-7 text-foreground/90 not-italic",
    codeBlock: "overflow-x-auto rounded border border-slate-300 bg-muted/30 p-3 font-mono text-xs leading-6 dark:border-slate-700",
    tableWrap: "my-4 overflow-x-auto rounded border border-foreground/20",
    thead: "bg-muted/60 text-foreground",
    th: "border-b border-foreground/20 px-3 py-2 font-semibold",
    td: "border-b border-border/50 px-3 py-2 align-top text-foreground/85",
  },
  docs: {
    root: "space-y-2.5",
    h1: "mt-4 border-b border-border pb-1.5 text-xl font-bold tracking-tight text-foreground",
    h2: "mt-5 border-l-4 border-primary pl-2.5 text-base font-bold uppercase tracking-wide text-foreground",
    h3: "mt-3 text-sm font-bold text-primary",
    paragraph: "text-sm leading-6 text-foreground/85",
    list: "ml-5 space-y-1 text-sm leading-6 text-foreground/85",
    subList: "ml-5 mt-1 list-disc space-y-1 text-xs leading-6 text-muted-foreground",
    blockquote: "rounded-r-lg border-l-4 border-primary bg-primary/5 px-3.5 py-2 text-sm leading-6 text-foreground/90 not-italic",
    codeBlock: "overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs leading-6 text-slate-100",
    tableWrap: "my-3 overflow-x-auto rounded-lg border border-border shadow-2xs",
    thead: "bg-muted text-foreground",
    th: "border-b px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide",
    td: "px-3 py-2 align-top text-foreground/85",
  },
  notes: {
    root: "space-y-3",
    h1: "mt-4 rounded-xl border border-teal-500/25 bg-teal-500/10 px-3.5 py-2 text-lg font-bold text-foreground",
    h2: "mt-4 rounded-lg bg-amber-500/10 px-3 py-1.5 text-base font-semibold text-amber-900 dark:text-amber-200",
    h3: "mt-3 text-sm font-semibold text-teal-700 dark:text-teal-300",
    paragraph: "text-sm leading-7 text-foreground/90",
    list: "ml-5 space-y-2 text-sm leading-7 text-foreground/90",
    subList: "ml-5 mt-1 list-disc space-y-1.5 text-sm leading-6 text-muted-foreground",
    blockquote: "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-sm leading-6 text-foreground not-italic",
    codeBlock: "overflow-x-auto rounded-xl border border-teal-500/20 bg-muted/50 p-3 text-xs leading-6",
    tableWrap: "my-3 overflow-x-auto rounded-xl border border-amber-500/25",
    thead: "bg-amber-500/10 text-foreground",
    th: "border-b border-amber-500/20 px-3 py-2 font-semibold",
    td: "px-3 py-2 align-top text-foreground/90",
  },
};

const INLINE =
  /(\[[^\]]+\]\((?:https?:\/\/|\/)[^\s)]+\)|`[^`]+`|\*\*[^*\n]+(?:\*(?!\*)[^*\n]*)*\*\*|\*(?!\s)[^*\n]+?(?<!\s)\*)/g;

const MOJIBAKE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ðŸ“–/g, "📖"],
  [/ðŸ“š/g, "📚"],
  [/ðŸ“ /g, "📝"],
  [/ðŸ§ª/g, "🧪"],
  [/ðŸš€/g, "🚀"],
  [/ðŸ”¬/g, "🔬"],
  [/ðŸ”‘/g, "🔑"],
  [/ðŸ”’/g, "🔒"],
  [/ðŸ’¡/g, "💡"],
  [/ðŸ”/g, "🔍"],
  [/ðŸ”/g, "🔍"],
  [/ðŸŽ¯/g, "🎯"],
  [/âœ…/g, "✅"],
  [/âš\s*ï¸?/g, "⚠️"],
  [/â†’/g, "→"],
  [/â€”/g, "—"],
  [/â€“/g, "–"],
  [/ð[\u0080-\u024F\u2000-\u206F]{1,4}/g, ""],
  [/\uFFFD/g, ""],
];

export function sanitizeMojibake(input: string): string {
  let out = input;
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}

const MATH_COMMAND_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\{1,2}(?:leq|le)\b/g, "≤"],
  [/\\{1,2}(?:geq|ge)\b/g, "≥"],
  [/\\{1,2}(?:neq|ne)\b/g, "≠"],
  [/\\{1,2}approx\b/g, "≈"],
  [/\\{1,2}times\b/g, "×"],
  [/\\{1,2}(?:rightarrow|to)\b/g, "→"],
  [/\\{1,2}(?:leftarrow|gets)\b/g, "←"],
  [/\\{1,2}leftrightarrow\b/g, "↔"],
  [/\\{1,2}alpha\b/g, "α"],
  [/\\{1,2}beta\b/g, "β"],
  [/\\{1,2}gamma\b/g, "γ"],
  [/\\{1,2}Delta\b/g, "Δ"],
  [/\\{1,2}delta\b/g, "δ"],
  [/\\{1,2}mu\b/g, "μ"],
  [/\\{1,2}infty\b/g, "∞"],
  [/\\{1,2}%/g, "%"],
  [/\\{1,2}(?:textbf|textit|textrm|mathrm|text|code)\{([^}]*)\}/g, "$1"],
];

function convertMathBody(expr: string): string {
  let out = expr;
  for (const [pattern, replacement] of MATH_COMMAND_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Converts inline LaTeX math spans (e.g. `$1 \to 4$`, `$\rightarrow$`, `$8$`) outside code spans while leaving currency like `$100` and env `${VAR}` untouched. */
export function formatInlineMath(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((segment) => {
      if (segment.startsWith("`") && segment.endsWith("`")) return segment;
      const replaceMath = (full: string, expr: string) => {
        const hasLatexOrMathSymbol =
          /\\{1,2}[a-zA-Z%]+|[=<>^_{}+*/→←↔≤≥≠≈×]/.test(expr);
        const isCompactToken =
          /^[A-Za-z0-9_().\-,]+(?:\s[+\-*/=<>]\s[A-Za-z0-9_().\-,]+)*$/.test(expr);
        if (!hasLatexOrMathSymbol && !isCompactToken) return full;
        return convertMathBody(expr);
      };
      return segment
        .replace(/\$\$(?!\{)(?!\s)([^$\n]{1,200}?)(?<!\s)\$\$/g, replaceMath)
        .replace(/\$\$(?!\{)\s*([^$\n]{1,200}?\\{1,2}[a-zA-Z%]+[^$\n]*?)\s*\$\$/g, replaceMath)
        .replace(/\$(?!\{)(?!\s)([^$\n]{1,120}?)(?<!\s)\$/g, replaceMath)
        .replace(/\$(?!\{)\s*([^$\n]{1,120}?\\{1,2}[a-zA-Z%]+[^$\n]*?)\s*\$/g, replaceMath);
    })
    .join("");
}

function safeHref(value: string) {
  return value.startsWith("/") || /^https?:\/\//i.test(value) ? value : null;
}

function inline(text: string, depth = 0): ReactNode[] {
  const cleaned = depth === 0 ? formatInlineMath(sanitizeMojibake(text)) : text;
  const parts = cleaned.split(INLINE);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[0.88em] font-medium text-teal-800 dark:text-teal-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const inner = part.slice(2, -2);
      return <strong key={index}>{depth < 3 ? inline(inner, depth + 1) : inner}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const inner = part.slice(1, -1);
      return <em key={index}>{depth < 3 ? inline(inner, depth + 1) : inner}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]!);
      if (!href) return <Fragment key={index}>{link[1]}</Fragment>;
      return (
        <a
          key={index}
          href={href}
          className="font-medium text-primary underline underline-offset-2"
          {...(/^https?:\/\//i.test(href) ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          {link[1]}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function heading(level: number, text: string, key: number, styles: ThemeClasses) {
  const className = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
  if (level === 1) return <h1 key={key} className={className}>{inline(text)}</h1>;
  if (level === 2) return <h2 key={key} className={className}>{inline(text)}</h2>;
  if (level === 3) return <h3 key={key} className={className}>{inline(text)}</h3>;
  if (level === 4) return <h4 key={key} className={className}>{inline(text)}</h4>;
  if (level === 5) return <h5 key={key} className={className}>{inline(text)}</h5>;
  return <h6 key={key} className={className}>{inline(text)}</h6>;
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return splitTableCells(trimmed).every((cell) => /^:?-{2,}:?$/.test(cell));
}

type ListItem = {
  text: string;
  subItems: Array<{ ordered: boolean; text: string }>;
};

export function MarkdownPreview({
  markdown,
  className = "",
  theme,
}: {
  markdown: string;
  className?: string;
  theme?: MarkdownTheme | undefined;
}) {
  const parsed = extractMarkdownTheme(decodePlainTextEntities(markdown));
  const activeTheme: MarkdownTheme = theme ?? parsed.theme;
  const styles = THEME_STYLES[activeTheme];
  const lines = parsed.body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: ListItem[] } | null = null;
  let code: string[] | null = null;
  let tableRows: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={blocks.length} className={styles.paragraph}>
        {inline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) =>
      item.subItems.length > 0 ? (
        <li key={index} className="space-y-1">
          <span>{inline(item.text)}</span>
          <ul className={styles.subList}>
            {item.subItems.map((sub, subIdx) => (
              <li key={subIdx}>{inline(sub.text)}</li>
            ))}
          </ul>
        </li>
      ) : (
        <li key={index}>{inline(item.text)}</li>
      ),
    );
    blocks.push(
      list.ordered ? (
        <ol
          key={blocks.length}
          start={list.start}
          className={`list-decimal ${styles.list}`}
        >
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className={`list-disc ${styles.list}`}>
          {items}
        </ul>
      ),
    );
    list = null;
  };

  const flushTable = () => {
    if (!tableRows || tableRows.length === 0) {
      tableRows = null;
      return;
    }
    const headerCells = splitTableCells(tableRows[0]!);
    const bodyStart = tableRows.length > 1 && isTableSeparator(tableRows[1]!) ? 2 : 1;
    const bodyRows = tableRows.slice(bodyStart).map(splitTableCells);
    blocks.push(
      <div key={blocks.length} className={styles.tableWrap}>
        <table className="w-full border-collapse text-left text-xs">
          <thead className={styles.thead}>
            <tr>
              {headerCells.map((cell, cellIdx) => (
                <th key={cellIdx} className={styles.th}>
                  {inline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {bodyRows.map((cells, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-muted/20">
                {cells.map((cell, cellIdx) => (
                  <td key={cellIdx} className={styles.td}>
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (code) {
      if (line.trim().startsWith("```")) {
        blocks.push(
          <pre key={blocks.length} className={styles.codeBlock}>
            <code>{code.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      flushTable();
      code = [];
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushParagraph();
      flushList();
      if (!tableRows) tableRows = [];
      tableRows.push(line);
      continue;
    }
    flushTable();

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={blocks.length} className="my-3 border-border" />);
      continue;
    }

    const blockquoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      const bqText = blockquoteMatch[1]!.trim();
      const bqBullet = /^[-*•]\s+(.*)$/.exec(bqText);
      blocks.push(
        <blockquote
          key={blocks.length}
          className={styles.blockquote}
        >
          {bqBullet ? (
            <>
              <span className="mr-1.5 font-semibold not-italic">•</span>
              {inline(bqBullet[1]!)}
            </>
          ) : (
            inline(blockquoteMatch[1]!)
          )}
        </blockquote>,
      );
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push(heading(headingMatch[1]!.length, headingMatch[2]!, blocks.length, styles));
      continue;
    }

    const subItemMatch = /^\s{2,}(?:[-*•]|(\d+)\.)\s+(.*)$/.exec(line);
    if (subItemMatch) {
      flushParagraph();
      if (list && list.items.length > 0) {
        list.items[list.items.length - 1]!.subItems.push({
          ordered: Boolean(subItemMatch[1]),
          text: subItemMatch[2]!,
        });
      } else {
        list = {
          ordered: Boolean(subItemMatch[1]),
          start: Number(subItemMatch[1]) || 1,
          items: [{ text: subItemMatch[2]!, subItems: [] }],
        };
      }
      continue;
    }

    const unordered = /^[-*•]\s+(.*)$/.exec(line);
    const ordered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      const startNum = ordered ? Number(ordered[1]) || 1 : 1;
      if (!list || list.ordered !== orderedList) {
        flushList();
        list = { ordered: orderedList, start: startNum, items: [] };
      }
      list.items.push({ text: (unordered?.[1] ?? ordered?.[2])!, subItems: [] });
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }
  if (code) {
    blocks.push(
      <pre key={blocks.length} className={styles.codeBlock}>
        <code>{code.join("\n")}</code>
      </pre>,
    );
  }
  flushParagraph();
  flushList();
  flushTable();

  if (!blocks.length) {
    return (
      <div data-markdown-theme={activeTheme} className={`${styles.root} ${className}`.trim()}>
        <p className={styles.paragraph}>{formatInlineMath(sanitizeMojibake(parsed.body))}</p>
      </div>
    );
  }
  return (
    <div data-markdown-theme={activeTheme} className={`${styles.root} ${className}`.trim()}>
      {blocks}
    </div>
  );
}

"use client";

import { Fragment, type ReactNode } from "react";

const INLINE = /(\[[^\]]+\]\((?:https?:\/\/|\/)[^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

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

function safeHref(value: string) {
  return value.startsWith("/") || /^https?:\/\//i.test(value) ? value : null;
}

function inline(text: string, depth = 0): ReactNode[] {
  const cleaned = sanitizeMojibake(text);
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
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      return <strong key={index}>{depth < 2 ? inline(inner, depth + 1) : inner}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      const inner = part.slice(1, -1);
      return <em key={index}>{depth < 2 ? inline(inner, depth + 1) : inner}</em>;
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

function heading(level: number, text: string, key: number) {
  const className =
    level === 1
      ? "mt-4 text-xl font-bold tracking-tight text-foreground"
      : level === 2
        ? "mt-4 text-lg font-semibold tracking-tight text-foreground"
        : "mt-3 text-base font-semibold text-foreground";
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

export function MarkdownPreview({ markdown, className = "" }: { markdown: string; className?: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: ListItem[] } | null = null;
  let code: string[] | null = null;
  let tableRows: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={blocks.length} className="text-sm leading-7 text-muted-foreground">
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
          <ul className="ml-5 mt-1 list-disc space-y-1 text-sm leading-6 text-muted-foreground">
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
          className="ml-5 list-decimal space-y-1.5 text-sm leading-7 text-muted-foreground"
        >
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-5 list-disc space-y-1.5 text-sm leading-7 text-muted-foreground">
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
      <div key={blocks.length} className="my-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted/50 text-foreground">
            <tr>
              {headerCells.map((cell, cellIdx) => (
                <th key={cellIdx} className="border-b px-3 py-2 font-semibold">
                  {inline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {bodyRows.map((cells, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-muted/20">
                {cells.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-3 py-2 align-top text-muted-foreground">
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
          <pre key={blocks.length} className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-6">
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
      blocks.push(
        <blockquote
          key={blocks.length}
          className="border-l-2 border-teal-500/70 bg-teal-50/40 px-3 py-1.5 text-sm italic text-muted-foreground dark:bg-teal-950/20"
        >
          {inline(blockquoteMatch[1]!)}
        </blockquote>,
      );
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push(heading(headingMatch[1]!.length, headingMatch[2]!, blocks.length));
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
      <pre key={blocks.length} className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-6">
        <code>{code.join("\n")}</code>
      </pre>,
    );
  }
  flushParagraph();
  flushList();
  flushTable();

  if (!blocks.length) {
    return <p className="text-sm text-muted-foreground">{sanitizeMojibake(markdown)}</p>;
  }
  return <div className={`space-y-2.5 ${className}`}>{blocks}</div>;
}

"use client";

import { Fragment, type ReactNode } from "react";

const INLINE = /(\[[^\]]+\]\((?:https?:\/\/|\/)[^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

function safeHref(value: string) {
  return value.startsWith("/") || /^https?:\/\//i.test(value) ? value : null;
}

function inline(text: string, depth = 0): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground">
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
      ? "mt-4 text-xl font-semibold"
      : level === 2
        ? "mt-4 text-lg font-semibold"
        : "mt-3 text-base font-semibold";
  if (level === 1) return <h1 key={key} className={className}>{inline(text)}</h1>;
  if (level === 2) return <h2 key={key} className={className}>{inline(text)}</h2>;
  if (level === 3) return <h3 key={key} className={className}>{inline(text)}</h3>;
  if (level === 4) return <h4 key={key} className={className}>{inline(text)}</h4>;
  if (level === 5) return <h5 key={key} className={className}>{inline(text)}</h5>;
  return <h6 key={key} className={className}>{inline(text)}</h6>;
}

export function MarkdownPreview({ markdown, className = "" }: { markdown: string; className?: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

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
    const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="ml-5 list-decimal space-y-1 text-sm leading-7 text-muted-foreground">{items}</ol>
      ) : (
        <ul key={blocks.length} className="ml-5 list-disc space-y-1 text-sm leading-7 text-muted-foreground">{items}</ul>
      ),
    );
    list = null;
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
      code = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push(heading(headingMatch[1]!.length, headingMatch[2]!, blocks.length));
      continue;
    }
    const unordered = /^[-*]\s+(.*)$/.exec(line);
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      if (!list || list.ordered !== orderedList) {
        flushList();
        list = { ordered: orderedList, items: [] };
      }
      list.items.push((unordered?.[1] ?? ordered?.[1])!);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
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

  if (!blocks.length) {
    return <p className="text-sm text-muted-foreground">{markdown}</p>;
  }
  return <div className={`space-y-2 ${className}`}>{blocks}</div>;
}

import type { ReactNode } from "react";

function formatInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/**
 * Older assignments were saved from a plain textarea and may contain valid
 * Markdown markers without line breaks. Restore block boundaries before
 * rendering so those records remain readable without mutating stored data.
 */
function normalizeAssignmentInstructions(value: string): string {
  return value
    .trim()
    .replace(/(^|\s)(Assignment Overview|Submission Requirements)(?=\s)/g, "$1\n\n## $2\n")
    .replace(/\s+(#{1,4}\s+)/g, "\n\n$1")
    .replace(/\s+(\*\*Task\s+\d+[^*]*\*\*)/gi, "\n\n$1\n")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\s+(\d+\.)\s+/g, "\n$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function AssignmentInstructions({ children }: { children: string }) {
  const lines = normalizeAssignmentInstructions(children).split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let unordered: string[] = [];
  let ordered: string[] = [];

  const flushLists = (key: string) => {
    if (unordered.length) {
      blocks.push(
        <ul
          key={`${key}-ul`}
          className="ml-5 list-disc space-y-1.5 text-sm leading-6 text-muted-foreground"
        >
          {unordered.map((item, index) => (
            <li key={index}>{formatInline(item)}</li>
          ))}
        </ul>,
      );
      unordered = [];
    }
    if (ordered.length) {
      blocks.push(
        <ol
          key={`${key}-ol`}
          className="ml-5 list-decimal space-y-1.5 text-sm leading-6 text-muted-foreground"
        >
          {ordered.map((item, index) => (
            <li key={index}>{formatInline(item)}</li>
          ))}
        </ol>,
      );
      ordered = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushLists(`line-${index}`);
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushLists(`line-${index}`);
      blocks.push(
        <h3 key={`heading-${index}`} className="pt-2 text-sm font-semibold text-foreground">
          {formatInline(heading[2] ?? "")}
        </h3>,
      );
      return;
    }

    if (/^\*\*Task\s+\d+[^*]*\*\*$/i.test(line)) {
      flushLists(`line-${index}`);
      blocks.push(
        <h4 key={`task-${index}`} className="pt-1 text-sm font-semibold text-foreground">
          {line.slice(2, -2)}
        </h4>,
      );
      return;
    }

    if (/^[-*•]\s+/.test(line)) {
      if (ordered.length) flushLists(`line-${index}`);
      unordered.push(line.replace(/^[-*•]\s+/, ""));
      return;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (unordered.length) flushLists(`line-${index}`);
      ordered.push(line.replace(/^\d+\.\s+/, ""));
      return;
    }

    flushLists(`line-${index}`);
    blocks.push(
      <p key={`paragraph-${index}`} className="text-sm leading-6 text-muted-foreground">
        {formatInline(line)}
      </p>,
    );
  });

  flushLists("end");

  return <div className="space-y-2.5 break-words">{blocks}</div>;
}

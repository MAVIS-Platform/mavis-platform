"use client";
import { useState } from "react";
import type { Evidence } from "@/types/domain";
import { sourceLabel, explainEvidenceSnippetSimply } from "./three-e-content";
import { Button } from "@/components/ui/button";
import { communicationEvidenceRole } from "./communication-evidence";
import { Copy, FileCode2 } from "lucide-react";

export function ThreeEEvidence({
  evidence,
  subjectTitle,
  snippetNotes,
  defaultOpen = true,
}: {
  evidence: readonly Evidence[];
  subjectTitle?: string | undefined;
  snippetNotes?: Record<string, string> | undefined;
  defaultOpen?: boolean | undefined;
}) {
  const [limit, setLimit] = useState(5);
  const [copyStatus, setCopyStatus] = useState<{ id: string; text: string } | null>(null);
  if (!evidence.length)
    return (
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        No evidence snippets are attached to this selection yet. Model relationships may still
        exist; inspect source files or re-run analysis if metadata is missing.
      </p>
    );
  return (
    <div className="min-w-0 max-w-full space-y-3 [overflow-wrap:anywhere]">
      {evidence.slice(0, limit).map((item, idx) => {
        const note =
          snippetNotes?.[item.id]?.trim() || explainEvidenceSnippetSimply(item, subjectTitle);
        return (
          <article
            key={item.id || idx}
            className="min-w-0 overflow-hidden rounded-xl border bg-background p-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {item.origin === "preview" ? "Metadata preview" : "Code Evidence"} #{idx + 1} ·{" "}
                {item.origin === "preview"
                  ? "Reconstructed structure"
                  : (communicationEvidenceRole(item) ?? sourceLabel(item))}
              </span>
            </div>
            <p
              title={item.location}
              className="mt-3 flex items-start gap-2 break-all font-mono text-xs leading-5 text-muted-foreground"
            >
              <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{item.location || "Source location unavailable"}</span>
            </p>
            {item.origin === "preview" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Reconstructed from AST/model metadata. This is not a verbatim source snippet or a
                saved Evidence record.
              </p>
            )}
            {(!item.communicationRole || snippetNotes?.[item.id]) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  About this evidence
                </summary>
                <p className="mt-2 text-sm leading-6 text-foreground/90">
                  {snippetNotes?.[item.id] ? "Interpretation: " : ""}
                  {note}
                </p>
              </details>
            )}
            <details className="mt-2.5" open={defaultOpen}>
              <summary className="cursor-pointer break-words text-xs font-medium text-primary select-none">
                {item.origin === "preview" ? "View metadata reconstruction" : "View source snippet"}
              </summary>
              {item.snippet.trim() ? (
                <pre
                  className="mt-3 max-h-72 min-w-0 max-w-full overflow-auto rounded-lg border bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100"
                  tabIndex={0}
                  aria-label={`Source snippet ${idx + 1}`}
                >
                  <code>{item.snippet}</code>
                </pre>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Snippet content is empty.</p>
              )}
            </details>
            {item.snippet.trim() && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 text-xs"
                  aria-label={`Copy ${item.origin === "preview" ? "metadata preview" : "source snippet"} ${idx + 1}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(item.snippet);
                      setCopyStatus({ id: item.id, text: "Copied" });
                    } catch {
                      setCopyStatus({
                        id: item.id,
                        text: "Copy unavailable. Select the snippet to copy.",
                      });
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy {item.origin === "preview" ? "preview" : "code"}
                </Button>
                <span role="status" className="text-xs text-muted-foreground">
                  {copyStatus?.id === item.id ? copyStatus.text : ""}
                </span>
              </div>
            )}
          </article>
        );
      })}
      {evidence.length > limit && (
        <Button size="sm" variant="outline" onClick={() => setLimit(limit + 5)}>
          Show more evidence ({evidence.length - limit})
        </Button>
      )}
    </div>
  );
}

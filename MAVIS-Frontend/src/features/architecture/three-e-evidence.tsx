"use client";
import { useState } from "react";
import type { Evidence } from "@/types/domain";
import { sourceLabel, shortLocator, explainEvidenceSnippetSimply } from "./three-e-content";
import { Button } from "@/components/ui/button";

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
  if (!evidence.length)
    return (
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        No evidence snippets are attached to this selection yet. Model relationships may still exist;
        inspect source files or re-run analysis if metadata is missing.
      </p>
    );
  return (
    <div className="min-w-0 max-w-full space-y-3 [overflow-wrap:anywhere]">
      {evidence.slice(0, limit).map((item, idx) => {
        const note =
          snippetNotes?.[item.id]?.trim() || explainEvidenceSnippetSimply(item, subjectTitle);
        return (
          <article key={item.id || idx} className="min-w-0 rounded-lg border bg-background p-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {item.origin === "preview" ? "Metadata preview" : "Code Evidence"} #{idx + 1} · {item.origin === "preview" ? "Reconstructed structure" : sourceLabel(item)}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground break-all">
                {shortLocator(item.location)}
              </span>
            </div>
            {item.origin === "preview" && <p className="mt-2 text-xs text-muted-foreground">Reconstructed from AST/model metadata. This is not a verbatim source snippet or a saved Evidence record.</p>}
            <p className="mt-2 text-xs leading-5 text-foreground/90">{snippetNotes?.[item.id] ? "Interpretation: " : ""}{note}</p>
            <details className="mt-2.5" open={defaultOpen}>
              <summary className="cursor-pointer break-words text-xs font-medium text-primary select-none">
                {shortLocator(item.location)} — {item.origin === "preview" ? "View metadata reconstruction" : "View source snippet"}
              </summary>
              {item.snippet.trim() ? (
                <pre className="mt-2 max-h-72 min-w-0 max-w-full overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
                  <code>{item.snippet}</code>
                </pre>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Snippet content is empty.</p>
              )}
            </details>
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


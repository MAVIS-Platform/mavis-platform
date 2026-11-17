"use client";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { DetailPanel } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import type { Submission } from "@/types/domain";
export function downloadArtifact(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function projectionDsl(payload: Record<string, unknown>): string | null {
  if (!Array.isArray(payload["nodes"]) || !Array.isArray(payload["edges"])) return null;
  const nodes = payload["nodes"] as Array<Record<string, unknown>>,
    edges = payload["edges"] as Array<Record<string, unknown>>;
  const ids = new Map(nodes.map((n, i) => [String(n["id"]), `n${i}`]));
  const label = (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\n", " ");
  return [
    "flowchart LR",
    ...nodes.map((n, i) => `n${i}["${label(n["name"] ?? n["label"] ?? n["id"])}"]`),
    ...edges.flatMap((e) => {
      const from = ids.get(String(e["from"] ?? e["source"])),
        to = ids.get(String(e["to"] ?? e["target"]));
      return from && to ? [`${from} -->|"${label(e["label"] ?? e["type"] ?? "")}"| ${to}`] : [];
    }),
  ].join("\n");
}
function SubmissionEvidenceHeader({ submission }: { submission: Submission }) {
  return (
    <>
      {submission.evidencePackageDigest && (
        <p className="break-all font-mono text-xs text-muted-foreground">
          Evidence package SHA-256: {submission.evidencePackageDigest}
        </p>
      )}
      {submission.courseQuizEvidence && (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs">
          <p className="font-medium">Course Quiz Gate Proof</p>
          <p className="text-muted-foreground">
            {submission.courseQuizEvidence.status} · {submission.courseQuizEvidence.correctCount}/
            {submission.courseQuizEvidence.questionCount} (
            {submission.courseQuizEvidence.passPercent}
            %) · Quiz v{submission.courseQuizEvidence.quizVersion}
          </p>
        </div>
      )}
      {submission.studentSnapshots && submission.studentSnapshots.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
          <p className="font-medium">Submitted Snapshots &amp; Theoretical Explanations</p>
          <div className="space-y-2">
            {submission.studentSnapshots.map((snap, idx) => (
              <div key={`${snap.snapshotId}-${idx}`} className="rounded border bg-background p-2.5">
                <p className="font-medium">
                  {snap.title || snap.snapshotId}{" "}
                  {snap.step && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      ({snap.step})
                    </span>
                  )}
                </p>
                {snap.targetViewOrService && (
                  <p className="text-[11px] text-muted-foreground">
                    Target: {snap.targetViewOrService}
                  </p>
                )}
                {snap.writtenExplanation && (
                  <p className="mt-1 whitespace-pre-wrap text-foreground">
                    {snap.writtenExplanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function FrozenArtifacts({ submission }: { submission: Submission }) {
  const layout = submission.diagramLayout;
  const isV2NoDiagram =
    submission.diagramVersionId === null && Boolean(submission.studentSnapshots?.length);
  if (!layout)
    return (
      <DetailPanel title={isV2NoDiagram ? "Frozen Lab evidence" : "Submitted diagram"}>
        <SubmissionEvidenceHeader submission={submission} />
        <p className="text-sm text-muted-foreground">
          {isV2NoDiagram
            ? "Frozen Lab v2 evidence package · No diagram artifact required for this Lab mode."
            : `No diagram payload was returned for this submission. The pinned ID is ${submission.diagramVersionId ?? "unavailable"}.`}
        </p>
      </DetailPanel>
    );
  const artifacts = Array.isArray(layout["artifacts"])
    ? (layout["artifacts"] as Array<{
        notation: string;
        level?: string;
        layoutJson: Record<string, unknown>;
      }>)
    : [{ notation: submission.diagramNotation ?? "Diagram", layoutJson: layout }];
  return (
    <DetailPanel title="Frozen submitted diagrams">
      <SubmissionEvidenceHeader submission={submission} />
      <p className="break-all text-xs text-muted-foreground">
        Pinned bundle/version: {submission.diagramVersionId}. Later edits do not change the contents
        below.
      </p>
      {artifacts.map((artifact, index) => {
        const payload = artifact.layoutJson ?? {},
          dsl = payload["mermaidDsl"] ?? payload["mermaid"] ?? projectionDsl(payload);
        return (
          <section key={index} className="space-y-3 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">
              {artifact.notation} · {String(payload["viewId"] ?? artifact.level ?? "")}{" "}
              {payload["documentRevision"] ? `· revision ${payload["documentRevision"]}` : ""}
            </h3>
            {typeof dsl === "string" ? (
              <DiagramPreview
                title={artifact.notation}
                content={dsl}
                format="MERMAID"
                style="clean"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Frozen architecture snapshot preserved as JSON evidence. Download its exact payload
                below.
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadArtifact(
                  `submitted-diagram-${index + 1}.json`,
                  JSON.stringify(payload, null, 2),
                )
              }
            >
              Download diagram JSON
            </Button>
          </section>
        );
      })}
    </DetailPanel>
  );
}

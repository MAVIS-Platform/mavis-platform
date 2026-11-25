"use client";
import { useEffect, useState } from "react";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { DetailPanel } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Submission } from "@/types/domain";
import { stripLegacySubmissionNoise } from "./submission-text";

export { stripLegacySubmissionNoise };

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () =>
      document.documentElement.classList.contains("dark") ||
      document.documentElement.dataset["theme"] === "dark";
    setIsDark(check());
    const observer = new MutationObserver(() => setIsDark(check()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

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
function formatSnapshotTitle(
  snap: NonNullable<Submission["studentSnapshots"]>[number],
  t: (en: string, vi?: string) => string,
): string {
  const raw = (snap.title || "").trim();
  if (!raw || /^theory explanation$/i.test(raw)) {
    return t("Student explanation", "Giải thích của sinh viên");
  }
  const studioMatch = raw.match(/^studio snapshot\s+(\d+)$/i);
  if (studioMatch) {
    return t(`Studio snapshot #${studioMatch[1]}`, `Ảnh chụp Studio #${studioMatch[1]}`);
  }
  return raw;
}

function visibleStudentSnapshots(submission: Submission) {
  const hasStudioEvidence = Boolean(submission.studioEvidence);
  return (submission.studentSnapshots ?? []).filter((snap) => {
    // Avoid duplicating Studio snapshot captions already paired with 3D images in StudioSubmissionEvidence.
    if (hasStudioEvidence && (snap.step === "STEP_4_RUNTIME" || snap.snapshotId.startsWith("STUDIO_"))) {
      return false;
    }
    return Boolean(snap.writtenExplanation && stripLegacySubmissionNoise(snap.writtenExplanation));
  });
}

function SubmissionEvidenceHeader({ submission }: { submission: Submission }) {
  const { t } = useLocale();
  const quizEv = submission.courseQuizEvidence;
  const showQuiz = Boolean(quizEv && quizEv.status !== "NOT_REQUIRED");
  const quizCorrect = quizEv?.correctCount ?? 0;
  const quizTotal = quizEv?.questionCount ?? 0;
  const quizScorePercent = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;
  const snapshots = visibleStudentSnapshots(submission);

  return (
    <>
      {snapshots.length > 0 && (
        <div className="space-y-3">
          {snapshots.map((snap, idx) => {
            const explanation = snap.writtenExplanation
              ? stripLegacySubmissionNoise(snap.writtenExplanation)
              : "";
            return (
              <div
                key={`${snap.snapshotId}-${idx}`}
                className="space-y-1.5 rounded-xl border bg-muted/15 p-3.5"
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  {formatSnapshotTitle(snap, t)}
                </p>
                {explanation && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showQuiz && quizEv && quizEv.status !== "PASSED" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/15 px-3.5 py-2.5 text-sm">
          <span className="font-medium text-foreground">
            {t("Lab Quiz Result", "Kết quả Quiz của Lab")}
          </span>
          <span className="text-muted-foreground">
            {t("Not passed", "Chưa đạt")} ·{" "}
            {quizCorrect}/{quizTotal} ({quizScorePercent}%
            {quizEv.passPercent != null
              ? ` · ${t("pass", "yêu cầu")} ≥ ${quizEv.passPercent}%`
              : ""}
            )
          </span>
        </div>
      )}
    </>
  );
}

export function FrozenArtifacts({ submission }: { submission: Submission }) {
  const { t } = useLocale();
  const isDark = useIsDarkTheme();
  const layout = submission.diagramLayout;
  const isV2NoDiagram =
    !submission.diagramVersionId &&
    (submission.labMode !== "LEGACY" ||
      Boolean(submission.studentSnapshots?.length) ||
      Boolean(submission.courseQuizEvidence));
  if (!layout) {
    const hasHeaderContent =
      visibleStudentSnapshots(submission).length > 0 ||
      Boolean(submission.courseQuizEvidence && submission.courseQuizEvidence.status !== "NOT_REQUIRED");
    if (isV2NoDiagram && !hasHeaderContent) return null;
    return (
      <DetailPanel
        title={
          isV2NoDiagram
            ? t("Student work & explanation", "Bài làm & Giải thích của sinh viên")
            : t("Submitted diagram", "Sơ đồ đã nộp")
        }
      >
        <SubmissionEvidenceHeader submission={submission} />
        {!isV2NoDiagram && (
          <p className="text-sm text-muted-foreground">
            {t(
              "No diagram payload was returned for this submission.",
              "Không có dữ liệu sơ đồ trả về cho bài nộp này.",
            )}
          </p>
        )}
      </DetailPanel>
    );
  }
  const artifacts = Array.isArray(layout["artifacts"])
    ? (layout["artifacts"] as Array<{
        notation: string;
        level?: string;
        layoutJson: Record<string, unknown>;
      }>)
    : [{ notation: submission.diagramNotation ?? "Diagram", layoutJson: layout }];
  return (
    <DetailPanel title={t("Submitted diagrams", "Sơ đồ đã nộp")}>
      <SubmissionEvidenceHeader submission={submission} />
      {artifacts.map((artifact, index) => {
        const payload = artifact.layoutJson ?? {},
          dsl = payload["mermaidDsl"] ?? payload["mermaid"] ?? projectionDsl(payload);
        return (
          <section key={index} className="space-y-3 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">
              {artifact.notation}
              {payload["viewId"] || artifact.level
                ? ` · ${String(payload["viewId"] ?? artifact.level)}`
                : ""}
            </h3>
            {typeof dsl === "string" ? (
              <DiagramPreview
                title={artifact.notation}
                content={dsl}
                format="MERMAID"
                style={isDark ? "dark" : "clean"}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Architecture snapshot saved as JSON. Download the file below to inspect.",
                  "Bản chụp kiến trúc được lưu dạng JSON. Tải tệp bên dưới để xem chi tiết.",
                )}
              </p>
            )}
            <div>
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
                {t("Download diagram JSON", "Tải JSON sơ đồ")}
              </Button>
            </div>
          </section>
        );
      })}
    </DetailPanel>
  );
}

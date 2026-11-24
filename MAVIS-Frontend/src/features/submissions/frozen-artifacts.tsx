"use client";
import { useEffect, useState } from "react";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { DetailPanel } from "@/components/shared/data";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Submission } from "@/types/domain";

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

function stripLegacySubmissionNoise(text: string): string {
  return text.replace(/\n\[CB=[^\]]*\]\s*$/i, "").trim();
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
function SubmissionEvidenceHeader({ submission }: { submission: Submission }) {
  const { locale, t } = useLocale();
  const quizEv = submission.courseQuizEvidence;
  const quizCorrect = quizEv?.correctCount ?? 0;
  const quizTotal = quizEv?.questionCount ?? 0;
  const quizScorePercent = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;
  return (
    <>
      {submission.studentSnapshots && submission.studentSnapshots.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
          <p className="font-medium">
            {locale === "vi"
              ? "Các Snapshot đã nộp & Giải thích lý thuyết"
              : <>Submitted Snapshots &amp; Theoretical Explanations</>}
          </p>
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
                    {t("Target", "Mục tiêu")}: {snap.targetViewOrService}
                  </p>
                )}
                {snap.writtenExplanation && (
                  <p className="mt-1 whitespace-pre-wrap text-foreground">
                    {stripLegacySubmissionNoise(snap.writtenExplanation)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {quizEv && (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs">
          <p className="font-medium">{t("Course Quiz Gate Proof", "Kết quả Quiz của Lab")}</p>
          <p className="text-muted-foreground">
            {quizEv.status === "NOT_REQUIRED"
              ? submission.labMode === "THEORY_QUIZ_STUDIO" ||
                Boolean(submission.studioEvidence || submission.runtime?.studioVerified)
                ? t("NOT_REQUIRED · Studio Lab (no quiz gate)", "KHÔNG BẮT BUỘC · Lab Studio (không yêu cầu quiz)")
                : t("NOT_REQUIRED · Theory Only", "KHÔNG BẮT BUỘC · Chỉ lý thuyết")
              : `${quizEv.status} · ${quizCorrect}/${quizTotal} (${quizScorePercent}%${quizEv.passPercent != null ? ` · pass ≥ ${quizEv.passPercent}%` : ""}) · Quiz v${quizEv.quizVersion ?? 1}`}
          </p>
        </div>
      )}
      {submission.evidencePackageDigest && (
        <details className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            {t("Technical details & export", "Chi tiết kỹ thuật & xuất dữ liệu")}
          </summary>
          <div className="mt-2 font-mono leading-relaxed break-all">
            {t("Evidence package SHA-256", "Mã băm gói minh chứng SHA-256")}: {submission.evidencePackageDigest}
          </div>
        </details>
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
  if (!layout)
    return (
      <DetailPanel
        title={
          isV2NoDiagram
            ? t("Frozen Lab evidence", "Minh chứng bài làm Lab")
            : t("Submitted diagram", "Sơ đồ đã nộp")
        }
      >
        <SubmissionEvidenceHeader submission={submission} />
        <p className="text-sm text-muted-foreground">
          {isV2NoDiagram
            ? t(
                "Frozen Lab v2 evidence package · No diagram artifact required for this Lab mode.",
                "Bài làm Lab v2 · Chế độ Lab này không yêu cầu nộp sơ đồ riêng.",
              )
            : t(
                `No diagram payload was returned for this submission. The pinned ID is ${submission.diagramVersionId ?? "unavailable"}.`,
                `Không có dữ liệu sơ đồ trả về cho bài nộp này. ID đã ghim: ${submission.diagramVersionId ?? "không có"}.`,
              )}
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
    <DetailPanel title={t("Frozen submitted diagrams", "Sơ đồ đã nộp")}>
      <SubmissionEvidenceHeader submission={submission} />
      {artifacts.map((artifact, index) => {
        const payload = artifact.layoutJson ?? {},
          dsl = payload["mermaidDsl"] ?? payload["mermaid"] ?? projectionDsl(payload);
        return (
          <section key={index} className="space-y-3 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">
              {artifact.notation} · {String(payload["viewId"] ?? artifact.level ?? "")}{" "}
              {payload["documentRevision"] ? `· ${t("revision", "bản")} ${payload["documentRevision"]}` : ""}
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
                  "Frozen architecture snapshot preserved as JSON evidence. Download its exact payload below.",
                  "Bản chụp kiến trúc được lưu dưới dạng JSON minh chứng. Tải tệp chi tiết bên dưới.",
                )}
              </p>
            )}
            <details className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                {t("Technical details & export", "Chi tiết kỹ thuật & xuất dữ liệu")}
              </summary>
              <div className="mt-2 space-y-2">
                <p className="break-all">
                  {t(
                    `Pinned bundle/version: ${submission.diagramVersionId}. Later edits do not change the contents below.`,
                    `Phiên bản sơ đồ đã ghim: ${submission.diagramVersionId}. Các chỉnh sửa sau này không làm thay đổi nội dung bên dưới.`,
                  )}
                </p>
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
            </details>
          </section>
        );
      })}
    </DetailPanel>
  );
}

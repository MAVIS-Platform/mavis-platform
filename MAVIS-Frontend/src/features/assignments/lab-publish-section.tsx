"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Copy, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { CourseSetupPanel } from "@/features/courses/course-setup";
import {
  PublishCourseLab,
  useCourseAuthoring,
  useCourseSetup,
  useRuntimeSetupReadiness,
  useStudentLabStudioSessions,
} from "@/features/workspaces/course-access";
import { type Assignment } from "./requirements";
import { ExportLabButton } from "./lab-transfer";

type Tab = "info" | "theory" | "source" | "quiz" | "studio" | "publish";

export function LabPublishSection({
  workspaceId,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  assignment: Assignment;
  onNavigate: (tab: Tab) => void;
}) {
  const { t } = useLocale();
  const [copiedContract, setCopiedContract] = useState(false);
  const setup = useCourseSetup(workspaceId);
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === assignment.id);
  const exercise = useQuery({
    queryKey: ["api", "studio-exercise", workspaceId, assignment.id],
    queryFn: ({ signal }) =>
      api<{ runtimeProjectId: string | null } | null>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/studio-exercise`,
        { signal },
      ),
    retry: false,
  });
  const hasSource = Boolean(assignment.referenceSource?.modelId);
  const hasQuiz = Boolean(setupLab?.quizPublished && (setupLab?.quizVersion ?? 0) > 0);
  const hasStudio = Boolean(
    assignment.requireRuntimeTrace ||
      assignment.labMode === "THEORY_QUIZ_STUDIO" ||
      setupLab?.topologyFrozen,
  );
  const studioProjectId =
    hasSource && hasStudio
      ? (exercise.data?.runtimeProjectId ?? assignment.referenceSource?.projectId ?? null)
      : null;
  const readiness = useRuntimeSetupReadiness(studioProjectId);
  const labSessions = useStudentLabStudioSessions(
    workspaceId,
    assignment.id,
    Boolean(studioProjectId),
  );
  const verifiedSession = (labSessions.data ?? []).find(
    (session) => session.assignmentId === assignment.id && session.studioVerified,
  );
  const course = useCourseAuthoring(workspaceId);
  const modules = course.data?.modules ?? [];
  const attachedTheory = useQuery({
    queryKey: ["api", "lab-theory-assets", workspaceId, assignment.id],
    queryFn: ({ signal }) =>
      api<Array<{ assetId: string; courseItemId?: string | null }>>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets`,
        { signal },
      ),
    retry: false,
  });
  const theoryReady =
    (attachedTheory.data?.length ?? 0) > 0 ||
    modules.some((module) =>
      module.items.some((item) => item.type === "THEORY" && item.assignmentId === assignment.id),
    );
  const hasContent = hasSource || theoryReady || hasQuiz || Boolean(assignment.instructions?.trim());
  const published = setupLab?.published === true || assignment.labOrder != null;
  const topologyFrozen = Boolean(setupLab?.topologyFrozen);
  const canFreeze = Boolean(hasStudio && hasSource && !topologyFrozen && (setupLab?.studioReady || Boolean(verifiedSession)));
  const detectedLabel = hasStudio
    ? t("Full Studio Live", "Full Studio Live")
    : hasQuiz
      ? t("Theory + Quiz", "Lý thuyết + Quiz")
      : hasSource
        ? t("Theory + C1–C3", "Lý thuyết + C1–C3")
        : t("Theory Only", "Chỉ Lý thuyết");
  const previewHref = `/lab?${new URLSearchParams({
    workspace: workspaceId,
    assignment: assignment.id,
    step: "1",
    preview: "1",
  })}`;

  const rows: Array<{
    id: string;
    label: string;
    required?: boolean;
    done: boolean;
    detail: string;
    tab: Tab;
  }> = [
    {
      id: "info",
      label: t("Lab information", "Thông tin Lab"),
      required: true,
      done: Boolean(assignment.title),
      detail: assignment.instructions?.trim()
        ? t("Title and description saved.", "Đã lưu tên và mô tả.")
        : t("Title saved.", "Đã lưu tên Lab."),
      tab: "info",
    },
    {
      id: "source",
      label: t("Reference source", "Nguồn tham chiếu"),
      required: hasStudio,
      done: hasSource,
      detail: hasSource
        ? t(`Pinned model ${assignment.referenceSource!.modelId!.slice(0, 8)}`, `Model đã ghim ${assignment.referenceSource!.modelId!.slice(0, 8)}`)
        : t("Optional — attach a repo to unlock C1–C3 diagrams or Studio Live.", "Tùy chọn — gắn repo nếu muốn dùng sơ đồ C1–C3 hoặc Studio Live."),
      tab: "source",
    },
    {
      id: "theory",
      label: t("Theory", "Lý thuyết"),
      done: theoryReady,
      detail: theoryReady
        ? t("Lesson content saved.", "Đã có nội dung lý thuyết.")
        : t("Optional — add a lesson in Step 3.", "Tùy chọn — thêm bài học ở Bước 3."),
      tab: "theory",
    },
    {
      id: "quiz",
      label: t("Quiz", "Quiz"),
      required: hasStudio,
      done: hasQuiz,
      detail: hasQuiz
        ? t(`Version ${setupLab?.quizVersion}`, `Phiên bản ${setupLab?.quizVersion}`)
        : hasStudio
          ? t("Required Quiz before students launch Docker Studio.", "Bắt buộc có Quiz trước khi sinh viên mở Docker Studio.")
          : t("Optional — skip if no Quiz is needed.", "Tùy chọn — bỏ qua nếu không dùng Quiz."),
      tab: "quiz",
    },
    {
      id: "studio",
      label: t("Studio Live topology", "Topology Studio Live"),
      done: Boolean(setupLab?.topologyFrozen || setupLab?.studioReady),
      detail: setupLab?.topologyFrozen
        ? t("Topology is frozen into the published Lab.", "Topology đã được đóng băng vào Lab.")
        : setupLab?.studioReady
          ? t("Studio Live configured — ready to freeze after adding to class.", "Đã cấu hình Studio Live — có thể đóng băng sau khi đưa vào lớp.")
          : t("Optional — skip if no Docker Studio Live.", "Tùy chọn — bỏ qua nếu không dùng Studio Live."),
      tab: "studio",
    },
    {
      id: "publish",
      label: t("In class", "Trong lớp"),
      done: published,
      detail: published
        ? t(`Lab ${setupLab?.position ?? ""} is in the class sequence.`, `Lab ${setupLab?.position ?? ""} đã vào thứ tự lớp.`)
        : t("Ready to add to class.", "Sẵn sàng thêm vào lớp."),
      tab: "publish",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Rocket className="size-4 text-primary" aria-hidden="true" />
            {t("Check and add to class", "Kiểm tra và thêm vào lớp")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{detectedLabel}</Badge>
            <Badge variant={published ? "success" : "secondary"}>
              {published ? t("In class", "Trong lớp") : t("Not in class", "Chưa vào lớp")}
            </Badge>
          </div>
        </div>

        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
              {row.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{row.label}</p>
                  {row.id !== "publish" && (
                    <Badge variant={row.required ? "outline" : "secondary"} className="text-[10px]">
                      {row.required ? t("Required", "Bắt buộc") : t("Optional", "Tùy chọn")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{row.detail}</p>
              </div>
              {row.id !== "publish" && (
                <Button type="button" size="sm" variant="outline" onClick={() => onNavigate(row.tab)}>
                  {row.done ? t("Edit", "Sửa") : t("Open", "Mở")}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {hasStudio && studioProjectId && readiness.data?.readinessGrade && (
          <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {t("Lab Readiness Report", "Báo cáo sẵn sàng Lab")}
                </span>
                <Badge
                  variant={
                    readiness.data.readinessGrade === "READY"
                      ? "success"
                      : readiness.data.readinessGrade === "NEEDS_FIX"
                        ? "warning"
                        : "destructive"
                  }
                >
                  {readiness.data.readinessGrade}
                </Badge>
                {readiness.data.traceCoveragePercent != null && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {t(
                      `OTel trace coverage: ${readiness.data.traceCoveragePercent}%`,
                      `Độ phủ OTel trace: ${readiness.data.traceCoveragePercent}%`,
                    )}
                  </span>
                )}
              </div>
              {readiness.data.suggestedContractYaml && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(readiness.data!.suggestedContractYaml!);
                    setCopiedContract(true);
                    window.setTimeout(() => setCopiedContract(false), 2000);
                  }}
                >
                  <Copy className="mr-1.5 size-3.5" aria-hidden="true" />
                  {copiedContract
                    ? t("Copied mavis-runtime.yaml", "Đã chép mavis-runtime.yaml")
                    : t("Copy mavis-runtime.yaml", "Chép mavis-runtime.yaml")}
                </Button>
              )}
            </div>
            {(readiness.data.remediationSteps?.length ?? 0) > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                {readiness.data.remediationSteps!.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!hasContent && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
            {t(
              "Add at least one learning item (Description, Theory lesson, Reference source, or Quiz) before adding this Lab to the class.",
              "Hãy thêm ít nhất 1 nội dung học (Mô tả, Bài lý thuyết, Nguồn tham chiếu hoặc Quiz) trước khi thêm Lab vào lớp.",
            )}
          </p>
        )}

        {hasStudio && !hasQuiz && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
            {t(
              "Studio Live is configured — publish a Quiz so students can complete it before launching Docker Studio.",
              "Lab có cấu hình Studio Live — hãy chuẩn bị bài Quiz để sinh viên hoàn thành trước khi mở Docker Studio.",
            )}
          </p>
        )}

        {hasStudio &&
          readiness.data &&
          readiness.data.readinessGrade === "BLOCKED" && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs leading-5 text-destructive"
            >
              {t(
                "Publish blocked (Readiness: BLOCKED). Fix Docker preflight or run Sync Docker in Step 5 before opening this Studio Lab to students.",
                "Chặn xuất bản (Readiness: BLOCKED). Hãy sửa lỗi Docker preflight hoặc chạy Đồng bộ Docker ở Bước 5 trước khi mở Lab Studio cho sinh viên.",
              )}
            </p>
          )}

        {hasStudio &&
          readiness.data &&
          readiness.data.readinessGrade !== "BLOCKED" &&
          !readiness.data.runnerReady && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
              {t(
                "The runtime profile is not fully ready. Freeze is available, but real Studio execution still depends on the Runner and images.",
                "Runtime profile chưa sẵn sàng hoàn toàn. Có thể đóng băng topology, nhưng phiên Studio thật vẫn phụ thuộc Runner và image.",
              )}
            </p>
          )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {published && (
            <Button asChild size="sm">
              <Link href={previewHref}>{t("Preview as student", "Xem trước như sinh viên")}</Link>
            </Button>
          )}
          <PublishCourseLab
            workspaceId={workspaceId}
            assignmentId={assignment.id}
            position={setupLab?.position}
            sessionId={verifiedSession?.id}
            canFreeze={canFreeze}
            topologyFrozen={topologyFrozen}
            freezeDisabledReason={
              canFreeze && !verifiedSession
                ? t(
                    "Run a verified Studio Playtest session in Step 5 before freezing.",
                    "Chạy thử một phiên Studio Playtest xác minh ở Bước 5 trước khi đóng băng.",
                  )
                : undefined
            }
            publishBlockedReason={
              hasStudio && readiness.data?.readinessGrade === "BLOCKED"
                ? t(
                    "Studio Live readiness is BLOCKED. Run Sync Docker in Step 5 first.",
                    "Trạng thái Studio Live đang BLOCKED. Hãy Đồng bộ Docker ở Bước 5 trước.",
                  )
                : undefined
            }
          />
          <ExportLabButton
            workspaceId={workspaceId}
            assignmentId={assignment.id}
            title={assignment.title}
          />
        </div>
      </section>

      <details className="rounded-xl border bg-card p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          {t("Class-wide Course Setup Checklist (All Labs)", "Checklist Thiết lập Toàn Khóa học (Tất cả Lab)")}
        </summary>
        <div className="mt-4">
          <CourseSetupPanel workspaceId={workspaceId} />
        </div>
      </details>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
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
import { resolveLabTier, type Assignment } from "./requirements";
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
  const studioProjectId = exercise.data?.runtimeProjectId ?? assignment.referenceSource?.projectId ?? null;
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
  const labTier = resolveLabTier(assignment);
  const published = setupLab?.published === true || assignment.labOrder != null;
  const canFreeze =
    labTier === "THEORY_QUIZ_STUDIO" && Boolean(assignment.referenceSource?.modelId);
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
      done: Boolean(assignment.referenceSource?.modelId),
      detail: assignment.referenceSource?.modelId
        ? t(`Pinned model ${assignment.referenceSource.modelId.slice(0, 8)}`, `Model đã ghim ${assignment.referenceSource.modelId.slice(0, 8)}`)
        : t("Optional for Theory-only Labs. Required for C1–C3 or Studio Live.", "Tùy chọn nếu Lab thuần lý thuyết. Bắt buộc nếu có C1–C3 hoặc Studio Live."),
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
    ...(labTier !== "THEORY_ONLY"
      ? [
          {
            id: "quiz",
            label: t("Quiz", "Quiz"),
            done: Boolean(setupLab?.quizPublished),
            detail: setupLab?.quizPublished
              ? t(`Version ${setupLab.quizVersion}`, `Phiên bản ${setupLab.quizVersion}`)
              : t("Optional — skip if no Quiz Gate.", "Tùy chọn — bỏ qua nếu không dùng Quiz."),
            tab: "quiz" as Tab,
          },
        ]
      : []),
    ...(labTier === "THEORY_QUIZ_STUDIO"
      ? [
          {
            id: "studio",
            label: t("Studio Live topology", "Topology Studio Live"),
            done: Boolean(setupLab?.topologyFrozen),
            detail: setupLab?.topologyFrozen
              ? t("Topology is frozen into the published Lab.", "Topology đã được đóng băng vào Lab.")
              : t("Optional — skip if no Docker Studio Live.", "Tùy chọn — bỏ qua nếu không dùng Studio Live."),
            tab: "studio" as Tab,
          },
        ]
      : []),
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
          <Badge variant={published ? "success" : "secondary"}>
            {published ? t("In class", "Trong lớp") : t("Not in class", "Chưa vào lớp")}
          </Badge>
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

        {labTier === "THEORY_QUIZ_STUDIO" &&
          assignment.requireRuntimeTrace &&
          readiness.data &&
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

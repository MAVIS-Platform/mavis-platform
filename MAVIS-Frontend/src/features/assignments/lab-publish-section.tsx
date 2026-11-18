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
} from "@/features/workspaces/course-access";
import type { Assignment } from "./requirements";
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
  const course = useCourseAuthoring(workspaceId);
  const modules = course.data?.modules ?? [];
  const theoryReady = modules.some(
    (module) =>
      module.items.some((item) => item.type === "THEORY" && item.assignmentId === assignment.id) ||
      (module.items.some((item) => item.assignmentId === assignment.id) &&
        module.items.some((item) => item.type === "THEORY")),
  );
  const published = setupLab?.published === true;
  const previewHref = `/lab?${new URLSearchParams({
    workspace: workspaceId,
    assignment: assignment.id,
    step: "1",
    preview: "1",
  })}`;

  const rows: Array<{
    id: string;
    label: string;
    done: boolean;
    detail: string;
    tab: Tab;
  }> = [
    {
      id: "info",
      label: t("Lab information", "Thông tin Lab"),
      done: Boolean(assignment.title),
      detail: t("Title and instructions saved.", "Đã lưu tên và hướng dẫn."),
      tab: "info",
    },
    {
      id: "theory",
      label: t("Theory", "Lý thuyết"),
      done: theoryReady,
      detail: theoryReady
        ? t("A theory item is linked to this Lab's module.", "Đã có nội dung lý thuyết trong chương của Lab.")
        : t("Add or review the lesson in the Theory step.", "Thêm hoặc kiểm tra bài học ở bước Lý thuyết."),
      tab: "theory",
    },
    {
      id: "source",
      label: t("Reference source", "Nguồn tham chiếu"),
      done: Boolean(assignment.referenceSource?.modelId),
      detail: assignment.referenceSource?.modelId
        ? t(`Pinned model ${assignment.referenceSource.modelId.slice(0, 8)}`, `Model đã ghim ${assignment.referenceSource.modelId.slice(0, 8)}`)
        : t("Attach a pinned reference model.", "Gắn model tham chiếu đã ghim."),
      tab: "source",
    },
    {
      id: "quiz",
      label: t("Quiz", "Quiz"),
      done: Boolean(setupLab?.quizPublished),
      detail: setupLab?.quizPublished
        ? t(`Version ${setupLab.quizVersion}`, `Phiên bản ${setupLab.quizVersion}`)
        : t("Publish a Quiz version.", "Công bố phiên bản Quiz."),
      tab: "quiz",
    },
    {
      id: "studio",
      label: t("Studio Live topology", "Topology Studio Live"),
      done: !assignment.requireRuntimeTrace || Boolean(setupLab?.topologyFrozen),
      detail: !assignment.requireRuntimeTrace
        ? t("This Lab does not require a runtime trace.", "Lab này không yêu cầu runtime trace.")
        : setupLab?.topologyFrozen
          ? t("Topology is frozen into the published Lab.", "Topology đã được đóng băng vào Lab.")
          : t("Configure runtime, publish, then freeze topology.", "Cấu hình runtime, công bố rồi đóng băng topology."),
      tab: "studio",
    },
    {
      id: "publish",
      label: t("In class", "Trong lớp"),
      done: published,
      detail: published
        ? t(`Lab ${setupLab?.position ?? ""} is in the class sequence.`, `Lab ${setupLab?.position ?? ""} đã vào thứ tự lớp.`)
        : t("Add the Lab to the class sequence.", "Thêm Lab vào thứ tự lớp."),
      tab: "publish",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Rocket className="size-4 text-primary" aria-hidden="true" />
              {t("Check and add to class", "Kiểm tra và thêm vào lớp")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "The Lab is already saved in your Lab Library. These checks decide whether it is ready to open in this class; adding it appends it to the class sequence and unlocks it after the preceding Lab.",
                "Lab đã được lưu trong Kho Lab. Các kiểm tra này quyết định Lab đã sẵn sàng mở trong lớp chưa; thêm vào lớp sẽ nối Lab vào cuối thứ tự và mở khóa sau Lab trước.",
              )}
            </p>
          </div>
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
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.detail}</p>
              </div>
              {!row.done && (
                <Button type="button" size="sm" variant="outline" onClick={() => onNavigate(row.tab)}>
                  {t("Fix", "Sửa")}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {assignment.requireRuntimeTrace && readiness.data && !readiness.data.runnerReady && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
            {t(
              "The runtime profile is not fully ready. Freeze is available, but real Studio execution still depends on the Runner and images.",
              "Runtime profile chưa sẵn sàng hoàn toàn. Có thể đóng băng topology, nhưng phiên Studio thật vẫn phụ thuộc Runner và image.",
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {published ? (
            <>
              <Button asChild>
                <Link href={previewHref}>{t("Preview as student", "Xem trước như sinh viên")}</Link>
              </Button>
              <PublishCourseLab
                workspaceId={workspaceId}
                assignmentId={assignment.id}
                position={setupLab?.position}
              />
            </>
          ) : (
            <PublishCourseLab
              workspaceId={workspaceId}
              assignmentId={assignment.id}
              position={setupLab?.position}
            />
          )}
          <ExportLabButton
            workspaceId={workspaceId}
            assignmentId={assignment.id}
            title={assignment.title}
          />
        </div>
      </section>

      <CourseSetupPanel workspaceId={workspaceId} />
    </div>
  );
}

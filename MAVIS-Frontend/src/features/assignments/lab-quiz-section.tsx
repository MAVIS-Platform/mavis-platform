"use client";

import { ArrowRight, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { CourseQuiz } from "@/features/courses/course-quiz";
import { useCourseSetup } from "@/features/workspaces/course-access";
import { QuizBuilder } from "./quiz-builder";

export function LabQuizSection({
  workspaceId,
  assignmentId,
  onNavigate,
}: {
  workspaceId: string;
  assignmentId: string;
  onNavigate?: ((tab: "studio") => void) | undefined;
}) {
  const { t } = useLocale();
  const setup = useCourseSetup(workspaceId);
  const lab = setup.data?.labs?.find((item) => item.assignmentId === assignmentId);

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <CircleHelp className="size-4 text-teal-600" aria-hidden="true" />
              {t("Versioned Quiz", "Quiz có phiên bản")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Write questions by hand or import JSON/CSV. Save a draft, preview the gate, then publish an immutable version.",
                "Soạn câu hỏi bằng tay hoặc nhập JSON/CSV. Lưu nháp, xem trước gate rồi công bố phiên bản bất biến.",
              )}
            </p>
          </div>
          <Badge variant={lab?.quizPublished ? "success" : "secondary"}>
            {lab?.quizPublished
              ? t(`Published · v${lab.quizVersion}`, `Đã công bố · v${lab.quizVersion}`)
              : t("Not published", "Chưa công bố")}
          </Badge>
        </div>
        <QuizBuilder workspaceId={workspaceId} assignmentId={assignmentId} />
      </section>

      <details className="rounded-2xl border bg-card p-5 shadow-xs">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          {t("Student Quiz Gate Preview (Read-Only)", "Xem trước giao diện Quiz của Sinh viên")}
        </summary>
        <div className="mt-4">
          <CourseQuiz
            workspaceId={workspaceId}
            labId={assignmentId}
            canSubmit={false}
            runtimeStepHref={`/lab?${new URLSearchParams({
              workspace: workspaceId,
              assignment: assignmentId,
              step: "3",
            })}`}
          />
        </div>
      </details>

      {onNavigate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {t(
              "Quiz published? Proceed to Step 5 to configure Studio Live.",
              "Đã công bố Quiz? Tiếp tục sang Bước 5 để cấu hình thực hành Studio Live.",
            )}
          </p>
          <Button type="button" size="sm" onClick={() => onNavigate("studio")}>
            {t("Next Step 5: Studio Live", "Sang Bước 5: Studio Live")}
            <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

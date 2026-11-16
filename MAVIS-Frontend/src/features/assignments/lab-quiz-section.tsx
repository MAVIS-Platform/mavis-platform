"use client";

import { CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import { CourseQuiz } from "@/features/courses/course-quiz";
import { CurriculumPublisher } from "@/features/courses/curriculum";
import { useCourseSetup } from "@/features/workspaces/course-access";

export function LabQuizSection({
  workspaceId,
  assignmentId,
}: {
  workspaceId: string;
  assignmentId: string;
}) {
  const { t } = useLocale();
  const setup = useCourseSetup(workspaceId);
  const lab = setup.data?.labs?.find((item) => item.assignmentId === assignmentId);

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <CircleHelp className="size-4 text-primary" aria-hidden="true" />
              {t("Versioned Quiz", "Quiz có phiên bản")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Publish a curriculum chapter or review the current Quiz. A new content version starts a new gate for the Lab.",
                "Công bố một bài giáo trình hoặc xem Quiz hiện hành. Nội dung mới sẽ tạo phiên bản gate mới cho Lab.",
              )}
            </p>
          </div>
          <Badge variant={lab?.quizPublished ? "success" : "secondary"}>
            {lab?.quizPublished
              ? t(`Published · v${lab.quizVersion}`, `Đã công bố · v${lab.quizVersion}`)
              : t("Not published", "Chưa công bố")}
          </Badge>
        </div>
        <CurriculumPublisher workspaceId={workspaceId} assignmentId={assignmentId} />
      </section>

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
  );
}

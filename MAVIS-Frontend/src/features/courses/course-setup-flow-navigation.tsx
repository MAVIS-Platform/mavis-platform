"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";

export type CourseSetupStep =
  | "repository"
  | "lesson"
  | "quiz"
  | "lab"
  | "arrange"
  | "publish";

export type CourseContentStep = Extract<
  CourseSetupStep,
  "repository" | "lesson" | "quiz" | "lab"
>;
export type CourseSetupFlowMode = "setup" | "content";

const steps: Array<{ id: CourseSetupStep; en: string; vi: string }> = [
  { id: "repository", en: "Repository", vi: "Repository" },
  { id: "lesson", en: "Lesson", vi: "Bài học" },
  { id: "quiz", en: "Quiz", vi: "Quiz" },
  { id: "lab", en: "MAVIS Studio Lab", vi: "Lab MAVIS Studio" },
  { id: "arrange", en: "Update Course", vi: "Cập nhật khóa học" },
  { id: "publish", en: "Publish Changes", vi: "Công bố khóa học" },
];

export function courseSetupStepHref(
  workspaceId: string,
  step: CourseSetupStep,
  contentStep?: CourseContentStep,
  flowMode: CourseSetupFlowMode = "content",
) {
  const workspace = encodeURIComponent(workspaceId);
  const flow = flowMode === "setup" ? "setup" : "content";
  if (step === "repository") return `/references?workspace=${workspace}&flow=${flow}`;
  if (step === "lesson") return `/theory-library?workspace=${workspace}&flow=${flow}`;
  if (step === "quiz")
    return `/workspace-overview?workspace=${workspace}&view=quiz-library&flow=${flow}`;
  if (step === "lab") return `/lab-authoring?workspace=${workspace}&flow=${flow}`;
  const source = contentStep ? `&contentStep=${contentStep}` : "";
  return `/workspace-overview?workspace=${workspace}&view=course-authoring&flow=${flow}&flowStep=${step}${source}`;
}

export function CourseSetupFlowFrame({
  workspaceId,
  currentStep,
  contentStep,
  flowMode = "content",
  children,
}: {
  workspaceId: string;
  currentStep: CourseSetupStep;
  contentStep?: CourseContentStep;
  flowMode?: CourseSetupFlowMode;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const entryStep: CourseContentStep =
    currentStep === "repository" ||
    currentStep === "lesson" ||
    currentStep === "quiz" ||
    currentStep === "lab"
      ? currentStep
      : (contentStep ?? "lesson");
  const flowSteps = flowMode === "setup"
    ? steps
    : steps.filter((step) => step.id === entryStep || step.id === "arrange" || step.id === "publish");
  const currentIndex = flowSteps.findIndex((step) => step.id === currentStep);
  const previous = currentIndex > 0 ? flowSteps[currentIndex - 1] : null;
  const next = currentIndex < flowSteps.length - 1 ? flowSteps[currentIndex + 1] : null;

  return (
    <section className="space-y-5" aria-label={t("Course setup flow", "Luồng thiết lập khóa học")}>
      {children}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {previous ? (
          <Button asChild variant="outline">
            <Link href={courseSetupStepHref(workspaceId, previous.id, entryStep, flowMode)}>
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {t(`Back: ${previous.en}`, `Quay lại: ${previous.vi}`)}
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link
              href={
                flowMode === "setup"
                  ? `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}`
                  : `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=content-actions`
              }
            >
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {flowMode === "setup"
                ? t("Back to Overview", "Quay lại Tổng quan")
                : t("Back to Add content", "Quay lại Thêm nội dung")}
            </Link>
          </Button>
        )}

        {next ? (
          <Button asChild>
            <Link href={courseSetupStepHref(workspaceId, next.id, entryStep, flowMode)}>
              {t(`Next: ${next.en}`, `Tiếp theo: ${next.vi}`)}
              <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : <span aria-hidden="true" />}
      </div>
    </section>
  );
}

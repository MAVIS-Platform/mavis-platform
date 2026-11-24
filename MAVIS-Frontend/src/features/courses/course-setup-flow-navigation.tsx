"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  FileQuestion,
  GitBranch,
  ListTree,
  Send,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

const steps: Array<{
  id: CourseSetupStep;
  en: string;
  vi: string;
  icon: LucideIcon;
}> = [
  { id: "repository", en: "Repository", vi: "Repository", icon: GitBranch },
  { id: "lesson", en: "Lesson", vi: "Bài học", icon: BookOpen },
  { id: "quiz", en: "Quiz", vi: "Quiz", icon: FileQuestion },
  { id: "lab", en: "MAVIS Studio Lab", vi: "Lab MAVIS Studio", icon: Boxes },
  { id: "arrange", en: "Update Course", vi: "Cập nhật khóa học", icon: ListTree },
  { id: "publish", en: "Publish Changes", vi: "Công bố khóa học", icon: Send },
];

export function courseSetupStepHref(
  workspaceId: string,
  step: CourseSetupStep,
  contentStep?: CourseContentStep,
) {
  const workspace = encodeURIComponent(workspaceId);
  if (step === "repository") return `/references?workspace=${workspace}&from=content`;
  if (step === "lesson") return `/theory-library?workspace=${workspace}&flow=content`;
  if (step === "quiz")
    return `/workspace-overview?workspace=${workspace}&view=quiz-library&flow=content`;
  if (step === "lab") return `/lab-authoring?workspace=${workspace}&flow=content`;
  const source = contentStep ? `&contentStep=${contentStep}` : "";
  return `/workspace-overview?workspace=${workspace}&view=course-authoring&flow=content&flowStep=${step}${source}`;
}

export function CourseSetupFlowFrame({
  workspaceId,
  currentStep,
  contentStep,
  children,
}: {
  workspaceId: string;
  currentStep: CourseSetupStep;
  contentStep?: CourseContentStep;
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
  const flowSteps = steps.filter(
    (step) => step.id === entryStep || step.id === "arrange" || step.id === "publish",
  );
  const currentIndex = flowSteps.findIndex((step) => step.id === currentStep);
  const previous = currentIndex > 0 ? flowSteps[currentIndex - 1] : null;
  const next = currentIndex < flowSteps.length - 1 ? flowSteps[currentIndex + 1] : null;

  return (
    <section className="space-y-5" aria-label={t("Course setup flow", "Luồng thiết lập khóa học")}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {t("Course content flow", "Luồng nội dung khóa học")}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">
          {t("Add content and update your course", "Thêm nội dung và cập nhật khóa học")}
        </h2>
      </div>

      <nav aria-label={t("Course setup steps", "Các bước thiết lập khóa học")} className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-2 pb-1">
          {flowSteps.map((step, index) => {
            const Icon = step.icon;
            const active = index === currentIndex;
            const completed = index < currentIndex;
            return (
              <li key={step.id} className="flex items-center gap-2">
                <Link
                  href={courseSetupStepHref(workspaceId, step.id, entryStep)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : completed
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {completed ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                  {index + 1}. {t(step.en, step.vi)}
                </Link>
                {index < flowSteps.length - 1 ? (
                  <ArrowRight className="size-4 text-muted-foreground/50" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      {children}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {previous ? (
          <Button asChild variant="outline">
            <Link href={courseSetupStepHref(workspaceId, previous.id, entryStep)}>
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {t(`Back: ${previous.en}`, `Quay lại: ${previous.vi}`)}
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=content-actions`}>
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {t("Back to Add content", "Quay lại Thêm nội dung")}
            </Link>
          </Button>
        )}

        {next ? (
          <Button asChild>
            <Link href={courseSetupStepHref(workspaceId, next.id, entryStep)}>
              {t(`Next: ${next.en}`, `Tiếp theo: ${next.vi}`)}
              <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : <span aria-hidden="true" />}
      </div>
    </section>
  );
}

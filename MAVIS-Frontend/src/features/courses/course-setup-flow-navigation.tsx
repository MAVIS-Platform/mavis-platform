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
  { id: "arrange", en: "Arrange Modules", vi: "Sắp xếp Module", icon: ListTree },
  { id: "publish", en: "Publish Changes", vi: "Publish Changes", icon: Send },
];

export function courseSetupStepHref(workspaceId: string, step: CourseSetupStep) {
  const workspace = encodeURIComponent(workspaceId);
  if (step === "repository") return `/references?workspace=${workspace}&from=first-setup`;
  if (step === "lesson") return `/theory-library?workspace=${workspace}&flow=first-setup`;
  if (step === "quiz")
    return `/workspace-overview?workspace=${workspace}&view=quiz-library&flow=first-setup`;
  if (step === "lab") return `/lab-authoring?workspace=${workspace}&flow=first-setup`;
  return `/workspace-overview?workspace=${workspace}&view=course-authoring&flow=first-setup&flowStep=${step}`;
}

export function CourseSetupFlowFrame({
  workspaceId,
  currentStep,
  children,
}: {
  workspaceId: string;
  currentStep: CourseSetupStep;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const currentIndex = steps.findIndex((step) => step.id === currentStep);
  const previous = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const next = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;

  return (
    <section className="space-y-5" aria-label={t("Course setup flow", "Luồng thiết lập khóa học")}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {t("First Course setup", "Thiết lập khóa học lần đầu")}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">
          {t("Build the first learning flow", "Xây dựng learning flow đầu tiên")}
        </h2>
      </div>

      <nav aria-label={t("Course setup steps", "Các bước thiết lập khóa học")} className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-2 pb-1">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const active = index === currentIndex;
            const completed = index < currentIndex;
            return (
              <li key={step.id} className="flex items-center gap-2">
                <Link
                  href={courseSetupStepHref(workspaceId, step.id)}
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
                {index < steps.length - 1 ? (
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
            <Link href={courseSetupStepHref(workspaceId, previous.id)}>
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {t(`Back: ${previous.en}`, `Quay lại: ${previous.vi}`)}
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}`}>
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {t("Back to Overview", "Quay lại Overview")}
            </Link>
          </Button>
        )}

        {next ? (
          <Button asChild>
            <Link href={courseSetupStepHref(workspaceId, next.id)}>
              {t(`Next: ${next.en}`, `Tiếp theo: ${next.vi}`)}
              <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}`}>
              {t("Finish Course setup", "Hoàn tất thiết lập khóa học")}
              <CheckCircle2 className="ml-1.5 size-4" aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

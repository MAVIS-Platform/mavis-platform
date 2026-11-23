"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { useLocale } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

type StepId = "repository" | "lesson" | "quiz" | "lab" | "arrange" | "publish";

const steps: Array<{
  id: StepId;
  en: string;
  vi: string;
  detailEn: string;
  detailVi: string;
  icon: LucideIcon;
}> = [
  {
    id: "repository",
    en: "Repository",
    vi: "Repository",
    detailEn: "Import source and let the backend generate C1–C3 and the dependency graph.",
    detailVi: "Nhập mã nguồn để backend tạo C1–C3 và Dependency Graph.",
    icon: GitBranch,
  },
  {
    id: "lesson",
    en: "Lesson",
    vi: "Lý thuyết",
    detailEn: "Write, import, or generate the theory lesson from repository evidence.",
    detailVi: "Tự soạn, nhập hoặc tạo bài lý thuyết từ bằng chứng của repository.",
    icon: BookOpen,
  },
  {
    id: "quiz",
    en: "Quiz",
    vi: "Quiz",
    detailEn: "Prepare an independent knowledge check for the Module.",
    detailVi: "Chuẩn bị bài kiểm tra kiến thức độc lập cho Module.",
    icon: FileQuestion,
  },
  {
    id: "lab",
    en: "MAVIS Studio Lab",
    vi: "Lab MAVIS Studio",
    detailEn: "Configure Docker/runtime, the exercise scenario, and Studio readiness.",
    detailVi: "Cấu hình Docker/runtime, kịch bản và trạng thái sẵn sàng của Studio.",
    icon: Boxes,
  },
  {
    id: "arrange",
    en: "Arrange Modules",
    vi: "Sắp xếp Module",
    detailEn: "Place Lesson, Quiz, and Lab into Modules and define their order.",
    detailVi: "Đưa Lesson, Quiz và Lab vào Module và thiết lập thứ tự.",
    icon: ListTree,
  },
  {
    id: "publish",
    en: "Publish Changes",
    vi: "Publish Changes",
    detailEn: "Review the learner-facing structure before activating the Course.",
    detailVi: "Kiểm tra cấu trúc sinh viên sẽ thấy trước khi kích hoạt khóa học.",
    icon: Send,
  },
];

function flowHref(workspaceId: string, step: StepId) {
  return `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-flow&step=${step}`;
}

function editorHref(workspaceId: string, step: StepId) {
  if (step === "repository") return `/references?workspace=${encodeURIComponent(workspaceId)}`;
  if (step === "lesson") return `/theory-library?workspace=${encodeURIComponent(workspaceId)}`;
  if (step === "quiz") {
    return `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=quiz-library`;
  }
  if (step === "lab") return `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}`;
  return `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`;
}

export function CourseFirstSetupFlow({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const params = useSearchParams();
  const requested = params.get("step") as StepId | null;
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === requested));
  const current = steps[currentIndex] ?? steps[0]!;
  const CurrentIcon = current.icon;
  const previous = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const next = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;

  return (
    <section className="space-y-5" aria-labelledby="first-setup-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {t("First Course setup", "Thiết lập khóa học lần đầu")}
        </p>
        <h2 id="first-setup-title" className="mt-1 text-2xl font-bold tracking-tight">
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
                  href={flowHref(workspaceId, step.id)}
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
                {index < steps.length - 1 && <ArrowRight className="size-4 text-muted-foreground/50" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <CurrentIcon className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(`Step ${currentIndex + 1} of ${steps.length}`, `Bước ${currentIndex + 1}/${steps.length}`)}
            </p>
            <h3 className="mt-1 text-xl font-bold">{t(current.en, current.vi)}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t(current.detailEn, current.detailVi)}
            </p>
            <Button asChild className="mt-5">
              <Link href={editorHref(workspaceId, current.id)}>
                {current.id === "publish"
                  ? t("Review Course draft", "Kiểm tra bản nháp khóa học")
                  : t(`Open ${current.en}`, `Mở ${current.vi}`)}
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {previous ? (
          <Button asChild variant="outline">
            <Link href={flowHref(workspaceId, previous.id)}>
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
            <Link href={flowHref(workspaceId, next.id)}>
              {t(`Next: ${next.en}`, `Tiếp theo: ${next.vi}`)}
              <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`}>
              {t("Review & Publish", "Kiểm tra & Publish")}
              <Send className="ml-1.5 size-4" aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

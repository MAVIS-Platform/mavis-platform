"use client";

import Link from "next/link";
import { BookOpen, Boxes, FileQuestion, GitBranch, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";

const actions = [
  {
    id: "repository",
    icon: GitBranch,
    en: "Add Repository",
    vi: "Thêm Repository",
    detailEn: "Import a repository or ZIP and generate C1–C3 architecture evidence.",
    detailVi: "Nhập repository hoặc ZIP và tạo dữ liệu kiến trúc C1–C3.",
    href: (workspaceId: string) => `/references?workspace=${encodeURIComponent(workspaceId)}`,
  },
  {
    id: "lesson",
    icon: BookOpen,
    en: "Add Lesson",
    vi: "Thêm bài lý thuyết",
    detailEn: "Write, import, or reuse a lesson from the Theory Library.",
    detailVi: "Tự soạn, nhập hoặc tái sử dụng bài học từ Thư viện lý thuyết.",
    href: (workspaceId: string) => `/theory-library?workspace=${encodeURIComponent(workspaceId)}`,
  },
  {
    id: "quiz",
    icon: FileQuestion,
    en: "Add Quiz",
    vi: "Thêm Quiz",
    detailEn: "Create an independent knowledge check for the Course.",
    detailVi: "Tạo bài kiểm tra kiến thức độc lập cho khóa học.",
    href: (workspaceId: string) =>
      `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=quiz-library`,
  },
  {
    id: "lab",
    icon: Boxes,
    en: "Add Lab",
    vi: "Thêm Lab",
    detailEn: "Configure a Docker/runtime exercise in MAVIS Studio.",
    detailVi: "Cấu hình bài thực hành Docker/runtime trong MAVIS Studio.",
    href: (workspaceId: string) => `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}`,
  },
] as const;

export function CourseContentHub({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  return (
    <section className="space-y-5" aria-labelledby="content-hub-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("Course authoring", "Biên soạn khóa học")}
          </p>
          <h2 id="content-hub-title" className="mt-1 text-2xl font-bold tracking-tight">
            {t("What would you like to add?", "Bạn muốn thêm nội dung nào?")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Create content independently, then arrange it into the current Modules.",
              "Tạo nội dung độc lập, sau đó sắp xếp nội dung vào các Module hiện tại.",
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link
            href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`}
          >
            <Settings2 className="mr-1.5 size-4" aria-hidden="true" />
            {t("Update Course", "Cập nhật khóa học")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              href={action.href(workspaceId)}
              className="group flex min-h-32 items-start gap-4 rounded-2xl border bg-card p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-bold">
                  {t(action.en, action.vi)}
                  <Plus className="size-4 text-primary" aria-hidden="true" />
                </span>
                <span className="mt-1.5 block text-sm leading-5 text-muted-foreground">
                  {t(action.detailEn, action.detailVi)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

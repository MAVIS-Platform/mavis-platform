"use client";

import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Code2,
  FileText,
  GitFork,
  HelpCircle,
  Lock,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { ApiError } from "@/lib/errors/api-error";
import { useApiQuery } from "@/hooks/use-api";
import { useCourseAuthoring, useCourseRoadmap, usePublishedCourse } from "@/features/workspaces/course-access";

export function isMissingCourseError(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

type ItemType = "THEORY" | "QUIZ" | "ESSAY" | "STATIC_LAB" | "IMPACT_LAB" | "RUNTIME_LAB";

type OutlineItem = {
  id: string;
  type: ItemType | string;
  title: string;
  description?: string | null;
  position: number;
  assignmentId?: string | null;
  content?: Record<string, unknown>;
  required?: boolean;
};

type OutlineModule = {
  id: string;
  title: string;
  description?: string | null;
  position: number;
  prerequisiteModuleId?: string | null;
  items: OutlineItem[];
};

const TYPE_META: Record<string, { en: string; vi: string; icon: LucideIcon }> = {
  THEORY: { en: "Theory", vi: "Lý thuyết", icon: BookOpen },
  QUIZ: { en: "Quiz", vi: "Quiz", icon: HelpCircle },
  ESSAY: { en: "Essay", vi: "Tự luận", icon: FileText },
  STATIC_LAB: { en: "Static Lab", vi: "Lab tĩnh", icon: Code2 },
  IMPACT_LAB: { en: "Impact Lab", vi: "Lab tác động", icon: GitFork },
  RUNTIME_LAB: { en: "Runtime Lab", vi: "Lab runtime", icon: Play },
};

function stepForType(type: string) {
  if (type === "QUIZ" || type === "THEORY" || type === "ESSAY" || type === "IMPACT_LAB") return 2;
  if (type === "RUNTIME_LAB") return 3;
  return 1;
}

function statusForLab(state: string | undefined, canManage: boolean) {
  if (state === "PASSED") return { label: { en: "Passed", vi: "Đã đạt" }, variant: "success" as const, icon: CheckCircle2 };
  if (state === "UNLOCKED") return { label: { en: "Available", vi: "Đã mở" }, variant: "default" as const, icon: Circle };
  if (state === "LOCKED") return { label: { en: "Locked", vi: "Đang khóa" }, variant: "outline" as const, icon: Lock };
  return canManage
    ? { label: { en: "Draft", vi: "Bản nháp" }, variant: "secondary" as const, icon: Circle }
    : { label: { en: "Not published", vi: "Chưa công bố" }, variant: "secondary" as const, icon: Circle };
}

export function CourseOutline({
  workspaceId,
  canManage,
  active,
}: {
  workspaceId: string;
  canManage: boolean;
  active: boolean;
}) {
  const { t } = useLocale();
  const authoring = useCourseAuthoring(workspaceId, canManage);
  const publishedQuery = usePublishedCourse(workspaceId);
  const published = publishedQuery.data;
  const draft = authoring.data;
  const assignments = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const roadmap = useCourseRoadmap(workspaceId);

  const modules: OutlineModule[] = (published?.snapshot.modules as OutlineModule[] | undefined)
    ?? (draft?.modules as OutlineModule[] | undefined)
    ?? [];
  const courseTitle = published?.snapshot.title ?? draft?.title ?? "";
  const courseStatus = published ? `v${published.version}` : draft?.status ?? "";
  const labs = new Map((roadmap.data?.labs ?? []).map((lab) => [lab.assignmentId, lab]));
  const assignmentById = new Map((assignments.data ?? []).map((assignment) => [assignment.id, assignment]));

  const loadError =
    (canManage && authoring.isError && !isMissingCourseError(authoring.error)) ||
    (!canManage && publishedQuery.isError && !isMissingCourseError(publishedQuery.error));
  if (loadError) {
    return (
      <section className="rounded-xl border bg-card p-4" role="alert">
        <p className="text-sm font-medium">{t("Could not load class content.", "Không tải được nội dung lớp.")}</p>
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          onClick={() => void (canManage ? authoring.refetch() : publishedQuery.refetch())}
        >
          {t("Retry", "Thử lại")}
        </Button>
      </section>
    );
  }

  if (published === undefined && draft === undefined && (canManage ? authoring.isPending : publishedQuery.isPending)) {
    return <p className="text-sm text-muted-foreground">{t("Loading class content…", "Đang tải nội dung lớp…")}</p>;
  }

  if (modules.length === 0) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-6 text-center">
        <h2 className="font-semibold">{t("No modules yet", "Chưa có chương/module")}</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
          {canManage
            ? t(
                "Create the first module in Authoring, then publish the Course version students will follow.",
                "Tạo chương đầu tiên trong Soạn nội dung, sau đó công bố phiên bản Course để sinh viên học.",
              )
            : t("Your lecturer has not published course content yet.", "Giảng viên chưa công bố nội dung khóa học.")}
        </p>
        {canManage && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}#course-builder`}>
                {t("Open course authoring", "Mở soạn nội dung")}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/assignments?workspace=${encodeURIComponent(workspaceId)}`}>
                {t("Create the first Lab", "Tạo Lab đầu tiên")}
              </Link>
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="course-outline-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="course-outline-title" className="font-semibold">
            {courseTitle || t("Class content", "Nội dung lớp")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {modules.length} {t("modules", "chương")} ·{" "}
            {modules.reduce((total, module) => total + module.items.length, 0)} {t("activities", "hoạt động")}
            {courseStatus ? ` · ${courseStatus}` : ""}
          </p>
        </div>
        {canManage && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}#course-builder`}>
              {t("Edit content", "Sửa nội dung")}
            </Link>
          </Button>
        )}
      </div>

      <ol className="space-y-3">
        {modules.map((module) => (
          <li key={module.id}>
            <details open className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/40 text-sm font-semibold">
                  {module.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{module.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {module.items.length} {t("activities", "hoạt động")}
                    {module.prerequisiteModuleId
                      ? ` · ${t("Prerequisite", "Tiên quyết")}: ${
                          modules.find((candidate) => candidate.id === module.prerequisiteModuleId)?.title
                          ?? t("previous module", "chương trước")
                        }`
                      : ""}
                  </span>
                </span>
                <Badge variant="outline" className="group-open:hidden">
                  {module.items.length}
                </Badge>
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              {module.description && (
                <p className="border-t px-4 py-2 text-sm text-muted-foreground">{module.description}</p>
              )}
              <ul className="divide-y border-t">
                {module.items.map((item) => {
                  const meta = TYPE_META[item.type] ?? { en: item.type, vi: item.type, icon: FileText };
                  const Icon = meta.icon;
                  const lab = item.assignmentId ? labs.get(item.assignmentId) : undefined;
                  const assignment = item.assignmentId ? assignmentById.get(item.assignmentId) : undefined;
                  const isLab = ["STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(item.type);
                  const status = isLab
                    ? statusForLab(lab?.state, canManage)
                    : item.type === "QUIZ"
                      ? statusForLab(lab?.state, canManage)
                      : null;
                  const StatusIcon = status?.icon;
                  const lockedForStudent = lab?.state === "LOCKED";
                  const href = item.assignmentId && active && (!lockedForStudent || canManage)
                    ? canManage
                      ? `/assignments?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(item.assignmentId)}`
                      : `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(item.assignmentId)}&step=${stepForType(item.type)}`
                    : canManage
                      ? `/roadmap?workspace=${encodeURIComponent(workspaceId)}#course-builder`
                      : null;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted/50 text-muted-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(meta.en, meta.vi)}
                          </span>
                          {item.required === false && (
                            <Badge variant="outline">{t("Optional", "Không bắt buộc")}</Badge>
                          )}
                        </div>
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {(item.description || (assignment?.title && assignment.title !== item.title)) && (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.description || assignment?.title}
                          </p>
                        )}
                      </div>
                      {status && StatusIcon && (
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="size-3" aria-hidden="true" />
                          {t(status.label.en, status.label.vi)}
                        </Badge>
                      )}
                      {href && (
                        <Button asChild size="sm" variant={isLab ? "outline" : "ghost"}>
                          <Link href={href}>
                            {canManage
                              ? t("Manage", "Quản lý")
                              : lockedForStudent
                                ? t("Locked", "Đang khóa")
                                : t("Open", "Mở")}
                          </Link>
                        </Button>
                      )}
                    </li>
                  );
                })}
                {module.items.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">
                    {t("No learning items in this module yet.", "Chương này chưa có nội dung học.")}
                  </li>
                )}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

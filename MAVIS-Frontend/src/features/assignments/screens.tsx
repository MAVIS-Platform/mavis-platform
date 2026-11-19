"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Eye,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailPanel } from "@/components/shared/data";
import { Input } from "@/components/ui/input";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { useApiMutation, useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { isDeadlinePassed } from "@/features/submissions/submission-readiness";
import {
  PublishCourseLab,
  useCourseRoadmap,
  useCourseSetup,
} from "@/features/workspaces/course-access";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { AssignmentInstructions } from "./assignment-instructions";
import { AssignmentSourceDetails } from "./source-picker";
import { ImportLabButton } from "./lab-transfer";
import { LabPrerequisitesDialog } from "./lab-prerequisites-dialog";
import type { Assignment } from "./requirements";

function formatOptionalDate(value: string | undefined): string | null {
  if (!value || value === "No deadline") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatDeadline(value: string | undefined) {
  return formatOptionalDate(value) ?? "No deadline";
}

export function Assignments({ embedded = false }: { embedded?: boolean } = {}) {
  const canManage = usePermission("workspace:manage");
  return canManage ? <LecturerAssignments embedded={embedded} /> : <StudentAssignments />;
}

type LibraryFilter = "all" | "class" | "draft";

function LecturerAssignments({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useLocale();
  const params = useSearchParams();
  const selection = useSelection();
  const workspaceId = params?.get("workspace") || selection.workspaceId;
  const workspacesQuery = useApiQuery("workspaces", {});
  const workspace = workspacesQuery.data?.find((item) => item.id === workspaceId);
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const roadmap = useCourseRoadmap(workspaceId);
  const setup = useCourseSetup(workspaceId);
  const remove = useApiMutation("deleteAssignment");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [prerequisiteLab, setPrerequisiteLab] = useState<Assignment | null>(null);
  const labs = query.data ?? [];

  const rows = useMemo(() => {
    return labs.map((lab) => {
      const inClass = roadmap.data?.labs.find((item) => item.assignmentId === lab.id) ?? null;
      const setupLab = setup.data?.labs.find((item) => item.assignmentId === lab.id) ?? null;
      const sourceReady = Boolean(lab.referenceSource?.modelId);
      const quizPublished = Boolean(setupLab?.quizPublished);
      const studioReady = Boolean(setupLab?.topologyFrozen);
      return { lab, inClass, setupLab, sourceReady, quizPublished, studioReady };
    });
  }, [labs, roadmap.data?.labs, setup.data?.labs]);

  const inClassCount = rows.filter((row) => row.inClass).length;
  const visible = rows.filter((row) => {
    if (filter === "class" && !row.inClass) return false;
    if (filter === "draft" && row.inClass) return false;
    const term = search.trim().toLowerCase();
    return !term || row.lab.title.toLowerCase().includes(term);
  });

  if (!workspaceId) return null;

  const filters: Array<{ id: LibraryFilter; label: string; count: number }> = [
    { id: "all", label: t("All labs", "Tất cả Lab"), count: rows.length },
    { id: "class", label: t("In class", "Trong lớp"), count: inClassCount },
    { id: "draft", label: t("Not in class", "Chưa vào lớp"), count: rows.length - inClassCount },
  ];

  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {rows.length > 0 ? (
          <div
            role="group"
            aria-label={t("Filter labs", "Lọc Lab")}
            className="inline-flex rounded-lg border bg-card p-0.5"
          >
            {filters.map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                  <span className="ml-1.5 text-xs tabular-nums opacity-70">{item.count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <h2 className="text-lg font-semibold tracking-tight">{t("Lab Library", "Kho Lab")}</h2>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {rows.length > 0 && (
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="h-9 pl-8"
                value={search}
                placeholder={t("Search labs by title", "Tìm Lab theo tên")}
                aria-label={t("Search labs", "Tìm Lab")}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          )}
          <ImportLabButton workspaceId={workspaceId} />
          <Button asChild size="sm">
            <Link href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}`}>
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {t("Create a Lab", "Tạo Lab")}
            </Link>
          </Button>
        </div>
      </div>

      <RequestState
        query={query}
        empty={!labs.length}
        emptyMessage={t(
          "No Labs in this library yet. Create the first Lab to start authoring.",
          "Kho chưa có Lab. Hãy tạo Lab đầu tiên để bắt đầu soạn.",
        )}
      >
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
            {t("No Labs match this filter.", "Không có Lab nào khớp bộ lọc này.")}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {visible.map(({ lab, inClass, setupLab, sourceReady, quizPublished, studioReady }) => {
              const creatorHref = `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}&tab=info`;
              const previewHref = `/lab?${new URLSearchParams({
                workspace: workspaceId,
                assignment: lab.id,
                step: "1",
                preview: "1",
              })}`;
              const formattedDue = formatOptionalDate(lab.dueAt);
              return (
                <li
                  key={lab.id}
                  className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {inClass ? (
                        <Badge variant="success">
                          {t("In class", "Trong lớp")} · L{inClass.position}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t("Library draft", "Bản nháp kho")}</Badge>
                      )}
                      <Link
                        className="truncate text-sm font-semibold hover:text-primary hover:underline"
                        href={creatorHref}
                      >
                        {lab.title}
                      </Link>
                      {sourceReady && (
                        <Badge variant="outline" className="text-[11px]">
                          C1–C3
                        </Badge>
                      )}
                      {quizPublished && (
                        <Badge variant="outline" className="text-[11px]">
                          Quiz v{setupLab?.quizVersion}
                        </Badge>
                      )}
                      {studioReady && (
                        <Badge variant="outline" className="text-[11px]">
                          Studio Live
                        </Badge>
                      )}
                      {!sourceReady && !quizPublished && !studioReady && (
                        <Badge variant="outline" className="text-[11px]">
                          {t("Theory", "Lý thuyết")}
                        </Badge>
                      )}
                    </div>
                    {formattedDue && (
                      <p className="text-xs text-muted-foreground">
                        {t("Due", "Hạn")}: {formattedDue}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Button asChild size="sm" variant="outline">
                      <Link href={creatorHref}>
                        <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Edit", "Sửa")}
                      </Link>
                    </Button>
                    {inClass ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={previewHref}>
                          <Eye className="mr-1 size-3.5" aria-hidden="true" />
                          {t("Preview", "Xem trước")}
                        </Link>
                      </Button>
                    ) : (
                      <PublishCourseLab workspaceId={workspaceId} assignmentId={lab.id} />
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPrerequisiteLab(lab)}
                    >
                      <GitBranch className="mr-1 size-3.5" aria-hidden="true" />
                      {t("Prerequisites", "Điều kiện")}
                    </Button>
                    {inClass && (
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                        >
                          {t("Submissions", "Bài nộp")}
                        </Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={remove.isPending || Boolean(inClass)}
                      title={
                        inClass
                          ? t(
                              "Remove this Lab from the class before deleting it.",
                              "Hãy gỡ Lab khỏi lớp trước khi xóa.",
                            )
                          : undefined
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Delete this Lab from the library? This cannot be undone.",
                              "Xóa Lab này khỏi kho? Không thể hoàn tác.",
                            ),
                          )
                        )
                          remove.mutate({ workspaceId, assignmentId: lab.id });
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("Delete", "Xóa")}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {remove.error && <ErrorState error={remove.error} />}
      </RequestState>
      <LabPrerequisitesDialog
        workspaceId={workspaceId}
        lab={prerequisiteLab}
        labs={labs}
        open={Boolean(prerequisiteLab)}
        onOpenChange={(open) => {
          if (!open) setPrerequisiteLab(null);
        }}
      />
    </div>
  );

  return workspace && !embedded ? (
    <CourseWorkspaceShell workspace={workspace} active="assignments">
      {content}
    </CourseWorkspaceShell>
  ) : (
    content
  );
}

function StudentAssignments() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const params = useSearchParams();
  const requestedAssignmentId = params?.get("assignment") || "";
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const roadmap = useCourseRoadmap(workspaceId);
  const assignments = useMemo(() => {
    const rows = [...(query.data ?? [])];
    if (!requestedAssignmentId) return rows;
    return rows.sort((left, right) =>
      left.id === requestedAssignmentId ? -1 : right.id === requestedAssignmentId ? 1 : 0,
    );
  }, [query.data, requestedAssignmentId]);

  useEffect(() => {
    if (!requestedAssignmentId || !query.data?.some((item) => item.id === requestedAssignmentId)) return;
    document
      .getElementById(`assignment-${requestedAssignmentId}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [query.data, requestedAssignmentId]);

  if (!workspaceId) return null;

  return (
    <RequestState
      query={query}
      empty={!query.data?.length}
      emptyMessage={t(
        "Your lecturer has not published a Lab in this class yet.",
        "Giảng viên chưa công bố Lab nào trong lớp này.",
      )}
    >
      <div className="space-y-4">
        {assignments.map((assignment) => {
          const published = roadmap.data?.labs.find((lab) => lab.assignmentId === assignment.id);
          const overdue = isDeadlinePassed(assignment.dueAt);
          const locked = published?.state === "LOCKED";
          const passed = published?.state === "PASSED";
          return (
            <div
              key={assignment.id}
              id={`assignment-${assignment.id}`}
              className={
                assignment.id === requestedAssignmentId
                  ? "scroll-mt-20 rounded-2xl ring-2 ring-primary/40 ring-offset-4 ring-offset-background"
                  : "scroll-mt-20"
              }
            >
              <DetailPanel
                title={assignment.title}
                actions={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={overdue ? "destructive" : "outline"}>
                      {t("Due", "Hạn")} {formatDeadline(assignment.dueAt)}
                    </Badge>
                    <Badge variant={assignment.requireRuntimeTrace ? "warning" : "outline"}>
                      {assignment.requireRuntimeTrace
                        ? t("THEORY_QUIZ_STUDIO", "THEORY_QUIZ_STUDIO")
                        : t("THEORY_QUIZ", "THEORY_QUIZ")}
                    </Badge>
                  </div>
                }
              >
                <AssignmentInstructions>{assignment.instructions}</AssignmentInstructions>
                <AssignmentSourceDetails source={assignment.referenceSource} assignmentId={assignment.id} />
                <div className="flex flex-wrap items-center gap-2">
                  {!locked && (
                    <Button asChild>
                      <Link
                        href={`/lab?${new URLSearchParams({
                          workspace: workspaceId,
                          assignment: assignment.id,
                          step: "1",
                        })}`}
                      >
                        <BookOpen className="mr-1 size-4" aria-hidden="true" />
                        {passed ? t("Review Lab", "Xem lại Lab") : t("Enter Lab", "Vào làm Lab")}
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="outline">
                    <Link
                      href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}`}
                    >
                      {t("Submissions & Grades", "Bài nộp & Điểm")}
                    </Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                      {t("Back to Lab Roadmap", "Quay lại Lộ trình Lab")}
                    </Link>
                  </Button>
                </div>
                {passed && (
                  <p role="status" className="text-sm text-success">
                    {t(
                      "This Lab is complete. Your passing submission is in Submissions & Grades.",
                      "Lab đã hoàn thành. Bài đã đạt nằm trong Bài nộp & Điểm.",
                    )}
                  </p>
                )}
                {!passed && locked && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {t(
                      "This Lab is locked until you pass the preceding Lab.",
                      "Lab này bị khóa cho tới khi bạn đạt Lab trước.",
                    )}
                  </p>
                )}
              </DetailPanel>
            </div>
          );
        })}
      </div>
    </RequestState>
  );
}

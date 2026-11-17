"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  CircleHelp,
  Eye,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailPanel } from "@/components/shared/data";
import { Input } from "@/components/ui/input";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { useApi, useApiMutation, useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { diagramTypeLabel } from "@/lib/architecture/coursework-diagram-types";
import { isDeadlinePassed } from "@/features/submissions/submission-readiness";
import { SubmissionComposer } from "@/features/submissions/composer";
import {
  PublishCourseLab,
  SeedCuratedCourseLabs,
  useCourseRoadmap,
  useCourseSetup,
} from "@/features/workspaces/course-access";
import { AssignmentInstructions } from "./assignment-instructions";
import { AssignmentSourceDetails } from "./source-picker";

function formatDeadline(value: string | undefined) {
  if (!value || value === "No deadline") return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function Assignments() {
  const canManage = usePermission("workspace:manage");
  return canManage ? <LecturerAssignments /> : <StudentAssignments />;
}

type LibraryFilter = "all" | "class" | "draft";

function LecturerAssignments() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const roadmap = useCourseRoadmap(workspaceId);
  const setup = useCourseSetup(workspaceId);
  const client = useApi();
  const remove = useApiMutation("deleteAssignment");
  const [showTools, setShowTools] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const labs = query.data ?? [];

  const rows = useMemo(() => {
    return labs.map((lab) => {
      const inClass = roadmap.data?.labs.find((item) => item.assignmentId === lab.id) ?? null;
      const setupLab = setup.data?.labs.find((item) => item.assignmentId === lab.id) ?? null;
      const sourceReady = Boolean(lab.referenceSource?.modelId);
      const quizPublished = Boolean(setupLab?.quizPublished);
      const readyForClass = sourceReady && quizPublished;
      return { lab, inClass, setupLab, sourceReady, quizPublished, readyForClass };
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {t(
            "Every Lab you create lives here. Author it in Lab Creation, then choose which Labs open in this class — students see the class sequence in their roadmap.",
            "Mọi Lab bạn tạo đều nằm ở đây. Soạn Lab trong Tạo Lab, sau đó chọn Lab nào mở trong lớp này — sinh viên thấy thứ tự lớp trong lộ trình học.",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowTools((open) => !open)}>
            <Settings2 className="mr-1 size-4" aria-hidden="true" />
            {t("Course tools", "Công cụ khóa học")}
          </Button>
          <Button asChild size="sm">
            <Link href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}`}>
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {t("Create a Lab", "Tạo Lab")}
            </Link>
          </Button>
        </div>
      </div>

      {showTools && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{t("Course tools", "Công cụ khóa học")}</h2>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Seed a curated course or open the course-level setup checklist. These actions are separate from authoring one Lab.",
                  "Khởi tạo khóa học mẫu hoặc mở checklist cấp khóa học. Các thao tác này tách khỏi việc soạn một Lab.",
                )}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
                {t("Course setup checklist", "Checklist thiết lập khóa học")}
              </Link>
            </Button>
          </div>
          <SeedCuratedCourseLabs workspaceId={workspaceId} />
        </section>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-8"
              value={search}
              placeholder={t("Search labs by title", "Tìm Lab theo tên")}
              aria-label={t("Search labs", "Tìm Lab")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      )}

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
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {visible.map(({ lab, inClass, setupLab, sourceReady, quizPublished, readyForClass }) => {
              const creatorHref = `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}&tab=info`;
              const previewHref = `/lab?${new URLSearchParams({
                workspace: workspaceId,
                assignment: lab.id,
                step: "1",
                preview: "1",
              })}`;
              const mode =
                lab.labMode === "THEORY_QUIZ_STUDIO"
                  ? t("Theory + Quiz + Studio", "Lý thuyết + Quiz + Studio")
                  : lab.labMode === "THEORY_QUIZ"
                    ? t("Theory + Quiz", "Lý thuyết + Quiz")
                    : t("Legacy Lab", "Lab cũ");
              return (
                <li key={lab.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border text-sm font-semibold tabular-nums",
                        inClass
                          ? "border-primary/30 bg-primary/5 text-primary"
                          : "bg-muted/40 text-muted-foreground",
                      )}
                      aria-hidden="true"
                    >
                      {inClass ? inClass.position : "–"}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link className="truncate font-medium hover:underline" href={creatorHref}>
                          {lab.title}
                        </Link>
                        {inClass ? (
                          <Badge variant="success">{t("In class", "Trong lớp")}</Badge>
                        ) : (
                          <Badge variant="secondary">{t("Library draft", "Bản nháp kho")}</Badge>
                        )}
                        <Badge variant="outline">{mode}</Badge>
                      </div>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <GitBranch className="size-3.5" aria-hidden="true" />
                          {sourceReady
                            ? t(`Source pinned · r${lab.referenceSource?.revision}`, `Nguồn đã ghim · r${lab.referenceSource?.revision}`)
                            : t("No reference source", "Chưa gắn nguồn")}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CircleHelp className="size-3.5" aria-hidden="true" />
                          {quizPublished
                            ? t(`Quiz published · v${setupLab?.quizVersion}`, `Quiz đã công bố · v${setupLab?.quizVersion}`)
                            : t("Quiz not published", "Quiz chưa công bố")}
                        </span>
                        <span>
                          {t("Deadline", "Hạn nộp")}: {formatDeadline(lab.dueAt)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <Button asChild size="sm" variant="outline">
                      <Link href={creatorHref}>
                        <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Edit in Lab Creation", "Sửa trong Tạo Lab")}
                      </Link>
                    </Button>
                    {inClass ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={previewHref}>
                          <Eye className="mr-1 size-3.5" aria-hidden="true" />
                          {t("Preview", "Xem trước")}
                        </Link>
                      </Button>
                    ) : (
                      <div className="flex flex-col items-start">
                        <PublishCourseLab workspaceId={workspaceId} assignmentId={lab.id} />
                        {!readyForClass && client.mode === "backend" && (
                          <span className="mt-1 text-[11px] text-muted-foreground">
                            {t(
                              "Pin a source and publish a Quiz before adding it to the class.",
                              "Cần ghim nguồn và công bố Quiz trước khi thêm vào lớp.",
                            )}
                          </span>
                        )}
                      </div>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}>
                        {t("Submissions", "Bài nộp")}
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending || Boolean(inClass)}
                      title={inClass ? t("Remove this Lab from the class before deleting it.", "Hãy gỡ Lab khỏi lớp trước khi xóa.") : undefined}
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
    </div>
  );
}

function StudentAssignments() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const params = useSearchParams();
  const requestedAssignmentId = params?.get("assignment") || "";
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const client = useApi();
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
                        ? t("Runtime trace required", "Yêu cầu runtime trace")
                        : t("Runtime trace optional", "Runtime trace tùy chọn")}
                    </Badge>
                  </div>
                }
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("Required diagrams:", "Sơ đồ bắt buộc:")}
                  </span>
                  {assignment.requiredDiagramTypes && assignment.requiredDiagramTypes.length > 0 ? (
                    assignment.requiredDiagramTypes.map((type) => (
                      <Badge key={type} variant="secondary">
                        {diagramTypeLabel(type)}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">{t("Any saved diagram", "Bất kỳ sơ đồ đã lưu")}</Badge>
                  )}
                </div>
                <AssignmentInstructions>{assignment.instructions}</AssignmentInstructions>
                <AssignmentSourceDetails source={assignment.referenceSource} assignmentId={assignment.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild>
                    <Link
                      href={`/lab?${new URLSearchParams({
                        workspace: workspaceId,
                        assignment: assignment.id,
                        step: "1",
                      })}`}
                    >
                      <BookOpen className="mr-1 size-4" aria-hidden="true" />
                      {locked ? t("View Lab", "Xem Lab") : t("Open Lab", "Mở Lab")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}`}>
                      {t("My submissions", "Bài nộp của tôi")}
                    </Link>
                  </Button>
                </div>
                {passed && (
                  <p role="status" className="text-sm text-success">
                    {t("This Lab is complete. Your passing submission is in My Submissions.", "Lab đã hoàn thành. Bài đã đạt nằm trong Bài nộp của tôi.")}
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
                {!passed && !locked && (client.mode !== "backend" || roadmap.isSuccess) && (
                  <SubmissionComposer
                    key={assignment.id}
                    assignmentId={assignment.id}
                    requirements={assignment}
                    guided={roadmap.data?.guided ?? false}
                    workspaceId={workspaceId}
                  />
                )}
              </DetailPanel>
            </div>
          );
        })}
      </div>
    </RequestState>
  );
}

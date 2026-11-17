"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Eye, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data";
import { DetailPanel } from "@/components/shared/data";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { useApiMutation, useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { isDeadlinePassed } from "@/features/submissions/submission-readiness";
import { SeedCuratedCourseLabs, useCourseRoadmap } from "@/features/workspaces/course-access";
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

function LecturerAssignments() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const roadmap = useCourseRoadmap(workspaceId);
  const remove = useApiMutation("deleteAssignment");
  const [showTools, setShowTools] = useState(false);
  const labs = query.data ?? [];
  const publishedLabs = labs.filter((lab) =>
    roadmap.data?.labs.some((item) => item.assignmentId === lab.id),
  ).length;

  if (!workspaceId) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Labs", "Lab")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Create a Lab, then configure its theory, reference source, Quiz, Studio Live and publishing in one authoring workspace.",
              "Tạo Lab, sau đó cấu hình lý thuyết, nguồn tham chiếu, Quiz, Studio Live và công bố trong một không gian soạn duy nhất.",
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {labs.length} {t("Labs", "Lab")} · {publishedLabs} {t("published", "đã công bố")} ·{" "}
            {labs.length - publishedLabs} {t("draft", "bản nháp")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowTools((open) => !open)}
          >
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

      <RequestState
        query={query}
        empty={!labs.length}
        emptyMessage={t(
          "No Labs yet. Create the first Lab to start authoring.",
          "Chưa có Lab. Hãy tạo Lab đầu tiên để bắt đầu soạn.",
        )}
      >
        <DataTable
          rows={labs}
          rowKey={(lab) => lab.id}
          caption={t("Class Labs", "Lab của lớp")}
          columns={[
            {
              key: "title",
              label: t("Lab", "Lab"),
              render: (lab) => {
                const position = roadmap.data?.labs.find(
                  (item) => item.assignmentId === lab.id,
                )?.position;
                return (
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}&tab=info`}
                  >
                    {position ? `${position}. ` : ""}
                    {lab.title}
                  </Link>
                );
              },
            },
            {
              key: "status",
              label: t("Status", "Trạng thái"),
              render: (lab) => {
                const published = roadmap.data?.labs.some((item) => item.assignmentId === lab.id);
                return (
                  <Badge variant={published ? "success" : "secondary"}>
                    {published ? t("Published", "Đã công bố") : t("Draft", "Bản nháp")}
                  </Badge>
                );
              },
            },
            {
              key: "source",
              label: t("Reference source", "Nguồn tham chiếu"),
              render: (lab) =>
                lab.referenceSource
                  ? t(
                      `Pinned · r${lab.referenceSource.revision}`,
                      `Đã ghim · r${lab.referenceSource.revision}`,
                    )
                  : t("Missing", "Chưa gắn"),
            },
            {
              key: "due",
              label: t("Deadline", "Hạn nộp"),
              render: (lab) => formatDeadline(lab.dueAt),
            },
            {
              key: "actions",
              label: t("Actions", "Thao tác"),
              render: (lab) => {
                const published = roadmap.data?.labs.some((item) => item.assignmentId === lab.id);
                return (
                  <div className="flex flex-wrap items-center gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}&tab=info`}
                      >
                        <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                        {t("Author", "Soạn")}
                      </Link>
                    </Button>
                    {published && (
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`/lab?${new URLSearchParams({
                            workspace: workspaceId,
                            assignment: lab.id,
                            step: "1",
                            preview: "1",
                          })}`}
                        >
                          <Eye className="mr-1 size-3.5" aria-hidden="true" />
                          {t("Preview", "Xem trước")}
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(lab.id)}`}
                      >
                        {t("Submissions", "Bài nộp")}
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending || Boolean(published)}
                      title={
                        published
                          ? t(
                              "Published Labs cannot be deleted here.",
                              "Lab đã công bố không thể xóa tại đây.",
                            )
                          : undefined
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Delete this draft Lab? This cannot be undone.",
                              "Xóa Lab nháp này? Không thể hoàn tác.",
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
                );
              },
            },
          ]}
        />
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
  const roadmap = useCourseRoadmap(workspaceId);
  const assignments = useMemo(() => {
    const rows = [...(query.data ?? [])];
    if (!requestedAssignmentId) return rows;
    return rows.sort((left, right) =>
      left.id === requestedAssignmentId ? -1 : right.id === requestedAssignmentId ? 1 : 0,
    );
  }, [query.data, requestedAssignmentId]);

  useEffect(() => {
    if (!requestedAssignmentId || !query.data?.some((item) => item.id === requestedAssignmentId))
      return;
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
                <AssignmentSourceDetails
                  source={assignment.referenceSource}
                  assignmentId={assignment.id}
                />
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

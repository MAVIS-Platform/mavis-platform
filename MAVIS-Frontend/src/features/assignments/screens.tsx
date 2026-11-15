"use client";
import { isDeadlinePassed } from "@/features/submissions/submission-readiness";
import { Badge } from "@/components/ui/badge";
import { diagramTypeLabel } from "@/lib/architecture/coursework-diagram-types";
import { AssignmentSourceDetails } from "./source-picker";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApi, useApiQuery, useApiMutation, usePermission, useSelection } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { DetailPanel } from "@/components/shared/data";
import { SubmissionComposer } from "@/features/submissions/composer";
import { CreateAssignment } from "./create";
import { PublishCourseLab, SeedCuratedCourseLabs, useCourseRoadmap } from "@/features/workspaces/course-access";
import { CurriculumPublisher } from "@/features/courses/curriculum";
import { AssignmentInstructions } from "./assignment-instructions";
import Link from "next/link";

function formatDeadline(value: string | undefined): string {
  if (!value || value === "No deadline") return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function Assignments() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const params = useSearchParams();
  const requestedAssignmentId = params?.get("assignment") || "";
  const query = useApiQuery("assignments", { workspaceId }, { enabled: Boolean(workspaceId) });
  const client = useApi();
  const roadmap = useCourseRoadmap(workspaceId);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canSubmit = usePermission("submission:create");
  const canManage = usePermission("workspace:manage");
  const remove = useApiMutation("deleteAssignment");
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

  return workspaceId ? (
    <div className="space-y-5">
      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {client.mode === "backend" && <SeedCuratedCourseLabs workspaceId={workspaceId} />}
          <Button asChild variant="outline" size="sm">
            <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
              Course setup checklist
            </Link>
          </Button>
          <Button
            type="button"
            variant={showCreate ? "outline" : "default"}
            onClick={() => setShowCreate((open) => !open)}
          >
            {showCreate ? "Close create form" : "Create assignment"}
          </Button>
        </div>
      )}
      {canManage && showCreate && (
        <CreateAssignment
          key={workspaceId}
          workspaceId={workspaceId}
          onSuccess={() => setShowCreate(false)}
        />
      )}
      {roadmap.isError && (
        <Button variant="outline" onClick={() => void roadmap.refetch()}>
          {t("Retry loading lab roadmap", "Tải lại lộ trình Lab")}
        </Button>
      )}
      <RequestState
        query={query}
        empty={!query.data?.length}
        emptyMessage={
          canSubmit
            ? "Your lecturer has not published an assignment in this class yet."
            : "No assignments in this class yet. Click Create assignment above to publish one."
        }
      >
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const published = roadmap.data?.labs.find((lab) => lab.assignmentId === assignment.id);
            const overdue = isDeadlinePassed(assignment.dueAt);
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
                        Due {formatDeadline(assignment.dueAt)}
                      </Badge>
                      {assignment.requireRuntimeTrace ? (
                        <Badge variant="warning">Runtime Trace Required</Badge>
                      ) : (
                        <Badge variant="outline">Runtime Trace Optional</Badge>
                      )}
                    </div>
                  }
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Required diagrams:
                    </span>
                    {assignment.requiredDiagramTypes &&
                    assignment.requiredDiagramTypes.length > 0 ? (
                      assignment.requiredDiagramTypes.map((t) => (
                        <Badge key={t} variant="secondary">
                          {diagramTypeLabel(t)}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">Any saved diagram</Badge>
                    )}
                  </div>
                  <AssignmentInstructions>{assignment.instructions}</AssignmentInstructions>
                  <AssignmentSourceDetails
                    source={assignment.referenceSource}
                    assignmentId={assignment.id}
                  />
                  {canManage && client.mode === "backend" && assignment.referenceSource?.projectId && (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/runtime-config?project=${encodeURIComponent(assignment.referenceSource.projectId)}`}
                      >
                        Configure runtime &amp; Studio Live
                      </Link>
                    </Button>
                  )}
                  {canManage &&
                    client.mode === "backend" &&
                    (published || assignment.referenceSource) && (
                      <PublishCourseLab
                        workspaceId={workspaceId}
                        assignmentId={assignment.id}
                        position={published?.position}
                      />
                    )}
                  {published && client.mode === "backend" && (
                    canManage ? <CurriculumPublisher workspaceId={workspaceId} assignmentId={assignment.id} />
                      : published.state !== "LOCKED" && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/lab?${new URLSearchParams({ workspace: workspaceId, assignment: assignment.id, step: "2" })}`}>
                            {t("Study and take the Quiz", "Học lý thuyết và làm Quiz")}
                          </Link>
                        </Button>
                      )
                  )}
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        className="text-sm text-primary underline"
                        href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}`}
                      >
                        Review submissions for this assignment
                      </Link>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingId((current) =>
                            current === assignment.id ? null : assignment.id,
                          )
                        }
                      >
                        {editingId === assignment.id
                          ? "Close edit"
                          : "Edit assignment & reference source"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={remove.isPending || Boolean(published)}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Delete this assignment? Assignments with submissions cannot be deleted.",
                            )
                          )
                            remove.mutate({ workspaceId, assignmentId: assignment.id });
                        }}
                      >
                        Delete assignment
                      </Button>
                      {remove.error && <ErrorState error={remove.error} />}
                    </div>
                  )}
                  {canManage && editingId === assignment.id && (
                    <CreateAssignment
                      key={assignment.id}
                      workspaceId={workspaceId}
                      assignment={assignment}
                      onSuccess={() => setEditingId(null)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Required diagrams:{" "}
                    {assignment.requiredDiagramTypes?.map(diagramTypeLabel).join(", ") ||
                      "Any saved diagram"}{" "}
                    · Runtime trace: {assignment.requireRuntimeTrace ? "Required" : "Optional"}
                  </p>
                  {canSubmit && published?.state === "PASSED" && (
                    <div className="flex flex-wrap items-center gap-3" role="status">
                      <span>{t("This Lab is complete. Your passing submission is in My Submissions.", "Lab đã hoàn thành. Bạn có thể xem bài đã đạt trong Bài nộp của tôi.")}</span>
                      <Link className="text-primary underline" href={`/submissions?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}`}>
                        {t("View submissions", "Xem bài nộp")}
                      </Link>
                    </div>
                  )}
                  {canSubmit && published?.state !== "PASSED" && (client.mode !== "backend" || roadmap.isSuccess) && (
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
    </div>
  ) : null;
}

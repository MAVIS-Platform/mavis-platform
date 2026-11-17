"use client";
import { FrozenArtifacts } from "./frozen-artifacts";
import { StudioSubmissionEvidence } from "./studio-evidence";
import { useState } from "react";
import Link from "next/link";
import { useApiQuery, usePermission, useSelection, useSession } from "@/hooks/use-api";
import { useSearchParams } from "next/navigation";
import { SelectField, SearchInput, Pagination } from "@/components/shared/forms";
import { WorkspaceSelector } from "@/features/workspaces/components";
import { EmptyState, RequestState } from "@/components/shared/request-state";
import { DataTable, StatusLabel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { useLocale } from "@/lib/i18n/locale-context";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { TraceViewer, RuntimeSessionTimeline } from "@/features/runtime/components";
import { SubmissionVersionHeader, FeedbackPanel } from "./components";
import { GradingPanel, resolveSubmissionOutcome } from "./grading";
import type { Submission } from "@/types/domain";

export function filterStudentSubmissions(
  submissions: ReadonlyArray<Submission>,
  workspaceId?: string | null,
  assignmentId?: string | null,
  classAssignmentIds?: ReadonlySet<string>,
): Submission[] {
  return submissions.filter((submission) => {
    if (assignmentId && submission.assignmentId !== assignmentId) return false;
    if (!workspaceId) return true;
    if (submission.workspaceId) return submission.workspaceId === workspaceId;
    return Boolean(classAssignmentIds?.has(submission.assignmentId));
  });
}

export function Submissions() {
  const canReview = usePermission("submission:review");
  const isLecturer = useSession().data?.user?.role === "lecturer";
  return canReview ? <TeachingSubmissions isLecturer={isLecturer} /> : <MySubmissions />;
}
function MySubmissions() {
  const { t } = useLocale();
  const params = useSearchParams();
  const selection = useSelection();
  const assignmentId = params?.get("assignment") || "";
  const workspaceId = params?.get("workspace") || selection.workspaceId || "";
  const workspaces = useApiQuery("workspaces", {});
  const assignments = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  const query = useApiQuery("submissions", workspaceId ? { workspaceId } : {});
  const classAssignmentIds = new Set((assignments.data ?? []).map((item) => item.id));
  const rows = filterStudentSubmissions(
    query.data ?? [],
    workspaceId,
    assignmentId,
    classAssignmentIds,
  );
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const list = (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("Submissions & Grades", "Bài nộp & Điểm")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Track your Lab submission dossiers, Lecturer grades, and published feedback.",
              "Theo dõi hồ sơ bài nộp Lab, điểm số từ Giảng viên và phản hồi đã công bố.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!workspaceId && (workspaces.data?.length ?? 0) > 0 && <WorkspaceSelector />}
          {workspace && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/workspace-overview?workspace=${encodeURIComponent(workspace.id)}`}>
                {t("Back to class", "Quay lại lớp")}
              </Link>
            </Button>
          )}
        </div>
      </header>
      <RequestState
        query={query}
        empty={!rows.length}
        emptyMessage={
          assignmentId
            ? t(
                "No snapshot has been submitted for this Lab yet. Open your Lab workspace to submit.",
                "Chưa có bài nộp nào cho Lab này. Hãy mở Lab để hoàn thành và nộp bài.",
              )
            : t(
                "No submissions yet. Open a Lab in your class roadmap to submit your work.",
                "Chưa có bài nộp nào. Hãy mở một bài Lab trong Lộ trình Lớp để thực hiện và nộp bài.",
              )
        }
      >
        <DataTable
          caption={t("My Submissions", "Bài nộp của tôi")}
          rows={rows}
          rowKey={(s) => s.id}
          columns={[
            ...(workspaceId
              ? []
              : [
                  {
                    key: "workspace",
                    label: t("Class", "Lớp học"),
                    render: (s: Submission) => (
                      <span className="text-xs font-medium">{s.workspaceName || "—"}</span>
                    ),
                  },
                ]),
            {
              key: "lab",
              label: t("Lab", "Bài Lab"),
              render: (s: Submission) => (
                <div className="space-y-0.5">
                  <Link
                    className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    href={`/submissions/${encodeURIComponent(s.id)}`}
                  >
                    {s.labOrder ? `Lab ${String(s.labOrder).padStart(2, "0")} · ` : ""}
                    {s.assignmentTitle || s.assignmentId}
                  </Link>
                  {s.labMode && (
                    <div className="text-[11px] font-mono text-muted-foreground">{s.labMode}</div>
                  )}
                </div>
              ),
            },
            {
              key: "evidence",
              label: t("Evidence", "Minh chứng"),
              render: (s: Submission) => (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {s.courseQuizEvidence && (
                    <Badge variant="outline">
                      Quiz {s.courseQuizEvidence.correctCount}/{s.courseQuizEvidence.questionCount}
                    </Badge>
                  )}
                  {s.runtime?.studioVerified && (
                    <Badge variant="success">{t("Studio Verified", "Đã xác minh Studio")}</Badge>
                  )}
                  {(s.studentSnapshots?.length ?? 0) > 0 && (
                    <span>
                      {s.studentSnapshots?.length} {t("snapshots", "bài giải")}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: "review",
              label: t("Grade & Outcome", "Điểm & Kết quả"),
              render: (s: Submission) => <SubmissionResult submissionId={s.id} />,
            },
            {
              key: "date",
              label: t("Submitted", "Đã nộp"),
              render: (s: Submission) =>
                s.submittedAt
                  ? new Date(s.submittedAt).toLocaleString()
                  : t("Not submitted", "Chưa nộp"),
            },
            {
              key: "action",
              label: t("Action", "Thao tác"),
              render: (s: Submission) => (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/submissions/${encodeURIComponent(s.id)}`}>
                    {t("View dossier", "Xem hồ sơ")}
                  </Link>
                </Button>
              ),
            },
          ]}
        />
      </RequestState>
    </div>
  );
  return workspace ? (
    <CourseWorkspaceShell workspace={workspace} active="submissions">
      {list}
    </CourseWorkspaceShell>
  ) : (
    list
  );
}
function TeachingSubmissions({ isLecturer }: { isLecturer: boolean }) {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const params = useSearchParams();
  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const [selected, setSelected] = useState("");
  const assignments = useApiQuery("assignments", { workspaceId }, { enabled: !!workspaceId });
  const requested = selected || params.get("assignment") || "";
  const assignment = assignments.data?.find((a) => a.id === requested) ?? assignments.data?.[0];
  const resultsView = params.get("view") === "results";
  const body = workspaceId ? (
    <RequestState
      query={assignments}
      empty={!assignments.data?.length}
      emptyMessage={t(
        "No Labs in this class. Create a Lab before reviewing submissions.",
        "Lớp chưa có Lab. Hãy tạo Lab trước khi chấm bài nộp.",
      )}
    >
      {assignment && (
        <div className="space-y-4">
          {resultsView && (
            <p
              role="status"
              className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground"
            >
              {t(
                "Results view shows each submission with its published review outcome. Status filtering is not available from the current API.",
                "Chế độ Kết quả hiển thị từng bài nộp cùng kết quả chấm đã công bố. API hiện tại chưa hỗ trợ lọc theo trạng thái.",
              )}
            </p>
          )}
          <SelectField
            label={t("Assignment to review", "Lab cần chấm")}
            value={assignment.id}
            onChange={setSelected}
            options={(assignments.data ?? []).map((a) => ({ value: a.id, label: a.title }))}
          />
          <AssignmentSubmissionList
            key={`${workspaceId}:${assignment.id}`}
            workspaceId={workspaceId}
            assignmentId={assignment.id}
          />
        </div>
      )}
    </RequestState>
  ) : (
    <div className="space-y-4">
      <WorkspaceSelector />
      <EmptyState
        title={t("Choose a class", "Chọn một lớp")}
        description={t(
          "Select a class to review its Labs and student submissions.",
          "Chọn lớp để chấm Lab và bài nộp của sinh viên.",
        )}
      />
    </div>
  );
  return workspace ? (
    <CourseWorkspaceShell workspace={workspace} active="submissions" showTabs={!isLecturer}>
      {body}
    </CourseWorkspaceShell>
  ) : (
    body
  );
}
function AssignmentSubmissionList({
  workspaceId,
  assignmentId,
}: {
  workspaceId: string;
  assignmentId: string;
}) {
  const query = useApiQuery("assignmentSubmissions", { workspaceId, assignmentId });
  return (
    <RequestState
      query={query}
      empty={!query.data?.length}
      emptyMessage="No students have submitted work for this assignment yet."
    >
      <SubmissionList rows={query.data ?? []} />
    </RequestState>
  );
}
function SubmissionList({ rows }: { rows: import("@/types/domain").Submission[] }) {
  const { t } = useLocale();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const filtered = rows.filter((s) =>
    [s.studentName, s.studentEmail, s.studentId, s.assignmentTitle, s.assignmentId, s.id].some(
      (value) => value?.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  const count = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, count);
  return (
    <div className="min-w-0 space-y-4">
      <SearchInput
        label="Search submissions"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <DataTable
        caption="Submitted result versions"
        rows={filtered.slice((current - 1) * 10, current * 10)}
        rowKey={(s) => s.id}
        columns={[
          {
            key: "id",
            label: "Submission",
            render: (s) => (
              <Link
                className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-primary hover:underline"
                href={`/submissions/${encodeURIComponent(s.id)}`}
                title={s.id}
              >
                <span>#{s.id.slice(0, 8)}</span>
                <span className="font-sans text-[11px] font-medium">→</span>
              </Link>
            ),
          },
          {
            key: "assignment",
            label: "Assignment",
            render: (s) => s.assignmentTitle || s.assignmentId,
          },
          { key: "student", label: "Student", render: (s) => s.studentName || s.studentId },
          { key: "model", label: "Frozen model", render: (s) => `Revision ${s.model.revision}` },
          {
            key: "review",
            label: t("Outcome", "Kết quả"),
            render: (s) => <SubmissionResult submissionId={s.id} />,
          },
          { key: "feedback", label: t("Feedback", "Phản hồi"), render: (s) => s.feedback.length },
          {
            key: "date",
            label: t("Submitted", "Đã nộp"),
            render: (s) =>
              s.submittedAt
                ? new Date(s.submittedAt).toLocaleString()
                : t("Not submitted", "Chưa nộp"),
          },
          {
            key: "action",
            label: t("Action", "Thao tác"),
            render: (s) => (
              <Button asChild size="sm" variant="outline">
                <Link href={`/submissions/${encodeURIComponent(s.id)}`}>
                  {t("Open review", "Mở chấm")}
                </Link>
              </Button>
            ),
          },
        ]}
      />
      {count > 1 && <Pagination page={current} pageCount={count} onPageChange={setPage} />}
    </div>
  );
}
function SubmissionResult({ submissionId }: { submissionId: string }) {
  const query = useApiQuery("submissionReview", { submissionId });
  const outcome = query.data ? resolveSubmissionOutcome(query.data) : null;
  return (
    <span className="text-xs">
      {query.isError ? (
        "Review unavailable"
      ) : query.data ? (
        <>
          <StatusLabel status={query.data.status} />
          {query.data.score !== null ? ` · ${query.data.score}/100` : ""}
          {outcome && (
            <Badge className="ml-2" variant={outcome === "PASS" ? "success" : "warning"}>
              {outcome === "PASS" ? "Pass" : "Needs revision"}
            </Badge>
          )}
        </>
      ) : (
        "Loading…"
      )}
    </span>
  );
}

export function SubmissionReview({ submissionId }: { submissionId: string }) {
  const { t } = useLocale();
  const selection = useSelection();
  const canReview = usePermission("submission:review");
  const query = useApiQuery(
    "submission",
    { submissionId },
    { refreshMs: canReview ? 60000 : 15000 },
  );
  const [selected, setSelected] = useState<string | null>(null);
  const isV2Submission = Boolean(
    query.data &&
    query.data.diagramVersionId === null &&
    (query.data.studentSnapshots?.length || query.data.evidencePackageDigest),
  );
  const showLegacyTechnicalPanels = canReview && !isV2Submission;
  const backWorkspaceId = query.data?.workspaceId || selection.workspaceId;
  return (
    <RequestState query={query}>
      {query.data && (
        <div className="min-w-0 space-y-6">
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/submissions${backWorkspaceId || (canReview && query.data.assignmentId) ? `?${backWorkspaceId ? `workspace=${encodeURIComponent(backWorkspaceId)}&` : ""}${canReview && query.data.assignmentId ? `assignment=${encodeURIComponent(query.data.assignmentId)}` : ""}` : ""}`}
            >
              ← {t("Back to class submissions", "Quay lại bài nộp của lớp")}
            </Link>
          </Button>
          <GradingPanel
            key={query.data.id}
            submissionId={query.data.id}
            guidedLab={query.data.guidedLab === true}
            studentSnapshots={query.data.studentSnapshots ?? undefined}
          />
          <section id="review" className="scroll-mt-24 space-y-5">
            <SubmissionVersionHeader submission={query.data} />
            <FrozenArtifacts submission={query.data} />
            <StudioSubmissionEvidence
              key={query.data.id}
              submissionId={query.data.id}
              available={Boolean(query.data.studioEvidence)}
            />
          </section>
          {showLegacyTechnicalPanels && (
            <>
              <div
                id="submitted-graph"
                className="grid min-w-0 scroll-mt-24 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
              >
                <div className="min-w-0 overflow-x-auto">
                  <ArchitectureGraph
                    model={query.data.model}
                    selectedId={selected}
                    onSelect={setSelected}
                  />
                </div>
                <section id="submitted-analysis" className="min-w-0 scroll-mt-24">
                  <ElementDetailsPanel model={query.data.model} selectedId={selected} />
                </section>
              </div>
              {query.data.runtime ? (
                <section id="submitted-runtime" className="scroll-mt-24 space-y-5">
                  <RuntimeSessionTimeline session={query.data.runtime} />
                  <TraceViewer session={query.data.runtime} />
                </section>
              ) : (
                <section id="submitted-runtime" className="scroll-mt-24">
                  <EmptyState
                    title="Runtime evidence not submitted"
                    description="This frozen submission does not contain a runtime session."
                  />
                </section>
              )}
            </>
          )}
          <FeedbackPanel key={query.data.id} submission={query.data} selectedId={selected} />
        </div>
      )}
    </RequestState>
  );
}

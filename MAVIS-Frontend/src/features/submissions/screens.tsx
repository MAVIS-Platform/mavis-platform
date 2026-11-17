"use client";
import { FrozenArtifacts } from "./frozen-artifacts";
import { StudioSubmissionEvidence } from "./studio-evidence";
import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { useSearchParams } from "next/navigation";
import { SelectField, SearchInput, Pagination } from "@/components/shared/forms";
import { WorkspaceSelector } from "@/features/workspaces/components";
import { useWorkspaceGradebook } from "@/features/workspaces/course-access";
import { EmptyState, RequestState } from "@/components/shared/request-state";
import { DataTable, StatusLabel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { useLocale } from "@/lib/i18n/locale-context";
import { SubmissionVersionHeader } from "./components";
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
  return canReview ? <TeachingSubmissions /> : <MySubmissions />;
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
              render: (s: Submission) => <SubmissionResult submission={s} />,
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
function TeachingSubmissions() {
  const { t } = useLocale();
  const { workspaceId } = useSelection();
  const params = useSearchParams();
  const workspaces = useApiQuery("workspaces", {});
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  const [selected, setSelected] = useState("");
  const [viewMode, setViewMode] = useState<"queue" | "gradebook">(
    params.get("view") === "results" ? "gradebook" : "queue",
  );
  const [reviewStatusFilter, setReviewStatusFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const assignments = useApiQuery("assignments", { workspaceId }, { enabled: !!workspaceId });
  const requested = selected || params.get("assignment") || "";
  const assignment = assignments.data?.find((a) => a.id === requested) ?? assignments.data?.[0];

  const body = workspaceId ? (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("Grading views", "Chế độ chấm điểm")}>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "queue" ? "default" : "outline"}
            onClick={() => setViewMode("queue")}
          >
            {t("Submissions Queue", "Hàng đợi chấm bài")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "gradebook" ? "default" : "outline"}
            onClick={() => setViewMode("gradebook")}
          >
            {t("Class Gradebook Matrix", "Bảng điểm ma trận lớp")}
          </Button>
        </div>
        <div
          className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/30 p-1"
          role="group"
          aria-label={t("Quick grading filters", "Lọc nhanh bài nộp")}
        >
          {[
            { id: "ALL", status: "ALL", outcome: "ALL", label: t("All", "Tất cả") },
            {
              id: "PENDING",
              status: "PENDING",
              outcome: "ALL",
              label: t("Pending Review", "Chờ chấm"),
            },
            {
              id: "GRADED",
              status: "GRADED",
              outcome: "ALL",
              label: t("Graded", "Đã chấm"),
            },
            {
              id: "REVISION",
              status: "ALL",
              outcome: "NEEDS_REVISION",
              label: t("Needs Revision", "Cần sửa"),
            },
          ].map((pill) => {
            const active =
              reviewStatusFilter === pill.status && outcomeFilter === pill.outcome;
            return (
              <Button
                key={pill.id}
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                onClick={() => {
                  setReviewStatusFilter(pill.status);
                  setOutcomeFilter(pill.outcome);
                }}
              >
                {pill.label}
              </Button>
            );
          })}
        </div>
      </div>

      {viewMode === "gradebook" ? (
        <ClassGradebookMatrix workspaceId={workspaceId} workspaceCode={workspace?.code || workspaceId} />
      ) : (
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
              <div className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  label={t("Assignment to review", "Lab cần chấm")}
                  value={assignment.id}
                  onChange={setSelected}
                  options={(assignments.data ?? []).map((a) => ({ value: a.id, label: a.title }))}
                />
                <SelectField
                  label={t("Review status", "Trạng thái chấm")}
                  value={reviewStatusFilter}
                  onChange={setReviewStatusFilter}
                  options={[
                    { value: "ALL", label: t("All statuses", "Tất cả trạng thái") },
                    { value: "PENDING", label: t("Pending review", "Chờ chấm") },
                    { value: "DRAFT", label: t("Draft", "Bản nháp") },
                    { value: "GRADED", label: t("Graded", "Đã chấm") },
                    { value: "RETURNED", label: t("Returned", "Trả sửa lại") },
                  ]}
                />
                <SelectField
                  label={t("Outcome", "Kết quả")}
                  value={outcomeFilter}
                  onChange={setOutcomeFilter}
                  options={[
                    { value: "ALL", label: t("All outcomes", "Tất cả kết quả") },
                    { value: "PASSED", label: t("Passed", "Đạt") },
                    { value: "NEEDS_REVISION", label: t("Needs revision", "Cần sửa") },
                    { value: "PENDING", label: t("Pending", "Chưa có kết quả") },
                  ]}
                />
              </div>
              <AssignmentSubmissionList
                key={`${workspaceId}:${assignment.id}:${reviewStatusFilter}:${outcomeFilter}`}
                workspaceId={workspaceId}
                assignmentId={assignment.id}
                reviewStatus={reviewStatusFilter}
                labOutcome={outcomeFilter}
              />
            </div>
          )}
        </RequestState>
      )}
    </div>
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
    <CourseWorkspaceShell workspace={workspace} active="submissions">
      {body}
    </CourseWorkspaceShell>
  ) : (
    body
  );
}

function ClassGradebookMatrix({
  workspaceId,
  workspaceCode,
}: {
  workspaceId: string;
  workspaceCode: string;
}) {
  const { t } = useLocale();
  const gradebook = useWorkspaceGradebook(workspaceId);

  const exportCsv = () => {
    const data = gradebook.data;
    if (!data) return;
    const escape = (val: string) => `"${val.replaceAll('"', '""')}"`;
    const headers = [
      "Student",
      "Email",
      "Passed Labs",
      "Average Score",
      ...data.labs.map((lab) => lab.title),
    ];
    const lines = [
      headers.map(escape).join(","),
      ...data.students.map((student) => {
        const cellMap = new Map(student.cells.map((c) => [c.assignmentId, c]));
        return [
          student.fullName,
          student.email,
          `${student.passedLabs}/${data.labs.length}`,
          student.averageScore !== null ? String(student.averageScore) : "",
          ...data.labs.map((lab) => {
            const cell = cellMap.get(lab.assignmentId);
            if (!cell) return "";
            const score = cell.reviewScore !== null ? `${cell.reviewScore}/100` : "—";
            const outcome = cell.labOutcome ?? (cell.submissionId ? "PENDING" : "NOT_SUBMITTED");
            const quiz = cell.quizBestScore !== null ? `Quiz ${cell.quizBestScore}%` : "No quiz";
            return `${score} (${outcome} · ${quiz})`;
          }),
        ]
          .map(escape)
          .join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspaceCode.toLowerCase().replace(/[^a-z0-9-_]+/g, "-")}-gradebook.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <RequestState
      query={gradebook}
      empty={!gradebook.data?.students.length}
      emptyMessage={t(
        "No enrolled students in this class yet.",
        "Chưa có sinh viên nào ghi danh trong lớp này.",
      )}
    >
      {gradebook.data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {gradebook.data.students.length} {t("students", "sinh viên")} ·{" "}
              {gradebook.data.labs.length} {t("Labs", "Lab")}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 size-4" aria-hidden="true" />
              {t("Export Gradebook CSV", "Xuất CSV bảng điểm")}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-muted/40 px-4 py-3 font-semibold">
                    {t("Student", "Sinh viên")}
                  </th>
                  <th className="px-3 py-3 font-semibold">{t("Progress", "Tiến độ")}</th>
                  <th className="px-3 py-3 font-semibold">{t("Avg Score", "Điểm TB")}</th>
                  {gradebook.data.labs.map((lab) => (
                    <th key={lab.assignmentId} className="min-w-36 px-3 py-3 font-semibold">
                      {lab.labOrder ? `Lab ${String(lab.labOrder).padStart(2, "0")} · ` : ""}
                      {lab.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {gradebook.data.students.map((student) => {
                  const cellMap = new Map(student.cells.map((c) => [c.assignmentId, c]));
                  return (
                    <tr key={student.studentId} className="hover:bg-muted/20">
                      <td className="sticky left-0 bg-card px-4 py-3">
                        <p className="font-medium text-foreground">{student.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">{student.email}</p>
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {student.passedLabs}/{gradebook.data.labs.length}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {student.averageScore !== null ? `${student.averageScore}` : "—"}
                      </td>
                      {gradebook.data.labs.map((lab) => {
                        const cell = cellMap.get(lab.assignmentId);
                        if (!cell) return <td key={lab.assignmentId} className="px-3 py-3">—</td>;
                        const outcomeVariant =
                          cell.labOutcome === "PASSED"
                            ? "success"
                            : cell.labOutcome === "NEEDS_REVISION"
                              ? "warning"
                              : "secondary";
                        return (
                          <td key={lab.assignmentId} className="px-3 py-3 align-top">
                            {cell.submissionId ? (
                              <Link
                                href={`/submissions/${encodeURIComponent(cell.submissionId)}`}
                                className="inline-flex flex-col gap-1 hover:underline"
                              >
                                <Badge variant={outcomeVariant}>
                                  {cell.reviewScore !== null
                                    ? `${cell.reviewScore}/100`
                                    : cell.labOutcome === "PASSED"
                                      ? "PASS"
                                      : cell.reviewStatus ?? "PENDING"}
                                </Badge>
                                {cell.quizBestScore !== null && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Quiz: {cell.quizBestScore}%
                                  </span>
                                )}
                              </Link>
                            ) : (
                              <div className="flex flex-col gap-1 text-muted-foreground">
                                <span>{t("Not submitted", "Chưa nộp")}</span>
                                {cell.quizBestScore !== null && (
                                  <span className="text-[11px]">Quiz: {cell.quizBestScore}%</span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </RequestState>
  );
}

function AssignmentSubmissionList({
  workspaceId,
  assignmentId,
  reviewStatus,
  labOutcome,
}: {
  workspaceId: string;
  assignmentId: string;
  reviewStatus: string;
  labOutcome: string;
}) {
  const { t } = useLocale();
  const query = useApiQuery("assignmentSubmissions", {
    workspaceId,
    assignmentId,
    ...(reviewStatus !== "ALL" ? { reviewStatus } : {}),
    ...(labOutcome !== "ALL" ? { labOutcome } : {}),
  });
  const rows = query.data ?? [];
  const pendingCount = rows.filter(
    (s) => !s.reviewStatus || s.reviewStatus === "PENDING" || s.reviewStatus === "DRAFT",
  ).length;
  const passedCount = rows.filter((s) => s.labOutcome === "PASSED").length;
  const revisionCount = rows.filter((s) => s.labOutcome === "NEEDS_REVISION").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-3.5">
          <p className="text-xs text-muted-foreground">{t("Matching submissions", "Tổng bài khớp lọc")}</p>
          <p className="mt-1 text-xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-3.5">
          <p className="text-xs text-muted-foreground">{t("Pending / Draft", "Chờ chấm / Nháp")}</p>
          <p className="mt-1 text-xl font-semibold">{pendingCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-3.5">
          <p className="text-xs text-muted-foreground">{t("Passed", "Đã đạt")}</p>
          <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
            {passedCount}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3.5">
          <p className="text-xs text-muted-foreground">{t("Needs revision", "Cần sửa lại")}</p>
          <p className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">
            {revisionCount}
          </p>
        </div>
      </div>

      <RequestState
        query={query}
        empty={!rows.length}
        emptyMessage={t(
          "No submissions match the selected filters for this Lab.",
          "Chưa có bài nộp nào khớp bộ lọc cho Lab này.",
        )}
      >
        <SubmissionList rows={rows} />
      </RequestState>
    </div>
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
            render: (s) => <SubmissionResult submission={s} />,
          },
          {
            key: "reviewer",
            label: t("Graded by", "Giảng viên chấm"),
            render: (s) => (
              <span className="text-xs text-muted-foreground">{s.gradedByName || "—"}</span>
            ),
          },
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
            render: (s) => {
              const isPending =
                !s.reviewStatus || s.reviewStatus === "PENDING" || s.reviewStatus === "DRAFT";
              return (
                <Button
                  asChild
                  size="sm"
                  variant={isPending ? "default" : "outline"}
                  className={isPending ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}
                >
                  <Link href={`/submissions/${encodeURIComponent(s.id)}`}>
                    {isPending
                      ? t("Grade Now", "Chấm Điểm Ngay")
                      : t("Open review", "Xem & Sửa Điểm")}
                  </Link>
                </Button>
              );
            },
          },
        ]}
      />
      {count > 1 && <Pagination page={current} pageCount={count} onPageChange={setPage} />}
    </div>
  );
}
function SubmissionResult({ submission }: { submission: Submission }) {
  if (submission.reviewStatus !== undefined && submission.reviewStatus !== null) {
    const outcome = resolveSubmissionOutcome({
      status: submission.reviewStatus,
      score: submission.reviewScore ?? null,
      labOutcome:
        submission.labOutcome === "PASSED" ||
        submission.labOutcome === "NEEDS_REVISION" ||
        submission.labOutcome === "PENDING"
          ? submission.labOutcome
          : null,
    });
    return (
      <span className="text-xs">
        <StatusLabel status={submission.reviewStatus} />
        {submission.reviewScore !== null && submission.reviewScore !== undefined
          ? ` · ${submission.reviewScore}/100`
          : ""}
        {outcome && (
          <Badge className="ml-2" variant={outcome === "PASS" ? "success" : "warning"}>
            {outcome === "PASS" ? "Pass" : "Needs revision"}
          </Badge>
        )}
      </span>
    );
  }
  return <SubmissionResultQuery submissionId={submission.id} />;
}

function SubmissionResultQuery({ submissionId }: { submissionId: string }) {
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
  const backWorkspaceId = query.data?.workspaceId || selection.workspaceId;
  return (
    <RequestState query={query}>
      {query.data && (
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/submissions${backWorkspaceId || (canReview && query.data.assignmentId) ? `?${backWorkspaceId ? `workspace=${encodeURIComponent(backWorkspaceId)}&` : ""}${canReview && query.data.assignmentId ? `assignment=${encodeURIComponent(query.data.assignmentId)}` : ""}` : ""}`}
              >
                ← {t("Back to class submissions", "Quay lại bài nộp của lớp")}
              </Link>
            </Button>
          </div>
          <div
            className={
              canReview
                ? "grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,1fr)] xl:items-start"
                : "min-w-0 space-y-6"
            }
          >
            <section id="review" className="min-w-0 scroll-mt-24 space-y-5">
              <SubmissionVersionHeader submission={query.data} />
              <FrozenArtifacts submission={query.data} />
              <StudioSubmissionEvidence
                key={query.data.id}
                submissionId={query.data.id}
                available={Boolean(query.data.studioEvidence)}
              />
            </section>
            <aside className="min-w-0 xl:sticky xl:top-6">
              <GradingPanel
                key={query.data.id}
                submissionId={query.data.id}
                guidedLab={query.data.guidedLab === true}
                studentSnapshots={query.data.studentSnapshots ?? undefined}
              />
            </aside>
          </div>
        </div>
      )}
    </RequestState>
  );
}

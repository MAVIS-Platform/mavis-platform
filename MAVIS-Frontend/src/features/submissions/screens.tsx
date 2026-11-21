"use client";
import { FrozenArtifacts } from "./frozen-artifacts";
import { StudioSubmissionEvidence } from "./studio-evidence";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { useSearchParams } from "next/navigation";
import { SelectField, SearchInput, Pagination } from "@/components/shared/forms";
import { WorkspaceSelector } from "@/features/workspaces/components";
import { useCourseEssays, useWorkspaceGradebook } from "@/features/workspaces/course-access";
import {
  formatCourseLabTitle,
  formatLabModeLabel,
  formatTenScaleScore,
  toTenScaleScore,
} from "@/lib/format/course-display";
import { LecturerEssayRow } from "@/features/courses/course-essay-panel";
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
  const urlWorkspaceId = params?.get("workspace") || "";
  const [selectedClassFilter, setSelectedClassFilter] = useState("");
  const workspaceId = urlWorkspaceId || selectedClassFilter || "";
  const workspaces = useApiQuery("workspaces", {});
  const assignments = useApiQuery(
    "assignments",
    { workspaceId: workspaceId || selection.workspaceId },
    { enabled: Boolean(workspaceId || selection.workspaceId) },
  );
  const query = useApiQuery("submissions", workspaceId ? { workspaceId } : {});
  const classAssignmentIds = new Set((assignments.data ?? []).map((item) => item.id));
  const rows = filterStudentSubmissions(
    query.data ?? [],
    workspaceId || undefined,
    assignmentId || undefined,
    classAssignmentIds,
  );
  const workspace = workspaces.data?.find((item) => item.id === (urlWorkspaceId || workspaceId));
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
        <div className="flex flex-wrap items-end gap-2">
          {!urlWorkspaceId && (workspaces.data?.length ?? 0) > 0 && (
            <div className="min-w-52">
              <SelectField
                label={t("Class filter", "Lọc theo lớp")}
                value={selectedClassFilter}
                onChange={setSelectedClassFilter}
                options={[
                  { value: "", label: t("All classes", "Tất cả lớp học") },
                  ...(workspaces.data ?? []).map((w) => ({
                    value: w.id,
                    label: w.code ? `${w.code} · ${w.name}` : w.name,
                  })),
                ]}
              />
            </div>
          )}
          {workspace && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/roadmap?workspace=${encodeURIComponent(workspace.id)}`}>
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
                    {formatCourseLabTitle(s.assignmentTitle, s.labOrder, s.assignmentId)}
                  </Link>
                  {s.labMode && (
                    <div className="text-[11px] text-muted-foreground">
                      {formatLabModeLabel(s.labMode, t)}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "evidence",
              label: t("Evidence", "Minh chứng"),
              render: (s: Submission) => (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {s.courseQuizEvidence &&
                    s.courseQuizEvidence.correctCount != null &&
                    s.courseQuizEvidence.questionCount != null && (
                      <Badge variant="outline">
                        Quiz {s.courseQuizEvidence.correctCount}/
                        {s.courseQuizEvidence.questionCount}
                      </Badge>
                    )}
                  {s.courseQuizEvidence?.status === "NOT_REQUIRED" && (
                    <Badge variant="outline">{t("Theory Only", "Chỉ lý thuyết")}</Badge>
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
  const initialAssignment = params.get("assignment");
  const [selected, setSelected] = useState(initialAssignment || "ALL");
  const [viewMode, setViewMode] = useState<"queue" | "essays" | "gradebook">(
    params.get("view") === "results" ? "gradebook" : "queue",
  );
  const requestedStatus = (params.get("status") ?? "").toUpperCase();
  const [reviewStatusFilter, setReviewStatusFilter] = useState(
    ["PENDING", "DRAFT", "GRADED", "RETURNED"].includes(requestedStatus) ? requestedStatus : "ALL",
  );
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const assignments = useApiQuery("assignments", { workspaceId }, { enabled: !!workspaceId });
  const sortedAssignments = useMemo(() => {
    const raw = assignments.data ?? [];
    const hasOrdered = raw.some((a) => typeof a.labOrder === "number" && a.labOrder > 0);
    const activeOnly = hasOrdered
      ? raw.filter((a) => typeof a.labOrder === "number" && a.labOrder > 0)
      : raw;
    return [...activeOnly].sort(
      (a, b) => (a.labOrder ?? Number.MAX_SAFE_INTEGER) - (b.labOrder ?? Number.MAX_SAFE_INTEGER),
    );
  }, [assignments.data]);
  const selectedAssignmentId =
    selected === "ALL"
      ? "ALL"
      : sortedAssignments.find((a) => a.id === selected)?.id ?? "ALL";
  const allClassSubs = useApiQuery(
    "workspaceSubmissions",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  const counts = useMemo(() => {
    const base = allClassSubs.data ?? [];
    const scoped =
      selectedAssignmentId === "ALL"
        ? base
        : base.filter((s) => s.assignmentId === selectedAssignmentId);
    return {
      total: scoped.length,
      pending: scoped.filter((s) => !s.reviewStatus || s.reviewStatus === "PENDING").length,
      graded: scoped.filter((s) => s.reviewStatus === "GRADED").length,
      needsRevision: scoped.filter((s) => s.labOutcome === "NEEDS_REVISION").length,
    };
  }, [allClassSubs.data, selectedAssignmentId]);

  const body = workspaceId ? (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted/40 p-1"
          role="tablist"
          aria-label={t("Grading views", "Chế độ chấm điểm")}
        >
          {(
            [
              {
                id: "pending",
                label: `${t("Pending", "Chờ chấm")}${allClassSubs.isSuccess ? ` (${counts.pending})` : ""}`,
                active: viewMode === "queue" && reviewStatusFilter === "PENDING",
                onClick: () => {
                  setViewMode("queue");
                  setReviewStatusFilter("PENDING");
                  setOutcomeFilter("ALL");
                },
              },
              {
                id: "graded",
                label: `${t("Graded", "Đã chấm")}${allClassSubs.isSuccess ? ` (${counts.graded})` : ""}`,
                active: viewMode === "queue" && reviewStatusFilter === "GRADED",
                onClick: () => {
                  setViewMode("queue");
                  setReviewStatusFilter("GRADED");
                  setOutcomeFilter("ALL");
                },
              },
              {
                id: "all",
                label: `${t("All submissions", "Tất cả")}${allClassSubs.isSuccess ? ` (${counts.total})` : ""}`,
                active: viewMode === "queue" && reviewStatusFilter === "ALL",
                onClick: () => {
                  setViewMode("queue");
                  setReviewStatusFilter("ALL");
                  setOutcomeFilter("ALL");
                },
              },
              {
                id: "essays",
                label: t("Essays", "Tự luận"),
                active: viewMode === "essays",
                onClick: () => setViewMode("essays"),
              },
              {
                id: "gradebook",
                label: t("Gradebook", "Bảng điểm"),
                active: viewMode === "gradebook",
                onClick: () => setViewMode("gradebook"),
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.active}
              onClick={item.onClick}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                item.active
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {viewMode === "queue" && (
          <button
            type="button"
            aria-pressed={outcomeFilter === "NEEDS_REVISION"}
            onClick={() => {
              setReviewStatusFilter("ALL");
              setOutcomeFilter(outcomeFilter === "NEEDS_REVISION" ? "ALL" : "NEEDS_REVISION");
            }}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              outcomeFilter === "NEEDS_REVISION"
                ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {t("Needs revision", "Cần sửa")}
            {allClassSubs.isSuccess ? ` (${counts.needsRevision})` : ""}
          </button>
        )}
      </div>

      {viewMode === "essays" ? (
        <CourseEssaysGradingPanel workspaceId={workspaceId} />
      ) : viewMode === "gradebook" ? (
        <ClassGradebookMatrix workspaceId={workspaceId} workspaceCode={workspace?.code || workspaceId} />
      ) : (
        <RequestState
          query={assignments}
          empty={!sortedAssignments.length}
          emptyMessage={t(
            "No Labs in this class. Create a Lab before reviewing submissions.",
            "Lớp chưa có Lab. Hãy tạo Lab trước khi chấm bài nộp.",
          )}
        >
          {sortedAssignments.length > 0 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  label={t("Assignment to review", "Lab cần chấm")}
                  value={selectedAssignmentId}
                  onChange={setSelected}
                  options={[
                    { value: "ALL", label: t("All active Labs", "Tất cả Lab") },
                    ...sortedAssignments.map((a) => ({
                      value: a.id,
                      label: formatCourseLabTitle(a.title, a.labOrder, a.id),
                    })),
                  ]}
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
                key={`${workspaceId}:${selectedAssignmentId}:${reviewStatusFilter}:${outcomeFilter}`}
                workspaceId={workspaceId}
                assignmentId={selectedAssignmentId}
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

function CourseEssaysGradingPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const essays = useCourseEssays(workspaceId);
  const rows = essays.data ?? [];
  return (
    <RequestState
      query={essays}
      empty={!rows.length}
      emptyMessage={t(
        "No chapter essays have been submitted in this class yet.",
        "Chưa có sinh viên nào nộp bài Tự luận theo chương trong lớp này.",
      )}
    >
      <div className="space-y-4">
        {rows.map((submission) => (
          <LecturerEssayRow key={submission.id} workspaceId={workspaceId} submission={submission} />
        ))}
      </div>
    </RequestState>
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
      ...data.labs.map((lab) => formatCourseLabTitle(lab.title, lab.labOrder, lab.assignmentId)),
    ];
    const lines = [
      headers.map(escape).join(","),
      ...data.students.map((student) => {
        const cellMap = new Map(student.cells.map((c) => [c.assignmentId, c]));
        return [
          student.fullName,
          student.email,
          `${student.passedLabs ?? 0}/${data.labs.length}`,
          student.averageScore !== null
            ? formatTenScaleScore(student.averageScore, student.averageScoreTenScale)
            : "",
          ...data.labs.map((lab) => {
            const cell = cellMap.get(lab.assignmentId);
            if (!cell) return "";
            const score =
              cell.reviewScore !== null
                ? formatTenScaleScore(cell.reviewScore, cell.reviewScoreTenScale)
                : "—";
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
              {gradebook.data.students.length}{" "}
              {gradebook.data.students.length === 1
                ? t("student", "sinh viên")
                : t("students", "sinh viên")}{" "}
              · {gradebook.data.labs.length} {t("Labs", "Lab")}
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
                      {formatCourseLabTitle(lab.title, lab.labOrder, lab.assignmentId)}
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
                        {student.passedLabs ?? 0}/{gradebook.data.labs.length}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {student.averageScore !== null
                          ? formatTenScaleScore(student.averageScore, student.averageScoreTenScale)
                          : "—"}
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
                                    ? formatTenScaleScore(cell.reviewScore, cell.reviewScoreTenScale)
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
  const isAll = assignmentId === "ALL";
  const filters = {
    ...(reviewStatus !== "ALL" ? { reviewStatus } : {}),
    ...(labOutcome !== "ALL" ? { labOutcome } : {}),
  };
  const workspaceQuery = useApiQuery(
    "workspaceSubmissions",
    { workspaceId, ...filters },
    { enabled: isAll && Boolean(workspaceId) },
  );
  const singleLabQuery = useApiQuery(
    "assignmentSubmissions",
    { workspaceId, assignmentId, ...filters },
    { enabled: !isAll && Boolean(workspaceId) && Boolean(assignmentId) },
  );
  const query = isAll ? workspaceQuery : singleLabQuery;
  const rows = query.data ?? [];

  return (
    <RequestState
      query={query}
      empty={!rows.length}
      emptyMessage={
        isAll
          ? t(
              "No submissions match the selected filters in this class.",
              "Chưa có bài nộp nào khớp bộ lọc trong lớp này.",
            )
          : t(
              "No submissions match the selected filters for this Lab.",
              "Chưa có bài nộp nào khớp bộ lọc cho Lab này.",
            )
      }
    >
      <SubmissionList rows={rows} />
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
        caption={t("Submitted result versions", "Danh sách hồ sơ bài nộp")}
        rows={filtered.slice((current - 1) * 10, current * 10)}
        rowKey={(s) => s.id}
        columns={[
          {
            key: "id",
            label: t("Submission", "Bài nộp"),
            render: (s) => (
              <Link
                className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs font-semibold text-primary hover:underline"
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
            label: t("Lab", "Bài Lab"),
            render: (s) => (
              <span className="line-clamp-2 max-w-44 text-xs font-medium">
                {formatCourseLabTitle(s.assignmentTitle, s.labOrder, s.assignmentId)}
              </span>
            ),
          },
          {
            key: "student",
            label: t("Student", "Sinh viên"),
            render: (s) => (
              <span className="block max-w-36 truncate text-xs">
                {s.studentName || s.studentId}
              </span>
            ),
          },
          {
            key: "model",
            label: t("Model", "Mô hình"),
            render: (s) => (
              <span className="whitespace-nowrap font-mono text-xs">Rev {s.model.revision}</span>
            ),
          },
          {
            key: "review",
            label: t("Outcome", "Kết quả"),
            render: (s) => <SubmissionResult submission={s} />,
          },
          {
            key: "reviewer",
            label: t("Graded by", "Giảng viên chấm"),
            render: (s) => (
              <span className="block max-w-28 truncate text-xs text-muted-foreground">
                {s.gradedByName || "—"}
              </span>
            ),
          },
          {
            key: "date",
            label: t("Submitted", "Đã nộp"),
            render: (s) => (
              <span className="whitespace-nowrap text-xs">
                {s.submittedAt
                  ? new Date(s.submittedAt).toLocaleString()
                  : t("Not submitted", "Chưa nộp")}
              </span>
            ),
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
                  className={
                    isPending
                      ? "whitespace-nowrap bg-indigo-600 text-white hover:bg-indigo-700"
                      : "whitespace-nowrap"
                  }
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
  const { t } = useLocale();
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
          ? ` · ${formatTenScaleScore(submission.reviewScore, submission.reviewScoreTenScale)}`
          : ""}
        {outcome && (
          <Badge className="ml-2 whitespace-nowrap" variant={outcome === "PASS" ? "success" : "warning"}>
            {outcome === "PASS" ? t("Pass", "Đạt") : t("Needs revision", "Cần chỉnh sửa")}
          </Badge>
        )}
      </span>
    );
  }
  return <SubmissionResultQuery submissionId={submission.id} />;
}

function SubmissionResultQuery({ submissionId }: { submissionId: string }) {
  const { t } = useLocale();
  const query = useApiQuery("submissionReview", { submissionId });
  const outcome = query.data ? resolveSubmissionOutcome(query.data) : null;
  return (
    <span className="text-xs">
      {query.isError ? (
        t("Review unavailable", "Không thể tải đánh giá")
      ) : query.data ? (
        <>
          <StatusLabel status={query.data.status} />
          {query.data.score !== null ? ` · ${formatTenScaleScore(query.data.score)}` : ""}
          {outcome && (
            <Badge className="ml-2 whitespace-nowrap" variant={outcome === "PASS" ? "success" : "warning"}>
              {outcome === "PASS" ? t("Pass", "Đạt") : t("Needs revision", "Cần chỉnh sửa")}
            </Badge>
          )}
        </>
      ) : (
        t("Loading…", "Đang tải…")
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
  const pendingQueue = useApiQuery(
    "workspaceSubmissions",
    { workspaceId: backWorkspaceId, reviewStatus: "PENDING" },
    { enabled: canReview && Boolean(backWorkspaceId) },
  );
  const otherPending = (pendingQueue.data ?? []).filter((item) => item.id !== submissionId);
  const nextPending = otherPending[0] ?? null;
  const backParams = new URLSearchParams();
  if (backWorkspaceId) backParams.set("workspace", backWorkspaceId);
  if (canReview && query.data?.assignmentId) {
    backParams.set("assignment", query.data.assignmentId);
  }
  const backQuery = backParams.toString();
  const backHref = backQuery ? `/submissions?${backQuery}` : "/submissions";
  return (
    <RequestState query={query}>
      {query.data && (
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild size="sm" variant="outline">
              <Link href={backHref}>
                ← {t("Back to class submissions", "Quay lại bài nộp của lớp")}
              </Link>
            </Button>
            {canReview && nextPending && (
              <Button
                asChild
                size="sm"
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <Link href={`/submissions/${encodeURIComponent(nextPending.id)}`}>
                  {t(
                    `Next pending (${otherPending.length}) →`,
                    `Bài chờ chấm tiếp theo (${otherPending.length}) →`,
                  )}
                </Link>
              </Button>
            )}
            {canReview && pendingQueue.isSuccess && !nextPending && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {t("No other pending submissions", "Không còn bài chờ chấm khác")}
              </span>
            )}
          </div>
          <div
            className={
              canReview
                ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] lg:items-start"
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
            <aside className="min-w-0 lg:sticky lg:top-20">
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

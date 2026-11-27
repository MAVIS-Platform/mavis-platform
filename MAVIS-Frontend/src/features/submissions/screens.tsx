"use client";
import { FrozenArtifacts } from "./frozen-artifacts";
import { StudioSubmissionEvidence } from "./studio-evidence";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { useSearchParams } from "next/navigation";
import { SelectField, SearchInput, Pagination } from "@/components/shared/forms";
import { WorkspaceSelector } from "@/features/workspaces/components";
import {
  usePublishedCourse,
  useWorkspaceGradebook,
} from "@/features/workspaces/course-access";
import {
  formatCourseLabTitle,
  formatLabModeLabel,
  formatTenScaleScore,
  toTenScaleScore,
} from "@/lib/format/course-display";
import { formatLocalizedDate, formatLocalizedDateTime } from "@/lib/format/date-time";
import { EmptyState, RequestState } from "@/components/shared/request-state";
import { DataTable, DetailPanel, StatusBadge, StatusLabel } from "@/components/shared/data";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { ScreenHelpTrigger } from "@/components/shared/screen-guided-tour";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseWorkspaceShell } from "@/features/courses/course-workspace-shell";
import { useLocale } from "@/lib/i18n/locale-context";
import { stripLegacySubmissionNoise } from "./submission-text";
import { GradingPanel, resolveSubmissionOutcome } from "./grading";
import type { Submission } from "@/types/domain";
import { lecturerCourseAccess } from "@/features/lecturer/application/course-access-policy";

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
  const { locale, t } = useLocale();
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
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="mb-2">
            {workspace ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/roadmap?workspace=${encodeURIComponent(workspace.id)}`}>
                  <ArrowLeft className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("Back to class", "Quay lại lớp")}
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/courses">
                  <ArrowLeft className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("Back to My Courses", "Quay lại Khóa học của tôi")}
                </Link>
              </Button>
            )}
          </div>
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
        <div className="space-y-3 sm:hidden">
          {rows.map((s) => (
            <article key={s.id} className="space-y-2.5 rounded-xl border bg-card p-3.5 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  {!workspaceId && s.workspaceName && (
                    <p className="truncate text-[11px] font-medium text-muted-foreground">
                      {s.workspaceName}
                    </p>
                  )}
                  <Link
                    className="block font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    href={`/submissions/${encodeURIComponent(s.id)}`}
                  >
                    {formatCourseLabTitle(s.assignmentTitle, s.labOrder, s.assignmentId)}
                  </Link>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={`/submissions/${encodeURIComponent(s.id)}`}>
                    {t("View dossier", "Xem hồ sơ")}
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <SubmissionResult submission={s} />
                <span className="text-[11px] text-muted-foreground">
                  {s.submittedAt
                    ? formatLocalizedDate(s.submittedAt, locale)
                    : t("Not submitted", "Chưa nộp")}
                </span>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden sm:block">
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
                  {s.courseQuizEvidence?.status === "NOT_REQUIRED" &&
                    s.labMode !== "THEORY_QUIZ_STUDIO" &&
                    !s.runtime?.studioVerified &&
                    !s.studioEvidence && (
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
                  ? formatLocalizedDateTime(s.submittedAt, locale)
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
        </div>
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
  const courseAccess = lecturerCourseAccess(workspace?.status);
  const initialAssignment = params.get("assignment");
  const [selected, setSelected] = useState(initialAssignment || "ALL");
  const [viewMode, setViewMode] = useState<"queue" | "gradebook">(
    params.get("view") === "results" ? "gradebook" : "queue",
  );
  const requestedStatus = (params.get("status") ?? "").toUpperCase();
  const [reviewStatusFilter, setReviewStatusFilter] = useState(
    ["PENDING", "DRAFT", "GRADED"].includes(requestedStatus) ? requestedStatus : "ALL",
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
    selected === "ALL" ? "ALL" : (sortedAssignments.find((a) => a.id === selected)?.id ?? "ALL");
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
      needsRevision: scoped.filter((s) => s.labOutcome === "NEEDS_REVISION").length,
    };
  }, [allClassSubs.data, selectedAssignmentId]);

  const body = workspaceId ? (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted/40 p-1"
          role="tablist"
          aria-label={t("Grading views", "Chế độ chấm điểm")}
        >
          {(
            [
              {
                id: "all",
                label: `${t("All submissions", "Tất cả")}${allClassSubs.isSuccess ? ` (${counts.total})` : ""}`,
                active: viewMode === "queue",
                onClick: () => {
                  setViewMode("queue");
                  setReviewStatusFilter("ALL");
                  setOutcomeFilter("ALL");
                },
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

      {!courseAccess.canManageGrades ? (
        <ClassGradebookMatrix
          workspaceId={workspaceId}
          workspaceCode={workspace?.code || workspaceId}
        />
      ) : viewMode === "gradebook" ? (
        <ClassGradebookMatrix
          workspaceId={workspaceId}
          workspaceCode={workspace?.code || workspaceId}
        />
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
              <div className="grid gap-3 sm:grid-cols-2">
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

export function escapeGradebookCsvCell(val: string): string {
  const safe = /^[=+\-@\t\r]/.test(val) ? `'${val}` : val;
  return `"${safe.replaceAll('"', '""')}"`;
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
    const headers = [
      "Student",
      "Email",
      "Passed Labs",
      "Average Score",
      ...data.labs.map((lab) => formatCourseLabTitle(lab.title, lab.labOrder, lab.assignmentId)),
    ];
    const lines = [
      headers.map(escapeGradebookCsvCell).join(","),
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
            const quiz = cell.quizBestScore !== null ? `Quiz ${cell.quizBestScore}%` : null;
            return quiz ? `${score} (${outcome} · ${quiz})` : `${score} (${outcome})`;
          }),
        ]
          .map(escapeGradebookCsvCell)
          .join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspaceCode.toLowerCase().replace(/[^a-z0-9-_]+/g, "-")}-gradebook.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
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
        <div className="min-w-0 max-w-full space-y-4">
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
          <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-muted/40 px-3 py-2.5 font-semibold">
                    {t("Student", "Sinh viên")}
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-2.5 font-semibold">
                    {t("Progress", "Tiến độ")}
                  </th>
                  <th className="whitespace-nowrap px-2.5 py-2.5 font-semibold">
                    {t("Avg Score", "Điểm TB")}
                  </th>
                  {gradebook.data.labs.map((lab) => (
                    <th key={lab.assignmentId} className="min-w-28 px-2.5 py-2.5 font-semibold">
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
                      <td className="sticky left-0 max-w-44 bg-card px-3 py-2.5">
                        <p className="truncate font-medium text-foreground">{student.fullName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {student.email}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 font-medium">
                        {student.passedLabs ?? 0}/{gradebook.data.labs.length}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 font-semibold">
                        {student.averageScore !== null
                          ? formatTenScaleScore(student.averageScore, student.averageScoreTenScale)
                          : "—"}
                      </td>
                      {gradebook.data.labs.map((lab) => {
                        const cell = cellMap.get(lab.assignmentId);
                        if (!cell)
                          return (
                            <td key={lab.assignmentId} className="px-2.5 py-2.5">
                              —
                            </td>
                          );
                        const outcomeVariant =
                          cell.labOutcome === "PASSED"
                            ? "success"
                            : cell.labOutcome === "NEEDS_REVISION"
                              ? "warning"
                              : "secondary";
                        return (
                          <td key={lab.assignmentId} className="px-2.5 py-2.5 align-top">
                            {cell.submissionId ? (
                              <Link
                                href={`/submissions/${encodeURIComponent(cell.submissionId)}`}
                                className="inline-flex flex-col gap-1 hover:underline"
                              >
                                <Badge variant={outcomeVariant}>
                                  {cell.reviewScore !== null
                                    ? formatTenScaleScore(
                                        cell.reviewScore,
                                        cell.reviewScoreTenScale,
                                      )
                                    : cell.labOutcome === "PASSED"
                                      ? t("Passed", "Đạt")
                                      : cell.reviewStatus === "PENDING" || !cell.reviewStatus
                                        ? t("Pending", "Chờ chấm")
                                        : cell.reviewStatus}
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
  const { locale, t } = useLocale();
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
        label={t("Search submissions", "Tìm kiếm bài nộp")}
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
              <span className="line-clamp-2 max-w-36 text-xs font-medium">
                {formatCourseLabTitle(s.assignmentTitle, s.labOrder, s.assignmentId)}
              </span>
            ),
          },
          {
            key: "student",
            label: t("Student", "Sinh viên"),
            render: (s) => (
              <span className="block max-w-32 truncate text-xs">
                {s.studentName || s.studentId}
              </span>
            ),
          },
          {
            key: "review",
            label: t("Outcome", "Kết quả"),
            render: (s) => <SubmissionResult submission={s} />,
          },
          {
            key: "date",
            label: t("Submitted", "Đã nộp"),
            render: (s) => (
              <span className="block max-w-28 text-xs leading-4">
                {s.submittedAt
                  ? formatLocalizedDateTime(s.submittedAt, locale)
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
          <Badge
            className="ml-2 whitespace-nowrap"
            variant={outcome === "PASS" ? "success" : "warning"}
          >
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
            <Badge
              className="ml-2 whitespace-nowrap"
              variant={outcome === "PASS" ? "success" : "warning"}
            >
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

function formatReviewTimestamp(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(locale === "vi" ? { hour12: false } : {}),
  });
}

function formatWrittenBlockTitle(rawTitle: string | null | undefined, locale: string): string {
  const trimmed = (rawTitle || "").trim();
  if (!trimmed || /^theory explanation$/i.test(trimmed) || /^written assignment$/i.test(trimmed)) {
    return locale === "vi" ? "Bài làm tự luận" : "Written assignment";
  }
  const studioMatch = /^studio snapshot\s+(\d+)$/i.exec(trimmed);
  if (studioMatch) {
    return locale === "vi" ? `Ảnh chụp Studio #${studioMatch[1]}` : `Studio snapshot #${studioMatch[1]}`;
  }
  return trimmed;
}

function SubmissionReviewContent({
  submission,
  canReview,
  backHref,
  nextPending,
  otherPendingCount,
  pendingQueueSuccess,
}: {
  submission: Submission;
  canReview: boolean;
  backHref: string;
  nextPending: Submission | null;
  otherPendingCount: number;
  pendingQueueSuccess: boolean;
}) {
  const { locale, t } = useLocale();
  const workspaceId = submission.workspaceId || "";
  const assignmentsQuery = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );
  const publishedCourse = usePublishedCourse(workspaceId, Boolean(workspaceId));
  const gradebook = useWorkspaceGradebook(workspaceId, canReview && Boolean(workspaceId));

  const essayPrompt = useMemo(() => {
    const modules = publishedCourse.data?.snapshot?.modules ?? [];
    for (const mod of modules) {
      const items = mod.items ?? [];
      if (items.some((item) => item.assignmentId === submission.assignmentId)) {
        const essayItem = items.find(
          (item) =>
            item.type === "ESSAY" &&
            typeof item.content?.["prompt"] === "string" &&
            String(item.content["prompt"]).trim().length > 0,
        );
        if (essayItem?.content?.["prompt"]) {
          return String(essayItem.content["prompt"]).trim();
        }
      }
    }
    const matched = (assignmentsQuery.data ?? []).find((a) => a.id === submission.assignmentId);
    return matched?.instructions?.trim() || "";
  }, [publishedCourse.data?.snapshot?.modules, assignmentsQuery.data, submission.assignmentId]);

  const fallbackQuizCell = useMemo(() => {
    if (!canReview || !gradebook.data?.students?.length) return null;
    const studentRow = gradebook.data.students.find((s) => s.userId === submission.studentId);
    if (!studentRow) return null;
    return studentRow.cells.find((c) => c.assignmentId === submission.assignmentId) ?? null;
  }, [canReview, gradebook.data, submission.studentId, submission.assignmentId]);

  const quizDisplay = useMemo(() => {
    const quizEv = submission.courseQuizEvidence;
    if (quizEv && quizEv.correctCount != null && quizEv.questionCount != null) {
      const percent =
        quizEv.questionCount > 0 ? Math.round((quizEv.correctCount / quizEv.questionCount) * 100) : 0;
      const passed =
        quizEv.status === "PASSED" ||
        (quizEv.passPercent != null ? percent >= quizEv.passPercent : false);
      return {
        kind: "scored" as const,
        correctCount: quizEv.correctCount,
        questionCount: quizEv.questionCount,
        percent,
        passPercent: quizEv.passPercent ?? null,
        passed,
        submittedAt: quizEv.submittedAt ?? null,
      };
    }
    if (fallbackQuizCell && fallbackQuizCell.quizBestScore != null) {
      return {
        kind: "percentOnly" as const,
        percent: fallbackQuizCell.quizBestScore,
        passed: fallbackQuizCell.quizPassed,
      };
    }
    if (quizEv?.status === "NOT_ATTEMPTED") {
      return {
        kind: "notAttempted" as const,
        questionCount: quizEv.questionCount ?? null,
        passPercent: quizEv.passPercent ?? null,
      };
    }
    return { kind: "notRequired" as const };
  }, [submission.courseQuizEvidence, fallbackQuizCell]);

  const writtenBlocks = useMemo(() => {
    const blocks: Array<{ key: string; title: string; text: string }> = [];
    const seenTexts = new Set<string>();
    const hasStudioEvidence = Boolean(submission.studioEvidence);
    for (let i = 0; i < (submission.studentSnapshots ?? []).length; i++) {
      const snap = submission.studentSnapshots![i]!;
      if (
        hasStudioEvidence &&
        (snap.step === "STEP_4_RUNTIME" || snap.snapshotId.startsWith("STUDIO_"))
      ) {
        continue;
      }
      const cleaned = snap.writtenExplanation
        ? stripLegacySubmissionNoise(snap.writtenExplanation)
        : "";
      if (!cleaned) continue;
      seenTexts.add(cleaned);
      blocks.push({
        key: `${snap.snapshotId}-${i}`,
        title: formatWrittenBlockTitle(snap.title, locale),
        text: cleaned,
      });
    }
    const cleanedNotes = submission.submissionNotes
      ? stripLegacySubmissionNoise(submission.submissionNotes)
      : "";
    if (cleanedNotes && !seenTexts.has(cleanedNotes)) {
      blocks.push({
        key: "submission-notes",
        title: locale === "vi" ? "Bài làm tự luận" : "Written assignment",
        text: cleanedNotes,
      });
    }
    return blocks;
  }, [submission.studentSnapshots, submission.studioEvidence, submission.submissionNotes, locale]);

  const labLabel = formatCourseLabTitle(
    submission.assignmentTitle,
    submission.labOrder,
    submission.assignmentId,
  );
  const statusKey =
    submission.labOutcome === "PASSED"
      ? "PASSED"
      : submission.labOutcome === "NEEDS_REVISION"
        ? "NEEDS_REVISION"
        : submission.reviewStatus || "PENDING";
  const statusVariant =
    statusKey === "PASSED" ? "success" : statusKey === "NEEDS_REVISION" ? "warning" : "secondary";

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          asChild
          size="sm"
          variant="outline"
          className="border-slate-300 bg-card text-foreground hover:bg-accent dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-700/80"
        >
          <Link href={backHref}>
            ←{" "}
            {canReview
              ? t("Back to submissions", "Quay lại danh sách bài nộp")
              : t("Back to my submissions", "Quay lại bài nộp của tôi")}
          </Link>
        </Button>
        {canReview && nextPending && (
          <Button asChild size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">
            <Link href={`/submissions/${encodeURIComponent(nextPending.id)}`}>
              {t(
                `Next pending (${otherPendingCount}) →`,
                `Bài chờ chấm tiếp theo (${otherPendingCount}) →`,
              )}
            </Link>
          </Button>
        )}
        {canReview && pendingQueueSuccess && !nextPending && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {t("No other pending submissions", "Không còn bài chờ chấm khác")}
          </span>
        )}
      </div>

      <header className="space-y-1 border-b pb-3.5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t("Submission Review", "Đánh giá bài nộp")}
          </h1>
          <ScreenHelpTrigger screenId="submission-review" />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {submission.studentName || submission.studentId}
          </span>
          <span>·</span>
          <span>{labLabel}</span>
          <span>·</span>
          <span>{formatReviewTimestamp(submission.submittedAt, locale)}</span>
          <StatusBadge status={statusKey} variant={statusVariant} />
        </div>
      </header>

      <div
        className={
          canReview
            ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] lg:items-start"
            : "min-w-0 space-y-6"
        }
      >
        <section id="review" className="min-w-0 scroll-mt-24 space-y-5">
          <DetailPanel title={t("1. Quiz Result", "1. Kết quả bài kiểm tra (Quiz)")}>
            {quizDisplay.kind === "scored" ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="mavis-tabular text-lg font-bold text-foreground">
                    {quizDisplay.correctCount}/{quizDisplay.questionCount} ({quizDisplay.percent}%)
                  </span>
                  <Badge variant={quizDisplay.passed ? "success" : "warning"}>
                    {quizDisplay.passed ? t("Passed", "Đạt") : t("Not passed", "Chưa đạt")}
                  </Badge>
                  {quizDisplay.passPercent != null && (
                    <span className="text-xs text-muted-foreground">
                      {t("Pass", "Yêu cầu")} ≥ {quizDisplay.passPercent}%
                    </span>
                  )}
                </div>
                {quizDisplay.submittedAt && (
                  <span className="text-xs text-muted-foreground">
                    {t("Taken", "Làm lúc")}: {formatReviewTimestamp(quizDisplay.submittedAt, locale)}
                  </span>
                )}
              </div>
            ) : quizDisplay.kind === "percentOnly" ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="mavis-tabular text-lg font-bold text-foreground">
                  {quizDisplay.percent}%
                </span>
                <Badge variant={quizDisplay.passed ? "success" : "warning"}>
                  {quizDisplay.passed ? t("Passed", "Đạt") : t("Not passed", "Chưa đạt")}
                </Badge>
              </div>
            ) : quizDisplay.kind === "notAttempted" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t("Not attempted", "Chưa làm bài")}</Badge>
                {quizDisplay.questionCount != null && (
                  <span className="text-xs text-muted-foreground">
                    {quizDisplay.questionCount} {t("questions", "câu hỏi")}
                    {quizDisplay.passPercent != null
                      ? ` · ${t("Pass", "Yêu cầu")} ≥ ${quizDisplay.passPercent}%`
                      : ""}
                  </span>
                )}
              </div>
            ) : (
              <div>
                <Badge variant="outline">{t("No Quiz required", "Không yêu cầu Quiz")}</Badge>
              </div>
            )}
          </DetailPanel>

          <DetailPanel title={t("2. Student Written Assignment", "2. Bài tập tự luận của sinh viên")}>
            {essayPrompt && (
              <div className="space-y-1.5 rounded-xl border bg-muted/20 p-3.5 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("Assignment prompt", "Đề bài tự luận")}
                </p>
                <MarkdownPreview markdown={essayPrompt} />
              </div>
            )}

            {writtenBlocks.length > 0 ? (
              <div className="space-y-3">
                {writtenBlocks.map((block) => (
                  <div
                    key={block.key}
                    className="space-y-1.5 rounded-xl border bg-background p-3.5"
                  >
                    <p className="text-xs font-semibold text-muted-foreground">{block.title}</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {block.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "The student has not submitted a written response.",
                  "Sinh viên chưa nhập nội dung tự luận.",
                )}
              </p>
            )}

            <StudioSubmissionEvidence
              key={submission.id}
              submissionId={submission.id}
              available={Boolean(submission.studioEvidence)}
              mode="media"
            />
          </DetailPanel>

          {submission.diagramLayout && (
            <details className="rounded-xl border bg-card px-4 py-3 text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                {t(
                  "Attached technical diagram files (optional)",
                  "Tệp sơ đồ kỹ thuật đính kèm (tùy chọn)",
                )}
              </summary>
              <div className="mt-3 border-t pt-3">
                <FrozenArtifacts submission={submission} technicalOnly />
              </div>
            </details>
          )}
        </section>

        <aside className="min-w-0 lg:sticky lg:top-20">
          <GradingPanel
            key={submission.id}
            submissionId={submission.id}
            guidedLab={submission.guidedLab === true}
            studentSnapshots={submission.studentSnapshots ?? undefined}
            studioAssistant={
              (canReview ||
                submission.reviewStatus === "GRADED" ||
                submission.reviewStatus === "RETURNED") &&
              submission.studioEvidence ? (
                <StudioSubmissionEvidence
                  key={`${submission.id}-assistant`}
                  submissionId={submission.id}
                  available
                  mode="assistant"
                  showGradedBreakdown={
                    !canReview &&
                    (submission.reviewStatus === "GRADED" || submission.reviewStatus === "RETURNED")
                  }
                />
              ) : undefined
            }
            reviseHref={
              !canReview && submission.workspaceId && submission.assignmentId
                ? `/lab?workspace=${encodeURIComponent(submission.workspaceId)}&assignment=${encodeURIComponent(submission.assignmentId)}&step=3`
                : undefined
            }
          />
        </aside>
      </div>
    </div>
  );
}

export function SubmissionReview({ submissionId }: { submissionId: string }) {
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
        <SubmissionReviewContent
          submission={query.data}
          canReview={canReview}
          backHref={backHref}
          nextPending={nextPending}
          otherPendingCount={otherPending.length}
          pendingQueueSuccess={pendingQueue.isSuccess}
        />
      )}
    </RequestState>
  );
}

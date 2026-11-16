"use client";
import { FrozenArtifacts } from "./frozen-artifacts";
import { StudioSubmissionEvidence } from "./studio-evidence";
import { useState } from "react";
import Link from "next/link";
import { useApiQuery, usePermission, useSelection } from "@/hooks/use-api";
import { useSearchParams } from "next/navigation";
import { SelectField, SearchInput, Pagination } from "@/components/shared/forms";
import { WorkspaceSelector } from "@/features/workspaces/components";
import { EmptyState, RequestState } from "@/components/shared/request-state";
import { DataTable, StatusLabel } from "@/components/shared/data";
import { Badge } from "@/components/ui/badge";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { TraceViewer, RuntimeSessionTimeline } from "@/features/runtime/components";
import { SubmissionVersionHeader, FeedbackPanel } from "./components";
import { GradingPanel, resolveSubmissionOutcome } from "./grading";
export function Submissions() {
  const canReview = usePermission("submission:review");
  return canReview ? <TeachingSubmissions /> : <MySubmissions />;
}
function MySubmissions() {
  const params = useSearchParams();
  const assignmentId = params?.get("assignment") || "";
  const query = useApiQuery("submissions", {});
  const rows = assignmentId
    ? (query.data ?? []).filter((submission) => submission.assignmentId === assignmentId)
    : (query.data ?? []);
  return (
    <RequestState
      query={query}
      empty={!rows.length}
      emptyMessage={
        assignmentId
          ? "No snapshot has been submitted for this Lab yet. Open the assignment to prepare your first submission."
          : "No submitted work yet. Open an assignment in your workspace to submit a model version."
      }
    >
      <SubmissionList rows={rows} />
    </RequestState>
  );
}
function TeachingSubmissions() {
  const { workspaceId } = useSelection();
  const params = useSearchParams();
  const [selected, setSelected] = useState("");
  const assignments = useApiQuery("assignments", { workspaceId }, { enabled: !!workspaceId });
  const requested = selected || params.get("assignment") || "";
  const assignment = assignments.data?.find((a) => a.id === requested) ?? assignments.data?.[0];
  return (
    <div className="space-y-4">
      <WorkspaceSelector />
      {workspaceId ? (
        <RequestState
          query={assignments}
          empty={!assignments.data?.length}
          emptyMessage="No assignments in this workspace. Create an assignment before reviewing submissions."
        >
          {assignment && (
            <div className="space-y-4">
              <SelectField
                label="Assignment to review"
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
        <EmptyState
          title="Choose a workspace"
          description="Select a class to review its assignments and student submissions."
        />
      )}
    </div>
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
            label: "Review result",
            render: (s) => <SubmissionResult submissionId={s.id} />,
          },
          { key: "feedback", label: "Feedback", render: (s) => s.feedback.length },
          {
            key: "date",
            label: "Submitted",
            render: (s) =>
              s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "Not submitted",
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
  const canReview = usePermission("submission:review");
  const query = useApiQuery(
    "submission",
    { submissionId },
    { refreshMs: canReview ? 60000 : 15000 },
  );
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <RequestState query={query}>
      {query.data && (
        <div className="min-w-0 space-y-6">
          <GradingPanel
            key={query.data.id}
            submissionId={query.data.id}
            guidedLab={query.data.guidedLab === true}
            studentSnapshots={query.data.studentSnapshots ?? undefined}
          />
          <section id="review" className="scroll-mt-24">
            <SubmissionVersionHeader submission={query.data} />
            <FrozenArtifacts submission={query.data} />
            <StudioSubmissionEvidence key={query.data.id} submissionId={query.data.id} available={Boolean(query.data.studioEvidence)}/>
          </section>
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
          <FeedbackPanel key={query.data.id} submission={query.data} selectedId={selected} />
        </div>
      )}
    </RequestState>
  );
}

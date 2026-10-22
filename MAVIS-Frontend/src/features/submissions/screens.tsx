"use client";
import { useState } from "react";
import Link from "next/link";
import { useApiQuery } from "@/hooks/use-api";
import { EmptyState, RequestState } from "@/components/shared/request-state";
import { DataTable } from "@/components/shared/data";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { TraceViewer, RuntimeSessionTimeline } from "@/features/runtime/components";
import { SubmissionVersionHeader, FeedbackPanel } from "./components";
export function Submissions() {
  const query = useApiQuery("submissions", {});
  return (
    <RequestState query={query} empty={!query.data?.length}>
      <DataTable
        caption="Submitted result versions"
        rows={query.data ?? []}
        rowKey={(s) => s.id}
        columns={[
          {
            key: "id",
            label: "Submission",
            render: (s) => (
              <Link
                className="text-primary underline"
                href={`/submissions/${encodeURIComponent(s.id)}`}
              >
                {s.id}
              </Link>
            ),
          },
          { key: "assignment", label: "Assignment", render: (s) => s.assignmentId },
          { key: "model", label: "Frozen model", render: (s) => `Revision ${s.model.revision}` },
          { key: "date", label: "Submitted", render: (s) => s.submittedAt },
        ]}
      />
    </RequestState>
  );
}
export function SubmissionReview({ submissionId }: { submissionId: string }) {
  const query = useApiQuery("submission", { submissionId });
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <RequestState query={query}>
      {query.data && (
        <div className="space-y-6">
          <section id="review" className="scroll-mt-24">
            <SubmissionVersionHeader submission={query.data} />
          </section>
          <div
            id="submitted-graph"
            className="grid scroll-mt-24 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
          >
            <ArchitectureGraph
              model={query.data.model}
              selectedId={selected}
              onSelect={setSelected}
            />
            <section id="submitted-analysis" className="scroll-mt-24">
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
          <FeedbackPanel key={query.data.id} submission={query.data} />
        </div>
      )}
    </RequestState>
  );
}

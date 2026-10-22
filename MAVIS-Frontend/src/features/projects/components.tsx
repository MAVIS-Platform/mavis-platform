"use client";
import Link from "next/link";
import { useIsMutating } from "@tanstack/react-query";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { SelectField } from "@/components/shared/forms";
import { RequestState } from "@/components/shared/request-state";
import { StatusBadge } from "@/components/shared/data";
import type { Project } from "@/types/domain";
export function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  return (
    <StatusBadge
      status={status}
      variant={status === "ready" ? "success" : status === "failed" ? "destructive" : "info"}
    />
  );
}
export function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  return (
    <article className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/project-overview?project=${encodeURIComponent(project.id)}`}
          onClick={onSelect}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {project.name}
        </Link>
        <ProjectStatusBadge status={project.status} />
      </div>
      <p className="font-mono text-xs text-muted-foreground">{project.repository}</p>
      <p className="text-xs text-muted-foreground">
        {project.services ?? "Unknown"} services · Runtime{" "}
        {project.runtimeSupported === null
          ? "not checked"
          : project.runtimeSupported
            ? "supported"
            : "unavailable"}
      </p>
    </article>
  );
}
export function ProjectSelector() {
  const busy = useIsMutating() > 0;
  const query = useApiQuery("projects", {});
  const selection = useSelection();
  return (
    <RequestState query={query} empty={query.data?.length === 0}>
      <div className="max-w-sm">
        <SelectField
          disabled={busy}
          label="Selected project"
          value={selection.projectId}
          onChange={selection.setProjectId}
          options={(query.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
    </RequestState>
  );
}

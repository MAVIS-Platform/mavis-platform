"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImportFlow } from "@/components/mainflow/import-flow";
import { contextHref } from "@/lib/mainflow-api";
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
export function ProjectSelector({
  workspaceId,
  assignmentId,
}: { workspaceId?: string; assignmentId?: string } = {}) {
  const busy = useIsMutating() > 0;
  const query = useApiQuery("projects", {});
  const selection = useSelection();
  const projects = (query.data ?? []).filter(
    (project) =>
      !workspaceId ||
      (project.workspaceId === workspaceId &&
        (!project.assignmentId || project.assignmentId === assignmentId)),
  );
  const firstProjectId = projects[0]?.id ?? "";
  const { projectId, setProjectId } = selection;
  useEffect(() => {
    if (query.isSuccess && !busy && !projectId && firstProjectId) setProjectId(firstProjectId);
  }, [query.isSuccess, busy, projectId, firstProjectId, setProjectId]);
  return (
    <RequestState
      query={query}
      empty={projects.length === 0}
      emptyMessage={
        workspaceId
          ? "No projects are available for this workspace and assignment."
          : "No projects are available yet. Import a project from My Projects to get started."
      }
    >
      <SelectField
        disabled={busy}
        label="Selected project"
        placeholder={
          projectId
            ? "Selected project is unavailable — choose another project"
            : "Select a project"
        }
        value={projectId}
        onChange={setProjectId}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
      />
    </RequestState>
  );
}

export function CreateProjectAction() {
  return <ProjectImportDialog create projectId="" />;
}
export function ImportSnapshotAction() {
  const { projectId } = useSelection();
  return <ProjectImportDialog projectId={projectId} />;
}
function ProjectImportDialog({
  projectId,
  create = false,
}: {
  projectId: string;
  create?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const router = useRouter(),
    params = useSearchParams(),
    pathname = usePathname();
  useEffect(() => {
    if (params.get("import") === "1" && (create || projectId)) {
      setOpen(true);
      const next = new URLSearchParams(params.toString());
      next.delete("import");
      router.replace(`${pathname}${next.size ? "?" + next : ""}`, { scroll: false });
    }
  }, [params, router, pathname, projectId, create]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size={create ? "default" : "sm"} disabled={!create && !projectId}>
          {create ? "Import project source" : "Import new snapshot"}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={busy ? "max-w-2xl [&>button]:hidden" : "max-w-2xl"}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{create ? "Import new project" : "Import new snapshot"}</DialogTitle>
          <DialogDescription>
            {create
              ? "Enter a project name and its public GitHub repository, then choose a branch or pin a commit. The first snapshot will be imported and analyzed."
              : "Add a new snapshot to this project. Its linked GitHub repository stays the same. Analysis starts after import."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ImportFlow
            key={projectId || "new-project"}
            projectId={create ? "" : projectId}
            onBusyChange={setBusy}
            onComplete={(result) => {
              setBusy(false);
              setOpen(false);
              const target = contextHref("/snapshots", result.projectId, "", {
                snapshot: result.snapshotId,
                job: result.jobId,
              });
              if (create) router.push(target);
              else router.replace(target, { scroll: false });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

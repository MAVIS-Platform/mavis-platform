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
import { GuidedTarget } from "@/components/shared/guided-target";
import { useLocale } from "@/lib/i18n/locale-context";
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
  selectedProject,
}: { workspaceId?: string; assignmentId?: string; selectedProject?: Project | undefined } = {}) {
  const busy = useIsMutating() > 0;
  const query = useApiQuery("projects", {});
  const selection = useSelection();
  const projects = query.data ?? [];
  const options = selectedProject?.id === selection.projectId &&
    !projects.some((project) => project.id === selectedProject.id)
    ? [selectedProject, ...projects]
    : projects;
  return (
    <RequestState query={query} empty={!options.length}>
      <SelectField
        disabled={busy}
        label="Selected project"
        value={selection.projectId}
        onChange={selection.setProjectId}
        options={[
          ...options
            .filter(
              (p) =>
                !workspaceId ||
                (p.workspaceId === workspaceId &&
                  (!p.assignmentId || p.assignmentId === assignmentId)),
            )
            .map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
    </RequestState>
  );
}

type ImportTourProps = {
  tourStep?: number | null;
  onTourStepChange?: (step: number | null) => void;
};
export function CreateProjectAction(props: ImportTourProps = {}) {
  return <ProjectImportDialog create projectId="" {...props} />;
}
export function ImportSnapshotAction() {
  const { projectId } = useSelection();
  return <ProjectImportDialog projectId={projectId} />;
}
function ProjectImportDialog({
  projectId,
  create = false,
  tourStep = null,
  onTourStepChange,
}: {
  projectId: string;
  create?: boolean;
} & ImportTourProps) {
  const { t } = useLocale();
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
        if (!busy) {
          setOpen(next);
          if (!next) onTourStepChange?.(null);
          else if (tourStep === 0) onTourStepChange?.(1);
        }
      }}
    >
      <GuidedTarget
        active={tourStep === 0}
        step={0}
        title={t("Import your first project", "Nhập dự án đầu tiên")}
        description={t(
          "Click the highlighted button to import a public GitHub repository. We will guide you through each field.",
          "Bấm nút được làm nổi bật để nhập repository GitHub công khai. Bạn sẽ được hướng dẫn từng ô thông tin.",
        )}
        onNext={() => {
          setOpen(true);
          onTourStepChange?.(1);
        }}
        onSkip={() => onTourStepChange?.(null)}
      >
        <DialogTrigger asChild>
          <Button size={create ? "default" : "sm"} disabled={!create && !projectId}>
            {create ? t("Import project source", "Nhập mã nguồn dự án") : t("Import new snapshot", "Nhập bản chụp mới")}
          </Button>
        </DialogTrigger>
      </GuidedTarget>
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
            tourStep={tourStep}
            onTourStepChange={(step) => {
              if (step === 0) setOpen(false);
              onTourStepChange?.(step);
            }}
            onCancel={() => {
              if (busy) return;
              onTourStepChange?.(null);
              setOpen(false);
            }}
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

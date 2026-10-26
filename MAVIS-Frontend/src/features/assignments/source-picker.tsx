"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import type { Assignment } from "./requirements";

export function AssignmentSourcePicker({
  workspaceId,
  title,
  initial,
  onChange,
}: {
  workspaceId: string;
  title: string;
  initial?: Assignment["referenceSource"];
  onChange: (modelId: string, pending: boolean) => void;
}) {
  const api = useApi(),
    cache = useQueryClient();
  const [mode, setMode] = useState("existing"),
    [repository, setRepository] = useState("");
  const [lookup, setLookup] = useState(""),
    [branch, setBranch] = useState(""),
    [commit, setCommit] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [modelId, setModelId] = useState(initial?.modelId ?? "");
  const [snapshotId, setSnapshotId] = useState(initial?.snapshotId ?? "");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false),
    createdProject = useRef("");
  const projects = useApiQuery("workspaceProjects", { workspaceId });
  const versions = useApiQuery("modelVersions", { projectId }, { enabled: !!projectId });
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: !!projectId });
  useEffect(() => {
    const timer = setTimeout(() => setLookup(repository.trim()), 500);
    return () => clearTimeout(timer);
  }, [repository]);
  const branches = useApiQuery(
    "githubBranches",
    { repositoryUrl: lookup },
    { enabled: mode === "github" && !!lookup },
  );
  const selectedBranch = branches.data?.branches.includes(branch)
    ? branch
    : (branches.data?.defaultBranch ?? "");
  const job = useApiQuery("analysisJob", { jobId }, { enabled: !!jobId, poll: true });
  const running =
    !!jobId &&
    (!job.data || ["queued", "processing", "running"].includes(job.data.status)) &&
    !job.error;
  const prepare = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Enter the assignment title first.");
      if (
        mode === "zip" &&
        (!file || !/\.zip$/i.test(file.name) || !file.size || file.size > 100 * 1024 * 1024)
      )
        throw new Error("Choose a non-empty ZIP archive up to 100 MB.");
      if (
        mode === "github" &&
        (!selectedBranch || lookup !== repository.trim() || !branches.isSuccess)
      )
        throw new Error("Wait for the repository branches, then select a branch.");
      if (mode === "github" && commit && !/^[a-f0-9]{40}$/i.test(commit.trim()))
        throw new Error("Use the full 40-character commit SHA.");
      setSnapshotId("");
      setModelId("");
      setJobId("");
      setMessage("");
      let target = projectId || createdProject.current;
      if (!target) {
        if (!title.trim()) throw new Error("Enter the assignment title first.");
        const project = await api.execute("createReferenceProject", {
          workspaceId,
          name: `${title.trim().slice(0, 220)} · reference`,
        });
        createdProject.current = project.id;
        target = project.id;
        void cache.invalidateQueries({ queryKey: ["api", "workspaceProjects"] });
      }
      setProjectId(target);
      const snapshot =
        mode === "zip"
          ? await api.execute("importSource", {
              projectId: target,
              name: file!.name.slice(0, 100),
              fileName: file!.name,
              size: file!.size,
              archive: file!,
            })
          : await api.execute("importGithub", {
              projectId: target,
              repositoryUrl: repository.trim(),
              branchName: selectedBranch,
              commitSha: commit.trim() || undefined,
            });
      setSnapshotId(snapshot.id);
      setModelId("");
      const next = await api.execute("startAnalysis", {
        projectId: target,
        snapshotId: snapshot.id,
        idempotencyKey: crypto.randomUUID(),
      });
      setJobId(next.id);
    },
  });
  const retry = useMutation({
    mutationFn: async (overrideSnapshotId?: string) => {
      const targetSnapshot = overrideSnapshotId || snapshotId;
      if (!targetSnapshot) throw new Error("No snapshot selected for analysis.");
      setSnapshotId(targetSnapshot);
      const next = await api.execute("startAnalysis", {
        projectId,
        snapshotId: targetSnapshot,
        idempotencyKey: crypto.randomUUID(),
      });
      setJobId(next.id);
    },
  });
  useEffect(() => {
    if (
      !job.data?.modelId ||
      job.data.snapshotId !== snapshotId ||
      job.data.projectId !== projectId
    )
      return;
    setModelId(job.data.modelId);
    setMessage(
      job.data.status === "partial"
        ? "Analysis completed with limitations. Review this version before assigning it."
        : "Source analyzed. This exact version will be attached when you save the assignment.",
    );
    void cache.invalidateQueries({ queryKey: ["api", "modelVersions"] });
    void cache.invalidateQueries({ queryKey: ["api", "snapshots"] });
  }, [job.data?.modelId, job.data?.status, snapshotId, projectId, cache]);
  const busy = prepare.isPending || retry.isPending || running;
  const pending = (mode !== "existing" || !!projectId) && !modelId;
  useEffect(() => {
    onChange(modelId, busy || pending);
  }, [modelId, busy, pending, onChange]);
  const imported = snapshots.data?.find((s) => s.id === snapshotId);
  function changeMode(next: string) {
    setMode(next);
    setModelId("");
    setJobId("");
    setMessage("");
    setSnapshotId("");
    prepare.reset();
    retry.reset();
  }
  const sortedVersions = [...(versions.data ?? [])].sort((a, b) => b.revision - a.revision);

  // Auto-select the latest analyzed revision when a reference project is selected
  useEffect(() => {
    if (mode === "existing" && projectId && !modelId && sortedVersions.length > 0) {
      const latest = sortedVersions[0]!;
      setModelId(latest.id);
      setSnapshotId(latest.snapshotId);
    }
  }, [mode, projectId, modelId, sortedVersions]);

  return (
    <fieldset className="space-y-4 rounded-xl border bg-muted/20 p-4" disabled={busy}>
      <legend className="px-1 text-sm font-semibold">Assignment project & source version</legend>
      <p className="text-sm text-muted-foreground">
        Attach a class reference here. Import, analyze and select its exact version without leaving
        this assignment.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["existing", "Existing version / no source"],
            ["github", "GitHub repository"],
            ["zip", "Upload ZIP"],
          ] as const
        ).map(([id, label]) => (
          <Button
            type="button"
            key={id}
            variant={mode === id ? "default" : "outline"}
            aria-pressed={mode === id}
            onClick={() => changeMode(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {mode === "existing" ? (
        <>
          <SelectField
            label="Teaching reference project"
            value={projectId}
            onChange={(value) => {
              setProjectId(value);
              setModelId("");
              setSnapshotId("");
            }}
            options={[
              { value: "", label: "No reference source (students import their own project)" },
              ...(projects.data ?? [])
                .filter((p) => p.projectType === "TEACHER_REFERENCE" || p.isReferenceTemplate)
                .map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          {projectId && (
            sortedVersions.length > 0 ? (
              <SelectField
                label="Analyzed revision (Model Version)"
                value={modelId}
                onChange={(value) => {
                  setModelId(value);
                  setSnapshotId(sortedVersions.find((m) => m.id === value)?.snapshotId ?? "");
                }}
                options={sortedVersions.map((m, idx) => ({
                  value: m.id,
                  label: `Revision ${m.revision}${idx === 0 ? " (Latest)" : ""} · ${snapshots.data?.find((s) => s.id === m.snapshotId)?.name ?? m.snapshotId.slice(0, 8)}`,
                }))}
              />
            ) : versions.isFetching || snapshots.isFetching ? (
              <p className="text-xs text-muted-foreground">Loading analyzed revisions…</p>
            ) : (snapshots.data?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-background/60 p-3 text-xs">
                <span className="text-muted-foreground">
                  This project has {snapshots.data!.length} source snapshot(s) but no analyzed
                  revision yet.
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const latestSnap = snapshots.data![0]!;
                    retry.mutate(latestSnap.id);
                  }}
                >
                  Analyze latest snapshot
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-background/60 p-3 text-xs text-muted-foreground">
                This reference project has no source code or analyzed revisions yet. Switch to{" "}
                <strong>GitHub repository</strong> or <strong>Upload ZIP</strong> above to import
                and analyze source code, or select <strong>No reference source</strong>.
              </div>
            )
          )}
        </>
      ) : (
        <>
          {mode === "github" ? (
            <>
              <label className="block text-sm">
                GitHub repository URL
                <Input
                  aria-label="Assignment GitHub repository URL"
                  value={repository}
                  placeholder="https://github.com/owner/repository"
                  onChange={(e) => {
                    setRepository(e.target.value);
                    setModelId("");
                    setJobId("");
                  }}
                />
              </label>
              <SelectField
                label="Branch"
                value={selectedBranch}
                onChange={(value) => {
                  setBranch(value);
                  setModelId("");
                  setJobId("");
                }}
                options={[
                  {
                    value: "",
                    label: branches.isFetching ? "Loading branches…" : "Select repository branch",
                  },
                  ...(branches.data?.branches ?? []).map((value) => ({ value, label: value })),
                ]}
              />
              <label className="block text-sm">
                Commit SHA (optional; overrides branch)
                <Input
                  value={commit}
                  aria-label="Assignment commit SHA"
                  placeholder="Full 40-character SHA"
                  onChange={(e) => {
                    setCommit(e.target.value);
                    setModelId("");
                    setJobId("");
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Public repositories only. Use ZIP for a private repository. The resolved commit is
                pinned, even when the branch changes later.
              </p>
            </>
          ) : (
            <label className="block text-sm">
              Project ZIP (up to 100 MB)
              <Input
                aria-label="Assignment project ZIP"
                type="file"
                accept=".zip"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setModelId("");
                  setJobId("");
                }}
              />
            </label>
          )}
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              try {
                await prepare.mutateAsync();
              } catch {
              } finally {
                lock.current = false;
              }
            }}
          >
            Import & analyze source
          </Button>
        </>
      )}
      {running && (
        <p role="status" className="text-sm">
          Analyzing reference source… You can continue writing the assignment above.
        </p>
      )}
      {job.data && ["failed", "cancelled", "timed-out"].includes(job.data.status) && (
        <p role="alert">
          Analysis {job.data.status}.{" "}
          <Button type="button" variant="outline" onClick={() => retry.mutate()}>
            Retry analysis
          </Button>
        </p>
      )}
      {snapshotId && !jobId && prepare.error && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            prepare.reset();
            retry.mutate();
          }}
        >
          Retry analysis of imported source
        </Button>
      )}
      {job.error && (
        <Button type="button" variant="outline" onClick={() => void job.refetch()}>
          Reconnect to analysis
        </Button>
      )}
      {modelId && (
        <p role="status" className="break-all text-sm">
          Pinned source: {imported?.name ?? initial?.projectName ?? "Selected reference"} ·{" "}
          {modelId === initial?.modelId
            ? `revision ${initial.revision}`
            : `revision ${versions.data?.find((m) => m.id === modelId)?.revision ?? "ready"}`}
          <br />
          {message}
        </p>
      )}
      {[prepare.error, retry.error, branches.error, projects.error, versions.error, job.error]
        .filter(Boolean)
        .map((error, index) => (
          <p role="alert" key={index} className="text-sm text-destructive">
            {error?.message}
          </p>
        ))}
    </fieldset>
  );
}

export function AssignmentSourceDetails({
  source,
  assignmentId,
}: {
  source: Assignment["referenceSource"];
  assignmentId: string;
}) {
  if (!source) return null;
  return (
    <section className="space-y-2 rounded-xl border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold">Assigned reference source · {source.projectName}</h3>
      <dl className="grid gap-2 break-all text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd>
            {source.sourceType} {source.repositoryUrl}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Branch / commit</dt>
          <dd>
            {source.branch ?? "ZIP archive"} · {source.commitSha ?? source.artifactHash}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pinned analysis</dt>
          <dd>
            Revision {source.revision} · {source.modelId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source snapshot</dt>
          <dd>{source.snapshotId}</dd>
        </div>
      </dl>
      <a
        className="inline-block text-sm text-primary underline"
        href={`/api/backend/assignments/${encodeURIComponent(assignmentId)}/reference-source`}
        download
      >
        Download assigned source ZIP
      </a>
    </section>
  );
}

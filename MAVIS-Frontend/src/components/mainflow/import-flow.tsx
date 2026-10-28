"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/request-state";
import { githubImportRequest } from "@/lib/mainflow-api";
import type { Response } from "@/lib/api/contracts";

type ImportResult = { projectId: string; snapshotId: string };
export function ImportFlow({
  projectId = "",
  onComplete,
  onBusyChange,
}: {
  projectId?: string;
  onComplete?: (result: ImportResult) => void;
  onBusyChange?: (busy: boolean) => void;
} = {}) {
  const api = useApi(),
    cache = useQueryClient();
  const project = useApiQuery("project", { projectId }, { enabled: !!projectId });
  const boundRepository = project.data?.repository?.trim() ?? "";
  const [name, setName] = useState(""),
    [repository, setRepository] = useState(""),
    [branch, setBranch] = useState(""),
    [commit, setCommit] = useState("");
  const [source, setSource] = useState<"github" | "zip">("github"),
    [file, setFile] = useState<File | null>(null),
    [validation, setValidation] = useState(""),
    [stage, setStage] = useState("");
  const [created, setCreated] = useState<Response<"createProject"> | null>(null);
  const inFlight = useRef(false),
    createdRef = useRef<Response<"createProject"> | null>(null);
  const sourceType = boundRepository || !projectId ? "github" : source;
  let repositoryUrl = "";
  try {
    repositoryUrl = githubImportRequest(
      "",
      boundRepository || repository,
      "main",
      "",
    ).repositoryUrl;
  } catch {
    /* Show input guidance below. */
  }
  const [lookup, setLookup] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setLookup(repositoryUrl), 400);
    return () => clearTimeout(timer);
  }, [repositoryUrl]);
  const lookupUrl = boundRepository ? repositoryUrl : lookup;
  const refs = useQuery({
    queryKey: ["api", "githubBranches", { repositoryUrl: lookupUrl }],
    queryFn: ({ signal }) => api.execute("githubBranches", { repositoryUrl: lookupUrl }, signal),
    enabled: sourceType === "github" && !!lookupUrl,
    retry: false,
    staleTime: 60000,
  });
  const branches = refs.data?.branches ?? [];
  const preferredBranch = project.data?.defaultBranch || created?.defaultBranch || "";
  const selectedBranch = branches.includes(branch)
    ? branch
    : branches.includes(preferredBranch)
      ? preferredBranch
      : refs.data?.defaultBranch || created?.defaultBranch || "";
  const branchesCurrent = repositoryUrl === lookupUrl && refs.isSuccess;
  const run = useMutation({
    mutationFn: async () => {
      if (projectId && !project.data)
        throw new Error("Project details are unavailable. Refresh and try again.");
      let target = projectId || createdRef.current?.id || "";
      if (!target) {
        if (!name.trim() || !repositoryUrl || !branchesCurrent || !selectedBranch)
          throw new Error("Enter a project name and a valid public GitHub repository.");
        setStage("Creating project…");
        const next = await api.execute("createProject", {
          name: name.trim(),
          repositoryUrl,
          defaultBranch: selectedBranch,
        });
        createdRef.current = next;
        setCreated(next);
        target = next.id;
        cache.setQueryData(["api", "project", { projectId: target }], next);
        void cache.invalidateQueries({ queryKey: ["api", "projects"] });
        void cache.invalidateQueries({ queryKey: ["api", "projectOverviews"] });
      }
      setStage("Importing snapshot…");
      const snapshot =
        sourceType === "github"
          ? await api.execute("importGithub", {
              projectId: target,
              repositoryUrl,
              branchName: selectedBranch || project.data?.defaultBranch || "main",
              commitSha: commit.trim(),
            })
          : await api.execute("importSource", {
              projectId: target,
              name: file!.name,
              fileName: file!.name,
              size: file!.size,
              archive: file!,
            });
      void cache.invalidateQueries({ queryKey: ["api", "snapshots"] });
      void cache.invalidateQueries({ queryKey: ["api", "project", { projectId: target }] });
      void cache.invalidateQueries({ queryKey: ["api", "projects"] });
      void cache.invalidateQueries({ queryKey: ["api", "projectOverviews"] });
      return { projectId: target, snapshotId: snapshot.id };
    },
    onSuccess: (result) => onComplete?.(result),
    onSettled: () => setStage(""),
  });
  const busy = run.isPending;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const valid =
    sourceType === "zip"
      ? !!file && !validation
      : !!repositoryUrl &&
        (projectId
          ? !!commit.trim() || (branchesCurrent && !!selectedBranch)
          : !!name.trim() && !!selectedBranch && (branchesCurrent || !!created));
  async function submit() {
    if (inFlight.current || !valid) return;
    inFlight.current = true;
    onBusyChange?.(true);
    try {
      await run.mutateAsync();
    } catch {
      /* Keep the created project for retry. */
    } finally {
      inFlight.current = false;
      onBusyChange?.(false);
    }
  }
  if (projectId && project.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading project…
      </p>
    );
  if (projectId && project.isError)
    return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  return (
    <form
      className="space-y-5"
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {projectId ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <p className="font-semibold">{project.data?.name}</p>
          {boundRepository ? (
            <>
              <p className="break-all text-sm text-muted-foreground">{boundRepository}</p>
              <p className="text-xs text-muted-foreground">
                Repository is fixed for this project. Choose a branch or commit for the new
                snapshot.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This older project has no repository saved. Link its original GitHub repository once,
              or add a ZIP snapshot. Existing snapshots will be kept.
            </p>
          )}
        </div>
      ) : (
        <label className="block space-y-2 text-sm font-medium">
          <span>Project name</span>
          <Input
            aria-label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your project"
            maxLength={255}
            required
            disabled={busy || !!created}
          />
        </label>
      )}
      {projectId && !boundRepository && (
        <div className="flex gap-2" role="group" aria-label="Snapshot source">
          <Button
            type="button"
            size="sm"
            variant={source === "github" ? "default" : "outline"}
            disabled={busy}
            onClick={() => setSource("github")}
          >
            GitHub repository
          </Button>
          <Button
            type="button"
            size="sm"
            variant={source === "zip" ? "default" : "outline"}
            disabled={busy}
            onClick={() => setSource("zip")}
          >
            Upload ZIP
          </Button>
        </div>
      )}
      {sourceType === "github" ? (
        <>
          {!boundRepository && (
            <label className="block space-y-2 text-sm font-medium">
              <span>{projectId ? "Link original GitHub repository" : "GitHub repository URL"}</span>
              <Input
                aria-label="GitHub repository URL"
                type="url"
                value={repository}
                onChange={(e) => {
                  setRepository(e.target.value);
                  setBranch("");
                }}
                placeholder="https://github.com/owner/repository"
                required
                disabled={busy || !!created}
              />
            </label>
          )}
          {(boundRepository || repository.trim()) && !repositoryUrl && (
            <p className="text-xs text-destructive">
              Use a GitHub repository root URL: https://github.com/owner/repository
            </p>
          )}
          <>
            <label className="block space-y-2 text-sm font-medium">
              <span>Branch</span>
              <select
                aria-label="Branch"
                className="h-10 w-full rounded-md border bg-card px-3 text-sm"
                value={selectedBranch}
                disabled={busy || !branchesCurrent || !!commit.trim()}
                onChange={(e) => setBranch(e.target.value)}
              >
                {!branchesCurrent && (
                  <option value="">
                    {refs.isFetching
                      ? "Loading branches…"
                      : repositoryUrl
                        ? "Branches unavailable"
                        : "Enter a repository URL first"}
                  </option>
                )}
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                    {b === refs.data?.defaultBranch ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Commit SHA (optional)</span>
              <Input
                aria-label="Commit SHA"
                placeholder="Full 40-character SHA"
                value={commit}
                onChange={(e) => setCommit(e.target.value)}
                pattern="[a-fA-F0-9]{40}"
                disabled={busy}
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Leave empty for the latest commit on the selected branch. A SHA overrides the branch
                selection.
              </span>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || !repositoryUrl || refs.isFetching}
              onClick={() => {
                setLookup(repositoryUrl);
                if (lookupUrl === repositoryUrl) void refs.refetch();
              }}
            >
              Reload branches
            </Button>
          </>
          {refs.error && <ErrorState error={refs.error} onRetry={() => void refs.refetch()} />}
          {refs.data?.truncated && (
            <p className="text-xs text-muted-foreground">
              The branch list is truncated. You can pin a commit SHA for an unlisted branch.
            </p>
          )}
        </>
      ) : (
        <label className="block space-y-2 text-sm font-medium">
          <span>ZIP archive (up to 100 MB)</span>
          <Input
            aria-label="Source archive"
            type="file"
            accept=".zip"
            required
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              const error =
                f &&
                (!f.name.toLowerCase().endsWith(".zip") || !f.size || f.size > 100 * 1024 * 1024)
                  ? "Choose a non-empty ZIP up to 100 MB."
                  : "";
              setValidation(error);
              setFile(error ? null : f);
            }}
          />
        </label>
      )}
      {validation && (
        <p role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      )}
      {created && run.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          Project created. Retry will import into the same project; its name and repository are now
          fixed.
        </p>
      )}
      {run.error && <ErrorState error={run.error} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !valid}>
          {busy
            ? stage || "Working…"
            : projectId
              ? "Import snapshot"
              : created
                ? "Retry import"
                : "Import project"}
        </Button>
        {busy && (
          <p role="status" className="text-xs text-muted-foreground">
            Keep this dialog open until the import finishes.
          </p>
        )}
      </div>
    </form>
  );
}

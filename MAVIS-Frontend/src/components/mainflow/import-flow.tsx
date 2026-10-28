"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contextHref } from "@/lib/mainflow-api";
import { useApi } from "@/hooks/use-api";
import { ErrorNotice, panel } from "./shell";

export function ImportFlow({ embedded = false }: { embedded?: boolean } = {}) {
  const adapter = useApi();
  const params = useSearchParams();
  const router = useRouter();
  const cache = useQueryClient();
  const [selectedProject, setSelectedProject] = useState("");
  const project = embedded ? selectedProject : (params.get("project") ?? "");
  const projects = useQuery({
    queryKey: ["api", "projects", {}],
    queryFn: ({ signal }) => adapter.execute("projects", {}, signal),
    enabled: embedded,
  });
  const [source, setSource] = useState<"zip" | "github">("zip");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [commit, setCommit] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState("");
  const inFlight = useRef(false);

  const create = useMutation({
    mutationFn: () => adapter.execute("createProject", { name }),
    onSuccess: (p) => {
      setName("");
      cache.invalidateQueries({ queryKey: ["api", "projects"] });
      cache.invalidateQueries({ queryKey: ["api", "projectOverviews"] });
      if (embedded) setSelectedProject(p.id);
      else router.push(contextHref("/import", p.id));
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !project) throw new Error("Choose project and ZIP first");
      return adapter.execute("importSource", {
        projectId: project,
        name: file.name,
        fileName: file.name,
        size: file.size,
        archive: file,
      });
    },
    onSuccess: (s) => {
      setFile(null);
      cache.invalidateQueries({ queryKey: ["api", "snapshots"] });
      router.push(contextHref("/snapshots", project, "", { snapshot: s.id }));
    },
  });

  const [branchRepository, setBranchRepository] = useState("");
  const branches = useQuery({
    queryKey: ["api", "githubBranches", branchRepository],
    queryFn: ({ signal }) =>
      adapter.execute("githubBranches", { repositoryUrl: branchRepository }, signal),
    enabled: source === "github" && !!branchRepository,
    retry: false,
    staleTime: 60000,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setBranchRepository(repository.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [repository]);

  const branchOptions = branches.data?.branches ?? [];
  const selectedBranch = branchOptions.includes(branch)
    ? branch
    : (branches.data?.defaultBranch ?? "");
  const branchesCurrent = repository.trim() === branchRepository && branches.isSuccess;

  const github = useMutation({
    mutationFn: () =>
      adapter.execute("importGithub", {
        projectId: project,
        repositoryUrl: repository,
        branchName: selectedBranch,
        commitSha: commit,
      }),
    onSuccess: (s) => {
      cache.invalidateQueries({ queryKey: ["api", "snapshots"] });
      router.push(contextHref("/snapshots", project, "", { snapshot: s.id }));
    },
  });

  async function submitUpload() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await upload.mutateAsync();
    } catch {
      /* mutation error shown below */
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="max-w-3xl">
      <section className={embedded ? "space-y-4" : `${panel} space-y-4`}>
        {!embedded && (
          <div>
            <h2 className="font-semibold">Import Project Source</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Import Java or C# source code from a ZIP archive or GitHub repository to create a new
              snapshot.
            </p>
          </div>
        )}
        {embedded && (
          <div className="space-y-2">
            <label className="block text-sm">
              Selected project
              <select
                className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
                value={project}
                onChange={(event) => setSelectedProject(event.target.value)}
                disabled={create.isPending || upload.isPending || github.isPending}
              >
                <option value="">Choose a project…</option>
                {projects.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {projects.isLoading && <p role="status">Loading projects…</p>}
            {projects.isError && <ErrorNotice error={projects.error} />}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            aria-label="New project name"
            placeholder="New personal project name"
            maxLength={255}
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="outline" disabled={create.isPending}>
            Create project
          </Button>
        </form>
        <div className="flex gap-2" role="group" aria-label="Source type">
          <Button
            variant={source === "zip" ? "default" : "outline"}
            aria-pressed={source === "zip"}
            disabled={upload.isPending || github.isPending}
            onClick={() => setSource("zip")}
          >
            Upload ZIP
          </Button>
          <Button
            variant={source === "github" ? "default" : "outline"}
            aria-pressed={source === "github"}
            disabled={upload.isPending || github.isPending}
            onClick={() => setSource("github")}
          >
            GitHub URL
          </Button>
        </div>
        {source === "zip" ? (
          <>
            <label className="block rounded-lg border border-dashed p-6">
              Source archive (.zip, up to 100 MB)
              <Input
                className="mt-3"
                type="file"
                accept=".zip"
                disabled={!project || upload.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  const error =
                    f && (!f.name.toLowerCase().endsWith(".zip") || f.size > 100 * 1024 * 1024)
                      ? "Choose a ZIP up to 100 MB"
                      : "";
                  setValidation(error);
                  setFile(error ? null : f);
                }}
              />
            </label>
            {validation && <p role="alert">{validation}</p>}
            <Button disabled={!project || !file || upload.isPending} onClick={submitUpload}>
              {upload.isPending ? "Uploading…" : "Upload snapshot"}
            </Button>
          </>
        ) : (
          <form
            className="space-y-4 rounded-lg border border-dashed p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (project && !github.isPending) github.mutate();
            }}
          >
            <label className="block text-sm">
              GitHub repository URL
              <Input
                className="mt-2"
                type="url"
                placeholder="https://github.com/owner/repository"
                required
                value={repository}
                onChange={(e) => {
                  setRepository(e.target.value);
                  setBranch("");
                  github.reset();
                }}
                disabled={!project || github.isPending}
              />
            </label>
            <label className="block text-sm">
              Branch
              <select
                aria-label="Branch"
                className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
                value={selectedBranch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  github.reset();
                }}
                disabled={github.isPending || !branchesCurrent || !!commit.trim()}
              >
                {!branchesCurrent && (
                  <option value="">
                    {branches.isFetching
                      ? "Loading branches…"
                      : "Enter a GitHub URL to select a branch"}
                  </option>
                )}
                {branchOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                    {value === branches.data?.defaultBranch ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {branches.data?.truncated && (
                <p className="mt-1 text-xs">
                  Loaded the first 1,000 branches. Use Commit SHA for branches not listed here.
                </p>
              )}
              <ErrorNotice error={branches.error} />
              {repository.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={branches.isFetching || github.isPending}
                  onClick={() => {
                    setBranchRepository(repository.trim());
                    if (branchRepository === repository.trim()) void branches.refetch();
                  }}
                >
                  Reload branches
                </Button>
              )}
            </label>
            <label className="block text-sm">
              Commit SHA (optional)
              <Input
                className="mt-2"
                placeholder="Full 40-character SHA; overrides branch"
                value={commit}
                onChange={(e) => setCommit(e.target.value)}
                disabled={github.isPending}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Public repositories only. Use the repository root URL and its actual branch name. For
              private repositories, upload a ZIP.
            </p>
            <Button
              disabled={
                !project ||
                !repository.trim() ||
                github.isPending ||
                (!commit.trim() && (!branchesCurrent || !selectedBranch))
              }
            >
              {github.isPending ? "Importing from GitHub…" : "Import from GitHub"}
            </Button>
          </form>
        )}
        <ErrorNotice error={create.error || (source === "zip" ? upload.error : github.error)} />
      </section>
    </div>
  );
}

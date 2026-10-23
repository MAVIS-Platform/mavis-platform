"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contextHref } from "@/lib/mainflow-api";
import { useApi } from "@/hooks/use-api";
import { ApiError } from "@/lib/errors/api-error";
import { ErrorNotice, panel } from "./shell";
export function ImportFlow() {
  const adapter = useApi();
  const terminalJob = (job: { status: string }) =>
    ["completed", "failed", "cancelled", "timed-out", "partial"].includes(job.status);
  const params = useSearchParams();
  const router = useRouter();
  const cache = useQueryClient();
  const project = params.get("project") ?? "";
  const jobId = params.get("job") ?? "";
  const snapshot = params.get("snapshot") ?? "";
  const [source, setSource] = useState<"zip" | "github">("zip");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [commit, setCommit] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState("");
  const [key, setKey] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    if (snapshot) {
      const stored = sessionStorage.getItem(`analysis:${snapshot}`) ?? crypto.randomUUID();
      sessionStorage.setItem(`analysis:${snapshot}`, stored);
      setKey(stored);
    }
  }, [snapshot]);
  const create = useMutation({
    mutationFn: () => adapter.execute("createProject", { name }),
    onSuccess: (p) => {
      setName("");
      cache.invalidateQueries({ queryKey: ["api", "projects"] });
      router.push(contextHref("/import", p.id));
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
      router.push(contextHref("/import", project, "", { snapshot: s.id }));
      setFile(null);
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
    onSuccess: (s) => router.push(contextHref("/import", project, "", { snapshot: s.id })),
  });
  const analyze = useMutation({
    mutationFn: () =>
      adapter.execute("startAnalysis", {
        projectId: project,
        snapshotId: snapshot,
        idempotencyKey: key,
      }),
    onSuccess: (j) => router.push(contextHref("/import", project, "", { snapshot, job: j.id })),
  });
  const job = useQuery({
    queryKey: ["api", "analysisJob", { jobId, project, snapshot }],
    queryFn: async ({ signal }) => {
      const j = await adapter.execute("analysisJob", { jobId }, signal);
      if (j.projectId !== project || (snapshot && j.snapshotId !== snapshot))
        throw new ApiError("contract", 502);
      return j;
    },
    enabled: !!jobId,
    refetchInterval: (query) =>
      query.state.error || (query.state.data && terminalJob(query.state.data)) ? false : 1500,
  });
  const cancel = useMutation({
    mutationFn: () => adapter.execute("cancelAnalysis", { jobId }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["api", "analysisJob", { jobId, project, snapshot }] }),
  });

  function newAnalysis() {
    const next = crypto.randomUUID();
    sessionStorage.setItem(`analysis:${snapshot}`, next);
    setKey(next);
    analyze.reset();
    router.push(contextHref("/import", project, "", { snapshot }));
  }
  const model = job.data?.modelId;
  useEffect(() => {
    if (model)
      cache.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "api" && ["modelVersions", "model"].includes(String(q.queryKey[1])),
      });
  }, [model, project, cache]);
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
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={`${panel} space-y-4`}>
        <h2 className="font-semibold">Import & Analyze</h2>
        <p className="text-sm text-muted-foreground">
          Import Java or C# from a ZIP or GitHub repository, then analyze the snapshot.
        </p>
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
                    {branches.isFetching ? "Đang tải các nhánh…" : "Nhập URL GitHub để chọn nhánh"}
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
                  Đã tải 1.000 nhánh đầu. Dùng Commit SHA cho nhánh ngoài danh sách.
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
                  Tải lại nhánh
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
        {snapshot && (
          <div className="space-y-3 border-t pt-4">
            <p className="break-all text-sm">Snapshot: {snapshot}</p>
            <Button
              disabled={!key || analyze.isPending || !!jobId}
              onClick={() => analyze.mutate()}
            >
              {analyze.isPending ? "Requesting analysis…" : "Analyze snapshot"}
            </Button>
            <ErrorNotice error={analyze.error} />
            <p className="text-xs text-muted-foreground">
              A retry of this request reuses the same idempotency key.
            </p>
          </div>
        )}
      </section>
      <section className={`${panel} space-y-4`} aria-live="polite">
        <h2 className="font-semibold">Analysis status</h2>
        {!jobId ? (
          <p>No analysis requested.</p>
        ) : (
          <>
            <p className="break-all text-xs">Job: {jobId}</p>
            <p className="text-lg font-semibold">{job.data?.status ?? "Loading…"}</p>
            {job.data?.analysisState && <p>Analysis: {job.data.analysisState}</p>}
            {job.data?.workerStatus && <p>C# Worker: {job.data.workerStatus}</p>}
            {job.data?.message && <p className="whitespace-pre-wrap text-sm">{job.data.message}</p>}
            <ErrorNotice error={job.error || cancel.error} />
            {job.error && (
              <Button variant="outline" onClick={() => job.refetch()}>
                Retry status
              </Button>
            )}
            {job.data && !terminalJob(job.data) && (
              <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel analysis
              </Button>
            )}
            {job.data && terminalJob(job.data) && snapshot && (
              <Button variant="outline" onClick={newAnalysis}>
                Prepare a new analysis
              </Button>
            )}
            {model && (
              <Button asChild>
                <Link href={contextHref("/architecture", project, model)}>Open architecture</Link>
              </Button>
            )}
            {job.data && terminalJob(job.data) && !model && (
              <p>No published model is available for this job.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

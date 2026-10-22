"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  githubImportRequest,
  contextHref,
  publishedModel,
  terminalJob,
  validateJobScope,
  type Job,
  type Project,
} from "@/lib/mainflow-api";
import { ErrorNotice, panel } from "./shell";
export function ImportFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const cache = useQueryClient();
  const project = params.get("project") ?? "";
  const jobId = params.get("job") ?? "";
  const snapshot = params.get("snapshot") ?? "";
  const [source, setSource] = useState<"zip" | "github">("zip");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
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
    mutationFn: () =>
      api<Project>("projects", {
        method: "POST",
        body: JSON.stringify({ name, projectType: "PERSONAL" }),
      }),
    onSuccess: (p) => {
      cache.invalidateQueries({ queryKey: ["projects"] });
      router.push(contextHref("/import", p.id));
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !project) throw new Error("Choose project and ZIP first");
      const body = new FormData();
      body.append("file", file);
      return api<{ snapshotId: string; jobId?: string }>(`analyzer/upload?projectId=${project}`, {
        method: "POST",
        body,
      });
    },
    onSuccess: (s) => {
      router.push(contextHref("/import", project, "", { snapshot: s.snapshotId }));
      setFile(null);
    },
  });
  const github = useMutation({
    mutationFn: () =>
      api<{ snapshotId: string }>("analyzer/import/github", {
        method: "POST",
        body: JSON.stringify(githubImportRequest(project, repository, branch, commit)),
      }),
    onSuccess: (s) => router.push(contextHref("/import", project, "", { snapshot: s.snapshotId })),
  });
  const analyze = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>(`analyzer/snapshots/${snapshot}/analyze`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
      }),
    onSuccess: (j) => router.push(contextHref("/import", project, "", { snapshot, job: j.jobId })),
  });
  const job = useQuery({
    queryKey: ["job", project, snapshot, jobId],
    queryFn: ({ signal }) =>
      api<Job>(`analyzer/jobs/${jobId}`, { signal }).then((j) =>
        validateJobScope(j, project, snapshot),
      ),
    enabled: !!jobId,
    refetchInterval: (query) =>
      query.state.error || (query.state.data && terminalJob(query.state.data)) ? false : 1500,
  });
  const cancel = useMutation({
    mutationFn: () => api(`analyzer/jobs/${jobId}/cancel`, { method: "POST" }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["job", project, snapshot, jobId] }),
  });
  const coverage = job.data?.resultManifest?.["dotnetCoverage"] as { mode?: string } | undefined;
  function newAnalysis() {
    const next = crypto.randomUUID();
    sessionStorage.setItem(`analysis:${snapshot}`, next);
    setKey(next);
    analyze.reset();
    router.push(contextHref("/import", project, "", { snapshot }));
  }
  const model = job.data && publishedModel(job.data);
  useEffect(() => {
    if (model) cache.invalidateQueries({ queryKey: ["models", project] });
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
                onChange={(e) => setRepository(e.target.value)}
                disabled={!project || github.isPending}
              />
            </label>
            <label className="block text-sm">
              Branch
              <Input
                className="mt-2"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={github.isPending}
              />
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
            <Button disabled={!project || !repository.trim() || github.isPending}>
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
            {job.data?.dotnetStatus && <p>C# Worker: {job.data.dotnetStatus}</p>}
            {coverage?.mode && (
              <p className="text-sm text-muted-foreground">
                C# coverage: {coverage.mode}. Review inferred mappings and warnings before using
                this model.
              </p>
            )}
            {job.data?.errorDiagnostics && (
              <p className="whitespace-pre-wrap text-sm">{job.data.errorDiagnostics}</p>
            )}
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

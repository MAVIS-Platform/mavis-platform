import type { ApiAdapter, Response } from "@/lib/api/contracts";
import { githubImportRequest } from "@/lib/mainflow-api";

type Source =
  | { kind: "github"; repositoryUrl: string; branchName: string; commitSha: string }
  | { kind: "zip"; file: File };
export type ImportWorkflowState = {
  project?: Response<"createProject">;
  snapshot?: {
    projectId: string;
    sourceKey: string | File;
    snapshotId: string;
    analysisKey: string;
  };
};
export async function importAndAnalyze(
  api: ApiAdapter,
  input: { projectId?: string; name?: string; source: Source },
  state: ImportWorkflowState,
  events: {
    stage?: (stage: string) => void;
    created?: (project: Response<"createProject">) => void;
    imported?: (projectId: string, snapshotId: string) => void;
  } = {},
) {
  const source = input.source;
  const github =
    source.kind === "github"
      ? githubImportRequest("", source.repositoryUrl, source.branchName, source.commitSha)
      : null;
  const sourceKey =
    source.kind === "zip"
      ? source.file
      : JSON.stringify([github!.repositoryUrl, github!.branchName, github!.commitSha ?? ""]);
  let projectId = input.projectId || state.project?.id;
  if (!projectId) {
    if (!github || !input.name?.trim())
      throw new Error("A project name and GitHub repository are required.");
    events.stage?.("Creating project…");
    state.project = await api.execute("createProject", {
      name: input.name.trim(),
      repositoryUrl: github.repositoryUrl,
      defaultBranch: github.branchName,
    });
    projectId = state.project.id;
    events.created?.(state.project);
  }
  if (
    !state.snapshot ||
    state.snapshot.projectId !== projectId ||
    state.snapshot.sourceKey !== sourceKey
  ) {
    events.stage?.("Importing snapshot…");
    const snapshot =
      source.kind === "zip"
        ? await api.execute("importSource", {
            projectId,
            name: source.file.name,
            fileName: source.file.name,
            size: source.file.size,
            archive: source.file,
          })
        : await api.execute("importGithub", {
            ...github!,
            projectId,
            commitSha: github!.commitSha ?? "",
          });
    if (snapshot.projectId !== projectId)
      throw new Error("Imported snapshot does not belong to this project.");
    state.snapshot = {
      projectId,
      sourceKey,
      snapshotId: snapshot.id,
      analysisKey: crypto.randomUUID(),
    };
    events.imported?.(projectId, snapshot.id);
  }
  events.stage?.("Starting analysis…");
  const job = await api.execute("startAnalysis", {
    projectId,
    snapshotId: state.snapshot.snapshotId,
    idempotencyKey: state.snapshot.analysisKey,
  });
  if (job.projectId !== projectId || job.snapshotId !== state.snapshot.snapshotId)
    throw new Error("Analysis job does not match the imported snapshot.");
  return { projectId, snapshotId: state.snapshot.snapshotId, jobId: job.id };
}

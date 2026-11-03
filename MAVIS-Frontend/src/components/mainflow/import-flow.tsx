"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/shared/request-state";
import { githubImportRequest } from "@/lib/mainflow-api";
import { importAndAnalyze, refreshImportProjectLists, type ImportWorkflowState } from "@/features/projects/import-workflow";
import type { Response } from "@/lib/api/contracts";
import { GuidedTarget } from "@/components/shared/guided-target";
import { useLocale } from "@/lib/i18n/locale-context";

type ImportResult = { projectId: string; snapshotId: string; jobId: string };
export function ImportFlow({
  projectId = "",
  onComplete,
  onBusyChange,
  onCancel,
  tourStep = null,
  onTourStepChange,
}: {
  projectId?: string;
  onComplete?: (result: ImportResult) => void;
  onBusyChange?: (busy: boolean) => void;
  onCancel?: () => void;
  tourStep?: number | null;
  onTourStepChange?: (step: number | null) => void;
} = {}) {
  const { t } = useLocale();
  const guide = (step: number, title: string, description: string, nextDisabled = false) => ({
    active: tourStep === step,
    step,
    title,
    description,
    nextDisabled,
    onNext: () => onTourStepChange?.(step === 5 ? null : step + 1),
    onBack: () => onTourStepChange?.(step - 1),
    onSkip: () => onTourStepChange?.(null),
    last: step === 5,
  });
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
    workflow = useRef<ImportWorkflowState>({});
  const [importedSnapshot, setImportedSnapshot] = useState("");
  const importedSource = useRef<Parameters<typeof importAndAnalyze>[1]["source"] | null>(null);
  const sourceType = boundRepository ? "github" : source;
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
  const discoveredBranches = refs.data?.branches ?? [];
  const branches =
    refs.data?.defaultBranch && !discoveredBranches.includes(refs.data.defaultBranch)
      ? [refs.data.defaultBranch, ...discoveredBranches]
      : discoveredBranches;
  const preferredBranch = project.data?.defaultBranch || created?.defaultBranch || "";
  const selectedBranch =
    importedSnapshot && importedSource.current?.kind === "github"
      ? importedSource.current.branchName
      : branches.includes(branch)
        ? branch
        : branches.includes(preferredBranch)
          ? preferredBranch
          : refs.data?.defaultBranch || created?.defaultBranch || "";
  const branchesCurrent = repositoryUrl === lookupUrl && refs.isSuccess;
  const run = useMutation({
    mutationFn: async () => {
      if (projectId && !project.data)
        throw new Error("Project details are unavailable. Refresh and try again.");
      if (
        !projectId &&
        !workflow.current.project &&
        sourceType === "github" &&
        (!name.trim() || !repositoryUrl || !branchesCurrent || !selectedBranch)
      )
        throw new Error(
          t(
            "Enter a project name and a valid public GitHub repository.",
            "Vui lòng nhập tên dự án và kho lưu trữ GitHub công khai hợp lệ.",
          ),
        );
      if (
        !projectId &&
        !workflow.current.project &&
        sourceType === "zip" &&
        (!name.trim() || !file)
      )
        throw new Error(
          t(
            "Enter a project name and select a ZIP archive.",
            "Vui lòng nhập tên dự án và chọn tệp nén ZIP.",
          ),
        );
      const candidate: Parameters<typeof importAndAnalyze>[1]["source"] =
        sourceType === "github"
          ? {
              kind: "github",
              repositoryUrl,
              branchName: selectedBranch || project.data?.defaultBranch || "main",
              commitSha: commit.trim(),
            }
          : { kind: "zip", file: file! };
      const source =
        workflow.current.snapshot && importedSource.current ? importedSource.current : candidate;
      importedSource.current = source;
      return importAndAnalyze(api, { projectId, name, source }, workflow.current, {
        stage: setStage,
        created: (next) => {
          setCreated(next);
          cache.setQueryData(["api", "project", { projectId: next.id }], next);
          void refreshImportProjectLists(cache);
        },
        imported: (target, snapshotId) => {
          setImportedSnapshot(snapshotId);
          void cache.invalidateQueries({ queryKey: ["api", "snapshots"] });
          void cache.invalidateQueries({ queryKey: ["api", "project", { projectId: target }] });
          void refreshImportProjectLists(cache);
        },
      });
    },
    onSuccess: (result) => {
      void cache.invalidateQueries({ queryKey: ["api", "analysisJobs"] });
      void cache.invalidateQueries({ queryKey: ["api", "projectAnalysisActivity"] });
      onComplete?.(result);
    },
    onSettled: () => setStage(""),
  });
  const busy = run.isPending;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const valid =
    !!importedSnapshot ||
    (sourceType === "zip"
      ? !!file && !validation && (projectId ? true : !!name.trim())
      : !!repositoryUrl &&
        (projectId
          ? !!commit.trim() || (branchesCurrent && !!selectedBranch)
          : !!name.trim() && !!selectedBranch && (branchesCurrent || !!created)));
  async function submit() {
    if (inFlight.current || !valid) return;
    onTourStepChange?.(null);
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
        <GuidedTarget
          {...guide(
            1,
            t("Name your project", "Đặt tên dự án"),
            t(
              "Choose a name you can recognize in My Projects. Enter a name, then select Next.",
              "Đặt tên để dễ nhận biết trong danh sách dự án. Nhập tên rồi bấm Tiếp tục.",
            ),
            !name.trim(),
          )}
        >
          <label className="block space-y-2 text-sm font-medium">
            <span>{t("Project name", "Tên dự án")}</span>
            <Input
              aria-label={t("Project name", "Tên dự án")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Name your project", "Đặt tên cho dự án")}
              maxLength={255}
              required
              disabled={busy || !!created}
            />
          </label>
        </GuidedTarget>
      )}
      {!boundRepository && (
        <div className="flex gap-2" role="group" aria-label={t("Snapshot source", "Nguồn mã nguồn")}>
          <Button
            type="button"
            size="sm"
            variant={source === "github" ? "default" : "outline"}
            disabled={busy || !!importedSnapshot}
            onClick={() => setSource("github")}
          >
            {t("GitHub repository", "Kho lưu trữ GitHub")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={source === "zip" ? "default" : "outline"}
            disabled={busy || !!importedSnapshot}
            onClick={() => setSource("zip")}
          >
            {t("Upload ZIP", "Tải lên tệp ZIP")}
          </Button>
        </div>
      )}
      {sourceType === "github" ? (
        <>
          {!boundRepository && (
            <GuidedTarget
              {...guide(
                2,
                t("Add your GitHub repository", "Thêm repository GitHub"),
                t(
                  "Paste a public repository URL, such as https://github.com/owner/repository. MAVIS will load its branches. If loading fails, check the URL or retry below.",
                  "Dán URL repository công khai, ví dụ https://github.com/owner/repository. MAVIS sẽ tải danh sách nhánh. Nếu tải lỗi, kiểm tra URL hoặc thử lại bên dưới.",
                ),
                !repositoryUrl || !branchesCurrent || !selectedBranch,
              )}
            >
              <label className="block space-y-2 text-sm font-medium">
                <span>
                  {projectId
                    ? t("Link original GitHub repository", "Liên kết kho GitHub gốc")
                    : t("GitHub repository URL", "Đường dẫn kho GitHub")}
                </span>
                <Input
                  aria-label={t("GitHub repository URL", "Đường dẫn kho GitHub")}
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
            </GuidedTarget>
          )}
          {(boundRepository || repository.trim()) && !repositoryUrl && (
            <p className="text-xs text-destructive">
              {t(
                "Use a GitHub repository root URL: https://github.com/owner/repository",
                "Sử dụng đường dẫn gốc của kho GitHub: https://github.com/owner/repository",
              )}
            </p>
          )}
          <>
            <GuidedTarget
              {...guide(
                3,
                t("Choose a branch", "Chọn nhánh"),
                t(
                  "Choose the branch to analyze. The repository's default branch is selected initially. You can keep it or select another branch.",
                  "Chọn nhánh cần phân tích. Nhánh mặc định được chọn sẵn; bạn có thể giữ nguyên hoặc chọn nhánh khác.",
                ),
                !branchesCurrent || !selectedBranch,
              )}
            >
              <div className="block space-y-2 text-sm font-medium">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="import-branch-select">{t("Branch", "Nhánh")}</label>
                  <button
                    type="button"
                    aria-label={t("Reload branches", "Tải lại danh sách nhánh")}
                    title={t("Reload branches", "Tải lại danh sách nhánh")}
                    disabled={busy || !!importedSnapshot || !repositoryUrl || refs.isFetching}
                    onClick={() => {
                      setLookup(repositoryUrl);
                      if (lookupUrl === repositoryUrl) void refs.refetch();
                    }}
                    className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <RefreshCw className={refs.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
                  </button>
                </div>
                <select
                  id="import-branch-select"
                  aria-label={t("Branch", "Nhánh")}
                  className="h-10 w-full rounded-md border bg-card px-3 text-sm"
                  value={selectedBranch}
                  disabled={busy || !!importedSnapshot || !branchesCurrent || !!commit.trim()}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  {!branchesCurrent && (
                    <option value="">
                      {refs.isFetching
                        ? t("Loading branches…", "Đang tải danh sách nhánh…")
                        : repositoryUrl
                          ? t("Branches unavailable", "Không có sẵn danh sách nhánh")
                          : t("Enter a repository URL first", "Nhập đường dẫn kho trước")}
                    </option>
                  )}
                  {importedSnapshot && selectedBranch && !branches.includes(selectedBranch) && (
                    <option value={selectedBranch}>
                      {selectedBranch} ({t("imported", "đã nhập")})
                    </option>
                  )}
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                      {b === refs.data?.defaultBranch ? ` (${t("default", "mặc định")})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </GuidedTarget>
            <GuidedTarget
              {...guide(
                4,
                t("Pin a commit (optional)", "Chọn commit cụ thể (không bắt buộc)"),
                t(
                  "Leave this empty to analyze the latest commit on your branch. To pin a version, enter its full 40-character commit SHA; this overrides the branch selection.",
                  "Để trống để phân tích commit mới nhất của nhánh. Nếu muốn cố định phiên bản, nhập SHA đủ 40 ký tự; SHA sẽ được ưu tiên thay cho nhánh.",
                ),
                !!commit.trim() && !/^[a-fA-F0-9]{40}$/.test(commit),
              )}
            >
              <label className="block space-y-2 text-sm font-medium">
                <span>{t("Commit SHA (optional)", "Commit SHA (tùy chọn)")}</span>
                <Input
                  aria-label={t("Commit SHA", "Commit SHA")}
                  placeholder={t("Full 40-character SHA", "Mã SHA đủ 40 ký tự")}
                  value={commit}
                  onChange={(e) => setCommit(e.target.value)}
                  pattern="[a-fA-F0-9]{40}"
                  disabled={busy || !!importedSnapshot}
                />
                <span className="block text-xs font-normal text-muted-foreground">
                  {t(
                    "Leave empty for the latest commit on the selected branch. A SHA overrides the branch selection.",
                    "Để trống để lấy commit mới nhất trên nhánh đã chọn. SHA sẽ ghi đè lựa chọn nhánh.",
                  )}
                </span>
              </label>
            </GuidedTarget>
          </>
          {refs.error && <ErrorState error={refs.error} onRetry={() => void refs.refetch()} />}
          {refs.data?.truncated && (
            <p className="text-xs text-muted-foreground">
              {t(
                "The branch list is truncated. You can pin a commit SHA for an unlisted branch.",
                "Danh sách nhánh đã bị rút gọn. Bạn có thể ghim mã commit SHA cho nhánh không có trong danh sách.",
              )}
            </p>
          )}
        </>
      ) : (
        <label className="block space-y-2 text-sm font-medium">
          <span>{t("ZIP archive (up to 100 MB)", "Tệp nén ZIP (tối đa 100 MB)")}</span>
          <Input
            aria-label={t("Source archive", "Tệp lưu trữ mã nguồn")}
            type="file"
            accept=".zip"
            required
            disabled={busy || !!importedSnapshot}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              const error =
                f &&
                (!f.name.toLowerCase().endsWith(".zip") || !f.size || f.size > 100 * 1024 * 1024)
                  ? t("Choose a non-empty ZIP up to 100 MB.", "Vui lòng chọn tệp ZIP hợp lệ không rỗng và tối đa 100 MB.")
                  : "";
              setValidation(error);
              setFile(error ? null : f);
            }}
          />
          <span className="block text-xs font-normal text-muted-foreground">
            {t(
              "Select a ZIP file containing project source code (e.g. Java, Spring, microservices). Maximum file size is 100 MB.",
              "Chọn tệp ZIP chứa mã nguồn dự án (ví dụ Java, Spring, microservices). Dung lượng tối đa 100 MB.",
            )}
          </span>
        </label>
      )}
      {validation && (
        <p role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      )}
      {importedSnapshot && run.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Snapshot imported. Retry analysis will reuse this snapshot and the same request key.",
            "Đã nhập bản chụp. Thử lại phân tích sẽ tái sử dụng bản chụp này cùng mã yêu cầu tương ứng.",
          )}
        </p>
      )}
      {created && !importedSnapshot && run.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Project created. Retry will import into the same project; its name and repository are now fixed.",
            "Đã tạo dự án. Thử lại sẽ nhập vào cùng dự án; tên và kho lưu trữ hiện đã được cố định.",
          )}
        </p>
      )}
      {run.error && <ErrorState error={run.error} />}
      <div className="flex flex-wrap items-center gap-3">
        <GuidedTarget
          {...guide(
            5,
            t("Ready to import", "Sẵn sàng nhập dự án"),
            t(
              "Click Import & analyze when you are ready to create the project and start analysis. Finish tour only closes this guide; it does not submit the form. Keep the dialog open while importing.",
              "Khi sẵn sàng, bấm Import & analyze để tạo dự án và bắt đầu phân tích. Xong hướng dẫn chỉ đóng hướng dẫn, không gửi biểu mẫu. Giữ cửa sổ mở trong lúc nhập.",
            ),
          )}
        >
          <Button type="submit" disabled={busy || !valid}>
            {busy
              ? (stage ? t(stage) : t("Working…", "Đang xử lý…"))
              : importedSnapshot
                ? t("Retry analysis", "Thử lại phân tích")
                : created
                  ? t("Retry import & analyze", "Thử lại nhập & phân tích")
                  : t("Import & analyze", "Nhập & phân tích")}
          </Button>
        </GuidedTarget>
        {onCancel && (
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t("Cancel", "Hủy")}
          </Button>
        )}
        {busy && (
          <p role="status" className="text-xs text-muted-foreground">
            {t("Keep this dialog open until the import finishes.", "Giữ cửa sổ này mở cho đến khi quá trình nhập hoàn tất.")}
          </p>
        )}
      </div>
    </form>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi, useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/shared/forms";
import { StatusLabel } from "@/components/shared/data";
import type { Assignment } from "./requirements";

export type CuratedSampleRepo = {
  id: string;
  name: string;
  stack: string;
  url: string;
  summaryEn: string;
  summaryVi: string;
};

export const CURATED_SAMPLE_REPOS: readonly CuratedSampleRepo[] = [
  {
    id: "moc-huong-shop",
    name: "Moc-Huong-Shop",
    stack: "Java 21 · Spring Boot 3",
    url: "https://github.com/MAVIS-Platform/Moc-Huong-Shop",
    summaryEn: "E-commerce microservices system with Gateway, Orders, Inventory, and Shipping.",
    summaryVi: "Hệ thống thương mại điện tử microservices gồm Gateway, Orders, Inventory và Shipping.",
  },
  {
    id: "mavis-commerce-seed",
    name: "mavis-commerce-seed",
    stack: "Java 21 · Spring Boot 3",
    url: "https://github.com/MAVIS-Platform/mavis-commerce-seed",
    summaryEn: "Reference microservices architecture with clean DDD boundaries and Outbox events.",
    summaryVi: "Kho mã nguồn chuẩn Java DDD tách service & Outbox event.",
  },
  {
    id: "fruit-shop-dotnet",
    name: "fruit-shop-dotnet-microservices",
    stack: ".NET 8 · C# Microservices",
    url: "https://github.com/MAVIS-Platform/fruit-shop-dotnet-microservices",
    summaryEn: "C#/.NET distributed services with YARP Gateway and OpenTelemetry instrumentation.",
    summaryVi: "Hệ thống C#/.NET phân tán với YARP Gateway và OpenTelemetry.",
  },
  {
    id: "mavis-studio-live-demo",
    name: "mavis-studio-live-demo",
    stack: "Java · Docker Studio Live",
    url: "https://github.com/MAVIS-Platform/mavis-studio-live-demo",
    summaryEn: "Ready-to-run Studio Live sandbox for fault injection and scaling experiments.",
    summaryVi: "Repo chuẩn Studio Live để thực hành giả lập sự cố và scale container.",
  },
  {
    id: "mavis-studio-live-seed",
    name: "mavis-studio-live-seed",
    stack: "Java · Docker Studio Live",
    url: "https://github.com/MAVIS-Platform/mavis-studio-live-seed",
    summaryEn: "Minimal Studio Live starter topology for custom course labs.",
    summaryVi: "Khung khởi tạo Studio Live gọn nhẹ cho giảng viên tự thiết kế Lab.",
  },
  {
    id: "mavis-hypermesh-enterprise",
    name: "mavis-hypermesh-enterprise",
    stack: "Java 21 · Docker Studio Live",
    url: "https://github.com/MAVIS-Platform/mavis-hypermesh-enterprise",
    summaryEn: "Enterprise 10-service e-commerce mesh with Fraud, Pricing, Outbox, and Saga.",
    summaryVi: "Hệ thống microservices doanh nghiệp 10 dịch vụ với Fraud, Pricing, Outbox và Saga.",
  },
  {
    id: "mavis-omnishop-studio",
    name: "mavis-omnishop-studio",
    stack: "Java + .NET 8 · Polyglot Studio Live",
    url: "https://github.com/MAVIS-Platform/mavis-omnishop-studio",
    summaryEn: "Polyglot Java & .NET Studio Live architecture with Kafka and multi-container fault injection.",
    summaryVi: "Hệ thống đa ngôn ngữ Java & .NET Studio Live chạy Kafka và thực nghiệm lỗi đa container.",
  },
  {
    id: "eshop-bookstore-dotnet-microservices",
    name: "eshop-bookstore-dotnet-microservices",
    stack: ".NET 8 · C# Microservices",
    url: "https://github.com/MAVIS-Platform/eshop-bookstore-dotnet-microservices",
    summaryEn: "Cloud Bookstore .NET 8 microservices with YARP Gateway, EF Core, Redis, RabbitMQ, and OTel.",
    summaryVi: "Hệ thống nhà sách .NET 8 microservices với YARP Gateway, EF Core, Redis, RabbitMQ và OpenTelemetry.",
  },
];

export function AssignmentSourcePicker({
  workspaceId,
  title,
  initial,
  initialRepositoryUrl,
  onChange,
  onVersionChange,
  onAnalysisComplete,
  usageContext = "lab",
}: {
  workspaceId: string;
  title: string;
  initial?: Assignment["referenceSource"];
  initialRepositoryUrl?: string | undefined;
  onChange: (modelId: string, pending: boolean) => void;
  onVersionChange?: (
    version: { modelId: string; projectId: string; snapshotId: string },
    pending: boolean,
  ) => void;
  onAnalysisComplete?: (version: {
    modelId: string;
    projectId: string;
    snapshotId: string;
  }) => void;
  usageContext?: "lab" | "repository";
}) {
  const api = useApi(),
    cache = useQueryClient();
  const { t } = useLocale();
  const [mode, setMode] = useState(
    initialRepositoryUrl ? "github" : initial?.projectId ? "existing" : "github",
  ),
    [repository, setRepository] = useState(initialRepositoryUrl ?? "");
  const [lookup, setLookup] = useState(initialRepositoryUrl?.trim() ?? ""),
    [branch, setBranch] = useState(""),
    [commit, setCommit] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [otherProjectId, setOtherProjectId] = useState("");
  const [modelId, setModelId] = useState(initial?.modelId ?? "");
  const [snapshotId, setSnapshotId] = useState(initial?.snapshotId ?? "");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false),
    createdProject = useRef("");
  const onChangeRef = useRef(onChange);
  const onVersionChangeRef = useRef(onVersionChange);
  const onAnalysisCompleteRef = useRef(onAnalysisComplete);
  onChangeRef.current = onChange;
  onVersionChangeRef.current = onVersionChange;
  onAnalysisCompleteRef.current = onAnalysisComplete;
  const lastEmittedRef = useRef("");
  const completedAnalysisRef = useRef("");
  const projects = useApiQuery("workspaceProjects", { workspaceId });
  const allProjects = useApiQuery("projects", {});
  const versions = useApiQuery("modelVersions", { projectId }, { enabled: !!projectId });
  const snapshots = useApiQuery("snapshots", { projectId }, { enabled: !!projectId });
  useEffect(() => {
    if (!initialRepositoryUrl) return;
    setMode("github");
    setRepository(initialRepositoryUrl);
    setLookup(initialRepositoryUrl.trim());
    setBranch("");
    setCommit("");
    setModelId("");
    setJobId("");
  }, [initialRepositoryUrl]);
  useEffect(() => {
    const timer = setTimeout(() => setLookup(repository.trim()), 500);
    return () => clearTimeout(timer);
  }, [repository]);
  const validGithubUrl = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+/i.test(lookup);
  const branches = useApiQuery(
    "githubBranches",
    { repositoryUrl: lookup },
    { enabled: mode === "github" && validGithubUrl },
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
      if (!title.trim()) {
        throw new Error(
          t("Enter the Lab title in Step 1 first.", "Hãy nhập tên Lab ở Bước 1 trước."),
        );
      }
      if (
        mode === "zip" &&
        (!file || !/\.zip$/i.test(file.name) || !file.size || file.size > 100 * 1024 * 1024)
      ) {
        throw new Error(
          t(
            "Choose a non-empty ZIP archive up to 100 MB.",
            "Hãy chọn file ZIP hợp lệ không rỗng tối đa 100 MB.",
          ),
        );
      }
      if (
        mode === "github" &&
        (!selectedBranch || lookup !== repository.trim() || !branches.isSuccess)
      ) {
        throw new Error(
          t(
            "Wait for the repository branches, then select a branch.",
            "Đợi tải danh sách nhánh rồi chọn nhánh cần phân tích.",
          ),
        );
      }
      if (mode === "github" && commit && !/^[a-f0-9]{40}$/i.test(commit.trim())) {
        throw new Error(
          t("Use the full 40-character commit SHA.", "Hãy nhập đủ 40 ký tự Commit SHA."),
        );
      }
      setSnapshotId("");
      setModelId("");
      setJobId("");
      setMessage("");
      let target = projectId || createdProject.current;
      if (!target) {
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
      void cache.invalidateQueries({ queryKey: ["api", "workspaceProjects"] });
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
      if (!targetSnapshot) {
        throw new Error(
          t("No snapshot selected for analysis.", "Chưa chọn snapshot để phân tích."),
        );
      }
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
    if (completedAnalysisRef.current !== job.data.modelId) {
      completedAnalysisRef.current = job.data.modelId;
      void cache.invalidateQueries({ queryKey: ["api", "workspaceProjects"] });
      onAnalysisCompleteRef.current?.({
        modelId: job.data.modelId,
        projectId,
        snapshotId,
      });
    }
    setMessage(
      job.data.status === "partial"
        ? usageContext === "repository"
          ? t(
              "Analysis completed with limitations. Review the generated version before continuing.",
              "Phân tích hoàn tất nhưng có cảnh báo. Hãy kiểm tra phiên bản được tạo trước khi tiếp tục.",
            )
          : t(
              "Analysis completed with limitations. Review this version before saving it to the Lab.",
              "Phân tích hoàn tất nhưng có cảnh báo. Hãy kiểm tra trước khi lưu vào Lab.",
            )
        : usageContext === "repository"
          ? t(
              "Source analyzed. This repository version is ready to use.",
              "Đã phân tích mã nguồn. Phiên bản repository này đã sẵn sàng sử dụng.",
            )
          : t(
              "Source analyzed. Click 'Save source to Lab' below to pin this version.",
              "Đã phân tích xong. Bấm 'Lưu nguồn vào Lab' bên dưới để ghim phiên bản này.",
            ),
    );
    void cache.invalidateQueries({ queryKey: ["api", "modelVersions"] });
    void cache.invalidateQueries({ queryKey: ["api", "snapshots"] });
  }, [
    job.data?.modelId,
    job.data?.status,
    job.data?.snapshotId,
    job.data?.projectId,
    snapshotId,
    projectId,
    cache,
    t,
    usageContext,
  ]);
  const busy = prepare.isPending || retry.isPending || running;
  const pending = (mode !== "existing" || !!projectId) && !modelId;
  useEffect(() => {
    const busyOrPending = busy || pending;
    const key = `${modelId}|${projectId}|${snapshotId}|${busyOrPending}`;
    if (key === lastEmittedRef.current) return;
    lastEmittedRef.current = key;
    onChangeRef.current(modelId, busyOrPending);
    onVersionChangeRef.current?.({ modelId, projectId, snapshotId }, busyOrPending);
  }, [modelId, busy, pending, projectId, snapshotId]);
  const imported = snapshots.data?.find((s) => s.id === snapshotId);
  function changeMode(next: string) {
    setMode(next);
    setProjectId(next === "existing" ? (initial?.projectId ?? "") : "");
    setOtherProjectId("");
    setModelId(next === "existing" ? (initial?.modelId ?? "") : "");
    setSnapshotId(next === "existing" ? (initial?.snapshotId ?? "") : "");
    setJobId("");
    setMessage("");
    prepare.reset();
    retry.reset();
  }
  const otherWorkspaceProjects = (allProjects.data ?? []).filter(
    (p) =>
      p.workspaceId !== workspaceId &&
      (p.projectType === "TEACHER_REFERENCE" || p.isReferenceTemplate) &&
      /^https?:\/\/github\.com\//i.test(p.repository ?? ""),
  );
  const selectedOtherProject = otherWorkspaceProjects.find((p) => p.id === otherProjectId);
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
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["github", t("GitHub repository", "Repo GitHub")],
            ["zip", t("Upload ZIP", "Tải file ZIP")],
            ["existing", t("Imported repo", "Repo đã nhập")],
          ] as const
        ).map(([id, label]) => (
          <Button
            type="button"
            key={id}
            size="sm"
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
            label={t("Reference project in this class", "Dự án tham chiếu trong lớp")}
            value={projectId}
            onChange={(value) => {
              setProjectId(value);
              setOtherProjectId("");
              setModelId("");
              setSnapshotId("");
            }}
            options={[
              { value: "", label: t("Select an analyzed project…", "Chọn dự án đã phân tích…") },
              ...(projects.data ?? [])
                .filter((p) => p.projectType === "TEACHER_REFERENCE" || p.isReferenceTemplate)
                .map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          {otherWorkspaceProjects.length > 0 && (
            <div className="space-y-2 rounded-lg border border-dashed bg-background/60 p-3">
              <SelectField
                label={t(
                  "Reuse from your other classes",
                  "Dùng lại dự án từ lớp học khác của bạn",
                )}
                value={otherProjectId}
                onChange={(value) => {
                  setOtherProjectId(value);
                  if (value) {
                    setProjectId("");
                    setModelId("");
                    setSnapshotId("");
                  }
                }}
                options={[
                  {
                    value: "",
                    label: t(
                      "Choose a reference project from another class…",
                      "Chọn dự án tham chiếu từ lớp khác…",
                    ),
                  },
                  ...otherWorkspaceProjects.map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                ]}
              />
              {selectedOtherProject && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono text-muted-foreground">
                    {selectedOtherProject.repository}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const repoUrl = selectedOtherProject.repository.trim();
                      setMode("github");
                      setProjectId("");
                      setOtherProjectId("");
                      setRepository(repoUrl);
                      setLookup(repoUrl);
                      setBranch(selectedOtherProject.defaultBranch ?? "");
                      setCommit("");
                      setModelId("");
                      setJobId("");
                    }}
                  >
                    {t("Clone into this class & analyze", "Sao chép & phân tích vào lớp này")}
                  </Button>
                </div>
              )}
            </div>
          )}
          {projectId &&
            (sortedVersions.length > 0 ? (
              <SelectField
                label={t(
                  "Analyzed revision (Model Version)",
                  "Phiên bản đã phân tích (Model Version)",
                )}
                value={modelId}
                onChange={(value) => {
                  setModelId(value);
                  setSnapshotId(sortedVersions.find((m) => m.id === value)?.snapshotId ?? "");
                }}
                options={sortedVersions.map((m, idx) => ({
                  value: m.id,
                  label: `Revision ${m.revision}${idx === 0 ? t(" (Latest)", " (Mới nhất)") : ""} · ${snapshots.data?.find((s) => s.id === m.snapshotId)?.name ?? m.snapshotId.slice(0, 8)}`,
                }))}
              />
            ) : versions.isFetching || snapshots.isFetching ? (
              <p className="text-xs text-muted-foreground">
                {t("Loading analyzed revisions…", "Đang tải các phiên bản đã phân tích…")}
              </p>
            ) : (snapshots.data?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-background/60 p-3 text-xs">
                <span className="text-muted-foreground">
                  {t(
                    `This project has ${snapshots.data!.length} source snapshot(s) but no analyzed revision yet.`,
                    `Dự án này có ${snapshots.data!.length} bản chụp mã nguồn nhưng chưa có bản phân tích nào.`,
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const latestSnap = snapshots.data![0]!;
                    retry.mutate(latestSnap.id);
                  }}
                >
                  {t("Analyze latest snapshot", "Phân tích bản chụp mới nhất")}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-background/60 p-3 text-xs text-muted-foreground">
                {t(
                  "This project has no source code or analyzed revisions yet. Switch to GitHub repository or Upload ZIP above, or skip this step for a Theory-only Lab.",
                  "Dự án này chưa có mã nguồn hoặc bản phân tích. Hãy chuyển sang tab Repo GitHub / Tải file ZIP, hoặc bỏ qua nếu là Lab thuần lý thuyết.",
                )}
              </div>
            ))}
        </>
      ) : (
        <>
          {mode === "github" ? (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("Quick-pick MAVIS sample repositories", "Chọn nhanh kho mã nguồn mẫu MAVIS")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CURATED_SAMPLE_REPOS.map((repo) => (
                    <Button
                      key={repo.id}
                      type="button"
                      size="sm"
                      variant={repository.trim() === repo.url ? "default" : "outline"}
                      className="h-7 px-2.5 text-xs"
                      onClick={() => {
                        setRepository(repo.url);
                        setLookup(repo.url);
                        setBranch("");
                        setModelId("");
                        setJobId("");
                      }}
                    >
                      {repo.name}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1 text-sm">
                <span>{t("GitHub repository URL", "Đường dẫn GitHub repository")}</span>
                <Input
                  aria-label={t("GitHub repository URL", "Đường dẫn GitHub repository")}
                  value={repository}
                  placeholder="https://github.com/MAVIS-Platform/mavis-studio-live-demo"
                  onChange={(e) => {
                    setRepository(e.target.value);
                    setModelId("");
                    setJobId("");
                  }}
                />
              </label>
              <SelectField
                label={t("Branch", "Nhánh (Branch)")}
                value={selectedBranch}
                onChange={(value) => {
                  setBranch(value);
                  setModelId("");
                  setJobId("");
                }}
                options={[
                  {
                    value: "",
                    label: branches.isFetching
                      ? t("Loading branches…", "Đang tải danh sách nhánh…")
                      : t("Select repository branch", "Chọn nhánh repository"),
                  },
                  ...(branches.data?.branches ?? []).map((value) => ({ value, label: value })),
                ]}
              />
              <label className="block space-y-1 text-sm">
                <span>{t("Commit SHA (optional)", "Commit SHA (tùy chọn)")}</span>
                <Input
                  value={commit}
                  aria-label={t("Commit SHA", "Commit SHA")}
                  placeholder={t(
                    "Leave blank for branch HEAD or paste 40-char SHA",
                    "Để trống để lấy mới nhất hoặc dán 40 ký tự SHA",
                  )}
                  onChange={(e) => {
                    setCommit(e.target.value);
                    setModelId("");
                    setJobId("");
                  }}
                />
              </label>
            </>
          ) : (
            <label className="block space-y-1 text-sm">
              <span>{t("Project ZIP (up to 100 MB)", "File nén ZIP dự án (tối đa 100 MB)")}</span>
              <Input
                aria-label={t("Project ZIP", "File ZIP dự án")}
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
                // Mutation errors are rendered below by the picker.
              } finally {
                lock.current = false;
              }
            }}
          >
            {busy
              ? t("Importing & analyzing…", "Đang nhập & phân tích…")
              : t("Import & analyze source", "Nhập & phân tích mã nguồn")}
          </Button>
        </>
      )}
      {running && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Analyzing reference source… You can continue editing other steps while this runs.",
            "Đang phân tích mã nguồn tham chiếu… Bạn vẫn có thể chuẩn bị các bước khác.",
          )}
        </p>
      )}
      {job.data && ["failed", "cancelled", "timed-out"].includes(job.data.status) && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>
            {t("Analysis status:", "Trạng thái phân tích:")}{" "}
            <StatusLabel status={job.data.status} />
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => retry.mutate(undefined)}>
            {t("Retry analysis", "Thử phân tích lại")}
          </Button>
        </p>
      )}
      {snapshotId && !jobId && prepare.error && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            prepare.reset();
            retry.mutate(undefined);
          }}
        >
          {t("Retry analysis of imported source", "Thử phân tích lại mã nguồn vừa nhập")}
        </Button>
      )}
      {job.error && (
        <Button type="button" size="sm" variant="outline" onClick={() => void job.refetch()}>
          {t("Reconnect to analysis", "Kết nối lại tiến trình phân tích")}
        </Button>
      )}
      {modelId && (
        <p
          role="status"
          className="break-all rounded-lg border bg-background px-3 py-2 text-xs text-foreground"
        >
          {t("Selected source:", "Nguồn đang chọn:")}{" "}
          <strong>
            {imported?.name ?? initial?.projectName ?? t("Selected reference", "Dự án tham chiếu")}
          </strong>{" "}
          ·{" "}
          {modelId === initial?.modelId
            ? `Revision ${initial.revision}`
            : `Revision ${versions.data?.find((m) => m.id === modelId)?.revision ?? t("ready", "sẵn sàng")}`}
          {message ? (
            <>
              <br />
              <span className="text-muted-foreground">{message}</span>
            </>
          ) : null}
        </p>
      )}
      {[
        prepare.error,
        retry.error,
        mode === "github" ? branches.error : null,
        projects.error,
        versions.error,
        job.error,
      ]
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
  const { t } = useLocale();
  if (!source) return null;
  return (
    <section className="space-y-2 rounded-xl border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold">
        {t("Pinned reference source", "Nguồn tham chiếu đang ghim")} · {source.projectName}
      </h3>
      <dl className="grid gap-2 break-all text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("Source", "Nguồn")}</dt>
          <dd>
            {source.sourceType === "GITHUB_COMMIT"
              ? "GitHub"
              : source.sourceType === "ZIP_UPLOAD"
                ? "ZIP"
                : source.sourceType}{" "}
            {source.repositoryUrl}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Branch / commit", "Nhánh / commit")}</dt>
          <dd>
            {source.branch ??
              (source.sourceType === "GITHUB_COMMIT" || source.repositoryUrl
                ? "GitHub"
                : t("ZIP archive", "Tệp nén ZIP"))}{" "}
            · {source.commitSha ?? source.artifactHash}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Pinned analysis", "Bản phân tích đã ghim")}</dt>
          <dd>
            Revision {source.revision} · {source.modelId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Source snapshot", "Mã snapshot")}</dt>
          <dd>{source.snapshotId}</dd>
        </div>
      </dl>
      <a
        className="inline-block text-sm text-primary underline"
        href={`/api/backend/assignments/${encodeURIComponent(assignmentId)}/reference-source`}
        download
      >
        {t("Download assigned source ZIP", "Tải file ZIP mã nguồn đã ghim")}
      </a>
    </section>
  );
}

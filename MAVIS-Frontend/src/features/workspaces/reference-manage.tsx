"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, FolderGit2, GitBranch, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AssignmentSourcePicker,
  CURATED_SAMPLE_REPOS,
} from "@/features/assignments/source-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiMutation, useApiQuery, usePermission } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  CourseSetupFlowFrame,
  courseSetupStepHref,
} from "@/features/courses/course-setup-flow-navigation";

export function ReferenceManagement({ workspaceId }: { workspaceId: string }) {
  const allowed = usePermission("workspace:manage");
  const { t } = useLocale();
  const params = useSearchParams();
  const flowMode = params?.get("flow") === "setup" ? "setup" : "content";
  const [importOpen, setImportOpen] = useState(false);
  const [prefilledRepoUrl, setPrefilledRepoUrl] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [sourcePending, setSourcePending] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);
  const projects = useApiQuery("workspaceProjects", { workspaceId });
  const publishReference = useApiMutation("publishReference");
  const existingRefs = (projects.data ?? []).filter(
    (project) => project.projectType === "TEACHER_REFERENCE" || project.isReferenceTemplate,
  );
  const nextStepHref = courseSetupStepHref(
    workspaceId,
    flowMode === "setup" ? "lesson" : "arrange",
    "repository",
    flowMode,
  );

  if (!allowed) return null;

  const openWithRepo = (url = "") => {
    setPrefilledRepoUrl(url);
    setImportOpen(true);
  };

  const content = (
    <section className="space-y-6">
      {existingRefs.length > 0 && (
        <div className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {t(
                "Imported reference repositories in this class",
                "Repository đã nhập trong lớp này",
              )}
            </h3>
            <Badge variant="outline">{existingRefs.length}</Badge>
          </div>
          <ul className="divide-y rounded-xl border">
            {existingRefs.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate font-semibold">{project.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {project.repository || t("Uploaded ZIP archive", "Tệp nén ZIP")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={project.status === "ready" ? "success" : "secondary"}>
                    {project.status === "ready" ? t("Ready", "Sẵn sàng") : project.status}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openWithRepo(project.repository || "")}
                  >
                    {t("Re-import / Update", "Cập nhật")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">
              {t("Curated sample repositories", "Kho dự án mẫu có sẵn")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Pick one of the official MAVIS benchmark repositories to import & analyze directly into this class.",
                "Chọn nhanh kho mã nguồn chuẩn của MAVIS để nhập và phân tích thẳng vào lớp này.",
              )}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => openWithRepo("")}>
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            {t("Custom GitHub / ZIP", "Nhập GitHub / ZIP khác")}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CURATED_SAMPLE_REPOS.map((repo) => (
            <article
              key={repo.id}
              className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/20 p-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    <GitBranch className="size-3.5 text-primary" aria-hidden="true" />
                    {repo.name}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {repo.stack}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(repo.summaryEn, repo.summaryVi)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => openWithRepo(repo.url)}
              >
                {t("Use this repository", "Dùng repo này")}
              </Button>
            </article>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => openWithRepo("")}
        className="group flex min-h-[190px] w-full flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="grid size-12 place-items-center rounded-full border-2 border-dashed border-muted-foreground/50 text-foreground transition-colors group-hover:border-primary group-hover:text-primary">
          <Plus className="size-6" aria-hidden="true" />
        </span>
        <span className="mt-3 text-base font-semibold">
          {t("Import reference repository", "Nhập repository tham chiếu")}
        </span>
        <span className="mt-1.5 max-w-md text-xs leading-5 text-muted-foreground">
          {t(
            "Connect a GitHub repo, upload a ZIP archive, or copy from another class to analyze C1–C3 architecture models.",
            "Kết nối repo GitHub, tải file ZIP hoặc dùng lại từ lớp khác để phân tích mô hình kiến trúc C1–C3.",
          )}
        </span>
        {selectedModelId && !sourcePending ? (
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("Repository analysis ready", "Repository đã phân tích xong")}
          </span>
        ) : null}
      </button>

      {importOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Import reference repository", "Nhập repository tham chiếu")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setImportOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <FolderGit2 className="size-4 text-teal-600" aria-hidden="true" />
                <h2 className="text-base font-semibold">
                  {t("Import & analyze repository", "Nhập & phân tích repository")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("Close", "Đóng")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <AssignmentSourcePicker
                workspaceId={workspaceId}
                title={t("Course repository", "Repository khóa học")}
                usageContext="repository"
                initialRepositoryUrl={prefilledRepoUrl}
                onChange={(modelId, pending) => {
                  setSelectedModelId(modelId);
                  setSourcePending(pending);
                }}
                onAnalysisComplete={({ projectId, snapshotId }) => {
                  publishReference.mutate(
                    { workspaceId, projectId, snapshotId },
                    {
                      onSuccess: () => {
                        setImportCompleted(true);
                        void projects.refetch();
                        toast.success(
                          t(
                            "Repository analyzed and C1–C3 architecture is ready. Review the result below before continuing.",
                            "Repository đã phân tích xong và sơ đồ C1–C3 đã sẵn sàng. Hãy kiểm tra thông tin bên dưới trước khi sang bước tiếp theo.",
                          ),
                        );
                      },
                      onError: () => {
                        toast.error(
                          t(
                            "The analysis completed, but the C1–C3 version could not be added to this course. Please try again.",
                            "Phân tích đã hoàn tất nhưng chưa thể thêm phiên bản C1–C3 vào khóa học. Vui lòng thử lại.",
                          ),
                        );
                      },
                    },
                  );
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3.5">
              <p className="text-xs text-muted-foreground">
                {publishReference.isPending
                  ? t(
                      "Adding the generated C1–C3 architecture to this course…",
                      "Đang thêm sơ đồ C1–C3 đã sinh vào khóa học…",
                    )
                  : selectedModelId && !sourcePending
                  ? t(
                      "Analysis is complete and the repository version is available for the next steps.",
                      "Phân tích đã hoàn tất và phiên bản repository có thể dùng cho các bước tiếp theo.",
                    )
                  : t(
                      "Import a GitHub repo, ZIP archive, or select an analyzed project.",
                      "Nhập repo GitHub, file ZIP hoặc chọn dự án đã phân tích.",
                    )}
              </p>
              <div className="flex items-center gap-2">
                {(importCompleted || (selectedModelId && !sourcePending)) && (
                  <Button asChild size="sm">
                    <Link href={nextStepHref}>
                      {flowMode === "setup"
                        ? t("Continue to Theory Library", "Tiếp tục sang Thư viện lý thuyết")
                        : t("Continue to Course Outline", "Tiếp tục sang Khung khóa học")}
                      <ArrowRight className="ml-1.5 size-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setImportOpen(false)}
                  disabled={publishReference.isPending}
                >
                  {t("Close", "Đóng")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <CourseSetupFlowFrame
      workspaceId={workspaceId}
      currentStep="repository"
      flowMode={flowMode}
    >
      {content}
    </CourseSetupFlowFrame>
  );
}

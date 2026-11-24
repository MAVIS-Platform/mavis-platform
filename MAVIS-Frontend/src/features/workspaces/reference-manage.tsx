"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderGit2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AssignmentSourcePicker } from "@/features/assignments/source-picker";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";

export function ReferenceManagement({ workspaceId }: { workspaceId: string }) {
  const allowed = usePermission("workspace:manage");
  const { t } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const firstSetup = params.get("from") === "first-setup";
  const [importOpen, setImportOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [sourcePending, setSourcePending] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  if (!allowed) return null;

  return (
    <section className="space-y-5">
      <button
        type="button"
        onClick={() => setImportOpen(true)}
        className="group flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="grid size-16 place-items-center rounded-full border-2 border-dashed border-muted-foreground/50 text-foreground transition-colors group-hover:border-primary group-hover:text-primary">
          <Plus className="size-8" aria-hidden="true" />
        </span>
        <span className="mt-5 text-base font-semibold">
          {t("Import reference repository", "Nhập repository tham chiếu")}
        </span>
        <span className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {t(
            "Connect a GitHub repo or ZIP archive to analyze C1–C3 architecture models and the dependency graph.",
            "Kết nối repo GitHub hoặc file ZIP để phân tích mô hình kiến trúc C1–C3 và Dependency Graph.",
          )}
        </span>
        {selectedModelId && !sourcePending ? (
          <span className="mt-4 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
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
                onChange={(modelId, pending) => {
                  setSelectedModelId(modelId);
                  setSourcePending(pending);
                }}
                onAnalysisComplete={() => {
                  setImportOpen(false);
                  toast.success(
                    t(
                      "Repository imported and analyzed successfully.",
                      "Repository đã được nhập và phân tích thành công.",
                    ),
                  );
                  const step = firstSetup ? "lesson" : "repository";
                  redirectTimer.current = setTimeout(() => {
                    router.push(
                      `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-flow&step=${step}`,
                    );
                  }, 900);
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3.5">
              <p className="text-xs text-muted-foreground">
                {selectedModelId && !sourcePending
                  ? t(
                      "Analysis is complete and the repository version is available for the next steps.",
                      "Phân tích đã hoàn tất và phiên bản repository có thể dùng cho các bước tiếp theo.",
                    )
                  : t(
                      "Import a GitHub repo, ZIP archive, or select an analyzed project.",
                      "Nhập repo GitHub, file ZIP hoặc chọn dự án đã phân tích.",
                    )}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setImportOpen(false)}
              >
                {t("Close", "Đóng")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

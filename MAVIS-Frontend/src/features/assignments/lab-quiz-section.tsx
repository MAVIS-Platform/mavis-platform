"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { QuizBuilder } from "./quiz-builder";
import { resolveLabTier, type Assignment } from "./requirements";

export function LabQuizSection({
  workspaceId,
  assignmentId,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  assignmentId: string;
  assignment?: Assignment | undefined;
  onNavigate?: ((tab: "studio" | "publish") => void) | undefined;
}) {
  const { t } = useLocale();
  const labTier = resolveLabTier(assignment);
  const hasStudio = labTier === "THEORY_QUIZ_STUDIO";

  return (
    <div className="space-y-4">
      {labTier === "THEORY_ONLY" && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300/60 bg-sky-50/70 px-4 py-3 text-xs text-sky-950 dark:border-sky-800/60 dark:bg-sky-950/20 dark:text-sky-100"
        >
          <p>
            {t(
              "This Lab is set to Theory Only — Quiz Gate is not required.",
              "Lab này đang ở cấu trúc Chỉ Lý Thuyết — không bắt buộc tạo Quiz.",
            )}
          </p>
          {onNavigate && (
            <Button type="button" size="sm" variant="outline" onClick={() => onNavigate("publish")}>
              {t("Skip to Step 6: Check & add to class →", "Bỏ qua sang Bước 6: Kiểm tra & thêm vào lớp →")}
            </Button>
          )}
        </div>
      )}
      <QuizBuilder
        workspaceId={workspaceId}
        assignmentId={assignmentId}
        defaultTitle={assignment?.title}
        footerAction={
          onNavigate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onNavigate(hasStudio ? "studio" : "publish")}
            >
              {hasStudio
                ? t("Next Step 5: Studio Live", "Sang Bước 5: Studio Live")
                : t("Next Step: Check & Publish", "Sang Bước Kiểm tra & Công bố")}
              <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

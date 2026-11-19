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
  const hasStudio = resolveLabTier(assignment) === "THEORY_QUIZ_STUDIO";

  return (
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
  );
}

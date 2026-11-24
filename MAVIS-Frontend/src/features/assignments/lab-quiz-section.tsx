"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { QuizBuilder } from "./quiz-builder";
import { type Assignment } from "./requirements";

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

  return (
    <div className="space-y-4">
      <QuizBuilder
        workspaceId={workspaceId}
        assignmentId={assignmentId}
        defaultTitle={assignment?.title}
        footerAction={
          onNavigate ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onNavigate("publish")}
              >
                {t("Skip to Step 5: Check & add to class", "Sang thẳng Bước 5: Kiểm tra & thêm vào lớp")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onNavigate("studio")}
              >
                {t("Next Step 4: Studio Live", "Sang Bước 4: Studio Live")}
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

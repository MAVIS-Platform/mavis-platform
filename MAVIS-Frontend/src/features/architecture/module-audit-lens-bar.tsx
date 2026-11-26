"use client";

import { Eye, Focus, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import type {
  AuditLensQuickChip,
  LensViewTab,
  ModuleAuditLens,
} from "./module-audit-lens";

export function ModuleAuditLensBar({
  lens,
  activeView,
  activeChipId,
  focusEnabled,
  onToggleFocus,
  onSelectChip,
}: {
  lens: ModuleAuditLens;
  activeView: LensViewTab;
  activeChipId?: string | null | undefined;
  focusEnabled: boolean;
  onToggleFocus: () => void;
  onSelectChip: (chip: AuditLensQuickChip) => void;
}) {
  const { t } = useLocale();

  return (
    <div
      data-testid="module-audit-lens-bar"
      data-module-index={lens.moduleIndex}
      data-audit-track={lens.track}
      className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Badge variant="default" className="shrink-0 gap-1 px-2 py-0.5 text-[11px] font-semibold">
          <Sparkles className="size-3" aria-hidden="true" />
          {t(`Module ${lens.moduleIndex} Focus`, `Tiêu điểm Module ${lens.moduleIndex}`)}
        </Badge>
        <p className="min-w-0 text-xs leading-5 text-foreground/90">
          {t(lens.summaryEn, lens.summaryVi)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {lens.readinessPillars?.map((pillar) => (
          <span
            key={pillar.id}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50/80 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <ShieldCheck className="size-3" aria-hidden="true" />
            {t(pillar.labelEn, pillar.labelVi)}
          </span>
        ))}

        {lens.quickChips.map((chip) => {
          const isCurrent =
            activeChipId === chip.id ||
            (!activeChipId && activeView === chip.targetView && lens.quickChips[0]?.id === chip.id);
          return (
            <Button
              key={chip.id}
              type="button"
              size="sm"
              variant={isCurrent ? "secondary" : "outline"}
              data-testid={`lens-chip-${chip.id}`}
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={() => onSelectChip(chip)}
            >
              {t(chip.labelEn, chip.labelVi)}
            </Button>
          );
        })}

        {lens.dimOthersByDefault && (
          <Button
            type="button"
            size="sm"
            variant={focusEnabled ? "default" : "outline"}
            aria-pressed={focusEnabled}
            data-testid="lens-focus-toggle"
            className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
            onClick={onToggleFocus}
          >
            {focusEnabled ? (
              <>
                <Focus className="size-3" aria-hidden="true" />
                {t("Focused view", "Đang lọc tiêu điểm")}
              </>
            ) : (
              <>
                <Eye className="size-3" aria-hidden="true" />
                {t("View full diagram", "Xem toàn bộ sơ đồ")}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

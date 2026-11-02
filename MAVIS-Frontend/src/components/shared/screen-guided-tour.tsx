"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  resolveScreenTour,
  type ScreenTourDefinition,
} from "@/lib/guided-tours/catalog";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findBestTargetElement(selectors: readonly string[]): HTMLElement | null {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 8 && rect.height > 8) {
          return el;
        }
      }
    } catch {
      /* ignore invalid selector */
    }
  }
  return null;
}

export function ScreenHelpTrigger({
  screenId,
  onCustomStart,
}: {
  screenId?: string | null | undefined;
  onCustomStart?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  const tour = resolveScreenTour(screenId);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const startingTour = useRef(false);

  if (!tour) return null;

  const startTour = () => {
    if (onCustomStart) {
      onCustomStart();
    } else {
      setStepIndex(0);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            aria-label={t("Screen guide", "Hướng dẫn màn hình")}
            title={t("Screen guide", "Hướng dẫn màn hình")}
            data-tour-trigger={tour.id}
          >
            <CircleHelp className="size-5" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            if (startingTour.current) {
              event.preventDefault();
              startingTour.current = false;
              startTour();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t(tour.title.en, tour.title.vi)}</DialogTitle>
            <DialogDescription>
              {t(tour.subtitle.en, tour.subtitle.vi)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            {tour.cards.map((card, idx) => (
              <div
                key={card.badge}
                className="flex flex-col justify-between space-y-3 rounded-lg border bg-card p-3.5"
              >
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                      {card.badge}
                    </span>
                    <span>{t(card.title.en, card.title.vi)}</span>
                  </p>
                  <p className="leading-6 text-muted-foreground">
                    {t(card.description.en, card.description.vi)}
                  </p>
                </div>
                {idx === 0 && (
                  <div>
                    <Button
                      type="button"
                      onClick={() => {
                        startingTour.current = true;
                        setOpen(false);
                      }}
                    >
                      {t("Start guided tour", "Bắt đầu hướng dẫn")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {stepIndex !== null && (
        <ScreenSpotlightOverlay
          tour={tour}
          stepIndex={stepIndex}
          onStepChange={setStepIndex}
        />
      )}
    </>
  );
}

export function ScreenSpotlightOverlay({
  tour,
  stepIndex,
  onStepChange,
}: {
  tour: ScreenTourDefinition;
  stepIndex: number;
  onStepChange: (next: number | null) => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const total = tour.steps.length;
  const currentStep = tour.steps[stepIndex];
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });

  useEffect(() => {
    if (!currentStep || typeof window === "undefined") return;

    const targetEl = findBestTargetElement(currentStep.selectors);
    if (targetEl) {
      targetEl.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }

    let rafId = 0;
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const el = findBestTargetElement(currentStep.selectors);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 6;
      const top = Math.max(8, r.top - pad);
      const left = Math.max(8, r.left - pad);
      const width = Math.min(window.innerWidth - left - 8, r.width + pad * 2);
      const height = Math.min(window.innerHeight - 16, Math.min(r.height + pad * 2, window.innerHeight * 0.68));
      setRect({ top, left, width, height });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const timer = window.setTimeout(scheduleMeasure, 180);
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    window.addEventListener("scroll", scheduleMeasure, { capture: true, passive: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onStepChange(null);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (stepIndex + 1 < total) onStepChange(stepIndex + 1);
        else onStepChange(null);
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        event.preventDefault();
        onStepChange(stepIndex - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timer);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [currentStep, stepIndex, total, onStepChange]);

  if (!currentStep) return null;

  const isLast = stepIndex + 1 >= total;
  const cardWidth = Math.min(360, viewport.width - 32);
  let cardTop = Math.max(24, (viewport.height - 240) / 2);
  let cardLeft = Math.max(16, (viewport.width - cardWidth) / 2);

  if (rect) {
    const spaceBelow = viewport.height - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const spaceRight = viewport.width - (rect.left + rect.width);

    if (spaceBelow >= 230) {
      cardTop = Math.min(viewport.height - 230, rect.top + rect.height + 14);
      cardLeft = Math.min(Math.max(16, rect.left), viewport.width - cardWidth - 16);
    } else if (spaceAbove >= 230) {
      cardTop = Math.max(16, rect.top - 220);
      cardLeft = Math.min(Math.max(16, rect.left), viewport.width - cardWidth - 16);
    } else if (spaceRight >= cardWidth + 24) {
      cardTop = Math.min(Math.max(16, rect.top), viewport.height - 230);
      cardLeft = rect.left + rect.width + 16;
    } else {
      cardTop = Math.max(16, viewport.height - 240);
      cardLeft = Math.max(16, viewport.width - cardWidth - 20);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-tour-title`}
      aria-describedby={`${id}-tour-desc`}
      data-screen-tour-active={tour.id}
    >
      {rect ? (
        <div
          aria-hidden="true"
          style={{
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200 shadow-[0_0_0_9999px_rgb(0_0_0/0.58)]"
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 bg-black/55"
        />
      )}

      <div
        style={{
          top: `${cardTop}px`,
          left: `${cardLeft}px`,
          width: `${cardWidth}px`,
        }}
        className="pointer-events-auto fixed rounded-xl border border-primary/40 bg-popover p-4 text-popover-foreground shadow-2xl space-y-3 transition-all duration-200"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-primary">
            {t("Step", "Bước")} {stepIndex + 1}/{total}
          </p>
          <div className="flex items-center gap-1" aria-hidden="true">
            {tour.steps.map((s, idx) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIndex
                    ? "w-4 bg-primary"
                    : idx < stepIndex
                      ? "w-1.5 bg-primary/50"
                      : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>

        <h3 id={`${id}-tour-title`} className="text-sm font-semibold leading-snug text-foreground">
          {t(currentStep.title.en, currentStep.title.vi)}
        </h3>

        <p id={`${id}-tour-desc`} className="text-xs leading-5 text-muted-foreground">
          {t(currentStep.description.en, currentStep.description.vi)}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onStepChange(null)}
          >
            {t("Skip tour", "Bỏ qua")}
          </Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onStepChange(stepIndex - 1)}
              >
                {t("Back", "Quay lại")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (isLast) onStepChange(null);
                else onStepChange(stepIndex + 1);
              }}
            >
              {isLast ? t("Finish tour", "Xong hướng dẫn") : t("Next", "Tiếp tục")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

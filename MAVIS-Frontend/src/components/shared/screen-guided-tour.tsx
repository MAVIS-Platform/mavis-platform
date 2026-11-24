"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

export function findBestTargetElement(selectors: readonly string[]): HTMLElement | null {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      for (const el of elements) {
        if (
          el.hasAttribute("data-tour-trigger") ||
          el.closest?.("[data-tour-trigger]") ||
          el.hasAttribute("data-screen-tour-active") ||
          el.closest?.("[data-screen-tour-active]") ||
          el.closest?.('[role="dialog"]')
        ) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        const tag = (el.tagName || "").toLowerCase();
        if (tag === "svg" && (rect.width < 120 || rect.height < 80)) {
          continue;
        }
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

function getHeaderFloor(el: HTMLElement): number {
  if (typeof document === "undefined") return 8;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "aside" || tag === "header" || el.closest?.("aside") || el.closest?.("header")) {
    return 4;
  }
  const headerEl = document.querySelector("header");
  if (!headerEl) return 4;
  const hr = headerEl.getBoundingClientRect();
  return hr.bottom > 0 && hr.bottom <= 120 ? Math.max(8, Math.round(hr.bottom + 8)) : 4;
}

function scrollTargetIntoSpotlightView(targetEl: HTMLElement) {
  if (typeof window === "undefined") return;
  try {
    targetEl.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" as ScrollBehavior });
  } catch {
    targetEl.scrollIntoView();
  }
  const r = targetEl.getBoundingClientRect();
  const minTop = getHeaderFloor(targetEl);
  const vh = window.innerHeight;
  const availableHeight = Math.max(180, vh - minTop - 235);
  const desiredTop =
    r.height >= availableHeight
      ? minTop + 6
      : minTop + Math.max(10, Math.min(72, Math.round((availableHeight - r.height) / 2)));
  const deltaY = r.top - desiredTop;
  if (Math.abs(deltaY) > 6 && typeof window.scrollBy === "function") {
    try {
      window.scrollBy({ top: deltaY, left: 0, behavior: "instant" as ScrollBehavior });
    } catch {
      window.scrollBy(0, deltaY);
    }
  }
}

export function ScreenHelpTrigger({
  screenId,
  onCustomStart,
  onStepChange,
  triggerClassName,
  iconClassName,
  onTriggerClick,
  surfaceTheme,
}: {
  screenId?: string | null | undefined;
  onCustomStart?: (() => void) | undefined;
  onStepChange?: ((stepId: string | null) => void) | undefined;
  triggerClassName?: string | undefined;
  iconClassName?: string | undefined;
  onTriggerClick?: (() => void) | undefined;
  surfaceTheme?: "light" | "dark" | undefined;
}) {
  const { t } = useLocale();
  const tour = resolveScreenTour(screenId);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const startingTour = useRef(false);

  if (!tour) return null;

  const isLightSurface = surfaceTheme === "light";
  const isDarkSurface = surfaceTheme === "dark";

  const handleStepChange = (next: number | null) => {
    setStepIndex(next);
    const nextStepId = next !== null ? (tour.steps[next]?.id ?? null) : null;
    onStepChange?.(nextStepId);
  };

  const startTour = () => {
    if (onCustomStart) {
      onCustomStart();
    } else {
      handleStepChange(0);
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
            onClick={onTriggerClick}
            className={
              triggerClassName ??
              "size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            }
            aria-label={t("Screen guide", "Hướng dẫn màn hình")}
            title={t("Screen guide", "Hướng dẫn màn hình")}
            data-tour-trigger={tour.id}
          >
            <CircleHelp className={iconClassName ?? "size-5"} aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent
          data-tour-surface={surfaceTheme ?? "auto"}
          data-tour-confirm-dialog={tour.id}
          className={`sm:max-w-xl ${
            isLightSurface
              ? "border-slate-200 bg-white text-slate-900 shadow-2xl"
              : isDarkSurface
                ? "border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
                : ""
          }`}
          onCloseAutoFocus={(event) => {
            if (startingTour.current) {
              event.preventDefault();
              startingTour.current = false;
              startTour();
            }
          }}
        >
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle
                className={
                  isLightSurface ? "text-slate-900" : isDarkSurface ? "text-slate-100" : undefined
                }
              >
                {t(tour.title.en, tour.title.vi)}
              </DialogTitle>
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-xs font-semibold ${
                  isLightSurface
                    ? "border-slate-200 bg-slate-100 text-slate-700"
                    : isDarkSurface
                      ? "border-slate-700 bg-slate-800 text-slate-200"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {tour.steps.length} {t("steps", "bước")}
              </span>
            </div>
            <DialogDescription
              className={
                isLightSurface ? "text-slate-600" : isDarkSurface ? "text-slate-300" : undefined
              }
            >
              {t(tour.subtitle.en, tour.subtitle.vi)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {tour.cards.map((card) => (
              <div
                key={card.badge}
                className={`space-y-1.5 rounded-lg border p-3 ${
                  isLightSurface
                    ? "border-slate-200 bg-slate-50 text-slate-900"
                    : isDarkSurface
                      ? "border-slate-700 bg-slate-800/70 text-slate-100"
                      : "bg-card"
                }`}
              >
                <p
                  className={`flex items-center gap-1.5 font-semibold ${
                    isLightSurface
                      ? "text-slate-900"
                      : isDarkSurface
                        ? "text-slate-100"
                        : "text-foreground"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                      isLightSurface
                        ? "bg-slate-900 text-white"
                        : isDarkSurface
                          ? "bg-white text-slate-950"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {card.badge}
                  </span>
                  <span>{t(card.title.en, card.title.vi)}</span>
                </p>
                <p
                  className={`text-xs leading-5 ${
                    isLightSurface
                      ? "text-slate-600"
                      : isDarkSurface
                        ? "text-slate-300"
                        : "text-muted-foreground"
                  }`}
                >
                  {t(card.description.en, card.description.vi)}
                </p>
              </div>
            ))}
          </div>
          <div
            className={`flex flex-wrap items-center justify-between gap-2 border-t pt-3 ${
              isLightSurface
                ? "border-slate-200"
                : isDarkSurface
                  ? "border-slate-800"
                  : "border-border"
            }`}
          >
            <p
              className={`text-xs ${
                isLightSurface
                  ? "text-slate-500"
                  : isDarkSurface
                    ? "text-slate-400"
                    : "text-muted-foreground"
              }`}
            >
              {t(
                "Ready to walk through every control on this screen?",
                "Xác nhận bắt đầu hướng dẫn chi tiết từng vùng giao diện?",
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={
                  isLightSurface
                    ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    : isDarkSurface
                      ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                      : undefined
                }
                onClick={() => setOpen(false)}
              >
                {t("Later", "Để sau")}
              </Button>
              <Button
                type="button"
                size="sm"
                autoFocus
                data-testid="confirm-start-guided-tour"
                className={
                  isLightSurface
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : isDarkSurface
                      ? "bg-white text-slate-950 hover:bg-slate-200"
                      : undefined
                }
                onClick={() => {
                  startingTour.current = true;
                  setOpen(false);
                }}
              >
                {t("Start guided tour", "Bắt đầu hướng dẫn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {stepIndex !== null && (
        <ScreenSpotlightOverlay
          tour={tour}
          stepIndex={stepIndex}
          onStepChange={handleStepChange}
          surfaceTheme={surfaceTheme}
        />
      )}
    </>
  );
}

export function ScreenSpotlightOverlay({
  tour,
  stepIndex,
  onStepChange,
  surfaceTheme,
}: {
  tour: ScreenTourDefinition;
  stepIndex: number;
  onStepChange: (next: number | null) => void;
  surfaceTheme?: "light" | "dark" | undefined;
}) {
  const { t } = useLocale();
  const id = useId();
  const total = tour.steps.length;
  const currentStep = tour.steps[stepIndex];
  const cardRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const [cardHeight, setCardHeight] = useState(190);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const syncHeight = () => {
      const next = Math.ceil(el.getBoundingClientRect().height);
      if (next > 40) setCardHeight(next);
    };
    syncHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stepIndex, viewport.width, viewport.height]);

  useEffect(() => {
    if (!currentStep || typeof window === "undefined") return;

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
      const minTop = getHeaderFloor(el);
      const top = Math.max(minTop, Math.min(window.innerHeight - 36, r.top - pad));
      const left = Math.max(8, Math.min(window.innerWidth - 36, r.left - pad));
      const right = Math.min(window.innerWidth - 8, Math.max(left + 28, (r.right ?? r.left + r.width) + pad));
      const rawBottom = (r.bottom ?? r.top + r.height) + pad;
      const bottom = Math.min(window.innerHeight - 8, Math.max(top + 28, rawBottom));
      setRect({ top, left, width: right - left, height: bottom - top });
    };

    const scrollAndMeasure = () => {
      const tabBtn = document.querySelector<HTMLElement>(`[data-tour-tab="${currentStep.id}"]`);
      if (tabBtn && typeof tabBtn.click === "function") {
        tabBtn.click();
      }
      const targetEl = findBestTargetElement(currentStep.selectors);
      if (targetEl) {
        scrollTargetIntoSpotlightView(targetEl);
      }
      measure();
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    scrollAndMeasure();
    const timer1 = window.setTimeout(scrollAndMeasure, 60);
    const timer2 = window.setTimeout(scheduleMeasure, 180);
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
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [currentStep, stepIndex, total, onStepChange]);

  if (!currentStep) return null;

  const isLast = stepIndex + 1 >= total;
  const isLightSurface = surfaceTheme === "light";
  const isDarkSurface = surfaceTheme === "dark";
  const cardWidth = Math.min(340, viewport.width - 32);
  const margin = 12;
  const gap = 14;
  const clampLeft = (value: number) =>
    Math.min(Math.max(margin, value), Math.max(margin, viewport.width - cardWidth - margin));
  const clampTop = (value: number) =>
    Math.min(Math.max(margin, value), Math.max(margin, viewport.height - cardHeight - margin));

  let cardTop = clampTop((viewport.height - cardHeight) / 2);
  let cardLeft = clampLeft((viewport.width - cardWidth) / 2);

  if (rect) {
    const canPlaceBelow = rect.top + rect.height + gap + cardHeight <= viewport.height - margin;
    const canPlaceAbove = rect.top - gap - cardHeight >= margin;
    const canPlaceRight = rect.left + rect.width + gap + cardWidth <= viewport.width - margin;
    const canPlaceLeft = rect.left - gap - cardWidth >= margin;

    if (canPlaceBelow) {
      cardTop = rect.top + rect.height + gap;
      cardLeft = clampLeft(rect.left);
    } else if (canPlaceAbove) {
      cardTop = rect.top - gap - cardHeight;
      cardLeft = clampLeft(rect.left);
    } else if (canPlaceRight) {
      cardTop = clampTop(rect.top);
      cardLeft = rect.left + rect.width + gap;
    } else if (canPlaceLeft) {
      cardTop = clampTop(rect.top);
      cardLeft = rect.left - gap - cardWidth;
    } else {
      cardTop = clampTop(viewport.height - cardHeight - margin);
      cardLeft = clampLeft(viewport.width - cardWidth - margin);
    }
  }

  const overlay = (
    <div
      className="fixed inset-0 z-[100] pointer-events-none"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-tour-title`}
      aria-describedby={`${id}-tour-desc`}
      data-screen-tour-active={tour.id}
      data-tour-surface={surfaceTheme ?? "auto"}
    >
      {rect ? (
        <div
          aria-hidden="true"
          data-tour-spotlight-ring
          style={{
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
          className={`pointer-events-none fixed rounded-xl ring-2 ring-offset-2 transition-all duration-200 shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] ${
            isLightSurface
              ? "ring-blue-600 ring-offset-white"
              : isDarkSurface
                ? "ring-sky-400 ring-offset-slate-950"
                : "ring-primary ring-offset-background"
          }`}
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 bg-black/55"
        />
      )}

      <div
        ref={cardRef}
        data-tour-tooltip-card
        style={{
          top: `${cardTop}px`,
          left: `${cardLeft}px`,
          width: `${cardWidth}px`,
        }}
        className={`pointer-events-auto fixed space-y-2.5 rounded-xl border p-4 shadow-2xl transition-all duration-200 ${
          isLightSurface
            ? "border-slate-200 bg-white text-slate-900"
            : isDarkSurface
              ? "border-slate-700 bg-slate-900 text-slate-100"
              : "border-primary/40 bg-popover text-popover-foreground"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-xs font-semibold ${
              isLightSurface
                ? "text-blue-600"
                : isDarkSurface
                  ? "text-sky-400"
                  : "text-primary"
            }`}
          >
            {t("Step", "Bước")} {stepIndex + 1}/{total}
          </p>
          <div className="flex items-center gap-1" aria-hidden="true">
            {tour.steps.map((s, idx) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIndex
                    ? isLightSurface
                      ? "w-4 bg-blue-600"
                      : isDarkSurface
                        ? "w-4 bg-sky-400"
                        : "w-4 bg-primary"
                    : idx < stepIndex
                      ? isLightSurface
                        ? "w-1.5 bg-blue-300"
                        : isDarkSurface
                          ? "w-1.5 bg-sky-400/50"
                          : "w-1.5 bg-primary/50"
                      : isLightSurface
                        ? "w-1.5 bg-slate-200"
                        : isDarkSurface
                          ? "w-1.5 bg-slate-700"
                          : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>

        <h3
          id={`${id}-tour-title`}
          className={`text-sm font-semibold leading-snug ${
            isLightSurface
              ? "text-slate-900"
              : isDarkSurface
                ? "text-slate-100"
                : "text-foreground"
          }`}
        >
          {t(currentStep.title.en, currentStep.title.vi)}
        </h3>

        <p
          id={`${id}-tour-desc`}
          className={`text-xs leading-5 ${
            isLightSurface
              ? "text-slate-600"
              : isDarkSurface
                ? "text-slate-300"
                : "text-muted-foreground"
          }`}
        >
          {t(currentStep.description.en, currentStep.description.vi)}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={
              isLightSurface
                ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                : isDarkSurface
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : undefined
            }
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
                className={
                  isLightSurface
                    ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    : isDarkSurface
                      ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                      : undefined
                }
                onClick={() => onStepChange(stepIndex - 1)}
              >
                {t("Back", "Quay lại")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className={
                isLightSurface
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : isDarkSurface
                    ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
                    : undefined
              }
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

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

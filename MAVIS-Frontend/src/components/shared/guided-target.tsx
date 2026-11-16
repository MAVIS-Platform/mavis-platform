"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";

/** Keep the real control interactive while explaining it in a collision-aware popover. */
export function GuidedTarget({
  children,
  active,
  step,
  title,
  description,
  onNext,
  onBack,
  onSkip,
  nextDisabled = false,
  last = false,
}: {
  children: ReactNode;
  active: boolean;
  step: number;
  title: string;
  description: string;
  onNext: () => void;
  onBack?: () => void;
  onSkip: () => void;
  nextDisabled?: boolean;
  last?: boolean;
}) {
  const { t } = useLocale();
  const id = useId();
  const target = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1440px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      target.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
      target.current
        ?.querySelector<HTMLElement>("input, select, button")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return (
    <Popover open={active}>
      <PopoverAnchor asChild>
        <div
          ref={target}
          className={
            active
              ? "relative z-40 rounded-lg bg-popover ring-2 ring-primary ring-offset-4 ring-offset-background"
              : undefined
          }
        >
          {active && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-lg shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
            />
          )}
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side={wide ? "right" : "bottom"}
        align="start"
        sideOffset={16}
        collisionPadding={16}
        className="z-(--z-tooltip) w-80 max-w-[calc(100vw-2rem)] space-y-3 border-primary/40"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSkip();
        }}
      >
        <p className="text-xs font-medium text-primary">
          {t("Step", "Bước")} {step + 1}/6
        </p>
        <h3 id={`${id}-title`} className="font-semibold">
          {title}
        </h3>
        <p id={`${id}-description`} className="text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            {t("Skip tour", "Bỏ qua")}
          </Button>
          <div className="flex gap-2">
            {onBack && (
              <Button type="button" variant="outline" size="sm" onClick={onBack}>
                {t("Back", "Quay lại")}
              </Button>
            )}
            <Button type="button" size="sm" disabled={nextDisabled} onClick={onNext}>
              {last ? t("Finish tour", "Xong hướng dẫn") : t("Next", "Tiếp tục")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

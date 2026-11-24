"use client";

import type { ReactNode } from "react";
import { Expand, Minimize, Shrink } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";

export interface DiagramGuideItem {
  heading: string;
  body: string;
}

export function DiagramViewportToolbar({
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleFullscreen,
  fullscreen,
  zoomInAriaLabel,
  zoomOutAriaLabel,
  fitAriaLabel,
  helpAriaLabel,
  helpTourTrigger,
  guideTitle,
  guideItems,
  guideFooter,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onToggleFullscreen: () => void;
  fullscreen: boolean;
  zoomInAriaLabel?: string;
  zoomOutAriaLabel?: string;
  fitAriaLabel?: string;
  helpAriaLabel?: string;
  helpTourTrigger?: string;
  guideTitle?: string;
  guideItems?: ReadonlyArray<DiagramGuideItem>;
  guideFooter?: ReactNode;
}) {
  const { t } = useLocale();
  const defaultGuide: ReadonlyArray<DiagramGuideItem> = [
    {
      heading: t("Move & zoom", "Di chuyển & thu phóng"),
      body: t(
        "Drag the canvas to pan. Use Ctrl/Cmd + scroll or + / − buttons to zoom smoothly. Click Fit to center the diagram.",
        "Kéo nền sơ đồ để di chuyển. Giữ Ctrl/Cmd + cuộn chuột hoặc dùng nút + / − để thu phóng mượt. Bấm Vừa khung để căn giữa.",
      ),
    },
    {
      heading: t("Inspect elements", "Kiểm tra thành phần"),
      body: t(
        "Select any component or connection to view overview, relationships, source evidence, and Ask AI in the right panel.",
        "Chọn bất kỳ thành phần hoặc kết nối nào để xem Tổng quan, Quan hệ, Bằng chứng và Hỏi AI ở khung bên phải.",
      ),
    },
    {
      heading: t("Fullscreen", "Toàn màn hình"),
      body: t(
        "Open Fullscreen to explore large diagrams cleanly. Press Esc to exit fullscreen.",
        "Mở Toàn màn hình để xem sơ đồ lớn rõ ràng. Nhấn phím Esc để thoát.",
      ),
    },
  ];
  const resolvedItems = guideItems ?? defaultGuide;

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="flex items-center gap-1.5">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-9 shrink-0 rounded-full p-0 font-semibold"
              aria-label={zoomInAriaLabel ?? t("Zoom in", "Phóng to")}
              onClick={onZoomIn}
            >
              +
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            sideOffset={6}
            className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
          >
            {t("Zoom in", "Phóng to")}
          </Tooltip.Content>
        </Tooltip.Root>

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-9 shrink-0 rounded-full p-0 font-semibold"
              aria-label={zoomOutAriaLabel ?? t("Zoom out", "Thu nhỏ")}
              onClick={onZoomOut}
            >
              −
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            sideOffset={6}
            className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
          >
            {t("Zoom out", "Thu nhỏ")}
          </Tooltip.Content>
        </Tooltip.Root>

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-9 shrink-0 rounded-full p-0"
              aria-label={fitAriaLabel ?? t("Fit to view", "Vừa khung")}
              onClick={onFit}
            >
              <Shrink className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            sideOffset={6}
            className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
          >
            {t("Fit to view", "Vừa khung")}
          </Tooltip.Content>
        </Tooltip.Root>

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-9 shrink-0 rounded-full p-0"
              aria-label={
                fullscreen
                  ? t("Exit fullscreen", "Thoát toàn màn hình")
                  : t("Enter fullscreen", "Toàn màn hình")
              }
              onClick={onToggleFullscreen}
            >
              {fullscreen ? (
                <Minimize className="size-4" aria-hidden="true" />
              ) : (
                <Expand className="size-4" aria-hidden="true" />
              )}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content
            side="bottom"
            sideOffset={6}
            className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
          >
            {fullscreen
              ? t("Exit fullscreen (Esc)", "Thoát toàn màn hình (Esc)")
              : t("Fullscreen", "Toàn màn hình")}
          </Tooltip.Content>
        </Tooltip.Root>

        <Popover.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Popover.Trigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-9 shrink-0 rounded-full p-0 text-base font-semibold"
                  aria-label={helpAriaLabel ?? t("Diagram help", "Hướng dẫn thao tác")}
                  {...(helpTourTrigger ? { "data-tour-trigger": helpTourTrigger } : {})}
                >
                  ?
                </Button>
              </Popover.Trigger>
            </Tooltip.Trigger>
            <Tooltip.Content
              side="bottom"
              align="end"
              sideOffset={6}
              className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            >
              {guideTitle ?? t("Navigation guide", "Hướng dẫn thao tác")}
            </Tooltip.Content>
          </Tooltip.Root>
          <Popover.Content
            align="end"
            sideOffset={8}
            aria-label={helpAriaLabel ?? t("Diagram help", "Hướng dẫn thao tác")}
            className="z-50 w-[min(360px,calc(100vw-32px))] rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-xl outline-none"
          >
            <p className="font-semibold">
              {guideTitle ?? t("Navigation guide", "Hướng dẫn thao tác")}
            </p>
            <dl className="mt-3 space-y-2 text-xs leading-relaxed">
              {resolvedItems.map((item) => (
                <div key={item.heading}>
                  <dt className="font-medium">{item.heading}</dt>
                  <dd className="text-muted-foreground">{item.body}</dd>
                </div>
              ))}
            </dl>
            {guideFooter}
            <Popover.Arrow className="fill-popover" />
          </Popover.Content>
        </Popover.Root>
      </div>
    </Tooltip.Provider>
  );
}

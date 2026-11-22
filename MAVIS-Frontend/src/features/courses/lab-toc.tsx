"use client";

import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Code2,
  FileText,
  GitFork,
  HelpCircle,
  Lock,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

export type LabTocStepState = "complete" | "current" | "available" | "locked";

export type LabTocStep = {
  id: 1 | 2 | 3;
  label: string;
  state: LabTocStepState;
  reason?: string | undefined;
  href?: string | undefined;
};

export type LabTocItem = {
  id: string;
  title: string;
  type: string;
  href?: string | undefined;
  current?: boolean | undefined;
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  THEORY: BookOpen,
  QUIZ: HelpCircle,
  ESSAY: FileText,
  STATIC_LAB: Code2,
  IMPACT_LAB: GitFork,
  RUNTIME_LAB: Play,
};

function StepIcon({ state }: { state: LabTocStepState }) {
  if (state === "complete") return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (state === "locked") return <Lock className="size-4" aria-hidden="true" />;
  if (state === "current") return <Play className="size-4" aria-hidden="true" />;
  return <Circle className="size-4" aria-hidden="true" />;
}

export function LabToc({
  steps,
  activeStep,
  moduleTitle,
  items,
  progress,
  preview,
  layout = "sidebar",
  sticky = true,
}: {
  steps: LabTocStep[];
  activeStep: 1 | 2 | 3;
  moduleTitle?: string | null | undefined;
  items: LabTocItem[];
  progress: number;
  preview?: boolean | undefined;
  layout?: "sidebar" | "stepper" | undefined;
  sticky?: boolean | undefined;
}) {
  const { t } = useLocale();
  if (layout === "stepper") {
    return (
      <nav
        aria-label={t("Lab workflow", "Quy trình Lab")}
        className={cn(
          sticky && "sticky top-14 z-20",
          "space-y-2.5 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur-md",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="shrink-0 text-xs font-semibold text-foreground">
              {t("Lab progress", "Tiến độ Lab")}
            </span>
            <div
              role="progressbar"
              aria-label={t("Lab progress", "Tiến độ Lab")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 min-w-[96px] max-w-[220px] flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="mavis-tabular text-xs font-semibold text-primary">{progress}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {preview && <Badge variant="warning">{t("Preview", "Xem trước")}</Badge>}
            {moduleTitle && items.length > 0 && (
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                  {t("Module contents", "Nội dung chương")} ({items.length})
                </summary>
                <div className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border bg-popover p-3 shadow-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("Module", "Chương")}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-foreground">{moduleTitle}</p>
                  <ul className="mt-2 space-y-1">
                    {items.map((item) => {
                      const Icon = TYPE_ICONS[item.type] ?? FileText;
                      const row = (
                        <span
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                            item.current
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 truncate">{item.title}</span>
                        </span>
                      );
                      return (
                        <li key={item.id}>
                          {item.href ? <Link href={item.href}>{row}</Link> : row}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            )}
          </div>
        </div>
        <ol className={cn("grid gap-2", steps.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
          {steps.map((step, index) => {
            const current = step.id === activeStep;
            const locked = step.state === "locked";
            const complete = step.state === "complete";
            const cardClass = cn(
              "flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors",
              current
                ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs"
                : complete
                  ? "border-emerald-500/35 bg-emerald-500/5 text-foreground hover:border-primary/40"
                  : locked
                    ? "cursor-not-allowed border-border/60 bg-muted/25 text-muted-foreground/75"
                    : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            );
            const inner = (
              <>
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px]",
                    current
                      ? "border-primary bg-primary text-primary-foreground"
                      : complete
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <StepIcon state={step.state} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {index + 1}. {step.label}
                  </span>
                  {locked && step.reason && (
                    <span className="block truncate text-[10px] font-normal text-muted-foreground">
                      {step.reason}
                    </span>
                  )}
                </span>
              </>
            );
            return (
              <li key={step.id} className="min-w-0">
                {step.href && !locked ? (
                  <Link
                    href={step.href}
                    aria-current={current ? "step" : undefined}
                    className={cardClass}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div aria-disabled="true" title={step.reason} className={cardClass}>
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }
  return (
    <details
      aria-label={t("Lab contents", "Mục lục bài Lab")}
      open
      className="group rounded-lg border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <h2 className="text-sm font-semibold">{t("Lab contents", "Mục lục bài Lab")}</h2>
        <span className="flex items-center gap-2">
          {preview && <Badge variant="warning">{t("Preview", "Xem trước")}</Badge>}
          <span className="text-xs text-muted-foreground lg:hidden">{t("Open", "Mở")}</span>
        </span>
      </summary>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t("Progress", "Tiến độ")}</span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("Lab progress", "Tiến độ Lab")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ol className="space-y-1">
          {steps.map((step, index) => {
            const current = step.id === activeStep;
            const content = (
              <span
                className={cn(
                  "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                  current && "bg-primary/10 text-primary",
                  step.state === "locked" && "text-muted-foreground",
                )}
              >
                <span className="mt-0.5 shrink-0">
                  <StepIcon state={step.state} />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">
                    {index + 1}. {step.label}
                  </span>
                  {step.state === "locked" && step.reason && (
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                      {step.reason}
                    </span>
                  )}
                </span>
              </span>
            );
            return (
              <li key={step.id}>
                {step.href ? (
                  <Link href={step.href} aria-current={current ? "step" : undefined}>
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>

        {moduleTitle && (
          <div className="border-t pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Module", "Chương")}
            </p>
            <p className="mt-0.5 text-sm font-medium">{moduleTitle}</p>
            {items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {items.map((item) => {
                  const Icon = TYPE_ICONS[item.type] ?? FileText;
                  const row = (
                    <span
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                        item.current
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">{item.title}</span>
                    </span>
                  );
                  return (
                    <li key={item.id}>{item.href ? <Link href={item.href}>{row}</Link> : row}</li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

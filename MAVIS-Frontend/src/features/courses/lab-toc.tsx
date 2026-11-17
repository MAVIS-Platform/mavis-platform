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
  id: 1 | 2 | 3 | 4;
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
}: {
  steps: LabTocStep[];
  activeStep: 1 | 2 | 3 | 4;
  moduleTitle?: string | null | undefined;
  items: LabTocItem[];
  progress: number;
  preview?: boolean | undefined;
}) {
  const { t } = useLocale();
  return (
    <details aria-label={t("Lab contents", "Mục lục bài Lab")} open className="group rounded-lg border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto">
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
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <ol className="space-y-1">
        {steps.map((step) => {
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
                  {step.id}. {step.label}
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
                      item.current ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
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
          )}
        </div>
      )}
      </div>
    </details>
  );
}

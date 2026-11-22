"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/locale-context";
import { ScreenHelpTrigger } from "@/components/shared/screen-guided-tour";

export function PageContainer({
  children,
  variant = "standard",
}: {
  children: ReactNode;
  variant?: "standard" | "reading" | "form";
}) {
  return (
    <div
      className={cn(
        "space-y-6",
        variant === "reading" && "max-w-(--reading-max)",
        variant === "form" && "max-w-(--form-max)",
      )}
    >
      {children}
    </div>
  );
}
export function SectionHeader({
  title,
  description,
  actions,
  screenId,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  screenId?: string;
  backHref?: string | undefined;
  backLabel?: string | undefined;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {backHref && (
          <div className="mb-1.5">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {backLabel ? t(backLabel) : t("Back", "Quay lại")}
            </Link>
          </div>
        )}
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{t(title)}</h1>
          <ScreenHelpTrigger screenId={screenId ?? title} />
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{t(description)}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function ContextPanel({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useLocale();
  return (
    <aside aria-label={t(title)} className="mavis-panel min-w-0 self-start p-6">
      <h2 className="sr-only">{t(title)}</h2>
      {children}
    </aside>
  );
}
export function Breadcrumbs({
  items,
}: {
  items: readonly { label: string; href?: string; visibility?: "sm" | "lg" }[];
}) {
  const { t } = useLocale();
  const visibleItems = items.filter((item) => item.label.trim().length > 0);
  return (
    <nav aria-label={t("Breadcrumb")} className="min-w-0 flex-1 overflow-hidden">
      <ol className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground sm:gap-2">
        {visibleItems.map((item, i) => {
          const text = t(item.label);
          const isLast = i === visibleItems.length - 1;
          return (
            <li
              key={`${item.label}-${i}`}
              className={cn(
                "min-w-0 items-center gap-1.5 sm:gap-2",
                isLast
                  ? "flex min-w-24 flex-1"
                  : item.visibility === "sm"
                    ? "hidden shrink-0 sm:flex"
                    : item.visibility === "lg"
                      ? "hidden shrink min-w-0 xl:flex"
                      : "flex min-w-0 shrink",
              )}
            >
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  title={text}
                  className={cn(
                    "block truncate whitespace-nowrap transition-colors hover:text-foreground",
                    item.visibility === "lg" ? "max-w-44 2xl:max-w-60" : "shrink-0",
                  )}
                >
                  {text}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  title={text}
                  className={cn(
                    "block truncate whitespace-nowrap",
                    isLast && "font-medium text-foreground",
                    item.visibility === "lg" && "max-w-44 2xl:max-w-60",
                  )}
                >
                  {text}
                </span>
              )}
              {!isLast && (
                <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
export function Header({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-(--z-header) flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-card px-(--page-gutter) sm:gap-3">
      {children}
    </header>
  );
}
export function Sidebar({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  return (
    <aside
      aria-label="Application sidebar"
      className={cn(
        "sticky top-0 z-(--z-sidebar) hidden h-svh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex",
        collapsed ? "w-(--sidebar-collapsed)" : "w-(--sidebar-width)",
      )}
    >
      {children}
    </aside>
  );
}

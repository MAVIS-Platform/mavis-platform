import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/locale-context";

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
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t(title)}</h1>
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
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex items-center gap-2 text-xs text-muted-foreground">
        {items.map((item, i) => (
          <li
            key={`${item.label}-${i}`}
            className={cn(
              "min-w-0 items-center gap-2",
              item.visibility === "sm"
                ? "hidden sm:flex"
                : item.visibility === "lg"
                  ? "hidden lg:flex"
                  : "flex",
            )}
          >
            {item.href ? (
              <Link href={item.href}>{t(item.label)}</Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? "page" : undefined}
                className={cn(
                  "truncate",
                  i === items.length - 1 && "font-medium text-foreground",
                  item.visibility === "lg" && "max-w-40",
                )}
              >
                {t(item.label)}
              </span>
            )}
            {i < items.length - 1 && (
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
            )}
          </li>
        ))}
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

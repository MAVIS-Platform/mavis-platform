import { Fragment, type ReactNode } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "./request-state";
import { useLocale } from "@/lib/i18n/locale-context";
import { translatedStatusLabel } from "@/lib/status-label";

export function StatusLabel({
  status,
  preserveCase = false,
}: {
  status: string;
  preserveCase?: boolean;
}) {
  const { t } = useLocale();
  return <>{preserveCase ? t(status) : translatedStatusLabel(status, t)}</>;
}

export function StatusBadge({
  status,
  variant = "outline",
  preserveCase = false,
}: {
  status: string;
  variant?: BadgeProps["variant"];
  preserveCase?: boolean;
}) {
  return (
    <Badge variant={variant}>
      <StatusLabel status={status} preserveCase={preserveCase} />
    </Badge>
  );
}
export function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: ReactNode;
  description?: string;
}) {
  const { t } = useLocale();
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{t(label)}</p>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
      {description && <p className="mt-2 text-xs text-muted-foreground">{t(description)}</p>}
    </article>
  );
}
export function DetailPanel({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t(title)}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
export type TableColumn<T> = { key: string; label: string; render: (row: T) => ReactNode };
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  emptyDescription,
  renderExpandedRow,
}: {
  rows: readonly T[];
  columns: readonly TableColumn<T>[];
  rowKey: (row: T) => string;
  caption: string;
  emptyDescription?: string;
  renderExpandedRow?: (row: T) => ReactNode;
}) {
  const { t } = useLocale();
  if (!rows.length)
    return (
      <EmptyState
        title="No matching records"
        description={emptyDescription ?? "Try another filter or create your first record."}
      />
    );
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t(caption)}</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {columns.map((c) => (
              <th scope="col" key={c.key} className="px-5 py-3 font-medium">
                {t(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expanded = renderExpandedRow?.(row);
            return (
              <Fragment key={rowKey(row)}>
                <tr className="border-b last:border-0 hover:bg-accent/40">
                  {columns.map((c) => (
                    <td key={c.key} className="px-5 py-3.5">
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
                {expanded && (
                  <tr className="border-b last:border-0">
                    <td colSpan={columns.length} className="px-5 py-4">
                      {expanded}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

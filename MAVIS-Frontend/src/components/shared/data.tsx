import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "./request-state";

export function StatusBadge({
  status,
  variant = "outline",
}: {
  status: string;
  variant?: BadgeProps["variant"];
}) {
  return <Badge variant={variant}>{status}</Badge>;
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
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
      {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
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
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
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
}: {
  rows: readonly T[];
  columns: readonly TableColumn<T>[];
  rowKey: (row: T) => string;
  caption: string;
  emptyDescription?: string;
}) {
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
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {columns.map((c) => (
              <th scope="col" key={c.key} className="px-5 py-3 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b last:border-0 hover:bg-accent/40">
              {columns.map((c) => (
                <td key={c.key} className="px-5 py-3.5">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

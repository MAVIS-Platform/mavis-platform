"use client";
import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeError } from "@/lib/errors/api-error";
import { useLocale } from "@/lib/i18n/locale-context";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { t } = useLocale();
  return (
    <div role="status" aria-live="polite" className="space-y-4 py-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        {t(label)}
      </p>
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
export function EmptyState({
  title = "No results yet",
  description = "Choose a source or adjust your filters.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border bg-card p-8 text-center">
      <h2 className="text-sm font-semibold">{t(title)}</h2>
      <p className="my-3 text-sm text-muted-foreground">{t(description)}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm"
    >
      <p>{normalizeError(error).message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("Retry")}
        </Button>
      )}
    </div>
  );
}
export function RequestState({
  query,
  empty = false,
  children,
  emptyMessage,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    isFetching: boolean;
    refetch: () => unknown;
  };
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  if (empty)
    return (
      <EmptyState description={emptyMessage ?? "No records are available for this selection."} />
    );
  return (
    <div aria-busy={query.isFetching}>
      {query.isFetching && (
        <p role="status" className="mb-2 text-xs text-muted-foreground">
          {t("Updating…")}
        </p>
      )}
      {children}
    </div>
  );
}

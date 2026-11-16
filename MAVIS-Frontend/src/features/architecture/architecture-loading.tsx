"use client";
import { useEffect, useState } from "react";
import { LoaderCircle, Network } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ArchitectureLoading({
  mode,
  loadingRevisions,
}: {
  mode: "graph" | "diagram";
  loadingRevisions: boolean;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <section
      aria-busy="true"
      aria-label="Loading architecture workspace"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-center gap-3 border-b p-4" aria-hidden="true">
        <Skeleton className="h-9 w-48 motion-reduce:animate-none" />
        <Skeleton className="h-9 w-64 motion-reduce:animate-none" />
        <Skeleton className="ml-auto h-9 w-28 motion-reduce:animate-none" />
      </div>
      <div className="relative flex min-h-[26rem] items-center justify-center bg-muted/10 p-6 sm:min-h-[32rem]">
        <div
          className="absolute inset-6 grid grid-cols-3 items-center gap-8 opacity-30"
          aria-hidden="true"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton
              key={i}
              className={`mx-auto motion-reduce:animate-none ${mode === "graph" ? "size-14 rounded-full" : "h-20 w-full max-w-36"}`}
            />
          ))}
        </div>
        <div className="relative max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
          <Network className="mx-auto mb-3 size-7 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">
            {mode === "diagram" ? "Opening diagrams" : "Opening graph"}
          </h2>
          <p
            role="status"
            aria-live="polite"
            className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <LoaderCircle
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            {loadingRevisions ? "Loading architecture revisions…" : "Loading selected revision…"}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Your workspace will appear here when the data is ready.
          </p>
          {slow && (
            <p role="status" className="mt-4 border-t pt-3 text-sm text-muted-foreground">
              This is taking longer than usual. You can continue using the navigation while this
              view loads.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

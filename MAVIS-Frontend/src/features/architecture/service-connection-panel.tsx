"use client";
import { useState } from "react";
import type { ArchitectureElement } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { relationLabel } from "@/lib/drawio/rules";
import { serviceName, type ServiceConnection } from "./service-overview";
export function ServiceConnectionPanel({
  connection,
  services,
  onInspect,
  onClose,
  onDetails,
}: {
  connection: ServiceConnection;
  services: ArchitectureElement[];
  onInspect: (id: string) => void;
  onClose: () => void;
  onDetails: () => void;
}) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("all");
  const [page, setPage] = useState(0);
  const rows = connection.relationships.filter(
    (row) =>
      (direction === "all" || row.fromServiceId === direction) &&
      [row.id, row.edge.protocol, row.edge.originLayer ?? "", row.edge.resolutionStatus ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pages - 1);
  const names = connection.serviceIds.map((id) => serviceName(services, id));
  return (
    <aside
      aria-label="Service connection details"
      className="[&_button]:min-h-11 fixed inset-x-2 bottom-2 z-40 flex max-h-[86dvh] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-lg xl:sticky xl:inset-auto xl:top-20 xl:z-auto xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:shadow-none"
    >
      <header className="space-y-3 border-b p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Connection overview
            </p>
            <h2 className="mt-1 break-words text-base font-semibold">
              {names[0]} — {names[1]}
            </h2>
          </div>
          <Button size="sm" variant="ghost" aria-label="Close connection details" onClick={onClose}>
            ×
          </Button>
        </div>
        <p className="text-sm">
          {connection.relationshipIds.length} recorded relationship(s) ·{" "}
          {new Set(connection.relationships.map((row) => row.fromServiceId)).size} direction(s)
        </p>
        <p className="text-xs text-muted-foreground">
          {connection.evidenceCount === null
            ? `Total evidence count unavailable; ${connection.evidenceIds.length} known evidence reference(s).`
            : `${connection.evidenceCount} distinct evidence reference(s).`}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          This line groups source relationships, not a single call or observed traffic. Choose an
          individual relationship for its source evidence and 3E.
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        <label className="block text-xs font-medium">
          Find a relationship
          <input
            aria-label="Find a relationship"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Type, source, resolution or ID"
            className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <label className="block text-xs font-medium">
          Direction
          <select
            aria-label="Connection direction"
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value);
              setPage(0);
            }}
            className="mt-2 h-9 w-full rounded-md border bg-card px-2 text-sm"
          >
            <option value="all">Both directions</option>
            {connection.serviceIds.map((id) => (
              <option key={id} value={id}>
                From {serviceName(services, id)}
              </option>
            ))}
          </select>
        </label>
        {rows.slice(current * 20, current * 20 + 20).map((row) => (
          <article key={row.id} className="space-y-2 rounded-lg border p-3">
            <p className="break-words text-sm font-medium">
              {serviceName(services, row.fromServiceId)} → {serviceName(services, row.toServiceId)}
            </p>
            <p className="text-sm">{relationLabel({ id: row.id, type: row.edge.protocol })}</p>
            <p className="text-xs text-muted-foreground">
              Source: {row.edge.originLayer ?? "not recorded"} · Resolution:{" "}
              {row.edge.resolutionStatus ?? "unknown"}
            </p>
            {row.edge.uncertain && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Flagged uncertain — verify the evidence.
              </p>
            )}
            {!row.metadataAvailable && (
              <p className="text-xs text-muted-foreground">
                Only grouped metadata is loaded for this relationship. Its individual evidence is
                not inferred from the group.
              </p>
            )}
            <code className="block break-all text-[11px] text-muted-foreground">{row.id}</code>
            <Button
              variant="outline"
              size="sm"
              disabled={!row.metadataAvailable}
              aria-label={`Inspect relationship ${row.id}`}
              onClick={() => onInspect(row.id)}
            >
              Inspect evidence & 3E
            </Button>
          </article>
        ))}
        {!rows.length && (
          <p role="status" className="text-sm text-muted-foreground">
            No relationships match these connection filters.
          </p>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <span className="text-xs">
              {current + 1}/{pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
      <footer className="border-t p-3">
        <Button size="sm" variant="outline" onClick={onDetails}>
          Show these relationships in Details
        </Button>
      </footer>
    </aside>
  );
}

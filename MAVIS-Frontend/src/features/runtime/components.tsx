import { StatusBadge, StatusLabel, DetailPanel, DataTable } from "@/components/shared/data";
import { EmptyState } from "@/components/shared/request-state";
import type { RuntimeSession } from "@/types/domain";
export function RuntimeStatusBadge({ status }: { status: RuntimeSession["status"] }) {
  return (
    <StatusBadge
      status={status}
      variant={status === "completed" ? "success" : status === "failed" ? "destructive" : "info"}
    />
  );
}
export function RuntimeSessionTimeline({ session }: { session: RuntimeSession }) {
  return (
    <ol className="space-y-3 border-l pl-4">
      {session.events.map((event, i) => (
        <li key={`${event.at}-${i}`} className="text-sm">
          <time className="mr-2 font-mono text-xs text-muted-foreground">{event.at}</time>
          {event.message}
        </li>
      ))}
    </ol>
  );
}
export function TraceViewer({ session }: { session: RuntimeSession }) {
  return (
    <DetailPanel title="Available runtime evidence">
      <p className="text-sm text-muted-foreground">
        Scenario outcome: <StatusLabel status={session.outcome} />. Observed interactions are scoped
        to this run; uncertain mappings require verification.
      </p>
      {!session.traces.length ? (
        <EmptyState
          title="No trace available"
          description="A running or completed session does not guarantee trace coverage."
        />
      ) : (
        <DataTable
          rows={session.traces}
          rowKey={(t) => t.id}
          caption="Observed interactions"
          columns={[
            { key: "path", label: "Interaction", render: (t) => `${t.from} → ${t.to}` },
            {
              key: "time",
              label: "Duration",
              render: (t) => (t.durationMs === null ? "Unknown duration" : `${t.durationMs} ms`),
            },
            {
              key: "mapping",
              label: "Mapping",
              render: (t) => (
                <StatusBadge
                  status={t.uncertain ? "Uncertain" : "Observed"}
                  variant={t.uncertain ? "warning" : "runtime"}
                />
              ),
            },
          ]}
        />
      )}
    </DetailPanel>
  );
}

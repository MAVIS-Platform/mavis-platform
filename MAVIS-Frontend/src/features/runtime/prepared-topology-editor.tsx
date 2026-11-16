"use client";

import { useState } from "react";
import { useApiMutation } from "@/hooks/use-api";
import type { Response } from "@/lib/api/contracts";

export function PreparedTopologyEditor({ projectId, configuration, onSaved }: {
  projectId: string;
  configuration: Response<"runtimeConfiguration">;
  onSaved: () => void;
}) {
  const save = useApiMutation("saveRuntimeConfiguration");
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Prepared Live blocks and connections</summary>
      <p className="my-2 text-xs text-muted-foreground">Use the topology supplied with the curated repository. Each connection needs a dedicated route-controller service already present in Compose and the confirmed service mappings.</p>
      <textarea aria-label="Prepared Studio topology JSON" rows={10}
        value={draft ?? JSON.stringify(configuration.profile?.["studioTopology"] ?? {
          version: 1, blocks: [], connections: [],
        }, null, 2)}
        onChange={(event) => { setDraft(event.target.value); setError(""); }}
        className="w-full rounded border bg-background p-2 font-mono text-xs" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" disabled={save.isPending || !configuration.snapshotId || !configuration.modelId}
        className="mt-2 rounded border px-3 py-1 text-sm disabled:opacity-50"
        onClick={async () => {
          try {
            const topology: unknown = JSON.parse(draft ?? JSON.stringify(configuration.profile?.["studioTopology"] ?? null));
            await save.mutateAsync({
              projectId, profileId: configuration.profileId,
              snapshotId: configuration.snapshotId ?? undefined, modelId: configuration.modelId ?? undefined,
              expectedRevision: configuration.revision,
              profile: { ...configuration.profile, studioTopology: topology },
            });
            setDraft(null);
            setError("");
            onSaved();
          } catch {
            setError("Could not save the topology. Check the pinned service names and reload the runtime configuration if it changed.");
          }
        }}>Save prepared topology</button>
    </details>
  );
}

"use client";
import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { z } from "zod";
import { normalizeError } from "@/lib/errors/api-error";
import type { ArchitecturalModel } from "@/types/domain";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/shared/forms";
import type { Request } from "@/lib/api/contracts";

import { candidateSchema, keyOf } from "./context-candidates";
export function ContextReview({
  model,
  discovery,
}: {
  model: ArchitecturalModel;
  discovery?:
    | { isPending: boolean; isFetching: boolean; isError: boolean; refetch: () => unknown }
    | undefined;
}) {
  const api = useApi(),
    save = useApiMutation("reviewContext"),
    router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const internal = model.elements.filter(
    (n) => !["PERSON", "EXTERNAL_SYSTEM"].includes(n.elementType ?? ""),
  );
  const rawReview = model.elements
    .map((n) => n.properties?.["contextReview"])
    .find((value) => value !== undefined);
  const parsedReview = z
    .object({
      entries: z.array(z.unknown()).default([]),
      audit: z.array(z.unknown()).default([]),
      lastSuggestionCount: z.number().optional(),
    })
    .safeParse(rawReview);
  const stored = parsedReview.success ? parsedReview.data : undefined;
  const entries = (stored?.entries ?? []).flatMap((value) => {
    const parsed = candidateSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const audit = (stored?.audit ?? []).flatMap((value) => {
    const parsed = z
      .object({ action: z.string(), actorId: z.string(), at: z.string(), baseModelId: z.string() })
      .safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const [editId, setEditId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"PERSON" | "EXTERNAL_SYSTEM">("PERSON");
  const [target, setTarget] = useState(internal[0] ? keyOf(internal[0]) : "");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [basis, setBasis] = useState("");
  const editingExtracted = entries.some(
    (entry) => entry.id === editId && Boolean(entry.existingElementKey),
  );
  const [confirmId, setConfirmId] = useState("");
  const [boundary, setBoundary] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  async function act(request: Omit<Request<"reviewContext">, "modelId" | "expectedRevision">) {
    setError("");
    try {
      const next = await save.mutateAsync({
        modelId: model.id,
        expectedRevision: model.revision,
        ...request,
      });
      const query = new URLSearchParams(params.toString());
      query.set("model", next.id);
      router.replace(`${pathname}?${query}`, { scroll: false });
    } catch (e) {
      setError(
        normalizeError(e).kind === "timeout"
          ? "The save response timed out. Its outcome is unknown. Reload the latest revision before retrying; your decision may already have been saved."
          : e instanceof Error
            ? e.message
            : "Context review could not be saved.",
      );
    }
  }
  if (api.mode !== "backend")
    return (
      <p className="rounded-lg border p-3 text-xs text-muted-foreground">
        Context review requires a connected backend. Demo suggestions are not saved as verified
        facts.
      </p>
    );
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Review system context ·{" "}
        {discovery?.isPending
          ? "Checking source…"
          : discovery?.isError
            ? "Source check unavailable"
            : `${entries.filter((e) => e.state === "PROPOSED").length} pending`}
      </summary>
      <div className="mt-4 space-y-4 text-sm">
        <p className="text-xs leading-5 text-muted-foreground">
          Source security principals are drawn provisionally with dashed lines. They are not
          confirmed human actors. Please verify their business role; only your confirmation records
          a context decision.
        </p>
        {discovery?.isError && (
          <p role="alert" className="text-destructive">
            Source candidates could not be loaded. Retry the source check; this does not mean no
            actors exist.
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="outline"
          disabled={save.isPending || discovery?.isFetching || !internal.length}
          onClick={() => (discovery ? void discovery.refetch() : void act({ action: "SUGGEST" }))}
        >
          Refresh source candidates
        </Button>
        <p className="text-xs text-muted-foreground">
          Scans saved source access rules. No AI-generated actor names or default User actor are
          added. Source previews do not create a model revision.
        </p>
        {stored?.lastSuggestionCount === 0 &&
          !entries.some((e) => e.state === "PROPOSED") &&
          !discovery?.isError &&
          !discovery?.isPending && (
            <p role="status" className="text-xs text-muted-foreground">
              No new evidence-backed candidates were found. No actors or external systems were
              invented.
            </p>
          )}
        {entries.map((entry) => (
          <article key={entry.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>{entry.name}</strong>
              <span className="text-xs text-muted-foreground">
                {entry.state} · {entry.proposalOrigin.replaceAll("_", " ")}
              </span>
            </div>
            <p className="text-xs">
              {entry.kind === "PERSON" ? "Actor candidate" : "External system candidate"} ·{" "}
              {entry.direction.toLowerCase()} ·{" "}
              {internal.find((n) => keyOf(n) === entry.targetKey)?.name ?? "Target unavailable"}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">{entry.basis}</p>
            {entry.sourceLocator && (
              <details className="text-xs">
                <summary className="cursor-pointer">View source reference</summary>
                <p className="mt-2 break-all font-mono">
                  {entry.sourceLocator} · revision ID {entry.sourceModelId}
                </p>
                {entry.sourceExcerpt && (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted/40 p-2">
                    {entry.sourceExcerpt}
                  </pre>
                )}
                <p className="mt-2">This snippet supports the suggestion, not the business role.</p>
              </details>
            )}
            {entry.state === "CONFIRMED" && (
              <p className="text-xs">User-confirmed: {entry.boundary}</p>
            )}
            {entry.state === "PROPOSED" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => {
                    setEditId(entry.id);
                    setName(entry.name);
                    setKind(entry.kind);
                    setTarget(entry.targetKey);
                    setDirection(entry.direction);
                    setBasis(entry.basis);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => {
                    setConfirmId(entry.id);
                    setBoundary("");
                    setAck(false);
                  }}
                >
                  Review & confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() => void act({ action: "REJECT", candidateId: entry.id })}
                >
                  Reject
                </Button>
              </div>
            )}
            {confirmId === entry.id && entry.state === "PROPOSED" && (
              <form
                className="space-y-3 border-t pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (ack) void act({ action: "CONFIRM", candidateId: entry.id, boundary });
                }}
              >
                <label className="block space-y-1 text-xs">
                  <span>
                    Explain the actor role or why this system is outside the project boundary
                  </span>
                  <Textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    value={boundary}
                    onChange={(e) => setBoundary(e.target.value)}
                  />
                </label>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    required
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  I confirm this context decision. It is my assertion, not proof of source or
                  runtime behavior.
                </label>
                <Button size="sm" disabled={save.isPending || !ack || boundary.trim().length < 10}>
                  Confirm and create revision
                </Button>
              </form>
            )}
          </article>
        ))}
        <form
          className="space-y-3 rounded-lg border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void act({
              action: editId ? "EDIT" : "PROPOSE",
              ...(editId ? { candidateId: editId } : {}),
              name,
              kind,
              targetKey: target,
              direction,
              basis,
            });
          }}
        >
          <h4 className="font-medium">{editId ? "Edit candidate" : "Add a candidate manually"}</h4>
          <label className="block text-xs">
            Name
            <Input
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Kind"
              disabled={editingExtracted}
              value={kind}
              onChange={(v) => setKind(v as typeof kind)}
              options={[
                { value: "PERSON", label: "Actor (requires confirmation)" },
                { value: "EXTERNAL_SYSTEM", label: "External system (requires boundary review)" },
              ]}
            />
            <SelectField
              label="Interaction direction"
              disabled={editingExtracted}
              value={direction}
              onChange={(v) => setDirection(v as typeof direction)}
              options={[
                { value: "INBOUND", label: "Candidate → system" },
                { value: "OUTBOUND", label: "System → candidate" },
              ]}
            />
          </div>
          <SelectField
            label="Internal element involved"
            disabled={editingExtracted}
            value={target}
            onChange={setTarget}
            options={internal.map((n) => ({ value: keyOf(n), label: n.name }))}
          />
          <label className="block space-y-1 text-xs">
            <span>Basis for this suggestion (document reference or your own assertion)</span>
            <Textarea
              required
              maxLength={2000}
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={save.isPending || !target}>
              {editId ? "Save candidate changes" : "Save as proposed"}
            </Button>
            {editId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditId("");
                  setName("");
                  setBasis("");
                }}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
        <p className="text-xs text-muted-foreground">
          Every change creates a controlled revision with reviewer identity and audit history.
          Confirmed facts and source references are retained in the model.{" "}
          {stored?.audit?.length ?? 0} review event(s) in this revision.
        </p>
        {audit.length > 0 && (
          <details className="rounded-lg border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Review history · latest {Math.min(20, audit.length)} of {audit.length}
            </summary>
            <ol className="mt-3 space-y-2">
              {audit
                .slice(-20)
                .reverse()
                .map((event, index) => (
                  <li key={index} className="break-words">
                    {event.action} · {event.at}
                    <br />
                    Reviewer: {event.actorId}
                    <br />
                    Base revision ID: {event.baseModelId}
                  </li>
                ))}
            </ol>
          </details>
        )}
      </div>
    </details>
  );
}

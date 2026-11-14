"use client";

import { useState } from "react";
import { z } from "zod";
import { useApiQuery } from "@/hooks/use-api";
import { ErrorState } from "@/components/shared/request-state";
import { useLocale } from "@/lib/i18n/locale-context";

const frozenStudio = z.object({
  studioEvidence: z.object({
    receiptDigest: z.string(),
    receiptSignature: z.string().nullable().optional(),
    snapshots: z.array(
      z.object({
        id: z.string(),
        capturedAt: z.string(),
        explanation: z.string(),
        digest: z.string(),
        imageData: z.string().startsWith("data:image/png;base64,").optional(),
      }),
    ),
  }),
});

export function StudioSubmissionEvidence({
  submissionId,
  available,
}: {
  submissionId: string;
  available: boolean;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const exported = useApiQuery(
    "submissionExport",
    { submissionId },
    { enabled: available && open },
  );
  const evidence = frozenStudio.safeParse(exported.data);
  if (!available) return null;
  return (
    <details
      className="my-3 rounded-lg border p-3"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="font-medium">{t("Frozen Studio evidence")}</summary>
      {exported.isPending && <p role="status">{t("Loading evidence")}</p>}
      {exported.isError && <ErrorState error={exported.error} />}
      {evidence.success && (
        <div className="space-y-3 py-2">
          <p className="break-all font-mono text-xs">
            {evidence.data.studioEvidence.receiptDigest}
          </p>
          {evidence.data.studioEvidence.snapshots.map((snapshot, index) => (
            <figure key={snapshot.id} className="space-y-2">
              <figcaption className="text-sm">
                {new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.explanation}
              </figcaption>
              {snapshot.imageData && (
                <img
                  src={snapshot.imageData}
                  alt={t("Studio snapshot") + " " + (index + 1)}
                  width={1400}
                  height={920}
                  className="h-auto w-full rounded border"
                />
              )}
              <p className="break-all font-mono text-xs">{snapshot.digest}</p>
            </figure>
          ))}
        </div>
      )}
    </details>
  );
}

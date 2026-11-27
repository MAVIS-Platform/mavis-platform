"use client";

import { useState } from "react";
import { useApiQuery } from "@/hooks/use-api";
import { contracts } from "@/lib/api/contracts";
import { SelectField } from "@/components/shared/forms";
import { ErrorState } from "@/components/shared/request-state";
import { formatLocalizedTime } from "@/lib/format/date-time";
import { useLocale } from "@/lib/i18n/locale-context";

const telemetrySchema = contracts.studioState.output.shape.telemetry.unwrap();
export function StudioSnapshotComparison({
  sessionId,
  snapshots,
}: {
  sessionId: string;
  snapshots: { id: string; capturedAt: string; explanation: string }[];
}) {
  const { locale, t } = useLocale();
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const beforeSelection = snapshots.some((item) => item.id === beforeId)
    ? beforeId
    : (snapshots[0]?.id ?? "");
  const afterSelection = snapshots.some((item) => item.id === afterId)
    ? afterId
    : (snapshots.at(-1)?.id ?? "");
  const before = useApiQuery(
    "studioSnapshot",
    { sessionId, snapshotId: beforeSelection },
    { enabled: Boolean(beforeSelection) },
  );
  const after = useApiQuery(
    "studioSnapshot",
    { sessionId, snapshotId: afterSelection },
    { enabled: Boolean(afterSelection) && beforeSelection !== afterSelection },
  );
  const previous = telemetrySchema.safeParse(before.data?.["telemetry"]);
  const current = telemetrySchema.safeParse(after.data?.["telemetry"]);
  const options = snapshots.map((item) => ({
    value: item.id,
    label: formatLocalizedTime(item.capturedAt, locale) + " · " + item.explanation.slice(0, 100),
  }));
  return (
    <section className="space-y-3">
      <h4 className="font-medium">{t("Compare captured snapshots")}</h4>
      <div className="flex flex-wrap gap-3">
        <SelectField
          label={t("Before")}
          value={beforeSelection}
          onChange={setBeforeId}
          options={options}
        />
        <SelectField
          label={t("After")}
          value={afterSelection}
          onChange={setAfterId}
          options={options}
        />
      </div>
      {before.isError && <ErrorState error={before.error} />}
      {after.isError && <ErrorState error={after.error} />}
      {beforeSelection === afterSelection && (
        <p role="status">{t("Choose two different snapshots.")}</p>
      )}
      {previous.success && current.success && beforeSelection !== afterSelection && (
        <>
          <p className="text-sm">
            {t("Captured spans")}: {previous.data.spans.length} → {current.data.spans.length}
          </p>
          {current.data.services.map((service) => {
            const earlier = previous.data.services.find((item) => item.service === service.service);
            return (
              <div key={service.service} className="space-y-1 rounded border p-2 text-sm">
                <p className="font-medium">{service.service}</p>
                <p>
                  {t("Running replicas")}: {earlier?.runningReplicas ?? "—"} →{" "}
                  {service.runningReplicas}
                </p>
                <p>
                  CPU: {earlier?.stats.map((item) => item.cpu).join(", ") || "—"} →{" "}
                  {service.stats.map((item) => item.cpu).join(", ") || "—"}
                </p>
                <p>
                  RAM: {earlier?.stats.map((item) => item.memory).join(", ") || "—"} →{" "}
                  {service.stats.map((item) => item.memory).join(", ") || "—"}
                </p>
              </div>
            );
          })}
          <div className="grid gap-3 md:grid-cols-2">
            {[before.data, after.data].map((snapshot, index) =>
              snapshot &&
              typeof snapshot["imageData"] === "string" &&
              (snapshot["imageData"].startsWith("data:image/png;base64,") ||
                snapshot["imageData"].startsWith("data:image/webp;base64,")) ? (
                <figure key={index}>
                  <figcaption>{t(index === 0 ? "Before" : "After")}</figcaption>
                  <img
                    src={snapshot["imageData"]}
                    alt={t(index === 0 ? "Before" : "After")}
                    width={1400}
                    height={920}
                    className="h-auto w-full rounded border"
                  />
                </figure>
              ) : null,
            )}
          </div>
        </>
      )}
    </section>
  );
}

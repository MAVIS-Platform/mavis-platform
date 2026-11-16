"use client";

import Link from "next/link";
import { Activity, ArrowRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { PublishCourseLab, useCourseSetup, useRuntimeSetupReadiness } from "@/features/workspaces/course-access";
import type { Assignment } from "./requirements";

export function LabStudioSection({
  workspaceId,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  assignment: Assignment;
  onNavigate: (tab: "publish") => void;
}) {
  const { t } = useLocale();
  const projectId = assignment.referenceSource?.projectId ?? null;
  const readiness = useRuntimeSetupReadiness(projectId);
  const setup = useCourseSetup(workspaceId);
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === assignment.id);
  const published = setupLab?.published === true;

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              {t("MAVIS Studio Live", "MAVIS Studio Live")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Prepare the runtime profile on the pinned reference project, then freeze its topology into this Lab.",
                "Chuẩn bị runtime profile trên project tham chiếu đã ghim, sau đó đóng băng topology vào Lab này.",
              )}
            </p>
          </div>
          <Badge variant={setupLab?.topologyFrozen ? "success" : "secondary"}>
            {setupLab?.topologyFrozen
              ? t("Topology frozen", "Đã đóng băng topology")
              : t("Not frozen", "Chưa đóng băng")}
          </Badge>
        </div>

        {!projectId ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t(
              "Attach and analyze the reference source before configuring Studio Live.",
              "Gắn và phân tích nguồn tham chiếu trước khi cấu hình Studio Live.",
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{t("Runtime profile", "Runtime profile")}</p>
                <p className="mt-1 font-medium">{readiness.data?.configured ? t("Configured", "Đã cấu hình") : t("Not configured", "Chưa cấu hình")}</p>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{t("Preflight", "Preflight")}</p>
                <p className="mt-1 font-medium">{readiness.data?.preflightCompatible ? t("Compatible", "Tương thích") : t("Not compatible", "Chưa tương thích")}</p>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{t("Runner / images", "Runner / image")}</p>
                <p className="mt-1 font-medium">{readiness.data?.runnerReady ? t("Configuration ready", "Cấu hình sẵn sàng") : t("Not ready", "Chưa sẵn sàng")}</p>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{t("Prepared topology", "Topology đã chuẩn bị")}</p>
                <p className="mt-1 font-medium">
                  {Array.isArray((readiness.data?.topology as { blocks?: unknown[] } | null)?.blocks)
                    ? (readiness.data?.topology as { blocks: unknown[] }).blocks.length
                    : 0}{" "}
                  {t("blocks", "block")}
                </p>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Runner/images ready reflects the profile configuration returned by the API. It is not a live Runner health check.",
                "Runner/image sẵn sàng phản ánh cấu hình profile do API trả về. Đây không phải kiểm tra health Runner trực tiếp.",
              )}
            </p>
            {readiness.data && (
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <p>
                  <span className="font-medium">{t("Applications", "Ứng dụng")}:</span>{" "}
                  {readiness.data.applications.join(", ") || "—"}
                </p>
                <p>
                  <span className="font-medium">{t("Mappings", "Ánh xạ")}:</span>{" "}
                  {readiness.data.mappings.join(", ") || "—"}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button asChild variant="outline">
                <Link href={`/runtime-config?project=${encodeURIComponent(projectId)}`}>
                  {t("Configure runtime & Studio Live", "Cấu hình runtime & Studio Live")}
                  <ArrowRight className="ml-1 size-4" aria-hidden="true" />
                </Link>
              </Button>
              {published ? (
                <PublishCourseLab
                  workspaceId={workspaceId}
                  assignmentId={assignment.id}
                  position={setupLab?.position}
                />
              ) : (
                <Button type="button" variant="outline" onClick={() => onNavigate("publish")}>
                  {t("Publish the Lab before freezing topology", "Công bố Lab trước khi đóng băng topology")}
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

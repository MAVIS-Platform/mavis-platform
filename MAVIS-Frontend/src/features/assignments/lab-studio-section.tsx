"use client";

import Link from "next/link";
import { Activity, ArrowRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { PublishCourseLab, useCourseSetup, useRuntimeSetupReadiness } from "@/features/workspaces/course-access";
import { PreparedTopologyEditor } from "@/features/runtime/prepared-topology-editor";
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
  const runtimeConfig = useApiQuery(
    "runtimeConfiguration",
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) },
  );
  const sessions = useApiQuery(
    "runtimeReadSessions",
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) },
  );
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === assignment.id);
  const published = setupLab?.published === true;
  const modelId = assignment.referenceSource?.modelId;
  const verifiedSession = sessions.data?.find(
    (session) => session.assignmentId === assignment.id && session.studioVerified,
  ) ?? sessions.data?.find((session) => session.studioVerified);
  const returnTo = `/lab-authoring?${new URLSearchParams({
    workspace: workspaceId,
    assignment: assignment.id,
    tab: "studio",
  })}`;
  const sessionStartHref = projectId
    ? `/sessions?${new URLSearchParams({
        project: projectId,
        assignment: assignment.id,
        ...(modelId ? { model: modelId } : {}),
        studio: "1",
        returnTo,
      })}`
    : "/sessions?studio=1";
  const studioHref = projectId
    ? `/studio?${new URLSearchParams({
        project: projectId,
        assignment: assignment.id,
        ...(modelId ? { model: modelId } : {}),
        returnTo,
      })}`
    : "/studio";

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
                  {(readiness.data.applications ?? []).join(", ") || "—"}
                </p>
                <p>
                  <span className="font-medium">{t("Mappings", "Ánh xạ")}:</span>{" "}
                  {(readiness.data.mappings ?? []).join(", ") || "—"}
                </p>
              </div>
            )}
            {verifiedSession && (
              <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                {t("Verified Studio session", "Phiên Studio đã xác minh")}:{" "}
                <span className="font-mono">{verifiedSession.id.slice(0, 12)}…</span>
                {verifiedSession.assignmentId === assignment.id
                  ? ` · ${t("linked to this Lab", "đã liên kết với Lab này")}`
                  : ` · ${t("select the Lab-linked session before freezing", "chọn phiên gắn với Lab trước khi đóng băng")}`}
              </p>
            )}
            {projectId && runtimeConfig.data && (
              <PreparedTopologyEditor
                projectId={projectId}
                configuration={runtimeConfig.data}
                onSaved={() => {
                  void runtimeConfig.refetch();
                  void readiness.refetch();
                  void setup.refetch();
                }}
              />
            )}
            {projectId && !runtimeConfig.data && !runtimeConfig.isPending && (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {t(
                  "Save the runtime configuration first. Prepared topology is stored in the pinned runtime profile.",
                  "Lưu cấu hình runtime trước. Prepared topology được lưu trong runtime profile đã ghim.",
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button asChild variant="outline">
                <Link href={`/runtime-config?project=${encodeURIComponent(projectId)}`}>
                  {t("Configure runtime & Studio Live", "Cấu hình runtime & Studio Live")}
                  <ArrowRight className="ml-1 size-4" aria-hidden="true" />
                </Link>
              </Button>
              {readiness.data?.configured ? (
                <Button asChild>
                  <Link href={sessionStartHref}>
                    {t("Start Live session", "Bắt đầu phiên Live")}
                    <ArrowRight className="ml-1 size-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled
                  title={t(
                    "Configure the runtime profile before starting a Live session.",
                    "Cấu hình runtime profile trước khi bắt đầu phiên Live.",
                  )}
                >
                  {t("Start Live session", "Bắt đầu phiên Live")}
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={studioHref}>
                  {t("Open MAVIS Studio", "Mở MAVIS Studio")}
                </Link>
              </Button>
              {published ? (
                <PublishCourseLab
                  workspaceId={workspaceId}
                  assignmentId={assignment.id}
                  position={setupLab?.position}
                  sessionId={verifiedSession?.assignmentId === assignment.id ? verifiedSession.id : undefined}
                />
              ) : (
                <Button type="button" variant="outline" onClick={() => onNavigate("publish")}>
                  {t("Publish the Lab before freezing topology", "Công bố Lab trước khi đóng băng topology")}
                </Button>
              )}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Start Live session opens the Runtime sessions page with this reference project. Open MAVIS Studio selects the project and the newest running session automatically.",
                "Bắt đầu phiên Live mở trang Phiên Runtime với project tham chiếu này. Mở MAVIS Studio sẽ chọn project và phiên đang chạy mới nhất tự động.",
              )}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

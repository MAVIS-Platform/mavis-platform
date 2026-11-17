"use client";

import { useState } from "react";
import { Activity, Lock, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  PublishCourseLab,
  useAutoConfigureStudio,
  useBootstrapLabStudio,
  useCourseSetup,
  useRuntimeSetupReadiness,
  useStartLabStudioSession,
} from "@/features/workspaces/course-access";
import { PreparedTopologyEditor } from "@/features/runtime/prepared-topology-editor";
import { LiveStudioWorkbench } from "@/features/runtime/live-studio-workbench";
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
  const autoStudio = useAutoConfigureStudio(workspaceId, assignment.id);
  const startStudio = useStartLabStudioSession(workspaceId, assignment.id);
  const bootstrapStudio = useBootstrapLabStudio(workspaceId, assignment.id);
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
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [showPlaytest, setShowPlaytest] = useState(false);
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === assignment.id);
  const published = setupLab?.published === true;
  const sessionList = sessions.data ?? [];
  const verifiedSession =
    sessionList.find((session) => session.assignmentId === assignment.id && session.studioVerified) ??
    sessionList.find((session) => session.studioVerified);
  const activeSessionId =
    selectedSessionId ||
    sessionList.find((session) => session.assignmentId === assignment.id)?.id ||
    sessionList[0]?.id ||
    "";

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              {t("MAVIS Studio Live · Self-Contained Editor & Playtest", "MAVIS Studio Live · Cấu hình & Chạy thử trực tiếp")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Auto-configure the runtime profile and 2D topology right here, refine blocks/links, and playtest without leaving Lab Authoring.",
                "Tự động cấu hình runtime profile và topology 2D ngay tại đây, tinh chỉnh block/kết nối và chạy thử không cần rời trang Soạn Lab.",
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" />
                  {t(
                    "Auto-Configure & Freeze 2D Studio Topology (1-Click)",
                    "Tự động cấu hình & Đóng băng Topology Studio 2D (1 chạm)",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Extracts services and edges from the reference model, creates runtime profile & scenario, and freezes the 2D Studio sandbox for students.",
                    "Trích xuất các service và luồng gọi từ model chuẩn, tạo runtime profile & kịch bản mặc định, và đóng băng sandbox 2D cho sinh viên.",
                  )}
                </p>
              </div>
              <Button
                type="button"
                disabled={autoStudio.isPending}
                onClick={() =>
                  autoStudio.mutate(undefined, {
                    onSuccess: () => {
                      void runtimeConfig.refetch();
                      void readiness.refetch();
                      void setup.refetch();
                    },
                  })
                }
              >
                {autoStudio.isPending
                  ? t("Configuring & Freezing…", "Đang cấu hình & đóng băng…")
                  : t("⚡ 1-Click Auto-Configure Studio", "⚡ Tự động cấu hình Studio")}
              </Button>
            </div>
            {autoStudio.isSuccess && (
              <p role="status" className="text-xs text-success">
                {autoStudio.data.message} · {autoStudio.data.containerCount}{" "}
                {t("containers", "container")} · {autoStudio.data.linkCount} {t("links", "liên kết")}
              </p>
            )}
            {autoStudio.error && <ErrorState error={autoStudio.error} />}

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
                  : ` · ${t("available as fallback verified trace", "dự phòng nếu chưa có phiên riêng của Lab")}`}
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
                  "Click 1-Click Auto-Configure Studio above to initialize the runtime profile and 2D topology.",
                  "Nhấn Tự động cấu hình Studio ở trên để khởi tạo runtime profile và topology 2D.",
                )}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button
                type="button"
                variant={showPlaytest ? "secondary" : "outline"}
                onClick={() => setShowPlaytest((open) => !open)}
              >
                <Play className="mr-1.5 size-4" aria-hidden="true" />
                {showPlaytest
                  ? t("Hide Inline Studio Playtest", "Ẩn khung chạy thử Studio")
                  : t("Playtest 2D Studio Inline", "Chạy thử Studio 2D trực tiếp")}
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

            {showPlaytest && (
              <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("Inline Studio Playtest Sandbox", "Khung chạy thử Studio ngay trong Soạn Lab")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={startStudio.isPending}
                      onClick={() =>
                        startStudio.mutate(undefined, {
                          onSuccess: (created) => {
                            if (created?.id) setSelectedSessionId(created.id);
                          },
                        })
                      }
                    >
                      {startStudio.isPending
                        ? t("Starting session…", "Đang khởi tạo phiên…")
                        : t("New Playtest Session", "Khởi tạo phiên thử mới")}
                    </Button>
                    {activeSessionId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={bootstrapStudio.isPending}
                        onClick={() => bootstrapStudio.mutate(activeSessionId)}
                      >
                        {bootstrapStudio.isPending
                          ? t("Loading 2D Sandbox…", "Đang nạp Sandbox 2D…")
                          : t("Initialize Simulated Topology", "Nạp Topology mô phỏng")}
                      </Button>
                    )}
                  </div>
                </div>
                {startStudio.error && <ErrorState error={startStudio.error} />}
                {bootstrapStudio.error && <ErrorState error={bootstrapStudio.error} />}
                <LiveStudioWorkbench
                  sessions={sessionList}
                  sessionId={activeSessionId}
                  projectId={projectId}
                  onSelectSession={setSelectedSessionId}
                  onStartSession={() =>
                    startStudio.mutate(undefined, {
                      onSuccess: (created) => {
                        if (created?.id) setSelectedSessionId(created.id);
                      },
                    })
                  }
                  starting={startStudio.isPending}
                  hideSwitchToSandbox
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

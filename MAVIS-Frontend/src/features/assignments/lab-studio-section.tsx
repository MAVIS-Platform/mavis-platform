"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Lock, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import { useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  PublishCourseLab,
  useAutoConfigureStudio,
  useCourseSetup,
  useRuntimeSetupReadiness,
  useStartLabStudioSession,
  useStudentLabStudioSessions,
} from "@/features/workspaces/course-access";
import { PreparedTopologyEditor } from "@/features/runtime/prepared-topology-editor";
import { LiveStudioWorkbench } from "@/features/runtime/live-studio-workbench";
import { StudioExerciseEditor } from "./studio-exercise-editor";
import type { Assignment } from "./requirements";

export function LabStudioSection({
  workspaceId,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  assignment: Assignment;
  onNavigate: (tab: "source" | "publish") => void;
}) {
  const { t } = useLocale();
  const exercise = useQuery({
    queryKey: ["api", "studio-exercise", workspaceId, assignment.id],
    queryFn: ({ signal }) =>
      api<{ runtimeProjectId: string | null } | null>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/studio-exercise`,
        { signal },
      ),
    retry: false,
  });
  const projectId = assignment.referenceSource?.projectId ?? exercise.data?.runtimeProjectId ?? null;
  const readiness = useRuntimeSetupReadiness(projectId);
  const setup = useCourseSetup(workspaceId);
  const autoStudio = useAutoConfigureStudio(workspaceId, assignment.id);
  const startStudio = useStartLabStudioSession(workspaceId, assignment.id);
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
  const labSessions = useStudentLabStudioSessions(
    workspaceId,
    assignment.id,
    Boolean(projectId),
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [showPlaytest, setShowPlaytest] = useState(false);
  const setupLab = setup.data?.labs?.find((item) => item.assignmentId === assignment.id);
  const published = setupLab?.published === true;
  const sessionList = [
    ...(labSessions.data ?? []),
    ...(sessions.data ?? []).filter(
      (item) => !(labSessions.data ?? []).some((labItem) => labItem.id === item.id),
    ),
  ];
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {t(
                  "Attach and analyze the single unified Lab repository in Step 2 (Reference source) first.",
                  "Hãy gắn và phân tích Repo chuẩn của bài Lab ở Bước 2 (Nguồn tham chiếu) trước.",
                )}
              </span>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => onNavigate("source")}>
              {t("← Go to Step 2: Reference source", "← Sang Bước 2: Nguồn tham chiếu")}
            </Button>
          </div>
        ) : (
          <>
            <StudioExerciseEditor
              workspaceId={workspaceId}
              assignmentId={assignment.id}
              labTitle={assignment.title}
              applications={readiness.data?.applications ?? []}
              defaultModelId={assignment.referenceSource?.modelId}
              referenceSource={assignment.referenceSource}
              onSaved={() => {
                void exercise.refetch();
                void readiness.refetch();
                void runtimeConfig.refetch();
                void setup.refetch();
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" />
                  {t(
                    "Auto-Configure 2D Studio Topology (1-Click)",
                    "Tự động cấu hình Topology Studio 2D (1 chạm)",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Extracts services, ports and controllers from the selected Studio repository and prepares the 2D topology & baseline scenario.",
                    "Trích xuất service, port và controller từ repo Studio đã chọn để khởi tạo topology 2D và kịch bản kiểm tra.",
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
                  ? t("Configuring Studio…", "Đang cấu hình Studio…")
                  : t("⚡ 1-Click Auto-Configure Studio", "⚡ Tự động cấu hình 2D Studio")}
              </Button>
            </div>
            {autoStudio.isSuccess && (
              <p role="status" className="text-xs text-success">
                {autoStudio.data.message ??
                  t(
                    "Auto-configured 2D Studio topology",
                    "Đã tự động cấu hình Topology 2D Studio",
                  )}{" "}
                · {autoStudio.data.blockCount ?? autoStudio.data.containerCount ?? 0}{" "}
                {t("blocks", "block dịch vụ")} ·{" "}
                {autoStudio.data.connectionCount ?? autoStudio.data.linkCount ?? 0}{" "}
                {t("connections", "kết nối điều khiển")}
              </p>
            )}
            {autoStudio.error && <ErrorState error={autoStudio.error} />}

            {readiness.data?.configured &&
            readiness.data?.preflightCompatible &&
            readiness.data?.runnerReady ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 text-sm text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-100">
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    {t(
                      "2D Studio Live is Ready for Students",
                      "Studio Live 2D đã sẵn sàng cho Sinh viên",
                    )}
                  </p>
                  <p className="text-xs opacity-85">
                    {readiness.data.applications?.length ?? 0}{" "}
                    {t("interactive services prepared", "dịch vụ tương tác đã chuẩn bị")}
                    {setupLab?.topologyFrozen
                      ? ` · ${t("Topology locked & ready", "Topology đã đóng băng an toàn")}`
                      : ""}
                  </p>
                </div>
                <Badge variant="success">{t("Ready", "Sẵn sàng")}</Badge>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 p-4 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100">
                <p className="font-semibold">
                  {t(
                    "Studio Topology Needs Initialization",
                    "Studio 2D Cần Được Khởi Tạo Cấu Hình",
                  )}
                </p>
                <p className="mt-1 opacity-85">
                  {t(
                    "Click 'Auto-Configure Studio' above or customize services and edges in the visual editor below.",
                    "Nhấn nút 'Tự động cấu hình Studio' ở trên hoặc tự thiết kế dịch vụ ở trình chỉnh sửa trực quan bên dưới.",
                  )}
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
              <details className="rounded-xl border bg-muted/10 p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(
                    "Advanced 2D Topology Fine-Tuning (Blocks & Connections)",
                    "Tinh chỉnh nâng cao Topology 2D (Blocks & Connections)",
                  )}
                </summary>
                <div className="mt-3">
                  <PreparedTopologyEditor
                    projectId={projectId}
                    configuration={runtimeConfig.data}
                    onSaved={() => {
                      void runtimeConfig.refetch();
                      void readiness.refetch();
                      void setup.refetch();
                    }}
                  />
                </div>
              </details>
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
                  sessionId={verifiedSession?.id}
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
                  </div>
                </div>
                {startStudio.error && <ErrorState error={startStudio.error} />}
                <div className="h-[680px] overflow-hidden rounded-xl border border-slate-800">
                  <LiveStudioWorkbench
                    sessions={sessionList}
                    sessionId={activeSessionId}
                    projectId={projectId}
                    onSelectSession={setSelectedSessionId}
                    onStartSession={() =>
                      startStudio.mutate(undefined, {
                        onSuccess: (created) => {
                          if (created?.id) setSelectedSessionId(created.id);
                          void labSessions.refetch();
                        },
                      })
                    }
                    starting={startStudio.isPending}
                    hideSwitchToSandbox
                  />
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatCourseLabTitle } from "@/lib/format/course-display";
import {
  useCourseSetup,
  useRuntimeSetupReadiness,
  type CourseSetup,
  type CourseSetupLab,
} from "@/features/workspaces/course-access";

const STEP_LABELS: Record<string, { en: string; vi: string }> = {
  workspace: { en: "Course workspace", vi: "Lớp học" },
  reference: { en: "Curated reference source", vi: "Nguồn tham chiếu" },
  runtime: { en: "Runtime profile", vi: "Cấu hình runtime" },
  studio: { en: "Studio Live topology", vi: "Topology Studio Live" },
  labs: { en: "Labs published", vi: "Công bố Lab" },
  quiz: { en: "Versioned quiz", vi: "Quiz có phiên bản" },
  passkey: { en: "Enrollment Passkey", vi: "Passkey ghi danh" },
  preview: { en: "Student Lab preview", vi: "Xem trước Lab sinh viên" },
};

const ACTION_LABELS: Record<string, { en: string; vi: string }> = {
  workspace: { en: "Manage members", vi: "Quản lý thành viên" },
  reference: { en: "Attach source", vi: "Gắn nguồn" },
  runtime: { en: "Configure runtime", vi: "Cấu hình runtime" },
  studio: { en: "Configure Studio Live", vi: "Cấu hình Studio Live" },
  labs: { en: "Manage Labs", vi: "Quản lý Lab" },
  quiz: { en: "Publish quiz", vi: "Công bố quiz" },
  passkey: { en: "Issue Passkey", vi: "Cấp Passkey" },
  preview: { en: "Preview Lab", vi: "Xem trước Lab" },
};

function stepHref(stepId: string, data: CourseSetup, workspaceId: string) {
  const workspace = `/assignments?workspace=${encodeURIComponent(workspaceId)}`;
  const targetLabId = data.previewAssignmentId ?? data.labs[0]?.assignmentId ?? null;
  if (stepId === "workspace") return `/members?workspace=${encodeURIComponent(workspaceId)}`;
  if (stepId === "runtime" || stepId === "studio") {
    return targetLabId
      ? `/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(targetLabId)}&tab=studio`
      : workspace;
  }
  if (stepId === "passkey") {
    return `/workspace-overview?workspace=${encodeURIComponent(workspaceId)}#class-passkey`;
  }
  if (stepId === "preview")
    return data.previewAssignmentId
      ? `/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(data.previewAssignmentId)}&step=1`
      : null;
  return workspace;
}

function stateVariant(state: string): "success" | "warning" | "secondary" | "destructive" {
  return state === "DONE"
    ? "success"
    : state === "PARTIAL"
      ? "warning"
      : state === "BLOCKED"
        ? "destructive"
        : "secondary";
}

function labVariant(state: string): "success" | "warning" | "secondary" | "destructive" {
  return state === "READY"
    ? "success"
    : state === "NEEDS_STUDIO" || state === "NEEDS_FREEZE" || state === "NEEDS_QUIZ"
      ? "warning"
      : "secondary";
}

function stepActionLabel(stepId: string, data: CourseSetup) {
  if (stepId === "studio" && data.nextAction === "freeze-topology")
    return { en: "Freeze topology", vi: "Đóng băng topology" };
  return ACTION_LABELS[stepId] ?? { en: "Open", vi: "Mở" };
}

export function CourseSetupPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const setup = useCourseSetup(workspaceId);
  const readiness = useRuntimeSetupReadiness(setup.data?.reference.projectId ?? null);

  if (setup.isPending) {
    return (
      <section className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
        {t("Loading course setup…", "Đang tải thiết lập khóa học…")}
      </section>
    );
  }
  if (setup.isError || !setup.data) {
    return (
      <section className="space-y-2 rounded-2xl border bg-card p-5">
        <p className="text-sm font-medium">
          {t("Could not load the course setup checklist.", "Không tải được checklist thiết lập khóa học.")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void setup.refetch()}>
          {t("Retry", "Thử lại")}
        </Button>
      </section>
    );
  }

  const data = setup.data;
  const runtimeReadiness = readiness.data;
  const steps = data.steps.map((step) => {
    if (step.id !== "studio" || !runtimeReadiness || runtimeReadiness.runnerReady) return step;
    const reason = [...runtimeReadiness.prerequisites, ...runtimeReadiness.warnings]
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ");
    return {
      ...step,
      state: step.state === "DONE" ? ("ACTION" as const) : step.state,
      detail: reason
        ? `${t("Runtime readiness is incomplete", "Runtime chưa sẵn sàng")}: ${reason}`
        : t(
            "Runtime readiness is incomplete. Recheck preflight, images and Runner.",
            "Runtime chưa sẵn sàng. Kiểm tra preflight, image và Runner.",
          ),
    };
  });
  const done = steps.filter((step) => step.state === "DONE").length;
  const next = steps.find((step) => step.state !== "DONE");
  const nextHref = next ? stepHref(next.id, data, workspaceId) : null;

  return (
    <section aria-labelledby="course-setup-title" className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="course-setup-title" className="font-semibold">
            {t("Course setup", "Thiết lập khóa học")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              "Complete these steps before students open a Lab. The checklist checks the exact reference project, runtime profile and prepared Studio Live topology.",
              "Hoàn tất các bước này trước khi sinh viên mở Lab. Checklist kiểm tra đúng project tham chiếu, runtime profile và topology Studio Live đã chuẩn bị.",
            )}
          </p>
        </div>
        <Badge variant={done === steps.length ? "success" : "secondary"}>
          {done}/{steps.length} {t("steps done", "bước hoàn tất")}
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ol className="space-y-2" aria-label={t("Course setup steps", "Các bước thiết lập khóa học")}>
          {steps.map((step) => {
            const label = STEP_LABELS[step.id] ?? { en: step.id, vi: step.id };
            const action = stepActionLabel(step.id, data);
            const href = step.state === "DONE" ? null : stepHref(step.id, data, workspaceId);
            return (
              <li
                key={step.id}
                className="flex flex-wrap items-start gap-3 rounded-lg border p-3"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                    step.state === "DONE"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : step.state === "PARTIAL"
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : step.state === "BLOCKED"
                          ? "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          : "border-slate-400/40 bg-muted text-muted-foreground"
                  }`}
                >
                  {step.state === "DONE" ? "✓" : step.state === "PARTIAL" ? "…" : step.state === "BLOCKED" ? "!" : "○"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{t(label.en, label.vi)}</p>
                    <Badge variant={stateVariant(step.state)}>{step.state}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                </div>
                {href && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={href}>{t(action.en, action.vi)}</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>

        <aside className="space-y-3">
          <div className="rounded-xl border bg-muted/20 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Reference Repository", "Kho Mã Nguồn Tham Chiếu")}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {data.reference.projectName ??
                t("No reference repository attached", "Chưa gắn project tham chiếu")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={data.reference.projectId ? "success" : "secondary"}>
                {data.reference.projectId
                  ? t("Architecture Grounded", "Đã liên kết kiến trúc")
                  : t("Needs Source", "Cần gắn nguồn")}
              </Badge>
              {data.reference.applications.length > 0 && (
                <Badge variant="outline">
                  {data.reference.applications.length} {t("services detected", "dịch vụ")}
                </Badge>
              )}
            </div>
            {data.reference.runtimeConfigured && !data.reference.runtimeMatchesSource && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                {t(
                  "Click 1-Click Auto-Configure Studio to sync topology with the latest source.",
                  "Nhấn Tự động cấu hình Studio để đồng bộ topology mới nhất.",
                )}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Studio Live Readiness", "Trạng Thái Studio Live")}
            </p>
            {!data.reference.projectId ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Attach a reference repository first.", "Gắn mã nguồn tham chiếu trước.")}
              </p>
            ) : readiness.isPending ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Checking Studio configuration…", "Đang kiểm tra cấu hình Studio…")}
              </p>
            ) : readiness.isError || !runtimeReadiness ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {t("Could not check Studio status.", "Chưa đọc được trạng thái Studio.")}
              </p>
            ) : (
              <div className="mt-1.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      runtimeReadiness.preflightCompatible && runtimeReadiness.runnerReady
                        ? "success"
                        : "warning"
                    }
                  >
                    {runtimeReadiness.preflightCompatible && runtimeReadiness.runnerReady
                      ? t("Ready for Students", "Sẵn sàng cho Sinh viên")
                      : runtimeReadiness.preflightCompatible && !runtimeReadiness.configured
                        ? t("Compose Ready (Run Step 5)", "Compose sẵn sàng (Chạy Bước 5)")
                        : t("Setup Incomplete", "Cần hoàn tất cấu hình")}
                  </Badge>
                </div>
                {runtimeReadiness.prerequisites.slice(0, 2).map((item) => (
                  <p key={item} className="text-amber-700 dark:text-amber-300">
                    {item}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Enrollment", "Ghi danh")}
            </p>
            <p className="mt-1 text-sm font-medium">
              {data.passkey.active ? t("Passkey active", "Passkey đang hoạt động") : t("No active Passkey", "Chưa có Passkey")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.passkey.enrolledStudents}/{data.passkey.maxStudents ?? "∞"}{" "}
              {t("students", "sinh viên")}
              {data.passkey.expiresAt
                ? ` · ${new Date(data.passkey.expiresAt).toLocaleString()}`
                : ""}
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Labs", "Danh sách Lab")}
            </p>
            {data.labs.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("No Labs yet. Seed the curated set below.", "Chưa có Lab. Hãy khởi tạo bộ Lab bên dưới.")}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {data.labs.map((lab: CourseSetupLab) => (
                  <li key={lab.assignmentId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">
                      {formatCourseLabTitle(lab.title, lab.position, lab.assignmentId)}
                    </span>
                    <Badge variant={labVariant(lab.state)}>{lab.state}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {next && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm">
            <span className="font-medium">{t("Next:", "Tiếp theo:")}</span>{" "}
            {t(STEP_LABELS[next.id]?.en ?? next.id, STEP_LABELS[next.id]?.vi ?? next.id)}
          </p>
          {nextHref && (
            <Button asChild size="sm">
              <Link href={nextHref}>
                {t(stepActionLabel(next.id, data).en, stepActionLabel(next.id, data).vi)}
              </Link>
            </Button>
          )}
        </div>
      )}

    </section>
  );
}

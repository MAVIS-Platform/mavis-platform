"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  DetailPanel,
  StatusBadge,
  StatusLabel,
  SummaryCard,
  DataTable,
} from "@/components/shared/data";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { Pagination } from "@/components/shared/forms";

export function AdminToolbar({
  children,
  fetching,
  refresh,
  updatedAt,
  showRefresh = true,
}: {
  children?: ReactNode;
  fetching: boolean;
  refresh: () => void;
  updatedAt?: number;
  showRefresh?: boolean | undefined;
}) {
  const { locale, t } = useLocale();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {updatedAt ? (
          <span className="mavis-tabular">
            {t("Updated", "Cập nhật lúc")}{" "}
            {new Date(updatedAt).toLocaleTimeString(
              locale === "vi" ? "vi-VN" : "en-US",
              locale === "vi" ? { hour12: false } : undefined,
            )}
          </span>
        ) : null}
        {showRefresh && (
          <Button size="sm" variant="outline" disabled={fetching} onClick={refresh}>
            <RefreshCw className={fetching ? "size-4 animate-spin" : "size-4"} />
            {fetching ? t("Refreshing…", "Đang tải lại…") : t("Refresh", "Làm mới")}
          </Button>
        )}
      </div>
    </div>
  );
}
export function PageResults({
  count,
  page,
  onPage,
}: {
  count: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const { t } = useLocale();
  const pages = Math.max(1, Math.ceil(count / 10)),
    active = Math.min(page, pages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="mavis-tabular text-xs text-muted-foreground">
        {count
          ? `${(active - 1) * 10 + 1}–${Math.min(active * 10, count)} ${t("of", "trên")} ${count}`
          : t("0 matching records", "0 bản ghi phù hợp")}
      </p>
      <Pagination page={active} pageCount={pages} onPageChange={onPage} />
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
const bytes = (n: number) => `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;

export function AdminCommandHeader({
  active,
  onRefresh,
  refreshing,
}: {
  active: "health" | "users" | "studio-setup" | "profiles" | "audit";
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { t } = useLocale();
  const health = useApiQuery("adminHealth", {}, { refreshMs: 30000, staleTime: 30000 });
  const counts = useApiQuery("platformSummary", {}, { staleTime: 60000 });
  const isUp = health.data?.status === "UP";
  const isDegraded = health.data?.status === "DEGRADED";
  const pendingOrLocked =
    (counts.data?.pendingVerificationUsers ?? 0) + (counts.data?.lockedUsers ?? 0);

  const tabs: Array<{
    id: "health" | "users" | "studio-setup" | "profiles";
    href: string;
    label: string;
    icon: typeof Activity;
  }> = [
    {
      id: "health",
      href: "/administration/health",
      label: t("Overview", "Tổng quan"),
      icon: Activity,
    },
    {
      id: "users",
      href: "/administration/users",
      label: t("Users & Roles", "Người dùng"),
      icon: Users,
    },
    {
      id: "studio-setup",
      href: "/administration/studio-setup",
      label: t("Studio Setup", "Cấu hình Studio"),
      icon: Boxes,
    },
    {
      id: "profiles",
      href: "/administration/profiles",
      label: t("Quotas & Audit", "Hạn mức & Nhật ký"),
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-4">
      <section className="mavis-hero-surface p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-medium text-sky-100">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Enterprise Governance", "Quản Trị Hệ Thống Doanh Nghiệp")}
              </span>
              <Badge
                className={
                  isUp
                    ? "border-emerald-300/40 bg-emerald-500/25 text-emerald-100"
                    : isDegraded
                      ? "border-amber-300/40 bg-amber-500/25 text-amber-100"
                      : "border-white/25 bg-white/15 text-white"
                }
              >
                {isUp
                  ? t("System Healthy", "Hệ Thống Ổn Định")
                  : isDegraded
                    ? t("Attention Required", "Cần Kiểm Tra")
                    : t("Checking Status", "Đang Kiểm Tra")}
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {t("MAVIS Control Center", "Trung Tâm Quản Trị MAVIS")}
            </h1>
            <p className="text-sm text-sky-100/90">
              {t(
                "Monitor platform health, provision Lecturer & Student accounts, govern execution profiles, and audit security jobs.",
                "Giám sát sức khỏe hệ thống, cấp tài khoản Giảng viên/Sinh viên, cấu hình Runtime & hạn mức AI.",
              )}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(refreshing || health.isFetching)}
            onClick={() => {
              void health.refetch();
              void counts.refetch();
              onRefresh?.();
            }}
            className="border-white/30 bg-white/12 text-white hover:bg-white/20 hover:text-white"
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${refreshing || health.isFetching ? "animate-spin" : ""}`}
            />
            {t("Refresh", "Làm mới")}
          </Button>
        </div>

        <nav
          aria-label={t("Admin Control Center Sections", "Khu vực quản trị")}
          className="mt-5 flex flex-nowrap gap-1.5 overflow-x-auto rounded-xl bg-black/25 p-1.5 backdrop-blur-sm"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const current =
              active === tab.id || (tab.id === "profiles" && active === "audit");
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                  current
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {(active === "profiles" || active === "audit") && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/15 pt-3 text-xs">
            <span className="text-sky-100/80">{t("Governance view:", "Phân mục:")}</span>
            <Link
              href="/administration/profiles"
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                active === "profiles"
                  ? "bg-white/20 text-white"
                  : "text-sky-100 hover:bg-white/10"
              }`}
            >
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {t("Execution Profiles & Quotas", "Cấu hình Runtime & Hạn mức")}
            </Link>
            <Link
              href="/administration/audit"
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
                active === "audit"
                  ? "bg-white/20 text-white"
                  : "text-sky-100 hover:bg-white/10"
              }`}
            >
              <ScrollText className="size-3.5" aria-hidden="true" />
              {t("Audit Logs & Background Jobs", "Nhật ký Hệ thống & Tác vụ")}
            </Link>
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="mavis-card-hover rounded-2xl border border-t-4 border-t-primary bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            {t("Total Accounts", "Tổng tài khoản")}
          </p>
          <p className="mavis-tabular mt-1.5 text-2xl font-bold text-foreground">
            {counts.data?.users ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {counts.data
              ? `${counts.data.activeLecturers ?? 0} ${t("lecturers", "giảng viên")} · ${counts.data.activeStudents ?? 0} ${t("students", "sinh viên")}`
              : "—"}
          </p>
        </div>
        <div className="mavis-card-hover rounded-2xl border border-t-4 border-t-rose-500 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            {t("Pending & Locked", "Chờ duyệt & Đang khóa")}
          </p>
          <p className="mavis-tabular mt-1.5 text-2xl font-bold text-foreground">
            {counts.data ? pendingOrLocked : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {counts.data
              ? `${counts.data.pendingVerificationUsers ?? 0} ${t("pending", "chờ kích hoạt")} · ${counts.data.lockedUsers ?? 0} ${t("locked", "bị khóa")}`
              : "—"}
          </p>
        </div>
        <div className="mavis-card-hover rounded-2xl border border-t-4 border-t-sky-500 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            {t("Guided Labs & Projects", "Bài Lab & Dự án")}
          </p>
          <p className="mavis-tabular mt-1.5 text-2xl font-bold text-foreground">
            {counts.data?.totalGuidedLabs ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {counts.data
              ? `${counts.data.projects ?? 0} ${t("registered repositories", "dự án trên nền tảng")}`
              : "—"}
          </p>
        </div>
        <div className="mavis-card-hover rounded-2xl border border-t-4 border-t-emerald-500 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            {t("Running Sessions", "Phiên thực hành đang chạy")}
          </p>
          <p className="mavis-tabular mt-1.5 text-2xl font-bold text-foreground">
            {counts.data?.runningSessions ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {counts.data
              ? `${counts.data.analysisJobs ?? 0} ${t("analysis jobs tracked", "tác vụ phân tích")}`
              : "—"}
          </p>
        </div>
      </section>
    </div>
  );
}

export function SystemHealth() {
  const { t } = useLocale();
  const { locale } = useLocale();
  const health = useApiQuery("adminHealth", {}, { refreshMs: 30000 });
  const runtimeHealth = useApiQuery("adminRuntimeHealth", {}, { refreshMs: 15000 });
  const sweepOrphans = useApiMutation("adminSweepOrphans");
  const counts = useApiQuery("platformSummary", {});
  const data = health.data,
    issues = data?.checks.filter((c) => c.status !== "UP") ?? [];
  const rt = runtimeHealth.data;
  const icons: Record<string, typeof Server> = {
    backend: Server,
    database: Database,
    worker: Activity,
    storage: HardDrive,
  };
  return (
    <div className="space-y-6">
      <AdminCommandHeader
        active="health"
        refreshing={health.isFetching || runtimeHealth.isFetching}
        onRefresh={() => {
          void health.refetch();
          void runtimeHealth.refetch();
          void counts.refetch();
        }}
      />
      <AdminToolbar
        fetching={health.isFetching || runtimeHealth.isFetching}
        updatedAt={health.dataUpdatedAt}
        showRefresh={false}
        refresh={() => {
          void health.refetch();
          void runtimeHealth.refetch();
          void counts.refetch();
        }}
      >
        <span className="text-sm text-muted-foreground">
          {t(
            "Live infrastructure checks · refresh every 30 seconds",
            "Kiểm tra hạ tầng trực tiếp · tự động làm mới mỗi 30 giây",
          )}
        </span>
      </AdminToolbar>
      <RequestState query={health}>
        {data && (
          <div className="space-y-5">
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
              <div className="flex items-start gap-3">
                {data.status === "UP" ? (
                  <CheckCircle2 className="mt-1 size-6 text-emerald-500" />
                ) : (
                  <AlertTriangle className="mt-1 size-6 text-amber-500" />
                )}
                <div>
                  <h2 className="text-lg font-semibold">
                    {data.status === "UP"
                      ? t("Core services are responding", "Các dịch vụ cốt lõi đang hoạt động ổn định")
                      : data.status === "DEGRADED"
                        ? t("Attention required", "Cần kiểm tra hạ tầng")
                        : t("Some checks are unavailable", "Một số dịch vụ kiểm tra chưa khả dụng")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.checks.filter((c) => c.status === "UP").length} / {data.checks.length}{" "}
                    {t("checks healthy · measured", "dịch vụ khỏe mạnh · đo lúc")}{" "}
                    {new Date(data.checkedAt).toLocaleTimeString(
                      locale === "vi" ? "vi-VN" : "en-US",
                      locale === "vi" ? { hour12: false } : undefined,
                    )}
                  </p>
                </div>
              </div>
              <StatusBadge
                status={
                  data.status === "UP"
                    ? t("Healthy", "Khỏe mạnh")
                    : data.status === "DEGRADED"
                      ? t("Degraded", "Suy giảm")
                      : t("Needs verification", "Cần xác minh")
                }
                variant={data.status === "UP" ? "success" : "warning"}
              />
            </section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.checks.map((c) => {
                const Icon = icons[c.id] ?? Server;
                return (
                  <section key={c.id} className="mavis-card-hover flex flex-col gap-3 rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between gap-2">
                      <Icon className="size-5 text-muted-foreground" />
                      <StatusBadge
                        status={c.status === "UP" ? t("Healthy", "Khỏe mạnh") : c.status.toLowerCase()}
                        variant={
                          c.status === "UP"
                            ? "success"
                            : c.status === "DOWN"
                              ? "destructive"
                              : "warning"
                        }
                      />
                    </div>
                    <h3 className="font-semibold">{t(c.name)}</h3>
                    <p className="flex-1 text-sm text-muted-foreground">{t(c.message)}</p>
                    <p className="mavis-tabular text-xs text-muted-foreground">
                      {c.latencyMs === null
                        ? c.id === "backend"
                          ? t("Authenticated request served", "Đã phục vụ yêu cầu xác thực")
                          : t("Filesystem / configuration check", "Kiểm tra hệ thống tệp / cấu hình")
                        : `${c.latencyMs} ms ${t("response", "phản hồi")}`}
                    </p>
                  </section>
                );
              })}
            </div>
            {issues.length > 0 && (
              <DetailPanel title={t("Recommended actions", "Hành động khuyến nghị")}>
                <ul className="space-y-3">
                  {issues.map((c) => (
                    <li key={c.id} className="border-l-2 border-amber-500 pl-3 text-sm">
                      <strong>{t(c.name)}</strong>
                      <p className="mt-1 text-muted-foreground">{t(c.action ?? c.message)}</p>
                    </li>
                  ))}
                </ul>
              </DetailPanel>
            )}
            {data.jvm.maxBytes > 0 && (
              <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard
                  label={t("Backend JVM memory", "Bộ nhớ JVM máy chủ")}
                  value={`${Math.round(data.jvm.usedBytes / 1024 / 1024)} MB`}
                  description={`${t("Maximum", "Tối đa")} ${Math.round(data.jvm.maxBytes / 1024 / 1024)} MB · ${t("application process only", "chỉ tính tiến trình ứng dụng")}`}
                />
                <SummaryCard
                  label={t("Backend uptime", "Thời gian chạy máy chủ")}
                  value={`${Math.floor(data.jvm.uptimeSeconds / 3600)}h ${Math.floor((data.jvm.uptimeSeconds % 3600) / 60)}m`}
                  description={t(
                    "Since the application process started",
                    "Tính từ lúc khởi động tiến trình ứng dụng",
                  )}
                />
                <SummaryCard
                  label={t("Storage free", "Dung lượng lưu trữ còn trống")}
                  value={
                    data.storage.freeBytes !== undefined
                      ? bytes(data.storage.freeBytes)
                      : t("Not measured", "Chưa đo")
                  }
                  description={
                    data.storage.totalBytes !== undefined
                      ? `${bytes(data.storage.totalBytes)} ${t("volume capacity", "tổng dung lượng ổ")}`
                      : t("Upload volume", "Ổ lưu trữ tải lên")
                  }
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t(data.scope)}{" "}
              {t(
                "An available Worker does not confirm workload Runner readiness.",
                "Worker sẵn sàng không đồng nghĩa Runner thực thi tải đã được kích hoạt.",
              )}
            </p>
          </div>
        )}
      </RequestState>
      <DetailPanel
        title={t("Studio Runtime Ops & Sandbox Queue", "Vận hành Studio Runtime & Hàng chờ Sandbox")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {rt && (
              <StatusBadge
                preserveCase
                status={`${
                  rt.surveyReadiness === "READY"
                    ? t("Ready", "Sẵn sàng")
                    : rt.surveyReadiness === "DEGRADED"
                      ? t("Degraded", "Suy giảm")
                      : t("Unavailable", "Không khả dụng")
                } · ${rt.effectiveOciRuntime}`}
                variant={
                  rt.surveyReadiness === "READY"
                    ? "success"
                    : rt.surveyReadiness === "DEGRADED"
                      ? "warning"
                      : "destructive"
                }
              />
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sweepOrphans.isPending}
              onClick={() =>
                sweepOrphans.mutate(
                  {},
                  {
                    onSuccess: () => {
                      void runtimeHealth.refetch();
                    },
                  },
                )
              }
            >
              {sweepOrphans.isPending
                ? t("Sweeping…", "Đang dọn dẹp…")
                : t("Sweep Orphans & Cache", "Dọn container mồ côi")}
            </Button>
          </div>
        }
      >
        <RequestState query={runtimeHealth}>
          {rt && (
            <div className="space-y-4">
              {sweepOrphans.data && (
                <p
                  role="status"
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
                >
                  {t(
                    `Sweep finished: ${sweepOrphans.data.orphansRemoved} orphan stack(s) removed${sweepOrphans.data.diskPruned ? " · stale cache pruned" : ""}.`,
                    `Đã dọn dẹp: xóa ${sweepOrphans.data.orphansRemoved} stack mồ côi${sweepOrphans.data.diskPruned ? " · đã giải phóng bộ đệm ổ đĩa" : ""}.`,
                  )}
                </p>
              )}
              {sweepOrphans.error && <ErrorState error={sweepOrphans.error} />}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label={t("Active Sandbox Slots", "Slot Sandbox đang chạy")}
                  value={`${rt.activeSessions} / ${rt.maxActiveSessions}`}
                  description={`${t("Mode", "Chế độ")}: ${rt.runnerMode} · OCI: ${rt.effectiveOciRuntime}`}
                />
                <SummaryCard
                  label={t("FIFO Queue Depth", "Độ sâu hàng chờ FIFO")}
                  value={`${rt.queuedSessions} / ${rt.maxQueuedSessions}`}
                  description={
                    rt.oldestQueuedWaitSeconds
                      ? `${t("Oldest wait", "Chờ lâu nhất")}: ${rt.oldestQueuedWaitSeconds}s`
                      : t("No sessions waiting", "Không có phiên đang chờ")
                  }
                />
                <SummaryCard
                  label={t("Runner Host Disk Free", "Ổ đĩa trống máy Runner")}
                  value={rt.diskFreeMiB >= 0 ? `${(rt.diskFreeMiB / 1024).toFixed(1)} GB` : "—"}
                  description={
                    rt.diskTotalMiB > 0
                      ? `${(rt.diskTotalMiB / 1024).toFixed(1)} GB ${t("total", "tổng")}${rt.diskLowWarning ? ` · ${t("LOW DISK", "Ổ ĐĨA THẤP")}` : ""}`
                      : t("Host volume", "Ổ đĩa máy chủ")
                  }
                />
                <SummaryCard
                  label={t("Watchdog Reaped", "Watchdog đã thu hồi")}
                  value={rt.orphansReapedTotal + rt.abandonedReapedTotal + rt.staleDispatchesReapedTotal}
                  description={`${rt.orphansReapedTotal} ${t("orphans", "mồ côi")} · ${rt.abandonedReapedTotal} ${t("idle", "nhàn rỗi")} · ${rt.staleDispatchesReapedTotal} ${t("stale", "quá hạn")}`}
                />
              </div>
              {rt.warnings.length > 0 && (
                <ul className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
                  {rt.warnings.map((w) => (
                    <li key={w}>• {t(w)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </RequestState>
      </DetailPanel>
      <DetailPanel
        title={t("Platform inventory", "Tổng quan tài nguyên nền tảng")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/administration/users">
                {t("Manage accounts", "Quản lý tài khoản")} <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/administration/jobs">
                {t("Review analysis jobs", "Xem tác vụ phân tích")} <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        }
      >
        <RequestState query={counts}>
          {counts.data && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label={t("Projects", "Dự án")} value={counts.data.projects} />
              <SummaryCard label={t("Total Accounts", "Tổng tài khoản")} value={counts.data.users} />
              <SummaryCard label={t("Active Lecturers", "Giảng viên hoạt động")} value={counts.data.activeLecturers ?? "—"} />
              <SummaryCard label={t("Active Students", "Sinh viên hoạt động")} value={counts.data.activeStudents ?? "—"} />
              <SummaryCard
                label={t("Pending Verification", "Chờ kích hoạt")}
                value={counts.data.pendingVerificationUsers ?? "—"}
              />
              <SummaryCard label={t("Locked Accounts", "Tài khoản bị khóa")} value={counts.data.lockedUsers ?? "—"} />
              <SummaryCard label={t("Guided Labs", "Bài Lab hướng dẫn")} value={counts.data.totalGuidedLabs ?? "—"} />
              <SummaryCard
                label={t("Running Sessions", "Phiên đang chạy")}
                value={counts.data.runningSessions}
                description={`${counts.data.analysisJobs} ${t("analysis jobs recorded", "tác vụ phân tích đã ghi nhận")}`}
              />
            </div>
          )}
        </RequestState>
      </DetailPanel>
    </div>
  );
}
export function AdminRuntimeSummary() {
  const { t } = useLocale();
  const q = useApiQuery("runtimeReadSessions", { projectId: "*" }, { refreshMs: 30000 });
  const forceStop = useApiMutation("forceStopRuntimeSession");
  const [page, setPage] = useState(1);
  const rows = q.data ?? [],
    active = rows.filter((r) =>
      ["QUEUED", "READY_FOR_DISPATCH", "RUNNING", "ALLOCATED", "CANCELLING"].includes(
        r.executionStatus,
      ),
    );
  const stoppable = (status: string) =>
    [
      "NOT_STARTED",
      "PENDING",
      "QUEUED",
      "READY_FOR_DISPATCH",
      "APPROVED",
      "ALLOCATED",
      "RUNNING",
    ].includes(status);
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/administration/admin-sessions">
            {t("Inspect session details", "Xem chi tiết phiên")} <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </AdminToolbar>
      {forceStop.error && <ErrorState error={forceStop.error} />}
      <RequestState query={q}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label={t("Recent sessions", "Phiên gần đây")}
              value={rows.length}
              description={t(
                "Latest 50 sessions returned by the server",
                "50 phiên gần nhất máy chủ trả về",
              )}
            />
            <SummaryCard label={t("Active / stopping", "Đang chạy / đang dừng")} value={active.length} />
            <SummaryCard
              label={t("Failed / timed out", "Lỗi / hết thời gian")}
              value={rows.filter((r) => ["FAILED", "TIMED_OUT"].includes(r.executionStatus)).length}
            />
            <SummaryCard
              label={t("Cleanup needs review", "Cần kiểm tra dọn dẹp")}
              value={
                rows.filter((r) => ["FAILED", "PENDING", "INCOMPLETE"].includes(r.cleanupStatus))
                  .length
              }
            />
          </div>
          <DetailPanel title={t("Recent execution history", "Lịch sử thực thi gần đây")}>
            <DataTable
              emptyDescription={t(
                "Try clearing the filters or refresh to check for new records.",
                "Hãy xóa bộ lọc hoặc làm mới để kiểm tra bản ghi mới.",
              )}
              caption={t("Recent runtime sessions", "Các phiên Runtime gần đây")}
              rows={rows.slice(
                (Math.min(page, Math.max(1, Math.ceil(rows.length / 10))) - 1) * 10,
                Math.min(page, Math.max(1, Math.ceil(rows.length / 10))) * 10,
              )}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: "session",
                  label: t("Session", "Phiên"),
                  render: (r) => (
                    <div className="max-w-60 break-all">
                      <p className="font-medium">{r.scenarioName ?? t("Runtime session", "Phiên Runtime")}</p>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: t("Execution", "Thực thi"),
                  render: (r) => <StatusBadge status={r.executionStatus} />,
                },
                {
                  key: "evidence",
                  label: t("Evidence", "Bằng chứng"),
                  render: (r) => <StatusLabel status={r.evidenceStatus} />,
                },
                {
                  key: "cleanup",
                  label: t("Cleanup", "Dọn dẹp"),
                  render: (r) => <StatusLabel status={r.cleanupStatus} />,
                },
                {
                  key: "actions",
                  label: t("Actions", "Thao tác"),
                  render: (r) =>
                    stoppable(r.executionStatus) ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={forceStop.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              t(
                                `Force-stop runtime session ${r.id.slice(0, 8)} (${r.scenarioName ?? "session"})?`,
                                `Dừng khẩn cấp phiên Runtime ${r.id.slice(0, 8)} (${r.scenarioName ?? "phiên"})?`,
                              ),
                            )
                          ) {
                            forceStop.mutate({ sessionId: r.id });
                          }
                        }}
                      >
                        {t("Force Stop", "Dừng khẩn cấp")}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    ),
                },
              ]}
            />
            <PageResults count={rows.length} page={page} onPage={setPage} />
          </DetailPanel>
          <Notice>
            {t(
              "Summary covers recent session records, not a live probe of the workload Runner. Open a session to inspect stop acknowledgements, evidence and cleanup.",
              "Bảng tổng hợp phản ánh bản ghi phiên gần đây. Mở từng phiên để xem xác nhận dừng, bằng chứng OTel và trạng thái dọn dẹp.",
            )}
          </Notice>
        </div>
      </RequestState>
    </div>
  );
}

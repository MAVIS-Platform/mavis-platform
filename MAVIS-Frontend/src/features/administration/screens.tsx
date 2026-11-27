"use client";
import Link from "next/link";
import { AdminCommandHeader, AdminRuntimeSummary, AdminToolbar, PageResults, Notice } from "./operations";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Boxes, Plus, X } from "lucide-react";
import { summarizeJobModel } from "@/lib/navigation/admin-job-review";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { UserAvatar } from "@/components/shared/user-avatar";
import { RequestState, ErrorState } from "@/components/shared/request-state";
import { ConfirmDialog, SearchInput, SelectField } from "@/components/shared/forms";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AnalysisStatusIndicator,
  analysisStatusBadgeProps,
} from "@/features/source-analysis/components";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Response } from "@/lib/api/contracts";
export function Accounts() {
  const { t } = useLocale();
  const query = useApiQuery("accounts", {});
  const lock = useApiMutation("setAccountLock");
  const updateRole = useApiMutation("setAccountRole");
  const createAcc = useApiMutation("createAccount");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const createFormRef = useRef<HTMLDivElement>(null);
  const createNameRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"student" | "lecturer" | "admin">("lecturer");

  useEffect(() => {
    if (!showCreate) return;
    requestAnimationFrame(() => {
      createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      createNameRef.current?.focus({ preventScroll: true });
    });
  }, [showCreate]);

  const runLock = async (accountId: string, locked: boolean) => {
    setBusyId(accountId);
    lock.reset();
    try {
      await lock.mutateAsync({ accountId, locked });
    } catch {
      /* Shown below */
    } finally {
      setBusyId(null);
    }
  };
  const runRole = async (accountId: string, role: "student" | "lecturer" | "admin") => {
    setBusyId(accountId);
    updateRole.reset();
    try {
      await updateRole.mutateAsync({ accountId, role });
    } catch {
      /* Shown below */
    } finally {
      setBusyId(null);
    }
  };
  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.trim().length < 8) return;
    try {
      await createAcc.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim(),
        role: newRole,
        password: password.trim(),
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setShowCreate(false);
    } catch {
      /* ErrorState displays message */
    }
  };

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all"),
    [state, setState] = useState("all"),
    [page, setPage] = useState(1);
  const rows = (query.data ?? []).filter(
    (a) =>
      (a.name + " " + (a.email ?? "")).toLowerCase().includes(search.toLowerCase()) &&
      (role === "all" || a.role === role) &&
      (state === "all" || (a.status ?? (a.locked ? "LOCKED" : "ACTIVE")) === state),
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  return (
    <div className="space-y-5">
      <AdminCommandHeader
        active="users"
        refreshing={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
      <AdminToolbar
        fetching={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        showRefresh={false}
        refresh={() => void query.refetch()}
      >
        <p className="text-sm text-muted-foreground">
          {t(
            "Manage access, pending activations, and teaching roles with 1-click updates.",
            "Quản lý quyền truy cập, tài khoản chờ kích hoạt và vai trò giảng dạy chỉ với 1 chạm.",
          )}
        </p>
        <Button
          size="sm"
          variant={showCreate ? "outline" : "default"}
          className={showCreate ? undefined : "bg-emerald-600 text-white hover:bg-emerald-700"}
          onClick={() => setShowCreate((open) => !open)}
        >
          {showCreate ? (
            <X className="mr-1 size-4" aria-hidden="true" />
          ) : (
            <Plus className="mr-1 size-4" aria-hidden="true" />
          )}
          {showCreate ? t("Close form", "Đóng biểu mẫu") : t("Create Account", "Tạo tài khoản")}
        </Button>
      </AdminToolbar>
      {showCreate && (
        <div ref={createFormRef}>
          <DetailPanel title={t("Provision Active User Account", "Cấp tài khoản người dùng mới")}>
            <form onSubmit={(e) => void submitCreate(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                ref={createNameRef}
                required
                aria-label={t("Full name", "Họ và tên")}
                placeholder={t("Full name", "Họ và tên")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            <Input
              required
              type="email"
              aria-label={t("Email address", "Địa chỉ email")}
              placeholder={t("Email address", "Địa chỉ email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              required
              type="password"
              aria-label={t("Initial password", "Mật khẩu ban đầu")}
              placeholder={t("Password (min 8 chars)", "Mật khẩu (từ 8 ký tự)")}
              value={password}
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <select
                aria-label={t("Account role", "Vai trò tài khoản")}
                className="h-9 min-w-0 flex-1 whitespace-nowrap rounded-md border bg-card px-2.5 text-sm"
                value={newRole}
                onChange={(e) =>
                  setNewRole(e.target.value as "student" | "lecturer" | "admin")
                }
              >
                <option value="lecturer">{t("Lecturer", "Giảng viên")}</option>
                <option value="student">{t("Student", "Sinh viên")}</option>
                <option value="admin">{t("System Admin", "Quản trị viên")}</option>
              </select>
              <Button size="sm" className="shrink-0 whitespace-nowrap" disabled={createAcc.isPending}>
                {createAcc.isPending ? t("Creating…", "Đang tạo…") : t("Create", "Tạo")}
              </Button>
            </div>
          </form>
          {createAcc.error && <ErrorState error={createAcc.error} />}
          </DetailPanel>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/30 p-1.5">
        {[
          { key: "all", label: t("All Users", "Tất cả người dùng"), r: "all", s: "all" },
          { key: "lecturer", label: t("Lecturers", "Giảng viên"), r: "lecturer", s: "all" },
          { key: "student", label: t("Students", "Sinh viên"), r: "student", s: "all" },
          {
            key: "pending",
            label: t("Pending Activation", "Chờ kích hoạt"),
            r: "all",
            s: "PENDING_VERIFICATION",
          },
          { key: "locked", label: t("Locked", "Đang khóa"), r: "all", s: "LOCKED" },
        ].map((pill) => {
          const activePill = role === pill.r && state === pill.s;
          return (
            <Button
              key={pill.key}
              type="button"
              size="sm"
              variant={activePill ? "default" : "ghost"}
              onClick={() => {
                setRole(pill.r);
                setState(pill.s);
                setPage(1);
              }}
            >
              {pill.label}
            </Button>
          );
        })}
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr_1fr]">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label={t("Search name or email", "Tìm kiếm theo tên hoặc email")}
        />
        <SelectField
          label={t("Role", "Vai trò")}
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: t("All roles", "Tất cả vai trò") },
            { value: "admin", label: t("System Administrator", "Quản trị viên hệ thống") },
            { value: "lecturer", label: t("Lecturer", "Giảng viên") },
            { value: "student", label: t("Student", "Sinh viên") },
          ]}
        />
        <SelectField
          label={t("Account status", "Trạng thái tài khoản")}
          value={state}
          onChange={(v) => {
            setState(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: t("All statuses", "Tất cả trạng thái") },
            { value: "ACTIVE", label: t("Active", "Đang hoạt động") },
            { value: "LOCKED", label: t("Locked", "Đang khóa") },
            { value: "PENDING_VERIFICATION", label: t("Pending verification", "Chờ kích hoạt") },
          ]}
        />
      </div>
      <RequestState query={query}>
        <div className="min-w-0 space-y-4 [&_thead]:bg-muted/50 [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:py-2.5 [&_th]:font-semibold [&_td]:px-2 [&_td]:py-2.5">
          <DataTable
            emptyDescription={t(
              "Try clearing the filters or refresh to check for new records.",
              "Hãy xóa bộ lọc hoặc làm mới để kiểm tra bản ghi mới.",
            )}
            rows={rows.slice((activePage - 1) * 10, activePage * 10)}
            rowKey={(a) => a.id}
            caption={t("User accounts", "Danh sách tài khoản người dùng")}
            columns={[
              {
                key: "name",
                label: t("Account", "Tài khoản"),
                render: (a) => (
                  <div className="flex min-w-0 max-w-[172px] items-center gap-2">
                    <UserAvatar name={a.name} avatarUrl={a.avatarUrl} size="sm" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-semibold text-foreground">{a.name}</p>
                      {a.email && <p className="truncate text-xs text-muted-foreground">{a.email}</p>}
                    </div>
                  </div>
                ),
              },
              {
                key: "role",
                label: t("Role", "Vai trò"),
                render: (a) =>
                  a.role === "admin" ? (
                    <StatusBadge status={t("Administrator", "Quản trị viên")} />
                  ) : (
                    <select
                      aria-label={t(`Role for ${a.name}`, `Vai trò của ${a.name}`)}
                      className="h-8 w-28 rounded-md border bg-card px-2 text-xs disabled:opacity-50"
                      value={a.role}
                      disabled={busyId !== null}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (
                          (value === "student" || value === "lecturer" || value === "admin") &&
                          value !== a.role
                        ) {
                          void runRole(a.id, value);
                        }
                      }}
                    >
                      <option value="student">{t("Student", "Sinh viên")}</option>
                      <option value="lecturer">{t("Lecturer", "Giảng viên")}</option>
                      <option value="admin">{t("System administrator", "Quản trị viên hệ thống")}</option>
                    </select>
                  ),
              },
              {
                key: "status",
                label: t("Status", "Trạng thái"),
                render: (a) => (
                  <StatusBadge
                    status={a.status ?? (a.locked ? "Locked" : "Active")}
                    variant={
                      a.locked
                        ? "warning"
                        : a.status && a.status !== "ACTIVE"
                          ? "outline"
                          : "success"
                    }
                  />
                ),
              },
              {
                key: "createdAt",
                label: t("Created at", "Ngày tạo"),
                render: (a) => {
                  const date = a.createdAt ? new Date(a.createdAt) : null;
                  if (!date || Number.isNaN(date.getTime()))
                    return <span className="text-muted-foreground">—</span>;
                  return (
                    <time
                      dateTime={a.createdAt ?? undefined}
                      className="block whitespace-nowrap space-y-0.5 text-xs tabular-nums"
                    >
                      <span className="block font-medium">{date.toLocaleDateString("vi-VN")}</span>{" "}
                      <span className="block text-muted-foreground">
                        {date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </time>
                  );
                },
              },
              {
                key: "action",
                label: t("Quick Action", "Thao tác nhanh"),
                render: (a) => {
                  const isPending = a.status === "PENDING_VERIFICATION";
                  return (
                    <div className="flex items-center justify-end gap-2">
                      {isPending ? (
                        <Button
                          size="sm"
                          className="whitespace-nowrap"
                          disabled={busyId !== null}
                          onClick={() => void runLock(a.id, false)}
                        >
                          {busyId === a.id
                            ? t("Activating…", "Đang kích hoạt…")
                            : t("Activate", "Kích hoạt")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          disabled={busyId !== null}
                          onClick={() => void runLock(a.id, !a.locked)}
                        >
                          {busyId === a.id
                            ? t("Updating…", "Đang cập nhật…")
                            : a.locked
                              ? t("Unlock", "Mở khóa")
                              : t("Lock", "Khóa")}
                        </Button>
                      )}
                    </div>
                  );
                },
              },
            ]}
          />
          {lock.isError && <ErrorState error={lock.error} />}
          {updateRole.isError && <ErrorState error={updateRole.error} />}
          <PageResults count={rows.length} page={activePage} onPage={setPage} />
        </div>
      </RequestState>
    </div>
  );
}
export function Integrations() {
  const { t } = useLocale();
  const query = useApiQuery("integrations", {});
  const mutation = useApiMutation("configureIntegration");
  const probe = useApiMutation("testIntegration");
  const [selected, setSelected] = useState<Response<"integrations">[number] | null>(null);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<
    Record<string, Response<"testIntegration">>
  >({});

  const runProbe = async (integrationId: string) => {
    setProbingId(integrationId);
    probe.reset();
    try {
      const result = await probe.mutateAsync({ integrationId });
      setProbeResults((prev) => ({ ...prev, [integrationId]: result }));
    } catch {
      /* Error rendered below */
    } finally {
      setProbingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/administration/usage">{t("View AI usage", "Xem mức sử dụng AI")}</Link>
        </Button>
      </AdminToolbar>
      <Notice>
        {t(
          "Enabled does not mean connected. Use Test connection to probe live provider status; toggle changes currently reset when the server restarts.",
          "Đang bật không đồng nghĩa đã kết nối thành công. Bấm Kiểm tra kết nối để đo trạng thái trực tiếp; các thay đổi bật/tắt sẽ đặt lại khi khởi động lại máy chủ.",
        )}
      </Notice>
      {probe.isError && <ErrorState error={probe.error} />}
      <RequestState query={query} empty={!query.data?.length}>
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data?.map((item) => {
            const tested = probeResults[item.id];
            const verified = tested ? tested.reachable : item.connectionVerified;
            return (
              <DetailPanel key={item.id} title={item.name}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.enabled ? t("Enabled", "Đang bật") : t("Disabled", "Đang tắt")} />
                  {tested && (
                    <StatusBadge
                      status={
                        tested.status?.toUpperCase() === "DEGRADED"
                          ? `${t("Degraded", "Suy giảm")} · ${tested.latencyMs}ms`
                          : tested.reachable
                            ? `${t("Connected", "Kết nối tốt")} · ${tested.latencyMs}ms`
                            : `${t("Unreachable", "Không kết nối được")} · ${tested.status}`
                      }
                      variant={
                        tested.status?.toUpperCase() === "DEGRADED"
                          ? "warning"
                          : tested.reachable
                            ? "success"
                            : "warning"
                      }
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("Revision", "Phiên bản")} {item.revision} ·{" "}
                  {item.status === "CONFIGURED"
                    ? t("Credentials configured.", "Đã cấu hình khóa xác thực.")
                    : item.status === "PUBLIC_ONLY"
                      ? t("Public repositories only.", "Chỉ truy cập repository công khai.")
                      : item.status === "UNVERIFIED"
                        ? t("Runtime probe integration.", "Tích hợp giám sát Runtime.")
                        : t("Configuration unavailable.", "Chưa có cấu hình.")}{" "}
                  {tested?.status?.toUpperCase() === "DEGRADED"
                    ? t("Connection degraded.", "Kết nối đang suy giảm.")
                    : verified
                      ? t("Connection verified.", "Đã xác minh kết nối.")
                      : t("Connection not verified.", "Chưa xác minh kết nối.")}
                </p>
                {tested && (
                  <p role="status" className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs text-foreground">
                    {tested.message}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={probingId !== null}
                    onClick={() => void runProbe(item.id)}
                  >
                    {probingId === item.id
                      ? t("Testing…", "Đang kiểm tra…")
                      : t("Test connection", "Kiểm tra kết nối")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      mutation.reset();
                      setSelected(item);
                    }}
                  >
                    {item.enabled
                      ? t("Disable integration", "Tắt tích hợp")
                      : t("Enable integration", "Bật tích hợp")}
                  </Button>
                </div>
              </DetailPanel>
            );
          })}
        </div>
        <ConfirmDialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={t("Change integration configuration?", "Thay đổi cấu hình tích hợp?")}
          description={t(
            `${selected?.name} will be ${selected?.enabled ? "disabled" : "enabled"}. Based on revision ${selected?.revision}.`,
            `${selected?.name} sẽ được ${selected?.enabled ? "tắt" : "bật"}. Dựa trên phiên bản ${selected?.revision}.`,
          )}
          pending={mutation.isPending}
          error={mutation.isError ? <ErrorState error={mutation.error} /> : undefined}
          onConfirm={() => {
            if (selected)
              mutation.mutate(
                {
                  integrationId: selected.id,
                  enabled: !selected.enabled,
                  expectedRevision: selected.revision,
                },
                { onSuccess: () => setSelected(null) },
              );
          }}
        />
      </RequestState>
    </div>
  );
}
export function AdminStudioSetup() {
  const { t } = useLocale();
  const q = useApiQuery("profiles", {});
  const runtimeHealth = useApiQuery("adminRuntimeHealth", {}, { refreshMs: 30000 });
  const [tab, setTab] = useState<"profiles" | "sessions">("profiles");
  const readiness = runtimeHealth.data?.surveyReadiness;
  const runnerReady = readiness === "READY";
  const runnerDegraded = readiness === "DEGRADED";

  return (
    <div className="space-y-5">
      <AdminCommandHeader
        active="studio-setup"
        refreshing={q.isFetching || runtimeHealth.isFetching}
        onRefresh={() => {
          void q.refetch();
          void runtimeHealth.refetch();
        }}
      />

      {/* Quick Runner Status & Launch Studio Canvas Bar */}
      <section
        aria-label={t("Studio Runner & Quick Launch", "Runner Studio & Mở nhanh Canvas")}
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Boxes className="size-4 text-primary" aria-hidden="true" />
              {t("MAVIS Studio Setup Hub", "Trung tâm cấu hình MAVIS Studio")}
            </span>
            <Badge variant={runnerReady ? "success" : runnerDegraded ? "warning" : "destructive"}>
              {runtimeHealth.isLoading
                ? t("Checking Runner…", "Đang kiểm tra Runner…")
                : runnerReady
                  ? t("Runner Ready", "Runner Sẵn sàng")
                  : runnerDegraded
                    ? t("Runner Degraded", "Runner Suy giảm")
                    : t("Runner Attention", "Cần kiểm tra Runner")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {runtimeHealth.data ? (
              <>
                {t("Active slots:", "Slot đang chạy:")}{" "}
                <strong className="mavis-tabular text-foreground">
                  {runtimeHealth.data.activeSessions}/{runtimeHealth.data.maxActiveSessions}
                </strong>{" "}
                · {t("Queue:", "Hàng chờ:")}{" "}
                <strong className="mavis-tabular text-foreground">
                  {runtimeHealth.data.queuedSessions}/{runtimeHealth.data.maxQueuedSessions}
                </strong>{" "}
                · OCI:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  {runtimeHealth.data.effectiveOciRuntime}
                </code>
              </>
            ) : (
              t(
                "Configure Studio Docker execution profiles (CPU, RAM, timeout, concurrency) and supervise live student sessions.",
                "Cấu hình hồ sơ thực thi Studio Docker (CPU, RAM, thời gian chờ, đồng thời) và quản lý các phiên đang chạy.",
              )
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/workspaces">
              {t("Open Studio Live (choose a lab)", "Mở Studio Live (chọn Lab)")}
              <ArrowUpRight className="ml-1.5 size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label={t("Studio Setup Sections", "Các mục cấu hình Studio")}
      >
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "profiles"}
          size="sm"
          variant={tab === "profiles" ? "default" : "outline"}
          onClick={() => setTab("profiles")}
        >
          {t("Execution Profiles", "Hồ sơ thực thi Runtime")}
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "sessions"}
          size="sm"
          variant={tab === "sessions" ? "default" : "outline"}
          onClick={() => setTab("sessions")}
        >
          {t("Live Sessions & Force-Stop", "Phiên chạy thực tế & Dừng khẩn cấp")}
        </Button>
      </div>

      {tab === "sessions" ? (
        <AdminRuntimeSummary />
      ) : (
        <div className="space-y-4">
          <AdminToolbar
            fetching={q.isFetching}
            updatedAt={q.dataUpdatedAt}
            showRefresh={false}
            refresh={() => void q.refetch()}
          />
          <Notice>
            {t(
              "Profile changes apply immediately to newly started Studio Live sessions. Review CPU, RAM, and timeout limits before enabling a profile.",
              "Thay đổi hồ sơ sẽ áp dụng ngay cho các phiên Studio Live mới. Kiểm tra kỹ giới hạn CPU, RAM và thời gian chờ trước khi bật.",
            )}
          </Notice>
          <RequestState query={q} empty={!q.data?.length}>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {q.data?.map((p) => (
                <ProfileForm key={p.id + ":" + p.revision} item={p} />
              ))}
            </div>
          </RequestState>
        </div>
      )}
    </div>
  );
}
export function RuntimeProfiles() {
  const { t } = useLocale();
  const params = useSearchParams();
  const requestedTab = params?.get("tab");
  const legacyTab =
    requestedTab === "profiles" || requestedTab === "sessions" ? requestedTab : null;
  const q = useApiQuery("profiles", {}, { enabled: legacyTab === "profiles" });
  const runtimeHealth = useApiQuery("adminRuntimeHealth", {}, { refreshMs: 30000 });
  return (
    <div className="space-y-5">
      <AdminCommandHeader
        active="profiles"
        refreshing={q.isFetching || runtimeHealth.isFetching}
        onRefresh={() => {
          if (legacyTab === "profiles") void q.refetch();
          void runtimeHealth.refetch();
        }}
      />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            {t("AI Quotas & Integrations", "Hạn mức AI & Tích hợp")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "Studio Docker execution profiles and live container force-stop are consolidated in Studio Setup.",
              "Hồ sơ thực thi Studio Docker và quản lý dừng khẩn cấp phiên chạy đã được gom gọn tại mục Cấu hình Studio.",
            )}
            {runtimeHealth.data && (
              <>
                {" · "}
                <strong className="mavis-tabular text-foreground">
                  {runtimeHealth.data.activeSessions}/{runtimeHealth.data.maxActiveSessions}{" "}
                  {t("active slots", "slot đang chạy")}
                </strong>
              </>
            )}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/administration/studio-setup">
            {t("Open Studio Setup", "Mở Cấu hình Studio")}
            <ArrowUpRight className="ml-1.5 size-4" aria-hidden="true" />
          </Link>
        </Button>
      </section>
      {legacyTab === "sessions" ? (
        <AdminRuntimeSummary />
      ) : legacyTab === "profiles" ? (
        <div className="space-y-5">
          <AdminToolbar
            fetching={q.isFetching}
            updatedAt={q.dataUpdatedAt}
            showRefresh={false}
            refresh={() => void q.refetch()}
          />
          <RequestState query={q} empty={!q.data?.length}>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {q.data?.map((p) => (
                <ProfileForm key={p.id + ":" + p.revision} item={p} />
              ))}
            </div>
          </RequestState>
        </div>
      ) : (
        <div className="space-y-8">
          <PlatformUsage />
          <Integrations />
        </div>
      )}
    </div>
  );
}
function ProfileForm({ item }: { item: Response<"profiles">[number] }) {
  const { t } = useLocale();
  const save = useApiMutation("configureProfile");
  const [enabled, setEnabled] = useState(item.enabled),
    [memory, setMemory] = useState(item.memoryMiB ?? 256),
    [cpus, setCpus] = useState(item.cpus ?? 1),
    [timeout, setTimeout] = useState(item.timeoutSeconds ?? 120);
  return (
    <DetailPanel title={item.name}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            profileId: item.id,
            expectedRevision: item.revision,
            enabled,
            memoryMiB: memory,
            cpus,
            timeoutSeconds: timeout,
          });
        }}
      >
        <p className="text-xs text-muted-foreground">
          {t("Revision", "Phiên bản")} {item.revision} ·{" "}
          {item.enabled ? t("Enabled", "Đang bật") : t("Disabled", "Đang tắt")}.{" "}
          {t("Review resource limits before saving.", "Kiểm tra kỹ giới hạn tài nguyên trước khi lưu.")}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("Enabled", "Đang bật")}
        </label>
        <label className="block space-y-2 text-sm">
          {t("Memory (MiB)", "Bộ nhớ RAM (MiB)")}
          <Input
            type="number"
            min={64}
            max={2048}
            required
            value={memory}
            onChange={(e) => setMemory(Number(e.target.value))}
          />
        </label>
        <label className="block space-y-2 text-sm">
          {t("CPU cores", "Số nhân CPU")}
          <Input
            type="number"
            min={0.01}
            max={4}
            step={0.01}
            required
            value={cpus}
            onChange={(e) => setCpus(Number(e.target.value))}
          />
        </label>
        <label className="block space-y-2 text-sm">
          {t("Timeout (seconds)", "Thời gian chờ tối đa (giây)")}
          <Input
            type="number"
            min={1}
            max={300}
            required
            value={timeout}
            onChange={(e) => setTimeout(Number(e.target.value))}
          />
        </label>
        <Button
          disabled={
            save.isPending ||
            (enabled === item.enabled &&
              memory === (item.memoryMiB ?? 256) &&
              cpus === (item.cpus ?? 1) &&
              timeout === (item.timeoutSeconds ?? 120))
          }
        >
          {save.isPending ? t("Saving…", "Đang lưu…") : t("Save changes", "Lưu thay đổi")}
        </Button>
        {save.isSuccess && (
          <p role="status" className="text-sm text-emerald-500">
            {t("Profile saved.", "Đã lưu hồ sơ.")}
          </p>
        )}
        {save.error && <ErrorState error={save.error} />}
      </form>
    </DetailPanel>
  );
}
export function PlatformUsage() {
  const { locale, t } = useLocale();
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const q = useApiQuery("adminAiUsage", {}, { refreshMs: 60000 });
  const rows = q.data?.providers ?? [],
    measured = rows.filter((r) => r.usage);
  const events = (q.data?.events ?? []).filter((event) =>
    [
      event.userName,
      event.userEmail,
      event.userId,
      event.provider,
      event.model,
      event.source,
      event.requestId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(logSearch.trim().toLowerCase()),
  );
  const activeLogPage = Math.min(logPage, Math.max(1, Math.ceil(events.length / 10)));
  const providers = rows.filter((r, i) => rows.findIndex((x) => x.provider === r.provider) === i);
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      >
        <span className="text-sm text-muted-foreground">
          {t(
            "Recorded MAVIS requests · all time since tracking began",
            "Các yêu cầu AI đã ghi nhận qua MAVIS · toàn thời gian",
          )}
        </span>
      </AdminToolbar>
      <RequestState query={q}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label={t("Input tokens", "Token đầu vào")}
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.inputTokens, 0).toLocaleString()
                  : t("Not recorded", "Chưa ghi nhận")
              }
            />
            <SummaryCard
              label={t("Output tokens", "Token đầu ra")}
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.outputTokens, 0).toLocaleString()
                  : t("Not recorded", "Chưa ghi nhận")
              }
            />
            <SummaryCard
              label={t("Recorded requests", "Số lượt gọi đã ghi nhận")}
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.requestCount, 0).toLocaleString()
                  : t("Not recorded", "Chưa ghi nhận")
              }
            />
          </div>
          <Notice>
            {t(
              "Only requests with provider-reported token counts saved by MAVIS are included. Earlier usage and requests made outside MAVIS are not included. Missing data is not zero.",
              "Chỉ tính các yêu cầu do MAVIS lưu lại có số liệu token từ nhà cung cấp. Các lượt gọi ngoài hệ thống không được tính.",
            )}
          </Notice>
          <DetailPanel title={t("Usage by model", "Mức sử dụng theo mô hình AI")}>
            <DataTable
              emptyDescription={t(
                "Try clearing the filters or refresh to check for new records.",
                "Hãy xóa bộ lọc hoặc làm mới để kiểm tra bản ghi mới.",
              )}
              caption={t("Recorded model usage", "Thống kê sử dụng mô hình")}
              rows={rows}
              rowKey={(r) => r.provider + ":" + (r.model ?? "unknown")}
              columns={[
                {
                  key: "model",
                  label: t("Provider / model", "Nhà cung cấp / mô hình"),
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.provider === "openai" ? "OpenAI" : "Gemini"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.model ?? t("No recorded model", "Chưa ghi nhận mô hình")}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "in",
                  label: t("Input tokens", "Token đầu vào"),
                  render: (r) => r.usage?.inputTokens.toLocaleString() ?? t("Not recorded", "Chưa ghi nhận"),
                },
                {
                  key: "out",
                  label: t("Output tokens", "Token đầu ra"),
                  render: (r) => r.usage?.outputTokens.toLocaleString() ?? t("Not recorded", "Chưa ghi nhận"),
                },
                {
                  key: "req",
                  label: t("Requests", "Số lượt gọi"),
                  render: (r) => r.usage?.requestCount.toLocaleString() ?? t("Not recorded", "Chưa ghi nhận"),
                },
                {
                  key: "coverage",
                  label: t("Observed sources", "Nguồn ghi nhận"),
                  render: (r) => (
                    <span className="text-xs">
                      {[
                        r.coverage?.java === "OBSERVED" ? "Java" : null,
                        r.coverage?.next === "OBSERVED" ? "Next.js" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("Not observed", "Chưa ghi nhận")}
                    </span>
                  ),
                },
              ]}
            />
          </DetailPanel>
          <DetailPanel title={t("Usage logs", "Nhật ký sử dụng AI")}>
            <p className="text-sm text-muted-foreground">
              {t(
                "Latest 200 recorded requests, newest first. Times use your local timezone. Earlier records may not have a user attached.",
                "200 lượt gọi AI gần nhất, mới nhất trước. Thời gian theo múi giờ hiện tại.",
              )}
            </p>
            <SearchInput
              label={t("Search user, email, provider or model", "Tìm người dùng, email, nhà cung cấp hoặc mô hình")}
              value={logSearch}
              onChange={(value) => {
                setLogSearch(value);
                setLogPage(1);
              }}
            />
            {q.data?.eventsAvailable ? (
              <>
                <DataTable
                  caption={t("AI usage request logs", "Nhật ký yêu cầu sử dụng AI")}
                  emptyDescription={t("No recorded requests match this search.", "Không có yêu cầu nào khớp tìm kiếm này.")}
                  rows={events.slice((activeLogPage - 1) * 10, activeLogPage * 10)}
                  rowKey={(event) => event.requestId}
                  columns={[
                    {
                      key: "user",
                      label: t("User", "Người dùng"),
                      render: (event) => (
                        <div className="min-w-44 space-y-1">
                          <p className="font-medium">{event.userName ?? t("User not recorded", "Chưa ghi nhận người dùng")}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.userEmail ?? event.userId ?? t("Historical or background request", "Yêu cầu cũ hoặc tác vụ nền")}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "time",
                      label: t("Time", "Thời gian"),
                      render: (event) => (
                        <time
                          dateTime={event.recordedAt}
                          className="whitespace-nowrap tabular-nums"
                        >
                          {new Date(event.recordedAt).toLocaleString(
                            locale === "vi" ? "vi-VN" : "en-US",
                            locale === "vi" ? { hour12: false } : undefined,
                          )}
                        </time>
                      ),
                    },
                    {
                      key: "model",
                      label: t("Provider / model", "Nhà cung cấp / mô hình"),
                      render: (event) => (
                        <div>
                          <p className="font-medium">
                            {event.provider === "openai" ? "OpenAI" : "Gemini"}
                          </p>
                          <p className="text-xs text-muted-foreground">{event.model}</p>
                        </div>
                      ),
                    },
                    {
                      key: "input",
                      label: t("Input tokens", "Token đầu vào"),
                      render: (event) => event.inputTokens.toLocaleString(),
                    },
                    {
                      key: "output",
                      label: t("Output tokens", "Token đầu ra"),
                      render: (event) => event.outputTokens.toLocaleString(),
                    },
                    {
                      key: "source",
                      label: t("Source", "Nguồn"),
                      render: (event) => (event.source === "next" ? "Next.js" : "Java"),
                    },
                    {
                      key: "request",
                      label: t("Request ID", "Mã yêu cầu"),
                      render: (event) => (
                        <code className="text-xs" title={event.requestId}>
                          {event.requestId.slice(0, 8)}
                        </code>
                      ),
                    },
                  ]}
                />
                <PageResults count={events.length} page={activeLogPage} onPage={setLogPage} />
              </>
            ) : (
              <Notice>
                {t(
                  "Usage logs are unavailable. Check the usage storage and apply migration V23.",
                  "Nhật ký sử dụng hiện không khả dụng. Hãy kiểm tra bộ nhớ lưu trữ và áp dụng migration V23.",
                )}
              </Notice>
            )}
          </DetailPanel>
          <DetailPanel
            title={t("Provider account data", "Dữ liệu tài khoản nhà cung cấp")}
            actions={
              <Button asChild size="sm" variant="ghost">
                <Link href="/administration/integrations">{t("Manage integrations", "Quản lý tích hợp")}</Link>
              </Button>
            }
          >
            <p className="text-sm text-muted-foreground">
              {t(
                "Optional project-wide usage and limits are separate from MAVIS token tracking.",
                "Mức sử dụng và giới hạn toàn dự án tùy chọn được tách biệt với theo dõi token của MAVIS.",
              )}
            </p>
            <div className="space-y-3">
              {providers.map((r) => (
                <details key={r.provider} className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {r.provider === "openai" ? "OpenAI" : "Gemini"} ·{" "}
                    {r.providerUsage || r.cost || r.limits || r.geminiQuota
                      ? t("Project data connected", "Đã kết nối dữ liệu dự án")
                      : t("Project data not connected", "Chưa kết nối dữ liệu dự án")}
                  </summary>
                  <div className="mt-4 space-y-4 text-sm">
                    {r.providerDataUpdatedAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("Checked", "Đã kiểm tra")}{" "}
                        {new Date(r.providerDataUpdatedAt).toLocaleString(
                          locale === "vi" ? "vi-VN" : "en-US",
                          locale === "vi" ? { hour12: false } : undefined,
                        )}
                      </p>
                    )}
                    {!r.providerUsage && !r.cost && !r.limits && !r.geminiQuota && (
                      <p className="text-muted-foreground">
                        {t(
                          "Account-level access has not been connected. Recorded token usage above remains available independently.",
                          "Quyền truy cập cấp tài khoản chưa được kết nối. Dữ liệu token đã ghi ở trên vẫn khả dụng độc lập.",
                        )}
                      </p>
                    )}
                    {r.providerUsage && (
                      <p>
                        {t("Current UTC month:", "Tháng UTC hiện tại:")}{" "}
                        {r.providerUsage.inputTokens.toLocaleString()} {t("input tokens", "token đầu vào")} ·{" "}
                        {r.providerUsage.outputTokens.toLocaleString()} {t("output tokens", "token đầu ra")} ·{" "}
                        {r.providerUsage.requestCount.toLocaleString()} {t("requests across this provider project.", "lượt gọi trên dự án nhà cung cấp này.")}
                      </p>
                    )}
                    {r.cost && (
                      <p>
                        {t("Project spend:", "Chi phí dự án:")}{" "}
                        {r.cost.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                        {r.cost.currency.toUpperCase()} ·{" "}
                        {new Date(r.cost.startTime).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")} –{" "}
                        {new Date(r.cost.endTime).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")}
                      </p>
                    )}
                    {r.limits && (
                      <DataTable
                        emptyDescription={t("Try clearing the filters or refresh to check for new records.", "Thử xóa bộ lọc hoặc làm mới để kiểm tra bản ghi mới.")}
                        caption={t("Project model rate limits", "Giới hạn tần suất mô hình của dự án")}
                        rows={r.limits.models}
                        rowKey={(x) => x.model}
                        columns={[
                          { key: "m", label: t("Model", "Mô hình"), render: (x) => x.model },
                          {
                            key: "r",
                            label: t("Requests / minute", "Yêu cầu / phút"),
                            render: (x) => x.requestsPerMinute ?? t("Unknown", "Không rõ"),
                          },
                          {
                            key: "t",
                            label: t("Tokens / minute", "Token / phút"),
                            render: (x) => x.tokensPerMinute ?? t("Unknown", "Không rõ"),
                          },
                        ]}
                      />
                    )}
                    {r.geminiQuota && (
                      <>
                        <p className="text-muted-foreground">
                          {t(
                            "Cloud Monitoring samples may be delayed. Usage samples are interval deltas, not a remaining balance.",
                            "Mẫu Cloud Monitoring có thể bị trễ. Mẫu sử dụng là mức chênh lệch theo khoảng, không phải số dư còn lại.",
                          )}{" "}
                          {r.geminiQuota.partial ? t("Some measurements are unavailable.", "Một số phép đo hiện không khả dụng.") : ""}
                        </p>
                        <DataTable
                          emptyDescription={t("Try clearing the filters or refresh to check for new records.", "Thử xóa bộ lọc hoặc làm mới để kiểm tra bản ghi mới.")}
                          caption={t("Google quota measurements", "Các phép đo hạn mức Google")}
                          rows={r.geminiQuota.samples}
                          rowKey={(x) => x.model + x.metric + x.limitName + x.measuredAt}
                          columns={[
                            { key: "m", label: t("Model", "Mô hình"), render: (x) => x.model },
                            {
                              key: "n",
                              label: t("Limit", "Giới hạn"),
                              render: (x) => <span className="break-all">{x.limitName}</span>,
                            },
                            { key: "k", label: t("Measurement", "Phép đo"), render: (x) => x.kind },
                            { key: "v", label: t("Value", "Giá trị"), render: (x) => x.value.toLocaleString() },
                            {
                              key: "d",
                              label: t("Observed", "Thời điểm đo"),
                              render: (x) =>
                                new Date(x.measuredAt).toLocaleString(
                                  locale === "vi" ? "vi-VN" : "en-US",
                                  locale === "vi" ? { hour12: false } : undefined,
                                ),
                            },
                          ]}
                        />
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("No verified remaining credit balance is available.", "Không có số dư credit còn lại nào được xác minh.")}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </DetailPanel>
        </div>
      </RequestState>
    </div>
  );
}
function AdminJobDetails({ job, returnTo }: { job: Response<"adminJobs">[number]; returnTo: string }) {
  const { t } = useLocale();
  const project = useApiQuery("project", { projectId: job.projectId });
  const model = useApiQuery("model", { projectId: job.projectId, modelId: job.modelId ?? "" },
    { enabled: !!job.modelId });
  const summary = model.data ? summarizeJobModel(model.data) : null;
  return (
    <DetailPanel title={t("Selected job", "Tác vụ đã chọn")}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{t("Project", "Dự án")}</dt><dd>{project.data?.name ?? job.projectId}</dd></div>
        <div><dt className="text-muted-foreground">{t("Job ID", "Mã tác vụ")}</dt><dd className="break-all font-mono text-xs">{job.id}</dd></div>
        <div><dt className="text-muted-foreground">{t("Source snapshot", "Snapshot mã nguồn")}</dt><dd className="break-all font-mono text-xs">{job.snapshotId}</dd></div>
        <div><dt className="text-muted-foreground">{t("Architecture revision", "Phiên bản kiến trúc")}</dt><dd>{model.data?.revision ?? "—"}</dd></div>
      </dl>
      {project.isError && <ErrorState error={project.error} onRetry={() => void project.refetch()} />}
      <AnalysisStatusIndicator job={job} />
      {job.modelId ? <RequestState query={model}>
        {summary && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={t("Analysis result summary", "Tóm tắt kết quả phân tích")}>
          <SummaryCard label={t("Services", "Dịch vụ")} value={summary.services} />
          <SummaryCard label={t("Elements", "Phần tử")} value={summary.elements} />
          <SummaryCard label={t("Relationships", "Quan hệ")} value={summary.relationships} />
          <SummaryCard label={t("Evidence records", "Bằng chứng")} value={summary.evidence} />
          <SummaryCard label={t("Uncertain relationships", "Quan hệ chưa chắc chắn")} value={summary.uncertain} />
        </div>}
      </RequestState> : <p className="text-sm text-muted-foreground">{t("No architecture model is available for this job.", "Chưa có mô hình kiến trúc cho tác vụ này.")}</p>}
      {job.modelId && <Button asChild variant="outline" size="sm">
        <Link href={`/architecture?${new URLSearchParams({ project: job.projectId, model: job.modelId, returnTo })}`}>
          {t("Open architecture", "Mở sơ đồ kiến trúc")}
        </Link>
      </Button>}
    </DetailPanel>
  );
}

function formatAdminProjectName(
  projectName: string | null | undefined,
  fallbackId: string,
  locale: "en" | "vi",
  t: (en: string, vi?: string) => string,
): string {
  if (!projectName) return `${t("Project", "Dự án")} ${fallbackId.slice(0, 8)}`;
  if (/^Repository khóa học\s*·\s*reference$/i.test(projectName.trim())) {
    return locale === "en"
      ? "Course repository · reference"
      : "Kho mã nguồn khóa học · tham chiếu";
  }
  return projectName;
}

export function AdminAnalysisJobs() {
  const { locale, t } = useLocale();
  const q = useApiQuery("adminJobs", {}, { refreshMs: 30000 });
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(params.get("search") ?? ""),
    [status, setStatus] = useState(params.get("status") ?? "all"),
    [page, setPage] = useState(Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1));
  const selected = params.get("job") ?? "";
  useEffect(() => {
    setSearch(params.get("search") ?? "");
    setStatus(params.get("status") ?? "all");
    setPage(Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1));
  }, [params]);
  const detailsHref = (jobId: string) => {
    const next = new URLSearchParams();
    if (jobId) next.set("job", jobId);
    if (search) next.set("search", search);
    if (status !== "all") next.set("status", status);
    next.set("page", String(activePage));
    return `/administration/jobs?${next}`;
  };
  const rows = (q.data ?? []).filter(
    (j) =>
      [j.id, j.projectId, j.projectName, j.workspaceName, j.message]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) && (status === "all" || j.status === status),
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={q.isFetching}
        updatedAt={q.dataUpdatedAt}
        refresh={() => void q.refetch()}
      >
        <span className="text-sm text-muted-foreground">
          {t("Latest 50 analysis jobs · refresh every 30 seconds", "50 tác vụ phân tích gần nhất · làm mới mỗi 30 giây")}
        </span>
      </AdminToolbar>
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t("In progress", "Đang xử lý")}
          value={
            q.data?.filter((j) => ["queued", "processing", "cancelling"].includes(j.status))
              .length ?? "—"
          }
        />
        <SummaryCard
          label={t("Failed / timed out", "Thất bại / Quá thời gian chờ")}
          value={q.data?.filter((j) => ["failed", "timed-out"].includes(j.status)).length ?? "—"}
        />
        <SummaryCard
          label={t("Completed", "Hoàn tất")}
          value={q.data?.filter((j) => j.status === "completed").length ?? "—"}
        />
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
        <SearchInput
          label={t("Search job, project or message", "Tìm tác vụ, dự án hoặc thông báo")}
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <SelectField
          label={t("Job status", "Trạng thái tác vụ")}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: t("All statuses", "Tất cả trạng thái") },
            { value: "queued", label: t("Queued", "Đang chờ") },
            { value: "processing", label: t("Processing", "Đang chạy") },
            { value: "completed", label: t("Completed", "Hoàn tất") },
            { value: "failed", label: t("Failed", "Thất bại") },
            { value: "partial", label: t("Partial", "Hoàn tất một phần") },
            { value: "cancelling", label: t("Cancelling", "Đang hủy") },
            { value: "cancelled", label: t("Cancelled", "Đã hủy") },
            { value: "timed-out", label: t("Timed out", "Quá thời gian chờ") },
          ]}
        />
      </div>
      <RequestState query={q}>
        <div className="space-y-5">
          <DataTable
            emptyDescription={t("Try clearing the filters or refresh to check for new records.", "Hãy xóa bộ lọc hoặc làm mới để kiểm tra bản ghi mới.")}
            caption={t("Recent analysis jobs", "Tác vụ phân tích gần đây")}
            renderExpandedRow={(job) =>
              job.id === selected ? (
                <AdminJobDetails job={job} returnTo={detailsHref(job.id)} />
              ) : null
            }
            rows={rows.slice((activePage - 1) * 10, activePage * 10)}
            rowKey={(j) => j.id}
            columns={[
              {
                key: "id",
                label: t("Project / Job", "Dự án / Tác vụ"),
                render: (j) => (
                  <div className="max-w-72">
                    <p className="font-medium text-foreground">
                      {formatAdminProjectName(j.projectName, j.projectId, locale, t)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {j.workspaceName ? `${j.workspaceName} · ` : ""}
                      <span className="font-mono">Job {j.id.slice(0, 8)}</span>
                    </p>
                  </div>
                ),
              },
              {
                key: "state",
                label: t("Status", "Trạng thái"),
                render: (j) => {
                  const badge = analysisStatusBadgeProps(j);
                  return <StatusBadge status={badge.status} variant={badge.variant} />;
                },
              },
              {
                key: "progress",
                label: t("Progress", "Tiến độ"),
                render: (j) => (j.progress === null ? t("Not reported", "Chưa báo cáo") : `${j.progress}%`),
              },
              {
                key: "action",
                label: t("Inspect", "Kiểm tra"),
                render: (j) => (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={selected === j.id}
                    onClick={() => router.replace(detailsHref(selected === j.id ? "" : j.id), { scroll: false })}
                  >
                    {selected === j.id ? t("Hide details", "Ẩn chi tiết") : t("View details", "Xem chi tiết")}
                  </Button>
                ),
              },
            ]}
          />
          <PageResults count={rows.length} page={activePage} onPage={setPage} />
        </div>
      </RequestState>
    </div>
  );
}
const AUDIT_ACTION_LABELS: Record<string, { en: string; vi: string }> = {
  USER_LOGIN: { en: "User sign-in", vi: "Đăng nhập tài khoản" },
  USER_LOGOUT: { en: "User sign-out", vi: "Đăng xuất" },
  USER_CREATE: { en: "Create account", vi: "Tạo tài khoản" },
  ADMIN_CREATE_USER: { en: "Admin create account", vi: "Quản trị viên tạo tài khoản" },
  AUTH_SUCCESS: { en: "Sign-in succeeded", vi: "Đăng nhập thành công" },
  AUTH_FAILURE: { en: "Sign-in failed", vi: "Đăng nhập thất bại" },
  USER_LOCK: { en: "Lock account", vi: "Khóa tài khoản" },
  USER_UNLOCK: { en: "Unlock account", vi: "Mở khóa tài khoản" },
  USER_ROLE_UPDATE: { en: "Update role", vi: "Cập nhật vai trò" },
  PASSWORD_CHANGE: { en: "Change password", vi: "Đổi mật khẩu" },
  CONFIGURE_INTEGRATION: { en: "Configure integration", vi: "Cấu hình tích hợp" },
  TEST_INTEGRATION: { en: "Test integration", vi: "Kiểm tra tích hợp" },
  CONFIGURE_RUNNER_PROFILE: { en: "Configure runtime profile", vi: "Cấu hình Runtime Profile" },
  WORKSPACE_CREATE: { en: "Create class", vi: "Tạo lớp học" },
  WORKSPACE_UPDATE: { en: "Update class", vi: "Cập nhật lớp học" },
  WORKSPACE_ARCHIVE: { en: "Archive class", vi: "Lưu trữ lớp học" },
  COURSE_ENROLLED: { en: "Enrolled in course", vi: "Ghi danh khóa học" },
  COURSE_LAB_PUBLISHED: { en: "Publish Lab", vi: "Công bố bài Lab" },
  COURSE_PUBLISHED: { en: "Publish course", vi: "Công bố khóa học" },
  COURSE_QUIZ_PUBLISHED: { en: "Publish Quiz", vi: "Công bố bài Quiz" },
  COURSE_PASSKEY_CREATED: { en: "Create Passkey", vi: "Tạo Passkey lớp học" },
  COURSE_PASSKEY_UPDATED: { en: "Update Passkey", vi: "Cập nhật Passkey" },
  COURSE_PASSKEY_DELETED: { en: "Delete Passkey", vi: "Xóa Passkey" },
  COURSE_PASSKEY_ISSUED: { en: "Issue Passkey", vi: "Cấp phát Passkey" },
  COURSE_PASSKEY_REVOKED: { en: "Revoke Passkey", vi: "Thu hồi Passkey" },
  COURSE_JAVA_COURSERA_SEEDED: { en: "Seed Java Microservices course", vi: "Khởi tạo khóa Java Microservices" },
  COURSE_CSHARP_COURSERA_SEEDED: { en: "Seed C# Microservices course", vi: "Khởi tạo khóa C# Microservices" },
  ASSIGNMENT_CREATE: { en: "Create Lab", vi: "Tạo bài Lab" },
  ASSIGNMENT_UPDATE: { en: "Update Lab", vi: "Cập nhật bài Lab" },
  SUBMISSION_CREATE: { en: "Submit Lab", vi: "Nộp bài Lab" },
  SUBMISSION_REVIEW: { en: "Grade submission", vi: "Chấm điểm bài nộp" },
  RUNTIME_START: { en: "Start runtime session", vi: "Khởi chạy phiên Runtime" },
  RUNTIME_STOP: { en: "Stop runtime session", vi: "Dừng phiên Runtime" },
  RUNTIME_FORCE_STOP: { en: "Force-stop runtime session", vi: "Dừng khẩn cấp phiên Runtime" },
  ANNOUNCEMENT_CREATE: { en: "Create announcement", vi: "Tạo thông báo" },
  ANNOUNCEMENT_PUBLISH: { en: "Publish announcement", vi: "Công bố thông báo" },
};

function formatAuditActionLabel(
  action: string,
  t: (en: string, vi?: string) => string,
): string {
  const known = AUDIT_ACTION_LABELS[action];
  if (known) return t(known.en, known.vi);
  const words = action
    .trim()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return t(words || action);
}

export function AuditRecords() {
  const { locale, t } = useLocale();
  const q = useApiQuery("audit", {});
  const [tab, setTab] = useState<"audit" | "jobs">("audit");
  const [search, setSearch] = useState(""),
    [action, setAction] = useState("all"),
    [page, setPage] = useState(1);
  const rows = (q.data ?? []).filter(
    (a) =>
      [a.action, a.actorName, a.actorEmail, a.actorId, a.details, a.resourceId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) && (action === "all" || a.action === action),
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  return (
    <div className="space-y-5">
      <AdminCommandHeader
        active="audit"
        refreshing={q.isFetching}
        onRefresh={() => void q.refetch()}
      />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("Audit and Jobs Views", "Nhật ký và tác vụ nền")}>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "audit"}
          size="sm"
          variant={tab === "audit" ? "default" : "outline"}
          onClick={() => setTab("audit")}
        >
          {t("Audit Trail", "Nhật ký hệ thống")}
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={tab === "jobs"}
          size="sm"
          variant={tab === "jobs" ? "default" : "outline"}
          onClick={() => setTab("jobs")}
        >
          {t("Background Analysis Jobs", "Tác vụ phân tích nền")}
        </Button>
      </div>
      {tab === "jobs" ? (
        <AdminAnalysisJobs />
      ) : (
        <>
          <AdminToolbar
            fetching={q.isFetching}
            updatedAt={q.dataUpdatedAt}
            showRefresh={false}
            refresh={() => void q.refetch()}
          >
            <span className="text-sm text-muted-foreground">
              {t("Read-only · latest 100 audit records", "Chỉ đọc · 100 bản ghi nhật ký gần nhất")}
            </span>
          </AdminToolbar>
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
            <SearchInput
              label={t("Search action, actor or resource", "Tìm hành động, người thực hiện hoặc đối tượng")}
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <SelectField
              label={t("Action", "Hành động")}
              value={action}
              onChange={(v) => {
                setAction(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: t("All actions", "Tất cả hành động") },
                ...Array.from(new Set((q.data ?? []).map((a) => a.action)))
                  .sort()
                  .map((value) => ({ value, label: formatAuditActionLabel(value, t) })),
              ]}
            />
          </div>
          <RequestState query={q}>
            <div className="space-y-5">
              <DataTable
                emptyDescription={t("Try clearing the filters or refresh to check for new records.", "Hãy xóa bộ lọc hoặc làm mới để kiểm tra bản ghi mới.")}
                caption={t("Administrative audit trail", "Nhật ký thao tác quản trị")}
                rows={rows.slice((activePage - 1) * 10, activePage * 10)}
                rowKey={(a) => a.id}
                columns={[
                  {
                    key: "at",
                    label: t("Time", "Thời gian"),
                    render: (a) => (
                      <span className="whitespace-nowrap text-xs tabular-nums" title={a.at}>
                        {new Date(a.at).toLocaleString(locale === "vi" ? "vi-VN" : "en-US")}
                      </span>
                    ),
                  },
                  {
                    key: "action",
                    label: t("Action", "Hành động"),
                    render: (a) => (
                      <Badge
                        variant={
                          a.action.includes("LOCK") || a.action.includes("STOP")
                            ? "warning"
                            : "outline"
                        }
                      >
                        {formatAuditActionLabel(a.action, t)}
                      </Badge>
                    ),
                  },
                  {
                    key: "actor",
                    label: t("Actor", "Người thực hiện"),
                    render: (a) => (
                      <div className="max-w-60">
                        <p className="text-xs font-medium text-foreground">
                          {a.actorName || a.actorId || t("System", "Hệ thống")}
                        </p>
                        {a.actorEmail && (
                          <p className="text-[11px] text-muted-foreground">{a.actorEmail}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "resource",
                    label: t("Target / Details", "Đối tượng / Chi tiết"),
                    render: (a) => (
                      <div className="max-w-64">
                        <p className="truncate font-mono text-xs">{a.resourceId || "—"}</p>
                        {a.details && (
                          <p className="truncate text-[11px] text-muted-foreground">{a.details}</p>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
              <PageResults count={rows.length} page={activePage} onPage={setPage} />
            </div>
          </RequestState>
        </>
      )}
    </div>
  );
}

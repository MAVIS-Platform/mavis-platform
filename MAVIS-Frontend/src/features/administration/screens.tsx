"use client";
import Link from "next/link";
import { AdminCommandHeader, AdminRuntimeSummary, AdminToolbar, PageResults, Notice } from "./operations";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { summarizeJobModel } from "@/lib/navigation/admin-job-review";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { DataTable, DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
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
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"student" | "lecturer" | "admin">("lecturer");

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
    if (!fullName.trim() || !email.trim()) return;
    try {
      await createAcc.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim(),
        role: newRole,
        ...(password.trim() ? { password: password.trim() } : {}),
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
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => setShowCreate((open) => !open)}
        >
          <Plus className="mr-1 size-4" aria-hidden="true" />
          {showCreate ? t("Close form", "Đóng biểu mẫu") : t("Create Account", "Tạo tài khoản")}
        </Button>
      </AdminToolbar>
      {showCreate && (
        <DetailPanel title={t("Provision Active User Account", "Cấp tài khoản người dùng mới")}>
          <form onSubmit={(e) => void submitCreate(e)} className="grid gap-3 md:grid-cols-4">
            <Input
              required
              aria-label={t("Full name", "Họ và tên")}
              placeholder={t("Full name (e.g. Dr. Nguyen)", "Họ và tên (VD: TS. Nguyễn Văn A)")}
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
              type="password"
              aria-label={t("Initial password (optional)", "Mật khẩu ban đầu (tùy chọn)")}
              placeholder={t("Password (min 6 chars)", "Mật khẩu (tối thiểu 6 ký tự)")}
              value={password}
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                aria-label={t("Account role", "Vai trò tài khoản")}
                className="h-9 flex-1 rounded-md border bg-card px-3 text-sm"
                value={newRole}
                onChange={(e) =>
                  setNewRole(e.target.value as "student" | "lecturer" | "admin")
                }
              >
                <option value="lecturer">{t("Lecturer", "Giảng viên")}</option>
                <option value="student">{t("Student", "Sinh viên")}</option>
                <option value="admin">{t("System Admin", "Quản trị viên")}</option>
              </select>
              <Button size="sm" disabled={createAcc.isPending}>
                {createAcc.isPending ? t("Creating…", "Đang tạo…") : t("Create", "Tạo")}
              </Button>
            </div>
          </form>
          {createAcc.error && <ErrorState error={createAcc.error} />}
        </DetailPanel>
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
          label="Search name or email"
        />
        <SelectField
          label="Role"
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All roles" },
            { value: "admin", label: "System Administrator" },
            { value: "lecturer", label: "Lecturer" },
            { value: "student", label: "Student" },
          ]}
        />
        <SelectField
          label="Account status"
          value={state}
          onChange={(v) => {
            setState(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All statuses" },
            { value: "ACTIVE", label: "Active" },
            { value: "LOCKED", label: "Locked" },
            { value: "PENDING_VERIFICATION", label: "Pending verification" },
          ]}
        />
      </div>
      <RequestState query={query}>
        <div className="space-y-4 [&_thead]:bg-muted/50 [&_th]:py-3.5 [&_th]:font-semibold [&_td]:py-4">
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
                  <div className="flex min-w-52 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                    >
                      {a.name
                        .trim()
                        .split(/\s+/)
                        .map((part) => part[0])
                        .slice(-2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{a.name}</p>
                      {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
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
                      aria-label={`Role for ${a.name}`}
                      className="h-8 w-40 rounded-md border bg-card px-2.5 text-xs disabled:opacity-50"
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
                      className="block min-w-24 space-y-0.5 text-xs tabular-nums"
                    >
                      <span className="block font-medium">{date.toLocaleDateString("vi-VN")}</span>
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
  const query = useApiQuery("integrations", {});
  const mutation = useApiMutation("configureIntegration");
  const [selected, setSelected] = useState<Response<"integrations">[number] | null>(null);
  return (
    <div className="space-y-5">
      <AdminToolbar
        fetching={query.isFetching}
        updatedAt={query.dataUpdatedAt}
        refresh={() => void query.refetch()}
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/administration/usage">View AI usage</Link>
        </Button>
      </AdminToolbar>
      <Notice>
        Enabled does not mean connected. Connection verification is shown separately; changes to
        these switches currently reset when the server restarts.
      </Notice>
      <RequestState query={query} empty={!query.data?.length}>
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data?.map((item) => (
            <DetailPanel key={item.id} title={item.name}>
              <StatusBadge status={item.enabled ? "Enabled" : "Disabled"} />
              <p className="text-xs text-muted-foreground">
                Revision {item.revision} ·{" "}
                {item.status === "CONFIGURED"
                  ? "Credentials configured"
                  : item.status === "PUBLIC_ONLY"
                    ? "Public repositories only"
                    : "Configuration unavailable"}
                .{item.connectionVerified ? " Connection verified." : " Connection not verified."}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  mutation.reset();
                  setSelected(item);
                }}
              >
                {item.enabled ? "Disable" : "Enable"} integration
              </Button>
            </DetailPanel>
          ))}
        </div>
        <ConfirmDialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title="Change integration configuration?"
          description={`${selected?.name} will be ${selected?.enabled ? "disabled" : "enabled"}. Based on revision ${selected?.revision}.`}
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
export function RuntimeProfiles() {
  const { t } = useLocale();
  const q = useApiQuery("profiles", {});
  const [tab, setTab] = useState<"profiles" | "sessions" | "quotas">("profiles");
  return (
    <div className="space-y-5">
      <AdminCommandHeader
        active="profiles"
        refreshing={q.isFetching}
        onRefresh={() => void q.refetch()}
      />
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label={t("Runtime Governance Sections", "Các mục cấu hình Runtime")}
      >
        <Button
          type="button"
          size="sm"
          variant={tab === "profiles" ? "default" : "outline"}
          onClick={() => setTab("profiles")}
        >
          {t("Execution Profiles", "Hồ sơ thực thi Runtime")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "sessions" ? "default" : "outline"}
          onClick={() => setTab("sessions")}
        >
          {t("Live Sessions & Force-Stop", "Phiên chạy thực tế & Dừng khẩn cấp")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "quotas" ? "default" : "outline"}
          onClick={() => setTab("quotas")}
        >
          {t("AI Quotas & Integrations", "Hạn mức AI & Tích hợp")}
        </Button>
      </div>
      {tab === "sessions" ? (
        <AdminRuntimeSummary />
      ) : tab === "quotas" ? (
        <div className="space-y-8">
          <PlatformUsage />
          <Integrations />
        </div>
      ) : (
        <div className="space-y-5">
          <AdminToolbar
            fetching={q.isFetching}
            updatedAt={q.dataUpdatedAt}
            refresh={() => void q.refetch()}
          />
          <Notice>
            {t(
              "Profile changes affect new runtime sessions. Review limits before enabling a profile.",
              "Thay đổi hồ sơ sẽ áp dụng cho các phiên Runtime mới. Hãy kiểm tra kỹ giới hạn tài nguyên trước khi bật.",
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
            Profile saved.
          </p>
        )}
        {save.error && <ErrorState error={save.error} />}
      </form>
    </DetailPanel>
  );
}
export function PlatformUsage() {
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
          Recorded MAVIS requests · all time since tracking began
        </span>
      </AdminToolbar>
      <RequestState query={q}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Input tokens"
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.inputTokens, 0).toLocaleString()
                  : "Not recorded"
              }
            />
            <SummaryCard
              label="Output tokens"
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.outputTokens, 0).toLocaleString()
                  : "Not recorded"
              }
            />
            <SummaryCard
              label="Recorded requests"
              value={
                measured.length
                  ? measured.reduce((n, r) => n + r.usage!.requestCount, 0).toLocaleString()
                  : "Not recorded"
              }
            />
          </div>
          <Notice>
            Only requests with provider-reported token counts saved by MAVIS are included. Earlier
            usage and requests made outside MAVIS are not included. Missing data is not zero.
          </Notice>
          <DetailPanel title="Usage by model">
            <DataTable
              emptyDescription="Try clearing the filters or refresh to check for new records."
              caption="Recorded model usage"
              rows={rows}
              rowKey={(r) => r.provider + ":" + (r.model ?? "unknown")}
              columns={[
                {
                  key: "model",
                  label: "Provider / model",
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.provider === "openai" ? "OpenAI" : "Gemini"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.model ?? "No recorded model"}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "in",
                  label: "Input tokens",
                  render: (r) => r.usage?.inputTokens.toLocaleString() ?? "Not recorded",
                },
                {
                  key: "out",
                  label: "Output tokens",
                  render: (r) => r.usage?.outputTokens.toLocaleString() ?? "Not recorded",
                },
                {
                  key: "req",
                  label: "Requests",
                  render: (r) => r.usage?.requestCount.toLocaleString() ?? "Not recorded",
                },
                {
                  key: "coverage",
                  label: "Observed sources",
                  render: (r) => (
                    <span className="text-xs">
                      {[
                        r.coverage?.java === "OBSERVED" ? "Java" : null,
                        r.coverage?.next === "OBSERVED" ? "Next.js" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not observed"}
                    </span>
                  ),
                },
              ]}
            />
          </DetailPanel>
          <DetailPanel title="Usage logs">
            <p className="text-sm text-muted-foreground">
              Latest 200 recorded requests, newest first. Times use your local timezone. Earlier
              records may not have a user attached.
            </p>
            <SearchInput
              label="Search user, email, provider or model"
              value={logSearch}
              onChange={(value) => {
                setLogSearch(value);
                setLogPage(1);
              }}
            />
            {q.data?.eventsAvailable ? (
              <>
                <DataTable
                  caption="AI usage request logs"
                  emptyDescription="No recorded requests match this search."
                  rows={events.slice((activeLogPage - 1) * 10, activeLogPage * 10)}
                  rowKey={(event) => event.requestId}
                  columns={[
                    {
                      key: "user",
                      label: "User",
                      render: (event) => (
                        <div className="min-w-44 space-y-1">
                          <p className="font-medium">{event.userName ?? "User not recorded"}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.userEmail ?? event.userId ?? "Historical or background request"}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "time",
                      label: "Time",
                      render: (event) => (
                        <time
                          dateTime={event.recordedAt}
                          className="whitespace-nowrap tabular-nums"
                        >
                          {new Date(event.recordedAt).toLocaleString("vi-VN")}
                        </time>
                      ),
                    },
                    {
                      key: "model",
                      label: "Provider / model",
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
                      label: "Input tokens",
                      render: (event) => event.inputTokens.toLocaleString(),
                    },
                    {
                      key: "output",
                      label: "Output tokens",
                      render: (event) => event.outputTokens.toLocaleString(),
                    },
                    {
                      key: "source",
                      label: "Source",
                      render: (event) => (event.source === "next" ? "Next.js" : "Java"),
                    },
                    {
                      key: "request",
                      label: "Request ID",
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
                Usage logs are unavailable. Check the usage storage and apply migration V23.
              </Notice>
            )}
          </DetailPanel>
          <DetailPanel
            title="Provider account data"
            actions={
              <Button asChild size="sm" variant="ghost">
                <Link href="/administration/integrations">Manage integrations</Link>
              </Button>
            }
          >
            <p className="text-sm text-muted-foreground">
              Optional project-wide usage and limits are separate from MAVIS token tracking.
            </p>
            <div className="space-y-3">
              {providers.map((r) => (
                <details key={r.provider} className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {r.provider === "openai" ? "OpenAI" : "Gemini"} ·{" "}
                    {r.providerUsage || r.cost || r.limits || r.geminiQuota
                      ? "Project data connected"
                      : "Project data not connected"}
                  </summary>
                  <div className="mt-4 space-y-4 text-sm">
                    {r.providerDataUpdatedAt && (
                      <p className="text-xs text-muted-foreground">
                        Checked {new Date(r.providerDataUpdatedAt).toLocaleString()}
                      </p>
                    )}
                    {!r.providerUsage && !r.cost && !r.limits && !r.geminiQuota && (
                      <p className="text-muted-foreground">
                        Account-level access has not been connected. Recorded token usage above
                        remains available independently.
                      </p>
                    )}
                    {r.providerUsage && (
                      <p>
                        Current UTC month: {r.providerUsage.inputTokens.toLocaleString()} input
                        tokens · {r.providerUsage.outputTokens.toLocaleString()} output tokens ·{" "}
                        {r.providerUsage.requestCount.toLocaleString()} requests across this
                        provider project.
                      </p>
                    )}
                    {r.cost && (
                      <p>
                        Project spend:{" "}
                        {r.cost.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                        {r.cost.currency.toUpperCase()} ·{" "}
                        {new Date(r.cost.startTime).toLocaleDateString()} –{" "}
                        {new Date(r.cost.endTime).toLocaleDateString()}
                      </p>
                    )}
                    {r.limits && (
                      <DataTable
                        emptyDescription="Try clearing the filters or refresh to check for new records."
                        caption="Project model rate limits"
                        rows={r.limits.models}
                        rowKey={(x) => x.model}
                        columns={[
                          { key: "m", label: "Model", render: (x) => x.model },
                          {
                            key: "r",
                            label: "Requests / minute",
                            render: (x) => x.requestsPerMinute ?? "Unknown",
                          },
                          {
                            key: "t",
                            label: "Tokens / minute",
                            render: (x) => x.tokensPerMinute ?? "Unknown",
                          },
                        ]}
                      />
                    )}
                    {r.geminiQuota && (
                      <>
                        <p className="text-muted-foreground">
                          Cloud Monitoring samples may be delayed. Usage samples are interval
                          deltas, not a remaining balance.{" "}
                          {r.geminiQuota.partial ? "Some measurements are unavailable." : ""}
                        </p>
                        <DataTable
                          emptyDescription="Try clearing the filters or refresh to check for new records."
                          caption="Google quota measurements"
                          rows={r.geminiQuota.samples}
                          rowKey={(x) => x.model + x.metric + x.limitName + x.measuredAt}
                          columns={[
                            { key: "m", label: "Model", render: (x) => x.model },
                            {
                              key: "n",
                              label: "Limit",
                              render: (x) => <span className="break-all">{x.limitName}</span>,
                            },
                            { key: "k", label: "Measurement", render: (x) => x.kind },
                            { key: "v", label: "Value", render: (x) => x.value.toLocaleString() },
                            {
                              key: "d",
                              label: "Observed",
                              render: (x) => new Date(x.measuredAt).toLocaleString(),
                            },
                          ]}
                        />
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      No verified remaining credit balance is available.
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
  const project = useApiQuery("project", { projectId: job.projectId });
  const model = useApiQuery("model", { projectId: job.projectId, modelId: job.modelId ?? "" },
    { enabled: !!job.modelId });
  const summary = model.data ? summarizeJobModel(model.data) : null;
  return (
    <DetailPanel title="Selected job">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Project</dt><dd>{project.data?.name ?? job.projectId}</dd></div>
        <div><dt className="text-muted-foreground">Job ID</dt><dd className="break-all font-mono text-xs">{job.id}</dd></div>
        <div><dt className="text-muted-foreground">Source snapshot</dt><dd className="break-all font-mono text-xs">{job.snapshotId}</dd></div>
        <div><dt className="text-muted-foreground">Architecture revision</dt><dd>{model.data?.revision ?? "—"}</dd></div>
      </dl>
      {project.isError && <ErrorState error={project.error} onRetry={() => void project.refetch()} />}
      <AnalysisStatusIndicator job={job} />
      {job.modelId ? <RequestState query={model}>
        {summary && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Analysis result summary">
          <SummaryCard label="Services" value={summary.services} />
          <SummaryCard label="Elements" value={summary.elements} />
          <SummaryCard label="Relationships" value={summary.relationships} />
          <SummaryCard label="Evidence records" value={summary.evidence} />
          <SummaryCard label="Uncertain relationships" value={summary.uncertain} />
        </div>}
      </RequestState> : <p className="text-sm text-muted-foreground">No architecture model is available for this job.</p>}
      {job.modelId && <Button asChild variant="outline" size="sm">
        <Link href={`/architecture?${new URLSearchParams({ project: job.projectId, model: job.modelId, returnTo })}`}>
          Open architecture
        </Link>
      </Button>}
    </DetailPanel>
  );
}

export function AdminAnalysisJobs() {
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
          Latest 50 analysis jobs · refresh every 30 seconds
        </span>
      </AdminToolbar>
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="In progress"
          value={
            q.data?.filter((j) => ["queued", "processing", "cancelling"].includes(j.status))
              .length ?? "—"
          }
        />
        <SummaryCard
          label="Failed / timed out"
          value={q.data?.filter((j) => ["failed", "timed-out"].includes(j.status)).length ?? "—"}
        />
        <SummaryCard
          label="Completed"
          value={q.data?.filter((j) => j.status === "completed").length ?? "—"}
        />
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
        <SearchInput
          label="Search job, project or message"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <SelectField
          label="Job status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All statuses" },
            { value: "queued", label: "Queued" },
            { value: "processing", label: "Processing" },
            { value: "completed", label: "Completed" },
            { value: "failed", label: "Failed" },
            { value: "partial", label: "Partial" },
            { value: "cancelling", label: "Cancelling" },
            { value: "cancelled", label: "Cancelled" },
            { value: "timed-out", label: "Timed out" },
          ]}
        />
      </div>
      <RequestState query={q}>
        <div className="space-y-5">
          <DataTable
            emptyDescription="Try clearing the filters or refresh to check for new records."
            caption="Recent analysis jobs"
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
                label: "Project / Job",
                render: (j) => (
                  <div className="max-w-72">
                    <p className="font-medium text-foreground">
                      {j.projectName ?? `Project ${j.projectId.slice(0, 8)}`}
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
                label: "Status",
                render: (j) => {
                  const badge = analysisStatusBadgeProps(j);
                  return <StatusBadge status={badge.status} variant={badge.variant} />;
                },
              },
              {
                key: "progress",
                label: "Progress",
                render: (j) => (j.progress === null ? "Not reported" : `${j.progress}%`),
              },
              {
                key: "action",
                label: "Inspect",
                render: (j) => (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={selected === j.id}
                    onClick={() => router.replace(detailsHref(selected === j.id ? "" : j.id), { scroll: false })}
                  >
                    {selected === j.id ? "Hide details" : "View details"}
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
export function AuditRecords() {
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
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Audit and Jobs Views">
        <Button
          type="button"
          size="sm"
          variant={tab === "audit" ? "default" : "outline"}
          onClick={() => setTab("audit")}
        >
          Audit Trail
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "jobs" ? "default" : "outline"}
          onClick={() => setTab("jobs")}
        >
          Background Analysis Jobs
        </Button>
      </div>
      {tab === "jobs" ? (
        <AdminAnalysisJobs />
      ) : (
        <>
          <AdminToolbar
            fetching={q.isFetching}
            updatedAt={q.dataUpdatedAt}
            refresh={() => void q.refetch()}
          >
            <span className="text-sm text-muted-foreground">
              Read-only · latest 100 audit records
            </span>
          </AdminToolbar>
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr]">
            <SearchInput
              label="Search action, actor or resource"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <SelectField
              label="Action"
              value={action}
              onChange={(v) => {
                setAction(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All actions" },
                ...Array.from(new Set((q.data ?? []).map((a) => a.action)))
                  .sort()
                  .map((value) => ({ value, label: value.replaceAll("_", " ").toLowerCase() })),
              ]}
            />
          </div>
          <RequestState query={q}>
            <div className="space-y-5">
              <DataTable
                emptyDescription="Try clearing the filters or refresh to check for new records."
                caption="Administrative audit trail"
                rows={rows.slice((activePage - 1) * 10, activePage * 10)}
                rowKey={(a) => a.id}
                columns={[
                  {
                    key: "at",
                    label: "Time",
                    render: (a) => (
                      <span className="whitespace-nowrap text-xs" title={a.at}>
                        {new Date(a.at).toLocaleString()}
                      </span>
                    ),
                  },
                  {
                    key: "action",
                    label: "Action",
                    render: (a) => (
                      <Badge
                        variant={
                          a.action.includes("LOCK") || a.action.includes("STOP")
                            ? "warning"
                            : "outline"
                        }
                      >
                        {a.action.replaceAll("_", " ")}
                      </Badge>
                    ),
                  },
                  {
                    key: "actor",
                    label: "Actor",
                    render: (a) => (
                      <div className="max-w-60">
                        <p className="text-xs font-medium text-foreground">
                          {a.actorName || a.actorId || "System"}
                        </p>
                        {a.actorEmail && (
                          <p className="text-[11px] text-muted-foreground">{a.actorEmail}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "resource",
                    label: "Target / Details",
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

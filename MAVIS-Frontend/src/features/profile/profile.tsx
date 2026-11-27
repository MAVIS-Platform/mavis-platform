"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useApi, useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/shared/request-state";
import { ScreenHelpTrigger } from "@/components/shared/screen-guided-tour";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AvatarStudioDialog } from "./avatar-studio-dialog";
import { useLocale } from "@/lib/i18n/locale-context";
import { hasPermission } from "@/lib/auth/permissions";
import { roleLabels } from "@/lib/navigation";
import { normalizeError } from "@/lib/errors/api-error";
import type { Response } from "@/lib/api/contracts";
type User = NonNullable<Response<"session">["user"]>;

export function Profile() {
  const { locale, t } = useLocale();
  const session = useSession();
  const homeHref =
    session.data?.user?.role === "admin"
      ? "/administration/health"
      : session.data?.user?.role === "lecturer"
        ? "/workspaces"
        : "/courses";
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 gap-1.5 text-muted-foreground"
            >
              <Link href={homeHref}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("Back", "Quay lại")}
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{t("My Profile")}</h1>
            <ScreenHelpTrigger screenId="profile" />
          </div>
        </div>
      </header>
      {session.isPending ? (
        <LoadingState label="Loading profile…" />
      ) : session.error ? (
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      ) : session.data?.user ? (
        <ProfileDetails
          key={`${session.data.user.id}:${locale === "vi" ? "vi" : "en"}`}
          user={session.data.user}
        />
      ) : (
        <p role="alert" className="text-sm">
          {t("Sign in to view your profile.")}
        </p>
      )}
    </div>
  );
}

function ProfileStatistics({ role }: { role: User["role"] }) {
  const { t } = useLocale();
  const projects = useApiQuery(
    "projectOverviews",
    {},
    { enabled: hasPermission(role, "project:read") },
  );
  const workspaces = useApiQuery(
    "workspaces",
    {},
    { enabled: hasPermission(role, "workspace:read") },
  );
  const submissions = useApiQuery(
    "submissions",
    {},
    { enabled: hasPermission(role, "workspace:read") },
  );
  const projectList = projects.data ?? [];
  const value = (
    query: { isPending: boolean; isError: boolean; data: unknown },
    amount: number | string,
  ) =>
    query.isPending
      ? t("Loading…")
      : query.isError || query.data === undefined
        ? t("Unavailable")
        : amount;
  const failed = projects.isError || workspaces.isError || submissions.isError;
  return (
    <div className="space-y-3">
      <dl
        aria-label={t("Account statistics")}
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1"
      >
        {[
          [t("Projects", "Dự án"), value(projects, projectList.length)],
          [
            t("Workspaces joined", "Lớp đã tham gia"),
            value(workspaces, workspaces.data?.length ?? 0),
          ],
          [t("Submissions", "Bài nộp"), value(submissions, submissions.data?.length ?? 0)],
        ].map(([label, amount]) => (
          <div
            key={String(label)}
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3"
          >
            <dt className="break-normal [overflow-wrap:normal] text-xs font-medium leading-4 text-muted-foreground">
              {label}
            </dt>
            <dd className="mavis-tabular shrink-0 break-normal [overflow-wrap:normal] text-base font-bold text-foreground">
              {amount}
            </dd>
          </div>
        ))}
      </dl>
      {failed && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          <span>{t("Some account statistics could not be loaded.")}</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={() => {
              void projects.refetch();
              void workspaces.refetch();
              void submissions.refetch();
            }}
          >
            {t("Retry")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ProfileDetails({ user }: { user: User }) {
  const { t, locale, setLocale } = useLocale();
  const activeLocale: "en" | "vi" = locale === "vi" ? "vi" : "en";
  const api = useApi();
  const update = useApiMutation("updateProfile");
  const [fullName, setFullName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [preferredLocale, setPreferredLocale] = useState<"en" | "vi">(
    activeLocale || user.preferredLocale || "en",
  );
  const [nameError, setNameError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const savingName = useRef(false);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (savingName.current || passwordSaving || update.isPending) return;
    if (!fullName.trim()) {
      setNameError("Full Name is required.");
      return;
    }
    if (fullName.trim().length > 255) {
      setNameError("Full Name must be 255 characters or fewer.");
      return;
    }
    savingName.current = true;
    setNameError("");
    setNotice("");
    const trimmedAvatar = avatarUrl.trim();
    const clearingAvatar = Boolean(user.avatarUrl) && !trimmedAvatar;
    try {
      const result = await update.mutateAsync({
        fullName: fullName.trim(),
        avatarUrl: trimmedAvatar || null,
        ...(clearingAvatar ? { clearAvatar: true } : {}),
        preferredLocale,
      });
      setFullName(result.user?.name ?? fullName.trim());
      if (result.user && "avatarUrl" in result.user) {
        setAvatarUrl(result.user.avatarUrl ?? "");
      }
      setLocale?.(preferredLocale);
      setNotice("Profile updated successfully.");
    } catch {
      /* Shared mutation error displayed below. */
    } finally {
      savingName.current = false;
    }
  }

  async function copyAccountId() {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      setCopyNotice("Account ID copied.");
    } catch {
      setCopied(false);
      setCopyNotice("Unable to copy. Select the Account ID to copy it.");
    }
  }

  const canUploadPhoto = api.mode === "backend" && !update.isPending && !passwordSaving;
  const isFormDirty =
    fullName.trim() !== user.name ||
    avatarUrl !== (user.avatarUrl ?? "") ||
    preferredLocale !== (user.preferredLocale ?? activeLocale);

  return (
    <>
      <section
        aria-label={t("Social profile header", "Ảnh bìa và đại diện")}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <div className="relative h-24 bg-gradient-to-r from-sky-600 via-teal-600 to-indigo-600 dark:from-slate-900 dark:via-teal-900 dark:to-indigo-950 sm:h-28">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_60%)]"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4 px-4 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:pb-5">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
            <div className="relative -mt-12 inline-flex w-fit shrink-0">
              {canUploadPhoto ? (
                <button
                  type="button"
                  aria-label={t(
                    "Click to change or remove photo",
                    "Bấm để đổi hoặc xóa ảnh đại diện",
                  )}
                  title={t("Click to change or remove photo", "Bấm để đổi hoặc xóa ảnh đại diện")}
                  onClick={() => setAvatarDialogOpen(true)}
                  className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar
                    name={fullName || user.name}
                    avatarUrl={avatarUrl}
                    size="xl"
                    className="size-20 text-lg ring-4 ring-card transition-opacity group-hover:opacity-90 sm:size-24"
                  />
                  <span className="absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105 group-hover:bg-primary/90">
                    <Camera className="size-4" aria-hidden="true" />
                  </span>
                </button>
              ) : (
                <UserAvatar
                  name={fullName || user.name}
                  avatarUrl={avatarUrl}
                  size="xl"
                  className="size-20 text-lg ring-4 ring-card sm:size-24"
                />
              )}
            </div>
            <div className="min-w-0 space-y-1.5 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-bold leading-7 text-foreground sm:text-2xl">
                  {fullName || user.name || t("Full name not available")}
                </h2>
                <Badge
                  variant="secondary"
                  className="shrink-0 whitespace-nowrap border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {t(roleLabels[user.role])}
                </Badge>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 max-w-full break-all">
                  {user.email || t("Email not available")}
                </span>
                {user.email && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    {t("Verified", "Đã xác minh")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        data-testid="profile-responsive-layout"
        className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
      >
        <section
          aria-label={t("Profile summary")}
          className="min-w-0 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-5 [overflow-wrap:anywhere] lg:col-start-2 lg:row-start-1"
        >
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("Account overview", "Tổng quan tài khoản")}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(
                  "Your account identifier and activity summary.",
                  "Mã định danh và tổng quan hoạt động của tài khoản.",
                )}
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="shrink-0 font-medium">{t("Account ID:")}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px]" title={user.id}>
                {user.id}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 gap-1 px-2 text-[11px] ${
                  copied ? "text-emerald-600 dark:text-emerald-400" : ""
                }`}
                aria-label={t("Copy Account ID")}
                onClick={() => void copyAccountId()}
              >
                {copied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
                {copied ? t("Copied!", "Đã chép!") : t("Copy")}
              </Button>
            </div>
            {copyNotice && (
              <p role="status" className="text-xs text-muted-foreground">
                {t(copyNotice)}
              </p>
            )}

            <div className="border-t pt-4">
              {hasPermission(user.role, "project:read") && <ProfileStatistics role={user.role} />}
            </div>
          </div>
        </section>

        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
          {notice && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200"
            >
              <Check className="size-4 shrink-0" aria-hidden="true" />
              {t(notice)}
            </p>
          )}

          <section
            aria-labelledby="profile-information"
            className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-6 [overflow-wrap:anywhere]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="min-w-0">
                <h2 id="profile-information" className="text-lg font-semibold text-foreground">
                  {t("Personal Information")}
                </h2>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
                disabled={api.mode !== "backend" || update.isPending || !user.name.trim()}
                onClick={() => setPasswordDialogOpen(true)}
              >
                <KeyRound className="size-4" aria-hidden="true" />
                {t("Change Password")}
              </Button>
            </div>

            <form noValidate onSubmit={saveName} className="mt-5 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="profile-full-name" className="text-sm font-medium">
                    {t("Full Name")}
                  </label>
                  <Input
                    id="profile-full-name"
                    className="mt-2 h-11 w-full min-w-0"
                    value={fullName}
                    maxLength={255}
                    required
                    autoComplete="name"
                    disabled={update.isPending || passwordSaving}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? "profile-name-error" : undefined}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setNameError("");
                    }}
                  />
                  {nameError && (
                    <p
                      id="profile-name-error"
                      role="alert"
                      className="mt-2 text-sm text-destructive"
                    >
                      {t(nameError)}
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <label
                    htmlFor="profile-locale"
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Globe className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {t("Preferred language")}
                  </label>
                  <select
                    id="profile-locale"
                    className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm"
                    value={preferredLocale}
                    onChange={(e) => setPreferredLocale(e.target.value as "en" | "vi")}
                  >
                    <option value="en">English</option>
                    <option value="vi">Tiếng Việt</option>
                  </select>
                </div>
              </div>

              <dl className="grid min-w-0 gap-4 rounded-xl border border-border/60 bg-muted/15 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-4">
                <div className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("Email")}
                  </dt>
                  <dd className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                    <span>{user.email || t("Email not available")}</span>
                    {user.email && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck className="size-3" aria-hidden="true" />
                        {t("Verified", "Đã xác minh")}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("Role")}
                  </dt>
                  <dd className="mt-1.5">
                    <Badge variant="secondary" className="whitespace-nowrap">
                      {t(roleLabels[user.role])}
                    </Badge>
                  </dd>
                </div>
              </dl>

              {update.error && <ErrorState error={update.error} />}
              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                <Button
                  type="submit"
                  disabled={
                    update.isPending ||
                    passwordSaving ||
                    !fullName.trim() ||
                    fullName.trim().length > 255 ||
                    !isFormDirty
                  }
                  className="h-11 w-full sm:w-auto"
                >
                  {update.isPending && (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  )}
                  {t(update.isPending ? "Saving…" : "Save Changes")}
                </Button>
                {fullName !== user.name && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full sm:w-auto"
                    disabled={update.isPending || passwordSaving}
                    onClick={() => {
                      setFullName(user.name);
                      setNameError("");
                      setNotice("");
                      update.reset();
                    }}
                  >
                    {t("Reset")}
                  </Button>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>

      {avatarDialogOpen && (
        <AvatarStudioDialog
          open={avatarDialogOpen}
          onOpenChange={setAvatarDialogOpen}
          userName={fullName || user.name}
          currentAvatarUrl={avatarUrl || null}
          disabled={!canUploadPhoto}
          onAvatarUpdated={(nextUrl) => {
            setAvatarUrl(nextUrl ?? "");
            setNotice(
              nextUrl
                ? t("Profile photo updated successfully.", "Cập nhật ảnh đại diện thành công.")
                : t("Profile photo removed.", "Đã xóa ảnh đại diện."),
            );
          }}
        />
      )}

      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          if (!passwordSaving) setPasswordDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Change Password")}</DialogTitle>
            <DialogDescription>{t("Update the password you use to sign in.")}</DialogDescription>
          </DialogHeader>
          {passwordDialogOpen && (
            <ChangePasswordForm
              fullName={user.name}
              disabled={api.mode !== "backend" || update.isPending || !user.name.trim()}
              onBusyChange={setPasswordSaving}
              onCancel={() => {
                setNotice("");
                setPasswordDialogOpen(false);
              }}
              onSuccess={() => {
                setNotice("Password changed successfully.");
                setPasswordDialogOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string;
  minLength?: number;
}) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {t(label)}
      </label>
      <div className="relative mt-2">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          maxLength={100}
          autoComplete={id === "current-password" ? "current-password" : "new-password"}
          className="h-11 w-full min-w-0 pr-12"
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${id}-error` : id === "new-password" ? "password-requirements" : undefined
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full w-11"
          aria-label={t(`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`)}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </div>
  );
}

export function ChangePasswordForm({
  fullName,
  onBusyChange,
  onCancel,
  onSuccess,
  disabled = false,
}: {
  fullName: string;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onSuccess: () => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const update = useApiMutation("updateProfile");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({ current: "", next: "", confirm: "" });
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const valid =
    Boolean(current) &&
    current.length <= 100 &&
    next.length >= 6 &&
    next.length <= 100 &&
    confirm === next;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || disabled || update.isPending) return;
    setNotice("");
    const validation = {
      current: !current.length
        ? "Current Password is required."
        : current.length > 100
          ? "Current Password must be 100 characters or fewer."
          : "",
      next: !next.length
        ? "New Password is required."
        : next.length < 6 || next.length > 100
          ? "New Password must be 6–100 characters."
          : "",
      confirm: !confirm.length
        ? "Confirm New Password is required."
        : confirm !== next
          ? "New password and confirmation do not match."
          : "",
    };
    setErrors(validation);
    if (validation.current || validation.next || validation.confirm) return;
    inFlight.current = true;
    onBusyChange(true);
    try {
      await update.mutateAsync({ fullName, currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice("Password changed successfully.");
      onSuccess();
    } catch (error) {
      if (normalizeError(error).code === "PROFILE_CURRENT_PASSWORD")
        setErrors({ current: normalizeError(error).message, next: "", confirm: "" });
    } finally {
      inFlight.current = false;
      onBusyChange(false);
    }
  }
  return (
    <form noValidate onSubmit={submit} aria-busy={update.isPending} className="min-w-0 space-y-4">
      <fieldset disabled={update.isPending || disabled} className="min-w-0 space-y-4">
        <legend className="sr-only">{t("Change Password")}</legend>
        <PasswordField
          id="current-password"
          label="Current Password"
          value={current}
          error={errors.current}
          onChange={(value) => {
            setCurrent(value);
            setNotice("");
            setErrors((e) => ({ ...e, current: "" }));
            update.reset();
          }}
        />
        <PasswordField
          id="new-password"
          label="New Password"
          value={next}
          error={errors.next}
          minLength={6}
          onChange={(value) => {
            setNext(value);
            setNotice("");
            setErrors((e) => ({ ...e, next: "", confirm: "" }));
            update.reset();
          }}
        />
        <PasswordField
          id="confirm-new-password"
          label="Confirm New Password"
          value={confirm}
          error={
            errors.confirm ||
            (confirm && confirm !== next ? "New password and confirmation do not match." : "")
          }
          minLength={6}
          onChange={(value) => {
            setConfirm(value);
            setNotice("");
            setErrors((e) => ({ ...e, confirm: "" }));
            update.reset();
          }}
        />
        <p id="password-requirements" className="text-xs leading-5 text-muted-foreground">
          {t("Use 6–100 characters.")}
        </p>
      </fieldset>
      {update.error && normalizeError(update.error).code !== "PROFILE_CURRENT_PASSWORD" && (
        <ErrorState error={update.error} />
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-6"
        >
          {t(notice)}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={update.isPending || disabled}
          onClick={() => {
            if (inFlight.current) return;
            setCurrent("");
            setNext("");
            setConfirm("");
            setNotice("");
            setErrors({ current: "", next: "", confirm: "" });
            update.reset();
            onCancel();
          }}
        >
          {t("Cancel")}
        </Button>
        <Button
          type="submit"
          className="h-11 w-full sm:w-auto"
          disabled={update.isPending || disabled || !valid}
        >
          {update.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {t(update.isPending ? "Saving…" : "Save Changes")}
        </Button>
      </div>
    </form>
  );
}

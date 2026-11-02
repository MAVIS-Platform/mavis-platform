"use client";
import { useRef, useState, type FormEvent } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, LoaderCircle, UserRound } from "lucide-react";
import { useApi, useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/shared/request-state";
import { ScreenHelpTrigger } from "@/components/shared/screen-guided-tour";
import { useLocale } from "@/lib/i18n/locale-context";
import { hasPermission } from "@/lib/auth/permissions";
import { roleLabels } from "@/lib/navigation";
import { normalizeError } from "@/lib/errors/api-error";
import type { Response } from "@/lib/api/contracts";
type User = NonNullable<Response<"session">["user"]>;

export function Profile() {
  const { t } = useLocale();
  const session = useSession();
  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{t("My Profile")}</h1>
          <ScreenHelpTrigger screenId="profile" />
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t("Manage your personal information and account security.")}
        </p>
      </header>
      {session.isPending ? (
        <LoadingState label="Loading profile…" />
      ) : session.error ? (
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      ) : session.data?.user ? (
        <ProfileDetails key={session.data.user.id} user={session.data.user} />
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
  const knownServices = projectList.filter((project) => project.services !== null);
  const services = knownServices.reduce((sum, project) => sum + (project.services ?? 0), 0);
  const servicesValue =
    projectList.length === 0
      ? 0
      : knownServices.length === 0
        ? t("Not available")
        : knownServices.length < projectList.length
          ? `${services}+`
          : services;
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
    <div className="mt-4 border-t pt-4">
      <dl
        aria-label={t("Account statistics")}
        className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4"
      >
        {[
          ["Projects", value(projects, projectList.length)],
          ["Services indexed", value(projects, servicesValue)],
          ["Workspaces joined", value(workspaces, workspaces.data?.length ?? 0)],
          ["Submissions", value(submissions, submissions.data?.length ?? 0)],
        ].map(([label, amount]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs leading-5 text-muted-foreground">{t(String(label))}</dt>
            <dd className="mt-1 break-words text-sm font-semibold">{amount}</dd>
          </div>
        ))}
      </dl>
      {failed && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
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
  const { t } = useLocale();
  const api = useApi();
  const update = useApiMutation("updateProfile");
  const [fullName, setFullName] = useState(user.name);
  const [nameError, setNameError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
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
    try {
      const result = await update.mutateAsync({ fullName: fullName.trim() });
      setFullName(result.user?.name ?? fullName.trim());
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
  const parts = user.name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length > 1
      ? `${parts[0]?.charAt(0) ?? ""}${parts.at(-1)?.charAt(0) ?? ""}`.toUpperCase()
      : (parts[0]?.slice(0, 2).toUpperCase() ?? "");
  return (
    <>
      <section
        aria-label={t("Profile summary")}
        className="min-w-0 rounded-xl border bg-card p-5 sm:p-6 [overflow-wrap:anywhere]"
      >
        <div className="flex min-w-0 items-start gap-4">
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary"
          >
            {initials || <UserRound className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-semibold leading-7">
              {user.name || t("Full name not available")}
            </h2>
            <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
              {user.email || t("Email not available")}
            </p>
            <Badge variant="secondary" className="mt-2 max-w-full whitespace-normal">
              {t(roleLabels[user.role])}
            </Badge>
          </div>
        </div>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t("Account ID:")}</span>
          <code className="min-w-0 break-all font-mono">{user.id}</code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            aria-label={t("Copy Account ID")}
            onClick={() => void copyAccountId()}
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {t("Copy")}
          </Button>
        </div>
        {copyNotice && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {t(copyNotice)}
          </p>
        )}
        {hasPermission(user.role, "project:read") && <ProfileStatistics role={user.role} />}
      </section>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-6"
        >
          {t(notice)}
        </p>
      )}
      <section
        aria-labelledby="profile-information"
        className="min-w-0 rounded-xl border bg-card p-5 sm:p-6 [overflow-wrap:anywhere]"
      >
        <h2 id="profile-information" className="text-base font-semibold">
          {t("Personal Information")}
        </h2>
        <form noValidate onSubmit={saveName} className="mt-5 space-y-5">
          <div>
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
              <p id="profile-name-error" role="alert" className="mt-2 text-sm text-destructive">
                {t(nameError)}
              </p>
            )}
          </div>
          <dl className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <dt className="text-sm font-medium">{t("Email")}</dt>
              <dd className="mt-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                {user.email || t("Email not available")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-medium">{t("Role")}</dt>
              <dd className="mt-2">
                <Badge variant="secondary" className="max-w-full whitespace-normal">
                  {t(roleLabels[user.role])}
                </Badge>
              </dd>
            </div>
          </dl>
          {update.error && <ErrorState error={update.error} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              disabled={
                update.isPending ||
                passwordSaving ||
                !fullName.trim() ||
                fullName.trim().length > 255 ||
                fullName.trim() === user.name
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
      <section
        aria-labelledby="profile-security"
        className="min-w-0 rounded-xl border bg-card p-5 sm:p-6"
      >
        <div className="mb-5 flex items-start gap-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="profile-security" className="text-base font-semibold">
              {t("Account Security")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("Update the password you use to sign in.")}
            </p>
          </div>
        </div>
        <ChangePasswordForm
          fullName={user.name}
          disabled={api.mode !== "backend" || update.isPending || !user.name.trim()}
          onBusyChange={setPasswordSaving}
          onCancel={() => setNotice("")}
          onSuccess={() => setNotice("")}
        />
        {api.mode !== "backend" && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {t(
              "Password changes require a real signed-in account. They are unavailable in sample previews.",
            )}
          </p>
        )}
      </section>
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

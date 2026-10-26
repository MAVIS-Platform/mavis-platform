"use client";
import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { useApi, useApiMutation, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/shared/request-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { normalizeError } from "@/lib/errors/api-error";
import type { Response } from "@/lib/api/contracts";
type User = NonNullable<Response<"session">["user"]>;
const roles = { student: "Student", lecturer: "Lecturer", admin: "Administrator" };

export function Profile() {
  const session = useSession();
  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">My Profile</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Manage your account information and password.
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
          Sign in to view your profile.
        </p>
      )}
    </div>
  );
}

export function ProfileDetails({ user }: { user: User }) {
  const api = useApi();
  const update = useApiMutation("updateProfile");
  const [fullName, setFullName] = useState(user.name);
  const [nameError, setNameError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const savingName = useRef(false);
  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (savingName.current) return;
    if (!fullName.trim()) {
      setNameError("Full Name is required.");
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
  return (
    <>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-6"
        >
          {notice}
        </p>
      )}
      <section
        aria-labelledby="profile-information"
        className="min-w-0 rounded-xl border bg-card p-5 sm:p-6 [overflow-wrap:anywhere]"
      >
        <h2 id="profile-information" className="text-base font-semibold">
          Profile information
        </h2>
        <form noValidate onSubmit={saveName} className="mt-5 space-y-5">
          <div>
            <label htmlFor="profile-full-name" className="text-sm font-medium">
              Full Name
            </label>
            <Input
              id="profile-full-name"
              className="mt-2 w-full min-w-0"
              value={fullName}
              maxLength={255}
              required
              autoComplete="name"
              disabled={update.isPending}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "profile-name-error" : undefined}
              onChange={(e) => {
                setFullName(e.target.value);
                setNameError("");
              }}
            />
            {nameError && (
              <p id="profile-name-error" role="alert" className="mt-2 text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <dl className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <dt className="text-sm font-medium">Email</dt>
              <dd className="mt-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                {user.email || "Email not available"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-medium">Role</dt>
              <dd className="mt-2">
                <Badge variant="secondary" className="max-w-full whitespace-normal">
                  {roles[user.role]}
                </Badge>
              </dd>
            </div>
          </dl>
          {update.error && <ErrorState error={update.error} />}
          <Button
            type="submit"
            disabled={update.isPending || fullName.trim() === user.name}
            className="w-full sm:w-auto"
          >
            {update.isPending && (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            )}
            {update.isPending ? "Saving…" : "Save Profile"}
          </Button>
        </form>
      </section>
      <section aria-labelledby="profile-security" className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h2 id="profile-security" className="text-base font-semibold">
              Security
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Update the password you use to sign in.
            </p>
          </div>
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!passwordSaving) setOpen(value);
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                disabled={api.mode !== "backend" || !user.name.trim() || update.isPending}
                className="w-full shrink-0 sm:w-auto"
              >
                <KeyRound className="size-4" aria-hidden="true" />
                Change Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
                <DialogDescription>
                  Enter your current password and choose a new one.
                </DialogDescription>
              </DialogHeader>
              {open && (
                <ChangePasswordForm
                  fullName={user.name}
                  onBusyChange={setPasswordSaving}
                  onCancel={() => setOpen(false)}
                  onSuccess={() => {
                    setOpen(false);
                    setNotice("Password changed successfully.");
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
        {api.mode !== "backend" && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Password changes require a real signed-in account. They are unavailable in sample
            previews.
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
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
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
          className="pr-12"
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
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-destructive">
          {error}
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
}: {
  fullName: string;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const update = useApiMutation("updateProfile");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState({ current: "", next: "" });
  const inFlight = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const validation = {
      current: current.length ? "" : "Current Password is required.",
      next: !next.length
        ? "New Password is required."
        : next.length < 6 || next.length > 100
          ? "New Password must be 6–100 characters."
          : "",
    };
    setErrors(validation);
    if (validation.current || validation.next) return;
    inFlight.current = true;
    onBusyChange(true);
    try {
      await update.mutateAsync({ fullName, currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      onSuccess();
    } catch (error) {
      if (normalizeError(error).code === "PROFILE_CURRENT_PASSWORD")
        setErrors({ current: normalizeError(error).message, next: "" });
    } finally {
      inFlight.current = false;
      onBusyChange(false);
    }
  }
  return (
    <form noValidate onSubmit={submit} className="min-w-0 space-y-4">
      <fieldset disabled={update.isPending} className="min-w-0 space-y-4">
        <PasswordField
          id="current-password"
          label="Current Password"
          value={current}
          error={errors.current}
          onChange={(value) => {
            setCurrent(value);
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
            setErrors((e) => ({ ...e, next: "" }));
            update.reset();
          }}
        />
        <p id="password-requirements" className="text-xs leading-5 text-muted-foreground">
          Use 6–100 characters.
        </p>
      </fieldset>
      {update.error && normalizeError(update.error).code !== "PROFILE_CURRENT_PASSWORD" && (
        <ErrorState error={update.error} />
      )}
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" disabled={update.isPending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {update.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

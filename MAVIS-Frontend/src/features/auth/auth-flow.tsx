"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LoaderCircle, CheckCircle2 } from "lucide-react";
import { MavisLogo } from "@/components/mavis-logo";
import { LoginBackground } from "./login-background";
import { useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppearanceSelector } from "@/components/appearance-selector";
import { ErrorState } from "@/components/shared/request-state";
import { VerificationCodeInput } from "./verification-code-input";
import { isCompleteVerificationCode } from "@/lib/auth/verification-code";
import { normalizeError } from "@/lib/errors/api-error";
import { useLocale } from "@/lib/i18n/locale-context";
export function AuthFlow({
  flow,
}: {
  flow: "register" | "verify" | "forgot-password" | "reset-password";
}) {
  const params = useSearchParams();
  const router = useRouter();
  const { t } = useLocale();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState(
    flow === "reset-password"
      ? "If this email is registered, you will receive a password reset code."
      : "",
  );
  const [validation, setValidation] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const register = useApiMutation("register");
  const verify = useApiMutation("verifyEmail");
  const resend = useApiMutation("resendOtp");
  const forgot = useApiMutation("forgotPassword");
  const reset = useApiMutation("resetPassword");
  const current =
    flow === "register"
      ? register
      : flow === "verify"
        ? verify
        : flow === "forgot-password"
          ? forgot
          : reset;
  const busy = current.isPending || resend.isPending || forgot.isPending;
  const needsCode = flow === "verify" || flow === "reset-password";
  const title = {
    register: "Create your account",
    verify: "Verify your email",
    "forgot-password": "Forgot your password?",
    "reset-password": "Set a new password",
  }[flow];
  const description = {
    register: "Start exploring architecture with a verified MAVIS account.",
    verify: "Enter the code from your verification email.",
    "forgot-password": "Enter your account email to request a reset code.",
    "reset-password": "Use your reset code to choose a new password.",
  }[flow];
  async function submit() {
    if (submitting.current || busy) return;
    if (needsCode && !isCompleteVerificationCode(otp)) {
      setValidation("Enter exactly six digits.");
      return;
    }
    if (
      ["register", "reset-password"].includes(flow) &&
      (password.length < 6 || password !== confirm)
    ) {
      setValidation(
        password !== confirm ? "Passwords do not match." : "Use at least 6 characters.",
      );
      return;
    }
    submitting.current = true;
    setValidation("");
    setMessage("");
    try {
      if (flow === "register") {
        await register.mutateAsync({ email, fullName: name, password });
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
      } else if (flow === "verify") {
        await verify.mutateAsync({ email, otpCode: otp });
        router.replace("/login?verified=1");
      } else if (flow === "forgot-password") {
        await forgot.mutateAsync({ email });
        router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`);
      } else {
        await reset.mutateAsync({ email, otpCode: otp, newPassword: password });
        setPassword("");
        setConfirm("");
        router.replace("/login?reset=1");
      }
    } catch (error) {
      const failure = normalizeError(error);
      if (failure.code?.startsWith("AUTH_CODE_") || failure.code?.startsWith("AUTH_RESET_"))
        setOtp("");
      if (failure.kind === "rate-limit") setCooldown(failure.retryAfter ?? 30);
    } finally {
      submitting.current = false;
    }
  }
  async function requestAnotherCode() {
    if (submitting.current || busy || cooldown > 0 || !email.trim()) return;
    submitting.current = true;
    setMessage("");
    try {
      if (flow === "verify") await resend.mutateAsync({ email });
      else await forgot.mutateAsync({ email });
      setOtp("");
      setMessage(
        flow === "verify"
          ? "If this email needs verification, you will receive a new code."
          : "If this email is registered, you will receive a password reset code.",
      );
      setCooldown(30);
    } catch (error) {
      const failure = normalizeError(error);
      if (failure.kind === "rate-limit") setCooldown(failure.retryAfter ?? 30);
    } finally {
      submitting.current = false;
    }
  }
  return (
    <div className="relative isolate min-h-svh bg-background px-6 py-6">
      <LoginBackground />
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/login" className="flex items-center gap-3 font-bold tracking-widest">
          <MavisLogo />
        </Link>
        <AppearanceSelector />
      </header>
      <main className="mx-auto mt-12 w-full max-w-md rounded-2xl border bg-card p-7 sm:mt-20 sm:p-10">
        <Link
          href="/login"
          className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} />
          Back to sign in
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mb-7 mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void submit();
          }}
        >
          {flow === "register" && (
            <label className="block space-y-2 text-sm font-medium">
              <span>Full name</span>
              <Input
                required
                autoComplete="name"
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="block space-y-2 text-sm font-medium">
            <span>Email address</span>
            <Input
              required
              type="email"
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {needsCode && (
            <VerificationCodeInput
              value={otp}
              onChange={(value) => {
                setOtp(value);
                setValidation("");
              }}
              disabled={busy}
              autoFocus={Boolean(params.get("email"))}
            />
          )}
          {["register", "reset-password"].includes(flow) && (
            <>
              <label className="block space-y-2 text-sm font-medium">
                <span>{flow === "register" ? "Password" : "New password"}</span>
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">{t("Use at least 6 characters.")}</p>
              <label className="block space-y-2 text-sm font-medium">
                <span>Confirm password</span>
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={confirm}
                  disabled={busy}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              {confirm && confirm !== password && (
                <p role="alert" className="text-sm text-destructive">
                  Passwords do not match.
                </p>
              )}
            </>
          )}
          {current.isError && <ErrorState error={current.error} />}
          {validation && (
            <p role="alert" className="text-sm text-destructive">
              {t(validation)}
            </p>
          )}
          {flow === "forgot-password" && cooldown > 0 && (
            <p role="status" className="text-xs text-muted-foreground">
              {t("Request another code in")} {cooldown}s
            </p>
          )}
          <Button
            className="h-12 w-full"
            disabled={
              busy ||
              (needsCode && !isCompleteVerificationCode(otp)) ||
              (flow === "forgot-password" && cooldown > 0) ||
              (["register", "reset-password"].includes(flow) && password !== confirm)
            }
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            {busy
              ? "Please wait…"
              : flow === "register"
                ? "Create account"
                : flow === "verify"
                  ? "Verify email"
                  : flow === "forgot-password"
                    ? "Send reset code"
                    : "Reset password"}
          </Button>
        </form>
        {needsCode && (
          <div className="mt-5">
            <Button
              variant="link"
              disabled={busy || cooldown > 0 || !email.trim()}
              onClick={() => void requestAnotherCode()}
            >
              {cooldown > 0
                ? `${t("Request another code in")} ${cooldown}s`
                : busy
                  ? t("Requesting…")
                  : t(
                      flow === "verify" ? "Resend verification code" : "Resend password reset code",
                    )}
            </Button>
            {resend.isError && <ErrorState error={resend.error} />}
            {flow === "reset-password" && forgot.isError && <ErrorState error={forgot.error} />}
          </div>
        )}
        {message && (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} />
            {t(message)}
          </p>
        )}
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Codes are delivered to your email. If nothing arrives, your workspace administrator should
          check SMTP configuration.
        </p>
      </main>
    </div>
  );
}

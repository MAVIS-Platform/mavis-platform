"use client";
import Link from "next/link";
import { loginDestination } from "@/lib/auth/login-destination";
import { SocialSignIn } from "@/features/auth/social-sign-in";
import { LoginBackground } from "@/features/auth/login-background";
import { normalizeError, publicErrorCode, publicErrors } from "@/lib/errors/api-error";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  GitBranch,
  Layers3,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppearanceSelector } from "@/components/appearance-selector";
import { LocaleSwitchButton, useLocale } from "@/lib/i18n/locale-context";
import { MavisLogo } from "@/components/mavis-logo";
import { ErrorState } from "@/components/shared/request-state";
import type { AppRole } from "@/types/domain";
export default function LoginPage() {
  const { t } = useLocale();
  const api = useApi();
  const login = useApiMutation("mockLogin");
  const real = useApiMutation("signIn");
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);
  const finish = async (session: { user: { role: AppRole } | null }) => {
    await client.cancelQueries();
    client.clear();
    client.setQueryData(["api", "session", {}], session);
    const nextParam = params.get("next");
    const destination = await loginDestination(nextParam, session.user?.role ?? "student", api);
    if (!nextParam && session.user?.role === "lecturer" && destination === "/workspaces") {
      try {
        const list = await api.execute("workspaces", {});
        const javaCourse = list.find((w) => w.code === "JAVA-MS-2026");
        if (javaCourse?.id) {
          router.replace(`/workspace-overview?workspace=${encodeURIComponent(javaCourse.id)}`);
          return;
        }
      } catch {
        /* Fallback to default /workspaces landing route. */
      }
    }
    router.replace(destination);
  };
  async function sample(role: AppRole) {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await finish(await login.mutateAsync({ role }));
    } catch {
      /* Error is shown below. */
    } finally {
      submitting.current = false;
    }
  }
  async function signInWith(targetEmail: string, targetPassword: string) {
    if (submitting.current) return;
    setEmail(targetEmail);
    setPassword(targetPassword);
    submitting.current = true;
    try {
      const session = await real.mutateAsync({ email: targetEmail.trim(), password: targetPassword });
      setPassword("");
      await finish(session);
    } catch {
      /* Keep input for correction. */
    } finally {
      submitting.current = false;
    }
  }
  async function signIn() {
    await signInWith(email, password);
  }
  return (
    <div className="relative isolate flex min-h-svh flex-col bg-background text-foreground">
      <LoginBackground />
      <header className="mx-auto flex w-full max-w-7xl shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 rounded-lg transition-opacity hover:opacity-90"
            aria-label={t("MAVIS home", "Trang chủ MAVIS")}
          >
            <MavisLogo className="h-11 w-11 shrink-0" />
            <div className="min-w-0 max-w-sm">
              <span className="block text-xs font-semibold leading-5 text-foreground sm:text-sm">
                {t(
                  "AI-Assisted Microservices Architecture Visualization and Change Impact Analysis",
                  "Nền tảng Trực quan hóa Kiến trúc Microservices & Phân tích Tác động Thay đổi ứng dụng AI",
                )}
              </span>
            </div>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button asChild variant="ghost" size="sm" className="hidden gap-1.5 sm:inline-flex">
            <Link href="/">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {t("Back to home", "Quay lại trang chủ")}
            </Link>
          </Button>
          <LocaleSwitchButton />
          <AppearanceSelector />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 px-4 py-3 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <section className="hidden self-center lg:block">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {t("MAVIS Studio 3D · Live Docker & OpenTelemetry", "MAVIS Studio 3D · Docker thật & OpenTelemetry")}
          </div>
          <h1 className="max-w-lg text-4xl font-bold leading-[1.15] tracking-tight text-foreground">
            {t("Visualize services in 3D.", "Trực quan hóa hệ thống 3D.")}
            <br />
            <span className="text-primary">
              {t("Prove real change impact.", "Kiểm chứng tác động thực.")}
            </span>
          </h1>
          <p className="mt-3.5 max-w-lg text-sm leading-6 text-foreground/80">
            {t(
              "Run real Docker microservice stacks, stream live OpenTelemetry traces, and verify fault propagation directly on an interactive 3D stage.",
              "Vận hành cụm microservice trên Docker thật, quan sát OpenTelemetry trực tiếp và kiểm chứng lan truyền sự cố ngay trên sân khấu 3D tương tác.",
            )}
          </p>
          <StudioStagePreview />
          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-5">
            {[
              {
                icon: Layers3,
                title: t("Explore", "Khám phá"),
                text: t("Static C1–C3 & AI", "Kiến trúc tĩnh C1–C3 & AI"),
              },
              {
                icon: GitBranch,
                title: t("Explain", "Giải thích"),
                text: t("Theory & Module Quiz", "Lý thuyết & Trắc nghiệm"),
              },
              {
                icon: ShieldCheck,
                title: t("Experience", "Trải nghiệm"),
                text: t("Live Docker Studio", "MAVIS Studio Docker thật"),
              },
            ].map((item) => (
              <div key={item.title}>
                <span className="mb-2 inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="size-4" />
                </span>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 text-[13px] text-foreground/75">{item.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section
          className="mx-auto w-full min-w-0 max-w-md rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8"
          aria-labelledby="login-title"
        >
          <div className="mb-6">
            <h2 id="login-title" className="text-balance text-2xl font-bold tracking-tight text-foreground">
              {t("Sign in", "Đăng nhập")}
            </h2>
            <p className="mt-1.5 text-sm text-foreground/75">
              {t("Continue to MAVIS.", "Tiếp tục vào MAVIS.")}
            </p>
          </div>
          {(() => {
            const oauthCode = publicErrorCode(params.get("oauthError"));
            if (!oauthCode) return null;
            return (
              <div
                role="alert"
                className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive"
              >
                {t(publicErrors[oauthCode])}
              </div>
            );
          })()}
          {(params.get("signedOut") === "1" ||
            params.get("verified") === "1" ||
            params.get("reset") === "1") && (
            <div
              role="status"
              className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-3 text-sm"
            >
              <Check size={16} className="shrink-0 text-primary" />
              {params.get("verified") === "1"
                ? t(
                    "Email verified. You can sign in now.",
                    "Email đã được xác minh. Bạn có thể đăng nhập ngay.",
                  )
                : params.get("reset") === "1"
                  ? t(
                      "Password updated. Sign in with your new password.",
                      "Mật khẩu đã được cập nhật. Hãy đăng nhập với mật khẩu mới.",
                    )
                  : t("You’re signed out.", "Bạn đã đăng xuất.")}
            </div>
          )}
          {api.mode === "mock" ? (
            <div className="space-y-4">
              <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                Sample preview · chọn nhanh 1 trong 3 tài khoản mẫu (1-Click):
              </p>
              <div className="grid gap-2">
                {([
                  {
                    role: "lecturer" as const,
                    label: "👨‍🏫 Giảng viên Java · gv.java@mavis.edu.vn",
                    hint: "Sở hữu môn JAVA-MS-2026 (6 Chương · Quiz · Tự luận · Passkey JAVA2026)",
                  },
                  {
                    role: "student" as const,
                    label: "🎓 Sinh viên Java · sv.java@mavis.edu.vn",
                    hint: "Đã ghi danh JAVA-MS-2026 · Học tuần tự 6 Chương",
                  },
                  {
                    role: "admin" as const,
                    label: "🛡️ Quản trị viên · admin@mavis.edu.vn",
                    hint: "Quản lý tài khoản, phân quyền & cấu hình hệ thống",
                  },
                ]).map((item) => (
                  <Button
                    key={item.role}
                    type="button"
                    variant="outline"
                    className="h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left"
                    disabled={login.isPending}
                    onClick={() => void sample(item.role)}
                  >
                    <span className="font-semibold text-foreground">{item.label}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">{item.hint}</span>
                  </Button>
                ))}
              </div>
              {login.isError && <ErrorState error={login.error} />}
            </div>
          ) : (
            <form
              method="post"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!real.isPending) void signIn();
              }}
              aria-busy={real.isPending}
            >
              <div className="space-y-2">
                <label htmlFor="login-email" className="text-sm font-semibold text-foreground">
                  Email 
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/60" />
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder="you@example.com"
                    className="h-11 border-border bg-background/60 pl-10 text-foreground"
                    value={email}
                    disabled={real.isPending}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="login-password" className="text-sm font-semibold text-foreground">
                  {t("Password", "Mật khẩu")}
                </label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder={t("Enter your password", "Nhập mật khẩu của bạn")}
                    className="h-11 border-border bg-background/60 pr-12 text-foreground"
                    value={password}
                    disabled={real.isPending}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-foreground/65 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={
                      showPassword
                        ? t("Hide password", "Ẩn mật khẩu")
                        : t("Show password", "Hiện mật khẩu")
                    }
                    aria-pressed={showPassword}
                    disabled={real.isPending}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <Link
                  href="/auth/forgot-password"
                  className="text-[13px] font-semibold text-primary hover:underline"
                >
                  {t("Forgot password?", "Quên mật khẩu?")}
                </Link>
              </div>
              {real.isError && (
                <div className="space-y-2">
                  <ErrorState error={real.error} />
                  {normalizeError(real.error).code === "LOGIN_VERIFICATION" && (
                    <p className="text-center text-[13px] text-foreground/75">
                      <Link
                        href={
                          email.trim()
                            ? `/auth/verify?email=${encodeURIComponent(email.trim())}`
                            : "/auth/verify"
                        }
                        className="font-semibold text-primary hover:underline"
                      >
                        {t("Verify your email now →", "Xác minh email ngay →")}
                      </Link>
                    </p>
                  )}
                </div>
              )}
              <Button
                className="h-11 w-full rounded-xl text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
                disabled={real.isPending}
                type="submit"
              >
                {real.isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    {t("Signing in…", "Đang đăng nhập…")}
                  </>
                ) : (
                  <>
                    {t("Sign in", "Đăng nhập")}
                    <ArrowRight size={17} />
                  </>
                )}
              </Button>
            </form>
          )}
          {api.mode === "backend" && (
            <>
              <SocialSignIn onSignedIn={finish} nextPath={params.get("next")} />
              <p className="mt-6 text-center text-[13px] text-foreground/75">
                {t("No account?", "Chưa có tài khoản?")}{" "}
                <Link href="/auth/register" className="font-semibold text-primary hover:underline">
                  {t("Sign up", "Đăng ký")}
                </Link>
              </p>
            </>
          )}
        </section>
      </main>
      <footer className="shrink-0 px-4 py-3 text-center text-xs font-medium text-foreground/65">
        {t(
          "MAVIS · Microservices Architecture Visualization",
          "MAVIS · Trực quan hóa Kiến trúc Microservices",
        )}
      </footer>
    </div>
  );
}
function StudioStagePreview() {
  const { t } = useLocale();
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-border/90 bg-card/95 shadow-lg">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-3.5 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground/90">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span>{t("MAVIS Studio 3D · Live Runtime", "MAVIS Studio 3D · Thực hành trực tiếp")}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-foreground/70">
          <span className="rounded border border-border bg-background/70 px-1.5 py-0.5">Docker</span>
          <span className="rounded border border-border bg-background/70 px-1.5 py-0.5">OTel</span>
          <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">
            SHA-256
          </span>
        </div>
      </div>

      {/* Real MAVIS Studio 3D stage (Gateway -> Services -> Database), tag-free and enlarged */}
      <div className="relative aspect-[16/10.5] w-full overflow-hidden bg-slate-100 dark:bg-[#070d1a]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/homepage/login-studio-light.webp"
          alt={t(
            "Real MAVIS Studio 3D stage showing API Gateway, microservices, and database in light theme",
            "Sân khấu 3D thật của MAVIS Studio hiển thị API Gateway, microservices và database ở chế độ sáng",
          )}
          className="block h-full w-full object-cover object-center dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/homepage/login-studio-dark.webp"
          alt={t(
            "Real MAVIS Studio 3D stage showing API Gateway, microservices, and database in dark theme",
            "Sân khấu 3D thật của MAVIS Studio hiển thị API Gateway, microservices và database ở chế độ tối",
          )}
          className="hidden h-full w-full object-cover object-center dark:block"
        />
      </div>
    </figure>
  );
}

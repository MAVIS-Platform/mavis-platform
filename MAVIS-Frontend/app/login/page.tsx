"use client";
import Link from "next/link";
import { loginDestination } from "@/lib/auth/login-destination";
import { SocialSignIn } from "@/features/auth/social-sign-in";
import { LoginBackground } from "@/features/auth/login-background";
import { publicErrorCode, publicErrors } from "@/lib/errors/api-error";
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
              {real.isError && <ErrorState error={real.error} />}
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
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-foreground/75">
                <span>
                  {t("No account?", "Chưa có tài khoản?")}{" "}
                  <Link href="/auth/register" className="font-semibold text-primary hover:underline">
                    {t("Sign up", "Đăng ký")}
                  </Link>
                </span>
                <span aria-hidden="true">·</span>
                <Link href="/auth/verify" className="font-semibold text-primary hover:underline">
                  {t("Verify email", "Xác minh email")}
                </Link>
              </div>
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

      {/* Clean, tab-free isometric 3D microservice stage illustration */}
      <div className="relative w-full bg-gradient-to-br from-slate-50 via-sky-50/40 to-indigo-50/40 px-2 py-1 dark:from-[#070d1a] dark:via-[#0b1426] dark:to-[#0f172a]">
        <svg
          viewBox="0 0 540 285"
          className="h-auto w-full select-none"
          fill="none"
          role="img"
          aria-label={t(
            "Clean isometric 3D illustration of MAVIS Studio showing api-gateway, order-service, payment-service (paused), catalog-service and notification-worker with Change Impact propagation",
            "Minh họa sân khấu 3D MAVIS Studio với các khối microservice và đường lan truyền sự cố từ payment-service ngược lên order-service và api-gateway",
          )}
        >
          <defs>
            <linearGradient id="mavis-deck-light" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="mavis-deck-dark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.94" />
            </linearGradient>
            <filter id="mavis-glow-amber" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="mavis-glow-rose" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Isometric Deck Platform (Light / Dark) */}
          <polygon
            points="270,22 508,136 270,262 32,136"
            className="fill-[url(#mavis-deck-light)] stroke-slate-300/90 dark:fill-[url(#mavis-deck-dark)] dark:stroke-slate-700/80"
            strokeWidth="1.2"
          />
          {/* Subtle 3D deck thickness */}
          <polygon
            points="32,136 270,262 270,271 32,145"
            className="fill-slate-300/80 dark:fill-slate-900"
          />
          <polygon
            points="270,262 508,136 508,145 270,271"
            className="fill-slate-200/90 dark:fill-slate-800/90"
          />

          {/* Subtle Isometric Grid Lines */}
          <g className="stroke-slate-300/45 dark:stroke-slate-700/35" strokeWidth="0.75">
            <line x1="151" y1="79" x2="389" y2="199" />
            <line x1="210" y1="50" x2="448" y2="168" />
            <line x1="92" y1="108" x2="330" y2="230" />
            <line x1="389" y1="79" x2="151" y2="199" />
            <line x1="330" y1="50" x2="92" y2="168" />
            <line x1="448" y1="108" x2="210" y2="230" />
          </g>

          {/* Inner Docker Network Zone Dashed Outline */}
          <polygon
            points="286,52 466,138 286,232 132,150"
            className="fill-indigo-500/[0.04] stroke-indigo-400/50 dark:fill-indigo-400/[0.06] dark:stroke-indigo-400/40"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Healthy Call Arcs (Green / Emerald) */}
          <path
            d="M 224 140 Q 252 178 274 196"
            className="stroke-emerald-500/85 dark:stroke-emerald-400/85"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M 244 128 Q 292 106 320 96"
            className="stroke-emerald-500/85 dark:stroke-emerald-400/85"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Change Impact Propagation Arcs (Amber -> Rose) */}
          <path
            d="M 136 124 Q 170 102 204 124"
            stroke="#f59e0b"
            strokeWidth="2.4"
            strokeDasharray="6 4"
            strokeLinecap="round"
            filter="url(#mavis-glow-amber)"
          />
          <path
            d="M 248 136 Q 312 114 368 144"
            stroke="#f43f5e"
            strokeWidth="2.6"
            strokeDasharray="6 4"
            strokeLinecap="round"
            filter="url(#mavis-glow-rose)"
          />

          {/* Node 1: api-gateway (Upstream Impacted - Amber) */}
          <g transform="translate(114, 128)">
            <ellipse cx="0" cy="14" rx="28" ry="12" fill="#f59e0b" opacity="0.22" />
            <polygon points="0,-16 26,-4 0,8 -26,-4" className="fill-amber-100 stroke-amber-500 dark:fill-amber-950/90 dark:stroke-amber-400" strokeWidth="1.4" />
            <polygon points="-26,-4 0,8 0,20 -26,8" className="fill-amber-200/90 stroke-amber-500/80 dark:fill-amber-900/80 dark:stroke-amber-500/70" strokeWidth="1" />
            <polygon points="0,8 26,-4 26,8 0,20" className="fill-amber-300/80 stroke-amber-500/80 dark:fill-amber-800/80 dark:stroke-amber-500/70" strokeWidth="1" />
            <rect x="-42" y="-38" width="84" height="17" rx="8.5" className="fill-white/95 stroke-amber-400 dark:fill-slate-900/95 dark:stroke-amber-400/80" strokeWidth="1.1" />
            <text x="0" y="-26.5" textAnchor="middle" fontFamily="monospace" fontSize="8.8" fontWeight="700" className="fill-amber-800 dark:fill-amber-300">
              api-gateway
            </text>
          </g>

          {/* Node 2: order-service (Scaled x2, Upstream Impacted - Amber) */}
          <g transform="translate(226, 134)">
            <ellipse cx="0" cy="16" rx="34" ry="14" fill="#f59e0b" opacity="0.22" />
            {/* Second replica subtle stacked layer */}
            <polygon points="-28,0 0,13 28,0 28,8 0,21 -28,8" className="fill-amber-300/50 dark:fill-amber-900/50" />
            <polygon points="0,-20 30,-6 0,8 -30,-6" className="fill-amber-100 stroke-amber-500 dark:fill-amber-950/95 dark:stroke-amber-400" strokeWidth="1.5" />
            <polygon points="-30,-6 0,8 0,22 -30,8" className="fill-amber-200/90 stroke-amber-500/80 dark:fill-amber-900/85 dark:stroke-amber-500/70" strokeWidth="1" />
            <polygon points="0,8 30,-6 30,8 0,22" className="fill-amber-300/80 stroke-amber-500/80 dark:fill-amber-800/85 dark:stroke-amber-500/70" strokeWidth="1" />
            <rect x="-50" y="-42" width="100" height="17" rx="8.5" className="fill-white/95 stroke-amber-400 dark:fill-slate-900/95 dark:stroke-amber-400/80" strokeWidth="1.1" />
            <text x="0" y="-30.5" textAnchor="middle" fontFamily="monospace" fontSize="8.8" fontWeight="700" className="fill-amber-800 dark:fill-amber-300">
              order-service ×2
            </text>
          </g>

          {/* Node 3: payment-service (Fault Target - Rose PAUSED) */}
          <g transform="translate(384, 148)">
            <ellipse cx="0" cy="16" rx="35" ry="15" fill="#f43f5e" opacity="0.28" filter="url(#mavis-glow-rose)" />
            <polygon points="0,-18 28,-5 0,8 -28,-5" className="fill-rose-100 stroke-rose-500 dark:fill-rose-950/95 dark:stroke-rose-400" strokeWidth="1.6" />
            <polygon points="-28,-5 0,8 0,20 -28,7" className="fill-rose-200/90 stroke-rose-500/80 dark:fill-rose-900/85 dark:stroke-rose-500/70" strokeWidth="1" />
            <polygon points="0,8 28,-5 28,7 0,20" className="fill-rose-300/85 stroke-rose-500/80 dark:fill-rose-800/85 dark:stroke-rose-500/70" strokeWidth="1" />
            {/* Pause bars icon on top face */}
            <rect x="-4" y="-9" width="2.8" height="7" rx="1" className="fill-rose-600 dark:fill-rose-300" />
            <rect x="1.5" y="-9" width="2.8" height="7" rx="1" className="fill-rose-600 dark:fill-rose-300" />
            <rect x="-56" y="-40" width="112" height="17" rx="8.5" className="fill-rose-50 stroke-rose-400 dark:fill-rose-950/95 dark:stroke-rose-400/80" strokeWidth="1.1" />
            <text x="0" y="-28.5" textAnchor="middle" fontFamily="monospace" fontSize="8.6" fontWeight="700" className="fill-rose-700 dark:fill-rose-300">
              payment · PAUSED
            </text>
          </g>

          {/* Node 4: catalog-service (Healthy - Blue/Sky) */}
          <g transform="translate(332, 86)">
            <ellipse cx="0" cy="12" rx="24" ry="10" fill="#0ea5e9" opacity="0.16" />
            <polygon points="0,-14 23,-3 0,8 -23,-3" className="fill-sky-50 stroke-sky-400 dark:fill-slate-800 dark:stroke-sky-400/80" strokeWidth="1.3" />
            <polygon points="-23,-3 0,8 0,18 -23,7" className="fill-sky-100 stroke-sky-300 dark:fill-slate-900 dark:stroke-sky-500/50" strokeWidth="1" />
            <polygon points="0,8 23,-3 23,7 0,18" className="fill-sky-200/80 stroke-sky-300 dark:fill-slate-800/90 dark:stroke-sky-500/50" strokeWidth="1" />
            <rect x="-46" y="-35" width="92" height="16" rx="8" className="fill-white/95 stroke-slate-300 dark:fill-slate-900/95 dark:stroke-sky-400/50" strokeWidth="1" />
            <text x="0" y="-24" textAnchor="middle" fontFamily="monospace" fontSize="8.4" fontWeight="700" className="fill-slate-700 dark:fill-sky-200">
              catalog-service
            </text>
          </g>

          {/* Node 5: notification-worker (Healthy - Indigo/Violet) */}
          <g transform="translate(278, 202)">
            <ellipse cx="0" cy="12" rx="26" ry="10" fill="#6366f1" opacity="0.16" />
            <polygon points="0,-14 25,-3 0,8 -25,-3" className="fill-indigo-50 stroke-indigo-400 dark:fill-slate-800 dark:stroke-indigo-400/80" strokeWidth="1.3" />
            <polygon points="-25,-3 0,8 0,18 -25,7" className="fill-indigo-100 stroke-indigo-300 dark:fill-slate-900 dark:stroke-indigo-500/50" strokeWidth="1" />
            <polygon points="0,8 25,-3 25,7 0,18" className="fill-indigo-200/80 stroke-indigo-300 dark:fill-slate-800/90 dark:stroke-indigo-500/50" strokeWidth="1" />
            <rect x="-54" y="21" width="108" height="16" rx="8" className="fill-white/95 stroke-slate-300 dark:fill-slate-900/95 dark:stroke-indigo-400/50" strokeWidth="1" />
            <text x="0" y="32" textAnchor="middle" fontFamily="monospace" fontSize="8.3" fontWeight="700" className="fill-slate-700 dark:fill-indigo-200">
              notification-worker
            </text>
          </g>

          {/* Clean floating telemetry callout badge */}
          <g transform="translate(306, 125)">
            <rect x="-32" y="-9" width="64" height="17" rx="8.5" className="fill-rose-600 dark:fill-rose-500" />
            <text x="0" y="2.5" textAnchor="middle" fontFamily="monospace" fontSize="8.2" fontWeight="700" fill="#ffffff">
              Impact Path
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-3.5 py-2 text-[11px] text-foreground/75">
        <span>
          {t(
            "Change Impact · Scale-Out · Outage Recovery · CPU Throttle",
            "Phân tích ảnh hưởng · Scale-Out · Khôi phục sự cố · Giới hạn CPU",
          )}
        </span>
        <span className="font-mono text-[10px] font-semibold text-primary">2D / 3D</span>
      </figcaption>
    </figure>
  );
}

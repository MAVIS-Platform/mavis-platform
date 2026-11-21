"use client";
import Link from "next/link";
import { loginDestination } from "@/lib/auth/login-destination";
import { SocialSignIn } from "@/features/auth/social-sign-in";
import { LoginBackground } from "@/features/auth/login-background";
import { publicErrorCode, publicErrors } from "@/lib/errors/api-error";
import { useId, useRef, useState } from "react";
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
import { networkBadge, networkColor } from "@/features/architecture/cytoscape-network";
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
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.18] tracking-tight">
            {t("Understand your services.", "Hiểu rõ các service của bạn.")}
            <br />
            <span className="text-primary">
              {t("See the connections.", "Xem các mối liên kết.")}
            </span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            {t(
              "Explore your architecture, trace dependencies, and make changes with the source evidence in view.",
              "Khám phá kiến trúc, lần theo các phụ thuộc và kiểm chứng tác động thay đổi với bằng chứng mã nguồn rõ ràng.",
            )}
          </p>
          <ArchitecturePreview />
          <div className="mt-7 grid grid-cols-3 gap-4 border-t pt-6">
            {[
              {
                icon: Layers3,
                title: t("Explore", "Khám phá"),
                text: t("Static C1–C3 & AI", "Kiến trúc tĩnh C1–C3 & AI"),
              },
              {
                icon: GitBranch,
                title: t("Explain", "Giải thích"),
                text: t("Theory & Quiz Gate", "Lý thuyết & Quiz Gate"),
              },
              {
                icon: ShieldCheck,
                title: t("Experience", "Trải nghiệm"),
                text: t("Live Docker Studio", "MAVIS Studio Docker thật"),
              },
            ].map((item) => (
              <div key={item.title}>
                <item.icon className="mb-2 size-4 text-primary" />
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section
          className="mx-auto w-full min-w-0 max-w-md rounded-2xl border border-border/80 bg-card p-6 sm:p-8"
          aria-labelledby="login-title"
        >
          <div className="mb-6">
            <h2 id="login-title" className="text-balance text-2xl font-semibold tracking-tight">
              {t("Sign in", "Đăng nhập")}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
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
                <label htmlFor="login-email" className="text-sm font-medium">
                  Email 
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder="you@example.com"
                    className="h-11 pl-10"
                    value={email}
                    disabled={real.isPending}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="login-password" className="text-sm font-medium">
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
                    className="h-11 pr-12"
                    value={password}
                    disabled={real.isPending}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  className="text-xs font-medium text-primary hover:underline"
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
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t("No account?", "Chưa có tài khoản?")}{" "}
                  <Link href="/auth/register" className="font-medium text-primary hover:underline">
                    {t("Sign up", "Đăng ký")}
                  </Link>
                </span>
                <span aria-hidden="true">·</span>
                <Link href="/auth/verify" className="font-medium text-primary hover:underline">
                  {t("Verify email", "Xác minh email")}
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
      <footer className="shrink-0 px-4 py-3 text-center text-xs text-muted-foreground">
        {t(
          "MAVIS · Microservices Architecture Visualization",
          "MAVIS · Trực quan hóa Kiến trúc Microservices",
        )}
      </footer>
    </div>
  );
}
function ArchitecturePreview() {
  const markerId = useId();
  const services = "SERVICE_CONTAINER";
  const database = "DATABASE";
  const nodes = [
    { name: "api-gateway", x: 54, y: 108, radius: 11, type: services },
    { name: "orders", x: 180, y: 62, radius: 14, type: services },
    { name: "inventory", x: 180, y: 157, radius: 12, type: services },
    { name: "payments", x: 300, y: 105, radius: 12, type: services },
    { name: "orders-db", x: 300, y: 24, radius: 9, type: database },
    { name: "inventory-db", x: 300, y: 201, radius: 9, type: database },
    { name: "payments-db", x: 423, y: 105, radius: 9, type: database },
  ];
  const edges = [
    { path: "M65 104 Q105 45 164 62", declared: false },
    { path: "M64 114 Q104 170 166 157", declared: true },
    { path: "M194 66 Q240 65 286 101", declared: false },
    { path: "M192 153 Q243 153 287 111", declared: true },
    { path: "M190 51 Q231 18 289 24", declared: false },
    { path: "M192 163 Q237 207 289 201", declared: false },
    { path: "M314 105 L412 105", declared: false },
  ];
  return (
    <figure className="mt-6 rounded-xl border border-border/60 bg-card/40 p-4">
      <figcaption className="mb-2 text-xs font-medium text-muted-foreground">
        Illustrative dependency graph
      </figcaption>
      <svg
        viewBox="0 0 500 245"
        className="w-full opacity-80"
        fill="none"
        role="img"
        aria-label="Sample dependency graph: API gateway, orders, inventory and payments services connected to their databases"
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10Z" fill={networkColor(services)} />
          </marker>
        </defs>
        {edges.map((edge) => (
          <path
            key={edge.path}
            d={edge.path}
            stroke={networkColor(services)}
            strokeWidth="1.4"
            strokeOpacity="0.7"
            strokeDasharray={edge.declared ? "5 4" : undefined}
            markerEnd={`url(#${markerId})`}
          />
        ))}
        {nodes.map((n) => (
          <g key={n.name}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.radius}
              fill={networkColor(n.type)}
              className="stroke-foreground"
              strokeWidth="1.3"
            />
            <text
              x={n.x}
              y={n.y + n.radius + 16}
              className="fill-foreground"
              fontSize="10"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {networkBadge(n.type)} {n.name}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

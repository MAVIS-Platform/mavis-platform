"use client";
import Link from "next/link";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  GitBranch,
  Hexagon,
  Layers3,
  LoaderCircle,
  Mail,
  Network,
  ShieldCheck,
} from "lucide-react";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppearanceSelector } from "@/components/appearance-selector";
import { ErrorState } from "@/components/shared/request-state";
import type { AppRole } from "@/types/domain";
export default function LoginPage() {
  const api = useApi();
  const login = useApiMutation("mockLogin");
  const real = useApiMutation("signIn");
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const finish = async (session: { user: { role: AppRole } | null }) => {
    await client.cancelQueries();
    client.clear();
    client.setQueryData(["api", "session", {}], session);
    router.replace(
      api.mode === "backend"
        ? "/"
        : session.user?.role === "admin"
          ? "/administration/users"
          : session.user?.role === "lecturer"
            ? "/workspaces"
            : "/",
    );
  };
  async function sample(role: AppRole) {
    try {
      await finish(await login.mutateAsync({ role }));
    } catch {
      /* Error is shown below. */
    }
  }
  async function signIn() {
    try {
      const session = await real.mutateAsync({ email: email.trim(), password });
      setPassword("");
      await finish(session);
    } catch {
      /* Keep input for correction. */
    }
  }
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Hexagon size={23} strokeWidth={1.7} />
          </span>
          <div>
            <span className="block text-base font-bold tracking-[0.18em]">MAVIS</span>
            <span className="text-xs text-muted-foreground">Architecture workspace</span>
          </div>
        </div>
        <AppearanceSelector />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-8 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:py-14">
        <section className="hidden self-center lg:block">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <Network size={14} className="text-primary" />
            From source to architecture
          </div>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.18] tracking-tight">
            Understand your services.
            <br />
            <span className="text-primary">See the connections.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Explore your architecture, trace dependencies, and make changes with the source evidence
            in view.
          </p>
          <ArchitecturePreview />
          <div className="mt-7 grid grid-cols-3 gap-4 border-t pt-6">
            {[
              { icon: Layers3, title: "Explore", text: "Versioned models" },
              { icon: GitBranch, title: "Analyze", text: "Change impact" },
              { icon: ShieldCheck, title: "Verify", text: "Source evidence" },
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
          className="mx-auto w-full max-w-md rounded-2xl border bg-card p-7 sm:p-10"
          aria-labelledby="login-title"
        >
          <div className="mb-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-primary">
              Your workspace awaits
            </p>
            <h2 id="login-title" className="text-3xl font-semibold tracking-tight">
              Welcome back
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Sign in to continue exploring your architecture.
            </p>
          </div>
          {(params.get("signedOut") === "1" ||
            params.get("verified") === "1" ||
            params.get("reset") === "1") && (
            <div
              role="status"
              className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-3 text-sm"
            >
              <Check size={16} className="text-primary" />
              {params.get("verified") === "1"
                ? "Email verified. You can sign in now."
                : params.get("reset") === "1"
                  ? "Password updated. Sign in with your new password."
                  : "You’re signed out."}
            </div>
          )}
          {api.mode === "mock" ? (
            <div className="space-y-5">
              <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                Sample preview · choose a role. No live account is used.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(["student", "lecturer", "admin"] as const).map((role) => (
                  <Button
                    key={role}
                    variant="outline"
                    className="capitalize"
                    disabled={login.isPending}
                    onClick={() => void sample(role)}
                  >
                    {role}
                  </Button>
                ))}
              </div>
              {login.isError && <ErrorState error={login.error} />}
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!real.isPending) void signIn();
              }}
              aria-busy={real.isPending}
            >
              <div className="space-y-2">
                <label htmlFor="login-email" className="text-sm font-medium">
                  Email address
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
                    className="h-12 pl-10"
                    value={email}
                    disabled={real.isPending}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="login-password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    className="h-12 pr-12"
                    value={password}
                    disabled={real.isPending}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? "Hide password" : "Show password"}
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
                  Forgot password?
                </Link>
              </div>
              {real.isError && <ErrorState error={real.error} />}
              <Button
                className="h-12 w-full text-sm font-medium"
                disabled={real.isPending}
                type="submit"
              >
                {real.isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={17} />
                  </>
                )}
              </Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">
                Use the verified account provided for your workspace.
              </p>
            </form>
          )}
          {api.mode === "backend" && (
            <>
              <GoogleSignIn onSignedIn={finish} />
              <p className="mt-6 text-center text-sm text-muted-foreground">
                New to MAVIS?{" "}
                <Link href="/auth/register" className="font-medium text-primary hover:underline">
                  Create an account
                </Link>
              </p>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Need to verify your email?{" "}
                <Link href="/auth/verify" className="text-primary hover:underline">
                  Enter verification code
                </Link>
              </p>
            </>
          )}
          <div className="mt-8 flex items-center justify-center gap-2 border-t pt-5 text-xs text-muted-foreground">
            <ShieldCheck size={14} />
            <span>Source. Architecture. Evidence.</span>
          </div>
        </section>
      </main>
      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        MAVIS · Microservices Architecture Visualization
      </footer>
    </div>
  );
}
function ArchitecturePreview() {
  return (
    <div className="mt-9 rounded-xl border bg-card/60 p-4" aria-hidden="true">
      <svg viewBox="0 0 440 156" className="w-full text-primary" fill="none">
        <path
          d="M104 78H168M240 47H290M240 109H290M168 47V109"
          stroke="currentColor"
          strokeOpacity=".35"
          strokeWidth="1.5"
        />
        <circle cx="168" cy="78" r="3" fill="currentColor" />
        {[
          { x: 8, y: 53, label: "API gateway", sub: "Entry point", width: 96 },
          { x: 176, y: 22, label: "Orders", sub: "Service", width: 100 },
          { x: 176, y: 86, label: "Catalog", sub: "Service", width: 100 },
          { x: 308, y: 53, label: "Data", sub: "Persistence", width: 112 },
        ].map((n) => (
          <g key={n.label}>
            <rect
              x={n.x}
              y={n.y}
              width={n.width}
              height="50"
              rx="9"
              className="fill-card stroke-border"
            />
            <text
              x={n.x + 12}
              y={n.y + 21}
              className="fill-foreground"
              fontSize="11"
              fontFamily="inherit"
            >
              {n.label}
            </text>
            <text
              x={n.x + 12}
              y={n.y + 37}
              className="fill-muted-foreground"
              fontSize="9"
              fontFamily="inherit"
            >
              {n.sub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

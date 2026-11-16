"use client";
import Link from "next/link";
import { loginDestination } from "@/lib/auth/login-destination";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { LoginBackground } from "@/features/auth/login-background";
import { useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
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
import { MavisLogo } from "@/components/mavis-logo";
import { ErrorState } from "@/components/shared/request-state";
import type { AppRole } from "@/types/domain";
import { networkBadge, networkColor } from "@/features/architecture/cytoscape-network";
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
  const submitting = useRef(false);
  const finish = async (session: { user: { role: AppRole } | null }) => {
    await client.cancelQueries();
    client.clear();
    client.setQueryData(["api", "session", {}], session);
    router.replace(
      await loginDestination(params.get("next"), session.user?.role ?? "student", api),
    );
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
  async function signIn() {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const session = await real.mutateAsync({ email: email.trim(), password });
      setPassword("");
      await finish(session);
    } catch {
      /* Keep input for correction. */
    } finally {
      submitting.current = false;
    }
  }
  return (
    <div className="relative isolate flex min-h-svh flex-col bg-background text-foreground">
      <LoginBackground />
      <header className="mx-auto flex w-full max-w-7xl shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <MavisLogo className="h-12 w-12" />
          <div className="min-w-0 max-w-sm">
            <span className="block text-xs font-semibold leading-5 text-foreground sm:text-sm">
              AI-Assisted Microservices Architecture Visualization and Change Impact Analysis
            </span>
          </div>
        </div>
        <AppearanceSelector />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 px-4 py-3 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <section className="hidden self-center lg:block">
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
          className="mx-auto w-full min-w-0 max-w-md rounded-2xl border bg-card p-5 sm:p-6"
          aria-labelledby="login-title"
        >
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
              Your workspace awaits
            </p>
            <h2 id="login-title" className="text-2xl font-semibold tracking-tight">
              Welcome back <span aria-hidden="true" className="text-green-600">✓</span>
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
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
                    className="h-11 pr-12"
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
                className="h-11 w-full text-sm font-medium"
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
              <p className="mt-4 text-center text-sm text-muted-foreground">
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
          <div className="mt-5 flex items-center justify-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            <ShieldCheck size={14} />
            <span>Source. Architecture. Evidence.</span>
          </div>
        </section>
      </main>
      <footer className="shrink-0 px-4 py-3 text-center text-xs text-muted-foreground">
        MAVIS · Microservices Architecture Visualization
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

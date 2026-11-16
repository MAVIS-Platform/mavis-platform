"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { safeLoginRedirect } from "@/lib/auth/safe-login-redirect";
import { useApi, useSession } from "@/hooks/use-api";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { LoadingState, ErrorState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";

function LoginRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    const query = params.toString();
    const next = safeLoginRedirect(`${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    router.replace(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }, [pathname, params, router]);
  return (
    <div className="mx-auto max-w-lg p-8">
      <LoadingState label="Returning to sign in…" />
    </div>
  );
}

export function RequireSession({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: Permission;
}) {
  const session = useSession();
  const api = useApi();
  if (session.isPending)
    return (
      <div className="mx-auto max-w-lg p-8">
        <LoadingState label="Checking session…" />
      </div>
    );
  if (session.isError)
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorState
          error={session.error}
          onRetry={() => {
            void session.refetch();
          }}
        />
        <Button asChild className="mt-4" variant="outline">
          <Link href="/login">Sign in options</Link>
        </Button>
      </div>
    );
  if (!session.data.user) return <LoginRedirect />;
  if (
    permission &&
    !hasPermission(session.data.user.role, permission) &&
    !(api.mode === "backend" && permission.startsWith("project:"))
  )
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8" role="alert">
        <h1 className="text-xl font-semibold">Access unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Your account does not have permission to view this page.
        </p>
        <Button asChild variant="outline">
          <Link
            href={
              session.data.user.role === "admin"
                ? "/administration/users"
                : session.data.user.role === "lecturer"
                  ? "/workspaces"
                  : "/"
            }
          >
            Return to your workspace
          </Link>
        </Button>
      </div>
    );
  return children;
}

"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useApi, useSession } from "@/hooks/use-api";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { LoadingState, ErrorState } from "@/components/shared/request-state";
import { Button } from "@/components/ui/button";

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
  if (!session.data.user)
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8" role="alert">
        <h1 className="text-xl font-semibold">Sign in required</h1>
        <p className="text-sm text-muted-foreground">
          Your session is unavailable or has expired. Sign in to continue.
        </p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
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

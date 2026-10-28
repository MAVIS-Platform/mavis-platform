"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSelection, useSession } from "@/hooks/use-api";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/layout/page";
import { contextHref } from "@/lib/mainflow-api";
export default function ImportPage() {
  return (
    <AppShell>
      <ImportRedirect />
    </AppShell>
  );
}
function ImportRedirect() {
  const router = useRouter(),
    { projectId, workspaceId } = useSelection(),
    session = useSession();
  const teaching = !!workspaceId && ["lecturer", "admin"].includes(session.data?.user?.role ?? "");
  useEffect(() => {
    if (session.isPending) return;
    if (teaching) router.replace(`/assignments?workspace=${encodeURIComponent(workspaceId)}`);
    else
      router.replace(
        projectId ? contextHref("/snapshots", projectId, "", { import: "1" }) : "/?import=1",
      );
  }, [router, projectId, workspaceId, session.isPending, teaching]);
  return (
    <PageContainer>
      <p role="status" className="text-sm text-muted-foreground">
        Opening import dialog…
      </p>
    </PageContainer>
  );
}

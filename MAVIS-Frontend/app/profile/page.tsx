"use client";
import { AppShell } from "@/components/app-shell";
import { DetailPanel } from "@/components/shared/data";
import { useSession } from "@/hooks/use-api";
export default function ProfilePage() {
  return (
    <AppShell pageTitle="My Profile">
      <Profile />
    </AppShell>
  );
}
function Profile() {
  const session = useSession();
  return (
    <DetailPanel title="My Profile">
      <p className="text-sm">{session.data?.user?.name}</p>
      <p className="text-sm text-muted-foreground">Role: {session.data?.user?.role}</p>
      <p className="text-xs text-muted-foreground">
        Profile editing requires a confirmed backend contract.
      </p>
    </DetailPanel>
  );
}

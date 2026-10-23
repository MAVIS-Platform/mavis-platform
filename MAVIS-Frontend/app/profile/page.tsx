"use client";
import { AppShell } from "@/components/app-shell";
import { DetailPanel } from "@/components/shared/data";
import { useSession, useApiMutation } from "@/hooks/use-api";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function ProfilePage() {
  return (
    <AppShell pageTitle="My Profile">
      <Profile />
    </AppShell>
  );
}
function Profile() {
  const session = useSession();
  if (session.isPending) return <p>Loading profile…</p>;
  if (!session.data?.user) return <p role="alert">Sign in to edit your profile.</p>;
  return (
    <ProfileForm key={session.data.user.id + session.data.user.name} user={session.data.user} />
  );
}
function ProfileForm({ user }: { user: { name: string; role: string } }) {
  const update = useApiMutation("updateProfile");
  const [fullName, setFullName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      { fullName, ...(newPassword ? { currentPassword, newPassword } : {}) },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
        },
      },
    );
  }
  return (
    <DetailPanel title="My Profile">
      <form onSubmit={submit} className="space-y-4 max-w-lg">
        <p className="text-sm text-muted-foreground">Role: {user.role}</p>
        <label className="block">
          Full name
          <Input
            required
            maxLength={255}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="block">
          Current password
          <Input
            type="password"
            maxLength={100}
            required={!!newPassword}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="block">
          New password (optional)
          <Input
            type="password"
            minLength={6}
            maxLength={100}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <Button disabled={update.isPending || !fullName.trim()} type="submit">
          {update.isPending ? "Saving…" : "Save profile"}
        </Button>
        {update.error && <p role="alert">{update.error.message}</p>}
      </form>
    </DetailPanel>
  );
}

"use client";
import { AppShell } from "@/components/app-shell";
import { Profile } from "@/features/profile/profile";

export default function ProfilePage() {
  return (
    <AppShell pageTitle="My Profile">
      <Profile />
    </AppShell>
  );
}

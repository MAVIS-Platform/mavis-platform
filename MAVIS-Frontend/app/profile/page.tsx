"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  LogOut,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { DetailPanel, StatusBadge, SummaryCard } from "@/components/shared/data";
import { useAppearance } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiMutation, useApiQuery, useSelection, useSession } from "@/hooks/use-api";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { DRAWIO_THEME_OPTIONS, type DrawioTheme } from "@/lib/drawio/rules";
import { roleLabels, type AppRole } from "@/lib/navigation";

const ALL_PERMISSIONS: ReadonlyArray<{ id: Permission; label: string }> = [
  { id: "project:read", label: "Read Projects & Models" },
  { id: "project:write", label: "Author & Analyze Projects" },
  { id: "workspace:read", label: "Access Workspaces" },
  { id: "submission:create", label: "Submit Coursework" },
  { id: "submission:review", label: "Review Submissions" },
  { id: "admin:manage", label: "System Administration" },
];

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export default function ProfilePage() {
  return (
    <AppShell pageTitle="My Profile">
      <Profile />
    </AppShell>
  );
}

function Profile() {
  const session = useSession();
  if (session.isPending) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </PageContainer>
    );
  }
  if (!session.data?.user) {
    return (
      <PageContainer>
        <p role="alert" className="text-sm text-destructive">
          Sign in to edit your profile.
        </p>
      </PageContainer>
    );
  }
  return (
    <ProfileDashboard
      key={session.data.user.id + session.data.user.name}
      user={session.data.user}
    />
  );
}

function ProfileDashboard({
  user,
}: {
  user: { id: string; name: string; role: AppRole };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const selection = useSelection();
  const { appearance, setAppearance } = useAppearance();

  const update = useApiMutation("updateProfile");
  const signOut = useApiMutation("signOut");

  const canReadProjects = hasPermission(user.role, "project:read");
  const canReadWorkspaces = hasPermission(user.role, "workspace:read");

  const projects = useApiQuery("projectOverviews", {}, { enabled: canReadProjects });
  const workspaces = useApiQuery("workspaces", {}, { enabled: canReadWorkspaces });
  const submissions = useApiQuery("submissions", {}, { enabled: canReadWorkspaces });

  const [fullName, setFullName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [preferredDiagramTheme, setPreferredDiagramTheme] = useState<DrawioTheme>(() => {
    try {
      const saved = localStorage.getItem("mavis:preferred-drawio-theme") as DrawioTheme | null;
      return saved && DRAWIO_THEME_OPTIONS.some((o) => o.value === saved) ? saved : "clean";
    } catch {
      return "clean";
    }
  });

  const passwordMismatch =
    Boolean(newPassword) && Boolean(confirmPassword) && newPassword !== confirmPassword;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (passwordMismatch) return;
    setSavedNotice("");
    update.mutate(
      { fullName: fullName.trim(), ...(newPassword ? { currentPassword, newPassword } : {}) },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setSavedNotice(
            newPassword
              ? "Profile and password updated successfully."
              : "Profile display name updated.",
          );
        },
      },
    );
  }

  async function handleSignOut() {
    try {
      await signOut.mutateAsync({});
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["api", "session", {}], { user: null });
      router.replace("/login?signedOut=1");
    } catch {
      // Handled by mutation toast
    }
  }

  function handleCopyId() {
    void navigator.clipboard?.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  }

  function handleDiagramThemeChange(theme: DrawioTheme) {
    setPreferredDiagramTheme(theme);
    try {
      localStorage.setItem("mavis:preferred-drawio-theme", theme);
    } catch {
      // Ignore storage error
    }
  }

  const projectList = projects.data ?? [];
  const workspaceList = workspaces.data ?? [];
  const submissionList = submissions.data ?? [];
  const totalServices = projectList.reduce((sum, p) => sum + (p.services ?? 0), 0);
  const activePermissions = ALL_PERMISSIONS.filter((p) => hasPermission(user.role, p.id));

  return (
    <PageContainer>
      <SectionHeader
        title="My Profile"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSignOut()}
            disabled={signOut.isPending}
          >
            <LogOut className="mr-1.5 size-4" />
            {signOut.isPending ? "Signing out…" : "Sign out"}
          </Button>
        }
      />

      {/* Top Account Identity Banner */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-lg font-bold text-primary ring-1 ring-primary/30">
              {userInitials(fullName || user.name)}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-semibold tracking-tight">{user.name}</h2>
                <Badge variant="secondary">{roleLabels[user.role] ?? user.role}</Badge>
                <StatusBadge status="active session" variant="success" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Account ID:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{user.id}</code>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-muted"
                  title="Copy Account ID"
                >
                  {copiedId ? (
                    <>
                      <Check className="size-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canReadProjects && (
              <Button asChild size="sm" variant="outline">
                <Link href="/">My Projects ({projectList.length})</Link>
              </Button>
            )}
            {canReadWorkspaces && (
              <Button asChild size="sm" variant="outline">
                <Link href="/workspaces">My Workspaces ({workspaceList.length})</Link>
              </Button>
            )}
          </div>
        </div>

        {canReadProjects && (
          <div className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Projects" value={projectList.length} />
            <SummaryCard label="Services indexed" value={totalServices} />
            <SummaryCard label="Workspaces joined" value={workspaceList.length} />
            <SummaryCard label="Submissions" value={submissionList.length} />
          </div>
        )}
      </div>

      {/* Main 2-Column Balanced Content */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        {/* Left Column: Profile & Password Form */}
        <DetailPanel title="Account & security">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <UserRound className="size-3.5" />
                <span>Profile Information</span>
              </div>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Full name</span>
                <Input
                  required
                  maxLength={255}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Enter your display name"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Assigned role</p>
                  <p className="mt-1 text-sm font-medium">{roleLabels[user.role] ?? user.role}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Role code</p>
                  <p className="mt-1 font-mono text-sm font-medium">{user.role}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <KeyRound className="size-3.5" />
                <span>Change Password</span>
              </div>

              <label className="block space-y-1.5 text-sm font-medium">
                <span>Current password</span>
                <Input
                  type="password"
                  maxLength={100}
                  required={!!newPassword}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Current password"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>New password (optional)</span>
                  <Input
                    type="password"
                    minLength={6}
                    maxLength={100}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                  />
                </label>

                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Confirm new password</span>
                  <Input
                    type="password"
                    minLength={6}
                    maxLength={100}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                  />
                </label>
              </div>

              {passwordMismatch && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  New password and confirmation do not match.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button
                disabled={update.isPending || !fullName.trim() || passwordMismatch}
                type="submit"
              >
                {update.isPending ? "Saving…" : "Save profile"}
              </Button>
              {fullName !== user.name && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFullName(user.name);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  Reset
                </Button>
              )}
            </div>

            {savedNotice && (
              <p
                role="status"
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
              >
                {savedNotice}
              </p>
            )}
            {update.error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                {update.error.message}
              </p>
            )}
          </form>
        </DetailPanel>

        {/* Right Column: Appearance Preferences & Access Grants */}
        <div className="space-y-6">
          <DetailPanel title="Appearance preferences">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Interface theme</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAppearance("light")}
                    className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      appearance === "light"
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <Sun className="size-4 shrink-0" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppearance("dark")}
                    className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      appearance === "dark"
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <Moon className="size-4 shrink-0" />
                    <span>Dark</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground">Diagram palette</p>
                <div className="flex flex-wrap gap-2">
                  {DRAWIO_THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleDiagramThemeChange(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        preferredDiagramTheme === opt.value
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </DetailPanel>

          <DetailPanel title="Role permissions & quick access">
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {activePermissions.map((perm) => (
                  <div
                    key={perm.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-background/40 px-3 py-2.5"
                  >
                    <span className="text-xs font-semibold">{perm.label}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {perm.id}
                    </code>
                  </div>
                ))}
              </div>

              {canReadProjects && projectList.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Recent projects</p>
                  <div className="divide-y rounded-lg border bg-background/40">
                    {projectList.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            {p.services ?? 0} services
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => selection.setProjectId(p.id)}
                          >
                            <Link href={`/project-overview?project=${p.id}`}>Overview</Link>
                          </Button>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => selection.setProjectId(p.id)}
                          >
                            <Link href={`/diagrams?project=${p.id}`}>Diagrams</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DetailPanel>
        </div>
      </div>
    </PageContainer>
  );
}


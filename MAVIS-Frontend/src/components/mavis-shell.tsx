"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronDown, Home, LayoutGrid, LogOut, UserRound } from "lucide-react";
import { MavisLogo } from "@/components/mavis-logo";
import { AppearanceSelector } from "@/components/appearance-selector";
import { NotificationBell } from "@/features/notifications/inbox";
import { RequireSession } from "@/features/auth/access";
import { LocaleSwitchButton, useLocale } from "@/lib/i18n/locale-context";
import { useApi, useApiMutation, useSession } from "@/hooks/use-api";
import { roleLabels, type AppRole } from "@/lib/navigation";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/courses", label: "My Courses", icon: BookOpen },
  { href: "/all-courses", label: "All Courses", icon: LayoutGrid },
];

function MavisChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const api = useApi();
  const session = useSession();
  const queryClient = useQueryClient();
  const signOut = useApiMutation("signOut");
  const [signingOut, setSigningOut] = useState(false);

  const user = session.data?.user;
  const role: AppRole = user?.role ?? "student";
  const displayName = user?.name ?? t("Account", "Tài khoản");
  const displayEmail = user?.email ?? undefined;
  const avatarUrl = user?.avatarUrl ?? undefined;

  async function logout() {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      await signOut.mutateAsync({});
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["api", "session", {}], { user: null });
      router.replace("/login?signedOut=1");
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center gap-3 px-4 lg:px-8">
          <Link href="/home" className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
            <MavisLogo compact className="size-9 rounded-lg" />
            <span>MAVIS</span>
          </Link>
          <nav aria-label="MAVIS" className="ml-3 hidden h-full items-center gap-1 md:flex">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative inline-flex h-full items-center gap-2 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-primary",
                    active &&
                      "text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t(
                    label,
                    label === "My Courses"
                      ? "Khóa học của tôi"
                      : label === "All Courses"
                        ? "Tất cả khóa học"
                        : "Trang chủ",
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-0.5">
            <LocaleSwitchButton />
            <AppearanceSelector />
            <NotificationBell />
            <div className="mx-1.5 h-6 border-l" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-10 gap-2 rounded-xl px-2"
                  aria-label={t("Profile menu", "Menu hồ sơ")}
                >
                  <UserAvatar
                    name={displayName}
                    avatarUrl={avatarUrl}
                    size="sm"
                    online
                    className="border-primary/20 bg-primary text-primary-foreground"
                  />
                  <span className="hidden text-left lg:block">
                    <span className="block max-w-36 truncate text-xs font-medium">
                      {displayName}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {t(roleLabels[role] ?? role)}
                    </span>
                  </span>
                  <ChevronDown className="hidden size-3 lg:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
                <DropdownMenuLabel className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar name={displayName} avatarUrl={avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {displayName}
                      </span>
                      {displayEmail && (
                        <span className="block truncate text-[11px] font-normal text-muted-foreground">
                          {displayEmail}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[10px] font-medium text-primary">
                        {t(roleLabels[role] ?? role)}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <UserRound />
                    {t("My Profile", "Hồ sơ của tôi")}
                  </Link>
                </DropdownMenuItem>
                {api.mode === "mock" && (
                  <DropdownMenuItem asChild>
                    <Link href="/login">Choose sample role</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={signingOut || signOut.isPending}
                  onSelect={() => {
                    void logout();
                  }}
                >
                  <LogOut />
                  {signingOut || signOut.isPending
                    ? t("Signing out…", "Đang đăng xuất…")
                    : t("Sign out", "Đăng xuất")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <nav aria-label="MAVIS mobile" className="flex border-t px-2 md:hidden">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground",
                  active && "text-primary",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(
                  label,
                  label === "My Courses"
                    ? "Khóa học của tôi"
                    : label === "All Courses"
                      ? "Tất cả khóa học"
                      : "Trang chủ",
                )}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[90rem] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

export function MavisShell({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <MavisChrome>{children}</MavisChrome>
    </RequireSession>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Home, LayoutGrid, LogOut, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MavisLogo } from "@/components/mavis-logo";
import { AppearanceSelector } from "@/components/appearance-selector";
import { NotificationBell } from "@/features/notifications/inbox";
import { RequireSession } from "@/features/auth/access";
import { LocaleSwitchButton, useLocale } from "@/lib/i18n/locale-context";
import { useApiMutation, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/courses", label: "My Courses", icon: BookOpen },
  { href: "/all-courses", label: "All Courses", icon: LayoutGrid },
];

function MavisChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const session = useSession();
  const signOut = useApiMutation("signOut");
  const cache = useQueryClient();
  async function logout() {
    try {
      await signOut.mutateAsync({});
      cache.clear();
      router.replace("/login?signedOut=1");
    } catch {
      // The global mutation handler presents the request failure.
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
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label={t("Profile", "Hồ sơ")}
              title={t("Profile", "Hồ sơ")}
            >
              <Link href="/profile">
                <UserRound aria-hidden="true" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              aria-label={t("Sign out", "Đăng xuất")}
              title={t("Sign out", "Đăng xuất")}
              disabled={signOut.isPending}
              onClick={() => void logout()}
            >
              <LogOut aria-hidden="true" />
            </Button>
            <span className="hidden max-w-32 truncate pl-1 text-xs font-medium text-muted-foreground lg:inline">
              {session.data?.user?.name}
            </span>
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

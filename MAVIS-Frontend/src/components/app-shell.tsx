"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderGit2,
  Boxes,
  ShieldAlert,
  FileBarChart2,
  Users,
  Settings,
  Search,
  Bell,
  Plus,
  GitBranch,
  Hexagon,
  Network,
  Sparkles,
  ChevronRight,
  Import,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Analysis",
    items: [
      { name: "Overview", icon: LayoutDashboard, to: "/" },
      { name: "Architecture", icon: Network, to: "/architecture" },
      { name: "Projects", icon: FolderGit2, badge: "12" },
      { name: "Services", icon: Boxes },
      { name: "Impact analysis", icon: GitBranch, to: "/impact" },
      { name: "AI explanation", icon: Sparkles, to: "/explain" },
      { name: "Vulnerabilities", icon: ShieldAlert, badge: "37", alert: true },
    ],
  },
  {
    label: "Workspace",
    items: [
      { name: "Reports", icon: FileBarChart2 },
      { name: "Team", icon: Users },
      { name: "Settings", icon: Settings },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-6 pb-10 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Hexagon className="size-4.5" strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-foreground">MAVIS</p>
          <p className="text-[11px] text-muted-foreground">Architecture Analysis</p>
        </div>
      </div>

      <div className="px-3 pb-6">
        <Link
          href="/import"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition-colors",
            pathname === "/import"
              ? "bg-primary/10 text-primary ring-1 ring-primary/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <Import className="size-4" />
          Import project
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.to ? pathname === item.to : false;
                const content = (
                  <>
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.name}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                          item.alert
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={item.name}>
                    {item.to ? (
                      <Link
                        href={item.to}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-lg border border-border bg-card p-3.5">
        <p className="text-xs font-medium text-foreground">Connect a repository</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Link GitHub or GitLab to analyze projects automatically on every push.
        </p>
        <button className="mt-2.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Set up integration
          <ChevronRight className="size-3" />
        </button>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3.5">
        <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
          LH
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-medium text-foreground">Lê Ngọc Hậu</p>
          <p className="truncate text-[11px] text-muted-foreground">Platform team</p>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur lg:px-8">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search projects, services, findings…"
          className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bell className="size-4.5" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" />
        </button>
        <div className="mx-2 hidden h-6 w-px bg-border sm:block" />
        <Link
          href="/import"
          className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent sm:flex"
        >
          <Plus className="size-4" />
          New analysis
        </Link>
      </div>
    </header>
  );
}

export { GitBranch };

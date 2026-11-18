"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  Info,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
} from "lucide-react";
import { NotificationBell } from "@/features/notifications/inbox";
import { AppearanceSelector } from "@/components/appearance-selector";
import { LocaleSwitchButton, useLocale } from "@/lib/i18n/locale-context";
import { MavisLogo } from "@/components/mavis-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useProjectNavigation } from "@/hooks/use-project-navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  contextualNavigation,
  existingRouteContext,
  globalNavigation,
  lecturerWorkspaceNavigation,
  roleLabels,
  type AppRole,
  type NavigationGroup,
  type NavigationItem,
  type WorkspaceScope,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useApi, useApiMutation, useApiQuery, useSession, useSelection } from "@/hooks/use-api";
import { RequireSession } from "@/features/auth/access";
import { adminJobsReturnHref } from "@/lib/navigation/admin-job-review";
import { defaultLoginDestination } from "@/lib/auth/login-destination";
import { Breadcrumbs, ContextPanel, Header, Sidebar } from "@/components/layout/page";
import { useQueryClient } from "@tanstack/react-query";
import type { Permission } from "@/lib/auth/permissions";

export type AppShellProps = {
  children: ReactNode;
  live?: boolean;
  navigationQuery?: string;
  role?: AppRole;
  scope?: WorkspaceScope;
  activeId?: string;
  contextName?: string;
  pageTitle?: string;
  detailPanel?: ReactNode;
  onDetailClose?: () => void;
  contentVariant?: "standard" | "reading" | "form" | "workspace";
  // Design review only. This callback never changes authenticated permissions.
  onPreviewNavigate?: (id: string) => void;
};

export function AppShell(props: AppShellProps) {
  const pathname = usePathname();
  // FlowFrame verifies the Java session. Do not run the provisional session
  // adapter or its permission gate for the integrated backend mainflow.
  if (props.live) return <ShellChrome {...props} />;
  const preview = Boolean(props.onPreviewNavigate);
  const permission: Permission | undefined =
    preview || ["/design-system", "/profile", "/notifications", "/studio"].includes(pathname)
      ? undefined
      : pathname.startsWith("/administration")
        ? "admin:manage"
        : pathname.startsWith("/submissions/")
          ? "workspace:read"
          : [
                "/workspaces",
                "/workspace-overview",
                "/assignments",
                "/submissions",
                "/members",
                "/references",
              ].includes(pathname)
            ? "workspace:read"
            : "project:read";
  if (preview || pathname === "/design-system") return <ManagedShellChrome {...props} />;
  return (
    <RequireSession {...(permission ? { permission } : {})}>
      <ManagedShellChrome {...props} />
    </RequireSession>
  );
}

function ManagedShellChrome(props: AppShellProps) {
  const { role: previewRole, onPreviewNavigate } = props;
  const params = useSearchParams();
  const session = useSession();
  const api = useApi();
  const signOut = useApiMutation("signOut");
  const queryClient = useQueryClient();
  const role = onPreviewNavigate
    ? (previewRole ?? "student")
    : (session.data?.user?.role ?? "student");
  const selection = useSelection();
  const pathname = usePathname();
  const route = existingRouteContext(pathname);
  const rawScope =
    (pathname === "/submissions" && role === "lecturer") ||
    (pathname === "/workspaces" && Boolean(selection.workspaceId) && !onPreviewNavigate)
      ? "workspace"
      : (props.scope ?? route.scope);
  const scope =
    role === "student" || role === "lecturer"
      ? rawScope === "project"
        ? "workspace"
        : rawScope
      : rawScope;
  const projectQuery = useApiQuery(
    "projects",
    {},
    {
      enabled:
        scope === "project" &&
        Boolean(selection.projectId) &&
        !props.contextName &&
        (api.mode === "backend" || role === "student") &&
        !onPreviewNavigate,
    },
  );
  const selectedProjectName = projectQuery.data?.find((p) => p.id === selection.projectId)?.name;
  const selectedProjectQuery = useApiQuery(
    "project",
    { projectId: selection.projectId },
    {
      enabled:
        scope === "project" &&
        !!selection.projectId &&
        !props.contextName &&
        !onPreviewNavigate &&
        projectQuery.isSuccess &&
        !selectedProjectName,
    },
  );
  const workspaceQuery = useApiQuery(
    "workspaces",
    {},
    { enabled: role !== "admin" && !onPreviewNavigate },
  );
  const router = useRouter();
  async function logout() {
    try {
      await signOut.mutateAsync({});
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["api", "session", {}], { user: null });
      router.replace("/login?signedOut=1");
    } catch {
      /* Mutation feedback is shown by the provider. */
    }
  }
  const contextName =
    props.contextName ??
    (scope === "project"
      ? (selectedProjectName ?? selectedProjectQuery.data?.name ?? "Select a project")
      : (workspaceQuery.data?.find((w) => w.id === selection.workspaceId)?.name ??
        "Select a workspace"));
  return (
    <ShellChrome
      {...props}
      role={role}
      contextName={contextName}
      workspaces={workspaceQuery.data ?? []}
      selectedWorkspaceId={selection.workspaceId}
      navigationQuery={props.navigationQuery ?? (params.toString() ? `?${params}` : "")}
      displayName={session.data?.user?.name ?? "Design preview"}
      apiMode={api.mode}
      signOutPending={signOut.isPending}
      onSignOut={() => void logout()}
    />
  );
}

function ShellChrome({
  children,
  live = false,
  navigationQuery = "",
  role = "student",
  scope: scopeOverride,
  activeId: activeOverride,
  contextName,
  workspaces = [],
  selectedWorkspaceId = "",
  pageTitle,
  detailPanel,
  onDetailClose,
  contentVariant: contentOverride,
  onPreviewNavigate,
  displayName = "Design preview",
  apiMode,
  signOutPending = false,
  onSignOut,
}: AppShellProps & {
  workspaces?: ReadonlyArray<{ id: string; name: string; code?: string | undefined }>;
  selectedWorkspaceId?: string;
  displayName?: string;
  apiMode?: "mock" | "backend";
  signOutPending?: boolean;
  onSignOut?: () => void;
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const route = existingRouteContext(pathname);
  const rawShellScope =
    (pathname === "/submissions" && role === "lecturer") ||
    (pathname === "/workspaces" && Boolean(selectedWorkspaceId) && !onPreviewNavigate)
      ? "workspace"
      : (scopeOverride ?? route.scope);
  const scope =
    !live && (role === "student" || role === "lecturer") && rawShellScope === "project"
      ? "workspace"
      : rawShellScope;
  const activeId =
    pathname === "/submissions" && role === "lecturer"
      ? "assignment-submissions"
      : pathname === "/workspaces" && Boolean(selectedWorkspaceId) && !onPreviewNavigate
        ? "workspace-overview"
        : (activeOverride ?? route.activeId);
  const context = contextName ?? (scope === "project" ? "Select a project" : "Select a workspace");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [detailsInline, setDetailsInline] = useState(false);
  const contentContainer = useRef<HTMLDivElement>(null);
  const detailReturnFocus = useRef<HTMLElement | null>(null);
  const contentVariant =
    contentOverride ?? (scope === "project" || scope === "review" ? "workspace" : "standard");
  const showInlineDetail = Boolean(detailPanel) && (detailsInline || !onDetailClose);
  const decorateGroups = (navigation: readonly NavigationGroup[]): NavigationGroup[] =>
    navigation.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (live) {
          const liveRoutes: Record<string, string> = {
            projects: "/import",
            snapshots: "/import",
            graph: "/architecture",
            impact: "/impact",
            explanations: "/explain",
          };
          const { href: _href, ...entry } = item;
          const href = liveRoutes[item.id];
          return href ? { ...entry, href: `${href}${navigationQuery}` } : entry;
        }
        if (
          item.href &&
          navigationQuery &&
          item.id !== "workspaces" &&
          !item.href.includes("?") &&
          !["/design-system", "/login"].includes(item.href)
        )
          return { ...item, href: `${item.href}${navigationQuery}` };
        return scope === "review" && contextName && !item.href
          ? { ...item, href: `/submissions/${encodeURIComponent(contextName)}#${item.id}` }
          : item;
      }),
    }));
  const globalGroups = decorateGroups(
    globalNavigation[role].map((group) => ({
      ...group,
      items: group.items.flatMap((item) =>
        (item.id === "workspaces" || (role === "student" && item.id === "courses")) &&
        !live &&
        !onPreviewNavigate &&
        workspaces.length > 0
          ? [
              item,
              ...workspaces.map((w) => {
                const entry: NavigationItem = {
                  id: `workspace:${w.id}`,
                  label:
                    w.code && !w.name.toLowerCase().includes(w.code.toLowerCase())
                      ? `${w.code} · ${w.name}`
                      : w.name,
                  icon: BookOpen,
                  href:
                    role === "student"
                      ? `/roadmap?workspace=${encodeURIComponent(w.id)}`
                      : `/workspace-overview?workspace=${encodeURIComponent(w.id)}`,
                };
                if (role !== "lecturer") return entry;
                return {
                  ...entry,
                  children: (lecturerWorkspaceNavigation[0]?.items ?? [])
                    .filter((destination) => Boolean(destination.href))
                    .map((destination) => ({
                      ...destination,
                      id: `workspace:${w.id}:${destination.id}`,
                      href: `${destination.href!}${destination.href!.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(w.id)}`,
                    })),
                };
              }),
            ]
          : [item],
      ),
    })),
  );
  const groups = decorateGroups(contextualNavigation(role, scope, live));
  const projectGroups = useProjectNavigation(
    role,
    activeId,
    groups.find((group) => group.items.some((item) => item.id === activeId))?.label,
    scope === "project" && !live,
  );
  const activeWorkspaceDestination =
    pathname === "/workspace-overview"
      ? params.get("view") === "course-authoring"
        ? "course-authoring"
        : "workspace-overview"
      : pathname === "/theory-library"
        ? "theory-library"
        : pathname === "/assignments"
          ? "assignments"
          : pathname === "/lab-authoring"
            ? "lab-authoring"
            : pathname === "/submissions" && role === "lecturer"
              ? "assignment-submissions"
              : pathname === "/members"
                ? "members"
                : route.activeId;
  const activeWorkspaceNavId =
    selectedWorkspaceId && workspaces.some((w) => w.id === selectedWorkspaceId)
      ? `workspace:${selectedWorkspaceId}:${activeWorkspaceDestination}`
      : role === "student"
        ? "courses"
        : "workspaces";
  const activeItem = [...globalGroups, ...groups]
    .flatMap((group) => group.items)
    .find((item) => item.id === activeId);
  const title = pageTitle ?? activeItem?.label ?? route.title;

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 1279px)").matches;
    try {
      const saved = localStorage.getItem("mavis.sidebar-collapsed");
      setCollapsed(saved === null ? compactViewport : saved === "true");
    } catch {
      setCollapsed(compactViewport);
    }
  }, []);

  useEffect(() => {
    const container = contentContainer.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setDetailsInline(entry.contentRect.width >= 900);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("mavis.sidebar-collapsed", String(next));
    } catch {
      /* Session-only fallback. */
    }
  }

  function navigatePreview(id: string) {
    onPreviewNavigate?.(id);
    setMobileOpen(false);
  }

  function navigation(isCollapsed: boolean) {
    return (
      <>
        <div
          className={cn(
            "flex h-(--header-height) shrink-0 items-center border-b px-5",
            isCollapsed && "justify-center px-0",
          )}
        >
          <Link
            href={live ? `/import${navigationQuery}` : defaultLoginDestination(role)}
            aria-label="MAVIS home"
            className="flex min-w-0 items-center gap-2.5 rounded-md"
          >
            <MavisLogo compact={isCollapsed} className={isCollapsed ? "h-10 w-10" : "h-12 w-12"} />
            {!isCollapsed && (
              <span className="min-w-0">
                <span className="block text-base tracking-widest text-foreground">MAVIS</span>
              </span>
            )}
          </Link>
        </div>
        <div className={cn("border-b px-5 py-4", isCollapsed && "px-2 text-center")}>
          {isCollapsed ? (
            <span className="text-xs font-semibold" title={roleLabels[role]}>
              {live ? "MV" : role === "student" ? "ST" : role === "lecturer" ? "LE" : "AD"}
            </span>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("Learning & analysis", "Học tập & phân tích")}
              </p>
              <p className="mt-1 text-xs font-medium">
                {live
                  ? t("Architecture analysis", "Phân tích kiến trúc")
                  : t(roleLabels[role] ?? role)}
              </p>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          <NavigationGroups
            groups={globalGroups}
            collapsed={isCollapsed}
            currentKind={scope === "global" ? "page" : "location"}
            activeId={
              scope === "global"
                ? activeId === "workspaces" || (role === "student" && activeId === "courses")
                  ? activeWorkspaceNavId
                  : activeId
                : selectedWorkspaceId && (role === "student" || role === "lecturer")
                  ? activeWorkspaceNavId
                  : activeId
            }
            preview={Boolean(onPreviewNavigate)}
            onNavigate={navigatePreview}
            label="Global navigation"
          />
          {groups.length > 0 && !(role === "lecturer" && scope === "workspace") && (
            <div className="mt-5 border-t pt-5">
              {!isCollapsed && (
                <div className="mb-4 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t(
                      scope === "review"
                        ? "Submission review"
                        : scope === "project"
                          ? "Project workspace"
                          : role === "student"
                            ? "Learning workspace"
                            : "Teaching workspace",
                    )}
                  </p>
                  <p className="mt-1 break-words text-xs font-medium">{context}</p>
                  {scope === "review" && (
                    <Badge variant="outline" className="mt-2">
                      Submitted · read-only
                    </Badge>
                  )}
                </div>
              )}
              <NavigationGroups
                groups={groups}
                collapsed={isCollapsed}
                activeId={activeId}
                preview={Boolean(onPreviewNavigate)}
                onNavigate={navigatePreview}
                label="Contextual navigation"
                {...(scope === "project" && !live
                  ? { expandedGroups: projectGroups.groups, onToggleGroup: projectGroups.toggle }
                  : {})}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="mavis-shell flex min-h-svh bg-background">
        <a
          href="#main-content"
          className="fixed left-4 top-3 z-(--z-skip-link) -translate-y-24 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
        >
          Skip to content
        </a>
        <Sidebar collapsed={collapsed}>{navigation(collapsed)}</Sidebar>
        <div className="flex min-w-0 flex-1 flex-col">
          <Header>
            <Button
              variant="ghost"
              size="icon"
              className="hidden shrink-0 md:inline-flex"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-(--drawer-width) flex-col gap-0 bg-sidebar p-0"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>MAVIS navigation</SheetTitle>
                  <SheetDescription>
                    Global and contextual navigation for {roleLabels[role]}.
                  </SheetDescription>
                </SheetHeader>
                {navigation(false)}
              </SheetContent>
            </Sheet>
            <Breadcrumbs
              items={[
                {
                  label: "MAVIS",
                  href: defaultLoginDestination(role),
                  visibility: "sm",
                },
                ...(scope !== "global"
                  ? [
                      {
                        label: role === "admin" && scope === "project" ? "Analysis Jobs" : context,
                        href:
                          scope === "project"
                            ? role === "admin"
                              ? adminJobsReturnHref(new URLSearchParams(navigationQuery))
                              : role === "student"
                                ? `/roadmap${navigationQuery}`
                                : `/project-overview${navigationQuery}`
                            : scope === "review"
                              ? `/submissions${navigationQuery}`
                              : role === "student"
                                ? `/courses${navigationQuery}`
                                : `/workspaces${navigationQuery}`,
                        visibility: "lg" as const,
                      },
                    ]
                  : []),
                { label: title },
              ]}
            />
            <div className="flex shrink-0 items-center gap-1.5">
              {!live &&
                (role === "student" || role === "lecturer") &&
                workspaces.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="hidden h-8 max-w-48 gap-1.5 rounded-full border-emerald-200 bg-emerald-50/70 px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-100 md:inline-flex dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      >
                        <span className="truncate">
                          {workspaces.find((w) => w.id === selectedWorkspaceId)?.code ||
                            workspaces.find((w) => w.id === selectedWorkspaceId)?.name ||
                            t("Switch class", "Chọn lớp")}
                        </span>
                        <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 rounded-xl p-1.5">
                      <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">
                        {t("Quick switch class", "Chuyển nhanh lớp học")}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {workspaces.map((ws) => {
                        const targetHref =
                          role === "student"
                            ? `/roadmap?workspace=${encodeURIComponent(ws.id)}`
                            : `/workspace-overview?workspace=${encodeURIComponent(ws.id)}`;
                        return (
                          <DropdownMenuItem key={ws.id} asChild>
                            <Link
                              href={targetHref}
                              className={cn(
                                "flex items-center justify-between gap-2",
                                ws.id === selectedWorkspaceId && "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
                              )}
                            >
                              <span className="truncate">{ws.name}</span>
                              {ws.code && (
                                <span className="shrink-0 font-mono text-[10px] opacity-75">
                                  {ws.code}
                                </span>
                              )}
                            </Link>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              <LocaleSwitchButton />
              <AppearanceSelector />
              <NotificationBell />
              {!live && (
                <>
                  <div className="mx-1.5 h-6 border-l" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-10 gap-2 rounded-xl px-2"
                        aria-label="Profile menu"
                      >
                        <span className="relative flex size-8 items-center justify-center rounded-full border bg-secondary">
                          <span className="text-xs font-semibold text-primary">
                            {displayName
                              .split(" ")
                              .filter(Boolean)
                              .map((part) => part[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </span>
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500"
                          />
                        </span>
                        <span className="hidden text-left lg:block">
                          <span className="block max-w-36 truncate text-xs font-medium">
                            {displayName}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {roleLabels[role]}
                          </span>
                        </span>
                        <ChevronDown className="hidden size-3 lg:block" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 rounded-xl p-2">
                      <DropdownMenuLabel className="px-2 py-3">
                        <span className="block text-sm">{displayName}</span>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {roleLabels[role]}
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/profile">
                          <UserRound />
                          My Profile
                        </Link>
                      </DropdownMenuItem>
                      {apiMode === "mock" && (
                        <DropdownMenuItem asChild>
                          <Link href="/login">Choose sample role</Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        disabled={signOutPending || Boolean(onPreviewNavigate)}
                        onSelect={() => {
                          onSignOut?.();
                        }}
                      >
                        <LogOut />
                        {signOutPending ? "Signing out…" : "Sign out"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="hidden sm:inline-flex gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={signOutPending || Boolean(onPreviewNavigate)}
                    onClick={() => onSignOut?.()}
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    <span>{signOutPending ? t("Signing out…", "Đang đăng xuất…") : t("Sign out", "Đăng xuất")}</span>
                  </Button>
                </>
              )}
            </div>
          </Header>
          {!live && (Boolean(onPreviewNavigate) || pathname === "/design-system") && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-info-subtle px-(--page-gutter) py-2 text-xs text-info">
              <span className="flex items-center gap-2">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                <span>Design preview · All content is illustrative. No live system data.</span>
              </span>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-medium underline-offset-4 hover:underline"
              >
                <MessageSquare className="size-3.5" aria-hidden="true" />
                Review notes
              </button>
            </div>
          )}
          <div className="mavis-content-region min-w-0 flex-1">
            <div ref={contentContainer} className="mavis-content-container">
              <div
                className={cn(
                  "mavis-content-layout",
                  showInlineDetail && detailsInline && "has-inline-details",
                )}
              >
                <main
                  id="main-content"
                  tabIndex={-1}
                  className="min-w-0 outline-none"
                  data-content-variant={contentVariant}
                >
                  <div
                    className={cn(
                      "w-full",
                      contentVariant === "standard" && "mx-auto max-w-(--content-max)",
                      contentVariant === "reading" && "max-w-(--reading-max)",
                      contentVariant === "form" && "max-w-(--form-max)",
                    )}
                  >
                    {children}
                  </div>
                </main>
                {showInlineDetail && (
                  <ContextPanel title="Contextual detail panel">{detailPanel}</ContextPanel>
                )}
              </div>
            </div>
          </div>
        </div>
        <Sheet
          open={Boolean(detailPanel) && !showInlineDetail}
          onOpenChange={(open) => {
            if (!open) onDetailClose?.();
          }}
        >
          <SheetContent
            className="[&_[data-detail-close]]:hidden"
            onOpenAutoFocus={() => {
              detailReturnFocus.current =
                document.activeElement instanceof HTMLElement &&
                document.activeElement !== document.body
                  ? document.activeElement
                  : document.getElementById("main-content");
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              detailReturnFocus.current?.focus();
            }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Contextual evidence</SheetTitle>
              <SheetDescription>Selected source, model and evidence details.</SheetDescription>
            </SheetHeader>
            {detailPanel}
          </SheetContent>
        </Sheet>
        <Sheet open={feedbackOpen} onOpenChange={setFeedbackOpen}>
          <SheetContent className="bg-card">
            <SheetHeader>
              <SheetTitle>Review this foundation</SheetTitle>
              <SheetDescription>Checkpoint 1 · design system and shared shell</SheetDescription>
            </SheetHeader>
            <ul className="mt-6 space-y-4 text-sm leading-6">
              <li>
                Inspect the Student, Lecturer, and Admin navigation against the supplied screen
                flows.
              </li>
              <li>Compare Light and Dark specimens, then try Appearance → System.</li>
              <li>Check sidebar collapse, narrow layouts, keyboard focus, and evidence labels.</li>
            </ul>
            <p className="mt-6 text-xs text-muted-foreground">
              Send checkpoint feedback in the project conversation. This panel does not submit or
              store feedback.
            </p>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

function NavigationGroups({
  groups,
  collapsed,
  activeId,
  preview,
  onNavigate,
  label,
  currentKind = "page",
  expandedGroups,
  onToggleGroup,
  collapsibleGroupLabels,
}: {
  groups: readonly NavigationGroup[];
  collapsed: boolean;
  activeId: string;
  preview: boolean;
  onNavigate: (id: string) => void;
  label: string;
  currentKind?: "page" | "location";
  expandedGroups?: Record<string, boolean>;
  onToggleGroup?: (group: string, open: boolean) => void;
  collapsibleGroupLabels?: readonly string[];
}) {
  const { t } = useLocale();
  return (
    <nav aria-label={t(label)} className={onToggleGroup ? "space-y-2" : "space-y-5"}>
      {groups.map((group) => {
        const items = (
          <ul className="space-y-1">
            {group.items.map((item) => {
              const isWorkspace =
                item.id.startsWith("workspace:") && Boolean(item.children?.length);
              const expanded = expandedGroups?.[item.id] ?? activeId.startsWith(`${item.id}:`);
              return (
                <li key={item.id}>
                  <div className={cn("flex items-center gap-1", isWorkspace && "mb-0.5")}>
                    <div className="min-w-0 flex-1">
                      <NavigationEntry
                        item={item}
                        collapsed={collapsed}
                        active={activeId === item.id || activeId.startsWith(`${item.id}:`)}
                        preview={preview}
                        onNavigate={onNavigate}
                        currentKind={currentKind}
                      />
                    </div>
                    {isWorkspace && !collapsed && (
                      <Collapsible
                        open={expanded}
                        onOpenChange={(open) => onToggleGroup?.(item.id, open)}
                      >
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${expanded ? t("Collapse") : t("Expand")} ${t(item.label)} menu`}
                            aria-expanded={expanded}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "size-3.5 transition-transform motion-reduce:transition-none",
                                !expanded && "-rotate-90",
                              )}
                            />
                          </button>
                        </CollapsibleTrigger>
                      </Collapsible>
                    )}
                  </div>
                  {item.children && (
                    <Collapsible open={expanded}>
                      <CollapsibleContent>
                        <ul
                          className={cn(
                            "space-y-0.5",
                            !collapsed && "ml-4 border-l border-border/50 pl-2",
                          )}
                        >
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <NavigationEntry
                                item={child}
                                collapsed={collapsed}
                                active={activeId === child.id}
                                preview={preview}
                                onNavigate={onNavigate}
                                currentKind={currentKind}
                              />
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </li>
              );
            })}
          </ul>
        );
        if (
          !collapsed &&
          onToggleGroup &&
          (collapsibleGroupLabels
            ? collapsibleGroupLabels.includes(group.label)
            : group.label !== "Project")
        ) {
          return (
            <Collapsible
              key={group.label}
              open={Boolean(expandedGroups?.[group.label])}
              onOpenChange={(open) => onToggleGroup(group.label, open)}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{t(group.label)}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none group-data-[state=closed]:-rotate-90"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>{items}</CollapsibleContent>
            </Collapsible>
          );
        }
        return (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t(group.label)}
              </p>
            )}
            {items}
          </div>
        );
      })}
    </nav>
  );
}

function NavigationEntry({
  item,
  collapsed,
  active,
  preview,
  onNavigate,
  currentKind,
}: {
  item: NavigationItem;
  collapsed: boolean;
  active: boolean;
  preview: boolean;
  onNavigate: (id: string) => void;
  currentKind: "page" | "location";
}) {
  const { t } = useLocale();
  const workspaceDepth = item.id.startsWith("workspace:") ? item.id.split(":").length - 1 : 0;
  const isWorkspaceRoot = workspaceDepth === 1 && Boolean(item.children?.length);
  const isWorkspaceChild = workspaceDepth >= 2;
  const className = cn(
    "flex w-full items-center gap-2.5 text-left transition-colors",
    collapsed && "min-h-9 justify-center rounded-md px-0",
    !collapsed && "rounded-md px-2",
    !collapsed &&
      (isWorkspaceRoot
        ? "min-h-10 px-2.5 text-[13px] font-semibold"
        : isWorkspaceChild
          ? "min-h-8 text-xs"
          : "min-h-9 text-xs leading-5"),
    active
      ? isWorkspaceRoot
        ? "bg-muted text-foreground"
        : "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
      : isWorkspaceRoot
        ? "text-foreground/85 hover:bg-accent/50"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    !preview && !item.href && "cursor-not-allowed",
  );
  const content = (
    <>
      <item.icon
        className={cn("shrink-0", isWorkspaceChild ? "size-3.5" : "size-4")}
        aria-hidden="true"
      />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">{t(item.label)}</span>
          {!preview && !item.href && (
            <span className="text-[9px] font-normal">{t("Planned", "Đã lên kế hoạch")}</span>
          )}
        </>
      )}
    </>
  );
  const control = preview ? (
    <button
      className={className}
      onClick={() => onNavigate(item.id)}
      aria-current={active ? currentKind : undefined}
      aria-label={t(item.label)}
    >
      {content}
    </button>
  ) : item.href ? (
    <Link
      href={item.href}
      className={className}
      aria-current={active ? currentKind : undefined}
      aria-label={t(item.label)}
    >
      {content}
    </Link>
  ) : (
    <button disabled className={className} aria-label={`${item.label} · planned`}>
      {content}
    </button>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {!preview && !item.href ? " · planned" : ""}
      </TooltipContent>
    </Tooltip>
  ) : (
    control
  );
}

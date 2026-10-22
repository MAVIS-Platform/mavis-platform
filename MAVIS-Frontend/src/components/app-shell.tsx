"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Hexagon,
  Info,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  UserRound,
} from "lucide-react";
import { AppearanceSelector } from "@/components/appearance-selector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  roleLabels,
  type AppRole,
  type NavigationGroup,
  type NavigationItem,
  type WorkspaceScope,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useApi, useApiMutation, useApiQuery, useSession, useSelection } from "@/hooks/use-api";
import { RequireSession } from "@/features/auth/access";
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
    preview || ["/design-system", "/profile"].includes(pathname)
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
  const projectQuery = useApiQuery(
    "projects",
    {},
    { enabled: (api.mode === "backend" || role === "student") && !onPreviewNavigate },
  );
  const workspaceQuery = useApiQuery(
    "workspaces",
    {},
    { enabled: role !== "admin" && !onPreviewNavigate && !!selection.workspaceId },
  );
  async function logout() {
    try {
      await signOut.mutateAsync({});
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["api", "session", {}], { user: null });
    } catch {
      /* Mutation feedback is shown by the provider. */
    }
  }
  const pathname = usePathname();
  const route = existingRouteContext(pathname);
  const scope =
    pathname === "/submissions" && role === "lecturer" ? "workspace" : (props.scope ?? route.scope);
  const contextName =
    props.contextName ??
    (scope === "project"
      ? (projectQuery.data?.find((p) => p.id === selection.projectId)?.name ?? "Select a project")
      : (workspaceQuery.data?.find((w) => w.id === selection.workspaceId)?.name ??
        "Select a workspace"));
  return (
    <ShellChrome
      {...props}
      role={role}
      contextName={contextName}
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
  displayName?: string;
  apiMode?: "mock" | "backend";
  signOutPending?: boolean;
  onSignOut?: () => void;
}) {
  const pathname = usePathname();
  const route = existingRouteContext(pathname);
  const scope =
    pathname === "/submissions" && role === "lecturer"
      ? "workspace"
      : (scopeOverride ?? route.scope);
  const activeId =
    pathname === "/submissions" && role === "lecturer"
      ? "assignment-submissions"
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
        if (item.href && navigationQuery && !["/design-system", "/login"].includes(item.href))
          return { ...item, href: `${item.href}${navigationQuery}` };
        return scope === "review" && contextName
          ? { ...item, href: `/submissions/${encodeURIComponent(contextName)}#${item.id}` }
          : item;
      }),
    }));
  const groups = decorateGroups(contextualNavigation(role, scope));
  const activeItem = [...globalNavigation[role], ...groups]
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
            href={
              live
                ? `/import${navigationQuery}`
                : role === "admin"
                  ? "/administration/users"
                  : role === "lecturer"
                    ? "/workspaces"
                    : "/"
            }
            aria-label="MAVIS home"
            className="flex items-center gap-2.5 rounded-md"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hexagon className="size-5" aria-hidden="true" />
            </span>
            {!isCollapsed && (
              <span>
                <span className="block text-base font-bold tracking-[0.12em]">MAVIS</span>
                <span className="block text-[11px] text-muted-foreground">
                  Understand the architecture
                </span>
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
                Learning & analysis
              </p>
              <p className="mt-1 text-xs font-medium">
                {live ? "Architecture analysis" : roleLabels[role]}
              </p>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          <NavigationGroups
            groups={decorateGroups(globalNavigation[role])}
            collapsed={isCollapsed}
            currentKind={scope === "global" ? "page" : "location"}
            activeId={
              scope === "global" ? activeId : role === "student" ? "projects" : "workspaces"
            }
            preview={Boolean(onPreviewNavigate)}
            onNavigate={navigatePreview}
            label="Global navigation"
          />
          {groups.length > 0 && (
            <div className="mt-5 border-t pt-5">
              {!isCollapsed && (
                <div className="mb-4 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {scope === "review"
                      ? "Submission review"
                      : scope === "project"
                        ? "Project workspace"
                        : "Teaching workspace"}
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
              />
            </div>
          )}
        </div>
        <div className="shrink-0 space-y-2 border-t p-3">
          <Link
            href="/design-system"
            aria-current={pathname === "/design-system" ? "page" : undefined}
            aria-label="Design foundation"
            className={cn(
              "flex min-h-9 items-center gap-2.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
              isCollapsed && "justify-center px-0",
            )}
            title="Design foundation"
          >
            <Palette className="size-4 shrink-0" aria-hidden="true" />
            {!isCollapsed && (
              <span>
                Design foundation <span className="text-[10px]">· Stage 1</span>
              </span>
            )}
          </Link>
          {!isCollapsed && (
            <p className="px-2 text-[11px] leading-5 text-muted-foreground">
              Source analysis. Runtime evidence.
              <br />
              Explanations with context.
            </p>
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
                { label: "MAVIS", visibility: "sm" },
                ...(scope !== "global" ? [{ label: context, visibility: "lg" as const }] : []),
                { label: title },
              ]}
            />
            <div className="flex shrink-0 items-center gap-1">
              <AppearanceSelector />
              {!live && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Notifications">
                        <Bell />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 p-4">
                      <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Notifications are unavailable. No notification service has been configured.
                      </p>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="mx-2 h-6 border-l" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-2 px-1.5" aria-label="Profile menu">
                        <span className="flex size-8 items-center justify-center rounded-full border bg-secondary">
                          <UserRound className="size-4" />
                        </span>
                        <span className="hidden text-xs lg:block">{displayName}</span>
                        <ChevronDown className="hidden size-3 lg:block" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>{roleLabels[role]}</DropdownMenuLabel>
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
                </>
              )}
            </div>
          </Header>
          {!live && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-info-subtle px-(--page-gutter) py-2 text-xs text-info">
              <span className="flex items-center gap-2">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {onPreviewNavigate || pathname === "/design-system"
                    ? "Design preview · All content is illustrative. No live system data."
                    : apiMode === "mock"
                      ? "Mock mode · Explicit sample data. No live system connection. Changes reset on reload."
                      : "Backend mode · Configured service requests. Unavailable operations report an error."}
                </span>
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
}: {
  groups: readonly NavigationGroup[];
  collapsed: boolean;
  activeId: string;
  preview: boolean;
  onNavigate: (id: string) => void;
  label: string;
  currentKind?: "page" | "location";
}) {
  return (
    <nav aria-label={label} className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.label}
            </p>
          )}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.id}>
                <NavigationEntry
                  item={item}
                  collapsed={collapsed}
                  active={activeId === item.id}
                  preview={preview}
                  onNavigate={onNavigate}
                  currentKind={currentKind}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
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
  const className = cn(
    "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-xs leading-5 transition-colors",
    collapsed && "justify-center px-0",
    active
      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground ring-1 ring-inset ring-primary/20"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
    !preview && !item.href && "cursor-not-allowed",
  );
  const content = (
    <>
      <item.icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">{item.label}</span>
          {!preview && !item.href && <span className="text-[9px] font-normal">Planned</span>}
        </>
      )}
    </>
  );
  const control = preview ? (
    <button
      className={className}
      onClick={() => onNavigate(item.id)}
      aria-current={active ? currentKind : undefined}
      aria-label={item.label}
    >
      {content}
    </button>
  ) : item.href ? (
    <Link
      href={item.href}
      className={className}
      aria-current={active ? currentKind : undefined}
      aria-label={item.label}
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

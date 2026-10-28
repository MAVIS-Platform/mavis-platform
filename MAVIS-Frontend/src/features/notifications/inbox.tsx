"use client";
import Link from "next/link";
import { useState, useEffect, useContext } from "react";
import { ApiContext } from "@/providers/app-context";
import {
  Bell,
  CheckCheck,
  Check,
  ArrowUpRight,
  Inbox,
  RefreshCw,
  BookOpen,
  Users,
  FileCheck,
  Network,
  Play,
  Shield,
  Activity,
} from "lucide-react";
import { useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField, Pagination } from "@/components/shared/forms";
import type { Request, Response } from "@/lib/api/contracts";

const categories = [
  { value: "", label: "All activity" },
  { value: "WORKSPACE", label: "Workspaces" },
  { value: "ASSIGNMENT", label: "Assignments" },
  { value: "SUBMISSION", label: "Submissions & feedback" },
  { value: "ANALYSIS", label: "Analysis & models" },
  { value: "RUNTIME", label: "Runtime sessions" },
  { value: "ACCOUNT", label: "Account access" },
  { value: "SYSTEM", label: "System alerts" },
];
const icons: Record<string, typeof Bell> = {
  WORKSPACE: Users,
  ASSIGNMENT: BookOpen,
  SUBMISSION: FileCheck,
  ANALYSIS: Network,
  RUNTIME: Play,
  ACCOUNT: Shield,
  SYSTEM: Activity,
};
function timeLabel(value: string) {
  const date = new Date(value),
    minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : date.toLocaleDateString();
}
function NotificationList({
  items,
  compact = false,
  onNavigate,
}: {
  items: Response<"notifications">["items"];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const read = useApiMutation("readNotification");
  return (
    <ul className="divide-y" aria-label="Notifications">
      {items.map((item) => {
        const Icon = icons[item.category] ?? Bell;
        return (
          <li
            key={item.id}
            className={`flex items-start gap-2 ${compact ? "p-3" : "p-4 sm:p-5"} ${item.readAt ? "" : "bg-primary/5"}`}
          >
            <div className="mt-0.5 rounded-lg border bg-background p-2 text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <Link
              href={item.targetPath}
              onClick={() => {
                if (!item.readAt && !read.isPending) read.mutate({ notificationId: item.id });
                onNavigate?.();
              }}
              className="min-w-0 flex-1 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start gap-2">
                <p
                  className={`break-words text-sm ${item.readAt ? "font-medium" : "font-semibold"}`}
                >
                  {item.title}
                </p>
                {!item.readAt && (
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-label="Unread"
                  />
                )}
              </div>
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                {item.body}
              </p>
              <time
                dateTime={item.createdAt}
                title={new Date(item.createdAt).toLocaleString()}
                className="mt-1 block text-xs text-muted-foreground"
              >
                {timeLabel(item.createdAt)}
              </time>
            </Link>
            {!item.readAt && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                disabled={read.isPending}
                aria-label={`Mark ${item.title} as read`}
                title="Mark as read"
                onClick={() => read.mutate({ notificationId: item.id })}
              >
                <Check className="size-4" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
function InboxEmpty({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <div className="space-y-2 px-5 py-9 text-center">
      <Inbox className="mx-auto size-7 text-muted-foreground" />
      <p className="text-sm font-medium">
        {unreadOnly ? "You’re all caught up" : "No notifications yet"}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        {unreadOnly
          ? "There are no unread updates in this view."
          : "Updates about your work and account will appear here."}
      </p>
    </div>
  );
}
function InboxFailure({ refresh }: { refresh: () => void }) {
  return (
    <div role="alert" className="space-y-3 p-5 text-sm">
      <p>Notifications could not be loaded. Your other work is unaffected.</p>
      <Button variant="outline" size="sm" onClick={refresh}>
        Try again
      </Button>
    </div>
  );
}
export function NotificationBell() {
  const api = useContext(ApiContext);
  return api ? <ConnectedNotificationBell /> : null;
}
function ConnectedNotificationBell() {
  const session = useSession();
  const [open, setOpen] = useState(false),
    [unreadOnly, setUnreadOnly] = useState(false);
  const q = useApiQuery(
    "notifications",
    { page: 0, size: 5, unreadOnly },
    { enabled: !!session.data?.user, refreshMs: 25000 },
  );
  const all = useApiMutation("readAllNotifications");
  const count = q.isError ? undefined : q.data?.unreadCount;
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void q.refetch();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        >
          <Bell />
          {count !== undefined && count > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        collisionPadding={16}
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b p-4">
          <h2 className="text-sm font-semibold">
            Notifications{" "}
            {count !== undefined && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">{count} unread</span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={!count || all.isPending || !q.data}
            onClick={() => q.data && all.mutate({ before: q.data.asOf })}
            title="Mark all as read"
          >
            <CheckCheck className="size-4" />
            <span className="sr-only">Mark all as read</span>
          </Button>
        </div>
        <div className="flex items-center gap-1 border-b px-3 py-2">
          {[false, true].map((v) => (
            <Button
              key={String(v)}
              variant={v === unreadOnly ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={v === unreadOnly}
              onClick={() => setUnreadOnly(v)}
            >
              {v ? "Unread" : "All"}
            </Button>
          ))}
        </div>
        <div className="max-h-[min(25rem,60vh)] overflow-y-auto" aria-busy={q.isFetching}>
          {q.isPending ? (
            <p role="status" className="p-5 text-sm text-muted-foreground">
              Loading notifications…
            </p>
          ) : q.isError ? (
            <InboxFailure refresh={() => void q.refetch()} />
          ) : q.data?.items.length ? (
            <NotificationList items={q.data.items} compact onNavigate={() => setOpen(false)} />
          ) : (
            <InboxEmpty unreadOnly={unreadOnly} />
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">
              View all notifications <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
export function NotificationCenter() {
  const [page, setPage] = useState(0),
    [unreadOnly, setUnreadOnly] = useState(false),
    [category, setCategory] = useState("");
  const q = useApiQuery(
    "notifications",
    {
      page,
      size: 20,
      unreadOnly,
      ...(category ? { category: category as Request<"notifications">["category"] } : {}),
    },
    { refreshMs: 25000 },
  );
  const all = useApiMutation("readAllNotifications");
  useEffect(() => {
    if (q.data) {
      const last = Math.max(0, Math.ceil(q.data.total / 20) - 1);
      if (page > last) setPage(last);
    }
  }, [q.data, page]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {q.isError
            ? "Inbox unavailable"
            : q.data
              ? `${q.data.unreadCount} unread updates`
              : "Your activity inbox"}{" "}
          · refreshes automatically
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw className={q.isFetching ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!q.data?.unreadCount || all.isPending}
            onClick={() => q.data && all.mutate({ before: q.data.asOf })}
          >
            <CheckCheck className="size-4" />
            Mark all as read
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="flex gap-1">
          {[false, true].map((v) => (
            <Button
              key={String(v)}
              variant={v === unreadOnly ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={v === unreadOnly}
              onClick={() => {
                setUnreadOnly(v);
                setPage(0);
              }}
            >
              {v ? "Unread" : "All notifications"}
            </Button>
          ))}
        </div>
        <div className="min-w-52 flex-1 sm:max-w-xs">
          <SelectField
            label="Activity type"
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(0);
            }}
            options={categories}
          />
        </div>
      </div>
      <section className="overflow-hidden rounded-xl border bg-card" aria-busy={q.isFetching}>
        {q.isPending ? (
          <p role="status" className="p-5 text-sm">
            Loading notifications…
          </p>
        ) : q.isError ? (
          <InboxFailure refresh={() => void q.refetch()} />
        ) : q.data?.items.length ? (
          <NotificationList items={q.data.items} />
        ) : (
          <InboxEmpty unreadOnly={unreadOnly} />
        )}
      </section>
      {q.data && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{q.data.total} matching notifications</p>
          <Pagination
            page={page + 1}
            pageCount={Math.max(1, Math.ceil(q.data.total / 20))}
            onPageChange={(n) => setPage(n - 1)}
          />
        </div>
      )}
    </div>
  );
}

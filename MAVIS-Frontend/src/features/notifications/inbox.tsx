"use client";
import Link from "next/link";
import { useState, useEffect, useContext } from "react";
import { ApiContext } from "@/providers/app-context";
import {
  Bell,
  Loader2,
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
import { useLocale } from "@/lib/i18n/locale-context";
import type { Request, Response } from "@/lib/api/contracts";
import { localizeNotification } from "./localize";

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
const categoryViLabels: Record<string, string> = {
  "All activity": "Tất cả hoạt động",
  Workspaces: "Lớp học",
  Assignments: "Bài tập & Lab",
  "Submissions & feedback": "Bài nộp & nhận xét",
  "Analysis & models": "Phân tích & mô hình",
  "Runtime sessions": "Phiên Runtime",
  "Account access": "Quyền truy cập tài khoản",
  "System alerts": "Cảnh báo hệ thống",
};
export function visibleCategoriesForRole(role?: string | null) {
  if (role === "student") {
    return categories.filter((c) => c.value !== "SYSTEM" && c.value !== "ANALYSIS");
  }
  if (role === "lecturer") {
    return categories.filter((c) => c.value === "" || c.value === "SUBMISSION");
  }
  return categories;
}

export type GroupedNotificationItem = Response<"notifications">["items"][number] & {
  duplicateCount: number;
};

export function groupDuplicateNotifications(
  items: ReadonlyArray<Response<"notifications">["items"][number]>,
): GroupedNotificationItem[] {
  const indexByKey = new Map<string, number>();
  const grouped: GroupedNotificationItem[] = [];
  for (const item of items) {
    const key =
      item.actionRequired && item.assignmentId
        ? `${item.category}|${item.assignmentId}|${item.resolvedAt ? "resolved" : "pending"}`
        : `${item.category}|${item.title}|${item.body}|${item.targetPath}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, grouped.length);
      grouped.push({ ...item, duplicateCount: 1 });
    } else {
      const current = grouped[existingIndex]!;
      grouped[existingIndex] = {
        ...current,
        duplicateCount: current.duplicateCount + 1,
        readAt: current.readAt && item.readAt ? current.readAt : null,
      };
    }
  }
  return grouped;
}
const icons: Record<string, typeof Bell> = {
  WORKSPACE: Users,
  ASSIGNMENT: BookOpen,
  SUBMISSION: FileCheck,
  ANALYSIS: Network,
  RUNTIME: Play,
  ACCOUNT: Shield,
  SYSTEM: Activity,
};
function timeLabel(value: string, locale: "en" | "vi", t: (en: string, vi?: string) => string) {
  const date = new Date(value),
    minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  return minutes < 1
    ? t("Just now", "Vừa xong")
    : minutes < 60
      ? `${minutes} ${t("m ago", "phút trước")}`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} ${t("h ago", "giờ trước")}`
        : date.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US");
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
  const { locale, t } = useLocale();
  const read = useApiMutation("readNotification");
  const groupedItems = groupDuplicateNotifications(items);
  return (
    <ul className="divide-y" aria-label={t("Notifications", "Thông báo")}>
      {groupedItems.map((item) => {
        const Icon = icons[item.category] ?? Bell;
        const localized = localizeNotification(item, locale);
        const displayTitle = item.actionRequired
          ? item.duplicateCount > 1
            ? t(
                `${item.duplicateCount} submissions to review`,
                `${item.duplicateCount} bài nộp cần chấm`,
              )
            : t("Submission to review", "Bài nộp cần chấm")
          : localized.title;
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
                  {displayTitle}
                </p>
                {item.duplicateCount > 1 && !item.actionRequired && (
                  <span className="mt-0.5 shrink-0 rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    ×{item.duplicateCount}
                  </span>
                )}
                {!item.readAt && (
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-label={t("Unread", "Chưa đọc")}
                  />
                )}
              </div>
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                {item.actionRequired && item.contextLabel
                  ? t(`Assignment: ${item.contextLabel}`, `Bài Lab: ${item.contextLabel}`)
                  : localized.body}
              </p>
              {item.actionRequired && (
                <span
                  className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    item.resolvedAt
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {item.resolvedAt ? t("Reviewed", "Đã xử lý") : t("Needs review", "Cần chấm")}
                </span>
              )}
              <time
                dateTime={item.createdAt}
                title={new Date(item.createdAt).toLocaleString(locale === "vi" ? "vi-VN" : "en-US")}
                className="mt-1 block text-xs text-muted-foreground"
              >
                {timeLabel(item.createdAt, locale, t)}
              </time>
            </Link>
            {!item.readAt ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                disabled={read.isPending}
                aria-label={`${t("Mark as read", "Đánh dấu đã đọc")}: ${displayTitle}`}
                title={t("Mark as read", "Đánh dấu đã đọc")}
                onClick={() => read.mutate({ notificationId: item.id })}
              >
                <Check className="size-4" />
              </Button>
            ) : (
              <span
                className="flex size-8 shrink-0 items-center justify-center text-muted-foreground"
                title={t("Read", "Đã đọc")}
                aria-label={t("Read", "Đã đọc")}
              >
                <CheckCheck className="size-4" aria-hidden="true" />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
function InboxEmpty({ unreadOnly, lecturer = false }: { unreadOnly: boolean; lecturer?: boolean }) {
  const { t } = useLocale();
  return (
    <div className="space-y-2 px-5 py-9 text-center">
      <Inbox className="mx-auto size-7 text-muted-foreground" />
      <p className="text-sm font-medium">
        {lecturer
          ? t("No submissions need review", "Không có bài nộp cần chấm")
          : unreadOnly
            ? t("You’re all caught up", "Bạn đã đọc hết thông báo")
            : t("No notifications yet", "Chưa có thông báo nào")}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        {lecturer
          ? t(
              "New and resubmitted student work will appear here.",
              "Bài nộp mới và bài nộp lại của sinh viên sẽ xuất hiện tại đây.",
            )
          : unreadOnly
            ? t(
                "There are no unread updates in this view.",
                "Không có cập nhật chưa đọc nào trong chế độ xem này.",
              )
            : t(
                "Updates about your work and account will appear here.",
                "Các cập nhật về bài học và tài khoản của bạn sẽ hiển thị tại đây.",
              )}
      </p>
    </div>
  );
}
function InboxFailure({ refresh }: { refresh: () => void }) {
  const { t } = useLocale();
  return (
    <div role="alert" className="space-y-3 p-5 text-sm">
      <p>
        {t(
          "Notifications could not be loaded. Your other work is unaffected.",
          "Chưa thể tải thông báo. Các thao tác khác vẫn hoạt động bình thường.",
        )}
      </p>
      <Button variant="outline" size="sm" onClick={refresh}>
        {t("Try again", "Thử lại")}
      </Button>
    </div>
  );
}
export function NotificationBell() {
  const api = useContext(ApiContext);
  return api ? <ConnectedNotificationBell /> : null;
}
function ConnectedNotificationBell() {
  const { t } = useLocale();
  const session = useSession();
  const lecturer = session.data?.user?.role === "lecturer";
  const [open, setOpen] = useState(false),
    [unreadOnly, setUnreadOnly] = useState(false);
  const q = useApiQuery(
    "notifications",
    { page: 0, size: 5, unreadOnly: lecturer ? false : unreadOnly },
    { enabled: !!session.data?.user, refreshMs: 25000 },
  );
  const all = useApiMutation("readAllNotifications");
  const count = q.isError ? undefined : lecturer ? q.data?.actionCount : q.data?.unreadCount;
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
          aria-label={
            count
              ? lecturer
                ? t(`${count} submissions need review`, `${count} bài nộp cần chấm`)
                : t(`Notifications, ${count} unread`, `Thông báo, ${count} chưa đọc`)
              : t("Notifications", "Thông báo")
          }
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
            {lecturer
              ? t("Submissions to review", "Bài nộp cần chấm")
              : t("Notifications", "Thông báo")}{" "}
            {count !== undefined && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {count} {lecturer ? t("pending", "chờ xử lý") : t("unread", "chưa đọc")}
              </span>
            )}
          </h2>
          {!lecturer && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!count || all.isPending || !q.data}
              onClick={() => q.data && all.mutate({ before: q.data.asOf })}
              title={t("Mark all as read", "Đánh dấu tất cả đã đọc")}
            >
              {all.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck className="size-4" />
              )}
              <span className="sr-only">{t("Mark all as read", "Đánh dấu tất cả đã đọc")}</span>
            </Button>
          )}
        </div>
        {!lecturer && (
          <div className="flex items-center gap-1 border-b px-3 py-2">
            {[false, true].map((v) => (
              <Button
                key={String(v)}
                variant={v === unreadOnly ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={v === unreadOnly}
                onClick={() => setUnreadOnly(v)}
              >
                {v ? t("Unread", "Chưa đọc") : t("All", "Tất cả")}
              </Button>
            ))}
          </div>
        )}
        <div className="max-h-[min(25rem,60vh)] overflow-y-auto" aria-busy={q.isFetching}>
          {q.isPending ? (
            <p role="status" className="p-5 text-sm text-muted-foreground">
              {t("Loading notifications…", "Đang tải thông báo…")}
            </p>
          ) : q.isError ? (
            <InboxFailure refresh={() => void q.refetch()} />
          ) : q.data?.items.length ? (
            <NotificationList items={q.data.items} compact onNavigate={() => setOpen(false)} />
          ) : q.isFetching && unreadOnly && (q.data?.unreadCount ?? 0) > 0 ? (
            <p role="status" className="p-5 text-sm text-muted-foreground">
              {t("Refreshing unread notifications…", "Đang làm mới thông báo chưa đọc…")}
            </p>
          ) : (
            <InboxEmpty unreadOnly={unreadOnly} lecturer={lecturer} />
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">
              {lecturer
                ? t("View all submissions", "Xem tất cả bài nộp")
                : t("View all notifications", "Xem tất cả thông báo")}{" "}
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
export function NotificationCenter() {
  const { t } = useLocale();
  const session = useSession();
  const lecturer = session.data?.user?.role === "lecturer";
  const roleCategories = visibleCategoriesForRole(session.data?.user?.role);
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
            ? t("Inbox unavailable", "Hộp thư tạm thời không khả dụng")
            : q.data
              ? lecturer
                ? `${q.data.actionCount} ${t("submissions need review", "bài nộp cần chấm")}`
                : `${q.data.unreadCount} ${t("unread updates", "thông báo chưa đọc")}`
              : t("Your activity inbox", "Hộp thư hoạt động của bạn")}{" "}
          · {t("refreshes automatically", "tự động làm mới")}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw className={q.isFetching ? "size-4 animate-spin" : "size-4"} />
            {t("Refresh", "Làm mới")}
          </Button>
          {!lecturer && (
            <Button
              variant="outline"
              size="sm"
              disabled={!q.data?.unreadCount || all.isPending}
              onClick={() => q.data && all.mutate({ before: q.data.asOf })}
            >
              {all.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck className="size-4" />
              )}
              {t("Mark all as read", "Đánh dấu tất cả đã đọc")}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        {!lecturer && (
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
                {v ? t("Unread", "Chưa đọc") : t("All notifications", "Tất cả thông báo")}
              </Button>
            ))}
          </div>
        )}
        {!lecturer && (
          <div className="min-w-52 flex-1 sm:max-w-xs">
            <SelectField
              label={t("Activity type", "Loại hoạt động")}
              value={category}
              onChange={(v) => {
                setCategory(v);
                setPage(0);
              }}
              options={roleCategories.map((item) => ({
                value: item.value,
                label: t(item.label, categoryViLabels[item.label] ?? item.label),
              }))}
            />
          </div>
        )}
        {lecturer && (
          <p className="text-sm text-muted-foreground">
            {t(
              "Only student submissions that require grading are shown here.",
              "Chỉ hiển thị bài nộp của sinh viên cần giảng viên chấm.",
            )}
          </p>
        )}
      </div>
      <section className="overflow-hidden rounded-xl border bg-card" aria-busy={q.isFetching}>
        {q.isPending ? (
          <p role="status" className="p-5 text-sm">
            {t("Loading notifications…", "Đang tải thông báo…")}
          </p>
        ) : q.isError ? (
          <InboxFailure refresh={() => void q.refetch()} />
        ) : q.data?.items.length ? (
          <NotificationList items={q.data.items} />
        ) : q.isFetching && unreadOnly && (q.data?.unreadCount ?? 0) > 0 ? (
          <p role="status" className="p-5 text-sm text-muted-foreground">
            {t("Refreshing unread notifications…", "Đang làm mới thông báo chưa đọc…")}
          </p>
        ) : (
          <InboxEmpty unreadOnly={unreadOnly} lecturer={lecturer} />
        )}
      </section>
      {q.data && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {q.data.total} {t("matching notifications", "thông báo phù hợp")}
          </p>
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

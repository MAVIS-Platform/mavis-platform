"use client";

import { useState } from "react";
import { Megaphone, Pencil, Pin, Send, Undo2, Trash2 } from "lucide-react";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import { useLocale } from "@/lib/i18n/locale-context";
import type { Response } from "@/lib/api/contracts";

type Announcement = Response<"adminAnnouncements">[number];
type Priority = Announcement["priority"];
type Audience = Announcement["audienceType"];
type Status = Announcement["status"];

function priorityText(value: Priority, t: (en: string, vi?: string) => string) {
  switch (value) {
    case "LOW":
      return t("Low", "Thấp");
    case "HIGH":
      return t("High", "Cao");
    case "URGENT":
      return t("Urgent", "Khẩn cấp");
    default:
      return t("Normal", "Bình thường");
  }
}

function audienceText(value: Audience, t: (en: string, vi?: string) => string) {
  switch (value) {
    case "STUDENT":
      return t("Students", "Sinh viên");
    case "LECTURER":
      return t("Lecturers", "Giảng viên");
    default:
      return t("Everyone", "Mọi người");
  }
}

function announcementStatusText(value: Status, t: (en: string, vi?: string) => string) {
  switch (value) {
    case "DRAFT":
      return t("Draft", "Bản nháp");
    case "SCHEDULED":
      return t("Scheduled", "Đã lên lịch");
    case "PUBLISHED":
      return t("Published", "Đã công bố");
    case "EXPIRED":
      return t("Expired", "Hết hạn");
    case "ARCHIVED":
      return t("Archived", "Đã lưu trữ");
    default:
      return value;
  }
}

const emptyForm = {
  title: "",
  content: "",
  priority: "NORMAL" as Priority,
  audienceType: "ALL" as Audience,
  pinned: false,
  publishAt: "",
  expireAt: "",
};

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function iso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function AdminAnnouncements() {
  const { locale, t } = useLocale();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | undefined>();
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState(emptyForm);
  const announcements = useApiQuery("adminAnnouncements", { search, status });
  const create = useApiMutation("createAnnouncement");
  const update = useApiMutation("updateAnnouncement");
  const publish = useApiMutation("publishAnnouncement");
  const unpublish = useApiMutation("unpublishAnnouncement");
  const remove = useApiMutation("deleteAnnouncement");
  const saving = create.isPending || update.isPending;
  const actionError =
    create.error || update.error || publish.error || unpublish.error || remove.error;

  function reset() {
    setEditingId(undefined);
    setForm(emptyForm);
  }

  function edit(item: Announcement) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      content: item.content,
      priority: item.priority,
      audienceType: item.audienceType,
      pinned: item.pinned,
      publishAt: localDateTime(item.publishAt),
      expireAt: localDateTime(item.expireAt),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      title: form.title,
      content: form.content,
      priority: form.priority,
      status: "DRAFT" as const,
      audienceType: form.audienceType,
      pinned: form.pinned,
      publishAt: iso(form.publishAt),
      expireAt: iso(form.expireAt),
      workspaceIds: [],
    };
    if (editingId) {
      update.mutate({ ...payload, announcementId: editingId }, { onSuccess: reset });
    } else {
      create.mutate(payload, { onSuccess: reset });
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Megaphone className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {editingId
                ? t("Edit announcement", "Chỉnh sửa thông báo")
                : t("Create announcement", "Tạo thông báo mới")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Announcements are administrator-authored site content. They are separate from personal notifications.",
                "Thông báo hệ thống do quản trị viên phát hành toàn trang, tách biệt với thông báo cá nhân.",
              )}
            </p>
          </div>
        </div>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm font-medium">
            {t("Title", "Tiêu đề")}
            <Input
              required
              maxLength={160}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t("Content", "Nội dung")}
            <Textarea
              required
              rows={5}
              maxLength={12000}
              value={form.content}
              onChange={(event) =>
                setForm((current) => ({ ...current, content: event.target.value }))
              }
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-medium">
              {t("Priority", "Mức ưu tiên")}
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({ ...current, priority: event.target.value as Priority }))
                }
              >
                {(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map((value) => (
                  <option key={value} value={value}>
                    {priorityText(value, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("Audience", "Đối tượng")}
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.audienceType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    audienceType: event.target.value as Audience,
                  }))
                }
              >
                <option value="ALL">{t("Everyone", "Mọi người")}</option>
                <option value="STUDENT">{t("Students", "Sinh viên")}</option>
                <option value="LECTURER">{t("Lecturers", "Giảng viên")}</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("Publish at", "Thời điểm công bố")}
              <Input
                type="datetime-local"
                value={form.publishAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, publishAt: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("Expires at", "Thời điểm hết hạn")}
              <Input
                type="datetime-local"
                value={form.expireAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expireAt: event.target.value }))
                }
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(event) =>
                setForm((current) => ({ ...current, pinned: event.target.checked }))
              }
            />
            {t("Pin this announcement", "Ghim thông báo này")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving || !form.title.trim() || !form.content.trim()}>
              {saving
                ? t("Saving…", "Đang lưu…")
                : editingId
                  ? t("Save draft", "Lưu bản nháp")
                  : t("Create draft", "Tạo bản nháp")}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={reset}>
                {t("Cancel", "Hủy")}
              </Button>
            )}
          </div>
        </form>
        {actionError && (
          <div className="mt-4">
            <ErrorState error={actionError} />
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="announcement-list-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="announcement-list-title" className="text-xl font-semibold">
              {t("Announcements", "Thông báo hệ thống")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Draft, schedule, publish or remove MAVIS site announcements.",
                "Soạn nháp, lên lịch, công bố hoặc gỡ thông báo toàn trang MAVIS.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-64"
              placeholder={t("Search announcements", "Tìm kiếm thông báo")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="h-10 rounded-md border bg-card px-3 text-sm"
              value={status ?? ""}
              onChange={(event) =>
                setStatus((event.target.value || undefined) as Status | undefined)
              }
            >
              <option value="">{t("All statuses", "Tất cả trạng thái")}</option>
              {(["DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED", "ARCHIVED"] as const).map(
                (value) => (
                  <option key={value} value={value}>
                    {announcementStatusText(value, t)}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        <RequestState query={announcements} empty={false}>
          {announcements.data?.length ? (
            <div className="grid gap-3">
              {announcements.data.map((item) => (
                <article key={item.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.pinned && (
                          <Pin className="size-4 text-primary" aria-label={t("Pinned", "Đã ghim")} />
                        )}
                        <h3 className="font-semibold">{item.title}</h3>
                        <Badge>{announcementStatusText(item.status, t)}</Badge>
                        <Badge variant="outline">{priorityText(item.priority, t)}</Badge>
                        <Badge variant="secondary">{audienceText(item.audienceType, t)}</Badge>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {item.content}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t("Updated", "Cập nhật lúc")}{" "}
                        {new Date(item.updatedAt).toLocaleString(locale === "vi" ? "vi-VN" : "en-US")}{" "}
                        {t("by", "bởi")} {item.createdByName}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => edit(item)}>
                        <Pencil className="size-4" />
                        {t("Edit", "Sửa")}
                      </Button>
                      {item.status === "PUBLISHED" || item.status === "SCHEDULED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unpublish.isPending}
                          onClick={() => unpublish.mutate({ announcementId: item.id })}
                        >
                          <Undo2 className="size-4" />
                          {t("Unpublish", "Gỡ công bố")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={publish.isPending}
                          onClick={() => publish.mutate({ announcementId: item.id })}
                        >
                          <Send className="size-4" />
                          {t("Publish", "Công bố")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              t(`Delete “${item.title}”?`, `Xóa thông báo “${item.title}”?`),
                            )
                          )
                            remove.mutate({ announcementId: item.id });
                        }}
                      >
                        <Trash2 className="size-4" />
                        {t("Delete", "Xóa")}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              {t(
                "No announcements match the current filters.",
                "Không có thông báo nào khớp bộ lọc hiện tại.",
              )}
            </p>
          )}
        </RequestState>
      </section>
    </div>
  );
}

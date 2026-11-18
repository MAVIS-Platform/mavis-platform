"use client";

import { useState } from "react";
import { Megaphone, Pencil, Pin, Send, Undo2, Trash2 } from "lucide-react";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ErrorState, RequestState } from "@/components/shared/request-state";
import type { Response } from "@/lib/api/contracts";

type Announcement = Response<"adminAnnouncements">[number];
type Priority = Announcement["priority"];
type Audience = Announcement["audienceType"];
type Status = Announcement["status"];

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
              {editingId ? "Edit announcement" : "Create announcement"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Announcements are administrator-authored site content. They are separate from personal
              notifications.
            </p>
          </div>
        </div>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm font-medium">
            Title
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
            Content
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
              Priority
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({ ...current, priority: event.target.value as Priority }))
                }
              >
                {(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Audience
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
                <option value="ALL">Everyone</option>
                <option value="STUDENT">Students</option>
                <option value="LECTURER">Lecturers</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Publish at
              <Input
                type="datetime-local"
                value={form.publishAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, publishAt: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Expires at
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
            Pin this announcement
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving || !form.title.trim() || !form.content.trim()}>
              {saving ? "Saving…" : editingId ? "Save draft" : "Create draft"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={reset}>
                Cancel
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
              Announcements
            </h2>
            <p className="text-sm text-muted-foreground">
              Draft, schedule, publish or remove MAVIS site announcements.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-64"
              placeholder="Search announcements"
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
              <option value="">All statuses</option>
              {(["DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED", "ARCHIVED"] as const).map(
                (value) => (
                  <option key={value}>{value}</option>
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
                        {item.pinned && <Pin className="size-4 text-primary" aria-label="Pinned" />}
                        <h3 className="font-semibold">{item.title}</h3>
                        <Badge>{item.status}</Badge>
                        <Badge variant="outline">{item.priority}</Badge>
                        <Badge variant="secondary">{item.audienceType}</Badge>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {item.content}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Updated {new Date(item.updatedAt).toLocaleString()} by {item.createdByName}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => edit(item)}>
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      {item.status === "PUBLISHED" || item.status === "SCHEDULED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unpublish.isPending}
                          onClick={() => unpublish.mutate({ announcementId: item.id })}
                        >
                          <Undo2 className="size-4" />
                          Unpublish
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={publish.isPending}
                          onClick={() => publish.mutate({ announcementId: item.id })}
                        >
                          <Send className="size-4" />
                          Publish
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete “${item.title}”?`))
                            remove.mutate({ announcementId: item.id });
                        }}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              No announcements match the current filters.
            </p>
          )}
        </RequestState>
      </section>
    </div>
  );
}

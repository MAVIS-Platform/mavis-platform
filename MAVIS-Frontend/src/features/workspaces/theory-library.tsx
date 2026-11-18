"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { useSelection } from "@/hooks/use-api";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";

type TheoryAsset = {
  id: string;
  title: string;
  body: string;
  language: string;
  style: string;
  source: string;
  sourceUrl: string | null;
  licenseNote: string | null;
  version: number;
  updatedAt: string;
  createdByName: string | null;
};

type Draft = {
  title: string;
  body: string;
  language: string;
  style: string;
  source: string;
  sourceUrl: string;
  licenseNote: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  language: "vi",
  style: "CUSTOM",
  source: "LECTURER",
  sourceUrl: "",
  licenseNote: "",
};

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function TheoryLibrary() {
  const { t, locale } = useLocale();
  const { workspaceId } = useSelection();
  const cache = useQueryClient();
  const course = useCourseAuthoring(workspaceId);
  const [search, setSearch] = useState("");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState("");

  const assets = useQuery({
    queryKey: ["api", "theory-assets", workspaceId],
    queryFn: ({ signal }) =>
      api<TheoryAsset[]>(`workspaces/${workspaceId}/theory-assets`, { signal }),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (assets.data ?? []).filter(
      (asset) =>
        !term ||
        asset.title.toLowerCase().includes(term) ||
        asset.body.toLowerCase().includes(term),
    );
  }, [assets.data, search]);

  const invalidate = () => {
    void cache.invalidateQueries({ queryKey: ["api", "theory-assets", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
  };

  const save = useMutation({
    mutationFn: () =>
      editorId && editorId !== "new"
        ? api<TheoryAsset>(`workspaces/${workspaceId}/theory-assets/${editorId}`, {
            method: "PUT",
            body: JSON.stringify(draft),
          })
        : api<TheoryAsset>(`workspaces/${workspaceId}/theory-assets`, {
            method: "POST",
            body: JSON.stringify({ ...draft, language: locale }),
          }),
    onSuccess: () => {
      invalidate();
      setEditorId(null);
      setDraft(EMPTY_DRAFT);
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });

  const remove = useMutation({
    mutationFn: (assetId: string) =>
      api<null>(`workspaces/${workspaceId}/theory-assets/${assetId}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });

  if (!workspaceId) {
    return <p className="text-sm text-muted-foreground">{t("Select a class first.", "Hãy chọn lớp trước.")}</p>;
  }

  const startNew = () => {
    setEditorId("new");
    setDraft({ ...EMPTY_DRAFT, language: locale });
    setError("");
  };
  const startEdit = (asset: TheoryAsset) => {
    setEditorId(asset.id);
    setDraft({
      title: asset.title,
      body: asset.body,
      language: asset.language,
      style: asset.style,
      source: asset.source,
      sourceUrl: asset.sourceUrl ?? "",
      licenseNote: asset.licenseNote ?? "",
    });
    setError("");
  };
  const editing = editorId !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "Reusable Markdown lessons for this class. Write or import a .md file once, then attach it to any Lab.",
              "Kho bài giảng Markdown dùng chung cho lớp. Soạn hoặc nhập file .md một lần, sau đó gắn vào bất kỳ bài Lab nào.",
            )}
          </p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {assets.data?.length ?? 0} {t("lessons", "bài học")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="h-9 w-full pl-8 sm:w-56"
              value={search}
              placeholder={t("Search lessons", "Tìm bài học")}
              aria-label={t("Search lessons", "Tìm bài học")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="button" size="sm" onClick={startNew}>
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {t("New lesson", "Bài mới")}
          </Button>
        </div>
      </div>

      {course.data?.status === "DRAFT" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>
            {t(
              "The course draft has unpublished changes. Students still read the last published version.",
              "Bản nháp Course có thay đổi chưa công bố. Sinh viên vẫn đọc phiên bản đã publish gần nhất.",
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={course.publish.isPending}
            onClick={() => course.publish.mutate()}
          >
            {course.publish.isPending
              ? t("Publishing…", "Đang công bố…")
              : t("Publish course version", "Công bố phiên bản Course")}
          </Button>
        </div>
      )}
      {course.publish.isSuccess && (
        <p role="status" className="text-xs text-success">
          {t(
            `Published course version ${course.publish.data.version}. Students now read the updated theory.`,
            `Đã công bố Course phiên bản ${course.publish.data.version}. Sinh viên đã đọc lý thuyết cập nhật.`,
          )}
        </p>
      )}
      {course.publish.error && (
        <p role="alert" className="text-xs text-destructive">
          {course.publish.error.message}
        </p>
      )}

      {editing && (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <h2 className="text-sm font-semibold">
              {editorId === "new"
                ? t("New theory lesson", "Bài lý thuyết mới")
                : t("Edit theory lesson", "Sửa bài lý thuyết")}
            </h2>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Import Markdown (.md)", "Nhập file Markdown (.md)")}
                <input
                  className="sr-only"
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void file.text().then((text) => {
                      setDraft((current) => ({
                        ...current,
                        body: text,
                        source: "IMPORT",
                        title: current.title || file.name.replace(/\.(md|markdown|txt)$/i, ""),
                      }));
                    });
                    event.target.value = "";
                  }}
                />
              </label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditorId(null)}>
                {t("Cancel", "Huỷ")}
              </Button>
            </div>
          </div>

          <label className="block space-y-1.5 text-xs font-medium">
            <span>{t("Lesson title", "Tiêu đề bài học")}</span>
            <Input
              value={draft.title}
              placeholder={t(
                "e.g. Service boundaries and resilience patterns",
                "Ví dụ: Ranh giới dịch vụ và mẫu chịu lỗi",
              )}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              <span>{t("Lesson body (Markdown)", "Nội dung bài học (Markdown)")}</span>
              <Textarea
                rows={12}
                className="h-80 resize-none font-mono text-sm leading-6"
                value={draft.body}
                placeholder={t(
                  "# Lesson heading\n\nWrite or import Markdown content for students…",
                  "# Tiêu đề bài giảng\n\nViết hoặc nhập file Markdown cho sinh viên…",
                )}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              />
            </label>
            <div className="flex flex-col gap-1.5 text-xs font-medium">
              <span>{t("Student Preview", "Xem trước như sinh viên")}</span>
              <div className="h-80 overflow-y-auto rounded-lg border bg-background p-4">
                {draft.body.trim() ? (
                  <MarkdownPreview markdown={draft.body} />
                ) : (
                  <p className="text-sm font-normal text-muted-foreground">
                    {t("Markdown preview appears here.", "Bản xem trước Markdown hiện ở đây.")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            {error && (
              <span role="alert" className="mr-auto text-xs text-destructive">
                {error}
              </span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setEditorId(null)}>
              {t("Cancel", "Huỷ")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={save.isPending || !draft.title.trim() || !draft.body.trim()}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t("Saving…", "Đang lưu…") : t("Save lesson", "Lưu bài học")}
            </Button>
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="hidden items-center gap-4 border-b bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_8rem_8rem]">
          <span>{t("Lesson", "Bài học")}</span>
          <span>{t("Updated", "Cập nhật")}</span>
          <span className="text-right">{t("Actions", "Thao tác")}</span>
        </div>
        {assets.isPending ? (
          <p className="p-4 text-sm text-muted-foreground">{t("Loading lessons…", "Đang tải bài học…")}</p>
        ) : visible.length === 0 ? (
          <div className="space-y-2 p-4">
            <p className="text-sm text-muted-foreground">
              {assets.data?.length
                ? t("No lesson matches this search.", "Không có bài nào khớp tìm kiếm.")
                : t(
                    "The library is empty. Create the first lesson or save one from a Lab's Theory step.",
                    "Thư viện đang trống. Tạo bài đầu tiên hoặc lưu từ bước Lý thuyết của Lab.",
                  )}
            </p>
            {!assets.data?.length && (
              <Button type="button" size="sm" variant="outline" onClick={startNew}>
                <Plus className="mr-1 size-4" aria-hidden="true" />
                {t("Create the first lesson", "Tạo bài đầu tiên")}
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((asset) => (
              <li
                key={asset.id}
                className="grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_8rem_8rem] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{asset.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {asset.body.replace(/[#*_>`-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)}
                  </p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  v{asset.version} · {shortDate(asset.updatedAt)}
                </span>
                <div className="flex items-center gap-1 md:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("Edit lesson", "Sửa bài học")}
                    onClick={() => startEdit(asset)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("Delete lesson", "Xoá bài học")}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "Delete this lesson from the library? Labs keep their materialized copy.",
                            "Xoá bài này khỏi thư viện? Các Lab vẫn giữ bản đã gắn.",
                          ),
                        )
                      )
                        remove.mutate(asset.id);
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {remove.error && (
        <p role="alert" className="text-xs text-destructive">
          {remove.error.message}
        </p>
      )}
    </div>
  );
}

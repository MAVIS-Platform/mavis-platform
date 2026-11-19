"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  GitBranch,
  Library,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/mainflow-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MARKDOWN_THEMES,
  MarkdownPreview,
  applyMarkdownTheme,
  extractMarkdownTheme,
  type MarkdownTheme,
} from "@/components/shared/markdown-preview";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { ArchitectureDiagrams } from "@/features/architecture/architecture-diagrams";
import { ArchitectureGraph, ElementDetailsPanel } from "@/features/architecture/components";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import {
  useCourseAuthoring,
  useStudentLabContext,
} from "@/features/workspaces/course-access";
import { AssignmentSourceDetails } from "./source-picker";
import type { Assignment } from "./requirements";

type TheoryItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  assignmentId: string | null;
  content: Record<string, unknown>;
  required: boolean;
};

type TheoryModule = {
  id: string;
  title: string;
  position: number;
  items: TheoryItem[];
};

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

type AttachedTheory = {
  assetId: string;
  title: string;
  style: string;
  source: string;
  courseItemId: string | null;
};

function bodyOf(item: TheoryItem) {
  return typeof item.content["body"] === "string" ? item.content["body"] : "";
}

export function smartFormatMarkdown(raw: string): string {
  const normalized = raw.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const out: string[] = [];
  let inCode = false;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(paragraph.join(" "));
    paragraph = [];
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      inCode = !inCode;
      out.push(line);
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed) || /^>\s+/.test(trimmed) || /^\|.*\|$/.test(trimmed)) {
      flushParagraph();
      out.push(trimmed);
      continue;
    }
    if (/^[•▪◦●■–—]\s*/.test(trimmed)) {
      flushParagraph();
      out.push(`- ${trimmed.replace(/^[•▪◦●■–—]\s*/, "")}`);
      continue;
    }
    if (/^([-*+]|\d+[.)])\s+/.test(trimmed)) {
      flushParagraph();
      out.push(trimmed);
      continue;
    }
    if (/^(note|important|tip|warning|lưu ý|chú ý)\s*[:：]\s*/i.test(trimmed)) {
      flushParagraph();
      out.push(`> **${trimmed.replace(/\s*[:：]\s*/, ":** ")}`);
      continue;
    }
    if (
      /^(chapter|chương|phần|section|bài)\s+\d+([.:]\s*|\s+).+/i.test(trimmed) ||
      (/^[A-ZÀ-Ỹ0-9][A-ZÀ-Ỹ0-9\s\-:&/]{3,70}$/.test(trimmed) && /[A-ZÀ-Ỹ]/.test(trimmed))
    ) {
      flushParagraph();
      if (out.length && out[out.length - 1] !== "") out.push("");
      out.push(`## ${trimmed}`);
      out.push("");
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function MarkdownEditor({
  label,
  value,
  onChange,
  theme,
  onThemeChange,
  title,
  t,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: MarkdownTheme;
  onThemeChange: (next: MarkdownTheme) => void;
  title?: string | undefined;
  t: (en: string, vi: string) => string;
}) {
  const [mode, setMode] = useState<"write" | "preview" | "split">("write");
  const activeThemeMeta = MARKDOWN_THEMES.find((item) => item.id === theme) ?? MARKDOWN_THEMES[0]!;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("Lesson theme", "Theme trình bày")}
            className="h-7 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            value={theme}
            onChange={(event) => {
              onThemeChange(event.target.value as MarkdownTheme);
              if (mode === "write") {
                setMode(
                  typeof window !== "undefined" && window.innerWidth >= 1024 ? "split" : "preview",
                );
              }
            }}
          >
            {MARKDOWN_THEMES.map((item) => (
              <option key={item.id} value={item.id}>
                {t("Theme", "Theme")}: {t(item.en, item.vi)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={!value.trim()}
            onClick={() => onChange(smartFormatMarkdown(value))}
          >
            <Sparkles className="mr-1 size-3" aria-hidden="true" />
            {t("Smart Format", "Định dạng thông minh")}
          </Button>
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("write")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                mode === "write"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Write", "Soạn thảo")}
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                mode === "preview"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Preview", "Xem trước")}
            </button>
            <button
              type="button"
              onClick={() => setMode("split")}
              className={`hidden rounded-md px-2.5 py-1 font-medium transition-colors lg:inline-block ${
                mode === "split"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("Split view", "Song song")}
            </button>
          </div>
        </div>
      </div>

      <div className={mode === "split" ? "grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2" : "block"}>
        {(mode === "write" || mode === "split") && (
          <Textarea
            rows={14}
            value={value}
            className="h-96 w-full resize-none rounded-xl border bg-background p-4 font-mono text-sm leading-6 shadow-2xs"
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        {(mode === "preview" || mode === "split") && (
          <div className="h-96 w-full overflow-y-auto rounded-xl border bg-background p-4 shadow-2xs">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b pb-2.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                📖 {t(activeThemeMeta.en, activeThemeMeta.vi)}
              </span>
              {title && <span className="text-sm font-semibold text-foreground">{title}</span>}
            </div>
            {value.trim() ? (
              <MarkdownPreview markdown={value} theme={theme} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("Markdown preview appears here.", "Bản xem trước Markdown hiện ở đây.")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function LabTheorySection({
  workspaceId,
  workspaceName: _workspaceName,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  workspaceName: string;
  assignment: Assignment;
  onNavigate: (tab: "source" | "quiz") => void;
}) {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const course = useCourseAuthoring(workspaceId);
  const libraryQuery = useQuery({
    queryKey: ["api", "theory-assets", workspaceId],
    queryFn: ({ signal }) => api<TheoryAsset[]>(`workspaces/${workspaceId}/theory-assets`, { signal }),
    retry: false,
  });
  const attachedQuery = useQuery({
    queryKey: ["api", "lab-theory-assets", workspaceId, assignment.id],
    queryFn: ({ signal }) =>
      api<AttachedTheory[]>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets`,
        { signal },
      ),
    retry: false,
  });

  function invalidateTheory() {
    void cache.invalidateQueries({ queryKey: ["api", "theory-assets", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "lab-theory-assets", workspaceId, assignment.id] });
    void cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
  }

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newTheme, setNewTheme] = useState<MarkdownTheme>("coursera");
  const [libraryItemId, setLibraryItemId] = useState("");
  const [draftSource, setDraftSource] = useState<"LECTURER" | "IMPORT" | "AI">("LECTURER");
  const [aiNote, setAiNote] = useState("");
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [themes, setThemes] = useState<Record<string, MarkdownTheme>>({});
  const [c4Tab, setC4Tab] = useState<"CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH">("CONTEXT");
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [authorMode, setAuthorMode] = useState<"write" | "library">("write");

  const attachAsset = useMutation({
    mutationFn: async (assetId: string) => {
      const attached = await api<AttachedTheory>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets`,
        {
          method: "POST",
          body: JSON.stringify({ assetId }),
        },
      );
      await course.publish.mutateAsync().catch(() => undefined);
      return attached;
    },
    onSuccess: () => {
      invalidateTheory();
      setLibraryItemId("");
    },
  });
  const detachAsset = useMutation({
    mutationFn: (assetId: string) =>
      api<null>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets/${assetId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => invalidateTheory(),
  });
  const saveToLibrary = useMutation({
    mutationFn: async () => {
      const asset = await api<TheoryAsset>(`workspaces/${workspaceId}/theory-assets`, {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          body: applyMarkdownTheme(newBody.trim(), newTheme),
          language: locale,
          style: "CUSTOM",
          source: draftSource,
        }),
      });
      await api<AttachedTheory>(`workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets`, {
        method: "POST",
        body: JSON.stringify({ assetId: asset.id }),
      });
      await course.publish.mutateAsync().catch(() => undefined);
      return asset;
    },
    onSuccess: () => {
      invalidateTheory();
      setNewTitle("");
      setNewBody("");
      setNewTheme("coursera");
      setDraftSource("LECTURER");
      setAiNote("");
    },
  });
  const generateDraft = useMutation({
    mutationFn: () =>
      api<{ title: string; body: string; providerMode: string; evidenceCount: number }>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            topic: newTitle.trim() || assignment.title,
            language: locale,
            style: "CUSTOM",
          }),
        },
      ),
    onSuccess: (draft) => {
      const parsed = extractMarkdownTheme(draft.body);
      setNewTitle(draft.title);
      setNewBody(parsed.body);
      setNewTheme(parsed.theme);
      setDraftSource("AI");
      setAiNote(
        t(
          `AI draft from ${draft.evidenceCount} evidence excerpt(s). Review it, then click 'Save to library & attach'.`,
          `Bản nháp AI từ ${draft.evidenceCount} bằng chứng. Hãy kiểm tra rồi bấm 'Lưu vào thư viện & gắn'.`,
        ),
      );
    },
  });

  const isPublished = course.data?.status === "PUBLISHED";
  const savingBusy =
    syncStatus === "saving" ||
    course.startDraft.isPending ||
    course.updateItem.isPending ||
    course.publish.isPending;

  const modules = (course.data?.modules as TheoryModule[] | undefined) ?? [];
  const linkedModule = modules.find((module) =>
    module.items.some((item) => item.assignmentId === assignment.id),
  );
  const selectedModule = linkedModule ?? modules[0];

  async function saveWithAutoPublish(
    task: (
      activeCourse: NonNullable<typeof course.data>,
      activeModule: TheoryModule,
    ) => Promise<void>,
  ) {
    if (!selectedModule || !course.data) return;
    setSyncStatus("saving");
    try {
      if (isPublished) {
        const draft = await course.startDraft.mutateAsync();
        const draftModules = (draft.modules as TheoryModule[] | undefined) ?? [];
        const matchedModule =
          draftModules.find(
            (m) =>
              m.id === selectedModule.id ||
              (m.position === selectedModule.position && m.title === selectedModule.title),
          ) ?? draftModules[0];
        if (!matchedModule) throw new Error("Module not found in draft");
        await task(draft, matchedModule);
        await course.publish.mutateAsync();
      } else {
        await task(course.data, selectedModule);
      }
      setSyncStatus("saved");
    } catch {
      setSyncStatus("idle");
    }
  }

  const libraryAssets = libraryQuery.data ?? [];
  const attachedAssets = attachedQuery.data ?? [];
  const selectedLibraryAsset = libraryAssets.find((asset) => asset.id === libraryItemId);
  const reference = assignment.referenceSource;
  const studentCtx = useStudentLabContext(
    workspaceId,
    assignment.id,
    Boolean(reference?.projectId && reference?.modelId),
  );
  const modelQuery = useApiQuery(
    "model",
    {
      projectId: reference?.projectId ?? "",
      modelId: reference?.modelId ?? "",
    },
    { enabled: Boolean(reference?.projectId && reference?.modelId) },
  );
  const refArch = studentCtx.data?.referenceArchitecture;
  const activeDiagramMermaid =
    refArch?.diagrams?.find((d) => d.level?.toUpperCase() === c4Tab)?.mermaidDsl ?? null;

  useEffect(() => {
    if (!selectedModule) return;
    const nextBodies: Record<string, string> = {};
    const nextThemes: Record<string, MarkdownTheme> = {};
    for (const item of selectedModule.items) {
      if (item.type !== "THEORY") continue;
      const parsed = extractMarkdownTheme(bodyOf(item));
      nextBodies[item.id] = parsed.body;
      nextThemes[item.id] = parsed.theme;
    }
    setBodies(nextBodies);
    setThemes(nextThemes);
  }, [selectedModule?.id, selectedModule?.items.length]);

  const theoryItems =
    selectedModule?.items.filter(
      (item) => item.type === "THEORY" && (!item.assignmentId || item.assignmentId === assignment.id),
    ) ?? [];

  return (
    <div className="space-y-5">
      {course.data?.status === "DRAFT" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
          <span>
            {t(
              "Theory changes live in the Course draft. Publish the course version when ready so students see the latest lesson.",
              "Thay đổi lý thuyết đang ở bản nháp Course. Bấm công bố phiên bản để sinh viên đọc bài mới nhất.",
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
            `Published course version ${course.publish.data.version}.`,
            `Đã công bố Course phiên bản ${course.publish.data.version}.`,
          )}
        </p>
      )}

      <section className="space-y-5 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold">
              {t("Lab Theory Lesson", "Bài giảng lý thuyết của Lab")}
            </h2>
            {theoryItems.length > 0 && (
              <Badge variant="success">
                {theoryItems.length} {t("attached", "đã gắn")}
              </Badge>
            )}
          </div>
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setAuthorMode("write")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                authorMode === "write"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ✍️ {t("Write / Import / AI", "Tự soạn / Nhập file / AI")}
            </button>
            <button
              type="button"
              onClick={() => setAuthorMode("library")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                authorMode === "library"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📚 {t("Theory library", "Thư viện lý thuyết")} ({libraryAssets.length})
            </button>
          </div>
        </div>

        {theoryItems.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Attached lessons in this Lab", "Bài giảng đã gắn vào Lab này")} ({theoryItems.length})
            </p>
            <ul className="space-y-3">
              {theoryItems.map((item) => {
                const linkedAsset = attachedAssets.find(
                  (asset) => asset.courseItemId === item.id || asset.title === item.title,
                );
                return (
                  <li key={item.id} className="space-y-3 rounded-xl border bg-muted/15 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                          📖 {t("Lesson", "Bài giảng")}
                        </span>
                        <span className="text-sm font-semibold">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {linkedAsset && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={detachAsset.isPending}
                            aria-label={t("Detach lesson", "Gỡ bài học")}
                            onClick={() => detachAsset.mutate(linkedAsset.assetId)}
                          >
                            <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
                            {t("Detach", "Gỡ")}
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingBusy}
                          onClick={() =>
                            void saveWithAutoPublish(async (_draft, mod) => {
                              const targetItem =
                                mod.items.find(
                                  (it) =>
                                    it.id === item.id ||
                                    (it.type === "THEORY" &&
                                      (it.assignmentId === item.assignmentId || it.title === item.title)),
                                ) ?? item;
                              const fallback = extractMarkdownTheme(bodyOf(item));
                              const cleanBody = bodies[item.id] ?? fallback.body;
                              const activeItemTheme = themes[item.id] ?? fallback.theme;
                              await course.updateItem.mutateAsync({
                                moduleId: mod.id,
                                itemId: targetItem.id,
                                type: "THEORY",
                                title: item.title,
                                description: item.description ?? "",
                                required: item.required,
                                assignmentId: item.assignmentId ?? assignment.id,
                                content: {
                                  body: applyMarkdownTheme(cleanBody, activeItemTheme),
                                  format: "markdown",
                                },
                              });
                            })
                          }
                        >
                          <Save className="mr-1 size-3.5" aria-hidden="true" />
                          {savingBusy
                            ? t("Saving…", "Đang lưu…")
                            : t("Save lesson", "Lưu bài học")}
                        </Button>
                      </div>
                    </div>
                    <MarkdownEditor
                      label={t("Lesson content (Markdown)", "Nội dung bài học (Markdown)")}
                      title={item.title}
                      value={bodies[item.id] ?? extractMarkdownTheme(bodyOf(item)).body}
                      onChange={(value) => setBodies((current) => ({ ...current, [item.id]: value }))}
                      theme={themes[item.id] ?? extractMarkdownTheme(bodyOf(item)).theme}
                      onThemeChange={(next) => setThemes((current) => ({ ...current, [item.id]: next }))}
                      t={t}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {syncStatus === "saved" && !course.updateItem.isError && (
          <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {t("Lesson saved.", "Đã lưu bài học.")}
          </p>
        )}
        {(course.updateItem.error || course.startDraft.error || course.publish.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(course.updateItem.error ?? course.startDraft.error ?? course.publish.error)?.message}
          </p>
        )}

        {authorMode === "write" ? (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t("Create or import a lesson for this Lab", "Soạn mới hoặc nhập file bài giảng cho Lab")}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted">
                  <Upload className="mr-1 size-3.5" aria-hidden="true" />
                  {t("Import (.md / .txt)", "Nhập (.md / .txt)")}
                  <input
                    className="sr-only"
                    type="file"
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void file.text().then((text) => {
                        const isPlainText = /\.txt$/i.test(file.name);
                        const parsed = extractMarkdownTheme(text);
                        setNewTheme(parsed.theme);
                        setNewBody(isPlainText ? smartFormatMarkdown(parsed.body) : parsed.body);
                        setDraftSource("IMPORT");
                        setAiNote("");
                        if (!newTitle.trim()) setNewTitle(file.name.replace(/\.(md|markdown|txt)$/i, ""));
                      });
                      event.target.value = "";
                    }}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={generateDraft.isPending || !reference?.modelId}
                  title={
                    !reference?.modelId
                      ? t("Attach a Reference Repo in Step 2 first", "Gắn Repo ở Bước 2 trước để AI đọc bằng chứng")
                      : undefined
                  }
                  onClick={() => generateDraft.mutate()}
                >
                  <Sparkles className="mr-1 size-3.5" aria-hidden="true" />
                  {generateDraft.isPending
                    ? t("Drafting…", "Đang tạo nháp…")
                    : t("AI draft from evidence", "AI soạn từ bằng chứng")}
                </Button>
              </div>
            </div>
            <Input
              aria-label={t("Lesson title", "Tên bài học")}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
            <MarkdownEditor
              label={t("Lesson content (Markdown)", "Nội dung bài học (Markdown)")}
              title={newTitle}
              value={newBody}
              onChange={setNewBody}
              theme={newTheme}
              onThemeChange={setNewTheme}
              t={t}
            />
            {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
            {generateDraft.error && (
              <p role="alert" className="text-xs text-destructive">
                {generateDraft.error.message}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                disabled={saveToLibrary.isPending || !newTitle.trim() || !newBody.trim()}
                onClick={() => saveToLibrary.mutate()}
              >
                <Library className="mr-1.5 size-4" aria-hidden="true" />
                {saveToLibrary.isPending
                  ? t("Saving…", "Đang lưu…")
                  : t("Save to library & attach", "Lưu vào thư viện & gắn vào Lab")}
              </Button>
            </div>
            {saveToLibrary.error && (
              <p role="alert" className="text-xs text-destructive">
                {saveToLibrary.error.message}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">{t("Theory library", "Thư viện lý thuyết")}</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(
                    "Pick an existing lesson from the class Theory Library to attach to this Lab.",
                    "Chọn bài giảng có sẵn trong Thư viện lý thuyết của lớp để gắn vào Lab này.",
                  )}
                </p>
              </div>
              <Badge variant="outline">{libraryAssets.length}</Badge>
            </div>

            {libraryAssets.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {t(
                  "The library is empty. Switch to 'Write / Import / AI' and click 'Save to library & attach'.",
                  "Thư viện đang trống. Chuyển sang 'Tự soạn / Nhập file / AI' rồi bấm 'Lưu vào thư viện & gắn vào Lab'.",
                )}
              </p>
            ) : (
              <>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={libraryItemId}
                  aria-label={t("Theory library lesson", "Bài học trong thư viện")}
                  onChange={(event) => setLibraryItemId(event.target.value)}
                >
                  <option value="">{t("Choose a library lesson…", "Chọn bài trong thư viện…")}</option>
                  {libraryAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title}
                    </option>
                  ))}
                </select>
                {selectedLibraryAsset && (
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border bg-background p-4 text-xs">
                    <p className="text-sm font-semibold">{selectedLibraryAsset.title}</p>
                    <MarkdownPreview markdown={selectedLibraryAsset.body.slice(0, 800)} />
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedLibraryAsset || attachAsset.isPending}
                  onClick={() => {
                    if (selectedLibraryAsset) attachAsset.mutate(selectedLibraryAsset.id);
                  }}
                >
                  <BookOpen className="mr-1 size-4" aria-hidden="true" />
                  {attachAsset.isPending
                    ? t("Attaching…", "Đang gắn…")
                    : t("Attach to this Lab", "Gắn vào Lab này")}
                </Button>
              </>
            )}
            {(attachAsset.error || detachAsset.error) && (
              <p role="alert" className="text-xs text-destructive">
                {(attachAsset.error ?? detachAsset.error)?.message}
              </p>
            )}
          </div>
        )}
      </section>

      <details className="rounded-xl border bg-card p-5">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <GitBranch className="size-4 text-primary" aria-hidden="true" />
            {t("Sample repository", "Repo mẫu")} &amp; C1–C3
          </span>
          {reference?.revision ? (
            <Badge variant="outline">
              {t("Revision", "Revision")} {reference.revision}
            </Badge>
          ) : (
            <Badge variant="secondary">{t("Configure in Step 2", "Gắn ở Bước 2")}</Badge>
          )}
        </summary>
        <div className="mt-4 space-y-4">
          {reference ? (
            <div className="space-y-4">
              <AssignmentSourceDetails source={reference} assignmentId={assignment.id} />
              {reference.projectId && reference.modelId ? (
                <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(
                        "Inline Reference C1–C3 & Dependency Graph Preview",
                        "Xem trước C1–C3 & Đồ thị phụ thuộc ngay tại đây",
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5" role="tablist">
                      {(
                        [
                          { id: "CONTEXT", label: "C1 System Context" },
                          { id: "CONTAINER", label: "C2 Container" },
                          { id: "COMPONENT", label: "C3 Component" },
                          { id: "GRAPH", label: t("Dependency graph", "Đồ thị phụ thuộc") },
                        ] as const
                      ).map((item) => (
                        <Button
                          key={item.id}
                          type="button"
                          size="sm"
                          variant={c4Tab === item.id ? "default" : "outline"}
                          onClick={() => setC4Tab(item.id)}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {c4Tab !== "GRAPH" ? (
                    modelQuery.data && modelQuery.data.elements.length > 0 ? (
                      <div className="space-y-3">
                        <ArchitectureDiagrams
                          model={modelQuery.data}
                          guidedStatic
                          controlledKind={c4Tab}
                          hideKindSelector
                          systemName={assignment.title}
                          selectedId={selectedGraphId}
                          onSelect={setSelectedGraphId}
                        />
                        {selectedGraphId && (
                          <ElementDetailsPanel model={modelQuery.data} selectedId={selectedGraphId} />
                        )}
                      </div>
                    ) : activeDiagramMermaid ? (
                      <DiagramPreview
                        title={`C4 ${c4Tab}`}
                        content={activeDiagramMermaid}
                        format="MERMAID"
                        style="clean"
                      />
                    ) : (
                      <p className="rounded border border-dashed p-4 text-xs text-muted-foreground">
                        {modelQuery.isPending || studentCtx.isPending
                          ? t("Loading C4 diagram preview…", "Đang tải sơ đồ C4…")
                          : t(
                              "C4 Mermaid projection is unavailable for this level; switch to Dependency graph to inspect elements.",
                              "Chưa có dữ liệu sơ đồ C4 cho cấp độ này; chuyển sang Đồ thị phụ thuộc để kiểm tra.",
                            )}
                      </p>
                    )
                  ) : modelQuery.data ? (
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="min-w-0 overflow-x-auto">
                        <ArchitectureGraph
                          model={modelQuery.data}
                          selectedId={selectedGraphId}
                          onSelect={setSelectedGraphId}
                        />
                      </div>
                      <ElementDetailsPanel model={modelQuery.data} selectedId={selectedGraphId} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("Loading architectural model…", "Đang tải mô hình kiến trúc…")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("Analyze the reference source to view C1–C3.", "Phân tích nguồn tham chiếu để xem C1–C3.")}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t(
                  "Attach and analyze the sample repository in Step 2 so students can inspect C1–C3.",
                  "Gắn và phân tích repo mẫu ở Bước 2 để sinh viên xem sơ đồ C1–C3.",
                )}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => onNavigate("source")}>
                {t("← Step 2: Reference source", "← Bước 2: Nguồn tham chiếu")}
              </Button>
            </div>
          )}
        </div>
      </details>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => onNavigate("quiz")}>
          {t("Next Step 4: Quiz", "Sang Bước 4: Câu hỏi Quiz")}
          <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

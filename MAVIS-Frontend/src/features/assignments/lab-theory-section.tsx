"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  FileText,
  GitBranch,
  Globe,
  Library,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/mainflow-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { ArchitecturePresentation } from "@/features/architecture/architecture-presentation";
import { DiagramPreview } from "@/features/architecture/diagram-preview";
import { useCourseAuthoring, useStudentLabContext } from "@/features/workspaces/course-access";
import { AssignmentSourceDetails } from "./source-picker";
import { type Assignment } from "./requirements";

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
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
            aria-label={t("Lesson theme", "Chủ đề trình bày")}
            className="h-7 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            value={theme}
            onChange={(event) => onThemeChange(event.target.value as MarkdownTheme)}
          >
            {MARKDOWN_THEMES.map((item) => (
              <option key={item.id} value={item.id}>
                {t("Theme", "Chủ đề")}: {t(item.en, item.vi)}
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
              className={`hidden rounded-md px-2.5 py-1 font-medium transition-colors md:inline-block ${
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

      <div
        className={
          mode === "split" ? "grid grid-cols-1 items-stretch gap-4 md:grid-cols-2" : "block"
        }
      >
        {(mode === "write" || mode === "split") && (
          <Textarea
            aria-label={label}
            rows={14}
            maxLength={50000}
            placeholder={t(
              "Write Markdown lesson content, paste notes, or use Import document / Smart Format…",
              "Nhập nội dung bài học Markdown, dán tài liệu hoặc dùng Nhập tài liệu / Định dạng thông minh…",
            )}
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
  onNavigate: (tab: "source" | "quiz" | "publish") => void;
}) {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const course = useCourseAuthoring(workspaceId);
  const libraryQuery = useQuery({
    queryKey: ["api", "theory-assets", workspaceId],
    queryFn: ({ signal }) =>
      api<TheoryAsset[]>(`workspaces/${workspaceId}/theory-assets`, { signal }),
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
    void cache.invalidateQueries({
      queryKey: ["api", "lab-theory-assets", workspaceId, assignment.id],
    });
    void cache.invalidateQueries({ queryKey: ["api", "course-authoring", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "course-published", workspaceId] });
    void cache.invalidateQueries({ queryKey: ["api", "course-setup", workspaceId] });
  }

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newTheme, setNewTheme] = useState<MarkdownTheme>("coursera");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"file" | "url">("file");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importValidation, setImportValidation] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageFrom, setPageFrom] = useState("");
  const [pageTo, setPageTo] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importAiFormat, setImportAiFormat] = useState(true);
  const [libraryItemId, setLibraryItemId] = useState("");
  const [draftSource, setDraftSource] = useState<"LECTURER" | "IMPORT" | "AI">("LECTURER");
  const [aiNote, setAiNote] = useState("");
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [themes, setThemes] = useState<Record<string, MarkdownTheme>>({});
  const [c4Tab, setC4Tab] = useState<"CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH">("CONTEXT");
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
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
      return attached;
    },
    onSuccess: () => {
      invalidateTheory();
      setLibraryItemId("");
    },
  });
  const detachAsset = useMutation({
    mutationFn: async (assetId: string) => {
      await api<null>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets/${assetId}`,
        { method: "DELETE" },
      );
    },
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
          sourceUrl: newSourceUrl || null,
        }),
      });
      await api<AttachedTheory>(
        `workspaces/${workspaceId}/course-labs/${assignment.id}/theory-assets`,
        {
          method: "POST",
          body: JSON.stringify({ assetId: asset.id }),
        },
      );
      return asset;
    },
    onSuccess: () => {
      invalidateTheory();
      setNewTitle("");
      setNewBody("");
      setNewTheme("coursera");
      setNewSourceUrl("");
      setDraftSource("LECTURER");
      setAiNote("");
    },
  });
  type ImportResponse = {
    title: string;
    body: string;
    sourceType: string;
    sourceUrl: string | null;
    aiFormatted: boolean;
    pageCount: number;
    extractedPages: number;
    warnings: string[];
  };
  const importDocument = useMutation({
    mutationFn: async () => {
      setImportValidation("");
      if (importTab === "file") {
        if (!importFile) throw new Error(t("Choose a file to import.", "Hãy chọn file tài liệu."));
        if (pageFrom.trim() || pageTo.trim()) {
          const fromNum = pageFrom.trim() ? Number(pageFrom) : 1;
          const toNum = pageTo.trim() ? Number(pageTo) : fromNum + 49;
          if (
            !Number.isFinite(fromNum) ||
            !Number.isFinite(toNum) ||
            fromNum < 1 ||
            toNum < fromNum
          ) {
            throw new Error(
              t(
                "Page range must have start >= 1 and end >= start.",
                "Khoảng trang phải có trang đầu >= 1 và trang cuối >= trang đầu.",
              ),
            );
          }
          if (toNum - fromNum + 1 > 50) {
            throw new Error(
              t("Import at most 50 PDF pages at once.", "Mỗi lần chỉ nhập tối đa 50 trang PDF."),
            );
          }
        }
        const form = new FormData();
        form.append("file", importFile);
        if (pageFrom.trim()) form.append("pageFrom", pageFrom.trim());
        if (pageTo.trim()) form.append("pageTo", pageTo.trim());
        form.append("aiFormat", String(importAiFormat));
        form.append("language", locale);
        return api<ImportResponse>(`workspaces/${workspaceId}/theory-assets/import-file`, {
          method: "POST",
          body: form,
        });
      }
      if (!importUrl.trim()) {
        throw new Error(t("Enter a valid https:// URL.", "Hãy nhập URL https:// hợp lệ."));
      }
      return api<ImportResponse>(`workspaces/${workspaceId}/theory-assets/import-url`, {
        method: "POST",
        body: JSON.stringify({
          url: importUrl.trim(),
          aiFormat: importAiFormat,
          language: locale,
        }),
      });
    },
    onSuccess: (res) => {
      const parsed = extractMarkdownTheme(res.body);
      setNewTitle((cur) => (cur.trim() && newBody.trim() ? cur : res.title));
      setNewBody(parsed.body);
      setNewTheme(parsed.theme);
      setNewSourceUrl(res.sourceUrl ?? "");
      setDraftSource("IMPORT");
      const metaParts = [
        res.sourceType === "PDF" && res.pageCount > 0
          ? t(
              `Imported PDF (${res.extractedPages}/${res.pageCount} pages)`,
              `Đã nhập PDF (${res.extractedPages}/${res.pageCount} trang)`,
            )
          : res.sourceType === "URL"
            ? t("Imported from web URL", "Đã nhập từ trang Web / Roadmap")
            : t(`Imported ${res.sourceType}`, `Đã nhập file ${res.sourceType}`),
        res.aiFormatted
          ? t("AI formatted (original content preserved)", "Đã chuẩn hóa bằng AI (giữ nguyên gốc)")
          : t("Smart formatted", "Đã chuẩn hóa bố cục"),
      ];
      if (res.warnings.length > 0) metaParts.push(res.warnings.join(" "));
      setAiNote(metaParts.join(" · "));
      setImportOpen(false);
      setImportFile(null);
      setImportValidation("");
      setDragOver(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setImportUrl("");
      setPageFrom("");
      setPageTo("");
    },
  });

  function formatFileSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function selectImportFile(file: File | null) {
    importDocument.reset();
    if (file) {
      if (!/\.(pdf|docx|pptx|md|markdown|txt)$/i.test(file.name)) {
        setImportFile(null);
        setImportValidation(
          t(
            "Unsupported file type. Choose PDF, DOCX, PPTX, MD, or TXT.",
            "Định dạng không hỗ trợ. Chọn PDF, DOCX, PPTX, MD hoặc TXT.",
          ),
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (file.size === 0 || file.size > 20 * 1024 * 1024) {
        setImportFile(null);
        setImportValidation(
          t(
            "File must be non-empty and up to 20 MB.",
            "File phải có dung lượng từ 1 B đến tối đa 20 MB.",
          ),
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    setImportValidation("");
    setImportFile(file);
    setPageFrom("");
    setPageTo("");
    if (!file && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }
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

  const savingBusy =
    syncStatus === "saving" || course.updateItem.isPending || course.deleteItem.isPending;

  const modules = (course.data?.modules as TheoryModule[] | undefined) ?? [];
  const linkedModule = modules.find((module) =>
    module.items.some((item) => item.assignmentId === assignment.id),
  );
  const selectedModule = linkedModule ?? modules[0];

  async function saveDraftItem(
    itemId: string,
    task: (
      activeCourse: NonNullable<typeof course.data>,
      activeModule: TheoryModule,
    ) => Promise<void>,
  ) {
    if (!selectedModule || !course.data) return;
    setSavingItemId(itemId);
    setSyncStatus("saving");
    try {
      await task(course.data, selectedModule);
      invalidateTheory();
      setSyncStatus("saved");
    } catch {
      setSyncStatus("idle");
    } finally {
      setSavingItemId(null);
    }
  }

  const libraryAssets = libraryQuery.data ?? [];
  const attachedAssets = attachedQuery.data ?? [];
  const attachedCourseItemIds = new Set(
    attachedAssets.map((a) => a.courseItemId).filter((id): id is string => Boolean(id)),
  );
  const attachedAssetIds = new Set(attachedAssets.map((a) => a.assetId));
  const attachedTitles = new Set(
    attachedAssets.map((a) => a.title.trim().toLowerCase()).filter(Boolean),
  );
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

  const moduleTheoryItems = selectedModule?.items.filter((item) => item.type === "THEORY") ?? [];
  const directTheoryItems = moduleTheoryItems.filter(
    (item) =>
      item.assignmentId === assignment.id ||
      attachedCourseItemIds.has(item.id) ||
      attachedTitles.has(item.title.trim().toLowerCase()),
  );
  const matchedCourseTheoryItems =
    directTheoryItems.length > 0 ? directTheoryItems : moduleTheoryItems;
  const matchedTitles = new Set(
    matchedCourseTheoryItems.map((item) => item.title.trim().toLowerCase()),
  );
  const matchedItemIds = new Set(matchedCourseTheoryItems.map((item) => item.id));
  const assetOnlyTheoryItems: TheoryItem[] = attachedAssets
    .filter(
      (attached) =>
        !(attached.courseItemId && matchedItemIds.has(attached.courseItemId)) &&
        !matchedTitles.has(attached.title.trim().toLowerCase()),
    )
    .map((attached) => {
      const lib = libraryAssets.find((a) => a.id === attached.assetId);
      return {
        id: `asset:${attached.assetId}`,
        type: "THEORY",
        title: lib?.title || attached.title,
        description: null,
        assignmentId: assignment.id,
        content: { body: lib?.body ?? "", format: "markdown" },
        required: true,
      };
    });
  const theoryItems: TheoryItem[] = [...matchedCourseTheoryItems, ...assetOnlyTheoryItems];

  useEffect(() => {
    if (theoryItems.length === 0) return;
    setBodies((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of theoryItems) {
        if (next[item.id] !== undefined) continue;
        const parsed = extractMarkdownTheme(bodyOf(item));
        next[item.id] = parsed.body;
        changed = true;
      }
      return changed ? next : prev;
    });
    setThemes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of theoryItems) {
        if (next[item.id] !== undefined) continue;
        const parsed = extractMarkdownTheme(bodyOf(item));
        next[item.id] = parsed.theme;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    selectedModule?.id,
    selectedModule?.items.length,
    attachedAssets.length,
    libraryAssets.length,
  ]);

  return (
    <div className="space-y-5">
      {course.data?.status === "DRAFT" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
          <span>
            {t(
              "Theory changes stay in the draft and publish automatically when the course is activated.",
              "Thay đổi lý thuyết được lưu trong bản nháp và tự động xuất bản khi kích hoạt khóa học.",
            )}
          </span>
        </div>
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
              {t("Attached lessons in this Lab", "Bài giảng đã gắn vào Lab này")} (
              {theoryItems.length})
            </p>
            <ul className="space-y-3">
              {theoryItems.map((item) => {
                const isAssetOnly = item.id.startsWith("asset:");
                const linkedAsset =
                  attachedAssets.find((asset) => `asset:${asset.assetId}` === item.id) ??
                  attachedAssets.find((asset) => asset.courseItemId === item.id) ??
                  attachedAssets.find(
                    (asset) => asset.title.trim().toLowerCase() === item.title.trim().toLowerCase(),
                  );
                const cardBusy = savingBusy && savingItemId === item.id;
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
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={detachAsset.isPending || cardBusy}
                          aria-label={t("Detach lesson", "Gỡ bài học")}
                          onClick={() => {
                            if (linkedAsset) {
                              detachAsset.mutate(linkedAsset.assetId);
                            } else {
                              void saveDraftItem(item.id, async (_draft, mod) => {
                                await course.deleteItem.mutateAsync({
                                  moduleId: mod.id,
                                  itemId: item.id,
                                });
                              });
                            }
                          }}
                        >
                          <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
                          {t("Detach", "Gỡ")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={cardBusy}
                          onClick={() =>
                            void saveDraftItem(item.id, async (_draft, mod) => {
                              const fallback = extractMarkdownTheme(bodyOf(item));
                              const cleanBody = bodies[item.id] ?? fallback.body;
                              const activeItemTheme = themes[item.id] ?? fallback.theme;
                              const themedBody = applyMarkdownTheme(cleanBody, activeItemTheme);
                              if (!isAssetOnly) {
                                const targetItem =
                                  mod.items.find(
                                    (it) =>
                                      it.id === item.id ||
                                      (it.type === "THEORY" &&
                                        (it.assignmentId === item.assignmentId ||
                                          it.title === item.title)),
                                  ) ?? item;
                                await course.updateItem.mutateAsync({
                                  moduleId: mod.id,
                                  itemId: targetItem.id,
                                  type: "THEORY",
                                  title: item.title,
                                  description: item.description ?? "",
                                  required: item.required,
                                  assignmentId: item.assignmentId ?? assignment.id,
                                  content: {
                                    body: themedBody,
                                    format: "markdown",
                                  },
                                });
                              }
                              if (linkedAsset) {
                                await api(
                                  `workspaces/${workspaceId}/theory-assets/${linkedAsset.assetId}`,
                                  {
                                    method: "PUT",
                                    body: JSON.stringify({
                                      title: item.title,
                                      body: themedBody,
                                      language: locale,
                                      style: "CUSTOM",
                                      source: linkedAsset.source || "LECTURER",
                                    }),
                                  },
                                ).catch(() => undefined);
                              }
                            })
                          }
                        >
                          <Save className="mr-1 size-3.5" aria-hidden="true" />
                          {cardBusy ? t("Saving…", "Đang lưu…") : t("Save lesson", "Lưu bài học")}
                        </Button>
                      </div>
                    </div>
                    <MarkdownEditor
                      label={t("Lesson content (Markdown)", "Nội dung bài học (Markdown)")}
                      title={item.title}
                      value={bodies[item.id] ?? extractMarkdownTheme(bodyOf(item)).body}
                      onChange={(value) => {
                        setSyncStatus("idle");
                        setBodies((current) => ({ ...current, [item.id]: value }));
                      }}
                      theme={themes[item.id] ?? extractMarkdownTheme(bodyOf(item)).theme}
                      onThemeChange={(next) => {
                        setSyncStatus("idle");
                        setThemes((current) => ({ ...current, [item.id]: next }));
                      }}
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
        {course.updateItem.error && (
          <p role="alert" className="text-sm text-destructive">
            {course.updateItem.error.message}
          </p>
        )}

        {authorMode === "write" ? (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t(
                  "Create or import a lesson for this Lab",
                  "Soạn mới hoặc nhập file bài giảng cho Lab",
                )}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    importDocument.reset();
                    setImportOpen(true);
                  }}
                >
                  <Upload className="mr-1 size-3.5" aria-hidden="true" />
                  {t("Import document", "Nhập tài liệu")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={generateDraft.isPending || !reference?.modelId}
                  title={
                    !reference?.modelId
                      ? t(
                          "Attach a Reference Repo in Step 2 first",
                          "Gắn Repo ở Bước 2 trước để AI đọc bằng chứng",
                        )
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
            <Dialog
              open={importOpen}
              onOpenChange={(open) => {
                if (!importDocument.isPending) {
                  setImportOpen(open);
                  if (!open) setDragOver(false);
                }
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {t("Import theory document", "Nhập tài liệu lý thuyết")}
                  </DialogTitle>
                  <DialogDescription>
                    {t(
                      "Extract content from a file or public webpage directly into the lesson editor.",
                      "Trích xuất nội dung từ file tài liệu hoặc trang web công khai vào trình soạn thảo.",
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div
                  role="tablist"
                  aria-label={t("Import source", "Nguồn nhập tài liệu")}
                  className="grid grid-cols-2 gap-1 rounded-md border bg-muted/60 p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={importTab === "file"}
                    onClick={() => {
                      setImportTab("file");
                      importDocument.reset();
                    }}
                    className={`flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-3 text-sm font-medium transition-colors ${
                      importTab === "file"
                        ? "bg-foreground text-background shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Upload className="size-4 shrink-0" aria-hidden="true" />
                    {t("Upload file", "Tải file lên")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={importTab === "url"}
                    onClick={() => {
                      setImportTab("url");
                      importDocument.reset();
                    }}
                    className={`flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-3 text-sm font-medium transition-colors ${
                      importTab === "url"
                        ? "bg-foreground text-background shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Globe className="size-4 shrink-0" aria-hidden="true" />
                    {t("Web / Roadmap URL", "Link Web / Roadmap")}
                  </button>
                </div>

                {importTab === "file" ? (
                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.pptx,.md,.markdown,.txt"
                      aria-label={t("Document file", "File tài liệu")}
                      className="sr-only"
                      onChange={(event) => selectImportFile(event.target.files?.[0] ?? null)}
                    />
                    {!importFile ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragOver(false);
                          const dropped = event.dataTransfer.files?.[0];
                          if (dropped) selectImportFile(dropped);
                        }}
                        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-7 text-center transition-colors ${
                          dragOver
                            ? "border-primary bg-primary/5"
                            : "border-border bg-muted/20 hover:border-ring hover:bg-muted/40"
                        }`}
                      >
                        <span className="flex size-10 items-center justify-center rounded-full border bg-background shadow-2xs">
                          <Upload className="size-4 text-primary" aria-hidden="true" />
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {t(
                            "Click to choose a file or drag and drop",
                            "Bấm để chọn file hoặc kéo thả vào đây",
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(
                            "PDF, DOCX, PPTX, MD, TXT · Max 20 MB",
                            "PDF, DOCX, PPTX, MD, TXT · Tối đa 20 MB",
                          )}
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 rounded-md border bg-muted/25 px-3.5 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <FileText className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {importFile.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(importFile.size)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={importDocument.isPending}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {t("Change", "Đổi file")}
                          </Button>
                          <button
                            type="button"
                            disabled={importDocument.isPending}
                            aria-label={t("Remove file", "Bỏ chọn file")}
                            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                            onClick={() => selectImportFile(null)}
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                    {importFile && /\.pdf$/i.test(importFile.name) && (
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-medium">
                          <span>
                            {t("PDF page range (optional)", "Khoảng trang PDF (tùy chọn)")}
                          </span>
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {t("Blank = first 50 pages", "Để trống = 50 trang đầu")}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <label className="space-y-1 text-xs font-medium">
                            <span>{t("From page", "Từ trang")}</span>
                            <Input
                              type="number"
                              min={1}
                              placeholder="1"
                              className="h-9"
                              value={pageFrom}
                              onChange={(event) => setPageFrom(event.target.value)}
                            />
                          </label>
                          <label className="space-y-1 text-xs font-medium">
                            <span>{t("To page", "Đến trang")}</span>
                            <Input
                              type="number"
                              min={1}
                              placeholder="50"
                              className="h-9"
                              value={pageTo}
                              onChange={(event) => setPageTo(event.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="theory-import-url"
                      className="block text-xs font-medium text-foreground"
                    >
                      {t(
                        "Public webpage or roadmap URL",
                        "Địa chỉ trang Web hoặc Roadmap công khai",
                      )}
                    </label>
                    <Input
                      id="theory-import-url"
                      type="url"
                      placeholder="https://roadmap.sh/..."
                      value={importUrl}
                      onChange={(event) => {
                        setImportUrl(event.target.value);
                        if (importDocument.error) importDocument.reset();
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          importUrl.trim() &&
                          !importDocument.isPending
                        ) {
                          event.preventDefault();
                          importDocument.mutate();
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Works with public docs, articles, and roadmap.sh pages (no login required).",
                        "Hỗ trợ trang tài liệu công khai, bài viết kỹ thuật và roadmap.sh (không cần đăng nhập).",
                      )}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3.5 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <label
                      htmlFor="theory-import-ai"
                      className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground"
                    >
                      <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                      {t("AI smart formatting", "AI chuẩn hóa bố cục")}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Structures headings and lists while preserving your original text.",
                        "Tự chia mục và danh sách, giữ nguyên nội dung gốc.",
                      )}
                    </p>
                  </div>
                  <Switch
                    id="theory-import-ai"
                    checked={importAiFormat}
                    onCheckedChange={setImportAiFormat}
                    aria-label={t("AI smart formatting", "AI chuẩn hóa bố cục")}
                  />
                </div>

                {(importValidation || importDocument.error) && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  >
                    {importValidation || importDocument.error?.message}
                  </p>
                )}

                <DialogFooter className="gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={importDocument.isPending}
                    onClick={() => setImportOpen(false)}
                  >
                    {t("Cancel", "Hủy")}
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      importDocument.isPending ||
                      (importTab === "file" ? !importFile : !importUrl.trim())
                    }
                    onClick={() => importDocument.mutate()}
                  >
                    {importDocument.isPending && (
                      <Loader2 className="!size-4 animate-spin" aria-hidden="true" />
                    )}
                    {importDocument.isPending
                      ? t("Importing…", "Đang nhập…")
                      : importAiFormat
                        ? t("Import & Format", "Nhập & chuẩn hóa")
                        : t("Import", "Nhập tài liệu")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <label className="block space-y-1 text-xs font-medium">
              <span>{t("Lesson title", "Tên bài học")}</span>
              <Input
                maxLength={255}
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
            </label>
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
                <h4 className="text-sm font-semibold">
                  {t("Theory library", "Thư viện lý thuyết")}
                </h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(
                    "Pick an existing lesson from the class Theory Library to attach to this Lab.",
                    "Chọn bài giảng có sẵn trong Thư viện lý thuyết của lớp để gắn vào Lab này.",
                  )}
                </p>
              </div>
              <Badge variant="outline">{libraryAssets.length}</Badge>
            </div>

            {(libraryQuery.error || attachedQuery.error) && (
              <p role="alert" className="text-xs text-destructive">
                {(libraryQuery.error ?? attachedQuery.error)?.message}
              </p>
            )}
            {libraryQuery.isPending ? (
              <p className="text-xs text-muted-foreground">
                {t("Loading theory library…", "Đang tải thư viện lý thuyết…")}
              </p>
            ) : libraryAssets.length === 0 ? (
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
                  <option value="">
                    {t("Choose a library lesson…", "Chọn bài trong thư viện…")}
                  </option>
                  {libraryAssets.map((asset) => {
                    const already = attachedAssetIds.has(asset.id);
                    return (
                      <option key={asset.id} value={asset.id}>
                        {asset.title}
                        {already ? ` (${t("Attached", "Đã gắn")})` : ""}
                      </option>
                    );
                  })}
                </select>
                {selectedLibraryAsset && (
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border bg-background p-4 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{selectedLibraryAsset.title}</p>
                      {attachedAssetIds.has(selectedLibraryAsset.id) && (
                        <Badge variant="success">{t("Attached", "Đã gắn")}</Badge>
                      )}
                    </div>
                    <MarkdownPreview markdown={selectedLibraryAsset.body.slice(0, 800)} />
                    {selectedLibraryAsset.body.length > 800 && (
                      <p className="text-[11px] text-muted-foreground">
                        … ({t("preview truncated", "bản xem trước rút gọn")})
                      </p>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !selectedLibraryAsset ||
                    attachAsset.isPending ||
                    attachedAssetIds.has(selectedLibraryAsset.id)
                  }
                  onClick={() => {
                    if (selectedLibraryAsset) attachAsset.mutate(selectedLibraryAsset.id);
                  }}
                >
                  <BookOpen className="mr-1 size-4" aria-hidden="true" />
                  {attachAsset.isPending
                    ? t("Attaching…", "Đang gắn…")
                    : selectedLibraryAsset && attachedAssetIds.has(selectedLibraryAsset.id)
                      ? t("Already attached", "Đã gắn vào Lab này")
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
                          role="tab"
                          aria-selected={c4Tab === item.id}
                          variant={c4Tab === item.id ? "default" : "outline"}
                          onClick={() => {
                            setC4Tab(item.id);
                            setSelectedGraphId(null);
                          }}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {modelQuery.data && (c4Tab === "GRAPH" || modelQuery.data.elements.length > 0) ? (
                    <ArchitecturePresentation
                      key={`${modelQuery.data.id}:${c4Tab}`}
                      model={modelQuery.data}
                      mode={c4Tab === "GRAPH" ? "graph" : "diagram"}
                      guidedStatic
                      controlledKind={c4Tab === "GRAPH" ? undefined : c4Tab}
                      hideKindSelector
                      systemName={assignment.title}
                      selectedId={selectedGraphId}
                      onSelect={setSelectedGraphId}
                    />
                  ) : c4Tab !== "GRAPH" ? (
                    activeDiagramMermaid ? (
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
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("Loading architectural model…", "Đang tải mô hình kiến trúc…")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Analyze the reference source to view C1–C3.",
                    "Phân tích nguồn tham chiếu để xem C1–C3.",
                  )}
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onNavigate("source")}
              >
                {t("← Step 2: Reference source", "← Bước 2: Nguồn tham chiếu")}
              </Button>
            </div>
          )}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onNavigate("publish")}>
          {t("Skip to Step 6: Check & add to class", "Sang thẳng Bước 6: Kiểm tra & thêm vào lớp")}
        </Button>
        <Button type="button" size="sm" onClick={() => onNavigate("quiz")}>
          {t("Next Step 4: Quiz", "Sang Bước 4: Câu hỏi Quiz")}
          <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

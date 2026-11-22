"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Code2,
  ExternalLink,
  FileText,
  GitFork,
  HelpCircle,
  Lock,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";
import { labTierMeta, resolveLabTier } from "@/features/assignments/requirements";

const itemTypes = ["THEORY", "QUIZ", "ESSAY", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const;
type ItemType = (typeof itemTypes)[number];

const TYPE_META: Record<
  ItemType,
  { en: string; vi: string; shortEn: string; shortVi: string; icon: LucideIcon; tone: string }
> = {
  THEORY: {
    en: "Theory Lab",
    vi: "Lab chỉ Lý thuyết",
    shortEn: "Theory Only",
    shortVi: "Chỉ Lý thuyết",
    icon: BookOpen,
    tone: "text-teal-700 bg-teal-500/10 border-teal-500/25 dark:text-teal-300",
  },
  QUIZ: {
    en: "Theory + Quiz Lab",
    vi: "Lab Lý thuyết + Quiz",
    shortEn: "Theory + Quiz",
    shortVi: "Lý thuyết + Quiz",
    icon: HelpCircle,
    tone: "text-indigo-700 bg-indigo-500/10 border-indigo-500/25 dark:text-indigo-300",
  },
  ESSAY: {
    en: "Essay",
    vi: "Tự luận",
    shortEn: "Essay",
    shortVi: "Tự luận",
    icon: FileText,
    tone: "text-amber-700 bg-amber-500/10 border-amber-500/25 dark:text-amber-300",
  },
  STATIC_LAB: {
    en: "Theory Only Lab",
    vi: "Lab chỉ Lý thuyết",
    shortEn: "Theory Only",
    shortVi: "Chỉ Lý thuyết",
    icon: Code2,
    tone: "text-teal-700 bg-teal-500/10 border-teal-500/25 dark:text-teal-300",
  },
  IMPACT_LAB: {
    en: "Theory + Quiz Lab",
    vi: "Lab Lý thuyết + Quiz",
    shortEn: "Theory + Quiz",
    shortVi: "Lý thuyết + Quiz",
    icon: GitFork,
    tone: "text-indigo-700 bg-indigo-500/10 border-indigo-500/25 dark:text-indigo-300",
  },
  RUNTIME_LAB: {
    en: "Theory + Quiz + Studio Lab",
    vi: "Lab Lý thuyết + Quiz + Studio",
    shortEn: "Full Studio",
    shortVi: "Có cả Studio",
    icon: Play,
    tone: "text-emerald-700 bg-emerald-500/10 border-emerald-500/25 dark:text-emerald-300",
  },
};

type Item = {
  id: string;
  type: ItemType;
  title: string;
  description: string | null;
  position: number;
  assignmentId: string | null;
  content: Record<string, unknown>;
  required: boolean;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  prerequisiteModuleId: string | null;
  items: Item[];
};

type AssignmentRow = {
  id: string;
  title: string;
  instructions?: string;
  labMode?: string | null;
  requireRuntimeTrace?: boolean;
  aiPolicy?: unknown;
};

type ItemDraft = {
  type: ItemType;
  title: string;
  description: string;
  body: string;
  prompt: string;
  rubric: string;
  assignmentId: string;
  estimatedMinutes: string;
  required: boolean;
};

const emptyDraft = (): ItemDraft => ({
  type: "IMPACT_LAB",
  title: "",
  description: "",
  body: "",
  prompt: "",
  rubric: "",
  assignmentId: "",
  estimatedMinutes: "",
  required: true,
});

function parseRubric(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [criterion, score] = line.split("|").map((part) => part.trim());
      const parsed = score === undefined || score === "" ? 10 : Number(score);
      return {
        criterion: criterion || "Criterion",
        maxScore: Number.isFinite(parsed) ? parsed : 10,
      };
    });
}

function rubricText(rubric: unknown) {
  if (!Array.isArray(rubric)) return "";
  return rubric
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const record = entry as Record<string, unknown>;
      return `${String(record["criterion"] ?? "")}|${String(record["maxScore"] ?? 10)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function contentFromDraft(draft: ItemDraft): Record<string, unknown> {
  const mins = Number.parseInt(draft.estimatedMinutes, 10);
  const meta = Number.isFinite(mins) && mins > 0 && mins <= 600 ? { estimatedMinutes: mins } : {};
  if (draft.type === "THEORY") return { ...meta, body: draft.body.trim() };
  if (draft.type === "ESSAY")
    return { ...meta, prompt: draft.prompt.trim(), rubric: parseRubric(draft.rubric) };
  return meta;
}

function draftFromItem(item: Item): ItemDraft {
  const content = item.content ?? {};
  return {
    type: item.type,
    title: item.title,
    description: item.description ?? "",
    body: typeof content["body"] === "string" ? content["body"] : "",
    prompt: typeof content["prompt"] === "string" ? content["prompt"] : "",
    rubric: rubricText(content["rubric"]),
    assignmentId: item.assignmentId ?? "",
    estimatedMinutes:
      typeof content["estimatedMinutes"] === "number" && content["estimatedMinutes"] > 0
        ? String(content["estimatedMinutes"])
        : "",
    required: item.required,
  };
}

function draftValid(draft: ItemDraft) {
  if (!draft.title.trim()) return false;
  if (draft.type === "THEORY" && !draft.body.trim()) return false;
  if (draft.type === "ESSAY" && !draft.prompt.trim()) return false;
  if (
    ["QUIZ", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"].includes(draft.type) &&
    !draft.assignmentId
  ) {
    return false;
  }
  return true;
}

function itemTypeForAssignment(assignment: {
  labMode?: string | null | undefined;
  requireRuntimeTrace?: boolean | null | undefined;
  aiPolicy?: unknown;
}): ItemType {
  const tier = resolveLabTier(assignment);
  if (tier === "THEORY_QUIZ_STUDIO") return "RUNTIME_LAB";
  if (tier === "THEORY_ONLY") return "STATIC_LAB";
  return "IMPACT_LAB";
}

function itemEstimatedMinutes(item: Item): number | null {
  const raw = item.content?.["estimatedMinutes"];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

function ItemFields({
  draft,
  onChange,
  assignments,
  t,
}: {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  assignments: AssignmentRow[];
  t: (en: string, vi: string) => string;
}) {
  const isLegacyRawTheory = draft.type === "THEORY" && !draft.assignmentId;
  const labs =
    draft.type === "RUNTIME_LAB"
      ? assignments.filter((assignment) => assignment.requireRuntimeTrace)
      : assignments;
  const needsAssignment = !isLegacyRawTheory;
  return (
    <div className="space-y-3.5">
      {needsAssignment && (
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Select created Lab", "Chọn bài Lab đã tạo (từ tab Tạo Lab)")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.assignmentId}
            onChange={(event) => {
              const nextId = event.target.value;
              const picked = assignments.find((a) => a.id === nextId);
              if (picked) {
                onChange({
                  assignmentId: nextId,
                  type: itemTypeForAssignment(picked),
                  title: draft.title.trim() ? draft.title : picked.title,
                  description: draft.description.trim()
                    ? draft.description
                    : (picked.instructions
                        ?.split("\n")[0]
                        ?.replace(/^#+\s*/, "")
                        .slice(0, 160) ?? ""),
                });
              } else {
                onChange({ assignmentId: "" });
              }
            }}
          >
            <option value="">
              {t("Choose a Lab in this class…", "Chọn bài Lab trong lớp này…")}
            </option>
            {(labs.length > 0 ? labs : assignments).map((assignment) => {
              const tier = resolveLabTier(assignment);
              const meta = labTierMeta(tier);
              return (
                <option key={assignment.id} value={assignment.id}>
                  [{t(meta.shortEn, meta.shortVi)}] {assignment.title}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Lab tier in this chapter", "Cấp độ bài Lab trong Chương / Mốc")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.type}
            onChange={(event) => {
              const nextType = event.target.value as ItemType;
              onChange({
                type: nextType,
                ...(nextType === "THEORY" ? { assignmentId: "" } : {}),
              });
            }}
          >
            {(["THEORY", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const).map((type) => (
              <option key={type} value={type}>
                {type === "THEORY"
                  ? t("Standalone Theory Lesson", "Bài Lý thuyết độc lập")
                  : t(TYPE_META[type].en, TYPE_META[type].vi)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Display title in chapter", "Tên hiển thị trong chương")}</span>
          <Input
            required
            maxLength={255}
            value={draft.title}
            placeholder={t("Auto-filled when you pick a Lab", "Tự động điền khi chọn bài Lab")}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Short description", "Mô tả ngắn")}</span>
          <Input
            value={draft.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Duration (min)", "Thời lượng (phút)")}</span>
          <Input
            type="number"
            min={5}
            max={600}
            step={5}
            placeholder="45"
            value={draft.estimatedMinutes}
            onChange={(event) => onChange({ estimatedMinutes: event.target.value })}
          />
        </label>
      </div>
      {isLegacyRawTheory && (
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Theory content", "Nội dung lý thuyết")}</span>
          <Textarea
            rows={9}
            value={draft.body}
            onChange={(event) => onChange({ body: event.target.value })}
          />
        </label>
      )}
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={draft.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        {t("Required Lab in this milestone", "Bài Lab bắt buộc trong Mốc này")}
      </label>
    </div>
  );
}

export function CourseBuilder({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const course = useCourseAuthoring(workspaceId);
  const assignments = useApiQuery(
    "assignments",
    { workspaceId },
    { enabled: Boolean(workspaceId) },
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showCourseInfo, setShowCourseInfo] = useState(false);

  const [outlineQuery, setOutlineQuery] = useState("");
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});

  const [showAddModule, setShowAddModule] = useState(false);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [modulePrerequisite, setModulePrerequisite] = useState("");

  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [editModuleDescription, setEditModuleDescription] = useState("");
  const [editModulePrerequisite, setEditModulePrerequisite] = useState("");

  const [addingItemModuleId, setAddingItemModuleId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});

  const [editingItem, setEditingItem] = useState<{
    moduleId: string;
    itemId: string;
    draft: ItemDraft;
  } | null>(null);
  const [selectedItem, setSelectedItem] = useState<{ moduleId: string; itemId: string } | null>(
    null,
  );

  const inspectorRef = useRef<HTMLElement>(null);
  const inspectorBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(course.data?.title ?? "");
    setDescription(course.data?.description ?? "");
  }, [course.data?.id, course.data?.title, course.data?.description]);

  const isDraft = course.data?.status === "DRAFT";

  useEffect(() => {
    if (!isDraft) {
      setShowAddModule(false);
      setEditingModule(null);
      setAddingItemModuleId(null);
      setEditingItem(null);
    }
  }, [isDraft]);

  const editingItemId = editingItem?.itemId ?? null;

  useEffect(() => {
    if (!editingItemId || !inspectorRef.current) return;
    inspectorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const firstInput = inspectorRef.current.querySelector<HTMLInputElement>(
      "input[type='text'], input:not([type])",
    );
    firstInput?.focus({ preventScroll: true });
  }, [editingItemId]);

  useEffect(() => {
    inspectorBodyRef.current?.scrollTo({ top: 0 });
  }, [
    selectedItem?.itemId,
    editingItem?.itemId,
    addingItemModuleId,
    editingModule?.id,
    showAddModule,
  ]);

  const data = course.data;
  const modules = useMemo(() => (data?.modules as Module[] | undefined) ?? [], [data?.modules]);
  const assignmentRows = useMemo(
    () => (assignments.data ?? []) as AssignmentRow[],
    [assignments.data],
  );

  const resolveBuilderItemType = (item: Item): ItemType => {
    const linked = item.assignmentId
      ? assignmentRows.find((a) => a.id === item.assignmentId)
      : undefined;
    if (linked) {
      return itemTypeForAssignment(linked);
    }
    return item.type;
  };

  const flatItems = useMemo(() => {
    const entries: Array<{ module: Module; item: Item }> = [];
    for (const mod of modules) {
      for (const item of mod.items) {
        if (item.type !== "ESSAY") entries.push({ module: mod, item });
      }
    }
    return entries;
  }, [modules]);

  const normalizedQuery = outlineQuery.trim().toLowerCase();
  const filteredModules = useMemo(() => {
    if (!normalizedQuery) {
      return modules.map((mod) => ({
        module: mod,
        visibleItems: mod.items.filter((item) => item.type !== "ESSAY"),
      }));
    }
    return modules
      .map((mod) => {
        const allVisible = mod.items.filter((item) => item.type !== "ESSAY");
        const moduleMatches =
          mod.title.toLowerCase().includes(normalizedQuery) ||
          (mod.description?.toLowerCase().includes(normalizedQuery) ?? false);
        if (moduleMatches) return { module: mod, visibleItems: allVisible };
        const matchedItems = allVisible.filter((item) => {
          const linked = item.assignmentId
            ? assignmentRows.find((a) => a.id === item.assignmentId)
            : undefined;
          return (
            item.title.toLowerCase().includes(normalizedQuery) ||
            (linked?.title.toLowerCase().includes(normalizedQuery) ?? false)
          );
        });
        return { module: mod, visibleItems: matchedItems };
      })
      .filter(({ module, visibleItems }) => {
        const moduleMatches =
          module.title.toLowerCase().includes(normalizedQuery) ||
          (module.description?.toLowerCase().includes(normalizedQuery) ?? false);
        return moduleMatches || visibleItems.length > 0;
      });
  }, [modules, normalizedQuery, assignmentRows]);

  if (course.isPending) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        {t("Loading course builder…", "Đang tải trình tạo khóa học…")}
      </div>
    );
  }

  const busy =
    course.save.isPending ||
    course.addModule.isPending ||
    course.updateModule.isPending ||
    course.moveModule.isPending ||
    course.deleteModule.isPending ||
    course.addItem.isPending ||
    course.updateItem.isPending ||
    course.moveItem.isPending ||
    course.deleteItem.isPending;

  const inspectedItem = (() => {
    const targetId = editingItem?.itemId ?? selectedItem?.itemId;
    if (targetId) {
      const exact = flatItems.find((entry) => entry.item.id === targetId);
      if (exact) return exact;
    }
    return flatItems[0] ?? null;
  })();

  const activeFlatIndex = inspectedItem
    ? flatItems.findIndex((entry) => entry.item.id === inspectedItem.item.id)
    : -1;

  const allCollapsed = modules.length > 0 && modules.every((m) => collapsedModules[m.id]);

  const toggleAllModules = () => {
    if (allCollapsed) {
      setCollapsedModules({});
    } else {
      const next: Record<string, boolean> = {};
      for (const m of modules) next[m.id] = true;
      setCollapsedModules(next);
    }
  };

  const draftFor = (moduleId: string) => drafts[moduleId] ?? emptyDraft();
  const updateDraft = (moduleId: string, patch: Partial<ItemDraft>) =>
    setDrafts((current) => ({
      ...current,
      [moduleId]: { ...(current[moduleId] ?? emptyDraft()), ...patch },
    }));

  const clearRightEditors = () => {
    setShowAddModule(false);
    setEditingModule(null);
    setAddingItemModuleId(null);
    setEditingItem(null);
  };

  const selectItem = (moduleId: string, itemId: string) => {
    clearRightEditors();
    setSelectedItem({ moduleId, itemId });
  };

  const openAddModule = () => {
    clearRightEditors();
    setShowAddModule(true);
  };

  const openEditModule = (mod: Module) => {
    clearRightEditors();
    setEditingModule(mod);
    setEditModuleTitle(mod.title);
    setEditModuleDescription(mod.description ?? "");
    setEditModulePrerequisite(mod.prerequisiteModuleId ?? "");
  };

  const openAddItem = (moduleId: string) => {
    clearRightEditors();
    setAddingItemModuleId(moduleId);
    setCollapsedModules((prev) => ({ ...prev, [moduleId]: false }));
  };

  const openEditItem = (moduleId: string, item: Item) => {
    clearRightEditors();
    setSelectedItem({ moduleId, itemId: item.id });
    setEditingItem({ moduleId, itemId: item.id, draft: draftFromItem(item) });
  };

  const saveCourse = (event: React.FormEvent) => {
    event.preventDefault();
    course.save.mutate(
      { title, description },
      {
        onSuccess: () => {
          if (data) setShowCourseInfo(false);
        },
      },
    );
  };

  const addModule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!moduleTitle.trim()) return;
    const body: { title: string; description?: string; prerequisiteModuleId?: string } = {
      title: moduleTitle.trim(),
    };
    if (moduleDescription.trim()) body.description = moduleDescription.trim();
    if (modulePrerequisite) body.prerequisiteModuleId = modulePrerequisite;
    course.addModule.mutate(body, {
      onSuccess: () => {
        setModuleTitle("");
        setModuleDescription("");
        setModulePrerequisite("");
        setShowAddModule(false);
      },
    });
  };

  const saveModule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingModule || !editModuleTitle.trim()) return;
    const body: {
      moduleId: string;
      title: string;
      description?: string;
      prerequisiteModuleId?: string;
    } = { moduleId: editingModule.id, title: editModuleTitle.trim() };
    if (editModuleDescription.trim()) body.description = editModuleDescription.trim();
    if (editModulePrerequisite) body.prerequisiteModuleId = editModulePrerequisite;
    course.updateModule.mutate(body, { onSuccess: () => setEditingModule(null) });
  };

  const addItem = (moduleId: string, event: React.FormEvent) => {
    event.preventDefault();
    const draft = draftFor(moduleId);
    if (!draftValid(draft)) return;
    const body: {
      moduleId: string;
      type: ItemType;
      title: string;
      description?: string;
      required: boolean;
      content: Record<string, unknown>;
      assignmentId?: string;
    } = {
      moduleId,
      type: draft.type,
      title: draft.title.trim(),
      required: draft.required,
      content: contentFromDraft(draft),
    };
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.assignmentId) body.assignmentId = draft.assignmentId;
    course.addItem.mutate(body, {
      onSuccess: () => {
        setDrafts((current) => ({ ...current, [moduleId]: emptyDraft() }));
        setAddingItemModuleId(null);
      },
    });
  };

  const saveItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem || !draftValid(editingItem.draft)) return;
    const draft = editingItem.draft;
    const body: {
      moduleId: string;
      itemId: string;
      type: ItemType;
      title: string;
      description?: string;
      required: boolean;
      content: Record<string, unknown>;
      assignmentId?: string;
    } = {
      moduleId: editingItem.moduleId,
      itemId: editingItem.itemId,
      type: draft.type,
      title: draft.title.trim(),
      required: draft.required,
      content: contentFromDraft(draft),
    };
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.assignmentId) body.assignmentId = draft.assignmentId;
    course.updateItem.mutate(body, { onSuccess: () => setEditingItem(null) });
  };

  const addingItemModule = addingItemModuleId
    ? (modules.find((mod) => mod.id === addingItemModuleId) ?? null)
    : null;

  const inspectedResolvedType = inspectedItem ? resolveBuilderItemType(inspectedItem.item) : null;
  const inspectedMeta = inspectedResolvedType
    ? (TYPE_META[inspectedResolvedType] ?? TYPE_META.THEORY)
    : null;
  const inspectedLinkedAssignment = inspectedItem?.item.assignmentId
    ? assignmentRows.find((a) => a.id === inspectedItem.item.assignmentId)
    : undefined;
  const inspectedBodyMarkdown =
    inspectedItem && typeof inspectedItem.item.content?.["body"] === "string"
      ? inspectedItem.item.content["body"].trim()
      : "";
  const inspectedDuration = inspectedItem ? itemEstimatedMinutes(inspectedItem.item) : null;

  const activeError =
    (course.save.isError &&
      t("Could not save the course draft.", "Không lưu được bản nháp khóa học.")) ||
    (course.startDraft.isError &&
      t("Could not create a new draft.", "Không tạo được bản nháp mới.")) ||
    (course.addModule.isError && t("Could not add the module.", "Không thêm được chương.")) ||
    (course.updateModule.isError &&
      t("Could not update the module.", "Không cập nhật được chương.")) ||
    (course.deleteModule.isError && t("Could not delete the module.", "Không xóa được chương.")) ||
    (course.addItem.isError &&
      t(
        "Could not add the learning item. Verify the linked Lab belongs to this class and required content is filled.",
        "Không thêm được nội dung. Kiểm tra Lab liên kết thuộc lớp này và nội dung bắt buộc đã nhập.",
      )) ||
    (course.updateItem.isError &&
      t("Could not update the learning item.", "Không cập nhật được nội dung.")) ||
    (course.deleteItem.isError &&
      t("Could not delete the learning item.", "Không xóa được nội dung.")) ||
    (course.publish.isError &&
      t(
        "Course could not be published. Every module needs at least one item and linked Labs must belong to this class.",
        "Không publish được khóa học. Mỗi chương cần ít nhất một nội dung và Lab liên kết phải thuộc lớp này.",
      )) ||
    null;

  return (
    <section
      id="course-builder"
      aria-labelledby="course-builder-title"
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      {/* Compact Unified Workspace Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2
            id="course-builder-title"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="size-4" aria-hidden="true" />
            </span>
            {t("Course builder", "Trình tạo khóa học")}
          </h2>
          {data && (
            <>
              <Badge
                variant={data.status === "PUBLISHED" ? "success" : "secondary"}
                className="gap-1 text-[11px]"
              >
                {data.status === "PUBLISHED" && <Lock className="size-3" aria-hidden="true" />}
                {data.status === "PUBLISHED"
                  ? t("Published", "Đã xuất bản")
                  : data.status === "ARCHIVED"
                    ? t("Archived", "Đã lưu trữ")
                    : t("Draft", "Bản nháp")}{" "}
                · r{data.draftRevision} · v{data.publishedVersion}
              </Badge>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {modules.length}{" "}
                {modules.length === 1 ? t("module", "chương") : t("modules", "chương")} ·{" "}
                {flatItems.length}{" "}
                {flatItems.length === 1 ? t("Lab", "bài Lab") : t("Labs", "bài Lab")}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <Button
              type="button"
              size="sm"
              variant={showCourseInfo ? "secondary" : "ghost"}
              onClick={() => setShowCourseInfo((open) => !open)}
            >
              <Settings2 className="mr-1.5 size-3.5" aria-hidden="true" />
              {t("Course info", "Thông tin khóa")}
            </Button>
          )}
          {data?.status === "PUBLISHED" && (
            <Button
              type="button"
              size="sm"
              disabled={course.startDraft.isPending}
              onClick={() => course.startDraft.mutate()}
            >
              <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
              {course.startDraft.isPending
                ? t("Starting draft…", "Đang tạo nháp…")
                : t("Start new draft", "Tạo bản nháp mới")}
            </Button>
          )}
          {isDraft && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={openAddModule}
              >
                <Plus className="mr-1 size-3.5" aria-hidden="true" />
                {t("New module", "Thêm chương")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!modules.length || course.publish.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Publish an immutable snapshot of this course roadmap?",
                        "Publish bản snapshot bất biến của lộ trình khóa học?",
                      ),
                    )
                  )
                    course.publish.mutate();
                }}
              >
                <Send className="mr-1.5 size-3.5" aria-hidden="true" />
                {course.publish.isPending
                  ? t("Publishing…", "Đang publish…")
                  : t("Publish course version", "Publish phiên bản khóa học")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Collapsible Course Metadata Strip (always visible when creating a new course) */}
      {(!data || showCourseInfo) && (
        <div className="border-b bg-muted/20 px-4 py-3">
          <form
            onSubmit={saveCourse}
            className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]"
          >
            <Input
              aria-label={t("Course title", "Tên khóa học")}
              required
              maxLength={255}
              disabled={data?.status === "PUBLISHED"}
              placeholder={t("Course title", "Tên khóa học")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              aria-label={t("Course description", "Mô tả khóa học")}
              disabled={data?.status === "PUBLISHED"}
              placeholder={t("Description", "Mô tả")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="flex items-center gap-1.5">
              <Button size="sm" disabled={busy || data?.status === "PUBLISHED"}>
                <Save className="mr-1.5 size-3.5" aria-hidden="true" />
                {t("Save draft", "Lưu bản nháp")}
              </Button>
              {data && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowCourseInfo(false)}
                  aria-label={t("Close", "Đóng")}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </form>
          {data?.status === "PUBLISHED" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Published versions are immutable. Start a separate draft to continue editing.",
                "Phiên bản đã publish là bất biến. Tạo bản nháp riêng để tiếp tục chỉnh sửa.",
              )}
            </p>
          )}
          {!data && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Save the course details to start its roadmap.",
                "Lưu thông tin khóa học để bắt đầu tạo lộ trình.",
              )}
            </p>
          )}
        </div>
      )}

      {/* Alerts (0px when idle) */}
      {activeError && (
        <div
          role="alert"
          className="border-b bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
        >
          {activeError}
        </div>
      )}
      {course.publish.isSuccess && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-b bg-emerald-500/10 px-4 py-2 text-xs text-emerald-800 dark:text-emerald-200"
        >
          <span>
            {t("Published immutable version", "Đã publish phiên bản bất biến")} v
            {course.publish.data.version} ·{" "}
            <span className="font-mono">{course.publish.data.snapshotDigest.slice(0, 18)}…</span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={course.startDraft.isPending}
            onClick={() => course.startDraft.mutate()}
          >
            {t("Continue in a new draft", "Tiếp tục bằng bản nháp mới")}
          </Button>
        </div>
      )}

      {/* Dual-Pane Fixed-Viewport Studio Workbench */}
      {data && (
        <div className="grid min-w-0 divide-y lg:h-[clamp(520px,calc(100vh-11.5rem),760px)] lg:grid-cols-[minmax(300px,0.84fr)_minmax(0,1.16fr)] lg:divide-x lg:divide-y-0">
          {/* LEFT PANE: Independently Scrollable Curriculum Outline */}
          <div className="flex min-h-0 min-w-0 flex-col bg-muted/10">
            <div className="flex items-center gap-2 border-b bg-card/80 px-3 py-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label={t("Filter modules or labs", "Tìm chương hoặc bài Lab")}
                  placeholder={t("Filter modules or labs…", "Tìm chương hoặc bài Lab…")}
                  value={outlineQuery}
                  onChange={(event) => setOutlineQuery(event.target.value)}
                  className="h-8 w-full rounded-md border bg-background pr-7 pl-8 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {outlineQuery && (
                  <button
                    type="button"
                    onClick={() => setOutlineQuery("")}
                    aria-label={t("Clear filter", "Xóa bộ lọc")}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {modules.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
                  onClick={toggleAllModules}
                  title={
                    allCollapsed
                      ? t("Expand all modules", "Mở tất cả chương")
                      : t("Collapse all modules", "Thu gọn tất cả chương")
                  }
                >
                  {allCollapsed ? (
                    <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {allCollapsed
                      ? t("Expand all modules", "Mở tất cả chương")
                      : t("Collapse all modules", "Thu gọn tất cả chương")}
                  </span>
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {modules.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {t("No modules yet", "Chưa có chương nào")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isDraft
                      ? t(
                          "Create your first module to organize Labs and readings.",
                          "Tạo chương đầu tiên để sắp xếp các bài Lab và tài liệu học.",
                        )
                      : t(
                          "Start a new draft to add modules to this curriculum.",
                          "Tạo bản nháp mới để thêm chương vào giáo trình này.",
                        )}
                  </p>
                  {isDraft && (
                    <Button type="button" size="sm" className="mt-3" onClick={openAddModule}>
                      <Plus className="mr-1 size-3.5" aria-hidden="true" />
                      {t("Add module", "Thêm chương")}
                    </Button>
                  )}
                </div>
              ) : filteredModules.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                  <p>
                    {t(
                      "No matching modules or Labs.",
                      "Không tìm thấy chương hoặc bài Lab phù hợp.",
                    )}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-7 text-xs"
                    onClick={() => setOutlineQuery("")}
                  >
                    {t("Clear filter", "Xóa bộ lọc")}
                  </Button>
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {filteredModules.map(({ module, visibleItems }) => {
                    const isCollapsed = Boolean(collapsedModules[module.id]) && !normalizedQuery;
                    const theoryOnlyCount = visibleItems.filter((i) => {
                      const rt = resolveBuilderItemType(i);
                      return rt === "THEORY" || rt === "STATIC_LAB";
                    }).length;
                    const quizLabCount = visibleItems.filter((i) => {
                      const rt = resolveBuilderItemType(i);
                      return rt === "QUIZ" || rt === "IMPACT_LAB";
                    }).length;
                    const studioLabCount = visibleItems.filter(
                      (i) => resolveBuilderItemType(i) === "RUNTIME_LAB",
                    ).length;
                    const breakdown = [
                      theoryOnlyCount > 0
                        ? `${theoryOnlyCount} ${t("Theory Only", "Chỉ Lý thuyết")}`
                        : null,
                      quizLabCount > 0
                        ? `${quizLabCount} ${t("Theory + Quiz", "Lý thuyết + Quiz")}`
                        : null,
                      studioLabCount > 0
                        ? `${studioLabCount} ${t("Full Studio", "Có cả Studio")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const prereqTitle = module.prerequisiteModuleId
                      ? modules.find((candidate) => candidate.id === module.prerequisiteModuleId)
                          ?.title
                      : null;
                    const isModuleEditing =
                      editingModule?.id === module.id || addingItemModuleId === module.id;
                    // prettier-ignore
                    const labUnit = visibleItems.length === 1 ? t("Lab", "bài Lab") : t("Labs", "bài Lab");

                    return (
                      <li
                        key={module.id}
                        className={`overflow-hidden rounded-lg border bg-card transition-colors ${
                          isModuleEditing ? "border-primary/60 ring-1 ring-primary/20" : ""
                        }`}
                      >
                        <div className="flex items-start gap-1.5 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedModules((prev) => ({
                                ...prev,
                                [module.id]: !prev[module.id],
                              }))
                            }
                            aria-expanded={!isCollapsed}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          >
                            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                              {module.position}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold leading-snug text-foreground">
                                {module.title}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {visibleItems.length} {labUnit}
                                {breakdown ? ` · ${breakdown}` : ""}
                                {prereqTitle
                                  ? ` · ${t("Prereq", "Tiên quyết")}: ${prereqTitle}`
                                  : ""}
                              </span>
                            </span>
                            <ChevronDown
                              className={`mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform ${
                                isCollapsed ? "-rotate-90" : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>

                          {isDraft && (
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                disabled={busy || module.position <= 1}
                                onClick={() =>
                                  course.moveModule.mutate({ moduleId: module.id, direction: "UP" })
                                }
                                title={t("Move module up", "Chuyển chương lên")}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronUp className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Move up", "Lên")}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy || module.position >= modules.length}
                                onClick={() =>
                                  course.moveModule.mutate({
                                    moduleId: module.id,
                                    direction: "DOWN",
                                  })
                                }
                                title={t("Move module down", "Chuyển chương xuống")}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronDown className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Move down", "Xuống")}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModule(module)}
                                title={t("Edit module", "Sửa chương")}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Pencil className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Edit module", "Sửa chương")}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      t(
                                        `Delete module "${module.title}" and all its items?`,
                                        `Xóa chương "${module.title}" và toàn bộ nội dung bên trong?`,
                                      ),
                                    )
                                  ) {
                                    course.deleteModule.mutate({ moduleId: module.id });
                                  }
                                }}
                                title={t("Delete module", "Xóa chương")}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                              >
                                <Trash2 className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{t("Delete module", "Xóa chương")}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {!isCollapsed && (
                          <>
                            {module.description && (
                              <p className="border-t bg-muted/15 px-3 py-1.5 text-[11px] text-muted-foreground">
                                {module.description}
                              </p>
                            )}

                            {visibleItems.length > 0 ? (
                              <ol className="divide-y border-t">
                                {visibleItems.map((item) => {
                                  const resolvedType = resolveBuilderItemType(item);
                                  const meta = TYPE_META[resolvedType] ?? TYPE_META.THEORY;
                                  const Icon = meta.icon;
                                  const mins = itemEstimatedMinutes(item);
                                  const isInspected =
                                    !showAddModule &&
                                    !editingModule &&
                                    !addingItemModuleId &&
                                    inspectedItem?.item.id === item.id;

                                  return (
                                    <li key={item.id}>
                                      <div
                                        className={`group flex items-start gap-1.5 px-3 py-2 transition-colors ${
                                          isInspected
                                            ? "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[9px]"
                                            : "hover:bg-muted/35"
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          aria-current={isInspected ? "true" : undefined}
                                          onClick={() => selectItem(module.id, item.id)}
                                          className="flex min-w-0 flex-1 items-start gap-2 text-left"
                                        >
                                          <Icon
                                            className={`mt-0.5 size-3.5 shrink-0 ${
                                              isInspected ? "text-primary" : "text-muted-foreground"
                                            }`}
                                            aria-hidden="true"
                                          />
                                          <span className="min-w-0 flex-1">
                                            <span
                                              className={`block line-clamp-2 text-[13px] leading-snug ${
                                                isInspected
                                                  ? "font-semibold text-primary"
                                                  : "font-medium text-foreground"
                                              }`}
                                            >
                                              {item.title}
                                            </span>
                                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                              <span
                                                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${meta.tone}`}
                                              >
                                                {t(meta.shortEn, meta.shortVi)}
                                              </span>
                                              {mins && (
                                                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                  <Clock className="size-2.5" aria-hidden="true" />
                                                  {mins} {t("min", "phút")}
                                                </span>
                                              )}
                                              {!item.required && (
                                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                  {t("Optional", "Không bắt buộc")}
                                                </span>
                                              )}
                                            </span>
                                          </span>
                                        </button>

                                        {isDraft && (
                                          <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-80 transition-opacity group-hover:opacity-100">
                                            <button
                                              type="button"
                                              disabled={busy}
                                              onClick={() =>
                                                course.moveItem.mutate({
                                                  moduleId: module.id,
                                                  itemId: item.id,
                                                  direction: "UP",
                                                })
                                              }
                                              title={t("Move up", "Lên")}
                                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                            >
                                              <ChevronUp className="size-3.5" aria-hidden="true" />
                                              <span className="sr-only">{t("Move up", "Lên")}</span>
                                            </button>
                                            <button
                                              type="button"
                                              disabled={busy}
                                              onClick={() =>
                                                course.moveItem.mutate({
                                                  moduleId: module.id,
                                                  itemId: item.id,
                                                  direction: "DOWN",
                                                })
                                              }
                                              title={t("Move down", "Xuống")}
                                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                            >
                                              <ChevronDown
                                                className="size-3.5"
                                                aria-hidden="true"
                                              />
                                              <span className="sr-only">
                                                {t("Move down", "Xuống")}
                                              </span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openEditItem(module.id, item)}
                                              title={t("Edit", "Sửa")}
                                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            >
                                              <Pencil className="size-3.5" aria-hidden="true" />
                                              <span className="sr-only">{t("Edit", "Sửa")}</span>
                                            </button>
                                            <button
                                              type="button"
                                              disabled={busy}
                                              onClick={() => {
                                                if (
                                                  window.confirm(
                                                    t(
                                                      "Remove this Lab from the module?",
                                                      "Xóa bài Lab này khỏi chương?",
                                                    ),
                                                  )
                                                ) {
                                                  course.deleteItem.mutate({
                                                    moduleId: module.id,
                                                    itemId: item.id,
                                                  });
                                                }
                                              }}
                                              title={t("Delete", "Xóa")}
                                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                                            >
                                              <Trash2 className="size-3.5" aria-hidden="true" />
                                              <span className="sr-only">{t("Delete", "Xóa")}</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ol>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5 text-xs text-muted-foreground">
                                <span>
                                  {t(
                                    "No Labs assigned to this milestone yet.",
                                    "Chương (Mốc) này chưa được gắn bài Lab nào.",
                                  )}
                                </span>
                                {isDraft && assignmentRows.length > 0 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={busy}
                                    onClick={() => {
                                      void (async () => {
                                        for (const a of assignmentRows) {
                                          await course.addItem.mutateAsync({
                                            moduleId: module.id,
                                            type: itemTypeForAssignment(a),
                                            title: a.title,
                                            description:
                                              a.instructions
                                                ?.split("\n")[0]
                                                ?.replace(/^#+\s*/, "")
                                                .slice(0, 160) ?? "",
                                            required: true,
                                            content: {},
                                            assignmentId: a.id,
                                          });
                                        }
                                      })();
                                    }}
                                  >
                                    <Zap className="mr-1 size-3" aria-hidden="true" />
                                    {t(
                                      `Assign all ${assignmentRows.length}`,
                                      `Gắn nhanh ${assignmentRows.length} Lab`,
                                    )}
                                  </Button>
                                )}
                              </div>
                            )}

                            {isDraft && (
                              <div className="border-t bg-muted/10 px-3 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => openAddItem(module.id)}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:underline dark:text-teal-300"
                                >
                                  <Plus className="size-3.5" aria-hidden="true" />
                                  {t(
                                    "Add Lab to this milestone",
                                    "Thêm bài Lab vào Chương / Mốc này",
                                  )}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          {/* RIGHT PANE: Pinned-Header Inspector & Focused Editor */}
          <aside
            ref={inspectorRef}
            aria-label={t("Curriculum Inspector", "Trình xem & sửa học liệu")}
            className="flex min-h-0 min-w-0 flex-col bg-background"
          >
            {isDraft && showAddModule ? (
              <form onSubmit={addModule} className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2 border-b bg-card/60 px-5 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {t("New Module", "Chương mới")}
                    </p>
                    <h3 className="text-sm font-semibold">
                      {t("Add a chapter to the roadmap", "Thêm một chương vào lộ trình khóa học")}
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddModule(false)}
                  >
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">{t("Close", "Đóng")}</span>
                  </Button>
                </div>
                <div
                  ref={inspectorBodyRef}
                  className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-5"
                >
                  <label className="block space-y-1 text-xs font-medium">
                    <span>{t("Module title", "Tên chương")}</span>
                    <Input
                      required
                      maxLength={255}
                      placeholder={t(
                        "e.g., Module 1: Architecture Foundations",
                        "VD: Chương 1: Nền tảng kiến trúc",
                      )}
                      value={moduleTitle}
                      onChange={(event) => setModuleTitle(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-medium">
                    <span>{t("Module description", "Mô tả chương")}</span>
                    <Textarea
                      rows={3}
                      placeholder={t(
                        "Optional learning outcomes for this chapter…",
                        "Mục tiêu học tập của chương (không bắt buộc)…",
                      )}
                      value={moduleDescription}
                      onChange={(event) => setModuleDescription(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-medium">
                    <span>{t("Prerequisite module", "Chương tiên quyết")}</span>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={modulePrerequisite}
                      onChange={(event) => setModulePrerequisite(event.target.value)}
                    >
                      <option value="">
                        {t("No module prerequisite", "Không có chương tiên quyết")}
                      </option>
                      {modules.map((mod) => (
                        <option key={mod.id} value={mod.id}>
                          {mod.position}. {mod.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 border-t bg-muted/15 px-5 py-3">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setShowAddModule(false)}
                  >
                    {t("Cancel", "Hủy")}
                  </Button>
                  <Button size="sm" disabled={busy || !moduleTitle.trim()}>
                    <Plus className="mr-1 size-3.5" aria-hidden="true" />
                    {t("Add module", "Thêm chương")}
                  </Button>
                </div>
              </form>
            ) : isDraft && editingModule ? (
              <form onSubmit={saveModule} className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2 border-b bg-card/60 px-5 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {t(
                        `Editing Module ${editingModule.position}`,
                        `Chỉnh sửa Chương ${editingModule.position}`,
                      )}
                    </p>
                    <h3 className="text-sm font-semibold">{editingModule.title}</h3>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingModule(null)}
                  >
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">{t("Close", "Đóng")}</span>
                  </Button>
                </div>
                <div
                  ref={inspectorBodyRef}
                  className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-5"
                >
                  <label className="block space-y-1 text-xs font-medium">
                    <span>{t("Module title", "Tên chương")}</span>
                    <Input
                      required
                      maxLength={255}
                      value={editModuleTitle}
                      onChange={(event) => setEditModuleTitle(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-medium">
                    <span>{t("Module description", "Mô tả chương")}</span>
                    <Textarea
                      rows={3}
                      value={editModuleDescription}
                      onChange={(event) => setEditModuleDescription(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-medium">
                    <span>{t("Prerequisite module", "Chương tiên quyết")}</span>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={editModulePrerequisite}
                      onChange={(event) => setEditModulePrerequisite(event.target.value)}
                    >
                      <option value="">
                        {t("No module prerequisite", "Không có chương tiên quyết")}
                      </option>
                      {modules
                        .filter((candidate) => candidate.position < editingModule.position)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.position}. {candidate.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 border-t bg-muted/15 px-5 py-3">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingModule(null)}
                  >
                    {t("Cancel", "Hủy")}
                  </Button>
                  <Button size="sm" disabled={busy || !editModuleTitle.trim()}>
                    {t("Save module", "Lưu chương")}
                  </Button>
                </div>
              </form>
            ) : isDraft && addingItemModule ? (
              <form
                onSubmit={(event) => addItem(addingItemModule.id, event)}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex items-center justify-between gap-2 border-b bg-card/60 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {t("Add Lab to Module", "Thêm bài Lab vào Chương")}{" "}
                      {addingItemModule.position}
                    </p>
                    <h3 className="truncate text-sm font-semibold">{addingItemModule.title}</h3>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setAddingItemModuleId(null)}
                  >
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">{t("Close", "Đóng")}</span>
                  </Button>
                </div>
                <div ref={inspectorBodyRef} className="min-h-0 flex-1 overflow-y-auto p-5">
                  <ItemFields
                    draft={draftFor(addingItemModule.id)}
                    onChange={(patch) => updateDraft(addingItemModule.id, patch)}
                    assignments={assignmentRows}
                    t={t}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 border-t bg-muted/15 px-5 py-3">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setAddingItemModuleId(null)}
                  >
                    {t("Cancel", "Hủy")}
                  </Button>
                  <Button size="sm" disabled={busy || !draftValid(draftFor(addingItemModule.id))}>
                    {course.addItem.isPending
                      ? t("Saving…", "Đang lưu…")
                      : draftFor(addingItemModule.id).type === "THEORY"
                        ? t("Add lesson to module", "Thêm bài học vào Chương")
                        : t("Add Lab to module", "Gắn bài Lab vào Chương")}
                  </Button>
                </div>
              </form>
            ) : isDraft && editingItem ? (
              <form onSubmit={saveItem} className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2 border-b bg-card/60 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {t("Editing Learning Item", "Đang chỉnh sửa nội dung")}
                    </p>
                    <h3 className="truncate text-sm font-semibold">
                      {editingItem.draft.title || "—"}
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingItem(null)}
                  >
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">{t("Close", "Đóng")}</span>
                  </Button>
                </div>
                <div ref={inspectorBodyRef} className="min-h-0 flex-1 overflow-y-auto p-5">
                  <ItemFields
                    draft={editingItem.draft}
                    onChange={(patch) =>
                      setEditingItem((current) =>
                        current ? { ...current, draft: { ...current.draft, ...patch } } : current,
                      )
                    }
                    assignments={assignmentRows}
                    t={t}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 border-t bg-muted/15 px-5 py-3">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingItem(null)}
                  >
                    {t("Cancel", "Hủy")}
                  </Button>
                  <Button size="sm" disabled={busy || !draftValid(editingItem.draft)}>
                    {t("Save item", "Lưu nội dung")}
                  </Button>
                </div>
              </form>
            ) : inspectedItem ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Pinned Inspector Header with Immediate Actions & Prev/Next Stepper */}
                <div className="border-b bg-card/60 px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                      {t(
                        `Module ${inspectedItem.module.position}`,
                        `Chương ${inspectedItem.module.position}`,
                      )}{" "}
                      · {inspectedItem.module.title}
                    </p>
                    {flatItems.length > 1 && (
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="px-1 font-mono text-[11px] text-muted-foreground">
                          {activeFlatIndex + 1}/{flatItems.length}
                        </span>
                        <button
                          type="button"
                          disabled={activeFlatIndex <= 0}
                          onClick={() => {
                            const prev = flatItems[activeFlatIndex - 1];
                            if (prev) selectItem(prev.module.id, prev.item.id);
                          }}
                          title={t("Previous item", "Bài trước")}
                          className="rounded border bg-background p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35"
                        >
                          <ChevronLeft className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">{t("Previous item", "Bài trước")}</span>
                        </button>
                        <button
                          type="button"
                          disabled={activeFlatIndex < 0 || activeFlatIndex >= flatItems.length - 1}
                          onClick={() => {
                            const next = flatItems[activeFlatIndex + 1];
                            if (next) selectItem(next.module.id, next.item.id);
                          }}
                          title={t("Next item", "Bài tiếp theo")}
                          className="rounded border bg-background p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35"
                        >
                          <ChevronRight className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">{t("Next item", "Bài tiếp theo")}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-snug text-foreground">
                        {inspectedItem.item.title}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {inspectedMeta && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${inspectedMeta.tone}`}
                          >
                            {t(inspectedMeta.en, inspectedMeta.vi)}
                          </span>
                        )}
                        {inspectedDuration && (
                          <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                            <Clock className="size-3" aria-hidden="true" />
                            {inspectedDuration} {t("min", "phút")}
                          </span>
                        )}
                        {!inspectedItem.item.required && (
                          <Badge variant="secondary" className="text-[11px]">
                            {t("Optional", "Không bắt buộc")}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {inspectedItem.item.assignmentId && (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/lab-authoring?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(inspectedItem.item.assignmentId)}`}
                          >
                            <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
                            {t("Open in Lab Authoring Studio", "Mở trong trình soạn Lab")}
                          </Link>
                        </Button>
                      )}
                      {isDraft && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openEditItem(inspectedItem.module.id, inspectedItem.item)}
                        >
                          <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                          {t("Edit", "Sửa")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Independently Scrollable Preview Body */}
                <div
                  ref={inspectorBodyRef}
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
                >
                  {(inspectedLinkedAssignment || inspectedItem.item.description) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3.5 py-2 text-xs">
                      {inspectedLinkedAssignment && (
                        <div className="min-w-0">
                          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("Linked Lab", "Lab liên kết")}:
                          </span>{" "}
                          <span className="font-medium text-foreground">
                            {inspectedLinkedAssignment.title}
                          </span>
                        </div>
                      )}
                      {inspectedItem.item.description && (
                        <span className="text-muted-foreground">
                          {inspectedItem.item.description}
                        </span>
                      )}
                    </div>
                  )}

                  {inspectedItem.item.type === "THEORY" && (
                    <div className="overflow-x-auto rounded-lg border bg-background p-4 [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                      {inspectedBodyMarkdown ? (
                        <MarkdownPreview markdown={inspectedBodyMarkdown} />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "No theory Markdown body written yet.",
                            "Chưa có nội dung Markdown lý thuyết.",
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {inspectedItem.item.type !== "THEORY" &&
                    inspectedItem.item.type !== "ESSAY" &&
                    inspectedLinkedAssignment?.instructions?.trim() && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("Lab Overview & Instructions", "Tổng quan & Hướng dẫn bài Lab")}
                        </p>
                        <div className="overflow-x-auto rounded-lg border bg-background p-4 [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                          <MarkdownPreview markdown={inspectedLinkedAssignment.instructions} />
                        </div>
                      </div>
                    )}

                  {inspectedItem.item.type === "ESSAY" && (
                    <div className="space-y-2 rounded-lg border bg-background p-4 text-sm">
                      <p className="font-medium">
                        {String(inspectedItem.item.content?.["prompt"] ?? "")}
                      </p>
                      {Array.isArray(inspectedItem.item.content?.["rubric"]) && (
                        <ul className="list-disc pl-5 text-xs text-muted-foreground">
                          {(
                            inspectedItem.item.content["rubric"] as Array<{
                              criterion?: string;
                              maxScore?: number;
                            }>
                          ).map((entry, idx) => (
                            <li key={idx}>
                              {entry.criterion} · {entry.maxScore} pts
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center p-8 text-center">
                <BookOpen className="size-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {t("Select a lesson to inspect", "Chọn một bài học để xem trước")}
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t(
                    "Add a module on the left or click an item to preview and edit its content here.",
                    "Thêm chương bên trái hoặc bấm vào một nội dung để xem trước và chỉnh sửa tại đây.",
                  )}
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Compact Immutable Version History Footer */}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
          <div className="truncate">
            {course.versions.data?.length
              ? `${t("Published immutable versions:", "Phiên bản đã publish bất biến:")} ${course.versions.data
                  .map((version) => `v${version.version} (${version.snapshotDigest.slice(0, 14)}…)`)
                  .join(" · ")}`
              : t("No published version yet.", "Chưa có phiên bản được publish.")}
          </div>
          {data.status === "PUBLISHED" && (
            <span className="shrink-0 text-[11px] text-emerald-700 dark:text-emerald-300">
              {t("Published snapshot is read-only", "Bản đã publish là chỉ đọc")}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

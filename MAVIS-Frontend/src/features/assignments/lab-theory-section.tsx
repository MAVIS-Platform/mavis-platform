"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, GitBranch, Library, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownPreview } from "@/components/shared/markdown-preview";
import { useApiQuery } from "@/hooks/use-api";
import { useLocale } from "@/lib/i18n/locale-context";
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

function bodyOf(item: TheoryItem) {
  return typeof item.content["body"] === "string" ? item.content["body"] : "";
}

function MarkdownEditor({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  t: (en: string, vi: string) => string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <label className="space-y-1 text-xs font-medium">
        <span>{label}</span>
        <Textarea
          rows={10}
          value={value}
          placeholder={t(
            "# Lesson heading\n\nWrite the lesson in Markdown.\n\n- Key idea\n- Example from the sample repository",
            "# Tiêu đề bài học\n\nViết bài học bằng Markdown.\n\n- Ý chính\n- Ví dụ từ repo mẫu",
          )}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="space-y-1 text-xs font-medium">
        <span>{t("Preview", "Xem trước")}</span>
        <div className="min-h-56 rounded-lg border bg-background p-4">
          {value.trim() ? (
            <MarkdownPreview markdown={value} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("Markdown preview appears here.", "Bản xem trước Markdown hiện ở đây.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function LabTheorySection({
  workspaceId,
  workspaceName,
  assignment,
  onNavigate,
}: {
  workspaceId: string;
  workspaceName: string;
  assignment: Assignment;
  onNavigate: (tab: "source") => void;
}) {
  const { t } = useLocale();
  const course = useCourseAuthoring(workspaceId);
  const [courseTitle, setCourseTitle] = useState(`${workspaceName} Course`);
  const [moduleTitle, setModuleTitle] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [c4Tab, setC4Tab] = useState<"CONTEXT" | "CONTAINER" | "COMPONENT" | "GRAPH">("CONTEXT");
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved">("idle");
  const isPublished = course.data?.status === "PUBLISHED";
  const savingBusy =
    syncStatus === "saving" ||
    course.startDraft.isPending ||
    course.updateItem.isPending ||
    course.addItem.isPending ||
    course.publish.isPending;

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

  const modules = (course.data?.modules as TheoryModule[] | undefined) ?? [];
  const linkedModule = modules.find((module) =>
    module.items.some((item) => item.assignmentId === assignment.id),
  );
  const selectedModule =
    modules.find((module) => module.id === selectedModuleId) ?? linkedModule ?? modules[0];
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
    { enabled: Boolean(reference?.projectId && reference?.modelId && c4Tab === "GRAPH") },
  );
  const refArch = studentCtx.data?.referenceArchitecture;
  const activeDiagramMermaid =
    refArch?.diagrams?.find((d) => d.level?.toUpperCase() === c4Tab)?.mermaidDsl ?? null;

  useEffect(() => {
    if (selectedModule && selectedModule.id !== selectedModuleId) {
      setSelectedModuleId(selectedModule.id);
    }
  }, [selectedModule, selectedModuleId]);

  useEffect(() => {
    if (!selectedModule) return;
    setBodies(
      Object.fromEntries(
        selectedModule.items
          .filter((item) => item.type === "THEORY")
          .map((item) => [item.id, bodyOf(item)]),
      ),
    );
  }, [selectedModule?.id, selectedModule?.items.length]);

  if (course.isPending) {
    return <p className="text-sm text-muted-foreground">{t("Loading course structure…", "Đang tải cấu trúc khóa học…")}</p>;
  }

  if (!course.data) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">{t("Create the course structure first", "Tạo cấu trúc khóa học trước")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "Theory belongs to a module inside the Course. Create a Course draft, then add the first module and lesson here.",
            "Lý thuyết nằm trong một chương của Course. Tạo bản nháp Course, sau đó thêm chương và bài học đầu tiên tại đây.",
          )}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 space-y-1 text-xs font-medium">
            <span>{t("Course title", "Tên khóa học")}</span>
            <Input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} />
          </label>
          <Button
            type="button"
            disabled={course.save.isPending || !courseTitle.trim()}
            onClick={() => course.save.mutate({ title: courseTitle.trim(), description: "" })}
          >
            {course.save.isPending
              ? t("Creating draft…", "Đang tạo bản nháp…")
              : t("Create Course draft", "Tạo bản nháp Course")}
          </Button>
        </div>
        {course.save.error && <p role="alert" className="text-sm text-destructive">{course.save.error.message}</p>}
      </section>
    );
  }

  if (modules.length === 0) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <Library className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">{t("Add the first module", "Thêm chương đầu tiên")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "A module is a chapter. Lessons, C1–C3 reference views and the Quiz live inside the module. Create one module now; you can add more in Course authoring.",
            "Chương là nhóm nội dung. Bài học, C1–C3 tham chiếu và Quiz nằm trong chương. Tạo một chương tại đây; có thể thêm tiếp trong Soạn nội dung.",
          )}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 space-y-1 text-xs font-medium">
            <span>{t("Module title", "Tên chương")}</span>
            <Input
              value={moduleTitle}
              placeholder={t("e.g. Service boundaries", "Ví dụ: Ranh giới service")}
              onChange={(event) => setModuleTitle(event.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={course.addModule.isPending || !moduleTitle.trim()}
            onClick={() =>
              course.addModule.mutate(
                { title: moduleTitle.trim() },
                { onSuccess: () => setModuleTitle("") },
              )
            }
          >
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {t("Add module", "Thêm chương")}
          </Button>
        </div>
        {course.addModule.error && <p role="alert" className="text-sm text-destructive">{course.addModule.error.message}</p>}
      </section>
    );
  }

  const theoryItems = selectedModule?.items.filter((item) => item.type === "THEORY") ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t("How theory works", "Lý thuyết hoạt động thế nào")}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t(
                "Theory = lesson content + sample repository + C1–C3 reference views. Students read this before the Quiz and do not submit diagrams.",
                "Lý thuyết = nội dung bài học + repo mẫu + C1–C3 tham chiếu. Sinh viên đọc trước Quiz và không nộp diagram.",
              )}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/workspace-overview?workspace=${encodeURIComponent(workspaceId)}&view=course-authoring`}>
              {t("Open full course authoring", "Mở soạn nội dung đầy đủ")}
            </Link>
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <GitBranch className="size-4 text-primary" aria-hidden="true" />
              {t("Sample repository", "Repo mẫu")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "The pinned reference repository students use to read C1–C3 and complete the Lab.",
                "Repo tham chiếu đã ghim để sinh viên đọc C1–C3 và hoàn thành Lab.",
              )}
            </p>
          </div>
          {reference?.revision && (
            <Badge variant="outline">
              {t("Revision", "Revision")} {reference.revision}
            </Badge>
          )}
        </div>
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
                  activeDiagramMermaid ? (
                    <DiagramPreview
                      title={`C4 ${c4Tab}`}
                      content={activeDiagramMermaid}
                      format="MERMAID"
                      style="clean"
                    />
                  ) : (
                    <p className="rounded border border-dashed p-4 text-xs text-muted-foreground">
                      {studentCtx.isPending
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
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {t(
                "Attach and analyze the sample repository before students can read C1–C3.",
                "Gắn và phân tích repo mẫu trước khi sinh viên đọc C1–C3.",
              )}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => onNavigate("source")}>
              {t("Go to Reference source", "Mở Nguồn tham chiếu")}
              <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">{t("Module and lessons", "Chương và bài học")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Choose the module that contains this Lab, then edit or add the Markdown lesson students read before the Quiz.",
                "Chọn chương chứa Lab này, chỉnh sửa hoặc thêm bài học Markdown ngay tại đây.",
              )}
            </p>
          </div>
          {isPublished && (
            <Badge variant="success">
              {t(
                "Live Course · Edits auto-publish cleanly",
                "Đang xuất bản · Lưu là tự động cập nhật",
              )}
            </Badge>
          )}
        </div>
        <label className="block max-w-md space-y-1 text-xs font-medium">
          <span>{t("Module", "Chương")}</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedModule?.id ?? ""}
            onChange={(event) => setSelectedModuleId(event.target.value)}
          >
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.position}. {module.title}
              </option>
            ))}
          </select>
        </label>

        {theoryItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("No lesson in this module yet. Add the first lesson below.", "Chương này chưa có bài học. Thêm bài đầu tiên bên dưới.")}
          </p>
        ) : (
          <ul className="space-y-4">
            {theoryItems.map((item) => (
              <li key={item.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t("Lesson", "Bài học")}</Badge>
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <MarkdownEditor
                  label={t("Lesson content (Markdown)", "Nội dung bài học (Markdown)")}
                  value={bodies[item.id] ?? bodyOf(item)}
                  onChange={(value) => setBodies((current) => ({ ...current, [item.id]: value }))}
                  t={t}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
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
                      await course.updateItem.mutateAsync({
                        moduleId: mod.id,
                        itemId: targetItem.id,
                        type: "THEORY",
                        title: item.title,
                        description: item.description ?? "",
                        required: item.required,
                        assignmentId: item.assignmentId ?? assignment.id,
                        content: { body: bodies[item.id] ?? bodyOf(item), format: "markdown" },
                      });
                    })
                  }
                >
                  <Save className="mr-1 size-3.5" aria-hidden="true" />
                  {savingBusy
                    ? t("Saving & Publishing…", "Đang lưu & cập nhật…")
                    : t("Save lesson", "Lưu bài học")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {syncStatus === "saved" && !course.updateItem.isError && !course.addItem.isError && (
          <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {t("Lesson saved and published to students.", "Đã lưu và cập nhật bài học cho sinh viên.")}
          </p>
        )}
        {(course.updateItem.error || course.startDraft.error || course.publish.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(course.updateItem.error ?? course.startDraft.error ?? course.publish.error)?.message}
          </p>
        )}

        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <h4 className="text-sm font-semibold">{t("Add a lesson", "Thêm bài học")}</h4>
          <Input
            aria-label={t("Lesson title", "Tên bài học")}
            placeholder={t("Lesson title", "Tên bài học")}
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <MarkdownEditor
            label={t("Lesson content (Markdown)", "Nội dung bài học (Markdown)")}
            value={newBody}
            onChange={setNewBody}
            t={t}
          />
          <Button
            type="button"
            size="sm"
            disabled={savingBusy || !newTitle.trim() || !newBody.trim()}
            onClick={() =>
              void saveWithAutoPublish(async (_draft, mod) => {
                await course.addItem.mutateAsync({
                  moduleId: mod.id,
                  type: "THEORY",
                  title: newTitle.trim(),
                  assignmentId: assignment.id,
                  required: true,
                  content: { body: newBody.trim(), format: "markdown" },
                });
                setNewTitle("");
                setNewBody("");
              })
            }
          >
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {t("Add lesson", "Thêm bài học")}
          </Button>
        </div>
        {course.addItem.error && <p role="alert" className="text-sm text-destructive">{course.addItem.error.message}</p>}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";

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

export function LabTheorySection({
  workspaceId,
  workspaceName,
  assignmentId,
}: {
  workspaceId: string;
  workspaceName: string;
  assignmentId: string;
}) {
  const { t } = useLocale();
  const course = useCourseAuthoring(workspaceId);
  const [courseTitle, setCourseTitle] = useState(`${workspaceName} Course`);
  const [moduleTitle, setModuleTitle] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [bodies, setBodies] = useState<Record<string, string>>({});

  const modules = (course.data?.modules as TheoryModule[] | undefined) ?? [];
  const linkedModule = modules.find((module) =>
    module.items.some((item) => item.assignmentId === assignmentId),
  );
  const selectedModule =
    modules.find((module) => module.id === selectedModuleId) ?? linkedModule ?? modules[0];

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

  if (course.data?.status === "PUBLISHED") {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">{t("Published Course is immutable", "Course đã publish là bất biến")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "Start a new Course draft before adding or editing theory for this Lab. The published version stays unchanged for students.",
            "Tạo bản nháp Course mới trước khi thêm hoặc sửa lý thuyết cho Lab. Phiên bản đã publish vẫn giữ nguyên cho sinh viên.",
          )}
        </p>
        <Button
          type="button"
          disabled={course.startDraft.isPending}
          onClick={() => course.startDraft.mutate()}
        >
          {course.startDraft.isPending
            ? t("Starting draft…", "Đang tạo bản nháp…")
            : t("Start new Course draft", "Tạo bản nháp Course mới")}
        </Button>
        {course.startDraft.error && <p role="alert" className="text-sm text-destructive">{course.startDraft.error.message}</p>}
      </section>
    );
  }

  if (!course.data) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">{t("Course structure required", "Cần cấu trúc khóa học")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "The Lab needs a Course draft and at least one module before theory can be attached.",
            "Lab cần một bản nháp Course và ít nhất một chương trước khi gắn lý thuyết.",
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
        <h2 className="font-semibold">{t("Add the first module", "Thêm chương đầu tiên")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Theory lives inside a module. Create one module now; you can add more structure in Course authoring.",
            "Lý thuyết nằm trong một chương. Tạo chương đầu tiên tại đây; có thể bổ sung cấu trúc trong Soạn nội dung.",
          )}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 space-y-1 text-xs font-medium">
            <span>{t("Module title", "Tên chương")}</span>
            <Input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} />
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
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <BookOpen className="size-4 text-primary" aria-hidden="true" />
              {t("Theory for this Lab", "Lý thuyết cho Lab này")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Students read this content in Step 2 before the Quiz. Only the published Course version is visible to students.",
                "Sinh viên đọc nội dung này ở Bước 2 trước Quiz. Chỉ phiên bản Course đã publish mới hiển thị với sinh viên.",
              )}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}#course-builder`}>
              {t("Open full course authoring", "Mở soạn nội dung đầy đủ")}
            </Link>
          </Button>
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
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h3 className="font-semibold">{t("Existing theory", "Lý thuyết hiện có")}</h3>
        {theoryItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("No theory item in this module yet.", "Chương này chưa có nội dung lý thuyết.")}
          </p>
        ) : (
          <ul className="space-y-3">
            {theoryItems.map((item) => (
              <li key={item.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t("Theory", "Lý thuyết")}</Badge>
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <Textarea
                  aria-label={`${t("Theory content", "Nội dung lý thuyết")}: ${item.title}`}
                  rows={4}
                  value={bodies[item.id] ?? bodyOf(item)}
                  onChange={(event) =>
                    setBodies((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={course.updateItem.isPending}
                  onClick={() =>
                    course.updateItem.mutate({
                      moduleId: selectedModule!.id,
                      itemId: item.id,
                      type: "THEORY",
                      title: item.title,
                      description: item.description ?? "",
                      required: item.required,
                      assignmentId: item.assignmentId ?? assignmentId,
                      content: { body: bodies[item.id] ?? bodyOf(item) },
                    })
                  }
                >
                  <Save className="mr-1 size-3.5" aria-hidden="true" />
                  {t("Save theory", "Lưu lý thuyết")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {course.updateItem.error && <p role="alert" className="text-sm text-destructive">{course.updateItem.error.message}</p>}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h3 className="font-semibold">{t("Add theory", "Thêm lý thuyết")}</h3>
        <div className="grid gap-3">
          <Input
            aria-label={t("Theory title", "Tên lý thuyết")}
            placeholder={t("Theory title", "Tên lý thuyết")}
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <Textarea
            aria-label={t("Theory content", "Nội dung lý thuyết")}
            rows={5}
            placeholder={t(
              "Write the lesson students read before the Quiz.",
              "Viết bài học sinh viên đọc trước khi làm Quiz.",
            )}
            value={newBody}
            onChange={(event) => setNewBody(event.target.value)}
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={course.addItem.isPending || !newTitle.trim() || !newBody.trim()}
              onClick={() =>
                course.addItem.mutate(
                  {
                    moduleId: selectedModule!.id,
                    type: "THEORY",
                    title: newTitle.trim(),
                    assignmentId,
                    required: true,
                    content: { body: newBody.trim() },
                  },
                  {
                    onSuccess: () => {
                      setNewTitle("");
                      setNewBody("");
                    },
                  },
                )
              }
            >
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {t("Add theory", "Thêm lý thuyết")}
            </Button>
          </div>
        </div>
        {course.addItem.error && <p role="alert" className="text-sm text-destructive">{course.addItem.error.message}</p>}
      </section>
    </div>
  );
}

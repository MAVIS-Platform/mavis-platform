"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";

const itemTypes = ["THEORY", "QUIZ", "ESSAY", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB"] as const;
function isJson(value: string) {
  try { const parsed: unknown = JSON.parse(value); return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed); }
  catch { return false; }
}

export function CourseBuilder({ workspaceId }: { workspaceId: string }) {
  const { locale } = useLocale();
  const t = (en: string, vi: string) => locale === "vi" ? vi : en;
  const course = useCourseAuthoring(workspaceId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [modulePrerequisite, setModulePrerequisite] = useState("");
  const [moduleItemTitle, setModuleItemTitle] = useState<Record<string, string>>({});
  const [moduleItemType, setModuleItemType] = useState<Record<string, (typeof itemTypes)[number]>>({});
  const [moduleItemContent, setModuleItemContent] = useState<Record<string, string>>({});
  const [moduleItemAssignment, setModuleItemAssignment] = useState<Record<string, string>>({});
  useEffect(() => {
    setTitle(course.data?.title ?? "");
    setDescription(course.data?.description ?? "");
  }, [course.data?.id, course.data?.draftRevision, course.data?.title, course.data?.description]);

  if (course.isPending) return <p className="text-sm text-muted-foreground">{t("Loading course builder…", "Đang tải trình tạo khóa học…")}</p>;
  const data = course.data;
  const saveCourse = (event: React.FormEvent) => {
    event.preventDefault();
    course.save.mutate({ title, description });
  };
  const addModule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!moduleTitle.trim()) return;
    const moduleRequest: { title: string; prerequisiteModuleId?: string } = { title: moduleTitle.trim() };
    if (modulePrerequisite) moduleRequest.prerequisiteModuleId = modulePrerequisite;
    course.addModule.mutate(moduleRequest, { onSuccess: () => { setModuleTitle(""); setModulePrerequisite(""); } });
  };
  const addItem = (moduleId: string, event: React.FormEvent) => {
    event.preventDefault();
    const titleValue = moduleItemTitle[moduleId] ?? "";
    const typeValue = moduleItemType[moduleId] ?? "THEORY";
    const contentValue = moduleItemContent[moduleId] ?? "";
    const assignmentValue = moduleItemAssignment[moduleId] ?? "";
    if (!titleValue.trim()) return;
    let content: Record<string, unknown> = {};
    try { content = contentValue.trim() ? JSON.parse(contentValue) as Record<string, unknown> : {}; }
    catch { return; }
    const itemRequest: { moduleId: string; type: (typeof itemTypes)[number]; title: string; content: Record<string, unknown>; assignmentId?: string } = {
      moduleId, type: typeValue, title: titleValue.trim(), content,
    };
    if (assignmentValue) itemRequest.assignmentId = assignmentValue;
    course.addItem.mutate(itemRequest, { onSuccess: () => {
        setModuleItemTitle((current) => ({ ...current, [moduleId]: "" }));
        setModuleItemContent((current) => ({ ...current, [moduleId]: "" }));
        setModuleItemAssignment((current) => ({ ...current, [moduleId]: "" }));
      } });
  };

  return (
    <section aria-labelledby="course-builder-title" className="space-y-5 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="course-builder-title" className="flex items-center gap-2 font-semibold"><BookOpen className="size-4" />{t("Course builder", "Trình tạo khóa học")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Compose a roadmap from theory, quizzes, essays, static analysis, impact and Studio Live labs.", "Xây dựng lộ trình từ lý thuyết, quiz, tự luận, phân tích tĩnh, change impact và Lab Studio Live.")}</p>
        </div>
        {data && <span className="rounded-full border px-2 py-1 text-xs">{data.status} · r{data.draftRevision} · v{data.publishedVersion}</span>}
      </div>
      <form onSubmit={saveCourse} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
        <Input aria-label={t("Course title", "Tên khóa học")} required maxLength={255} placeholder={t("Course title", "Tên khóa học")} value={title} onChange={(event) => setTitle(event.target.value)} />
        <Input aria-label={t("Course description", "Mô tả khóa học")} placeholder={t("Description", "Mô tả")} value={description} onChange={(event) => setDescription(event.target.value)} />
        <Button disabled={course.save.isPending}><Save className="mr-1 size-4" />{t("Save draft", "Lưu bản nháp")}</Button>
      </form>
      {course.save.isError && <p role="alert" className="text-sm text-destructive">{t("Could not save the course draft.", "Không lưu được bản nháp khóa học.")}</p>}
      {course.startDraft.isError && <p role="alert" className="text-sm text-destructive">{t("Could not create a new draft.", "Không tạo được bản nháp mới.")}</p>}
      {!data && <p className="text-sm text-muted-foreground">{t("Save the course details to start its roadmap.", "Lưu thông tin khóa học để bắt đầu tạo lộ trình.")}</p>}
      {data && data.status === "PUBLISHED" && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="text-sm">{t("Published versions are immutable. Start a separate draft to continue editing.", "Phiên bản đã publish là bất biến. Tạo bản nháp riêng để tiếp tục chỉnh sửa.")}</p>
        <Button type="button" variant="outline" disabled={course.startDraft.isPending} onClick={() => course.startDraft.mutate()}>{t("Start new draft", "Tạo bản nháp mới")}</Button>
      </div>}
      {data && data.status === "DRAFT" && <>
        <form onSubmit={addModule} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input aria-label={t("Module title", "Tên module")} required maxLength={255} placeholder={t("New module", "Module mới")} value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} />
          <select aria-label={t("Prerequisite module", "Module tiên quyết")} className="rounded-md border bg-background px-3 text-sm" value={modulePrerequisite} onChange={(event) => setModulePrerequisite(event.target.value)}>
            <option value="">{t("No module prerequisite", "Không có module tiên quyết")}</option>
            {data.modules.map((module) => <option key={module.id} value={module.id}>{module.position}. {module.title}</option>)}
          </select>
          <Button variant="outline" disabled={course.addModule.isPending}><Plus className="mr-1 size-4" />{t("Add module", "Thêm module")}</Button>
        </form>
        {course.addModule.isError && <p role="alert" className="text-sm text-destructive">{t("Could not add the module.", "Không thêm được module.")}</p>}
        <ol className="space-y-3">
          {data.modules.map((module) => <li key={module.id} className="rounded-xl border p-4">
            <div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-primary/10 text-sm font-semibold">{module.position}</span><div><h3 className="font-medium">{module.title}</h3>{module.prerequisiteModuleId && <p className="text-xs text-muted-foreground">{t("Prerequisite:", "Tiên quyết:")} {data.modules.find((candidate) => candidate.id === module.prerequisiteModuleId)?.title ?? t("previous module", "module trước")}</p>}</div></div>
            {module.items.length > 0 ? <ol className="ml-9 mt-3 space-y-2">{module.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"><span>{item.title}</span><span className="rounded border px-2 py-0.5 text-xs">{item.type.replaceAll("_", " ")}{item.assignmentId ? ` · Lab ${item.assignmentId.slice(0, 8)}` : ""}{item.required ? " · required" : " · optional"}</span></li>)}</ol> : <p className="ml-9 mt-2 text-xs text-muted-foreground">{t("No learning items yet.", "Chưa có nội dung học.")}</p>}
            <form onSubmit={(event) => addItem(module.id, event)} className="mt-3 space-y-2">
              <select aria-label={t("Learning item type", "Loại nội dung")} className="rounded-md border bg-background px-3 text-sm" value={moduleItemType[module.id] ?? "THEORY"} onChange={(event) => setModuleItemType((current) => ({ ...current, [module.id]: event.target.value as (typeof itemTypes)[number] }))}>{itemTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select>
              <Input aria-label={t("Learning item title", "Tên nội dung")} required maxLength={255} placeholder={t("Learning item title", "Tên nội dung học")} value={moduleItemTitle[module.id] ?? ""} onChange={(event) => setModuleItemTitle((current) => ({ ...current, [module.id]: event.target.value }))} />
              <Input aria-label={t("Linked Lab assignment ID", "ID Lab liên kết")} placeholder={t("Optional Lab assignment ID", "ID Assignment Lab (không bắt buộc)")} value={moduleItemAssignment[module.id] ?? ""} onChange={(event) => setModuleItemAssignment((current) => ({ ...current, [module.id]: event.target.value }))} />
              <textarea aria-label={t("Structured activity content JSON", "Nội dung hoạt động dạng JSON")} className="min-h-20 w-full rounded-md border bg-background p-2 text-xs" placeholder={(moduleItemType[module.id] ?? "THEORY") === "THEORY" ? t('{"body":"Write the lesson content here"}', '{"body":"Nhập nội dung giáo trình ở đây"}') : (moduleItemType[module.id] ?? "THEORY") === "ESSAY" ? t('{"prompt":"Essay prompt","rubric":[{"criterion":"Reasoning","maxScore":10}]}', '{"prompt":"Đề tự luận","rubric":[{"criterion":"Lập luận","maxScore":10}]}') : t('Optional activity config JSON, e.g. {"lesson":"..."}', 'Cấu hình JSON tùy chọn, ví dụ {"lesson":"..."}')} value={moduleItemContent[module.id] ?? ""} onChange={(event) => setModuleItemContent((current) => ({ ...current, [module.id]: event.target.value }))} />
              <Button size="sm" variant="outline" disabled={course.addItem.isPending || (Boolean((moduleItemContent[module.id] ?? "").trim()) && !isJson(moduleItemContent[module.id] ?? ""))}><Plus className="mr-1 size-4" />{t("Add item", "Thêm nội dung")}</Button>
            </form>
          </li>)}
        </ol>
        {course.addItem.isError && <p role="alert" className="text-sm text-destructive">{t("Could not add the learning item. Verify the linked Lab ID belongs to this class and content is valid JSON.", "Không thêm được nội dung. Kiểm tra ID Lab có thuộc lớp này và JSON hợp lệ.")}</p>}
        {data.modules.map((module) => { const invalidContent = moduleItemContent[module.id] ?? ""; return !isJson(invalidContent) && invalidContent.trim() ? <p key={`${module.id}-json-error`} role="alert" className="text-xs text-destructive">{t("Activity config must be a JSON object.", "Cấu hình hoạt động phải là JSON object.")}</p> : null; })}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {course.versions.data?.length ? t("Published immutable versions:", "Phiên bản đã publish bất biến:") : t("No published version yet.", "Chưa có phiên bản được publish.")} {course.versions.data?.map((version) => `v${version.version} (${version.snapshotDigest.slice(0, 18)}…)`).join(" · ")}
          </div>
          <Button type="button" disabled={!data.modules.length || course.publish.isPending} onClick={() => {
            if (window.confirm(t("Publish an immutable snapshot of this course roadmap?", "Publish bản snapshot bất biến của lộ trình khóa học?"))) course.publish.mutate();
          }}>{course.publish.isPending ? t("Publishing…", "Đang publish…") : t("Publish course version", "Publish phiên bản khóa học")}</Button>
        </div>
        {course.publish.isError && <p role="alert" className="text-sm text-destructive">{t("Course could not be published. Every module needs at least one item and linked Labs must belong to this class.", "Không publish được khóa học. Mỗi module cần ít nhất một nội dung và Lab liên kết phải thuộc lớp này.")}</p>}
        {course.publish.isSuccess && <div role="status" className="space-y-2 text-sm text-success"><p>{t("Published immutable version", "Đã publish phiên bản bất biến")} v{course.publish.data.version} · {course.publish.data.snapshotDigest}</p><Button type="button" variant="outline" size="sm" disabled={course.startDraft.isPending} onClick={() => course.startDraft.mutate()}>{t("Continue in a new draft", "Tiếp tục bằng bản nháp mới")}</Button></div>}
      </>}
    </section>
  );
}

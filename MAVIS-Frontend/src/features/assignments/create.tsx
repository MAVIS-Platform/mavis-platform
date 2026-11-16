"use client";
import { useCallback, useState } from "react";
import { Check, ClipboardList, Layers3, Rocket, ShieldCheck } from "lucide-react";
import { useApiMutation, useApiQuery, useSession } from "@/hooks/use-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/request-state";
import { Textarea } from "@/components/ui/textarea";
import { AssignmentSourcePicker } from "./source-picker";
import type { Assignment } from "./requirements";
import { normalizeDiagramRequirements } from "@/lib/architecture/coursework-diagram-types";
import { DIAGRAM_REQUIREMENTS } from "./requirements";
import { useLocale } from "@/lib/i18n/locale-context";
export function CreateAssignment({
  workspaceId,
  assignment,
  onSuccess,
}: {
  workspaceId: string;
  assignment?: Assignment;
  onSuccess?: () => void;
}) {
  const create = useApiMutation(assignment ? "updateAssignment" : "createAssignment"),
    session = useSession(),
    workspaces = useApiQuery("workspaces", {});
  const [title, setTitle] = useState(assignment?.title ?? ""),
    [description, setDescription] = useState(assignment?.instructions ?? ""),
    [due, setDue] = useState(
      assignment?.dueAt && assignment.dueAt !== "No deadline"
        ? new Date(
            new Date(assignment.dueAt).getTime() -
              new Date(assignment.dueAt).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [trace, setTrace] = useState(assignment?.requireRuntimeTrace ?? false);
  const [sourceModelId, setSourceModelId] = useState(assignment?.referenceSource?.modelId ?? "");
  const [sourcePending, setSourcePending] = useState(false);
  const [sourceKey, setSourceKey] = useState(0);
  const sourceChanged = useCallback((id: string, pending: boolean) => {
    setSourceModelId(id);
    setSourcePending(pending);
  }, []);
  const { locale } = useLocale();
  const t = (en: string, vi: string) => (locale === "vi" ? vi : en);
  const [required, setRequired] = useState<string[]>(
    normalizeDiagramRequirements(assignment?.requiredDiagramTypes ?? []),
  );
  const requiredCount = required.length;
  const sourceReady = Boolean(sourceModelId) && !sourcePending;
  const steps = [
    { label: t("Lab details", "Thông tin Lab"), complete: Boolean(title.trim()), icon: ClipboardList, href: "#lab-details-heading" },
    { label: t("Reference version", "Phiên bản tham chiếu"), complete: sourceReady, icon: Layers3, href: "#reference-heading" },
    { label: t("Review & save draft", "Kiểm tra và lưu nháp"), complete: Boolean(title.trim()) && sourceReady, icon: ShieldCheck, href: "#runtime-requirements-heading" },
  ];
  if (
    session.data?.user?.role !== "admin" &&
    workspaces.data?.find((w) => w.id === workspaceId)?.myRole !== "LECTURER"
  )
    return null;
  return (
    <section aria-labelledby="lab-authoring-title" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 p-5 sm:p-7">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Layers3 className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="lab-authoring-title" className="text-xl font-semibold tracking-tight">
                  {assignment ? t("Edit Lab", "Chỉnh sửa Lab") : t("Create a Lab", "Tạo Lab")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "Build a class Lab around a pinned reference version. Saving creates a draft; publishing is a separate review step.",
                    "Tạo Lab của lớp từ phiên bản tham chiếu đã ghim. Lưu sẽ tạo bản nháp; công bố là bước kiểm tra riêng.",
                  )}
                </p>
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3" aria-label={t("Lab creation progress", "Tiến độ tạo Lab")}>
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <a key={step.label} href={step.href} className="flex items-center gap-2 border-b pb-3 hover:text-foreground sm:border-b-0 sm:border-r sm:pb-0 last:border-r-0">
                    <span className={`grid size-7 shrink-0 place-items-center rounded-full ${step.complete ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                      {step.complete ? <Check className="size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">{index + 1}. {step.label}</span>
                  </a>
                );
              })}
            </div>
          </div>

          <form
            className="mt-7 space-y-7"
            onSubmit={(e) => {
              e.preventDefault();
              if (sourcePending || !sourceModelId) return;
              create.mutate(
                {
                  workspaceId,
                  ...(assignment ? { assignmentId: assignment.id } : {}),
                  title,
                  description,
                  dueAt: due ? new Date(due).toISOString() : null,
                  requireRuntimeTrace: trace,
                  requiredDiagramTypes: required,
                  referenceModelId: sourceModelId,
                  clearReferenceSource: false,
                },
                {
                  onSuccess: () => {
                    onSuccess?.();
                    if (assignment) return;
                    setSourceModelId("");
                    setSourceKey((key) => key + 1);
                    setRequired([]);
                    setTrace(false);
                    setTitle("");
                    setDescription("");
                    setDue("");
                  },
                },
              );
            }}
          >
        <section className="space-y-4" aria-labelledby="lab-details-heading">
          <div className="flex items-center gap-2 border-b pb-2">
            <ClipboardList className="size-4 text-primary" aria-hidden="true" />
            <h3 id="lab-details-heading" className="font-semibold">{t("Lab details", "Thông tin Lab")}</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
            <label className="block space-y-1.5 text-sm font-medium">
              <span>{t("Lab title", "Tên Lab")}</span>
              <Input
                aria-label="Assignment title"
                placeholder={t("e.g. Service resilience and failure handling", "Ví dụ: Khả năng chịu lỗi và xử lý sự cố dịch vụ")}
                required
                maxLength={255}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <span className="text-xs font-normal text-muted-foreground">{title.length}/255</span>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>{t("Due date (optional)", "Hạn nộp (không bắt buộc)")}</span>
              <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>{t("Instructions for students", "Hướng dẫn cho sinh viên")}</span>
            <Textarea
              aria-label="Assignment instructions"
              placeholder={t("Describe the learning goal, what students should investigate, and what they should explain in their evidence.", "Nêu mục tiêu học tập, nội dung sinh viên cần khảo sát và điều cần giải thích trong minh chứng.")}
              maxLength={10000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </section>

        <section className="space-y-4" aria-labelledby="reference-heading">
          <div className="border-b pb-2">
            <div className="flex items-center gap-2">
              <Layers3 className="size-4 text-primary" aria-hidden="true" />
              <h3 id="reference-heading" className="font-semibold">{t("Reference project and pinned analysis", "Project tham chiếu và phân tích đã ghim")}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("The selected source and model revision become part of this Lab. Import or analyze the source before saving.", "Nguồn và phiên bản model đã chọn sẽ gắn với Lab. Hãy nhập hoặc phân tích nguồn trước khi lưu.")}
            </p>
          </div>
          <AssignmentSourcePicker
            key={sourceKey}
            workspaceId={workspaceId}
            title={title}
            initial={assignment?.referenceSource}
            onChange={sourceChanged}
          />
        </section>

        <section className="space-y-4" aria-labelledby="runtime-requirements-heading">
          <div className="border-b pb-2">
            <div className="flex items-center gap-2">
              <Rocket className="size-4 text-primary" aria-hidden="true" />
              <h3 id="runtime-requirements-heading" className="font-semibold">{t("Student evidence requirements", "Yêu cầu minh chứng của sinh viên")}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("These settings describe the assignment requirements. Runtime readiness and Studio topology are configured separately after the reference source is ready.", "Các lựa chọn này xác định yêu cầu bài tập. Runtime readiness và topology Studio được cấu hình riêng sau khi nguồn tham chiếu sẵn sàng.")}
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40">
            <input className="mt-1 size-4 accent-primary" type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} />
            <span className="space-y-1">
              <span className="block text-sm font-medium">{t("Require a real runtime trace", "Yêu cầu trace runtime thật")}</span>
              <span className="block text-xs text-muted-foreground">{t("Students must complete the Runtime/Studio evidence flow before submitting this Lab.", "Sinh viên phải hoàn tất luồng minh chứng Runtime/Studio trước khi nộp Lab.")}</span>
            </span>
          </label>
          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-medium">{t("Required architecture views", "Các góc nhìn kiến trúc bắt buộc")}</legend>
            <p className="text-xs text-muted-foreground">
              {t("Select the diagrams students must include. Leave all unchecked if any saved view is acceptable.", "Chọn sơ đồ sinh viên cần nộp. Để trống nếu chấp nhận bất kỳ góc nhìn nào đã lưu.")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DIAGRAM_REQUIREMENTS.map((type) => (
                <label key={type.id} className="flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                  <input
                    className="size-4 accent-primary"
                    type="checkbox"
                    checked={required.includes(type.id)}
                    onChange={(e) =>
                      setRequired((current) =>
                        e.target.checked
                          ? [...current, type.id]
                          : current.filter((t) => t !== type.id),
                      )
                    }
                  />
                  {type.label}
                </label>
              ))}
            </div>
            {assignment?.requiredDiagramTypes?.some((type) => type === "C4" || type === "VIEW_4_PLUS_1") && (
              <p className="text-xs text-muted-foreground">
                {t("Legacy diagram groups are shown as their current individual views.", "Nhóm sơ đồ cũ đã được chuyển thành các góc nhìn riêng hiện hành.")}
              </p>
            )}
          </fieldset>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <div className="text-xs text-muted-foreground">
            {sourceReady
              ? t("Reference version selected", "Đã chọn phiên bản tham chiếu")
              : t("A pinned reference analysis is needed before saving a course Lab.", "Cần chọn phân tích tham chiếu đã ghim trước khi lưu Lab của khóa học.")}
            {requiredCount > 0 ? ` · ${requiredCount} ${t("required views", "góc nhìn bắt buộc")}` : ` · ${t("No required-view filter", "Không lọc góc nhìn bắt buộc")}`}
          </div>
          <Button disabled={create.isPending || sourcePending || !sourceModelId}>
            {create.isPending
              ? t("Saving Lab draft…", "Đang lưu bản nháp Lab…")
              : assignment
                ? t("Save Lab changes", "Lưu thay đổi Lab")
                : t("Save Lab draft", "Lưu bản nháp Lab")}
          </Button>
        </div>
        {!sourceModelId && !sourcePending && (
          <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
            {t("Choose an analyzed reference version to enable saving.", "Chọn phiên bản tham chiếu đã phân tích để bật lưu.")}
          </p>
        )}
        {create.error && <ErrorState error={create.error} />}
          </form>
        </div>
        <aside className="border-t bg-muted/20 p-5 lg:border-l lg:border-t-0 sm:p-6">
      <div className="sticky top-5 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{t("After saving", "Sau khi lưu")}</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("A saved draft is not visible to students. Review the source, publish it as the next Lab, then finish the course setup checklist.", "Bản nháp đã lưu chưa hiển thị với sinh viên. Kiểm tra nguồn, công bố thành Lab tiếp theo rồi hoàn tất checklist thiết lập khóa học.")}
          </p>
        </div>
        <ol className="space-y-3 text-sm">
          {[
            t("Review the pinned source and Lab instructions.", "Kiểm tra nguồn đã ghim và hướng dẫn Lab."),
            t("Publish the draft into the class Lab sequence.", "Công bố bản nháp vào thứ tự Lab của lớp."),
            t("Configure runtime and freeze Studio topology for Labs that require it.", "Cấu hình runtime và đóng băng topology Studio cho Lab có yêu cầu."),
            t("Publish the versioned Quiz and issue a Passkey from Course setup.", "Công bố Quiz có phiên bản và cấp Passkey trong Thiết lập khóa học."),
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-background text-xs font-semibold">{index + 1}</span>
              <span className="leading-relaxed text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" size="sm" className="w-full" asChild>
          <a href={`/roadmap?workspace=${encodeURIComponent(workspaceId)}`}>
            {t("Open Course setup checklist", "Mở checklist thiết lập khóa học")}
          </a>
        </Button>
        {assignment && (
          <Button type="button" variant="outline" size="sm" className="w-full" asChild>
            <a
              href={`/lab?workspace=${encodeURIComponent(workspaceId)}&assignment=${encodeURIComponent(assignment.id)}&step=1&preview=1`}
            >
              {t("Preview as student", "Xem trước như sinh viên")}
            </a>
          </Button>
        )}
      </div>
    </aside>
  </div>
</section>
);
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileQuestion, Library, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuizBuilder } from "@/features/assignments/quiz-builder";
import { emptyQuestion, type QuizDraft, type QuizQuestion } from "@/features/assignments/quiz-types";
import { api } from "@/lib/mainflow-api";
import { useLocale } from "@/lib/i18n/locale-context";
import { useCourseAuthoring } from "@/features/workspaces/course-access";

type QuizAsset = {
  id: string;
  title: string;
  description: string | null;
  passPercent: number;
  questions: QuizQuestion[];
  updatedAt: string;
};

type QuizCatalog = {
  curriculumQuizzes: Array<{
    chapterId: string;
    track: string;
    phase: string;
    title: string;
    passPercent: number;
    questions: QuizQuestion[];
  }>;
  reusableQuizzes: Array<{
    id: string;
    sourceWorkspaceId: string;
    sourceWorkspaceName: string;
    title: string;
    description: string | null;
    passPercent: number;
    questions: QuizQuestion[];
    updatedAt: string;
  }>;
};

const NEW_ASSET: QuizAsset = {
  id: "new",
  title: "",
  description: "",
  passPercent: 80,
  questions: [emptyQuestion()],
  updatedAt: "",
};

function staticDiagramQuizTemplate(t: (en: string, vi?: string) => string): QuizAsset {
  return {
    id: "new",
    title: t(
      "C1–C3 Static Architecture & Boundary Check Quiz",
      "Quiz Đọc Kiến Trúc Tĩnh C1–C3 & Boundary",
    ),
    description: t(
      "Assesses student ability to interpret C1 System Context, C2 Containers, Database-per-Service boundaries, and Reverse BFS blast radius.",
      "Đánh giá khả năng đọc sơ đồ C1–C3, tách ranh giới dữ liệu mỗi service và truy vết ảnh hưởng Reverse BFS.",
    ),
    passPercent: 70,
    updatedAt: "",
    questions: [
      {
        prompt: t(
          "In a C2 Container diagram, what indicates a Shared Database anti-pattern?",
          "Trên sơ đồ C2 Container, dấu hiệu nào cho thấy vi phạm Shared Database?",
        ),
        type: "SINGLE_CHOICE",
        options: [
          t(
            "Two distinct microservices read and write directly to the same database schema",
            "Hai microservice khác nhau đọc/ghi trực tiếp vào cùng một schema database",
          ),
          t(
            "A microservice exposes a REST JSON endpoint to an API Gateway",
            "Một microservice mở REST JSON endpoint qua API Gateway",
          ),
          t(
            "A service publishes asynchronous domain events to a message broker",
            "Một service phát domain event bất đồng bộ qua message broker",
          ),
        ],
        correctOption: 0,
        explanation: t(
          "Each Bounded Context should own its private database schema to maintain independent deployability and fault isolation.",
          "Mỗi Bounded Context nên sở hữu schema dữ liệu riêng để đảm bảo độc lập triển khai và cô lập lỗi.",
        ),
        points: 1,
      },
      {
        prompt: t(
          "When applying Reverse BFS to inspect an upstream outage on payment-service, which callers belong to Hop 1?",
          "Khi dùng Reverse BFS kiểm tra ảnh hưởng từ payment-service, thành phần nào thuộc Hop 1?",
        ),
        type: "SINGLE_CHOICE",
        options: [
          t(
            "Services that directly invoke payment-service over HTTP/gRPC/Feign",
            "Các service gọi trực tiếp tới payment-service qua HTTP/gRPC/Feign",
          ),
          t(
            "Isolated cron jobs with zero inbound or outbound edges to payment-service",
            "Cron job độc lập không có kết nối tới payment-service",
          ),
          t(
            "The database server hosting only unrelated audit logs",
            "Database chỉ chứa nhật ký kiểm toán độc lập",
          ),
        ],
        correctOption: 0,
        explanation: t(
          "Hop 1 captures direct synchronous callers referencing the degraded service.",
          "Hop 1 gồm các bên gọi trực tiếp phụ thuộc vào service đang gặp sự cố.",
        ),
        points: 1,
      },
      {
        prompt: t(
          "Which strategies reduce cascading timeout failures in C3 service integrations? (Select all that apply)",
          "Những giải pháp nào giúp giảm lỗi timeout dây chuyền ở tầng C3 Component? (Chọn nhiều đáp án)",
        ),
        type: "MULTI_CHOICE",
        options: [
          t(
            "Circuit Breaker with bounded timeout and graceful fallback",
            "Circuit Breaker kèm timeout giới hạn và fallback",
          ),
          t(
            "Transactional Outbox with async event publishing",
            "Transactional Outbox phát sự kiện bất đồng bộ",
          ),
          t(
            "Sharing internal JPA entity classes across microservice repositories",
            "Chia sẻ trực tiếp class JPA Entity giữa các microservice",
          ),
        ],
        correctOptions: [0, 1],
        explanation: t(
          "Circuit Breakers and asynchronous Outbox messaging isolate latency spikes; sharing entity classes increases coupling.",
          "Circuit Breaker và Outbox bất đồng bộ giúp cô lập độ trễ; dùng chung Entity làm tăng độ phụ thuộc chéo.",
        ),
        points: 1,
      },
    ],
  };
}

export function QuizLibrary({ workspaceId }: { workspaceId: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const course = useCourseAuthoring(workspaceId);
  const [editing, setEditing] = useState<QuizAsset | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogTrack, setCatalogTrack] = useState<"ALL" | "JAVA" | "CSHARP" | "OTHER">("ALL");
  const [moduleByAsset, setModuleByAsset] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const assets = useQuery({
    queryKey: ["api", "quiz-assets", workspaceId],
    queryFn: ({ signal }) => api<QuizAsset[]>(`workspaces/${workspaceId}/quiz-assets`, { signal }),
  });
  const catalog = useQuery({
    queryKey: ["api", "quiz-catalog", workspaceId],
    queryFn: ({ signal }) =>
      api<QuizCatalog>(`workspaces/${workspaceId}/quiz-assets/catalog`, { signal }),
    enabled: Boolean(workspaceId && catalogOpen),
    retry: false,
  });
  const assignedIds = useMemo(
    () =>
      new Set(
        course.data?.modules
          .flatMap((module) => module.items)
          .map((item) => String(item.content["quizAssetId"] ?? ""))
          .filter(Boolean) ?? [],
      ),
    [course.data],
  );
  const existingTitles = useMemo(
    () => new Set((assets.data ?? []).map((item) => item.title.trim().toLowerCase())),
    [assets.data],
  );
  const invalidate = async () =>
    cache.invalidateQueries({ queryKey: ["api", "quiz-assets", workspaceId] });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<null>(`workspaces/${workspaceId}/quiz-assets/${id}`, { method: "DELETE" }),
    onSuccess: () => void invalidate(),
  });
  const importPreset = useMutation({
    mutationFn: (preset: Omit<QuizAsset, "id" | "updatedAt">) =>
      api<QuizAsset>(`workspaces/${workspaceId}/quiz-assets`, {
        method: "POST",
        body: JSON.stringify(preset),
      }),
    onSuccess: () => {
      void invalidate();
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });
  const saveAsset = async (draft: QuizDraft) => {
    const path =
      editing && editing.id !== "new"
        ? `workspaces/${workspaceId}/quiz-assets/${editing.id}`
        : `workspaces/${workspaceId}/quiz-assets`;
    const saved = await api<QuizAsset>(path, {
      method: editing && editing.id !== "new" ? "PUT" : "POST",
      body: JSON.stringify({
        title: draft.lesson,
        description: editing?.description ?? "",
        passPercent: draft.passPercent,
        questions: draft.questions,
      }),
    });
    await invalidate();
    setError("");
    return saved;
  };
  const assign = (asset: QuizAsset) => {
    const moduleId = moduleByAsset[asset.id] || course.data?.modules[0]?.id;
    if (!moduleId) {
      setError(t("Create a Module before assigning this Quiz.", "Hãy tạo Module trước khi xếp Quiz."));
      return;
    }
    course.addItem.mutate(
      {
        moduleId,
        type: "QUIZ",
        title: asset.title,
        ...(asset.description ? { description: asset.description } : {}),
        required: true,
        content: { quizAssetId: asset.id, passPercent: asset.passPercent, questions: asset.questions },
      },
      { onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)) },
    );
  };

  const content = (
    <section className="space-y-5" aria-labelledby="quiz-library-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="quiz-library-title" className="text-2xl font-bold">
            {t("Quiz Library", "Thư viện Quiz")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Prepare a Quiz, then assign it to a Module when ready.",
              "Chuẩn bị Quiz, sau đó xếp vào Module khi đã sẵn sàng.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={catalogOpen ? "default" : "outline"}
            onClick={() => setCatalogOpen((prev) => !prev)}
          >
            <Library className="mr-1.5 size-4" />
            {t("Browse curated & reusable Quizzes", "Kho Quiz có sẵn")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(staticDiagramQuizTemplate(t))}
          >
            <Sparkles className="mr-1.5 size-4" />
            {t("C1–C3 Static Quiz Template", "Mẫu Quiz đọc sơ đồ C1–C3")}
          </Button>
          <Button onClick={() => setEditing({ ...NEW_ASSET, questions: [emptyQuestion()] })}>
            <Plus className="mr-1.5 size-4" />
            {t("New Quiz", "Quiz mới")}
          </Button>
        </div>
      </div>

      {catalogOpen && (
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <h3 className="text-sm font-semibold">
                {t(
                  "Available Quizzes (Curriculum & Your Other Classes)",
                  "Kho Quiz có sẵn (Curriculum & Lớp khác)",
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Import verified SWD chapter quizzes or quizzes created in other cohorts.",
                  "Nhập nhanh bộ câu hỏi chuẩn SWD hoặc từ lớp học khác vào thư viện.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["ALL", t("All", "Tất cả")],
                  ["JAVA", "Java"],
                  ["CSHARP", "C# / .NET"],
                  ["OTHER", t("Other classes", "Lớp khác")],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={catalogTrack === key ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setCatalogTrack(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <Input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder={t("Filter available quizzes…", "Tìm kiếm bộ câu hỏi…")}
          />
          <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {catalogTrack !== "OTHER" &&
              (catalog.data?.curriculumQuizzes ?? [])
                .filter((item) => {
                  const trackMatch =
                    catalogTrack === "ALL" ||
                    (catalogTrack === "JAVA" && item.track.toLowerCase().includes("java")) ||
                    (catalogTrack === "CSHARP" && item.track.toLowerCase().includes("c#"));
                  const term = catalogSearch.trim().toLowerCase();
                  return trackMatch && (!term || item.title.toLowerCase().includes(term));
                })
                .map((item) => {
                  const quizTitle = `Quiz · ${item.title}`;
                  const alreadyAdded = existingTitles.has(quizTitle.toLowerCase());
                  return (
                    <div
                      key={item.chapterId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {item.track}
                          </Badge>
                          <span className="truncate font-semibold">{quizTitle}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.questions.length} {t("questions", "câu hỏi")} · {item.passPercent}%
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={alreadyAdded ? "secondary" : "outline"}
                        disabled={importPreset.isPending || alreadyAdded}
                        onClick={() =>
                          importPreset.mutate({
                            title: quizTitle,
                            description: item.phase,
                            passPercent: item.passPercent,
                            questions: item.questions,
                          })
                        }
                      >
                        {alreadyAdded
                          ? t("Added", "Đã có")
                          : t("Import to library", "Nhập vào thư viện")}
                      </Button>
                    </div>
                  );
                })}
            {(catalogTrack === "ALL" || catalogTrack === "OTHER") &&
              (catalog.data?.reusableQuizzes ?? [])
                .filter((item) => {
                  const term = catalogSearch.trim().toLowerCase();
                  return (
                    !term ||
                    item.title.toLowerCase().includes(term) ||
                    item.sourceWorkspaceName.toLowerCase().includes(term)
                  );
                })
                .map((item) => {
                  const alreadyAdded = existingTitles.has(item.title.trim().toLowerCase());
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">
                            {item.sourceWorkspaceName}
                          </Badge>
                          <span className="truncate font-semibold">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.questions.length} {t("questions", "câu hỏi")} · {item.passPercent}%
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={alreadyAdded ? "secondary" : "outline"}
                        disabled={importPreset.isPending || alreadyAdded}
                        onClick={() =>
                          importPreset.mutate({
                            title: item.title,
                            description: item.description,
                            passPercent: item.passPercent,
                            questions: item.questions,
                          })
                        }
                      >
                        {alreadyAdded
                          ? t("Added", "Đã có")
                          : t("Reuse in library", "Dùng lại Quiz này")}
                      </Button>
                    </div>
                  );
                })}
          </div>
        </section>
      )}

      {editing && (
        <QuizBuilder
          key={editing.id}
          workspaceId={workspaceId}
          asset={editing}
          onSaveAsset={saveAsset}
          onCancel={() => setEditing(null)}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-3">
        {(assets.data ?? []).map((asset) => (
          <article key={asset.id} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileQuestion className="size-5" />
            </span>
            <div className="min-w-48 flex-1">
              <h3 className="font-bold">{asset.title}</h3>
              <p className="text-sm text-muted-foreground">
                {asset.questions.length} {t("questions", "câu hỏi")} · {asset.passPercent}% ·{" "}
                {assignedIds.has(asset.id) ? t("Assigned", "Đã xếp") : t("Ready", "Sẵn sàng")}
              </p>
            </div>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={moduleByAsset[asset.id] ?? ""}
              onChange={(event) =>
                setModuleByAsset({ ...moduleByAsset, [asset.id]: event.target.value })
              }
            >
              <option value="">{t("Choose Module", "Chọn Module")}</option>
              {course.data?.modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.title}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => assign(asset)}>
              {t("Add to Module", "Thêm vào Module")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("Edit Quiz", "Sửa Quiz")}
              onClick={() => setEditing(asset)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("Delete Quiz", "Xóa Quiz")}
              onClick={() => remove.mutate(asset.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </article>
        ))}
        {!assets.isLoading && !assets.data?.length && (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("No Quiz drafts yet.", "Chưa có bản nháp Quiz.")}
          </p>
        )}
      </div>
    </section>
  );

  return content;
}

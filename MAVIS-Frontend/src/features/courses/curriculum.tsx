"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailPanel } from "@/components/shared/data";
import { useLocale } from "@/lib/i18n/locale-context";
import { api } from "@/lib/mainflow-api";

type Source = { publisher: string; title: string; url: string };
const phases = ["foundation", "lab", "advanced"] as const;
export type Chapter = {
  id: string;
  track: "Java" | "C#";
  phase: (typeof phases)[number];
  title: string;
  minutes: number;
  objective: string;
  lesson: string;
  exercise: string;
  sources: Source[];
};

export function useCurriculum(enabled = true) {
  return useQuery({
    queryKey: ["api", "course-curriculum"],
    queryFn: ({ signal }) => api<Chapter[]>("course-curriculum", { signal }),
    enabled,
  });
}

export function CurriculumLibrary() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [track, setTrack] = useState<Chapter["track"]>("Java");
  const [search, setSearch] = useState("");
  const library = useCurriculum(open);
  const phaseLabels = {
    foundation: t("Foundations", "Nền tảng"),
    lab: t("Hands-on Labs", "Thực hành Lab"),
    advanced: t("Advanced", "Nâng cao"),
  };
  const keyword = search.trim().toLowerCase();
  const chapters = library.data?.filter((chapter) => chapter.track === track &&
    [chapter.title, chapter.objective].some((text) => text.toLowerCase().includes(keyword))) ?? [];
  return (
    <DetailPanel title={t("Java and C# curriculum", "Giáo trình Java và C#")}>
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        <BookOpen aria-hidden="true" />
        {open ? t("Close library", "Đóng thư viện") : t("Browse lessons", "Xem giáo trình")}
      </Button>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("Vietnamese lessons with official reference links.", "Bài học tiếng Việt kèm liên kết tài liệu chính thức.")}
          </p>
          {(["Java", "C#"] as const).map((language) => (
            <Button key={language} type="button" variant={track === language ? "default" : "outline"}
              aria-pressed={track === language} className="mr-2" onClick={() => setTrack(language)}>
              {language}
            </Button>
          ))}
          <label className="grid gap-1 text-sm font-medium">
            {t("Search lessons", "Tìm bài học")}
            <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {library.isPending && <p role="status">{t("Loading curriculum…", "Đang tải giáo trình…")}</p>}
          {library.isError && (
            <Button type="button" variant="outline" onClick={() => void library.refetch()}>
              {t("Retry loading curriculum", "Tải lại giáo trình")}
            </Button>
          )}
          {library.isSuccess && chapters.length === 0 && (
            <p role="status">{t("No lessons match your search.", "Không tìm thấy bài học phù hợp.")}</p>
          )}
          {phases.map((phase) => {
            const group = chapters.filter((chapter) => chapter.phase === phase);
            if (!group.length) return null;
            return (
              <section key={phase} className="space-y-2">
                <h3 className="text-sm font-semibold">{phaseLabels[phase]} · {group.length}</h3>
                {group.map((chapter) => (
                  <details key={chapter.id} className="rounded-lg border p-3">
                    <summary className="cursor-pointer font-medium">{chapter.title} · {chapter.minutes} {t("min", "phút")}</summary>
                    <div className="mt-3 space-y-2 text-sm" lang="vi">
                      <p><strong>Mục tiêu. </strong>{chapter.objective}</p>
                      <p>{chapter.lesson}</p>
                      <p><strong>Thực hành. </strong>{chapter.exercise}</p>
                      <ul className="list-disc space-y-1 pl-5">
                        {chapter.sources.map((source) => (
                          <li key={source.url}>
                            <a className="text-primary underline" href={source.url} target="_blank" rel="noreferrer">
                              {source.publisher} · {source.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </DetailPanel>
  );
}

export function CurriculumPublisher({ workspaceId, assignmentId }: { workspaceId: string; assignmentId: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [chapterId, setChapterId] = useState("");
  const library = useCurriculum();
  const publish = useMutation({
    mutationFn: (selected: string) => api<{ version: number }>(
      `workspaces/${workspaceId}/course-labs/${assignmentId}/quiz/curriculum`,
      { method: "POST", body: JSON.stringify({ chapterId: selected }) },
    ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["api", "course-quiz", workspaceId, assignmentId] });
    },
  });
  const labHref = `/lab?${new URLSearchParams({ workspace: workspaceId, assignment: assignmentId, step: "2" })}`;
  return (
    <form className="space-y-2" onSubmit={(event) => {
      event.preventDefault();
      if (chapterId && window.confirm(t(
        "Publish this chapter and Quiz for the Lab? Changing the content starts a new Quiz version.",
        "Công bố bài học và Quiz cho Lab này? Thay đổi nội dung sẽ tạo phiên bản Quiz mới.",
      ))) publish.mutate(chapterId);
    }}>
      <label className="grid gap-1 text-sm font-medium">
        {t("Curriculum chapter", "Bài giáo trình")}
        <select className="w-full rounded-md border bg-background px-2 py-1.5" value={chapterId}
          disabled={!library.data || publish.isPending} onChange={(event) => {
            setChapterId(event.target.value);
            publish.reset();
          }}>
          <option value="">{t("Select a Java or C# chapter", "Chọn bài Java hoặc C#")}</option>
          {(["Java", "C#"] as const).map((track) => (
            <optgroup key={track} label={track}>
              {library.data?.filter((chapter) => chapter.track === track).map((chapter) => (
                <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!chapterId || publish.isPending}>{t("Publish lesson and Quiz", "Công bố bài học và Quiz")}</Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href={labHref}>{t("View Lab lesson", "Xem bài học của Lab")}</Link>
        </Button>
      </div>
      {library.isError && <p role="alert">{t("Could not load curriculum.", "Không tải được giáo trình.")}</p>}
      {publish.isError && <p role="alert">{t("Could not publish the chapter. Check the Lab and permissions.", "Chưa công bố được bài. Hãy kiểm tra Lab và quyền của bạn.")}</p>}
      {publish.data && <p role="status">{t("Quiz version published", "Đã công bố phiên bản Quiz")} {publish.data.version}</p>}
    </form>
  );
}

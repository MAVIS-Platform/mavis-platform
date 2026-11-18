"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  KeyRound,
  Layers,
  Plus,
  Users,
} from "lucide-react";
import { useApiQuery, useSelection } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, RequestState } from "@/components/shared/request-state";
import { SearchInput } from "@/components/shared/forms";
import { StatusBadge } from "@/components/shared/data";
import { CreateWorkspace } from "./manage";
import { useLocale } from "@/lib/i18n/locale-context";

export function TeacherDashboard() {
  const { t } = useLocale();
  const query = useApiQuery("workspaces", {});
  const submissions = useApiQuery("submissions", {});
  const selection = useSelection();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const classes = query.data ?? [];
  const pendingByWorkspace = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sub of submissions.data ?? []) {
      if (!sub.workspaceId) continue;
      if (sub.reviewStatus && sub.reviewStatus !== "PENDING") continue;
      counts.set(sub.workspaceId, (counts.get(sub.workspaceId) ?? 0) + 1);
    }
    return counts;
  }, [submissions.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (ws) =>
        ws.name.toLowerCase().includes(q) ||
        (ws.code ?? "").toLowerCase().includes(q) ||
        (ws.description ?? "").toLowerCase().includes(q),
    );
  }, [classes, search]);

  const totalStudents = useMemo(
    () =>
      classes.reduce(
        (sum, ws) =>
          sum + (ws.members ?? []).filter((m) => m.role.toUpperCase() === "STUDENT").length,
        0,
      ),
    [classes],
  );
  const activeCount = useMemo(
    () => classes.filter((ws) => (ws.status ?? "ACTIVE") !== "ARCHIVED").length,
    [classes],
  );

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-950 via-indigo-700 to-purple-700 p-6 text-white shadow-lg sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-indigo-100 backdrop-blur-sm">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              {t("MAVIS Teaching Studio", "Không Gian Quản Lý Giảng Dạy")}
            </span>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("My Classes", "Lớp Học Của Tôi")}
            </h1>
            <p className="text-sm text-indigo-100/90">
              {t(
                "Create classes, author guided Labs with Quiz & 2D Studio, track student progress, and grade frozen submissions.",
                "Quản lý lớp học, biên soạn bài Lab tương tác (Quiz & 2D Studio), theo dõi tiến độ sinh viên và chấm bài tập.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              onClick={() => setShowCreate((open) => !open)}
              className="bg-emerald-500 text-white shadow-sm hover:bg-emerald-600"
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {showCreate ? t("Close", "Đóng") : t("Create class", "Tạo lớp mới")}
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href="/submissions">
                <ClipboardCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("Grading Queue", "Hàng Đợi Chấm Bài")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {showCreate && <CreateWorkspace onClose={() => setShowCreate(false)} />}

      {classes.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t("Managed Classes", "Tổng Số Lớp")}</span>
              <Layers className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{classes.length}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activeCount} {t("active", "đang hoạt động")}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t("Enrolled Students", "Tổng Sinh Viên")}</span>
              <Users className="h-4 w-4 text-purple-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{totalStudents}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Across all classes", "Trên tất cả lớp giảng dạy")}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t("Teaching Mode", "Chế Độ Giảng Dạy")}</span>
              <BookOpenCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-lg font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
              {t("Coursera / Guided Labs", "Học Liệu & Lab Tương Tác")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Theory · Reverse BFS · Quiz · Studio", "Lý thuyết · Reverse BFS · Quiz · Studio")}
            </p>
          </div>
        </section>
      )}

      <RequestState
        query={query}
        empty={!classes.length}
        emptyMessage={t(
          "You have no classes yet. Create the first class above.",
          "Bạn chưa có lớp nào. Hãy tạo lớp đầu tiên ở trên.",
        )}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full max-w-sm">
              <SearchInput
                value={search}
                onChange={setSearch}
                label={t("Search classes by name or code...", "Tìm lớp theo tên hoặc mã lớp...")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.length} / {classes.length} {t("classes", "lớp học")}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title={t("No matching classes", "Không tìm thấy lớp phù hợp")}
              description={t(
                "Try another keyword or create a new class.",
                "Hãy thử từ khóa khác hoặc tạo lớp học mới.",
              )}
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((workspace) => {
                const members = workspace.members ?? [];
                const students = members.filter(
                  (member) => member.role.toUpperCase() === "STUDENT",
                ).length;
                const pending = pendingByWorkspace.get(workspace.id) ?? 0;
                const workspaceUrl = `/workspace-overview?workspace=${encodeURIComponent(workspace.id)}`;
                return (
                  <article
                    key={workspace.id}
                    className="flex flex-col justify-between overflow-hidden rounded-[20px] border bg-card shadow-sm transition-all hover:border-teal-400 hover:shadow-md"
                  >
                    <div className="h-2 bg-gradient-to-r from-teal-600 via-emerald-600 to-indigo-600" />
                    <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge
                            variant="outline"
                            className="border-indigo-200 bg-indigo-50 font-mono text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                          >
                            {workspace.code || t("CLASS", "LỚP")}
                          </Badge>
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/workspace-members?workspace=${encodeURIComponent(workspace.id)}`}
                              onClick={() => selection.setWorkspaceId(workspace.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              <KeyRound className="h-3 w-3" aria-hidden="true" />
                              {t("Passkey", "Passkey")}
                            </Link>
                            <StatusBadge
                              status={workspace.status ?? "ACTIVE"}
                              variant={workspace.status === "ARCHIVED" ? "secondary" : "default"}
                            />
                          </div>
                        </div>

                        <div>
                          <Link
                            href={workspaceUrl}
                            onClick={() => selection.setWorkspaceId(workspace.id)}
                            className="block line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-foreground hover:text-teal-700 hover:underline"
                          >
                            {workspace.name}
                          </Link>
                          {workspace.description && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                              {workspace.description}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1 font-medium text-foreground">
                            <Users className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                            {students} {t("students", "sinh viên")}
                          </span>
                          {submissions.isSuccess && (
                            <span
                              className={
                                pending > 0
                                  ? "inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 font-medium text-amber-800"
                                  : "inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1 text-muted-foreground"
                              }
                            >
                              {pending > 0
                                ? `${pending} ${t("pending review", "bài chờ chấm")}`
                                : t("All graded", "Đã chấm xong")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                        <Button
                          asChild
                          size="sm"
                          onClick={() => selection.setWorkspaceId(workspace.id)}
                          className="flex-1 bg-teal-600 text-white hover:bg-teal-700"
                        >
                          <Link href={workspaceUrl}>
                            <Layers className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            {t("Open class", "Giáo trình & Bài học")}
                          </Link>
                        </Button>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          onClick={() => selection.setWorkspaceId(workspace.id)}
                        >
                          <Link href={`/assignments/new?workspace=${encodeURIComponent(workspace.id)}`}>
                            <BookOpenCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            {t("+ Lab", "+ Soạn Lab")}
                          </Link>
                        </Button>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          onClick={() => selection.setWorkspaceId(workspace.id)}
                        >
                          <Link href={`/submissions?workspace=${encodeURIComponent(workspace.id)}`}>
                            {t("Grading", "Chấm bài")}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </RequestState>
    </div>
  );
}

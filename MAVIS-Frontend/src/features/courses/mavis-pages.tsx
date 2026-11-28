"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
} from "lucide-react";
import { useApiQuery, useSession } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MavisShell } from "@/components/mavis-shell";
import { CourseCover } from "@/components/course-cover";
import { RequestState } from "@/components/shared/request-state";
import { cn } from "@/lib/utils";
import type { Response } from "@/lib/api/contracts";
import { PasskeyEnrollmentModal } from "@/features/courses/student-courses-dashboard";
import { useLocale } from "@/lib/i18n/locale-context";
import { decodePlainTextEntities } from "@/lib/format/course-display";

type Workspace = Response<"workspaces">[number];
type Translate = (english: string, vietnamese: string) => string;
const COURSES_PER_PAGE = 6;

function CoursePagination({
  page,
  totalItems,
  onPageChange,
  t,
}: {
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  t: Translate;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / COURSES_PER_PAGE));
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label={t("Course pagination", "Phân trang khóa học")}
      className="flex items-center justify-center gap-3 pt-2"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        {t("Previous", "Trước")}
      </Button>
      <span className="text-sm text-muted-foreground">
        {t("Page", "Trang")} {page + 1}/{totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        {t("Next", "Sau")}
      </Button>
    </nav>
  );
}

function workspaceStatusLabel(status: string | null | undefined, t: Translate) {
  switch (status) {
    case "ACTIVE":
      return t("Active", "Đang hoạt động");
    case "ARCHIVED":
      return t("Archived", "Đã lưu trữ");
    default:
      return status || t("Active", "Đang hoạt động");
  }
}

function difficultyLabel(level: string, t: Translate) {
  switch (level) {
    case "BEGINNER":
      return t("Beginner", "Cơ bản");
    case "INTERMEDIATE":
      return t("Intermediate", "Trung cấp");
    case "ADVANCED":
      return t("Advanced", "Nâng cao");
    default:
      return level;
  }
}

function priorityLabel(priority: string, t: Translate) {
  switch (priority) {
    case "LOW":
      return t("Low", "Thấp");
    case "HIGH":
      return t("High", "Cao");
    case "URGENT":
      return t("Urgent", "Khẩn cấp");
    default:
      return t("Normal", "Bình thường");
  }
}

function courseHref(workspaceId: string) {
  return `/roadmap?workspace=${encodeURIComponent(workspaceId)}`;
}

export function isArchivedOrQaCourse(
  workspace: Pick<Workspace, "status">,
): boolean {
  return workspace.status === "ARCHIVED";
}

function CourseCard({ workspace, compact = false }: { workspace: Workspace; compact?: boolean }) {
  const { t } = useLocale();
  return (
    <article className="group flex h-full flex-col rounded-2xl border bg-card p-5 shadow-[var(--shadow-low)]">
      <CourseCover courseId={workspace.id} className="rounded-xl" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
          {workspace.code || "COURSE"}
        </Badge>
        <Badge variant="outline">{workspaceStatusLabel(workspace.status, t)}</Badge>
      </div>
      <div className="mt-4 flex-1">
        <h2 className="text-lg font-semibold tracking-tight">{workspace.name}</h2>
        {!compact && workspace.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {decodePlainTextEntities(workspace.description)}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {workspace.members?.length ?? 0}{" "}
          {(workspace.members?.length ?? 0) === 1
            ? t("member", "thành viên")
            : t("members", "thành viên")}
        </p>
      </div>
      <Button asChild className="mt-5 w-full">
        <Link href={courseHref(workspace.id)}>
          {workspace.status === "ARCHIVED"
            ? t("View archived course", "Xem khóa học đã lưu trữ")
            : t("Continue learning", "Tiếp tục học")}{" "}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </article>
  );
}

function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-sky-50 via-card to-indigo-50/70 px-6 py-7 shadow-[var(--shadow-low)] dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/60 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      )}
    </section>
  );
}

function CoursesGrid({ workspaces, view }: { workspaces: Workspace[]; view: "card" | "list" }) {
  return (
    <div
      className={cn(
        view === "card" ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3" : "space-y-3",
        view === "list" && "max-w-4xl",
      )}
    >
      {workspaces.map((workspace) => (
        <CourseCard key={workspace.id} workspace={workspace} compact={view === "list"} />
      ))}
    </div>
  );
}

export function MavisHomePage() {
  const { t } = useLocale();
  const announcements = useApiQuery("announcements", {});
  const courses = useApiQuery("workspaces", {});
  const session = useSession();
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<"active" | "archived">("active");
  const [coursePage, setCoursePage] = useState(0);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const isStudent = session.data?.user?.role?.toLowerCase() === "student";
  const allCourses = courses.data ?? [];
  const activeCourses = useMemo(
    () => allCourses.filter((c) => !isArchivedOrQaCourse(c)),
    [allCourses],
  );
  const archivedCourses = useMemo(
    () => allCourses.filter((c) => isArchivedOrQaCourse(c)),
    [allCourses],
  );
  const courseItems = courseFilter === "archived" ? archivedCourses : activeCourses;
  const shown = courseItems.slice(
    coursePage * COURSES_PER_PAGE,
    (coursePage + 1) * COURSES_PER_PAGE,
  );
  useEffect(() => setCoursePage(0), [courseFilter]);
  return (
    <MavisShell>
      <div className="space-y-8">
        <PasskeyEnrollmentModal open={passkeyOpen} onClose={() => setPasskeyOpen(false)} />
        <PageTitle
          title={`${t("Welcome back", "Chào mừng bạn trở lại")}${session.data?.user?.name ? `, ${session.data.user.name}` : ""}`}
          description={t(
            "Find your learning activities, announcements and enrolled courses in one MAVIS workspace.",
            "Theo dõi hoạt động học tập, thông báo và các khóa học đã ghi danh tại MAVIS.",
          )}
        />
        <section aria-labelledby="site-announcements" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="site-announcements" className="text-xl font-semibold">
                {t("Site Announcements", "Thông báo hệ thống")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Latest updates from MAVIS administrators.",
                  "Các cập nhật mới nhất từ quản trị viên MAVIS.",
                )}
              </p>
            </div>
          </div>
          <RequestState query={announcements} empty={false}>
            {announcements.data?.length ? (
              <div className="grid gap-3">
                {(showAllAnnouncements ? announcements.data : announcements.data.slice(0, 4)).map(
                  (item) => (
                    <article key={item.id} className="rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{item.title}</h3>
                        {item.pinned && <Badge>{t("Pinned", "Đã ghim")}</Badge>}
                        <Badge variant="outline">{priorityLabel(item.priority, t)}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.content}</p>
                    </article>
                  ),
                )}
              </div>
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                {t(
                  "No site announcements are published right now.",
                  "Hiện chưa có thông báo hệ thống nào.",
                )}
              </p>
            )}
          </RequestState>
          {(announcements.data?.length ?? 0) > 4 && (
            <Button
              type="button"
              variant="link"
              className="px-0"
              onClick={() => setShowAllAnnouncements((value) => !value)}
            >
              {showAllAnnouncements
                ? t("Show latest only", "Chỉ xem thông báo mới nhất")
                : t("View all announcements", "Xem tất cả thông báo")}
            </Button>
          )}
        </section>
        <section aria-labelledby="search-courses" className="space-y-3">
          <h2 id="search-courses" className="text-xl font-semibold">
            {t("Search Courses", "Tìm kiếm khóa học")}
          </h2>
          <form
            className="flex max-w-2xl gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              window.location.assign(`/all-courses?q=${encodeURIComponent(search)}`);
            }}
          >
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder={t("Search courses", "Tìm kiếm khóa học")}
              />
            </div>
            <Button type="submit">{t("Search", "Tìm kiếm")}</Button>
          </form>
        </section>
        <section aria-labelledby="my-courses-preview" className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="my-courses-preview" className="text-xl font-semibold">
                {t("My Courses", "Khóa học của tôi")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Your enrolled courses and their current status.",
                  "Các khóa học bạn đã ghi danh và trạng thái hiện tại.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isStudent && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-teal-600 text-white hover:bg-teal-700"
                  onClick={() => setPasskeyOpen(true)}
                >
                  <KeyRound className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("Enter Class Passkey", "Nhập Mã Lớp (Passkey)")}
                </Button>
              )}
              <Button asChild variant="link">
                <Link href="/courses">
                  {t("View all", "Xem tất cả")} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
          {archivedCourses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t("Course status filter", "Lọc trạng thái khóa học")}>
              <Button
                type="button"
                size="sm"
                role="tab"
                aria-selected={courseFilter === "active"}
                variant={courseFilter === "active" ? "default" : "outline"}
                onClick={() => setCourseFilter("active")}
              >
                {t("Active", "Đang học")} ({activeCourses.length})
              </Button>
              <Button
                type="button"
                size="sm"
                role="tab"
                aria-selected={courseFilter === "archived"}
                variant={courseFilter === "archived" ? "default" : "outline"}
                onClick={() => setCourseFilter("archived")}
              >
                {t("Archived", "Đã lưu trữ")} ({archivedCourses.length})
              </Button>
            </div>
          )}
          <RequestState query={courses} empty={false}>
            {shown.length ? (
              <div className="space-y-4">
                <CoursesGrid workspaces={shown} view="card" />
                <CoursePagination
                  page={coursePage}
                  totalItems={courseItems.length}
                  onPageChange={setCoursePage}
                  t={t}
                />
              </div>
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                {courseFilter === "archived"
                  ? t("No archived courses found.", "Chưa có khóa học đã lưu trữ.")
                  : t("No active enrolled courses right now.", "Hiện chưa có khóa học đang học nào.")}
              </p>
            )}
          </RequestState>
        </section>
      </div>
    </MavisShell>
  );
}

export function MavisCoursesPage() {
  const { t } = useLocale();
  const courses = useApiQuery("workspaces", {});
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [courseFilter, setCourseFilter] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"card" | "list">("card");
  const [sort, setSort] = useState<"ASC" | "DESC">("ASC");
  const [page, setPage] = useState(0);
  const allCourses = courses.data ?? [];
  const activeCount = useMemo(
    () => allCourses.filter((c) => !isArchivedOrQaCourse(c)).length,
    [allCourses],
  );
  const archivedCount = useMemo(
    () => allCourses.filter((c) => isArchivedOrQaCourse(c)).length,
    [allCourses],
  );
  const sorted = useMemo(
    () =>
      allCourses
        .filter((course) =>
          courseFilter === "archived"
            ? isArchivedOrQaCourse(course)
            : !isArchivedOrQaCourse(course),
        )
        .filter((course) =>
          `${course.name} ${course.code ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === "ASC" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
        ),
    [allCourses, courseFilter, query, sort],
  );
  const pagedCourses = sorted.slice(page * COURSES_PER_PAGE, (page + 1) * COURSES_PER_PAGE);
  useEffect(() => setPage(0), [courseFilter, query, sort]);
  return (
    <MavisShell>
      <div className="space-y-6">
        <PasskeyEnrollmentModal open={passkeyOpen} onClose={() => setPasskeyOpen(false)} />
        <PageTitle
          title={t("My Courses", "Khóa học của tôi")}
          description={t(
            "Continue your enrolled classes or enter a Lecturer Passkey to join a new class.",
            "Tiếp tục học các lớp đã ghi danh hoặc nhập mã Passkey của Giảng viên để tham gia lớp mới.",
          )}
        />
        <section aria-labelledby="course-overview" className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="course-overview" className="text-lg font-semibold">
                {t("Course Overview", "Tổng quan khóa học")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Overview of your enrolled courses.", "Tổng quan các khóa học bạn đã ghi danh.")}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setPasskeyOpen(true)}
              className="gap-1.5"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              {t("Enter Class Passkey", "Nhập Mã Lớp (Passkey)")}
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">
              {t("Search Courses", "Tìm kiếm khóa học")}
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search enrolled courses", "Tìm trong khóa học đã ghi danh")}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t("Sort by Course Name", "Sắp xếp theo tên khóa học")}
              <select
                className="h-10 rounded-md border bg-card px-3 text-sm"
                value={sort}
                onChange={(event) => setSort(event.target.value as "ASC" | "DESC")}
              >
                <option value="ASC">A–Z</option>
                <option value="DESC">Z–A</option>
              </select>
            </label>
            <div className="flex gap-1 rounded-lg border bg-[var(--section-background)] p-1">
              <Button
                type="button"
                size="sm"
                variant={view === "card" ? "default" : "ghost"}
                onClick={() => setView("card")}
              >
                <TableProperties className="size-4" />
                {t("Card", "Thẻ")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "list" ? "default" : "ghost"}
                onClick={() => setView("list")}
              >
                <List className="size-4" />
                {t("List", "Danh sách")}
              </Button>
            </div>
          </div>
        </section>
        <section aria-labelledby="enrolled-courses" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="enrolled-courses" className="text-xl font-semibold">
                {t("Enrolled Courses", "Khóa học đã ghi danh")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("Course information and course status.", "Thông tin và trạng thái khóa học.")}
              </p>
            </div>
            {archivedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t("Course status filter", "Lọc trạng thái khóa học")}>
                <Button
                  type="button"
                  size="sm"
                  role="tab"
                  aria-selected={courseFilter === "active"}
                  variant={courseFilter === "active" ? "default" : "outline"}
                  onClick={() => setCourseFilter("active")}
                >
                  {t("Active", "Đang học")} ({activeCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  role="tab"
                  aria-selected={courseFilter === "archived"}
                  variant={courseFilter === "archived" ? "default" : "outline"}
                  onClick={() => setCourseFilter("archived")}
                >
                  {t("Archived", "Đã lưu trữ")} ({archivedCount})
                </Button>
              </div>
            )}
          </div>
          <RequestState query={courses} empty={false}>
            {sorted.length ? (
              <div className="space-y-4">
                <CoursesGrid workspaces={pagedCourses} view={view} />
                <CoursePagination
                  page={page}
                  totalItems={sorted.length}
                  onPageChange={setPage}
                  t={t}
                />
              </div>
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                {t(
                  "No enrolled course matches your search.",
                  "Không có khóa học đã ghi danh phù hợp.",
                )}
              </p>
            )}
          </RequestState>
        </section>
      </div>
    </MavisShell>
  );
}

export function AllCoursesPage({ initialQuery = "" }: { initialQuery?: string }) {
  const { t } = useLocale();
  const [query, setQuery] = useState(initialQuery);
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [category, setCategory] = useState<string | undefined>();
  const [difficulty, setDifficulty] = useState<
    "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | undefined
  >();
  const [sort, setSort] = useState<"NAME" | "NEWEST">("NAME");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [query, category, difficulty, sort]);
  const catalog = useApiQuery("catalogCourses", {
    q: query,
    category,
    difficulty,
    sort,
    page,
    size: COURSES_PER_PAGE,
  });
  return (
    <MavisShell>
      <div className="space-y-6">
        <PasskeyEnrollmentModal open={passkeyOpen} onClose={() => setPasskeyOpen(false)} />
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-muted-foreground">
            <Link href="/courses">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t("Back to My Courses", "Quay lại Khóa học của tôi")}
            </Link>
          </Button>
        </div>
        <PageTitle
          title={t("All Courses", "Tất cả khóa học")}
          description={t(
            "Explore available courses and learning opportunities.",
            "Khám phá các khóa học hiện có và bắt đầu lộ trình học tập của bạn.",
          )}
        />
        <section aria-labelledby="course-search" className="rounded-2xl border bg-card p-4">
          <h2 id="course-search" className="sr-only">
            {t("Course Search & Filters", "Tìm kiếm và lọc khóa học")}
          </h2>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <label className="grid gap-1 text-sm font-medium">
              {t("Search Courses", "Tìm kiếm khóa học")}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder={t("Search courses", "Tìm kiếm khóa học")}
                />
              </div>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t("Difficulty Level", "Mức độ khó")}
              <select
                className="h-11 rounded-md border bg-card px-3 text-sm"
                value={difficulty ?? ""}
                onChange={(event) =>
                  setDifficulty((event.target.value || undefined) as typeof difficulty)
                }
              >
                <option value="">{t("All levels", "Tất cả cấp độ")}</option>
                <option value="BEGINNER">{t("Beginner", "Cơ bản")}</option>
                <option value="INTERMEDIATE">{t("Intermediate", "Trung cấp")}</option>
                <option value="ADVANCED">{t("Advanced", "Nâng cao")}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="size-4" />
                {t("Sort By", "Sắp xếp theo")}
              </span>
              <select
                className="h-11 rounded-md border bg-card px-3 text-sm"
                value={sort}
                onChange={(event) => setSort(event.target.value as "NAME" | "NEWEST")}
              >
                <option value="NAME">{t("Course name", "Tên khóa học")}</option>
                <option value="NEWEST">{t("Newest", "Mới nhất")}</option>
              </select>
            </label>
          </div>
        </section>
        <section aria-labelledby="course-categories" className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 id="course-categories" className="text-xl font-semibold">
              {t("Course Categories", "Danh mục khóa học")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!category ? "default" : "outline"}
              onClick={() => setCategory(undefined)}
            >
              {t("All Categories", "Tất cả danh mục")}
            </Button>
            {(catalog.data?.categories ?? [])
              .filter(
                (item) =>
                  item.trim().length >= 3 &&
                  item.trim().length <= 42 &&
                  !/^\d+$/.test(item.trim()) &&
                  !/^(abc|test|qa\b|\[qa)/i.test(item.trim()),
              )
              .slice(0, 10)
              .map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={category === item ? "default" : "outline"}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </Button>
              ))}
          </div>
        </section>
        <section aria-labelledby="all-courses" className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 id="all-courses" className="text-xl font-semibold">
                {t("All Courses", "Tất cả khóa học")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Course description, difficulty level and learning path.",
                  "Mô tả khóa học, mức độ khó và lộ trình học tập.",
                )}
              </p>
            </div>
            {catalog.data && (
              <p className="text-sm text-muted-foreground">
                {catalog.data.total} {t("courses", "khóa học")}
              </p>
            )}
          </div>
          <RequestState query={catalog} empty={false}>
            {catalog.data?.items.length ? (
              <div className="space-y-4">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {catalog.data.items.map((course) => (
                    <article
                      key={course.workspaceId}
                      className="group flex flex-col rounded-2xl border bg-card p-5 shadow-[var(--shadow-low)]"
                    >
                      <CourseCover courseId={course.workspaceId} className="rounded-xl" />
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {course.difficulties.map((level) => (
                          <Badge key={level} variant="outline">
                            {difficultyLabel(level, t)}
                          </Badge>
                        ))}
                      </div>
                      <h3 className="mt-4 text-lg font-semibold">{course.title}</h3>
                      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
                        {decodePlainTextEntities(course.description) ||
                          t(
                            "Learning path provided by lecturer-created Labs.",
                            "Lộ trình học tập được xây dựng từ các Lab do giảng viên tạo.",
                          )}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {course.labCount}{" "}
                        {course.labCount === 1 ? t("Lab", "bài Lab") : t("Labs", "bài Lab")} ·{" "}
                        {course.lecturerName}
                      </p>
                      {course.enrolled ? (
                        <Button asChild className="mt-5 w-full">
                          <Link href={courseHref(course.workspaceId)}>
                            {t("Continue learning", "Tiếp tục học")}{" "}
                            <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="mt-5 w-full"
                          onClick={() => setPasskeyOpen(true)}
                        >
                          <KeyRound className="size-4" aria-hidden="true" />
                          {t("Enroll", "Ghi danh")}
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
                <CoursePagination
                  page={page}
                  totalItems={catalog.data.total}
                  onPageChange={setPage}
                  t={t}
                />
              </div>
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                {t(
                  "No courses match the selected filters.",
                  "Không có khóa học phù hợp với bộ lọc đã chọn.",
                )}
              </p>
            )}
          </RequestState>
        </section>
      </div>
    </MavisShell>
  );
}

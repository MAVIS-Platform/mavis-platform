"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
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
import { RequestState } from "@/components/shared/request-state";
import { cn } from "@/lib/utils";
import type { Response } from "@/lib/api/contracts";

type Workspace = Response<"workspaces">[number];

function courseHref(workspaceId: string) {
  return `/roadmap?workspace=${encodeURIComponent(workspaceId)}`;
}

function CourseCard({ workspace, compact = false }: { workspace: Workspace; compact?: boolean }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-[var(--shadow-low)]">
      <div className="flex items-start justify-between gap-3">
        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
          {workspace.code || "COURSE"}
        </Badge>
        <Badge variant="outline">{workspace.status || "ACTIVE"}</Badge>
      </div>
      <div className="mt-4 flex-1">
        <h2 className="text-lg font-semibold tracking-tight">{workspace.name}</h2>
        {!compact && workspace.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {workspace.description}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {workspace.members?.length ?? 0} members
        </p>
      </div>
      <Button asChild className="mt-5 w-full">
        <Link href={courseHref(workspace.id)}>
          Continue learning <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </article>
  );
}

function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-[var(--hero-background)] px-6 py-7 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--body-text)]">{description}</p>
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
  const announcements = useApiQuery("announcements", {});
  const courses = useApiQuery("workspaces", {});
  const session = useSession();
  const [search, setSearch] = useState("");
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const shown = (courses.data ?? []).slice(0, 3);
  return (
    <MavisShell>
      <div className="space-y-8">
        <PageTitle
          title={`Welcome back${session.data?.user?.name ? `, ${session.data.user.name}` : ""}`}
          description="Find your learning activities, announcements and enrolled courses in one MAVIS workspace."
        />
        <section aria-labelledby="site-announcements" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="site-announcements" className="text-xl font-semibold">
                Site Announcements
              </h2>
              <p className="text-sm text-muted-foreground">
                Latest updates from MAVIS administrators.
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
                        {item.pinned && <Badge>Pinned</Badge>}
                        <Badge variant="outline">{item.priority}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.content}</p>
                    </article>
                  ),
                )}
              </div>
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                No site announcements are published right now.
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
              {showAllAnnouncements ? "Show latest only" : "View all announcements"}
            </Button>
          )}
        </section>
        <section aria-labelledby="search-courses" className="space-y-3">
          <h2 id="search-courses" className="text-xl font-semibold">
            Search Courses
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
                placeholder="Search courses"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </section>
        <section aria-labelledby="my-courses-preview" className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="my-courses-preview" className="text-xl font-semibold">
                My Courses
              </h2>
              <p className="text-sm text-muted-foreground">
                Your enrolled courses and their current status.
              </p>
            </div>
            <Button asChild variant="link">
              <Link href="/courses">
                View all <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <RequestState query={courses} empty={false}>
            {shown.length ? (
              <CoursesGrid workspaces={shown} view="card" />
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                You have not enrolled in a course yet.
              </p>
            )}
          </RequestState>
        </section>
      </div>
    </MavisShell>
  );
}

export function MavisCoursesPage() {
  const courses = useApiQuery("workspaces", {});
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"card" | "list">("card");
  const [sort, setSort] = useState<"ASC" | "DESC">("ASC");
  const sorted = useMemo(
    () =>
      (courses.data ?? [])
        .filter((course) =>
          `${course.name} ${course.code ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === "ASC" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
        ),
    [courses.data, query, sort],
  );
  return (
    <MavisShell>
      <div className="space-y-6">
        <PageTitle title="My Courses" />
        <section aria-labelledby="course-overview" className="rounded-2xl border bg-card p-5">
          <h2 id="course-overview" className="text-lg font-semibold">
            Course Overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Overview of your enrolled courses.</p>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">
              Search Courses
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search enrolled courses"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Sort by Course Name
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
                Card
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "list" ? "default" : "ghost"}
                onClick={() => setView("list")}
              >
                <List className="size-4" />
                List
              </Button>
            </div>
          </div>
        </section>
        <section aria-labelledby="enrolled-courses" className="space-y-4">
          <div>
            <h2 id="enrolled-courses" className="text-xl font-semibold">
              Enrolled Courses
            </h2>
            <p className="text-sm text-muted-foreground">Course information and course status.</p>
          </div>
          <RequestState query={courses} empty={false}>
            {sorted.length ? (
              <CoursesGrid workspaces={sorted} view={view} />
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                No enrolled course matches your search.
              </p>
            )}
          </RequestState>
        </section>
      </div>
    </MavisShell>
  );
}

export function AllCoursesPage({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | undefined>();
  const [difficulty, setDifficulty] = useState<
    "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | undefined
  >();
  const [sort, setSort] = useState<"NAME" | "NEWEST">("NAME");
  const catalog = useApiQuery("catalogCourses", {
    q: query,
    category,
    difficulty,
    sort,
    page: 0,
    size: 24,
  });
  return (
    <MavisShell>
      <div className="space-y-6">
        <PageTitle
          title="All Courses"
          description="Explore available courses and learning opportunities."
        />
        <section aria-labelledby="course-search" className="rounded-2xl border bg-card p-4">
          <h2 id="course-search" className="sr-only">
            Course Search & Filters
          </h2>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <label className="grid gap-1 text-sm font-medium">
              Search Courses
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search courses"
                />
              </div>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Difficulty Level
              <select
                className="h-11 rounded-md border bg-card px-3 text-sm"
                value={difficulty ?? ""}
                onChange={(event) =>
                  setDifficulty((event.target.value || undefined) as typeof difficulty)
                }
              >
                <option value="">All levels</option>
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="size-4" />
                Sort By
              </span>
              <select
                className="h-11 rounded-md border bg-card px-3 text-sm"
                value={sort}
                onChange={(event) => setSort(event.target.value as "NAME" | "NEWEST")}
              >
                <option value="NAME">Course name</option>
                <option value="NEWEST">Newest</option>
              </select>
            </label>
          </div>
        </section>
        <section aria-labelledby="course-categories" className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-secondary" />
            <h2 id="course-categories" className="text-xl font-semibold">
              Course Categories
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!category ? "default" : "outline"}
              onClick={() => setCategory(undefined)}
            >
              All Categories
            </Button>
            {catalog.data?.categories.map((item) => (
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
                All Courses
              </h2>
              <p className="text-sm text-muted-foreground">
                Course description, difficulty level and learning path.
              </p>
            </div>
            {catalog.data && (
              <p className="text-sm text-muted-foreground">{catalog.data.total} courses</p>
            )}
          </div>
          <RequestState query={catalog} empty={false}>
            {catalog.data?.items.length ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {catalog.data.items.map((course) => (
                  <article
                    key={course.workspaceId}
                    className="flex flex-col rounded-2xl border bg-card p-5 shadow-[var(--shadow-low)]"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {course.difficulties.map((level) => (
                        <Badge key={level} variant="outline">
                          {level}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{course.title}</h3>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
                      {course.description || "Learning path provided by lecturer-created Labs."}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {course.labCount} Labs · {course.lecturerName}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {course.categories.map((item) => (
                        <Badge key={item} variant="secondary">
                          {item}
                        </Badge>
                      ))}
                    </div>
                    {course.enrolled ? (
                      <Button asChild className="mt-5 w-full">
                        <Link href={courseHref(course.workspaceId)}>
                          Continue learning <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button className="mt-5 w-full" variant="outline" disabled>
                        Enrollment required
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                No courses match the selected filters.
              </p>
            )}
          </RequestState>
        </section>
      </div>
    </MavisShell>
  );
}

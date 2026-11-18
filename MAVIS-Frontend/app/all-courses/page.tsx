import { AllCoursesPage } from "@/features/courses/mavis-pages";
export default async function AllCourses({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.slice(0, 160) ?? "";
  return <AllCoursesPage initialQuery={query} />;
}

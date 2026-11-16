import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/layout/page";
import { Courses } from "@/features/courses/screens";

export const metadata = {
  title: "My Courses — MAVIS",
  description: "Course roadmap and curated four-stage microservices architecture Labs.",
};

export default function HomePage() {
  return (
    <AppShell scope="global" activeId="courses" pageTitle="My Courses">
      <PageContainer>
        <Courses />
      </PageContainer>
    </AppShell>
  );
}

import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { SubmissionReview } from "@/features/submissions/screens";
export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  return (
    <AppShell
      scope="review"
      activeId="review"
      pageTitle="Submission Details & Review"
    >
      <PageContainer>
        <SectionHeader
          title="Submission Details & Review"
          screenId="submission-review"
        />
        <SubmissionReview submissionId={submissionId} />
      </PageContainer>
    </AppShell>
  );
}

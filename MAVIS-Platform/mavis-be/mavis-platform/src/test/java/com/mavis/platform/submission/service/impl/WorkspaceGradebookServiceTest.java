package com.mavis.platform.submission.service.impl;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.SubmissionReview;
import com.mavis.common.entity.SubmissionSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.SubmissionReviewRepository;
import com.mavis.common.repository.SubmissionSnapshotRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorkspaceGradebookServiceTest {

    @Test
    void buildsMatrixWithLabColumnsStudentRowsAndAverages() {
        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        WorkspaceMemberRepository members = mock(WorkspaceMemberRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        SubmissionSnapshotRepository submissions = mock(SubmissionSnapshotRepository.class);
        SubmissionReviewRepository reviews = mock(SubmissionReviewRepository.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);

        WorkspaceGradebookService service = new WorkspaceGradebookService(
                access, workspaces, members, assignments, submissions, reviews, jdbc);

        UUID workspaceId = UUID.randomUUID();
        Workspace ws = Workspace.builder().id(workspaceId).name("SWD392-Fall").build();
        Assignment lab1 = Assignment.builder().id(UUID.randomUUID()).workspace(ws).title("Lab 1 Static").labOrder(1).build();
        Assignment lab2 = Assignment.builder().id(UUID.randomUUID()).workspace(ws).title("Lab 2 Studio").labOrder(2).build();

        User s1 = User.builder().id(UUID.randomUUID()).fullName("Student Alpha").email("alpha@fpt.edu.vn").build();
        User lec = User.builder().id(UUID.randomUUID()).fullName("Lecturer Beta").email("beta@fpt.edu.vn").build();
        WorkspaceMember m1 = WorkspaceMember.builder().workspace(ws).user(s1).memberRole("STUDENT").build();
        WorkspaceMember mLec = WorkspaceMember.builder().workspace(ws).user(lec).memberRole("LECTURER").build();

        UUID sub1Id = UUID.randomUUID();
        OffsetDateTime submittedAt = OffsetDateTime.now();
        OffsetDateTime gradedAt = OffsetDateTime.now();
        SubmissionSnapshotRepository.GradebookSubmissionProjection sub1 =
                new SubmissionSnapshotRepository.GradebookSubmissionProjection() {
                    @Override public UUID getId() { return sub1Id; }
                    @Override public UUID getSubmittedById() { return s1.getId(); }
                    @Override public UUID getAssignmentId() { return lab1.getId(); }
                    @Override public OffsetDateTime getSubmittedAt() { return submittedAt; }
                };
        SubmissionReviewRepository.GradebookReviewProjection rev1 =
                new SubmissionReviewRepository.GradebookReviewProjection() {
                    @Override public UUID getSubmissionId() { return sub1Id; }
                    @Override public String getStatus() { return "GRADED"; }
                    @Override public BigDecimal getScore() { return BigDecimal.valueOf(88.0); }
                    @Override public String getLabOutcome() { return "PASSED"; }
                    @Override public OffsetDateTime getUpdatedAt() { return gradedAt; }
                };

        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(ws));
        when(assignments.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).thenReturn(List.of(lab2, lab1));
        when(members.findByWorkspaceIdOrderByJoinedAtAsc(workspaceId)).thenReturn(List.of(m1, mLec));
        when(submissions.findGradebookRowsByAssignmentIds(anyList())).thenReturn(List.of(sub1));
        when(reviews.findGradebookReviewsBySubmissionIds(anyList())).thenReturn(List.of(rev1));

        var result = service.gradebook(workspaceId);

        assertThat(result.workspaceId()).isEqualTo(workspaceId);
        assertThat(result.labs()).extracting("title").containsExactly("Lab 1 Static", "Lab 2 Studio");
        assertThat(result.students()).hasSize(1);
        var row = result.students().get(0);
        assertThat(row.fullName()).isEqualTo("Student Alpha");
        assertThat(row.completedLabsCount()).isEqualTo(1);
        assertThat(row.totalLabsCount()).isEqualTo(2);
        assertThat(row.averageScore()).isEqualTo(88.0);
        assertThat(row.averageScoreTenScale()).isEqualTo(8.8);
        assertThat(row.cells().get(0).labOutcome()).isEqualTo("PASSED");
        assertThat(row.cells().get(0).reviewScoreTenScale()).isEqualTo(8.8);
        assertThat(row.cells().get(1).reviewStatus()).isEqualTo("NOT_SUBMITTED");
    }

    @Test
    void excludesDetachedV1LabsInCourseModeAndKeepsActiveOrderDenominator() {
        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        WorkspaceMemberRepository members = mock(WorkspaceMemberRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        SubmissionSnapshotRepository submissions = mock(SubmissionSnapshotRepository.class);
        SubmissionReviewRepository reviews = mock(SubmissionReviewRepository.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);

        WorkspaceGradebookService service = new WorkspaceGradebookService(
                access, workspaces, members, assignments, submissions, reviews, jdbc);

        UUID workspaceId = UUID.randomUUID();
        Workspace ws = Workspace.builder().id(workspaceId).name("JAVA-MS-2026").courseMode(true).build();
        Assignment detachedV1 = Assignment.builder().id(UUID.randomUUID()).workspace(ws).title("Obsolete V1").labOrder(null).build();
        Assignment lab1 = Assignment.builder().id(UUID.randomUUID()).workspace(ws).title("Lab 1 V2").labOrder(1).build();
        Assignment lab2 = Assignment.builder().id(UUID.randomUUID()).workspace(ws).title("Lab 2 V2").labOrder(2).build();
        User s1 = User.builder().id(UUID.randomUUID()).fullName("Student A").email("a@fpt.edu.vn").build();
        WorkspaceMember m1 = WorkspaceMember.builder().workspace(ws).user(s1).memberRole("STUDENT").build();

        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(ws));
        when(assignments.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).thenReturn(List.of(lab2, detachedV1, lab1));
        when(members.findByWorkspaceIdOrderByJoinedAtAsc(workspaceId)).thenReturn(List.of(m1));
        when(submissions.findGradebookRowsByAssignmentIds(anyList())).thenReturn(List.of());

        var result = service.gradebook(workspaceId);
        assertThat(result.labs()).extracting("title").containsExactly("Lab 1 V2", "Lab 2 V2");
        assertThat(result.students().get(0).totalLabsCount()).isEqualTo(2);
    }
}

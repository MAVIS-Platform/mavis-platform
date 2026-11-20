package com.mavis.platform.submission.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import com.mavis.platform.workspace.service.CourseProgressionService;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SubmissionReviewServiceTest {
 @Mock SubmissionSnapshotRepository submissions;
 @Mock SubmissionReviewRepository reviews;
 @Mock AccessPolicyService access;
 @Mock EntityManager entityManager;
 @Mock CourseProgressionService courseProgression;
 @InjectMocks SubmissionReviewService service;
 UUID id=UUID.randomUUID(),workspace=UUID.randomUUID();
 User teacher=User.builder().id(UUID.randomUUID()).fullName("Sandbox teacher").build(),student=User.builder().id(UUID.randomUUID()).build();
 SubmissionSnapshot submission;
 @BeforeEach void setup(){submission=SubmissionSnapshot.builder().id(id).submittedBy(student).assignment(Assignment.builder().workspace(Workspace.builder().id(workspace).build()).build()).build();when(submissions.findWithDetailsById(id)).thenReturn(Optional.of(submission));}
 @Test void draftsArePrivateAndPublishedScoresVisibleToTheirStudent(){
  var review=new SubmissionReview();review.setSubmission(submission);review.setLecturer(teacher);review.setRevision(3);review.setStatus("DRAFT");review.setScore(new BigDecimal("85"));review.setSummary("Private marking notes");
  when(access.requireCurrentActiveUser()).thenReturn(student);when(reviews.findBySubmissionId(id)).thenReturn(Optional.of(review));
  assertThat(service.get(id).status()).isEqualTo("PENDING");assertThat(service.get(id).summary()).isEmpty();
  review.setStatus("GRADED");assertThat(service.get(id).score()).isEqualByComparingTo("85");
  verify(access,never()).requireWorkspaceLecturer(any());
 }
 @Test void lecturerGradeIsVersionedAndDoesNotModifySubmittedArtifacts(){
  when(access.requireCurrentActiveUser()).thenReturn(teacher);when(reviews.findBySubmissionId(id)).thenReturn(Optional.empty());when(reviews.saveAndFlush(any())).thenAnswer(call->call.getArgument(0));
  var result=service.save(id,new SubmissionReviewService.Save(0,"GRADED",BigDecimal.ZERO,"Approved with remediation notes"));
  assertThat(result.revision()).isEqualTo(1);assertThat(result.score()).isEqualByComparingTo("0");
  verify(access).requireWorkspaceLecturer(workspace);verify(entityManager).lock(submission,LockModeType.PESSIMISTIC_WRITE);verify(submissions,never()).save(any());
  verify(courseProgression).recordFinalizedResult(id,1,true);
 }
 @Test void staleGradeCannotOverwriteNewerReview(){
  when(access.requireCurrentActiveUser()).thenReturn(teacher);var current=new SubmissionReview();current.setRevision(4);when(reviews.findBySubmissionId(id)).thenReturn(Optional.of(current));
  assertThatThrownBy(()->service.save(id,new SubmissionReviewService.Save(3,"GRADED",new BigDecimal("90"),"Changed"))).isInstanceOf(BusinessException.class).hasMessageContaining("Reload");verify(reviews,never()).save(any());
 }
 @Test void rejectSelfGradingMissingScoreAndEmptyReturnInstructions(){
  when(access.requireCurrentActiveUser()).thenReturn(student);
  assertThatThrownBy(()->service.save(id,new SubmissionReviewService.Save(0,"GRADED",BigDecimal.TEN,""))).isInstanceOf(BusinessException.class);
  when(access.requireCurrentActiveUser()).thenReturn(teacher);
  assertThatThrownBy(()->service.save(id,new SubmissionReviewService.Save(0,"GRADED",null,""))).isInstanceOf(BusinessException.class);
  assertThatThrownBy(()->service.save(id,new SubmissionReviewService.Save(0,"RETURNED",null,""))).isInstanceOf(BusinessException.class).hasMessageContaining("REJECTION_REASON_REQUIRED");
  assertThatThrownBy(()->service.save(id,new SubmissionReviewService.Save(0,"GRADED",new BigDecimal("101"),""))).isInstanceOf(BusinessException.class);
  verifyNoInteractions(reviews,entityManager);
 }
 @Test void outsiderCannotReadReviewOrDraft(){
  when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN)).when(access).requireWorkspaceLecturer(workspace);
  assertThatThrownBy(()->service.get(id)).isInstanceOf(BusinessException.class);verifyNoInteractions(reviews);
 }

 @Test
 @DisplayName("WF-04 F11-004/005: Per-snapshot grading requires every snapshot > 5.0/10 (5.1 passes & unlocks; 5.0 fails -> NEEDS_REVISION)")
 void perSnapshotGradingEnforcesStrictGreaterThanFiveRule() {
  when(access.requireCurrentActiveUser()).thenReturn(teacher);
  when(reviews.findBySubmissionId(id)).thenReturn(Optional.empty());
  when(reviews.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));

  var failingSave = new SubmissionReviewService.Save(
          0, "GRADED", null, "Runtime trace evidence incomplete in step 4.",
          List.of(
                  new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static Architecture", new BigDecimal("9.00"), "Accurate boundaries"),
                  new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime Studio", new BigDecimal("5.00"), "Exactly 5.0 still fails")));

  var failedView = service.save(id, failingSave);
  assertThat(failedView.labOutcome()).isEqualTo("NEEDS_REVISION");
  assertThat(failedView.score()).isEqualByComparingTo("70.00");
  assertThat(failedView.snapshotGrades()).hasSize(2);
  verify(courseProgression).recordFinalizedResult(id, 1, false);

  reset(courseProgression);
  var passingSave = new SubmissionReviewService.Save(
          0, "GRADED", null, "All stages clear > 5.0 threshold.",
          List.of(
                  new SubmissionReviewService.SnapshotGrade("STEP_1_STATIC", "Static Architecture", new BigDecimal("5.10"), "Pass threshold"),
                  new SubmissionReviewService.SnapshotGrade("STEP_4_RUNTIME", "Runtime Studio", new BigDecimal("7.50"), "Trace verified")));

  var passedView = service.save(id, passingSave);
  assertThat(passedView.labOutcome()).isEqualTo("PASSED");
  assertThat(passedView.score()).isEqualByComparingTo("63.00");
  verify(courseProgression).recordFinalizedResult(id, 1, true);
 }

 @Test
 @DisplayName("WF-04 F11-006: Rejects out-of-range snapshot scores or missing overall review summary")
 void rejectsInvalidSnapshotScoresAndMissingSummary() {
  when(access.requireCurrentActiveUser()).thenReturn(teacher);

  var tooHigh = new SubmissionReviewService.Save(
          0, "GRADED", null, "Summary present",
          List.of(new SubmissionReviewService.SnapshotGrade("S1", "Step 1", new BigDecimal("10.50"), null)));
  assertThatThrownBy(() -> service.save(id, tooHigh))
          .isInstanceOf(BusinessException.class)
          .hasMessageContaining("between 0 and 10");

  var blankSummary = new SubmissionReviewService.Save(
          0, "GRADED", null, "   ",
          List.of(new SubmissionReviewService.SnapshotGrade("S1", "Step 1", new BigDecimal("8.00"), "Good")));
  assertThatThrownBy(() -> service.save(id, blankSummary))
          .isInstanceOf(BusinessException.class)
          .hasMessageContaining("APPROVAL_SUMMARY_REQUIRED");
 }

 @Test
 void guidedLabRequiresExactlyOneGradeForEachFrozenSnapshot() throws Exception {
  submission.getAssignment().setLabOrder(1);
  submission.setStudentSnapshots(new com.fasterxml.jackson.databind.ObjectMapper()
          .readTree("[{\"snapshotId\":\"static\"},{\"snapshotId\":\"runtime\"}]"));
  when(access.requireCurrentActiveUser()).thenReturn(teacher);
  when(reviews.findBySubmissionId(id)).thenReturn(Optional.empty());

  var staticGrade = new SubmissionReviewService.SnapshotGrade("static", "Static", new BigDecimal("9.00"), "");
  var foreignGrade = new SubmissionReviewService.SnapshotGrade("wrong", "Other", new BigDecimal("8.00"), "");
  for (var attempt : List.of(List.<SubmissionReviewService.SnapshotGrade>of(), List.of(staticGrade))) {
   assertThatThrownBy(() -> service.save(id, new SubmissionReviewService.Save(0, "GRADED",
           new BigDecimal("99"), "Summary", attempt))).hasMessage("SNAPSHOT_GRADES_INCOMPLETE");
  }
  for (var attempt : List.of(List.of(staticGrade, staticGrade), List.of(staticGrade, foreignGrade))) {
   assertThatThrownBy(() -> service.save(id, new SubmissionReviewService.Save(0, "GRADED",
           new BigDecimal("99"), "Summary", attempt))).hasMessage("INVALID_SNAPSHOT_GRADE_IDS");
  }
  submission.setStudentSnapshots(null);
  assertThatThrownBy(() -> service.save(id, new SubmissionReviewService.Save(0, "GRADED",
          new BigDecimal("99"), "Summary"))).hasMessage("SUBMISSION_SNAPSHOTS_REQUIRED");
  verify(reviews, never()).saveAndFlush(any());
  verifyNoInteractions(courseProgression);
 }

 @Test
 void detachedCatalogLabStillRequiresGradesForEveryFrozenSnapshot() {
  var json = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance;
  submission.setCourseQuizEvidence(json.objectNode().put("status", "PASSED"));
  var snapshots = json.arrayNode();
  snapshots.addObject().put("snapshotId", "THEORY");
  submission.setStudentSnapshots(snapshots);
  when(access.requireCurrentActiveUser()).thenReturn(teacher);
  when(reviews.findBySubmissionId(id)).thenReturn(Optional.empty());

  assertThatThrownBy(() -> service.save(id,
          new SubmissionReviewService.Save(0, "GRADED", BigDecimal.TEN, "Legacy Lab review")))
          .isInstanceOf(BusinessException.class).hasMessageContaining("SNAPSHOT_GRADES_INCOMPLETE");
  verify(reviews, never()).saveAndFlush(any());
 }
}

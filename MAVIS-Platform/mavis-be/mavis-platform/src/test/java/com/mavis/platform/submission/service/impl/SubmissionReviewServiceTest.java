package com.mavis.platform.submission.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
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
  when(access.requireCurrentActiveUser()).thenReturn(teacher);when(reviews.findBySubmissionId(id)).thenReturn(Optional.empty());when(reviews.save(any())).thenAnswer(call->call.getArgument(0));
  var result=service.save(id,new SubmissionReviewService.Save(0,"GRADED",new BigDecimal("92.50"),"Good boundary design"));
  assertThat(result.revision()).isEqualTo(1);assertThat(result.score()).isEqualByComparingTo("92.50");
  verify(access).requireWorkspaceLecturer(workspace);verify(entityManager).lock(submission,LockModeType.PESSIMISTIC_WRITE);verify(submissions,never()).save(any());
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
  assertThatThrownBy(()->service.save(id,new SubmissionReviewService.Save(0,"RETURNED",null,""))).isInstanceOf(BusinessException.class);
  assertThatThrownBy(()->service.save(id,new SubmissionReviewService.Save(0,"GRADED",new BigDecimal("101"),""))).isInstanceOf(BusinessException.class);
  verifyNoInteractions(reviews,entityManager);
 }
 @Test void outsiderCannotReadReviewOrDraft(){
  when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN)).when(access).requireWorkspaceLecturer(workspace);
  assertThatThrownBy(()->service.get(id)).isInstanceOf(BusinessException.class);verifyNoInteractions(reviews);
 }
}

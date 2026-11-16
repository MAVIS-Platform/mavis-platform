package com.mavis.platform.submission.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
import com.mavis.platform.submission.dto.FeedbackCreateRequest;
import com.mavis.platform.submission.dto.FeedbackResponseDTO;
import com.mavis.platform.submission.dto.FeedbackUpdateRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FeedbackCommentServiceImplTest {

    @Mock
    private FeedbackCommentRepository feedbackCommentRepository;

    @Mock
    private SubmissionSnapshotRepository submissionSnapshotRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private com.mavis.common.security.AccessPolicyService accessPolicyService;

    @InjectMocks
    private FeedbackCommentServiceImpl feedbackCommentService;

    private UUID lecturerId;
    private UUID otherUserId;
    private UUID submissionId;
    private UUID modelVersionId;
    private UUID elementId;
    private UUID relationshipId;

    private User lecturer;
    private ModelVersion modelVersion;
    private ModelElement element;
    private ModelRelationship relationship;
    private SubmissionSnapshot submission;

    @BeforeEach
    void setUp() {
        lecturerId = UUID.randomUUID();
        otherUserId = UUID.randomUUID();
        submissionId = UUID.randomUUID();
        modelVersionId = UUID.randomUUID();
        elementId = UUID.randomUUID();
        relationshipId = UUID.randomUUID();

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(lecturerId.toString(), "credentials", List.of())
        );

        lecturer = User.builder()
                .id(lecturerId)
                .email("hoangnt@mavis.edu.vn")
                .fullName("TS. Nguyen Tan Hoang")
                .build();

        modelVersion = ModelVersion.builder()
                .id(modelVersionId)
                .revision(1)
                .build();

        element = ModelElement.builder()
                .id(elementId)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .modelVersion(modelVersion)
                .build();

        relationship = ModelRelationship.builder()
                .id(relationshipId)
                .modelVersion(modelVersion)
                .sourceElement(element)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        submission = SubmissionSnapshot.builder()
                .id(submissionId)
                .modelVersion(modelVersion)
                .build();

        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(lecturer);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Giảng viên ghim nhận xét vào Node (ModelElement)")
    void testAddFeedback_PinToElement_Success() {
        FeedbackCreateRequest request = FeedbackCreateRequest.builder()
                .elementId(elementId)
                .commentText("Cần bổ sung Retry Pattern cho dịch vụ này")
                .build();

        when(userRepository.findById(lecturerId)).thenReturn(Optional.of(lecturer));
        when(submissionSnapshotRepository.findById(submissionId)).thenReturn(Optional.of(submission));
        when(modelElementRepository.findById(elementId)).thenReturn(Optional.of(element));
        when(feedbackCommentRepository.save(any(FeedbackComment.class))).thenAnswer(inv -> {
            FeedbackComment c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            c.setCreatedAt(OffsetDateTime.now());
            return c;
        });

        FeedbackResponseDTO response = feedbackCommentService.addFeedback(submissionId, request);

        assertThat(response).isNotNull();
        assertThat(response.getElementId()).isEqualTo(elementId);
        assertThat(response.getElementName()).isEqualTo("payment-service");
        assertThat(response.getLecturerName()).isEqualTo("TS. Nguyen Tan Hoang");
        assertThat(response.getCommentText()).isEqualTo("Cần bổ sung Retry Pattern cho dịch vụ này");
        verify(feedbackCommentRepository).save(any(FeedbackComment.class));
    }

    @Test
    @DisplayName("Giảng viên ghim nhận xét vào Edge (ModelRelationship)")
    void testAddFeedback_PinToRelationship_Success() {
        FeedbackCreateRequest request = FeedbackCreateRequest.builder()
                .relationshipId(relationshipId)
                .commentText("Gọi HTTP đồng bộ dễ gây nghẽn dòng, cân nhắc dùng Message Queue")
                .build();

        when(userRepository.findById(lecturerId)).thenReturn(Optional.of(lecturer));
        when(submissionSnapshotRepository.findById(submissionId)).thenReturn(Optional.of(submission));
        when(modelRelationshipRepository.findById(relationshipId)).thenReturn(Optional.of(relationship));
        when(feedbackCommentRepository.save(any(FeedbackComment.class))).thenAnswer(inv -> {
            FeedbackComment c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            c.setCreatedAt(OffsetDateTime.now());
            return c;
        });

        FeedbackResponseDTO response = feedbackCommentService.addFeedback(submissionId, request);

        assertThat(response).isNotNull();
        assertThat(response.getRelationshipId()).isEqualTo(relationshipId);
        assertThat(response.getRelationType()).isEqualTo("SERVICE_HTTP_CALL");
        assertThat(response.getCommentText()).contains("Message Queue");
    }

    @Test
    @DisplayName("Chặn ghim nhận xét khi Element không thuộc ModelVersion của bài nộp")
    void testAddFeedback_ElementMismatch_ThrowsBadRequest() {
        ModelVersion anotherMv = ModelVersion.builder().id(UUID.randomUUID()).build();
        element.setModelVersion(anotherMv);

        FeedbackCreateRequest request = FeedbackCreateRequest.builder()
                .elementId(elementId)
                .commentText("Test mismatch")
                .build();

        when(userRepository.findById(lecturerId)).thenReturn(Optional.of(lecturer));
        when(submissionSnapshotRepository.findById(submissionId)).thenReturn(Optional.of(submission));
        when(modelElementRepository.findById(elementId)).thenReturn(Optional.of(element));

        assertThatThrownBy(() -> feedbackCommentService.addFeedback(submissionId, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Phần tử nhận xét không thuộc về phiên bản mô hình đã nộp");

        verify(feedbackCommentRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn ghim nhận xét khi Relationship không thuộc ModelVersion của bài nộp")
    void testAddFeedback_RelationshipMismatch_ThrowsBadRequest() {
        ModelVersion anotherMv = ModelVersion.builder().id(UUID.randomUUID()).build();
        relationship.setModelVersion(anotherMv);

        FeedbackCreateRequest request = FeedbackCreateRequest.builder()
                .relationshipId(relationshipId)
                .commentText("Test relationship mismatch")
                .build();

        when(userRepository.findById(lecturerId)).thenReturn(Optional.of(lecturer));
        when(submissionSnapshotRepository.findById(submissionId)).thenReturn(Optional.of(submission));
        when(modelRelationshipRepository.findById(relationshipId)).thenReturn(Optional.of(relationship));

        assertThatThrownBy(() -> feedbackCommentService.addFeedback(submissionId, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Quan hệ nhận xét không thuộc về phiên bản mô hình đã nộp");

        verify(feedbackCommentRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chỉnh sửa nhận xét thành công bởi chính tác giả")
    void testUpdateFeedback_AuthorSuccess() {
        UUID feedbackId = UUID.randomUUID();
        FeedbackComment existing = FeedbackComment.builder()
                .id(feedbackId)
                .submission(submission)
                .lecturer(lecturer)
                .element(element)
                .commentText("Nội dung cũ")
                .build();

        FeedbackUpdateRequest updateRequest = FeedbackUpdateRequest.builder()
                .commentText("Nội dung đã chỉnh sửa bởi thầy")
                .build();

        when(feedbackCommentRepository.findById(feedbackId)).thenReturn(Optional.of(existing));
        when(feedbackCommentRepository.save(any(FeedbackComment.class))).thenAnswer(inv -> inv.getArgument(0));

        FeedbackResponseDTO updated = feedbackCommentService.updateFeedback(feedbackId, updateRequest);

        assertThat(updated.getCommentText()).isEqualTo("Nội dung đã chỉnh sửa bởi thầy");
        verify(feedbackCommentRepository).save(existing);
    }

    @Test
    @DisplayName("Chặn sửa nhận xét khi người thao tác không phải tác giả (FORBIDDEN)")
    void testUpdateFeedback_NonAuthor_ThrowsForbidden() {
        UUID feedbackId = UUID.randomUUID();
        User anotherLecturer = User.builder().id(otherUserId).fullName("Thầy Khác").build();
        FeedbackComment existing = FeedbackComment.builder()
                .id(feedbackId)
                .submission(submission)
                .lecturer(anotherLecturer)
                .commentText("Bài tốt")
                .build();

        FeedbackUpdateRequest updateRequest = FeedbackUpdateRequest.builder()
                .commentText("Sửa trộm")
                .build();

        when(feedbackCommentRepository.findById(feedbackId)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> feedbackCommentService.updateFeedback(feedbackId, updateRequest))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("không có quyền sửa nhận xét");

        verify(feedbackCommentRepository, never()).save(any());
    }

    @Test
    @DisplayName("Xóa nhận xét thành công bởi tác giả")
    void testDeleteFeedback_AuthorSuccess() {
        UUID feedbackId = UUID.randomUUID();
        FeedbackComment existing = FeedbackComment.builder()
                .id(feedbackId)
                .submission(submission)
                .lecturer(lecturer)
                .build();

        when(feedbackCommentRepository.findById(feedbackId)).thenReturn(Optional.of(existing));

        feedbackCommentService.deleteFeedback(feedbackId);

        verify(feedbackCommentRepository).delete(existing);
    }

    @Test
    @DisplayName("Chặn xóa nhận xét khi không phải tác giả (FORBIDDEN)")
    void testDeleteFeedback_NonAuthor_ThrowsForbidden() {
        UUID feedbackId = UUID.randomUUID();
        User anotherLecturer = User.builder().id(otherUserId).build();
        FeedbackComment existing = FeedbackComment.builder()
                .id(feedbackId)
                .submission(submission)
                .lecturer(anotherLecturer)
                .build();

        when(feedbackCommentRepository.findById(feedbackId)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> feedbackCommentService.deleteFeedback(feedbackId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("không có quyền xóa nhận xét");

        verify(feedbackCommentRepository, never()).delete(any());
    }

    @Test
    void feedbackListRejectsUnrelatedUserBeforeQuery() {
        Project project = Project.builder().id(UUID.randomUUID()).build();
        submission.setProject(project);
        when(submissionSnapshotRepository.findWithDetailsById(submissionId)).thenReturn(Optional.of(submission));
        doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN))
                .when(accessPolicyService).requireProjectReadAccess(project);
        assertThatThrownBy(() -> feedbackCommentService.getFeedbacksBySubmission(submissionId))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(feedbackCommentRepository);
    }
}

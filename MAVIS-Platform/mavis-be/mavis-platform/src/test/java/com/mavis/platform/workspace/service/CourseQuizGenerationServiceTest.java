package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseQuizGenerationServiceTest {

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID labId = UUID.randomUUID();
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final QuizQuestionGenerator generator = mock(QuizQuestionGenerator.class);
    private final CourseQuizGenerationService service =
            new CourseQuizGenerationService(assignments, access, jdbc, generator);

    @Test
    void generatesQuestionsFromTheoryLinkedToTheLab() throws Exception {
        givenLab();
        givenTheory("Payment owns payment state.\n\n---\n\nOrders calls payment.", 2);
        List<CourseQuizService.Question> expected = List.of(
                new CourseQuizService.Question("q1", "Who owns payment state?", "SINGLE_CHOICE",
                        List.of("orders", "payment"), 1, null, "Theory states payment owns it.", 1));
        when(generator.generate(anyString(), eq(5), eq(false))).thenReturn(expected);
        when(generator.providerMode()).thenReturn("LIVE_LLM_PROVIDER");

        var result = service.generate(workspaceId, labId,
                new CourseQuizGenerationService.Request(5, "en"));

        assertEquals("LIVE_LLM_PROVIDER", result.providerMode());
        assertEquals(2, result.sourceTheoryItems());
        assertEquals(expected, result.questions());
        verify(access).requireWorkspaceLecturer(workspaceId);
        verify(generator).generate(argThat(theory -> theory.contains("Payment owns payment state")), eq(5), eq(false));
    }

    @Test
    void passesVietnameseLocaleToGenerator() throws Exception {
        givenLab();
        givenTheory("Thanh toán sở hữu trạng thái thanh toán.", 1);
        when(generator.generate(anyString(), eq(3), eq(true))).thenReturn(List.of());
        when(generator.providerMode()).thenReturn("LIVE_LLM_PROVIDER");

        service.generate(workspaceId, labId, new CourseQuizGenerationService.Request(3, "vi"));

        verify(generator).generate(anyString(), eq(3), eq(true));
    }

    @Test
    void refusesWhenTheLabHasNoTheory() throws Exception {
        givenLab();
        givenTheory("", 0);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.generate(workspaceId, labId,
                        new CourseQuizGenerationService.Request(5, "en")));

        assertEquals(ErrorCode.UNPROCESSABLE_ENTITY, error.getErrorCode());
        verifyNoInteractions(generator);
    }

    @Test
    void refusesOutOfRangeQuestionCounts() {
        givenLab();

        assertThrows(BusinessException.class, () -> service.generate(workspaceId, labId,
                new CourseQuizGenerationService.Request(0, "en")));
        assertThrows(BusinessException.class, () -> service.generate(workspaceId, labId,
                new CourseQuizGenerationService.Request(21, "en")));
        verifyNoInteractions(generator);
    }

    @Test
    @SuppressWarnings("unchecked")
    void combinesTheoryAndStaticDiagramSourcesFromReferenceModel() throws Exception {
        UUID modelId = UUID.randomUUID();
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var refModel = com.mavis.common.entity.ModelVersion.builder().id(modelId).build();
        var lab = Assignment.builder().id(labId).workspace(workspace).title("Lab").referenceModel(refModel).build();
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        givenTheory("Chương 01: Bounded Context tách Order và Inventory.", 1);
        when(jdbc.query(contains("FROM model_elements"), any(RowMapper.class), eq(modelId)))
                .thenReturn(List.of("- [CONTAINER] order-service (Java / Spring Boot)", "- [CONTAINER] inventory-service (Java)"));
        when(jdbc.query(contains("FROM model_relationships"), any(RowMapper.class), eq(modelId)))
                .thenReturn(List.of("- order-service -> inventory-service (HTTP_REST, layer=STATIC)"));
        when(generator.generate(anyString(), eq(4), eq(true))).thenReturn(List.of());
        when(generator.providerMode()).thenReturn("LIVE_LLM_PROVIDER");

        var result = service.generate(workspaceId, labId,
                new CourseQuizGenerationService.Request(4, "vi", true, true, null));

        assertEquals(1, result.sourceTheoryItems());
        assertEquals(2, result.sourceDiagramElements());
        assertEquals(List.of("THEORY", "STATIC_DIAGRAMS"), result.sourcesUsed());
        verify(generator).generate(argThat(src ->
                src.contains("[SOURCE: THEORY]")
                        && src.contains("[SOURCE: STATIC_DIAGRAMS]")
                        && src.contains("order-service -> inventory-service")), eq(4), eq(true));
    }

    private void givenLab() {
        var workspace = Workspace.builder().id(workspaceId).status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).title("Lab").build();
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
    }

    @SuppressWarnings("unchecked")
    private void givenTheory(String body, int items) throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("body")).thenReturn(body);
        when(rs.getInt("items")).thenReturn(items);
        when(jdbc.queryForObject(anyString(), any(RowMapper.class), eq(workspaceId), eq(labId)))
                .thenAnswer(invocation -> ((RowMapper<?>) invocation.getArgument(1)).mapRow(rs, 0));
    }
}

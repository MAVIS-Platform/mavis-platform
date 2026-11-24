package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.CourseDefinition;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.LabTheoryAsset;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.TheoryAsset;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.CourseDefinitionRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.LabTheoryAssetRepository;
import com.mavis.common.repository.TheoryAssetRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TheoryLibraryServiceTest {

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID labId = UUID.randomUUID();
    private final UUID assetId = UUID.randomUUID();
    private final UUID moduleId = UUID.randomUUID();
    private final UUID itemId = UUID.randomUUID();
    private final UUID actorId = UUID.randomUUID();

    private final TheoryAssetRepository assets = mock(TheoryAssetRepository.class);
    private final LabTheoryAssetRepository links = mock(LabTheoryAssetRepository.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final CourseDefinitionRepository courses = mock(CourseDefinitionRepository.class);
    private final EvidenceRepository evidence = mock(EvidenceRepository.class);
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final CourseAuthoringService authoring = mock(CourseAuthoringService.class);
    private final LlmTheoryDraftGenerator generator = mock(LlmTheoryDraftGenerator.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final TheoryLibraryService service = new TheoryLibraryService(assets, links, assignments,
            workspaces, courses, evidence, access, authoring, generator, jdbc);

    @Test
    void rejectsInvalidAssets() {
        BusinessException blankBody = assertThrows(BusinessException.class,
                () -> service.create(workspaceId,
                        new TheoryLibraryService.Upsert("Title", " ", "vi", "CONCEPT", "LECTURER", null, null)));
        assertEquals(ErrorCode.BAD_REQUEST, blankBody.getErrorCode());

        BusinessException badStyle = assertThrows(BusinessException.class,
                () -> service.create(workspaceId,
                        new TheoryLibraryService.Upsert("Title", "Body", "vi", "MARKETING", "LECTURER", null, null)));
        assertEquals(ErrorCode.BAD_REQUEST, badStyle.getErrorCode());
        verifyNoInteractions(assets);
    }

    @Test
    void createsAnAssetWithLecturerMetadata() {
        var workspace = Workspace.builder().id(workspaceId).name("Class").status("ACTIVE").build();
        var actor = User.builder().id(actorId).fullName("Lecturer").build();
        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(access.requireCurrentActiveUser()).thenReturn(actor);
        when(assets.save(any(TheoryAsset.class))).thenAnswer(invocation -> {
            TheoryAsset saved = invocation.getArgument(0);
            saved.setId(assetId);
            return saved;
        });

        var view = service.create(workspaceId, new TheoryLibraryService.Upsert(
                "Payment boundaries", "# Payment\n\nOwns its state.", "vi", "CONCEPT", "LECTURER", null, null));

        assertEquals("Payment boundaries", view.title());
        assertEquals("CONCEPT", view.style());
        assertEquals("LECTURER", view.source());
        assertEquals(1, view.version());
        verify(access).requireWorkspaceLecturer(workspaceId);
    }

    @Test
    void attachMaterializesOneCourseItemForTheLab() {
        var workspace = Workspace.builder().id(workspaceId).name("Class").status("ACTIVE").build();
        var lab = Assignment.builder().id(labId).workspace(workspace).title("Payment Lab").build();
        var asset = TheoryAsset.builder().id(assetId).workspace(workspace).title("Payment boundaries")
                .body("Body").style("CONCEPT").source("LECTURER").version(1).build();
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(assets.findByIdAndWorkspaceId(assetId, workspaceId)).thenReturn(Optional.of(asset));
        when(links.findByAssignmentIdAndAssetId(labId, assetId)).thenReturn(Optional.empty());
        when(courses.findByWorkspaceId(workspaceId)).thenReturn(Optional.of(
                CourseDefinition.builder().id(UUID.randomUUID()).status("DRAFT").build()));
        when(links.findByAssignmentIdOrderByPositionAsc(labId)).thenReturn(List.of());
        when(links.save(any(LabTheoryAsset.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jdbc.query(anyString(), any(RowMapper.class), any())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("SELECT cm.id")) return List.of(moduleId);
            return List.of();
        });
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("SELECT id FROM course_items")) return List.of(itemId);
            return List.of();
        });

        var attached = service.attach(workspaceId, labId, assetId);

        assertEquals(assetId, attached.assetId());
        assertTrue(attached.title().contains("Payment"));
        verify(authoring).addItem(eq(workspaceId), eq(moduleId), argThat(item ->
                "THEORY".equals(item.type())
                        && labId.equals(item.assignmentId())
                        && item.content().path("body").asText().equals("Body")));
        verify(links).save(argThat(link -> itemId.equals(link.getCourseItemId())));
    }

    @Test
    void generateDraftPassesPinnedEvidenceToTheProvider() {
        var workspace = Workspace.builder().id(workspaceId).name("Class").status("ACTIVE").build();
        var modelId = UUID.randomUUID();
        var lab = Assignment.builder().id(labId).workspace(workspace).title("Payment Lab")
                .referenceModel(ModelVersion.builder().id(modelId).build()).build();
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(evidence.findByModelVersionId(modelId)).thenReturn(List.of(
                Evidence.builder().sourceType("SOURCE").locator("payment.ts")
                        .excerpt("Payment owns payment state").build()));
        when(generator.generate(eq("Payment"), eq(true), eq("CONCEPT"), argThat(items ->
                items.size() == 1 && items.get(0).contains("Payment owns payment state"))))
                .thenReturn(new LlmTheoryDraftGenerator.Draft("Payment", "# Payment", "LIVE_LLM_PROVIDER", 1));

        var draft = service.generateDraft(workspaceId, labId,
                new TheoryLibraryService.GenerateRequest("Payment", "vi", "CONCEPT"));

        assertEquals("# Payment", draft.body());
        assertEquals(1, draft.evidenceCount());
    }

    @Test
    @SuppressWarnings("unchecked")
    void attachCreatesDedicatedModulePerLabInsteadOfReusingAnotherLabsModule() {
        var workspace = Workspace.builder().id(workspaceId).name("Class").status("ACTIVE").build();
        var labB = Assignment.builder().id(labId).workspace(workspace).title("Lab B - Pure Theory").build();
        var asset = TheoryAsset.builder().id(assetId).workspace(workspace).title("Clean Boundaries")
                .body("Body").style("CONCEPT").source("LECTURER").version(1).build();
        UUID newModuleId = UUID.randomUUID();
        when(assignments.findById(labId)).thenReturn(Optional.of(labB));
        when(assets.findByIdAndWorkspaceId(assetId, workspaceId)).thenReturn(Optional.of(asset));
        when(links.findByAssignmentIdAndAssetId(labId, assetId)).thenReturn(Optional.empty());
        when(courses.findByWorkspaceId(workspaceId)).thenReturn(Optional.of(
                CourseDefinition.builder().id(UUID.randomUUID()).status("DRAFT").build()));
        when(links.findByAssignmentIdOrderByPositionAsc(labId)).thenReturn(List.of());
        when(links.save(any(LabTheoryAsset.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jdbc.query(anyString(), any(RowMapper.class), any())).thenReturn(List.of());
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("SELECT id FROM course_items")) return List.of(itemId);
            return List.of();
        });
        when(authoring.addModule(eq(workspaceId), any())).thenReturn(new CourseAuthoringService.CourseView(
                UUID.randomUUID(), workspaceId, "Course", "", "DRAFT", 2, 0,
                List.of(new CourseAuthoringService.ModuleView(newModuleId, "Lab · Lab B - Pure Theory", null, 2, null, List.of()))));

        service.attach(workspaceId, labId, assetId);

        verify(authoring).addModule(eq(workspaceId), argThat(req -> "Lab · Lab B - Pure Theory".equals(req.title())));
        verify(authoring).addItem(eq(workspaceId), eq(newModuleId), argThat(item -> labId.equals(item.assignmentId())));
    }

    @Test
    @SuppressWarnings("unchecked")
    void reusableListsLessonsFromLecturersOtherWorkspacesAfterAccessCheck() {
        var actor = User.builder().id(actorId).fullName("Lecturer").build();
        when(access.requireCurrentActiveUser()).thenReturn(actor);
        var otherWs = UUID.randomUUID();
        var item = new TheoryLibraryService.ReusableAssetView(
                UUID.randomUUID(), otherWs, "SWD392 · SE1807", "Boundary Driven Design",
                "# Boundary\n\nContent", "vi", "CONCEPT", "LECTURER", java.time.OffsetDateTime.now());
        when(jdbc.query(contains("FROM theory_assets ta"), any(RowMapper.class),
                eq(actorId), eq(workspaceId), eq(actorId), eq(actorId)))
                .thenReturn(List.of(item));

        var result = service.reusable(workspaceId);

        verify(access).requireWorkspaceLecturer(workspaceId);
        assertEquals(1, result.size());
        assertEquals("SWD392 · SE1807", result.getFirst().sourceWorkspaceName());
    }
}

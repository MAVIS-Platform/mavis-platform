package com.mavis.analyzer.diagram.service.impl;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
@ExtendWith(MockitoExtension.class)
class ArchitectureDocumentServiceTest {
    @Mock ModelVersionRepository models;
    @Mock ArchitectureDocumentRepository documents;
    @Mock AccessPolicyService access;
    @Mock EntityManager entityManager;
    @Mock DiagramVersionRepository diagrams;
    @Test void savedC4DocumentsPreserveExactLevelsInsteadOfBecomingGraph() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        when(diagrams.save(any())).thenAnswer(call->{DiagramVersion value=call.getArgument(0);value.setId(UUID.randomUUID());return value;});
        for(var entry:Map.of("context","CONTEXT","container","CONTAINER","component:service","COMPONENT").entrySet()) {
            var document=new ArchitectureDocument();document.setId(UUID.randomUUID());document.setViewKey(entry.getKey());document.setRevision(1);document.setXml(xml);document.setModelVersion(model);
            when(documents.findByModelVersionIdAndViewKeyAndRevision(id,entry.getKey(),1)).thenReturn(Optional.of(document));service.freeze(id,entry.getKey(),1);
        }
        var captured=org.mockito.ArgumentCaptor.forClass(DiagramVersion.class);verify(diagrams,times(3)).save(captured.capture());
        assertThat(captured.getAllValues()).allMatch(d->"C4".equals(d.getNotation()));
        assertThat(captured.getAllValues()).extracting(DiagramVersion::getLevel).containsExactlyInAnyOrder("CONTEXT","CONTAINER","COMPONENT");
        assertThat(captured.getAllValues()).allMatch(d->d.getLayoutJson().path("diagramType").asText().equals("C4_"+d.getLevel()));
    }
    @InjectMocks ArchitectureDocumentService service;
    private final UUID id=UUID.randomUUID();
    private final ModelVersion model=ModelVersion.builder().id(id).project(Project.builder().id(UUID.randomUUID()).build()).build();
    private final String xml="<mxfile><diagram><mxGraphModel><root/></mxGraphModel></diagram></mxfile>";

    @Test void guidedStudentCannotSaveManualArchitectureDocuments() {
        model.getProject().setWorkspace(Workspace.builder().courseMode(true).build());
        model.getProject().setProjectType("STUDENT_WORKING");
        when(models.findById(id)).thenReturn(Optional.of(model));
        when(access.requireCurrentActiveUser()).thenReturn(User.builder()
                .role(Role.builder().code("STUDENT").build()).build());

        for (String key : List.of("context", "uml-sequence:all", "uml-activity:all", "uml-state:all",
                "class", "package", "activity", "flowchart", "state", "state-machine")) {
            assertThatThrownBy(() -> service.save(id, key, new ArchitectureDocumentService.Save(0, xml)))
                    .isInstanceOfSatisfying(BusinessException.class,
                            error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.BAD_REQUEST));
        }
        for (String key : List.of("uml-sequence:all", "uml-activity:all", "uml-state:all", "class", "state")) {
            assertThatThrownBy(() -> service.get(id, key, null))
                    .isInstanceOfSatisfying(BusinessException.class,
                            error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.BAD_REQUEST));
            assertThatThrownBy(() -> service.freeze(id, key, 1))
                    .isInstanceOfSatisfying(BusinessException.class,
                            error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.BAD_REQUEST));
        }
        verifyNoInteractions(entityManager, documents);
    }

    @Test void guidedLecturerWithWriteAccessCanSaveReferenceDocuments() {
        model.getProject().setWorkspace(Workspace.builder().courseMode(true).build());
        when(models.findById(id)).thenReturn(Optional.of(model));
        when(access.requireCurrentActiveUser()).thenReturn(User.builder()
                .role(Role.builder().code("LECTURER").build()).build());
        when(documents.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));

        assertThat(service.save(id, "context", new ArchitectureDocumentService.Save(0, xml)).revision())
                .isEqualTo(1);
    }
    @Test void exactHistoricalRevisionIsCopiedAndDoesNotFollowLaterSaves() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        var old=new ArchitectureDocument();old.setId(UUID.randomUUID());old.setModelVersion(model);old.setViewKey("uml-class:all");old.setRevision(2);old.setXml(xml);
        when(documents.findByModelVersionIdAndViewKeyAndRevision(id,"uml-class:all",2)).thenReturn(Optional.of(old));
        when(diagrams.save(any())).thenAnswer(call->{DiagramVersion diagram=call.getArgument(0);diagram.setId(UUID.randomUUID());return diagram;});
        service.freeze(id,"uml-class:all",2);
        var captured=org.mockito.ArgumentCaptor.forClass(DiagramVersion.class);verify(diagrams).save(captured.capture());
        assertThat(captured.getValue().getNotation()).isEqualTo("UML_CLASS");
        assertThat(captured.getValue().getLayoutJson().path("drawioXml").asText()).isEqualTo(xml);
        assertThat(captured.getValue().getLayoutJson().path("documentRevision").asLong()).isEqualTo(2);
        old.setXml("later contents");assertThat(captured.getValue().getLayoutJson().path("drawioXml").asText()).isEqualTo(xml);
        verify(access).requireProjectWriteAccess(model.getProject());
    }
    @Test void bundleRejectsAnotherModelsDiagram() {
        when(models.findById(id)).thenReturn(Optional.of(model));var diagramId=UUID.randomUUID();
        when(diagrams.findAllById(any())).thenReturn(List.of(DiagramVersion.builder().id(diagramId).modelVersion(ModelVersion.builder().id(UUID.randomUUID()).build()).build()));
        assertThatThrownBy(()->service.freezeArtifacts(id,new ArchitectureDocumentService.ArtifactSelection(List.of(),List.of(diagramId)))).isInstanceOf(BusinessException.class);
        verify(diagrams,never()).save(any());
        verify(diagrams,never()).saveAll(any());
    }
    @Test void saveCreatesNewImmutableRevisionAndRejectsStaleWrites() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        var previous=new ArchitectureDocument();previous.setModelVersion(model);previous.setViewKey("containers");previous.setRevision(1);previous.setXml(xml);
        when(documents.findTopByModelVersionIdAndViewKeyOrderByRevisionDesc(id,"containers")).thenReturn(Optional.of(previous));
        when(documents.saveAndFlush(any())).thenAnswer(call->call.getArgument(0));
        var result=service.save(id,"containers",new ArchitectureDocumentService.Save(1,xml));
        assertThat(result.revision()).isEqualTo(2);assertThat(previous.getRevision()).isEqualTo(1);
        verify(access).requireProjectWriteAccess(model.getProject());
        verify(entityManager).lock(model,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        assertThatThrownBy(()->service.save(id,"containers",new ArchitectureDocumentService.Save(0,xml))).isInstanceOf(BusinessException.class);
        verify(documents,times(1)).saveAndFlush(any());
    }
    @Test void readsAreScopedToModelAndHistoricalRevision() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        var historical=new ArchitectureDocument();historical.setModelVersion(model);historical.setViewKey("containers");historical.setRevision(2);historical.setXml(xml);
        when(documents.findByModelVersionIdAndViewKeyAndRevision(id,"containers",2L)).thenReturn(Optional.of(historical));
        assertThat(service.get(id,"containers",2L).revision()).isEqualTo(2);
        verify(access).requireProjectReadAccess(model.getProject());
    }
    @Test void rejectsMalformedDocumentsAndExternalEntities() {
        assertThatCode(()->ArchitectureDocumentService.validateXml(xml)).doesNotThrowAnyException();
        for(String invalid:List.of("<svg/>","<mxfile/>","<!DOCTYPE mxfile [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><mxfile>&x;</mxfile>","x".repeat(2_000_001)))
            assertThatThrownBy(()->ArchitectureDocumentService.validateXml(invalid)).isInstanceOf(BusinessException.class);
    }
    @Test void deniedWriterCannotPersistOrLockDocument() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        doThrow(new BusinessException(ErrorCode.FORBIDDEN,"Denied")).when(access).requireProjectWriteAccess(model.getProject());
        assertThatThrownBy(()->service.save(id,"containers",new ArchitectureDocumentService.Save(0,xml))).isInstanceOf(BusinessException.class);
        verifyNoInteractions(documents,entityManager);
    }

    private ArchitectureDocument document(String view, long revision) {
        var document = new ArchitectureDocument();
        document.setId(UUID.randomUUID());document.setModelVersion(model);
        document.setViewKey(view);document.setRevision(revision);document.setXml(xml);
        return document;
    }

    @Test void bundleBatchLoadsExactRevisionsAndSavesAllArtifactsAfterOnePermissionCheck() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        var context = document("context", 2);
        var container = document("container", 3);
        // Independent IN predicates may return this unselected pair too.
        var unselected = document("context", 3);unselected.setXml("must not be frozen");
        when(documents.findByModelVersionIdAndViewKeyInAndRevisionIn(eq(id), any(), any()))
                .thenReturn(List.of(unselected, container, context));
        UUID diagramId = UUID.randomUUID();
        var existing = DiagramVersion.builder().id(diagramId).modelVersion(model).notation("UML_CLASS")
                .level("SAVED_DOCUMENT").layoutJson(new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode().put("original", true)).build();
        when(diagrams.findAllById(any())).thenReturn(List.of(existing));
        when(diagrams.saveAll(any())).thenAnswer(call -> {
            List<DiagramVersion> values = call.getArgument(0);
            values.forEach(value -> value.setId(UUID.randomUUID()));
            return values;
        });
        var result = service.freezeArtifacts(id, new ArchitectureDocumentService.ArtifactSelection(
                List.of(new ArchitectureDocumentService.SelectedDocument("context", 2), new ArchitectureDocumentService.SelectedDocument("container", 3)),
                List.of(diagramId, diagramId)));
        ArgumentCaptor<List<DiagramVersion>> capture = ArgumentCaptor.forClass(List.class);
        verify(diagrams).saveAll(capture.capture());
        var saved = capture.getValue();assertThat(saved).hasSize(3);
        assertThat(result).isEqualTo(saved.get(2).getId());
        var artifacts = saved.get(2).getLayoutJson().path("artifacts");assertThat(artifacts.size()).isEqualTo(3);
        assertThat(artifacts.get(0).path("layoutJson").path("documentRevision").asLong()).isEqualTo(2);
        assertThat(artifacts.get(0).path("layoutJson").path("drawioXml").asText()).isEqualTo(xml);
        assertThat(artifacts.get(1).path("level").asText()).isEqualTo("CONTAINER");
        assertThat(artifacts.get(2).path("diagramVersionId").asText()).isEqualTo(diagramId.toString());
        existing.getLayoutJson().withObject("/changed");assertThat(artifacts.get(2).path("layoutJson").has("changed")).isFalse();
        verify(models).findById(id);verify(access).requireProjectWriteAccess(model.getProject());
        verify(documents).findByModelVersionIdAndViewKeyInAndRevisionIn(eq(id), eq(new LinkedHashSet<>(List.of("context", "container"))), eq(Set.of(2L, 3L)));
        verify(diagrams, never()).findById(any());verify(diagrams, never()).save(any());
        verify(documents, never()).findByModelVersionIdAndViewKeyAndRevision(any(), any(), anyLong());
    }

    @Test void missingExactRevisionCannotBeReplacedByAnotherCandidateOrPartiallySaved() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        when(documents.findByModelVersionIdAndViewKeyInAndRevisionIn(eq(id), any(), any()))
                .thenReturn(List.of(document("context", 3), document("container", 3)));
        assertThatThrownBy(() -> service.freezeArtifacts(id, new ArchitectureDocumentService.ArtifactSelection(
                List.of(new ArchitectureDocumentService.SelectedDocument("context", 2), new ArchitectureDocumentService.SelectedDocument("container", 3)), List.of())))
                .isInstanceOf(BusinessException.class);
        verify(diagrams, never()).saveAll(any());verify(diagrams, never()).save(any());
    }

    @Test void duplicateViewsAndMissingDiagramsNeverWriteArtifacts() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        var selected = new ArchitectureDocumentService.SelectedDocument("context", 1);
        assertThatThrownBy(() -> service.freezeArtifacts(id, new ArchitectureDocumentService.ArtifactSelection(List.of(selected, selected), List.of())))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(documents, diagrams);
        when(diagrams.findAllById(any())).thenReturn(List.of());
        assertThatThrownBy(() -> service.freezeArtifacts(id, new ArchitectureDocumentService.ArtifactSelection(List.of(), List.of(UUID.randomUUID()))))
                .isInstanceOf(BusinessException.class);
        verify(diagrams, never()).saveAll(any());
    }

    @Test void deniedBundleWriterCannotReadSelectedDocumentsOrWriteArtifacts() {
        when(models.findById(id)).thenReturn(Optional.of(model));
        doThrow(new BusinessException(ErrorCode.FORBIDDEN, "Denied")).when(access).requireProjectWriteAccess(model.getProject());
        assertThatThrownBy(() -> service.freezeArtifacts(id, new ArchitectureDocumentService.ArtifactSelection(
                List.of(new ArchitectureDocumentService.SelectedDocument("context", 1)), List.of())))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(documents, diagrams);
    }
}

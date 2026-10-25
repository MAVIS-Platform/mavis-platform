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
    @InjectMocks ArchitectureDocumentService service;
    private final UUID id=UUID.randomUUID();
    private final ModelVersion model=ModelVersion.builder().id(id).project(Project.builder().id(UUID.randomUUID()).build()).build();
    private final String xml="<mxfile><diagram><mxGraphModel><root/></mxGraphModel></diagram></mxfile>";
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
}
package com.mavis.analyzer.model.controller;
import com.mavis.common.entity.*;
import com.mavis.common.exception.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class BrowserReadControllerTest {
    final ProjectRepository projects=mock(ProjectRepository.class);
    final SourceSnapshotRepository snapshots=mock(SourceSnapshotRepository.class);
    final ModelVersionRepository models=mock(ModelVersionRepository.class);
    final ModelElementRepository elements=mock(ModelElementRepository.class);
    final AccessPolicyService policy=mock(AccessPolicyService.class);
    final BrowserReadController controller=new BrowserReadController(projects,snapshots,models,elements,policy);
    @Test void outsiderCannotListProjectSnapshots() {
        var p=Project.builder().id(UUID.randomUUID()).build(); when(projects.findById(p.getId())).thenReturn(Optional.of(p));
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(policy).requireProjectReadAccess(p);
        assertThrows(BusinessException.class,()->controller.snapshots(p.getId())); verifyNoInteractions(snapshots);
    }
    @Test void snapshotReadChecksItsProject() {
        var p=Project.builder().id(UUID.randomUUID()).build();var s=SourceSnapshot.builder().id(UUID.randomUUID()).project(p).sourceType("ZIP_UPLOAD").build();
        when(snapshots.findById(s.getId())).thenReturn(Optional.of(s));var result=controller.snapshot(s.getId());
        verify(policy).requireProjectReadAccess(p);assertEquals(s.getId(),result.getData().id());
        assertFalse(Arrays.stream(BrowserReadController.SnapshotView.class.getRecordComponents()).anyMatch(c->c.getName().equals("storagePath")));
    }
    @Test void elementCannotBeReadThroughAnotherModel() {
        var p=Project.builder().id(UUID.randomUUID()).build();var model=ModelVersion.builder().id(UUID.randomUUID()).project(p).build();
        var other=ModelVersion.builder().id(UUID.randomUUID()).build();var element=ModelElement.builder().id(UUID.randomUUID()).modelVersion(other).build();
        when(models.findById(model.getId())).thenReturn(Optional.of(model));when(elements.findById(element.getId())).thenReturn(Optional.of(element));
        var error=assertThrows(BusinessException.class,()->controller.element(model.getId(),element.getId()));assertEquals(ErrorCode.NOT_FOUND,error.getErrorCode());
    }
    @Test void forbiddenModelDoesNotReadElements() {
        var p=Project.builder().id(UUID.randomUUID()).build();var model=ModelVersion.builder().id(UUID.randomUUID()).project(p).build();
        when(models.findById(model.getId())).thenReturn(Optional.of(model));doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(policy).requireProjectReadAccess(p);
        assertThrows(BusinessException.class,()->controller.elements(model.getId()));verifyNoInteractions(elements);
    }
}

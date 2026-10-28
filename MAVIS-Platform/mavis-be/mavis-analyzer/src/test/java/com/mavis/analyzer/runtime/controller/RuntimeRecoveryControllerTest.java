package com.mavis.analyzer.runtime.controller;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.RuntimeSessionRepository;
import org.junit.jupiter.api.Test;
import java.time.OffsetDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class RuntimeRecoveryControllerTest {
 @Test void recoveryIsScopedIdempotentAndNeverPromotesModel() {
  var repo=mock(RuntimeSessionRepository.class);var access=mock(RunnerServiceAuthGuard.class);
  var controller=new RuntimeRecoveryController(repo,access,new ObjectMapper().findAndRegisterModules());
  UUID id=UUID.randomUUID(),model=UUID.randomUUID(),source=UUID.randomUUID();
  var session=RuntimeSession.builder().id(id).project(Project.builder().id(UUID.randomUUID()).build())
   .modelVersion(ModelVersion.builder().id(model).build()).sourceSnapshot(SourceSnapshot.builder().id(source).build())
   .profileVersionId("p").runConfigurationVersionId("c").scenarioVersionId("v").resourceProject("allocation")
   .executionStatus("RUNNING").build();
  when(repo.findLockedById(id)).thenReturn(Optional.of(session));
  var result=new RuntimeRecoveryController.Result(id.toString(),model.toString(),source.toString(),"p","c","v","allocation","a".repeat(32),"Confirmed",OffsetDateTime.now().toString());
  controller.recover(id,result);controller.recover(id,result);
  assertEquals("FAILED",session.getExecutionStatus());assertEquals("CONFIRMED",session.getCleanupStatus());
  assertEquals("HELD_NON_PROMOTED",session.getPublicationGateStatus());assertNull(session.getRunnerReceiptJson());
  var conflict=new RuntimeRecoveryController.Result(id.toString(),model.toString(),source.toString(),"p","c","v","allocation","b".repeat(32),"Confirmed",result.recoveredAt());
  assertThrows(BusinessException.class,()->controller.recover(id,conflict));
  verify(repo,times(1)).save(session);
 }
}

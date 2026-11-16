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
  var result=new RuntimeRecoveryController.Result(id.toString(),model.toString(),source.toString(),"p","c","v","allocation","a".repeat(32),"Confirmed","2026-10-28T01:02:03.120Z");
  controller.recover(id,result);controller.recover(id,result);
  assertEquals("FAILED",session.getExecutionStatus());assertEquals("CONFIRMED",session.getCleanupStatus());
  assertEquals("HELD_NON_PROMOTED",session.getPublicationGateStatus());assertNull(session.getRunnerReceiptJson());
  var conflict=new RuntimeRecoveryController.Result(id.toString(),model.toString(),source.toString(),"p","c","v","allocation","b".repeat(32),"Confirmed",result.recoveredAt());
  assertThrows(BusinessException.class,()->controller.recover(id,conflict));
  verify(repo,times(1)).save(session);
 }
 @org.junit.jupiter.params.ParameterizedTest
 @org.junit.jupiter.params.provider.ValueSource(strings={"2026-10-28T01:02:03.120Z","2026-10-28T01:02:03.000Z","2026-10-28T01:02:03.450Z"})
 void preservesWireTimestampAndDigest(String timestamp) throws Exception {
  var json=new ObjectMapper().findAndRegisterModules();
  UUID id=UUID.randomUUID(),model=UUID.randomUUID(),source=UUID.randomUUID();
  var repo=mock(RuntimeSessionRepository.class);
  var session=RuntimeSession.builder().id(id).modelVersion(ModelVersion.builder().id(model).build())
   .sourceSnapshot(SourceSnapshot.builder().id(source).build()).profileVersionId("p").runConfigurationVersionId("c")
   .scenarioVersionId("v").resourceProject("allocation").executionStatus("RUNNING").build();
  when(repo.findLockedById(id)).thenReturn(Optional.of(session));
  var wire=json.createObjectNode().put("sessionId",id.toString()).put("modelVersionId",model.toString())
   .put("sourceSnapshotId",source.toString()).put("profileVersionId","p").put("runConfigurationVersionId","c")
   .put("scenarioVersionId","v").put("resourceProject","allocation").put("recoveryId","a".repeat(32))
   .put("cleanupStatus","Confirmed").put("recoveredAt",timestamp);
  var controller=new RuntimeRecoveryController(repo,mock(RunnerServiceAuthGuard.class),json);
  var result=json.treeToValue(wire,RuntimeRecoveryController.Result.class);
  controller.recover(id,result);
  assertEquals(timestamp,session.getRecoveryResultJson().path("recoveredAt").asText());
  var expected = java.util.Map.of(
   "2026-10-28T01:02:03.120Z","sha256:a11759cb9337679aeeeeb790986673150cacc4d9009c9220b5a4c75b13e32e96",
   "2026-10-28T01:02:03.000Z","sha256:7f94dcfaaced7c477ffae4c9db32af61b5df292a9309031d73bd7464080fc7a8",
   "2026-10-28T01:02:03.450Z","sha256:498c69fca50e095294a1a3613e4b6915d36cd33ecca35046f2396cd20d2d913a");
  assertEquals(expected.get(timestamp), com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils.computeDigest(json.createObjectNode().put("recoveredAt",timestamp)));
  assertEquals(com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils.computeDigest(wire),
   com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils.computeDigest(session.getRecoveryResultJson()));
  var invalid=new RuntimeRecoveryController.Result(id.toString(),model.toString(),source.toString(),"p","c","v","allocation","a".repeat(32),"Confirmed","not-a-timestamp");
  assertThrows(BusinessException.class,()->controller.recover(id,invalid));
  verify(repo,times(1)).save(session);
 }
}

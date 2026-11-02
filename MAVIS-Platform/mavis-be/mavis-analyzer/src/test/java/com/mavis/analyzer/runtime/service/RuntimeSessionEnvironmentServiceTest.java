package com.mavis.analyzer.runtime.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.exception.BusinessException;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class RuntimeSessionEnvironmentServiceTest {
 RuntimeSessionRepository sessions;RunnerServiceAuthGuard guard;RuntimeSession session;RuntimeSessionEnvironmentService service;
 @BeforeEach void setup(){sessions=mock(RuntimeSessionRepository.class);guard=mock(RunnerServiceAuthGuard.class);when(guard.isConfigured()).thenReturn(true);session=RuntimeSession.builder().id(UUID.randomUUID()).sourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build()).modelVersion(ModelVersion.builder().id(UUID.randomUUID()).build()).resourceProject("mavisrun-"+"a".repeat(32)).executionStatus("NOT_STARTED").build();when(sessions.findById(session.getId())).thenReturn(Optional.of(session));service=new RuntimeSessionEnvironmentService(sessions,guard,new ObjectMapper(),Base64.getEncoder().encodeToString(new byte[32]));}
 @Test void encryptsInputsAndOnlyReturnsThemToRunnerForActivePinnedSession() throws Exception {
  service.store(session.getId(),Map.of("API_HEADER","fixture-only-value"));assertThat(session.getEnvironmentCiphertext()).startsWith("v1.").doesNotContain("fixture-only-value");
  assertThat(new ObjectMapper().valueToTree(session).has("environmentCiphertext")).isFalse();
  session.setExecutionStatus("READY_FOR_DISPATCH");assertThat(service.readForRunner(session.getId()).values()).containsEntry("API_HEADER","fixture-only-value");verify(guard).requireRunnerService();
  session.setExecutionStatus("COMPLETED");assertThatThrownBy(()->service.readForRunner(session.getId())).isInstanceOf(BusinessException.class);
 }
 @Test void associatedSourceAndModelPreventCiphertextReplay(){service.store(session.getId(),Map.of("VALUE","fixture"));session.setExecutionStatus("READY_FOR_DISPATCH");session.getModelVersion().setId(UUID.randomUUID());assertThatThrownBy(()->service.readForRunner(session.getId())).isInstanceOf(BusinessException.class);}
 @Test void missingEncryptionKeyAndInvalidInputsCannotStorePlaintext(){var unconfigured=new RuntimeSessionEnvironmentService(sessions,guard,new ObjectMapper(),"");assertThatThrownBy(()->unconfigured.store(session.getId(),Map.of("VALUE","fixture"))).isInstanceOf(BusinessException.class);assertThat(session.getEnvironmentCiphertext()).isNull();assertThatThrownBy(()->service.store(session.getId(),Map.of("invalid-key","fixture"))).isInstanceOf(BusinessException.class);}
 @Test void unauthorizedRunnerCannotReadSession(){doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN)).when(guard).requireRunnerService();assertThatThrownBy(()->service.readForRunner(session.getId())).isInstanceOf(BusinessException.class);verifyNoInteractions(sessions);}
 @Test void derivesKeyFromRunnerGuardWhenExplicitKeyMissing(){when(guard.derivedEnvironmentKey()).thenReturn(Base64.getEncoder().encodeToString(new byte[32]));var derived=new RuntimeSessionEnvironmentService(sessions,guard,new ObjectMapper(),"");assertThat(derived.isConfigured()).isTrue();derived.store(session.getId(),Map.of("VALUE","fixture"));assertThat(session.getEnvironmentCiphertext()).startsWith("v1.");}

 @Test void startRequestAcceptsValuesButNeverSerializesOrLogsThem() throws Exception {
  var json=new ObjectMapper();var id=UUID.randomUUID();
  var input=json.readValue("{\"snapshotId\":\""+id+"\",\"scenarioId\":\""+id+"\",\"configurationRevision\":1,\"scenarioRevision\":1,\"approved\":true,\"environment\":{\"VALUE\":\"fixture-private-value\"}}",RuntimePlanningService.StartRequest.class);
  assertThat(input.environment()).containsEntry("VALUE","fixture-private-value");
  assertThat(json.writeValueAsString(input)).doesNotContain("fixture-private-value");assertThat(input.toString()).doesNotContain("fixture-private-value");
 }
}

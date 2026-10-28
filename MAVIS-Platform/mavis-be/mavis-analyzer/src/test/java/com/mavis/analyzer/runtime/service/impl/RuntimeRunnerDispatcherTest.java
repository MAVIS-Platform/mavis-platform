package com.mavis.analyzer.runtime.service.impl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.runtime.service.*;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class RuntimeRunnerDispatcherTest {
 @ParameterizedTest @ValueSource(strings={"AUTO","MANAGED_CLI","SYNTHETIC"})
 void unavailableRunnerNeverApprovesOrFabricatesEvidence(String mode){
  var sessions=mock(RuntimeSessionRepository.class);var receipt=mock(RunnerReceiptIngestService.class);var service=mock(RuntimeSessionService.class);
  var dispatcher=new RuntimeRunnerDispatcher(sessions,mock(ModelElementRepository.class),mock(ModelRelationshipRepository.class),receipt,service,new ObjectMapper());
  ReflectionTestUtils.setField(dispatcher,"runnerMode",mode);
  ReflectionTestUtils.setField(dispatcher,"runnerProjectPath","missing-runner-for-test.csproj");
  var id=UUID.randomUUID();when(sessions.findById(id)).thenReturn(Optional.of(RuntimeSession.builder().id(id).build()));
  assertThatThrownBy(()->dispatcher.dispatchSession(id)).isInstanceOf(BusinessException.class).hasMessageContaining("runner unavailable");
  verifyNoInteractions(receipt,service);verify(sessions,never()).save(any());
 }
}

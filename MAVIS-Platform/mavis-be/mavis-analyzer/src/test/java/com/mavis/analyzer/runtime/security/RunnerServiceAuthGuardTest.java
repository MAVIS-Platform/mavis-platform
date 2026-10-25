package com.mavis.analyzer.runtime.security;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class RunnerServiceAuthGuardTest {
 @Test void callbacksRequireDedicatedCredentialRatherThanProjectOwnership(){var p=mock(AccessPolicyService.class);var g=new RunnerServiceAuthGuard(p);var r=new MockHttpServletRequest();ReflectionTestUtils.setField(g,"httpServletRequest",r);ReflectionTestUtils.setField(g,"runnerServiceKey","fixture-key");assertThrows(BusinessException.class,g::requireRunnerService);r.addHeader("X-Mavis-Runner-Key","wrong");assertThrows(BusinessException.class,g::requireRunnerService);r.removeHeader("X-Mavis-Runner-Key");r.addHeader("X-Mavis-Runner-Key","fixture-key");assertDoesNotThrow(g::requireRunnerService);verifyNoInteractions(p);}
}

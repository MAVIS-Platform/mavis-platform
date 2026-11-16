package com.mavis.analyzer.runtime.security;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class RunnerServiceAuthGuardTest {
 @Test void receiptSignatureIsBoundToCanonicalDigest() throws Exception {
  var guard=new RunnerServiceAuthGuard(mock(AccessPolicyService.class));
  var request=new MockHttpServletRequest();
  ReflectionTestUtils.setField(guard,"httpServletRequest",request);
  ReflectionTestUtils.setField(guard,"runnerServiceKey","fixture-key");
  request.addHeader("X-Mavis-Runner-Key","fixture-key");
  assertThrows(BusinessException.class,()->guard.requireReceiptSignature("sha256:first"));
  var mac=javax.crypto.Mac.getInstance("HmacSHA256");
  mac.init(new javax.crypto.spec.SecretKeySpec("fixture-key".getBytes(java.nio.charset.StandardCharsets.UTF_8),"HmacSHA256"));
  String signature="hmac-sha256:"+java.util.HexFormat.of().formatHex(mac.doFinal("sha256:first".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
  request.addHeader("X-Mavis-Receipt-Signature",signature);
  assertEquals(signature,guard.requireReceiptSignature("sha256:first"));
  assertThrows(BusinessException.class,()->guard.requireReceiptSignature("sha256:changed"));
 }
 @Test void callbacksRequireDedicatedCredentialRatherThanProjectOwnership(){var p=mock(AccessPolicyService.class);var g=new RunnerServiceAuthGuard(p);var r=new MockHttpServletRequest();ReflectionTestUtils.setField(g,"httpServletRequest",r);ReflectionTestUtils.setField(g,"runnerServiceKey","fixture-key");assertThrows(BusinessException.class,g::requireRunnerService);r.addHeader("X-Mavis-Runner-Key","wrong");assertThrows(BusinessException.class,g::requireRunnerService);r.removeHeader("X-Mavis-Runner-Key");r.addHeader("X-Mavis-Runner-Key","fixture-key");assertDoesNotThrow(g::requireRunnerService);verifyNoInteractions(p);}

 @org.junit.jupiter.api.Test void publishedDevelopmentKeyCannotAuthorizeRunner(){
  var guard=new RunnerServiceAuthGuard(org.mockito.Mockito.mock(com.mavis.common.security.AccessPolicyService.class));
  var request=new org.springframework.mock.web.MockHttpServletRequest();request.addHeader("X-Mavis-Runner-Key","mavis-local-runner-secret-key");
  org.springframework.test.util.ReflectionTestUtils.setField(guard,"runnerServiceKey","mavis-local-runner-secret-key");org.springframework.test.util.ReflectionTestUtils.setField(guard,"httpServletRequest",request);
  org.assertj.core.api.Assertions.assertThat(guard.isConfigured()).isFalse();org.assertj.core.api.Assertions.assertThat(guard.isRunnerServiceKeyValid()).isFalse();
 }

 @Test void keyRotationAcceptsPreviousServiceKeyAndHmacWhileRejectingInternalBypassHeaderRequirement() throws Exception {
  var guard = new RunnerServiceAuthGuard(mock(AccessPolicyService.class));
  var request = new MockHttpServletRequest();
  ReflectionTestUtils.setField(guard, "httpServletRequest", request);
  ReflectionTestUtils.setField(guard, "runnerServiceKey", "rotated-active-key");
  ReflectionTestUtils.setField(guard, "previousRunnerServiceKey", "rotated-previous-key");
  request.addHeader("X-Mavis-Runner-Key", "rotated-previous-key");
  assertDoesNotThrow(guard::requireRunnerService);
  var mac = javax.crypto.Mac.getInstance("HmacSHA256");
  mac.init(new javax.crypto.spec.SecretKeySpec("rotated-previous-key".getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
  String sig = "hmac-sha256:" + java.util.HexFormat.of().formatHex(mac.doFinal("sha256:rotated".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
  request.addHeader("X-Mavis-Receipt-Signature", sig);
  assertEquals(sig, guard.requireReceiptSignature("sha256:rotated"));
  RunnerServiceAuthGuard.runWithInternalBypass(() -> assertNull(guard.requireReceiptSignature("sha256:any")));
 }
}

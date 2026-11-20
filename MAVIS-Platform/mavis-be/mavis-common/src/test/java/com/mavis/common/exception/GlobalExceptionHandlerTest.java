package com.mavis.common.exception;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import static org.junit.jupiter.api.Assertions.*;
class GlobalExceptionHandlerTest {
 @Test void workflowPreconditionPreservesItsHttpStatusAndStableCode() {
  var handler = new GlobalExceptionHandler();
  var failure = new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "PREFLIGHT_FAILED",
          "The Lab source has unresolved Runner requirements.");
  var response = handler.handleBusinessException(failure);
  assertEquals(422, response.getStatusCode().value());
  assertNotNull(response.getBody());
  assertEquals("PREFLIGHT_FAILED", response.getBody().getErrorCode());
  assertEquals(400, handler.handleBusinessException(new BusinessException(ErrorCode.BAD_REQUEST))
          .getStatusCode().value());
 }

 @Test void missingResourceAndMalformedContentDoNotBecomeServerErrors() {
  var handler=new GlobalExceptionHandler();
  assertNotNull(handler.handleMissingResource(new NoResourceFoundException(HttpMethod.GET,"unknown")));
  assertEquals(415,handler.handleContentType(new HttpMediaTypeNotSupportedException("invalid")).getStatusCode().value());
  assertEquals(413,handler.handleUploadTooLarge(new org.springframework.web.multipart.MaxUploadSizeExceededException(100)).getStatusCode().value());
  assertNotNull(handler.handleMalformedRequest(new IllegalArgumentException()));
 }
}

package com.mavis.common.exception;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import static org.junit.jupiter.api.Assertions.*;
class GlobalExceptionHandlerTest {
 @Test void missingResourceAndMalformedContentDoNotBecomeServerErrors() {
  var handler=new GlobalExceptionHandler();
  assertNotNull(handler.handleMissingResource(new NoResourceFoundException(HttpMethod.GET,"unknown")));
  assertEquals(415,handler.handleContentType(new HttpMediaTypeNotSupportedException("invalid")).getStatusCode().value());
  assertEquals(413,handler.handleUploadTooLarge(new org.springframework.web.multipart.MaxUploadSizeExceededException(100)).getStatusCode().value());
  assertNotNull(handler.handleMalformedRequest(new IllegalArgumentException()));
 }
}

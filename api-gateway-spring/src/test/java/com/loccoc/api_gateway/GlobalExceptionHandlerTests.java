package com.loccoc.api_gateway;

import static org.junit.jupiter.api.Assertions.*;

import com.loccoc.api_gateway.exception.*;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.HttpRequestMethodNotSupportedException;

class GlobalExceptionHandlerTests {
  private final GlobalExceptionHandler handler = new GlobalExceptionHandler();
  private final MockHttpServletRequest request = new MockHttpServletRequest();

  @Test
  void applicationExceptionUsesCatalogStatusAndMessage() {
    var response =
        handler.handleAppException(new AppException(ErrorCode.RATE_LIMITER_UNAVAILABLE), request);
    assertEquals(503, response.getStatusCode().value());
    assertEquals(1105, response.getBody().code());
    assertNull(response.getBody().result());
  }

  @Test
  void unexpectedExceptionDoesNotExposeInternalDetails() {
    var response =
        handler.handleException(
            new IllegalStateException("password=secret; relation accounts does not exist"),
            request);
    assertEquals(500, response.getStatusCode().value());
    assertEquals(9999, response.getBody().code());
    assertEquals("Uncategorized exception", response.getBody().message());
  }

  @Test
  void frameworkErrorsKeepTheirStatusAndRequiredHeaders() {
    var response =
        handler.handleException(
            new HttpRequestMethodNotSupportedException("POST", java.util.List.of("GET")), request);
    assertEquals(405, response.getStatusCode().value());
    assertEquals(1101, response.getBody().code());
    assertEquals("GET", response.getHeaders().getFirst("Allow"));
  }

  @Test
  void validationHasDedicatedApplicationCode() {
    var response = handler.handleValidation(null);
    assertEquals(400, response.getStatusCode().value());
    assertEquals(1003, response.getBody().code());
  }

  @Test
  void catalogCodesAreUnique() {
    assertEquals(
        ErrorCode.values().length,
        Arrays.stream(ErrorCode.values()).map(ErrorCode::getCode).distinct().count());
  }
}

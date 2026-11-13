package com.loccoc.api_gateway.exception;

import org.springframework.http.HttpStatus;

/** Stable application codes, separate from the HTTP status. */
public enum ErrorCode {
  UNCATEGORIZED_EXCEPTION(9999, "Uncategorized exception", HttpStatus.INTERNAL_SERVER_ERROR),
  UNAUTHENTICATED(1001, "Unauthenticated exception", HttpStatus.UNAUTHORIZED),
  VALIDATION_FAILED(1003, "Invalid condition", HttpStatus.BAD_REQUEST),
  ACCESS_DENIED(1004, "You do not have permission", HttpStatus.FORBIDDEN),
  INVALID_PARAMETER(1006, "Invalid request parameters", HttpStatus.BAD_REQUEST),
  ROUTE_NOT_FOUND(1100, "Requested resource not found", HttpStatus.NOT_FOUND),
  METHOD_NOT_ALLOWED(1101, "HTTP method not allowed", HttpStatus.METHOD_NOT_ALLOWED),
  REQUEST_TOO_LARGE(1102, "Request body too large", HttpStatus.PAYLOAD_TOO_LARGE),
  TOO_MANY_REQUESTS(1103, "Too many requests", HttpStatus.TOO_MANY_REQUESTS),
  UPSTREAM_UNAVAILABLE(1104, "Upstream service unavailable", HttpStatus.BAD_GATEWAY),
  RATE_LIMITER_UNAVAILABLE(1105, "Rate limiter unavailable", HttpStatus.SERVICE_UNAVAILABLE),
  UPSTREAM_TIMEOUT(1106, "Upstream service timed out", HttpStatus.GATEWAY_TIMEOUT),
  UPSTREAM_RESPONSE_TOO_LARGE(1107, "Upstream response too large", HttpStatus.BAD_GATEWAY),
  UNSUPPORTED_MEDIA_TYPE(1108, "Unsupported media type", HttpStatus.UNSUPPORTED_MEDIA_TYPE),
  CONFLICT(1109, "Request conflicts with the current resource state", HttpStatus.CONFLICT),
  SERVICE_UNAVAILABLE(1110, "Service unavailable", HttpStatus.SERVICE_UNAVAILABLE),
  UPSTREAM_CLIENT_ERROR(1111, "Upstream rejected the request", HttpStatus.BAD_REQUEST),
  UPSTREAM_SERVER_ERROR(1112, "Upstream service failed", HttpStatus.BAD_GATEWAY);

  private final int code;
  private final String message;
  private final HttpStatus statusCode;

  ErrorCode(int code, String message, HttpStatus statusCode) {
    this.code = code;
    this.message = message;
    this.statusCode = statusCode;
  }

  public int getCode() {
    return code;
  }

  public String getMessage() {
    return message;
  }

  public HttpStatus getStatusCode() {
    return statusCode;
  }

  public static ErrorCode fromHttpStatus(int status) {
    return switch (status) {
      case 400 -> INVALID_PARAMETER;
      case 401 -> UNAUTHENTICATED;
      case 403 -> ACCESS_DENIED;
      case 404 -> ROUTE_NOT_FOUND;
      case 405 -> METHOD_NOT_ALLOWED;
      case 409 -> CONFLICT;
      case 413 -> REQUEST_TOO_LARGE;
      case 415 -> UNSUPPORTED_MEDIA_TYPE;
      case 422 -> VALIDATION_FAILED;
      case 429 -> TOO_MANY_REQUESTS;
      case 500 -> UNCATEGORIZED_EXCEPTION;
      case 502 -> UPSTREAM_UNAVAILABLE;
      case 503 -> SERVICE_UNAVAILABLE;
      case 504 -> UPSTREAM_TIMEOUT;
      default -> status >= 500 ? UPSTREAM_SERVER_ERROR : UPSTREAM_CLIENT_ERROR;
    };
  }
}

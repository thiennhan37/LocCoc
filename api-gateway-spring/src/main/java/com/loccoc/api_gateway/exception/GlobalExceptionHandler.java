package com.loccoc.api_gateway.exception;

import com.loccoc.api_gateway.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(AppException.class)
  public ResponseEntity<ApiResponse<Void>> handleAppException(
      AppException exception, HttpServletRequest request) {
    ErrorCode code = exception.getErrorCode();
    logError(exception, code.getStatusCode().value(), request);
    return ResponseEntity.status(code.getStatusCode()).body(ApiResponse.error(code));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiResponse<Void>> handleValidation(
      MethodArgumentNotValidException exception) {
    return ResponseEntity.badRequest().body(ApiResponse.error(ErrorCode.VALIDATION_FAILED));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiResponse<Void>> handleException(
      Exception exception, HttpServletRequest request) {
    int status = exception instanceof ErrorResponse error ? error.getStatusCode().value() : 500;
    ErrorCode code =
        exception instanceof ErrorResponse
            ? ErrorCode.fromHttpStatus(status)
            : ErrorCode.UNCATEGORIZED_EXCEPTION;
    logError(exception, status, request);
    var response = ResponseEntity.status(status);
    if (exception instanceof ErrorResponse error) response.headers(error.getHeaders());
    return response.body(ApiResponse.error(code));
  }

  private void logError(Exception exception, int status, HttpServletRequest request) {
    if (status >= 500)
      LOG.error(
          "Gateway error status={} requestId={} type={}",
          status,
          request.getAttribute("requestId"),
          exception.getClass().getSimpleName());
  }
}

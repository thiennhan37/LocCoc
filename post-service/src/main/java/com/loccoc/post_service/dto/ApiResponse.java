package com.loccoc.post_service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.loccoc.post_service.exception.ErrorCode;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record ApiResponse<T>(int code, String message, T result) {
  public static <T> ApiResponse<T> success(T result) {
    return new ApiResponse<>(1000, "Successful", result);
  }

  public static ApiResponse<Void> error(ErrorCode errorCode) {
    return new ApiResponse<>(errorCode.getCode(), errorCode.getMessage(), null);
  }
}


package com.loccoc.api_gateway.service;

import com.loccoc.api_gateway.configuration.GatewayProperties;
import com.loccoc.api_gateway.exception.AppException;
import com.loccoc.api_gateway.exception.ErrorCode;
import com.loccoc.api_gateway.repository.RateLimitRepository;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Service;

@Service
public class RateLimitService {
  private final RateLimitRepository repository;
  private final GatewayProperties properties;

  public RateLimitService(RateLimitRepository repository, GatewayProperties properties) {
    this.repository = repository;
    this.properties = properties;
  }

  public void check(HttpServletRequest request, HttpServletResponse response) {
    com.loccoc.api_gateway.dto.RateLimitDecision decision;
    try {
      decision =
          repository.consume(
              request.getRemoteAddr(), properties.rateLimitMax(), properties.rateLimitTtlMs());
    } catch (RuntimeException e) {
      throw new AppException(ErrorCode.RATE_LIMITER_UNAVAILABLE);
    }
    if (!decision.allowed()) {
      response.setHeader("Retry-After", String.valueOf(decision.retryAfterSeconds()));
      throw new AppException(ErrorCode.TOO_MANY_REQUESTS);
    }
    boolean momentSearch = request.getMethod().equals("POST") && request.getRequestURI().equals("/moments/search");
    boolean imageUpload = request.getMethod().equals("PUT") && (request.getRequestURI().matches("/users/me/media/(avatar|cover)")
        || request.getRequestURI().matches("/moments/[0-9a-f-]{36}/image"));
    if (momentSearch || imageUpload) {
      try {
        decision = repository.consume((momentSearch ? "moment-search:" : "media:") + request.getRemoteAddr(), momentSearch ? 30 : 10, 60000);
      } catch (RuntimeException e) {
        throw new AppException(ErrorCode.RATE_LIMITER_UNAVAILABLE);
      }
      if (!decision.allowed()) {
        response.setHeader("Retry-After", String.valueOf(decision.retryAfterSeconds()));
        throw new AppException(ErrorCode.TOO_MANY_REQUESTS);
      }
    }
  }
}

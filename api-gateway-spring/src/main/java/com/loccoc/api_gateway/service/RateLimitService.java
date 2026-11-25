package com.loccoc.api_gateway.service;

import com.loccoc.api_gateway.configuration.GatewayProperties;
import com.loccoc.api_gateway.dto.RateLimitDecision;
import com.loccoc.api_gateway.exception.AppException;
import com.loccoc.api_gateway.exception.ErrorCode;
import com.loccoc.api_gateway.repository.RateLimitRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Service;

@Service
public class RateLimitService {
  private final RateLimitRepository repository;
  private final GatewayProperties properties;

  public RateLimitService(RateLimitRepository repository, GatewayProperties properties) {
    this.repository = repository;
    this.properties = properties;
  }

  public void checkGlobal(HttpServletRequest request, HttpServletResponse response) {
    consumeOrThrow(
        request.getRemoteAddr(), properties.rateLimitMax(), properties.rateLimitTtlMs(), 0L, response);
  }

  public void checkRoute(HttpServletRequest request, HttpServletResponse response) {
    String path = request.getRequestURI();
    String ip = request.getRemoteAddr();
    if (path.equals("/ai") || path.startsWith("/ai/")) {
      response.setHeader("Cache-Control", "no-store");
      consumeOrThrow(
          "ai:" + ip,
          properties.aiRateLimitMax(),
          properties.aiRateLimitWindowMs(),
          properties.aiRateLimitWindowMs(),
          response);
      return;
    }
    boolean momentSearch = request.getMethod().equals("POST") && path.equals("/moments/search");
    boolean imageUpload = request.getMethod().equals("PUT")
        && (path.matches("/users/me/media/(avatar|cover)")
            || path.matches("/moments/[0-9a-f-]{36}/image"));
    if (momentSearch || imageUpload) {
      consumeOrThrow(
          (momentSearch ? "moment-search:" : "media:") + ip,
          momentSearch ? 30 : 10,
          60000L,
          0L,
          response);
    }
  }

  public void checkEcho(HttpServletRequest request, HttpServletResponse response) {
    checkGlobal(request, response);
    consumeOrThrow("health-echo:" + request.getRemoteAddr(), 2, 60000L, 0L, response);
  }

  public void check(HttpServletRequest request, HttpServletResponse response) {
    checkGlobal(request, response);
    checkRoute(request, response);
  }

  private void consumeOrThrow(
      String key, int limit, long ttlMs, long blockDurationMs, HttpServletResponse response) {
    RateLimitDecision decision;
    try {
      decision = blockDurationMs > 0
          ? repository.consume(key, limit, ttlMs, blockDurationMs)
          : repository.consume(key, limit, ttlMs);
    } catch (RuntimeException e) {
      throw new AppException(ErrorCode.RATE_LIMITER_UNAVAILABLE);
    }
    if (!decision.allowed()) {
      response.setHeader("Retry-After", String.valueOf(decision.retryAfterSeconds()));
      throw new AppException(ErrorCode.TOO_MANY_REQUESTS);
    }
  }
}

package com.loccoc.api_gateway.controller;

import com.loccoc.api_gateway.exception.AppException;
import com.loccoc.api_gateway.exception.ErrorCode;
import com.loccoc.api_gateway.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class HealthController {
  private final RateLimitService limiter;
  private final JsonMapper json = JsonMapper.builder().build();

  public HealthController(RateLimitService limiter) {
    this.limiter = limiter;
  }

  @GetMapping({ "/", "/health" })
  public Map<String, String> health() {
    return Map.of("status", "ok", "service", "api-gateway-spring");
  }

  @PostMapping("/health/echo")
  public ResponseEntity<Map<String, String>> echo(
      @RequestBody(required = false) byte[] rawBody,
      HttpServletRequest request,
      HttpServletResponse response) {
    limiter.checkEcho(request, response);
    if (rawBody == null || rawBody.length == 0) {
      throw new AppException(ErrorCode.VALIDATION_FAILED);
    }
    JsonNode body;
    try {
      body = json.readTree(rawBody);
    } catch (Exception e) {
      throw new AppException(ErrorCode.INVALID_PARAMETER);
    }
    JsonNode value = body != null && body.isObject() && body.size() == 1 ? body.get("value") : null;
    if (value == null || !value.isString()) {
      throw new AppException(ErrorCode.VALIDATION_FAILED);
    }
    return ResponseEntity.status(201).body(Map.of("value", value.asText()));
  }

  @GetMapping("/health/error")
  public ResponseEntity<Void> error(HttpServletRequest request, HttpServletResponse response) {
    limiter.checkGlobal(request, response);
    throw new IllegalStateException("simulated failure");
  }
}

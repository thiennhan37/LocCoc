package com.loccoc.api_gateway.repository;

import com.loccoc.api_gateway.dto.RateLimitDecision;

public interface RateLimitRepository {
  RateLimitDecision consume(String clientIp, int limit, long ttlMs);

  default RateLimitDecision consume(String key, int limit, long ttlMs, long blockDurationMs) {
    return consume(key, limit, ttlMs);
  }
}

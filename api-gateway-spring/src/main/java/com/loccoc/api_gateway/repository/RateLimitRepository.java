package com.loccoc.api_gateway.repository;

import com.loccoc.api_gateway.dto.RateLimitDecision;

public interface RateLimitRepository {
  RateLimitDecision consume(String clientIp, int limit, long ttlMs);
}

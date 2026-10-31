package com.loccoc.api_gateway.dto;

public record RateLimitDecision(boolean allowed, long retryAfterSeconds) {}

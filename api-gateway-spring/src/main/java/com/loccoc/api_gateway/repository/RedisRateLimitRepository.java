package com.loccoc.api_gateway.repository;

import com.loccoc.api_gateway.dto.RateLimitDecision;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;

@Repository
public class RedisRateLimitRepository implements RateLimitRepository {
  private final StringRedisTemplate redis;
  private static final DefaultRedisScript<Long> SCRIPT =
      new DefaultRedisScript<>(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[2])"
              + " end; if n>tonumber(ARGV[1]) then return redis.call('PTTL',KEYS[1]) end; return"
              + " -1",
          Long.class);

  public RedisRateLimitRepository(StringRedisTemplate redis) {
    this.redis = redis;
  }

  public RateLimitDecision consume(String ip, int limit, long ttl) {
    Long remaining =
        redis.execute(
            SCRIPT, List.of("gateway:rate:" + ip), String.valueOf(limit), String.valueOf(ttl));
    if (remaining == null) throw new IllegalStateException("No Redis quota result");
    return new RateLimitDecision(remaining == -1, Math.max(1, (remaining + 999) / 1000));
  }
}

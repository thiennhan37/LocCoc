package com.loccoc.api_gateway.repository;

import com.loccoc.api_gateway.dto.RateLimitDecision;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;

@Repository
public class RedisRateLimitRepository implements RateLimitRepository {
  private final StringRedisTemplate redis;
  private static final DefaultRedisScript<Long> SCRIPT = new DefaultRedisScript<>(
      "local blockTtl=redis.call('PTTL',KEYS[2]); "
          + "if blockTtl>0 then return blockTtl end; "
          + "local n=redis.call('INCR',KEYS[1]); "
          + "if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[2]) end; "
          + "if n>tonumber(ARGV[1]) then "
          + "  if tonumber(ARGV[3])>0 then "
          + "    if redis.call('EXISTS',KEYS[2])==0 then redis.call('SET',KEYS[2],1,'PX',ARGV[3]) end; "
          + "    return redis.call('PTTL',KEYS[2]); "
          + "  end; "
          + "  return redis.call('PTTL',KEYS[1]); "
          + "end; "
          + "return -1",
      Long.class);

  public RedisRateLimitRepository(StringRedisTemplate redis) {
    this.redis = redis;
  }

  @Override
  public RateLimitDecision consume(String ip, int limit, long ttl) {
    return consume(ip, limit, ttl, 0L);
  }

  @Override
  public RateLimitDecision consume(String key, int limit, long ttl, long blockDurationMs) {
    String baseKey = "gateway:rate:" + key;
    Long remaining = redis.execute(
        SCRIPT,
        List.of(baseKey, baseKey + ":block"),
        String.valueOf(limit),
        String.valueOf(ttl),
        String.valueOf(Math.max(0L, blockDurationMs)));
    if (remaining == null)
      throw new IllegalStateException("No Redis quota result");
    return new RateLimitDecision(remaining == -1, Math.max(1, (remaining + 999) / 1000));
  }
}

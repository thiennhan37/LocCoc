package com.loccoc.api_gateway.configuration;

import java.net.URI;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("gateway")
public record GatewayProperties(
    Map<String, URI> routes,
    long rateLimitTtlMs,
    int rateLimitMax,
    @DefaultValue("5") int aiRateLimitMax,
    @DefaultValue("60000") long aiRateLimitWindowMs,
    @DefaultValue("") String aiServiceToken,
    @DefaultValue("true") boolean accountAccessEnabled,
    @DefaultValue("") String internalServiceToken,
    long connectTimeoutMs,
    long requestTimeoutMs,
    int maxBodyBytes,
    String[] corsOrigins) {

  public static final Set<String> REQUIRED_ROUTES = Set.of(
      "auth",
      "users",
      "notifications",
      "posts",
      "moments",
      "chat",
      "ai",
      "admin",
      "payments",
      "subscriptions");

  public GatewayProperties {
    if (rateLimitTtlMs < 1
        || rateLimitMax < 1
        || aiRateLimitMax < 1
        || aiRateLimitWindowMs < 1
        || connectTimeoutMs < 1
        || requestTimeoutMs < 1
        || maxBodyBytes < 1
        || maxBodyBytes == Integer.MAX_VALUE)
      throw new IllegalArgumentException("Gateway limits must be positive");
    if (routes == null || !routes.keySet().containsAll(REQUIRED_ROUTES))
      throw new IllegalArgumentException("Missing service routes");
    routes.values().forEach(GatewayProperties::validateHttpOrigin);
    if (corsOrigins == null || corsOrigins.length == 0)
      throw new IllegalArgumentException("CORS_ORIGINS must not be empty");
    for (int i = 0; i < corsOrigins.length; i++) {
      String origin = corsOrigins[i] == null ? "" : corsOrigins[i].trim();
      if (origin.isEmpty() || origin.equals("*") || origin.endsWith("/"))
        throw new IllegalArgumentException(
            "CORS_ORIGINS must contain explicit HTTP(S) origins without wildcard or trailing slash");
      try {
        URI uri = URI.create(origin);
        validateHttpOrigin(uri);
      } catch (IllegalArgumentException e) {
        throw new IllegalArgumentException(
            "CORS_ORIGINS must contain explicit HTTP(S) origins", e);
      }
      corsOrigins[i] = origin;
    }
    aiServiceToken = aiServiceToken == null ? "" : aiServiceToken;
    if (!aiServiceToken.isEmpty() && aiServiceToken.length() < 32)
      throw new IllegalArgumentException(
          "AI_SERVICE_TOKEN must be empty or at least 32 characters");
    internalServiceToken = internalServiceToken == null ? "" : internalServiceToken;
    if (accountAccessEnabled && internalServiceToken.length() < 32)
      throw new IllegalArgumentException(
          "INTERNAL_SERVICE_TOKEN must be at least 32 characters when account access is enabled");
  }

  private static void validateHttpOrigin(URI uri) {
    if (uri == null
        || !Set.of("http", "https").contains(uri.getScheme())
        || uri.getHost() == null
        || uri.getRawQuery() != null
        || uri.getRawFragment() != null
        || uri.getUserInfo() != null
        || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
      throw new IllegalArgumentException("Service URL must be an HTTP origin");
  }
}

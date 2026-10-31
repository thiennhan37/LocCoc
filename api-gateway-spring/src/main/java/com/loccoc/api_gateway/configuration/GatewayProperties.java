package com.loccoc.api_gateway.configuration;

import java.net.URI;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("gateway")
public record GatewayProperties(
    Map<String, URI> routes,
    long rateLimitTtlMs,
    int rateLimitMax,
    long connectTimeoutMs,
    long requestTimeoutMs,
    int maxBodyBytes,
    String[] corsOrigins) {
  public GatewayProperties {
    if (rateLimitTtlMs < 1
        || rateLimitMax < 1
        || connectTimeoutMs < 1
        || requestTimeoutMs < 1
        || maxBodyBytes < 1
        || maxBodyBytes == Integer.MAX_VALUE)
      throw new IllegalArgumentException("Gateway limits must be positive");
    if (routes == null
        || !routes
            .keySet()
            .containsAll(java.util.Set.of("auth", "users", "admin", "payments", "subscriptions")))
      throw new IllegalArgumentException("Missing service routes");
    routes
        .values()
        .forEach(
            uri -> {
              if (!java.util.Set.of("http", "https").contains(uri.getScheme())
                  || uri.getHost() == null
                  || uri.getRawQuery() != null
                  || uri.getRawFragment() != null
                  || uri.getUserInfo() != null
                  || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
                throw new IllegalArgumentException("Service URL must be an HTTP origin");
            });
  }
}

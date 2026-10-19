package com.loccoc.api_gateway.configuration;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
@EnableConfigurationProperties(GatewayProperties.class)
public class WebConfiguration implements WebMvcConfigurer {
  private final GatewayProperties properties;

  public WebConfiguration(GatewayProperties properties) {
    this.properties = properties;
  }

  @Bean(destroyMethod = "shutdownNow")
  java.util.concurrent.ScheduledExecutorService responseDeadlineScheduler() {
    var executor = new java.util.concurrent.ScheduledThreadPoolExecutor(1);
    executor.setRemoveOnCancelPolicy(true);
    return executor;
  }

  @Bean
  HttpClient upstreamClient() {
    return HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(properties.connectTimeoutMs()))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry
        .addMapping("/**")
        .allowedOrigins(properties.corsOrigins())
        .allowedMethods("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("*")
        .exposedHeaders("x-request-id", "Retry-After")
        .allowCredentials(true);
  }
}

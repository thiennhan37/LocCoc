package com.loccoc.api_gateway;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.loccoc.api_gateway.dto.RateLimitDecision;
import com.loccoc.api_gateway.repository.RateLimitRepository;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ApiGatewayApplicationTests {
  static HttpServer upstream;
  static final AtomicReference<String> received = new AtomicReference<>();

  static {
    try {
      upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      upstream.createContext(
          "/",
          exchange -> {
            if (exchange.getRequestURI().getPath().endsWith("disconnect")) {
              exchange.close();
              return;
            }
            received.set(
                exchange.getRequestMethod()
                    + " "
                    + exchange.getRequestURI()
                    + " "
                    + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)
                    + " "
                    + exchange.getRequestHeaders().getFirst("Authorization")
                    + " "
                    + exchange.getRequestHeaders().getFirst("X-Forwarded-For"));
            if (exchange.getRequestURI().getPath().endsWith("slow")) {
              try {
                Thread.sleep(900);
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            }
            byte[] body = "{\"upstream\":true}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.getResponseHeaders().add("Set-Cookie", "a=1; HttpOnly");
            exchange.getResponseHeaders().add("Set-Cookie", "b=2; HttpOnly");
            String path = exchange.getRequestURI().getPath();
            exchange.getResponseHeaders().add("WWW-Authenticate", "Bearer");
            exchange.getResponseHeaders().add("Retry-After", "20");
            if (path.endsWith("server-error")) {
              body = "SQL secret must not leak".getBytes(StandardCharsets.UTF_8);
              exchange.getResponseHeaders().add("Content-Encoding", "gzip");
            }
            int status =
                path.endsWith("denied")
                    ? 401
                    : path.endsWith("server-error") ? 500 : path.endsWith("throttled") ? 429 : 201;
            exchange.sendResponseHeaders(status, body.length);
            if (exchange.getRequestURI().getPath().endsWith("slow-body")) {
              try {
                Thread.sleep(900);
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            }
            exchange.getResponseBody().write(body);
            exchange.close();
          });
      upstream.setExecutor(java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor());
      upstream.start();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    for (String name : new String[] {"auth", "users", "admin", "payments", "subscriptions"})
      registry.add(
          "gateway.routes." + name, () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
    registry.add("gateway.cors-origins", () -> "http://localhost:3000");
    registry.add("gateway.max-body-bytes", () -> 128);
    registry.add("gateway.request-timeout-ms", () -> 500);
  }

  @Autowired MockMvc mvc;
  @MockitoBean RateLimitRepository repository;

  @BeforeEach
  void setup() {
    when(repository.consume(anyString(), anyInt(), anyLong()))
        .thenReturn(new RateLimitDecision(true, 0));
  }

  @AfterAll
  static void stop() {
    upstream.stop(0);
  }

  @Test
  void allPrefixesPreserved() throws Exception {
    for (String prefix : new String[] {"auth", "users", "admin", "payments", "subscriptions"}) {
      mvc.perform(
              get(java.net.URI.create("/" + prefix + "/check?q=a%20b"))
                  .header("Authorization", "Bearer test")
                  .header("X-Forwarded-For", "spoof"))
          .andExpect(status().isCreated())
          .andExpect(header().exists("x-request-id"))
          .andExpect(jsonPath("$.upstream").value(true));
      Assertions.assertTrue(
          received.get().startsWith("GET /" + prefix + "/check?q=a%20b"), received.get());
      Assertions.assertTrue(received.get().endsWith("Bearer test 127.0.0.1"));
    }
  }

  @Test
  void preservesWebhookBytesAndCookies() throws Exception {
    String body = "{ \"amount\": 1000 }";
    mvc.perform(
            post("/payments/webhook/payos")
                .contentType("application/json")
                .content(body)
                .header("x-request-id", "test-id"))
        .andExpect(status().isCreated())
        .andExpect(header().string("x-request-id", "test-id"))
        .andExpect(header().stringValues("Set-Cookie", "a=1; HttpOnly", "b=2; HttpOnly"));
    Assertions.assertTrue(received.get().contains(body));
  }

  @Test
  void normalizesUpstreamErrors() throws Exception {
    mvc.perform(get("/auth/denied"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value(1001))
        .andExpect(jsonPath("$.message").value("Unauthenticated exception"))
        .andExpect(jsonPath("$.result").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(header().string("WWW-Authenticate", "Bearer"))
        .andExpect(header().stringValues("Set-Cookie", "a=1; HttpOnly", "b=2; HttpOnly"));
  }

  @Test
  void quotaReturnsStandardError() throws Exception {
    when(repository.consume(anyString(), anyInt(), anyLong()))
        .thenReturn(new RateLimitDecision(false, 12));
    mvc.perform(get("/users/me"))
        .andExpect(status().isTooManyRequests())
        .andExpect(header().string("Retry-After", "12"))
        .andExpect(jsonPath("$.code").value(1103))
        .andExpect(jsonPath("$.message").value("Too many requests"))
        .andExpect(jsonPath("$.result").value(org.hamcrest.Matchers.nullValue()))
        .andExpect(jsonPath("$.statusCode").doesNotExist())
        .andExpect(header().exists("x-request-id"));
  }

  @Test
  void redisFailureIsUnavailable() throws Exception {
    when(repository.consume(anyString(), anyInt(), anyLong()))
        .thenThrow(new IllegalStateException("private details"));
    mvc.perform(get("/admin/tiers"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.message").value("Rate limiter unavailable"));
  }

  @Test
  void bodyLimit() throws Exception {
    mvc.perform(post("/payments/create-checkout").content("x".repeat(129)))
        .andExpect(status().isPayloadTooLarge());
  }

  @Test
  void healthDoesNotRequireRedis() throws Exception {
    mvc.perform(get("/health")).andExpect(status().isOk());
    verifyNoInteractions(repository);
  }

  @Test
  void corsPreflight() throws Exception {
    mvc.perform(
            options("/users/me")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "GET"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
  }

  @Test
  void upstreamTimeout() throws Exception {
    mvc.perform(get("/auth/slow"))
        .andExpect(status().isGatewayTimeout())
        .andExpect(jsonPath("$.code").value(1106));
  }

  @Test
  void responseBodyTimeout() throws Exception {
    mvc.perform(get("/auth/slow-body")).andExpect(status().isGatewayTimeout());
  }

  @Test
  void upstreamDisconnected() throws Exception {
    mvc.perform(post("/payments/disconnect"))
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.message").value("Upstream service unavailable"));
  }

  @Test
  void upstreamInternalErrorIsSanitized() throws Exception {
    mvc.perform(get("/auth/server-error"))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.code").value(9999))
        .andExpect(jsonPath("$.message").value("Uncategorized exception"))
        .andExpect(header().doesNotExist("Content-Encoding"));
  }

  @Test
  void upstreamThrottleKeepsRetryAfter() throws Exception {
    mvc.perform(get("/auth/throttled"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value(1103))
        .andExpect(header().string("Retry-After", "20"));
  }

  @Test
  void missingRoute() throws Exception {
    mvc.perform(get("/unknown"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value(1100));
  }
}

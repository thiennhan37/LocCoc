package com.loccoc.api_gateway;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.loccoc.api_gateway.configuration.GatewayProperties;
import com.loccoc.api_gateway.dto.RateLimitDecision;
import com.loccoc.api_gateway.exception.AppException;
import com.loccoc.api_gateway.exception.ErrorCode;
import com.loccoc.api_gateway.repository.RateLimitRepository;
import com.loccoc.api_gateway.service.ProxyService;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ApiGatewayApplicationTests {
  static final String INTERNAL_TOKEN = "gateway-internal-test-token-32-characters";
  static final String AI_TOKEN = "trusted-ai-service-token-32-characters";
  static final byte[] SAMPLE_PNG =
      new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02, 0x03};

  static HttpServer upstream;
  static final AtomicReference<String> received = new AtomicReference<>();
  static final AtomicReference<byte[]> receivedBytes = new AtomicReference<>();
  static final AtomicReference<Headers> receivedHeaders = new AtomicReference<>();
  static final AtomicInteger upstreamCalls = new AtomicInteger();

  static {
    try {
      upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      upstream.createContext(
          "/",
          exchange -> {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/internal/access")) {
              String serviceToken = exchange.getRequestHeaders().getFirst("x-service-token");
              String auth = exchange.getRequestHeaders().getFirst("Authorization");
              if (!INTERNAL_TOKEN.equals(serviceToken) || "Bearer invalid".equals(auth)) {
                exchange.sendResponseHeaders(401, -1);
                exchange.close();
                return;
              }
              if ("Bearer suspended".equals(auth)) {
                byte[] err =
                    "{\"code\":\"ACCOUNT_UNAVAILABLE\",\"message\":\"Account is unavailable\"}"
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(403, err.length);
                exchange.getResponseBody().write(err);
                exchange.close();
                return;
              }
              if ("Bearer broken-auth".equals(auth)) {
                exchange.close();
                return;
              }
              byte[] ok =
                  "{\"user\":{\"userId\":\"verified-user\",\"role\":\"user\"}}"
                      .getBytes(StandardCharsets.UTF_8);
              exchange.getResponseHeaders().set("Content-Type", "application/json");
              exchange.sendResponseHeaders(200, ok.length);
              exchange.getResponseBody().write(ok);
              exchange.close();
              return;
            }

            upstreamCalls.incrementAndGet();
            // Socket.IO/Engine.IO destroys unsupported h2c upgrade connections.
            if (path.endsWith("http1-only")
                && exchange.getRequestHeaders().getFirst("Upgrade") != null) {
              exchange.close();
              return;
            }
            if (path.endsWith("disconnect")) {
              exchange.close();
              return;
            }
            byte[] reqBytes = exchange.getRequestBody().readAllBytes();
            receivedBytes.set(reqBytes);
            Headers copy = new Headers();
            copy.putAll(exchange.getRequestHeaders());
            receivedHeaders.set(copy);
            received.set(
                exchange.getRequestMethod()
                    + " "
                    + exchange.getRequestURI()
                    + " "
                    + new String(reqBytes, StandardCharsets.UTF_8)
                    + " "
                    + exchange.getRequestHeaders().getFirst("Authorization")
                    + " "
                    + exchange.getRequestHeaders().getFirst("X-Forwarded-For"));

            if (path.equals("/ai/images/enhance")) {
              exchange.getResponseHeaders().set("Content-Type", "image/png");
              exchange.getResponseHeaders().set("Cache-Control", "no-store");
              exchange.getResponseHeaders().set("X-Upstream-Safe", "kept");
              exchange.getResponseHeaders().set("Connection", "x-upstream-hop");
              exchange.getResponseHeaders().set("x-upstream-hop", "removed");
              exchange.sendResponseHeaders(200, SAMPLE_PNG.length);
              exchange.getResponseBody().write(SAMPLE_PNG);
              exchange.close();
              return;
            }

            if (path.endsWith("slow") || path.equals("/posts/photos/enhance")) {
              try {
                Thread.sleep(900);
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            }
            byte[] body = "{\"upstream\":true}".getBytes(StandardCharsets.UTF_8);
            if (path.equals("/posts/photos/enhance"))
              body = ("{\"imageBase64\":\"" + "A".repeat(256) + "\"}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.getResponseHeaders().add("Set-Cookie", "a=1; HttpOnly");
            exchange.getResponseHeaders().add("Set-Cookie", "b=2; HttpOnly");
            exchange.getResponseHeaders().add("WWW-Authenticate", "Bearer");
            exchange.getResponseHeaders().add("Retry-After", "20");
            if (path.endsWith("server-error")) {
              body = "SQL secret must not leak".getBytes(StandardCharsets.UTF_8);
              exchange.getResponseHeaders().add("Content-Encoding", "gzip");
            }
            int status =
                path.endsWith("denied")
                    ? 401
                    : path.endsWith("server-error")
                        ? 500
                        : path.endsWith("throttled") ? 429 : 201;
            exchange.sendResponseHeaders(status, body.length);
            if (path.endsWith("slow-body")) {
              try {
                Thread.sleep(900);
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            }
            exchange.getResponseBody().write(body);
            exchange.close();
          });
      upstream.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
      upstream.start();
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    for (String name : GatewayProperties.REQUIRED_ROUTES)
      registry.add(
          "gateway.routes." + name, () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
    registry.add("gateway.cors-origins", () -> "http://localhost:3000");
    registry.add("gateway.max-body-bytes", () -> 128);
    registry.add("gateway.request-timeout-ms", () -> 500);
    registry.add("gateway.internal-service-token", () -> INTERNAL_TOKEN);
    registry.add("gateway.ai-service-token", () -> AI_TOKEN);
    registry.add("gateway.ai-rate-limit-max", () -> 5);
    registry.add("gateway.ai-rate-limit-window-ms", () -> 60000);
  }

  @Autowired MockMvc mvc;
  @Autowired HttpClient httpClient;
  @Autowired ScheduledExecutorService scheduler;
  @MockitoBean RateLimitRepository repository;

  @BeforeEach
  void setup() {
    upstreamCalls.set(0);
    when(repository.consume(anyString(), anyInt(), anyLong()))
        .thenReturn(new RateLimitDecision(true, 0));
    when(repository.consume(anyString(), anyInt(), anyLong(), anyLong()))
        .thenReturn(new RateLimitDecision(true, 0));
  }

  @AfterAll
  static void stop() {
    upstream.stop(0);
  }

  @Test
  void aiPreviewAllowsLongerDeadlineAndResponseWithoutChangingOtherLimits() throws Exception {
    mvc.perform(
            post("/posts/photos/enhance")
                .header("Authorization", "Bearer viewer")
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("imageBase64").value("A".repeat(256)));
    Assertions.assertTrue(received.get().contains("Bearer viewer"));
  }

  @Test
  void forwardsChatReplyBodyVerifiedIdentityAndAuthorization() throws Exception {
    String body = "{\"clientMessageId\":\"message\",\"text\":\"hello\",\"postId\":\"post\"}";
    mvc.perform(
            post("/chat/conversations/peer/messages")
                .header("Authorization", "Bearer viewer")
                .header("x-user-id", "forged")
                .header("x-user-role", "admin")
                .header("x-service-token", "forged")
                .contentType("application/json")
                .content(body))
        .andExpect(status().isCreated());
    Assertions.assertTrue(
        received.get().startsWith("POST /chat/conversations/peer/messages " + body));
    Assertions.assertTrue(received.get().contains("Bearer viewer"));
    Assertions.assertEquals("verified-user", receivedHeaders.get().getFirst("x-user-id"));
    Assertions.assertEquals("user", receivedHeaders.get().getFirst("x-user-role"));
    Assertions.assertNull(receivedHeaders.get().getFirst("x-service-token"));

    mvc.perform(
            get("/chat/conversations/peer/messages?limit=25")
                .header("Authorization", "Bearer viewer"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(
        received.get().startsWith("GET /chat/conversations/peer/messages?limit=25"));
  }

  @Test
  void chatServerRejectingH2cStillReceivesRestRequests() throws Exception {
    mvc.perform(get("/chat/conversations/http1-only").header("Authorization", "Bearer viewer"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().contains("Bearer viewer"));
  }

  @Test
  void allTenServicePrefixesPreserved() throws Exception {
    for (String prefix : GatewayProperties.REQUIRED_ROUTES) {
      mvc.perform(
              get(URI.create("/" + prefix + "/check?q=a%20b"))
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
  void forwardsNotificationRoutesWithQueryPatchAndDelete() throws Exception {
    mvc.perform(
            get(URI.create("/notifications?limit=20&cursor=test"))
                .header("Authorization", "Bearer viewer")
                .header("x-user-id", "spoof"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("GET /notifications?limit=20&cursor=test"));
    Assertions.assertEquals("verified-user", receivedHeaders.get().getFirst("x-user-id"));

    mvc.perform(
            patch("/notifications/seen")
                .header("Authorization", "Bearer viewer")
                .contentType("application/json")
                .content("{\"seenCursor\":\"signed\"}"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(
        received.get().startsWith("PATCH /notifications/seen {\"seenCursor\":\"signed\"}"));

    mvc.perform(
            delete("/notifications/devices/dev-1").header("Authorization", "Bearer viewer"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("DELETE /notifications/devices/dev-1"));
  }

  @Test
  void aiMultipartEnhancementReplacesServiceTokenStreamsBinaryAndBlocksInternalPaths()
      throws Exception {
    String boundary = "----loccoc-ai-boundary";
    byte[] multipart =
        ("--"
                + boundary
                + "\r\nContent-Disposition: form-data; name=\"filterId\"\r\n\r\nsubject_sticker\r\n"
                + "--"
                + boundary
                + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"photo.png\"\r\n"
                + "Content-Type: image/png\r\n\r\n\u0000\u0001raw-png\r\n--"
                + boundary
                + "--\r\n")
            .getBytes(StandardCharsets.ISO_8859_1);

    mvc.perform(
            post("/ai/images/enhance")
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .header("Proxy-Connection", "keep-alive")
                .header("Expect", "100-continue")
                .header("x-service-token", "spoofed")
                .header("x-ai-actor", "spoofed")
                .header("x-ai-metadata", "spoofed")
                .header("x-user-id", "spoofed")
                .content(multipart))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "image/png"))
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(header().string("X-Upstream-Safe", "kept"))
        .andExpect(header().doesNotExist("x-upstream-hop"))
        .andExpect(content().bytes(SAMPLE_PNG));

    Assertions.assertArrayEquals(multipart, receivedBytes.get());
    Assertions.assertTrue(
        String.valueOf(receivedHeaders.get().getFirst("Content-Type"))
            .startsWith("multipart/form-data; boundary=" + boundary));
    Assertions.assertEquals(AI_TOKEN, receivedHeaders.get().getFirst("x-service-token"));
    Assertions.assertNull(receivedHeaders.get().getFirst("x-ai-actor"));
    Assertions.assertNull(receivedHeaders.get().getFirst("x-ai-metadata"));
    Assertions.assertNull(receivedHeaders.get().getFirst("x-user-id"));
    Assertions.assertNull(receivedHeaders.get().getFirst("Proxy-Connection"));
    Assertions.assertNull(receivedHeaders.get().getFirst("Expect"));
    verify(repository).consume(eq("ai:127.0.0.1"), eq(5), eq(60000L), eq(60000L));

    int callsBefore = upstreamCalls.get();
    mvc.perform(post("/ai/internal/search").contentType("application/json").content("{}"))
        .andExpect(status().isNotFound())
        .andExpect(header().string("Cache-Control", "no-store"));
    mvc.perform(put("/ai/internal/assets/id/1").content("x")).andExpect(status().isNotFound());
    mvc.perform(get("/ai")).andExpect(status().isNotFound());
    Assertions.assertEquals(callsBefore, upstreamCalls.get());
  }

  @Test
  void aiEnhancementFailsClosedWhenAiServiceTokenUnconfigured() {
    var routes = new HashMap<String, URI>();
    for (String r : GatewayProperties.REQUIRED_ROUTES)
      routes.put(r, URI.create("http://127.0.0.1:" + upstream.getAddress().getPort()));
    var props =
        new GatewayProperties(
            routes,
            60000,
            100,
            5,
            60000,
            "",
            true,
            INTERNAL_TOKEN,
            3000,
            10000,
            8388608,
            new String[] {"http://localhost:3000"});
    var unconfiguredProxy = new ProxyService(httpClient, props, scheduler);
    var req = new MockHttpServletRequest("POST", "/ai/images/enhance");
    var res = new MockHttpServletResponse();
    int before = upstreamCalls.get();
    AppException ex =
        Assertions.assertThrows(AppException.class, () -> unconfiguredProxy.forward(req, res));
    Assertions.assertEquals(ErrorCode.SERVICE_UNAVAILABLE, ex.getErrorCode());
    Assertions.assertEquals(before, upstreamCalls.get());
  }

  @Test
  void aiRateLimitSetsNoStoreAndIgnoresRotatedForwardedHeaders() throws Exception {
    when(repository.consume(eq("ai:127.0.0.1"), eq(5), eq(60000L), eq(60000L)))
        .thenReturn(new RateLimitDecision(false, 45));
    mvc.perform(
            post("/ai/images/enhance")
                .header("X-Forwarded-For", "198.51.100.99")
                .content("test"))
        .andExpect(status().isTooManyRequests())
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(header().string("Retry-After", "45"))
        .andExpect(jsonPath("$.code").value(1103));
  }

  @Test
  void accountAuthorityProtectsPrivateRoutesAndAllowsPublicRoutes() throws Exception {
    // Missing/invalid/suspended/broken auth on protected routes
    mvc.perform(get("/users/me")).andExpect(status().isUnauthorized());
    mvc.perform(get("/moments")).andExpect(status().isUnauthorized());
    mvc.perform(get("/notifications")).andExpect(status().isUnauthorized());
    mvc.perform(get("/chat/conversations")).andExpect(status().isUnauthorized());
    mvc.perform(get("/users/me").header("Authorization", "Bearer invalid"))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/users/me").header("Authorization", "Bearer suspended"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value(1004));
    mvc.perform(get("/users/me").header("Authorization", "Bearer broken-auth"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value(1110));

    // Public POST auth routes pass without Bearer token
    for (String publicAuth :
        new String[] {
          "/auth/login",
          "/auth/register",
          "/auth/verify-otp",
          "/auth/resend-otp",
          "/auth/refresh",
          "/auth/social/google",
          "/auth/social/apple",
          "/auth/logout",
          "/auth/logout-all"
        }) {
      mvc.perform(post(publicAuth).contentType("application/json").content("{}"))
          .andExpect(status().isCreated());
    }
  }

  @Test
  void rejectsAmbiguousAndTraversalPathsBeforeRouting() throws Exception {
    int before = upstreamCalls.get();
    for (String badPath :
        new String[] {"/users//me", "/users/../admin/tiers", "/users/%2e%2e/admin", "/posts/./1"}) {
      mvc.perform(get(URI.create(badPath)).header("Authorization", "Bearer test"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value(1100));
    }
    Assertions.assertEquals(before, upstreamCalls.get());
  }

  @Test
  void healthEchoValidatesStrictJsonAndRateLimitsWhileErrorSanitizesStack() throws Exception {
    mvc.perform(
            post("/health/echo")
                .contentType("application/json")
                .content("{\"value\":\"ok\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.value").value("ok"));

    mvc.perform(
            post("/health/echo")
                .contentType("application/json")
                .content("{\"value\":\"ok\",\"unexpected\":true}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value(1003));

    mvc.perform(post("/health/echo").contentType("application/json").content("{\"value\":123}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value(1003));

    verify(repository, atLeastOnce()).consume(eq("health-echo:127.0.0.1"), eq(2), eq(60000L));

    mvc.perform(get("/health/error"))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.code").value(9999))
        .andExpect(jsonPath("$.message").value("Uncategorized exception"))
        .andExpect(jsonPath("$.stack").doesNotExist());
  }

  @Test
  void binaryMediaUsesDedicatedLimitsAndPreservesBytes() throws Exception {
    String body = "image-bytes-".repeat(30);
    mvc.perform(
            put("/users/me/media/cover")
                .header("Authorization", "Bearer test")
                .contentType("image/png")
                .content(body))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().contains(body));
    mvc.perform(
            put("/users/me/media/avatar")
                .header("Authorization", "Bearer test")
                .contentType("image/png")
                .content(new byte[5 * 1024 * 1024 + 1]))
        .andExpect(status().isPayloadTooLarge());
    mvc.perform(
            put("/users/me/media/cover")
                .header("Authorization", "Bearer test")
                .contentType("image/png")
                .content(new byte[10 * 1024 * 1024 + 1]))
        .andExpect(status().isPayloadTooLarge());
    mvc.perform(
            put("/users/me/media/cover")
                .header("Authorization", "Bearer test")
                .contentType("image/svg+xml")
                .content("<svg/>"))
        .andExpect(status().isUnsupportedMediaType());
    mvc.perform(
            put("/users/me/media/cover")
                .header("Authorization", "Bearer test")
                .contentType("image/png")
                .header("Content-Encoding", "gzip")
                .content("bad"))
        .andExpect(status().isUnsupportedMediaType());
    verify(repository, atLeastOnce()).consume(eq("media:127.0.0.1"), eq(10), eq(60000L));
  }

  @Test
  void momentImageRoutesPreserveBytesAndRejectLargeOrWrongMime() throws Exception {
    String path = "/moments/11111111-1111-4111-8111-111111111111/image";
    mvc.perform(
            put(path)
                .contentType("image/jpeg")
                .content("moment-bytes")
                .header("Authorization", "Bearer test"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().contains("moment-bytes"));
    mvc.perform(
            put(path)
                .header("Authorization", "Bearer test")
                .contentType("image/jpeg")
                .content(new byte[10 * 1024 * 1024 + 1]))
        .andExpect(status().isPayloadTooLarge());
    mvc.perform(
            put(path)
                .header("Authorization", "Bearer test")
                .contentType("image/svg+xml")
                .content("<svg/>"))
        .andExpect(status().isUnsupportedMediaType());
    mvc.perform(post("/ai/internal/search").contentType("application/json").content("{}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void forwardsPostRootAndDeletionWithoutToken() throws Exception {
    mvc.perform(get("/posts/feed?limit=20&cursor=test").header("Authorization", "Bearer viewer"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("GET /posts/feed?limit=20&cursor=test"));
    mvc.perform(put("/posts/123/seen").header("Authorization", "Bearer viewer"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("PUT /posts/123/seen"));
    mvc.perform(
            post("/posts/photos")
                .header("Authorization", "Bearer photo-token")
                .contentType("application/json")
                .content("{\"imageBase64\":\"abc\"}"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(
        received.get().startsWith("POST /posts/photos {\"imageBase64\":\"abc\"}"));
    Assertions.assertTrue(received.get().endsWith("Bearer photo-token 127.0.0.1"));
    mvc.perform(post("/posts").contentType("application/json").content("{\"mediaType\":0}"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("POST /posts {\"mediaType\":0}"));
    mvc.perform(delete("/posts/123?ownerId=456")).andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("DELETE /posts/123?ownerId=456"));
  }

  @Test
  void forwardsReactionMethodsBodyAndViewerToken() throws Exception {
    mvc.perform(get("/posts/123/reactions").header("Authorization", "Bearer viewer"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("GET /posts/123/reactions"));
    Assertions.assertTrue(received.get().endsWith("Bearer viewer 127.0.0.1"));
    mvc.perform(
            put("/posts/123/reaction")
                .header("Authorization", "Bearer viewer")
                .contentType("application/json")
                .content("{\"emoji\":\"💛\"}"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("PUT /posts/123/reaction {\"emoji\":\"💛\"}"));
    Assertions.assertTrue(received.get().endsWith("Bearer viewer 127.0.0.1"));
    mvc.perform(delete("/posts/123/reaction").header("Authorization", "Bearer viewer"))
        .andExpect(status().isCreated());
    Assertions.assertTrue(received.get().startsWith("DELETE /posts/123/reaction"));
    Assertions.assertTrue(received.get().endsWith("Bearer viewer 127.0.0.1"));
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
    mvc.perform(get("/auth/denied").header("Authorization", "Bearer test"))
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
    mvc.perform(
            post("/payments/create-checkout")
                .header("Authorization", "Bearer test")
                .content("x".repeat(129)))
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
    mvc.perform(get("/auth/slow").header("Authorization", "Bearer test"))
        .andExpect(status().isGatewayTimeout())
        .andExpect(jsonPath("$.code").value(1106));
  }

  @Test
  void responseBodyTimeout() throws Exception {
    mvc.perform(get("/auth/slow-body").header("Authorization", "Bearer test"))
        .andExpect(status().isGatewayTimeout());
  }

  @Test
  void upstreamDisconnected() throws Exception {
    mvc.perform(post("/payments/disconnect").header("Authorization", "Bearer test"))
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.message").value("Upstream service unavailable"));
  }

  @Test
  void upstreamInternalErrorIsSanitized() throws Exception {
    mvc.perform(get("/auth/server-error").header("Authorization", "Bearer test"))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.code").value(9999))
        .andExpect(jsonPath("$.message").value("Uncategorized exception"))
        .andExpect(header().doesNotExist("Content-Encoding"));
  }

  @Test
  void upstreamThrottleKeepsRetryAfter() throws Exception {
    mvc.perform(get("/auth/throttled").header("Authorization", "Bearer test"))
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

package com.loccoc.api_gateway.service;

import com.loccoc.api_gateway.configuration.GatewayProperties;
import com.loccoc.api_gateway.dto.ApiResponse;
import com.loccoc.api_gateway.dto.AuthenticatedUser;
import com.loccoc.api_gateway.exception.AppException;
import com.loccoc.api_gateway.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

@Service
public class ProxyService {
  private static final Set<String> EXCLUDED = Set.of(
      "connection",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "proxy-connection",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade",
      "host",
      "content-length",
      "expect");

  private static final Set<String> BLOCKED_REQUEST_HEADERS = Set.of(
      "x-service-token",
      "x-ai-actor",
      "x-ai-metadata",
      "x-user-id",
      "x-user-role",
      "x-user-roles");

  private final ScheduledExecutorService scheduler;
  private final HttpClient client;
  private final GatewayProperties properties;

  public ProxyService(
      HttpClient client, GatewayProperties properties, ScheduledExecutorService scheduler) {
    this.client = client;
    this.properties = properties;
    this.scheduler = scheduler;
  }

  private Set<String> excluded(List<String> connections) {
    Set<String> names = new HashSet<>(EXCLUDED);
    connections.forEach(
        v -> Arrays.stream(v.split(",")).forEach(n -> names.add(n.trim().toLowerCase(Locale.ROOT))));
    return names;
  }

  public ResponseEntity<?> forward(HttpServletRequest request, HttpServletResponse response) {
    String path = request.getRequestURI();
    String[] segments = path.split("/", 3);
    String prefix = segments.length > 1 ? segments[1] : "";
    URI origin = properties.routes().get(prefix);
    if (origin == null)
      throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    if (prefix.equals("ai")) {
      return forwardAi(request, response, origin, path);
    }
    // Never resolve user-controlled paths as URLs: append to a validated fixed
    // origin.
    URI target = URI.create(
        origin.toString().replaceAll("/$", "")
            + path
            + (request.getQueryString() == null ? "" : "?" + request.getQueryString()));
    try {
      boolean mediaUpload = request.getMethod().equals("PUT")
          && (path.matches("/users/me/media/(avatar|cover)")
              || path.matches("/moments/[0-9a-f-]{36}/image"));
      boolean aiPreview = request.getMethod().equals("POST") && path.equals("/posts/photos/enhance");
      if (mediaUpload
          && (!Set.of("image/jpeg", "image/png", "image/webp")
              .contains(String.valueOf(request.getContentType()))
              || request.getHeader("Content-Encoding") != null))
        throw new AppException(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
      int uploadLimit = path.endsWith("/avatar") ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
      int bodyLimit = mediaUpload ? uploadLimit : properties.maxBodyBytes();
      long timeout = aiPreview ? 75000 : mediaUpload ? 60000 : properties.requestTimeoutMs();
      if (request.getContentLengthLong() > bodyLimit)
        throw new AppException(ErrorCode.REQUEST_TOO_LARGE);
      byte[] body = readBounded(request.getInputStream(), 413, bodyLimit);
      long started = System.nanoTime();
      var builder = HttpRequest.newBuilder(target).timeout(Duration.ofMillis(timeout));
      copyRequestHeaders(request, builder);
      builder.method(
          request.getMethod(),
          body.length == 0
              ? HttpRequest.BodyPublishers.noBody()
              : HttpRequest.BodyPublishers.ofByteArray(body));
      var upstream = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
      var expired = new AtomicBoolean();
      long remaining = timeout - TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
      var deadline = scheduler.schedule(
          () -> {
            expired.set(true);
            try {
              upstream.body().close();
            } catch (IOException ignored) {
            }
          },
          Math.max(0, remaining),
          TimeUnit.MILLISECONDS);
      try (InputStream stream = upstream.body()) {
        byte[] result;
        try {
          boolean momentImage = request.getMethod().equals("GET") && path.matches("/moments/[0-9a-f-]{36}/image");
          int responseLimit = aiPreview
              ? 28 * 1024 * 1024
              : momentImage ? 5 * 1024 * 1024 : properties.maxBodyBytes();
          result = readBounded(stream, 502, responseLimit);
        } catch (IOException e) {
          if (expired.get())
            throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
          throw e;
        }
        if (expired.get())
          throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
        HttpHeaders headers = extractUpstreamResponseHeaders(upstream);
        if (upstream.statusCode() >= 400) {
          return new ResponseEntity<>(
              ApiResponse.error(ErrorCode.fromHttpStatus(upstream.statusCode())),
              filterErrorHeaders(headers),
              HttpStatusCode.valueOf(upstream.statusCode()));
        }
        return new ResponseEntity<>(result, headers, HttpStatusCode.valueOf(upstream.statusCode()));
      } finally {
        deadline.cancel(false);
      }
    } catch (HttpTimeoutException e) {
      throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new AppException(ErrorCode.UPSTREAM_UNAVAILABLE);
    } catch (IOException e) {
      throw new AppException(ErrorCode.UPSTREAM_UNAVAILABLE);
    }
  }

  private ResponseEntity<?> forwardAi(
      HttpServletRequest request, HttpServletResponse response, URI origin, String path) {
    if (path.equals("/ai") || path.equals("/ai/internal") || path.startsWith("/ai/internal/")) {
      throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    }
    response.setHeader("Cache-Control", "no-store");
    boolean enhance = path.equals("/ai/images/enhance");
    if (enhance) {
      String token = properties.aiServiceToken();
      if (token == null || token.length() < 32) {
        throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
      }
    }
    URI target = URI.create(
        origin.toString().replaceAll("/$", "")
            + path
            + (request.getQueryString() == null ? "" : "?" + request.getQueryString()));
    int bodyLimit = 10 * 1024 * 1024 + 65536;
    long timeout = 65000L;
    try {
      if (request.getContentLengthLong() > bodyLimit)
        throw new AppException(ErrorCode.REQUEST_TOO_LARGE);
      boolean hasBody = !Set.of("GET", "HEAD").contains(request.getMethod());
      byte[] body = hasBody ? readBounded(request.getInputStream(), 413, bodyLimit) : new byte[0];
      long started = System.nanoTime();
      var builder = HttpRequest.newBuilder(target).timeout(Duration.ofMillis(timeout));
      copyRequestHeaders(request, builder);
      if (enhance) {
        builder.header("x-service-token", properties.aiServiceToken());
      }
      builder.method(
          request.getMethod(),
          !hasBody || body.length == 0
              ? HttpRequest.BodyPublishers.noBody()
              : HttpRequest.BodyPublishers.ofByteArray(body));
      var upstream = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
      var expired = new AtomicBoolean();
      long remaining = timeout - TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
      var deadline = scheduler.schedule(
          () -> {
            expired.set(true);
            try {
              upstream.body().close();
            } catch (IOException ignored) {
            }
          },
          Math.max(0, remaining),
          TimeUnit.MILLISECONDS);
      try (InputStream stream = upstream.body()) {
        HttpHeaders headers = extractUpstreamResponseHeaders(upstream);
        if (upstream.statusCode() >= 400) {
          try {
            stream.readNBytes(65536);
          } catch (IOException e) {
            if (expired.get())
              throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
            throw e;
          }
          if (expired.get())
            throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
          HttpHeaders errorHeaders = filterErrorHeaders(headers);
          errorHeaders.set("Cache-Control", "no-store");
          return new ResponseEntity<>(
              ApiResponse.error(ErrorCode.fromHttpStatus(upstream.statusCode())),
              errorHeaders,
              HttpStatusCode.valueOf(upstream.statusCode()));
        }
        int maxAiOutput = 20 * 1024 * 1024;
        long declaredLength = upstream.headers().firstValueAsLong("content-length").orElse(-1L);
        if (declaredLength > maxAiOutput) {
          throw new AppException(ErrorCode.UPSTREAM_RESPONSE_TOO_LARGE);
        }
        response.setStatus(upstream.statusCode());
        headers.forEach(
            (name, values) -> {
              if (!name.equalsIgnoreCase("cache-control")) {
                values.forEach(v -> response.addHeader(name, v));
              }
            });
        response.setHeader("Cache-Control", "no-store");
        OutputStream out = response.getOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while (true) {
          try {
            read = stream.read(buffer);
          } catch (IOException e) {
            if (expired.get() && !response.isCommitted()) {
              throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
            }
            throw e;
          }
          if (read == -1)
            break;
          total += read;
          if (total > maxAiOutput) {
            if (!response.isCommitted()) {
              response.resetBuffer();
              throw new AppException(ErrorCode.UPSTREAM_RESPONSE_TOO_LARGE);
            }
            return null;
          }
          try {
            out.write(buffer, 0, read);
            out.flush();
          } catch (IOException clientDisconnected) {
            // Closing upstream stream in try-with-resources aborts upstream AI work
            // immediately.
            return null;
          }
        }
        if (expired.get() && !response.isCommitted()) {
          throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
        }
        return null;
      } finally {
        deadline.cancel(false);
      }
    } catch (HttpTimeoutException e) {
      throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new AppException(ErrorCode.UPSTREAM_UNAVAILABLE);
    } catch (IOException e) {
      if (response.isCommitted())
        return null;
      throw new AppException(ErrorCode.UPSTREAM_UNAVAILABLE);
    }
  }

  private void copyRequestHeaders(HttpServletRequest request, HttpRequest.Builder builder) {
    Set<String> excluded = excluded(Collections.list(request.getHeaders("connection")));
    for (String name : Collections.list(request.getHeaderNames())) {
      String lower = name.toLowerCase(Locale.ROOT);
      if (excluded.contains(lower)
          || BLOCKED_REQUEST_HEADERS.contains(lower)
          || lower.equals("forwarded")
          || lower.startsWith("x-forwarded-")
          || lower.equals("x-real-ip")
          || lower.equals("x-request-id"))
        continue;
      for (String value : Collections.list(request.getHeaders(name)))
        builder.header(name, value);
    }
    builder.header("x-request-id", String.valueOf(request.getAttribute("requestId")));
    if (request.getAttribute(AccountAuthorityService.AUTHENTICATED_USER_ATTR) instanceof AuthenticatedUser user) {
      builder.header("x-user-id", user.userId());
      builder.header("x-user-role", user.role());
    }
    builder.header("x-forwarded-for", request.getRemoteAddr());
    builder.header("x-real-ip", request.getRemoteAddr());
  }

  private HttpHeaders extractUpstreamResponseHeaders(HttpResponse<?> upstream) {
    HttpHeaders headers = new HttpHeaders();
    Set<String> responseExcluded = excluded(upstream.headers().allValues("connection"));
    upstream
        .headers()
        .map()
        .forEach(
            (name, values) -> {
              String lower = name.toLowerCase(Locale.ROOT);
              if (!lower.startsWith("access-control-")
                  && !responseExcluded.contains(lower)
                  && !Set.of(
                      "x-request-id",
                      "x-content-type-options",
                      "x-frame-options",
                      "referrer-policy")
                      .contains(lower))
                headers.put(name, values);
            });
    return headers;
  }

  private HttpHeaders filterErrorHeaders(HttpHeaders headers) {
    HttpHeaders errorHeaders = new HttpHeaders();
    for (String name : List.of("Retry-After", "WWW-Authenticate", "Allow", "Set-Cookie")) {
      if (headers.containsHeader(name))
        errorHeaders.put(name, headers.get(name));
    }
    return errorHeaders;
  }

  private byte[] readBounded(InputStream stream, int status, int limit) throws IOException {
    byte[] bytes = stream.readNBytes(limit + 1);
    if (bytes.length > limit)
      throw new AppException(
          status == 413 ? ErrorCode.REQUEST_TOO_LARGE : ErrorCode.UPSTREAM_RESPONSE_TOO_LARGE);
    return bytes;
  }
}

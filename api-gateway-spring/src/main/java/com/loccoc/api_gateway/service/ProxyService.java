package com.loccoc.api_gateway.service;

import com.loccoc.api_gateway.configuration.GatewayProperties;
import com.loccoc.api_gateway.dto.ApiResponse;
import com.loccoc.api_gateway.exception.AppException;
import com.loccoc.api_gateway.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

@Service
public class ProxyService {
  private static final Set<String> EXCLUDED =
      Set.of(
          "connection",
          "keep-alive",
          "proxy-authenticate",
          "proxy-authorization",
          "te",
          "trailer",
          "transfer-encoding",
          "upgrade",
          "host",
          "content-length",
          "expect");
  private final java.util.concurrent.ScheduledExecutorService scheduler;
  private final HttpClient client;
  private final GatewayProperties properties;

  public ProxyService(
      HttpClient client,
      GatewayProperties properties,
      java.util.concurrent.ScheduledExecutorService scheduler) {
    this.client = client;
    this.properties = properties;
    this.scheduler = scheduler;
  }

  private Set<String> excluded(List<String> connections) {
    Set<String> names = new HashSet<>(EXCLUDED);
    connections.forEach(
        v ->
            Arrays.stream(v.split(",")).forEach(n -> names.add(n.trim().toLowerCase(Locale.ROOT))));
    return names;
  }

  public ResponseEntity<?> forward(HttpServletRequest request) {
    String path = request.getRequestURI();
    String prefix = path.split("/", 3)[1];
    URI origin = properties.routes().get(prefix);
    if (origin == null) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    // Never resolve user-controlled paths as URLs: append to a validated fixed origin.
    URI target =
        URI.create(
            origin.toString().replaceAll("/$", "")
                + path
                + (request.getQueryString() == null ? "" : "?" + request.getQueryString()));
    try {
      byte[] body = readBounded(request.getInputStream(), 413);
      long started = System.nanoTime();
      var builder =
          HttpRequest.newBuilder(target).timeout(Duration.ofMillis(properties.requestTimeoutMs()));
      Set<String> excluded = excluded(Collections.list(request.getHeaders("connection")));
      for (String name : Collections.list(request.getHeaderNames())) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (excluded.contains(lower)
            || lower.equals("forwarded")
            || lower.startsWith("x-forwarded-")
            || lower.equals("x-real-ip")
            || lower.equals("x-request-id")) continue;
        for (String value : Collections.list(request.getHeaders(name))) builder.header(name, value);
      }
      builder.header("x-request-id", String.valueOf(request.getAttribute("requestId")));
      builder.header("x-forwarded-for", request.getRemoteAddr());
      builder.header("x-real-ip", request.getRemoteAddr());
      builder.method(
          request.getMethod(),
          body.length == 0
              ? HttpRequest.BodyPublishers.noBody()
              : HttpRequest.BodyPublishers.ofByteArray(body));
      var upstream = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
      var expired = new java.util.concurrent.atomic.AtomicBoolean();
      long remaining =
          properties.requestTimeoutMs()
              - java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
      var deadline =
          scheduler.schedule(
              () -> {
                expired.set(true);
                try {
                  upstream.body().close();
                } catch (IOException ignored) {
                }
              },
              Math.max(0, remaining),
              java.util.concurrent.TimeUnit.MILLISECONDS);
      try (InputStream stream = upstream.body()) {
        byte[] result;
        try {
          result = readBounded(stream, 502);
        } catch (IOException e) {
          if (expired.get()) throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
          throw e;
        }
        if (expired.get()) throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
        HttpHeaders headers = new HttpHeaders();
        Set<String> responseExcluded = excluded(upstream.headers().allValues("connection"));
        upstream
            .headers()
            .map()
            .forEach(
                (name, values) -> {
                  if (!name.toLowerCase(Locale.ROOT).startsWith("access-control-")
                      && !responseExcluded.contains(name.toLowerCase(Locale.ROOT))
                      && !Set.of(
                              "x-request-id",
                              "x-content-type-options",
                              "x-frame-options",
                              "referrer-policy")
                          .contains(name.toLowerCase(Locale.ROOT))) headers.put(name, values);
                });
        if (upstream.statusCode() >= 400) {
          HttpHeaders errorHeaders = new HttpHeaders();
          for (String name : List.of("Retry-After", "WWW-Authenticate", "Allow", "Set-Cookie")) {
            if (headers.containsHeader(name)) errorHeaders.put(name, headers.get(name));
          }
          return new ResponseEntity<>(
              ApiResponse.error(ErrorCode.fromHttpStatus(upstream.statusCode())),
              errorHeaders,
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

  private byte[] readBounded(InputStream stream, int status) throws IOException {
    byte[] bytes = stream.readNBytes(properties.maxBodyBytes() + 1);
    if (bytes.length > properties.maxBodyBytes())
      throw new AppException(
          status == 413 ? ErrorCode.REQUEST_TOO_LARGE : ErrorCode.UPSTREAM_RESPONSE_TOO_LARGE);
    return bytes;
  }
}

package com.loccoc.api_gateway.service;

import com.loccoc.api_gateway.configuration.GatewayProperties;
import com.loccoc.api_gateway.dto.AuthenticatedUser;
import com.loccoc.api_gateway.exception.AppException;
import com.loccoc.api_gateway.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AccountAuthorityService {
  public static final String AUTHENTICATED_USER_ATTR = "authenticatedUser";
  private static final Pattern BEARER_PATTERN = Pattern.compile("^Bearer \\S+$");
  private static final Set<String> PUBLIC_POST_PATHS =
      Set.of(
          "/auth/register",
          "/auth/verify-otp",
          "/auth/resend-otp",
          "/auth/login",
          "/auth/refresh",
          "/auth/social/google",
          "/auth/social/apple",
          "/auth/logout",
          "/auth/logout-all",
          "/payments/webhook/payos");

  private final HttpClient client;
  private final GatewayProperties properties;
  private final JsonMapper json = JsonMapper.builder().build();

  public AccountAuthorityService(HttpClient client, GatewayProperties properties) {
    this.client = client;
    this.properties = properties;
  }

  /** Rejects encoded characters, backslashes, double slashes, and dot segments before routing. */
  public static boolean isAmbiguousPath(String rawPath) {
    if (rawPath == null || rawPath.isEmpty()) return true;
    String normalized =
        rawPath.length() > 1 && rawPath.endsWith("/")
            ? rawPath.substring(0, rawPath.length() - 1)
            : rawPath;
    if (normalized.indexOf('%') >= 0
        || normalized.indexOf('\\') >= 0
        || normalized.contains("//")) {
      return true;
    }
    for (String segment : normalized.split("/")) {
      if (segment.equals(".") || segment.equals("..")) return true;
    }
    return false;
  }

  public void validatePath(String rawPath) {
    if (isAmbiguousPath(rawPath)) {
      throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    }
  }

  public boolean isPublicRoute(String method, String rawPath) {
    String path =
        rawPath.length() > 1 && rawPath.endsWith("/")
            ? rawPath.substring(0, rawPath.length() - 1)
            : rawPath;
    if (path.equals("/posts") || path.startsWith("/posts/")) return true;
    if (path.equals("/ai") || path.startsWith("/ai/")) return true;
    if (method.equals("GET")
        && (path.equals("/") || path.equals("/health") || path.equals("/health/error")))
      return true;
    if (method.equals("POST") && (path.equals("/health/echo") || PUBLIC_POST_PATHS.contains(path)))
      return true;
    return false;
  }

  public Optional<AuthenticatedUser> verify(HttpServletRequest request) {
    String rawPath = request.getRequestURI();
    validatePath(rawPath);
    if (!properties.accountAccessEnabled() || isPublicRoute(request.getMethod(), rawPath)) {
      return Optional.empty();
    }
    String authorization = request.getHeader("Authorization");
    if (authorization == null || !BEARER_PATTERN.matcher(authorization).matches()) {
      throw new AppException(ErrorCode.UNAUTHENTICATED);
    }
    URI authOrigin = properties.routes().get("auth");
    URI target = URI.create(authOrigin.toString().replaceAll("/$", "") + "/internal/access");
    HttpRequest accessRequest =
        HttpRequest.newBuilder(target)
            .timeout(Duration.ofSeconds(5))
            .header("Authorization", authorization)
            .header("x-service-token", properties.internalServiceToken())
            .header("Content-Type", "application/json")
            .GET()
            .build();
    HttpResponse<byte[]> response;
    try {
      response = client.send(accessRequest, HttpResponse.BodyHandlers.ofByteArray());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
    } catch (IOException e) {
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
    }
    int status = response.statusCode();
    if (status == 401) throw new AppException(ErrorCode.UNAUTHENTICATED);
    if (status == 403) throw new AppException(ErrorCode.ACCESS_DENIED);
    if (status == 404) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    if (status < 200 || status >= 300) throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);

    try {
      JsonNode root = json.readTree(response.body());
      JsonNode userNode = root.path("user");
      JsonNode idNode = userNode.get("userId");
      JsonNode roleNode = userNode.get("role");
      if (idNode == null
          || !idNode.isString()
          || roleNode == null
          || !roleNode.isString()
          || idNode.asText().isBlank()
          || roleNode.asText().isBlank()) {
        throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
      }
      AuthenticatedUser user = new AuthenticatedUser(idNode.asText(), roleNode.asText());
      request.setAttribute(AUTHENTICATED_USER_ATTR, user);
      return Optional.of(user);
    } catch (AppException e) {
      throw e;
    } catch (Exception e) {
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
    }
  }
}

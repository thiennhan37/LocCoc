package com.loccoc.post_service.service;

import com.loccoc.post_service.exception.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class FeedAudienceClient {
  public record Author(UUID id, String username, String displayName) {}
  public record Audience(UUID viewerId, Map<UUID, Author> authors) {}
  private final URI endpoint;
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
  public FeedAudienceClient(@Value("${post.user-service-url:http://127.0.0.1:8081}") String url) {
    endpoint = URI.create(url.replaceAll("/+$", "") + "/users/me/feed-audience");
  }
  public Audience resolve(String authorization) {
    if (authorization == null || !authorization.matches("Bearer \\S+")) throw new AppException(ErrorCode.UNAUTHENTICATED);
    try {
      var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).header("Authorization", authorization).GET().build();
      var response = http.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() == 401) throw new AppException(ErrorCode.UNAUTHENTICATED);
      if (response.statusCode() == 403) throw new AppException(ErrorCode.ACCESS_DENIED);
      if (response.statusCode() != 200 || response.body().length() > 4*1024*1024) throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
      var json = JsonMapper.builder().build().readTree(response.body());
      UUID viewer = UUID.fromString(json.path("viewerId").asText());
      var authors = new HashMap<UUID, Author>();
      if (!json.path("authors").isArray() || json.path("authors").size() > 10001) throw new IllegalArgumentException();
      for (var a : json.path("authors")) {
        var id = UUID.fromString(a.path("id").asText());
        authors.put(id, new Author(id, a.path("username").asText(), a.path("displayName").isNull() ? null : a.path("displayName").asText()));
      }
      if (!authors.containsKey(viewer)) throw new IllegalArgumentException();
      return new Audience(viewer, Map.copyOf(authors));
    } catch (AppException e) { throw e; }
    catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
    catch (Exception e) { throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
  }
}

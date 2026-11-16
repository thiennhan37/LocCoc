package com.loccoc.post_service.service;
import com.loccoc.post_service.exception.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
/** Delegate cryptographic JWT and current account/session checks to IAM, like the feed. */
@Component
public class UserIdentityClient {
  private final URI endpoint;
  private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
  public UserIdentityClient(@Value("${post.user-service-url:http://127.0.0.1:8081}") String url) {
    endpoint=URI.create(url.replaceAll("/+$","")+"/users/me");
  }
  public UUID resolve(String authorization) {
    if(authorization==null || authorization.length()>16384 || !authorization.matches("(?i)Bearer [^\\s,]+")) throw new AppException(ErrorCode.UNAUTHENTICATED);
    try {
      var request=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).header("Authorization",authorization).GET().build();
      var response=http.send(request,HttpResponse.BodyHandlers.ofString());
      if(response.statusCode()==401 || response.statusCode()==404) throw new AppException(ErrorCode.UNAUTHENTICATED);
      if(response.statusCode()==403) throw new AppException(ErrorCode.ACCESS_DENIED);
      if(response.statusCode()!=200 || response.body().length()>65536) throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
      return UUID.fromString(JsonMapper.builder().build().readTree(response.body()).path("id").asText());
    } catch(AppException e) { throw e; }
    catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
    catch(Exception e) { throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
  }
}

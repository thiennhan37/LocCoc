package com.loccoc.post_service.service;

import com.loccoc.post_service.exception.*;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AiImageClient {
  public record Result(String imageBase64,String mimeType) {}
  private static final int MAX_OUTPUT=20*1024*1024;
  private final URI endpoint;
  private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
      .followRedirects(HttpClient.Redirect.NEVER).build();
  public AiImageClient(@Value("${post.ai-service-url:http://127.0.0.1:8087}") String url) {
    endpoint=URI.create(url.replaceAll("/+$","")+"/ai/images/enhance");
  }
  public Result enhance(byte[] png,String filter,UUID requestId) {
    String boundary="loccoc-"+UUID.randomUUID();
    var body=new ByteArrayOutputStream();
    body.writeBytes(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"filterId\"\r\n\r\n"+filter+
        "\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"image\"; filename=\"photo.png\"\r\nContent-Type: image/png\r\n\r\n").getBytes(StandardCharsets.UTF_8));
    body.writeBytes(png);
    body.writeBytes(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
    var request=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(65))
        .header("Content-Type","multipart/form-data; boundary="+boundary)
        .header("X-Request-Id",requestId.toString()).POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build();
    var output=new ByteArrayOutputStream();
    // Consumer bounds buffering; future deadline covers headers AND body consumption.
    var future=client.sendAsync(request,HttpResponse.BodyHandlers.ofByteArrayConsumer(chunk -> chunk.ifPresent(bytes -> {
      if(output.size()+bytes.length>MAX_OUTPUT) throw new AppException(ErrorCode.UPSTREAM_RESPONSE_TOO_LARGE);
      output.writeBytes(bytes);
    })));
    try {
      var response=future.get(65,TimeUnit.SECONDS);
      if(response.statusCode()!=200) throw new AppException(ErrorCode.fromHttpStatus(response.statusCode()));
      String mime=response.headers().firstValue("Content-Type").orElse("").split(";",2)[0].trim();
      if(!Set.of("image/png","image/jpeg","image/webp").contains(mime) || output.size()==0)
        throw new AppException(ErrorCode.UPSTREAM_UNAVAILABLE);
      return new Result(Base64.getEncoder().encodeToString(output.toByteArray()),mime);
    } catch(TimeoutException e) { throw new AppException(ErrorCode.UPSTREAM_TIMEOUT); }
    catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new AppException(ErrorCode.UPSTREAM_UNAVAILABLE); }
    catch(ExecutionException e) {
      if(e.getCause() instanceof HttpTimeoutException) throw new AppException(ErrorCode.UPSTREAM_TIMEOUT);
      throw new AppException(ErrorCode.UPSTREAM_UNAVAILABLE);
    } finally { if(!future.isDone()) future.cancel(true); }
  }
}

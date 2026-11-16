package com.loccoc.post_service.service;
import com.loccoc.post_service.exception.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

public record FeedCursor(Instant snapshot, int priority, Instant createdAt, UUID id) {
  public String encode() {
    return Base64.getUrlEncoder().withoutPadding().encodeToString((snapshot+"|"+priority+"|"+createdAt+"|"+id).getBytes(StandardCharsets.UTF_8));
  }
  public static FeedCursor decode(String value, Instant now) {
    try {
      if(value.length()>400) throw new IllegalArgumentException();
      var fields=new String(Base64.getUrlDecoder().decode(value),StandardCharsets.UTF_8).split("\\|",-1);
      if(fields.length!=4) throw new IllegalArgumentException();
      var c=new FeedCursor(Instant.parse(fields[0]),Integer.parseInt(fields[1]),Instant.parse(fields[2]),UUID.fromString(fields[3]));
      if(c.snapshot.isAfter(now) || c.snapshot.isBefore(now.minusSeconds(3600)) || c.priority<0 || c.priority>3 || c.createdAt.isAfter(c.snapshot)) throw new IllegalArgumentException();
      return c;
    } catch(RuntimeException e) { throw new AppException(ErrorCode.INVALID_PARAMETER); }
  }
}

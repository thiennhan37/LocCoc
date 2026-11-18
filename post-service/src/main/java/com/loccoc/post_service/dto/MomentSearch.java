package com.loccoc.post_service.dto;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;
public record MomentSearch(@NotBlank @Size(max=500) String query, @Min(1) @Max(50) Integer limit,
    UUID albumId,@Size(max=120) String place,Instant dateFrom,Instant dateTo,Boolean requireSemantic) {
  public int size() { return limit==null ? 20 : limit; }
}

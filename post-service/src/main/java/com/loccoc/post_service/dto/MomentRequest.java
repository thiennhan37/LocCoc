package com.loccoc.post_service.dto;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
public record MomentRequest(@Size(max=1000) String caption, @Size(max=20) List<@NotNull @Size(max=50) String> tags,
    Instant capturedAt, UUID albumId, @Size(max=120) String place) {}

package com.loccoc.post_service.dto;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record CreatePostRequest(
    @NotNull UUID ownerId,
    @NotBlank @Size(max = 500) String mediaKey,
    @NotNull @Min(0) @Max(1) Integer mediaType,
    @Size(max = 500) String thumbKey,
    @Size(max = 200) String caption,
    @Positive Integer width,
    @Positive Integer height) {}

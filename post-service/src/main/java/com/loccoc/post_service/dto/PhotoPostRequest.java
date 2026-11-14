package com.loccoc.post_service.dto;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record PhotoPostRequest(
    @NotNull UUID requestId,
    @NotNull UUID ownerId,
    @NotBlank @Size(max=6990508) String imageBase64,
    @Size(max=200) String caption) {}

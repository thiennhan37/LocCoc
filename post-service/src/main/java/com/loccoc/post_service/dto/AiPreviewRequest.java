package com.loccoc.post_service.dto;
import jakarta.validation.constraints.*;
import java.util.UUID;
public record AiPreviewRequest(
    @NotNull UUID requestId,
    @NotBlank @Size(max=6990508) String imageBase64,
    @NotNull @Pattern(regexp="handwritten_diary|subject_sticker") String filterId) {}

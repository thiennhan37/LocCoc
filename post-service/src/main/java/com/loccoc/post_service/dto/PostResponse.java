package com.loccoc.post_service.dto;

import com.loccoc.post_service.entity.Post;
import java.time.Instant;
import java.util.UUID;

public record PostResponse(UUID id, UUID ownerId, String mediaKey, short mediaType,
    String thumbKey, String caption, Integer width, Integer height, Instant createdAt) {
  public static PostResponse from(Post post) {
    return new PostResponse(post.getId(), post.getOwnerId(), post.getMediaKey(),
        post.getMediaType(), post.getThumbKey(), post.getCaption(), post.getWidth(),
        post.getHeight(), post.getCreatedAt());
  }
}

package com.loccoc.post_service.entity;

import com.loccoc.post_service.dto.CreatePostRequest;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "moments", indexes = @Index(name = "idx_moments_owner", columnList = "owner_id,created_at"))
@Getter
public class Post {
  @Id private UUID id;
  @Column(name = "owner_id", nullable = false) private UUID ownerId;
  @Column(name = "media_key", nullable = false, length = 500) private String mediaKey;
  @Column(name = "media_type", nullable = false) private short mediaType;
  @Column(name = "thumb_key", length = 500) private String thumbKey;
  @Column(length = 200) private String caption;
  private Integer width;
  private Integer height;
  @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
  @Column(name = "deleted_at") private Instant deletedAt;

  protected Post() {}

  public static Post create(CreatePostRequest request) {
    return create(UUID.randomUUID(), request);
  }

  public static Post create(UUID id, CreatePostRequest request) {
    Post post = new Post();
    post.id = id;
    post.ownerId = request.ownerId();
    post.mediaKey = request.mediaKey();
    post.mediaType = request.mediaType().shortValue();
    post.thumbKey = request.thumbKey();
    post.caption = request.caption();
    post.width = request.width();
    post.height = request.height();
    post.createdAt = Instant.now();
    return post;
  }
}

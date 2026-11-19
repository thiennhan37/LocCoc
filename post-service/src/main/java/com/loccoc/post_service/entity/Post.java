package com.loccoc.post_service.entity;

import com.loccoc.post_service.dto.CreatePostRequest;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.ColumnDefault;

@Entity
@Table(name = "moments", indexes = {
    @Index(name = "idx_moments_owner", columnList = "owner_id,created_at"),
    @Index(name = "idx_moments_owner_active_page", columnList = "owner_id,deleted_at,created_at DESC,id DESC")
})
@Getter
public class Post {
  @Id private UUID id;
  @Column(name = "owner_id", nullable = false) private UUID ownerId;
  @Column(name = "media_key", nullable = false, length = 500) private String mediaKey;
  @Column(name = "media_type", nullable = false) private short mediaType;
  @Column(name = "thumb_key", length = 500) private String thumbKey;
  @Column(length = 1000) private String caption;
  private Integer width;
  private Integer height;
  @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
  @Column(name = "deleted_at") private Instant deletedAt;

  @Column(nullable=false, length=16) @ColumnDefault("'FRIENDS'") private String visibility = "FRIENDS";
  @Column(nullable=false, length=16) @ColumnDefault("'active'") private String state = "active";
  @Column(name="index_status", nullable=false, length=16) @ColumnDefault("'pending'") private String indexStatus = "pending";
  @Column(name="asset_id") private UUID assetId;
  @Column(name="asset_version", nullable=false) @ColumnDefault("1") private int assetVersion = 1;
  @Column(name="captured_at") private Instant capturedAt;
  @Column(name="album_id") private UUID albumId;
  @Column(length=120) private String place;
  @Column(name="tags_json", length=4000) private String tagsJson = "[]";
  @Column(name="upload_hash", length=64) private String uploadHash;
  @Column(name="legacy_source_hash",length=64) private String legacySourceHash;
  public void importIdentity(UUID asset,int version,Instant created,String sourceHash) {
    this.assetId=asset;this.assetVersion=version;this.createdAt=created;this.legacySourceHash=sourceHash;
  }
  protected Post() {}
  public void draft(String visibility, Instant capturedAt, UUID albumId, String place, String tagsJson) {
    this.state="draft"; this.visibility=visibility; this.capturedAt=capturedAt;
    this.albumId=albumId; this.place=place; this.tagsJson=tagsJson;
  }
  public void reserve(String hash) { this.uploadHash=hash; }
  public void activate(int width,int height) { this.state="active"; this.width=width; this.height=height; this.indexStatus="pending"; }
  public void tombstone() { if(deletedAt==null) deletedAt=Instant.now(); state="deleted"; }
  public void indexStatus(String value) { indexStatus=value; }
  public UUID asset() { return assetId==null ? id : assetId; }
  public Instant captured() { return capturedAt==null ? createdAt : capturedAt; }


  public static Post create(CreatePostRequest request) {
    return create(UUID.randomUUID(), request);
  }

  public static Post create(UUID id, CreatePostRequest request) {
    Post post = new Post();
    post.id = id;
    post.assetId = id;
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

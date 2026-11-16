package com.loccoc.post_service.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name="post_views", uniqueConstraints=@UniqueConstraint(columnNames={"viewer_id","post_id"}))
public class PostView {
  @Id @Column(length=73) private String id;
  @Column(name="viewer_id", nullable=false, updatable=false) private UUID viewerId;
  @Column(name="post_id", nullable=false, updatable=false) private UUID postId;
  @Column(name="seen_at", nullable=false, updatable=false) private Instant seenAt;
  protected PostView() {}
  public PostView(UUID viewer, UUID post, Instant now) {
    id=key(viewer,post); viewerId=viewer; postId=post; seenAt=now;
  }
  public static String key(UUID viewer,UUID post) { return viewer+":"+post; }
}

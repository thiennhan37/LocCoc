package com.loccoc.post_service.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name="post_reactions", uniqueConstraints=@UniqueConstraint(name="uq_post_reaction_viewer", columnNames={"viewer_id","post_id"}),
    indexes=@Index(name="idx_post_reactions_post", columnList="post_id"))
public class PostReaction {
  @Id @Column(length=73) private String id;
  @Column(name="viewer_id", nullable=false, updatable=false) private UUID viewerId;
  @Column(name="post_id", nullable=false, updatable=false) private UUID postId;
  @Column(nullable=false, length=8) private String emoji;
  protected PostReaction() {}
  public PostReaction(UUID viewer, UUID post, String emoji) {
    id=key(viewer,post); viewerId=viewer; postId=post; this.emoji=emoji;
  }
  public static String key(UUID viewer, UUID post) { return viewer+":"+post; }
  public String getEmoji() { return emoji; }
  public void setEmoji(String emoji) { this.emoji=emoji; }
}

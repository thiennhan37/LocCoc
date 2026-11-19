package com.loccoc.post_service.entity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity
@Table(name="ai_preview_attempts", indexes=@Index(name="idx_ai_attempt_owner_created",columnList="owner_id,created_at"))
public class AiPreviewAttempt {
  @Id private UUID id;
  @Column(name="owner_id",nullable=false) private UUID ownerId;
  @Column(name="created_at",nullable=false) private Instant createdAt;
  protected AiPreviewAttempt() {}
  public AiPreviewAttempt(UUID id, UUID ownerId) { this.id=id; this.ownerId=ownerId; this.createdAt=Instant.now(); }
}
